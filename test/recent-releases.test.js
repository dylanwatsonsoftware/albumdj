import test from "node:test";
import assert from "node:assert/strict";

import { selectRecentFavouriteAlbums } from "../src/recent-releases.js";

test("selects only albums released by favourite artists in the rolling last year", () => {
  const releases = selectRecentFavouriteAlbums([
    { id: "new", title: "New Album", albumType: "album", releaseDate: "2026-06-01" },
    { id: "cutoff", title: "Cutoff Album", albumType: "album", releaseDate: "2025-09-27" },
    { id: "old", title: "Old Album", albumType: "album", releaseDate: "2025-09-26" },
    { id: "single", title: "New Single", albumType: "single", releaseDate: "2026-08-01" },
    { id: "future", title: "Future Album", albumType: "album", releaseDate: "2026-10-01" },
  ], { now: new Date("2026-09-27T12:00:00Z").getTime() });

  assert.deepEqual(releases.map(({ id }) => id), ["new", "cutoff"]);
});

test("deduplicates shared releases and sorts the newest albums first", () => {
  const releases = selectRecentFavouriteAlbums([
    { id: "shared", albumType: "album", releaseDate: "2026-01-01" },
    { id: "latest", albumType: "album", releaseDate: "2026-08-01" },
    { id: "shared", albumType: "album", releaseDate: "2026-01-01" },
  ], { now: new Date("2026-09-27T12:00:00Z").getTime() });

  assert.deepEqual(releases.map(({ id }) => id), ["latest", "shared"]);
});
