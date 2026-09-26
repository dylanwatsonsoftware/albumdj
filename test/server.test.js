import test from "node:test";
import assert from "node:assert/strict";

import { createPrototypeServer } from "../src/server.js";

const disconnectedSpotify = {
  status: () => ({ configured: false, connected: false, profile: null }),
};

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
    assert.match(html, /Choose where to listen/);
    assert.match(html, /Pretend to scan a card/);
    assert.match(html, /Connect Spotify/);
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
