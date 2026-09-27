import test from "node:test";
import assert from "node:assert/strict";

import { createSpotifyClient } from "../src/spotify-client.js";

test("builds a PKCE authorization URL with the required permissions", async () => {
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    randomBytes: () => Buffer.alloc(32, 7),
  });

  const authorizationUrl = new URL(await spotify.beginAuthorization());

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
  await spotify.beginAuthorization();

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
  const authorizationUrl = new URL(await spotify.beginAuthorization());

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
            artists: [{ id: "artist-2", name: "Second Artist" }],
            images: [],
            external_urls: { spotify: "https://open.spotify.com/album/album-2" },
            release_date: "2025-02-01",
            album_type: "album",
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
          artists: [{ id: "artist-1", name: "A Favourite Artist" }],
          images: [{ url: "https://image.test/cover.jpg" }],
          external_urls: { spotify: "https://open.spotify.com/album/album-1" },
          release_date: "2024-01-01",
          album_type: "album",
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  const albums = await spotify.getSavedAlbums();

  assert.deepEqual(albums, [
    {
      id: "album-1",
      title: "A Favourite Album",
      artist: "A Favourite Artist",
      spotifyUri: "spotify:album:album-1",
      imageUrl: "https://image.test/cover.jpg",
      artistId: "artist-1",
      spotifyUrl: "https://open.spotify.com/album/album-1",
      releaseDate: "2024-01-01",
      albumType: "album",
    },
    {
      id: "album-2",
      title: "Second Page Album",
      artist: "Second Artist",
      spotifyUri: "spotify:album:album-2",
      imageUrl: null,
      artistId: "artist-2",
      spotifyUrl: "https://open.spotify.com/album/album-2",
      releaseDate: "2025-02-01",
      albumType: "album",
    },
  ]);
});

test("searches Spotify for albums and artists", async () => {
  let searchUrl;
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    fetchImpl: async (url) => {
      searchUrl = new URL(String(url));
      return Response.json({
        albums: { items: [{
          id: "album-1", name: "Blue", uri: "spotify:album:album-1",
          artists: [{ id: "artist-1", name: "Joni Mitchell" }],
          images: [{ url: "https://image.test/blue.jpg" }],
          external_urls: { spotify: "https://open.spotify.com/album/album-1" },
          release_date: "1971-06-22",
          album_type: "album",
        }] },
        artists: { items: [{
          id: "artist-1", name: "Joni Mitchell",
          images: [{ url: "https://image.test/joni.jpg" }],
          external_urls: { spotify: "https://open.spotify.com/artist/artist-1" },
        }] },
      });
    },
  });

  const results = await spotify.searchCatalog("joni blue");

  assert.equal(searchUrl.pathname, "/v1/search");
  assert.equal(searchUrl.searchParams.get("q"), "joni blue");
  assert.equal(searchUrl.searchParams.get("type"), "album,artist");
  assert.deepEqual(results, {
    albums: [{
      id: "album-1", title: "Blue", artist: "Joni Mitchell", artistId: "artist-1",
      spotifyUri: "spotify:album:album-1", imageUrl: "https://image.test/blue.jpg",
      spotifyUrl: "https://open.spotify.com/album/album-1", releaseDate: "1971-06-22",
      albumType: "album",
    }],
    artists: [{
      id: "artist-1", name: "Joni Mitchell", imageUrl: "https://image.test/joni.jpg",
      spotifyUrl: "https://open.spotify.com/artist/artist-1",
    }],
  });
});

test("loads an artist's newest unique releases", async () => {
  let artistAlbumsUrl;
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    fetchImpl: async (url) => {
      artistAlbumsUrl = new URL(url);
      return Response.json({ items: [
      { id: "old", name: "Old", uri: "spotify:album:old", artists: [{ id: "artist-1", name: "Artist" }], images: [], external_urls: {}, release_date: "2020-01-01" },
      { id: "new", name: "New", uri: "spotify:album:new", artists: [{ id: "artist-1", name: "Artist" }], images: [], external_urls: {}, release_date: "2026-01-01" },
      { id: "new", name: "New", uri: "spotify:album:new", artists: [{ id: "artist-1", name: "Artist" }], images: [], external_urls: {}, release_date: "2026-01-01" },
      ], next: null });
    },
  });

  const releases = await spotify.getArtistAlbums("artist-1");

  assert.equal(artistAlbumsUrl.searchParams.get("limit"), "10");
  assert.equal(artistAlbumsUrl.searchParams.get("include_groups"), "album");
  assert.deepEqual(releases.map(({ id }) => id), ["new", "old"]);
});

test("loads only the first page when scanning an artist for recent releases", async () => {
  const requestedUrls = [];
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return Response.json({
        items: [{
          id: "new", name: "New", uri: "spotify:album:new",
          artists: [{ id: "artist-1", name: "Artist" }], images: [], external_urls: {},
          release_date: "2026-01-01", album_type: "album",
        }],
        next: "https://api.spotify.com/v1/artists/artist-1/albums?offset=10&limit=10",
      });
    },
  });

  const releases = await spotify.getRecentArtistAlbums("artist-1");

  assert.equal(requestedUrls.length, 1);
  assert.equal(new URL(requestedUrls[0]).searchParams.get("include_groups"), "album");
  assert.deepEqual(releases.map(({ id }) => id), ["new"]);
});

test("waits for Spotify's Retry-After delay before retrying a rate-limited request", async () => {
  let attempts = 0;
  const waits = [];
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return Response.json(
          { error: { status: 429, message: "Too many requests" } },
          { status: 429, headers: { "retry-after": "2" } },
        );
      }
      return Response.json({
        id: "album-1", name: "Blue", uri: "spotify:album:album-1",
        artists: [{ id: "artist-1", name: "Joni Mitchell" }], images: [], external_urls: {},
        release_date: "1971-06-22", album_type: "album",
      });
    },
  });

  assert.equal((await spotify.getAlbum("album-1")).title, "Blue");
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [2_000]);
});

test("fails fast when Spotify asks the server to wait beyond its request budget", async () => {
  let attempts = 0;
  const waits = [];
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    maxRetryDelayMs: 5_000,
    sleep: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async () => {
      attempts += 1;
      return Response.json(
        { error: { status: 429, message: "Too many requests" } },
        { status: 429, headers: { "retry-after": "30" } },
      );
    },
  });

  await assert.rejects(
    spotify.getAlbum("album-1"),
    /Spotify is busy\. Try again in 30 seconds/,
  );
  assert.equal(attempts, 1);
  assert.deepEqual(waits, []);
});

test("aborts a Spotify request before the serverless request can time out", async () => {
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    requestTimeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });

  await assert.rejects(
    spotify.getAlbum("album-1"),
    /Spotify request timed out/,
  );
});

test("does not immediately retry a 429 without a Retry-After delay", async () => {
  let attempts = 0;
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      return Response.json(
        { error: { status: 429, message: "Too many requests", reason: "QUOTA_EXCEEDED" } },
        { status: 429 },
      );
    },
  });

  await assert.rejects(spotify.getAlbum("album-1"), /429/);
  assert.equal(attempts, 1);
});

test("loads one Spotify album for safe playback by id", async () => {
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    initialSession: {
      token: { accessToken: "access-123", refreshToken: "refresh-123", expiresAt: Number.MAX_SAFE_INTEGER },
      profile: { id: "listener", displayName: "Dylan" },
    },
    fetchImpl: async () => Response.json({
      id: "album-1", name: "Blue", uri: "spotify:album:album-1",
      artists: [{ id: "artist-1", name: "Joni Mitchell" }], images: [], external_urls: {}, release_date: "1971",
    }),
  });

  assert.equal((await spotify.getAlbum("album-1")).spotifyUri, "spotify:album:album-1");
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.playTracks({ deviceId: "speaker-1", trackUris: ["spotify:track:one", "spotify:track:two"] });

  const request = requests.at(-1);
  assert.equal(request.url, "https://api.spotify.com/v1/me/player/play?device_id=speaker-1");
  assert.deepEqual(JSON.parse(request.options.body), { uris: ["spotify:track:one", "spotify:track:two"] });
});

test("plays a stack larger than Spotify's playback batch without dropping tracks", async () => {
  const requests = [];
  const sleeps = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    fetchImpl,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(await spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });
  requests.length = 0;
  const trackUris = Array.from({ length: 117 }, (_, index) => `spotify:track:${index + 1}`);

  await spotify.playTracks({ deviceId: "speaker-1", trackUris });

  const [startRequest, ...queueRequests] = requests;
  const startedUris = JSON.parse(startRequest.options.body).uris;
  assert.equal(startedUris.length, 100);
  assert.deepEqual(startedUris, [trackUris[0], ...trackUris.slice(18)]);
  assert.equal(queueRequests.length, 17);
  assert.deepEqual(
    queueRequests.map(({ url }) => new URL(url).searchParams.get("uri")),
    trackUris.slice(1, 18),
  );
  assert.ok(queueRequests.every(({ options }) => options.method === "POST"));
  assert.deepEqual(sleeps, [250]);
});

test("retries one transient Spotify gateway failure when starting a stack", async () => {
  let playbackAttempts = 0;
  const sleeps = [];
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    playbackAttempts += 1;
    if (playbackAttempts === 1) {
      return Response.json({ error: { status: 502, message: "Bad gateway" } }, { status: 502 });
    }
    return new Response(null, { status: 204 });
  };
  const spotify = createSpotifyClient({
    clientId: "client-123",
    redirectUri: "https://example.test/callback",
    fetchImpl,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    randomBytes: () => Buffer.alloc(32, 7),
  });
  const authorizationUrl = new URL(await spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await spotify.playTracks({ deviceId: "speaker-1", trackUris: ["spotify:track:one"] });

  assert.equal(playbackAttempts, 2);
  assert.deepEqual(sleeps, [250]);
});

test("preserves Spotify playback error details for recovery", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) return Response.json({ access_token: "access-123", expires_in: 3600 });
    if (String(url).endsWith("/me")) return Response.json({ id: "listener", display_name: "Dylan" });
    return Response.json({ error: { status: 404, message: "Device not found" } }, { status: 404 });
  };
  const spotify = createSpotifyClient({ clientId: "client-123", redirectUri: "https://example.test/callback", fetchImpl, randomBytes: () => Buffer.alloc(32, 7) });
  const authorizationUrl = new URL(await spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });

  await assert.rejects(
    spotify.playTracks({ deviceId: "stale-speaker", trackUris: ["spotify:track:one"] }),
    (error) => {
      assert.equal(error.status, 404);
      assert.match(error.message, /Device not found/);
      return true;
    },
  );
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
  const authorizationUrl = new URL(await firstClient.beginAuthorization());
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
  const authorizationUrl = new URL(await spotify.beginAuthorization());
  await spotify.completeAuthorization({ code: "auth-code", state: authorizationUrl.searchParams.get("state") });
  currentTime = 2_000;

  await spotify.getAvailableDevices();

  const refreshRequest = requests.find(({ options }) => new URLSearchParams(options.body).get("grant_type") === "refresh_token");
  assert.ok(refreshRequest);
  assert.equal(requests.at(-1).options.headers.authorization, "Bearer access-new");
});

test("persists PKCE state so a serverless callback can use a new client instance", async () => {
  let savedSession = null;
  const sessionStore = {
    load: () => savedSession,
    save: async (session) => { savedSession = structuredClone(session); },
  };
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/token")) {
      return Response.json({ access_token: "access-123", refresh_token: "refresh-123", expires_in: 3600 });
    }
    return Response.json({ id: "listener", display_name: "Dylan" });
  };
  const options = {
    clientId: "client-123",
    redirectUri: "https://example.test/auth/spotify/callback",
    fetchImpl,
    sessionStore,
    randomBytes: () => Buffer.alloc(48, 7),
  };
  const firstInvocation = createSpotifyClient(options);
  const authorizationUrl = new URL(await firstInvocation.beginAuthorization());
  const secondInvocation = createSpotifyClient(options);

  await secondInvocation.completeAuthorization({
    code: "auth-code",
    state: authorizationUrl.searchParams.get("state"),
  });

  assert.equal(secondInvocation.status().connected, true);
  assert.equal(savedSession.pendingAuthorization, null);
});
