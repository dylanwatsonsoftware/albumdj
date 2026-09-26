import test from "node:test";
import assert from "node:assert/strict";

import {
  createAlbumCardRecord,
  readAlbumId,
  scanAlbumCards,
  writeAlbumCard,
} from "../public/nfc.js";

test("encodes an album id as a portable NFC text record", () => {
  assert.deepEqual(createAlbumCardRecord("album/with spaces"), {
    recordType: "text",
    data: "physical-favourite:album%2Fwith%20spaces",
  });
});

test("reads an album id from an NFC message", () => {
  const message = {
    records: [{
      recordType: "text",
      encoding: "utf-8",
      data: new TextEncoder().encode("physical-favourite:album%2Fwith%20spaces"),
    }],
  };

  assert.equal(readAlbumId(message), "album/with spaces");
});

test("ignores NFC records that do not belong to Physical Favourites", () => {
  const message = {
    records: [{ recordType: "text", data: new TextEncoder().encode("hello") }],
  };

  assert.equal(readAlbumId(message), null);
});

test("writes the selected album to an NFC card", async () => {
  let written;
  class NDEFReader {
    async write(message) { written = message; }
  }

  await writeAlbumCard("album-1", { NDEFReader });

  assert.deepEqual(written, {
    records: [{ recordType: "text", data: "physical-favourite:album-1" }],
  });
});

test("starts an NFC scan and forwards recognised album ids", async () => {
  let reader;
  class NDEFReader {
    constructor() { reader = this; }
    addEventListener(type, listener) { this[type] = listener; }
    async scan() { this.started = true; }
  }
  const albums = [];

  await scanAlbumCards((albumId) => albums.push(albumId), { NDEFReader });
  reader.reading({
    message: {
      records: [{ recordType: "text", data: new TextEncoder().encode("physical-favourite:album-1") }],
    },
  });

  assert.equal(reader.started, true);
  assert.deepEqual(albums, ["album-1"]);
});

