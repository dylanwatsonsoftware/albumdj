import test from "node:test";
import assert from "node:assert/strict";

import { getNavigationIntent, getNavigationState, sectionFromHash } from "../public/navigation.js";

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

test("routes shortcuts only to valid targets inside each section", () => {
  assert.deepEqual(getNavigationIntent("home", "album-search"), {
    section: "home",
    focusTarget: "album-search",
  });
  assert.deepEqual(getNavigationIntent("library", "favourite-artists"), {
    section: "library",
    focusTarget: "favourite-artists",
  });
  assert.deepEqual(getNavigationIntent("stack", "album-search"), {
    section: "stack",
    focusTarget: null,
  });
});
