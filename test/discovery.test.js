import test from "node:test";
import assert from "node:assert/strict";

import {
  artistReleaseErrorMessage,
  buildAutocompleteSuggestions,
  filterAlbums,
  getArtistInitials,
  getAlbumArtist,
  getFavouriteActionState,
  getFavouriteAlbumActionState,
  getResultActions,
  getRecentReleasesViewState,
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
  assert.deepEqual(getResultActions("album"), ["play", "artist", "favourite"]);
  assert.deepEqual(getResultActions("artist"), ["releases", "favourite"]);
});

test("resolves the artist destination carried by an album", () => {
  assert.deepEqual(
    getAlbumArtist({ artistId: "joni", artist: "Joni Mitchell" }),
    { id: "joni", name: "Joni Mitchell" },
  );
  assert.equal(getAlbumArtist({ artist: "Unknown artist" }), null);
});

test("explains artist release failures instead of leaving an empty result", () => {
  assert.equal(
    artistReleaseErrorMessage("Joni Mitchell", new Error("Spotify request failed (400)")),
    "Couldn’t load releases by Joni Mitchell. Spotify request failed (400). Try again.",
  );
});

test("keeps the recent releases section useful in every account state", () => {
  assert.deepEqual(getRecentReleasesViewState({ loading: true }), {
    message: "Checking your favourite artists…",
    showAlbums: false,
    tone: "loading",
  });
  assert.equal(getRecentReleasesViewState({ spotifyConnected: false }).message, "Connect Spotify to see new releases.");
  assert.equal(getRecentReleasesViewState({ spotifyConnected: true, favouriteArtistCount: 0 }).message, "Favourite an artist to start your release feed.");
  assert.equal(getRecentReleasesViewState({ spotifyConnected: true, favouriteArtistCount: 2, albums: [] }).message, "No full albums from your favourites in the last 12 months.");
  assert.deepEqual(getRecentReleasesViewState({ spotifyConnected: true, favouriteArtistCount: 2, albums: [{ id: "new" }] }), {
    message: "1 recent album from your favourite artists.",
    showAlbums: true,
    tone: "ready",
  });
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
