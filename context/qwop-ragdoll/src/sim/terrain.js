export function createTerrain(options = {}) {
  const groundY = options.groundY ?? 730;
  const finishX = options.finishX ?? 3600;
  const startX = options.startX ?? 220;
  const bumps = Array.isArray(options.bumps) ? options.bumps : [];
  return {
    groundY,
    finishX,
    startX,
    bumps,
    sampleY(x) {
      let y = groundY;
      for (const bump of bumps) {
        const dx = Math.abs(x - bump.x);
        if (dx > bump.width) continue;
        const falloff = 1 - dx / bump.width;
        y -= bump.height * falloff * falloff;
      }
      return y;
    },
    reachedFinish(x) {
      return x >= finishX;
    },
  };
}

export function getTerrainProgress(terrain, x) {
  const span = Math.max(1, terrain.finishX - (terrain.startX ?? 0));
  return Math.max(0, Math.min(1, (x - (terrain.startX ?? 0)) / span));
}
