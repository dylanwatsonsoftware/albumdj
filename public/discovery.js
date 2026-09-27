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
