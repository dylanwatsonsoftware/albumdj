export function toggleRotationAlbum(albumIds, albumId) {
  return albumIds.includes(albumId)
    ? albumIds.filter((id) => id !== albumId)
    : [...albumIds, albumId];
}

export function removeRotationAlbum(albumIds, albumId) {
  return albumIds.filter((id) => id !== albumId);
}

export function getRotationSlots(albums) {
  return albums.map((album, index) => ({
    albumId: album.id,
    discLabel: `Disc ${String(index + 1).padStart(2, "0")}`,
    title: album.title,
    artist: album.artist,
  }));
}

export function getRotationAlbumActions() {
  return ["play", "favourite", "artist", "remove"];
}
