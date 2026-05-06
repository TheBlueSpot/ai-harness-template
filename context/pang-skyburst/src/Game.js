import { applyPlayerMotion, ballDamageRadius, resolveGround, updateBlob, updateHarpoon } from "./physics.js";
import { createInitialState, createPlatformSet, createStageBlobs } from "./state.js";

const WORLD = {
  left: 0.06,
  right: 0.94,
  top: 0.08,
  bottom: 0.94,
};

function cloneFrame(state) {
  return {
    mode: state.mode,
    score: state.score,
    lives: state.lives,
    stage: state.stage,
    stageGoal: state.stageGoal,
    hint: state.hint,
    overlayKicker: state.overlayKicker,
    overlayTitle: state.overlayTitle,
    overlayCopy: state.overlayCopy,
    overlayPrimary: state.overlayPrimary,
    player: { ...state.player },
    harpoon: { ...state.harpoon },
    blobs: state.blobs.map((blob) => ({ ...blob })),
    platforms: state.platforms.map((platform) => ({ ...platform })),
    totalBlobs: state.totalBlobs,
    messageTimer: state.messageTimer,
    transitionTimer: state.transitionTimer,
  };
}

export class Game {
  constructor() {
    this.state = createInitialState();
    this.nextBlobId = 1;
    this.started = false;
  }

  start() {
    if (!this.started) this.started = true;
    if (this.state.mode === "menu") this.restart();
  }

  restart() {
    this.state = createInitialState();
    this.state.mode = "play";
    this.state.overlayCopy = "Clear every blob. Fire the tether with X, J, or Ctrl.";
    this.state.overlayPrimary = "Restart";
    this.state.platforms = createPlatformSet();
    this.state.blobs = createStageBlobs(1).map((blob) => ({ ...blob, id: this.nextBlobId++ }));
    this.state.totalBlobs = this.state.blobs.length;
    this.state.messageTimer = 0;
    this.state.transitionTimer = 0;
    this.state.hint = "Move, jump, and fire one tether at a time.";
  }

  update(dt, input) {
    if (!this.started) return;
    this.state.messageTimer = Math.max(0, this.state.messageTimer - dt);
    this.state.transitionTimer = Math.max(0, this.state.transitionTimer - dt);

    if (this.state.mode === "menu") {
      if (input?.pressed?.Enter || input?.pressed?.Space) this.restart();
      return;
    }

    if (this.state.mode === "lose" || this.state.mode === "clear") {
      if (this.state.transitionTimer === 0 && (input?.pressed?.Enter || input?.pressed?.Space || input?.pressed?.KeyR)) {
        this.restart();
      }
      return;
    }

    if (input?.pressed?.KeyR) {
      this.restart();
      return;
    }

    const player = this.state.player;
    const harpoon = this.state.harpoon;
    applyPlayerMotion(player, input, dt, WORLD);
    updateHarpoon(harpoon, player, input, dt);
    resolveGround(player, this.state.platforms);

    for (const blob of this.state.blobs) updateBlob(blob, dt, WORLD, this.state.platforms);

    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);

    this.resolveHarpoonHits();
    this.resolvePlayerHits();
    this.cleanup();

    this.state.stageGoal = Math.max(0, Math.round(((1 - this.state.blobs.length / Math.max(1, this.state.totalBlobs)) || 0) * 100));
    this.state.hint = this.state.blobs.length > 0 ? "Cut blobs apart, then finish the small ones." : "Stage clear pending.";

    if (this.state.blobs.length === 0) {
      this.state.mode = "clear";
      this.state.overlayKicker = "Stage Clear";
      this.state.overlayTitle = `Stage ${this.state.stage} clear`;
      this.state.overlayCopy = "All blobs popped. Restart to run again.";
      this.state.overlayPrimary = "Next Run";
      this.state.transitionTimer = 0.35;
      this.state.hint = "Stage clear. Press Start to restart.";
      this.state.score += 250 + this.state.stage * 25;
    }

    if (this.state.lives <= 0) {
      this.state.mode = "lose";
      this.state.overlayKicker = "Run Lost";
      this.state.overlayTitle = "Skyburst failed";
      this.state.overlayCopy = "You took too many hits. Restart fast and try again.";
      this.state.overlayPrimary = "Retry";
      this.state.transitionTimer = 0.2;
      this.state.hint = "Out of lives. Restart now.";
    }
  }

  resolveHarpoonHits() {
    const harpoon = this.state.harpoon;
    if (!harpoon.active) return;
    if (harpoon.y <= WORLD.top) {
      harpoon.active = false;
      return;
    }
    for (let i = 0; i < this.state.blobs.length; i += 1) {
      const blob = this.state.blobs[i];
      const dx = Math.abs(blob.x - harpoon.x);
      const dy = Math.abs(blob.y - harpoon.y);
      if (dx <= blob.radius + harpoon.width && dy <= blob.radius + harpoon.height) {
        this.popBlob(i);
        harpoon.active = false;
        this.state.score += 100 * blob.size;
        this.state.stageGoal = Math.max(0, Math.round((1 - this.state.blobs.length / Math.max(1, this.state.totalBlobs)) * 100));
        return;
      }
    }
  }

  resolvePlayerHits() {
    const player = this.state.player;
    if (player.invuln > 0) return;
    for (const blob of this.state.blobs) {
      const dx = Math.abs(blob.x - player.x);
      const dy = Math.abs(blob.y - player.y);
      const hitRadius = blob.radius + ballDamageRadius(blob.size);
      if (dx <= hitRadius && dy <= hitRadius) {
        this.state.lives -= 1;
        player.invuln = 1.2;
        player.vy = -0.42;
        player.vx = -player.facing * 0.16;
        this.state.score = Math.max(0, this.state.score - 75);
        this.state.hint = "Hit taken. Keep moving and reset spacing.";
        return;
      }
    }
  }

  popBlob(index) {
    const blob = this.state.blobs[index];
    this.state.blobs.splice(index, 1);
    if (blob.size > 1) {
      const nextSize = blob.size - 1;
      const radius = [0.062, 0.042][nextSize - 1];
      const speed = 0.18 + nextSize * 0.05;
      const leftBlob = {
        id: this.nextBlobId++,
        size: nextSize,
        x: blob.x - 0.018,
        y: blob.y,
        vx: -speed,
        vy: -0.35,
        radius,
        bobSeed: blob.bobSeed,
      };
      const rightBlob = {
        id: this.nextBlobId++,
        size: nextSize,
        x: blob.x + 0.018,
        y: blob.y,
        vx: speed,
        vy: -0.35,
        radius,
        bobSeed: blob.bobSeed + 0.3,
      };
      this.state.blobs.push(leftBlob, rightBlob);
    }
    this.state.score += 10;
  }

  cleanup() {
    this.state.harpoon.active = this.state.harpoon.active && this.state.harpoon.y > WORLD.top;
    this.state.totalBlobs = Math.max(this.state.totalBlobs, this.state.blobs.length);
  }

  render(ctx) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#08111f");
    bg.addColorStop(1, "#03050a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const scaleX = width;
    const scaleY = height;
    const mapX = (x) => x * scaleX;
    const mapY = (y) => y * scaleY;

    ctx.fillStyle = "#25344d";
    for (const platform of this.state.platforms) {
      ctx.fillRect(mapX(platform.x), mapY(platform.y), platform.w * scaleX, platform.h * scaleY);
    }

    ctx.strokeStyle = "#61f3ff";
    ctx.lineWidth = Math.max(2, width * 0.004);
    if (this.state.harpoon.active) {
      ctx.beginPath();
      ctx.moveTo(mapX(this.state.harpoon.x), mapY(this.state.harpoon.y));
      ctx.lineTo(mapX(this.state.harpoon.x), mapY(this.state.player.y - this.state.player.height));
      ctx.stroke();
    }

    ctx.fillStyle = this.state.player.invuln > 0 ? "#ffd166" : "#8ef0ff";
    const player = this.state.player;
    ctx.fillRect(
      mapX(player.x - player.width * 0.5),
      mapY(player.y - player.height * 0.5),
      player.width * scaleX,
      player.height * scaleY,
    );

    for (const blob of this.state.blobs) {
      ctx.beginPath();
      ctx.fillStyle = blob.size === 3 ? "#ff7d6e" : blob.size === 2 ? "#ffb36e" : "#f3e36b";
      ctx.arc(mapX(blob.x), mapY(blob.y), blob.radius * scaleX, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  getFrameState() {
    return cloneFrame(this.state);
  }
}
