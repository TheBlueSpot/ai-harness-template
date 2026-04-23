import { Input } from "./input.js";
import { SplinePhysics } from "./physics/SplinePhysics.js";
import { AnimationState } from "./render/AnimationState.js";
import { CameraFluidity } from "./render/CameraFluidity.js";

const STATES = Object.freeze({ MENU: "MENU", PLAYING: "PLAYING", WIN: "WIN", LOSE: "LOSE" });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const loadSprite = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

export class Game {
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
    this.drawHud(ctx, w, h);
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
    if (sprite) {
      ctx.drawImage(sprite, -24, -44, 48, 48);
    } else {
      ctx.fillStyle = "#1e1d22";
      ctx.fillRect(-16, -28, 32, 56);
    }
    ctx.restore();
  }
  drawHud(ctx, w, h) {
    ctx.fillStyle = "rgba(20,16,12,0.72)";
    ctx.fillRect(16, 16, 260, 76);
    ctx.fillStyle = "#f7f0e4";
    ctx.font = "600 16px system-ui";
    ctx.fillText(`state: ${this.state}`, 28, 42);
    ctx.fillText(`speed: ${Math.round(Math.hypot(this.player.velocity.x, this.player.velocity.y))}`, 28, 62);
    ctx.fillText(`momentum: ${Math.round(Math.abs(this.player.velocity.x) + Math.abs(this.player.velocity.y) * 0.4)}`, 28, 82);
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
  menuMarkup() { return `<section class="card"><h1>Pants Vector</h1><p>Enter or Space to start.</p></section>`; }
  endMarkup(state) { return `<section class="card"><h1>${state}</h1><p>R to restart.</p></section>`; }
}
