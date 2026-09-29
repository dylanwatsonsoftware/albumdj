import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { networkInterfaces } from "node:os";

import { albums, targets } from "./catalog.js";
import { createPlayerState } from "./player-state.js";
import { createSpotifyClient } from "./spotify-client.js";
import { createJsonSessionStore } from "./session-store.js";
import { buildRotationQueue, createRotationShelf } from "./rotation-shelf.js";
import { selectRecentFavouriteAlbums } from "./recent-releases.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(here, "..", "public");
const SPOTIFY_CATALOG_CACHE_TTL = 24 * 60 * 60 * 1_000;

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/startup.js", ["startup.js", "text/javascript; charset=utf-8"]],
  ["/nfc.js", ["nfc.js", "text/javascript; charset=utf-8"]],
  ["/spotify-sync.js", ["spotify-sync.js", "text/javascript; charset=utf-8"]],
  ["/live-playback.js", ["live-playback.js", "text/javascript; charset=utf-8"]],
  ["/coverflow.js", ["coverflow.js", "text/javascript; charset=utf-8"]],
  ["/rotation.js", ["rotation.js", "text/javascript; charset=utf-8"]],
  ["/discovery.js", ["discovery.js", "text/javascript; charset=utf-8"]],
  ["/navigation.js", ["navigation.js", "text/javascript; charset=utf-8"]],
  ["/playback-fallback.js", ["playback-fallback.js", "text/javascript; charset=utf-8"]],
  ["/.well-known/assetlinks.json", [".well-known/assetlinks.json", "application/json; charset=utf-8"]],
]);

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function hasCookie(request, name, value) {
  return (request.headers.cookie ?? "").split(";").some((part) => part.trim() === `${name}=${value}`);
}

function catalogueCooldownError(cache, timestamp) {
  if (!cache.retryAfterUntil || cache.retryAfterUntil <= timestamp) return null;
  const seconds = Math.ceil((cache.retryAfterUntil - timestamp) / 1_000);
  return new Error(`Spotify is busy. Try again in ${seconds} seconds`);
}

function recordCatalogueCooldown(cache, error, timestamp) {
  if (!Number.isFinite(error?.retryAfterSeconds)) return false;
  cache.retryAfterUntil = Math.max(
    cache.retryAfterUntil ?? 0,
    timestamp + error.retryAfterSeconds * 1_000,
  );
  return true;
}

function spotifyOpenPlayback(album) {
  const spotifyAlbumId = album.spotifyUri?.match(/^spotify:album:(.+)$/)?.[1] ?? album.id;
  return {
    album,
    target: null,
    mode: "spotify-open",
    openUrl: album.spotifyUrl || `https://open.spotify.com/album/${encodeURIComponent(spotifyAlbumId)}`,
  };
}

async function mapSettledWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createPrototypeHandler(options = {}) {
  const now = options.now ?? Date.now;
  let sharedContext = null;
  if (!options.contextProvider) {
    sharedContext = {
      player: createPlayerState({ targets, albums, defaultTargetId: "whole-house" }),
      spotify: options.spotify ?? createSpotifyClient({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        redirectUri: process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8787/auth/spotify/callback",
        sessionStore: createJsonSessionStore(join(here, "..", ".data", "spotify-session.json")),
      }),
      rotation: options.rotation ?? createRotationShelf({
        store: createJsonSessionStore(join(here, "..", ".data", "rotation-shelf.json")),
      }),
      persistPlayer: async () => {},
      persistRotation: async () => {},
      favouriteArtists: [],
      persistFavouriteArtists: async () => {},
      favouriteAlbums: [],
      persistFavouriteAlbums: async () => {},
    };
  }
  const contextProvider = options.contextProvider ?? (async () => sharedContext);

  function rotationState(player, rotation) {
    const snapshot = rotation.snapshot();
    const albumById = new Map(player.snapshot().albums.map((album) => [album.id, album]));
    const albumIds = snapshot.albumIds.filter((id) => albumById.has(id));
    return {
      ...snapshot,
      albumIds,
      albums: albumIds.map((id) => albumById.get(id)),
      history: (snapshot.history ?? []).map((entry) => ({
        ...entry,
        album: entry.album ?? albumById.get(entry.albumId) ?? null,
      })).filter(({ album }) => album),
    };
  }

  return async function prototypeHandler(request, response) {
    const url = new URL(request.url, "http://prototype.local");

    try {
      if (request.method === "GET" && assets.has(url.pathname)) {
        const [filename, contentType] = assets.get(url.pathname);
        const body = await readFile(join(publicDirectory, filename));
        response.writeHead(200, { "content-type": contentType });
        return response.end(body);
      }

      const context = await contextProvider(request, response);
      if (!context) throw new Error("No user session is available");
      const {
        player,
        spotify,
        rotation,
        persistPlayer = async () => {},
        persistRotation = async () => {},
        favouriteArtists = [],
        persistFavouriteArtists = async () => {},
        favouriteAlbums = [],
        persistFavouriteAlbums = async () => {},
        spotifyCatalogCache = { artistAlbums: {}, recentArtistAlbums: {} },
        persistSpotifyCatalogCache = async () => {},
        sessionToken = null,
      } = context;

      if (request.method === "GET" && url.pathname === "/api/mobile/connect") {
        if (!spotify.status().connected) {
          response.writeHead(302, { location: "/api/auth/spotify?mobile=1" });
          return response.end();
        }
        if (!sessionToken) throw new Error("Native sign-in is unavailable in this environment");
        const callback = new URL("https://albumdj.vercel.app/mobile/callback");
        callback.hash = new URLSearchParams({ token: sessionToken }).toString();
        response.writeHead(302, { location: callback.toString() });
        return response.end();
      }

      if (request.method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/status") {
        return sendJson(response, 200, spotify.status());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/albums") {
        return sendJson(response, 200, await spotify.getSavedAlbums());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/search") {
        const query = url.searchParams.get("q")?.trim() ?? "";
        if (!query) throw new Error("Enter an album or artist to search for");
        return sendJson(response, 200, await spotify.searchCatalog(query));
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/favourite-artists/releases") {
        spotifyCatalogCache.recentArtistAlbums ??= {};
        let cacheChanged = false;
        const results = await mapSettledWithConcurrency(
          favouriteArtists,
          2,
          async ({ id }) => {
            const cached = spotifyCatalogCache.recentArtistAlbums[id];
            if (cached && now() - cached.updatedAt < SPOTIFY_CATALOG_CACHE_TTL) return cached.albums;
            try {
              const cooldown = catalogueCooldownError(spotifyCatalogCache, now());
              if (cooldown) throw cooldown;
              const artistAlbums = await spotify.getRecentArtistAlbums(id);
              spotifyCatalogCache.recentArtistAlbums[id] = { albums: artistAlbums, updatedAt: now() };
              cacheChanged = true;
              return artistAlbums;
            } catch (error) {
              cacheChanged ||= recordCatalogueCooldown(spotifyCatalogCache, error, now());
              if (cached) return cached.albums;
              const savedAlbums = player.snapshot().albums.filter((album) => album.artistId === id);
              if (savedAlbums.length) return savedAlbums;
              throw error;
            }
          },
        );
        if (cacheChanged) await persistSpotifyCatalogCache();
        const successful = results.filter(({ status }) => status === "fulfilled");
        if (!successful.length && results.length) {
          throw results.find(({ status }) => status === "rejected").reason;
        }
        return sendJson(response, 200, selectRecentFavouriteAlbums(
          successful.flatMap(({ value }) => value),
          { now: now() },
        ));
      }

      const artistAlbumsMatch = url.pathname.match(/^\/api\/spotify\/artists\/([^/]+)\/albums$/);
      if (request.method === "GET" && artistAlbumsMatch) {
        const artistId = decodeURIComponent(artistAlbumsMatch[1]);
        spotifyCatalogCache.artistAlbums ??= {};
        const cached = spotifyCatalogCache.artistAlbums[artistId];
        if (cached && now() - cached.updatedAt < SPOTIFY_CATALOG_CACHE_TTL) {
          return sendJson(response, 200, cached.albums);
        }
        try {
          const cooldown = catalogueCooldownError(spotifyCatalogCache, now());
          if (cooldown) throw cooldown;
          const artistAlbums = await spotify.getArtistAlbums(artistId);
          spotifyCatalogCache.artistAlbums[artistId] = { albums: artistAlbums, updatedAt: now() };
          await persistSpotifyCatalogCache();
          return sendJson(response, 200, artistAlbums);
        } catch (error) {
          if (recordCatalogueCooldown(spotifyCatalogCache, error, now())) {
            await persistSpotifyCatalogCache();
          }
          if (cached) return sendJson(response, 200, cached.albums);
          const savedAlbums = player.snapshot().albums.filter((album) => album.artistId === artistId);
          if (savedAlbums.length) return sendJson(response, 200, savedAlbums);
          throw error;
        }
      }

      if (request.method === "GET" && url.pathname === "/api/favourite-artists") {
        return sendJson(response, 200, favouriteArtists);
      }

      if (request.method === "PUT" && url.pathname === "/api/favourite-artists") {
        const { artists: nextArtists } = await readJson(request);
        if (!Array.isArray(nextArtists)) throw new Error("Favourite artists must be a list");
        const sanitized = nextArtists.map((artist) => ({
          id: String(artist.id),
          name: String(artist.name),
          imageUrl: artist.imageUrl || null,
          spotifyUrl: artist.spotifyUrl || null,
        }));
        favouriteArtists.splice(0, favouriteArtists.length, ...sanitized);
        await persistFavouriteArtists();
        return sendJson(response, 200, favouriteArtists);
      }

      if (request.method === "GET" && url.pathname === "/api/favourite-albums") {
        return sendJson(response, 200, favouriteAlbums);
      }

      if (request.method === "PUT" && url.pathname === "/api/favourite-albums") {
        const { albums: nextAlbums } = await readJson(request);
        if (!Array.isArray(nextAlbums)) throw new Error("Favourite albums must be a list");
        const sanitized = nextAlbums.map((album) => ({
          id: String(album.id),
          title: String(album.title),
          artist: String(album.artist),
          ...(album.artistId ? { artistId: String(album.artistId) } : {}),
          imageUrl: album.imageUrl || null,
          spotifyUrl: album.spotifyUrl || null,
          releaseDate: album.releaseDate || null,
        }));
        favouriteAlbums.splice(0, favouriteAlbums.length, ...sanitized);
        await persistFavouriteAlbums();
        return sendJson(response, 200, favouriteAlbums);
      }

      const discoveredPlayMatch = url.pathname.match(/^\/api\/spotify\/albums\/([^/]+)\/play$/);
      if (request.method === "POST" && discoveredPlayMatch) {
        const album = await spotify.getAlbum(decodeURIComponent(discoveredPlayMatch[1]));
        const target = player.snapshot().targets.find(({ id }) => id === player.snapshot().selectedTargetId);
        if (!target) return sendJson(response, 200, spotifyOpenPlayback(album));
        try {
          await spotify.playAlbum({ deviceId: target.id, spotifyUri: album.spotifyUri });
        } catch (error) {
          if (error?.status === 404) return sendJson(response, 200, spotifyOpenPlayback(album));
          throw error;
        }
        return sendJson(response, 200, { album, target, mode: "spotify" });
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/playback") {
        return sendJson(response, 200, await spotify.getCurrentPlayback());
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/playback/pause") {
        await spotify.pausePlayback();
        response.writeHead(204);
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/playback/resume") {
        await spotify.resumePlayback();
        response.writeHead(204);
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/playback/next") {
        await spotify.skipNext();
        response.writeHead(204);
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/import") {
        player.replaceAlbums(await spotify.getSavedAlbums());
        await persistPlayer();
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/devices") {
        player.replaceTargets(await spotify.getAvailableDevices());
        await persistPlayer();
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "GET" && url.pathname === "/api/rotation") {
        return sendJson(response, 200, rotationState(player, rotation));
      }

      if (request.method === "PUT" && url.pathname === "/api/rotation") {
        const nextRotation = await readJson(request);
        if (Array.isArray(nextRotation.albums) && nextRotation.albums.length) {
          const albumById = new Map(player.snapshot().albums.map((album) => [album.id, album]));
          for (const album of nextRotation.albums) {
            if (!album?.id || !album?.title || !album?.artist) throw new Error("A discovered album is incomplete");
            albumById.set(String(album.id), {
              id: String(album.id),
              title: String(album.title),
              artist: String(album.artist),
              artistId: album.artistId ? String(album.artistId) : null,
              spotifyUri: album.spotifyUri || `spotify:album:${album.id}`,
              imageUrl: album.imageUrl || null,
              spotifyUrl: album.spotifyUrl || null,
              releaseDate: album.releaseDate || null,
              albumType: album.albumType || "album",
            });
          }
          player.replaceAlbums([...albumById.values()]);
          await persistPlayer();
        }
        const knownAlbums = new Set(player.snapshot().albums.map(({ id }) => id));
        if (nextRotation.albumIds.some((id) => !knownAlbums.has(id))) {
          throw new Error("Rotation contains an unknown album");
        }
        rotation.update({
          albumIds: nextRotation.albumIds,
          durationDays: nextRotation.durationDays,
          mode: nextRotation.mode,
          albums: player.snapshot().albums,
        });
        await persistRotation();
        return sendJson(response, 200, rotationState(player, rotation));
      }

      if (request.method === "POST" && url.pathname === "/api/rotation/play") {
        const currentRotation = rotationState(player, rotation);
        if (!currentRotation.albumIds.length) throw new Error("Add at least one album to the rotation");
        const tracksByAlbum = new Map();
        for (const albumId of currentRotation.albumIds) {
          tracksByAlbum.set(albumId, await spotify.getAlbumTracks(albumId));
        }
        const trackUris = buildRotationQueue({
          albumIds: currentRotation.albumIds,
          tracksByAlbum,
          mode: currentRotation.mode,
        });
        if (!trackUris.length) throw new Error("No playable tracks found in this rotation");
        const playerState = player.snapshot();
        let target = playerState.targets.find(({ id }) => id === playerState.selectedTargetId);
        if (!target) throw new Error("Choose an available Spotify device before playing the stack");
        try {
          await spotify.playTracks({ deviceId: target.id, trackUris });
        } catch (error) {
          if (error?.status !== 404 || typeof spotify.getAvailableDevices !== "function") throw error;

          const refreshedTargets = await spotify.getAvailableDevices();
          const refreshedTarget = refreshedTargets.find(({ name }) => name === target.name);
          if (!refreshedTarget) {
            throw new Error(`${target.name} is no longer available in Spotify. Open Spotify on that device, then refresh devices.`);
          }

          player.replaceTargets(refreshedTargets);
          player.selectTarget(refreshedTarget.id);
          await persistPlayer();
          target = refreshedTarget;
          await spotify.playTracks({ deviceId: target.id, trackUris });
        }
        return sendJson(response, 200, {
          albumCount: currentRotation.albumIds.length,
          trackCount: trackUris.length,
          mode: currentRotation.mode,
          target: { id: target.id, name: target.name },
        });
      }

      if (request.method === "GET" && ["/auth/spotify", "/api/auth/spotify"].includes(url.pathname)) {
        if (url.searchParams.get("mobile") === "1") {
          response.setHeader("set-cookie", "pf_mobile_return=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
        }
        response.writeHead(302, { location: await spotify.beginAuthorization() });
        return response.end();
      }

      if (request.method === "GET" && ["/auth/spotify/callback", "/api/auth/spotify/callback"].includes(url.pathname)) {
        if (url.searchParams.has("error")) {
          throw new Error(`Spotify authorization denied: ${url.searchParams.get("error")}`);
        }
        await spotify.completeAuthorization({
          code: url.searchParams.get("code"),
          state: url.searchParams.get("state"),
        });
        player.replaceAlbums(await spotify.getSavedAlbums());
        player.replaceTargets(await spotify.getAvailableDevices());
        await persistPlayer();
        const mobileReturn = hasCookie(request, "pf_mobile_return", "1");
        if (mobileReturn) {
          response.setHeader("set-cookie", "pf_mobile_return=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
        }
        response.writeHead(302, { location: mobileReturn ? "/api/mobile/connect" : "/?spotify=connected" });
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/api/target") {
        const { targetId } = await readJson(request);
        player.selectTarget(targetId);
        await persistPlayer();
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "POST" && url.pathname === "/api/play") {
        const { albumId } = await readJson(request);
        const playback = player.scanAlbum(albumId);
        if (spotify.status().connected && typeof spotify.playAlbum === "function") {
          if (!playback.target) return sendJson(response, 200, spotifyOpenPlayback(playback.album));
          try {
            await spotify.playAlbum({
              deviceId: playback.target.id,
              spotifyUri: playback.album.spotifyUri,
            });
          } catch (error) {
            if (error?.status === 404) return sendJson(response, 200, spotifyOpenPlayback(playback.album));
            throw error;
          }
          playback.mode = "spotify";
        }
        await persistPlayer();
        return sendJson(response, 200, playback);
      }

      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  };
}

export function createPrototypeServer(options = {}) {
  return createServer(createPrototypeHandler(options));
}

function localAddresses(port) {
  const addresses = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return addresses;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createPrototypeServer().listen(port, "0.0.0.0", () => {
    console.log(`Album DJ prototype: http://localhost:${port}`);
    for (const address of localAddresses(port)) console.log(`Phone: ${address}`);
  });
}
