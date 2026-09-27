export async function refreshSpotifyOnLoad({ connected, refreshAlbums = true, request }) {
  if (!connected) return null;
  const refreshes = [];
  if (refreshAlbums) {
    refreshes.push(request("/api/spotify/import", { method: "POST" }));
  }
  refreshes.push(request("/api/spotify/devices", { method: "POST" }));
  await Promise.all(refreshes);
  return request("/api/state");
}
