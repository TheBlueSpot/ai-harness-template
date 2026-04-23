const BASE_STATE = Object.freeze({
  level: 1,
  trainingPoints: 0,
  attack: 10,
  defense: 8,
  hp: 100,
  speed: 10,
  swingSpeed: 1,
  critChance: 0.08,
  accuracy: 0.78,
  reflex: 10,
  focus: 10,
});

const TRAINING_RULES = {
  accuracy: {
    stat: "accuracy",
    scale: 0.012,
    cap: 0.99,
    points: 2,
    secondary: { focus: 0.25, speed: 0.1 },
  },
  timing: {
    stat: "swingSpeed",
    scale: 0.028,
    cap: 2.25,
    points: 3,
    secondary: { attack: 0.3, reflex: 0.2 },
  },
  reflex: {
    stat: "critChance",
    scale: 0.009,
    cap: 0.35,
    points: 4,
    secondary: { speed: 0.35, hp: 1.5 },
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function computeLevel(trainingPoints) {
  return 1 + Math.floor(trainingPoints / 10);
}

function deriveStats(state) {
  const level = computeLevel(state.trainingPoints);
  const attack = round(state.attack + level * 1.5 + state.reflex * 0.2 + state.focus * 0.15, 2);
  const defense = round(state.defense + level * 1.25 + state.focus * 0.25, 2);
  const hp = Math.round(state.hp + level * 12 + state.defense * 1.2);
  const speed = round(state.speed + level * 0.35 + state.reflex * 0.18, 2);
  const swingSpeed = round(clamp(state.swingSpeed, 0.8, 3), 2);
  const critChance = round(clamp(state.critChance, 0.01, 0.5), 3);
  const accuracy = round(clamp(state.accuracy, 0.5, 0.99), 3);
  return { level, attack, defense, hp, speed, swingSpeed, critChance, accuracy };
}

export class StatManager {
  constructor(initialState = {}) {
    this.listeners = new Set();
    this.state = this.#normalizeState({ ...BASE_STATE, ...initialState });
  }

  #normalizeState(state) {
    return {
      ...BASE_STATE,
      ...state,
      trainingPoints: Math.max(0, Math.floor(state.trainingPoints ?? BASE_STATE.trainingPoints)),
      attack: Number(state.attack ?? BASE_STATE.attack),
      defense: Number(state.defense ?? BASE_STATE.defense),
      hp: Number(state.hp ?? BASE_STATE.hp),
      speed: Number(state.speed ?? BASE_STATE.speed),
      swingSpeed: Number(state.swingSpeed ?? BASE_STATE.swingSpeed),
      critChance: Number(state.critChance ?? BASE_STATE.critChance),
      accuracy: Number(state.accuracy ?? BASE_STATE.accuracy),
      reflex: Number(state.reflex ?? BASE_STATE.reflex),
      focus: Number(state.focus ?? BASE_STATE.focus),
    };
  }

  #commit(nextState) {
    this.state = this.#normalizeState(nextState);
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }

  #applyProgress(rule, scorePayload) {
    const score = clamp(Number(scorePayload?.score ?? 0), 0, Number(scorePayload?.maxScore ?? 100) || 100);
    const accuracyBonus = clamp(Number(scorePayload?.accuracy ?? score / 100), 0, 1);
    const comboBonus = clamp(Number(scorePayload?.combo ?? 0), 0, 20) / 20;
    const consistencyBonus = clamp(Number(scorePayload?.consistency ?? 0), 0, 1);
    const efficiency = clamp((accuracyBonus * 0.5) + (comboBonus * 0.3) + (consistencyBonus * 0.2), 0, 1);
    const gain = rule.points + Math.round(score * rule.scale + efficiency * rule.points);
    const nextState = { ...this.state, trainingPoints: this.state.trainingPoints + gain };
    nextState[rule.stat] = round(clamp(nextState[rule.stat] + score * rule.scale * 0.5 + efficiency * rule.scale * 8, 0, rule.cap), 3);
    for (const [key, delta] of Object.entries(rule.secondary ?? {})) {
      nextState[key] = round(nextState[key] + delta * (0.5 + efficiency), 2);
    }
    return nextState;
  }

  getState() {
    const stats = deriveStats(this.state);
    return { ...this.state, ...stats };
  }

  getSnapshot() {
    return this.getState();
  }

  reset() {
    return this.#commit(BASE_STATE);
  }

  applyTrainingResult(gameType, scorePayload = {}) {
    const rule = TRAINING_RULES[gameType];
    if (!rule) {
      return this.getState();
    }
    return this.#commit(this.#applyProgress(rule, scorePayload));
  }

  train(gameType, scorePayload = {}) {
    return this.applyTrainingResult(gameType, scorePayload);
  }

  getDerivedCombatStats() {
    const state = this.getState();
    return {
      attack: state.attack,
      defense: state.defense,
      hp: state.hp,
      speed: state.speed,
      swingSpeed: state.swingSpeed,
      critChance: state.critChance,
      accuracy: state.accuracy,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
}
