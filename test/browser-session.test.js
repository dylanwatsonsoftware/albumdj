import test from "node:test";
import assert from "node:assert/strict";

import { createBrowserSessions } from "../src/browser-session.js";

test("creates a secure signed browser session cookie", () => {
  const sessions = createBrowserSessions({
    secret: "a sufficiently long test secret",
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
  });

  const result = sessions.resolve("");

  assert.equal(result.sessionId, "11111111-1111-4111-8111-111111111111");
  assert.match(result.setCookie, /^pf_session=11111111-1111-4111-8111-111111111111\./);
  assert.match(result.setCookie, /HttpOnly/);
  assert.match(result.setCookie, /Secure/);
  assert.match(result.setCookie, /SameSite=Lax/);
});

test("accepts a valid cookie and rejects a tampered session id", () => {
  const sessions = createBrowserSessions({
    secret: "a sufficiently long test secret",
    randomUUID: () => "22222222-2222-4222-8222-222222222222",
  });
  const created = sessions.resolve("");
  const cookie = created.setCookie.split(";", 1)[0];

  assert.deepEqual(sessions.resolve(cookie), {
    sessionId: "22222222-2222-4222-8222-222222222222",
    setCookie: null,
  });

  const tampered = cookie.replace("22222222", "33333333");
  const replaced = sessions.resolve(tampered);
  assert.notEqual(replaced.sessionId, "33333333-2222-4222-8222-222222222222");
  assert.ok(replaced.setCookie);
});

test("issues and verifies a signed token for a native client", () => {
  const sessions = createBrowserSessions({ secret: "a sufficiently long test secret" });

  const token = sessions.issue("browser-1");

  assert.equal(sessions.verify(token), "browser-1");
  assert.equal(sessions.verify(`${token}tampered`), null);
});
