const DEFAULT_ENCOUNTERS = Object.freeze([
  {
    id: "wolf",
    name: "Ash Wolf",
    threat: "Low",
    hp: 32,
    attack: 6,
    defense: 2,
    speed: 9,
    critChance: 0.08,
    swingSpeed: 1.05,
    reward: 20,
    note: "Fast but fragile.",
  },
  {
    id: "knight",
    name: "Grave Knight",
    threat: "Mid",
    hp: 56,
    attack: 9,
    defense: 4,
    speed: 7,
    critChance: 0.1,
    swingSpeed: 0.9,
    reward: 35,
    note: "Balanced steel.",
  },
  {
    id: "wyrm",
    name: "Cinder Wyrm",
    threat: "High",
    hp: 84,
    attack: 13,
    defense: 6,
    speed: 6,
    critChance: 0.14,
    swingSpeed: 0.8,
    reward: 60,
    note: "Punishes hesitation.",
  },
]);

const ACTIONS = Object.freeze({
  light: { label: "Light Slash", power: 0.95, accuracy: 0.96, staminaCost: 0, pace: 0.65 },
  heavy: { label: "Heavy Slash", power: 1.55, accuracy: 0.82, staminaCost: 0, pace: 1.25 },
  guard: { label: "Guard", power: 0, accuracy: 1, staminaCost: 0, pace: 0.45, guard: true },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeStats(playerStats = {}) {
  return {
    level: playerStats.level ?? 1,
    training: playerStats.training ?? 0,
    vitality: playerStats.vitality ?? 100,
    swingSpeed: playerStats.swingSpeed ?? 1,
    critChance: clamp(playerStats.critChance ?? 0.08, 0, 0.75),
    attack: playerStats.attack ?? 10,
    defense: playerStats.defense ?? 0,
    accuracy: clamp(playerStats.accuracy ?? 0.9, 0.1, 1),
    speed: playerStats.speed ?? Math.round((playerStats.swingSpeed ?? 1) * 10 + (playerStats.training ?? 0) * 0.25),
  };
}

function normalizeEncounter(enemyConfig = {}) {
  if (typeof enemyConfig === "string") {
    const match = DEFAULT_ENCOUNTERS.find((item) => item.id === enemyConfig);
    return match ? { ...match } : { ...DEFAULT_ENCOUNTERS[0] };
  }
  return {
    ...DEFAULT_ENCOUNTERS[0],
    ...enemyConfig,
  };
}

function createLogEntry(type, text, payload = {}) {
  return {
    type,
    text,
    at: Date.now(),
    ...payload,
  };
}

function buildTurnOrder(player, enemy) {
  const playerInitiative = player.speed + player.swingSpeed * 10;
  const enemyInitiative = enemy.speed + enemy.swingSpeed * 10;
  return playerInitiative >= enemyInitiative ? "player" : "enemy";
}

function createBaseState(playerStats, enemyConfig) {
  const player = normalizeStats(playerStats);
  const enemy = normalizeEncounter(enemyConfig);
  const firstTurn = buildTurnOrder(player, enemy);

  return {
    finished: false,
    outcome: null,
    turn: firstTurn,
    round: 1,
    player: {
      maxHp: player.vitality,
      hp: player.vitality,
      attack: player.attack,
      defense: player.defense,
      accuracy: player.accuracy,
      critChance: player.critChance,
      speed: player.speed,
      swingSpeed: player.swingSpeed,
      level: player.level,
      training: player.training,
    },
    enemy: {
      id: enemy.id,
      name: enemy.name,
      threat: enemy.threat,
      maxHp: enemy.hp,
      hp: enemy.hp,
      attack: enemy.attack,
      defense: enemy.defense,
      speed: enemy.speed,
      critChance: enemy.critChance,
      swingSpeed: enemy.swingSpeed,
      reward: enemy.reward,
      note: enemy.note,
    },
    pacing: {
      playerReadyIn: 0,
      enemyReadyIn: firstTurn === "enemy" ? 0 : round2(1 / Math.max(0.25, player.swingSpeed)),
      nextActing: firstTurn,
    },
    log: [
      createLogEntry("arena", `${enemy.name} enters the arena.`),
      createLogEntry("turn", firstTurn === "player" ? "You act first." : `${enemy.name} acts first.`),
    ],
    summary: {
      turnsTaken: 0,
      playerActions: 0,
      enemyActions: 0,
      totalPlayerDamage: 0,
      totalEnemyDamage: 0,
      criticalHits: 0,
      misses: 0,
    },
  };
}

function resolveHitChance(attacker, defender, action) {
  const speedEdge = (attacker.speed - defender.speed) * 0.015;
  const paceBonus = action.pace ? (1 / action.pace - 1) * 0.05 : 0;
  return clamp((attacker.accuracy ?? 0.9) + speedEdge + paceBonus, 0.05, 0.98);
}

function resolveCritChance(attacker, action) {
  return clamp((attacker.critChance ?? 0) + (action.pace < 1 ? 0.01 : 0), 0, 0.75);
}

function calculateDamage(attacker, defender, action, isCrit) {
  if (action.guard) return 0;
  const raw = attacker.attack * action.power + attacker.swingSpeed * 6;
  const mitigated = Math.max(1, Math.round(raw - defender.defense * 1.3));
  return isCrit ? Math.max(1, Math.round(mitigated * 1.75)) : mitigated;
}

function applyOutcome(state, source, actionType, target, damage, hit, crit) {
  const action = ACTIONS[actionType] ?? ACTIONS.light;
  const label = source === "player" ? action.label : `${state.enemy.name} attack`;
  const text = action.guard
    ? `${source === "player" ? "You" : state.enemy.name} guard and brace.`
    : hit
      ? `${label} ${crit ? "crit" : "hits"} for ${damage}.`
      : `${label} misses.`;

  state.log.unshift(
    createLogEntry(source, text, {
      actionType,
      hit,
      crit,
      damage,
      target,
      pacing: action.pace,
    }),
  );

  state.summary.turnsTaken += 1;
  state.summary[`${source}Actions`] += 1;
  if (!hit) state.summary.misses += 1;
  if (crit) state.summary.criticalHits += 1;
  if (source === "player") state.summary.totalPlayerDamage += damage;
  if (source === "enemy") state.summary.totalEnemyDamage += damage;
}

function finalizeIfNeeded(state) {
  if (state.enemy.hp <= 0) {
    state.finished = true;
    state.outcome = "victory";
    state.log.unshift(createLogEntry("result", `${state.enemy.name} falls.`));
  } else if (state.player.hp <= 0) {
    state.finished = true;
    state.outcome = "defeat";
    state.log.unshift(createLogEntry("result", "You collapse in the arena."));
  }
}

function getResultPayload(state) {
  if (!state?.finished) return null;
  return {
    outcome: state.outcome,
    victory: state.outcome === "victory",
    defeat: state.outcome === "defeat",
    rewards: state.outcome === "victory" ? { gold: state.enemy.reward, xp: state.enemy.reward + state.round * 2 } : { gold: 0, xp: 0 },
    summary: {
      enemyId: state.enemy.id,
      enemyName: state.enemy.name,
      rounds: state.round,
      turnsTaken: state.summary.turnsTaken,
      playerActions: state.summary.playerActions,
      enemyActions: state.summary.enemyActions,
      criticalHits: state.summary.criticalHits,
      misses: state.summary.misses,
      totalPlayerDamage: state.summary.totalPlayerDamage,
      totalEnemyDamage: state.summary.totalEnemyDamage,
      remainingPlayerHp: state.player.hp,
      remainingEnemyHp: state.enemy.hp,
    },
    log: state.log.slice(),
  };
}

let currentState = null;

export function createEncounter(playerStats, enemyConfig = DEFAULT_ENCOUNTERS[0]) {
  currentState = createBaseState(playerStats, enemyConfig);
  return getCombatState();
}

export function getCombatState() {
  if (!currentState) return null;
  return {
    ...currentState,
    playerHp: currentState.player.hp,
    enemyHp: currentState.enemy.hp,
    player: { ...currentState.player },
    enemy: { ...currentState.enemy },
    pacing: { ...currentState.pacing },
    summary: { ...currentState.summary },
    log: currentState.log.map((entry) => ({ ...entry })),
    result: getResultPayload(currentState),
  };
}

export function isCombatOver() {
  return Boolean(currentState?.finished);
}

export function performPlayerAction(actionType) {
  if (!currentState || currentState.finished) return getCombatState();
  const action = ACTIONS[actionType] ?? ACTIONS.light;
  const hitChance = resolveHitChance(currentState.player, currentState.enemy, action);
  const hit = Math.random() < hitChance || action.guard;
  const critChance = hit ? resolveCritChance(currentState.player, action) : 0;
  const crit = hit && !action.guard && Math.random() < critChance;
  const damage = hit ? calculateDamage(currentState.player, currentState.enemy, action, crit) : 0;
  const target = "enemy";

  if (action.guard) {
    currentState.player.hp = Math.min(currentState.player.maxHp, currentState.player.hp + Math.max(2, Math.round(currentState.player.maxHp * 0.04)));
    currentState.pacing.playerReadyIn = round2(1 / Math.max(0.25, currentState.player.swingSpeed));
    applyOutcome(currentState, "player", actionType, target, 0, true, false);
  } else {
    currentState.enemy.hp = Math.max(0, currentState.enemy.hp - damage);
    currentState.pacing.playerReadyIn = round2(action.pace / Math.max(0.25, currentState.player.swingSpeed));
    applyOutcome(currentState, "player", actionType, target, damage, hit, crit);
  }

  finalizeIfNeeded(currentState);
  if (!currentState.finished) currentState.turn = "enemy";
  return getCombatState();
}

export function advanceEnemyTurn() {
  if (!currentState || currentState.finished) return getCombatState();
  const action = ACTIONS.light;
  const hitChance = resolveHitChance(currentState.enemy, currentState.player, action);
  const hit = Math.random() < hitChance;
  const crit = hit && Math.random() < resolveCritChance(currentState.enemy, action);
  const damage = hit ? calculateDamage(currentState.enemy, currentState.player, action, crit) : 0;
  currentState.player.hp = Math.max(0, currentState.player.hp - damage);
  currentState.pacing.enemyReadyIn = round2(action.pace / Math.max(0.25, currentState.enemy.swingSpeed));
  applyOutcome(currentState, "enemy", "light", "player", damage, hit, crit);
  currentState.round += 1;
  finalizeIfNeeded(currentState);
  if (!currentState.finished) currentState.turn = "player";
  return getCombatState();
}

export class CombatEngine {
  constructor(encounters = DEFAULT_ENCOUNTERS) {
    this.encounters = encounters.map((encounter) => ({ ...encounter }));
  }

  createEncounter(playerStats, enemyConfig) {
    return createEncounter(playerStats, enemyConfig);
  }

  getCombatState() {
    return getCombatState();
  }

  performPlayerAction(actionType) {
    return performPlayerAction(actionType);
  }

  advanceEnemyTurn() {
    return advanceEnemyTurn();
  }

  isCombatOver() {
    return isCombatOver();
  }

  // Backward compatibility for existing arena flow.
  start(encounter, stats) {
    return createEncounter(stats, encounter);
  }

  action(kind) {
    const afterPlayer = performPlayerAction(kind);
    if (afterPlayer?.finished) return afterPlayer;
    return advanceEnemyTurn();
  }

  getState() {
    return getCombatState();
  }
}

export { DEFAULT_ENCOUNTERS as combatEncounters };
