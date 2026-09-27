const UI_CACHE_KEY = "albumdj:ui-cache";
const UI_CACHE_VERSION = 1;

export function readUiCache(storage) {
  try {
    const cached = JSON.parse(storage.getItem(UI_CACHE_KEY));
    return cached?.version === UI_CACHE_VERSION ? cached.data : null;
  } catch {
    return null;
  }
}

export function writeUiCache(storage, data) {
  try {
    storage.setItem(UI_CACHE_KEY, JSON.stringify({ version: UI_CACHE_VERSION, data }));
  } catch {
    // Storage can be unavailable in private browsing; the live app remains usable.
  }
}

export async function parseApiResponse(response) {
  if (response.status === 204) return null;

  const text = await response.text();
  let body = null;
  if (text && response.headers.get("content-type")?.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new Error(body?.error || `Album DJ server error (${response.status})`);
  }
  if (body !== null) return body;
  if (!text) return null;
  throw new Error("Album DJ received an invalid server response");
}

export function startupFailureMessage(error) {
  return `Album DJ couldn’t reach its server. ${error.message}. Refresh to try again.`;
}

export async function loadStartupPreferences(request) {
  const [rotation, favouriteArtists, favouriteAlbums] = await Promise.all([
    request("/api/rotation"),
    request("/api/favourite-artists"),
    request("/api/favourite-albums"),
  ]);
  return { rotation, favouriteArtists, favouriteAlbums };
}
