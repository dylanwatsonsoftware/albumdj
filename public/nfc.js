const CARD_PREFIX = "physical-favourite:";

export function createAlbumCardRecord(albumId) {
  return {
    recordType: "text",
    data: `${CARD_PREFIX}${encodeURIComponent(albumId)}`,
  };
}

export function readAlbumId(message) {
  for (const record of message.records ?? []) {
    if (record.recordType !== "text") continue;
    const text = typeof record.data === "string"
      ? record.data
      : new TextDecoder(record.encoding || "utf-8").decode(record.data);
    if (text.startsWith(CARD_PREFIX)) {
      return decodeURIComponent(text.slice(CARD_PREFIX.length));
    }
  }
  return null;
}

export async function writeAlbumCard(albumId, { NDEFReader = globalThis.NDEFReader } = {}) {
  if (!NDEFReader) throw new Error("Web NFC is not available on this device.");
  const reader = new NDEFReader();
  await reader.write({ records: [createAlbumCardRecord(albumId)] });
}

export async function scanAlbumCards(onAlbumId, { NDEFReader = globalThis.NDEFReader } = {}) {
  if (!NDEFReader) throw new Error("Web NFC is not available on this device.");
  const reader = new NDEFReader();
  reader.addEventListener("reading", (event) => {
    const albumId = readAlbumId(event.message);
    if (albumId) onAlbumId(albumId);
  });
  await reader.scan();
  return reader;
}

