import {
  BLOON_TYPES,
  HEIGHT,
  OPERATIONS,
  PLACEMENT_MARGIN,
  STARTING_OPERATION_INDEX,
  TOWER_DEFS,
  TOWER_SPACING,
  WIDTH,
} from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function buildPathData(pathPoints) {
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < pathPoints.length - 1; i += 1) {
    const start = pathPoints[i];
    const end = pathPoints[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    segments.push({ start, end, dx, dy, length, startDistance: totalLength });
    totalLength += length;
  }
  return { segments, totalLength };
}

function normalizedPan(x) {
  return clamp((x / WIDTH) * 2 - 1, -0.85, 0.85);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = start.x + dx * t;
  const py = start.y + dy * t;
  return Math.hypot(point.x - px, point.y - py);
}

function distanceToPath(point, pathData) {
  let best = Number.POSITIVE_INFINITY;
  for (const segment of pathData.segments) {
    best = Math.min(best, distanceToSegment(point, segment.start, segment.end));
  }
  return best;
}

function makeTower(defId, x, y) {
  const def = TOWER_DEFS[defId];
  return { id: `${defId}-${Math.random().toString(36).slice(2, 8)}`, type: defId, x, y, cooldown: 0, level: 1 };
}

function getTowerStats(tower, globalBuffs = {}, commandTier = Number.POSITIVE_INFINITY) {
  const def = TOWER_DEFS[tower.type];
  const stats = {
    ...def,
    level: tower.level,
    maxLevel: (def.upgrades?.length || 0) + 1,
    upgradeName: null,
    upgradeCost: null,
    upgradeLockedUntilTier: null,
  };

  for (let i = 0; i < tower.level - 1; i += 1) {
    const upgrade = def.upgrades?.[i];
    if (!upgrade) {
      continue;
    }
    stats.upgradeName = upgrade.name;
    if (upgrade.range) {
      stats.range += upgrade.range;
    }
    if (upgrade.damage) {
      stats.damage += upgrade.damage;
    }
    if (upgrade.splash) {
      stats.splash += upgrade.splash;
    }
    if (upgrade.slowFactor) {
      stats.slowFactor = upgrade.slowFactor;
    }
    if (upgrade.slowDuration) {
      stats.slowDuration += upgrade.slowDuration;
    }
    if (upgrade.fireRateMultiplier) {
      stats.fireRate *= upgrade.fireRateMultiplier;
    }
  }

  if (globalBuffs.rangeBonus) {
    stats.range += globalBuffs.rangeBonus;
  }
  if (globalBuffs.damageBonus) {
    stats.damage += globalBuffs.damageBonus;
  }
  if (globalBuffs.splashBonus) {
    stats.splash += globalBuffs.splashBonus;
  }
  if (globalBuffs.fireRateMultiplier) {
    stats.fireRate *= globalBuffs.fireRateMultiplier;
  }
  if (globalBuffs.slowDurationBonus) {
    stats.slowDuration = (stats.slowDuration || 0) + globalBuffs.slowDurationBonus;
  }

  const nextUpgrade = def.upgrades?.[tower.level - 1];
  if (nextUpgrade) {
    stats.upgradeCost = nextUpgrade.cost;
    stats.nextUpgradeName = nextUpgrade.name;
    stats.upgradeLockedUntilTier = commandTier < (nextUpgrade.unlockTier || 1) ? nextUpgrade.unlockTier : null;
  } else {
    stats.nextUpgradeName = null;
  }
  return stats;
}

function summarizeUpgrade(upgrade) {
  if (!upgrade) {
    return null;
  }
  const parts = [];
  if (upgrade.damage) {
    parts.push(`+${upgrade.damage} damage`);
  }
  if (upgrade.range) {
    parts.push(`+${Math.round(upgrade.range)} range`);
  }
  if (upgrade.splash) {
    parts.push(`+${Math.round(upgrade.splash)} splash`);
  }
  if (upgrade.slowFactor) {
    parts.push(`${Math.round(upgrade.slowFactor * 100)}% speed`);
  }
  if (upgrade.slowDuration) {
    parts.push(`+${upgrade.slowDuration.toFixed(1)}s slow`);
  }
  if (upgrade.fireRateMultiplier) {
    parts.push(`${Math.round((1 - upgrade.fireRateMultiplier) * 100)}% faster`);
  }
  return parts.length > 0 ? parts.join(", ") : "Stat refinement";
}

function expandWaveEntries(entries) {
  const plan = [];
  for (const entry of entries) {
    if (entry.type) {
      for (let i = 0; i < entry.count; i += 1) {
        plan.push({ type: entry.type, delay: entry.spacing });
      }
      continue;
    }
    if (!Array.isArray(entry.pattern) || entry.pattern.length === 0) {
      continue;
    }
    const cycleDelay = entry.gap ?? entry.spacing;
    for (let repeat = 0; repeat < entry.repeats; repeat += 1) {
      for (let index = 0; index < entry.pattern.length; index += 1) {
        plan.push({
          type: entry.pattern[index],
          delay: index === entry.pattern.length - 1 ? cycleDelay : entry.spacing,
        });
      }
    }
  }
  return plan;
}

function summarizeWaveEntries(entries) {
  const counts = new Map();
  for (const item of expandWaveEntries(entries)) {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => `${count} ${type} bloon${count === 1 ? "" : "s"}`)
    .join(", ");
}

function extractWaveTypes(entries) {
  const types = [];
  for (const entry of entries) {
    if (entry.type) {
      types.push(entry.type);
      continue;
    }
    if (Array.isArray(entry.pattern)) {
      types.push(...entry.pattern);
    }
  }
  return types;
}

function isHeavyBloon(typeId) {
  return typeId === "lead" || typeId === "ceramic" || typeId === "ember" || typeId === "marble";
}

function isEliteBloon(typeId) {
  return typeId === "ceramic" || typeId === "ember" || typeId === "marble";
}

function describeBloonThreat(typeId) {
  const bloon = BLOON_TYPES[typeId];
  if (!bloon) {
    return typeId;
  }
  const traits = [];
  if (bloon.volatile) {
    traits.push("volatile");
  }
  if (bloon.armored || bloon.hp >= 10) {
    traits.push("shell");
  }
  if (bloon.children) {
    traits.push("splitter");
  }
  if (bloon.speed >= 96) {
    traits.push("speed");
  }
  if (bloon.bonusCash) {
    traits.push("bonus-cash");
  }
  if (traits.length === 0) {
    traits.push("lane");
  }
  return `${typeId} ${traits.join(" + ")} pressure`;
}

export class Game {
  constructor() {
    this.operationIndex = STARTING_OPERATION_INDEX;
    this.speedMultipliers = [1, 2, 3];
    this.speedIndex = 0;
    this.configureOperation();
    this.restart();
  }

  configureOperation() {
    this.operation = OPERATIONS[this.operationIndex] ?? OPERATIONS[STARTING_OPERATION_INDEX];
    this.pathData = buildPathData(this.operation.pathPoints);
  }

  setOperation(index) {
    if (!OPERATIONS[index] || index === this.operationIndex) {
      return false;
    }
    this.operationIndex = index;
    this.configureOperation();
    this.restart();
    return true;
  }

  pointAtDistance(distance) {
    const capped = clamp(distance, 0, this.pathData.totalLength);
    for (const segment of this.pathData.segments) {
      if (capped <= segment.startDistance + segment.length) {
        const t = segment.length === 0 ? 0 : (capped - segment.startDistance) / segment.length;
        return {
          x: segment.start.x + segment.dx * t,
          y: segment.start.y + segment.dy * t,
          dx: segment.length === 0 ? 0 : segment.dx / segment.length,
          dy: segment.length === 0 ? 0 : segment.dy / segment.length,
        };
      }
    }
    const last = this.pathData.segments[this.pathData.segments.length - 1];
    return {
      x: last.end.x,
      y: last.end.y,
      dx: last.length === 0 ? 0 : last.dx / last.length,
      dy: last.length === 0 ? 0 : last.dy / last.length,
    };
  }

  makeBloonAtDistance(typeId, distance) {
    const def = BLOON_TYPES[typeId];
    const point = this.pointAtDistance(distance);
    return {
      id: `bloon-${Math.random().toString(36).slice(2, 8)}`,
      type: typeId,
      x: point.x,
      y: point.y,
      dirX: point.dx,
      dirY: point.dy,
      distance,
      hp: def.hp,
      maxHp: def.hp,
      slowedUntil: 0,
      slowFactor: 1,
      dead: false,
    };
  }

  makeBloon(typeId) {
    return this.makeBloonAtDistance(typeId, 0);
  }

  restart() {
    this.mode = "menu";
    this.cash = this.operation.startingCash;
    this.lives = this.operation.startingLives;
    this.startingLives = this.operation.startingLives;
    this.waveIndex = 0;
    this.pops = 0;
    this.time = 0;
    this.towers = [];
    this.bloons = [];
    this.projectiles = [];
    this.effects = [];
    this.audioEvents = [];
    this.selectedTowerId = "dart";
    this.selectedPlacedTowerId = null;
    this.preview = { x: WIDTH * 0.5, y: HEIGHT * 0.5, valid: false, reason: "Move over grass." };
    this.wavePlan = [];
    this.waveCursor = 0;
    this.spawnCooldown = 0;
    this.waveActive = false;
    this.intermission = this.operation.intermissionTime;
    this.commandTier = 1;
    this.screenShake = 0;
    this.screenPulse = null;
    this.status = `${this.operation.name}: build lane before first send.`;
    const selectedTower = this.getSelectedTowerDef();
    const initialPreview = this.findInitialPreviewPosition();
    this.preview = initialPreview
      ? { x: initialPreview.x, y: initialPreview.y, valid: true, reason: `${selectedTower.name} ready.` }
      : this.preview;
  }

  getSelectedTowerDef() {
    if (!TOWER_DEFS[this.selectedTowerId]) {
      this.selectedTowerId = "dart";
    }
    return TOWER_DEFS[this.selectedTowerId];
  }

  findInitialPreviewPosition() {
    for (let y = HEIGHT - 78; y >= this.operation.grassTop + 52; y -= 18) {
      for (let x = 104; x <= WIDTH - 104; x += 18) {
        const placement = this.getPlacementState(x, y, this.selectedTowerId);
        if (placement.valid) {
          return { x, y };
        }
      }
    }
    return null;
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.status = this.operation.flavor;
      this.queueAudio("ui");
    }
  }

  toggleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.speedMultipliers.length;
    this.queueAudio("ui");
  }

  setSpeedIndex(index) {
    if (!Number.isInteger(index)) {
      return false;
    }
    if (index < 0 || index >= this.speedMultipliers.length) {
      return false;
    }
    this.speedIndex = index;
    return true;
  }

  getWaves() {
    return this.operation.waves;
  }

  requestNextWave() {
    const waves = this.getWaves();
    if (this.mode !== "playing" || this.waveActive || this.waveIndex >= waves.length) {
      return;
    }
    this.launchWave();
  }

  selectTower(id) {
    if (TOWER_DEFS[id]) {
      this.selectedTowerId = id;
      this.selectedPlacedTowerId = null;
      this.updatePreview(this.preview.x, this.preview.y);
    }
  }

  towerAtPoint(x, y) {
    return this.towers.find((tower) => Math.hypot(tower.x - x, tower.y - y) <= 26) || null;
  }

  selectPlacedTower(x, y) {
    const tower = this.towerAtPoint(x, y);
    if (!tower) {
      this.selectedPlacedTowerId = null;
      return false;
    }
    this.selectedPlacedTowerId = tower.id;
    this.selectedTowerId = tower.type;
    const stats = getTowerStats(tower, this.getGlobalBuffs(), this.commandTier);
    this.status = `${stats.name} selected. Level ${stats.level}/${stats.maxLevel}.`;
    this.preview = { x, y, valid: false, reason: "Tower selected for upgrades." };
    return true;
  }

  updatePreview(x, y) {
    const placement = this.getPlacementState(x, y, this.getSelectedTowerDef().id);
    this.preview = { x, y, valid: placement.valid, reason: placement.reason };
  }

  tryPlaceSelectedTower(x, y) {
    if (this.mode !== "playing") {
      return;
    }
    if (this.selectPlacedTower(x, y)) {
      return;
    }
    const selectedTower = this.getSelectedTowerDef();
    const placement = this.getPlacementState(x, y, selectedTower.id);
    if (!placement.valid) {
      this.status = placement.reason;
      return;
    }
    const def = selectedTower;
    this.cash -= def.cost;
    const tower = makeTower(def.id, x, y);
    this.towers.push(tower);
    this.selectedPlacedTowerId = tower.id;
    this.status = `${def.name} placed.`;
    this.queueAudio("place", { pan: normalizedPan(x) });
    this.addScreenFeedback({ shake: 2.8, color: "rgba(255,255,255,0.06)", intensity: 0.06, life: 0.1, x, y });
    this.effects.push({ kind: "ring", x, y, radius: 18, growth: 136, lineWidth: 5, color: "rgba(255,255,255,0.42)", life: 0.34, maxLife: 0.34 });
    this.effects.push({
      kind: "burst",
      x,
      y,
      radius: 8,
      growth: 72,
      sparkRadius: 3,
      sparks: this.makeBurstSparks(10, def.color),
      color: def.color,
      life: 0.28,
      maxLife: 0.28,
    });
    this.spawnDriftBurst(x, y, `${def.color}cc`, 9, {
      radius: 4.5,
      speed: 54,
      life: 0.22,
      spread: Math.PI * 1.3,
      startAngle: -Math.PI * 0.5,
      gravity: 10,
    });
    this.updatePreview(x, y);
  }

  upgradeSelectedTower() {
    if (this.mode !== "playing") {
      return;
    }
    const tower = this.towers.find((entry) => entry.id === this.selectedPlacedTowerId);
    if (!tower) {
      this.status = "Select a placed tower first.";
      return;
    }
    const stats = getTowerStats(tower, this.getGlobalBuffs(), this.commandTier);
    if (!stats.upgradeCost) {
      this.status = `${stats.name} already maxed.`;
      return;
    }
    if (stats.upgradeLockedUntilTier) {
      this.status = `${stats.nextUpgradeName} unlocks at Command Tier ${stats.upgradeLockedUntilTier}.`;
      return;
    }
    if (this.cash < stats.upgradeCost) {
      this.status = `Need $${stats.upgradeCost} for ${stats.nextUpgradeName}.`;
      return;
    }
    this.cash -= stats.upgradeCost;
    tower.level += 1;
    const upgraded = getTowerStats(tower, this.getGlobalBuffs(), this.commandTier);
    this.status = `${stats.name} upgraded to ${upgraded.nextUpgradeName ? upgraded.upgradeName : `max level ${upgraded.level}`}.`;
    this.queueAudio("upgrade", { pan: normalizedPan(tower.x) });
    this.addScreenFeedback({ shake: 3.8, color: "rgba(255,225,129,0.1)", intensity: 0.09, life: 0.14, x: tower.x, y: tower.y });
    this.effects.push({ kind: "ring", x: tower.x, y: tower.y, radius: 20, growth: 158, lineWidth: 6, color: "rgba(255, 225, 129, 0.48)", life: 0.42, maxLife: 0.42 });
    this.spawnDriftBurst(tower.x, tower.y, "rgba(255, 232, 158, 0.9)", 10, {
      radius: 4.8,
      speed: 58,
      life: 0.24,
      spread: Math.PI * 1.45,
      startAngle: -Math.PI * 0.5,
      gravity: 6,
    });
  }

  queueAudio(type, payload = {}) {
    this.audioEvents.push({ id: `${type}-${this.time}-${this.audioEvents.length}`, type, ...payload });
  }

  addScreenFeedback({
    shake = 0,
    color = "rgba(255,255,255,0.08)",
    intensity = 0.08,
    life = 0.12,
    radius = 220,
    x = WIDTH * 0.5,
    y = HEIGHT * 0.5,
  } = {}) {
    this.screenShake = Math.max(this.screenShake, shake);
    if (!this.screenPulse || intensity >= this.screenPulse.intensity || life >= this.screenPulse.life) {
      this.screenPulse = { color, intensity, life, maxLife: life, radius, x, y };
    }
  }

  consumeAudioEvents() {
    const events = this.audioEvents;
    this.audioEvents = [];
    return events;
  }

  makeBurstSparks(count, color) {
    const sparks = [];
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.28;
      sparks.push({
        angle,
        length: 18 + Math.random() * 20,
        width: 2 + Math.random() * 2,
        color,
      });
    }
    return sparks;
  }

  spawnDriftBurst(x, y, color, count = 8, options = {}) {
    const {
      radius = 5,
      speed = 42,
      life = 0.26,
      spread = Math.PI * 2,
      startAngle = -Math.PI * 0.5,
      gravity = 0,
    } = options;
    for (let index = 0; index < count; index += 1) {
      const denominator = Math.max(1, count - 1);
      const angle = startAngle - spread * 0.5 + (spread * (index + Math.random() * 0.55)) / denominator;
      const velocity = speed * (0.55 + Math.random() * 0.8);
      this.effects.push({
        kind: "drift",
        x,
        y,
        radius: radius * (0.6 + Math.random() * 0.9),
        growth: -radius * 0.35,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity + gravity,
        color,
        life: life * (0.78 + Math.random() * 0.4),
        maxLife: life,
      });
    }
  }

  getGlobalBuffs() {
    return {
      rangeBonus: this.commandTier >= 2 ? 18 : 0,
      fireRateMultiplier: this.commandTier >= 4 ? 0.88 : 1,
      damageBonus: this.commandTier >= 5 ? 1 : 0,
    };
  }

  getCommandSummary() {
    const unlockSteps = this.getCommandUnlockSteps();
    const tier2Wave = unlockSteps.find((step) => step.tier === 2)?.wave;
    const tier3Wave = unlockSteps.find((step) => step.tier === 3)?.wave;
    const tier4Wave = unlockSteps.find((step) => step.tier === 4)?.wave;
    const tier5Wave = unlockSteps.find((step) => step.tier === 5)?.wave;
    if (this.commandTier === 1) {
      return `Tier 1 baseline. Clear wave ${tier2Wave} for Long Sight Routes: all towers gain +18 range.`;
    }
    if (this.commandTier === 2) {
      return `Tier 2 Long Sight Routes active. All towers gain +18 range. Clear wave ${tier3Wave} to unlock third-tier tower upgrades.`;
    }
    if (this.commandTier === 3) {
      return `Tier 3 Mk II Crates active. Third-tier tower upgrades unlocked. Clear wave ${tier4Wave} for Hot Hands fire-rate boost.`;
    }
    if (this.commandTier === 4) {
      return `Tier 4 Hot Hands active. All towers fire 12% faster. Clear wave ${tier5Wave} for Pressure Read damage boost and elite upgrades.`;
    }
    return "Tier 5 Pressure Read active. Global bonuses online: +18 range, 12% faster fire, +1 damage, elite fourth upgrades.";
  }

  getCommandUnlockSteps() {
    const waveTotal = this.getWaves().length;
    const baseSteps = [
      { wave: 3, tier: 2, label: "Long Sight Routes (+18 range)" },
      { wave: 5, tier: 3, label: "Mk II Crates (third-tier tower upgrades)" },
      { wave: 7, tier: 4, label: "Hot Hands (12% faster fire)" },
      { wave: 9, tier: 5, label: "Pressure Read (+1 damage, elite fourth upgrades)" },
    ];
    let previousWave = 0;
    return baseSteps.map((step, index) => {
      const remainingSteps = baseSteps.length - index - 1;
      const cappedWave = Math.min(step.wave, waveTotal - remainingSteps - 1);
      const wave = Math.max(previousWave + 1, cappedWave);
      previousWave = wave;
      return { ...step, wave };
    });
  }

  getNextCommandUnlock() {
    const nextStep = this.getCommandUnlockSteps().find((step) => step.tier > this.commandTier);
    return nextStep ? `Next command unlock: clear wave ${nextStep.wave} for ${nextStep.label}.` : "All command unlocks online.";
  }

  getThreatMetrics() {
    let activeHeavyCount = 0;
    let activeEliteCount = 0;
    let activeVolatileCount = 0;
    let activeFastCount = 0;
    for (const bloon of this.bloons) {
      if (isHeavyBloon(bloon.type)) {
        activeHeavyCount += 1;
      }
      if (isEliteBloon(bloon.type)) {
        activeEliteCount += 1;
      }
      if (BLOON_TYPES[bloon.type].volatile) {
        activeVolatileCount += 1;
      }
      if (BLOON_TYPES[bloon.type].speed >= 96) {
        activeFastCount += 1;
      }
    }
    const routePressure = clamp(
      activeHeavyCount * 0.16 + activeEliteCount * 0.12 + activeVolatileCount * 0.08 + activeFastCount * 0.04 + this.bloons.length * 0.012,
      0,
      1
    );
    return {
      activeHeavyCount,
      activeEliteCount,
      activeVolatileCount,
      activeFastCount,
      routePressure,
    };
  }

  getVisibleStarterPads() {
    if (!Array.isArray(this.operation.starterPads) || this.operation.starterPads.length === 0) {
      return [];
    }
    return this.operation.starterPads.filter((pad) => {
      const targetX = Number.isFinite(pad.targetX) ? pad.targetX : pad.x;
      const targetY = Number.isFinite(pad.targetY) ? pad.targetY : pad.y;
      return !this.towers.some(
        (tower) => Math.hypot(tower.x - pad.x, tower.y - pad.y) <= 58 || Math.hypot(tower.x - targetX, tower.y - targetY) <= 72
      );
    });
  }

  shouldShowStarterPads() {
    if (this.waveIndex !== 0) {
      return false;
    }
    if (this.getVisibleStarterPads().length === 0) {
      return false;
    }
    return !this.waveActive || this.towers.length <= 1;
  }

  getWaveIntel() {
    const waves = this.getWaves();
    const wave = waves[this.waveIndex];
    if (!wave) {
      return {
        label: "All Clear",
        mix: "No further waves queued.",
        threat: "Campaign route cleared.",
      };
    }

    const seenTypes = new Set();
    for (let i = 0; i < this.waveIndex; i += 1) {
      for (const type of extractWaveTypes(waves[i].entries)) {
        seenTypes.add(type);
      }
    }

    const introduced = [];
    const repeatedThreats = [];
    for (const type of extractWaveTypes(wave.entries)) {
      if (seenTypes.has(type)) {
        if (!repeatedThreats.includes(type)) {
          repeatedThreats.push(type);
        }
        continue;
      }
      seenTypes.add(type);
      introduced.push(type);
    }

    let threat = "Known bloons only. This wave tests cleaner stacking and lane coverage.";
    if (introduced.length > 0) {
      threat = `New this wave: ${introduced.map(describeBloonThreat).join(", ")}.`;
    } else if (repeatedThreats.length > 0) {
      threat = `Returning pressure: ${repeatedThreats.map(describeBloonThreat).join(", ")}.`;
    }

    return { label: wave.label, mix: summarizeWaveEntries(wave.entries), threat };
  }

  getWaveThreatFlags(waveIndex = this.waveIndex) {
    const wave = this.getWaves()[waveIndex];
    const types = wave ? extractWaveTypes(wave.entries) : [];
    return {
      hasHeavy: types.some((type) => isHeavyBloon(type)),
      hasBonus: types.some((type) => BLOON_TYPES[type]?.bonusCash),
      hasVolatile: types.some((type) => BLOON_TYPES[type]?.volatile),
      hasFast: types.some((type) => (BLOON_TYPES[type]?.speed || 0) >= 96),
    };
  }

  buildThreatAdvice(flags, context = "live") {
    const clauses = [];
    if (flags.hasHeavy) {
      clauses.push(
        context === "live"
          ? "Bring bomb coverage online before shell bloons stack up."
          : "Bring bomb coverage online before shells and marbles stack up."
      );
    }
    if (flags.hasVolatile) {
      clauses.push(
        context === "live"
          ? "Keep spacing clean so volatile pops do not punish the same bend twice."
          : "Keep the busiest bend cleaner so volatile pops do not punish the same lane twice."
      );
    }
    if (flags.hasBonus && flags.hasFast) {
      clauses.push("Cash in gold sprints when safe, and tap F down if the pace gets away from you.");
    } else if (flags.hasBonus) {
      clauses.push("Cash in gold sprints when the lane is stable so the next tower lands on time.");
    } else if (flags.hasFast) {
      clauses.push("Tap F down if the pace gets away from you.");
    }
    return clauses;
  }

  getLiveHintPrimary() {
    const flags = this.getWaveThreatFlags();
    const parts = [`${this.getWaveIntel().label} live.`];
    const advice = this.buildThreatAdvice(flags, "live");
    if (advice.length > 0) {
      parts.push(...advice);
    } else {
      parts.push("Cover the first bend, click placed towers to inspect, and keep leaks off the exit.");
    }
    if (this.shouldShowStarterPads()) {
      const visibleLabels = this.getVisibleStarterPads()
        .map((pad) => pad.label || "Build")
        .join(", ");
      if (visibleLabels) {
        parts.push(`Starter pads still mark ${visibleLabels} follow-ups while wave 1 settles.`);
      }
    }
    return parts.join(" ");
  }

  getLoseOverlayCopy() {
    const flags = this.getWaveThreatFlags();
    if (this.waveIndex === 0 && !flags.hasHeavy && !flags.hasBonus) {
      return "Shift the first tower forward, hold the opening bend sooner, and relaunch fast.";
    }
    const advice = this.buildThreatAdvice(flags, "lose");
    if (advice.length > 0) {
      return `Place forward. ${advice.join(" ")}`;
    }
    if (flags.hasVolatile || flags.hasFast) {
      return "Tighten the busiest bend, use F to calm the pace if needed, and relaunch before the lane snowballs.";
    }
    return "Add earlier lane coverage, keep leaks off the exit, and relaunch while the route read is still fresh.";
  }

  getLoseStatus() {
    const flags = this.getWaveThreatFlags();
    if (this.waveIndex === 0 && !flags.hasHeavy && !flags.hasBonus) {
      return "Track collapsed. Restart, cover the opening bend sooner, and relaunch fast.";
    }
    const advice = this.buildThreatAdvice(flags, "lose");
    if (advice.length > 0) {
      return `Track collapsed. Restart. ${advice.join(" ")}`;
    }
    if (flags.hasVolatile || flags.hasFast) {
      return "Track collapsed. Restart, tighten the busiest bend, and calm the pace sooner.";
    }
    return "Track collapsed. Restart, add earlier lane coverage, and stop the leaks sooner.";
  }

  awardCommandTier(clearedWaveNumber) {
    const tierByWave = Object.fromEntries(this.getCommandUnlockSteps().map((step) => [step.wave, step.tier]));
    const nextTier = tierByWave[clearedWaveNumber];
    if (!nextTier || nextTier <= this.commandTier) {
      return null;
    }
    this.commandTier = nextTier;
    const centerPoint = this.operation.pathPoints[Math.floor(this.operation.pathPoints.length * 0.5)];
    this.addScreenFeedback({
      shake: nextTier >= 5 ? 8.8 : 6.2,
      color: nextTier >= 5 ? "rgba(255, 218, 120, 0.14)" : "rgba(255,255,255,0.1)",
      intensity: nextTier >= 5 ? 0.14 : 0.1,
      life: nextTier >= 5 ? 0.24 : 0.18,
      radius: nextTier >= 5 ? 244 : 196,
      x: centerPoint?.x ?? WIDTH * 0.5,
      y: centerPoint?.y ?? HEIGHT * 0.5,
    });
    this.effects.push({
      kind: "shockwave",
      x: centerPoint?.x ?? WIDTH * 0.5,
      y: centerPoint?.y ?? HEIGHT * 0.5,
      radius: nextTier >= 5 ? 34 : 26,
      growth: nextTier >= 5 ? 284 : 218,
      lineWidth: nextTier >= 5 ? 10 : 8,
      color: nextTier >= 5 ? "rgba(255, 220, 133, 0.42)" : "rgba(255,255,255,0.3)",
      life: nextTier >= 5 ? 0.34 : 0.26,
      maxLife: nextTier >= 5 ? 0.34 : 0.26,
    });
    this.effects.push({
      kind: "flash",
      x: centerPoint?.x ?? WIDTH * 0.5,
      y: centerPoint?.y ?? HEIGHT * 0.5,
      radius: nextTier >= 5 ? 132 : 108,
      growth: nextTier >= 5 ? 86 : 64,
      color: nextTier >= 5 ? "rgba(255, 236, 176, 0.18)" : "rgba(255,255,255,0.12)",
      life: nextTier >= 5 ? 0.22 : 0.18,
      maxLife: nextTier >= 5 ? 0.22 : 0.18,
    });
    this.addRoutePulseEffects(nextTier >= 5 ? "rgba(255, 214, 122, 0.54)" : this.operation.theme.accent, 0.28, 0.03);
    this.spawnDriftBurst(centerPoint?.x ?? WIDTH * 0.5, centerPoint?.y ?? HEIGHT * 0.5, "rgba(255, 233, 170, 0.7)", nextTier >= 5 ? 16 : 12, {
      radius: nextTier >= 5 ? 6.2 : 5.2,
      speed: nextTier >= 5 ? 76 : 62,
      life: nextTier >= 5 ? 0.34 : 0.26,
      spread: Math.PI * 1.6,
      startAngle: -Math.PI * 0.5,
      gravity: nextTier >= 5 ? 4 : 0,
    });
    if (nextTier === 2) {
      return { tier: nextTier, message: "Command Tier 2 online. Long Sight Routes gave every tower +18 range." };
    }
    if (nextTier === 3) {
      return { tier: nextTier, message: "Command Tier 3 online. Mk II crates unlocked third-tier tower upgrades." };
    }
    if (nextTier === 4) {
      return { tier: nextTier, message: "Command Tier 4 online. Hot Hands drills cut tower fire timers by 12%." };
    }
    return {
      tier: nextTier,
      message: "Command Tier 5 online. Pressure Read raised all tower damage by 1 and unlocked elite fourth upgrades.",
    };
  }

  getPlacementState(x, y, towerId) {
    const def = TOWER_DEFS[towerId];
    if (!def) {
      return { valid: false, reason: "Unknown tower." };
    }
    if (x < 52 || x > WIDTH - 52 || y < 52 || y > HEIGHT - 52) {
      return { valid: false, reason: "Stay inside field." };
    }
    if (y < this.operation.grassTop + 16) {
      return { valid: false, reason: "Move over grass." };
    }
    if (this.cash < def.cost) {
      return { valid: false, reason: "Not enough cash." };
    }
    if (distanceToPath({ x, y }, this.pathData) < PLACEMENT_MARGIN) {
      return { valid: false, reason: "Too close to track." };
    }
    for (const tower of this.towers) {
      if (Math.hypot(tower.x - x, tower.y - y) < TOWER_SPACING) {
        return { valid: false, reason: "Need more tower spacing." };
      }
    }
    return { valid: true, reason: `${def.name} ready.` };
  }

  update(dt) {
    const speed = this.speedMultipliers[this.speedIndex];
    const scaledDt = dt * speed;
    this.time += scaledDt;
    if (this.mode !== "playing") {
      this.tickEffects(scaledDt);
      return;
    }
    const waves = this.getWaves();
    if (!this.waveActive && this.waveIndex < waves.length) {
      this.intermission = Math.max(0, this.intermission - scaledDt);
      if (this.intermission === 0) {
        this.launchWave();
      }
    }
    this.tickEffects(scaledDt);
    this.spawnBloons(scaledDt);
    this.updateBloons(scaledDt);
    this.updateTowers(scaledDt);
    this.updateProjectiles(scaledDt);
    this.cleanup();
    this.resolveProgress();
  }

  launchWave() {
    const wave = this.getWaves()[this.waveIndex];
    this.wavePlan = expandWaveEntries(wave.entries);
    this.waveCursor = 0;
    this.spawnCooldown = 0;
    this.waveActive = true;
    this.intermission = 0;
    this.status = `Wave ${this.waveIndex + 1} launched: ${wave.label}.`;
    this.queueAudio("wave", { routeIndex: this.operationIndex, intensity: (this.waveIndex + 1) / this.getWaves().length });
    const spawn = this.operation.pathPoints[0];
    this.addScreenFeedback({ shake: 5.5, color: "rgba(255,255,255,0.08)", intensity: 0.08, life: 0.18, radius: 210, x: spawn.x, y: spawn.y });
    this.effects.push({
      kind: "ring",
      x: spawn.x,
      y: spawn.y,
      radius: 22,
      growth: 240,
      lineWidth: 10,
      color: "rgba(255,255,255,0.32)",
      life: 0.45,
      maxLife: 0.45,
    });
    this.effects.push({
      kind: "lanePulse",
      x: spawn.x,
      y: spawn.y,
      radius: 18,
      growth: 320,
      lineWidth: 16,
      color: this.operation.theme.accent,
      life: 0.42,
      maxLife: 0.42,
    });
    this.spawnDriftBurst(spawn.x, spawn.y, "rgba(255,255,255,0.42)", 14, {
      radius: 6,
      speed: 72,
      life: 0.34,
      spread: Math.PI * 1.6,
      startAngle: 0,
      gravity: -8,
    });
    this.addRoutePulseEffects(this.operation.theme.accent, 0.28, 0.34);
  }

  spawnBloons(dt) {
    if (!this.waveActive) {
      return;
    }
    this.spawnCooldown -= dt;
    while (this.waveCursor < this.wavePlan.length && this.spawnCooldown <= 0) {
      const entry = this.wavePlan[this.waveCursor];
      const bloon = this.makeBloon(entry.type);
      this.bloons.push(bloon);
      if (isHeavyBloon(entry.type)) {
        this.queueAudio("heavy", { pan: normalizedPan(bloon.x), bloonType: entry.type, routeIndex: this.operationIndex });
        this.addScreenFeedback({
          shake: entry.type === "marble" ? 7.5 : 4.8,
          color: entry.type === "marble" ? "rgba(255,244,191,0.1)" : "rgba(255,255,255,0.06)",
          intensity: entry.type === "marble" ? 0.12 : 0.07,
          life: 0.16,
          radius: entry.type === "marble" ? 170 : 118,
          x: bloon.x,
          y: bloon.y,
        });
        this.effects.push({
          kind: "trail",
          x: bloon.x,
          y: bloon.y,
          radius: BLOON_TYPES[entry.type].radius * 1.15,
          growth: 74,
          color: "rgba(255,255,255,0.14)",
          life: 0.24,
          maxLife: 0.24,
        });
        this.effects.push({
          kind: "flash",
          x: bloon.x + bloon.dirX * (entry.type === "marble" ? 26 : 18),
          y: bloon.y + bloon.dirY * (entry.type === "marble" ? 26 : 18),
          radius: entry.type === "marble" ? 32 : 24,
          growth: entry.type === "marble" ? 22 : 16,
          color: entry.type === "ember" ? "rgba(255, 182, 122, 0.16)" : "rgba(255,255,255,0.11)",
          life: entry.type === "marble" ? 0.2 : 0.14,
          maxLife: entry.type === "marble" ? 0.2 : 0.14,
        });
        this.spawnDriftBurst(bloon.x, bloon.y, "rgba(255,255,255,0.32)", entry.type === "marble" ? 10 : 6, {
          radius: entry.type === "marble" ? 6 : 4,
          speed: entry.type === "marble" ? 62 : 48,
          life: entry.type === "marble" ? 0.34 : 0.24,
          spread: Math.PI * 0.9,
          startAngle: 0,
        });
        this.effects.push({
          kind: "lanePulse",
          x: bloon.x,
          y: bloon.y,
          radius: BLOON_TYPES[entry.type].radius + 8,
          growth: entry.type === "marble" ? 172 : 128,
          lineWidth: entry.type === "marble" ? 10 : 7,
          color: entry.type === "ember" ? "rgba(255, 165, 102, 0.5)" : this.operation.theme.accent,
          life: entry.type === "marble" ? 0.24 : 0.18,
          maxLife: entry.type === "marble" ? 0.24 : 0.18,
        });
      }
      if (entry.type === "gold") {
        this.effects.push({
          kind: "sparkle",
          x: bloon.x,
          y: bloon.y - 8,
          radius: 9,
          growth: 42,
          color: "rgba(255, 224, 102, 0.82)",
          life: 0.24,
          maxLife: 0.24,
        });
      }
      this.waveCursor += 1;
      this.spawnCooldown += entry.delay;
    }
  }

  updateBloons(dt) {
    for (const bloon of this.bloons) {
      const bloonSpeed = this.getBloonSpeed(bloon);
      bloon.distance += bloonSpeed * dt;
      if (bloon.distance >= this.pathData.totalLength) {
        const def = BLOON_TYPES[bloon.type];
        bloon.dead = true;
        this.lives = Math.max(0, this.lives - def.leak);
        this.status = `${def.id} bloon slipped through.`;
        this.queueAudio("leak", { pan: normalizedPan(bloon.x), severity: def.leak });
        this.addScreenFeedback({
          shake: 9.5,
          color: "rgba(255,96,96,0.18)",
          intensity: 0.18,
          life: 0.22,
          radius: 230,
          x: this.operation.pathPoints[this.operation.pathPoints.length - 1].x,
          y: this.operation.pathPoints[this.operation.pathPoints.length - 1].y,
        });
        this.effects.push({
          kind: "ring",
          x: this.operation.pathPoints[this.operation.pathPoints.length - 1].x,
          y: this.operation.pathPoints[this.operation.pathPoints.length - 1].y,
          radius: 28,
          growth: 170,
          lineWidth: 8,
          color: "rgba(255,255,255,0.3)",
          life: 0.4,
          maxLife: 0.4,
        });
        this.effects.push({
          kind: "shockwave",
          x: this.operation.pathPoints[this.operation.pathPoints.length - 1].x,
          y: this.operation.pathPoints[this.operation.pathPoints.length - 1].y,
          radius: 18,
          growth: 210,
          lineWidth: 10,
          color: "rgba(255, 122, 122, 0.3)",
          life: 0.34,
          maxLife: 0.34,
        });
        this.spawnDriftBurst(
          this.operation.pathPoints[this.operation.pathPoints.length - 1].x,
          this.operation.pathPoints[this.operation.pathPoints.length - 1].y,
          "rgba(255, 132, 132, 0.58)",
          16,
          {
            radius: 6,
            speed: 78,
            life: 0.34,
            spread: Math.PI * 1.5,
            startAngle: Math.PI,
            gravity: 6,
          }
        );
        continue;
      }
      const point = this.pointAtDistance(bloon.distance);
      bloon.x = point.x;
      bloon.y = point.y;
      bloon.dirX = point.dx;
      bloon.dirY = point.dy;
    }
  }

  updateTowers(dt) {
    const globalBuffs = this.getGlobalBuffs();
    for (const tower of this.towers) {
      const def = getTowerStats(tower, globalBuffs, this.commandTier);
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) {
        continue;
      }
      let best = null;
      for (const bloon of this.bloons) {
        if (bloon.dead) {
          continue;
        }
        const dist = Math.hypot(bloon.x - tower.x, bloon.y - tower.y);
        if (dist > def.range) {
          continue;
        }
        if (!best || bloon.distance > best.distance) {
          best = bloon;
        }
      }
      if (!best) {
        continue;
      }
      const estimate = Math.hypot(best.x - tower.x, best.y - tower.y) / def.projectileSpeed;
      const future = this.pointAtDistance(best.distance + this.getBloonSpeed(best) * estimate);
      this.projectiles.push(this.makeProjectile(tower, def, best, future));
      tower.cooldown = def.fireRate;
      this.queueAudio("shot", { towerType: tower.type, pan: normalizedPan(tower.x) });
      this.effects.push({ kind: "ring", x: tower.x, y: tower.y, radius: 10, growth: 62, lineWidth: 3, color: "rgba(255,255,255,0.26)", life: 0.18, maxLife: 0.18 });
      this.effects.push({
        kind: "burst",
        x: tower.x,
        y: tower.y,
        radius: 4,
        growth: 38,
        sparkRadius: 2,
        sparks: this.makeBurstSparks(tower.type === "bomb" ? 8 : 5, def.projectileColor),
        color: def.projectileColor,
        life: 0.14,
        maxLife: 0.14,
      });
      this.spawnDriftBurst(tower.x, tower.y, `${def.projectileColor}aa`, tower.type === "bomb" ? 6 : 4, {
        radius: tower.type === "bomb" ? 3.8 : 2.8,
        speed: tower.type === "bomb" ? 46 : 34,
        life: 0.14,
        spread: Math.PI * 0.8,
        startAngle: Math.atan2(best.y - tower.y, best.x - tower.x),
      });
      if (tower.type === "glue") {
        this.effects.push({
          kind: "trail",
          x: tower.x,
          y: tower.y,
          radius: 12,
          growth: 40,
          color: "rgba(212, 255, 139, 0.18)",
          life: 0.16,
          maxLife: 0.16,
        });
      }
    }
  }

  makeProjectile(tower, towerStats, target, intercept) {
    const dx = intercept.x - tower.x;
    const dy = intercept.y - tower.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * towerStats.projectileSpeed,
      vy: (dy / length) * towerStats.projectileSpeed,
      type: tower.type,
      damage: towerStats.damage,
      splash: towerStats.splash || 0,
      slowFactor: towerStats.slowFactor || 1,
      slowDuration: towerStats.slowDuration || 0,
      radius: towerStats.projectileRadius,
      color: towerStats.projectileColor,
      targetId: target.id,
      cracksArmor: tower.type === "bomb",
      ttl: 2.4,
      trailLife: tower.type === "bomb" ? 0.1 : tower.type === "glue" ? 0.16 : 0.08,
    };
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.ttl -= dt;
      const hit = this.bloons.find(
        (bloon) => !bloon.dead && Math.hypot(bloon.x - projectile.x, bloon.y - projectile.y) <= BLOON_TYPES[bloon.type].radius + projectile.radius
      );
      if (!hit) {
        continue;
      }
      projectile.ttl = 0;
      this.damageBloon(hit, projectile.damage, { x: projectile.x, y: projectile.y, cracksArmor: projectile.cracksArmor });
      if (projectile.splash > 0) {
        this.damageNearby(projectile.x, projectile.y, projectile.splash, projectile.damage, { cracksArmor: projectile.cracksArmor }, hit.id);
        if (projectile.slowDuration > 0) {
          this.applySlowNearby(projectile.x, projectile.y, projectile.splash, projectile.slowFactor, projectile.slowDuration, hit.id);
        }
      }
      if (projectile.slowDuration > 0) {
        this.applySlow(hit, projectile.slowFactor, projectile.slowDuration);
      }
      this.addScreenFeedback({
        shake: projectile.splash > 0 ? 6 : 2.2,
        color: projectile.splash > 0 ? "rgba(255,255,255,0.06)" : "rgba(255,244,191,0.04)",
        intensity: projectile.splash > 0 ? 0.06 : 0.03,
        life: projectile.splash > 0 ? 0.1 : 0.08,
        radius: projectile.splash > 0 ? Math.max(96, projectile.splash * 2.25) : 84,
        x: projectile.x,
        y: projectile.y,
      });
      this.effects.push({
        kind: projectile.splash > 0 ? "shockwave" : "burst",
        x: projectile.x,
        y: projectile.y,
        radius: projectile.splash > 0 ? projectile.splash * 0.6 : 20,
        growth: projectile.splash > 0 ? projectile.splash * 0.65 : 36,
        lineWidth: projectile.splash > 0 ? 5 : 0,
        sparks: projectile.splash > 0 ? null : this.makeBurstSparks(6, projectile.color),
        sparkRadius: 2,
        color: projectile.color,
        life: projectile.splash > 0 ? 0.26 : 0.18,
        maxLife: projectile.splash > 0 ? 0.26 : 0.18,
      });
      if (projectile.splash > 0) {
        this.effects.push({
          kind: "flash",
          x: projectile.x,
          y: projectile.y,
          radius: projectile.splash * 0.55,
          growth: projectile.splash * 0.3,
          color: "rgba(255,255,255,0.18)",
          life: 0.12,
          maxLife: 0.12,
        });
        this.spawnDriftBurst(projectile.x, projectile.y, "rgba(255, 245, 214, 0.5)", 10, {
          radius: 4.6,
          speed: 52,
          life: 0.2,
        });
      } else {
        this.effects.push({
          kind: "ring",
          x: projectile.x,
          y: projectile.y,
          radius: 8,
          growth: 42,
          lineWidth: 2,
          color: projectile.type === "glue" ? "rgba(212,255,139,0.28)" : "rgba(255,255,255,0.22)",
          life: 0.14,
          maxLife: 0.14,
        });
        this.spawnDriftBurst(projectile.x, projectile.y, `${projectile.color}b0`, projectile.type === "glue" ? 6 : 4, {
          radius: projectile.type === "glue" ? 3.4 : 2.8,
          speed: projectile.type === "glue" ? 34 : 28,
          life: 0.16,
          spread: Math.PI * 1.1,
          startAngle: Math.atan2(projectile.vy, projectile.vx),
        });
      }
    }
  }

  damageNearby(x, y, radius, damage, sourceMeta = {}, excludedId = null) {
    for (const bloon of this.bloons) {
      if (bloon.id !== excludedId && !bloon.dead && Math.hypot(bloon.x - x, bloon.y - y) <= radius + BLOON_TYPES[bloon.type].radius) {
        this.damageBloon(bloon, damage, { x, y, ...sourceMeta });
      }
    }
  }

  applySlow(bloon, slowFactor, slowDuration) {
    bloon.slowFactor = Math.min(bloon.slowFactor, slowFactor);
    bloon.slowedUntil = Math.max(bloon.slowedUntil, this.time + slowDuration);
  }

  applySlowNearby(x, y, radius, slowFactor, slowDuration, excludedId = null) {
    for (const bloon of this.bloons) {
      if (bloon.id !== excludedId && !bloon.dead && Math.hypot(bloon.x - x, bloon.y - y) <= radius + BLOON_TYPES[bloon.type].radius) {
        this.applySlow(bloon, slowFactor, slowDuration);
      }
    }
  }

  spawnSplitChildren(parent, splitDef) {
    const centerOffset = (splitDef.count - 1) * 0.5;
    for (let i = 0; i < splitDef.count; i += 1) {
      const offset = (i - centerOffset) * splitDef.spacing;
      const childDistance = clamp(parent.distance + offset, 0, this.pathData.totalLength - 6);
      this.bloons.push(this.makeBloonAtDistance(splitDef.type, childDistance));
    }
  }

  damageBloon(bloon, damage, source) {
    if (bloon.dead) {
      return;
    }
    const def = BLOON_TYPES[bloon.type];
    if (def.armored && !source.cracksArmor) {
      this.status = "Lead shell held. Bomb splash or volatile pops crack it.";
      this.queueAudio("armor", { pan: normalizedPan(bloon.x) });
      this.addScreenFeedback({ shake: 3.5, color: "rgba(214,226,238,0.08)", intensity: 0.08, life: 0.09, radius: 92, x: bloon.x, y: bloon.y });
      this.effects.push({ kind: "ring", x: source.x, y: source.y, radius: def.radius + 6, growth: 34, lineWidth: 4, color: "rgba(220, 226, 232, 0.36)", life: 0.16, maxLife: 0.16 });
      this.effects.push({ kind: "flash", x: bloon.x, y: bloon.y, radius: def.radius + 10, growth: 18, color: "rgba(214, 226, 238, 0.2)", life: 0.1, maxLife: 0.1 });
      return;
    }
    bloon.hp -= damage;
    if (bloon.hp > 0) {
      return;
    }
    bloon.dead = true;
    this.cash += def.reward;
    if (def.bonusCash) {
      this.cash += def.bonusCash;
    }
    this.pops += 1;
    this.queueAudio("pop", {
      pan: normalizedPan(bloon.x),
      pitch: Math.round((def.speed - 56) / 7),
      size: clamp(def.radius / 24, 0.7, 1.18),
      profile: def.volatile ? "volatile" : def.children ? "split" : def.bonusCash ? "cash" : def.hp >= 8 ? "heavy" : "normal",
    });
    this.effects.push({
      kind: "burst",
      x: source.x,
      y: source.y,
      radius: def.radius * 0.45,
      growth: def.radius * 2.6,
      sparkRadius: 3,
      sparks: this.makeBurstSparks(def.children ? 10 : 7, def.color),
      color: def.color,
      life: 0.24,
      maxLife: 0.24,
    });
    this.effects.push({ kind: "ring", x: bloon.x, y: bloon.y, radius: def.radius * 0.65, growth: def.radius * 1.6, lineWidth: 3, color: "rgba(255,255,255,0.35)", life: 0.18, maxLife: 0.18 });
    this.spawnDriftBurst(bloon.x, bloon.y, `${def.color}d9`, def.children ? 10 : 7, {
      radius: Math.max(3.2, def.radius * 0.22),
      speed: 58,
      life: 0.24,
    });
    if (def.hp >= 8 || def.armored || def.volatile) {
      const impactRadius = def.volatile ? def.blastRadius * 0.28 : def.radius * 1.35;
      this.addScreenFeedback({
        shake: def.hp >= 18 ? 7.2 : def.volatile ? 6.2 : 4.4,
        color: def.volatile ? "rgba(255, 184, 120, 0.1)" : "rgba(255,255,255,0.08)",
        intensity: def.hp >= 18 ? 0.11 : 0.08,
        life: def.hp >= 18 ? 0.16 : 0.12,
        radius: def.hp >= 18 ? 154 : def.volatile ? 142 : 110,
        x: bloon.x,
        y: bloon.y,
      });
      this.effects.push({
        kind: "shockwave",
        x: bloon.x,
        y: bloon.y,
        radius: impactRadius,
        growth: def.hp >= 18 ? impactRadius * 1.2 : impactRadius,
        lineWidth: def.hp >= 18 ? 6 : 4,
        color: def.volatile ? "rgba(255, 176, 120, 0.34)" : "rgba(255,255,255,0.24)",
        life: def.hp >= 18 ? 0.26 : 0.18,
        maxLife: def.hp >= 18 ? 0.26 : 0.18,
      });
      this.spawnDriftBurst(bloon.x, bloon.y, def.volatile ? "rgba(255, 186, 134, 0.58)" : "rgba(255,255,255,0.42)", def.hp >= 18 ? 12 : 8, {
        radius: def.hp >= 18 ? 5.4 : 4.2,
        speed: def.hp >= 18 ? 68 : 54,
        life: def.hp >= 18 ? 0.28 : 0.2,
        spread: Math.PI * 1.35,
        gravity: 4,
      });
    }

    const statusParts = [];
    if (def.volatile) {
      statusParts.push("Chain reaction spreading");
      this.queueAudio("blast", { pan: normalizedPan(bloon.x) });
      this.addScreenFeedback({ shake: 8.2, color: "rgba(255,160,80,0.14)", intensity: 0.14, life: 0.16, radius: def.blastRadius * 1.85, x: bloon.x, y: bloon.y });
      this.effects.push({ kind: "ring", x: bloon.x, y: bloon.y, radius: def.blastRadius * 0.34, growth: def.blastRadius * 1.05, lineWidth: 6, color: "rgba(255,160,80,0.4)", life: 0.34, maxLife: 0.34 });
      this.spawnDriftBurst(bloon.x, bloon.y, "rgba(255, 176, 102, 0.7)", 14, {
        radius: 5.2,
        speed: 86,
        life: 0.28,
        gravity: 4,
      });
      this.damageNearby(bloon.x, bloon.y, def.blastRadius, def.blastDamage, { cracksArmor: true });
    }
    if (def.children) {
      statusParts.push("Split pressure still coming");
      this.effects.push({ kind: "ring", x: bloon.x, y: bloon.y, radius: def.radius * 0.9, growth: def.radius * 2.6, lineWidth: 4, color: "rgba(214, 179, 255, 0.36)", life: 0.26, maxLife: 0.26 });
      this.spawnSplitChildren(bloon, def.children);
    }
    if (def.bonusCash) {
      statusParts.push(`Bonus bankroll +$${def.bonusCash}`);
      this.queueAudio("cash", { pan: normalizedPan(bloon.x) });
      this.effects.push({
        kind: "sparkle",
        x: bloon.x,
        y: bloon.y - def.radius * 0.25,
        radius: def.radius * 0.4,
        growth: def.radius * 1.8,
        color: "rgba(255, 232, 130, 0.78)",
        life: 0.28,
        maxLife: 0.28,
      });
      this.spawnDriftBurst(bloon.x, bloon.y, "rgba(255, 228, 130, 0.72)", 8, {
        radius: 3.8,
        speed: 50,
        life: 0.24,
        spread: Math.PI * 1.2,
        startAngle: -Math.PI * 0.5,
        gravity: 6,
      });
    }
    this.status = statusParts.length > 0 ? `${def.id} bloon popped. ${statusParts.join(". ")}.` : `${def.id} bloon popped.`;
  }

  cleanup() {
    this.projectiles = this.projectiles.filter(
      (projectile) => projectile.ttl > 0 && projectile.x > -40 && projectile.x < WIDTH + 40 && projectile.y > -40 && projectile.y < HEIGHT + 40
    );
    this.bloons = this.bloons.filter((bloon) => !bloon.dead);
  }

  resolveProgress() {
    const waves = this.getWaves();
    if (this.lives <= 0 && this.mode === "playing") {
      this.mode = "lose";
      this.status = this.getLoseStatus();
      this.queueAudio("lose");
      return;
    }
    if (this.waveActive && this.waveCursor >= this.wavePlan.length && this.bloons.length === 0) {
      const clearedWaveNumber = this.waveIndex + 1;
      const wave = waves[this.waveIndex];
      this.cash += wave.reward;
      this.status = `Wave ${clearedWaveNumber} cleared. Early payout banked.`;
      this.queueAudio("clear", { routeIndex: this.operationIndex, perfect: this.lives === this.startingLives });
      const exit = this.operation.pathPoints[this.operation.pathPoints.length - 1];
      this.addScreenFeedback({ shake: 4.8, color: "rgba(255,255,255,0.09)", intensity: 0.09, life: 0.14, x: exit.x, y: exit.y });
      this.effects.push({
        kind: "ring",
        x: exit.x,
        y: exit.y,
        radius: 20,
        growth: 210,
        lineWidth: 8,
        color: "rgba(255,255,255,0.28)",
        life: 0.34,
        maxLife: 0.34,
      });
      this.effects.push({
        kind: "lanePulse",
        x: exit.x,
        y: exit.y,
        radius: 14,
        growth: 200,
        lineWidth: 12,
        color: this.operation.theme.accent,
        life: 0.3,
        maxLife: 0.3,
      });
      this.spawnDriftBurst(exit.x, exit.y, "rgba(255,255,255,0.36)", 12, {
        radius: 5.4,
        speed: 68,
        life: 0.28,
        spread: Math.PI * 1.35,
        startAngle: Math.PI,
        gravity: 4,
      });
      this.addRoutePulseEffects("rgba(255,255,255,0.42)", 0.22, 0.26);
      const commandUpdate = this.awardCommandTier(clearedWaveNumber);
      this.waveIndex += 1;
      this.waveActive = false;
      this.wavePlan = [];
      this.intermission = this.operation.intermissionTime;
      if (this.waveIndex >= waves.length) {
        this.mode = "win";
        this.status = this.operation.victory;
        this.queueAudio("win");
        this.addScreenFeedback({ shake: 6.5, color: "rgba(140,233,154,0.15)", intensity: 0.14, life: 0.22, x: exit.x, y: exit.y });
        return;
      }
      if (commandUpdate) {
        this.status = commandUpdate.message;
        this.queueAudio("tier", { tier: commandUpdate.tier, routeIndex: this.operationIndex });
      }
    }
  }

  tickEffects(dt) {
    for (const effect of this.effects) {
      if (effect.delay && effect.delay > 0) {
        effect.delay -= dt;
        continue;
      }
      effect.life -= dt;
      effect.radius += (effect.growth || 0) * dt;
      effect.x += (effect.vx || 0) * dt;
      effect.y += (effect.vy || 0) * dt;
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);
    this.screenShake = Math.max(0, this.screenShake - dt * 18);
    if (this.screenPulse) {
      this.screenPulse.life -= dt;
      if (this.screenPulse.life <= 0) {
        this.screenPulse = null;
      }
    }
  }

  addRoutePulseEffects(color, life = 0.26, delayStep = 0.04) {
    for (let index = 1; index < this.operation.pathPoints.length - 1; index += 1) {
      const point = this.operation.pathPoints[index];
      this.effects.push({
        kind: "lanePulse",
        x: point.x,
        y: point.y,
        radius: 12 + index * 0.8,
        growth: 122 + index * 10,
        lineWidth: 8,
        color,
        life,
        maxLife: life,
        delay: index * delayStep,
      });
    }
  }

  getBloonSpeed(bloon) {
    const def = BLOON_TYPES[bloon.type];
    const slowMultiplier = this.time < bloon.slowedUntil ? bloon.slowFactor : 1;
    return def.speed * slowMultiplier;
  }

  getFrameState() {
    const globalBuffs = this.getGlobalBuffs();
    const waves = this.getWaves();
    const threatMetrics = this.getThreatMetrics();
    const selectedPlacedTower = this.towers.find((tower) => tower.id === this.selectedPlacedTowerId) || null;
    const selectedPlacedTowerStats = selectedPlacedTower ? getTowerStats(selectedPlacedTower, globalBuffs, this.commandTier) : null;
    const nextWave = waves[this.waveIndex] || null;
    const waveActive = this.mode === "playing" && this.waveActive;
    const waveIntel = this.mode === "lose"
      ? { ...this.getWaveIntel(), threat: this.getLoseOverlayCopy() }
      : this.getWaveIntel();
    const selectedTower = this.getSelectedTowerDef();
    return {
      time: this.time,
      mode: this.mode,
      cash: this.cash,
      lives: Math.max(0, this.lives),
      startingLives: this.startingLives,
      waveNumber: Math.min(this.waveIndex + 1, waves.length),
      waveTotal: waves.length,
      pops: this.pops,
      commandTier: this.commandTier,
      commandSummary: this.getCommandSummary(),
      nextWaveLabel: nextWave?.label || "All Clear",
      waveActive,
      intermission: this.intermission,
      waveIntel,
      threatMetrics,
      nextCommandUnlock: this.getNextCommandUnlock(),
      towers: this.towers.map((tower) => ({ ...tower, ...getTowerStats(tower, globalBuffs, this.commandTier), isSelected: tower.id === this.selectedPlacedTowerId })),
      bloons: this.bloons.map((bloon) => ({ ...bloon, ...BLOON_TYPES[bloon.type], time: this.time })),
      projectiles: this.projectiles.map((projectile) => ({ ...projectile })),
      effects: this.effects.map((effect) => ({ ...effect })),
      pathPoints: this.operation.pathPoints.map((point) => ({ ...point })),
      starterPads: this.shouldShowStarterPads() ? this.getVisibleStarterPads().map((pad) => ({ ...pad })) : [],
      selectedTowerId: selectedTower.id,
      selectedPlacedTowerId: this.selectedPlacedTowerId,
      preview: { ...this.preview, range: getTowerStats({ type: selectedTower.id, level: 1 }, globalBuffs, this.commandTier).range },
      speedLabel: `${this.speedMultipliers[this.speedIndex]}x`,
      liveHintPrimary: this.getLiveHintPrimary(),
      status: this.status,
      nextWaveReady: this.mode === "playing" && !this.waveActive && this.waveIndex < waves.length,
      towerDefs: Object.values(TOWER_DEFS).map((tower) => ({ ...tower })),
      selectedPlacedTower: selectedPlacedTower
        ? {
            id: selectedPlacedTower.id,
            x: selectedPlacedTower.x,
            y: selectedPlacedTower.y,
            nextUpgradeSummary: summarizeUpgrade(TOWER_DEFS[selectedPlacedTower.type].upgrades?.[selectedPlacedTower.level - 1]),
            ...selectedPlacedTowerStats,
          }
        : null,
      theme: { ...this.operation.theme, grassTop: this.operation.grassTop },
      overlay: this.getOverlay(),
      screenShake: this.screenShake,
      screenPulse: this.screenPulse ? { ...this.screenPulse } : null,
    };
  }

  getOverlay() {
    if (this.mode === "menu") {
      return {
        eyebrow: this.operation.label.toLowerCase(),
        title: this.operation.name,
        copy: this.operation.flavor,
        hint: "Press Enter or click Start Operation. Green pads mark safe first towers. Use 1 2 3 to arm towers, N to launch, U to upgrade, and F to cycle 1x 2x 3x speed.",
        button: "Start Operation",
      };
    }
    if (this.mode === "win") {
      return {
        eyebrow: "route clear",
        title: this.operation.name,
        copy: this.operation.victory,
        hint: "Press Enter or click Replay Operation to rerun this route or pick another unlocked operation.",
        button: "Replay Operation",
      };
    }
    if (this.mode === "lose") {
      return {
        eyebrow: "breach",
        title: this.operation.name,
        copy: this.getLoseOverlayCopy(),
        hint: "Press Enter or click Retry Operation to restart immediately. Use 1 2 3 to rebuild, tap F to change pace, then N to relaunch.",
        button: "Retry Operation",
      };
    }
    return null;
  }
}
