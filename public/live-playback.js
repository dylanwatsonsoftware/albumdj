export function createPlaybackMonitor({
  request,
  onPlayback,
  onError = () => {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  initialVisible = true,
}) {
  let refreshPromise = null;
  let timer = null;
  let visible = initialVisible;
  let stopped = false;

  function clearScheduledRefresh() {
    if (timer === null) return;
    clearTimeoutImpl(timer);
    timer = null;
  }

  function scheduleRefresh(playback) {
    clearScheduledRefresh();
    if (stopped || !visible) return;
    const delay = playback?.isPlaying ? 30_000 : 120_000;
    timer = setTimeoutImpl(async () => {
      timer = null;
      await refresh();
    }, delay);
  }

  function refresh() {
    if (stopped || !visible) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const playback = await request("/api/spotify/playback");
        onPlayback(playback);
        scheduleRefresh(playback);
      } catch (error) {
        onError(error);
        scheduleRefresh(null);
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  return {
    refresh,
    setVisible(nextVisible) {
      if (visible === nextVisible) return Promise.resolve();
      visible = nextVisible;
      if (!visible) {
        clearScheduledRefresh();
        return Promise.resolve();
      }
      return refresh();
    },
    stop() {
      stopped = true;
      clearScheduledRefresh();
    },
  };
}
