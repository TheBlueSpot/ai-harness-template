function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class NoteSequencer {
  constructor({ chart = null, bpm = 120, noteDensity = 1, leadInSeconds = 2.5 } = {}) {
    this.chart = chart;
    this.baseBpm = bpm;
    this.noteDensity = noteDensity;
    this.leadInSeconds = leadInSeconds;
    this.activeChart = null;
  }

  loadChart(chartData) {
    this.activeChart = chartData ?? null;
    if (chartData?.bpm) this.baseBpm = chartData.bpm;
    if (typeof chartData?.noteDensity === "number") this.noteDensity = chartData.noteDensity;
    return this.activeChart;
  }

  getEffectiveBpm(hyperSpeed = {}) {
    const bpmMultiplier = hyperSpeed.bpmMultiplier ?? hyperSpeed.speedMultiplier ?? 1;
    return this.baseBpm * clamp(bpmMultiplier, 0.5, 4);
  }

  getEffectiveNoteDensity(hyperSpeed = {}) {
    const densityMultiplier = hyperSpeed.noteDensityMultiplier ?? hyperSpeed.densityMultiplier ?? 1;
    return this.noteDensity * clamp(densityMultiplier, 0.5, 4);
  }

  getVisibleWindow(currentTimeSeconds, hyperSpeed = {}) {
    const effectiveBpm = this.getEffectiveBpm(hyperSpeed);
    const beatsPerSecond = effectiveBpm / 60;
    const density = this.getEffectiveNoteDensity(hyperSpeed);
    const noteLeadSeconds = this.leadInSeconds / clamp(density, 0.5, 4);
    const lookBehindSeconds = Math.max(1, 1.5 / Math.max(beatsPerSecond, 0.001));
    const chart = this.activeChart ?? this.chart ?? { notes: [] };
    const notes = chart.notes ?? [];
    const visibleNotes = notes.filter((note) => note.time >= currentTimeSeconds - lookBehindSeconds && note.time <= currentTimeSeconds + noteLeadSeconds);
    return {
      currentTimeSeconds,
      effectiveBpm,
      effectiveNoteDensity: density,
      windowStartSeconds: currentTimeSeconds - lookBehindSeconds,
      windowEndSeconds: currentTimeSeconds + noteLeadSeconds,
      visibleNotes,
    };
  }

  getSlices(currentTimeSeconds, hyperSpeed = {}) {
    const window = this.getVisibleWindow(currentTimeSeconds, hyperSpeed);
    return window.visibleNotes.map((note) => ({
      id: note.id,
      lane: note.lane,
      time: note.time,
      duration: note.duration ?? 0,
      hitWindowMs: note.hitWindowMs ?? 90,
      sustain: (note.duration ?? 0) > 0,
      type: note.type ?? "tap",
    }));
  }

  getNextBeatTime(currentTimeSeconds, hyperSpeed = {}) {
    const bpm = this.getEffectiveBpm(hyperSpeed);
    const beatLength = 60 / Math.max(1, bpm);
    return Math.ceil(currentTimeSeconds / beatLength) * beatLength;
  }
}
