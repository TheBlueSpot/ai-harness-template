function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resultPayload(gameType, values) {
  const maxScore = values.maxScore ?? 100;
  const score = clamp(Math.round(values.score ?? 0), 0, maxScore);
  const accuracy = clamp(Number(values.accuracy ?? score / maxScore), 0, 1);
  const consistency = clamp(Number(values.consistency ?? 0), 0, 1);
  const combo = Math.max(0, Math.round(values.combo ?? 0));
  return {
    gameType,
    score,
    maxScore,
    accuracy,
    consistency,
    combo,
    perfect: accuracy === 1 && score === maxScore,
    meta: { ...values.meta },
  };
}

function createAccuracyGame(onComplete) {
  const state = {
    active: false,
    target: 0.5,
    attempts: 0,
    score: 0,
    window: 0.14,
    finished: false,
  };

  return {
    start(config = {}) {
      state.active = true;
      state.target = Number(config.target ?? 0.5);
      state.attempts = 0;
      state.score = 0;
      state.window = Number(config.window ?? 0.14);
      state.finished = false;
      return this.getState();
    },
    handleInput(event) {
      if (!state.active || state.finished) return this.getState();
      const aim = Number(event?.value ?? event?.position ?? 0.5);
      const delta = Math.abs(aim - state.target);
      const gain = delta <= state.window ? 100 : Math.max(0, Math.round(100 - delta * 250));
      state.attempts += 1;
      state.score = Math.max(state.score, gain);
      state.finished = true;
      const payload = resultPayload("accuracy", {
        score: state.score,
        maxScore: 100,
        accuracy: state.score / 100,
        consistency: state.score / 100,
        combo: 0,
        meta: { target: state.target, aim, delta },
      });
      onComplete?.(payload);
      return payload;
    },
    tick() {
      return this.getState();
    },
    finish() {
      state.active = false;
      const payload = resultPayload("accuracy", {
        score: state.score,
        maxScore: 100,
        accuracy: state.score / 100,
        consistency: state.score / 100,
        combo: 0,
        meta: { target: state.target, attempts: state.attempts },
      });
      onComplete?.(payload);
      return payload;
    },
    getState() {
      return { gameType: "accuracy", ...state };
    },
  };
}

function createTimingGame(onComplete) {
  const state = {
    active: false,
    phase: 0,
    beat: 0,
    hits: 0,
    misses: 0,
    score: 0,
    maxScore: 100,
    finished: false,
  };

  return {
    start(config = {}) {
      state.active = true;
      state.phase = 0;
      state.beat = Number(config.beat ?? 0.5);
      state.hits = 0;
      state.misses = 0;
      state.score = 0;
      state.finished = false;
      return this.getState();
    },
    handleInput(event) {
      if (!state.active || state.finished) return this.getState();
      const at = Number(event?.time ?? state.phase);
      const delta = Math.abs((at % 1) - state.beat);
      const hit = delta < 0.12;
      state.hits += hit ? 1 : 0;
      state.misses += hit ? 0 : 1;
      state.score = clamp(Math.round((state.hits * 24) - (state.misses * 8) + (hit ? 28 : 0)), 0, state.maxScore);
      const payload = resultPayload("timing", {
        score: state.score,
        maxScore: state.maxScore,
        accuracy: state.score / state.maxScore,
        consistency: state.hits / Math.max(1, state.hits + state.misses),
        combo: state.hits,
        meta: { beat: state.beat, delta, hits: state.hits, misses: state.misses },
      });
      if (state.score >= state.maxScore || state.misses >= 4) {
        state.finished = true;
        onComplete?.(payload);
      }
      return payload;
    },
    tick(dt = 0) {
      if (!state.active || state.finished) return this.getState();
      state.phase = (state.phase + dt) % 1;
      return this.getState();
    },
    finish() {
      state.active = false;
      const payload = resultPayload("timing", {
        score: state.score,
        maxScore: state.maxScore,
        accuracy: state.score / state.maxScore,
        consistency: state.hits / Math.max(1, state.hits + state.misses),
        combo: state.hits,
        meta: { beat: state.beat, hits: state.hits, misses: state.misses },
      });
      onComplete?.(payload);
      return payload;
    },
    getState() {
      return { gameType: "timing", ...state };
    },
  };
}

function createReflexGame(onComplete) {
  const state = {
    active: false,
    prompt: 0,
    reactionTime: 0.4,
    streak: 0,
    score: 0,
    finished: false,
  };

  return {
    start(config = {}) {
      state.active = true;
      state.prompt = 0;
      state.reactionTime = Number(config.reactionTime ?? 0.4);
      state.streak = 0;
      state.score = 0;
      state.finished = false;
      return this.getState();
    },
    handleInput(event) {
      if (!state.active || state.finished) return this.getState();
      const delay = Number(event?.delay ?? event?.reactionTime ?? state.reactionTime);
      const fast = delay <= state.reactionTime;
      state.streak += fast ? 1 : 0;
      state.score = clamp(Math.round((state.streak * 18) + ((1 - clamp(delay / 1.25, 0, 1)) * 82)), 0, 100);
      state.finished = true;
      const payload = resultPayload("reflex", {
        score: state.score,
        maxScore: 100,
        accuracy: state.score / 100,
        consistency: fast ? 1 : 0.25,
        combo: state.streak,
        meta: { delay, streak: state.streak },
      });
      onComplete?.(payload);
      return payload;
    },
    tick(dt = 0) {
      if (!state.active || state.finished) return this.getState();
      state.prompt = Math.max(0, state.prompt - dt);
      return this.getState();
    },
    finish() {
      state.active = false;
      const payload = resultPayload("reflex", {
        score: state.score,
        maxScore: 100,
        accuracy: state.score / 100,
        consistency: state.streak > 0 ? 1 : 0,
        combo: state.streak,
        meta: { reactionTime: state.reactionTime, streak: state.streak },
      });
      onComplete?.(payload);
      return payload;
    },
    getState() {
      return { gameType: "reflex", ...state };
    },
  };
}

export function createTrainingGames(onComplete) {
  return {
    accuracy: createAccuracyGame(onComplete),
    timing: createTimingGame(onComplete),
    reflex: createReflexGame(onComplete),
  };
}

export class TrainingGames {
  constructor(onComplete) {
    this.onComplete = onComplete;
    this.cards = [
      { id: "accuracy", title: "Blade Sight", description: "Land precise cuts to sharpen accuracy." },
      { id: "timing", title: "Pulse Rhythm", description: "Strike on beat to raise swing speed." },
      { id: "reflex", title: "Flash Step", description: "React fast to build combat instinct." },
    ];
    this.games = createTrainingGames((payload) => {
      this.lastResult = payload;
      onComplete?.(payload.gameType, payload);
    });
    this.lastResult = null;
  }

  start(gameType, config) {
    return this.games[gameType]?.start(config);
  }

  handleInput(gameType, event) {
    return this.games[gameType]?.handleInput(event);
  }

  tick(gameType, dt) {
    return this.games[gameType]?.tick(dt);
  }

  finish(gameType) {
    return this.games[gameType]?.finish();
  }

  complete(id, payload = {}) {
    const result = resultPayload(id, {
      score: payload.score ?? 100,
      maxScore: payload.maxScore ?? 100,
      accuracy: payload.accuracy ?? 1,
      consistency: payload.consistency ?? 1,
      combo: payload.combo ?? 0,
      meta: payload.meta ?? {},
    });
    this.lastResult = result;
    this.onComplete?.(result.gameType, result);
    return result;
  }
}
