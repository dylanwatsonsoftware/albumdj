import test from "node:test";
import assert from "node:assert/strict";

import { createPlaybackMonitor } from "../public/live-playback.js";

test("polls slowly and backs off further when Spotify is idle", async () => {
  const scheduled = [];
  let requestCount = 0;
  const states = [];
  const monitor = createPlaybackMonitor({
    request: async () => ({ isPlaying: requestCount++ === 0 }),
    onPlayback: (playback) => states.push(playback),
    setTimeoutImpl: (callback, milliseconds) => {
      scheduled.push({ callback, milliseconds });
      return scheduled.length;
    },
    clearTimeoutImpl: () => {},
  });

  await monitor.refresh();
  await scheduled.shift().callback();

  assert.deepEqual(states, [{ isPlaying: true }, { isPlaying: false }]);
  assert.deepEqual(scheduled.map(({ milliseconds }) => milliseconds), [120_000]);
});

test("pauses polling while hidden and refreshes once when visible again", async () => {
  let timerId = 0;
  const cleared = [];
  let requests = 0;
  const monitor = createPlaybackMonitor({
    request: async () => { requests += 1; return null; },
    onPlayback: () => {},
    setTimeoutImpl: () => ++timerId,
    clearTimeoutImpl: (timer) => { cleared.push(timer); },
  });

  await monitor.refresh();
  monitor.setVisible(false);
  await monitor.setVisible(true);
  monitor.stop();

  assert.equal(requests, 2);
  assert.deepEqual(cleared, [1, 2]);
});
