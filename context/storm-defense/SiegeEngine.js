const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class DamageBuffer {
  constructor() {
    this.byTarget = new Map();
    this.total = 0;
  }

  add(targetId, amount) {
    const damage = Math.max(0, Number(amount) || 0);
    if (!damage) return;
    this.total += damage;
    this.byTarget.set(targetId, (this.byTarget.get(targetId) ?? 0) + damage);
  }

  buffer(targetId, amount) {
    this.add(targetId, amount);
  }

  flush() {
    const entries = Array.from(this.byTarget.entries(), ([targetId, amount]) => ({ targetId, amount }));
    this.byTarget.clear();
    this.total = 0;
    return entries;
  }
}

const createBaseWeapon = () => ({
  clipSize: 8,
  ammo: 8,
  reloadDuration: 1.35,
  reloadTimer: 0,
  fireInterval: 0.07,
  fireCooldown: 0,
  bulletDamage: 18,
});

const createHouse = () => ({
  id: "house",
  x: 1120,
  y: 452,
  width: 170,
  height: 180,
  health: 300,
  maxHealth: 300,
});

export class SiegeEngine {
  constructor({ canvas, economyManager, enemySpawner, upgradeTree, assets } = {}) {
    this.canvas = canvas ?? null;
    this.economyManager = economyManager;
    this.enemySpawner = enemySpawner;
    this.upgradeTree = upgradeTree;
    this.assets = assets ?? {};
    this.worldWidth = 1280;
    this.worldHeight = 720;
    this.damageBuffer = new DamageBuffer();
    this.restartRun();
  }

  setAssets(assets = {}) {
    this.assets = assets;
  }

  restartRun() {
    this.economyManager?.reset?.({ gold: 18 });
    this.upgradeTree?.reset?.();
    this.state = "menu";
    this.wave = 0;
    this.finalWaveReached = 0;
    this.time = 0;
    this.house = createHouse();
    this.weapon = createBaseWeapon();
    this.aimTarget = { x: this.worldWidth * 0.52, y: this.worldHeight * 0.46 };
    this.triggerHeld = false;
    this.enemies = [];
    this.allies = [];
    this.turrets = [];
    this.traces = [];
    this.totalKills = 0;
    this.lastWaveSnapshot = { wave: 0, queued: 0, totalSpawns: 0, spawned: 0, active: 0, intermissionReady: false };
    this.enemySpawner?.reset?.();
    this.damageBuffer.flush();
    this.economyManager?.setWave?.(0);
  }

  startRun() {
    if (this.state === "live") return true;
    if (this.wave <= 0) this.wave = 1;
    this.beginWave(this.wave);
    return true;
  }

  beginWave(waveNumber) {
    this.wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
    this.state = "live";
    this.triggerHeld = false;
    this.weapon.reloadTimer = 0;
    this.weapon.fireCooldown = 0;
    this.weapon.ammo = this.weapon.clipSize;
    this.enemies = [];
    this.economyManager?.setWave?.(this.wave);
    this.lastWaveSnapshot = this.enemySpawner?.startWave?.(this.wave, this.getSpawnerModifiers()) ?? this.lastWaveSnapshot;
  }

  setAimTarget(point) {
    if (!point) return;
    this.aimTarget = {
      x: clamp(point.x ?? this.aimTarget.x, 0, this.worldWidth),
      y: clamp(point.y ?? this.aimTarget.y, 0, this.worldHeight),
    };
  }

  setTriggerHeld(isHeld) {
    this.triggerHeld = Boolean(isHeld);
  }

  addTurret() {
    const index = this.turrets.length;
    const slots = [
      { x: 940, y: 500 },
      { x: 1000, y: 470 },
      { x: 1060, y: 515 },
    ];
    const slot = slots[index] ?? { x: 930 + index * 40, y: 500 - (index % 2) * 40 };
    this.turrets.push({
      id: `turret-${index + 1}`,
      x: slot.x,
      y: slot.y,
      cooldown: 0,
      reloadTime: 0.32,
      damage: 7,
      range: 420,
      alive: true,
    });
  }

  hireAlly(role) {
    const count = this.allies.filter((ally) => ally.role === role).length;
    if (role === "sniper") {
      this.allies.push({
        id: `sniper-${count + 1}`,
        role,
        x: 850,
        y: 180 + count * 78,
        reloadTime: 0.98,
        damage: 16,
        cooldown: 0,
        alive: true,
        fsmState: "SCAN",
      });
      return;
    }

    if (role === "craftsman") {
      this.allies.push({
        id: `craftsman-${count + 1}`,
        role,
        x: 970,
        y: 260 + count * 78,
        repairRate: 7.5,
        alive: true,
        fsmState: "IDLE",
      });
    }
  }

  purchaseOffer(offerId) {
    if (this.state !== "intermission") return false;

    const offerSnapshot = { offers: this.upgradeTree?.getOffers?.({ gold: this.economyManager?.gold ?? 0 }) ?? [] };
    if (!this.economyManager?.canAfford?.(offerId, offerSnapshot)) return false;

    const applied = this.upgradeTree?.applyPurchase?.(offerId, {
      weapon: this.weapon,
      spawnTurret: () => this.addTurret(),
      hireAlly: (role) => this.hireAlly(role),
      economy: this.economyManager?.getSnapshot?.() ?? {},
    });
    if (!applied) return false;

    this.economyManager?.purchaseOffer?.(offerId, offerSnapshot);
    this.weapon.ammo = Math.min(this.weapon.clipSize, Math.max(this.weapon.ammo, this.weapon.clipSize));
    return true;
  }

  advanceIntermission() {
    if (this.state !== "intermission") return false;
    this.beginWave(this.wave + 1);
    return true;
  }

  queueDamage(targetId, amount) {
    this.damageBuffer.add(targetId, amount);
  }

  getSpawnerModifiers() {
    return {};
  }

  updateWeaponTimers(dt) {
    this.weapon.fireCooldown = Math.max(0, this.weapon.fireCooldown - dt);

    if (this.weapon.reloadTimer > 0) {
      this.weapon.reloadTimer = Math.max(0, this.weapon.reloadTimer - dt);
      if (this.weapon.reloadTimer === 0) {
        this.weapon.ammo = this.weapon.clipSize;
      }
      return;
    }

    if (this.weapon.ammo <= 0) {
      this.weapon.reloadTimer = this.weapon.reloadDuration;
    }
  }

  getMuzzlePoint() {
    return { x: 142, y: 456 };
  }

  fireShot() {
    if (this.state !== "live") return false;
    if (this.weapon.reloadTimer > 0 || this.weapon.fireCooldown > 0) return false;

    if (this.weapon.ammo <= 0) {
      this.weapon.reloadTimer = this.weapon.reloadDuration;
      return false;
    }

    this.weapon.ammo -= 1;
    this.weapon.fireCooldown = this.weapon.fireInterval;

    const origin = this.getMuzzlePoint();
    const target = this.aimTarget;
    const hit = this.resolveRayHit(origin, target);
    const traceEnd = hit ? { x: hit.enemy.x, y: hit.enemy.y } : target;
    this.traces.push({
      x1: origin.x,
      y1: origin.y,
      x2: traceEnd.x,
      y2: traceEnd.y,
      life: 0.08,
      hit: Boolean(hit),
    });

    if (hit) {
      this.queueDamage(hit.enemy.id, this.weapon.bulletDamage);
    }

    if (this.weapon.ammo <= 0) {
      this.weapon.reloadTimer = this.weapon.reloadDuration;
    }

    return true;
  }

  resolveRayHit(origin, target) {
    const ray = { x: target.x - origin.x, y: target.y - origin.y };
    const rayLength = Math.hypot(ray.x, ray.y) || 1;
    let best = null;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      const toEnemy = { x: enemy.x - origin.x, y: enemy.y - origin.y };
      const projection = (toEnemy.x * ray.x + toEnemy.y * ray.y) / rayLength;
      if (projection < 0 || projection > rayLength) continue;

      const closestPoint = {
        x: origin.x + (ray.x / rayLength) * projection,
        y: origin.y + (ray.y / rayLength) * projection,
      };
      const distance = Math.hypot(enemy.x - closestPoint.x, enemy.y - closestPoint.y);
      if (distance > enemy.radius + 6) continue;
      if (!best || projection < best.projection) {
        best = { enemy, projection };
      }
    }

    return best;
  }

  updateTurrets(dt) {
    for (const turret of this.turrets) {
      turret.cooldown = Math.max(0, turret.cooldown - dt);
      if (turret.cooldown > 0) continue;

      let target = null;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const distance = Math.hypot(enemy.x - turret.x, enemy.y - turret.y);
        if (distance > turret.range) continue;
        if (!target || enemy.x > target.x) target = enemy;
      }

      if (!target) continue;
      turret.cooldown = turret.reloadTime;
      this.queueDamage(target.id, turret.damage);
      this.traces.push({
        x1: turret.x,
        y1: turret.y,
        x2: target.x,
        y2: target.y,
        life: 0.05,
        hit: true,
      });
    }
  }

  applyBufferedDamage() {
    const enemyById = new Map(this.enemies.map((enemy) => [enemy.id, enemy]));

    for (const hit of this.damageBuffer.flush()) {
      if (hit.targetId === "house") {
        this.house.health = Math.max(0, this.house.health - hit.amount);
        continue;
      }

      const enemy = enemyById.get(hit.targetId);
      if (enemy && enemy.alive) {
        enemy.health -= hit.amount;
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (enemy.health > 0) continue;
      enemy.alive = false;
      this.totalKills += 1;
      this.economyManager?.applyEnemyDeath?.(enemy);
    }

    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  tick(deltaMs) {
    const dt = clamp((deltaMs ?? 0) / 1000, 0, 0.05);
    this.time += dt;

    for (const trace of this.traces) {
      trace.life -= dt;
    }
    this.traces = this.traces.filter((trace) => trace.life > 0);

    if (this.state === "menu" || this.state === "gameover") return;

    this.updateWeaponTimers(dt);

    if (this.state === "live") {
      if (this.triggerHeld) {
        this.fireShot();
      }

      const waveUpdate = this.enemySpawner?.update?.(deltaMs, {
        enemies: this.enemies,
        allies: this.allies,
        house: this.house,
        queueDamage: (targetId, amount) => this.queueDamage(targetId, amount),
        enemyAttackInterval: 0.5,
        sniperReloadTime: 1.0,
        sniperDamage: 18,
      });
      this.lastWaveSnapshot = waveUpdate?.snapshot ?? this.lastWaveSnapshot;

      this.updateTurrets(dt);
      this.applyBufferedDamage();

      if (this.house.health <= 0) {
        this.state = "gameover";
        this.triggerHeld = false;
        this.finalWaveReached = this.wave;
        this.economyManager?.setFinalWaveReached?.(this.finalWaveReached);
        return;
      }

      if (this.enemySpawner?.shouldEnterIntermission?.(this.enemies)) {
        this.state = "intermission";
        this.triggerHeld = false;
        this.weapon.reloadTimer = 0;
        this.weapon.ammo = this.weapon.clipSize;
        this.finalWaveReached = Math.max(this.finalWaveReached, this.wave);
        this.economyManager?.setFinalWaveReached?.(this.finalWaveReached);
      }
    }
  }

  getSnapshot() {
    const economy = this.economyManager?.getSnapshot?.() ?? { gold: 0, earned: 0, spent: 0, finalWaveReached: this.finalWaveReached };
    const offers = this.upgradeTree?.getOffers?.({ gold: economy.gold }) ?? [];
    const allyCounts = {
      sniper: this.allies.filter((ally) => ally.role === "sniper").length,
      craftsman: this.allies.filter((ally) => ally.role === "craftsman").length,
    };

    return {
      state: this.state,
      wave: this.wave,
      finalWaveReached: Math.max(this.finalWaveReached, economy.finalWaveReached ?? 0),
      houseHealth: this.house.health,
      houseMaxHealth: this.house.maxHealth,
      house: { ...this.house },
      ammo: this.weapon.ammo,
      maxAmmo: this.weapon.clipSize,
      reloading: this.weapon.reloadTimer > 0,
      reloadProgress:
        this.weapon.reloadTimer > 0 ? 1 - this.weapon.reloadTimer / Math.max(this.weapon.reloadDuration, 0.001) : 1,
      gold: economy.gold,
      earned: economy.earned,
      spent: economy.spent,
      kills: this.totalKills,
      allies: allyCounts,
      allyEntities: this.allies.map((ally) => ({ ...ally })),
      turrets: this.turrets.length,
      turretEntities: this.turrets.map((turret) => ({ ...turret })),
      enemies: this.enemies.map((enemy) => ({ ...enemy })),
      traces: this.traces.map((trace) => ({ ...trace })),
      offers,
      aimTarget: { ...this.aimTarget },
      waveStatus: { ...this.lastWaveSnapshot },
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      damageBuffered: this.damageBuffer.total,
      time: this.time,
    };
  }
}
