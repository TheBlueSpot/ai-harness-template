function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function averageBins(bins, start = 0, end = bins.length) {
  const slice = bins.slice(start, end);
  if (!slice.length) return 0;
  return slice.reduce((sum, value) => sum + value, 0) / (slice.length * 255);
}

export class VFXManager {
  constructor() {
    this.impactEvents = [];
    this.lastBeatPulse = 0;
  }

  pushEvent(event) {
    this.impactEvents.push({
      ...event,
      time: event.time ?? performance.now() / 1000,
    });
    if (this.impactEvents.length > 24) this.impactEvents.shift();
  }

  consumeEvents(currentTimeSeconds) {
    const active = [];
    this.impactEvents = this.impactEvents.filter((event) => {
      const age = currentTimeSeconds - event.time;
      if (age <= 0.9) {
        active.push({ ...event, age });
        return true;
      }
      return false;
    });
    return active;
  }

  createFrameState({ analyserBins = new Uint8Array(0), gameplayEvents = [], currentTimeSeconds = 0, hyperSpeed = {} } = {}) {
    const bins = analyserBins instanceof Uint8Array ? analyserBins : new Uint8Array(analyserBins);
    const low = averageBins(bins, 0, Math.max(1, Math.floor(bins.length * 0.14)));
    const mid = averageBins(bins, Math.floor(bins.length * 0.14), Math.floor(bins.length * 0.55));
    const high = averageBins(bins, Math.floor(bins.length * 0.55));
    const beatPulse = clamp01((hyperSpeed.noteDensityMultiplier ?? 1) * 0.22 + mid * 0.7);
    const impact = gameplayEvents.length ? clamp01(gameplayEvents.reduce((sum, event) => sum + (event.intensity ?? 0.35), 0) / gameplayEvents.length) : 0;
    const energy = clamp01(low * 0.55 + mid * 0.35 + high * 0.1 + impact * 0.2);
    const activeEvents = gameplayEvents.length ? gameplayEvents : this.consumeEvents(currentTimeSeconds);
    return {
      intensity: energy,
      beatPulse,
      glow: clamp01(high * 0.8 + impact * 0.5),
      laneFlash: clamp01(mid + impact * 0.3),
      impactBursts: activeEvents.map((event) => ({
        lane: event.lane ?? null,
        age: event.age ?? 0,
        intensity: clamp01(event.intensity ?? 0.5),
        kind: event.kind ?? "hit",
      })),
      backgroundHue: Math.round(180 + energy * 80),
      frequencyBins: Array.from(bins),
    };
  }
}
