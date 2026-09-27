const UI_CACHE_KEY = "albumdj:ui-cache";
const UI_CACHE_VERSION = 1;
const ROTATION_CACHE_KEY = "albumdj:rotation-cache";

function readVersionedCache(storage, key) {
  try {
    const cached = JSON.parse(storage.getItem(key));
    return cached?.version === UI_CACHE_VERSION ? cached.data : null;
  } catch {
    return null;
  }
}

export function readUiCache(storage) {
  const cachedUi = readVersionedCache(storage, UI_CACHE_KEY);
  const cachedRotation = readVersionedCache(storage, ROTATION_CACHE_KEY);
  if (!cachedUi && !cachedRotation) return null;
  return cachedRotation ? { ...(cachedUi ?? {}), rotation: cachedRotation } : cachedUi;
}

export function writeUiCache(storage, data) {
  const versionedRotation = JSON.stringify({ version: UI_CACHE_VERSION, data: data.rotation });
  try {
    storage.setItem(ROTATION_CACHE_KEY, versionedRotation);
  } catch {
    try {
      storage.removeItem?.(UI_CACHE_KEY);
      storage.setItem(ROTATION_CACHE_KEY, versionedRotation);
    } catch {
      // Startup can still fall back to the server when browser storage is full or blocked.
    }
  }

  try {
    storage.setItem(UI_CACHE_KEY, JSON.stringify({ version: UI_CACHE_VERSION, data }));
  } catch {
    try {
      storage.setItem(UI_CACHE_KEY, JSON.stringify({
        version: UI_CACHE_VERSION,
        data: { ...data, artistAlbums: {} },
      }));
    } catch {
      // The lightweight rotation remains available even if the richer cache is too large.
    }
  }
}

export function primeCachedRotation(rotation, render) {
  if (!rotation?.albums?.length) return false;
  render();
  return true;
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
