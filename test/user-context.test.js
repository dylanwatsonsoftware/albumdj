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
    savePlayerState: async (owner, playerState) => {
      records.set(owner.spotifyUserId ?? owner.sessionId, { ...records.get(owner.spotifyUserId ?? owner.sessionId), playerState });
    },
    saveRotation: async (owner, rotation) => {
      records.set(owner.spotifyUserId ?? owner.sessionId, { ...records.get(owner.spotifyUserId ?? owner.sessionId), rotation });
    },
    saveFavouriteArtists: async (owner, favouriteArtists) => {
      records.set(owner.spotifyUserId ?? owner.sessionId, { ...records.get(owner.spotifyUserId ?? owner.sessionId), favouriteArtists });
    },
    saveFavouriteAlbums: async (owner, favouriteAlbums) => {
      records.set(owner.spotifyUserId ?? owner.sessionId, { ...records.get(owner.spotifyUserId ?? owner.sessionId), favouriteAlbums });
    },
  };
  const getContext = createUserContextProvider({
    userStore,
    spotifyClientId: "client-1",
    spotifyRedirectUri: "https://albumdj.test/api/auth/spotify/callback",
  });
  const first = await getContext("browser-a");
  const favourite = { id: "favourite", title: "Favourite", artist: "Artist", spotifyUri: "spotify:album:favourite" };
  first.player.replaceAlbums([favourite]);
  first.rotation.update({ albumIds: ["favourite"], durationDays: 7, mode: "sequential" });
  await first.persistPlayer();
  await first.persistRotation();
  first.favouriteArtists.push({ id: "artist-one", name: "Artist One" });
  await first.persistFavouriteArtists();
  first.favouriteAlbums.push(favourite);
  await first.persistFavouriteAlbums();

  const restored = await getContext("browser-a");
  const otherUser = await getContext("browser-b");

  assert.deepEqual(restored.player.snapshot().albums, [favourite]);
  assert.deepEqual(restored.rotation.snapshot().albumIds, ["favourite"]);
  assert.deepEqual(restored.favouriteArtists, [{ id: "artist-one", name: "Artist One" }]);
  assert.deepEqual(restored.favouriteAlbums, [favourite]);
  assert.equal(otherUser.player.snapshot().albums.some(({ id }) => id === "favourite"), false);
  assert.deepEqual(otherUser.rotation.snapshot().albumIds, []);
  assert.deepEqual(otherUser.favouriteArtists, []);
  assert.deepEqual(otherUser.favouriteAlbums, []);
});
