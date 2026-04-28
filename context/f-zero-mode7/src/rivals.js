import { clamp } from "./math.js";

export class Rivals {
  constructor(track) {
    this.track = track;
    this.entries = [
      { name: "Phoenix", offset: 128, lane: -0.18, speed: 168, aggressiveness: 0.35 },
      { name: "Viper", offset: 312, lane: 0.1, speed: 176, aggressiveness: 0.55 },
      { name: "Comet", offset: 524, lane: -0.03, speed: 182, aggressiveness: 0.7 },
    ];
  }

  reset() {
    this.entries.forEach((entry, i) => {
      entry.progress = entry.offset;
      entry.lane = [-0.18, 0.1, -0.03][i];
      entry.speed = [168, 176, 182][i];
      entry.hitRecovery = 0;
    });
  }

  update(dt, player) {
    const opponents = this.entries;
    for (const rival of opponents) {
      const sample = this.track.sample(rival.progress);
      const nextSample = this.track.sample(rival.progress + 18);
      const curveTendency = sample.curve + nextSample.curve * 0.6;
      const targetLane = clamp(rival.lane - curveTendency * 12, -0.42, 0.42);
      rival.lane += (targetLane - rival.lane) * Math.min(1, dt * 1.7);
      rival.speed += (176 + sample.width * 8 - rival.speed) * dt * 0.55;
      rival.speed += sample.strip ? 4 : 0;
      rival.progress += rival.speed * dt;

      if (rival.hitRecovery > 0) {
        rival.hitRecovery = Math.max(0, rival.hitRecovery - dt);
      }
    }

    opponents.sort((a, b) => b.progress - a.progress);
  }
}
