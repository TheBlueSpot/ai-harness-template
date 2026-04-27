import { cloneFighterState, createGladiator } from "./CharacterSheet.js";

const FAVOR_THRESHOLD = 20;
const FAVOR_BUFF = Object.freeze({
  name: "crowd-boost",
  turns: 3,
  damageMultiplier: 1.2,
});

const DEFAULT_ENEMY = Object.freeze({
  id: "enemy",
  name: "Cassian the Red",
  portrait: "./assets/gladiators/enemy.png",
  baseStats: {
    health: 112,
    stamina: 92,
    strength: 11,
    agility: 9,
    defense: 9,
  },
  gold: 0,
  crowdFavor: 8,
  favor: 8,
  status: "READY",
});

const ACTIONS = Object.freeze({
  swing: {
    id: "swing",
    label: "Swing",
    staminaCost: 12,
    baseDamage: 16,
    attackWeight: 1.1,
    critChance: 0.12,
    favorGain: 2,
  },
  jab: {
    id: "jab",
    label: "Jab",
    staminaCost: 8,
    baseDamage: 10,
    attackWeight: 1.3,
    critChance: 0.22,
    favorGain: 1.5,
  },
  block: {
    id: "block",
    label: "Block",
    staminaCost: 6,
    guardHits: 1,
    favorGain: 0,
  },
  taunt: {
    id: "taunt",
    label: "Taunt",
    staminaCost: 9,
    favorGain: 10,
    targetFavorLoss: 4,
  },
  powerAttack: {
    id: "powerAttack",
    label: "Power Attack",
    staminaCost: 18,
    baseDamage: 23,
    attackWeight: 0.95,
    critChance: 0.18,
    favorGain: 3,
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeAction(action) {
  if (action === "power") return "powerAttack";
  return ACTIONS[action] ? action : "swing";
}

function cloneBuffs(buffs = []) {
  return Array.isArray(buffs) ? buffs.map((buff) => ({ ...buff })) : [];
}

function getCrowdBuff(fighter = {}) {
  return cloneBuffs(fighter.buffs).find((buff) => buff.name === FAVOR_BUFF.name && buff.turns > 0) ?? null;
}

function applyFavorDelta(fighter, delta) {
  fighter.crowdFavor = round(clamp((fighter.crowdFavor ?? fighter.favor ?? 0) + delta, 0, 999), 1);
  fighter.favor = fighter.crowdFavor;
}

function decrementBuffTurns(fighter) {
  fighter.buffs = cloneBuffs(fighter.buffs)
    .map((buff) => ({ ...buff, turns: Math.max(0, (buff.turns ?? 0) - 1) }))
    .filter((buff) => buff.turns > 0);
}

function activateCrowdBuffIfReady(fighter, entries) {
  const currentFavor = fighter.crowdFavor ?? fighter.favor ?? 0;
  if (currentFavor < FAVOR_THRESHOLD) return false;
  if (getCrowdBuff(fighter)) return false;

  applyFavorDelta(fighter, -FAVOR_THRESHOLD);
  fighter.buffs = [...cloneBuffs(fighter.buffs), { ...FAVOR_BUFF }];
  entries.push({ text: `${fighter.name} wins the crowd and gains +20% damage for 3 turns.` });
  return true;
}

function damageMultiplier(fighter) {
  const buff = getCrowdBuff(fighter);
  return buff?.damageMultiplier ?? 1;
}

function passiveFavorGain(fighter) {
  const bonus = Number(fighter?.favorBonus ?? fighter?.equipmentBonuses?.favorBonus ?? 0);
  return round(bonus * 0.4, 1);
}

function consumeTiredTurn(fighter, entries) {
  if ((fighter.tiredTurns ?? 0) <= 0) return false;
  fighter.tiredTurns -= 1;
  fighter.status = fighter.tiredTurns > 0 ? "TIRED" : "READY";
  entries.push({ text: `${fighter.name} is TIRED and spends the turn recovering.` });
  return true;
}

function applyGuardReduction(target, incomingDamage, entries) {
  if ((target.guardHits ?? 0) <= 0) return incomingDamage;
  target.guardHits -= 1;
  const reduced = Math.max(1, Math.round(incomingDamage * 0.45));
  entries.push({ text: `${target.name} blocks and trims the blow to ${reduced}.` });
  return reduced;
}

function spendStamina(actor, cost, entries) {
  if ((actor.stamina ?? 0) < cost) {
    actor.status = "TIRED";
    actor.tiredTurns = 1;
    entries.push({ text: `${actor.name} lacks stamina for that move and becomes TIRED.` });
    return false;
  }

  actor.stamina = clamp(actor.stamina - cost, 0, actor.maxStamina ?? actor.stamina);
  return true;
}

export function WeightedAttribute(attackerValue, defenderValue, context = {}) {
  const attack = Number(attackerValue) || 0;
  const defense = Number(defenderValue) || 0;
  const attackWeight = Number(context.attackWeight ?? context.weight ?? 1);
  const defenseWeight = Number(context.defenseWeight ?? 1);
  const offset = Number(context.offset ?? 0);
  return round(Math.max(0, attack * attackWeight - defense * defenseWeight + offset), 2);
}

export function chooseTacticalAggressionAction(aiState = {}, playerState = {}) {
  const playerStamina = Number(playerState.stamina) || 0;
  const playerHealth = Number(playerState.health) || 0;
  const playerMaxHealth = Number(playerState.maxHealth) || Math.max(playerHealth, 1);
  const aiStamina = Number(aiState.stamina) || 0;
  const playerHealthRatio = playerHealth / playerMaxHealth;

  if (playerStamina <= 20 && aiStamina >= ACTIONS.powerAttack.staminaCost) return "powerAttack";
  if (playerHealthRatio >= 0.75 && aiStamina >= ACTIONS.taunt.staminaCost && (aiState.crowdFavor ?? 0) < 12) return "taunt";
  if (aiStamina <= 10) return "block";
  if ((aiState.health ?? 0) <= (aiState.maxHealth ?? 1) * 0.35) return "jab";
  return "swing";
}

export function resolveAction(action, actor, target, context = {}) {
  const actionId = normalizeAction(action);
  const spec = ACTIONS[actionId];
  const entries = [];
  const actorState = actor;
  const targetState = target;
  const random = context.random ?? Math.random;
  const result = {
    action: actionId,
    actor: actorState.name,
    target: targetState.name,
    success: false,
    failed: false,
    damage: 0,
    critical: false,
    staminaSpent: 0,
    favorDelta: 0,
    targetFavorDelta: 0,
    status: actorState.status ?? "READY",
    targetStatus: targetState.status ?? "READY",
    entries,
  };

  if (consumeTiredTurn(actorState, entries)) {
    result.failed = true;
    result.status = actorState.status;
    result.targetStatus = targetState.status ?? "READY";
    return result;
  }

  actorState.status = "READY";
  if (!spendStamina(actorState, spec.staminaCost, entries)) {
    result.failed = true;
    result.status = actorState.status;
    result.targetStatus = targetState.status ?? "READY";
    return result;
  }

  result.success = true;
  result.staminaSpent = spec.staminaCost;

  if (actionId === "block") {
    actorState.guardHits = spec.guardHits;
    actorState.status = "BLOCKING";
    entries.push({ text: `${actorState.name} braces behind a block.` });
    result.status = actorState.status;
    result.targetStatus = targetState.status ?? "READY";
    return result;
  }

  if (actionId === "taunt") {
    result.favorDelta = spec.favorGain + passiveFavorGain(actorState);
    result.targetFavorDelta = -spec.targetFavorLoss;
    applyFavorDelta(actorState, spec.favorGain);
    applyFavorDelta(actorState, passiveFavorGain(actorState));
    applyFavorDelta(targetState, -spec.targetFavorLoss);
    actorState.status = "READY";
    entries.push({ text: `${actorState.name} taunts and steals the crowd's attention.` });
    activateCrowdBuffIfReady(actorState, entries);
    result.status = actorState.status;
    result.targetStatus = targetState.status ?? "READY";
    return result;
  }

  const pressure = WeightedAttribute(actorState.strength, targetState.agility, {
    attackWeight: spec.attackWeight,
    defenseWeight: 0.9,
    offset: (actorState.level ?? 1) - (targetState.level ?? 1),
  });
  const critRoll = random();
  const critChance = clamp(spec.critChance + pressure * 0.01, 0.05, 0.45);
  const critical = critRoll <= critChance;
  const rawDamage = Math.max(2, Math.round(spec.baseDamage + pressure - targetState.defense * 0.35));
  let finalDamage = Math.round(rawDamage * damageMultiplier(actorState));

  if (critical) {
    finalDamage = Math.round(finalDamage * 1.5);
    result.favorDelta += 4;
    entries.push({ text: "Critical hit!" });
  }

  finalDamage = applyGuardReduction(targetState, finalDamage, entries);
  targetState.health = clamp((targetState.health ?? 0) - finalDamage, 0, targetState.maxHealth ?? targetState.health ?? 0);

  result.damage = finalDamage;
  result.critical = critical;
  result.favorDelta += spec.favorGain + passiveFavorGain(actorState);
  applyFavorDelta(actorState, result.favorDelta);
  actorState.status = "READY";
  targetState.status = targetState.guardHits > 0 ? "BLOCKING" : targetState.tiredTurns > 0 ? "TIRED" : "READY";

  entries.unshift({ text: `${actorState.name} uses ${spec.label} for ${finalDamage} damage.` });
  activateCrowdBuffIfReady(actorState, entries);
  result.status = actorState.status;
  result.targetStatus = targetState.status ?? "READY";
  return result;
}

function buildCombatState(state = {}) {
  return {
    player: cloneFighterState(state.player ?? {}),
    enemy: cloneFighterState({ ...DEFAULT_ENEMY, ...(state.enemy ?? {}) }),
    round: Number(state.round) || 1,
    log: Array.isArray(state.log) ? [...state.log] : [],
    turnLog: Array.isArray(state.turnLog) ? [...state.turnLog] : [],
    status: state.status ?? "idle",
    finished: Boolean(state.finished),
    result: state.result ?? null,
  };
}

function resolveVictory(next) {
  if (next.enemy.health <= 0) {
    next.finished = true;
    next.status = "victory";
    next.result = {
      outcome: "victory",
      victory: true,
      rewardGold: 40,
      message: "The sand remembers your name. Champion of this bout.",
    };
    return true;
  }

  if (next.player.health <= 0) {
    next.finished = true;
    next.status = "defeat";
    next.result = {
      outcome: "defeat",
      victory: false,
      rewardGold: 0,
      message: "You fall, but the crowd will see you again.",
    };
    return true;
  }

  return false;
}

export function resolveTurn(playerAction, state = {}) {
  const next = buildCombatState(state);
  if (next.finished) return next;

  const turnEntries = [];
  const playerOutcome = resolveAction(playerAction, next.player, next.enemy, { round: next.round });
  turnEntries.push(...playerOutcome.entries);

  if (!resolveVictory(next)) {
    const enemyAction = chooseTacticalAggressionAction(next.enemy, next.player);
    const enemyOutcome = resolveAction(enemyAction, next.enemy, next.player, { round: next.round });
    turnEntries.push(...enemyOutcome.entries);
    resolveVictory(next);
  }

  decrementBuffTurns(next.player);
  decrementBuffTurns(next.enemy);

  next.round += 1;
  next.turnLog = turnEntries;
  next.log = [...turnEntries, ...next.log].slice(0, 18);
  if (!next.finished) next.status = "arena";
  next.player.favor = next.player.crowdFavor;
  next.enemy.favor = next.enemy.crowdFavor;
  return next;
}

export class CombatLogic {
  constructor() {
    this.state = buildCombatState({
      player: createGladiator({}),
      enemy: createGladiator(DEFAULT_ENEMY),
      log: [{ text: "Arena gates closed." }],
      status: "idle",
    });
  }

  getSnapshot() {
    return buildCombatState(this.state);
  }

  setState(nextState = {}) {
    this.state = buildCombatState(nextState);
    return this.getSnapshot();
  }

  startEncounter(player = {}) {
    this.state = buildCombatState({
      player: cloneFighterState(player),
      enemy: createGladiator(DEFAULT_ENEMY),
      round: 1,
      log: [{ text: "The arena opens. First blood decides the roar." }],
      turnLog: [{ text: "The arena opens. First blood decides the roar." }],
      status: "arena",
      finished: false,
      result: null,
    });
    return this.getSnapshot();
  }

  resolveTurn(action) {
    this.state = resolveTurn(action, this.state);
    return this.getSnapshot();
  }
}
