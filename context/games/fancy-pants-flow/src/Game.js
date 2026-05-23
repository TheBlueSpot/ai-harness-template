import {
  CANVAS_WIDTH,
  COURSE_LENGTH,
  TOTAL_LEVELS,
  buildCollectibles,
  buildTrickGates,
  getCheckpointLabel,
  getBoostPadAt,
  getDraftZoneAt,
  getLevelDefinition,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
} from "./terrain.js";
import { renderGame } from "./render.js";

const GRAVITY = 0.62;
const RUN_ACCEL = 0.21;
const AIR_ACCEL = 0.11;
const DRAG = 0.985;
const GROUND_FRICTION = 0.992;
const JUMP_SPEED = 12.6;
const CAMERA_AHEAD = 190;
const MAX_GROUND_SPEED = 7.4;
const MAX_AIR_SPEED = 8.4;
const STATUS_FLASH_TIME = 1.35;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

function createPlayer(levelIndex = 0) {
  return {
    x: 120,
    y: getTerrainHeight(120, levelIndex),
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
    this.totalFlow = 0;
    this.levelIndex = 0;
    this.player = createPlayer(0);
    this.cameraX = 0;
    this.collectibles = buildCollectibles(0);
    this.trickGates = buildTrickGates(0);
    this.totalSquiggles = 0;
    this.totalTricks = 0;
    this.particles = [];
    this.result = null;
    this.inkWaves = [];
    this.currentDraftLabel = "";
    this.statusFlash = null;
    this.padCooldown = 0;
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.elapsed = 0;
      this.result = null;
    } else if (this.mode === "intermission") {
      this.advanceLevel();
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
      this.tickInkWaves();
      return;
    }

    this.elapsed += 1 / 60;
    this.padCooldown = Math.max(0, this.padCooldown - 1 / 60);
    this.simulatePlayer(input);
    this.collectSquiggles();
    this.collectTrickGates();
    this.updateCamera();
    this.spawnSpeedParticles();
    this.spawnInkWave();
    this.tickParticles();
    this.tickInkWaves();

    if (this.player.x >= COURSE_LENGTH - 110) {
      if (this.levelIndex < TOTAL_LEVELS - 1) {
        this.mode = "intermission";
        this.result = this.buildIntermission();
      } else {
        this.mode = "finished";
        this.result = this.buildResult();
      }
    }
  }

  advanceLevel() {
    this.totalFlow += this.player.flow;
    this.totalSquiggles += this.collectibles.filter((item) => item.taken).length;
    this.totalTricks += this.trickGates.filter((gate) => gate.taken).length;
    this.levelIndex += 1;
    this.player = createPlayer(this.levelIndex);
    this.cameraX = 0;
    this.collectibles = buildCollectibles(this.levelIndex);
    this.trickGates = buildTrickGates(this.levelIndex);
    this.mode = "playing";
    this.result = null;
    this.inkWaves = [];
    this.currentDraftLabel = "";
    this.statusFlash = null;
    this.padCooldown = 0;
  }

  simulatePlayer(input) {
    const player = this.player;
    const move = (input.down.right ? 1 : 0) - (input.down.left ? 1 : 0);
    this.currentDraftLabel = "";
    if (this.statusFlash) {
      this.statusFlash.timeLeft = Math.max(0, this.statusFlash.timeLeft - 1 / 60);
      if (this.statusFlash.timeLeft <= 0) {
        this.statusFlash = null;
      }
    }

    if (player.onGround) {
      const tangent = { x: player.normal.y, y: -player.normal.x };
      const slope = getTerrainSlope(player.x, this.levelIndex);
      const slopePull = clamp(slope * 0.16, -0.42, 0.42);
      player.vx += move * RUN_ACCEL;
      player.vx -= slopePull;
      player.vx *= GROUND_FRICTION;
      player.vx = clamp(player.vx, -MAX_GROUND_SPEED, MAX_GROUND_SPEED);

      if (Math.abs(player.vx) < 0.05 && move === 0) {
        player.vx = 0;
      }

      if (input.pressed.jump || input.pressed.up) {
        player.onGround = false;
        player.vx += tangent.x * 0.7;
        player.vy = -JUMP_SPEED * player.normal.y - Math.abs(player.vx) * 0.08;
        player.vx += -player.normal.x * JUMP_SPEED * 0.32;
        this.emitBurst(player.x, player.y - 12, 14, "#2bb7a8");
      }

      player.x += player.vx;
      player.y = getTerrainHeight(player.x, this.levelIndex);
      player.normal = getTerrainNormal(player.x, this.levelIndex);
      player.angle = lerp(player.angle, Math.atan2(-player.normal.x, player.normal.y), 0.28);
      player.stepPhase += Math.abs(player.vx) * 0.11 + 0.03;

      const boostPad = this.padCooldown <= 0 ? getBoostPadAt(player.x, this.levelIndex) : null;
      if (boostPad && Math.abs(player.vx) > 3.8) {
        player.onGround = false;
        player.vx = Math.max(player.vx, boostPad.forward);
        player.vy = -boostPad.upward;
        this.padCooldown = 0.35;
        this.flashStatus(boostPad.label, "launch");
        this.emitBurst(player.x, player.y - 10, 20, "#ef8f1f");
      }
    } else {
      player.vx += move * AIR_ACCEL;
      player.vy += GRAVITY;
      const draftZone = getDraftZoneAt(player.x, player.y, this.levelIndex);
      if (draftZone) {
        player.vx += draftZone.forceX;
        player.vy += draftZone.forceY;
        this.currentDraftLabel = draftZone.label;
        if (Math.random() > 0.75) {
          this.particles.push({
            x: player.x - 18,
            y: player.y + (Math.random() - 0.5) * 34,
            vx: -1.6 - Math.random() * 0.8,
            vy: -0.4 - Math.random() * 0.6,
            color: "#2bb7a8",
            size: 2 + Math.random() * 2,
            life: 12,
            maxLife: 12,
          });
        }
      }
      player.vx *= DRAG;
      player.vx = clamp(player.vx, -MAX_AIR_SPEED, MAX_AIR_SPEED);
      player.x += player.vx;
      player.y += player.vy;
      player.angle = lerp(player.angle, Math.atan2(player.vy, Math.max(Math.abs(player.vx), 0.001)) * 0.45, 0.12);
      player.stepPhase += 0.12;

      const groundY = getTerrainHeight(player.x, this.levelIndex);
      if (player.y >= groundY) {
        player.y = groundY;
        player.vy = 0;
        player.onGround = true;
        player.normal = getTerrainNormal(player.x, this.levelIndex);
        player.angle = Math.atan2(-player.normal.x, player.normal.y);
        if (Math.abs(player.vx) > 7.1) {
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

  collectTrickGates() {
    for (const gate of this.trickGates) {
      if (gate.taken) {
        continue;
      }
      const dx = gate.x - this.player.x;
      const dy = gate.y - (this.player.y - 30);
      if (dx * dx + dy * dy <= (gate.radius + 18) ** 2) {
        gate.taken = true;
        this.player.flow += gate.bonus;
        this.flashStatus(gate.label, `+${gate.bonus} flow`);
        this.emitBurst(gate.x, gate.y, 24, "#7bc2ff");
      }
    }
  }

  updateCamera() {
    const target = clamp(
      this.player.x - CANVAS_WIDTH * 0.5 + CAMERA_AHEAD + this.player.vx * 8,
      0,
      COURSE_LENGTH - CANVAS_WIDTH + 200,
    );
    this.cameraX = lerp(this.cameraX, target, 0.1);
  }

  spawnSpeedParticles() {
    if (!this.player.onGround || Math.abs(this.player.vx) < 6.8) {
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

  spawnInkWave() {
    if (this.levelIndex < TOTAL_LEVELS - 2) {
      return;
    }
    const chance = this.levelIndex === TOTAL_LEVELS - 1 ? 0.18 : 0.1;
    if (Math.random() > chance) {
      return;
    }
    this.inkWaves.push({
      x: this.cameraX - 140 - Math.random() * 80,
      y: 80 + Math.random() * 200,
      width: 140 + Math.random() * 140,
      height: 80 + Math.random() * 80,
      speed: 1.8 + Math.random() * 1.8,
      alpha: 0.1 + Math.random() * 0.14,
      life: 200,
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

  tickInkWaves() {
    this.inkWaves = this.inkWaves
      .map((wave) => ({
        ...wave,
        x: wave.x + wave.speed,
        life: wave.life - 1,
      }))
      .filter((wave) => wave.life > 0 && wave.x < COURSE_LENGTH + 400);
  }

  flashStatus(label, detail) {
    this.statusFlash = { label, detail, timeLeft: STATUS_FLASH_TIME };
  }

  buildIntermission() {
    const level = getLevelDefinition(this.levelIndex);
    const next = getLevelDefinition(this.levelIndex + 1);
    const collected = this.collectibles.filter((item) => item.taken).length;
    const trickCount = this.trickGates.filter((gate) => gate.taken).length;
    return {
      eyebrow: `${level.name} clear`,
      title: `${next.name}: ${next.theme}`,
      copy: `Banked ${collected}/${this.collectibles.length} squiggles, hit ${trickCount}/${this.trickGates.length} trick gates. Next beat: ${next.beat.toLowerCase()}.`,
      buttonLabel: "Continue",
    };
  }

  buildResult() {
    const collected = this.collectibles.filter((item) => item.taken).length;
    const all = this.collectibles.length;
    const totalSquiggles = this.totalSquiggles + collected;
    const totalTricks = this.totalTricks + this.trickGates.filter((gate) => gate.taken).length;
    const totalFlow =
      this.totalFlow +
      this.player.flow +
      this.collectibles.filter((item) => item.taken).length * 120;
    const clean = collected === all ? "Perfect last page." : "More squiggles still hiding in the notebook.";
    return {
      eyebrow: "notebook cleared",
      title: `${this.elapsed.toFixed(1)}s full run`,
      copy: `${TOTAL_LEVELS} pages down. ${totalSquiggles} squiggles banked, ${totalTricks} trick gates cleared. Final page ${collected}/${all}. Flow bank ${Math.round(totalFlow)}. ${clean}`,
      buttonLabel: "Restart",
    };
  }

  render(ctx) {
    renderGame(ctx, this.getFrameState());
  }

  getFrameState() {
    const level = getLevelDefinition(this.levelIndex);
    const progressRatio = clamp(this.player.x / COURSE_LENGTH, 0, 1);
    const nextCheckpointIndex = level.checkpointXs.findIndex((checkpointX) => checkpointX > this.player.x);
    const nextCheckpointLabel =
      nextCheckpointIndex >= 0 ? level.checkpointLabels[nextCheckpointIndex] : "Finish gate";
    return {
      appState: this.mode,
      cameraX: this.cameraX,
      player: this.player,
      particles: this.particles,
      collectibles: this.collectibles,
      trickGates: this.trickGates,
      zone: this.currentDraftLabel || getCheckpointLabel(this.player.x, this.levelIndex),
      speed: Math.round(Math.abs(this.player.vx) * 14),
      time: `${this.elapsed.toFixed(1)}s`,
      flow: Math.round(this.totalFlow + this.player.flow),
      tricks: `${this.totalTricks + this.trickGates.filter((gate) => gate.taken).length}`,
      page: `${this.levelIndex + 1} / ${TOTAL_LEVELS}`,
      progress: `${Math.round(progressRatio * 100)}% to ${nextCheckpointLabel}`,
      level,
      inkWaves: this.inkWaves,
      result: this.result,
      status: this.statusFlash
        ? `${this.statusFlash.label} ${this.statusFlash.detail}`.trim()
        : level.beat,
    };
  }
}
