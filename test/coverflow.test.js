import test from "node:test";
import assert from "node:assert/strict";

import {
  createCoverFlowReleaseScheduler,
  createCoverFlowFrameScheduler,
  getCoverFlowDragPosition,
  getCoverFlowHost,
  getCoverFlowTransform,
  getCoverFlowWindow,
  moveCoverFlowIndex,
  shouldRebuildCoverFlowWindow,
  settleCoverFlowDrag,
} from "../public/coverflow.js";

test("fans three covers out on each side without turning distant covers backwards", () => {
  assert.deepEqual(getCoverFlowTransform(0), {
    x: 0, z: 0, turn: 0, scale: 1, opacity: 1, order: 100,
  });
  assert.deepEqual(getCoverFlowTransform(-1), {
    x: -150, z: -120, turn: 62, scale: 0.9, opacity: 0.86, order: 90,
  });
  assert.deepEqual(getCoverFlowTransform(1), {
    x: 150, z: -120, turn: -62, scale: 0.9, opacity: 0.86, order: 90,
  });
  assert.deepEqual(getCoverFlowTransform(3), {
    x: 260, z: -156, turn: -62, scale: 0.85, opacity: 0.58, order: 70,
  });
});

test("moves continuously between the centre and side positions while dragging", () => {
  assert.deepEqual(getCoverFlowTransform(0.5), {
    x: 75, z: -60, turn: -31, scale: 0.95, opacity: 0.93, order: 95,
  });
  assert.deepEqual(getCoverFlowTransform(-0.5), {
    x: -75, z: -60, turn: 31, scale: 0.95, opacity: 0.93, order: 95,
  });
});

test("keeps the third side cover visible in a compact phone stage", () => {
  assert.equal(getCoverFlowTransform(3, { centreGap: 105, sideSpacing: 34 }).x, 173);
  assert.equal(getCoverFlowTransform(-3, { centreGap: 105, sideSpacing: 34 }).x, -173);
});

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

test("places the shared cover flow on the stack page only while that page is active", () => {
  assert.equal(getCoverFlowHost("stack"), "stack");
  assert.equal(getCoverFlowHost("home"), "home");
  assert.equal(getCoverFlowHost("library"), "home");
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

test("coalesces rapid pointer movement into one render per animation frame", () => {
  const frames = [];
  const renders = [];
  const schedule = createCoverFlowFrameScheduler({
    requestFrame: (callback) => frames.push(callback),
    render: (position) => renders.push(position),
  });

  schedule(1.1);
  schedule(1.2);
  schedule(1.3);
  assert.equal(frames.length, 1);
  assert.deepEqual(renders, []);

  frames.shift()();
  assert.deepEqual(renders, [1.3]);
});

test("waits a frame before settling a released cover so its transform can animate", () => {
  const frames = [];
  const settles = [];
  const schedule = createCoverFlowReleaseScheduler({
    requestFrame: (callback) => frames.push(callback),
    settle: () => settles.push("settled"),
  });

  schedule();
  assert.equal(frames.length, 1);
  assert.deepEqual(settles, []);

  frames.shift()();
  assert.deepEqual(settles, ["settled"]);
});

test("cancels a pending settle when a new cover drag starts", () => {
  const frames = [];
  let settleCount = 0;
  const schedule = createCoverFlowReleaseScheduler({
    requestFrame: (callback) => frames.push(callback),
    settle: () => { settleCount += 1; },
  });

  schedule();
  schedule.cancel();
  frames.shift()();

  assert.equal(settleCount, 0);
});

test("reuses visible covers until dragging reaches the edge of their window", () => {
  assert.equal(shouldRebuildCoverFlowWindow({
    renderedIndexes: [0, 1, 2, 3, 4],
    focusedIndex: 2,
    albumCount: 113,
  }), false);
  assert.equal(shouldRebuildCoverFlowWindow({
    renderedIndexes: [0, 1, 2, 3, 4],
    focusedIndex: 3,
    albumCount: 113,
  }), true);
  assert.equal(shouldRebuildCoverFlowWindow({
    renderedIndexes: [108, 109, 110, 111, 112],
    focusedIndex: 110,
    albumCount: 113,
  }), false);
});
