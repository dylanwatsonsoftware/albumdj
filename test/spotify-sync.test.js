import test from "node:test";
import assert from "node:assert/strict";

import { refreshSpotifyOnLoad } from "../public/spotify-sync.js";

test("refreshes saved albums and devices in parallel, then reads coherent state", async () => {
  const calls = [];
  const resolvers = new Map();
  const request = (path, options) => {
    calls.push([path, options]);
    if (path === "/api/state") return Promise.resolve({ targets: [{ id: "speaker-1" }] });
    return new Promise((resolve) => resolvers.set(path, resolve));
  };

  const refresh = refreshSpotifyOnLoad({ connected: true, request });
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["/api/spotify/import", { method: "POST" }],
    ["/api/spotify/devices", { method: "POST" }],
  ]);

  resolvers.get("/api/spotify/import")({});
  resolvers.get("/api/spotify/devices")({});
  const state = await refresh;

  assert.deepEqual(calls, [
    ["/api/spotify/import", { method: "POST" }],
    ["/api/spotify/devices", { method: "POST" }],
    ["/api/state", undefined],
  ]);
  assert.deepEqual(state, { targets: [{ id: "speaker-1" }] });
});

test("leaves demo state alone when Spotify is disconnected", async () => {
  let called = false;

  const state = await refreshSpotifyOnLoad({
    connected: false,
    request: async () => { called = true; },
  });

  assert.equal(called, false);
  assert.equal(state, null);
});
