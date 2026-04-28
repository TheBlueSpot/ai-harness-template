import { clamp, lerp, smoothstep } from "./math.js";
import { Track } from "./track.js";
import { Rivals } from "./rivals.js";

const DEFAULTS = {
  width: 960,
  height: 540,
  dpr: 1,
};

export class Game {
  constructor(options = {}) {
    this.canvas = options.canvas ?? null;
    this.runtime = options.runtime ?? {};
    this.size = { ...DEFAULTS, ...(options.size ?? {}) };
    this.track = new Track();
    this.rivals = new Rivals(this.track);
    this.input = createInput();
    this.restart();
  }

  resize(widthOrSize, height) {
    if (typeof widthOrSize === "object" && widthOrSize) {
      this.size = {
        width: widthOrSize.width ?? this.size.width,
        height: widthOrSize.height ?? this.size.height,
        dpr: widthOrSize.dpr ?? this.size.dpr,
      };
      return;
    }
    this.size = { width: widthOrSize, height, dpr: this.size.dpr };
  }

  setInput(input) {
    this.input = { ...this.input, ...input, pointer: { ...this.input.pointer, ...(input?.pointer ?? {}) } };
  }

  restart() {
    this.mode = "menu";
    this.time = 0;
    this.stateTime = 0;
    this.countdown = 3;
    this.distance = 0;
    this.lap = 1;
    this.place = 1;
    this.speed = 0;
    this.energy = 100;
    this.playerLane = 0;
    this.playerDrift = 0;
    this.playerRecovery = 0;
    this.message = "Press start to race.";
    this.finished = false;
    this.playerHit = 0;
    this.rivals.reset();
    this.frame = this.buildFrameState();
  }

  start() {
    if (this.mode === "menu" || this.mode === "gameover" || this.mode === "win") {
      this.enterMode("countdown", "Engines primed.");
    } else if (this.mode === "paused") {
      this.enterMode("running", "Race resumed.");
    }
  }

  update(dt, input = this.input) {
    this.setInput(input);
    this.time += dt;
    this.stateTime += dt;

    if (this.input.restart) {
      this.restart();
    }

    if (this.input.start) {
      this.start();
    }

    if (this.input.pause) {
      if (this.mode === "running" || this.mode === "countdown") {
        this.enterMode("paused", "Race paused.");
      } else if (this.mode === "paused") {
        this.enterMode("running", "Race resumed.");
      }
    }

    if (this.mode === "win" || this.mode === "gameover" || this.mode === "menu") {
      this.frame = this.buildFrameState();
      return;
    }

    if (this.mode === "paused") {
      this.frame = this.buildFrameState();
      return;
    }

    if (this.mode === "countdown") {
      const remaining = Math.max(0, Math.ceil(3 - this.stateTime));
      this.countdown = remaining;
      this.message = remaining > 0 ? `Countdown ${remaining}.` : "Go.";
      if (this.stateTime >= 3) {
        this.enterMode("running", "Go.");
      }
    }

    if (this.mode === "running") {
      this.updateRunning(dt);
    }

    this.place = this.computePlace();
    this.frame = this.buildFrameState();
  }

  updateRunning(dt) {
    const trackSample = this.track.sample(this.distance);
    const accel = this.input.accelerate ? 1 : 0;
    const brake = this.input.brake ? 1 : 0;
    const steering = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    const driftIntent = Math.abs(steering) > 0 && (this.speed > 115 || this.input.brake);

    const baseTarget = 120 + accel * 120 - brake * 70;
    const driftBoost = this.playerDrift * 55;
    const targetSpeed = clamp(baseTarget + driftBoost, 20, 320);
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 2.8);

    if (driftIntent) {
      this.playerDrift = clamp(this.playerDrift + dt * 1.5, 0, 1);
      this.energy -= dt * (2.1 + this.playerDrift * 1.8);
    } else {
      this.playerDrift = Math.max(0, this.playerDrift - dt * 1.25);
    }

    const cornerForce = trackSample.curve * (0.9 + this.speed / 210);
    const grip = lerp(0.8, 0.42, this.playerDrift);
    this.playerLane += (steering * grip - cornerForce * 240) * dt;
    this.playerLane = clamp(this.playerLane, -0.95, 0.95);

    this.distance += this.speed * dt;
    const courseLength = this.track.length * this.track.laps;
    if (this.distance >= courseLength) {
      this.distance = courseLength;
      this.lap = this.track.laps;
      this.finished = true;
      this.enterMode("win", "Final lap clear.");
      return;
    }

    const lapProgress = this.distance / this.track.length;
    this.lap = clamp(1 + Math.floor(lapProgress), 1, this.track.laps);
    const lapDistance = this.distance % this.track.length;
    if (lapDistance >= this.track.length * 0.98) {
      this.message = `Lap ${this.lap} charging.`;
    }

    const stripBonus = trackSample.strip ? 26 * dt : 0;
    const recoveryBonus = this.playerRecovery > 0 ? 10 * dt : 0;
    this.energy = clamp(this.energy + stripBonus + recoveryBonus - dt * 0.95, 0, 100);
    if (Math.abs(this.playerLane) > 0.86) {
      this.speed = Math.max(60, this.speed - 120 * dt);
      this.energy = clamp(this.energy - 12 * dt, 0, 100);
      this.message = "Guardrail scrape.";
    }
    if (trackSample.strip) {
      this.message = "Recharge strip engaged.";
    } else if (this.playerDrift > 0.25 && Math.abs(steering) > 0) {
      this.message = "Drift holding.";
    }
    if (this.energy <= 0) {
      this.enterMode("gameover", "Energy collapsed.");
      return;
    }

    this.rivals.update(dt, this);
  }

  computePlace() {
    const ahead = this.rivals.entries.filter((rival) => rival.progress > this.distance).length;
    return clamp(1 + ahead, 1, this.rivals.entries.length + 1);
  }

  render(ctx) {
    if (!ctx) return;
    const { width, height } = this.size;
    const w = width || ctx.canvas?.width || 960;
    const h = height || ctx.canvas?.height || 540;
    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, w, h, this.time);
    drawTrack(ctx, w, h, this);
    drawPlayer(ctx, w, h, this);
    drawRivals(ctx, w, h, this);
  }

  getFrameState() {
    return structuredClone(this.frame ?? this.buildFrameState());
  }

  buildFrameState() {
    return {
      state: this.mode,
      mode: this.mode,
      lap: { current: this.lap, total: this.track.laps },
      speed: this.speed,
      energy: this.energy,
      place: this.place,
      countdown: this.mode === "countdown" ? this.countdown : 0,
      message: this.message,
      status: this.finished ? "win" : this.mode,
    };
  }

  enterMode(mode, message = this.message) {
    this.mode = mode;
    this.stateTime = 0;
    this.message = message;
    if (mode !== "countdown") {
      this.countdown = 0;
    }
  }
}

function createInput() {
  return { accelerate: false, brake: false, left: false, right: false, start: false, restart: false, pause: false, pointer: { x: 0, y: 0, active: false } };
}

function drawBackground(ctx, w, h, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0a1020");
  sky.addColorStop(1, "#171d2e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(124, 180, 255, 0.08)";
  for (let i = 0; i < 8; i += 1) {
    const x = (i / 8) * w + Math.sin(time * 0.7 + i) * 18;
    ctx.fillRect(x, h * 0.14, 2, h * 0.4);
  }
}

function drawTrack(ctx, w, h, game) {
  const horizon = h * 0.26;
  const roadBottom = h * 0.92;
  const segments = 70;
  for (let i = segments - 1; i >= 0; i -= 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const depth0 = smoothstep(0, 1, t0);
    const depth1 = smoothstep(0, 1, t1);
    const y0 = lerp(horizon, roadBottom, depth0);
    const y1 = lerp(horizon, roadBottom, depth1);
    const s0 = game.track.sample(game.distance + depth0 * 120);
    const s1 = game.track.sample(game.distance + depth1 * 120);
    const curve = s0.curve * 600;
    const roadWidth0 = lerp(w * 0.06, w * 0.62, depth0) * s0.width;
    const roadWidth1 = lerp(w * 0.06, w * 0.62, depth1) * s1.width;
    const center0 = w * 0.5 + curve * depth0 * 260;
    const center1 = w * 0.5 + curve * depth1 * 260;

    ctx.fillStyle = s0.color;
    quad(ctx, center0 - roadWidth0, y0, center0 + roadWidth0, y0, center1 + roadWidth1, y1, center1 - roadWidth1, y1);
    if (s0.strip) {
      ctx.fillStyle = "rgba(117, 255, 214, 0.18)";
      quad(ctx, center0 - roadWidth0 * 0.82, y0, center0 + roadWidth0 * 0.82, y0, center1 + roadWidth1 * 0.82, y1, center1 - roadWidth1 * 0.82, y1);
    }
  }
}

function drawPlayer(ctx, w, h, game) {
  const x = w * 0.5 + game.playerLane * w * 0.26;
  const y = h * 0.8;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#ff7b5c";
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(24, 20);
  ctx.lineTo(-24, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(-6, -10, 12, 16);
  ctx.restore();
}

function drawRivals(ctx, w, h, game) {
  for (const rival of game.rivals.entries) {
    const rel = (rival.progress - game.distance + game.track.length * game.track.laps) % game.track.length;
    const depth = 1 - clamp(rel / (game.track.length * 0.6), 0, 1);
    const sample = game.track.sample(game.distance + rel);
    const x = w * 0.5 + rival.lane * w * 0.28 + sample.curve * 140 * depth;
    const y = lerp(h * 0.78, h * 0.32, depth);
    ctx.fillStyle = rival.name === "Comet" ? "#7cf7ff" : rival.name === "Viper" ? "#c0ff6d" : "#a48cff";
    ctx.fillRect(x - 12, y - 10, 24, 18);
  }
}

function quad(ctx, x0, y0, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}
