import test from "node:test";
import assert from "node:assert/strict";

import { createHostedContextProvider } from "../src/hosted-context.js";

test("sets a browser session cookie and resolves its isolated user context", async () => {
  const calls = [];
  const provider = createHostedContextProvider({
    browserSessions: {
      resolve: () => ({ sessionId: "browser-1", setCookie: "pf_session=signed; HttpOnly" }),
    },
    getUserContext: async (sessionId) => ({ sessionId }),
  });
  const response = { setHeader: (name, value) => calls.push([name, value]) };

  const context = await provider({ headers: {} }, response);

  assert.deepEqual(context, { sessionId: "browser-1" });
  assert.deepEqual(calls, [["set-cookie", "pf_session=signed; HttpOnly"]]);
});
