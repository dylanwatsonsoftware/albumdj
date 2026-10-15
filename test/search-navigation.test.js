import test from "node:test";
import assert from "node:assert/strict";
import { createSearchNavigation } from "../public/search-navigation.js";
import { routeFromHash } from "../public/navigation.js";

function fixture(load = async (query) => ({ albums: [{ title: query }] })) {
  const location = { hash: "#home" };
  const entries = ["#home"];
  let index = 0;
  const history = {
    pushState(_state, _title, hash) { entries.splice(++index); entries.push(hash); location.hash = hash; },
  };
  const ui = {};
  const navigation = createSearchNavigation({
    history, location, load,
    onQuery(query) { ui.query = query; },
    onResults(results, query) { ui.results = results; ui.heading = query; },
    onError(error) { ui.error = error.message; },
    onLoading(loading) { ui.loading = loading; },
    onClear() { ui.query = ""; ui.results = null; },
  });
  async function restore() {
    const route = routeFromHash(location.hash);
    if (route.view === "search") await navigation.show(route.query, { updateHash: false });
    else navigation.reset();
  }
  return { ui, entries, location, navigation,
    back: async () => { location.hash = entries[--index]; await restore(); },
    forward: async () => { location.hash = entries[++index]; await restore(); },
  };
}

test("searches create shareable entries and back/forward restores results without new entries", async () => {
  const f = fixture();
  await f.navigation.show("First");
  await f.navigation.show("Second");
  assert.deepEqual(f.entries, ["#home", "#search?q=First", "#search?q=Second"]);
  await f.back();
  assert.equal(f.ui.query, "First");
  assert.equal(f.ui.results.albums[0].title, "First");
  await f.back();
  assert.equal(f.ui.query, "");
  assert.equal(f.ui.results, null);
  await f.forward();
  assert.equal(f.ui.heading, "First");
  assert.equal(f.entries.length, 3);
  await f.navigation.show("First");
  assert.equal(f.entries.length, 3);
});

test("direct search links restore their query and results without adding history", async () => {
  const f = fixture();
  f.location.hash = "#search?q=Boy+%26+Bear";
  await f.navigation.show(routeFromHash(f.location.hash).query, { updateHash: false });
  assert.equal(f.ui.query, "Boy & Bear");
  assert.equal(f.ui.results.albums[0].title, "Boy & Bear");
  assert.deepEqual(f.entries, ["#home"]);
});

test("an old search cannot overwrite a later search or clear its loading indicator", async () => {
  const pending = new Map();
  const f = fixture((query) => new Promise((resolve, reject) => pending.set(query, { resolve, reject })));
  const first = f.navigation.show("First");
  const second = f.navigation.show("Second");
  pending.get("First").reject(new Error("Old error"));
  await first;
  assert.equal(f.ui.loading, true);
  assert.equal(f.ui.error, undefined);
  pending.get("Second").resolve({ albums: [{ title: "Second" }] });
  await second;
  assert.equal(f.ui.heading, "Second");
  assert.equal(f.ui.loading, false);
});

test("leaving search prevents pending responses from repopulating Home", async () => {
  let resolve;
  const f = fixture(() => new Promise((r) => { resolve = r; }));
  const request = f.navigation.show("First");
  f.navigation.reset();
  resolve({ albums: [{ title: "First" }] });
  await request;
  assert.equal(f.ui.results, null);
  assert.equal(f.ui.loading, false);
});

test("failed searches finish loading and expose an actionable error", async () => {
  const f = fixture(async () => { throw new Error("Connect Spotify to search"); });
  await f.navigation.show("First");
  assert.equal(f.ui.error, "Connect Spotify to search");
  assert.equal(f.ui.loading, false);
});
