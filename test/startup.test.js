import test from "node:test";
import assert from "node:assert/strict";

import { parseApiResponse, startupFailureMessage } from "../public/startup.js";

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
