import test from "node:test";
import assert from "node:assert/strict";

import { buildRotationQueue, createRotationShelf } from "../src/rotation-shelf.js";

test("persists a temporary album rotation for one or two weeks", () => {
  let saved;
  const shelf = createRotationShelf({
    store: { load: () => null, save: (value) => { saved = structuredClone(value); } },
    now: () => 1_000,
  });

  const rotation = shelf.update({ albumIds: ["a", "b", "a"], durationDays: 14, mode: "sequential" });

  assert.deepEqual(rotation, {
    albumIds: ["a", "b"],
    durationDays: 14,
    mode: "sequential",
    expiresAt: 1_209_601_000,
  });
  assert.deepEqual(saved, rotation);
});

test("clears an expired rotation", () => {
  let saved;
  const shelf = createRotationShelf({
    store: {
      load: () => ({ albumIds: ["a"], durationDays: 7, mode: "shuffle", expiresAt: 999 }),
      save: (value) => { saved = value; },
    },
    now: () => 1_000,
  });

  assert.deepEqual(shelf.snapshot(), {
    albumIds: [], durationDays: 7, mode: "sequential", expiresAt: null,
  });
  assert.deepEqual(saved, {
    albumIds: [], durationDays: 7, mode: "sequential", expiresAt: null,
  });
});

test("builds album-by-album playback in the selected order", () => {
  const queue = buildRotationQueue({
    albumIds: ["b", "a"],
    tracksByAlbum: new Map([
      ["a", ["a1", "a2"]],
      ["b", ["b1", "b2"]],
    ]),
    mode: "sequential",
  });

  assert.deepEqual(queue, ["b1", "b2", "a1", "a2"]);
});

test("shuffles every track across the selected albums", () => {
  const randomValues = [0, 0.5, 0];
  const queue = buildRotationQueue({
    albumIds: ["a", "b"],
    tracksByAlbum: new Map([
      ["a", ["a1", "a2"]],
      ["b", ["b1", "b2"]],
    ]),
    mode: "shuffle",
    random: () => randomValues.shift(),
  });

  assert.deepEqual(queue, ["b1", "b2", "a2", "a1"]);
});
