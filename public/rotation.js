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
  if (!result) return "Updating your Album DJ playlist…";
  return `Opening ${result.trackCount} songs from ${result.albumCount} albums in Spotify.`;
}

export function getStackPlaylistOpenUrl(rotation, result) {
  return rotation?.spotifyPlaylist?.openUrl ?? result?.openUrl ?? null;
}
