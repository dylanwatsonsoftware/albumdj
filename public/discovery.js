export function filterAlbums(albums, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return albums;
  return albums.filter((album) => `${album.title} ${album.artist}`.toLocaleLowerCase().includes(needle));
}

export function toggleFavouriteArtist(artists, artist) {
  return artists.some(({ id }) => id === artist.id)
    ? artists.filter(({ id }) => id !== artist.id)
    : [...artists, artist];
}

export function removeFavouriteArtist(artists, artistId) {
  return artists.filter(({ id }) => id !== artistId);
}

export function getFavouriteActionState(artists, artist) {
  const isFavourite = artists.some(({ id }) => id === artist.id);
  return {
    isFavourite,
    label: isFavourite ? "★ Favourited" : "☆ Favourite artist",
    canAdd: !isFavourite,
  };
}

export function getArtistInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => [...part][0] ?? "").join("").toLocaleUpperCase();
}

export function shouldRequestAutocomplete(query) {
  return query.trim().length >= 2;
}

export function buildAutocompleteSuggestions({ albums = [], artists = [] }, maxPerType = 4) {
  return [
    ...albums.slice(0, maxPerType).map((album) => ({
      key: `album:${album.id}`,
      type: "album",
      primary: album.title,
      secondary: `Album · ${album.artist}`,
      item: album,
    })),
    ...artists.slice(0, maxPerType).map((artist) => ({
      key: `artist:${artist.id}`,
      type: "artist",
      primary: artist.name,
      secondary: "Artist",
      item: artist,
    })),
  ];
}

export function moveSuggestionIndex(currentIndex, delta, suggestionCount) {
  if (!suggestionCount) return -1;
  return (currentIndex + delta + suggestionCount) % suggestionCount;
}

export function getResultActions(resultType) {
  return resultType === "artist" ? ["releases", "favourite"] : ["play"];
}
