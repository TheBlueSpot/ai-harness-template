import { createLevel, getTileAt, isClimbableTile } from "./level.js";
import {
  allGoldCollected,
  countCollectedGold,
  createInitialState,
  revealEscapeLadders,
  stepPitTimers,
  tileBlocksMovement,
} from "./state.js";

const TILE = 32;
const WORLD_WIDTH = 24 * TILE;
const WORLD_HEIGHT = 18 * TILE;
const GRAVITY = 1800;
const MOVE_SPEED = 180;
const CLIMB_SPEED = 150;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Game {
  constructor() {
    this.level = createLevel();
    this.viewport = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    this.start();
  }

  start() {
    this.mode = "menu";
    this.score = 0;
    this.time = 0;
    this.state = createInitialState(this.level);
    this.state.mode = "menu";
    this.overlay = {
      show: true,
      eyebrow: "Burrow run",
      title: "Lode Runner Burrow",
      copy: "Run the tunnels, grab the gold, and reach the ladder exit before the guards box you in.",
      button: "Start",
    };
    this.message = "Press Enter to start the burrow.";
    this.restartHint = "Enter or R to restart.";
  }

  restart() {
    this.start();
    this.beginPlay();
  }

  beginPlay() {
    this.mode = "play";
    this.overlay = { show: false };
    this.message = "Collect all gold to reveal the exit ladder.";
    this.state.mode = "play";
    this.state.message = this.message;
  }

  resize(viewport) {
    this.viewport = { ...this.viewport, ...viewport };
  }

  update(dt, input = {}) {
    const pressed = input.pressed || {};
    const held = input.held || {};

    if (this.mode !== "play") {
      if (pressed.KeyR) {
        this.restart();
        return;
      }
      if (pressed.Enter || pressed.Space) {
        if (this.mode === "menu") this.beginPlay();
        else this.restart();
      }
      return;
    }

    this.time += dt;
    this.state.time = this.time;
    this.state = stepPitTimers(this.state, dt);

    const moveX = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
    const moveY = (held.ArrowDown || held.KeyS ? 1 : 0) - (held.ArrowUp || held.KeyW ? 1 : 0);
    let digDirection = 0;
    if (pressed.KeyZ) digDirection = -1;
    else if (pressed.KeyX) digDirection = 1;
    else if (pressed.Space) digDirection = this.state.player.dir;

    if (moveX !== 0) this.state.player.dir = moveX > 0 ? 1 : -1;
    this.state.player.vx = moveX * MOVE_SPEED;

    if (moveY !== 0 && this.isOnLadder(this.state.player)) {
      this.state.player.vy = moveY * CLIMB_SPEED;
    }

    if (digDirection !== 0) this.digAtPlayer(digDirection);

    this.state.player.vy += GRAVITY * dt;
    this.stepActor(this.state.player, dt);
    this.resolveWorld(this.state.player);

    for (const enemy of this.state.enemies) {
      this.updateEnemy(enemy, dt);
    }

    this.collectGold();
    this.checkState();
  }

  getFrameState() {
    const goldCollected = countCollectedGold(this.state);
    const goldTotal = this.state.collectibles.length;
    const allGold = goldCollected === goldTotal && goldTotal > 0;
    const objectiveHint = allGold
      ? "Exit ladder open. Climb to the glowing marker at the top-right."
      : "Collect every gold pile to reveal the exit ladder. Z digs left, X digs right, Space digs forward.";
    return {
      mode: this.mode,
      score: this.score,
      goldCollected,
      goldTotal,
      time: this.time,
      message: this.message,
      objectiveHint,
      restartHint: this.restartHint,
      overlay: this.overlay,
      player: { ...this.state.player, facing: this.state.player.dir },
      guards: this.state.enemies.map((guard) => ({ ...guard, facing: guard.dir })),
      gold: this.state.collectibles.map((item) => ({
        x: item.x * TILE + TILE / 2,
        y: item.y * TILE + TILE / 2,
        taken: item.collected,
      })),
      ladders: [
        ...this.level.ladders.map((ladder) => ({ ...ladder, revealed: true })),
        ...this.state.escapeLadders.map((ladder) => ({ ...ladder })),
      ],
      tiles: this.level.raw.flatMap((row, y) =>
        row.split("").flatMap((tile, x) => {
          if (!tileBlocksMovement(this.level, this.state, x, y) && tile !== "#") return [];
          if (this.state.pits.some((pit) => pit.x === x && pit.y === y && !pit.active)) return [];
          return [{ x, y, dug: false, base: true }];
        }),
      ),
      exit: { x: this.level.exit.x * TILE + 4, y: this.level.exit.y * TILE + 2, w: 18, h: 24 },
      exitLocked: !allGold,
      view: { ...this.viewport },
    };
  }

  isSolidAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return tileBlocksMovement(this.level, this.state, tx, ty);
  }

  isOnLadder(actor) {
    const feetY = actor.y + actor.h / 2;
    const centerX = actor.x;
    const tx = Math.floor(centerX / TILE);
    const ty = Math.floor(feetY / TILE);
    return isClimbableTile(getTileAt(this.level, tx, ty)) || this.state.escapeLadders.some((ladder) => ladder.revealed && ladder.x === tx && ladder.y === ty);
  }

  digAtPlayer(direction) {
    const tx = Math.floor(this.state.player.x / TILE) + direction;
    const ty = Math.floor((this.state.player.y + this.state.player.h / 2 - 2) / TILE);
    const target = this.state.pits.find((pit) => pit.x === tx && pit.y === ty);
    if (target && target.active) {
      target.active = false;
      target.elapsed = 0;
      this.score += 5;
      this.message = "Burrow dug. Stay moving.";
      this.state.message = this.message;
    }
  }

  collectGold() {
    for (const item of this.state.collectibles) {
      if (item.collected) continue;
      const dx = Math.abs(item.x * TILE + TILE / 2 - this.state.player.x);
      const dy = Math.abs(item.y * TILE + TILE / 2 - this.state.player.y);
      if (dx < 20 && dy < 20) {
        item.collected = true;
        this.score += 100;
        this.message = "Gold pocketed. Keep the exit in sight.";
        this.state.message = this.message;
      }
    }
  }

  updateEnemy(enemy, dt) {
    const towardPlayer = Math.sign(this.state.player.x - enemy.x) || enemy.dir;
    enemy.vx = towardPlayer * 80;
    enemy.vy += GRAVITY * dt;
    this.stepActor(enemy, dt);
    this.resolveWorld(enemy);
    if (Math.abs(enemy.x - this.state.player.x) < 18 && Math.abs(enemy.y - this.state.player.y) < 18) {
      this.mode = "lose";
      this.state.lost = true;
      this.overlay = {
        show: true,
        eyebrow: "Caught",
        title: "Burrow run lost",
        copy: "A guard closed the lane. Press Enter or R to restart and keep the next exit visible.",
        button: "Retry",
      };
      this.message = "Caught by a guard. Restart fast.";
      this.state.message = this.message;
    }
  }

  stepActor(actor, dt) {
    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;
  }

  resolveWorld(actor) {
    const halfW = actor.w / 2;
    const halfH = actor.h / 2;
    const left = actor.x - halfW;
    const right = actor.x + halfW;
    const top = actor.y - halfH;
    const bottom = actor.y + halfH;

    if (this.isSolidAt(left, actor.y) || this.isSolidAt(right, actor.y)) {
      actor.x = clamp(actor.x - actor.vx * 0.016, halfW, WORLD_WIDTH - halfW);
    } else {
      actor.x = clamp(actor.x, halfW, WORLD_WIDTH - halfW);
    }

    actor.onGround = false;
    if (this.isSolidAt(actor.x, bottom + 2)) {
      actor.onGround = true;
      actor.vy = 0;
      const row = Math.floor((bottom + 2) / TILE);
      actor.y = row * TILE - halfH;
    } else if (this.isSolidAt(actor.x, top - 2) && actor.vy < 0) {
      actor.vy = 0;
    }

    actor.vx *= actor.onGround ? 0.86 : 0.98;
    if (actor.onGround) actor.y = Math.round(actor.y);
  }

  checkState() {
    if (this.mode !== "play") return;
    const allGold = allGoldCollected(this.state);
    if (allGold) this.state = revealEscapeLadders(this.state);
    const exitX = this.level.exit.x * TILE + 4;
    const exitY = this.level.exit.y * TILE + 2;
    const atExit = Math.abs(this.state.player.x - exitX) < 20 && Math.abs(this.state.player.y - exitY) < 28;
    if (allGold && atExit) {
      this.mode = "win";
      this.state.won = true;
      this.overlay = {
        show: true,
        eyebrow: "Cleared",
        title: "Burrow opened",
        copy: "Gold recovered. Press Enter or R to run the next burrow.",
        button: "Run again",
      };
      this.message = "Exit reached with all gold.";
      this.state.message = this.message;
    } else if (allGold) {
      this.message = "All gold taken. Head for the exit.";
      this.state.message = this.message;
    }
  }
}
