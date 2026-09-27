import { albums as demoAlbums, targets as demoTargets } from "./catalog.js";
import { createPlayerState } from "./player-state.js";
import { createRotationShelf } from "./rotation-shelf.js";
import { createSpotifyClient } from "./spotify-client.js";

export function createUserContextProvider({
  userStore,
  spotifyClientId,
  spotifyRedirectUri,
  fetchImpl = fetch,
  now = Date.now,
}) {
  return async function getUserContext(sessionId) {
    const user = await userStore.load(sessionId);
    const storedPlayer = user?.playerState;
    const initialTargets = storedPlayer?.targets?.length ? storedPlayer.targets : demoTargets;
    const initialAlbums = storedPlayer?.albums ?? demoAlbums;
    const selectedTargetId = initialTargets.some(({ id }) => id === storedPlayer?.selectedTargetId)
      ? storedPlayer.selectedTargetId
      : initialTargets[0].id;
    const player = createPlayerState({
      targets: initialTargets,
      albums: initialAlbums,
      defaultTargetId: selectedTargetId,
    });
    const spotify = createSpotifyClient({
      clientId: spotifyClientId,
      redirectUri: spotifyRedirectUri,
      fetchImpl,
      now,
      initialSession: user?.spotifySession ?? null,
      sessionStore: {
        load: () => user?.spotifySession ?? null,
        save: (session) => userStore.saveSpotifySession(sessionId, session),
      },
    });
    const rotation = createRotationShelf({
      store: {
        load: () => user?.rotation ?? null,
        save: () => {},
      },
      now,
    });
    const favouriteArtists = structuredClone(user?.favouriteArtists ?? []);
    const favouriteAlbums = structuredClone(user?.favouriteAlbums ?? []);

    return {
      player,
      spotify,
      rotation,
      favouriteArtists,
      favouriteAlbums,
      persistPlayer: () => userStore.savePlayerState(sessionId, player.snapshot()),
      persistRotation: () => userStore.saveRotation(sessionId, rotation.snapshot()),
      persistFavouriteArtists: () => userStore.saveFavouriteArtists(sessionId, favouriteArtists),
      persistFavouriteAlbums: () => userStore.saveFavouriteAlbums(sessionId, favouriteAlbums),
    };
  };
}
