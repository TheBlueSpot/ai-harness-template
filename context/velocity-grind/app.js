import { InputManager } from "./js/input-manager.js";
import { SpriteAnimator } from "./js/sprite-animator.js";
import { ParallaxBackground } from "./js/parallax-background.js";
import { PhysicsSolver, buildVelocityTrack } from "./js/physics-solver.js";

const STATE = Object.freeze({
  BOOT: "BOOT",
  MENU: "MENU",
  SELECT: "SELECT",
  PLAY: "PLAY",
  WIN: "WIN",
  LOSE: "LOSE"
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const rand = (min, max) => min + Math.random() * (max - min);
const wrap = (value, min, max) => {
  const span = max - min;
  return ((value - min) % span + span) % span + min;
};

const ASSET_ROOT = "./assets";

const ROSTER = Object.freeze([
  {
    name: "Atlas",
    trait: "fast line, loose grip",
    color: "#ffb347",
    stats: { speed: 0.92, grip: 0.46, flow: 0.76 },
    frames: ["playerShip1_orange.png", "playerShip2_orange.png", "playerShip3_orange.png"]
  },
  {
    name: "Mira",
    trait: "balanced control",
    color: "#7ee081",
    stats: { speed: 0.72, grip: 0.74, flow: 0.69 },
    frames: ["playerShip1_green.png", "playerShip2_green.png", "playerShip3_green.png"]
  },
  {
    name: "Vex",
    trait: "sticky turns, low top-end",
    color: "#76b1ff",
    stats: { speed: 0.62, grip: 0.88, flow: 0.53 },
    frames: ["playerShip1_blue.png", "playerShip2_blue.png", "playerShip3_blue.png"]
  }
]);

class AssetLoader {
  constructor(manifest) {
    this.manifest = manifest;
  }

  async loadImage(entry) {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ ok: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, asset: image });
      image.onerror = () => resolve({ ok: false, asset: null });
      image.src = entry.path;
    });
  }

  async loadAudio(entry) {
    return await new Promise((resolve) => {
      try {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = entry.path;
        resolve({ ok: true, asset: audio });
      } catch {
        resolve({ ok: false, asset: null });
      }
    });
  }

  async load() {
    const [imageResults, audioResults] = await Promise.all([
      Promise.all(this.manifest.images.map(async (entry) => ({ entry, ...(await this.loadImage(entry)) }))),
      Promise.all(this.manifest.audio.map(async (entry) => ({ entry, ...(await this.loadAudio(entry)) })))
    ]);

    const images = new Map();
    const audio = new Map();
    const status = {
      imagesRequested: this.manifest.images.length,
      imagesLoaded: 0,
      imagesMissing: 0,
      audioRequested: this.manifest.audio.length,
      audioLoaded: 0,
      audioMissing: 0
    };

    for (const result of imageResults) {
      if (result.ok) {
        images.set(result.entry.id, result.asset);
        status.imagesLoaded += 1;
      } else {
        status.imagesMissing += 1;
      }
    }

    for (const result of audioResults) {
      if (result.ok) {
        audio.set(result.entry.id, result.asset);
        status.audioLoaded += 1;
      } else {
        status.audioMissing += 1;
      }
    }

    return { images, audio, status };
  }
}

class SceneManager {
  constructor() {
    this.current = null;
    this.scenes = new Map();
  }

  register(name, scene) {
    this.scenes.set(name, scene);
  }

  go(name, payload = {}) {
    const next = this.scenes.get(name);
    if (!next) {
      throw new Error(`Unknown scene: ${name}`);
    }
    if (this.current?.exit) {
      this.current.exit();
    }
    this.current = next;
    this.current.time = 0;
    this.current.enter?.(payload);
  }

  update(dt, input, time) {
    this.current?.update?.(dt, input, time);
  }

  render(ctx, time) {
    this.current?.render?.(ctx, time);
  }
}

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.samples = new Map();
  }

  attachSamples(samples) {
    this.samples = samples;
  }

  ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        return false;
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return true;
  }

  play(name) {
    const sample = this.samples.get(name);
    if (sample) {
      try {
        const node = sample.cloneNode(true);
        node.volume = 0.8;
        const promise = node.play();
        if (promise?.catch) {
          promise.catch(() => this.playTone(name));
        }
        return;
      } catch {
        this.playTone(name);
        return;
      }
    }

    this.playTone(name);
  }

  playTone(name) {
    if (!this.ensure()) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.connect(amp);
    amp.connect(this.master);

    const tone = {
      "menu-accept": { type: "triangle", start: 320, end: 640, duration: 0.12 },
      "gate-hit": { type: "square", start: 520, end: 720, duration: 0.1 },
      boost: { type: "sawtooth", start: 180, end: 360, duration: 0.12 },
      win: { type: "triangle", start: 420, end: 880, duration: 0.16 },
      lose: { type: "square", start: 120, end: 60, duration: 0.22 }
    }[name] ?? { type: "triangle", start: 260, end: 400, duration: 0.12 };

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.start, now);
    osc.frequency.exponentialRampToValueAtTime(tone.end, now + tone.duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration + 0.08);
    osc.start(now);
    osc.stop(now + tone.duration + 0.12);
  }
}

class BaseScene {
  constructor(app) {
    this.app = app;
    this.time = 0;
  }

  enter() {}

  exit() {}

  update(dt) {
    this.time += dt;
  }

  render() {}
}

class Renderer {
  constructor(canvas, background) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.background = background;
    this.dpr = 1;
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.canvas.width = Math.max(1, Math.floor(clientWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(clientHeight * this.dpr));
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  panel(x, y, w, h, fill = "rgba(8,12,18,0.75)") {
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = "rgba(255,255,255,0.1)";
    this.ctx.strokeRect(x, y, w, h);
  }

  track(track, progress, laneOffset, palette) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const samples = 180;
    const left = [];
    const right = [];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      const point = track.sample(t);
      const normal = track.normal(t);
      const width = lerp(160, 104, smoothstep(t));
      left.push({ x: point.x + normal.x * width, y: point.y + normal.y * width });
      right.push({ x: point.x - normal.x * width, y: point.y - normal.y * width });
    }

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (const point of left) {
      ctx.lineTo(point.x, point.y);
    }
    for (let index = right.length - 1; index >= 0; index -= 1) {
      ctx.lineTo(right[index].x, right[index].y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 10;
    ctx.beginPath();
    left.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    ctx.beginPath();
    right.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    ctx.strokeStyle = palette.surface;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let index = 0; index < samples; index += 1) {
      const point = track.sample(index / samples);
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();

    for (let index = 0; index <= 14; index += 1) {
      const t = index / 14;
      const point = track.sample(t);
      const normal = track.normal(t);
      const halfWidth = lerp(120, 82, t);
      ctx.strokeStyle = index % 2 === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,179,71,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point.x + normal.x * halfWidth, point.y + normal.y * halfWidth);
      ctx.lineTo(point.x - normal.x * halfWidth, point.y - normal.y * halfWidth);
      ctx.stroke();
    }

    const pointer = track.sample(progress);
    const pointerNormal = track.normal(progress);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(pointer.x + pointerNormal.x * laneOffset, pointer.y + pointerNormal.y * laneOffset, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderMenu(scene) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.background.render(ctx, {
      width: w,
      height: h,
      time: scene.time,
      scroll: scene.time * 90,
      accent: "#ffb347",
      image: scene.app.menuMark
    });

    this.panel(w * 0.08, h * 0.14, w * 0.42, h * 0.56, "rgba(8,12,18,0.68)");
    ctx.fillStyle = "#ffb347";
    ctx.font = `700 ${Math.max(48, Math.floor(w * 0.05))}px Trebuchet MS`;
    ctx.fillText("velocity-grind", w * 0.11, h * 0.28);
    ctx.fillStyle = "rgba(246,242,234,0.82)";
    ctx.font = "400 22px Trebuchet MS";
    ctx.fillText("Modular canvas run. Input, animation, and parallax stay split.", w * 0.11, h * 0.35);
    ctx.fillText("CC0 sprites + CC0 SFX now live local under velocity-grind/assets.", w * 0.11, h * 0.4);
    ctx.fillStyle = "rgba(246,242,234,0.68)";
    ctx.fillText("Press Enter or Space to start", w * 0.11, h * 0.5);
    ctx.fillText("Press Esc at any time to return here", w * 0.11, h * 0.55);
    const status = scene.app.assets.status;
    ctx.fillText(`assets ${status.imagesLoaded}/${status.imagesRequested} images`, w * 0.11, h * 0.61);
    ctx.fillText(`assets ${status.audioLoaded}/${status.audioRequested} audio`, w * 0.11, h * 0.65);

    this.panel(w * 0.62, h * 0.17, w * 0.24, h * 0.18, "rgba(255,255,255,0.05)");
    ctx.fillStyle = "#7ee081";
    ctx.font = "700 18px Trebuchet MS";
    ctx.fillText("Pipeline", w * 0.64, h * 0.21);
    ctx.fillStyle = "rgba(246,242,234,0.76)";
    ctx.font = "400 16px Trebuchet MS";
    ctx.fillText("1. Menu", w * 0.64, h * 0.25);
    ctx.fillText("2. Character select", w * 0.64, h * 0.29);
    ctx.fillText("3. Gameplay", w * 0.64, h * 0.33);
    ctx.fillText("4. Win / lose", w * 0.64, h * 0.37);
  }

  renderSelect(scene) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const roster = scene.roster ?? scene.app.roster ?? [];
    this.background.render(ctx, {
      width: w,
      height: h,
      time: scene.time,
      scroll: scene.time * 130,
      accent: "#7ee081"
    });

    ctx.fillStyle = "#f6f2ea";
    ctx.font = `700 ${Math.max(34, Math.floor(w * 0.034))}px Trebuchet MS`;
    ctx.fillText("choose a rider", w * 0.08, h * 0.11);
    ctx.fillStyle = "rgba(246,242,234,0.72)";
    ctx.font = "400 18px Trebuchet MS";
    ctx.fillText("Left / Right to browse. Enter to lock in.", w * 0.08, h * 0.15);

    const cardW = w * 0.22;
    const cardH = h * 0.5;
    const gap = w * 0.045;
    const startX = w * 0.14;
    const y = h * 0.24;

    roster.forEach((rider, index) => {
      const x = startX + index * (cardW + gap);
      const active = index === scene.index;
      this.panel(x, y, cardW, cardH, active ? "rgba(255,255,255,0.08)" : "rgba(8,12,18,0.66)");

      rider.animator.draw(ctx, {
        x: x + cardW / 2,
        y: y + cardH * 0.26,
        time: scene.time,
        scale: active ? 1.2 : 1.02,
        angle: 0,
        alpha: 1,
        glow: active
      });

      ctx.fillStyle = rider.color;
      ctx.font = "700 24px Trebuchet MS";
      ctx.fillText(rider.name, x + 20, y + cardH * 0.53);
      ctx.fillStyle = "rgba(246,242,234,0.74)";
      ctx.font = "400 15px Trebuchet MS";
      ctx.fillText(rider.trait, x + 20, y + cardH * 0.6);

      const bars = [
        { label: "speed", value: rider.stats.speed },
        { label: "grip", value: rider.stats.grip },
        { label: "flow", value: rider.stats.flow }
      ];
      bars.forEach((bar, barIndex) => {
        const by = y + cardH * 0.7 + barIndex * 42;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x + 20, by, cardW - 40, 14);
        ctx.fillStyle = active ? rider.color : "rgba(255,255,255,0.3)";
        ctx.fillRect(x + 20, by, (cardW - 40) * bar.value, 14);
        ctx.fillStyle = "rgba(246,242,234,0.74)";
        ctx.font = "400 13px Trebuchet MS";
        ctx.fillText(bar.label, x + 20, by - 4);
      });

      if (active) {
        ctx.strokeStyle = rider.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, cardW + 4, cardH + 4);
      }
    });
  }

  renderPlay(scene) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const state = scene.physics.state;
    this.background.render(ctx, {
      width: w,
      height: h,
      time: scene.time,
      scroll: state.progress * 9000 + scene.time * 120,
      accent: scene.rider.color
    });
    this.track(scene.track, state.progress, state.laneOffset, scene.palette);

    scene.animator.draw(ctx, {
      x: state.position.x,
      y: state.position.y,
      time: scene.time,
      phase: state.progress * 4,
      angle: state.attached ? state.angle : state.rotation,
      scale: 1.1 + scene.avatarDepth * 0.01,
      alpha: 1,
      glow: true
    });

    this.panel(w * 0.05, h * 0.05, w * 0.18, h * 0.13);
    ctx.fillStyle = "rgba(246,242,234,0.78)";
    ctx.font = "400 15px Trebuchet MS";
    ctx.fillText("score", w * 0.07, h * 0.085);
    ctx.fillStyle = "#ffb347";
    ctx.font = "700 32px Trebuchet MS";
    ctx.fillText(String(scene.score), w * 0.07, h * 0.128);

    this.panel(w * 0.25, h * 0.05, w * 0.26, h * 0.13);
    ctx.fillStyle = "rgba(246,242,234,0.78)";
    ctx.font = "400 15px Trebuchet MS";
    ctx.fillText("progress", w * 0.27, h * 0.085);
    ctx.fillStyle = "#7ee081";
    ctx.font = "700 32px Trebuchet MS";
    ctx.fillText(`${Math.floor(state.progress * 100)}%`, w * 0.27, h * 0.128);

    this.panel(w * 0.54, h * 0.05, w * 0.22, h * 0.13);
    ctx.fillStyle = "rgba(246,242,234,0.78)";
    ctx.font = "400 15px Trebuchet MS";
    ctx.fillText("stability", w * 0.56, h * 0.085);
    ctx.fillStyle = state.stability > 35 ? "#7ee081" : "#ff6f7d";
    ctx.font = "700 32px Trebuchet MS";
    ctx.fillText(`${Math.max(0, Math.round(state.stability))}%`, w * 0.56, h * 0.128);

    this.panel(w * 0.8, h * 0.05, w * 0.15, h * 0.13);
    ctx.fillStyle = "rgba(246,242,234,0.78)";
    ctx.font = "400 15px Trebuchet MS";
    ctx.fillText("combo", w * 0.82, h * 0.085);
    ctx.fillStyle = "#f7c84b";
    ctx.font = "700 32px Trebuchet MS";
    ctx.fillText(`x${state.combo}`, w * 0.82, h * 0.128);

    this.panel(w * 0.05, h * 0.81, w * 0.32, h * 0.12);
    ctx.fillStyle = "rgba(246,242,234,0.78)";
    ctx.font = "400 16px Trebuchet MS";
    ctx.fillText(`rider: ${scene.rider.name}`, w * 0.07, h * 0.855);
    ctx.fillText(scene.rider.trait, w * 0.07, h * 0.89);
    ctx.fillText("Esc returns to menu", w * 0.07, h * 0.925);
    if (scene.lastTrick) {
      ctx.fillStyle = "#ffb347";
      ctx.fillText(scene.lastTrick, w * 0.07, h * 0.965);
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(w * 0.37, h * 0.89, w * 0.26, 10);
    ctx.fillStyle = "#7ee081";
    ctx.fillRect(w * 0.37, h * 0.89, w * 0.26 * state.progress, 10);
  }

  renderResult(scene) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.background.render(ctx, {
      width: w,
      height: h,
      time: scene.time,
      scroll: scene.time * 80,
      accent: scene.win ? "#7ee081" : "#ff6f7d"
    });

    ctx.fillStyle = "rgba(6, 10, 16, 0.68)";
    ctx.fillRect(0, 0, w, h);
    this.panel(w * 0.28, h * 0.2, w * 0.44, h * 0.42, "rgba(8,12,18,0.9)");
    ctx.textAlign = "center";
    ctx.fillStyle = scene.win ? "#7ee081" : "#ff6f7d";
    ctx.font = `700 ${Math.max(44, Math.floor(w * 0.05))}px Trebuchet MS`;
    ctx.fillText(scene.win ? "run complete" : "run failed", w * 0.5, h * 0.32);
    ctx.fillStyle = "rgba(246,242,234,0.84)";
    ctx.font = "400 22px Trebuchet MS";
    ctx.fillText(scene.message, w * 0.5, h * 0.39);
    ctx.fillText(`score ${scene.score}  |  combo peak x${scene.comboPeak}`, w * 0.5, h * 0.47);
    ctx.fillText("Enter or Space to return to menu", w * 0.5, h * 0.55);
    ctx.fillText("Esc also returns immediately", w * 0.5, h * 0.6);
    ctx.textAlign = "left";
  }
}

class MenuScene extends BaseScene {
  update(dt, input) {
    super.update(dt);
    if (input.wasPressed("Enter", "Space")) {
      this.app.audio.play("menu-accept");
      this.app.scenes.go(STATE.SELECT);
    }
  }

  render() {
    this.app.renderer.renderMenu(this);
  }
}

class SelectScene extends BaseScene {
  enter() {
    this.index = 0;
    this.roster = this.app.roster ?? [];
  }

  update(dt, input) {
    super.update(dt);
    const roster = this.roster ?? this.app.roster ?? [];
    if (!roster.length) {
      return;
    }
    if (input.wasPressed("ArrowLeft", "KeyA")) {
      this.index = wrap(this.index - 1, 0, roster.length);
    }
    if (input.wasPressed("ArrowRight", "KeyD")) {
      this.index = wrap(this.index + 1, 0, roster.length);
    }
    if (input.wasPressed("Enter", "Space")) {
      this.app.audio.play("menu-accept");
      this.app.scenes.go(STATE.PLAY, { rider: roster[this.index] });
    }
    if (input.wasPressed("Escape")) {
      this.app.scenes.go(STATE.MENU);
    }
  }

  render() {
    this.app.renderer.renderSelect(this);
  }
}

class GameplayScene extends BaseScene {
  enter(payload) {
    this.rider = payload.rider;
    this.animator = this.rider.animator;
    this.track = buildVelocityTrack();
    this.physics = new PhysicsSolver(this.track, this.rider.stats);
    this.physics.reset(0.03);
    this.palette = {
      edge: "rgba(255,255,255,0.18)",
      surface: "rgba(255,255,255,0.42)"
    };
    this.avatarDepth = 0;
    this.throttleActive = false;
    this.gateScore = 0;
    this.motionScore = 0;
    this.score = 0;
    this.lastTrick = "";
    this.progress = this.physics.state.progress;
    this.stability = this.physics.state.stability;
    this.combo = this.physics.state.combo;
    this.comboPeak = this.physics.state.comboPeak;
    this.laneOffset = this.physics.state.laneOffset;
    this.speed = this.physics.state.speed;
    this.gates = [];
    for (let index = 1; index < 12; index += 1) {
      this.gates.push({
        t: index / 12,
        width: rand(72, 110),
        reward: 50 + index * 8
      });
    }
  }

  update(dt, input) {
    super.update(dt);

    if (input.wasPressed("Escape")) {
      this.app.scenes.go(STATE.MENU);
      return;
    }

    const steer = (input.isDown("ArrowLeft", "KeyA") ? -1 : 0) + (input.isDown("ArrowRight", "KeyD") ? 1 : 0);
    const throttlePressed = input.isDown("ArrowUp", "KeyW", "Space");
    if (throttlePressed && !this.throttleActive) {
      this.app.audio.play("boost");
    }
    this.throttleActive = throttlePressed;
    const result = this.physics.update(dt, {
      steer,
      throttle: throttlePressed,
      brake: input.isDown("ArrowDown", "KeyS")
    });

    if (result.launched) {
      this.avatarDepth = 14;
    }
    this.avatarDepth = lerp(this.avatarDepth, 0, 1 - Math.pow(0.004, dt));

    if (result.landed && result.trick?.points > 0) {
      this.lastTrick = `trick +${result.trick.points} | air ${result.trick.airTime.toFixed(1)}s | spin ${Math.round(result.trick.rotationDegrees)} deg`;
      this.app.audio.play("gate-hit");
    }

    let gateHit = false;
    for (let index = 0; index < this.gates.length; index += 1) {
      const gate = this.gates[index];
      if (gate.passed || this.physics.state.progress < gate.t) {
        continue;
      }

      gate.passed = true;
      const distance = Math.abs(this.physics.state.laneOffset);
      const accuracy = clamp(1 - distance / gate.width, 0, 1);
      if (accuracy > 0.25) {
        gateHit = true;
        this.physics.state.combo += 1;
        this.physics.state.comboPeak = Math.max(this.physics.state.comboPeak, this.physics.state.combo);
        const streak = 1 + this.physics.state.combo * 0.15;
        const gatePoints = Math.round(gate.reward * (0.7 + accuracy * 0.6) * streak);
        this.gateScore += gatePoints;
        this.physics.addStability(3 + accuracy * 8);
        this.app.audio.play("gate-hit");
      } else {
        this.physics.state.combo = 0;
        this.physics.addStability(-12);
      }
      break;
    }

    if (gateHit) {
      this.avatarDepth = 12;
    }
    this.score = this.gateScore + this.physics.score;
    this.progress = this.physics.state.progress;
    this.stability = this.physics.state.stability;
    this.combo = this.physics.state.combo;
    this.comboPeak = this.physics.state.comboPeak;
    this.laneOffset = this.physics.state.laneOffset;
    this.speed = this.physics.state.speed;
    this.motionScore += this.speed * dt * 0.12;
    this.score += Math.round(this.motionScore);

    if (this.physics.state.stability <= 0) {
      this.app.scenes.go(STATE.LOSE, this.summary(false));
      return;
    }

    if (this.physics.state.progress >= 1) {
      this.app.scenes.go(STATE.WIN, this.summary(true));
    }
  }

  summary(win) {
    return {
      win,
      score: this.score,
      comboPeak: this.comboPeak,
      message: win ? "you cleared the route" : "the line broke before the finish"
    };
  }

  render() {
    this.app.renderer.renderPlay(this);
  }
}

class ResultScene extends BaseScene {
  enter(payload) {
    this.win = payload.win;
    this.score = payload.score;
    this.comboPeak = payload.comboPeak;
    this.message = payload.message;
    this.app.audio.play(this.win ? "win" : "lose");
  }

  update(dt, input) {
    super.update(dt);
    if (input.wasPressed("Enter", "Space", "Escape")) {
      this.app.scenes.go(STATE.MENU);
    }
  }

  render() {
    this.app.renderer.renderResult(this);
  }
}

class GameApp {
  constructor(canvas) {
    this.canvas = canvas;
    this.background = new ParallaxBackground();
    this.renderer = new Renderer(canvas, this.background);
    this.input = new InputManager();
    this.audio = new AudioBus();
    this.assets = { images: new Map(), audio: new Map(), status: null };
    this.menuMark = null;
    this.roster = [];
    this.manifest = {
      images: [
        ...ROSTER.flatMap((rider) =>
          rider.frames.map((frame, index) => ({
            id: `${rider.name.toLowerCase()}-${index}`,
            path: `${ASSET_ROOT}/images/${frame}`
          }))
        ),
        { id: "menu-mark", path: `${ASSET_ROOT}/images/ufoBlue.png` }
      ],
      audio: [
        { id: "menu-accept", path: `${ASSET_ROOT}/audio/laserSmall_000.ogg` },
        { id: "gate-hit", path: `${ASSET_ROOT}/audio/impactMetal_001.ogg` },
        { id: "boost", path: `${ASSET_ROOT}/audio/spaceEngineSmall_002.ogg` },
        { id: "lose", path: `${ASSET_ROOT}/audio/lowFrequency_explosion_001.ogg` },
        { id: "win", path: `${ASSET_ROOT}/audio/explosionCrunch_002.ogg` }
      ]
    };
    this.scenes = new SceneManager();
    this.scenes.register(STATE.MENU, new MenuScene(this));
    this.scenes.register(STATE.SELECT, new SelectScene(this));
    this.scenes.register(STATE.PLAY, new GameplayScene(this));
    this.scenes.register(STATE.WIN, new ResultScene(this));
    this.scenes.register(STATE.LOSE, new ResultScene(this));
    this.time = 0;
    this.last = performance.now();
    this.running = false;
  }

  buildRoster() {
    return ROSTER.map((rider) => {
      const frames = rider.frames.map((frame, index) => this.assets.images.get(`${rider.name.toLowerCase()}-${index}`));
      return {
        ...rider,
        frames,
        animator: new SpriteAnimator(frames, {
          frameDuration: 0.12,
          bobAmplitude: 2,
          bobSpeed: 6,
          scale: 1,
          fallbackColor: rider.color,
          fallbackAccent: "rgba(255,255,255,0.7)"
        })
      };
    });
  }

  async boot() {
    const loader = new AssetLoader(this.manifest);
    this.assets = await loader.load();
    this.audio.attachSamples(this.assets.audio);
    this.menuMark = this.assets.images.get("menu-mark");
    this.roster = this.buildRoster();
    this.renderer.resize();
    this.input.attach();
    const primeAudio = () => this.audio.ensure();
    window.addEventListener("keydown", primeAudio, { once: true });
    window.addEventListener("pointerdown", primeAudio, { once: true });
    this.scenes.go(STATE.MENU);
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  frame = (now) => {
    if (!this.running) {
      return;
    }

    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.scenes.update(dt, this.input, now);
    this.renderer.clear();
    this.scenes.render(this.renderer.ctx, now);
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };
}

const canvas = document.getElementById("game");
const app = new GameApp(canvas);

window.__VELOCITY_GRIND__ = app;
window.addEventListener("resize", () => app.renderer.resize());

app.boot().catch((error) => {
  console.error(error);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ff6f7d";
  ctx.font = "700 28px Trebuchet MS";
  ctx.fillText("velocity-grind boot failed", 40, 80);
  ctx.fillStyle = "#f6f2ea";
  ctx.font = "400 18px Trebuchet MS";
  ctx.fillText(String(error?.message ?? error), 40, 120);
});
