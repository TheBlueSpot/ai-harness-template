function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class HyperSpeedController {
  constructor({ baseMultiplier = 1, minMultiplier = 0.75, maxMultiplier = 2.5 } = {}) {
    this.baseMultiplier = baseMultiplier;
    this.minMultiplier = minMultiplier;
    this.maxMultiplier = maxMultiplier;
    this.history = [];
    this.windowSize = 24;
    this.multiplier = baseMultiplier;
    this.effectiveBpm = 0;
    this.noteDensityScale = 1;
  }

  reset(bpm = 0) {
    this.history = [];
    this.multiplier = this.baseMultiplier;
    this.effectiveBpm = bpm;
    this.noteDensityScale = 1;
  }

  recordJudgement(judgement) {
    const score = judgement === "Perfect" ? 1 : judgement === "Great" ? 0.8 : judgement === "Poor" ? 0.45 : 0;
    this.history.push(score);
    if (this.history.length > this.windowSize) this.history.shift();
    const average = this.history.reduce((sum, value) => sum + value, 0) / this.history.length;
    const target = this.baseMultiplier + average * 1.4;
    this.multiplier = clamp(target, this.minMultiplier, this.maxMultiplier);
  }

  update({ bpm = this.effectiveBpm, density = 1 } = {}) {
    this.effectiveBpm = bpm * this.multiplier;
    this.noteDensityScale = clamp(density * (0.9 + this.multiplier * 0.15), 0.5, 3);
    return this.getState();
  }

  getState() {
    return {
      multiplier: this.multiplier,
      effectiveBpm: this.effectiveBpm,
      noteDensityScale: this.noteDensityScale,
      rollingAccuracy: this.history.length
        ? this.history.reduce((sum, value) => sum + value, 0) / this.history.length
        : 0,
    };
  }
}
