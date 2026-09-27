import test from "node:test";
import assert from "node:assert/strict";

import { createFirebaseAdminFirestore } from "../src/firebase-admin.js";

test("initializes Firestore with server-only Firebase credentials", () => {
  const calls = [];
  const app = { name: "albumdj" };
  const firestore = { collection: () => {} };

  const result = createFirebaseAdminFirestore({
    projectId: "spin-stack-project",
    clientEmail: "firebase-admin@example.test",
    privateKey: "first-line\\nsecond-line",
    certImpl: (credentials) => {
      calls.push({ type: "cert", credentials });
      return "credential";
    },
    initializeAppImpl: (options) => {
      calls.push({ type: "initialize", options });
      return app;
    },
    getFirestoreImpl: (selectedApp) => {
      calls.push({ type: "firestore", app: selectedApp });
      return firestore;
    },
  });

  assert.equal(result, firestore);
  assert.deepEqual(calls, [
    {
      type: "cert",
      credentials: {
        projectId: "spin-stack-project",
        clientEmail: "firebase-admin@example.test",
        privateKey: "first-line\nsecond-line",
      },
    },
    {
      type: "initialize",
      options: { credential: "credential", projectId: "spin-stack-project" },
    },
    { type: "firestore", app },
  ]);
});

test("rejects incomplete Firebase credentials", () => {
  assert.throws(
    () => createFirebaseAdminFirestore({ projectId: "spin-stack-project" }),
    /Firebase is not configured/,
  );
});
