export async function refreshSpotifyOnLoad({ connected, request }) {
  if (!connected) return null;
  await Promise.all([
    request("/api/spotify/import", { method: "POST" }),
    request("/api/spotify/devices", { method: "POST" }),
  ]);
  return request("/api/state");
}
