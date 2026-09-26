import test from "node:test";
import assert from "node:assert/strict";

import {
  getCoverFlowDragPosition,
  getCoverFlowWindow,
  moveCoverFlowIndex,
  settleCoverFlowDrag,
} from "../public/coverflow.js";

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

test("tracks a slow drag as a fractional position between albums", () => {
  assert.equal(getCoverFlowDragPosition({
    startIndex: 4,
    displacementX: -52.5,
    albumCount: 10,
    spacing: 105,
  }), 4.5);

  assert.equal(getCoverFlowDragPosition({
    startIndex: 0,
    displacementX: 200,
    albumCount: 10,
    spacing: 105,
  }), 0);
});

test("settles a slow drag on the nearest album", () => {
  assert.equal(settleCoverFlowDrag({
    position: 4.6,
    velocityX: 0,
    albumCount: 12,
    spacing: 105,
  }), 5);
});

test("projects a quick flick across several albums without leaving the collection", () => {
  assert.equal(settleCoverFlowDrag({
    position: 4.4,
    velocityX: -1.5,
    albumCount: 12,
    spacing: 105,
  }), 8);

  assert.equal(settleCoverFlowDrag({
    position: 10.5,
    velocityX: -3,
    albumCount: 12,
    spacing: 105,
  }), 11);
});
