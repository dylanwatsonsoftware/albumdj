import test from "node:test";
import assert from "node:assert/strict";

import { createFirebaseUserStore } from "../src/firebase-user-store.js";

function fakeFirestore(initial = {}) {
  const writes = [];
  const reads = [];
  return {
    reads,
    writes,
    collection(name) {
      return {
        doc(sessionId) {
          return {
            async get() {
              reads.push({ collection: name, sessionId });
              const records = initial[name] ?? (name === "albumdj_sessions" ? initial : {});
              return {
                exists: Object.hasOwn(records, sessionId),
                data: () => records[sessionId],
              };
            },
            async set(value, options) {
              writes.push({ ...(name === "albumdj_sessions" ? {} : { collection: name }), sessionId, value, options });
              const records = initial[name] ?? (name === "albumdj_sessions" ? initial : (initial[name] = {}));
              records[sessionId] = options?.merge ? { ...records[sessionId], ...value } : value;
            },
          };
        },
      };
    },
  };
}

test("deduplicates concurrent reads and caches one hydrated account briefly", async () => {
  let now = 1_000;
  const firestore = fakeFirestore({
    albumdj_sessions: {
      "browser-a": {
        spotifySession: { profile: { id: "spotify-user" } },
        preferencesMigratedTo: "spotify-user",
      },
    },
    albumdj_users: {
      "spotify-user": { favouriteAlbums: [{ id: "blue", title: "Blue" }] },
    },
  });
  const store = createFirebaseUserStore({ firestore, now: () => now, cacheTtlMs: 60_000 });

  const [first, second] = await Promise.all([store.load("browser-a"), store.load("browser-a")]);
  first.favouriteAlbums.length = 0;
  const cached = await store.load("browser-a");

  assert.equal(firestore.reads.length, 2);
  assert.deepEqual(second.favouriteAlbums, [{ id: "blue", title: "Blue" }]);
  assert.deepEqual(cached.favouriteAlbums, [{ id: "blue", title: "Blue" }]);

  now += 60_001;
  await store.load("browser-a");
  assert.equal(firestore.reads.length, 4);
});

test("invalidates cached account data after a preference write", async () => {
  const firestore = fakeFirestore({
    albumdj_sessions: {
      "browser-a": {
        spotifySession: { profile: { id: "spotify-user" } },
        preferencesMigratedTo: "spotify-user",
      },
    },
    albumdj_users: {
      "spotify-user": { favouriteAlbums: [] },
    },
  });
  const store = createFirebaseUserStore({ firestore });
  const owner = { sessionId: "browser-a", spotifyUserId: "spotify-user" };

  await store.load("browser-a");
  await store.saveFavouriteAlbums(owner, [{ id: "blue", title: "Blue" }]);
  const reloaded = await store.load("browser-a");

  assert.deepEqual(reloaded.favouriteAlbums, [{ id: "blue", title: "Blue" }]);
  assert.equal(firestore.reads.length, 4);
});

test("loads one isolated Album DJ session from Firestore", async () => {
  const firestore = fakeFirestore({
    "session-one": {
      spotifySession: { profile: { id: "one" } },
      playerState: { selectedTargetId: "speaker-one" },
      rotation: { albumIds: ["album-one"] },
      favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
      favouriteAlbums: [{ id: "album-one", title: "Album One" }],
    },
  });
  const store = createFirebaseUserStore({ firestore });

  assert.deepEqual(await store.load("session-one"), {
    sessionId: "session-one",
    spotifyUserId: "one",
    spotifySession: { profile: { id: "one" } },
    playerState: { selectedTargetId: "speaker-one" },
    rotation: { albumIds: ["album-one"] },
    favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
    favouriteAlbums: [{ id: "album-one", title: "Album One" }],
  });
  assert.equal(await store.load("session-two"), null);
});

test("loads shared preferences by verified Spotify account while keeping tokens per browser", async () => {
  const firestore = fakeFirestore({
    albumdj_sessions: {
      "browser-a": { spotifySession: { token: { accessToken: "token-a" }, profile: { id: "spotify-user" } } },
      "browser-b": { spotifySession: { token: { accessToken: "token-b" }, profile: { id: "spotify-user" } } },
    },
    albumdj_users: {
      "spotify-user": {
        favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
        favouriteAlbums: [{ id: "album-one", title: "Album One" }],
        spotifyCatalogCache: { artistAlbums: { "artist-one": { albums: [{ id: "album-one" }] } } },
      },
    },
  });
  const store = createFirebaseUserStore({ firestore });

  const first = await store.load("browser-a");
  const second = await store.load("browser-b");

  assert.equal(first.spotifySession.token.accessToken, "token-a");
  assert.equal(second.spotifySession.token.accessToken, "token-b");
  assert.equal(first.spotifyUserId, "spotify-user");
  assert.deepEqual(first.favouriteAlbums, second.favouriteAlbums);
  assert.deepEqual(first.favouriteArtists, second.favouriteArtists);
  assert.deepEqual(first.spotifyCatalogCache, second.spotifyCatalogCache);
});

test("migrates existing browser preferences into the Spotify account record", async () => {
  const firestore = fakeFirestore({
    albumdj_sessions: {
      "browser-a": {
        spotifySession: { profile: { id: "spotify-user" } },
        favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
        favouriteAlbums: [{ id: "album-one", title: "Album One" }],
      },
    },
    albumdj_users: {},
  });
  const store = createFirebaseUserStore({ firestore });

  await store.load("browser-a");

  assert.deepEqual(firestore.writes, [
    {
      collection: "albumdj_users",
      sessionId: "spotify-user",
      value: {
        playerState: null,
        rotation: null,
        favouriteArtists: [{ id: "artist-one", name: "Artist One" }],
        favouriteAlbums: [{ id: "album-one", title: "Album One" }],
      },
      options: { merge: true },
    },
    {
      sessionId: "browser-a",
      value: { preferencesMigratedTo: "spotify-user" },
      options: { merge: true },
    },
  ]);
});

test("migrates legacy favourites even when another browser created the account first", async () => {
  const firestore = fakeFirestore({
    albumdj_sessions: {
      "old-browser": {
        spotifySession: { profile: { id: "spotify-user" } },
        favouriteAlbums: [{ id: "blue", title: "Blue" }],
      },
    },
    albumdj_users: {
      "spotify-user": { favouriteArtists: [], favouriteAlbums: [] },
    },
  });
  const store = createFirebaseUserStore({ firestore });

  const loaded = await store.load("old-browser");

  assert.deepEqual(loaded.favouriteAlbums, [{ id: "blue", title: "Blue" }]);
  assert.ok(firestore.writes.some(({ collection, sessionId, value }) => (
    collection === "albumdj_users"
    && sessionId === "spotify-user"
    && value.favouriteAlbums?.[0]?.id === "blue"
  )));
});

test("does not resurrect old favourites after that browser has migrated", async () => {
  const firestore = fakeFirestore({
    albumdj_sessions: {
      "old-browser": {
        spotifySession: { profile: { id: "spotify-user" } },
        preferencesMigratedTo: "spotify-user",
        favouriteAlbums: [{ id: "blue", title: "Blue" }],
      },
    },
    albumdj_users: {
      "spotify-user": { favouriteArtists: [], favouriteAlbums: [] },
    },
  });
  const store = createFirebaseUserStore({ firestore });

  const loaded = await store.load("old-browser");

  assert.deepEqual(loaded.favouriteAlbums, []);
  assert.deepEqual(firestore.writes, []);
});

test("writes preferences to a Spotify account without moving browser tokens", async () => {
  const firestore = fakeFirestore();
  const store = createFirebaseUserStore({ firestore });
  const owner = { sessionId: "browser-a", spotifyUserId: "spotify-user" };

  await store.saveFavouriteAlbums(owner, [{ id: "album-one", title: "Album One" }]);
  await store.saveSpotifySession("browser-a", { token: { accessToken: "secret" } });

  assert.deepEqual(firestore.writes, [
    {
      collection: "albumdj_users",
      sessionId: "spotify-user",
      value: { favouriteAlbums: [{ id: "album-one", title: "Album One" }] },
      options: { merge: true },
    },
    {
      sessionId: "browser-a",
      value: { spotifySession: { token: { accessToken: "secret" } } },
      options: { merge: true },
    },
  ]);
});

test("merges only the requested session field", async () => {
  const firestore = fakeFirestore();
  const store = createFirebaseUserStore({ firestore });

  await store.saveSpotifySession("session-one", { token: "secret" });
  await store.savePlayerState("session-one", { selectedTargetId: "phone" });
  await store.saveRotation("session-one", { albumIds: ["album-one"] });
  await store.saveFavouriteArtists("session-one", [{ id: "artist-one", name: "Artist One" }]);
  await store.saveFavouriteAlbums("session-one", [{ id: "album-one", title: "Album One" }]);
  await store.saveSpotifyCatalogCache("session-one", { artistAlbums: { "artist-one": { albums: [] } } });

  assert.deepEqual(firestore.writes, [
    { sessionId: "session-one", value: { spotifySession: { token: "secret" } }, options: { merge: true } },
    { sessionId: "session-one", value: { playerState: { selectedTargetId: "phone" } }, options: { merge: true } },
    { sessionId: "session-one", value: { rotation: { albumIds: ["album-one"] } }, options: { merge: true } },
    { sessionId: "session-one", value: { favouriteArtists: [{ id: "artist-one", name: "Artist One" }] }, options: { merge: true } },
    { sessionId: "session-one", value: { favouriteAlbums: [{ id: "album-one", title: "Album One" }] }, options: { merge: true } },
    { sessionId: "session-one", value: { spotifyCatalogCache: { artistAlbums: { "artist-one": { albums: [] } } } }, options: { merge: true } },
  ]);
});
