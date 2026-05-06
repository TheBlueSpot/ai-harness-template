import {
  BOSS_CORE_MAX,
  BOSS_SHIELD_MAX,
  DOUBLE_SHOT_HEIGHT,
  DOUBLE_SHOT_WIDTH,
  ENEMY_BULLET_SPEED_CORE,
  ENEMY_BULLET_SPEED_SHIELD,
  ENEMY_SHOT_SIZE,
  ENEMY_WAVE_INTERVAL,
  GAME_HEIGHT,
  GAME_WIDTH,
  LASER_SHOT_HEIGHT,
  LASER_SHOT_WIDTH,
  MISSILE_SHOT_HEIGHT,
  MISSILE_SHOT_WIDTH,
  OPTION_COUNT,
  PLAYER_FIRE_RATE,
  PLAYER_SHOT_HEIGHT,
  PLAYER_SHOT_WIDTH,
  PLAYER_SPEED,
  SHIELD_MAX,
} from "./constants.js";
import { buildStarfield, buildWave } from "./patterns.js";
import { clampPowerSlot, createInitialState, makeBoss, makePlayer } from "./state.js";
import { isBossEnemy } from "./enemies.js";

const POWER_LABELS = ["SPEED", "MISSILE", "DOUBLE", "LASER", "OPTION", "SHIELD", "BARRIER"];
const WEAPON_LABELS = ["NORMAL", "MISSILE", "DOUBLE", "LASER"];

function getPowerLabel(index) {
  return POWER_LABELS[Math.max(0, Math.min(POWER_LABELS.length - 1, index))] ?? POWER_LABELS[0];
}

export class Game {
  constructor() {
    this.state = createInitialState(GAME_WIDTH, GAME_HEIGHT);
    this.spawnClock = 0;
    this.restartPending = false;
  }

  start() {
    this.state = createInitialState(this.state.view.width, this.state.view.height);
    this.state.mode = "play";
    this.state.overlay.show = false;
    this.state.player = makePlayer(this.state.view.width, this.state.view.height);
    this.state.boss = makeBoss(this.state.view.width, this.state.view.height);
    this.state.stars = buildStarfield(this.state.view.width, this.state.view.height);
    this.spawnClock = 0;
  }

  restart() {
    this.start();
  }

  resize(width, height) {
    const nextWidth = typeof width === "object" ? width.width : width;
    const nextHeight = typeof width === "object" ? width.height : height;
    this.state.view.width = nextWidth ?? this.state.view.width;
    this.state.view.height = nextHeight ?? this.state.view.height;
  }

  update(dt, input) {
    this.state.time += dt;
    const fireHeld = Boolean(input?.held?.Space);
    const activatePressed = Boolean(input?.pressed?.ShiftLeft || input?.pressed?.ShiftRight || input?.pressed?.KeyX);
    const startPressed = Boolean(input?.pressed?.Enter);

    if (this.state.mode !== "play") {
      this.state.overlay.show = true;
      if (startPressed || fireHeld) {
        this.start();
      }
      return;
    }

    const player = this.state.player;
    const left = Boolean(input?.held?.ArrowLeft);
    const right = Boolean(input?.held?.ArrowRight);
    const up = Boolean(input?.held?.ArrowUp);
    const down = Boolean(input?.held?.ArrowDown);
    player.vx = (right - left) * (PLAYER_SPEED + player.speedLevel * 35);
    player.vy = (down - up) * (PLAYER_SPEED * 0.75 + player.speedLevel * 25);
    player.x = Math.max(40, Math.min(this.state.view.width * 0.42, player.x + player.vx * dt));
    player.y = Math.max(52, Math.min(this.state.view.height - 52, player.y + player.vy * dt));
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.history.unshift({ x: player.x, y: player.y });
    player.history.length = Math.max(12, OPTION_COUNT * 22);

    this.updateOptions();
    this.updatePowerBar(dt, activatePressed);
    this.updatePickups(dt);
    this.updateEnemies(dt, fireHeld);
    this.updateBoss(dt);
    this.resolveDamage();
    this.updateHud();
    this.state.overlay.show = false;
  }

  render() {}

  getFrameState() {
    return {
      ...this.state,
      hud: {
        score: this.state.score,
        lives: this.state.lives,
        shield: this.state.shield,
        weapon: this.state.weaponState,
        boss: this.state.bossState,
      },
      player: {
        ...this.state.player,
        options: this.state.options,
      },
    };
  }

  updateOptions() {
    const history = this.state.player.history;
    this.state.options = Array.from({ length: this.state.player.optionCount }, (_, index) => {
      const sample =
        history[Math.floor((index + 1) * 10)] ??
        history[history.length - 1] ??
        { x: this.state.player.x, y: this.state.player.y };
      return { x: sample.x, y: sample.y, r: 13, ready: index < this.state.player.optionCount };
    });
  }

  updatePowerBar(dt, activatePressed) {
    this.state.powerBarFlash = Math.max(0, this.state.powerBarFlash - dt * 4);
    if (activatePressed && this.state.powerBarIndex >= 0) {
      this.applyPowerup();
      this.state.powerBarFlash = 1;
      this.state.powerBarIndex = -1;
      this.state.powerBarLabel = "NEXT SPEED";
      this.state.powerBarReady = false;
      this.state.powerTutorialComplete = true;
    }
  }

  applyPowerup() {
    const player = this.state.player;
    switch (getPowerLabel(this.state.powerBarIndex)) {
      case "SPEED":
        player.speedLevel = Math.min(4, player.speedLevel + 1);
        break;
      case "MISSILE":
        player.weapon = 1;
        break;
      case "DOUBLE":
        player.weapon = 2;
        break;
      case "LASER":
        player.weapon = 3;
        break;
      case "OPTION":
        player.optionCount = Math.min(OPTION_COUNT, player.optionCount + 1);
        break;
      case "SHIELD":
        this.state.shield = SHIELD_MAX;
        break;
      case "BARRIER":
        player.invuln = 1.2;
        break;
      default:
        player.weapon = (player.weapon + 1) % 4;
        break;
    }
  }

  updatePickups(dt) {
    for (const pickup of this.state.pickups) pickup.x += pickup.vx * dt;
    const player = this.state.player;
    const collected = [];
    this.state.pickups = this.state.pickups.filter((pickup) => {
      const dx = pickup.x - player.x;
      const dy = pickup.y - player.y;
      if (dx * dx + dy * dy < 900) {
        collected.push(pickup);
        return false;
      }
      return pickup.x > -40;
    });
    for (const _pickup of collected) {
      this.state.powerBarIndex = clampPowerSlot(this.state.powerBarIndex + 1);
      this.state.powerBarLabel = getPowerLabel(this.state.powerBarIndex);
      this.state.powerBarReady = this.state.powerBarIndex >= 0;
      this.state.alert = `${this.state.powerBarLabel} primed. Press Shift or X.`;
    }
  }

  updateEnemies(dt, fireHeld) {
    this.spawnClock += dt;
    if (this.spawnClock > ENEMY_WAVE_INTERVAL) {
      this.spawnClock = 0;
      this.state.enemies.push(...buildWave(this.state.time, this.state.view.width, this.state.view.height));
    }
    if (this.state.score > 800 && !this.state.boss.active) {
      this.state.boss.active = true;
      this.state.boss.phase = "shield";
      this.state.boss.x = this.state.view.width * 0.8;
    }
    for (const enemy of this.state.enemies) enemy.x += enemy.vx * dt;
    this.state.enemies = this.state.enemies.filter((enemy) => enemy.x > -80);
    this.state.enemies = this.state.enemies.filter((enemy) => !enemy.dead);
    if (fireHeld && this.state.player.fireCooldown <= 0) {
      this.state.player.fireCooldown = PLAYER_FIRE_RATE;
      this.spawnPlayerVolley(this.state.player.x + 26, this.state.player.y);
    }
    for (const option of this.state.options) {
      if (fireHeld && this.state.player.fireCooldown === PLAYER_FIRE_RATE) {
        this.spawnPlayerVolley(option.x + 18, option.y, 0.82);
      }
    }
    for (const projectile of this.state.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += (projectile.vy ?? 0) * dt;
    }
    this.resolveProjectileHits();
    this.state.projectiles = this.state.projectiles.filter((p) => p.x < this.state.view.width + 80 && p.x > -80 && p.y > -40 && p.y < this.state.view.height + 40);
  }

  updateBoss(dt) {
    const boss = this.state.boss;
    if (!boss.active) return;
    boss.x += (this.state.view.width * 0.72 - boss.x) * Math.min(1, dt * 1.1);
    boss.shieldVisible = boss.phase === "shield";
    boss.coreOpen = boss.phase === "core";
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      boss.attackTimer = boss.phase === "shield" ? 1.28 : 0.68;
      this.state.projectiles.push({
        owner: "enemy",
        x: boss.x - boss.w * 0.4,
        y: boss.y + (boss.phase === "shield" ? 0 : (Math.sin(this.state.time * 6) * 26)),
        vx: boss.phase === "shield" ? -ENEMY_BULLET_SPEED_SHIELD : -ENEMY_BULLET_SPEED_CORE,
        vy: boss.phase === "shield" ? 0 : Math.sin(this.state.time * 3) * 30,
        w: ENEMY_SHOT_SIZE,
        h: ENEMY_SHOT_SIZE,
        damage: boss.phase === "shield" ? 1 : 2,
      });
    }
    boss.shield = Math.max(0, boss.shield);
    boss.core = Math.max(0, boss.core);
  }

  updateHud() {
    const boss = this.state.boss;
    const primedLabel = this.state.powerBarIndex >= 0 ? getPowerLabel(this.state.powerBarIndex) : null;
    this.state.bossState = boss.active ? boss.phase : "idle";
    this.state.weaponState = WEAPON_LABELS[this.state.player.weapon] ?? "NORMAL";
    this.state.powerBarLabel = primedLabel ?? "NEXT SPEED";
    this.state.powerBarHintText = primedLabel
      ? "Shift / X to spend"
      : this.state.powerTutorialComplete
        ? "Collect another capsule"
        : "Shoot drones, grab a capsule";
    this.state.powerPromptText = primedLabel
      ? `${primedLabel} ARMED. PRESS SHIFT OR X.`
      : this.state.powerTutorialComplete
        ? ""
        : "FIRST CAPSULE ARMS SPEED";
    this.state.overlayEyebrow = this.state.mode === "clear" ? "Victory" : "Mission";
    this.state.overlayTitle = this.state.mode === "clear" ? "Boss Down" : "Gradius Option-Drive";
    this.state.overlayCopy =
      this.state.mode === "clear"
        ? "Boss down. Press Start to run again."
        : this.state.mode === "gameover"
          ? "Ship lost. Press Start to relaunch."
          : "Hold Space to fire. First capsule arms SPEED, then spend it with Shift or X.";
    this.state.overlayButton = "Start";
    if (this.state.mode === "play") {
      const bossAlert = this.state.boss.active
        ? boss.phase === "shield"
          ? "Break shield with steady fire"
          : "Core exposed"
        : "";
      const powerAlert = primedLabel
        ? `${primedLabel} armed. Shift or X to spend.`
        : this.state.powerTutorialComplete
          ? ""
          : "Shoot a drone and grab the capsule for SPEED.";
      this.state.alert = [bossAlert, powerAlert].filter(Boolean).join(" | ");
    }
    this.state.overlay.show = this.state.mode !== "play";
  }

  resolveDamage() {
    const player = this.state.player;
    for (const enemy of this.state.enemies) {
      if (Math.abs(enemy.x - player.x) < 18 && Math.abs(enemy.y - player.y) < 18) {
        this.applyDamage(enemy.damage);
        enemy.dead = true;
      }
    }
    if (this.state.boss.active && this.state.boss.phase === "core" && Math.abs(this.state.boss.x - player.x) < 70 && Math.abs(this.state.boss.y - player.y) < 50) {
      this.applyDamage(2);
    }
    this.state.enemies = this.state.enemies.filter((enemy) => !enemy.dead);
  }

  resolveProjectileHits() {
    for (const projectile of this.state.projectiles) {
      if (projectile.owner === "player") {
        for (const enemy of this.state.enemies) {
          if (isBossEnemy(enemy)) continue;
          if (Math.abs(projectile.x - enemy.x) < enemy.w / 2 && Math.abs(projectile.y - enemy.y) < enemy.h / 2) {
            enemy.hp -= projectile.damage;
            projectile.dead = true;
            if (enemy.hp <= 0) {
              enemy.dead = true;
              this.state.score += enemy.score;
              this.state.pickups.push({ x: enemy.x, y: enemy.y, vx: -90, kind: "power" });
            }
          }
        }
        if (!projectile.dead && this.state.boss.active) {
          const boss = this.state.boss;
          const hitBoss = Math.abs(projectile.x - boss.x) < boss.w / 2 && Math.abs(projectile.y - boss.y) < boss.h / 2;
          if (hitBoss) {
            projectile.dead = true;
            if (boss.phase === "shield") {
              boss.shield -= projectile.damage;
              if (boss.shield <= 0) {
                boss.phase = "core";
                boss.core = BOSS_CORE_MAX;
                this.state.alert = "Core exposed";
              }
            } else if (boss.phase === "core") {
              boss.core -= projectile.damage;
              if (boss.core <= 0) {
                this.state.mode = "clear";
                this.state.overlay = { show: true, title: "Boss Down", copy: "Press Start to run again." };
              }
            }
          }
        }
      } else if (projectile.owner === "enemy") {
        if (Math.abs(projectile.x - this.state.player.x) < 18 && Math.abs(projectile.y - this.state.player.y) < 18) {
          projectile.dead = true;
          this.applyDamage(projectile.damage ?? 1);
        }
      }
    }
    this.state.enemies = this.state.enemies.filter((enemy) => !enemy.dead);
    this.state.projectiles = this.state.projectiles.filter((projectile) => !projectile.dead);
  }

  spawnPlayerVolley(x, y, scale = 1) {
    const weapon = this.state.player.weapon;
    const baseDamage = weapon === 3 ? 2 : 1;
    this.state.projectiles.push({
      owner: "player",
      x,
      y,
      vx: weapon === 3 ? 720 : 580,
      vy: 0,
      w: weapon === 3 ? LASER_SHOT_WIDTH : PLAYER_SHOT_WIDTH,
      h: weapon === 3 ? LASER_SHOT_HEIGHT : PLAYER_SHOT_HEIGHT,
      damage: baseDamage * scale,
    });
    if (weapon === 1) {
      this.state.projectiles.push({
        owner: "player",
        x: x - 8,
        y: y + 12,
        vx: 470,
        vy: 130,
        w: MISSILE_SHOT_WIDTH,
        h: MISSILE_SHOT_HEIGHT,
        damage: scale,
      });
    } else if (weapon === 2) {
      this.state.projectiles.push({
        owner: "player",
        x: x - 2,
        y: y - 16,
        vx: 530,
        vy: -64,
        w: DOUBLE_SHOT_WIDTH,
        h: DOUBLE_SHOT_HEIGHT,
        damage: scale,
      });
    }
  }

  applyDamage(amount) {
    const player = this.state.player;
    if (player.invuln > 0) return;
    const shieldLoss = Math.min(this.state.shield, amount * 35);
    this.state.shield -= shieldLoss;
    if (this.state.shield <= 0) {
      this.state.shield = SHIELD_MAX;
      this.state.hull -= 1;
      this.state.lives = Math.max(0, this.state.hull);
      player.invuln = 1.5;
      if (this.state.hull <= 0) {
        this.state.mode = "gameover";
        this.state.overlay = { show: true, title: "Ship Lost", copy: "Press Start to restart." };
      }
    }
  }
}
