const DAY_MS = 24 * 60 * 60 * 1000;
const emptyRotation = () => ({
  albumIds: [],
  durationDays: 7,
  mode: "sequential",
  expiresAt: null,
});

export function createRotationShelf({ store, now = Date.now }) {
  let rotation = store.load() ?? emptyRotation();

  function snapshot() {
    if (rotation.expiresAt !== null && rotation.expiresAt <= now()) {
      rotation = emptyRotation();
      store.save(rotation);
    }
    return structuredClone(rotation);
  }

  return {
    snapshot,

    update({ albumIds, durationDays, mode }) {
      if (![7, 14].includes(durationDays)) throw new Error("Rotation duration must be 7 or 14 days");
      if (!["sequential", "shuffle"].includes(mode)) throw new Error("Unknown rotation mode");
      const uniqueAlbumIds = [...new Set(albumIds)];
      rotation = {
        albumIds: uniqueAlbumIds,
        durationDays,
        mode,
        expiresAt: uniqueAlbumIds.length ? now() + durationDays * DAY_MS : null,
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
