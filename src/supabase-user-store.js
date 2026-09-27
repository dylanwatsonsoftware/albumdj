const TABLES = {
  spotifySession: "physical_favourites_spotify_sessions",
  playerState: "physical_favourites_player_states",
  rotation: "physical_favourites_rotations",
};

export function createSupabaseUserStore({ url, serviceRoleKey, fetchImpl = fetch }) {
  if (!url || !serviceRoleKey) throw new Error("Supabase is not configured");
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1`;
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };

  async function request(table, path, options = {}) {
    const response = await fetchImpl(`${endpoint}/${table}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    if (!response.ok) throw new Error(`Supabase user storage failed (${response.status})`);
    if (response.status === 204) return null;
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  async function loadField(table, sessionId) {
    const rows = await request(table, `?session_id=eq.${encodeURIComponent(sessionId)}&select=session_id,state`);
    return rows[0]?.state ?? null;
  }

  async function saveField(table, sessionId, value) {
    await request(table, "?on_conflict=session_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ session_id: sessionId, state: value }),
    });
  }

  return {
    async load(sessionId) {
      const [spotifySession, playerState, rotation] = await Promise.all([
        loadField(TABLES.spotifySession, sessionId),
        loadField(TABLES.playerState, sessionId),
        loadField(TABLES.rotation, sessionId),
      ]);
      if (!spotifySession && !playerState && !rotation) return null;
      return { sessionId, spotifySession, playerState, rotation };
    },
    saveSpotifySession: (sessionId, value) => saveField(TABLES.spotifySession, sessionId, value),
    savePlayerState: (sessionId, value) => saveField(TABLES.playerState, sessionId, value),
    saveRotation: (sessionId, value) => saveField(TABLES.rotation, sessionId, value),
  };
}
