import test from "node:test";
import assert from "node:assert/strict";

import { createPrototypeHandler, createPrototypeServer } from "../src/server.js";
import { createPlayerState } from "../src/player-state.js";
import { createRotationShelf } from "../src/rotation-shelf.js";

const disconnectedSpotify = {
  status: () => ({ configured: false, connected: false, profile: null }),
};

test("exports an awaitable request handler for serverless hosting", () => {
  assert.equal(typeof createPrototypeHandler, "function");
});

async function withServer(run, options) {
  const server = createPrototypeServer({ spotify: disconnectedSpotify, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("serves the mobile card-scanner interface", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(html, /<title>Album DJ<\/title>/);
    assert.match(html, /<h1 id="destination-heading">Listen on<\/h1>/);
    assert.match(html, /Scan an album card/);
    assert.match(html, /id="scan-nfc"/);
    assert.match(html, /id="nfc-status"/);
    assert.match(html, /id="coverflow"/);
    assert.match(html, /id="coverflow-stage"/);
    assert.match(html, /id="album-view-grid"/);
    assert.match(html, /id="album-view-rotation"/);
    assert.match(html, /id="rotation-toggle"/);
    assert.match(html, /id="rotation-duration"/);
    assert.match(html, /id="rotation-mode"/);
    assert.match(html, /id="rotation-albums"/);
    assert.match(html, /id="rotation-play"/);
    assert.match(html, /id="playback-toggle"/);
    assert.match(html, /id="playback-next"/);
    assert.match(html, /id="now-album"/);
    assert.match(html, /id="album-search"/);
    assert.match(html, /role="combobox"/);
    assert.match(html, /id="search-suggestions"/);
    assert.match(html, /role="listbox"/);
    assert.match(html, /id="favourite-artists"/);
    assert.match(html, /id="favourite-albums"/);
    assert.match(html, /id="recent-releases"/);
    assert.match(html, /id="recent-release-albums"/);
    assert.match(html, /id="recent-releases-status"/);
    assert.match(html, /id="artist-discography"/);
    assert.match(html, /id="artist-discography-albums"/);
    assert.match(html, /id="artist-discography-back"/);
    assert.match(html, /id="discovery-results"/);
    assert.match(html, /Connect Spotify/);
    assert.match(html, /id="app-navigation"/);
    assert.match(html, /data-app-section="home"/);
    assert.match(html, /data-app-section="library"/);
    assert.match(html, /data-app-section="stack"/);
    assert.match(html, /data-app-section="devices"/);
    assert.match(html, /class="home-stack-hero"/);
    assert.match(html, /data-coverflow-source="rotation"/);
    assert.match(html, /id="coverflow-empty-action"/);
    assert.match(html, /data-focus-target="album-search"/);
    assert.match(html, /data-focus-target="favourite-artists"/);

    const startupModule = await fetch(`${baseUrl}/startup.js`);
    assert.equal(startupModule.status, 200);
    assert.match(startupModule.headers.get("content-type"), /javascript/);
    const navigationModule = await fetch(`${baseUrl}/navigation.js`);
    assert.equal(navigationModule.status, 200);
    const appModule = await (await fetch(`${baseUrl}/app.js`)).text();
    const moduleImports = new Map([...appModule.matchAll(/import\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g)]
      .map(([, names, path]) => [path, names]));
    assert.match(moduleImports.get("./discovery.js"), /artistReleaseErrorMessage/);
    assert.doesNotMatch(moduleImports.get("./coverflow.js"), /artistReleaseErrorMessage/);
  });
});

test("saves and lists favourite albums", async () => {
  const favouriteAlbums = [];
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/favourite-albums`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albums: [{
        id: "blue",
        title: "Blue",
        artist: "Joni Mitchell",
        imageUrl: "https://image.test/blue.jpg",
        spotifyUrl: "https://open.spotify.com/album/blue",
        releaseDate: "1971-06-22",
      }] }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map(({ id }) => id), ["blue"]);
    assert.deepEqual((await (await fetch(`${baseUrl}/api/favourite-albums`)).json()).map(({ id }) => id), ["blue"]);
  }, {
    contextProvider: async () => ({
      player: createPlayerState({ targets: [{ id: "speaker" }], albums: [], defaultTargetId: "speaker" }),
      spotify: disconnectedSpotify,
      rotation: createRotationShelf({ store: { load: () => null, save: () => {} } }),
      favouriteAlbums,
      persistFavouriteAlbums: async () => {},
    }),
  });
});

test("searches Spotify, lists favourite artists, and shows their releases", async () => {
  const favouriteArtists = [];
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    searchCatalog: async (query) => ({ query, albums: [{ id: "blue" }], artists: [{ id: "joni" }] }),
    getArtistAlbums: async (artistId) => [{ id: "hejira", artistId }],
  };

  await withServer(async (baseUrl) => {
    const search = await fetch(`${baseUrl}/api/spotify/search?q=joni`);
    assert.deepEqual(await search.json(), { query: "joni", albums: [{ id: "blue" }], artists: [{ id: "joni" }] });

    const releases = await fetch(`${baseUrl}/api/spotify/artists/joni/albums`);
    assert.deepEqual(await releases.json(), [{ id: "hejira", artistId: "joni" }]);

    const save = await fetch(`${baseUrl}/api/favourite-artists`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artists: [{ id: "joni", name: "Joni Mitchell" }] }),
    });
    assert.equal(save.status, 200);
    const savedArtists = [{ id: "joni", name: "Joni Mitchell", imageUrl: null, spotifyUrl: null }];
    assert.deepEqual(await save.json(), savedArtists);
    assert.deepEqual(await (await fetch(`${baseUrl}/api/favourite-artists`)).json(), savedArtists);
  }, {
    contextProvider: async () => ({
      player: createPlayerState({ targets: [{ id: "speaker", name: "Speaker" }], albums: [], defaultTargetId: "speaker" }),
      spotify,
      rotation: createRotationShelf({ store: { load: () => null, save: () => {} } }),
      favouriteArtists,
      persistFavouriteArtists: async () => {},
    }),
  });
});

test("plays an album found through Spotify search on the selected device", async () => {
  let command;
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getAlbum: async (id) => ({ id, title: "Blue", artist: "Joni Mitchell", spotifyUri: `spotify:album:${id}` }),
    playAlbum: async (value) => { command = value; },
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/albums/blue/play`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).album.title, "Blue");
    assert.deepEqual(command, { deviceId: "whole-house", spotifyUri: "spotify:album:blue" });
  }, { spotify });
});

test("showcases recent albums from favourite artists with bounded concurrency", async () => {
  let activeRequests = 0;
  let maximumConcurrentRequests = 0;
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getArtistAlbums: async () => { throw new Error("Recent releases should not load a full discography"); },
    getRecentArtistAlbums: async (artistId) => {
      activeRequests += 1;
      maximumConcurrentRequests = Math.max(maximumConcurrentRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;
      return [
        { id: `${artistId}-new`, title: "New Album", albumType: "album", releaseDate: "2026-06-01" },
        { id: `${artistId}-old`, title: "Old Album", albumType: "album", releaseDate: "2024-01-01" },
      ];
    },
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/favourite-artists/releases`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map(({ id }) => id), ["joni-new", "coltrane-new", "mingus-new"]);
    assert.equal(maximumConcurrentRequests, 2);
  }, {
    contextProvider: async () => ({
      player: createPlayerState({ targets: [{ id: "speaker" }], albums: [], defaultTargetId: "speaker" }),
      spotify,
      rotation: createRotationShelf({ store: { load: () => null, save: () => {} } }),
      favouriteArtists: [{ id: "joni" }, { id: "coltrane" }, { id: "mingus" }],
    }),
    now: () => new Date("2026-09-27T12:00:00Z").getTime(),
  });
});

test("keeps successful recent releases when one favourite artist request fails", async () => {
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getRecentArtistAlbums: async (artistId) => {
      if (artistId === "unavailable") throw new Error("Spotify API request failed (429)");
      return [{ id: `${artistId}-new`, title: "New Album", albumType: "album", releaseDate: "2026-06-01" }];
    },
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/favourite-artists/releases`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map(({ id }) => id), ["joni-new"]);
  }, {
    contextProvider: async () => ({
      player: createPlayerState({ targets: [{ id: "speaker" }], albums: [], defaultTargetId: "speaker" }),
      spotify,
      rotation: createRotationShelf({ store: { load: () => null, save: () => {} } }),
      favouriteArtists: [{ id: "unavailable" }, { id: "joni" }],
    }),
    now: () => new Date("2026-09-27T12:00:00Z").getTime(),
  });
});

test("exposes Spotify connection status", async () => {
  const spotify = {
    status: () => ({ configured: true, connected: false, profile: null }),
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/status`);
    assert.deepEqual(await response.json(), { configured: true, connected: false, profile: null });
  }, { spotify });
});

test("redirects through Spotify authorization and completes the callback", async () => {
  let callback;
  const savedAlbums = [{ id: "connected-album", title: "Connected Album" }];
  const devices = [{ id: "desktop-1", name: "Desktop", kind: "computer", isActive: true }];
  const spotify = {
    status: () => ({ configured: true, connected: false, profile: null }),
    beginAuthorization: () => "https://accounts.spotify.test/authorize",
    completeAuthorization: async (value) => { callback = value; },
    getSavedAlbums: async () => savedAlbums,
    getAvailableDevices: async () => devices,
  };

  await withServer(async (baseUrl) => {
    const login = await fetch(`${baseUrl}/auth/spotify`, { redirect: "manual" });
    assert.equal(login.status, 302);
    assert.equal(login.headers.get("location"), "https://accounts.spotify.test/authorize");

    const complete = await fetch(`${baseUrl}/auth/spotify/callback?code=code-1&state=state-1`, { redirect: "manual" });
    assert.equal(complete.status, 302);
    assert.equal(complete.headers.get("location"), "/?spotify=connected");
    assert.deepEqual(callback, { code: "code-1", state: "state-1" });

    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    assert.deepEqual(state.albums, savedAlbums);
    assert.deepEqual(state.targets, devices);
    assert.equal(state.selectedTargetId, "desktop-1");
  }, { spotify });
});

test("hands a connected browser session to the Android app", async () => {
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { id: "listener", displayName: "Listener" } }),
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/connect`, { redirect: "manual" });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://albumdj.vercel.app/mobile/callback#token=signed-native-session");
  }, {
    contextProvider: async () => ({
      player: createPlayerState({ targets: [{ id: "speaker" }], albums: [], defaultTargetId: "speaker" }),
      spotify,
      rotation: createRotationShelf({ store: { load: () => null, save: () => {} } }),
      sessionToken: "signed-native-session",
    }),
  });
});

test("serves Android App Link verification for the debug prototype", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/.well-known/assetlinks.json`);
    const links = await response.json();

    assert.equal(response.status, 200);
    assert.equal(links[0].target.package_name, "com.dylanwatson.albumdj");
    assert.match(links[0].target.sha256_cert_fingerprints[0], /^BF:19:F1:F8:/);
  });
});

test("sends a disconnected Android app through Spotify then back to the app handoff", async () => {
  const spotify = {
    status: () => ({ configured: true, connected: false, profile: null }),
    beginAuthorization: () => "https://accounts.spotify.test/authorize",
    completeAuthorization: async () => {},
    getSavedAlbums: async () => [],
    getAvailableDevices: async () => [{ id: "phone", name: "Phone", kind: "smartphone" }],
  };

  await withServer(async (baseUrl) => {
    const connect = await fetch(`${baseUrl}/api/mobile/connect`, { redirect: "manual" });
    assert.equal(connect.headers.get("location"), "/api/auth/spotify?mobile=1");

    const login = await fetch(`${baseUrl}/api/auth/spotify?mobile=1`, { redirect: "manual" });
    assert.match(login.headers.get("set-cookie"), /pf_mobile_return=1/);

    const complete = await fetch(`${baseUrl}/api/auth/spotify/callback?code=code&state=state`, {
      redirect: "manual",
      headers: { cookie: "pf_mobile_return=1" },
    });
    assert.equal(complete.headers.get("location"), "/api/mobile/connect");
    assert.match(complete.headers.get("set-cookie"), /Max-Age=0/);
  }, { spotify });
});

test("refreshes Spotify devices and starts the scanned album on the selected device", async () => {
  let playCommand;
  const devices = [{ id: "desktop-1", name: "Desktop", kind: "computer", isActive: true }];
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getAvailableDevices: async () => devices,
    playAlbum: async (command) => { playCommand = command; },
  };

  await withServer(async (baseUrl) => {
    const devicesResponse = await fetch(`${baseUrl}/api/spotify/devices`, { method: "POST" });
    assert.equal(devicesResponse.status, 200);
    assert.deepEqual((await devicesResponse.json()).targets, devices);

    const played = await fetch(`${baseUrl}/api/play`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId: "discovery" }),
    });
    const playback = await played.json();
    assert.equal(played.status, 200);
    assert.equal(playback.mode, "spotify");
    assert.deepEqual(playCommand, {
      deviceId: "desktop-1",
      spotifyUri: "spotify:album:2noRn2Aes5aoNVsU6iWThc",
    });
  }, { spotify });
});

test("returns saved albums from the connected Spotify account", async () => {
  const savedAlbums = [{ id: "album-1", title: "Favourite" }];
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getSavedAlbums: async () => savedAlbums,
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/albums`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), savedAlbums);
  }, { spotify });
});

test("returns Spotify's actual current playback", async () => {
  const currentPlayback = { isPlaying: true, track: { title: "Real Song" } };
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getCurrentPlayback: async () => currentPlayback,
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/playback`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), currentPlayback);
  }, { spotify });
});

test("pauses, resumes, and skips Spotify playback", async () => {
  const commands = [];
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    pausePlayback: async () => commands.push("pause"),
    resumePlayback: async () => commands.push("resume"),
    skipNext: async () => commands.push("next"),
  };

  await withServer(async (baseUrl) => {
    for (const action of ["pause", "resume", "next"]) {
      const response = await fetch(`${baseUrl}/api/spotify/playback/${action}`, { method: "POST" });
      assert.equal(response.status, 204);
    }
    assert.deepEqual(commands, ["pause", "resume", "next"]);
  }, { spotify });
});

test("imports saved Spotify albums into the scannable catalogue", async () => {
  const savedAlbums = [{
    id: "album-1",
    title: "Favourite",
    artist: "Artist",
    spotifyUri: "spotify:album:album-1",
  }];
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getSavedAlbums: async () => savedAlbums,
  };

  await withServer(async (baseUrl) => {
    const imported = await fetch(`${baseUrl}/api/spotify/import`, { method: "POST" });
    const state = await imported.json();
    assert.equal(imported.status, 200);
    assert.deepEqual(state.albums, savedAlbums);

    const played = await fetch(`${baseUrl}/api/play`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId: "album-1" }),
    });
    assert.equal(played.status, 200);
    assert.equal((await played.json()).album.title, "Favourite");
  }, { spotify });
});

test("returns the available albums and speaker targets", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/state`);
    const state = await response.json();

    assert.equal(response.status, 200);
    assert.ok(state.targets.some((target) => target.kind === "group"));
    assert.ok(state.albums.length >= 3);
    assert.equal(state.selectedTargetId, "whole-house");
  });
});

test("selects a target and simulates playback from a card scan", async () => {
  await withServer(async (baseUrl) => {
    const targetResponse = await fetch(`${baseUrl}/api/target`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetId: "kitchen" }),
    });
    assert.equal(targetResponse.status, 200);

    const playResponse = await fetch(`${baseUrl}/api/play`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId: "discovery" }),
    });
    const playback = await playResponse.json();

    assert.equal(playResponse.status, 200);
    assert.equal(playback.target.id, "kitchen");
    assert.equal(playback.album.id, "discovery");
    assert.equal(playback.mode, "simulated");
  });
});

test("returns a useful client error for an unknown card", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/play`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId: "unknown" }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /Unknown album/);
  });
});

test("configures and returns the temporary rotation shelf", async () => {
  let configured = { albumIds: [], durationDays: 7, mode: "sequential", expiresAt: null };
  const rotation = {
    snapshot: () => configured,
    update: (next) => { configured = { ...next, expiresAt: 123 }; return configured; },
  };

  await withServer(async (baseUrl) => {
    const updated = await fetch(`${baseUrl}/api/rotation`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumIds: ["discovery", "currents"], durationDays: 14, mode: "shuffle" }),
    });
    assert.equal(updated.status, 200);
    const body = await updated.json();
    assert.deepEqual(body.albumIds, ["discovery", "currents"]);
    assert.deepEqual(body.albums.map(({ id }) => id), ["discovery", "currents"]);

    const fetched = await (await fetch(`${baseUrl}/api/rotation`)).json();
    assert.deepEqual(fetched, body);
  }, { rotation });
});

test("drops stale album ids from a saved rotation before the client edits it", async () => {
  let configured = { albumIds: ["missing-album", "discovery"], durationDays: 7, mode: "sequential", expiresAt: 123 };
  const rotation = {
    snapshot: () => configured,
    update: (next) => { configured = { ...next, expiresAt: 456 }; return configured; },
  };

  await withServer(async (baseUrl) => {
    const saved = await (await fetch(`${baseUrl}/api/rotation`)).json();
    assert.deepEqual(saved.albumIds, ["discovery"]);
    assert.deepEqual(saved.albums.map(({ id }) => id), ["discovery"]);

    const updated = await fetch(`${baseUrl}/api/rotation`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...saved, albumIds: [...saved.albumIds, "currents"] }),
    });
    assert.equal(updated.status, 200);
  }, { rotation });
});

test("plays every track from the rotation shelf", async () => {
  let playCommand;
  const spotify = {
    status: () => ({ configured: true, connected: true, profile: { displayName: "Dylan" } }),
    getAlbumTracks: async (albumId) => [`spotify:track:${albumId}-1`, `spotify:track:${albumId}-2`],
    playTracks: async (command) => { playCommand = command; },
  };
  const rotation = {
    snapshot: () => ({ albumIds: ["discovery", "currents"], durationDays: 7, mode: "sequential", expiresAt: 123 }),
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/rotation/play`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { albumCount: 2, trackCount: 4, mode: "sequential" });
    assert.deepEqual(playCommand, {
      deviceId: "whole-house",
      trackUris: [
        "spotify:track:discovery-1", "spotify:track:discovery-2",
        "spotify:track:currents-1", "spotify:track:currents-2",
      ],
    });
  }, { spotify, rotation });
});

test("resolves and persists isolated request contexts", async () => {
  const createContext = (albumId) => {
    const album = { id: albumId, title: albumId, artist: "Artist", spotifyUri: `spotify:album:${albumId}` };
    const player = createPlayerState({
      targets: [{ id: "speaker", name: "Speaker", kind: "speaker" }],
      albums: [album],
      defaultTargetId: "speaker",
    });
    const rotation = createRotationShelf({ store: { load: () => null, save: () => {} } });
    let rotationSaves = 0;
    return {
      player,
      rotation,
      spotify: disconnectedSpotify,
      persistPlayer: async () => {},
      persistRotation: async () => { rotationSaves += 1; },
      rotationSaves: () => rotationSaves,
    };
  };
  const contexts = new Map([
    ["one", createContext("album-one")],
    ["two", createContext("album-two")],
  ]);

  await withServer(async (baseUrl) => {
    const one = await (await fetch(`${baseUrl}/api/state`, { headers: { "x-test-session": "one" } })).json();
    const two = await (await fetch(`${baseUrl}/api/state`, { headers: { "x-test-session": "two" } })).json();
    assert.equal(one.albums[0].id, "album-one");
    assert.equal(two.albums[0].id, "album-two");

    const updated = await fetch(`${baseUrl}/api/rotation`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-session": "one" },
      body: JSON.stringify({ albumIds: ["album-one"], durationDays: 7, mode: "sequential" }),
    });
    assert.equal(updated.status, 200);
    assert.equal(contexts.get("one").rotationSaves(), 1);
    assert.equal(contexts.get("two").rotationSaves(), 0);
  }, {
    contextProvider: async (request) => contexts.get(request.headers["x-test-session"]),
  });
});
