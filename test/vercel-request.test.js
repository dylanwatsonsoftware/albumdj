import test from "node:test";
import assert from "node:assert/strict";

import { restoreVercelApiPath } from "../src/vercel-request.js";

test("restores a rewritten nested API path without losing OAuth query parameters", () => {
  assert.equal(
    restoreVercelApiPath("/api?route=auth%2Fspotify%2Fcallback&code=abc&state=xyz"),
    "/api/auth/spotify/callback?code=abc&state=xyz",
  );
});
