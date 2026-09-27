import { createBrowserSessions } from "../src/browser-session.js";
import { createFirebaseAdminFirestore } from "../src/firebase-admin.js";
import { createFirebaseUserStore } from "../src/firebase-user-store.js";
import { createHostedContextProvider } from "../src/hosted-context.js";
import { createPrototypeHandler } from "../src/server.js";
import { createUserContextProvider } from "../src/user-context.js";
import { restoreVercelApiPath } from "../src/vercel-request.js";

const firestore = createFirebaseAdminFirestore({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY,
});
const userStore = createFirebaseUserStore({ firestore });
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
