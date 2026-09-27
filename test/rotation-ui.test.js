import test from "node:test";
import assert from "node:assert/strict";

import {
  getRotationAlbumActions,
  getRotationSlots,
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
