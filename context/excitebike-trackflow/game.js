const GAME_MODE = Object.freeze({
  MENU: "menu",
  PLAY: "play",
  CRASH: "crash",
  WIN: "win",
  LOSE: "lose",
});

const DEFAULT_LAPS = 3;

const TRACK = Object.freeze({
  length: 5200,
  finishX: 5000,
  maxLaps: 3,
  gravity: 1700,
  accel: 820,
  brake: 980,
  maxSpeed: 960,
  airTimeLimit: 0.92,
  crashLeanLimit: 0.82,
  mudDrag: 0.58,
});

const segments = [
  { x: 0, y: 500, kind: "road", label: "start" },
  { x: 420, y: 492, kind: "road", label: "roll" },
  { x: 760, y: 460, kind: "jump", label: "first jump" },
  { x: 1160, y: 522, kind: "mud", label: "mud patch" },
  { x: 1620, y: 446, kind: "boost", label: "boost pad" },
  { x: 2080, y: 520, kind: "road", label: "rise" },
  { x: 2620, y: 434, kind: "jump", label: "triple crest" },
  { x: 3120, y: 500, kind: "mud", label: "soft bend" },
  { x: 3680, y: 456, kind: "boost", label: "late boost" },
  { x: 4360, y: 478, kind: "road", label: "home straight" },
  { x: 5200, y: 478, kind: "finish", label: "finish" },
];

function createState() {
  return createRunState();
}

function createRunState() {
  return {
    mode: GAME_MODE.MENU,
    lap: 1,
    lapsTotal: DEFAULT_LAPS,
    speed: 0,
    time: 0,
    distance: 0,
    heat: 0,
    launchAssistTimer: 0,
    crashTimer: 0,
    resultTimer: 0,
    message: "Press Start to race.",
    rider: createRiderState(),
    result: createResultState(),
  };
}

function createRiderState() {
  return {
    x: 120,
    y: 0,
    lean: 0,
    airborne: false,
    crashed: false,
  };
}

function createResultState() {
  return {
    completed: false,
    reason: null,
  };
}

function resetForStart() {
  const next = createRunState();
  next.mode = GAME_MODE.PLAY;
  next.speed = 180;
  next.launchAssistTimer = 1.25;
  next.message = "Track open. Hold Up to keep pace and Left/Right to level the bike over jumps.";
  return next;
}

function enterCrashState(state, reason) {
  return {
    ...state,
    mode: GAME_MODE.CRASH,
    crashTimer: 1.1,
    heat: Math.max(state.heat, 0.65),
    speed: Math.max(0, state.speed * 0.45),
    message: reason || "Crash! Recover and restart.",
    rider: {
      ...state.rider,
      crashed: true,
      airborne: false,
      lean: 0,
    },
    result: {
      completed: false,
      reason: reason || "crash",
    },
  };
}

function enterResultState(state, won, reason) {
  return {
    ...state,
    mode: won ? GAME_MODE.WIN : GAME_MODE.LOSE,
    resultTimer: 0,
    message: won ? "Race won. Press Start for another run." : reason || "Run over. Press Start to restart the course.",
    result: {
      completed: true,
      reason: reason || (won ? "finish" : "lose"),
    },
  };
}

function sampleTrack(x) {
  const clamped = Math.max(0, Math.min(TRACK.length, x));
  return segmentAt(clamped).y;
}

function segmentAt(x) {
  const clamped = Math.max(0, Math.min(TRACK.length, x));
  for (let i = 0; i < segments.length - 1; i += 1) {
    const left = segments[i];
    const right = segments[i + 1];
    if (clamped >= left.x && clamped <= right.x) {
      const t = (clamped - left.x) / Math.max(1, right.x - left.x);
      return {
        x: clamped,
        y: left.y + (right.y - left.y) * t,
        kind: left.kind,
        label: left.label,
        progress: (clamped - left.x) / Math.max(1, right.x - left.x),
        left,
        right,
      };
    }
  }
  const last = segments[segments.length - 1];
  return { x: clamped, y: last.y, kind: last.kind, label: last.label, progress: 1, left: last, right: last };
}

function getTerrainEffect(x) {
  const segment = segmentAt(x);
  return {
    ...segment,
    isJump: segment.kind === "jump",
    isMud: segment.kind === "mud",
    isBoost: segment.kind === "boost",
    isFinish: segment.kind === "finish",
    traction: segment.kind === "mud" ? TRACK.mudDrag : 1,
    lift: segment.kind === "jump" ? 1 : 0,
    boost: segment.kind === "boost" ? 220 : 0,
  };
}

function getFinishProgress(distance) {
  const lapDistance = Math.max(0, distance % TRACK.finishX);
  return Math.min(1, lapDistance / TRACK.finishX);
}

function getUpcomingFeature(distance) {
  return getUpcomingFeatures(distance, 1)[0] ?? null;
}

function getUpcomingFeatures(distance, count = 2) {
  const lapDistance = Math.max(0, distance % TRACK.finishX);
  return segments
    .filter((segment) => segment.x > lapDistance + 80 && segment.kind !== "road" && segment.kind !== "finish")
    .slice(0, Math.max(1, count))
    .map((segment) => ({
      ...segment,
      distance: segment.x - lapDistance,
    }));
}

function isFinishLine(distance) {
  return distance >= TRACK.finishX;
}

class Game {
  constructor() {
    this.state = createState();
    this.started = false;
    this.viewport = { width: 1280, height: 720, dpr: 1 };
  }

  resize(width, height) {
    if (typeof width === "object" && width !== null) {
      this.viewport = { ...this.viewport, ...width };
      return;
    }
    this.viewport = {
      ...this.viewport,
      width: Number.isFinite(width) ? width : this.viewport.width,
      height: Number.isFinite(height) ? height : this.viewport.height,
    };
  }

  start() {
    this.started = true;
    this.state = resetForStart();
  }

  restart(full = true) {
    this.started = true;
    this.state = resetForStart();
    this.state.message = full ? "Full restart. Track open." : "Back on track.";
  }

  update(dt, input) {
    if (!this.started && this.state.mode === GAME_MODE.MENU) return;
    if (this.state.mode === GAME_MODE.CRASH) {
      this.state.crashTimer = Math.max(0, this.state.crashTimer - dt);
      if (this.state.crashTimer === 0) {
        this.state = enterResultState(this.state, false, "Crash recovery failed. Press Start to restart.");
      }
      return;
    }
    if (this.state.mode === GAME_MODE.WIN || this.state.mode === GAME_MODE.LOSE) return;
    if (this.state.mode !== GAME_MODE.PLAY) return;

    const terrain = getTerrainEffect(this.state.distance);
    const throttle = input.up ? 1 : 0;
    const brake = input.down ? 1 : 0;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (this.state.launchAssistTimer > 0) {
      this.state.launchAssistTimer = Math.max(0, this.state.launchAssistTimer - dt);
      if (!brake) {
        this.state.speed = Math.max(this.state.speed, 180);
      }
      if (!throttle) {
        this.state.message = "Hold Up to keep pace and Left/Right to level the bike over jumps.";
      }
    }

    this.state.rider.lean = clamp(this.state.rider.lean + steer * dt * 3.5, -1, 1);
    this.state.rider.lean *= Math.pow(0.28, dt);

    const accel = throttle * TRACK.accel * terrain.traction - brake * TRACK.brake;
    this.state.speed = clamp(this.state.speed + accel * dt, 0, TRACK.maxSpeed);
    if (terrain.isBoost) this.state.speed = clamp(this.state.speed + terrain.boost * dt, 0, TRACK.maxSpeed);
    if (terrain.isMud) this.state.speed = clamp(this.state.speed - (1 - terrain.traction) * 220 * dt, 0, TRACK.maxSpeed);

    this.state.distance = Math.min(TRACK.length, this.state.distance + this.state.speed * dt);
    this.state.time += dt;
    this.state.heat = clamp(this.state.heat + (throttle * 0.06 + this.state.speed / TRACK.maxSpeed * 0.02 - brake * 0.05) * dt, 0, 1);

    if (terrain.isJump) {
      this.state.rider.airborne = this.state.speed > 260;
      if (this.state.rider.airborne && Math.abs(this.state.rider.lean) > TRACK.crashLeanLimit) {
        this.state = enterCrashState(this.state, "Landed off-balance.");
        return;
      }
    }

    if (isFinishLine(this.state.distance)) {
      this.state.lap += 1;
      this.state.distance %= TRACK.finishX;
      this.state.message = this.state.lap > this.state.lapsTotal ? "Finish line clear." : `Lap ${this.state.lap}/${this.state.lapsTotal}.`;
    }

    if (this.state.lap > this.state.lapsTotal) {
      this.state = enterResultState(this.state, true, "Race won. Press Start for another run.");
      return;
    }

    const groundY = sampleTrack(this.state.distance);
    this.state.rider.y = groundY;
    this.state.rider.x = 120 + getFinishProgress(this.state.distance) * 900;

    if (this.state.heat >= 1 && this.state.speed < 160) {
      this.state = enterCrashState(this.state, "Heat spike. Crash.");
    }
    this.state.result.completed = false;
  }

  getFrameState() {
    return {
      ...this.state,
      width: this.viewport.width,
      height: this.viewport.height,
      track: TRACK,
      viewport: this.viewport,
      worldOffset: Math.max(0, this.state.distance - 240),
      sampledGround: sampleTrack(this.state.distance),
      finishProgress: getFinishProgress(this.state.distance),
      terrain: getTerrainEffect(this.state.distance),
      nextFeature: getUpcomingFeature(this.state.distance),
      upcomingFeatures: getUpcomingFeatures(this.state.distance),
    };
  }
}

function renderFrame(ctx, frame) {
  const { width, height, worldOffset } = frame;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0b1730");
  sky.addColorStop(0.55, "#204a70");
  sky.addColorStop(1, "#7d4b1f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  drawHills(ctx, width, height, worldOffset);
  drawTrack(ctx, frame);
  drawRider(ctx, frame);
  drawHudEcho(ctx, frame);
  drawOverlayHint(ctx, frame);
}

function drawHills(ctx, width, height, worldOffset) {
  ctx.fillStyle = "#17304f";
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = -80; x <= width + 80; x += 80) {
    const worldX = x + worldOffset * 0.2;
    ctx.lineTo(x, 250 + Math.sin(worldX / 180) * 20);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function drawTrack(ctx, frame) {
  const { width, height, worldOffset } = frame;
  ctx.save();
  ctx.translate(-worldOffset, 0);
  ctx.fillStyle = "#4a3422";
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (const segment of segments) {
    ctx.lineTo(segment.x, segment.y);
  }
  ctx.lineTo(segments[segments.length - 1].x, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#f7d08a";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, segments[0].y - 1);
  for (const segment of segments) ctx.lineTo(segment.x, segment.y - 1);
  ctx.stroke();

  ctx.strokeStyle = "#1f130d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, segments[0].y);
  for (const segment of segments) ctx.lineTo(segment.x, segment.y);
  ctx.stroke();

  ctx.fillStyle = "#9b6c3e";
  for (let x = 0; x < frame.track.length; x += 240) {
    const y = segmentYAt(x);
    ctx.fillRect(x + 96, y - 12, 10, 24);
  }
  ctx.restore();
}

function drawRider(ctx, frame) {
  const x = 120;
  const y = frame.sampledGround - 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(frame.rider.lean * 0.35);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(-16, -20, 32, 18);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-10, -34, 20, 12);
  ctx.fillStyle = "#111827";
  ctx.fillRect(-20, -2, 44, 8);
  ctx.restore();
}

function drawHudEcho(ctx, frame) {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(18, 18, 120, 4);
  ctx.fillRect(18, 28, 96, 4);
  ctx.fillRect(18, 38, 140, 4);
  if (frame.mode !== "play") {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, frame.width, frame.height);
  }
}

function drawOverlayHint(ctx, frame) {
  if (frame.mode === "play") return;
  ctx.fillStyle = "rgba(7, 17, 31, 0.75)";
  ctx.fillRect(0, 0, frame.width, frame.height);
}

function segmentYAt(x) {
  for (let i = 0; i < segments.length - 1; i += 1) {
    const left = segments[i];
    const right = segments[i + 1];
    if (x >= left.x && x <= right.x) {
      const t = (x - left.x) / Math.max(1, right.x - left.x);
      return left.y + (right.y - left.y) * t;
    }
  }
  return segments[segments.length - 1].y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const canvas = document.getElementById("gameCanvas");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");
const hudLap = document.getElementById("hudLap");
const hudSpeed = document.getElementById("hudSpeed");
const hudTime = document.getElementById("hudTime");
const hudStatus = document.getElementById("hudStatus");

const ctx = canvas.getContext("2d");
const game = new Game();
const input = { left: false, right: false, up: false, down: false };

function resize() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1);
  canvas.width = 1280;
  canvas.height = 720;
  canvas.style.width = `${1280 * scale}px`;
  canvas.style.height = `${720 * scale}px`;
  game.resize({ width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio || 1 });
}

function syncUi(frame) {
  hudLap.textContent = `${frame.lap}/${frame.lapsTotal}`;
  hudSpeed.textContent = `${Math.round(frame.speed)}`;
  hudTime.textContent = formatTime(frame.time);
  const statusText = buildStatusText(frame);
  hudStatus.textContent = statusText;
  hudStatus.hidden = !statusText;

  overlay.hidden = frame.mode === "play";
  if (!overlay.hidden) {
    overlayEyebrow.textContent = frame.mode === "menu" ? "Race" : frame.mode === "win" ? "Finish" : "Crash";
    overlayTitle.textContent = frame.mode === "win" ? "Track Cleared" : "Excitebike Trackflow";
    overlayCopy.textContent =
      frame.mode === "menu"
        ? "Hold speed, keep the bike stable, and clear three laps."
        : frame.mode === "win"
          ? "Race complete. Press Start for a fresh run."
          : "Run over. Press Start to restart the course.";
    overlayButton.textContent = frame.mode === "win" ? "Restart" : "Start";
  }
}

function buildStatusText(frame) {
  if (frame.mode !== "play") {
    return frame.mode === "menu" ? "Press Start to race." : frame.message;
  }

  const [upcoming, following] = frame.upcomingFeatures ?? (frame.nextFeature ? [frame.nextFeature] : []);
  if (upcoming && upcoming.distance <= 900) {
    const distance = Math.max(0, Math.round(upcoming.distance));
    if (
      upcoming.label === "triple crest" &&
      following &&
      following.kind === "mud" &&
      following.distance - upcoming.distance <= 700
    ) {
      const followDistance = Math.max(0, Math.round(following.distance - upcoming.distance));
      return `Triple crest in ${distance}m. Stay level, then ease for the soft bend ${followDistance}m after landing.`;
    }
    if (upcoming.kind === "jump") {
      return `${toTitleCase(upcoming.label)} in ${distance}m. Hold Up and tap Left/Right to level the bike.`;
    }
    if (upcoming.kind === "mud") {
      return `${toTitleCase(upcoming.label)} in ${distance}m. Ease off so the rear wheel keeps grip.`;
    }
    if (upcoming.kind === "boost") {
      return `${toTitleCase(upcoming.label)} in ${distance}m. Stay level and cash the straight-line speed.`;
    }
  }

  return frame.message;
}

function toTitleCase(value) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatTime(seconds) {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = (total % 60).toFixed(1).padStart(4, "0");
  return `${mins}:${secs}`;
}

function keyHandler(code, pressed) {
  if (code === "ArrowLeft" || code === "KeyA") input.left = pressed;
  if (code === "ArrowRight" || code === "KeyD") input.right = pressed;
  if (code === "ArrowUp" || code === "KeyW") input.up = pressed;
  if (code === "ArrowDown" || code === "KeyS") input.down = pressed;
  if (pressed && code === "Enter") {
    if (game.getFrameState().mode === "menu") game.start();
    else game.restart(true);
  }
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  keyHandler(event.code, true);
});

window.addEventListener("keyup", (event) => keyHandler(event.code, false));
overlayButton.addEventListener("click", () => {
  if (game.getFrameState().mode === "menu") game.start();
  else game.restart(true);
});

window.addEventListener("blur", () => {
  input.left = false;
  input.right = false;
  input.up = false;
  input.down = false;
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const frame = game.getFrameState();
  renderFrame(ctx, frame);
  syncUi(frame);
  requestAnimationFrame(loop);
}

resize();
syncUi(game.getFrameState());
window.addEventListener("resize", resize);
requestAnimationFrame(loop);
