import { GAME_CONSTANTS, OVERLAY_TEXT } from "./data.js";
import { createFrameState, createRunState, createUpgradeState } from "./state.js";
import { parseUpgradeSave, readUpgradeSave, writeUpgradeSave } from "./storage.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hypot = Math.hypot;

export default class Game {
  constructor() {
    this.upgrades = createUpgradeState();
    this.bestBank = 0;
    this.shopOpen = false;
    this.loadSave();
    this.run = createRunState();
    this.syncQueue();
    this.syncFrame();
  }

  start() {
    if (this.run.phase === "playing") return;
    if (this.run.phase === "result") {
      this.restart();
    }
    this.run.phase = "playing";
    this.run.message = "Launcher live. Auto-charge, then time the first slam into the gummy lane.";
    this.run.slamReady = false;
    this.run.overlay = null;
  }

  restart() {
    const next = createRunState(this.run.width, this.run.height);
    this.run = next;
    this.syncQueue();
    this.syncFrame();
  }

  resize(width, height) {
    this.run.width = width || this.run.width;
    this.run.height = height || this.run.height;
    this.run.world.width = this.run.width;
    this.run.world.height = this.run.height;
    this.run.world.groundY = Math.min(height - 120, GAME_CONSTANTS.groundY);
    if (this.run.totalLaunches === 0 && this.run.queueIndex === 0) {
      this.syncQueue();
    }
    this.syncEntities();
  }

  update(dt, input) {
    const seconds = clamp(dt || 0, 0, 0.05);
    this.run.elapsed += seconds;
    if (input?.start) this.start();
    if (input?.restart) this.restart();
    if (input?.pause) this.togglePause();
    if (input?.slam) this.triggerSlam();
    if (this.run.phase !== "playing") return this.syncFrame();
    this.stepCharge(seconds);
    this.stepPhysics(seconds);
    this.stepContacts(seconds);
    this.stepScoring(seconds);
    this.stepQueue();
    this.syncEntities();
    this.syncFrame();
  }

  togglePause() {
    if (this.run.phase === "playing") this.run.phase = "paused";
    else if (this.run.phase === "paused") this.run.phase = "playing";
  }

  pause(message = "Run paused.") {
    if (this.run.phase !== "playing") return false;
    this.run.phase = "paused";
    this.run.message = message;
    this.syncFrame();
    return true;
  }

  slam() {
    this.triggerSlam();
  }

  buy(id) {
    if (this.run.phase === "playing") return false;
    const upgrade = this.upgrades.find((item) => item.id === id);
    if (!upgrade || upgrade.level >= upgrade.maxLevel) return false;
    const cost = this.upgradeCost(upgrade);
    if (this.bestBank < cost) return false;
    this.bestBank -= cost;
    upgrade.level += 1;
    upgrade.owned = true;
    this.persist();
    this.syncFrame();
    return true;
  }

  getFrameState() {
    return this.frameState;
  }

  loadSave() {
    const save = parseUpgradeSave(readUpgradeSave());
    if (!save) return;
    this.bestBank = Number(save.bestBank) || 0;
    for (const upgrade of this.upgrades) {
      const saved = save.upgrades?.[upgrade.id];
      if (!saved) continue;
      const fallbackLevel = upgrade.owned ? 1 : 0;
      upgrade.level = clamp(Number(saved.level) || fallbackLevel, 0, upgrade.maxLevel);
      upgrade.owned = Boolean(saved.owned) || upgrade.level > 0 || upgrade.owned;
    }
  }

  persist() {
    const upgrades = Object.fromEntries(this.upgrades.map((upgrade) => [upgrade.id, { level: upgrade.level, owned: upgrade.owned }]));
    writeUpgradeSave(JSON.stringify({ bestBank: this.bestBank, upgrades }));
  }

  syncQueue() {
    const queueBonus = this.upgradeLevel("queue");
    const total = 8 + queueBonus * 2;
    const entities = [];
    const groundY = this.run.world.groundY;
    const startX = Math.max(this.run.player.x + 360, Math.min(this.run.world.width - 220, 760));
    const spacing = this.run.world.width < 1100 ? 92 : 104;
    const openingTargetY = this.run.world.width >= 1000 && this.run.world.width < 1400 ? groundY - 78 : groundY - 100;
    for (let i = 0; i < total; i += 1) {
      const boss = i % 4 === 3;
      entities.push({
        id: `g-${i}`,
        type: boss ? "boss" : "gummy",
        x: startX + i * spacing,
        y: i === 0 ? openingTargetY : boss ? groundY - 160 : groundY - 100 - (i % 2) * 48,
        vx: 0,
        vy: 0,
        radius: boss ? 26 : 18,
        health: boss ? 3 : 1,
        alive: true,
        pinned: true,
        value: boss ? 6 : 2,
      });
    }
    this.run.entities = entities;
    this.run.queueTotal = entities.length;
    this.run.queueIndex = 0;
    this.syncEntities();
  }

  syncEntities() {
    this.run.entities = this.run.entities.filter((entity) => entity.alive);
  }

  syncFrame() {
    const shop = this.upgrades.map((upgrade) => ({
      id: upgrade.id,
      label: upgrade.label,
      desc: upgrade.desc,
      cost: this.upgradeCost(upgrade),
      level: upgrade.level,
      maxLevel: upgrade.maxLevel,
      owned: upgrade.owned,
    }));
    const overlay = this.run.overlay || (this.run.phase === "menu" ? OVERLAY_TEXT.menu : this.run.phase === "result" ? OVERLAY_TEXT.result : null);
    this.frameState = createFrameState(this.run, this.getUpgradeEffects(), shop, overlay);
  }

  getUpgradeEffects() {
    return {
      bounce: 1 + this.upgradeLevel("spring") * 0.16,
      drag: 1 - this.upgradeLevel("syrup") * 0.04,
      slam: 1 + this.upgradeLevel("slam") * 0.2,
      coin: 1 + this.upgradeLevel("coin") * 0.35,
    };
  }

  upgradeLevel(id) {
    return this.upgrades.find((upgrade) => upgrade.id === id)?.level || 0;
  }

  upgradeCost(upgrade) {
    return upgrade.cost + upgrade.level * Math.max(8, Math.round(upgrade.cost * 0.5));
  }

  triggerSlam() {
    if (this.run.phase !== "playing") return;
    if (this.run.totalLaunches === 0) {
      this.run.message = "Wait for auto-launch, then slam on descent into the gummy lane.";
      this.run.slamReady = false;
      return;
    }
    if (this.run.player.vy <= 0 && !this.run.player.grounded) {
      this.run.message = "Too early. Let the arc fall, then slam through the lane.";
      this.run.slamReady = false;
      return;
    }
    const slamBoost = this.getUpgradeEffects().slam;
    const charged = this.run.launchCharge > 0.35 || this.run.slamReady;
    const slamWindow = this.run.queueIndex === 0 ? GAME_CONSTANTS.openingSlamWindow : GAME_CONSTANTS.slamWindow;
    const windowOpen = this.run.slamTimer <= slamWindow;
    if (charged && windowOpen) {
      this.run.player.vy = Math.max(this.run.player.vy + GAME_CONSTANTS.slamBoost * 0.72 * slamBoost, 220);
      this.run.player.vx += GAME_CONSTANTS.slamBoost * 0.44 * slamBoost;
      this.run.slamActive = true;
      this.run.openingSlamCommitted = this.run.queueIndex === 0;
      this.setCallout(this.run.queueIndex === 0 ? "Slam for burst" : "Slam primed", this.run.queueIndex === 0 ? "opening" : "slam");
      this.run.message = this.run.queueIndex === 0
        ? "Slam primed. Hit the first glowing gummy now for a burst rebound."
        : "Slam primed. Follow the glowing lane through the queue.";
    } else {
      this.run.combo = 0;
      this.run.message = "Missed slam window. Wait for the ring, then drive down the lane.";
    }
    this.run.slamTimer = 0;
    this.run.slamReady = false;
  }

  stepCharge(dt) {
    if (this.run.totalLaunches > 0 && !this.run.player.grounded) {
      this.run.player.launcherCharge = 0;
      return;
    }
    const launchGain = 0.7 * dt;
    this.run.launchCharge = clamp(this.run.launchCharge + launchGain, 0, GAME_CONSTANTS.maxLaunchCharge);
    this.run.player.launcherCharge = this.run.launchCharge;
    if (this.run.launchCharge >= GAME_CONSTANTS.maxLaunchCharge) {
      this.fireLauncher();
    }
  }

  fireLauncher() {
    const bounceBonus = this.getUpgradeEffects().bounce;
    this.run.totalLaunches += 1;
    this.run.player.vx = 520 + this.run.launchCharge * GAME_CONSTANTS.launchPower * bounceBonus;
    this.run.player.vy = -260 - this.run.launchCharge * 220;
    this.run.player.grounded = false;
    this.run.launchCharge = 0;
    this.run.slamTimer = 0;
    this.run.slamReady = true;
    this.run.message = "Launched. Drop through the glowing lane, then slam on descent.";
  }

  stepPhysics(dt) {
    const effects = this.getUpgradeEffects();
    this.run.player.grounded = false;
    this.run.player.vy += GAME_CONSTANTS.gravity * dt;
    this.run.player.vx *= Math.pow(GAME_CONSTANTS.airDrag * effects.drag, dt * 60);
    this.run.player.vy *= 0.998;
    this.run.player.x += this.run.player.vx * dt;
    this.run.player.y += this.run.player.vy * dt;
    const groundY = this.run.world.groundY;
    if (this.run.player.y > groundY - this.run.player.radius) {
      this.run.player.y = groundY - this.run.player.radius;
      this.run.player.vy = -Math.abs(this.run.player.vy) * (GAME_CONSTANTS.bouncePower + effects.bounce * 0.18);
      this.run.player.vx *= GAME_CONSTANTS.groundFriction;
      this.run.player.grounded = true;
      this.run.slamActive = false;
      this.run.combo = Math.max(this.run.combo, 1);
      this.run.slamReady = true;
    }
    this.run.distance = Math.max(this.run.distance, Math.max(0, this.run.player.x - GAME_CONSTANTS.launcherX));
    this.run.maxSpeed = Math.max(this.run.maxSpeed, hypot(this.run.player.vx, this.run.player.vy));
    this.run.slamTimer += dt;
    this.run.launchCooldown = Math.max(0, this.run.launchCooldown - dt);
    if (this.run.callout) {
      this.run.callout.timer = Math.max(0, this.run.callout.timer - dt);
      if (this.run.callout.timer === 0) this.run.callout = null;
    }
  }

  stepContacts(dt) {
    const player = this.run.player;
    const slamBoost = this.getUpgradeEffects().slam;
    for (const entity of this.run.entities) {
      if (!entity.alive) continue;
      const dx = entity.x - player.x;
      const dy = entity.y - player.y;
      const radius = entity.radius + player.radius;
      const dist = hypot(dx, dy);
      if (dist === 0 || dist > radius) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const relativeSpeed = Math.max(1, hypot(player.vx - entity.vx, player.vy - entity.vy));
      const bounce = 0.82 + this.getUpgradeEffects().bounce * 0.2;
      const impulse = relativeSpeed * bounce;
      const slamContact = this.run.slamActive && this.run.slamTimer <= GAME_CONSTANTS.slamCarryWindow && player.vy > 0;
      const openingTarget = entity.id === `g-${this.run.queueIndex}`;
      const requiresCommittedDrop = this.run.queueIndex === 0 && openingTarget;
      const cleanDrop = player.vy > (requiresCommittedDrop ? GAME_CONSTANTS.openingImpactSpeed : 0);
      const damagingContact = slamContact || cleanDrop;
      const contactScale = requiresCommittedDrop && !damagingContact ? 0.18 : 1;
      player.vx -= nx * impulse * 0.55 * contactScale;
      player.vy -= ny * impulse * 0.55 * contactScale;
      entity.vx += nx * impulse * 0.2 * contactScale;
      entity.vy += ny * impulse * 0.2 * contactScale;
      if (damagingContact) {
        entity.health -= slamContact ? 3 : 1;
        this.run.bounceChain += 1;
        this.run.combo += 1;
        this.run.bestCombo = Math.max(this.run.bestCombo, this.run.combo);
        this.run.chainCount += 1;
        this.run.lastContactAt = this.run.elapsed;
        this.run.coins += Math.max(1, Math.round(entity.value * this.getUpgradeEffects().coin));
        this.run.score += Math.round(relativeSpeed * 0.12 + this.run.combo * 2);
        if (slamContact) {
          player.vx += 180 * slamBoost;
          player.vy = -Math.abs(player.vy) * (0.4 + this.getUpgradeEffects().bounce * 0.08);
          this.run.score += Math.round(20 * slamBoost + this.run.combo * 3);
          this.run.coins += Math.max(1, Math.round(2 * slamBoost));
          this.run.message = "Slam hit. Ride the rebound and keep the lane alive.";
          this.setCallout("Slam hit", "slam");
          this.run.slamActive = false;
          this.persist();
        }
        if (openingTarget && this.run.queueIndex === 0 && this.run.openingSlamCommitted) {
          player.vx += GAME_CONSTANTS.openingSlamBonusSpeed * slamBoost;
          this.run.score += Math.round(GAME_CONSTANTS.openingSlamBonusScore * slamBoost);
          this.run.coins += GAME_CONSTANTS.openingSlamBonusCoins;
          this.run.message = "Perfect opener. Cash the rebound before the lane closes.";
          this.setCallout("Opener burst", "opening");
          this.run.openingSlamCommitted = false;
        } else if (openingTarget && this.run.queueIndex === 0 && cleanDrop && !slamContact) {
          this.run.message = "Clean drop, but slam gives the big opener burst.";
          this.setCallout("Clean drop", "soft");
        }
        if (entity.health <= 0) {
          entity.alive = false;
          this.run.queueIndex += 1;
          this.run.score += entity.value * 10;
        }
      } else if (requiresCommittedDrop) {
        this.run.message = "Soft graze. Drop deeper or slam through the glowing target.";
        this.run.openingSlamCommitted = false;
      }
      this.run.slamReady = true;
      this.run.slamTimer = 0;
    }
  }

  stepScoring(dt) {
    const decay = dt > 0 ? 0.15 * dt : 0;
    this.run.combo = Math.max(0, this.run.combo - decay);
    this.run.score += Math.round(this.run.maxSpeed * dt * 0.08);
    if (this.run.player.y > this.run.world.height + 120) {
      this.endRun("Fell out of bounds.");
    }
  }

  stepQueue() {
    const nextTarget = this.run.entities.find((entity) => entity.alive);
    if (nextTarget && this.run.totalLaunches > 0 && this.run.player.x > nextTarget.x + 120) {
      this.endRun("Missed the gummy lane. Restart and stay over the glowing target.");
      return;
    }
    if (this.run.queueIndex >= this.run.queueTotal) {
      this.run.phase = "result";
      this.run.overlay = {
        eyebrow: "Win",
        title: "Queue cleared.",
        copy: "Bank the chain, then buy more launch control and slam power.",
      };
      this.bestBank += this.run.coins;
      this.persist();
    }
  }

  endRun(message) {
    this.run.phase = "result";
    this.run.message = message;
    this.run.overlay = {
      eyebrow: "Run ended",
      title: "Bison down.",
      copy: "The launcher still remembers the shop state. Restart to try again.",
    };
    this.bestBank += this.run.coins;
    this.persist();
  }

  setCallout(text, tone) {
    this.run.callout = {
      text,
      tone,
      timer: 1.15,
    };
  }
}

export { Game };
