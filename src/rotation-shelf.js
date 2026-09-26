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

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }
  return queue;
}
