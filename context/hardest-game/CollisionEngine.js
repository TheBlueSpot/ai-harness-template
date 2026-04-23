function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function applyGridSnap(position, gridSize, enabled) {
  if (!enabled) {
    return { x: position.x, y: position.y };
  }
  const safeGrid = Math.max(1, Math.floor(gridSize || 1));
  return {
    x: Math.round(position.x / safeGrid) * safeGrid,
    y: Math.round(position.y / safeGrid) * safeGrid
  };
}

export function buildPlayerHitbox(playerState) {
  return {
    x: playerState.x,
    y: playerState.y,
    w: playerState.size,
    h: playerState.size
  };
}

function resolveObstaclePosition(obstacle, frame) {
  const loopLength = Math.max(1, Math.floor(obstacle.loopLength || obstacle.path?.xFrames?.length || 1));
  const loopFrame = ((Math.floor(frame) % loopLength) + loopLength) % loopLength;
  if (obstacle.path?.getFrame) {
    return obstacle.path.getFrame(loopFrame);
  }
  return { x: obstacle.x ?? 0, y: obstacle.y ?? 0 };
}

export function sampleObstacleHitboxes(level, frame) {
  const obstacles = Array.isArray(level?.obstacles) ? level.obstacles : [];
  return obstacles.map((obstacle) => {
    const position = resolveObstaclePosition(obstacle, frame);
    return {
      id: obstacle.id,
      color: obstacle.color,
      x: position.x,
      y: position.y,
      w: obstacle.size?.w ?? obstacle.w ?? 0,
      h: obstacle.size?.h ?? obstacle.h ?? 0
    };
  });
}

export function detectPixelOverlap(playerBox, obstacleHitboxes) {
  for (const obstacle of obstacleHitboxes || []) {
    if (rectsOverlap(playerBox, obstacle)) {
      return true;
    }
  }
  return false;
}

export function detectWallOverlap(playerBox, walls) {
  for (const wall of walls || []) {
    if (rectsOverlap(playerBox, wall)) {
      return true;
    }
  }
  return false;
}
