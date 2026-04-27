const DEFAULT_BASE_STATS = Object.freeze({
  health: 120,
  stamina: 90,
  strength: 12,
  agility: 10,
  defense: 8,
});

const DEFAULT_FIGHTER = Object.freeze({
  id: "player",
  name: "Arena Bound",
  level: 1,
  experience: 0,
  gold: 90,
  wins: 0,
  status: "READY",
  tiredTurns: 0,
  crowdFavor: 0,
  favor: 0,
  buffs: [],
  inventory: { owned: [], equipped: {} },
  equipment: {},
  equipmentBonuses: {},
  baseStats: DEFAULT_BASE_STATS,
  portrait: "./assets/gladiators/player.png",
  health: DEFAULT_BASE_STATS.health,
  maxHealth: DEFAULT_BASE_STATS.health,
  stamina: DEFAULT_BASE_STATS.stamina,
  maxStamina: DEFAULT_BASE_STATS.stamina,
  strength: DEFAULT_BASE_STATS.strength,
  agility: DEFAULT_BASE_STATS.agility,
  defense: DEFAULT_BASE_STATS.defense,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cloneBuff(buff = {}) {
  return {
    name: buff.name ?? "effect",
    turns: normalizeNumber(buff.turns, 0),
    damageMultiplier: normalizeNumber(buff.damageMultiplier, 1),
  };
}

function cloneInventory(inventory = {}) {
  return {
    owned: Array.isArray(inventory.owned) ? [...inventory.owned] : [],
    equipped: { ...(inventory.equipped ?? {}) },
  };
}

function cloneBaseStats(baseStats = {}) {
  return {
    health: normalizeNumber(baseStats.health, DEFAULT_BASE_STATS.health),
    stamina: normalizeNumber(baseStats.stamina, DEFAULT_BASE_STATS.stamina),
    strength: normalizeNumber(baseStats.strength, DEFAULT_BASE_STATS.strength),
    agility: normalizeNumber(baseStats.agility, DEFAULT_BASE_STATS.agility),
    defense: normalizeNumber(baseStats.defense, DEFAULT_BASE_STATS.defense),
  };
}

function cloneBonuses(bonuses = {}) {
  return {
    healthBonus: normalizeNumber(bonuses.healthBonus, 0),
    staminaBonus: normalizeNumber(bonuses.staminaBonus, 0),
    strengthBonus: normalizeNumber(bonuses.strengthBonus, 0),
    agilityBonus: normalizeNumber(bonuses.agilityBonus, 0),
    defenseBonus: normalizeNumber(bonuses.defenseBonus, 0),
    favorBonus: normalizeNumber(bonuses.favorBonus, 0),
  };
}

function deriveStats(fighter = {}) {
  const baseStats = cloneBaseStats(fighter.baseStats);
  const bonuses = cloneBonuses(fighter.equipmentBonuses);
  const maxHealth = baseStats.health + bonuses.healthBonus;
  const maxStamina = baseStats.stamina + bonuses.staminaBonus;
  const strength = baseStats.strength + bonuses.strengthBonus;
  const agility = baseStats.agility + bonuses.agilityBonus;
  const defense = baseStats.defense + bonuses.defenseBonus;
  const crowdFavor = clamp(normalizeNumber(fighter.crowdFavor ?? fighter.favor, DEFAULT_FIGHTER.crowdFavor), 0, 999);

  return {
    ...fighter,
    baseStats,
    equipmentBonuses: bonuses,
    maxHealth,
    maxStamina,
    strength,
    agility,
    defense,
    crowdFavor,
    favor: crowdFavor,
    favorBonus: bonuses.favorBonus,
    health: clamp(normalizeNumber(fighter.health, maxHealth), 0, maxHealth),
    stamina: clamp(normalizeNumber(fighter.stamina, maxStamina), 0, maxStamina),
  };
}

function mergeModifiers(modifiers = {}) {
  if (Array.isArray(modifiers)) {
    return modifiers.reduce((totals, entry) => mergeModifiersInto(totals, entry), cloneBonuses({}));
  }
  return mergeModifiersInto(cloneBonuses({}), modifiers);
}

function mergeModifiersInto(target, modifiers = {}) {
  const next = cloneBonuses(target);
  next.healthBonus += normalizeNumber(modifiers.healthBonus, 0);
  next.staminaBonus += normalizeNumber(modifiers.staminaBonus, 0);
  next.strengthBonus += normalizeNumber(modifiers.strengthBonus ?? modifiers.attackBonus, 0);
  next.agilityBonus += normalizeNumber(modifiers.agilityBonus, 0);
  next.defenseBonus += normalizeNumber(modifiers.defenseBonus ?? modifiers.blockBonus, 0);
  next.favorBonus += normalizeNumber(modifiers.favorBonus ?? modifiers.crowdBonus, 0);
  return next;
}

export function cloneFighterState(fighter = {}) {
  const snapshot = {
    ...structuredClone(DEFAULT_FIGHTER),
    ...structuredClone(fighter),
  };

  snapshot.buffs = Array.isArray(fighter.buffs) ? fighter.buffs.map(cloneBuff) : [];
  snapshot.inventory = cloneInventory(fighter.inventory);
  snapshot.equipment = { ...(fighter.equipment ?? {}) };
  snapshot.baseStats = cloneBaseStats(fighter.baseStats ?? DEFAULT_BASE_STATS);
  snapshot.equipmentBonuses = cloneBonuses(fighter.equipmentBonuses);
  snapshot.level = normalizeNumber(fighter.level, DEFAULT_FIGHTER.level);
  snapshot.experience = normalizeNumber(fighter.experience, DEFAULT_FIGHTER.experience);
  snapshot.gold = normalizeNumber(fighter.gold, DEFAULT_FIGHTER.gold);
  snapshot.wins = normalizeNumber(fighter.wins, DEFAULT_FIGHTER.wins);
  snapshot.tiredTurns = normalizeNumber(fighter.tiredTurns, 0);
  snapshot.status = fighter.status ?? DEFAULT_FIGHTER.status;
  return deriveStats(snapshot);
}

export function applyEquipmentModifiers(fighter = {}, equipment = {}) {
  const next = cloneFighterState(fighter);
  next.equipmentBonuses = mergeModifiers(equipment);
  return deriveStats(next);
}

export function applyTraining(fighter = {}, trainingId) {
  const next = cloneFighterState(fighter);

  if (trainingId === "strength") {
    next.baseStats.strength += 2;
    next.baseStats.defense += 1;
  }

  if (trainingId === "agility") {
    next.baseStats.agility += 2;
    next.baseStats.defense += 1;
  }

  if (trainingId === "stamina") {
    next.baseStats.stamina += 10;
    next.stamina += 10;
  }

  if (trainingId === "showmanship") {
    next.baseStats.agility += 1;
    next.crowdFavor += 4;
  }

  next.experience += 10;
  while (next.experience >= next.level * 30) {
    next.experience -= next.level * 30;
    next.level += 1;
    next.baseStats.health += 6;
    next.baseStats.stamina += 4;
    next.baseStats.strength += 1;
    next.baseStats.agility += 1;
    next.baseStats.defense += 1;
  }

  return deriveStats(next);
}

export function createGladiator(config = {}) {
  return cloneFighterState(config);
}

export class CharacterSheet {
  constructor(state = DEFAULT_FIGHTER) {
    this.state = cloneFighterState(state);
  }

  setState(nextState = {}) {
    this.state = cloneFighterState(nextState);
    return this.getSnapshot();
  }

  getSnapshot() {
    return cloneFighterState(this.state);
  }

  applyInventory(equipmentBonuses = {}) {
    this.state = applyEquipmentModifiers(this.state, equipmentBonuses);
    return this.getSnapshot();
  }

  applyCombatSnapshot(snapshot = {}) {
    this.state = cloneFighterState({ ...this.state, ...snapshot });
    return this.getSnapshot();
  }

  train(stat) {
    this.state = applyTraining(this.state, stat);
    return this.getSnapshot();
  }
}
