export async function refreshSpotifyOnLoad({ connected, request }) {
  if (!connected) return null;
  await request("/api/spotify/import", { method: "POST" });
  return request("/api/spotify/devices", { method: "POST" });
}
