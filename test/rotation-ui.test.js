import test from "node:test";
import assert from "node:assert/strict";

import { toggleRotationAlbum } from "../public/rotation.js";

test("adds an album to a rotation without duplicating it", () => {
  assert.deepEqual(toggleRotationAlbum(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleRotationAlbum(["a", "b"], "b"), ["a"]);
});
