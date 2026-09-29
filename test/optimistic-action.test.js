import test from "node:test";
import assert from "node:assert/strict";

import { runOptimisticAction } from "../public/optimistic-action.js";

test("applies visible state before persistence completes and reconciles the response", async () => {
  let state = "before";
  let finishPersistence;
  const persistence = new Promise((resolve) => { finishPersistence = resolve; });

  const action = runOptimisticAction({
    apply: () => { state = "optimistic"; },
    persist: () => persistence,
    reconcile: (saved) => { state = saved; },
    rollback: () => { state = "before"; },
  });

  assert.equal(state, "optimistic");
  finishPersistence("confirmed");
  assert.deepEqual(await action, { ok: true, value: "confirmed" });
  assert.equal(state, "confirmed");
});

test("rolls visible state back and reports a failed persistence", async () => {
  let state = "before";
  let reportedError;
  const failure = new Error("Network unavailable");

  const result = await runOptimisticAction({
    apply: () => { state = "optimistic"; },
    persist: async () => { throw failure; },
    reconcile: (saved) => { state = saved; },
    rollback: () => { state = "before"; },
    onError: (error) => { reportedError = error; },
  });

  assert.deepEqual(result, { ok: false, error: failure });
  assert.equal(state, "before");
  assert.equal(reportedError, failure);
});
