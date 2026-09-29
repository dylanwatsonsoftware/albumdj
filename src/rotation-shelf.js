const DAY_MS = 24 * 60 * 60 * 1000;
const emptyRotation = (history = []) => ({
  albumIds: [],
  durationDays: 7,
  mode: "sequential",
  expiresAt: null,
  history,
});

function normalizeRotation(value) {
  if (!value) return emptyRotation();
  const albumIds = [...new Set(value.albumIds ?? [])];
  const inferredAddedAt = value.expiresAt
    ? value.expiresAt - (value.durationDays ?? 7) * DAY_MS
    : null;
  const history = Array.isArray(value.history) ? structuredClone(value.history) : [];
  const known = new Set(history.map(({ albumId }) => albumId));
  for (const albumId of albumIds) {
    if (known.has(albumId)) continue;
    history.push({
      albumId,
      album: null,
      firstAddedAt: inferredAddedAt,
      lastAddedAt: inferredAddedAt,
      lastRemovedAt: null,
      currentAddedAt: inferredAddedAt,
      totalDurationMs: 0,
      lastDurationMs: null,
      timesAdded: 1,
    });
  }
  return {
    albumIds,
    durationDays: value.durationDays ?? 7,
    mode: value.mode ?? "sequential",
    expiresAt: value.expiresAt ?? null,
    history,
  };
}

function closeHistoryEntry(entry, removedAt) {
  if (entry.currentAddedAt === null || entry.currentAddedAt === undefined) return entry;
  const duration = Math.max(0, removedAt - entry.currentAddedAt);
  return {
    ...entry,
    currentAddedAt: null,
    lastRemovedAt: removedAt,
    lastDurationMs: duration,
    totalDurationMs: (entry.totalDurationMs ?? 0) + duration,
  };
}

export function createRotationShelf({ store, now = Date.now }) {
  let rotation = normalizeRotation(store.load());

  function snapshot() {
    if (rotation.expiresAt !== null && rotation.expiresAt <= now()) {
      const history = rotation.history.map((entry) => closeHistoryEntry(entry, rotation.expiresAt));
      rotation = emptyRotation(history);
      store.save(rotation);
    }
    return structuredClone(rotation);
  }

  return {
    snapshot,

    update({ albumIds, durationDays, mode, albums = [] }) {
      if (![7, 14].includes(durationDays)) throw new Error("Rotation duration must be 7 or 14 days");
      if (!["sequential", "shuffle"].includes(mode)) throw new Error("Unknown rotation mode");
      snapshot();
      const changedAt = now();
      const uniqueAlbumIds = [...new Set(albumIds)];
      const previousIds = new Set(rotation.albumIds);
      const nextIds = new Set(uniqueAlbumIds);
      const albumById = new Map(albums.map((album) => [album.id, structuredClone(album)]));
      const historyById = new Map(rotation.history.map((entry) => [entry.albumId, entry]));

      for (const albumId of previousIds) {
        if (!nextIds.has(albumId)) historyById.set(albumId, closeHistoryEntry(historyById.get(albumId), changedAt));
      }
      for (const albumId of uniqueAlbumIds) {
        const existing = historyById.get(albumId);
        const album = albumById.get(albumId) ?? existing?.album ?? null;
        if (previousIds.has(albumId) && existing) {
          historyById.set(albumId, { ...existing, album });
          continue;
        }
        historyById.set(albumId, {
          albumId,
          album,
          firstAddedAt: existing?.firstAddedAt ?? changedAt,
          lastAddedAt: changedAt,
          lastRemovedAt: existing?.lastRemovedAt ?? null,
          currentAddedAt: changedAt,
          totalDurationMs: existing?.totalDurationMs ?? 0,
          lastDurationMs: existing?.lastDurationMs ?? null,
          timesAdded: (existing?.timesAdded ?? 0) + 1,
        });
      }
      rotation = {
        albumIds: uniqueAlbumIds,
        durationDays,
        mode,
        expiresAt: uniqueAlbumIds.length ? now() + durationDays * DAY_MS : null,
        history: [...historyById.values()],
      };
      store.save(rotation);
      return snapshot();
    },
  };
}

export function buildRotationQueue({ albumIds, tracksByAlbum, mode, random = Math.random }) {
  const queue = albumIds.flatMap((albumId) => tracksByAlbum.get(albumId) ?? []);
  if (mode !== "shuffle") return queue;

  const pools = albumIds.map((albumId) => ({
    albumId,
    tracks: [...(tracksByAlbum.get(albumId) ?? [])],
  })).filter(({ tracks }) => tracks.length);
  for (const { tracks } of pools) {
    for (let index = tracks.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [tracks[index], tracks[swapIndex]] = [tracks[swapIndex], tracks[index]];
    }
  }

  const shuffled = [];
  let previousAlbumId = null;
  while (pools.some(({ tracks }) => tracks.length)) {
    const available = pools.filter(({ tracks }) => tracks.length);
    const differentAlbums = available.filter(({ albumId }) => albumId !== previousAlbumId);
    const candidates = differentAlbums.length ? differentAlbums : available;
    const mostTracks = Math.max(...candidates.map(({ tracks }) => tracks.length));
    const balancedCandidates = candidates.filter(({ tracks }) => tracks.length === mostTracks);
    const selected = balancedCandidates[Math.floor(random() * balancedCandidates.length)];
    shuffled.push(selected.tracks.pop());
    previousAlbumId = selected.albumId;
  }
  return shuffled;
}
