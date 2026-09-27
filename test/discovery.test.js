import test from "node:test";
import assert from "node:assert/strict";

import { filterAlbums, toggleFavouriteArtist } from "../public/discovery.js";

const albums = [
  { id: "blue", title: "Blue", artist: "Joni Mitchell" },
  { id: "hejira", title: "Hejira", artist: "Joni Mitchell" },
  { id: "discovery", title: "Discovery", artist: "Daft Punk" },
];

test("filters saved albums by title or artist without case sensitivity", () => {
  assert.deepEqual(filterAlbums(albums, "JONI").map(({ id }) => id), ["blue", "hejira"]);
  assert.deepEqual(filterAlbums(albums, "covery").map(({ id }) => id), ["discovery"]);
  assert.deepEqual(filterAlbums(albums, "  "), albums);
});

test("adds and removes a favourite artist without duplicates", () => {
  const joni = { id: "joni", name: "Joni Mitchell", imageUrl: null, spotifyUrl: "https://open.spotify.com/artist/joni" };
  assert.deepEqual(toggleFavouriteArtist([], joni), [joni]);
  assert.deepEqual(toggleFavouriteArtist([joni], joni), []);
});
