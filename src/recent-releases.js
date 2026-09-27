export function selectRecentFavouriteAlbums(albums, { now = Date.now() } = {}) {
  const current = new Date(now);
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const currentDate = current.toISOString().slice(0, 10);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const unique = new Map();

  for (const album of albums) {
    if (album.albumType !== "album" || !album.releaseDate) continue;
    if (album.releaseDate < cutoffDate || album.releaseDate > currentDate) continue;
    unique.set(album.id, album);
  }

  return [...unique.values()].sort(
    (left, right) => right.releaseDate.localeCompare(left.releaseDate),
  );
}
