import test from "node:test";
import assert from "node:assert/strict";

import { removeRotationAlbum, toggleRotationAlbum } from "../public/rotation.js";

test("adds an album to a rotation without duplicating it", () => {
  assert.deepEqual(toggleRotationAlbum(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleRotationAlbum(["a", "b"], "b"), ["a"]);
});

test("removes only the requested album from the visible rotation shelf", () => {
  assert.deepEqual(removeRotationAlbum(["a", "b", "c"], "b"), ["a", "c"]);
  assert.deepEqual(removeRotationAlbum(["a", "c"], "missing"), ["a", "c"]);
});
