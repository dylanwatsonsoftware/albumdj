import { createHmac, randomUUID as secureRandomUUID, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "pf_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function parseCookies(cookieHeader = "") {
  return new Map(cookieHeader.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return [part.trim(), ""];
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
}

export function createBrowserSessions({ secret, randomUUID = secureRandomUUID, secure = true }) {
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET must contain at least 16 characters");

  function signature(sessionId) {
    return createHmac("sha256", secret).update(sessionId).digest("base64url");
  }

  function valid(value) {
    if (!value) return null;
    const separator = value.lastIndexOf(".");
    if (separator === -1) return null;
    const sessionId = value.slice(0, separator);
    const provided = Buffer.from(value.slice(separator + 1));
    const expected = Buffer.from(signature(sessionId));
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    return sessionId;
  }

  function issue(sessionId) {
    return `${sessionId}.${signature(sessionId)}`;
  }

  return {
    issue,
    verify(value) {
      return valid(value);
    },
    resolve(cookieHeader) {
      const sessionId = valid(parseCookies(cookieHeader).get(COOKIE_NAME));
      if (sessionId) return { sessionId, setCookie: null };

      const nextSessionId = randomUUID();
      const secureAttribute = secure ? "; Secure" : "";
      return {
        sessionId: nextSessionId,
        setCookie: `${COOKIE_NAME}=${issue(nextSessionId)}; Path=/; HttpOnly${secureAttribute}; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`,
      };
    },
  };
}
