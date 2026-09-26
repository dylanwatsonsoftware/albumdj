import test from "node:test";
import assert from "node:assert/strict";

import { refreshSpotifyOnLoad } from "../public/spotify-sync.js";

test("refreshes saved albums and devices when Spotify is connected", async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push([path, options]);
    return path === "/api/spotify/devices" ? { targets: [{ id: "speaker-1" }] } : {};
  };

  const state = await refreshSpotifyOnLoad({ connected: true, request });

  assert.deepEqual(calls, [
    ["/api/spotify/import", { method: "POST" }],
    ["/api/spotify/devices", { method: "POST" }],
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
