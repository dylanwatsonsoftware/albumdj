export function createPlaybackMonitor({
  request,
  onPlayback,
  onError = () => {},
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
}) {
  let refreshing = false;

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      onPlayback(await request("/api/spotify/playback"));
    } catch (error) {
      onError(error);
    } finally {
      refreshing = false;
    }
  }

  const timer = setIntervalImpl(refresh, 5_000);
  return {
    refresh,
    stop() { clearIntervalImpl(timer); },
  };
}
