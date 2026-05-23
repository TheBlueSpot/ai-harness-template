const STORAGE_KEY = "toss-atomic-upgrades-v1";
const STORAGE_PREFIX = "toss-atomic";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const safeLocalStorage = () => {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    const key = `${STORAGE_PREFIX}-probe`;
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return localStorage;
  } catch {
    return null;
  }
};

const tuneEntry = (id, label, summary, effectText, baseCost, maxLevel, apply) => ({
  id,
  label,
  summary,
  effectText,
  baseCost,
  maxLevel,
  getCost(level) {
    return Math.round(baseCost * (1 + level * 0.58 + level * level * 0.12));
  },
  apply,
});

export const UPGRADE_DEFS = Object.freeze([
  tuneEntry(
    "launch_power",
    "Launch Power",
    "Stronger first toss and higher opening speed.",
    "Boosts launch impulse, launch speed, and climb window.",
    80,
    5,
    (tuning, level) => {
      const factor = 1 + level * 0.14;
      tuning.launchImpulse *= factor;
      tuning.launchSpeed *= factor;
      tuning.launchHold *= 1 + level * 0.05;
      tuning.launchAngleSpread *= 1 - level * 0.045;
    }
  ),
  tuneEntry(
    "midair_control",
    "Midair Control",
    "More steering authority while airborne.",
    "Raises control force and air response, with a little extra reserve.",
    95,
    5,
    (tuning, level) => {
      tuning.controlForce *= 1 + level * 0.18;
      tuning.controlResponse *= 1 + level * 0.14;
      tuning.controlFuel *= 1 + level * 0.08;
    }
  ),
  tuneEntry(
    "lift_foils",
    "Lift Foils",
    "Holds altitude longer on shallow angles.",
    "Cuts drag and improves low-speed hang time.",
    110,
    5,
    (tuning, level) => {
      tuning.airDrag *= 1 - level * 0.07;
      tuning.lift *= 1 + level * 0.1;
      tuning.glide *= 1 + level * 0.06;
    }
  ),
  tuneEntry(
    "bounce_springs",
    "Bounce Springs",
    "Turns hard landings into bigger rebounds.",
    "Increases restitution, rebound energy, and surface carry.",
    120,
    5,
    (tuning, level) => {
      tuning.bounceRestitution = clamp(tuning.bounceRestitution + level * 0.065, 0.2, 0.95);
      tuning.bounceEnergy *= 1 + level * 0.12;
      tuning.surfaceCarry *= 1 + level * 0.08;
    }
  ),
  tuneEntry(
    "shock_absorbers",
    "Shock Absorbers",
    "Softens bad terrain and hazard hits.",
    "Reduces damage from hazard contact and improves survival on rough landings.",
    135,
    5,
    (tuning, level) => {
      tuning.impactArmor *= 1 + level * 0.17;
      tuning.hazardBounce *= 1 + level * 0.1;
      tuning.hazardDamage *= 1 - level * 0.09;
    }
  ),
  tuneEntry(
    "bomb_skids",
    "Bomb Skids",
    "Deflects explosive hits into safer exits.",
    "Improves bomb rebound, spin damping, and launch recovery after impact.",
    150,
    5,
    (tuning, level) => {
      tuning.bombBounce *= 1 + level * 0.12;
      tuning.spinDamping *= 1 + level * 0.1;
      tuning.recovery *= 1 + level * 0.08;
    }
  ),
]);

const DEFAULT_LEVELS = Object.freeze(
  Object.fromEntries(UPGRADE_DEFS.map((entry) => [entry.id, 0]))
);

const cloneLevels = (levels = {}) => {
  const out = {};
  for (const entry of UPGRADE_DEFS) {
    const value = Number(levels[entry.id] ?? 0);
    out[entry.id] = clamp(Math.floor(value), 0, entry.maxLevel);
  }
  return out;
};

const buildEmptyState = () => ({
  coins: 0,
  totalEarned: 0,
  totalSpent: 0,
  best: {
    distance: 0,
    airtime: 0,
    bounces: 0,
    score: 0,
  },
  levels: { ...DEFAULT_LEVELS },
});

const mergeRunStats = (stats = {}) => ({
  distance: Number(stats.distance ?? stats.totalDistance ?? 0),
  airtime: Number(stats.airtime ?? stats.airTime ?? 0),
  bounces: Number(stats.bounces ?? stats.bounceCount ?? 0),
  score: Number(stats.score ?? 0),
  combo: Number(stats.combo ?? stats.comboPeak ?? 0),
});

export class UpgradeStore {
  constructor(options = {}) {
    const {
      storageKey = STORAGE_KEY,
      storage = safeLocalStorage(),
      initialCoins = 0,
      initialLevels = null,
    } = options;

    this.storageKey = storageKey;
    this.storage = storage;
    this.listeners = new Set();
    this.state = buildEmptyState();
    this.state.coins = Math.max(0, Math.floor(initialCoins));

    if (initialLevels) {
      this.state.levels = cloneLevels(initialLevels);
    } else {
      this.load();
    }
  }

  onChange(listener) {
    if (typeof listener === "function") {
      this.listeners.add(listener);
    }
    return () => this.listeners.delete(listener);
  }

  emitChange() {
    for (const listener of this.listeners) {
      listener(this.getSnapshot());
    }
  }

  createSnapshot() {
    return {
      coins: this.state.coins,
      totalEarned: this.state.totalEarned,
      totalSpent: this.state.totalSpent,
      best: { ...this.state.best },
      levels: { ...this.state.levels },
      tuning: this.getTuning(),
    };
  }

  getSnapshot() {
    return this.createSnapshot();
  }

  save() {
    if (!this.storage) {
      return false;
    }

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    if (!this.storage) {
      return false;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        return false;
      }

      const parsed = JSON.parse(raw);
      this.state.coins = Math.max(0, Math.floor(Number(parsed.coins ?? 0)));
      this.state.totalEarned = Math.max(0, Math.floor(Number(parsed.totalEarned ?? 0)));
      this.state.totalSpent = Math.max(0, Math.floor(Number(parsed.totalSpent ?? 0)));
      this.state.best = {
        distance: Math.max(0, Number(parsed.best?.distance ?? 0)),
        airtime: Math.max(0, Number(parsed.best?.airtime ?? 0)),
        bounces: Math.max(0, Number(parsed.best?.bounces ?? 0)),
        score: Math.max(0, Number(parsed.best?.score ?? 0)),
      };
      this.state.levels = cloneLevels(parsed.levels);
      return true;
    } catch {
      return false;
    }
  }

  reset({ keepCoins = false } = {}) {
    const coins = keepCoins ? this.state.coins : 0;
    this.state = buildEmptyState();
    this.state.coins = coins;
    this.save();
    this.emitChange();
    return this.getSnapshot();
  }

  setCoins(amount) {
    this.state.coins = Math.max(0, Math.floor(amount));
    this.save();
    this.emitChange();
    return this.state.coins;
  }

  addCoins(amount) {
    const delta = Math.floor(amount);
    if (!Number.isFinite(delta) || delta === 0) {
      return this.state.coins;
    }

    this.state.coins = Math.max(0, this.state.coins + delta);
    if (delta > 0) {
      this.state.totalEarned += delta;
    }
    if (delta < 0) {
      this.state.totalSpent += Math.abs(delta);
    }
    this.save();
    this.emitChange();
    return this.state.coins;
  }

  getDefinition(id) {
    return UPGRADE_DEFS.find((entry) => entry.id === id) ?? null;
  }

  getLevel(id) {
    return Math.max(0, Math.floor(Number(this.state.levels[id] ?? 0)));
  }

  getMaxLevel(id) {
    return this.getDefinition(id)?.maxLevel ?? 0;
  }

  getUpgradeCost(id) {
    const definition = this.getDefinition(id);
    if (!definition) {
      return Infinity;
    }
    return definition.getCost(this.getLevel(id));
  }

  canAfford(id) {
    return this.state.coins >= this.getUpgradeCost(id);
  }

  buy(id) {
    const definition = this.getDefinition(id);
    if (!definition) {
      return { ok: false, reason: "unknown-upgrade" };
    }

    const level = this.getLevel(id);
    if (level >= definition.maxLevel) {
      return { ok: false, reason: "max-level" };
    }

    const cost = definition.getCost(level);
    if (this.state.coins < cost) {
      return { ok: false, reason: "insufficient-funds", cost };
    }

    this.state.coins -= cost;
    this.state.totalSpent += cost;
    this.state.levels[id] = level + 1;
    this.save();
    this.emitChange();
    return {
      ok: true,
      cost,
      level: this.state.levels[id],
      snapshot: this.getSnapshot(),
    };
  }

  purchase(id) {
    return this.buy(id);
  }

  awardRun(stats = {}) {
    const run = mergeRunStats(stats);
    const distanceReward = Math.round(run.distance / 95);
    const airtimeReward = Math.round(run.airtime * 5);
    const bounceReward = run.bounces * 8;
    const scoreReward = Math.round(run.score / 200);
    const comboReward = run.combo * 12;
    const reward = Math.max(0, distanceReward + airtimeReward + bounceReward + scoreReward + comboReward);

    this.state.coins += reward;
    this.state.totalEarned += reward;
    this.state.best.distance = Math.max(this.state.best.distance, run.distance);
    this.state.best.airtime = Math.max(this.state.best.airtime, run.airtime);
    this.state.best.bounces = Math.max(this.state.best.bounces, run.bounces);
    this.state.best.score = Math.max(this.state.best.score, run.score);
    this.save();
    this.emitChange();

    return {
      reward,
      best: { ...this.state.best },
      snapshot: this.getSnapshot(),
    };
  }

  recordRun(stats = {}) {
    return this.awardRun(stats);
  }

  updateBest(stats = {}) {
    const run = mergeRunStats(stats);
    this.state.best.distance = Math.max(this.state.best.distance, run.distance);
    this.state.best.airtime = Math.max(this.state.best.airtime, run.airtime);
    this.state.best.bounces = Math.max(this.state.best.bounces, run.bounces);
    this.state.best.score = Math.max(this.state.best.score, run.score);
    this.save();
    this.emitChange();
    return { ...this.state.best };
  }

  getTuning(base = {}) {
    const tuning = {
      launchImpulse: Number(base.launchImpulse ?? base.launchPower ?? 1),
      launchSpeed: Number(base.launchSpeed ?? 1),
      launchHold: Number(base.launchHold ?? 1),
      launchAngleSpread: Number(base.launchAngleSpread ?? 1),
      controlForce: Number(base.controlForce ?? base.airControl ?? 1),
      controlResponse: Number(base.controlResponse ?? 1),
      controlFuel: Number(base.controlFuel ?? 1),
      airDrag: Number(base.airDrag ?? 1),
      lift: Number(base.lift ?? 1),
      glide: Number(base.glide ?? 1),
      bounceRestitution: Number(base.bounceRestitution ?? 0.72),
      bounceEnergy: Number(base.bounceEnergy ?? 1),
      surfaceCarry: Number(base.surfaceCarry ?? 1),
      impactArmor: Number(base.impactArmor ?? 1),
      hazardBounce: Number(base.hazardBounce ?? 1),
      hazardDamage: Number(base.hazardDamage ?? 1),
      bombBounce: Number(base.bombBounce ?? 1),
      spinDamping: Number(base.spinDamping ?? 1),
      recovery: Number(base.recovery ?? 1),
    };

    for (const definition of UPGRADE_DEFS) {
      const level = this.getLevel(definition.id);
      if (level > 0) {
        definition.apply(tuning, level);
      }
    }

    tuning.bounceRestitution = clamp(tuning.bounceRestitution, 0.2, 0.95);
    tuning.airDrag = clamp(tuning.airDrag, 0.45, 1.25);
    tuning.controlForce = clamp(tuning.controlForce, 0.6, 2.2);
    tuning.controlResponse = clamp(tuning.controlResponse, 0.6, 2.2);
    tuning.launchImpulse = clamp(tuning.launchImpulse, 0.7, 2.5);
    tuning.launchSpeed = clamp(tuning.launchSpeed, 0.7, 2.5);
    tuning.launchHold = clamp(tuning.launchHold, 0.7, 2.5);
    tuning.launchAngleSpread = clamp(tuning.launchAngleSpread, 0.45, 1.4);
    tuning.bounceEnergy = clamp(tuning.bounceEnergy, 0.45, 2.5);
    tuning.surfaceCarry = clamp(tuning.surfaceCarry, 0.45, 2.5);
    tuning.impactArmor = clamp(tuning.impactArmor, 0.45, 2.5);
    tuning.hazardBounce = clamp(tuning.hazardBounce, 0.45, 2.5);
    tuning.hazardDamage = clamp(tuning.hazardDamage, 0.35, 1.2);
    tuning.bombBounce = clamp(tuning.bombBounce, 0.45, 2.5);
    tuning.spinDamping = clamp(tuning.spinDamping, 0.45, 2.5);
    tuning.recovery = clamp(tuning.recovery, 0.45, 2.5);

    return {
      ...tuning,
      launchPower: round(tuning.launchImpulse, 3),
      launchImpulseScale: round(tuning.launchImpulse, 3),
      launchSpeedScale: round(tuning.launchSpeed, 3),
      launchAngleSpread: round(tuning.launchAngleSpread, 3),
      launchHoldScale: round(tuning.launchHold, 3),
      controlForce: round(tuning.controlForce, 3),
      midairControl: round(tuning.controlForce, 3),
      controlResponse: round(tuning.controlResponse, 3),
      controlFuel: round(tuning.controlFuel, 3),
      airDrag: round(tuning.airDrag, 3),
      lift: round(tuning.lift, 3),
      glide: round(tuning.glide, 3),
      bounceRestitution: round(tuning.bounceRestitution, 3),
      bounceEnergy: round(tuning.bounceEnergy, 3),
      surfaceCarry: round(tuning.surfaceCarry, 3),
      impactArmor: round(tuning.impactArmor, 3),
      hazardBounce: round(tuning.hazardBounce, 3),
      hazardDamage: round(tuning.hazardDamage, 3),
      bombBounce: round(tuning.bombBounce, 3),
      spinDamping: round(tuning.spinDamping, 3),
      recovery: round(tuning.recovery, 3),
    };
  }

  getLaunchTuning(base = {}) {
    return this.getTuning(base);
  }

  getControlTuning(base = {}) {
    return this.getTuning(base);
  }

  getBounceTuning(base = {}) {
    return this.getTuning(base);
  }

  getPhysicsProfile(base = {}) {
    return this.getTuning(base);
  }

  getLaunchProfile(base = {}) {
    return this.getTuning(base);
  }

  getModifiers(base = {}) {
    return this.getTuning(base);
  }

  applyTo(base = {}) {
    return { ...base, ...this.getTuning(base) };
  }

  applyToTarget(target = {}) {
    const tuning = this.getTuning(target);
    if (target && typeof target === "object") {
      Object.assign(target, tuning);
    }
    return tuning;
  }

  getUpgradeState() {
    return this.getSnapshot();
  }

  getShopEntries() {
    return UPGRADE_DEFS.map((definition) => {
      const level = this.getLevel(definition.id);
      const cost = definition.getCost(level);
      const nextLevel = Math.min(definition.maxLevel, level + 1);
      return {
        id: definition.id,
        label: definition.label,
        summary: definition.summary,
        effectText: definition.effectText,
        level,
        maxLevel: definition.maxLevel,
        cost: level >= definition.maxLevel ? null : cost,
        nextLevel,
        affordable: level < definition.maxLevel && this.state.coins >= cost,
      };
    });
  }

  describe(id) {
    const definition = this.getDefinition(id);
    if (!definition) {
      return null;
    }
    const level = this.getLevel(id);
    return {
      id,
      label: definition.label,
      summary: definition.summary,
      effectText: definition.effectText,
      level,
      maxLevel: definition.maxLevel,
      cost: level >= definition.maxLevel ? null : definition.getCost(level),
    };
  }

  toJSON() {
    return this.getSnapshot();
  }

  fromJSON(data = {}) {
    this.state.coins = Math.max(0, Math.floor(Number(data.coins ?? 0)));
    this.state.totalEarned = Math.max(0, Math.floor(Number(data.totalEarned ?? 0)));
    this.state.totalSpent = Math.max(0, Math.floor(Number(data.totalSpent ?? 0)));
    this.state.best = {
      distance: Math.max(0, Number(data.best?.distance ?? 0)),
      airtime: Math.max(0, Number(data.best?.airtime ?? 0)),
      bounces: Math.max(0, Number(data.best?.bounces ?? 0)),
      score: Math.max(0, Number(data.best?.score ?? 0)),
    };
    this.state.levels = cloneLevels(data.levels);
    this.save();
    this.emitChange();
    return this.getSnapshot();
  }
}

export default UpgradeStore;
