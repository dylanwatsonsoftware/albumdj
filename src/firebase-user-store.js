const COLLECTION = "albumdj_sessions";

export function createFirebaseUserStore({ firestore }) {
  if (!firestore) throw new Error("Firestore is not configured");

  function sessionDocument(sessionId) {
    return firestore.collection(COLLECTION).doc(sessionId);
  }

  async function saveField(sessionId, field, value) {
    await sessionDocument(sessionId).set({ [field]: value }, { merge: true });
  }

  return {
    async load(sessionId) {
      const snapshot = await sessionDocument(sessionId).get();
      if (!snapshot.exists) return null;
      const { spotifySession = null, playerState = null, rotation = null } = snapshot.data();
      return { sessionId, spotifySession, playerState, rotation };
    },
    saveSpotifySession: (sessionId, value) => saveField(sessionId, "spotifySession", value),
    savePlayerState: (sessionId, value) => saveField(sessionId, "playerState", value),
    saveRotation: (sessionId, value) => saveField(sessionId, "rotation", value),
  };
}
