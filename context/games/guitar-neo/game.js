(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  function __accessProp(key) {
    return this[key];
  }
  var __toCommonJS = (from) => {
    var entry = (__moduleCache ??= new WeakMap).get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function") {
      for (var key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(entry, key))
          __defProp(entry, key, {
            get: __accessProp.bind(from, key),
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
          });
    }
    __moduleCache.set(from, entry);
    return entry;
  };
  var __moduleCache;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };
  var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

  // guitar-neo/src/data/tracks.js
  var exports_tracks = {};
  __export(exports_tracks, {
    tracks: () => tracks,
    default: () => tracks_default,
    assetManifest: () => assetManifest
  });
  function createChartNotes(trackId, { bpm, measures = 16, lanePattern = [0, 2, 1, 3, 0, 4, 2, 3], accentEvery = 6 } = {}) {
    const notes = [];
    const beatsPerMeasure = 4;
    const totalSteps = measures * beatsPerMeasure * 2;
    for (let step = 0;step < totalSteps; step += 1) {
      const lane = lanePattern[step % lanePattern.length];
      const beatTime = 1 + step * 0.5;
      const isAccent = step > 0 && step % accentEvery === 0;
      notes.push({
        id: `${trackId}-${String(step + 1).padStart(3, "0")}`,
        lane,
        time: beatTime,
        type: isAccent ? "hold" : "tap",
        duration: isAccent ? 0.5 : 0,
        weight: isAccent ? 1.3 : 1
      });
    }
    return {
      bpm,
      noteDensity: 1,
      notes
    };
  }
  var localAudioPath = (fileName) => new URL(`./assets/audio/${fileName}`, document.baseURI).href, assetManifest, tracks, tracks_default;
  var init_tracks = __esm(() => {
    assetManifest = {
      tracks: {
        "neo-drive": {
          sourceType: "public-domain-performance",
          title: "Moonlight Sonata, 1st movement",
          artist: "Ludwig van Beethoven",
          sourceUrl: localAudioPath("Moonlight Sonata.ogg"),
          provenance: "Public-domain composition with a Wikimedia Commons performance recording used as the browser audio source."
        },
        "glass-rain": {
          sourceType: "public-domain-performance",
          title: "Ode to Joy",
          artist: "Ludwig van Beethoven",
          sourceUrl: localAudioPath("Ode to Joy.ogg"),
          provenance: "Public-domain composition with a Wikimedia Commons performance recording used as the browser audio source."
        },
        afterburner: {
          sourceType: "public-domain-performance",
          title: "Butterfly",
          artist: "Edvard Grieg",
          sourceUrl: localAudioPath("Grieg+plays+Grieg+Butterfly+(1906).ogg"),
          provenance: "Public-domain composition with a historical Wikimedia Commons recording used as the browser audio source."
        }
      }
    };
    tracks = [
      {
        id: "neo-drive",
        title: "Moonlight Sonata",
        artist: "Ludwig van Beethoven",
        difficulty: "Pulse",
        bpm: 168,
        noteDensity: 1,
        durationSeconds: 32,
        audioUrl: assetManifest.tracks["neo-drive"].sourceUrl,
        sourceUrl: assetManifest.tracks["neo-drive"].sourceUrl,
        provenance: assetManifest.tracks["neo-drive"].provenance,
        source: assetManifest.tracks["neo-drive"],
        chart: createChartNotes("neo-drive", {
          bpm: 168,
          measures: 18,
          lanePattern: [0, 2, 1, 3, 0, 4, 2, 3],
          accentEvery: 8
        })
      },
      {
        id: "glass-rain",
        title: "Ode to Joy",
        artist: "Ludwig van Beethoven",
        difficulty: "Orbit",
        bpm: 182,
        noteDensity: 1.15,
        durationSeconds: 36,
        audioUrl: assetManifest.tracks["glass-rain"].sourceUrl,
        sourceUrl: assetManifest.tracks["glass-rain"].sourceUrl,
        provenance: assetManifest.tracks["glass-rain"].provenance,
        source: assetManifest.tracks["glass-rain"],
        chart: {
          ...createChartNotes("glass-rain", {
            bpm: 182,
            measures: 20,
            lanePattern: [1, 2, 3, 0, 2, 4, 1, 3],
            accentEvery: 7
          }),
          noteDensity: 1.15
        }
      },
      {
        id: "afterburner",
        title: "Butterfly",
        artist: "Edvard Grieg",
        difficulty: "Hyper",
        bpm: 204,
        noteDensity: 1.35,
        durationSeconds: 40,
        audioUrl: assetManifest.tracks["afterburner"].sourceUrl,
        sourceUrl: assetManifest.tracks["afterburner"].sourceUrl,
        provenance: assetManifest.tracks["afterburner"].provenance,
        source: assetManifest.tracks["afterburner"],
        chart: {
          ...createChartNotes("afterburner", {
            bpm: 204,
            measures: 22,
            lanePattern: [0, 3, 1, 2, 4, 2, 0, 3, 1, 4],
            accentEvery: 5
          }),
          noteDensity: 1.35
        }
      }
    ];
    tracks_default = tracks;
  });

  // guitar-neo/src/main.js
  var exports_main = {};
  __export(exports_main, {
    bootApp: () => bootApp,
    appReady: () => appReady,
    app: () => app
  });

  // guitar-neo/src/ui/MainMenu.js
  class MainMenu {
    constructor({ onSelectTrack, onStart }) {
      this.onSelectTrack = onSelectTrack;
      this.onStart = onStart;
      this.element = document.createElement("section");
      this.element.className = "panel panel-menu";
      this.element.innerHTML = `
      <div class="panel-head">
        <p class="eyebrow">guitar-neo</p>
        <h1>Arcade rhythm runner</h1>
        <p class="lede">Pick a track, arm the lane, and launch into the set.</p>
        <p class="menu-status" data-field="status"></p>
      </div>
      <div class="track-list" role="list"></div>
      <button class="primary-action" type="button">Start Set</button>
    `;
      this.trackList = this.element.querySelector(".track-list");
      this.startButton = this.element.querySelector(".primary-action");
      this.status = this.element.querySelector('[data-field="status"]');
      this.startButton.addEventListener("click", () => this.onStart?.());
    }
    render({ tracks = [], selectedTrackId, state = "menu", error = null } = {}) {
      const loading = state === "loading";
      const statusText = state === "loading" ? "Loading track..." : state === "paused" ? "Paused." : state === "error" ? `Track load failed.${error?.message ? ` ${error.message}` : ""}` : "";
      this.element.classList.toggle("is-hidden", !["menu", "loading", "paused", "error"].includes(state));
      this.startButton.disabled = loading;
      this.startButton.textContent = loading ? "Loading..." : "Start Set";
      this.status.textContent = statusText;
      this.trackList.replaceChildren();
      const list = Array.isArray(tracks) ? tracks : [];
      this.trackList.replaceChildren(...list.map((track) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `track-card${track.id === selectedTrackId ? " is-selected" : ""}`;
        button.disabled = loading;
        button.setAttribute("role", "listitem");
        button.innerHTML = `
          <strong>${track.title}</strong>
          <span>${track.artist}</span>
          <span>${track.difficulty} | ${track.bpm} BPM</span>
          <small>${track.provenance ?? "Procedural fallback"}</small>
        `;
        button.addEventListener("click", () => this.onSelectTrack?.(track.id));
        return button;
      }));
      this.element.dataset.state = state ?? "boot";
      this.element.dataset.selectedTrackId = selectedTrackId ?? "";
    }
  }

  // guitar-neo/src/ui/HUD.js
  class HUD {
    constructor() {
      this.element = document.createElement("section");
      this.element.className = "panel panel-hud";
      this.element.innerHTML = `
      <div class="hud-grid">
        <div><span>Score</span><strong data-field="score">0</strong></div>
        <div><span>Combo</span><strong data-field="combo">0</strong></div>
        <div><span>Judgement</span><strong data-field="judgement">-</strong></div>
        <div><span>Hyper-Speed</span><strong data-field="hyperSpeed">Idle</strong></div>
      </div>
    `;
      this.fields = {
        score: this.element.querySelector('[data-field="score"]'),
        combo: this.element.querySelector('[data-field="combo"]'),
        judgement: this.element.querySelector('[data-field="judgement"]'),
        hyperSpeed: this.element.querySelector('[data-field="hyperSpeed"]')
      };
    }
    render({ state, snapshot = {}, track } = {}) {
      const safeSnapshot = snapshot ?? {};
      const score = safeSnapshot.score ?? 0;
      const combo = safeSnapshot.combo ?? 0;
      const judgement = safeSnapshot.judgement ?? "-";
      const hyperSpeed = safeSnapshot.hyperSpeed ?? "Idle";
      this.element.classList.toggle("is-hidden", state !== "gameplay");
      this.fields.score.textContent = String(score);
      this.fields.combo.textContent = String(combo);
      this.fields.judgement.textContent = judgement;
      this.fields.hyperSpeed.textContent = hyperSpeed;
      this.element.dataset.track = track?.title ?? "";
      this.element.dataset.state = state ?? "boot";
    }
  }

  // guitar-neo/src/ui/SummaryScreen.js
  class SummaryScreen {
    constructor({ onReplay }) {
      this.onReplay = onReplay;
      this.element = document.createElement("section");
      this.element.className = "panel panel-summary";
      this.element.innerHTML = `
      <div class="panel-head">
        <p class="eyebrow">results</p>
        <h2>Set complete</h2>
      </div>
      <div class="summary-stats">
        <div><span>Score</span><strong data-field="score">0</strong></div>
        <div><span>Combo</span><strong data-field="combo">0</strong></div>
        <div><span>Best Combo</span><strong data-field="maxCombo">0</strong></div>
        <div><span>Accuracy</span><strong data-field="accuracy">0%</strong></div>
        <div><span>Perfect</span><strong data-field="perfect">0</strong></div>
        <div><span>Great</span><strong data-field="great">0</strong></div>
        <div><span>Miss</span><strong data-field="miss">0</strong></div>
      </div>
      <button class="primary-action" type="button">Replay</button>
    `;
      this.button = this.element.querySelector(".primary-action");
      this.button.addEventListener("click", () => this.onReplay?.());
      this.fields = {
        accuracy: this.element.querySelector('[data-field="accuracy"]'),
        perfect: this.element.querySelector('[data-field="perfect"]'),
        great: this.element.querySelector('[data-field="great"]'),
        miss: this.element.querySelector('[data-field="miss"]'),
        score: this.element.querySelector('[data-field="score"]'),
        combo: this.element.querySelector('[data-field="combo"]'),
        maxCombo: this.element.querySelector('[data-field="maxCombo"]')
      };
    }
    render({ visible, track, results } = {}) {
      this.element.classList.toggle("is-hidden", !visible);
      this.element.dataset.track = track?.title ?? "";
      const stats = results ?? {};
      this.fields.accuracy.textContent = `${Math.round(stats.accuracy ?? 0)}%`;
      this.fields.perfect.textContent = String(stats.breakdown?.perfect ?? 0);
      this.fields.great.textContent = String(stats.breakdown?.great ?? 0);
      this.fields.miss.textContent = String(stats.breakdown?.miss ?? 0);
      this.fields.score.textContent = String(stats.score ?? 0);
      this.fields.combo.textContent = String(stats.combo ?? 0);
      this.fields.maxCombo.textContent = String(stats.maxCombo ?? 0);
      this.element.dataset.visible = visible ? "true" : "false";
    }
  }

  // guitar-neo/src/ui/BackgroundScene.js
  class BackgroundScene {
    constructor(root) {
      this.root = root;
      this.root.innerHTML = `
      <div class="bg-layer bg-layer-a"></div>
      <div class="bg-layer bg-layer-b"></div>
      <div class="bg-energy"></div>
    `;
      this.energy = this.root.querySelector(".bg-energy");
    }
    render({ state, track, snapshot = {} }) {
      this.root.dataset.state = state;
      this.root.dataset.track = track?.title ?? "";
      const intensity = Math.max(0, Math.min(1, snapshot.intensity ?? (state === "gameplay" ? 0.45 : 0.15)));
      this.root.style.setProperty("--bg-intensity", intensity.toFixed(3));
      const bins = snapshot.frequencyBins ?? [];
      const activeBins = bins.slice(0, 16);
      const energy = activeBins.length ? activeBins.reduce((sum, value) => sum + value, 0) / activeBins.length : intensity;
      this.energy.style.transform = `scale(${1 + energy * 0.3})`;
      this.energy.style.opacity = String(0.18 + energy * 0.35);
    }
  }

  // guitar-neo/src/game/ScoreEngine.js
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class ScoreEngine {
    constructor({ perfectWindowMs = 35, greatWindowMs = 75, poorWindowMs = 140 } = {}) {
      this.windows = {
        perfect: perfectWindowMs * 1000,
        great: greatWindowMs * 1000,
        poor: poorWindowMs * 1000
      };
      this.reset();
    }
    reset() {
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.perfect = 0;
      this.great = 0;
      this.poor = 0;
      this.miss = 0;
      this.hits = 0;
      this.totalNotes = 0;
      this.totalWeight = 0;
      this.hitWeight = 0;
    }
    registerChart(notes = []) {
      this.totalNotes = notes.length;
      this.totalWeight = notes.reduce((sum, note) => sum + (note.weight ?? 1), 0) || notes.length || 1;
    }
    judge(deltaMicros, note = {}) {
      const absDelta = Math.abs(deltaMicros);
      const weight = note.weight ?? 1;
      let judgement = "Miss";
      let comboDelta = 0;
      let scoreDelta = 0;
      if (absDelta <= this.windows.perfect) {
        judgement = "Perfect";
        comboDelta = 1;
        scoreDelta = 1000 * weight;
        this.perfect += 1;
      } else if (absDelta <= this.windows.great) {
        judgement = "Great";
        comboDelta = 1;
        scoreDelta = 650 * weight;
        this.great += 1;
      } else if (absDelta <= this.windows.poor) {
        judgement = "Poor";
        comboDelta = 0;
        scoreDelta = 250 * weight;
        this.poor += 1;
      } else {
        this.miss += 1;
        this.combo = 0;
        return { judgement: "Miss", comboDelta: -this.combo, scoreDelta: 0, hit: false, late: deltaMicros > 0 };
      }
      this.hits += 1;
      this.hitWeight += weight;
      this.score += scoreDelta;
      this.combo = comboDelta ? this.combo + comboDelta : 0;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      return { judgement, comboDelta, scoreDelta, hit: true, late: deltaMicros > 0 };
    }
    missNote() {
      const previousCombo = this.combo;
      this.miss += 1;
      this.combo = 0;
      return { judgement: "Miss", comboDelta: -previousCombo, scoreDelta: 0, hit: false, late: false };
    }
    getAccuracy() {
      if (!this.totalWeight)
        return 0;
      const weightedHits = this.perfect * 1 + this.great * 0.75 + this.poor * 0.35;
      return clamp(weightedHits / this.totalWeight * 100, 0, 100);
    }
    getResults(extra = {}) {
      return {
        score: this.score,
        combo: this.combo,
        maxCombo: this.maxCombo,
        accuracy: this.getAccuracy(),
        breakdown: {
          perfect: this.perfect,
          great: this.great,
          poor: this.poor,
          miss: this.miss
        },
        counts: {
          hit: this.hits,
          total: this.totalNotes
        },
        ...extra
      };
    }
  }

  // guitar-neo/src/game/HyperSpeedController.js
  function clamp2(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class HyperSpeedController {
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
      if (this.history.length > this.windowSize)
        this.history.shift();
      const average = this.history.reduce((sum, value) => sum + value, 0) / this.history.length;
      const target = this.baseMultiplier + average * 1.4;
      this.multiplier = clamp2(target, this.minMultiplier, this.maxMultiplier);
    }
    update({ bpm = this.effectiveBpm, density = 1 } = {}) {
      this.effectiveBpm = bpm * this.multiplier;
      this.noteDensityScale = clamp2(density * (0.9 + this.multiplier * 0.15), 0.5, 3);
      return this.getState();
    }
    getState() {
      return {
        multiplier: this.multiplier,
        effectiveBpm: this.effectiveBpm,
        noteDensityScale: this.noteDensityScale,
        rollingAccuracy: this.history.length ? this.history.reduce((sum, value) => sum + value, 0) / this.history.length : 0
      };
    }
  }

  // guitar-neo/src/game/FretBoardRenderer.js
  function clamp3(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class FretBoardRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.laneCount = 5;
      this.laneLabels = ["D", "F", "J", "K", "SPACE"];
    }
    resize(width, height) {
      this.canvas.width = Math.max(1, Math.floor(width));
      this.canvas.height = Math.max(1, Math.floor(height));
    }
    projectLane(laneIndex, progress, sway = 0) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      const laneWidth = w / this.laneCount;
      const centerX = laneWidth * (laneIndex + 0.5);
      const curve = Math.sin(progress * Math.PI) * sway * w * 0.05;
      return {
        x: centerX + curve,
        y: h - clamp3(progress, 0, 1) * h,
        width: laneWidth * 0.82
      };
    }
    render({ notes = [], nowMicros = 0, intensity = 0, hyperState = {}, analyserBins = [], activeLanes = [] } = {}) {
      const ctx = this.ctx;
      const { width: w, height: h } = this.canvas;
      ctx.clearRect(0, 0, w, h);
      const laneCount = this.laneCount;
      const sway = clamp3((hyperState.multiplier ?? 1) - 1, 0, 1);
      const vibration = 1 + intensity * 0.35 + analyserBins.slice(0, 8).reduce((sum, n) => sum + n, 0) / 800;
      const strikeY = Math.max(112, h * 0.2);
      const activeLaneSet = new Set(activeLanes);
      const strikePulse = clamp5(0.52 + intensity * 0.28 + sway * 0.18, 0.52, 0.92);
      ctx.save();
      ctx.fillStyle = `rgba(248, 184, 78, ${0.08 + strikePulse * 0.12})`;
      ctx.fillRect(0, strikeY - 28, w, 56);
      ctx.strokeStyle = `rgba(248, 184, 78, ${0.42 + strikePulse * 0.24})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, strikeY);
      ctx.lineTo(w * 0.92, strikeY);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 241, 200, ${0.45 + strikePulse * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, strikeY);
      ctx.lineTo(w * 0.92, strikeY);
      ctx.stroke();
      ctx.restore();
      for (let i = 0;i < laneCount; i += 1) {
        const x = w / laneCount * (i + 0.5);
        ctx.strokeStyle = `rgba(160, 220, 255, ${0.12 + i * 0.04})`;
        ctx.lineWidth = 2 + sway;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + Math.sin(nowMicros / 180000 + i) * 18 * sway, h * 0.52, x, h);
        ctx.stroke();
        const laneActive = activeLaneSet.has(i);
        ctx.fillStyle = laneActive ? "rgba(248, 184, 78, 0.9)" : "rgba(8, 14, 24, 0.92)";
        ctx.strokeStyle = laneActive ? "rgba(255, 247, 210, 0.95)" : "rgba(248, 184, 78, 0.45)";
        ctx.lineWidth = laneActive ? 4 : 2;
        ctx.beginPath();
        ctx.roundRect(x - 42, strikeY - 18, 84, 36, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = laneActive ? "#051018" : "rgba(247, 244, 236, 0.92)";
        ctx.font = `700 ${Math.max(15, Math.floor(w * 0.013))}px Trebuchet MS`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.laneLabels[i] ?? String(i + 1), x, strikeY);
      }
      for (const note of notes) {
        const lead = note.hitTimeMicros - nowMicros;
        const progress = clamp3(1 - lead / 1800000, 0, 1.2);
        const lane = note.lane ?? 0;
        const projected = this.projectLane(lane, progress, sway);
        const radius = 12 + (note.weight ?? 1) * 4 * vibration;
        ctx.fillStyle = `hsla(${(lane * 58 + 190) % 360}, 95%, 65%, ${clamp3(progress, 0, 1)})`;
        ctx.beginPath();
        ctx.ellipse(projected.x, projected.y, radius, radius * 0.72, Math.sin(progress * Math.PI) * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // guitar-neo/src/game/InputController.js
  class InputController {
    constructor() {
      this.held = new Set;
      this.queue = [];
      this.bound = false;
      this.onInput = null;
    }
    bind(target = window) {
      if (this.bound)
        return;
      this.bound = true;
      this.target = target;
      this._down = (event) => {
        this.held.add(event.code);
        this.queue.push({ type: "down", code: event.code, timeStamp: event.timeStamp });
        this.onInput?.({ type: "down", code: event.code, timeStamp: event.timeStamp });
      };
      this._up = (event) => {
        this.held.delete(event.code);
        this.queue.push({ type: "up", code: event.code, timeStamp: event.timeStamp });
        this.onInput?.({ type: "up", code: event.code, timeStamp: event.timeStamp });
      };
      target.addEventListener("keydown", this._down);
      target.addEventListener("keyup", this._up);
    }
    unbind() {
      if (!this.bound)
        return;
      this.bound = false;
      this.target.removeEventListener("keydown", this._down);
      this.target.removeEventListener("keyup", this._up);
    }
    consume() {
      const events = this.queue.slice();
      this.queue.length = 0;
      return events;
    }
  }

  // guitar-neo/src/audio/NoteSequencer.js
  function clamp4(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  class NoteSequencer {
    constructor({ chart = null, bpm = 120, noteDensity = 1, leadInSeconds = 2.5 } = {}) {
      this.chart = chart;
      this.baseBpm = bpm;
      this.noteDensity = noteDensity;
      this.leadInSeconds = leadInSeconds;
      this.activeChart = null;
    }
    loadChart(chartData) {
      this.activeChart = chartData ?? null;
      if (chartData?.bpm)
        this.baseBpm = chartData.bpm;
      if (typeof chartData?.noteDensity === "number")
        this.noteDensity = chartData.noteDensity;
      return this.activeChart;
    }
    getEffectiveBpm(hyperSpeed = {}) {
      const bpmMultiplier = hyperSpeed.bpmMultiplier ?? hyperSpeed.speedMultiplier ?? 1;
      return this.baseBpm * clamp4(bpmMultiplier, 0.5, 4);
    }
    getEffectiveNoteDensity(hyperSpeed = {}) {
      const densityMultiplier = hyperSpeed.noteDensityMultiplier ?? hyperSpeed.densityMultiplier ?? 1;
      return this.noteDensity * clamp4(densityMultiplier, 0.5, 4);
    }
    getVisibleWindow(currentTimeSeconds, hyperSpeed = {}) {
      const effectiveBpm = this.getEffectiveBpm(hyperSpeed);
      const beatsPerSecond = effectiveBpm / 60;
      const density = this.getEffectiveNoteDensity(hyperSpeed);
      const noteLeadSeconds = this.leadInSeconds / clamp4(density, 0.5, 4);
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
        visibleNotes
      };
    }
    getSlices(currentTimeSeconds, hyperSpeed = {}) {
      const window2 = this.getVisibleWindow(currentTimeSeconds, hyperSpeed);
      return window2.visibleNotes.map((note) => ({
        id: note.id,
        lane: note.lane,
        time: note.time,
        duration: note.duration ?? 0,
        hitWindowMs: note.hitWindowMs ?? 90,
        sustain: (note.duration ?? 0) > 0,
        type: note.type ?? "tap"
      }));
    }
    getNextBeatTime(currentTimeSeconds, hyperSpeed = {}) {
      const bpm = this.getEffectiveBpm(hyperSpeed);
      const beatLength = 60 / Math.max(1, bpm);
      return Math.ceil(currentTimeSeconds / beatLength) * beatLength;
    }
  }

  // guitar-neo/src/audio/AudioBufferHandler.js
  var MICROSECONDS_PER_SECOND = 1e6;
  function toArrayBuffer(source) {
    if (source instanceof ArrayBuffer)
      return source;
    if (ArrayBuffer.isView(source)) {
      return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    }
    return null;
  }
  function createSilentBuffer(audioContext, durationSeconds = 1) {
    return audioContext.createBuffer(2, Math.max(1, Math.ceil(audioContext.sampleRate * durationSeconds)), audioContext.sampleRate);
  }
  function resolveLocalUrl(source) {
    if (typeof source !== "string" || !source.trim())
      return null;
    try {
      return new URL(source, document.baseURI).toString();
    } catch {
      return source;
    }
  }
  function createProceduralBuffer(audioContext, trackMeta = {}) {
    const durationSeconds = Math.max(8, trackMeta.durationSeconds ?? 32);
    const buffer = audioContext.createBuffer(2, Math.ceil(audioContext.sampleRate * durationSeconds), audioContext.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const baseFrequency = trackMeta.baseFrequency ?? 110;
    const pulseFrequency = trackMeta.bpm ? trackMeta.bpm / 60 : 2.5;
    for (let i = 0;i < left.length; i += 1) {
      const t = i / audioContext.sampleRate;
      const envelope = Math.min(1, t / 0.25) * Math.max(0, 1 - t / durationSeconds);
      const tone = Math.sin(2 * Math.PI * baseFrequency * t) * 0.22;
      const harmonic = Math.sin(2 * Math.PI * baseFrequency * 2 * t + 0.35) * 0.08;
      const pulse = Math.sin(2 * Math.PI * pulseFrequency * t) * 0.08;
      const shimmer = Math.sin(2 * Math.PI * (baseFrequency * 4) * t * 0.5) * 0.04;
      const sample = (tone + harmonic + pulse + shimmer) * envelope;
      left[i] = sample;
      right[i] = sample * 0.96;
    }
    return buffer;
  }

  class AudioBufferHandler {
    constructor({ audioContext, analyser } = {}) {
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.audioContext = audioContext ?? (AudioContextCtor ? new AudioContextCtor : null);
      this.analyser = analyser ?? (this.audioContext ? this.audioContext.createAnalyser() : null);
      this.sourceNode = null;
      this.currentBuffer = null;
      this.currentTrack = null;
      this.playbackStartedAt = 0;
      this.playbackOffsetSeconds = 0;
      this.pausedOffsetSeconds = 0;
      this.isPlaying = false;
      if (this.analyser) {
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.82;
        this.analyser.connect(this.audioContext.destination);
      }
    }
    async loadTrack(trackMeta) {
      this.currentTrack = trackMeta ?? null;
      if (!this.audioContext) {
        this.currentBuffer = {
          duration: Math.max(8, trackMeta?.durationSeconds ?? 32)
        };
        return this.currentBuffer;
      }
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      let buffer = null;
      const source = trackMeta?.audioUrl ?? trackMeta?.sourceUrl ?? trackMeta?.audioData ?? trackMeta?.source?.sourceUrl ?? null;
      const arrayBuffer = toArrayBuffer(source);
      if (arrayBuffer) {
        try {
          buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
        } catch (error) {
          throw new Error(`Unable to decode audio buffer for track ${trackMeta?.id ?? "unknown"}: ${error?.message ?? error}`);
        }
      } else if (typeof source === "string" && source) {
        const resolvedUrl = resolveLocalUrl(source);
        if (resolvedUrl?.startsWith("file:")) {
          buffer = createProceduralBuffer(this.audioContext, trackMeta ?? {});
        } else {
          try {
            const response = await fetch(resolvedUrl, { cache: "force-cache" });
            if (!response.ok) {
              throw new Error(`Unable to fetch audio asset for track ${trackMeta?.id ?? "unknown"}: ${response.status} ${response.statusText}`);
            }
            const bytes = await response.arrayBuffer();
            buffer = await this.audioContext.decodeAudioData(bytes);
          } catch (error) {
            buffer = createProceduralBuffer(this.audioContext, trackMeta ?? {});
          }
        }
      } else {
        buffer = createProceduralBuffer(this.audioContext, trackMeta ?? {});
      }
      this.currentBuffer = buffer ?? createSilentBuffer(this.audioContext);
      return this.currentBuffer;
    }
    createSource() {
      if (!this.audioContext || !this.currentBuffer)
        return null;
      const source = this.audioContext.createBufferSource();
      source.buffer = this.currentBuffer;
      if (this.analyser)
        source.connect(this.analyser);
      else
        source.connect(this.audioContext.destination);
      return source;
    }
    async play(offsetSeconds = 0) {
      if (!this.audioContext) {
        this.playbackOffsetSeconds = Math.max(0, offsetSeconds);
        this.playbackStartedAt = Date.now() / 1000 - this.playbackOffsetSeconds;
        this.isPlaying = true;
        return;
      }
      if (this.audioContext.state !== "running")
        await this.audioContext.resume();
      if (!this.currentBuffer)
        this.currentBuffer = createSilentBuffer(this.audioContext);
      if (this.sourceNode) {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      }
      this.sourceNode = this.createSource();
      if (!this.sourceNode)
        return;
      const startOffset = Math.max(0, offsetSeconds);
      this.playbackOffsetSeconds = startOffset;
      this.playbackStartedAt = this.audioContext.currentTime - startOffset;
      this.isPlaying = true;
      this.sourceNode.onended = () => {
        if (this.isPlaying) {
          this.isPlaying = false;
          this.pausedOffsetSeconds = this.getCurrentTimeMicroseconds() / MICROSECONDS_PER_SECOND;
        }
      };
      this.sourceNode.start(0, startOffset);
    }
    pause() {
      if (!this.audioContext || !this.isPlaying)
        return;
      this.pausedOffsetSeconds = this.getCurrentTimeMicroseconds() / MICROSECONDS_PER_SECOND;
      this.stop(false);
    }
    stop(resetOffset = true) {
      if (this.sourceNode) {
        try {
          this.sourceNode.stop();
        } catch {}
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      this.isPlaying = false;
      if (resetOffset)
        this.pausedOffsetSeconds = 0;
    }
    getCurrentTimeMicroseconds() {
      if (!this.audioContext) {
        if (!this.isPlaying)
          return Math.round(this.pausedOffsetSeconds * MICROSECONDS_PER_SECOND);
        const seconds2 = Math.max(0, Date.now() / 1000 - this.playbackStartedAt);
        return Math.round(seconds2 * MICROSECONDS_PER_SECOND);
      }
      if (!this.isPlaying)
        return Math.round(this.pausedOffsetSeconds * MICROSECONDS_PER_SECOND);
      const seconds = Math.max(0, this.audioContext.currentTime - this.playbackStartedAt);
      return Math.round(seconds * MICROSECONDS_PER_SECOND);
    }
    getFrequencyData() {
      if (!this.analyser)
        return new Uint8Array(0);
      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(bins);
      return bins;
    }
  }

  // guitar-neo/src/vfx/VFXManager.js
  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }
  function averageBins(bins, start = 0, end = bins.length) {
    const slice = bins.slice(start, end);
    if (!slice.length)
      return 0;
    return slice.reduce((sum, value) => sum + value, 0) / (slice.length * 255);
  }

  class VFXManager {
    constructor() {
      this.impactEvents = [];
      this.lastBeatPulse = 0;
    }
    pushEvent(event) {
      this.impactEvents.push({
        ...event,
        time: event.time ?? performance.now() / 1000
      });
      if (this.impactEvents.length > 24)
        this.impactEvents.shift();
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
          kind: event.kind ?? "hit"
        })),
        backgroundHue: Math.round(180 + energy * 80),
        frequencyBins: Array.from(bins)
      };
    }
  }

  // guitar-neo/src/game/GameEngine.js
  init_tracks();
  var laneMap = new Map([
    ["KeyD", 0],
    ["KeyF", 1],
    ["KeyJ", 2],
    ["KeyK", 3],
    ["Space", 4]
  ]);
  function clamp5(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function resolveTrackFromList(trackInput, tracks2) {
    if (typeof trackInput === "string") {
      return tracks2.find((item) => item.id === trackInput) ?? tracks2[0] ?? { id: trackInput, bpm: 120 };
    }
    if (trackInput && typeof trackInput === "object")
      return trackInput;
    return tracks2[0] ?? { id: "track", bpm: 120 };
  }

  class GameEngine {
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
      this.scoreEngine = new ScoreEngine;
      this.hyper = new HyperSpeedController;
      this.input = new InputController;
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
      this.frameHandle = 0;
      this.lastNow = 0;
      this.sequencer = null;
      this.emitSnapshot();
    }
    async loadTrack(trackInput) {
      this.stop();
      this.state = "loading";
      this.snapshot = this.createSnapshot();
      this.emitSnapshot();
      const track = resolveTrackFromList(trackInput, tracks);
      this.track = track;
      this.audio = new AudioBufferHandler;
      this.sequencer = new NoteSequencer;
      this.vfx = new VFXManager;
      if (!this.audio)
        throw new Error("Audio service unavailable");
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
      this.lastNow = 0;
      this.snapshot = this.createSnapshot();
      this.emitSnapshot();
      return this.track;
    }
    normalizeChart(track = {}) {
      const sourceChart = this.getTrackChartSource(track);
      const bpm = track?.bpm ?? sourceChart?.bpm ?? 120;
      const noteDensity = track?.noteDensity ?? sourceChart?.noteDensity ?? 1;
      const beatsToMicros = (beats) => beats * 60000000 / bpm;
      const notes = this.asNoteList(sourceChart).map((note, index) => {
        const timeBeats = Number(note.time ?? note.hitTimeBeats ?? 0);
        const durationBeats = Number(note.duration ?? note.durationBeats ?? 0);
        return {
          id: note.id ?? `${track?.id ?? "track"}-${index}`,
          lane: clamp5(Number(note.lane ?? 0), 0, 4),
          time: timeBeats,
          duration: durationBeats,
          hitTimeMicros: Math.round(note.hitTimeMicros ?? beatsToMicros(timeBeats)),
          durationMicros: Math.round(note.durationMicros ?? beatsToMicros(durationBeats)),
          weight: note.weight ?? 1,
          type: note.type ?? "tap"
        };
      });
      return { bpm, noteDensity, notes };
    }
    getTrackChartSource(track) {
      if (Array.isArray(track?.chart))
        return { notes: track.chart };
      if (Array.isArray(track?.chart?.notes))
        return track.chart;
      if (Array.isArray(track?.chart?.chart?.notes))
        return track.chart.chart;
      if (Array.isArray(track?.notes))
        return { notes: track.notes, bpm: track.bpm, noteDensity: track.noteDensity };
      return track?.chart ?? track;
    }
    asNoteList(chartSource) {
      if (Array.isArray(chartSource))
        return chartSource;
      if (Array.isArray(chartSource?.notes))
        return chartSource.notes;
      if (Array.isArray(chartSource?.chart?.notes))
        return chartSource.chart.notes;
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
          type: "tap"
        }))
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
      if (this.paused)
        return;
      this.paused = true;
      this.pauseMicros = performance.now() * 1000;
      cancelAnimationFrame(this.frameHandle);
      this.state = "paused";
      this.emitSnapshot();
    }
    resume() {
      if (!this.paused)
        return;
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
      this.pendingNotes = [];
      this.activeNotes = [];
      this.snapshot = this.createSnapshot();
      this.emitSnapshot();
    }
    schedule() {
      this.frameHandle = requestAnimationFrame((time) => {
        this.update(time * 1000);
        if (!this.paused && this.state === "playing")
          this.schedule();
      });
    }
    update(frameTime) {
      if (this.state !== "playing")
        return this.emitSnapshot();
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
        intensity: clamp5(dt / 16000, 0, 1),
        hyperState,
        analyserBins: this.audio?.getFrequencyData?.() ?? [],
        activeLanes: [...this.input.held].map((code) => laneMap.get(code)).filter((lane) => lane != null)
      });
      this.emitSnapshot(nowMicros, hyperState);
      if (!this.pendingNotes.some((note) => !note.hit)) {
        this.finish(nowMicros);
      }
    }
    processInput(nowMicros) {
      let changed = false;
      for (const event of this.input.consume()) {
        if (event.type !== "down")
          continue;
        const lane = laneMap.get(event.code);
        if (lane == null)
          continue;
        const target = this.pendingNotes.find((note) => !note.hit && note.lane === lane);
        if (!target)
          continue;
        const result = this.scoreEngine.judge(nowMicros - target.hitTimeMicros, target);
        target.hit = result.hit || result.judgement === "Poor";
        this.hyper.recordJudgement(result.judgement);
        changed = true;
        if (result.hit && this.vfx?.burst)
          this.vfx.burst(lane, result.judgement);
      }
      return changed;
    }
    expireNotes(nowMicros) {
      for (const note of this.pendingNotes) {
        if (note.hit)
          continue;
        if (nowMicros - note.hitTimeMicros > this.scoreEngine.windows.poor) {
          note.hit = true;
          const result = this.scoreEngine.missNote();
          this.hyper.recordJudgement(result.judgement);
        }
      }
    }
    finish(nowMicros) {
      if (this.state === "ended")
        return;
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
        judgement: this.getJudgement(hyperState),
        hyperSpeed: `${hyperState.multiplier.toFixed(2)}x`,
        intensity: clamp5(hyperState.multiplier / 2, 0.1, 1),
        frequencyBins: this.audio?.getFrequencyData?.() ?? [],
        hyperState,
        timeMicros: nowMicros,
        noteCount: chartNotes.length,
        activeLanes: [...this.input.held].map((code) => laneMap.get(code)).filter((lane) => lane != null),
        results,
        state: this.state
      };
    }
    getJudgement(hyperState = this.hyper.getState()) {
      if (this.state === "paused")
        return "Paused";
      if (this.state === "loading")
        return "Loading";
      if (this.state === "ended")
        return "Complete";
      return hyperState.rollingAccuracy > 0.9 ? "Perfect" : "Ready";
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
        hyperSpeed: this.hyper.getState()
      });
    }
  }

  // guitar-neo/src/app/App.js
  var defaultTracks = [
    { id: "neo-drive", title: "Neo Drive", artist: "System Static", difficulty: "Pulse", bpm: 168 },
    { id: "glass-rain", title: "Glass Rain", artist: "Arc Voltage", difficulty: "Orbit", bpm: 182 },
    { id: "afterburner", title: "Afterburner", artist: "Night Circuit", difficulty: "Hyper", bpm: 204 }
  ];
  async function loadTracks() {
    try {
      const mod = await Promise.resolve().then(() => (init_tracks(), exports_tracks));
      return mod.tracks ?? mod.default ?? defaultTracks;
    } catch {
      return defaultTracks;
    }
  }

  class App {
    constructor({ sceneRoot, uiRoot }) {
      this.sceneRoot = sceneRoot;
      this.uiRoot = uiRoot;
      this.state = "boot";
      this.tracks = null;
      this.selectedTrackId = null;
      this.lastSnapshot = {};
      this.lastResults = null;
      this.lastError = null;
      this.hud = new HUD;
      this.background = new BackgroundScene(sceneRoot);
      this.menu = new MainMenu({
        onSelectTrack: (trackId) => this.selectTrack(trackId),
        onStart: () => this.startGame()
      });
      this.summary = new SummaryScreen({
        onReplay: () => this.showMenu()
      });
      this.game = new GameEngine({
        sceneRoot,
        onSnapshot: (snapshot) => this.update(snapshot),
        onResults: (results) => this.update({ results })
      });
      this.handleVisibilityChange = () => {
        if (document.hidden) {
          if (this.state === "gameplay")
            this.pauseGame();
          return;
        }
        if (this.state === "paused")
          this.resumeGame();
      };
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.mount();
      this.render();
    }
    async start() {
      this.state = "loading";
      this.render();
      try {
        this.tracks = await loadTracks();
        this.selectedTrackId = this.selectedTrackId ?? this.tracks?.[0]?.id ?? null;
        this.state = "menu";
        this.lastError = null;
      } catch (error) {
        this.tracks = [];
        this.selectedTrackId = null;
        this.lastError = error;
        this.state = "error";
      }
      this.render();
    }
    mount() {
      this.uiRoot.replaceChildren(this.menu.element, this.hud.element, this.summary.element);
    }
    selectTrack(trackId) {
      if (!trackId || ["boot", "loading"].includes(this.state))
        return;
      if (this.tracks && !this.tracks.some((track) => track.id === trackId))
        return;
      this.selectedTrackId = trackId;
      this.lastError = null;
      this.render();
    }
    async startGame() {
      if (!this.selectedTrackId || ["boot", "loading"].includes(this.state))
        return;
      if (this.state === "gameplay")
        return;
      this.state = "loading";
      this.lastError = null;
      this.render();
      try {
        await this.game.loadTrack(this.selectedTrackId);
        await this.game.start();
        this.state = "gameplay";
        this.render();
      } catch (error) {
        this.lastError = error;
        this.state = "error";
        this.render();
      }
    }
    update(snapshot = {}) {
      this.lastSnapshot = { ...this.lastSnapshot, ...snapshot };
      if (snapshot.results) {
        this.lastResults = snapshot.results;
        this.state = "summary";
      }
      this.render();
    }
    showMenu() {
      this.state = "menu";
      this.lastSnapshot = {};
      this.lastResults = null;
      this.lastError = null;
      this.game.stop?.();
      this.render();
    }
    pauseGame() {
      if (this.state !== "gameplay")
        return;
      this.game.audio?.pause?.();
      this.game.pause?.();
      this.state = "paused";
      this.render();
    }
    resumeGame() {
      if (this.state !== "paused")
        return;
      this.game.audio?.play?.(this.lastSnapshot?.timeMicros ? this.lastSnapshot.timeMicros / 1e6 : 0);
      this.game.resume?.();
      this.state = "gameplay";
      this.render();
    }
    render() {
      const tracks2 = this.tracks ?? [];
      const track = tracks2.find((item) => item.id === this.selectedTrackId) ?? tracks2[0] ?? null;
      this.menu?.render({
        state: this.state,
        tracks: tracks2,
        selectedTrackId: track?.id ?? null,
        error: this.lastError
      });
      this.hud?.render({
        state: this.state,
        snapshot: this.lastSnapshot,
        track
      });
      this.summary?.render({
        visible: this.state === "summary",
        track,
        results: this.lastResults
      });
      this.background?.render({
        state: this.state,
        track,
        snapshot: this.lastSnapshot
      });
      if (this.uiRoot?.dataset) {
        this.uiRoot.dataset.state = this.state;
        this.uiRoot.dataset.error = this.lastError ? "true" : "false";
      }
    }
  }

  // guitar-neo/src/main.js
  function bootApp({ sceneRoot = document.getElementById("scene-root"), uiRoot = document.getElementById("ui-root") } = {}) {
    const app = new App({
      sceneRoot,
      uiRoot
    });
    const ready = app.start();
    return { app, ready };
  }
  var { app, ready: appReady } = bootApp({
    sceneRoot: document.getElementById("scene-root"),
    uiRoot: document.getElementById("ui-root")
  });
})();
