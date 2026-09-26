export function createPlayerState({ targets, albums, defaultTargetId }) {
  let currentTargets = targets;
  let targetById = new Map(targets.map((target) => [target.id, target]));
  let currentAlbums = albums;
  let albumById = new Map(albums.map((album) => [album.id, album]));

  if (!targetById.has(defaultTargetId)) {
    throw new Error(`Unknown target: ${defaultTargetId}`);
  }

  let selectedTargetId = defaultTargetId;
  let lastPlayback = null;

  return {
    selectTarget(targetId) {
      if (!targetById.has(targetId)) {
        throw new Error(`Unknown target: ${targetId}`);
      }
      selectedTargetId = targetId;
      return targetById.get(targetId);
    },

    scanAlbum(albumId) {
      if (!albumById.has(albumId)) {
        throw new Error(`Unknown album: ${albumId}`);
      }

      lastPlayback = {
        album: albumById.get(albumId),
        target: targetById.get(selectedTargetId),
        mode: "simulated",
      };
      return lastPlayback;
    },

    replaceAlbums(nextAlbums) {
      currentAlbums = nextAlbums;
      albumById = new Map(nextAlbums.map((album) => [album.id, album]));
      lastPlayback = null;
      return currentAlbums;
    },

    replaceTargets(nextTargets) {
      currentTargets = nextTargets;
      targetById = new Map(nextTargets.map((target) => [target.id, target]));
      const activeTarget = nextTargets.find((target) => target.isActive);
      selectedTargetId = activeTarget?.id ?? nextTargets[0]?.id ?? null;
      return currentTargets;
    },

    snapshot() {
      return {
        targets: currentTargets,
        albums: currentAlbums,
        selectedTargetId,
        lastPlayback,
      };
    },
  };
}
