import test from "node:test";
import assert from "node:assert/strict";

import { createSupabaseUserStore } from "../src/supabase-user-store.js";

test("loads one isolated user record from Supabase", async () => {
  const requests = [];
  const store = createSupabaseUserStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-key",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("spotify_sessions")) {
        return Response.json([{ session_id: "user-1", state: { profile: { id: "spotify-1" } } }]);
      }
      return Response.json([]);
    },
  });

  const user = await store.load("user-1");

  assert.equal(user.sessionId, "user-1");
  assert.deepEqual(user.spotifySession, { profile: { id: "spotify-1" } });
  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ url }) => /session_id=eq\.user-1/.test(url)));
  assert.ok(requests.every(({ options }) => options.headers.apikey === "service-role-key"));
});

test("upserts only the requested user's state field", async () => {
  let request;
  const store = createSupabaseUserStore({
    url: "https://project.supabase.co/",
    serviceRoleKey: "service-role-key",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(null, { status: 201 });
    },
  });

  await store.saveRotation("user-2", { albumIds: ["album-1"] });

  assert.match(request.url, /physical_favourites_rotations\?on_conflict=session_id/);
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    session_id: "user-2",
    state: { albumIds: ["album-1"] },
  });
});
