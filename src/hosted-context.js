export function createHostedContextProvider({ browserSessions, getUserContext }) {
  return async function hostedContextProvider(request, response) {
    const bearer = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ?? null;
    const nativeSessionId = bearer ? browserSessions.verify(bearer) : null;
    if (bearer && !nativeSessionId) return null;
    const { sessionId, setCookie } = nativeSessionId
      ? { sessionId: nativeSessionId, setCookie: null }
      : browserSessions.resolve(request.headers.cookie ?? "");
    if (setCookie) response.setHeader("set-cookie", setCookie);
    const context = await getUserContext(sessionId);
    if (!context || typeof browserSessions.issue !== "function") return context;
    return { ...context, sessionToken: browserSessions.issue(sessionId) };
  };
}
