import {
  CANVAS_WIDTH,
  COURSE_LENGTH,
  buildCollectibles,
  getCheckpointLabel,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
} from "./terrain.js";
import { renderGame } from "./render.js";

const GRAVITY = 0.62;
const RUN_ACCEL = 0.46;
const AIR_ACCEL = 0.22;
const DRAG = 0.985;
const GROUND_FRICTION = 0.992;
const JUMP_SPEED = 14.5;
const CAMERA_AHEAD = 220;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

function createPlayer() {
  return {
    x: 120,
    y: getTerrainHeight(120),
    vx: 0,
    vy: 0,
    radius: 30,
    onGround: true,
    angle: 0,
    normal: { x: 0, y: 1 },
    stepPhase: 0,
    flow: 0,
  };
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.mode = "menu";
    this.elapsed = 0;
    this.player = createPlayer();
    this.cameraX = 0;
    this.collectibles = buildCollectibles();
    this.particles = [];
    this.result = null;
    this.jumpQueued = false;
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.elapsed = 0;
      this.result = null;
    }
  }

  update(dt, input) {
    const step = dt > 0 ? dt : 1 / 60;
    const frames = Math.max(1, Math.round(step * 60));
    for (let i = 0; i < frames; i += 1) {
      this.step(input);
    }
  }

  step(input) {
    if (input.pressed.enter || input.pressed.start) {
      this.start();
    }
    if (input.pressed.restart) {
      this.restart();
      this.start();
    }

    if (this.mode !== "playing") {
      this.tickParticles();
      return;
    }

    this.elapsed += 1 / 60;
    this.simulatePlayer(input);
    this.collectSquiggles();
    this.updateCamera();
    this.spawnSpeedParticles();
    this.tickParticles();

    if (this.player.x >= COURSE_LENGTH - 110) {
      this.mode = "finished";
      this.result = this.buildResult();
    }
  }

  simulatePlayer(input) {
    const player = this.player;
    const move = (input.down.right ? 1 : 0) - (input.down.left ? 1 : 0);

    if (player.onGround) {
      const tangent = { x: player.normal.y, y: -player.normal.x };
      const slope = getTerrainSlope(player.x);
      const slopePull = clamp(slope * 0.16, -0.45, 0.45);
      player.vx += move * RUN_ACCEL;
      player.vx -= slopePull;
      player.vx *= GROUND_FRICTION;

      if (Math.abs(player.vx) < 0.05 && move === 0) {
        player.vx = 0;
      }

      if (input.pressed.jump || input.pressed.up) {
        player.onGround = false;
        player.vx += tangent.x * 0.8;
        player.vy = -JUMP_SPEED * player.normal.y - Math.abs(player.vx) * 0.08;
        player.vx += -player.normal.x * JUMP_SPEED * 0.36;
        this.emitBurst(player.x, player.y - 12, 14, "#2bb7a8");
      }

      player.x += player.vx;
      player.y = getTerrainHeight(player.x);
      player.normal = getTerrainNormal(player.x);
      player.angle = lerp(player.angle, Math.atan2(-player.normal.x, player.normal.y), 0.28);
      player.stepPhase += Math.abs(player.vx) * 0.11 + 0.03;
    } else {
      player.vx += move * AIR_ACCEL;
      player.vy += GRAVITY;
      player.vx *= DRAG;
      player.x += player.vx;
      player.y += player.vy;
      player.angle = lerp(player.angle, Math.atan2(player.vy, Math.max(Math.abs(player.vx), 0.001)) * 0.45, 0.12);
      player.stepPhase += 0.12;

      const groundY = getTerrainHeight(player.x);
      if (player.y >= groundY) {
        player.y = groundY;
        player.vy = 0;
        player.onGround = true;
        player.normal = getTerrainNormal(player.x);
        player.angle = Math.atan2(-player.normal.x, player.normal.y);
        if (Math.abs(player.vx) > 7.5) {
          this.emitBurst(player.x, player.y - 10, 10, "#7bc2ff");
        }
      }
    }

    player.x = clamp(player.x, 0, COURSE_LENGTH);
    player.flow = Math.max(player.flow, Math.floor(Math.abs(player.vx) * 5 + (player.onGround ? 12 : 0)));
  }

  collectSquiggles() {
    for (const collectible of this.collectibles) {
      if (collectible.taken) {
        continue;
      }
      const dx = collectible.x - this.player.x;
      const dy = collectible.y - (this.player.y - 40);
      if (dx * dx + dy * dy <= (collectible.radius + 24) ** 2) {
        collectible.taken = true;
        this.player.flow += 120;
        this.emitBurst(collectible.x, collectible.y, 18, "#ef8f1f");
      }
    }
  }

  updateCamera() {
    const target = clamp(this.player.x - CANVAS_WIDTH * 0.5 + CAMERA_AHEAD + this.player.vx * 8, 0, COURSE_LENGTH - CANVAS_WIDTH + 200);
    this.cameraX = lerp(this.cameraX, target, 0.1);
  }

  spawnSpeedParticles() {
    if (!this.player.onGround || Math.abs(this.player.vx) < 7.5) {
      return;
    }
    this.particles.push({
      x: this.player.x - Math.sign(this.player.vx) * 8,
      y: this.player.y - 6,
      vx: -this.player.vx * 0.24,
      vy: -0.8 - Math.random() * 0.6,
      color: Math.random() > 0.5 ? "#2bb7a8" : "#7bc2ff",
      size: 3 + Math.random() * 2,
      life: 16,
      maxLife: 16,
    });
  }

  emitBurst(x, y, count, color) {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 1) * 6,
        color,
        size: 2 + Math.random() * 3,
        life: 18 + Math.floor(Math.random() * 10),
        maxLife: 28,
      });
    }
  }

  tickParticles() {
    this.particles = this.particles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx,
        y: particle.y + particle.vy,
        vx: particle.vx * 0.98,
        vy: particle.vy + 0.08,
        life: particle.life - 1,
      }))
      .filter((particle) => particle.life > 0);
  }

  buildResult() {
    const collected = this.collectibles.filter((item) => item.taken).length;
    const all = this.collectibles.length;
    const clean = collected === all ? "Perfect line." : "Run it back for every squiggle.";
    return {
      eyebrow: "notebook cleared",
      title: `${this.elapsed.toFixed(1)}s finish`,
      copy: `${collected}/${all} squiggles collected. ${clean}`,
    };
  }

  render(ctx) {
    renderGame(ctx, this.getFrameState());
  }

  getFrameState() {
    return {
      appState: this.mode,
      cameraX: this.cameraX,
      player: this.player,
      particles: this.particles,
      collectibles: this.collectibles,
      zone: getCheckpointLabel(this.player.x),
      speed: Math.round(Math.abs(this.player.vx) * 14),
      time: `${this.elapsed.toFixed(1)}s`,
      flow: Math.round(this.player.flow),
      result: this.result,
    };
  }
}
