export function moveCoverFlowIndex(currentIndex, delta, albumCount) {
  if (!albumCount) return 0;
  return Math.max(0, Math.min(albumCount - 1, currentIndex + delta));
}

function clampCoverFlowPosition(position, albumCount) {
  if (!albumCount) return 0;
  return Math.max(0, Math.min(albumCount - 1, position));
}

export function getCoverFlowDragPosition({ startIndex, displacementX, albumCount, spacing }) {
  return clampCoverFlowPosition(startIndex - displacementX / spacing, albumCount);
}

export function settleCoverFlowDrag({ position, velocityX, albumCount, spacing }) {
  const projectedPosition = position - (velocityX * 250) / spacing;
  return Math.round(clampCoverFlowPosition(projectedPosition, albumCount));
}

export function getCoverFlowWindow(albums, activeIndex, radius = 3) {
  const start = Math.max(0, activeIndex - radius);
  const end = Math.min(albums.length, activeIndex + radius + 1);
  return albums.slice(start, end).map((album, offset) => {
    const index = start + offset;
    return { album, index, offset: index - activeIndex };
  });
}
