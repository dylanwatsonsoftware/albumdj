import test from "node:test";
import assert from "node:assert/strict";

import { createSpotifyClient } from "../src/spotify-client.js";

test("builds a PKCE authorization URL with the required permissions", () => {
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    randomBytes: () => Buffer.alloc(32, 7),
  });

  const authorizationUrl = new URL(spotify.beginAuthorization());

  assert.equal(authorizationUrl.origin, "https://accounts.spotify.com");
  assert.equal(authorizationUrl.pathname, "/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "client-123");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://example.test/auth/spotify/callback");
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorizationUrl.searchParams.get("code_challenge"));
  assert.match(authorizationUrl.searchParams.get("scope"), /user-library-read/);
  assert.match(authorizationUrl.searchParams.get("scope"), /user-read-playback-state/);
  assert.match(authorizationUrl.searchParams.get("scope"), /user-modify-playback-state/);
});

test("rejects an OAuth callback whose state does not match", async () => {
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    randomBytes: () => Buffer.alloc(32, 7),
  });
  spotify.beginAuthorization();

  await assert.rejects(
    spotify.completeAuthorization({ code: "auth-code", state: "wrong-state" }),
    /state mismatch/i,
  );
});

test("exchanges the code and reports the connected Spotify profile", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) {
      return Response.json({
        access_token: "access-123",
        refresh_token: "refresh-123",
        expires_in: 3600,
      });
    }
    return Response.json({ id: "listener", display_name: "Dylan" });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());

  await spotify.completeAuthorization({
    code: "auth-code",
    state: authorizationUrl.searchParams.get("state"),
  });

  const tokenRequestBody = new URLSearchParams(requests[0].options.body);
  assert.equal(tokenRequestBody.get("grant_type"), "authorization_code");
  assert.equal(tokenRequestBody.get("code"), "auth-code");
  assert.ok(tokenRequestBody.get("code_verifier"));
  assert.equal(requests[1].options.headers.authorization, "Bearer access-123");
  assert.deepEqual(spotify.status(), {
    configured: true,
    connected: true,
    profile: { id: "listener", displayName: "Dylan" },
  });
});

test("loads every saved-album page and maps albums into physical-card entries", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) {
      return Response.json({ access_token: "access-123", expires_in: 3600 });
    }
    if (String(url).endsWith("/me")) {
      return Response.json({ id: "listener", display_name: "Dylan" });
    }
    if (String(url).includes("offset=50")) {
      return Response.json({
        items: [{
          album: {
            id: "album-2",
            name: "Second Page Album",
            uri: "spotify:album:album-2",
            artists: [{ name: "Second Artist" }],
            images: [],
          },
        }],
        next: null,
      });
    }
    return Response.json({
      items: [{
        album: {
          id: "album-1",
          name: "A Favourite Album",
          uri: "spotify:album:album-1",
          artists: [{ name: "A Favourite Artist" }],
          images: [{ url: "https://image.test/cover.jpg" }],
        },
      }],
      next: "https://api.spotify.com/v1/me/albums?limit=50&offset=50",
    });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  const albums = await spotify.getSavedAlbums();

  assert.deepEqual(albums, [
    {
      id: "album-1",
      title: "A Favourite Album",
      artist: "A Favourite Artist",
      spotifyUri: "spotify:album:album-1",
      imageUrl: "https://image.test/cover.jpg",
    },
    {
      id: "album-2",
      title: "Second Page Album",
      artist: "Second Artist",
      spotifyUri: "spotify:album:album-2",
      imageUrl: null,
    },
  ]);
});

test("returns Spotify devices that accept playback commands", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return Response.json({
      devices: [
        { id: "desktop-1", name: "Dylan's MacBook", type: "Computer", is_active: true, is_restricted: false },
        { id: "restricted-1", name: "Unavailable Speaker", type: "Speaker", is_active: false, is_restricted: true },
      ],
    });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  assert.deepEqual(await spotify.getAvailableDevices(), [{
    id: "desktop-1",
    name: "Dylan's MacBook",
    kind: "computer",
    detail: "Spotify Connect",
    isActive: true,
  }]);
});

test("starts an album on the selected Spotify device", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.playAlbum({ deviceId: "desktop-1", spotifyUri: "spotify:album:album-1" });

  const playRequest = requests.at(-1);
  assert.equal(playRequest.url, "https://api.spotify.com/v1/me/player/play?device_id=desktop-1");
  assert.equal(playRequest.options.method, "PUT");
  assert.equal(playRequest.options.headers.authorization, "Bearer access-123");
  assert.deepEqual(JSON.parse(playRequest.options.body), { context_uri: "spotify:album:album-1" });
});

test("returns the track and device Spotify is actually playing", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return Response.json({
      is_playing: true,
      progress_ms: 42_000,
      device: { id: "phone-1", name: "Pixel 7", type: "Smartphone" },
      item: {
        id: "track-1",
        name: "The Real Song",
        duration_ms: 180_000,
        artists: [{ name: "The Artist" }],
        album: {
          id: "album-1",
          name: "The Real Album",
          uri: "spotify:album:album-1",
          images: [{ url: "https://image.test/album.jpg" }],
        },
      },
    });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  assert.deepEqual(await spotify.getCurrentPlayback(), {
    isPlaying: true,
    progressMs: 42_000,
    durationMs: 180_000,
    device: { id: "phone-1", name: "Pixel 7", kind: "smartphone" },
    track: { id: "track-1", title: "The Real Song", artist: "The Artist" },
    album: {
      id: "album-1",
      title: "The Real Album",
      spotifyUri: "spotify:album:album-1",
      imageUrl: "https://image.test/album.jpg",
    },
  });
});

test("returns null when Spotify has no current playback", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  assert.equal(await spotify.getCurrentPlayback(), null);
});

test("pauses the active Spotify playback", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({ clientId: "client-123", redirectUri: "https://example.test/callback", fetchImpl, randomBytes: () => Buffer.alloc(32, 7) });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.pausePlayback();

  assert.equal(requests.at(-1).url, "https://api.spotify.com/v1/me/player/pause");
  assert.equal(requests.at(-1).options.method, "PUT");
});

test("resumes the active Spotify playback", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({ clientId: "client-123", redirectUri: "https://example.test/callback", fetchImpl, randomBytes: () => Buffer.alloc(32, 7) });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.resumePlayback();

  assert.equal(requests.at(-1).url, "https://api.spotify.com/v1/me/player/play");
  assert.equal(requests.at(-1).options.method, "PUT");
});

test("skips to the next Spotify track", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({ clientId: "client-123", redirectUri: "https://example.test/callback", fetchImpl, randomBytes: () => Buffer.alloc(32, 7) });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.skipNext();

  assert.equal(requests.at(-1).url, "https://api.spotify.com/v1/me/player/next");
  assert.equal(requests.at(-1).options.method, "POST");
});

test("loads every track from an album", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    if (String(url).includes("offset=50")) return Response.json({ items: [{ uri: "spotify:track:two", is_playable: true }], next: null });
    return Response.json({ items: [{ uri: "spotify:track:one", is_playable: true }, { uri: "spotify:track:blocked", is_playable: false }], next: "https://api.spotify.com/v1/albums/album-1/tracks?offset=50" });
  };
  const spotify = createSpotifyClient({ clientId: "client-123", redirectUri: "https://example.test/callback", fetchImpl, randomBytes: () => Buffer.alloc(32, 7) });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  assert.deepEqual(await spotify.getAlbumTracks("album-1"), ["spotify:track:one", "spotify:track:two"]);
});

test("starts an explicit rotation of tracks on the selected device", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({ clientId: "client-123", redirectUri: "https://example.test/callback", fetchImpl, randomBytes: () => Buffer.alloc(32, 7) });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.playTracks({ deviceId: "speaker-1", trackUris: ["spotify:track:one", "spotify:track:two"] });

  const request = requests.at(-1);
  assert.equal(request.url, "https://api.spotify.com/v1/me/player/play?device_id=speaker-1");
  assert.deepEqual(JSON.parse(request.options.body), { uris: ["spotify:track:one", "spotify:track:two"] });
});

test("restores a connected Spotify session after a server restart", async () => {
  let savedSession = null;
  const sessionStore = {
    load: () => savedSession,
    save: (session) => { savedSession = structuredClone(session); },
  };
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) {
      return Response.json({ access_token: "access-123", refresh_token: "refresh-123", expires_in: 3600 });
    }
    return Response.json({ id: "listener", display_name: "Dylan" });
  };
  const firstClient = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    sessionStore,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(firstClient.beginAuthorization());
  await firstClient.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  const restartedClient = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    sessionStore,
  });

  assert.deepEqual(restartedClient.status(), {
    configured: true,
    connected: true,
    profile: { id: "listener", displayName: "Dylan" },
  });
});

test("refreshes an expired access token before calling Spotify", async () => {
  let currentTime = 0;
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) {
      const body = new URLSearchParams(options.body);
      if (body.get("grant_type") === "refresh_token") {
        return Response.json({ access_token: "access-new", expires_in: 3600 });
      }
      return Response.json({ access_token: "access-old", refresh_token: "refresh-123", expires_in: 1 });
    }
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return Response.json({ devices: [] });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    now: () => currentTime,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });
  currentTime = 2_000;

  await spotify.getAvailableDevices();

  const refreshRequest = requests.find(({ options }) => new URLSearchParams(options.body).get("grant_type") === "refresh_token");
  assert.ok(refreshRequest);
  assert.equal(requests.at(-1).options.headers.authorization, "Bearer access-new");
});
