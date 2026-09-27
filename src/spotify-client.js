import { createHash, randomBytes as secureRandomBytes } from "node:crypto";

const scopes = [
  "user-library-read",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-modify-private",
];
const MAX_PLAYLIST_ITEMS = 100;
const PLAYER_SETTLE_DELAY_MS = 250;

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function mapAlbum(album) {
  return {
    id: album.id,
    title: album.name,
    artist: album.artists.map(({ name }) => name).join(", "),
    artistId: album.artists[0]?.id ?? null,
    spotifyUri: album.uri,
    imageUrl: album.images[0]?.url ?? null,
    spotifyUrl: album.external_urls?.spotify ?? null,
    releaseDate: album.release_date ?? null,
    albumType: album.album_type ?? "album",
  };
}

function mapArtist(artist) {
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: artist.images[0]?.url ?? null,
    spotifyUrl: artist.external_urls?.spotify ?? null,
  };
}

async function spotifyPlaybackError(label, response) {
  let detail = null;
  try {
    const payload = await response.json();
    detail = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
  } catch {
    // Spotify does not always return a JSON body for player errors.
  }
  const error = new Error(`${label} (${response.status})${detail ? `: ${detail}` : ""}`);
  error.status = response.status;
  return error;
}

export function createSpotifyClient({
  clientId,
  redirectUri,
  fetchImpl = fetch,
  randomBytes = secureRandomBytes,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxRetryDelayMs = 5_000,
  requestTimeoutMs = 8_000,
  sessionStore = { load: () => null, save: () => {} },
  initialSession,
}) {
  const restoredSession = initialSession ?? sessionStore.load() ?? {};
  let pendingAuthorization = restoredSession.pendingAuthorization ?? null;
  let token = restoredSession.token ?? null;
  let profile = restoredSession.profile ?? null;
  let stackPlaylist = restoredSession.stackPlaylist ?? null;

  async function saveSession() {
    await sessionStore.save({ token, profile, pendingAuthorization, stackPlaylist });
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
      scopes: payload.scope ? payload.scope.split(" ") : token.scopes,
    };
    await saveSession();
    return token.accessToken;
  }

  async function spotifyJson(path) {
    const accessToken = await ensureAccessToken();
    const url = path.startsWith("https://") ? path : `https://api.spotify.com/v1${path}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw new Error("Spotify request timed out");
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      if (response.ok) return response.json();

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = Number(retryAfterHeader);
      if (
        response.status === 429
        && attempt === 0
        && retryAfterHeader !== null
        && Number.isFinite(retryAfterSeconds)
      ) {
        const retryDelayMs = Math.max(0, retryAfterSeconds) * 1_000;
        if (retryDelayMs > maxRetryDelayMs) {
          const seconds = Math.ceil(retryDelayMs / 1_000);
          const error = new Error(`Spotify is busy. Try again in ${seconds} seconds`);
          error.retryAfterSeconds = seconds;
          throw error;
        }
        await sleep(retryDelayMs);
        continue;
      }
      throw new Error(`Spotify API request failed (${response.status})`);
    }
    throw new Error("Spotify API request failed after retrying");
  }

  async function startPlayback({ accessToken, deviceId, body }) {
    const url = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetchImpl(url, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) return;
      if (response.status >= 500 && attempt === 0) {
        await sleep(PLAYER_SETTLE_DELAY_MS);
        continue;
      }
      throw await spotifyPlaybackError("Spotify rotation playback failed", response);
    }
  }

  async function ensureStackPlaylist(accessToken) {
    if (stackPlaylist) return stackPlaylist;
    const response = await fetchImpl("https://api.spotify.com/v1/me/playlists", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Album DJ Stack",
        public: false,
        description: "Your current Album DJ multi-disc changer stack.",
      }),
    });
    if (!response.ok) throw await spotifyPlaybackError("Spotify stack playlist setup failed", response);
    const playlist = await response.json();
    stackPlaylist = { id: playlist.id, uri: playlist.uri ?? `spotify:playlist:${playlist.id}` };
    await saveSession();
    return stackPlaylist;
  }

  async function writeStackPlaylist({ accessToken, playlistId, trackUris }) {
    const batches = [];
    for (let index = 0; index < trackUris.length; index += MAX_PLAYLIST_ITEMS) {
      batches.push(trackUris.slice(index, index + MAX_PLAYLIST_ITEMS));
    }
    for (const [index, uris] of batches.entries()) {
      const response = await fetchImpl(
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`,
        {
          method: index === 0 ? "PUT" : "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ uris }),
        },
      );
      if (!response.ok) throw await spotifyPlaybackError("Spotify stack playlist update failed", response);
    }
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
        scopes: payload.scope ? payload.scope.split(" ") : scopes,
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
        playlistAccess: Boolean(token?.scopes?.includes("playlist-modify-private")),
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

      return items.map(({ album }) => mapAlbum(album));
    },

    async searchCatalog(query) {
      const cleanedQuery = query.trim();
      if (!cleanedQuery) return { albums: [], artists: [] };
      const params = new URLSearchParams({ q: cleanedQuery, type: "album,artist", limit: "10" });
      const results = await spotifyJson(`/search?${params}`);
      return {
        albums: (results.albums?.items ?? []).filter(Boolean).map(mapAlbum),
        artists: (results.artists?.items ?? []).filter(Boolean).map(mapArtist),
      };
    },

    async getArtistAlbums(artistId) {
      const albums = [];
      let next = `/artists/${encodeURIComponent(artistId)}/albums?include_groups=album&limit=10`;
      while (next) {
        const page = await spotifyJson(next);
        albums.push(...page.items.filter(Boolean));
        next = page.next;
      }
      const unique = [...new Map(albums.map((album) => [album.id, album])).values()];
      return unique.map(mapAlbum).sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""));
    },

    async getRecentArtistAlbums(artistId) {
      const page = await spotifyJson(
        `/artists/${encodeURIComponent(artistId)}/albums?include_groups=album&limit=10`,
      );
      const unique = [...new Map(
        page.items.filter(Boolean).map((album) => [album.id, album]),
      ).values()];
      return unique.map(mapAlbum).sort(
        (left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""),
      );
    },

    async getAlbum(albumId) {
      return mapAlbum(await spotifyJson(`/albums/${encodeURIComponent(albumId)}`));
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
      let playlist = await ensureStackPlaylist(accessToken);
      try {
        await writeStackPlaylist({ accessToken, playlistId: playlist.id, trackUris });
      } catch (error) {
        if (error?.status !== 404) throw error;
        stackPlaylist = null;
        playlist = await ensureStackPlaylist(accessToken);
        await writeStackPlaylist({ accessToken, playlistId: playlist.id, trackUris });
      }
      await startPlayback({
        accessToken,
        deviceId,
        body: { context_uri: playlist.uri },
      });
    },
  };
}
