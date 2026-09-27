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

const here = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(here, "..", "public");

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/nfc.js", ["nfc.js", "text/javascript; charset=utf-8"]],
  ["/spotify-sync.js", ["spotify-sync.js", "text/javascript; charset=utf-8"]],
  ["/live-playback.js", ["live-playback.js", "text/javascript; charset=utf-8"]],
  ["/coverflow.js", ["coverflow.js", "text/javascript; charset=utf-8"]],
  ["/rotation.js", ["rotation.js", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createPrototypeHandler(options = {}) {
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
    };
  }
  const contextProvider = options.contextProvider ?? (async () => sharedContext);

  function rotationState(player, rotation) {
    const snapshot = rotation.snapshot();
    const albumById = new Map(player.snapshot().albums.map((album) => [album.id, album]));
    return {
      ...snapshot,
      albums: snapshot.albumIds.map((id) => albumById.get(id)).filter(Boolean),
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
      } = context;

      if (request.method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/status") {
        return sendJson(response, 200, spotify.status());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/albums") {
        return sendJson(response, 200, await spotify.getSavedAlbums());
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
        const knownAlbums = new Set(player.snapshot().albums.map(({ id }) => id));
        if (nextRotation.albumIds.some((id) => !knownAlbums.has(id))) {
          throw new Error("Rotation contains an unknown album");
        }
        rotation.update(nextRotation);
        await persistRotation();
        return sendJson(response, 200, rotationState(player, rotation));
      }

      if (request.method === "POST" && url.pathname === "/api/rotation/play") {
        const currentRotation = rotation.snapshot();
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
        await spotify.playTracks({
          deviceId: player.snapshot().selectedTargetId,
          trackUris,
        });
        return sendJson(response, 200, {
          albumCount: currentRotation.albumIds.length,
          trackCount: trackUris.length,
          mode: currentRotation.mode,
        });
      }

      if (request.method === "GET" && ["/auth/spotify", "/api/auth/spotify"].includes(url.pathname)) {
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
        response.writeHead(302, { location: "/?spotify=connected" });
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
          await spotify.playAlbum({
            deviceId: playback.target.id,
            spotifyUri: playback.album.spotifyUri,
          });
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
    console.log(`SpinStack prototype: http://localhost:${port}`);
    for (const address of localAddresses(port)) console.log(`Phone: ${address}`);
  });
}
