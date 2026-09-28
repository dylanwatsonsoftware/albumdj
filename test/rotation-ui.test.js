import test from "node:test";
import assert from "node:assert/strict";

import {
  getRotationAlbumActions,
  getRotationPlaybackMessage,
  getRotationSlots,
  getStackTableColumns,
  removeRotationAlbum,
  toggleRotationAlbum,
} from "../public/rotation.js";

test("adds an album to a rotation without duplicating it", () => {
  assert.deepEqual(toggleRotationAlbum(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleRotationAlbum(["a", "b"], "b"), ["a"]);
});

test("removes only the requested album from the visible rotation shelf", () => {
  assert.deepEqual(removeRotationAlbum(["a", "b", "c"], "b"), ["a", "c"]);
  assert.deepEqual(removeRotationAlbum(["a", "c"], "missing"), ["a", "c"]);
});

test("turns the album stack into numbered playable changer slots", () => {
  assert.deepEqual(getRotationSlots([
    { id: "a", title: "First", artist: "Artist A" },
    { id: "b", title: "Second", artist: "Artist B" },
  ]), [
    { albumId: "a", discLabel: "Disc 01", title: "First", artist: "Artist A" },
    { albumId: "b", discLabel: "Disc 02", title: "Second", artist: "Artist B" },
  ]);
});

test("lets every loaded album be played, favourited, explored, or ejected", () => {
  assert.deepEqual(getRotationAlbumActions(), ["play", "favourite", "artist", "remove"]);
});

test("exposes the column structure for the stack albums table", () => {
  assert.deepEqual(getStackTableColumns(), [
    { key: "disc", label: "Disc" },
    { key: "album", label: "Album" },
    { key: "artist", label: "Artist" },
    { key: "actions", label: "Actions" },
  ]);
});

test("describes where a shuffled stack started and exposes playback failures", () => {
  assert.equal(getRotationPlaybackMessage({
    result: { mode: "shuffle", trackCount: 42, albumCount: 4, target: { name: "Whole House" } },
  }), "Shuffling 42 songs from 4 albums on Whole House.");
  assert.equal(
    getRotationPlaybackMessage({ error: new Error("Spotify rotation playback failed (403)") }),
    "Couldn’t play stack. Spotify rotation playback failed (403)",
  );
});
