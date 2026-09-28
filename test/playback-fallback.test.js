import test from "node:test";
import assert from "node:assert/strict";

import { spotifyOpenUrl } from "../public/playback-fallback.js";

test("only exposes an external Spotify URL for fallback playback", () => {
  assert.equal(
    spotifyOpenUrl({ mode: "spotify-open", openUrl: "https://open.spotify.com/album/blue" }),
    "https://open.spotify.com/album/blue",
  );
  assert.equal(spotifyOpenUrl({ mode: "spotify", openUrl: "https://open.spotify.com/album/blue" }), null);
  assert.equal(spotifyOpenUrl(null), null);
});
