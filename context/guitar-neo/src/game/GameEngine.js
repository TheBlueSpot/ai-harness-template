import { ScoreEngine } from "./ScoreEngine.js";
import { HyperSpeedController } from "./HyperSpeedController.js";
import { FretBoardRenderer } from "./FretBoardRenderer.js";
import { InputController } from "./InputController.js";
import { NoteSequencer } from "../audio/NoteSequencer.js";
import { AudioBufferHandler } from "../audio/AudioBufferHandler.js";
import { VFXManager } from "../vfx/VFXManager.js";
import { tracks as trackList } from "../data/tracks.js";

const laneMap = new Map([
  ["KeyD", 0],
  ["KeyF", 1],
  ["KeyJ", 2],
  ["KeyK", 3],
  ["Space", 4],
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveTrackFromList(trackInput, tracks) {
  if (typeof trackInput === "string") {
    return tracks.find((item) => item.id === trackInput) ?? tracks[0] ?? { id: trackInput, bpm: 120 };
  }
  if (trackInput && typeof trackInput === "object") return trackInput;
  return tracks[0] ?? { id: "track", bpm: 120 };
}

export class GameEngine {
  constructor({ sceneRoot, onSnapshot, onResults } = {}) {
    this.sceneRoot = sceneRoot;
    this.onSnapshot = onSnapshot;
    this.onResults = onResults;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.sceneRoot?.appendChild(this.canvas);
    this.renderer = new FretBoardRenderer(this.canvas);
    this.scoreEngine = new ScoreEngine();
    this.hyper = new HyperSpeedController();
    this.input = new InputController();
    this.input.bind(window);
    this.state = "idle";
    this.snapshot = this.createSnapshot();
    this.track = null;
    this.chart = [];
    this.pendingNotes = [];
    this.activeNotes = [];
    this.audio = null;
    this.vfx = null;
    this.startMicros = 0;
    this.pauseMicros = 0;
    this.paused = false;
    this.lastJudgementFeedback = this.createJudgementFeedback();
    this.frameHandle = 0;
    this.lastNow = 0;
    this.sequencer = null;
    this.emitSnapshot();
  }

  createJudgementFeedback({ judgement = "Ready", timing = "Center", offsetMs = null } = {}) {
    return {
      judgement,
      timing: typeof offsetMs === "number" ? `${timing} ${offsetMs}ms` : timing,
    };
  }

  updateJudgementFeedback(result, deltaMicros = null) {
    const absOffsetMs = typeof deltaMicros === "number" ? Math.round(Math.abs(deltaMicros) / 1000) : null;
    let timing = "Center";
    if (result.judgement === "Miss") {
      timing = result.late ? "Late" : "Miss";
    } else if (absOffsetMs != null && absOffsetMs > 10) {
      timing = result.late ? "Late" : "Early";
    }
    this.lastJudgementFeedback = this.createJudgementFeedback({
      judgement: result.judgement,
      timing,
      offsetMs: absOffsetMs,
    });
  }

  async loadTrack(trackInput) {
    this.stop();
    this.state = "loading";
    this.snapshot = this.createSnapshot();
    this.emitSnapshot();

    const track = resolveTrackFromList(trackInput, trackList);
    this.track = track;
    this.audio = new AudioBufferHandler();
    this.sequencer = new NoteSequencer();
    this.vfx = new VFXManager();
    if (!this.audio) throw new Error("Audio service unavailable");
    await this.audio.loadTrack(this.track);
    const chart = this.normalizeChart(this.track);
    this.chart = chart.notes.length > 0 ? chart : this.normalizeChart({ ...this.track, chart: this.buildFallbackChart(this.track) });
    this.sequencer?.loadChart?.(this.chart);
    this.pendingNotes = this.chart.notes.map((note) => ({ ...note, hit: false }));
    this.activeNotes = [];
    this.scoreEngine.reset();
    this.scoreEngine.registerChart(this.chart.notes);
    this.hyper.reset(this.track.bpm ?? 120);
    this.state = "ready";
    this.paused = false;
    this.lastJudgementFeedback = this.createJudgementFeedback({
      judgement: "Ready",
      timing: "Hit the line",
    });
    this.lastNow = 0;
    this.snapshot = this.createSnapshot();
    this.emitSnapshot();
    return this.track;
  }

  normalizeChart(track = {}) {
    const sourceChart = this.getTrackChartSource(track);
    const bpm = track?.bpm ?? sourceChart?.bpm ?? 120;
    const noteDensity = track?.noteDensity ?? sourceChart?.noteDensity ?? 1;
    const beatsToMicros = (beats) => (beats * 60000000) / bpm;
    const notes = this.asNoteList(sourceChart).map((note, index) => {
      const timeBeats = Number(note.time ?? note.hitTimeBeats ?? 0);
      const durationBeats = Number(note.duration ?? note.durationBeats ?? 0);
      return {
        id: note.id ?? `${track?.id ?? "track"}-${index}`,
        lane: clamp(Number(note.lane ?? 0), 0, 4),
        time: timeBeats,
        duration: durationBeats,
        hitTimeMicros: Math.round(note.hitTimeMicros ?? beatsToMicros(timeBeats)),
        durationMicros: Math.round(note.durationMicros ?? beatsToMicros(durationBeats)),
        weight: note.weight ?? 1,
        type: note.type ?? "tap",
      };
    });
    return { bpm, noteDensity, notes };
  }

  getTrackChartSource(track) {
    if (Array.isArray(track?.chart)) return { notes: track.chart };
    if (Array.isArray(track?.chart?.notes)) return track.chart;
    if (Array.isArray(track?.chart?.chart?.notes)) return track.chart.chart;
    if (Array.isArray(track?.notes)) return { notes: track.notes, bpm: track.bpm, noteDensity: track.noteDensity };
    return track?.chart ?? track;
  }

  asNoteList(chartSource) {
    if (Array.isArray(chartSource)) return chartSource;
    if (Array.isArray(chartSource?.notes)) return chartSource.notes;
    if (Array.isArray(chartSource?.chart?.notes)) return chartSource.chart.notes;
    return [];
  }

  buildFallbackChart(track) {
    const bpm = track?.bpm ?? 120;
    const beat = 60000000 / bpm;
    return {
      bpm,
      noteDensity: track?.noteDensity ?? 1,
      notes: Array.from({ length: 64 }, (_, index) => ({
        id: `n${index}`,
        lane: index % 5,
        time: 1.2 + index * 0.5,
        hitTimeMicros: 1200000 + index * beat * 0.5,
        weight: index % 8 === 0 ? 1.5 : 1,
        type: "tap",
      })),
    };
  }

  async start() {
    if (!this.track || !this.audio?.currentBuffer) {
      throw new Error("Track not loaded");
    }
    if (!this.audio.isPlaying) {
      await this.audio.play(0);
    }
    this.state = "playing";
    const audioMicros = this.audio?.getCurrentTimeMicroseconds?.() ?? 0;
    this.startMicros = performance.now() * 1000 - audioMicros;
    this.lastNow = this.startMicros;
    this.schedule();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pauseMicros = performance.now() * 1000;
    cancelAnimationFrame(this.frameHandle);
    this.state = "paused";
    this.emitSnapshot();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const pausedFor = performance.now() * 1000 - this.pauseMicros;
    this.startMicros += pausedFor;
    this.state = "playing";
    this.schedule();
    this.emitSnapshot();
  }

  stop() {
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.audio?.stop?.();
    this.paused = false;
    this.state = "idle";
    this.startMicros = 0;
    this.pauseMicros = 0;
    this.lastNow = 0;
    this.lastJudgementFeedback = this.createJudgementFeedback();
    this.pendingNotes = [];
    this.activeNotes = [];
    this.snapshot = this.createSnapshot();
    this.emitSnapshot();
  }

  schedule() {
    this.frameHandle = requestAnimationFrame((time) => {
      this.update(time * 1000);
      if (!this.paused && this.state === "playing") this.schedule();
    });
  }

  update(frameTime) {
    if (this.state !== "playing") return this.emitSnapshot();
    const nowMicros = frameTime - this.startMicros;
    const dt = nowMicros - this.lastNow;
    this.lastNow = nowMicros;
    this.processInput(nowMicros);
    this.expireNotes(nowMicros);
    const density = (this.chart?.notes?.length ?? 0) / Math.max(1, this.track?.bpm ?? 120);
    const hyperState = this.hyper.update({ bpm: this.track?.bpm ?? 120, density });
    this.renderer.resize(this.sceneRoot?.clientWidth ?? 1280, this.sceneRoot?.clientHeight ?? 720);
    this.renderer.render({
      notes: this.pendingNotes.filter((note) => !note.hit),
      nowMicros,
      intensity: clamp(dt / 16000, 0, 1),
      hyperState,
      analyserBins: this.audio?.getFrequencyData?.() ?? [],
      activeLanes: [...this.input.held].map((code) => laneMap.get(code)).filter((lane) => lane != null),
    });
    this.emitSnapshot(nowMicros, hyperState);
    if (!this.pendingNotes.some((note) => !note.hit)) {
      this.finish(nowMicros);
    }
  }

  processInput(nowMicros) {
    let changed = false;
    for (const event of this.input.consume()) {
      if (event.type !== "down") continue;
      const lane = laneMap.get(event.code);
      if (lane == null) continue;
      const target = this.pendingNotes.find((note) => !note.hit && note.lane === lane);
      if (!target) continue;
      const deltaMicros = nowMicros - target.hitTimeMicros;
      const result = this.scoreEngine.judge(deltaMicros, target);
      target.hit = result.hit || result.judgement === "Poor";
      this.hyper.recordJudgement(result.judgement);
      this.updateJudgementFeedback(result, deltaMicros);
      changed = true;
      if (result.hit && this.vfx?.burst) this.vfx.burst(lane, result.judgement);
    }
    return changed;
  }

  expireNotes(nowMicros) {
    for (const note of this.pendingNotes) {
      if (note.hit) continue;
      if (nowMicros - note.hitTimeMicros > this.scoreEngine.windows.poor) {
        note.hit = true;
        const result = this.scoreEngine.missNote();
        this.hyper.recordJudgement(result.judgement);
        this.updateJudgementFeedback({ ...result, late: true }, nowMicros - note.hitTimeMicros);
      }
    }
  }

  finish(nowMicros) {
    if (this.state === "ended") return;
    this.audio?.stop?.();
    this.state = "ended";
    const results = this.getResults(nowMicros);
    this.snapshot = this.createSnapshot(nowMicros);
    this.onResults?.(results);
    this.emitSnapshot(nowMicros);
  }

  createSnapshot(nowMicros = 0, hyperState = this.hyper.getState()) {
    const chartNotes = this.chart?.notes ?? [];
    const results = this.state === "ended" ? this.getResults(nowMicros) : null;
    return {
      score: this.scoreEngine.score,
      combo: this.scoreEngine.combo,
      judgement: this.getJudgement(hyperState).judgement,
      timing: this.getJudgement(hyperState).timing,
      hyperSpeed: `${hyperState.multiplier.toFixed(2)}x`,
      intensity: clamp(hyperState.multiplier / 2, 0.1, 1),
      frequencyBins: this.audio?.getFrequencyData?.() ?? [],
      hyperState,
      timeMicros: nowMicros,
      noteCount: chartNotes.length,
      activeLanes: [...this.input.held].map((code) => laneMap.get(code)).filter((lane) => lane != null),
      results,
      state: this.state,
    };
  }

  getJudgement(hyperState = this.hyper.getState()) {
    if (this.state === "paused") return this.createJudgementFeedback({ judgement: "Paused", timing: "Resume tab" });
    if (this.state === "loading") return this.createJudgementFeedback({ judgement: "Loading", timing: "Track boot" });
    if (this.state === "ended") return this.createJudgementFeedback({ judgement: "Complete", timing: "Run clear" });
    if (this.state === "ready") return this.createJudgementFeedback({ judgement: "Ready", timing: "Hit the line" });
    return this.lastJudgementFeedback ?? this.createJudgementFeedback();
  }

  getSnapshot(nowMicros = 0, hyperState = this.hyper.getState()) {
    this.snapshot = this.createSnapshot(nowMicros, hyperState);
    return this.snapshot;
  }

  emitSnapshot(nowMicros = 0, hyperState = this.hyper.getState()) {
    this.onSnapshot?.(this.getSnapshot(nowMicros, hyperState));
  }

  getResults(nowMicros = 0) {
    return this.scoreEngine.getResults({
      durationMicros: nowMicros,
      hyperSpeed: this.hyper.getState(),
    });
  }
}
