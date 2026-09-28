export function spotifyOpenUrl(playback) {
  if (playback?.mode !== "spotify-open") return null;
  return playback.openUrl || null;
}
