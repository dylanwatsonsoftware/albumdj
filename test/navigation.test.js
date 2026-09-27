import test from "node:test";
import assert from "node:assert/strict";

import { getNavigationState, sectionFromHash } from "../public/navigation.js";

test("opens only one recognised Album DJ section", () => {
  assert.deepEqual(getNavigationState("library"), {
    activeSection: "library",
    sections: {
      home: false,
      library: true,
      stack: false,
      devices: false,
    },
  });
});

test("falls back to Home for missing or unknown sections", () => {
  assert.equal(getNavigationState("settings").activeSection, "home");
  assert.equal(getNavigationState("").activeSection, "home");
});

test("reads an app section from a URL hash", () => {
  assert.equal(sectionFromHash("#stack"), "stack");
  assert.equal(sectionFromHash("#not-a-section"), "home");
});
