const SESSION_COLLECTION = "albumdj_sessions";
const USER_COLLECTION = "albumdj_users";

export function createFirebaseUserStore({ firestore, now = Date.now, cacheTtlMs = 60_000 }) {
  if (!firestore) throw new Error("Firestore is not configured");
  const cache = new Map();
  const pendingLoads = new Map();

  function sessionDocument(sessionId) {
    return firestore.collection(SESSION_COLLECTION).doc(sessionId);
  }

  function userDocument(spotifyUserId) {
    return firestore.collection(USER_COLLECTION).doc(spotifyUserId);
  }

  function preferenceDocument(owner) {
    if (typeof owner === "string") return sessionDocument(owner);
    return owner.spotifyUserId ? userDocument(owner.spotifyUserId) : sessionDocument(owner.sessionId);
  }

  function invalidate(owner) {
    const sessionId = typeof owner === "string" ? owner : owner.sessionId;
    const spotifyUserId = typeof owner === "string" ? null : owner.spotifyUserId;
    for (const [cachedSessionId, entry] of cache) {
      if (cachedSessionId === sessionId || (spotifyUserId && entry.value?.spotifyUserId === spotifyUserId)) {
        cache.delete(cachedSessionId);
      }
    }
  }

  async function saveField(owner, field, value) {
    await preferenceDocument(owner).set({ [field]: value }, { merge: true });
    invalidate(owner);
  }

  async function loadFresh(sessionId) {
    const snapshot = await sessionDocument(sessionId).get();
    if (!snapshot.exists) return null;
    const session = snapshot.data();
    const {
      spotifySession = null,
      playerState = null,
      rotation = null,
      favouriteArtists = [],
      favouriteAlbums = [],
      preferencesMigratedTo = null,
    } = session;
    const spotifyUserId = spotifySession?.profile?.id ?? null;
    if (!spotifyUserId) {
      return { sessionId, spotifyUserId, spotifySession, playerState, rotation, favouriteArtists, favouriteAlbums };
    }

    const accountSnapshot = await userDocument(spotifyUserId).get();
    let account = { playerState, rotation, favouriteArtists, favouriteAlbums };
    if (accountSnapshot.exists) {
      account = {
        playerState: null,
        rotation: null,
        favouriteArtists: [],
        favouriteAlbums: [],
        ...accountSnapshot.data(),
      };
    }

    if (preferencesMigratedTo !== spotifyUserId) {
      const legacyPreferences = {
        ...(playerState ? { playerState } : {}),
        ...(rotation ? { rotation } : {}),
        ...(favouriteArtists.length ? { favouriteArtists } : {}),
        ...(favouriteAlbums.length ? { favouriteAlbums } : {}),
      };
      if (!accountSnapshot.exists || Object.keys(legacyPreferences).length) {
        const migration = accountSnapshot.exists ? legacyPreferences : account;
        await userDocument(spotifyUserId).set(migration, { merge: true });
        account = { ...account, ...migration };
      }
      await sessionDocument(sessionId).set({ preferencesMigratedTo: spotifyUserId }, { merge: true });
    }
    return { sessionId, spotifyUserId, spotifySession, ...account };
  }

  return {
    async load(sessionId) {
      const cached = cache.get(sessionId);
      if (cached && cached.expiresAt > now()) return structuredClone(cached.value);
      if (pendingLoads.has(sessionId)) return structuredClone(await pendingLoads.get(sessionId));

      const pending = loadFresh(sessionId);
      pendingLoads.set(sessionId, pending);
      try {
        const value = await pending;
        cache.set(sessionId, { value: structuredClone(value), expiresAt: now() + cacheTtlMs });
        return structuredClone(value);
      } finally {
        pendingLoads.delete(sessionId);
      }
    },
    async saveSpotifySession(sessionId, value) {
      await sessionDocument(sessionId).set({ spotifySession: value }, { merge: true });
      invalidate(sessionId);
    },
    savePlayerState: (owner, value) => saveField(owner, "playerState", value),
    saveRotation: (owner, value) => saveField(owner, "rotation", value),
    saveFavouriteArtists: (owner, value) => saveField(owner, "favouriteArtists", value),
    saveFavouriteAlbums: (owner, value) => saveField(owner, "favouriteAlbums", value),
    saveSpotifyCatalogCache: (owner, value) => saveField(owner, "spotifyCatalogCache", value),
  };
}
