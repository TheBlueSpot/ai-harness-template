export const LaunchForce = 9.6;
export const PLAYER_SPEED = 4.5;
export const DEPTH_SPEED = 3.1;

const WORLD = {
  xMin: -5.2,
  xMax: 5.2,
  zMin: -3.1,
  zMax: 3.1,
  groundY: 560,
  horizonY: 200
};

const GRAVITY = 24;
const ENEMY_SPEED_X = 2.8;
const ENEMY_SPEED_Z = 2.2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeSvgDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function loadInlineImage(svg) {
  if (typeof Image === "undefined") return null;
  const image = new Image();
  image.decoding = "async";
  image.src = makeSvgDataUri(svg);
  return image;
}

function createInlineAssets() {
  return {
    // Original art for this demo, released as CC0/public domain.
    player: loadInlineImage(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 160">
        <ellipse cx="64" cy="144" rx="32" ry="12" fill="#00000033"/>
        <path d="M34 88h60l8 54H28z" fill="#7c5630"/>
        <path d="M48 24h32l8 20H40z" fill="#865c30"/>
        <circle cx="64" cy="38" r="18" fill="#e9c39a"/>
        <path d="M28 82 16 122l14 6 12-24v36h16V98h12v42h16v-38l10 26 14-6-12-40z" fill="#d0aa7f"/>
        <path d="M34 88h60l-10 26H44z" fill="#44566a"/>
      </svg>
    `),
    enemy: loadInlineImage(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 160">
        <ellipse cx="64" cy="144" rx="32" ry="12" fill="#00000033"/>
        <path d="M30 86h68l6 54H24z" fill="#482838"/>
        <circle cx="64" cy="38" r="18" fill="#c99a77"/>
        <path d="M42 20h44l10 18H32z" fill="#1f1b20"/>
        <path d="M24 84 12 122l14 6 12-24v36h16V98h20v42h16v-36l12 24 14-6-12-38z" fill="#b57f5a"/>
        <path d="M30 86h68l-12 24H42z" fill="#82384f"/>
      </svg>
    `),
    prop: loadInlineImage(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
        <rect x="12" y="18" width="72" height="60" rx="8" fill="#6b4a2d"/>
        <rect x="18" y="24" width="60" height="48" rx="6" fill="#8e643e"/>
        <path d="M18 42h60M30 24v48M66 24v48" stroke="#4b321d" stroke-width="4"/>
      </svg>
    `)
  };
}

function projectToScreen(canvas, x, z, y = 0) {
  const perspective = 1 + (z - WORLD.zMin) / (WORLD.zMax - WORLD.zMin) * 0.18;
  const screenX = canvas.width * 0.5 + x * 88;
  const screenY = WORLD.groundY + z * 46 - y * 20;
  return { x: screenX, y: screenY, scale: perspective };
}

function makeEntity(id, kind, x, z) {
  const isPlayer = kind === "player";
  return {
    id,
    kind,
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: isPlayer ? 1 : -1,
    radiusX: isPlayer ? 0.45 : 0.38,
    radiusZ: isPlayer ? 0.34 : 0.32,
    health: isPlayer ? 10 : 3,
    maxHealth: isPlayer ? 10 : 3,
    stun: 0,
    attackTimer: 0,
    invuln: 0,
    hitFlash: 0,
    state: "idle",
    grabbed: false,
    dead: false,
    airborne: false
  };
}

function overlapsAttack(target, hitboxX, hitboxZ, rangeX, rangeZ) {
  return Math.abs(target.x - hitboxX) <= rangeX + target.radiusX
    && Math.abs(target.z - hitboxZ) <= rangeZ + target.radiusZ;
}

export class GrabState {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.targetId = null;
    this.offsetX = 0;
    this.offsetZ = 0;
    this.heldTime = 0;
  }

  start(player, target) {
    this.active = true;
    this.targetId = target.id;
    this.offsetX = player.facing * 0.55;
    this.offsetZ = 0.18;
    this.heldTime = 0;
  }

  tether(player, target, dt) {
    if (!this.active || !target) return;
    this.heldTime += dt;
    target.x = clamp(player.x + this.offsetX, WORLD.xMin, WORLD.xMax);
    target.z = clamp(player.z + this.offsetZ, WORLD.zMin, WORLD.zMax);
    target.y = 0;
    target.vx = 0;
    target.vy = 0;
    target.vz = 0;
    target.stun = Math.max(target.stun, 0.08);
    target.state = "grabbed";
  }

  release(player, target, force, depthForce = 0) {
    if (!this.active || !target) return null;
    target.grabbed = false;
    target.state = "launched";
    target.airborne = true;
    target.vx = player.facing * force;
    target.vz = depthForce;
    target.vy = force * 0.42;
    target.stun = 0.7;
    this.reset();
    return target;
  }
}

export class BrawlEngine {
  constructor(config = {}) {
    this.canvas = config.canvas ?? null;
    this.ctx = config.ctx ?? this.canvas?.getContext?.("2d") ?? null;
    this.onSnapshot = config.onSnapshot ?? null;
    this.onResults = config.onResults ?? null;
    this.comboSystem = null;
    this.aiController = null;
    this.assets = createInlineAssets();
    this.input = this.createInputState();
    this.previousInput = this.createInputState();
    this.grab = new GrabState();
    this.attackEvents = [];
    this.pendingEnemyIntents = new Map();
    this.reset();
  }

  createInputState() {
    return {
      left: false,
      right: false,
      forward: false,
      back: false,
      punch: false,
      grab: false,
      special: false
    };
  }

  attachComboSystem(comboSystem) {
    this.comboSystem = comboSystem;
  }

  attachEnemyAI(aiController) {
    this.aiController = aiController;
  }

  setInputState(inputState) {
    this.input = { ...this.input, ...inputState };
  }

  consumeAIIntent(intent) {
    if (!intent?.enemyId) return;
    this.pendingEnemyIntents.set(intent.enemyId, { ...intent });
  }

  start() {
    this.state = "playing";
    this.emitSnapshot();
  }

  reset() {
    this.state = "menu";
    this.time = 0;
    this.score = 0;
    this.bestCombo = 0;
    this.kills = 0;
    this.statusText = "Waiting";
    this.results = null;
    this.player = makeEntity("player", "player", -1.4, 0);
    this.enemies = [];
    this.attackEvents = [];
    this.pendingEnemyIntents.clear();
    this.grab.reset();
    this.previousInput = this.createInputState();
    this.input = this.createInputState();
    this.spawnWave();
    this.snapshot = null;
  }

  spawnWave() {
    const template = [
      [2.8, -1.6],
      [4.4, 0.1],
      [5.2, 1.4],
      [1.8, 1.9],
      [3.6, -0.3],
      [4.8, -2.1]
    ];
    this.enemies = template.map(([x, z], index) => {
      const enemy = makeEntity(`enemy-${index}`, "enemy", x, z);
      enemy.facing = -1;
      return enemy;
    });
  }

  getWorldState() {
    return {
      time: this.time,
      player: {
        id: this.player.id,
        x: this.player.x,
        z: this.player.z,
        health: this.player.health,
        state: this.player.state,
        facing: this.player.facing
      },
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        x: enemy.x,
        z: enemy.z,
        health: enemy.health,
        state: enemy.state,
        stun: enemy.stun,
        grabbed: enemy.grabbed
      }))
    };
  }

  update(dt = 1 / 60) {
    const frameDt = clamp(dt, 1 / 240, 1 / 20);
    if (this.state !== "playing") {
      return this.emitSnapshot();
    }

    this.time += frameDt;
    const timeMs = this.time * 1000;

    this.comboSystem?.update(timeMs, { facing: this.player.facing });
    this.consumeMatchedMoves();
    this.updatePlayer(frameDt, timeMs);
    this.updateEnemyIntents(timeMs);
    this.updateEnemies(frameDt, timeMs);
    this.updateGrab(frameDt);
    this.updateAttackEvents(frameDt, timeMs);
    this.updateProjectileCollisions(timeMs);
    this.cleanupDeadEnemies();
    this.previousInput = { ...this.input };

    if (this.player.health <= 0) {
      this.endRun(false);
    } else if (this.enemies.every((enemy) => enemy.dead || enemy.health <= 0)) {
      this.endRun(true);
    }

    return this.emitSnapshot();
  }

  consumeMatchedMoves() {
    const moves = this.comboSystem?.consumeMatchedMoves?.() ?? [];
    for (const move of moves) {
      this.triggerPlayerMove(move);
    }
  }

  triggerPlayerMove(move) {
    switch (move.action) {
      case "grab":
        this.tryGrab();
        break;
      case "light-attack":
        this.startPlayerAttack({
          label: move.hudLabel ?? move.name,
          damage: 1,
          score: 110,
          rangeX: 0.68,
          rangeZ: 0.32,
          duration: 0.16,
          knockbackX: 1.6,
          knockbackZ: 0
        });
        break;
      case "heavy-attack":
        this.startPlayerAttack({
          label: move.hudLabel ?? move.name,
          damage: 1,
          score: 150,
          rangeX: 0.82,
          rangeZ: 0.36,
          duration: 0.2,
          knockbackX: 2.4,
          knockbackZ: 0.3,
          lungeX: 1.1
        });
        break;
      case "dash-strike":
        this.startPlayerAttack({
          label: move.hudLabel ?? move.name,
          damage: 1,
          score: 180,
          rangeX: 1.05,
          rangeZ: 0.34,
          duration: 0.2,
          knockbackX: 2.8,
          knockbackZ: 0,
          lungeX: 1.8
        });
        break;
      case "launcher":
        this.startPlayerAttack({
          label: move.hudLabel ?? move.name,
          damage: 1,
          score: 220,
          rangeX: 0.78,
          rangeZ: 0.34,
          duration: 0.22,
          knockbackX: 1.2,
          knockbackZ: -0.25,
          launchY: 8.4
        });
        break;
      case "special":
        this.startPlayerAttack({
          label: move.hudLabel ?? move.name,
          damage: 1,
          score: 260,
          rangeX: 1.25,
          rangeZ: 0.8,
          duration: 0.28,
          knockbackX: 3.1,
          knockbackZ: 0.25,
          launchY: 6.2
        });
        break;
      default:
        break;
    }
  }

  startPlayerAttack(definition) {
    if (this.grab.active) return;
    if (this.player.attackTimer > 0.06) return;

    this.player.attackTimer = definition.duration;
    this.player.state = "attack";
    this.statusText = definition.label;
    if (definition.lungeX) {
      this.player.x = clamp(
        this.player.x + this.player.facing * definition.lungeX * 0.12,
        WORLD.xMin,
        WORLD.xMax
      );
    }

    this.attackEvents.push({
      owner: "player",
      ownerId: this.player.id,
      label: definition.label,
      ttl: definition.duration,
      delay: 0.03,
      rangeX: definition.rangeX,
      rangeZ: definition.rangeZ,
      damage: definition.damage,
      score: definition.score,
      knockbackX: definition.knockbackX,
      knockbackZ: definition.knockbackZ,
      launchY: definition.launchY ?? 0,
      hitIds: new Set()
    });
  }

  tryGrab() {
    if (this.grab.active) return;
    const target = this.enemies.find((enemy) => {
      if (enemy.dead || enemy.health <= 0 || enemy.grabbed || enemy.state === "launched") return false;
      return Math.abs(enemy.x - this.player.x) <= 0.7 && Math.abs(enemy.z - this.player.z) <= 0.4;
    });
    if (!target) {
      this.statusText = "Whiffed grab";
      return;
    }

    target.grabbed = true;
    target.stun = 0.2;
    target.vx = 0;
    target.vy = 0;
    target.vz = 0;
    this.player.state = "grab";
    this.statusText = "Grabbed";
    this.grab.start(this.player, target);
  }

  releaseGrab() {
    const target = this.enemies.find((enemy) => enemy.id === this.grab.targetId);
    if (!target) {
      this.grab.reset();
      return;
    }
    const depthPush = (this.input.back ? 1 : 0) - (this.input.forward ? 1 : 0);
    this.grab.release(this.player, target, LaunchForce, depthPush * 2.6);
    this.score += 120;
    this.statusText = "Launch";
  }

  updatePlayer(dt, timeMs) {
    if (this.player.invuln > 0) this.player.invuln -= dt;
    if (this.player.stun > 0) this.player.stun -= dt;
    if (this.player.attackTimer > 0) this.player.attackTimer -= dt;
    if (this.player.hitFlash > 0) this.player.hitFlash -= dt;

    const moveX = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const moveZ = (this.input.back ? 1 : 0) - (this.input.forward ? 1 : 0);

    if (!this.grab.active && this.player.stun <= 0) {
      this.player.x = clamp(this.player.x + moveX * PLAYER_SPEED * dt, WORLD.xMin, WORLD.xMax);
      this.player.z = clamp(this.player.z + moveZ * DEPTH_SPEED * dt, WORLD.zMin, WORLD.zMax);
    } else if (this.grab.active) {
      this.player.x = clamp(this.player.x + moveX * PLAYER_SPEED * dt * 0.7, WORLD.xMin, WORLD.xMax);
      this.player.z = clamp(this.player.z + moveZ * DEPTH_SPEED * dt * 0.7, WORLD.zMin, WORLD.zMax);
    }

    if (moveX !== 0) this.player.facing = Math.sign(moveX);
    this.player.state = this.grab.active ? "grab" : (this.player.attackTimer > 0 ? "attack" : (Math.abs(moveX) + Math.abs(moveZ) > 0 ? "walk" : "idle"));

    if (this.input.grab && !this.previousInput.grab) {
      this.tryGrab();
    }

    if (!this.input.grab && this.previousInput.grab && this.grab.active) {
      this.releaseGrab();
    }

    if (this.comboSystem && this.player.health <= 0) {
      this.comboSystem.dropCombo(timeMs, "Folded");
    }
  }

  updateEnemyIntents(timeMs) {
    if (!this.aiController?.update) return;
    const intents = this.aiController.update(this.getWorldState(), timeMs);
    this.pendingEnemyIntents = new Map((intents ?? []).map((intent) => [intent.enemyId, intent]));
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.health <= 0) continue;
      if (enemy.stun > 0) enemy.stun -= dt;
      if (enemy.attackTimer > 0) enemy.attackTimer -= dt;
      if (enemy.invuln > 0) enemy.invuln -= dt;
      if (enemy.hitFlash > 0) enemy.hitFlash -= dt;

      if (enemy.grabbed) continue;

      if (enemy.state === "launched") {
        this.updateLaunchedEnemy(enemy, dt);
        continue;
      }

      const intent = this.pendingEnemyIntents.get(enemy.id);
      if (!intent || enemy.stun > 0) {
        enemy.state = enemy.stun > 0 ? "stunned" : "idle";
        continue;
      }

      enemy.facing = this.player.x >= enemy.x ? 1 : -1;
      enemy.x = clamp(enemy.x + intent.moveX * ENEMY_SPEED_X * dt, WORLD.xMin, WORLD.xMax);
      enemy.z = clamp(enemy.z + intent.moveZ * ENEMY_SPEED_Z * dt, WORLD.zMin, WORLD.zMax);
      enemy.state = intent.attack ? "attack" : (Math.abs(intent.moveX) + Math.abs(intent.moveZ) > 0.05 ? "walk" : "idle");

      if (intent.attack && enemy.attackTimer <= 0) {
        enemy.attackTimer = 0.58;
        this.attackEvents.push({
          owner: "enemy",
          ownerId: enemy.id,
          facing: enemy.facing,
          label: "Brawler Punch",
          ttl: 0.18,
          delay: 0.1,
          rangeX: 0.55,
          rangeZ: 0.24,
          damage: 1,
          score: 0,
          knockbackX: 1.4,
          knockbackZ: 0,
          launchY: 0,
          hitIds: new Set()
        });
      }
    }
  }

  updateLaunchedEnemy(enemy, dt) {
    enemy.airborne = true;
    enemy.vy -= GRAVITY * dt;
    enemy.x = clamp(enemy.x + enemy.vx * dt, WORLD.xMin, WORLD.xMax);
    enemy.z = clamp(enemy.z + enemy.vz * dt, WORLD.zMin, WORLD.zMax);
    enemy.y = Math.max(0, enemy.y + enemy.vy * dt);

    enemy.vx *= 0.985;
    enemy.vz *= 0.99;

    if (enemy.y <= 0) {
      enemy.y = 0;
      if (Math.abs(enemy.vy) > 3.2) {
        enemy.vy *= -0.22;
        enemy.vx *= 0.8;
        enemy.vz *= 0.8;
      } else {
        enemy.vx *= 0.84;
        enemy.vz *= 0.84;
        enemy.vy = 0;
        enemy.airborne = false;
        if (Math.abs(enemy.vx) < 0.6 && Math.abs(enemy.vz) < 0.5) {
          enemy.state = enemy.health > 0 ? "stunned" : "down";
        }
      }
    }
  }

  updateGrab(dt) {
    if (!this.grab.active) return;
    const target = this.enemies.find((enemy) => enemy.id === this.grab.targetId);
    if (!target || target.health <= 0) {
      this.grab.reset();
      return;
    }
    this.grab.tether(this.player, target, dt);
  }

  updateAttackEvents(dt, timeMs) {
    for (let index = this.attackEvents.length - 1; index >= 0; index -= 1) {
      const event = this.attackEvents[index];
      event.delay -= dt;
      event.ttl -= dt;
      if (event.ttl <= 0) {
        this.attackEvents.splice(index, 1);
        continue;
      }
      if (event.delay > 0) continue;

      if (event.owner === "player") {
        const hitboxX = this.player.x + this.player.facing * event.rangeX * 0.7;
        const hitboxZ = this.player.z;
        for (const enemy of this.enemies) {
          if (enemy.dead || enemy.health <= 0 || enemy.grabbed || event.hitIds.has(enemy.id)) continue;
          if (!overlapsAttack(enemy, hitboxX, hitboxZ, event.rangeX, event.rangeZ)) continue;
          event.hitIds.add(enemy.id);
          this.applyPlayerHit(enemy, event, timeMs);
        }
      } else {
        const enemy = this.enemies.find((candidate) => candidate.id === event.ownerId);
        if (!enemy || enemy.dead || enemy.health <= 0 || enemy.grabbed) continue;
        const hitboxX = enemy.x + enemy.facing * event.rangeX * 0.75;
        const hitboxZ = enemy.z;
        if (!event.hitIds.has(this.player.id) && overlapsAttack(this.player, hitboxX, hitboxZ, event.rangeX, event.rangeZ)) {
          event.hitIds.add(this.player.id);
          this.applyEnemyHit(event, timeMs);
        }
      }
    }
  }

  applyPlayerHit(target, event, timeMs) {
    target.health -= event.damage;
    target.stun = Math.max(target.stun, event.launchY > 0 ? 0.42 : 0.28);
    target.hitFlash = 0.12;
    target.vx = this.player.facing * event.knockbackX;
    target.vz += event.knockbackZ;
    target.state = event.launchY > 0 ? "launched" : "stunned";
    if (event.launchY > 0) {
      target.vy = event.launchY;
      target.airborne = true;
    }

    this.score += event.score;
    const comboCount = this.comboSystem?.pushHit({
      score: this.score,
      label: event.label,
      time: timeMs,
      targetId: target.id
    }) ?? 0;
    this.bestCombo = Math.max(this.bestCombo, comboCount);
    this.statusText = event.label;

    if (target.health <= 0 && !target.dead) {
      target.dead = true;
      target.state = "down";
      target.vx *= 0.6;
      this.kills += 1;
      this.score += 140;
    }
  }

  applyEnemyHit(event, timeMs) {
    if (this.player.invuln > 0) return;
    this.player.health = clamp(this.player.health - event.damage, 0, this.player.maxHealth);
    this.player.stun = 0.28;
    this.player.invuln = 0.45;
    this.player.hitFlash = 0.14;
    this.player.x = clamp(this.player.x + (event.facing ?? 1) * event.knockbackX * 0.12, WORLD.xMin, WORLD.xMax);
    this.comboSystem?.dropCombo(timeMs, "Crowd pressure");
    this.statusText = "Crowd pressure";
  }

  updateProjectileCollisions(timeMs) {
    for (const launched of this.enemies) {
      if (launched.dead || launched.health <= 0 || launched.state !== "launched") continue;
      for (const enemy of this.enemies) {
        if (enemy === launched || enemy.dead || enemy.health <= 0 || enemy.grabbed) continue;
        if (Math.abs(enemy.x - launched.x) > 0.52 || Math.abs(enemy.z - launched.z) > 0.38) continue;

        enemy.health -= 1;
        enemy.stun = 0.45;
        enemy.hitFlash = 0.16;
        enemy.vx = launched.vx * 0.42;
        enemy.vz = launched.vz * 0.5;
        enemy.state = "stunned";
        launched.vx *= 0.76;
        launched.vz *= 0.76;
        this.score += 210;
        const comboCount = this.comboSystem?.pushHit({
          score: this.score,
          label: "Human projectile",
          time: timeMs,
          targetId: enemy.id
        }) ?? 0;
        this.bestCombo = Math.max(this.bestCombo, comboCount);

        if (enemy.health <= 0 && !enemy.dead) {
          enemy.dead = true;
          enemy.state = "down";
          this.kills += 1;
          this.score += 140;
        }
      }
    }
  }

  cleanupDeadEnemies() {
    for (const enemy of this.enemies) {
      if (enemy.health > 0) continue;
      enemy.dead = true;
      if (enemy.state !== "launched") enemy.state = "down";
    }
  }

  endRun(win) {
    if (this.state === "results") return;
    this.state = "results";
    this.results = {
      title: win ? "Wanted Dead" : "Wanted: Retry",
      summary: win
        ? "The alley is clear. Even the barrels are nervous."
        : "The crowd closed in before the combo could snowball.",
      score: this.score,
      bestCombo: this.bestCombo,
      enemiesDefeated: this.kills,
      win
    };
    this.onResults?.(this.results);
  }

  emitSnapshot() {
    const aliveEnemies = this.enemies.filter((enemy) => !enemy.dead && enemy.health > 0).length;
    const recentInputs = this.comboSystem?.getRecentInputs?.(this.time * 1000) ?? [];
    const snapshot = {
      state: this.state,
      score: Math.round(this.score),
      comboCount: this.comboSystem?.comboCount ?? 0,
      statusText: this.comboSystem?.statusText ?? this.statusText,
      recentInputText: recentInputs.map((entry) => entry.token).join(" "),
      playerHealth: Math.round(this.player.health),
      bestCombo: this.bestCombo,
      enemiesLeft: aliveEnemies,
      results: this.state === "results" ? this.results : null
    };
    this.snapshot = snapshot;
    this.onSnapshot?.(snapshot);
    return snapshot;
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#261d16");
    sky.addColorStop(0.4, "#111722");
    sky.addColorStop(1, "#07090d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(242, 184, 76, 0.06)";
    ctx.fillRect(0, 0, width, WORLD.horizonY);

    for (let row = 0; row < 7; row += 1) {
      const y = WORLD.horizonY + row * 58;
      ctx.strokeStyle = row % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)";
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 40, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, WORLD.groundY + 46, width, height - WORLD.groundY - 46);

    if (this.assets.prop?.complete) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.assets.prop, width * 0.12, WORLD.groundY - 10, 96, 96);
      ctx.drawImage(this.assets.prop, width * 0.82, WORLD.groundY + 18, 84, 84);
      ctx.globalAlpha = 1;
    }

    const drawables = [this.player, ...this.enemies].slice().sort((left, right) => left.z - right.z);
    for (const entity of drawables) {
      this.drawEntity(ctx, entity);
    }

    if (this.grab.active) {
      const target = this.enemies.find((enemy) => enemy.id === this.grab.targetId);
      if (target) {
        const playerPos = projectToScreen(this.canvas, this.player.x, this.player.z, 2.3);
        const targetPos = projectToScreen(this.canvas, target.x, target.z, 2.2);
        ctx.strokeStyle = "rgba(255, 210, 136, 0.8)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(playerPos.x, playerPos.y - 66);
        ctx.lineTo(targetPos.x, targetPos.y - 64);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "600 18px Georgia";
    ctx.fillText(`HP ${Math.round(this.player.health)}`, 32, 36);
    ctx.fillText(`Threats ${this.enemies.filter((enemy) => !enemy.dead && enemy.health > 0).length}`, width - 150, 36);
  }

  drawEntity(ctx, entity) {
    const pos = projectToScreen(this.canvas, entity.x, entity.z, entity.y);
    const scale = entity.kind === "player" ? 1.08 : 0.98;
    const width = 118 * pos.scale * scale;
    const height = 148 * pos.scale * scale;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.globalAlpha = entity.dead ? 0.55 : 1;

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 0, width * 0.22, 12 * pos.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    const sprite = entity.kind === "player" ? this.assets.player : this.assets.enemy;
    if (sprite?.complete) {
      if (entity.facing < 0) ctx.scale(-1, 1);
      if (entity.hitFlash > 0) {
        ctx.shadowColor = "rgba(255, 244, 180, 0.9)";
        ctx.shadowBlur = 18;
      }
      ctx.drawImage(sprite, -width / 2, -height + 8, width, height);
    } else {
      ctx.fillStyle = entity.kind === "player" ? "#c69758" : "#8d465f";
      ctx.fillRect(-width * 0.22, -height + 28, width * 0.44, height - 28);
      ctx.beginPath();
      ctx.arc(0, -height + 26, 18 * pos.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (entity.state === "attack") {
      ctx.strokeStyle = "rgba(255, 194, 87, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(entity.facing * 20, -height * 0.55, 16, -0.4, 0.6);
      ctx.stroke();
    }

    ctx.restore();

    const hpWidth = 56 * pos.scale;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(pos.x - hpWidth / 2, pos.y - height - 10, hpWidth, 6);
    ctx.fillStyle = entity.kind === "player" ? "#8ef0b8" : "#ff6e5b";
    ctx.fillRect(
      pos.x - hpWidth / 2,
      pos.y - height - 10,
      hpWidth * clamp(entity.health / entity.maxHealth, 0, 1),
      6
    );
  }
}
