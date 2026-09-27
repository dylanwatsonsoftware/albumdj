import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutocompleteSuggestions,
  filterAlbums,
  getArtistInitials,
  getFavouriteActionState,
  getFavouriteAlbumActionState,
  getResultActions,
  moveSuggestionIndex,
  removeFavouriteArtist,
  removeFavouriteAlbum,
  shouldRequestAutocomplete,
  toggleFavouriteArtist,
  toggleFavouriteAlbum,
} from "../public/discovery.js";

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

test("builds clearly typed album and artist autocomplete suggestions", () => {
  const suggestions = buildAutocompleteSuggestions({
    albums: [{ id: "blue", title: "Blue", artist: "Joni Mitchell" }],
    artists: [{ id: "joni", name: "Joni Mitchell" }],
  });

  assert.deepEqual(suggestions.map(({ type, primary, secondary }) => ({ type, primary, secondary })), [
    { type: "album", primary: "Blue", secondary: "Album · Joni Mitchell" },
    { type: "artist", primary: "Joni Mitchell", secondary: "Artist" },
  ]);
});

test("only autocompletes meaningful queries", () => {
  assert.equal(shouldRequestAutocomplete("j"), false);
  assert.equal(shouldRequestAutocomplete("  jo  "), true);
});

test("moves through autocomplete suggestions without leaving the list", () => {
  assert.equal(moveSuggestionIndex(-1, 1, 3), 0);
  assert.equal(moveSuggestionIndex(2, 1, 3), 0);
  assert.equal(moveSuggestionIndex(0, -1, 3), 2);
});

test("album results can play or be favourited while artist results expose releases", () => {
  assert.deepEqual(getResultActions("album"), ["play", "favourite"]);
  assert.deepEqual(getResultActions("artist"), ["releases", "favourite"]);
});

test("adds, recognises, and explicitly removes a favourite album", () => {
  const blue = { id: "blue", title: "Blue", artist: "Joni Mitchell" };
  assert.deepEqual(toggleFavouriteAlbum([], blue), [blue]);
  assert.deepEqual(toggleFavouriteAlbum([blue], blue), []);
  assert.deepEqual(removeFavouriteAlbum([blue], "blue"), []);
  assert.deepEqual(getFavouriteAlbumActionState([], blue), {
    isFavourite: false,
    label: "☆ Favourite album",
    canAdd: true,
  });
  assert.deepEqual(getFavouriteAlbumActionState([blue], blue), {
    isFavourite: true,
    label: "★ Favourited",
    canAdd: false,
  });
});

test("removes a favourite explicitly without toggling a missing artist back in", () => {
  const joni = { id: "joni", name: "Joni Mitchell" };
  assert.deepEqual(removeFavouriteArtist([joni], "joni"), []);
  assert.deepEqual(removeFavouriteArtist([], "joni"), []);
});

test("treats an existing favourite as a status instead of a destructive toggle", () => {
  const joni = { id: "joni", name: "Joni Mitchell" };
  assert.deepEqual(getFavouriteActionState([], joni), { isFavourite: false, label: "☆ Favourite artist", canAdd: true });
  assert.deepEqual(getFavouriteActionState([joni], joni), { isFavourite: true, label: "★ Favourited", canAdd: false });
});

test("creates compact fallback initials for artist cards", () => {
  assert.equal(getArtistInitials("Joni Mitchell"), "JM");
  assert.equal(getArtistInitials("Björk"), "B");
});
