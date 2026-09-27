import { createBrowserSessions } from "../src/browser-session.js";
import { createHostedContextProvider } from "../src/hosted-context.js";
import { createPrototypeHandler } from "../src/server.js";
import { createSupabaseUserStore } from "../src/supabase-user-store.js";
import { createUserContextProvider } from "../src/user-context.js";
import { restoreVercelApiPath } from "../src/vercel-request.js";

const userStore = createSupabaseUserStore({
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
const browserSessions = createBrowserSessions({ secret: process.env.SESSION_SECRET });
const getUserContext = createUserContextProvider({
  userStore,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI,
});
const contextProvider = createHostedContextProvider({ browserSessions, getUserContext });
const prototypeHandler = createPrototypeHandler({ contextProvider });

export default function handler(request, response) {
  request.url = restoreVercelApiPath(request.url);
  return prototypeHandler(request, response);
}
