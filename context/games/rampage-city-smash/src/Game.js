import { ENEMY_WAVES, MONSTER, PHASE, PICKUPS, RUN_TIMING, STAGE } from "./data.js";
import { createDebris, createEnemy, createPickup, createRuntimeState, resetRuntimeState } from "./state.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pressed(input, code) {
  return Boolean(input?.pressed?.[code]);
}

function held(input, code) {
  return Boolean(input?.held?.[code]);
}

export class Game {
  constructor(options = {}) {
    this.options = options;
    this.state = createRuntimeState();
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
  }

  start() {
    if (this.state.phase === PHASE.MENU) {
      this.state.phase = PHASE.PLAY;
      this.state.overlay.button = "Restart";
      this.state.overlay.copy = "Climb towers with arrows or WASD, use Space for punches, J for kicks, and K or Down+Space for a slam.";
      this.state.prompt = "Climb the first tower, break weak floors, and keep moving when air pressure arrives.";
    }
  }

  restart() {
    resetRuntimeState(this.state);
    return this.state;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  update(dt, input = {}) {
    if (pressed(input, "Enter")) {
      if (this.state.phase === PHASE.MENU) this.start();
      else if (this.state.phase === PHASE.WIN || this.state.phase === PHASE.LOSE) {
        this.restart();
        this.start();
      }
    }
    if (pressed(input, "KeyR")) this.restart();

    if (this.state.phase !== PHASE.PLAY) return;

    const state = this.state;
    state.time += dt;
    state.hud.time = state.time;

    this.stepMonster(dt, input);
    this.stepWaves(dt);
    this.stepEnemies(dt);
    this.stepPickups(dt);
    this.stepDebris(dt);
    this.stepBuildings(dt);
    this.stepCamera(dt);
    this.resolveOutcome();
    this.syncHudAndOverlay();
  }

  getFrameState() {
    const state = this.state;
    const objective = this.buildObjectiveState();
    return {
      phase: state.phase,
      outcome: state.outcome,
      time: state.time,
      score: state.score,
      targetScore: state.targetScore,
      health: state.health,
      prompt: state.prompt,
      alert: state.alert,
      overlayEyebrow: state.overlay.eyebrow,
      overlayTitle: state.overlay.title,
      overlayCopy: state.overlay.copy,
      overlayButton: state.overlay.button,
      hud: { ...state.hud, objective: objective.hudLabel },
      camera: { ...state.camera },
      objective,
      player: {
        x: state.monster.x,
        y: state.monster.y,
        vx: state.monster.vx,
        vy: state.monster.vy,
        facing: state.monster.facing,
        health: state.monster.health,
        maxHealth: state.monster.maxHealth,
        onGround: state.monster.onGround,
        onBuilding: state.monster.onBuilding,
      },
      buildings: state.buildings.map((building) => ({
        id: building.id,
        x: building.x,
        baseY: building.baseY,
        collapsed: building.collapsed,
        collapseTimer: building.collapseTimer,
        score: building.score,
        reward: building.reward,
        civiliansSaved: building.civiliansSaved,
        segments: building.segments.map((segment, index) => ({ ...segment, index })),
      })),
      enemies: state.enemies.map((enemy) => ({ ...enemy })),
      debris: state.debris.map((chunk) => ({ ...chunk })),
      pickups: state.pickups.map((pickup) => ({ ...pickup })),
      city: {
        skyline: state.buildings.map((building) => ({
          id: building.id,
          x: building.x,
          collapsed: building.collapsed,
          segments: building.segments,
        })),
      },
      overlays: {
        prompt: state.prompt,
        alert: state.alert,
        outcome: state.outcome,
      },
    };
  }

  buildObjectiveState() {
    const state = this.state;
    const monster = state.monster;
    const nextBuilding = state.buildings.find((building) => !this.isBuildingCleared(building));
    const nearbyPickup = state.pickups.find((pickup) => (
      Math.abs(pickup.x - monster.x) < 160 && Math.abs(pickup.y - monster.y) < 140
    ));

    if (nearbyPickup) {
      const pickupText = nearbyPickup.kind === "civilian" ? "Rescue survivor" : "Grab health";
      return {
        hudLabel: pickupText,
        prompt: nearbyPickup.kind === "civilian"
          ? "Green survivor orb restores health and bonus. Grab it before pushing next tower."
          : "Red health orb restores health. Grab it before next air pass.",
        marker: { x: nearbyPickup.x, y: nearbyPickup.y - 34, label: nearbyPickup.kind === "civilian" ? "SAVE" : "HEAL" },
      };
    }

    if (!nextBuilding) {
      return {
        hudLabel: "Finish run",
        prompt: "Score threshold met. Stay alive until clear.",
        marker: null,
      };
    }

    const distance = nextBuilding.x - monster.x;
    const label = `${nextBuilding.id.charAt(0).toUpperCase()}${nextBuilding.id.slice(1)} tower`;
    const topSegmentIndex = [...nextBuilding.segments].reverse().findIndex((segment) => !segment.destroyed);
    const remainingTopIndex = topSegmentIndex === -1 ? 0 : nextBuilding.segments.length - 1 - topSegmentIndex;
    const markerY = STAGE.groundY - (remainingTopIndex + 1) * (nextBuilding.segments[remainingTopIndex]?.height ?? 28) - 40;

    if (distance > 96) {
      return {
        hudLabel: `Move to ${label}`,
        prompt: `Move right to ${label}. Start climbing before first air wave arrives.`,
        marker: { x: nextBuilding.x + 44, y: markerY, label: "NEXT" },
      };
    }

    return {
      hudLabel: `Break ${label}`,
      prompt: `Break ${label}. Space punches, J kicks, K or Down+Space slams weak floors fast.`,
      marker: { x: nextBuilding.x + 44, y: markerY, label: "BREAK" },
    };
  }

  stepMonster(dt, input) {
    const monster = this.state.monster;
    const moveLeft = held(input, "ArrowLeft") || held(input, "KeyA");
    const moveRight = held(input, "ArrowRight") || held(input, "KeyD");
    const moveUp = held(input, "ArrowUp") || held(input, "KeyW");
    const moveDown = held(input, "ArrowDown") || held(input, "KeyS");
    const punch = pressed(input, "Space");
    const kick = pressed(input, "KeyJ");
    const slam = pressed(input, "KeyK") || (punch && moveDown);

    monster.facing = moveLeft ? -1 : moveRight ? 1 : monster.facing;
    monster.vx = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);

    if (moveUp) monster.vy = clamp(monster.vy - MONSTER.climbSpeed * dt, -MONSTER.climbSpeed, MONSTER.climbSpeed);
    else if (moveDown) monster.vy = clamp(monster.vy + MONSTER.hopSpeed * dt, -MONSTER.climbSpeed, MONSTER.climbSpeed);
    else monster.vy *= 0.88;

    monster.x = clamp(monster.x + monster.vx * 120 * dt, 0, STAGE.worldWidth);
    monster.y = clamp(monster.y + monster.vy * dt, 0, STAGE.groundY - STAGE.climbCeiling);
    monster.onGround = monster.y >= STAGE.groundY - STAGE.climbCeiling - 1;
    monster.onBuilding = this.findSupportedBuilding();

    if (punch) this.attackNearby("punch");
    if (kick) this.attackNearby("kick");
    if (slam) this.attackNearby("slam");

    if (monster.attackCooldown > 0) monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
    if (monster.hurtTimer > 0) monster.hurtTimer = Math.max(0, monster.hurtTimer - dt);
    if (monster.slamTimer > 0) monster.slamTimer = Math.max(0, monster.slamTimer - dt);
  }

  attackNearby(type) {
    const monster = this.state.monster;
    const range = type === "slam" ? 92 : type === "kick" ? 74 : 56;
    const damage = type === "slam" ? MONSTER.slamDamage : type === "kick" ? MONSTER.kickDamage : MONSTER.punchDamage;
    const hitCenterX = monster.x + monster.facing * range;
    const hitCenterY = monster.y + (type === "slam" ? 28 : 8);
    this.state.buildings.forEach((building) => {
      if (building.collapsed) return;
      building.segments.forEach((segment, index) => {
        if (segment.destroyed) return;
        const segX = building.x;
        const segY = STAGE.groundY - (index + 1) * segment.height;
        const close = Math.abs(hitCenterX - (segX + segment.width * 0.5)) < range && Math.abs(hitCenterY - segY) < 70;
        if (close) this.damageSegment(building, segment, damage, type);
      });
    });
  }

  damageSegment(building, segment, damage, attackType) {
    segment.durability -= damage;
    this.state.score += Math.round(segment.score * 0.7);
    this.state.debris.push(...createDebris(building.x + segment.width * 0.5, STAGE.groundY - segment.height * 0.5, attackType === "slam" ? 6 : 4));
    if (segment.durability <= 0 && !segment.destroyed) {
      segment.destroyed = true;
      this.state.score += segment.score + segment.reward;
      building.score += segment.score;
      building.reward += segment.reward;
      this.state.debris.push(...createDebris(building.x + segment.width * 0.5, STAGE.groundY - segment.height, 8));
      if (segment.type === "roof") this.spawnPickup("civilian", building.x + 36, STAGE.groundY - 150);
      if (this.isBuildingCleared(building)) this.collapseBuilding(building);
    }
  }

  stepWaves(dt) {
    const next = ENEMY_WAVES[this.state.nextWaveIndex];
    if (next && this.state.time >= next.time) {
      this.spawnEnemyWave(next);
      this.state.nextWaveIndex += 1;
      this.state.waveIndex += 1;
    }

    if (this.state.time >= this.state.nextPickupAt) {
      this.spawnPickup("health", this.state.monster.x + 120, STAGE.groundY - 110);
      this.state.nextPickupAt = this.state.time + RUN_TIMING.pickupSpawnInterval;
    }
  }

  spawnEnemyWave(wave) {
    for (let index = 0; index < wave.count; index += 1) {
      this.state.enemies.push(createEnemy(wave.type, this.state.time, index, {
        x: STAGE.worldWidth + index * wave.spacing,
        hp: wave.hp,
        speed: wave.speed,
        attack: wave.attack,
      }));
    }
    this.state.alert = `${wave.type === "tank" ? "Armor" : "Air"} threat incoming`;
  }

  stepEnemies(dt) {
    const monster = this.state.monster;
    this.state.enemies = this.state.enemies.filter((enemy) => {
      if (!enemy.alive) return false;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.x -= enemy.speed * dt;
      if (enemy.type === "helicopter") enemy.y += Math.sin(this.state.time * 4 + enemy.x * 0.01) * 2;
      if (Math.abs(enemy.x - monster.x) < 52 && Math.abs(enemy.y - monster.y) < 52) this.applyMonsterDamage(enemy.attack * dt * 10);
      if (enemy.attackCooldown <= 0 && Math.abs(enemy.x - monster.x) < 260) {
        this.applyMonsterDamage(enemy.attack);
        enemy.attackCooldown = enemy.type === "tank" ? RUN_TIMING.tankShotInterval : RUN_TIMING.enemyShotInterval;
      }
      return enemy.x > -120 && enemy.hp > 0;
    });
  }

  stepPickups(dt) {
    const monster = this.state.monster;
    this.state.pickups = this.state.pickups.filter((pickup) => {
      pickup.ttl -= dt;
      const dx = pickup.x - monster.x;
      const dy = pickup.y - monster.y;
      if (!pickup.collected && dx * dx + dy * dy < pickup.radius * pickup.radius) {
        pickup.collected = true;
        const reward = PICKUPS[pickup.kind] ?? PICKUPS.health;
        monster.health = clamp(monster.health + reward.heal, 0, monster.maxHealth);
        this.state.score += reward.score;
        this.state.hud.civilians += pickup.kind === "civilian" ? 1 : 0;
        return false;
      }
      return pickup.ttl > 0;
    });
  }

  stepDebris(dt) {
    this.state.debris = this.state.debris.filter((chunk) => {
      chunk.life -= dt;
      chunk.x += chunk.vx * dt;
      chunk.y += chunk.vy * dt;
      chunk.vy += 140 * dt;
      return chunk.life > 0;
    });
  }

  stepBuildings(dt) {
    this.state.buildings.forEach((building) => {
      if (!building.collapsed) return;
      building.collapseTimer += dt;
      if (building.collapseTimer > RUN_TIMING.buildingCollapseDelay) {
        building.baseY += 14 * dt;
      }
    });
  }

  stepCamera(dt) {
    const desiredX = clamp(this.state.monster.x - this.width * 0.4, 0, STAGE.worldWidth - this.width);
    this.state.camera.x += (desiredX - this.state.camera.x) * Math.min(1, dt * 4);
  }

  resolveOutcome() {
    const clearedBuildings = this.state.buildings.every((building) => building.collapsed || this.isBuildingCleared(building));
    if (clearedBuildings) this.state.score += 2;
    if (this.state.score >= this.state.targetScore) this.state.win = true;
    if (this.state.monster.health <= 0 || this.state.time >= STAGE.maxTime) this.state.lose = !this.state.win;
    if (this.state.win || this.state.lose) {
      this.state.phase = this.state.win ? PHASE.WIN : PHASE.LOSE;
      this.state.outcome = this.state.win ? "win" : "lose";
    }
  }

  syncHudAndOverlay() {
    const objective = this.buildObjectiveState();
    this.state.hud.score = Math.floor(this.state.score);
    this.state.hud.health = Math.max(0, Math.round(this.state.monster.health));
    this.state.hud.targetScore = this.state.targetScore;
    this.state.hud.destroyed = this.state.buildings.reduce((sum, building) => sum + building.segments.filter((segment) => segment.destroyed).length, 0);
    this.state.hud.wavesCleared = this.state.waveIndex;
    this.state.hud.objective = objective.hudLabel;
    this.state.overlay.eyebrow = this.state.phase === PHASE.WIN ? "Mission clear" : this.state.phase === PHASE.LOSE ? "Run failed" : "Arcade run";
    this.state.overlay.title = this.state.phase === PHASE.WIN ? "City crushed" : this.state.phase === PHASE.LOSE ? "Monster down" : "Rampage City Smash";
    this.state.overlay.copy = this.state.phase === PHASE.PLAY
      ? this.state.alert || "Climb towers, smash weak points, and dodge air strikes."
      : this.state.phase === PHASE.WIN
          ? "Target met. Press Enter to run again."
        : this.state.phase === PHASE.LOSE
          ? "Monster defeated. Press Enter to retry."
          : "Press Start or Enter, climb with arrows or WASD, then use Space, J, and K to break towers.";
    this.state.overlay.button = this.state.phase === PHASE.PLAY ? "Running" : this.state.phase === PHASE.MENU ? "Start" : "Retry";
    this.state.prompt = this.state.phase === PHASE.PLAY
      ? this.state.enemies.length
        ? `${this.state.alert || "Enemy pressure"}. ${objective.hudLabel}.`
        : objective.prompt
      : this.state.prompt;
  }

  applyMonsterDamage(amount) {
    this.state.monster.health = clamp(this.state.monster.health - amount, 0, this.state.monster.maxHealth);
    this.state.health = this.state.monster.health;
    this.state.monster.hurtTimer = 0.25;
    this.state.debris.push(...createDebris(this.state.monster.x, this.state.monster.y, 3));
  }

  spawnPickup(kind, x, y) {
    this.state.pickups.push(createPickup(kind, x, y));
  }

  collapseBuilding(building) {
    building.collapsed = true;
    this.state.score += STAGE.collapseBonus;
    this.state.debris.push(...createDebris(building.x + 32, STAGE.groundY - 120, 10));
  }

  findSupportedBuilding() {
    return this.state.buildings.find((building) => !building.collapsed && Math.abs(this.state.monster.x - building.x) < 60) ?? null;
  }

  isBuildingCleared(building) {
    return building.segments.every((segment) => segment.destroyed);
  }
}
