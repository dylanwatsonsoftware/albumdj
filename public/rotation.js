export function toggleRotationAlbum(albumIds, albumId) {
  return albumIds.includes(albumId)
    ? albumIds.filter((id) => id !== albumId)
    : [...albumIds, albumId];
}
