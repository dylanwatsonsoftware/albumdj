import { createHash, randomBytes as secureRandomBytes } from "node:crypto";

const scopes = [
  "user-library-read",
  "user-read-playback-state",
  "user-modify-playback-state",
];

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createSpotifyClient({
  clientId,
  redirectUri,
  fetchImpl = fetch,
  randomBytes = secureRandomBytes,
  now = Date.now,
  sessionStore = { load: () => null, save: () => {} },
  initialSession,
}) {
  const restoredSession = initialSession ?? sessionStore.load() ?? {};
  let pendingAuthorization = restoredSession.pendingAuthorization ?? null;
  let token = restoredSession.token ?? null;
  let profile = restoredSession.profile ?? null;

  async function saveSession() {
    await sessionStore.save({ token, profile, pendingAuthorization });
  }

  async function ensureAccessToken() {
    if (!token) throw new Error("Spotify is not connected");
    if (token.expiresAt > now() + 60_000) return token.accessToken;
    if (!token.refreshToken) throw new Error("Spotify session expired; reconnect Spotify");

    const response = await fetchImpl("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }).toString(),
    });
    if (!response.ok) throw new Error(`Spotify token refresh failed (${response.status})`);
    const payload = await response.json();
    token = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? token.refreshToken,
      expiresAt: now() + payload.expires_in * 1000,
    };
    await saveSession();
    return token.accessToken;
  }

  async function spotifyJson(path) {
    const accessToken = await ensureAccessToken();
    const url = path.startsWith("https://") ? path : `https://api.spotify.com/v1${path}`;
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Spotify API request failed (${response.status})`);
    return response.json();
  }

  return {
    async beginAuthorization() {
      if (!clientId || !redirectUri) throw new Error("Spotify is not configured");

      const verifier = base64Url(randomBytes(48));
      const state = base64Url(randomBytes(24));
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      pendingAuthorization = { verifier, state };
      await saveSession();

      const authorizationUrl = new URL("https://accounts.spotify.com/authorize");
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: scopes.join(" "),
        code_challenge_method: "S256",
        code_challenge: challenge,
        state,
      });
      return authorizationUrl.toString();
    },

    async completeAuthorization({ code, state }) {
      if (!pendingAuthorization || state !== pendingAuthorization.state) {
        throw new Error("Spotify authorization state mismatch");
      }

      const response = await fetchImpl("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: pendingAuthorization.verifier,
        }).toString(),
      });
      if (!response.ok) throw new Error(`Spotify token exchange failed (${response.status})`);

      const payload = await response.json();
      token = {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token ?? null,
        expiresAt: now() + payload.expires_in * 1000,
      };
      pendingAuthorization = null;

      const spotifyProfile = await spotifyJson("/me");
      profile = {
        id: spotifyProfile.id,
        displayName: spotifyProfile.display_name || spotifyProfile.id,
      };
      await saveSession();
      return profile;
    },

    status() {
      return {
        configured: Boolean(clientId && redirectUri),
        connected: Boolean(token && profile),
        profile,
      };
    },

    async getSavedAlbums() {
      const items = [];
      let next = "/me/albums?limit=50";

      while (next) {
        const page = await spotifyJson(next);
        items.push(...page.items);
        next = page.next;
      }

      return items.map(({ album }) => ({
        id: album.id,
        title: album.name,
        artist: album.artists.map(({ name }) => name).join(", "),
        spotifyUri: album.uri,
        imageUrl: album.images[0]?.url ?? null,
      }));
    },

    async getAvailableDevices() {
      const { devices } = await spotifyJson("/me/player/devices");
      return devices
        .filter((device) => device.id && !device.is_restricted)
        .map((device) => ({
          id: device.id,
          name: device.name,
          kind: device.type.toLowerCase(),
          detail: "Spotify Connect",
          isActive: device.is_active,
        }));
    },

    async playAlbum({ deviceId, spotifyUri }) {
      const accessToken = await ensureAccessToken();
      const response = await fetchImpl(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ context_uri: spotifyUri }),
        },
      );
      if (!response.ok) throw new Error(`Spotify playback failed (${response.status})`);
    },

    async getCurrentPlayback() {
      const accessToken = await ensureAccessToken();
      const response = await fetchImpl("https://api.spotify.com/v1/me/player", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 204) return null;
      if (!response.ok) throw new Error(`Spotify playback state failed (${response.status})`);
      const playback = await response.json();
      if (!playback.item) return null;
      return {
        isPlaying: playback.is_playing,
        progressMs: playback.progress_ms,
        durationMs: playback.item.duration_ms,
        device: playback.device ? {
          id: playback.device.id,
          name: playback.device.name,
          kind: playback.device.type.toLowerCase(),
        } : null,
        track: {
          id: playback.item.id,
          title: playback.item.name,
          artist: playback.item.artists.map(({ name }) => name).join(", "),
        },
        album: {
          id: playback.item.album.id,
          title: playback.item.album.name,
          spotifyUri: playback.item.album.uri,
          imageUrl: playback.item.album.images[0]?.url ?? null,
        },
      };
    },

    async pausePlayback() {
      const accessToken = await ensureAccessToken();
      const response = await fetchImpl("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Spotify pause failed (${response.status})`);
    },

    async resumePlayback() {
      const accessToken = await ensureAccessToken();
      const response = await fetchImpl("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Spotify resume failed (${response.status})`);
    },

    async skipNext() {
      const accessToken = await ensureAccessToken();
      const response = await fetchImpl("https://api.spotify.com/v1/me/player/next", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Spotify skip failed (${response.status})`);
    },

    async getAlbumTracks(albumId) {
      const trackUris = [];
      let next = `/albums/${encodeURIComponent(albumId)}/tracks?limit=50`;
      while (next) {
        const page = await spotifyJson(next);
        trackUris.push(...page.items
          .filter((track) => track.is_playable !== false)
          .map((track) => track.uri));
        next = page.next;
      }
      return trackUris;
    },

    async playTracks({ deviceId, trackUris }) {
      const accessToken = await ensureAccessToken();
      const response = await fetchImpl(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ uris: trackUris }),
        },
      );
      if (!response.ok) throw new Error(`Spotify rotation playback failed (${response.status})`);
    },
  };
}
