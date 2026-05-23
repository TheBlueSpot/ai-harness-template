export class HurdleSystem {
  constructor(config) {
    this.config = config;
    this.reset();
  }

  reset(seed = 0) {
    this.seed = seed;
    this.spawnCursor = 0;
    this.hurdles = [];
    this.lastCleared = -1;
  }

  nextRandom() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  update(dt, distance, ragdollSnapshot) {
    const spawnGap = this.config.hurdleGap ?? 18;
    const approach = this.config.hurdleSpawnAhead ?? 42;
    this.spawnCursor = Math.max(this.spawnCursor, distance);

    while (this.hurdles.length === 0 || this.hurdles[this.hurdles.length - 1].distance - this.spawnCursor < approach) {
      const last = this.hurdles[this.hurdles.length - 1];
      const base = last ? last.distance + spawnGap : this.spawnCursor + approach;
      this.hurdles.push({
        id: this.hurdles.length,
        distance: base + (this.nextRandom() - 0.5) * 3,
        width: this.config.hurdleWidth ?? 1.2,
        height: this.config.hurdleHeight ?? 1.05,
        resolved: false,
      });
      if (this.hurdles.length > 32) break;
    }

    const active = [];
    for (const hurdle of this.hurdles) {
      const relative = hurdle.distance - distance;
      if (relative < -Math.max(1, hurdle.width) && !hurdle.resolved) {
        hurdle.resolved = true;
        hurdle.hit = true;
        hurdle.hitReason = "late";
      }
      if (relative < -5) continue;
      if (hurdle.resolved) continue;

      const inWindow = Math.abs(relative) <= hurdle.width * 0.7;
      if (inWindow && ragdollSnapshot) {
        const torsoLean = Math.abs(ragdollSnapshot.leanAngle ?? ragdollSnapshot.lean ?? 0);
        const torsoHeight = ragdollSnapshot.torsoHeight ?? 0;
        const legTiming = ragdollSnapshot.legSplit ?? 0;
        const clearanceNeed = this.config.hurdleClearanceLean ?? 0.7;
        const posted =
          torsoLean < clearanceNeed &&
          torsoHeight >= (this.config.hurdleTorsoClearance ?? 110) &&
          legTiming >= (this.config.hurdleTimingSplit ?? 28);
        if (!posted) {
          hurdle.resolved = true;
          hurdle.hit = true;
          hurdle.hitReason = "hurdle";
        } else {
          hurdle.resolved = true;
          hurdle.cleared = true;
        }
      }
      active.push({ ...hurdle, relative });
    }

    this.hurdles = active;
    return this.getActiveHurdles();
  }

  getActiveHurdles() {
    return this.hurdles.map((hurdle) => ({ ...hurdle }));
  }
}
