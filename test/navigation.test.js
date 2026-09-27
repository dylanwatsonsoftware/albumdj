import test from "node:test";
import assert from "node:assert/strict";

import {
  artistBackAction,
  buildArtistHash,
  getNavigationIntent,
  getNavigationState,
  routeFromHash,
  sectionFromHash,
  writeNavigationHistory,
} from "../public/navigation.js";

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

test("round trips an artist discography through a shareable hash route", () => {
  const hash = buildArtistHash({ id: "artist/with spaces", name: "Boy & Bear" });

  assert.equal(hash, "#artist/artist%2Fwith%20spaces?name=Boy+%26+Bear");
  assert.deepEqual(routeFromHash(hash), {
    section: "home",
    view: "artist",
    artist: { id: "artist/with spaces", name: "Boy & Bear" },
  });
  assert.equal(sectionFromHash(hash), "home");
});

test("writes app navigation as browser history instead of replacing the current page", () => {
  const calls = [];
  const history = {
    pushState: (...args) => calls.push(["push", ...args]),
    replaceState: (...args) => calls.push(["replace", ...args]),
  };

  writeNavigationHistory(history, "#stack");
  writeNavigationHistory(history, "#home", { replace: true });

  assert.deepEqual(calls, [
    ["push", { albumDj: true }, "", "#stack"],
    ["replace", { albumDj: true }, "", "#home"],
  ]);
});

test("returns through app history from an artist page and falls back home for a direct link", () => {
  assert.equal(artistBackAction({ albumDj: true, returnHash: "#library" }), "back");
  assert.equal(artistBackAction({ albumDj: true }), "home");
  assert.equal(artistBackAction(null), "home");
});
