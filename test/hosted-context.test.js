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

test("resolves a native bearer token without creating a browser cookie", async () => {
  const calls = [];
  const provider = createHostedContextProvider({
    browserSessions: {
      verify: (token) => token === "signed-native-token" ? "native-1" : null,
      issue: (sessionId) => `issued-${sessionId}`,
      resolve: () => { throw new Error("Bearer requests must not create browser sessions"); },
    },
    getUserContext: async (sessionId) => ({ sessionId }),
  });
  const response = { setHeader: (name, value) => calls.push([name, value]) };

  const context = await provider({ headers: { authorization: "Bearer signed-native-token" } }, response);

  assert.deepEqual(context, { sessionId: "native-1", sessionToken: "issued-native-1" });
  assert.deepEqual(calls, []);
});
