import test from "node:test";
import assert from "node:assert/strict";

import { createFirebaseUserStore } from "../src/firebase-user-store.js";

function fakeFirestore(initial = {}) {
  const writes = [];
  return {
    writes,
    collection(name) {
      assert.equal(name, "albumdj_sessions");
      return {
        doc(sessionId) {
          return {
            async get() {
              return {
                exists: Object.hasOwn(initial, sessionId),
                data: () => initial[sessionId],
              };
            },
            async set(value, options) {
              writes.push({ sessionId, value, options });
            },
          };
        },
      };
    },
  };
}

test("loads one isolated Album DJ session from Firestore", async () => {
  const firestore = fakeFirestore({
    "session-one": {
      spotifySession: { profile: { id: "one" } },
      playerState: { selectedTargetId: "speaker-one" },
      rotation: { albumIds: ["album-one"] },
      favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
    },
  });
  const store = createFirebaseUserStore({ firestore });

  assert.deepEqual(await store.load("session-one"), {
    sessionId: "session-one",
    spotifySession: { profile: { id: "one" } },
    playerState: { selectedTargetId: "speaker-one" },
    rotation: { albumIds: ["album-one"] },
    favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
  });
  assert.equal(await store.load("session-two"), null);
});

test("merges only the requested session field", async () => {
  const firestore = fakeFirestore();
  const store = createFirebaseUserStore({ firestore });

  await store.saveSpotifySession("session-one", { token: "secret" });
  await store.savePlayerState("session-one", { selectedTargetId: "phone" });
  await store.saveRotation("session-one", { albumIds: ["album-one"] });
  await store.saveFavouriteArtists("session-one", [{ id: "artist-one", name: "Artist One" }]);

  assert.deepEqual(firestore.writes, [
    { sessionId: "session-one", value: { spotifySession: { token: "secret" } }, options: { merge: true } },
    { sessionId: "session-one", value: { playerState: { selectedTargetId: "phone" } }, options: { merge: true } },
    { sessionId: "session-one", value: { rotation: { albumIds: ["album-one"] } }, options: { merge: true } },
    { sessionId: "session-one", value: { favouriteArtists: [{ id: "artist-one", name: "Artist One" }] }, options: { merge: true } },
  ]);
});
