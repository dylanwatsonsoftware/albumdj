import test from "node:test";
import assert from "node:assert/strict";

import { createPlaybackMonitor } from "../public/live-playback.js";

test("loads current playback immediately and on each polling interval", async () => {
  let intervalCallback;
  let requestCount = 0;
  const states = [];
  const monitor = createPlaybackMonitor({
    request: async () => ({ isPlaying: requestCount++ === 0 }),
    onPlayback: (playback) => states.push(playback),
    setIntervalImpl: (callback, milliseconds) => {
      intervalCallback = callback;
      assert.equal(milliseconds, 5_000);
      return 7;
    },
    clearIntervalImpl: () => {},
  });

  await monitor.refresh();
  await intervalCallback();

  assert.deepEqual(states, [{ isPlaying: true }, { isPlaying: false }]);
});

test("stops the current-playback polling interval", () => {
  let cleared;
  const monitor = createPlaybackMonitor({
    request: async () => null,
    onPlayback: () => {},
    setIntervalImpl: () => 12,
    clearIntervalImpl: (timer) => { cleared = timer; },
  });

  monitor.stop();

  assert.equal(cleared, 12);
});
