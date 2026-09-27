export function createHostedContextProvider({ browserSessions, getUserContext }) {
  return async function hostedContextProvider(request, response) {
    const { sessionId, setCookie } = browserSessions.resolve(request.headers.cookie ?? "");
    if (setCookie) response.setHeader("set-cookie", setCookie);
    return getUserContext(sessionId);
  };
}
