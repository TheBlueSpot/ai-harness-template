import { Quadtree } from "./Quadtree.js";
import { Terrain } from "./Terrain.js";
import { createWeaponCatalog } from "./Weapons.js";
import { Player } from "./actors/Player.js";
import { BulletManager } from "./actors/Bullet.js";
import { WaveDirector } from "./WaveDirector.js";
import { HUD } from "./HUD.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y, length = 1) {
  const mag = Math.hypot(x, y) || 1;
  return { x: (x / mag) * length, y: (y / mag) * length };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function createBackdrop(ctx, world) {
  ctx.fillStyle = "#09101a";
  ctx.fillRect(0, 0, world.width, world.height);

  for (let i = 0; i < 140; i += 1) {
    const x = (i * 173) % world.width;
    const y = (i * 97) % world.height;
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(248,200,74,0.04)";
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = "rgba(120,240,164,0.05)";
  for (let x = 0; x < world.width; x += 110) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y < world.height; y += 110) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
}

export class Game {
  constructor() {
    this.world = { width: 2200, height: 1300 };
    this.view = { width: 1280, height: 720 };
    this.camera = { x: 0, y: 0 };
    this.weapons = createWeaponCatalog();
    this.hud = new HUD();
    this.listeners = new Map();
    this.reset();
  }

  reset() {
    this.state = "ready";
    this.message = "Press Space or click to deploy.";
    this.terrain = new Terrain(this.world);
    this.player = new Player(this.world, this.weapons);
    this.enemies = [];
    this.effects = [];
    this.waveDirector = new WaveDirector(this.world, this.emit.bind(this));
    this.bulletManager = new BulletManager(
      this.terrain,
      this.handleCombatEvent.bind(this),
      (items) => this.buildDynamicIndex(items),
    );
  }

  on(eventName, fn) {
    const list = this.listeners.get(eventName) || [];
    list.push(fn);
    this.listeners.set(eventName, list);
    return () => {
      const next = (this.listeners.get(eventName) || []).filter((entry) => entry !== fn);
      this.listeners.set(eventName, next);
    };
  }

  emit(eventName, payload) {
    const list = this.listeners.get(eventName) || [];
    for (const fn of list) {
      fn(payload);
    }
  }

  handleCombatEvent(eventName, payload) {
    if (eventName === "enemy-killed") {
      this.waveDirector.recordKill(payload.enemy);
      this.message = `Wave ${this.waveDirector.wave} pressure broken.`;
      this.spawnSparks(payload.x, payload.y, "#7ff0b4");
    }
    if (eventName === "enemy-hit") {
      this.spawnSparks(payload.x, payload.y, "#f8c84a");
    }
    if (eventName === "player-hit") {
      this.message = "Incoming fire. Keep moving.";
      this.spawnSparks(payload.x, payload.y, "#ff7d73");
    }
    if (eventName === "terrain-hit") {
      this.spawnSparks(payload.x, payload.y, "#dce8ff");
    }
    this.emit(eventName, payload);
  }

  buildDynamicIndex(items) {
    const tree = new Quadtree({ x: 0, y: 0, w: this.world.width, h: this.world.height });
    for (const item of items) {
      if (!item.dead) {
        tree.insert(item);
      }
    }
    return tree;
  }

  start() {
    if (this.state === "playing") {
      return;
    }
    if (this.state === "dead" || this.state === "won") {
      this.reset();
    }
    this.state = "playing";
    this.message = "Hold lane. Break cover. Survive.";
  }

  firePlayerWeapon() {
    if (!this.player.canFire()) {
      return;
    }
    for (const shot of this.player.buildShots()) {
      this.bulletManager.spawn({ ...shot, projectileSpeed: Math.hypot(shot.vx, shot.vy) });
    }
    this.emit("player-fired", { weaponId: this.player.weapon.id });
  }

  update(dt, input) {
    if (input.start) {
      this.start();
    }
    if (this.state !== "playing") {
      this.updateCamera();
      this.stepEffects(dt);
      return;
    }

    this.player.update(dt, input, this.terrain, this.emit.bind(this));
    if (input.fire) {
      this.firePlayerWeapon();
    }

    this.waveDirector.update(dt, this);
    for (const enemy of this.enemies) {
      enemy.update(dt, this);
    }
    this.resolveEnemyPush();
    this.bulletManager.update(dt, this);
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    this.stepEffects(dt);
    this.updateCamera();

    if (this.player.hp <= 0) {
      this.state = "dead";
      this.message = "Downed. Click or Space restart.";
    } else if (this.waveDirector.wave >= 7 && this.waveDirector.spawnBudget === 0 && this.enemies.length === 0) {
      this.state = "won";
      this.message = "Landing zone clear.";
    }
  }

  resolveEnemyPush() {
    for (const enemy of this.enemies) {
      if (enemy.dead) {
        continue;
      }
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      if (Math.hypot(dx, dy) < enemy.radius + this.player.radius + 4 && this.player.damage(1)) {
        const push = normalize(dx, dy, -120);
        enemy.x += push.x * 0.04;
        enemy.y += push.y * 0.04;
        this.spawnSparks(this.player.x, this.player.y, "#ff7d73");
      }
    }
  }

  updateCamera() {
    this.camera.x = clamp(this.player.x - this.view.width / 2, 0, this.world.width - this.view.width);
    this.camera.y = clamp(this.player.y - this.view.height / 2, 0, this.world.height - this.view.height);
  }

  stepEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.life -= dt;
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      if (effect.life <= 0) {
        this.effects.splice(i, 1);
      }
    }
  }

  spawnSparks(x, y, color) {
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      this.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.22 + Math.random() * 0.28,
        color,
      });
    }
  }

  getFrameState() {
    return {
      width: this.view.width,
      height: this.view.height,
      state: this.state,
      score: this.waveDirector.score,
      wave: this.waveDirector.wave,
      enemies: this.enemies.length,
      message: this.message,
      player: {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        heat: this.player.heat,
        weaponLabel: this.player.weapon.label,
      },
    };
  }

  render(ctx) {
    ctx.clearRect(0, 0, this.view.width, this.view.height);
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    createBackdrop(ctx, this.world);
    this.terrain.render(ctx);
    this.renderEffects(ctx);
    for (const enemy of this.enemies) {
      enemy.render(ctx);
    }
    this.bulletManager.render(ctx);
    this.player.render(ctx);
    ctx.restore();
    this.hud.render(ctx, this.getFrameState());
    this.renderOverlay(ctx);
  }

  renderEffects(ctx) {
    for (const effect of this.effects) {
      ctx.globalAlpha = Math.max(0, effect.life / 0.5);
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x, effect.y, 2.2, 2.2);
    }
    ctx.globalAlpha = 1;
  }

  renderOverlay(ctx) {
    if (this.state === "playing") {
      return;
    }

    ctx.fillStyle = "rgba(2,5,9,0.58)";
    ctx.fillRect(0, 0, this.view.width, this.view.height);
    ctx.fillStyle = "rgba(8,14,23,0.93)";
    ctx.strokeStyle = "rgba(210,225,255,0.14)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, 320, 182, 640, 280, 26);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#edf4ff";
    ctx.font = '700 42px "Trebuchet MS", sans-serif';
    const title = this.state === "dead" ? "Downed" : this.state === "won" ? "Zone Clear" : "Slug Hail";
    ctx.fillText(title, 362, 250);
    ctx.font = '20px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    const body = this.state === "dead"
      ? "Enemy line broke through. Restart, carve new cover, hold harder."
      : this.state === "won"
        ? "Paratrooper push collapsed. Landing zone survived hail."
        : "Run-and-gun survival. Shoot terrain open, swap weapons, outlast wave pressure.";
    ctx.fillText(body, 362, 300);
    ctx.fillText("Press Space or click start. Press Q switch weapon.", 362, 350);
  }
}
