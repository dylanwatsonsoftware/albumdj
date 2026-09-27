import test from "node:test";
import assert from "node:assert/strict";

import { createUserContextProvider } from "../src/user-context.js";

test("rehydrates player and rotation state for one browser session only", async () => {
  const records = new Map();
  const userStore = {
    load: async (sessionId) => structuredClone(records.get(sessionId) ?? null),
    saveSpotifySession: async (sessionId, spotifySession) => {
      records.set(sessionId, { ...records.get(sessionId), sessionId, spotifySession });
    },
    savePlayerState: async (sessionId, playerState) => {
      records.set(sessionId, { ...records.get(sessionId), sessionId, playerState });
    },
    saveRotation: async (sessionId, rotation) => {
      records.set(sessionId, { ...records.get(sessionId), sessionId, rotation });
    },
  };
  const getContext = createUserContextProvider({
    userStore,
    spotifyClientId: "client-1",
    spotifyRedirectUri: "https://spinstack.test/api/auth/spotify/callback",
  });
  const first = await getContext("browser-a");
  const favourite = { id: "favourite", title: "Favourite", artist: "Artist", spotifyUri: "spotify:album:favourite" };
  first.player.replaceAlbums([favourite]);
  first.rotation.update({ albumIds: ["favourite"], durationDays: 7, mode: "sequential" });
  await first.persistPlayer();
  await first.persistRotation();

  const restored = await getContext("browser-a");
  const otherUser = await getContext("browser-b");

  assert.deepEqual(restored.player.snapshot().albums, [favourite]);
  assert.deepEqual(restored.rotation.snapshot().albumIds, ["favourite"]);
  assert.equal(otherUser.player.snapshot().albums.some(({ id }) => id === "favourite"), false);
  assert.deepEqual(otherUser.rotation.snapshot().albumIds, []);
});
