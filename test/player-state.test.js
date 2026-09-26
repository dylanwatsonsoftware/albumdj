import test from "node:test";
import assert from "node:assert/strict";

import { createPlayerState } from "../src/player-state.js";

const targets = [
  { id: "kitchen", name: "Kitchen", kind: "speaker" },
  { id: "whole-house", name: "Whole House", kind: "group" },
];

const albums = [
  { id: "discovery", title: "Discovery", artist: "Daft Punk", spotifyUri: "spotify:album:demo1" },
  { id: "currents", title: "Currents", artist: "Tame Impala", spotifyUri: "spotify:album:demo2" },
];

test("starts with the configured default playback target", () => {
  const state = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });

  assert.equal(state.snapshot().selectedTargetId, "whole-house");
});

test("selects a different playback target", () => {
  const state = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });

  state.selectTarget("kitchen");

  assert.equal(state.snapshot().selectedTargetId, "kitchen");
});

test("a simulated card scan records the album and selected target", () => {
  const state = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });

  const playback = state.scanAlbum("discovery");

  assert.equal(playback.album.spotifyUri, "spotify:album:demo1");
  assert.equal(playback.target.id, "whole-house");
  assert.equal(playback.mode, "simulated");
  assert.deepEqual(state.snapshot().lastPlayback, playback);
});

test("rejects unknown albums and playback targets", () => {
  const state = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });

  assert.throws(() => state.selectTarget("garage"), /Unknown target/);
  assert.throws(() => state.scanAlbum("missing"), /Unknown album/);
});

test("replaces demo albums with imported Spotify albums", () => {
  const state = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });
  const importedAlbums = [{
    id: "spotify-favourite",
    title: "A Saved Album",
    artist: "A Saved Artist",
    spotifyUri: "spotify:album:saved",
    imageUrl: "https://image.test/saved.jpg",
  }];

  state.replaceAlbums(importedAlbums);

  assert.deepEqual(state.snapshot().albums, importedAlbums);
  assert.equal(state.scanAlbum("spotify-favourite").album.spotifyUri, "spotify:album:saved");
  assert.throws(() => state.scanAlbum("discovery"), /Unknown album/);
});

test("replaces demo targets with available Spotify devices and selects the active one", () => {
  const state = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });
  const devices = [
    { id: "web-player", name: "Spotify Web Player", kind: "computer", isActive: false },
    { id: "macbook", name: "Dylan's MacBook", kind: "computer", isActive: true },
  ];

  state.replaceTargets(devices);

  assert.deepEqual(state.snapshot().targets, devices);
  assert.equal(state.snapshot().selectedTargetId, "macbook");
  assert.equal(state.scanAlbum("discovery").target.id, "macbook");
});
