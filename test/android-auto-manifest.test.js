import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestUrl = new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url);
const descriptorUrl = new URL("../android/app/src/main/res/xml/automotive_app_desc.xml", import.meta.url);

test("Android Auto can discover Album DJ as an audio media app", async () => {
  const [manifest, descriptor] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(descriptorUrl, "utf8"),
  ]);

  assert.match(manifest, /android:appCategory="audio"/);
  assert.match(manifest, /android:name="com\.google\.android\.gms\.car\.application"/);
  assert.match(manifest, /android:name="androidx\.car\.app\.TintableAttributionIcon"/);
  assert.match(manifest, /android:name="android\.media\.browse\.MediaBrowserService"/);
  assert.match(descriptor, /<uses name="media"\s*\/>/);
});
