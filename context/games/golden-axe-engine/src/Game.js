import {
  ATTACK_COOLDOWN,
  FLOOR_BOTTOM,
  FLOOR_LEFT,
  FLOOR_RIGHT,
  FLOOR_TOP,
  MAGIC_MAX,
  MAX_HEALTH,
  MOUNT_DAMAGE,
  MOUNT_SPEED,
  PLAYER_DAMAGE,
  PLAYER_RANGE_X,
  PLAYER_RANGE_Y,
  PLAYER_SPEED,
  STAGES,
} from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makePlayer() {
  return {
    kind: "player",
    x: 340,
    y: 340,
    facing: 1,
    health: MAX_HEALTH,
    magic: 0,
    speed: PLAYER_SPEED,
    mounted: false,
    attacking: 0,
    invuln: 0,
    flash: 0,
  };
}

function makeEnemy(stageIndex, index, rider) {
  const side = index % 2 === 0 ? 1 : -1;
  return {
    kind: "enemy",
    id: `${stageIndex}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    x: side > 0 ? FLOOR_RIGHT + 30 + (index % 3) * 40 : FLOOR_LEFT - 30 - (index % 3) * 40,
    y: FLOOR_TOP + 40 + ((index * 57) % (FLOOR_BOTTOM - FLOOR_TOP - 80)),
    vx: 0,
    vy: 0,
    facing: side > 0 ? -1 : 1,
    health: rider ? 56 : 42 + stageIndex * 10,
    attackCooldown: 20 + (index % 4) * 12,
    attacking: 0,
    flash: 0,
    flankBias: side,
    mounted: rider,
    dropMount: rider,
  };
}

function makeMount(x, y, rider = false) {
  return {
    kind: "mount",
    x,
    y,
    rider,
    claimed: rider,
  };
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.state = "menu";
    this.stageIndex = 0;
    this.player = makePlayer();
    this.enemies = [];
    this.mounts = [];
    this.effects = [];
    this.stageProgress = 0;
    this.stageTimer = 0;
    this.pendingSpawns = 0;
    this.spawnClock = 0;
    this.magicBurst = 0;
    this.message = "Break the raid and steal the beast.";
    this.loadStage(this.stageIndex);
  }

  start() {
    if (this.state === "menu") {
      this.state = "playing";
      this.message = `${STAGES[this.stageIndex].name}`;
    }
  }

  loadStage(index) {
    const stage = STAGES[index];
    this.pendingSpawns = stage.enemies;
    this.spawnClock = 20;
    this.stageTimer = 0;
    this.enemies = [];
    this.mounts = [];
    this.effects = [];
    if (this.player.mounted) {
      this.player.mounted = false;
      this.player.speed = PLAYER_SPEED;
    }
  }

  update(dt, input) {
    const steps = Math.max(1, Math.round((dt || 1 / 60) * 60));
    for (let i = 0; i < steps; i += 1) {
      this.step(input);
    }
  }

  step(input) {
    if (input?.pressed?.Enter && (this.state === "menu" || this.state === "win" || this.state === "lose")) {
      this.restart();
      this.start();
      return;
    }

    if (this.state !== "playing") {
      return;
    }

    this.stageTimer += 1;
    this.magicBurst = Math.max(0, this.magicBurst - 1);
    this.tickEffects();
    this.spawnEnemies();
    this.updatePlayer(input);
    this.updateEnemies();
    this.resolveCombat(input);
    this.cleanup();
    this.updateStageFlow();
  }

  updatePlayer(input) {
    const moveX = (input.held.ArrowRight || input.held.KeyD ? 1 : 0) - (input.held.ArrowLeft || input.held.KeyA ? 1 : 0);
    const moveY = (input.held.ArrowDown || input.held.KeyS ? 1 : 0) - (input.held.ArrowUp || input.held.KeyW ? 1 : 0);
    if (moveX !== 0) {
      this.player.facing = moveX > 0 ? 1 : -1;
    }
    const speed = this.player.speed;
    this.player.x = clamp(this.player.x + moveX * speed, FLOOR_LEFT, FLOOR_RIGHT);
    this.player.y = clamp(this.player.y + moveY * speed * 0.82, FLOOR_TOP, FLOOR_BOTTOM);
    this.player.attacking = Math.max(0, this.player.attacking - 1);
    this.player.invuln = Math.max(0, this.player.invuln - 1);
    this.player.flash = Math.max(0, this.player.flash - 1);

    if (input.pressed.KeyJ && this.player.attacking === 0) {
      this.player.attacking = ATTACK_COOLDOWN;
      this.message = this.player.mounted ? "Mounted slash." : "Battle axe swing.";
    }

    if (input.pressed.KeyK && this.player.magic >= MAGIC_MAX) {
      this.castMagic();
    }

    if (input.pressed.KeyE) {
      this.tryMount();
    }
  }

  updateEnemies() {
    const crowdCenterY =
      this.enemies.length > 0 ? this.enemies.reduce((sum, enemy) => sum + enemy.y, 0) / this.enemies.length : this.player.y;

    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      enemy.attacking = Math.max(0, enemy.attacking - 1);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - 1);
      enemy.flash = Math.max(0, enemy.flash - 1);

      const flankTargetX = this.player.x + enemy.flankBias * 74;
      const spreadY = this.player.y + (i % 2 === 0 ? -34 : 34);
      const wantY = Math.abs(enemy.y - crowdCenterY) < 18 ? spreadY : this.player.y;
      const dx = flankTargetX - enemy.x;
      const dy = wantY - enemy.y;
      enemy.facing = dx >= 0 ? 1 : -1;

      const speed = enemy.mounted ? 2.9 : 2.15;
      if (Math.abs(dx) > 22) {
        enemy.x = clamp(enemy.x + Math.sign(dx) * speed, FLOOR_LEFT, FLOOR_RIGHT);
      }
      if (Math.abs(dy) > 10) {
        enemy.y = clamp(enemy.y + Math.sign(dy) * speed * 0.72, FLOOR_TOP, FLOOR_BOTTOM);
      }

      const inRange =
        Math.abs(enemy.x - this.player.x) < (enemy.mounted ? 108 : 72) &&
        Math.abs(enemy.y - this.player.y) < 40;
      if (inRange && enemy.attackCooldown === 0) {
        enemy.attacking = enemy.mounted ? 28 : 20;
        enemy.attackCooldown = enemy.mounted ? 64 : 52;
      }
    }
  }

  resolveCombat(input) {
    if (this.player.attacking === Math.floor(ATTACK_COOLDOWN / 2)) {
      const damage = this.player.mounted ? MOUNT_DAMAGE : PLAYER_DAMAGE;
      for (const enemy of this.enemies) {
        const xOk =
          this.player.facing > 0
            ? enemy.x > this.player.x && enemy.x - this.player.x < PLAYER_RANGE_X + (this.player.mounted ? 36 : 0)
            : enemy.x < this.player.x && this.player.x - enemy.x < PLAYER_RANGE_X + (this.player.mounted ? 36 : 0);
        const yOk = Math.abs(enemy.y - this.player.y) < PLAYER_RANGE_Y + (this.player.mounted ? 12 : 0);
        if (xOk && yOk) {
          enemy.health -= damage;
          enemy.flash = 8;
          this.player.magic = clamp(this.player.magic + 12, 0, MAGIC_MAX);
          this.effects.push({ x: enemy.x, y: enemy.y - 42, color: "#fff1a8", life: 14, maxLife: 14 });
        }
      }
    }

    for (const enemy of this.enemies) {
      const hitFrame = enemy.mounted ? 14 : 10;
      if (enemy.attacking === hitFrame && this.player.invuln === 0) {
        const rangeX = enemy.mounted ? 112 : 80;
        if (Math.abs(enemy.x - this.player.x) < rangeX && Math.abs(enemy.y - this.player.y) < 44) {
          this.player.health -= enemy.mounted ? 16 : 10;
          this.player.invuln = 30;
          this.player.flash = 10;
          this.effects.push({ x: this.player.x, y: this.player.y - 48, color: "#ff8465", life: 16, maxLife: 16 });
          this.message = enemy.mounted ? "Raider trample." : "Flank hit landed.";
        }
      }
    }

    if (this.player.health <= 0) {
      this.state = "lose";
      this.message = "The village falls. Press Enter to ride again.";
    }
  }

  castMagic() {
    this.player.magic = 0;
    this.magicBurst = 30;
    this.message = "Dragon magic tears through the raid.";
    for (const enemy of this.enemies) {
      enemy.health -= 34;
      enemy.flash = 18;
      this.effects.push({ x: enemy.x, y: enemy.y - 56, color: "#8ce9ff", life: 20, maxLife: 20 });
    }
  }

  tryMount() {
    if (this.player.mounted) {
      this.player.mounted = false;
      this.player.speed = PLAYER_SPEED;
      const dropped = makeMount(this.player.x - this.player.facing * 24, this.player.y + 8, false);
      dropped.claimed = false;
      this.mounts.push(dropped);
      this.message = "You dismount.";
      return;
    }

    const nearby = this.mounts.find((mount) => !mount.claimed && distance(mount, this.player) < 72);
    if (nearby) {
      nearby.claimed = true;
      this.player.mounted = true;
      this.player.speed = MOUNT_SPEED;
      this.mounts = this.mounts.filter((mount) => mount !== nearby);
      this.message = "Mount seized.";
    }
  }

  spawnEnemies() {
    if (this.pendingSpawns <= 0) {
      return;
    }
    this.spawnClock -= 1;
    if (this.spawnClock > 0) {
      return;
    }

    const stage = STAGES[this.stageIndex];
    const spawnIndex = stage.enemies - this.pendingSpawns;
    const rider = spawnIndex === stage.riderAt;
    this.enemies.push(makeEnemy(this.stageIndex, spawnIndex, rider));
    this.pendingSpawns -= 1;
    this.spawnClock = stage.spawnRate;
  }

  cleanup() {
    const survivors = [];
    for (const enemy of this.enemies) {
      if (enemy.health > 0) {
        survivors.push(enemy);
        continue;
      }
      this.stageProgress += 1;
      this.player.magic = clamp(this.player.magic + 18, 0, MAGIC_MAX);
      this.effects.push({ x: enemy.x, y: enemy.y - 52, color: "#ffd36b", life: 18, maxLife: 18 });
      if (enemy.dropMount) {
        this.mounts.push(makeMount(enemy.x, enemy.y + 8, false));
        this.message = "A beast collapses free. Press E to claim it.";
      } else {
        this.message = "Enemy broken.";
      }
    }
    this.enemies = survivors;
  }

  updateStageFlow() {
    if (this.state !== "playing") {
      return;
    }

    if (this.pendingSpawns === 0 && this.enemies.length === 0) {
      if (this.stageIndex === STAGES.length - 1) {
        this.state = "win";
        this.message = "Death Adder's line is shattered. Press Enter for another run.";
        return;
      }
      this.stageIndex += 1;
      this.loadStage(this.stageIndex);
      this.message = `Stage clear. ${STAGES[this.stageIndex].name}`;
    }
  }

  tickEffects() {
    for (const effect of this.effects) {
      effect.life -= 1;
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  getFrameState() {
    return {
      state: this.state,
      stageNumber: this.stageIndex + 1,
      stageTotal: STAGES.length,
      stage: STAGES[this.stageIndex],
      message: this.message,
      magicBurst: this.magicBurst,
      player: { ...this.player },
      enemies: this.enemies.map((enemy) => ({ ...enemy })),
      mounts: this.mounts.map((mount) => ({ ...mount })),
      effects: this.effects.map((effect) => ({ ...effect })),
      overlay: this.getOverlay(),
    };
  }

  getOverlay() {
    if (this.state === "menu") {
      return {
        eyebrow: "belt-scroller combat",
        title: "Golden Axe Engine",
        copy: "Push through three stages, flank-break enemy packs, steal their mounts, and save full mana for a room wipe.",
        button: "Start Run",
      };
    }
    if (this.state === "win") {
      return {
        eyebrow: "victory",
        title: "The gate is broken.",
        copy: "Your mount survived the final rush. Press Enter or Restart to run again.",
        button: "Restart Run",
      };
    }
    if (this.state === "lose") {
      return {
        eyebrow: "defeat",
        title: "The raid overran you.",
        copy: "Use lane movement to dodge packs, then spend full magic before a flank collapses.",
        button: "Restart Run",
      };
    }
    return null;
  }
}
