import test from "node:test";
import assert from "node:assert/strict";

import { loadStartupPreferences, parseApiResponse, startupFailureMessage } from "../public/startup.js";

test("reports a useful error when Vercel returns a plain-text server failure", async () => {
  const response = new Response("A server error has occurred", {
    status: 500,
    headers: { "content-type": "text/plain" },
  });

  await assert.rejects(parseApiResponse(response), /Album DJ server error \(500\)/);
});

test("turns a startup exception into a visible retry message", () => {
  assert.equal(
    startupFailureMessage(new Error("Album DJ server error (500)")),
    "Album DJ couldn’t reach its server. Album DJ server error (500). Refresh to try again.",
  );
});

test("loads independent account preferences concurrently", async () => {
  const calls = [];
  const resolvers = new Map();
  const request = (path) => {
    calls.push(path);
    return new Promise((resolve) => resolvers.set(path, resolve));
  };

  const loading = loadStartupPreferences(request);
  assert.deepEqual(calls, [
    "/api/rotation",
    "/api/favourite-artists",
    "/api/favourite-albums",
  ]);

  resolvers.get("/api/rotation")({ albumIds: ["album-1"] });
  resolvers.get("/api/favourite-artists")([{ id: "artist-1" }]);
  resolvers.get("/api/favourite-albums")([{ id: "album-1" }]);

  assert.deepEqual(await loading, {
    rotation: { albumIds: ["album-1"] },
    favouriteArtists: [{ id: "artist-1" }],
    favouriteAlbums: [{ id: "album-1" }],
  });
});
