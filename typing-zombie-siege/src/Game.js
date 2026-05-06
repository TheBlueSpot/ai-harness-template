import { difficulty, lanes, scoreValues, vocabularyPools, waveSchedule } from "./data.js";

const modeOrder = ["menu", "playing", "win", "lose"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pickWord(rng, poolName, laneIndex, waveIndex, spawnIndex) {
  const pool = vocabularyPools[poolName] ?? vocabularyPools.common;
  const base = Math.floor(rng() * pool.length);
  const offset = (laneIndex + waveIndex + spawnIndex) % pool.length;
  return pool[(base + offset) % pool.length];
}

function cloneEnemy(enemy) {
  return {
    id: enemy.id,
    laneId: enemy.laneId,
    word: enemy.word,
    health: enemy.health,
    maxHealth: enemy.maxHealth,
    progress: enemy.progress,
    x: enemy.x,
    stagger: enemy.stagger,
    state: enemy.state,
  };
}

export default class Game {
  constructor() {
    this.resize(0, 0);
    this.restart();
  }

  restart() {
    this.rng = createRng(0x5eed1234);
    this.mode = "menu";
    this.time = 0;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnCursor = 0;
    this.spawnTimer = 0;
    this.enemies = [];
    this.typedBuffer = "";
    this.activeLaneIndex = 1;
    this.activeMatch = null;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.barricadeHealth = difficulty.barricadeHealth;
    this.overlay = "Type to begin";
    this.lastEvent = "ready";
    this.completedWaves = 0;
    this.pendingWaveClearBonus = false;
    this._buildSchedule();
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.overlay = "Hold the line";
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  _buildSchedule() {
    this.spawnQueue = [];
    for (let waveIndex = 0; waveIndex < waveSchedule.length; waveIndex += 1) {
      const wave = waveSchedule[waveIndex];
      for (let i = 0; i < wave.count; i += 1) {
        this.spawnQueue.push({
          waveIndex,
          spawnIndex: i,
          at: wave.at + i * wave.spawnGap,
          laneIndex: (waveIndex + i) % lanes.length,
          pool: wave.pool,
          speed: wave.speed + waveIndex * 0.004,
          health: wave.health + (waveIndex > 2 ? 1 : 0),
        });
      }
    }
  }

  _spawnReadyEnemies() {
    while (this.spawnCursor < this.spawnQueue.length && this.spawnQueue[this.spawnCursor].at <= this.time) {
      const spec = this.spawnQueue[this.spawnCursor];
      const lane = lanes[spec.laneIndex % lanes.length];
      const word = pickWord(this.rng, spec.pool, spec.laneIndex, spec.waveIndex, spec.spawnIndex);
      this.enemies.push({
        id: `w${spec.waveIndex}-${spec.spawnIndex}`,
        laneId: lane.id,
        word,
        health: spec.health,
        maxHealth: spec.health,
        progress: 0,
        x: difficulty.spawnStart,
        speed: spec.speed,
        stagger: 0,
        state: "advancing",
      });
      this.spawnCursor += 1;
    }
  }

  _ensureActiveMatch() {
    if (this.activeMatch && this.activeMatch.enemyId) {
      const enemy = this.enemies.find((item) => item.id === this.activeMatch.enemyId && item.state !== "dead");
      if (enemy) {
        this.activeMatch.enemy = enemy;
        return;
      }
    }

    const activeLane = lanes[this.activeLaneIndex % lanes.length];
    const laneEnemies = this.enemies.filter((enemy) => enemy.laneId === activeLane.id && enemy.state !== "dead");
    const target = laneEnemies.sort((a, b) => a.x - b.x)[0] ?? this.enemies.filter((enemy) => enemy.state !== "dead").sort((a, b) => a.x - b.x)[0] ?? null;
    this.activeMatch = target
      ? {
          enemyId: target.id,
          enemy: target,
        }
      : null;
  }

  _advanceCombo(dt) {
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) {
      this.combo = 0;
    }
  }

  _damageBarricade(amount) {
    this.barricadeHealth = Math.max(0, this.barricadeHealth - amount);
    this.score += scoreValues.breach;
    this.lastEvent = "breach";
    if (this.barricadeHealth === 0) {
      this.mode = "lose";
      this.overlay = "Barricade fell";
    }
  }

  _killEnemy(enemy, reason) {
    enemy.state = "dead";
    enemy.x = 0;
    this.combo += 1;
    this.comboTimer = 2.5;
    this.score += scoreValues.kill + this.combo * scoreValues.comboStep;
    this.lastEvent = reason;
    this.overlay = reason === "kill" ? "Zombie dropped" : "Zombie staggered";
  }

  _staggerEnemy(enemy) {
    enemy.stagger = difficulty.staggerDelay;
    enemy.state = "staggered";
    this.score += scoreValues.stagger;
    this.lastEvent = "stagger";
    this.overlay = "Staggered";
  }

  _currentTargetWord() {
    return this.activeMatch?.enemy?.word ?? "";
  }

  handleCharacter(character) {
    if (!character || character.length !== 1 || /[\r\n\t]/.test(character)) {
      return;
    }

    if (this.mode === "menu") {
      this.start();
    }
    if (this.mode !== "playing") {
      return;
    }

    const letter = character.toLowerCase();
    this.typedBuffer += letter;
    this.lastEvent = `type:${letter}`;
    this._ensureActiveMatch();

    const target = this._currentTargetWord();
    if (!target) {
      return;
    }

    if (target.startsWith(this.typedBuffer)) {
      this.activeMatch.enemy.progress = this.typedBuffer.length / target.length;
      this.activeLaneIndex = lanes.findIndex((lane) => lane.id === this.activeMatch.enemy.laneId);
      if (this.typedBuffer === target) {
        this.submitWord();
      }
      return;
    }

    this.typedBuffer = letter;
    this._ensureActiveMatch();
    if (this._currentTargetWord().startsWith(this.typedBuffer)) {
      this.activeMatch.enemy.progress = this.typedBuffer.length / this.activeMatch.enemy.word.length;
    } else {
      this.typedBuffer = "";
    }
  }

  handleBackspace() {
    if (this.mode !== "playing" || !this.typedBuffer) {
      return;
    }

    this.typedBuffer = this.typedBuffer.slice(0, -1);
    this.lastEvent = "backspace";
    this._ensureActiveMatch();
    if (this.activeMatch?.enemy) {
      this.activeMatch.enemy.progress = this.typedBuffer.length / this.activeMatch.enemy.word.length;
    }
  }

  submitWord() {
    if (this.mode !== "playing") {
      if (this.mode === "menu") {
        this.start();
      }
      return;
    }

    this._ensureActiveMatch();
    const target = this.activeMatch?.enemy;
    if (!target) {
      this.typedBuffer = "";
      this.lastEvent = "submit:empty";
      return;
    }

    if (this.typedBuffer === target.word) {
      this._killEnemy(target, "kill");
      this.typedBuffer = "";
      this.activeMatch = null;
      return;
    }

    if (target.word.startsWith(this.typedBuffer)) {
      this._staggerEnemy(target);
    } else {
      this.lastEvent = "miss";
    }

    this.typedBuffer = "";
  }

  update(dt) {
    const seconds = dt / 1000;
    this.time += seconds;

    if (this.mode !== "playing") {
      return;
    }

    this._spawnReadyEnemies();
    this._advanceCombo(seconds);

    for (const enemy of this.enemies) {
      if (enemy.state === "dead") {
        continue;
      }
      if (enemy.stagger > 0) {
        enemy.stagger = Math.max(0, enemy.stagger - seconds);
        if (enemy.stagger === 0 && enemy.state === "staggered") {
          enemy.state = "advancing";
        }
        continue;
      }

      enemy.progress = clamp(enemy.progress, 0, 1);
      enemy.x -= enemy.speed * seconds;
      if (enemy.x <= difficulty.retreatBuffer) {
        enemy.state = "breaching";
        this._damageBarricade(1);
        enemy.state = "dead";
      }
    }

    this._ensureActiveMatch();

    if (this.spawnCursor >= this.spawnQueue.length && this.enemies.every((enemy) => enemy.state === "dead")) {
      this.completedWaves = waveSchedule.length;
      this.score += scoreValues.waveClear;
      this.mode = "win";
      this.overlay = "Horde cleared";
      this.lastEvent = "win";
    }
  }

  getFrameState() {
    const activeEnemy = this.activeMatch?.enemy ?? null;
    return {
      width: this.width,
      height: this.height,
      mode: this.mode,
      overlay: this.overlay,
      lastEvent: this.lastEvent,
      score: this.score,
      combo: this.combo,
      barricadeHealth: this.barricadeHealth,
      barricadeMaxHealth: difficulty.barricadeHealth,
      typedBuffer: this.typedBuffer,
      activeTarget: activeEnemy
        ? {
            id: activeEnemy.id,
            laneId: activeEnemy.laneId,
            word: activeEnemy.word,
            progress: activeEnemy.progress,
          }
        : null,
      lanes: lanes.map((lane) => ({
        id: lane.id,
        label: lane.label,
      })),
      enemies: this.enemies.filter((enemy) => enemy.state !== "dead").map(cloneEnemy),
      wave: {
        total: waveSchedule.length,
        completed: this.completedWaves,
        remaining: Math.max(0, this.spawnQueue.length - this.spawnCursor),
      },
      prompt: modeOrder.includes(this.mode) ? this.overlay : "Hold the line",
    };
  }
}
