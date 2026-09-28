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

export function getStackTableColumns() {
  return [
    { key: "disc", label: "Disc" },
    { key: "album", label: "Album" },
    { key: "artist", label: "Artist" },
    { key: "actions", label: "Actions" },
  ];
}

export function getRotationPlaybackMessage({ result, error } = {}) {
  if (error) return `Couldn’t play stack. ${error.message}`;
  if (!result) return "Starting your stack on Spotify…";
  const action = result.mode === "shuffle" ? "Shuffling" : "Playing";
  return `${action} ${result.trackCount} songs from ${result.albumCount} albums on ${result.target.name}.`;
}
