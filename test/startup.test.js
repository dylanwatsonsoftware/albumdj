import test from "node:test";
import assert from "node:assert/strict";

import {
  loadStartupPreferences,
  parseApiResponse,
  readUiCache,
  startupFailureMessage,
  writeUiCache,
} from "../public/startup.js";

test("reports a useful error when Vercel returns a plain-text server failure", async () => {
  const response = new Response("A server error has occurred", {
    status: 500,
    headers: { "content-type": "text/plain" },
  });

  await assert.rejects(parseApiResponse(response), /Album DJ server error \(500\)/);
});

test("turns a startup exception into a visible retry message", () => {
  assert.equal(
    startupFailureMessage(new Error("Album DJ server error (500)")),
    "Album DJ couldn’t reach its server. Album DJ server error (500). Refresh to try again.",
  );
});

test("loads independent account preferences concurrently", async () => {
  const calls = [];
  const resolvers = new Map();
  const request = (path) => {
    calls.push(path);
    return new Promise((resolve) => resolvers.set(path, resolve));
  };

  const loading = loadStartupPreferences(request);
  assert.deepEqual(calls, [
    "/api/rotation",
    "/api/favourite-artists",
    "/api/favourite-albums",
  ]);

  resolvers.get("/api/rotation")({ albumIds: ["album-1"] });
  resolvers.get("/api/favourite-artists")([{ id: "artist-1" }]);
  resolvers.get("/api/favourite-albums")([{ id: "album-1" }]);

  assert.deepEqual(await loading, {
    rotation: { albumIds: ["album-1"] },
    favouriteArtists: [{ id: "artist-1" }],
    favouriteAlbums: [{ id: "album-1" }],
  });
});

test("persists safe UI data for an immediate reload without storing Spotify credentials", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const snapshot = {
    state: { albums: [{ id: "blue" }], targets: [{ id: "speaker" }] },
    rotation: { albumIds: ["blue"] },
    favouriteArtists: [{ id: "joni" }],
    favouriteAlbums: [{ id: "blue" }],
    recentFavouriteAlbums: [{ id: "new" }],
    artistAlbums: { joni: [{ id: "blue" }] },
  };

  writeUiCache(storage, snapshot);

  assert.deepEqual(readUiCache(storage), snapshot);
  assert.doesNotMatch([...values.values()].join(""), /accessToken|refreshToken/);
});

test("ignores an invalid or outdated UI cache", () => {
  assert.equal(readUiCache({ getItem: () => "not json" }), null);
  assert.equal(readUiCache({ getItem: () => JSON.stringify({ version: 0, data: {} }) }), null);
});
