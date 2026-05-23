const DEFAULT_BUFFER_WINDOW = 950;
const DEFAULT_MOVE_WINDOW = 650;
const DEFAULT_COMBO_TIMEOUT = 1650;

function normalizeToken(token) {
  if (token == null) return "";
  const raw = String(token).trim().toLowerCase();
  const aliases = {
    a: "left",
    left: "left",
    d: "right",
    right: "right",
    w: "up",
    up: "up",
    forward: "up",
    s: "down",
    down: "down",
    back: "down",
    space: "punch",
    punch: "punch",
    attack: "punch",
    strike: "punch",
    shift: "grab",
    grab: "grab",
    throw: "grab",
    enter: "special",
    special: "special"
  };
  return aliases[raw] ?? raw;
}

function normalizeDirectionalToken(token, facing = 1) {
  const normalized = normalizeToken(token);
  if (normalized === "forward") return facing >= 0 ? "right" : "left";
  if (normalized === "backward" || normalized === "back") return facing >= 0 ? "left" : "right";
  return normalized;
}

class ComboBuffer {
  constructor({ windowMs = DEFAULT_BUFFER_WINDOW } = {}) {
    this.windowMs = windowMs;
    this.entries = [];
  }

  push(token, time) {
    const entry = {
      token: normalizeToken(token),
      time: Number.isFinite(Number(time)) ? Number(time) : 0
    };
    this.entries.push(entry);
    this.trim(entry.time);
    return { ...entry };
  }

  trim(time = this.entries.at(-1)?.time ?? 0) {
    const cutoff = time - this.windowMs;
    while (this.entries.length && this.entries[0].time < cutoff) {
      this.entries.shift();
    }
    return this.entries;
  }

  recent(time = this.entries.at(-1)?.time ?? 0) {
    this.trim(time);
    return this.entries.map((entry) => ({ ...entry }));
  }

  clear() {
    this.entries = [];
  }
}

class SpecialMove {
  constructor({
    id,
    name,
    pattern,
    output = {},
    timingToleranceMs = DEFAULT_MOVE_WINDOW,
    directionalNormalization = true
  }) {
    this.id = id ?? name ?? "move";
    this.name = name ?? this.id;
    this.pattern = Array.isArray(pattern) ? pattern.map((token) => normalizeToken(token)) : [];
    this.output = { ...output };
    this.timingToleranceMs = timingToleranceMs;
    this.directionalNormalization = directionalNormalization;
  }

  matches(inputs, context = {}) {
    if (inputs.length < this.pattern.length || this.pattern.length === 0) return false;
    const slice = inputs.slice(-this.pattern.length);
    const firstTime = slice[0]?.time ?? 0;
    const lastTime = slice.at(-1)?.time ?? 0;
    if (lastTime - firstTime > this.timingToleranceMs) return false;

    for (let index = 0; index < this.pattern.length; index += 1) {
      const expected = this.directionalNormalization
        ? normalizeDirectionalToken(this.pattern[index], context.facing ?? 1)
        : this.pattern[index];
      const actual = this.directionalNormalization
        ? normalizeDirectionalToken(slice[index]?.token, context.facing ?? 1)
        : String(slice[index]?.token ?? "");
      if (expected !== actual) return false;
    }

    return true;
  }

  createEvent(inputs, time) {
    return {
      id: this.id,
      name: this.name,
      token: this.pattern.join("+"),
      time,
      inputCount: this.pattern.length,
      inputs: inputs.map((entry) => ({ token: entry.token, time: entry.time })),
      ...this.output
    };
  }
}

class ComboSystem {
  constructor({
    bufferWindowMs = DEFAULT_BUFFER_WINDOW,
    comboTimeoutMs = DEFAULT_COMBO_TIMEOUT,
    onComboChange = null,
    onMatch = null,
    onScoreChange = null
  } = {}) {
    this.buffer = new ComboBuffer({ windowMs: bufferWindowMs });
    this.comboTimeoutMs = comboTimeoutMs;
    this.moves = [];
    this.matchedMoves = [];
    this.comboCount = 0;
    this.score = 0;
    this.statusText = "Waiting";
    this.lastMatchedMove = null;
    this.lastHitAt = 0;
    this.onComboChange = onComboChange;
    this.onMatch = onMatch;
    this.onScoreChange = onScoreChange;
    this.registerDefaults();
  }

  registerDefaults() {
    this.registerMove(new SpecialMove({
      id: "jab",
      name: "Jab",
      pattern: ["punch"],
      output: { action: "light-attack", hudLabel: "Jab" },
      timingToleranceMs: 260
    }));
    this.registerMove(new SpecialMove({
      id: "grab",
      name: "Grab",
      pattern: ["grab"],
      output: { action: "grab", hudLabel: "Grab" },
      timingToleranceMs: 320
    }));
    this.registerMove(new SpecialMove({
      id: "cross",
      name: "Cross",
      pattern: ["right", "punch"],
      output: { action: "heavy-attack", hudLabel: "Cross" },
      timingToleranceMs: 430
    }));
    this.registerMove(new SpecialMove({
      id: "dash-strike",
      name: "Dash Strike",
      pattern: ["left", "left", "punch"],
      output: { action: "dash-strike", hudLabel: "Dash Strike" },
      timingToleranceMs: 560
    }));
    this.registerMove(new SpecialMove({
      id: "uppercut",
      name: "Uppercut",
      pattern: ["down", "up", "punch"],
      output: { action: "launcher", hudLabel: "Uppercut" },
      timingToleranceMs: 700
    }));
    this.registerMove(new SpecialMove({
      id: "special",
      name: "Street Cyclone",
      pattern: ["left", "right", "special"],
      output: { action: "special", hudLabel: "Street Cyclone" },
      timingToleranceMs: 780
    }));
  }

  reset() {
    this.buffer.clear();
    this.matchedMoves = [];
    this.comboCount = 0;
    this.score = 0;
    this.statusText = "Waiting";
    this.lastMatchedMove = null;
    this.lastHitAt = 0;
  }

  registerMove(move) {
    if (!move) return null;
    this.moves.push(move);
    this.moves.sort((left, right) => {
      if (right.pattern.length !== left.pattern.length) return right.pattern.length - left.pattern.length;
      return left.timingToleranceMs - right.timingToleranceMs;
    });
    return move;
  }

  recordInput(token, time, context = {}) {
    const entry = this.buffer.push(token, time);
    return this.update(entry.time, context);
  }

  update(time = this.buffer.entries.at(-1)?.time ?? 0, context = {}) {
    this.buffer.trim(time);
    if (this.comboCount > 0 && time - this.lastHitAt > this.comboTimeoutMs) {
      this.comboCount = 0;
      this.statusText = this.lastMatchedMove?.hudLabel ?? "Reset";
      this.emitComboChange(time);
    }

    const inputs = this.buffer.recent(time);
    const move = this.findBestMatch(inputs, context);
    if (!move) return [];

    const slice = inputs.slice(-move.pattern.length);
    const event = move.createEvent(slice, time);
    this.lastMatchedMove = event;
    this.statusText = event.hudLabel ?? event.name;
    this.matchedMoves.push(event);
    this.onMatch?.({ ...event, inputs: event.inputs.map((entry) => ({ ...entry })) });
    this.emitComboChange(time);
    return this.consumeMatchedMoves({ clear: false });
  }

  findBestMatch(inputs, context) {
    for (const move of this.moves) {
      if (move.matches(inputs, context)) return move;
    }
    return null;
  }

  emitComboChange(time) {
    this.onComboChange?.({
      comboCount: this.comboCount,
      score: this.score,
      statusText: this.statusText,
      lastMove: this.lastMatchedMove ? { ...this.lastMatchedMove } : null,
      recentInputs: this.getRecentInputs(time)
    });
  }

  getRecentInputs(time = this.buffer.entries.at(-1)?.time ?? 0) {
    return this.buffer.recent(time);
  }

  consumeMatchedMoves({ clear = true } = {}) {
    const events = this.matchedMoves.map((event) => ({
      ...event,
      inputs: event.inputs.map((entry) => ({ ...entry }))
    }));
    if (clear) this.matchedMoves = [];
    return events;
  }

  pushHit({ score = this.score, label = this.statusText, time = 0, targetId = null } = {}) {
    this.comboCount += 1;
    this.score = score;
    this.statusText = label || this.statusText;
    this.lastHitAt = time;
    this.onScoreChange?.(this.score);
    this.onComboChange?.({
      comboCount: this.comboCount,
      score: this.score,
      statusText: `${this.statusText} x${this.comboCount}`,
      targetId,
      lastMove: this.lastMatchedMove ? { ...this.lastMatchedMove } : null,
      recentInputs: this.getRecentInputs(time)
    });
    return this.comboCount;
  }

  dropCombo(time = 0, reason = "Crowd pressure") {
    if (this.comboCount === 0) return 0;
    this.comboCount = 0;
    this.statusText = reason;
    this.emitComboChange(time);
    return this.comboCount;
  }
}

window.ComboBuffer = ComboBuffer;
window.SpecialMove = SpecialMove;
window.ComboSystem = ComboSystem;
