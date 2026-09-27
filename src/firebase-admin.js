import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function createFirebaseAdminFirestore({
  projectId,
  clientEmail,
  privateKey,
  certImpl = cert,
  initializeAppImpl = initializeApp,
  getFirestoreImpl = getFirestore,
}) {
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase is not configured");
  const credential = certImpl({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });
  const app = initializeAppImpl({ credential, projectId });
  return getFirestoreImpl(app);
}
