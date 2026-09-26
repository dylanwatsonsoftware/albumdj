import test from "node:test";
import assert from "node:assert/strict";

import { getCoverFlowWindow, moveCoverFlowIndex } from "../public/coverflow.js";

test("moves the focused cover without leaving the album collection", () => {
  assert.equal(moveCoverFlowIndex(1, 1, 4), 2);
  assert.equal(moveCoverFlowIndex(0, -1, 4), 0);
  assert.equal(moveCoverFlowIndex(3, 1, 4), 3);
});

test("returns the focused cover and its nearby albums", () => {
  const albums = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));

  assert.deepEqual(getCoverFlowWindow(albums, 3, 2), [
    { album: { id: "b" }, index: 1, offset: -2 },
    { album: { id: "c" }, index: 2, offset: -1 },
    { album: { id: "d" }, index: 3, offset: 0 },
    { album: { id: "e" }, index: 4, offset: 1 },
    { album: { id: "f" }, index: 5, offset: 2 },
  ]);
});

test("keeps the first album centred at the start of the collection", () => {
  const albums = ["a", "b", "c"].map((id) => ({ id }));

  assert.deepEqual(getCoverFlowWindow(albums, 0, 2), [
    { album: { id: "a" }, index: 0, offset: 0 },
    { album: { id: "b" }, index: 1, offset: 1 },
    { album: { id: "c" }, index: 2, offset: 2 },
  ]);
});
