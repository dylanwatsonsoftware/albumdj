export function filterAlbums(albums, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return albums;
  return albums.filter((album) => `${album.title} ${album.artist}`.toLocaleLowerCase().includes(needle));
}

export function filterSavedMusic({ albums = [], artists = [] }, query, kind = "all") {
  const needle = query.trim().toLocaleLowerCase();
  const includeArtists = kind === "all" || kind === "artists";
  const includeAlbums = kind === "all" || kind === "albums";
  return {
    artists: includeArtists
      ? artists.filter((artist) => !needle || artist.name.toLocaleLowerCase().includes(needle))
      : [],
    albums: includeAlbums
      ? albums.filter((album) => !needle || `${album.title} ${album.artist}`.toLocaleLowerCase().includes(needle))
      : [],
  };
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

export function toggleFavouriteAlbum(albums, album) {
  return albums.some(({ id }) => id === album.id)
    ? albums.filter(({ id }) => id !== album.id)
    : [...albums, album];
}

export function removeFavouriteAlbum(albums, albumId) {
  return albums.filter(({ id }) => id !== albumId);
}

export function getFavouriteAlbumActionState(albums, album) {
  const isFavourite = albums.some(({ id }) => id === album.id);
  return {
    isFavourite,
    label: isFavourite ? "★ Favourited" : "☆ Favourite album",
    canAdd: !isFavourite,
  };
}

export function getFavouriteAlbumCardActions() {
  return ["play", "rotation", "artist", "remove"];
}

export function getArtistInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => [...part][0] ?? "").join("").toLocaleUpperCase();
}

export function getAlbumArtist(album) {
  if (!album?.artistId) return null;
  return { id: album.artistId, name: album.artist || "Artist" };
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
  return resultType === "artist" ? ["releases", "favourite"] : ["play", "rotation", "artist", "favourite"];
}

export function artistReleaseErrorMessage(artistName, error) {
  return `Couldn’t load releases by ${artistName}. ${error.message}. Try again.`;
}

export function getRecentReleasesViewState({
  loading = false,
  spotifyConnected = false,
  favouriteArtistCount = 0,
  albums = [],
  error = null,
} = {}) {
  if (loading) return { message: "Checking your favourite artists…", showAlbums: false, tone: "loading" };
  if (!spotifyConnected) return { message: "Connect Spotify to see new releases.", showAlbums: false, tone: "empty" };
  if (!favouriteArtistCount) return { message: "Favourite an artist to start your release feed.", showAlbums: false, tone: "empty" };
  if (error) return { message: `Couldn’t refresh releases. ${error.message}. Try again.`, showAlbums: false, tone: "error" };
  if (!albums.length) return { message: "No full albums from your favourites in the last 12 months.", showAlbums: false, tone: "empty" };
  return {
    message: `${albums.length} recent album${albums.length === 1 ? "" : "s"} from your favourite artists.`,
    showAlbums: true,
    tone: "ready",
  };
}
