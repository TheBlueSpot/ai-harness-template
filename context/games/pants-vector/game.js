const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const vec = (x = 0, y = 0) => ({ x, y });
const add = (a, b) => vec(a.x + b.x, a.y + b.y);
const sub = (a, b) => vec(a.x - b.x, a.y - b.y);
const mul = (a, s) => vec(a.x * s, a.y * s);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => {
  const m = len(a) || 1;
  return vec(a.x / m, a.y / m);
};
const perp = (a) => vec(-a.y, a.x);
const catmullRom = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return vec(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  );
};
const catmullRomTangent = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  return vec(
    0.5 * ((-p0.x + p2.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    0.5 * ((-p0.y + p2.y) + 2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t + 3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t2)
  );
};

class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.map = new Map([
      ["ArrowLeft", "left"],
      ["KeyA", "left"],
      ["ArrowRight", "right"],
      ["KeyD", "right"],
      ["ArrowUp", "up"],
      ["KeyW", "up"],
      ["Space", "jump"],
      ["ShiftLeft", "dash"],
      ["ShiftRight", "dash"],
      ["Enter", "start"],
      ["KeyR", "restart"]
    ]);
    this.onKeyDown = (event) => {
      const code = this.map.get(event.code);
      if (!code) return;
      event.preventDefault();
      this.down.add(code);
      this.pressed.add(code);
    };
    this.onKeyUp = (event) => {
      const code = this.map.get(event.code);
      if (!code) return;
      event.preventDefault();
      this.down.delete(code);
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }
  isDown(code) { return this.down.has(code); }
  wasPressed(...codes) { return codes.some((code) => this.pressed.has(code)); }
  clearFrame() { this.pressed.clear(); }
}

const DEFAULT_TRACK = Object.freeze({
  points: [
    { x: 120, y: 420 },
    { x: 340, y: 420 },
    { x: 520, y: 360 },
    { x: 650, y: 235 },
    { x: 660, y: 120 },
    { x: 760, y: 70 },
    { x: 940, y: 70 },
    { x: 1040, y: 125 },
    { x: 1060, y: 275 },
    { x: 1220, y: 390 },
    { x: 1440, y: 430 },
    { x: 1660, y: 330 },
    { x: 1900, y: 300 },
    { x: 2120, y: 300 }
  ]
});

const defaultPlayer = () => ({
  position: { x: 160, y: 402 },
  velocity: { x: 0, y: 0 },
  radius: 18,
  grounded: false,
  normal: { x: 0, y: -1 },
  tangent: { x: 1, y: 0 },
  surfaceT: 0
});

const pickPoint = (points, index) => points[clamp(index, 0, points.length - 1)];

function createTrackSpline(track = DEFAULT_TRACK) {
  const points = (track?.points || DEFAULT_TRACK.points).map((p) => ({ x: p.x, y: p.y }));
  return { points };
}

function sampleSurface(track, t) {
  const spline = track?.points ? track : createTrackSpline(track);
  const points = spline.points;
  if (points.length < 2) return { position: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, normal: { x: 0, y: -1 }, t: 0 };
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  const p0 = pickPoint(points, i - 1);
  const p1 = pickPoint(points, i);
  const p2 = pickPoint(points, i + 1);
  const p3 = pickPoint(points, i + 2);
  const position = catmullRom(p0, p1, p2, p3, localT);
  const tangent = norm(catmullRomTangent(p0, p1, p2, p3, localT));
  const normal = norm(perp(tangent));
  return { position, tangent, normal, t: clamp(t, 0, 1) };
}

function projectOntoSpline(point, track) {
  const spline = track?.points ? track : createTrackSpline(track);
  let best = null;
  for (let i = 0; i <= 240; i += 1) {
    const t = i / 240;
    const sample = sampleSurface(spline, t);
    const delta = sub(point, sample.position);
    const distance = len(delta);
    if (!best || distance < best.distance) best = { ...sample, distance, projected: sample.position };
  }
  return best || { position: point, tangent: { x: 1, y: 0 }, normal: { x: 0, y: -1 }, t: 0, distance: 0 };
}

function transferMomentumOnSlope(velocity, tangent, normal, gravity, dt, options = {}) {
  const allowSlopeBoost = options.allowSlopeBoost ?? true;
  const allowImpactTransfer = options.allowImpactTransfer ?? true;
  const tangentSpeed = dot(velocity, tangent);
  const normalSpeed = dot(velocity, normal);
  const slopeBoost = allowSlopeBoost ? clamp(-dot(gravity, tangent) * dt, -140, 140) : 0;
  const downhill = Math.sign(dot(gravity, tangent)) || Math.sign(tangentSpeed) || 1;
  const impactTransfer = allowImpactTransfer && normalSpeed < 0 ? -normalSpeed * 0.82 * downhill : 0;
  const retained = tangentSpeed + slopeBoost + impactTransfer;
  return add(mul(tangent, retained), mul(normal, Math.max(0, normalSpeed)));
}

function resolveSplineCollision(player, track, options = {}) {
  const radius = player.radius ?? 18;
  const skinWidth = options.skinWidth ?? 2;
  const contact = projectOntoSpline(player.position, track);
  const offset = sub(player.position, contact.position);
  const signed = dot(offset, contact.normal);
  const side = signed >= 0 ? 1 : -1;
  const distance = Math.abs(signed);
  const speed = len(player.velocity || { x: 0, y: 0 });
  const attachBand = radius + skinWidth + (player.grounded ? 34 : clamp(speed * 0.018, 6, 28));
  const normal = mul(contact.normal, side);
  const rideableSurface = normal.y <= -0.2;
  const movingTowardSurface = dot(player.velocity || { x: 0, y: 0 }, normal) < 60;
  const grounded = rideableSurface && distance <= attachBand && (movingTowardSurface || player.grounded);
  const correctedPosition = grounded ? add(contact.position, mul(normal, radius + skinWidth)) : player.position;
  return {
    position: correctedPosition,
    velocity: player.velocity,
    radius,
    grounded,
    normal,
    tangent: contact.tangent,
    surfaceT: contact.t
  };
}

class SplinePhysics {
  constructor({ gravity = 1600, maxSpeed = 860, skinWidth = 2 } = {}) {
    this.gravity = gravity;
    this.maxSpeed = maxSpeed;
    this.skinWidth = skinWidth;
    this.track = createTrackSpline(DEFAULT_TRACK);
  }
  reset() {}
  step(playerState = defaultPlayer(), input = {}, track = this.track, dt = 1 / 60) {
    const state = {
      position: { ...(playerState.position || { x: playerState.x || 0, y: playerState.y || 0 }) },
      velocity: { ...(playerState.velocity || { x: playerState.vx || 0, y: playerState.vy || 0 }) },
      radius: playerState.radius ?? 18,
      grounded: !!playerState.grounded,
      normal: { ...(playerState.normal || { x: 0, y: -1 }) },
      tangent: { ...(playerState.tangent || { x: 1, y: 0 }) },
      surfaceT: playerState.surfaceT ?? 0
    };
    const spline = track?.points ? track : createTrackSpline(track);
    const contactState = resolveSplineCollision(state, spline, { skinWidth: this.skinWidth });
    const wasGrounded = state.grounded;
    const activeNormal = state.grounded ? contactState.normal : state.normal;
    const contact = state.grounded ? contactState : projectOntoSpline(state.position, spline);
    const gravityVec = { x: 0, y: this.gravity };
    const drive = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let velocity = state.velocity;
    if (state.grounded) {
      const tangentGravity = dot(gravityVec, contact.tangent);
      velocity = add(velocity, mul(contact.tangent, tangentGravity * dt));
    } else {
      velocity = add(velocity, mul(gravityVec, dt));
    }
    if (drive !== 0) velocity = add(velocity, mul(contact.tangent, drive * 1400 * dt));
    if (input.jump && state.grounded) {
      velocity = add(mul(activeNormal, 540), mul(contact.tangent, dot(velocity, contact.tangent)));
      state.grounded = false;
    }
    const speed = len(velocity);
    if (speed > this.maxSpeed) velocity = mul(norm(velocity), this.maxSpeed);
    let next = { ...state, position: add(state.position, mul(velocity, dt)), velocity };
    const resolved = resolveSplineCollision(next, spline, { skinWidth: this.skinWidth });
    if (resolved.grounded) {
      const carried = transferMomentumOnSlope(resolved.velocity, resolved.tangent, resolved.normal, gravityVec, dt, {
        allowSlopeBoost: wasGrounded,
        allowImpactTransfer: wasGrounded
      });
      const normalSpeed = dot(carried, resolved.normal);
      const tangentSpeed = dot(carried, resolved.tangent);
      const clampedTangent = clamp(tangentSpeed, -this.maxSpeed, this.maxSpeed);
      resolved.velocity = add(mul(resolved.tangent, clampedTangent), mul(resolved.normal, Math.max(0, normalSpeed)));
      if (Math.abs(clampedTangent) < 12 && drive === 0) resolved.velocity = mul(resolved.velocity, 0.98);
    }
    return {
      ...resolved,
      position: resolved.position,
      velocity: resolved.velocity,
      grounded: resolved.grounded,
      contact: resolved.grounded ? "surface" : "air",
      dead: resolved.position.y > 960
    };
  }
  sampleSurface(track, t) {
    return sampleSurface(track, t);
  }
}

class AnimationState {
  constructor(spriteMap = {}) {
    this.spriteMap = spriteMap;
    this.reset();
  }
  reset() {
    this.time = 0;
    this.frame = 0;
    this.pose = "idle";
    this.hold = 0;
    this.speed = 0;
  }
  update(player = {}, input = {}, contact = {}, dt = 1 / 60) {
    this.time += dt;
    const vx = player.velocity?.x ?? player.vx ?? 0;
    const vy = player.velocity?.y ?? player.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    this.speed = speed;
    const grounded = !!contact.grounded;
    const normal = contact.normal || player.normal || { x: 0, y: -1 };
    const tangent = contact.tangent || player.tangent || { x: 1, y: 0 };
    const ceilingish = normal.y > 0.6;
    const wallish = Math.abs(normal.x) > 0.7;
    const movingFast = speed > 220;
    const win = player.state === "WIN";
    const lose = player.state === "LOSE";
    let pose = "idle";
    if (win) pose = "win";
    else if (lose) pose = "lose";
    else if (!grounded) pose = wallish ? "wallRun" : ceilingish ? "ceilingRun" : "airborne";
    else if (ceilingish) pose = "ceilingRun";
    else if (wallish) pose = "wallRun";
    else if (movingFast || Math.abs(vx) > 160 || Math.abs(vx * (tangent?.x ?? 1)) > 0) pose = input.dash ? "sprint" : "run";
    this.pose = pose;
    const cycle = pose === "idle" ? 0.5 : pose === "sprint" ? 0.08 : pose === "run" ? 0.12 : 0.2;
    this.frame = Math.floor(this.time / cycle) % 6;
    this.poseMeta = { pose, grounded, normal, tangent, speed };
  }
  getPose() {
    return this.poseMeta || { pose: this.pose };
  }
}

class CameraFluidity {
  constructor({ width = 1280, height = 720 } = {}) {
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.leadX = 0;
  }
  update(target = {}, velocity = {}, dt = 1 / 60) {
    const tx = target.x ?? target.position?.x ?? 0;
    const ty = target.y ?? target.position?.y ?? 0;
    const vx = velocity.x ?? velocity.vx ?? target.velocity?.x ?? 0;
    const lead = clamp(vx * 0.18, -120, 120);
    this.leadX += (lead - this.leadX) * clamp(dt * 8, 0, 1);
    const targetX = tx + this.leadX - this.width * 0.5;
    const targetY = ty - this.height * 0.56;
    this.x += (targetX - this.x) * clamp(dt * 5, 0, 1);
    this.y += (targetY - this.y) * clamp(dt * 4, 0, 1);
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
  }
}

const STATES = Object.freeze({ MENU: "MENU", PLAYING: "PLAYING", WIN: "WIN", LOSE: "LOSE" });

const loadSprite = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

class Game {
  constructor(canvas, assets = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.overlay = document.getElementById("overlay");
    this.input = new Input();
    this.physics = new SplinePhysics();
    this.animation = new AnimationState();
    this.camera = new CameraFluidity();
    this.state = STATES.MENU;
    this.stateTime = 0;
    this.running = false;
    this.lastTime = 0;
    this.track = this.physics.track;
    this.player = this.createPlayer();
    this.level = {
      finishX: 2040,
      hazards: [
        { x: 560, y: 430, w: 94, h: 30 },
        { x: 1120, y: 416, w: 116, h: 30 },
        { x: 1530, y: 398, w: 128, h: 30 }
      ]
    };
    this.bindResize = () => this.resize();
    window.addEventListener("resize", this.bindResize);
    this.resize();
    this.setState(STATES.MENU);
  }
  createPlayer() {
    return { position: { x: 160, y: 402 }, velocity: { x: 0, y: 0 }, radius: 18, grounded: false, normal: { x: 0, y: -1 }, tangent: { x: 1, y: 0 }, surfaceT: 0 };
  }
  async start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.render(this.ctx);
    requestAnimationFrame((time) => this.frame(time));
  }
  async loadAssets() {
    const entries = Object.entries(this.assets || {});
    const loaded = await Promise.all(entries.map(async ([key, value]) => [key, await loadSprite(value)]));
    this.images = Object.fromEntries(loaded);
  }
  reset() {
    this.player = this.createPlayer();
    this.physics.reset();
    this.animation.reset();
    this.camera.reset();
    this.stateTime = 0;
  }
  setState(state) {
    this.state = state;
    this.stateTime = 0;
    if (!this.overlay) return;
    this.overlay.innerHTML = state === STATES.MENU ? this.menuMarkup() : "";
    if (state === STATES.WIN || state === STATES.LOSE) {
      this.overlay.innerHTML = this.endMarkup(state);
    }
  }
  update(dt) {
    this.stateTime += dt;
    if (this.state === STATES.MENU) {
      if (this.input.wasPressed("start", "jump")) this.setState(STATES.PLAYING);
      this.input.clearFrame();
      return;
    }
    if (this.input.wasPressed("restart")) {
      this.reset();
      this.setState(STATES.PLAYING);
    }
    if (this.state !== STATES.PLAYING) {
      this.input.clearFrame();
      return;
    }
    const controls = {
      left: this.input.isDown("left"),
      right: this.input.isDown("right"),
      jump: this.input.wasPressed("jump"),
      dash: this.input.isDown("dash")
    };
    const snapshot = this.physics.step(this.player, controls, this.track, dt);
    this.player = snapshot;
    this.animation.update({ ...snapshot, state: this.state }, controls, snapshot, dt);
    this.camera.update(snapshot.position, snapshot.velocity, dt);
    if (snapshot.dead || this.hitHazard(snapshot)) this.setState(STATES.LOSE);
    if (snapshot.position.x >= this.level.finishX) this.setState(STATES.WIN);
    this.input.clearFrame();
  }
  hitHazard(player) {
    const radius = player.radius ?? 18;
    return this.level.hazards.some((trap) => {
      const cx = clamp(player.position.x, trap.x, trap.x + trap.w);
      const cy = clamp(player.position.y, trap.y, trap.y + trap.h);
      return Math.hypot(player.position.x - cx, player.position.y - cy) < radius;
    });
  }
  render(ctx) {
    const w = this.viewWidth || this.canvas.width;
    const h = this.viewHeight || this.canvas.height;
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    this.drawBackground(ctx, w, h);
    ctx.translate(-this.camera.x, -this.camera.y);
    this.drawLevel(ctx);
    this.drawPlayer(ctx);
    ctx.restore();
    this.drawHud(ctx);
    if (this.state === STATES.MENU) this.drawMenu(ctx, w, h);
    if (this.state === STATES.WIN || this.state === STATES.LOSE) this.drawEnd(ctx, w, h);
  }
  frame(time) {
    if (!this.running) return;
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 1 / 60);
    this.lastTime = time;
    this.update(dt);
    this.render(this.ctx);
    requestAnimationFrame((t) => this.frame(t));
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewWidth = Math.max(1, rect.width);
    this.viewHeight = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.viewWidth * this.dpr);
    this.canvas.height = Math.floor(this.viewHeight * this.dpr);
    this.camera.resize(this.viewWidth, this.viewHeight);
  }
  drawBackground(ctx, w, h) {
    const bg = this.images?.background;
    if (bg) {
      ctx.drawImage(bg, 0, 0, w, h);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f8efe5");
    g.addColorStop(1, "#d9c3ab");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  drawLevel(ctx) {
    this.drawSplineTrack(ctx);
    const finish = this.images?.finish;
    if (finish) ctx.drawImage(finish, this.level.finishX - 18, 224, 72, 72);
    const hazard = this.images?.hazard;
    for (const trap of this.level.hazards) {
      ctx.fillStyle = "#5a2f43";
      ctx.fillRect(trap.x, trap.y, trap.w, trap.h);
      ctx.strokeStyle = "#1b1418";
      ctx.lineWidth = 3;
      ctx.strokeRect(trap.x, trap.y, trap.w, trap.h);
      if (hazard) ctx.drawImage(hazard, trap.x + 10, trap.y - 36, 52, 52);
    }
  }
  drawSplineTrack(ctx) {
    const samples = [];
    for (let i = 0; i <= 180; i += 1) samples.push(this.physics.sampleSurface(this.track, i / 180).position);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [width, color, offset] of [[62, "#2a2020", 0], [50, "#6f4d33", 4], [34, "#d79b4a", -4]]) {
      ctx.beginPath();
      samples.forEach((point, index) => {
        const y = point.y + offset + Math.sin(index * 0.9) * 1.5;
        if (index === 0) ctx.moveTo(point.x, y);
        else ctx.lineTo(point.x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(28,26,30,0.32)";
    ctx.lineWidth = 2;
    for (let i = 6; i < samples.length; i += 12) {
      ctx.beginPath();
      ctx.moveTo(samples[i].x - 16, samples[i].y - 24);
      ctx.lineTo(samples[i].x + 18, samples[i].y + 18);
      ctx.stroke();
    }
  }
  drawPlayer(ctx) {
    const sprite = this.images?.player;
    const px = this.player.position.x;
    const py = this.player.position.y;
    const angle = Math.atan2(this.player.tangent.y, this.player.tangent.x);
    const pose = this.animation.getPose();
    const speedStretch = clamp((pose.speed || 0) / 860, 0, 1);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.scale(1 + speedStretch * 0.16, 1 - speedStretch * 0.08);
    if (sprite) ctx.drawImage(sprite, -24, -44, 48, 48);
    else {
      ctx.fillStyle = "#1e1d22";
      ctx.fillRect(-16, -28, 32, 56);
    }
    ctx.restore();
  }
  drawHud(ctx) {
    const progress = clamp(this.player.position.x / this.level.finishX, 0, 1);
    const speed = Math.round(Math.hypot(this.player.velocity.x, this.player.velocity.y));
    const nextHazard = this.level.hazards
      .map((trap) => trap.x - this.player.position.x)
      .filter((distance) => distance >= -40)
      .sort((a, b) => a - b)[0];
    const stateLabel = this.state === STATES.PLAYING ? "Run live" : this.state === STATES.WIN ? "Finish reached" : this.state === STATES.LOSE ? "Wipeout" : "Ready line";
    const statusLabel = nextHazard == null
      ? "Final stretch: keep speed for the finish flag."
      : nextHazard < 140
        ? `Pit now: jump in ${Math.max(0, Math.round(nextHazard))} px.`
        : `Next pit in ${Math.round(nextHazard)} px.`;

    ctx.fillStyle = "rgba(20,16,12,0.76)";
    ctx.fillRect(16, 16, 332, 116);
    ctx.fillStyle = "#f7f0e4";
    ctx.font = "700 18px system-ui";
    ctx.fillText(stateLabel, 28, 42);
    ctx.font = "600 14px system-ui";
    ctx.fillText(`Progress ${Math.round(progress * 100)}%`, 28, 64);
    ctx.fillText(`Speed ${speed}`, 168, 64);
    ctx.fillText(statusLabel, 28, 86);

    ctx.fillStyle = "rgba(247, 240, 228, 0.18)";
    ctx.fillRect(28, 96, 280, 12);
    ctx.fillStyle = "#d59b3b";
    ctx.fillRect(28, 96, 280 * progress, 12);
    ctx.strokeStyle = "rgba(255, 246, 234, 0.34)";
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 96, 280, 12);

    ctx.font = "600 12px system-ui";
    ctx.fillStyle = "rgba(247, 240, 228, 0.9)";
    ctx.fillText("Lean A/D  Jump Space  Dash Shift  Restart R", 28, 126);
  }
  drawMenu(ctx, w, h) {
    ctx.fillStyle = "rgba(10,8,7,0.44)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff4e6";
    ctx.font = "700 44px system-ui";
    ctx.fillText("Pants Vector", 48, 104);
  }
  drawEnd(ctx, w, h) {
    const alpha = clamp(this.stateTime * 1.8, 0, 0.68);
    ctx.fillStyle = `rgba(10,8,7,${alpha})`;
    ctx.fillRect(0, 0, w, h);
  }
  menuMarkup() {
    return `<section class="card"><h1>Pants Vector</h1><p>Build speed on the downhill line, clear each pit, and hold your run together to the finish flag.</p><p>Lean with A/D, jump with Space, dash with Shift, and press Enter or Space to drop in.</p></section>`;
  }
  endMarkup(state) {
    const title = state === STATES.WIN ? "Finish reached" : "Wipeout";
    const body = state === STATES.WIN
      ? "You held the line to the flag. Press R to run it again."
      : "You lost the line before the next pit. Press R to jump back in.";
    return `<section class="card"><h1>${title}</h1><p>${body}</p></section>`;
  }
}

const canvas = document.getElementById("game");

const assets = {
  player: "./public/assets/player.svg",
  finish: "./public/assets/finish.svg",
  hazard: "./public/assets/hazard.svg",
  background: "./public/assets/ink-bg.svg"
};

const game = new Game(canvas, assets);

(async () => {
  await game.loadAssets();
  game.start();
})();
