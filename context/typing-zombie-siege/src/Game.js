import { DIFFICULTY, LANES, SCORE_VALUES, VOCABULARY, WAVES } from "./data.js";

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shufflePool(pool, rng) {
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createWordPools(seed) {
  const rng = createRng(seed);
  return Object.fromEntries(
    Object.entries(VOCABULARY).map(([tier, pool]) => [tier, shufflePool(pool, rng)]),
  );
}

function pickWord(wordPools, tier, index) {
  const pool = wordPools[tier];
  return pool[index % pool.length];
}

function createInitialState() {
  const wordSeed = ((Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0);
  return {
    mode: "menu",
    width: 1280,
    height: 720,
    score: 0,
    waveIndex: 0,
    combo: 0,
    comboTimer: 0,
    barricadeHealth: 100,
    typedBuffer: "",
    activeTargetId: null,
    activeMatchLength: 0,
    enemies: [],
    nextEnemyId: 1,
    waveSpawned: 0,
    spawnTimer: 0,
    clearTimer: 0,
    totalKills: 0,
    feedback: [],
    wordPools: createWordPools(wordSeed),
  };
}

export default class Game {
  constructor() {
    this.state = createInitialState();
  }

  start() {
    if (this.state.mode === "menu") {
      this.state.mode = "playing";
      this.state.spawnTimer = 0;
    }
  }

  restart() {
    this.state = createInitialState();
    this.state.mode = "playing";
  }

  resize(width, height) {
    this.state.width = width;
    this.state.height = height;
  }

  handleCharacter(char) {
    const lower = char.toLowerCase();
    if (!/^[a-z]$/.test(lower)) {
      return;
    }
    if (this.state.mode === "menu") {
      this.start();
    }
    if (this.state.mode !== "playing") {
      return;
    }
    this.state.typedBuffer += lower;
    this.syncTarget();
  }

  handleBackspace() {
    if (this.state.mode !== "playing") {
      return;
    }
    this.state.typedBuffer = this.state.typedBuffer.slice(0, -1);
    this.syncTarget();
  }

  submitWord() {
    if (this.state.mode === "menu") {
      this.start();
      return;
    }
    if (this.state.mode !== "playing") {
      return;
    }
    const { typedBuffer } = this.state;
    if (!typedBuffer) {
      return;
    }
    const target = this.getActiveTarget();
    if (target && target.word === typedBuffer) {
      this.killEnemy(target);
      this.state.score += SCORE_VALUES.perfectSubmit;
      this.pushFeedback(target.x, target.y - 26, "clear", "#f6d365");
    } else {
      this.state.combo = 0;
      this.state.comboTimer = 0;
      this.pushFeedback(DIFFICULTY.barricadeX + 58, 112, "mistype", "#ff8a80");
    }
    this.state.typedBuffer = "";
    this.state.activeTargetId = null;
    this.state.activeMatchLength = 0;
  }

  update(dt) {
    const state = this.state;
    if (state.mode !== "playing") {
      this.tickFeedback(dt);
      return;
    }

    this.advanceSpawns(dt);

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
      }
    }

    for (const enemy of state.enemies) {
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      }
      if (enemy.stagger > 0) {
        enemy.stagger = Math.max(0, enemy.stagger - dt);
        continue;
      }
      enemy.x -= enemy.speed * dt;
    }

    const survivors = [];
    for (const enemy of state.enemies) {
      if (enemy.x <= DIFFICULTY.barricadeX) {
        state.barricadeHealth = Math.max(0, state.barricadeHealth - DIFFICULTY.breachDamage);
        this.pushFeedback(DIFFICULTY.barricadeX + 24, enemy.y - 18, "breach", "#ff6b6b");
        state.combo = 0;
        state.comboTimer = 0;
        if (state.barricadeHealth <= 0) {
          state.mode = "lose";
        }
        continue;
      }
      survivors.push(enemy);
    }
    state.enemies = survivors;

    if (state.activeTargetId !== null && !state.enemies.some((enemy) => enemy.id === state.activeTargetId)) {
      state.activeTargetId = null;
      state.activeMatchLength = 0;
      this.syncTarget();
    }

    if (state.waveIndex >= WAVES.length && state.enemies.length === 0) {
      state.clearTimer += dt;
      if (state.clearTimer >= 0.35) {
        state.mode = "win";
      }
    }

    this.tickFeedback(dt);
  }

  getFrameState() {
    const state = this.state;
    return {
      mode: state.mode,
      viewport: { width: state.width, height: state.height },
      lanes: LANES.map((lane) => ({ ...lane, barricadeX: DIFFICULTY.barricadeX })),
      enemies: state.enemies.map((enemy) => ({
        id: enemy.id,
        laneId: enemy.laneId,
        x: enemy.x,
        y: enemy.y,
        word: enemy.word,
        tier: enemy.tier,
        speed: enemy.speed,
        hitFlash: enemy.hitFlash,
        stagger: enemy.stagger,
        isActive: enemy.id === state.activeTargetId,
        matchLength: enemy.id === state.activeTargetId ? state.activeMatchLength : 0,
      })),
      typedBuffer: state.typedBuffer,
      activeMatchLength: state.activeMatchLength,
      score: state.score,
      combo: state.combo,
      wave: Math.min(WAVES.length, state.waveIndex + (state.mode === "win" ? 0 : 1)),
      totalWaves: WAVES.length,
      barricadeHealth: state.barricadeHealth,
      kills: state.totalKills,
      feedback: state.feedback.map((item) => ({ ...item })),
      overlay: this.getOverlay(),
    };
  }

  getOverlay() {
    const { mode, score, totalKills } = this.state;
    if (mode === "menu") {
      return {
        title: "Typing Zombie Siege",
        lines: [
          "Type a zombie word, then press Enter to execute it.",
          "Backspace trims mistakes. Stop breaches before the wall breaks.",
          "Press Enter or start typing to begin.",
        ],
      };
    }
    if (mode === "win") {
      return {
        title: "Wall Holds",
        lines: [
          `Score ${score}`,
          `Kills ${totalKills}`,
          "Press Enter or Ctrl+R for another siege.",
        ],
      };
    }
    if (mode === "lose") {
      return {
        title: "Barricade Overrun",
        lines: [
          `Score ${score}`,
          `Kills ${totalKills}`,
          "Press Enter or Ctrl+R to rebuild and retry.",
        ],
      };
    }
    return null;
  }

  advanceSpawns(dt) {
    const state = this.state;
    if (state.waveIndex >= WAVES.length) {
      return;
    }
    const wave = WAVES[state.waveIndex];
    state.spawnTimer -= dt;
    while (state.waveSpawned < wave.count && state.spawnTimer <= 0) {
      const laneId = wave.laneBias[state.waveSpawned % wave.laneBias.length];
      const tier = wave.tiers[state.waveSpawned % wave.tiers.length];
      this.spawnEnemy(laneId, tier, wave.speed, state.waveSpawned);
      state.waveSpawned += 1;
      state.spawnTimer += wave.interval;
    }
    if (state.waveSpawned >= wave.count && state.enemies.length === 0) {
      state.waveIndex += 1;
      state.waveSpawned = 0;
      state.spawnTimer = 1.2;
      state.typedBuffer = "";
      state.activeTargetId = null;
      state.activeMatchLength = 0;
    }
  }

  spawnEnemy(laneId, tier, speedFactor, waveOffset) {
    const lane = LANES[laneId];
    const word = pickWord(this.state.wordPools, tier, this.state.nextEnemyId + waveOffset);
    this.state.enemies.push({
      id: this.state.nextEnemyId,
      laneId,
      x: DIFFICULTY.spawnX + laneId * 18,
      y: lane.y,
      word,
      tier,
      speed: DIFFICULTY.baseSpeed * speedFactor * (1 + word.length * 0.02),
      stagger: 0,
      hitFlash: 0,
    });
    this.state.nextEnemyId += 1;
    this.syncTarget();
  }

  syncTarget() {
    const typed = this.state.typedBuffer;
    if (!typed) {
      this.state.activeTargetId = null;
      this.state.activeMatchLength = 0;
      return;
    }
    const candidates = this.state.enemies
      .filter((enemy) => enemy.word.startsWith(typed))
      .sort((a, b) => a.x - b.x || a.word.length - b.word.length);
    const target = candidates[0] ?? null;
    this.state.activeTargetId = target ? target.id : null;
    this.state.activeMatchLength = target ? typed.length : 0;
    if (!target) {
      this.pushFeedback(DIFFICULTY.barricadeX + 58, 148, typed, "#ffb3b3");
    } else {
      target.stagger = Math.max(target.stagger, DIFFICULTY.staggerDuration);
      target.hitFlash = Math.max(target.hitFlash, 0.08);
    }
  }

  getActiveTarget() {
    return this.state.enemies.find((enemy) => enemy.id === this.state.activeTargetId) ?? null;
  }

  killEnemy(enemy) {
    this.state.enemies = this.state.enemies.filter((item) => item.id !== enemy.id);
    this.state.score += SCORE_VALUES[enemy.tier] + this.state.combo * 10;
    this.state.combo += 1;
    this.state.comboTimer = DIFFICULTY.comboWindow;
    this.state.totalKills += 1;
  }

  pushFeedback(x, y, text, color) {
    this.state.feedback.push({ x, y, text, color, life: 0.7 });
    if (this.state.feedback.length > 18) {
      this.state.feedback.shift();
    }
  }

  tickFeedback(dt) {
    this.state.feedback = this.state.feedback
      .map((item) => ({ ...item, y: item.y - dt * 18, life: item.life - dt }))
      .filter((item) => item.life > 0);
  }
}
