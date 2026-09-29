import test from "node:test";
import assert from "node:assert/strict";

import { buildManagedPlaylistQueue, buildRotationQueue, createRotationShelf } from "../src/rotation-shelf.js";

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
    history: [
      { albumId: "a", album: null, firstAddedAt: 1_000, lastAddedAt: 1_000, lastRemovedAt: null, currentAddedAt: 1_000, totalDurationMs: 0, lastDurationMs: null, timesAdded: 1 },
      { albumId: "b", album: null, firstAddedAt: 1_000, lastAddedAt: 1_000, lastRemovedAt: null, currentAddedAt: 1_000, totalDurationMs: 0, lastDurationMs: null, timesAdded: 1 },
    ],
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

  const expired = shelf.snapshot();
  assert.deepEqual(expired.albumIds, []);
  assert.equal(expired.expiresAt, null);
  assert.equal(expired.history[0].albumId, "a");
  assert.equal(expired.history[0].currentAddedAt, null);
  assert.deepEqual(saved, expired);
});

test("records how often and how long albums have been in the stack", () => {
  let currentTime = 1_000;
  const shelf = createRotationShelf({
    store: { load: () => null, save: () => {} },
    now: () => currentTime,
  });
  const album = { id: "blue", title: "Blue", artist: "Joni Mitchell", releaseDate: "1971-06-22" };

  shelf.update({ albumIds: ["blue"], durationDays: 7, mode: "sequential", albums: [album] });
  currentTime = 6_000;
  shelf.update({ albumIds: [], durationDays: 7, mode: "sequential", albums: [album] });
  currentTime = 10_000;
  const rotation = shelf.update({ albumIds: ["blue"], durationDays: 14, mode: "shuffle", albums: [album] });

  assert.deepEqual(rotation.history, [{
    albumId: "blue",
    album,
    firstAddedAt: 1_000,
    lastAddedAt: 10_000,
    lastRemovedAt: 6_000,
    currentAddedAt: 10_000,
    totalDurationMs: 5_000,
    lastDurationMs: 5_000,
    timesAdded: 2,
  }]);
});

test("closes active history entries when a stack expires", () => {
  let currentTime = 1_000;
  const shelf = createRotationShelf({ store: { load: () => null, save: () => {} }, now: () => currentTime });
  shelf.update({
    albumIds: ["blue"],
    durationDays: 7,
    mode: "sequential",
    albums: [{ id: "blue", title: "Blue", artist: "Joni Mitchell" }],
  });
  const expiresAt = shelf.snapshot().expiresAt;
  currentTime = expiresAt + 1;

  const expired = shelf.snapshot();

  assert.deepEqual(expired.albumIds, []);
  assert.equal(expired.history[0].currentAddedAt, null);
  assert.equal(expired.history[0].lastRemovedAt, expiresAt);
  assert.equal(expired.history[0].totalDurationMs, expiresAt - 1_000);
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

test("keeps the managed Spotify playlist in album and track order", () => {
  const queue = buildManagedPlaylistQueue({
    albumIds: ["b", "a"],
    tracksByAlbum: new Map([
      ["a", ["a-disc-1-track-1", "a-disc-1-track-2"]],
      ["b", ["b-disc-1-track-1", "b-disc-1-track-2"]],
    ]),
  });

  assert.deepEqual(queue, [
    "b-disc-1-track-1",
    "b-disc-1-track-2",
    "a-disc-1-track-1",
    "a-disc-1-track-2",
  ]);
});

test("shuffles every track while moving between albums whenever possible", () => {
  const queue = buildRotationQueue({
    albumIds: ["a", "b"],
    tracksByAlbum: new Map([
      ["a", ["a1", "a2", "a3"]],
      ["b", ["b1", "b2", "b3"]],
    ]),
    mode: "shuffle",
    random: () => 0,
  });

  assert.deepEqual([...queue].sort(), ["a1", "a2", "a3", "b1", "b2", "b3"]);
  assert.equal(queue.every((track, index) => index === 0 || track[0] !== queue[index - 1][0]), true);
});
