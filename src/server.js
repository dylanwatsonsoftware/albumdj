import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { networkInterfaces } from "node:os";

import { albums, targets } from "./catalog.js";
import { createPlayerState } from "./player-state.js";
import { createSpotifyClient } from "./spotify-client.js";
import { createJsonSessionStore } from "./session-store.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(here, "..", "public");

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
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

export function createPrototypeServer(options = {}) {
  const player = createPlayerState({ targets, albums, defaultTargetId: "whole-house" });
  const spotify = options.spotify ?? createSpotifyClient({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8787/auth/spotify/callback",
    sessionStore: createJsonSessionStore(join(here, "..", ".data", "spotify-session.json")),
  });

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://prototype.local");

    try {
      if (request.method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/status") {
        return sendJson(response, 200, spotify.status());
      }

      if (request.method === "GET" && url.pathname === "/api/spotify/albums") {
        return sendJson(response, 200, await spotify.getSavedAlbums());
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/import") {
        player.replaceAlbums(await spotify.getSavedAlbums());
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "POST" && url.pathname === "/api/spotify/devices") {
        player.replaceTargets(await spotify.getAvailableDevices());
        return sendJson(response, 200, player.snapshot());
      }

      if (request.method === "GET" && url.pathname === "/auth/spotify") {
        response.writeHead(302, { location: spotify.beginAuthorization() });
        return response.end();
      }

      if (request.method === "GET" && url.pathname === "/auth/spotify/callback") {
        if (url.searchParams.has("error")) {
          throw new Error(`Spotify authorization denied: ${url.searchParams.get("error")}`);
        }
        await spotify.completeAuthorization({
          code: url.searchParams.get("code"),
          state: url.searchParams.get("state"),
        });
        player.replaceAlbums(await spotify.getSavedAlbums());
        player.replaceTargets(await spotify.getAvailableDevices());
        response.writeHead(302, { location: "/?spotify=connected" });
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/api/target") {
        const { targetId } = await readJson(request);
        player.selectTarget(targetId);
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
        return sendJson(response, 200, playback);
      }

      if (request.method === "GET" && assets.has(url.pathname)) {
        const [filename, contentType] = assets.get(url.pathname);
        const body = await readFile(join(publicDirectory, filename));
        response.writeHead(200, { "content-type": contentType });
        return response.end(body);
      }

      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  });
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
    console.log(`Physical Favourites prototype: http://localhost:${port}`);
    for (const address of localAddresses(port)) console.log(`Phone: ${address}`);
  });
}
