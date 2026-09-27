export function moveCoverFlowIndex(currentIndex, delta, albumCount) {
  if (!albumCount) return 0;
  return Math.max(0, Math.min(albumCount - 1, currentIndex + delta));
}

export function getCoverFlowHost(section) {
  return section === "stack" ? "stack" : "home";
}

function clampCoverFlowPosition(position, albumCount) {
  if (!albumCount) return 0;
  return Math.max(0, Math.min(albumCount - 1, position));
}

export function getCoverFlowDragPosition({ startIndex, displacementX, albumCount, spacing }) {
  return clampCoverFlowPosition(startIndex - displacementX / spacing, albumCount);
}

function tidy(value) {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function getCoverFlowTransform(offset, { centreGap = 150, sideSpacing = 55 } = {}) {
  const distance = Math.abs(offset);
  const direction = Math.sign(offset);
  const centreTransition = Math.min(distance, 1);
  const sideDistance = Math.max(0, distance - 1);
  return {
    x: tidy(direction * (centreGap * centreTransition + sideSpacing * sideDistance)),
    z: tidy(-(120 * centreTransition + 18 * sideDistance)),
    turn: tidy(-direction * 62 * centreTransition),
    scale: tidy(Math.max(0.78, 1 - 0.1 * centreTransition - 0.025 * sideDistance)),
    opacity: tidy(Math.max(0.3, 1 - 0.14 * centreTransition - 0.14 * sideDistance)),
    order: 100 - Math.round(distance * 10),
  };
}

export function settleCoverFlowDrag({ position, velocityX, albumCount, spacing }) {
  const projectedPosition = position - (velocityX * 250) / spacing;
  return Math.round(clampCoverFlowPosition(projectedPosition, albumCount));
}

export function createCoverFlowFrameScheduler({ requestFrame, render }) {
  let scheduled = false;
  let latestPosition = 0;
  return function schedule(position) {
    latestPosition = position;
    if (scheduled) return;
    scheduled = true;
    requestFrame(() => {
      scheduled = false;
      render(latestPosition);
    });
  };
}

export function createCoverFlowReleaseScheduler({ requestFrame, settle }) {
  let releaseVersion = 0;
  function schedule() {
    const version = ++releaseVersion;
    requestFrame(() => {
      if (version === releaseVersion) settle();
    });
  }
  schedule.cancel = () => {
    releaseVersion += 1;
  };
  return schedule;
}

export function shouldRebuildCoverFlowWindow({ renderedIndexes, focusedIndex, albumCount, buffer = 2 }) {
  if (!renderedIndexes.length || !renderedIndexes.includes(focusedIndex)) return true;
  const first = renderedIndexes[0];
  const last = renderedIndexes.at(-1);
  if (first > 0 && focusedIndex < first + buffer) return true;
  if (last < albumCount - 1 && focusedIndex > last - buffer) return true;
  return false;
}

export function getCoverFlowWindow(albums, activeIndex, radius = 3) {
  const start = Math.max(0, activeIndex - radius);
  const end = Math.min(albums.length, activeIndex + radius + 1);
  return albums.slice(start, end).map((album, offset) => {
    const index = start + offset;
    return { album, index, offset: index - activeIndex };
  });
}
