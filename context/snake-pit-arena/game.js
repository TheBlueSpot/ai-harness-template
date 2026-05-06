(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const overlayGoal = document.getElementById("overlay-goal");
  const overlayHint = document.getElementById("overlay-hint");
  const startButton = document.getElementById("start-button");
  const hudStage = document.getElementById("stage");
  const hudPellets = document.getElementById("pellets");
  const hudLength = document.getElementById("length");
  const hudBoost = document.getElementById("boost");
  const hudGoal = document.getElementById("goal");
  const audioButton = document.getElementById("audio-button");

  const COLS = 32;
  const ROWS = 20;
  const CELL = 30;
  const TICK_MS = 112;
  const MAX_BOOST = 100;
  const STAGES = [
    { pellets: 10, enemies: 2, rocks: 10, speed: 0.92 },
    { pellets: 14, enemies: 3, rocks: 16, speed: 0.84 },
    { pellets: 18, enemies: 4, rocks: 22, speed: 0.77 },
    { pellets: 22, enemies: 5, rocks: 28, speed: 0.7 }
  ];
  const STAGE_TINTS = ["#7dff9b", "#8ef6ff", "#ffd868", "#ff9b52"];
  const AUDIO_STORAGE_KEY = "snake-pit-arena-audio-profile";
  const AUDIO_PROFILES = {
    full: { label: "Audio Full", master: 0.22, music: 1 },
    low: { label: "Audio Low", master: 0.12, music: 0.7 },
    mute: { label: "Audio Mute", master: 0.0001, music: 0 }
  };
  const ENEMY_SPAWNS = [
    [{ x: 27, y: 4 }, { x: 28, y: 4 }, { x: 29, y: 4 }],
    [{ x: 27, y: 15 }, { x: 28, y: 15 }, { x: 29, y: 15 }],
    [{ x: 26, y: 9 }, { x: 27, y: 9 }, { x: 28, y: 9 }],
    [{ x: 21, y: 5 }, { x: 22, y: 5 }, { x: 23, y: 5 }],
    [{ x: 21, y: 14 }, { x: 22, y: 14 }, { x: 23, y: 14 }]
  ];
  const PLAYER_START = [
    { x: 4, y: 10 },
    { x: 3, y: 10 },
    { x: 2, y: 10 },
    { x: 1, y: 10 }
  ];

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false
  };

  const directionMap = {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    Space: "boost"
  };

  const vectors = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const state = {
    mode: "menu",
    stageIndex: 0,
    timer: 0,
    pulse: 0,
    gateOpen: false,
    pelletsCollected: 0,
    boost: MAX_BOOST,
    player: null,
    enemies: [],
    pellets: [],
    rocks: [],
    gate: null,
    message: "",
    messageTimer: 0,
    particles: [],
    shake: 0,
    flash: 0,
    pulseGlow: 0,
    threats: [],
    threatPulse: 0,
    warningCooldown: 0,
    lastThreatSignature: "",
    boostCueCooldown: 0,
    boostReadyPulse: 0,
    boostArmed: false,
    lastCrashReason: ""
  };
  const audio = createAudioEngine();

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function inBounds(cell) {
    return cell.x >= 0 && cell.x < COLS && cell.y >= 0 && cell.y < ROWS;
  }

  function keyFor(cell) {
    return cell.x + "," + cell.y;
  }

  function opposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function cellCenter(cell) {
    return {
      x: cell.x * CELL + CELL / 2,
      y: cell.y * CELL + CELL / 2
    };
  }

  function cloneCells(cells) {
    return cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

  function loadAudioProfileId() {
    try {
      const saved = window.localStorage.getItem(AUDIO_STORAGE_KEY);
      if (saved && AUDIO_PROFILES[saved]) {
        return saved;
      }
    } catch {
      // Ignore storage failures and fall back to default.
    }
    return "full";
  }

  function saveAudioProfileId(profileId) {
    try {
      window.localStorage.setItem(AUDIO_STORAGE_KEY, profileId);
    } catch {
      // Ignore storage failures.
    }
  }

  function setAudioProfile(profileId) {
    const profile = AUDIO_PROFILES[profileId] || AUDIO_PROFILES.full;
    audio.setProfile(profile);
    audioButton.textContent = profile.label;
  }

  function createSnake(body, dir, color, isPlayer) {
    return {
      body: cloneCells(body),
      dir: { x: dir.x, y: dir.y },
      nextDir: { x: dir.x, y: dir.y },
      color,
      isPlayer,
      alive: true,
      flash: 0
    };
  }

  function randomFreeCell(blocked) {
    let attempts = 0;
    while (attempts < 500) {
      const cell = { x: randInt(1, COLS - 2), y: randInt(1, ROWS - 2) };
      if (!blocked.has(keyFor(cell))) {
        return cell;
      }
      attempts += 1;
    }
    return { x: 1, y: 1 };
  }

  function collectBlockedCells() {
    const blocked = new Set();
    for (const rock of state.rocks) blocked.add(keyFor(rock));
    if (state.player) {
      for (const cell of state.player.body) blocked.add(keyFor(cell));
    }
    for (const enemy of state.enemies) {
      for (const cell of enemy.body) blocked.add(keyFor(cell));
    }
    for (const pellet of state.pellets) blocked.add(keyFor(pellet));
    return blocked;
  }

  function buildReservedCells() {
    const reserved = new Set();
    const addZone = (cell) => {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const zone = { x: cell.x + dx, y: cell.y + dy };
          if (inBounds(zone)) {
            reserved.add(keyFor(zone));
          }
        }
      }
    };
    PLAYER_START.forEach(addZone);
    ENEMY_SPAWNS.flat().forEach(addZone);
    addZone({ x: COLS - 2, y: ROWS - 2 });
    return reserved;
  }

  function spawnRocks(count) {
    state.rocks = [];
    const blocked = buildReservedCells();
    for (let i = 0; i < count; i += 1) {
      const rock = randomFreeCell(blocked);
      state.rocks.push(rock);
      blocked.add(keyFor(rock));
      blocked.add(keyFor({ x: rock.x + 1, y: rock.y }));
      blocked.add(keyFor({ x: rock.x - 1, y: rock.y }));
      blocked.add(keyFor({ x: rock.x, y: rock.y + 1 }));
      blocked.add(keyFor({ x: rock.x, y: rock.y - 1 }));
    }
  }

  function seedStage(index) {
    state.stageIndex = index;
    state.timer = 0;
    state.pulse = 0;
    state.message = "";
    state.boost = MAX_BOOST;
    state.pelletsCollected = 0;
    state.gateOpen = false;
    state.messageTimer = 0;
    state.particles = [];
    state.shake = 0;
    state.flash = 0;
    state.pulseGlow = 0;
    state.threats = [];
    state.threatPulse = 0;
    state.warningCooldown = 0;
    state.lastThreatSignature = "";
    state.boostCueCooldown = 0;
    state.boostReadyPulse = 0;
    state.boostArmed = false;
    state.lastCrashReason = "";

    const stage = STAGES[index];
    spawnRocks(stage.rocks);

    state.player = createSnake(
      PLAYER_START,
      vectors.right,
      "#7dff9b",
      true
    );

    state.enemies = [];
    const enemyColors = ["#ff6c74", "#ffd868", "#5de0ff", "#c78cff", "#ff9b52"];
    for (let i = 0; i < stage.enemies; i += 1) {
      state.enemies.push(
        createSnake(ENEMY_SPAWNS[i], vectors.left, enemyColors[i], false)
      );
    }

    state.gate = { x: COLS - 2, y: ROWS - 2 };
    state.pellets = [];
    while (state.pellets.length < stage.pellets) {
      addPellet();
    }
    syncHud();
  }

  function addPellet() {
    const blocked = collectBlockedCells();
    blocked.add(keyFor(state.gate));
    const pellet = randomFreeCell(blocked);
    state.pellets.push(pellet);
  }

  function startGame() {
    seedStage(0);
    state.mode = "playing";
    audio.ensureContext();
    audio.playCue("start");
    hideOverlay();
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function showOverlay(title, copy, goal, hint, buttonText) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlayGoal.textContent = goal;
    overlayHint.textContent = hint;
    startButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function setMessage(text, duration = 2200) {
    state.message = text;
    state.messageTimer = duration;
  }

  function getCrashCopy(reason) {
    switch (reason) {
      case "wall":
        return "You clipped the arena wall before the lane reopened.";
      case "rock":
        return "You slammed into a rock while cutting for space.";
      case "self":
        return "You folded back into your own body under pressure.";
      case "enemy":
        return "A rival snake cut into your lane.";
      default:
        return "You clipped the wall or got trapped by the pit.";
    }
  }

  function addShake(amount, flash) {
    state.shake = Math.max(state.shake, amount);
    state.flash = Math.max(state.flash, flash);
    state.pulseGlow = Math.max(state.pulseGlow, flash * 1.4);
  }

  function hasRockBetween(a, b) {
    if (a.x === b.x) {
      const step = Math.sign(b.y - a.y);
      for (let y = a.y + step; y !== b.y; y += step) {
        if (state.rocks.some((rock) => rock.x === a.x && rock.y === y)) {
          return true;
        }
      }
      return false;
    }
    if (a.y === b.y) {
      const step = Math.sign(b.x - a.x);
      for (let x = a.x + step; x !== b.x; x += step) {
        if (state.rocks.some((rock) => rock.x === x && rock.y === a.y)) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  function buildThreatTelegraphs() {
    if (!state.player || !state.player.alive) return [];
    const playerHead = state.player.body[0];
    const threats = [];
    for (let enemyIndex = 0; enemyIndex < state.enemies.length; enemyIndex += 1) {
      const enemy = state.enemies[enemyIndex];
      if (!enemy.alive) continue;
      const head = enemy.body[0];
      const dx = playerHead.x - head.x;
      const dy = playerHead.y - head.y;
      const manhattan = Math.abs(dx) + Math.abs(dy);
      let axis = null;
      let distance = manhattan;

      if (dy === 0 && enemy.dir.x !== 0 && Math.sign(dx) === enemy.dir.x) {
        axis = "row";
        distance = Math.abs(dx);
      } else if (dx === 0 && enemy.dir.y !== 0 && Math.sign(dy) === enemy.dir.y) {
        axis = "col";
        distance = Math.abs(dy);
      }

      const lineThreat = Boolean(axis) && distance <= 6 && !hasRockBetween(head, playerHead);
      const closeThreat = manhattan <= 3;
      if (!lineThreat && !closeThreat) continue;

      const level = lineThreat && distance <= 3 || manhattan <= 2 ? 2 : 1;
      threats.push({
        axis,
        dir: { x: enemy.dir.x, y: enemy.dir.y },
        distance,
        enemyIndex,
        head: { x: head.x, y: head.y },
        level,
        lineThreat,
        playerHead: { x: playerHead.x, y: playerHead.y }
      });
    }
    return threats;
  }

  function updateThreatState(dt) {
    state.threatPulse = Math.max(0, state.threatPulse - dt * 0.0015);
    state.warningCooldown = Math.max(0, state.warningCooldown - dt);
    if (state.mode !== "playing") {
      state.threats = [];
      state.lastThreatSignature = "";
      return;
    }

    const threats = buildThreatTelegraphs();
    const signature = threats
      .map((threat) => threat.enemyIndex + ":" + threat.level + ":" + (threat.axis || "close"))
      .sort()
      .join("|");
    if (threats.length && signature !== state.lastThreatSignature && state.warningCooldown <= 0) {
      audio.playCue("warning");
      state.threatPulse = Math.max(state.threatPulse, threats.some((threat) => threat.level === 2) ? 0.16 : 0.1);
      state.warningCooldown = 650;
    }
    state.threats = threats;
    state.lastThreatSignature = signature;
  }

  function spawnParticles(x, y, count, color, options = {}) {
    const speed = options.speed || 80;
    const spread = options.spread || Math.PI * 2;
    const baseAngle = options.baseAngle || 0;
    for (let i = 0; i < count; i += 1) {
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const magnitude = speed * (0.5 + Math.random() * 0.8);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude,
        life: options.life || 0.45,
        maxLife: options.life || 0.45,
        radius: options.radius || (2 + Math.random() * 4),
        color
      });
    }
  }

  function queueDirection() {
    const snake = state.player;
    if (!snake || !snake.alive) return;
    let desired = null;
    if (input.up) desired = vectors.up;
    else if (input.down) desired = vectors.down;
    else if (input.left) desired = vectors.left;
    else if (input.right) desired = vectors.right;
    if (desired && !opposite(desired, snake.dir)) {
      snake.nextDir = { x: desired.x, y: desired.y };
    }
  }

  function decideEnemyDirection(enemy) {
    const dirs = [vectors.up, vectors.down, vectors.left, vectors.right];
    const occupied = buildOccupancy();
    const targets = state.gateOpen
      ? [{ x: state.player.body[0].x, y: state.player.body[0].y }]
      : state.pellets;

    const options = [];
    for (const dir of dirs) {
      if (opposite(dir, enemy.dir)) continue;
      const next = { x: enemy.body[0].x + dir.x, y: enemy.body[0].y + dir.y };
      if (!inBounds(next)) continue;
      if (state.rocks.some((rock) => sameCell(rock, next))) continue;
      const hit = occupied.get(keyFor(next));
      const tailKey = keyFor(enemy.body[enemy.body.length - 1]);
      if (hit && keyFor(next) !== tailKey) continue;
      let distance = 99;
      for (const target of targets) {
        const score = Math.abs(target.x - next.x) + Math.abs(target.y - next.y);
        if (score < distance) distance = score;
      }
      const centerBias = Math.abs(next.y - ROWS / 2) * 0.08;
      options.push({ dir, weight: distance + centerBias + Math.random() * 0.6 });
    }

    if (!options.length) return enemy.dir;
    options.sort((a, b) => a.weight - b.weight);
    return options[0].dir;
  }

  function buildOccupancy() {
    const occupied = new Map();
    if (state.player && state.player.alive) {
      state.player.body.forEach((cell, index) => occupied.set(keyFor(cell), { kind: "player", index }));
    }
    state.enemies.forEach((enemy, enemyIndex) => {
      enemy.body.forEach((cell, segmentIndex) => {
        occupied.set(keyFor(cell), { kind: "enemy", enemyIndex, segmentIndex });
      });
    });
    return occupied;
  }

  function moveSnake(snake, steps) {
    for (let i = 0; i < steps; i += 1) {
      snake.dir = { x: snake.nextDir.x, y: snake.nextDir.y };
      const next = { x: snake.body[0].x + snake.dir.x, y: snake.body[0].y + snake.dir.y };

      if (!inBounds(next) || state.rocks.some((rock) => sameCell(rock, next))) {
        triggerCrash(snake, next, inBounds(next) ? "rock" : "wall");
        snake.alive = false;
        return;
      }

      const occupied = buildOccupancy();
      const hit = occupied.get(keyFor(next));
      const ownTailKey = keyFor(snake.body[snake.body.length - 1]);
      if (hit && keyFor(next) !== ownTailKey) {
        if (snake.isPlayer && hit.kind === "enemy") {
          removeEnemy(hit.enemyIndex);
        } else if (!snake.isPlayer && hit.kind === "player") {
          if (hit.index === state.player.body.length - 1 && steps === 1) {
            // Tail moves out before enemy completes this step.
          } else {
            triggerCrash(snake, next, "enemy");
            snake.alive = false;
            return;
          }
        } else {
          triggerCrash(snake, next, snake.isPlayer && hit.kind === "player" ? "self" : "trap");
          snake.alive = false;
          return;
        }
      }

      snake.body.unshift(next);
      const pelletIndex = state.pellets.findIndex((pellet) => sameCell(pellet, next));
      if (pelletIndex >= 0) {
        state.pellets.splice(pelletIndex, 1);
        if (snake.isPlayer) {
          state.pelletsCollected += 1;
          snake.flash = 0.6;
          audio.playCue("pellet");
          spawnParticles(next.x * CELL + CELL / 2, next.y * CELL + CELL / 2, 9, "#ffd868", { speed: 56, life: 0.5, radius: 3 });
          if (!state.gateOpen && state.pelletsCollected >= STAGES[state.stageIndex].pellets) {
            state.gateOpen = true;
            setMessage("Gate open. Cross the far corner.", 2600);
            audio.playCue("gate");
            addShake(7, 0.18);
            spawnParticles(state.gate.x * CELL + CELL / 2, state.gate.y * CELL + CELL / 2, 18, "#7dff9b", { speed: 92, life: 0.7, radius: 4 });
          } else if (!state.gateOpen) {
            addPellet();
          }
        } else {
          addPellet();
        }
      } else {
        snake.body.pop();
      }

      if (snake.isPlayer && state.gateOpen && sameCell(next, state.gate)) {
        advanceStage();
        return;
      }
    }
  }

  function removeEnemy(index) {
    const enemy = state.enemies[index];
    if (!enemy) return;
    for (let i = 1; i < enemy.body.length; i += 1) {
      if (state.pellets.length < STAGES[state.stageIndex].pellets + 8) {
        state.pellets.push({ x: enemy.body[i].x, y: enemy.body[i].y });
      }
    }
    state.enemies.splice(index, 1);
    state.boost = Math.min(MAX_BOOST, state.boost + 22);
    setMessage("Cutoff landed. Pit opened up.");
    audio.playCue("cutoff");
    addShake(5.5, 0.12);
    spawnParticles(enemy.body[0].x * CELL + CELL / 2, enemy.body[0].y * CELL + CELL / 2, 16, enemy.color, { speed: 84, life: 0.55, radius: 4 });
  }

  function triggerCrash(snake, cell, reason) {
    const impact = cell || snake.body[0];
    const x = impact.x * CELL + CELL / 2;
    const y = impact.y * CELL + CELL / 2;
    const color = snake.isPlayer ? "#ecfff7" : snake.color;
    const count = snake.isPlayer ? 20 : 10;
    spawnParticles(x, y, count, color, { speed: snake.isPlayer ? 104 : 66, life: 0.5, radius: snake.isPlayer ? 4.5 : 3.2 });
    if (snake.isPlayer) {
      state.lastCrashReason = reason || "trap";
      audio.playCue("crash");
      addShake(7.5, 0.16);
    }
  }

  function advanceStage() {
    if (state.stageIndex === STAGES.length - 1) {
      state.mode = "win";
      audio.playCue("win");
      showOverlay(
        "Pit Cleared",
        "You outgrew every rival pack and crossed the final gate.",
        "Full run complete.",
        "Press Start Run to play again.",
        "Play Again"
      );
      return;
    }

    seedStage(state.stageIndex + 1);
    state.mode = "transition";
    audio.playCue("stage");
    addShake(6, 0.14);
    showOverlay(
      "Stage " + (state.stageIndex + 1),
      "The next pit loads more rocks and more rival snakes.",
      "Next goal: eat pellets, then break for the gate.",
      "Start when ready.",
      "Enter Next Pit"
    );
  }

  function lose(copy) {
    state.mode = "lose";
    audio.playCue("lose");
    addShake(8, 0.18);
    showOverlay(
      "Run Ended",
      copy,
      "Goal: stay alive long enough to open the gate.",
      "Press Start Run or tap R for a clean restart.",
      "Restart Run"
    );
  }

  function syncHud() {
    hudStage.textContent = state.stageIndex + 1 + " / " + STAGES.length;
    hudPellets.textContent = state.pelletsCollected + " / " + STAGES[state.stageIndex].pellets;
    hudLength.textContent = state.player ? String(state.player.body.length) : "0";
    hudBoost.textContent = Math.round(state.boost) + "%";
    hudGoal.textContent = state.gateOpen ? "Reach gate" : "Eat pellets";
    const readyAlpha = Math.min(1, state.boostReadyPulse * 2.2);
    hudBoost.style.color = readyAlpha > 0.02 ? "rgba(236,255,247," + (0.82 + readyAlpha * 0.18) + ")" : "";
    hudBoost.style.textShadow = readyAlpha > 0.02 ? "0 0 " + Math.round(10 + readyAlpha * 18) + "px rgba(125,255,155," + (0.24 + readyAlpha * 0.3) + ")" : "";
  }

  function update(dt) {
    state.pulse += dt;
    if (state.player) state.player.flash = Math.max(0, state.player.flash - dt * 0.001);
    state.shake = Math.max(0, state.shake - dt * 0.018);
    state.flash = Math.max(0, state.flash - dt * 0.0013);
    state.pulseGlow = Math.max(0, state.pulseGlow - dt * 0.0011);
    state.boostCueCooldown = Math.max(0, state.boostCueCooldown - dt);
    state.boostReadyPulse = Math.max(0, state.boostReadyPulse - dt * 0.0014);
    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (!state.messageTimer) {
        state.message = "";
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt * 0.001;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt * 0.001;
      particle.y += particle.vy * dt * 0.001;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
    }
    if (state.mode !== "playing") {
      updateThreatState(dt);
      audio.update(state);
      if (state.mode === "transition") return;
      syncHud();
      return;
    }

    queueDirection();
    state.timer += dt;
    const boostBefore = state.boost;
    state.boost = Math.min(MAX_BOOST, state.boost + dt * 0.016);
    if (state.boost <= 42) {
      state.boostArmed = true;
    }
    if (state.boostArmed && boostBefore < MAX_BOOST && state.boost >= MAX_BOOST) {
      state.boostArmed = false;
      state.boostReadyPulse = 1;
      audio.playCue("ready");
    }

    const stageSpeed = STAGES[state.stageIndex].speed;
    const stepTime = TICK_MS * stageSpeed;
    while (state.timer >= stepTime) {
      state.timer -= stepTime;

      const playerSteps = input.boost && state.boost >= 20 ? 2 : 1;
      if (playerSteps === 2) {
        state.boost = Math.max(0, state.boost - 18);
        if (state.boost <= 42) {
          state.boostArmed = true;
        }
        if (state.boostCueCooldown <= 0) {
          audio.playCue("boost");
          state.boostCueCooldown = 96;
        }
        spawnParticles(
          state.player.body[state.player.body.length - 1].x * CELL + CELL / 2,
          state.player.body[state.player.body.length - 1].y * CELL + CELL / 2,
          4,
          "#7dff9b",
          { speed: 42, life: 0.3, radius: 2.5, spread: Math.PI * 0.8, baseAngle: Math.atan2(-state.player.dir.y, -state.player.dir.x) }
        );
      }
      moveSnake(state.player, playerSteps);
      if (!state.player.alive) {
        lose(getCrashCopy(state.lastCrashReason));
        return;
      }
      if (state.mode !== "playing") return;

      for (const enemy of state.enemies) {
        enemy.nextDir = decideEnemyDirection(enemy);
      }

      for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = state.enemies[i];
        const enemySteps = Math.random() < 0.22 ? 2 : 1;
        moveSnake(enemy, enemySteps);
        if (!enemy.alive) {
          state.enemies.splice(i, 1);
        }
      }

      if (!state.player.alive) {
        lose(getCrashCopy(state.lastCrashReason || "enemy"));
        return;
      }
    }

    updateThreatState(dt);
    audio.update(state);
    syncHud();
  }

  function drawGrid() {
    const tint = STAGE_TINTS[state.stageIndex] || STAGE_TINTS[0];
    ctx.strokeStyle = colorWithAlpha(tint, 0.08);
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }
  }

  function drawBackgroundAtmosphere() {
    const tint = STAGE_TINTS[state.stageIndex] || STAGE_TINTS[0];
    const floorGlow = ctx.createLinearGradient(0, 0, 0, canvas.height);
    floorGlow.addColorStop(0, "rgba(4,10,14,0.18)");
    floorGlow.addColorStop(0.58, "rgba(4,10,14,0)");
    floorGlow.addColorStop(1, colorWithAlpha(tint, 0.12 + state.stageIndex * 0.015));
    ctx.fillStyle = floorGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 18; i += 1) {
      const lane = i / 18;
      const x = (lane * canvas.width + (state.pulse * (8 + i)) % (canvas.width + 220)) % (canvas.width + 220) - 110;
      const y = 46 + (i % 6) * 94 + Math.sin(state.pulse * 0.0013 + i * 1.7) * 18;
      const radius = 18 + (i % 3) * 7;
      const alpha = 0.04 + (i % 2) * 0.012;
      ctx.fillStyle = colorWithAlpha(tint, alpha);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.gateOpen) {
      const gateCenter = cellCenter(state.gate);
      const gateAura = ctx.createRadialGradient(gateCenter.x, gateCenter.y, 18, gateCenter.x, gateCenter.y, 130);
      gateAura.addColorStop(0, "rgba(125,255,155,0.2)");
      gateAura.addColorStop(1, "rgba(125,255,155,0)");
      ctx.fillStyle = gateAura;
      ctx.fillRect(gateCenter.x - 130, gateCenter.y - 130, 260, 260);
    }
  }

  function drawRocks() {
    for (const rock of state.rocks) {
      const x = rock.x * CELL;
      const y = rock.y * CELL;
      const tint = STAGE_TINTS[state.stageIndex] || STAGE_TINTS[0];
      const face = ctx.createLinearGradient(x + 4, y + 4, x + CELL - 4, y + CELL - 4);
      face.addColorStop(0, "#4b5e68");
      face.addColorStop(0.52, "#31434d");
      face.addColorStop(1, "#1b262d");
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x + 6, y + 7, CELL - 8, CELL - 8);
      ctx.fillStyle = face;
      ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
      ctx.strokeStyle = colorWithAlpha(tint, 0.22);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 4.5, y + 4.5, CELL - 9, CELL - 9);
      ctx.strokeStyle = "rgba(236,255,247,0.12)";
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 8);
      ctx.lineTo(x + CELL - 10, y + 8);
      ctx.lineTo(x + 8, y + CELL - 10);
      ctx.stroke();
    }
  }

  function drawPellets() {
    for (const pellet of state.pellets) {
      const cx = pellet.x * CELL + CELL / 2;
      const cy = pellet.y * CELL + CELL / 2;
      ctx.fillStyle = "#ffd868";
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + Math.sin(state.pulse * 0.006 + pellet.x) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const particle of state.particles) {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = colorWithAlpha(particle.color, alpha * 0.95);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * (0.6 + alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawIntentGuides() {
    if (!state.player) return;
    const snakes = [state.player].concat(state.enemies);
    for (const snake of snakes) {
      if (!snake.alive) continue;
      const projectedDir = snake.nextDir || snake.dir;
      const steps = snake.isPlayer ? 2 : 1;
      for (let step = 1; step <= steps; step += 1) {
        const probe = {
          x: snake.body[0].x + projectedDir.x * step,
          y: snake.body[0].y + projectedDir.y * step
        };
        if (!inBounds(probe) || state.rocks.some((rock) => sameCell(rock, probe))) {
          break;
        }
        const x = probe.x * CELL + 7;
        const y = probe.y * CELL + 7;
        const alpha = snake.isPlayer ? 0.2 - (step - 1) * 0.06 : 0.12;
        ctx.strokeStyle = colorWithAlpha(snake.isPlayer ? "#ecfff7" : snake.color, alpha);
        ctx.lineWidth = snake.isPlayer ? 2 : 1.4;
        ctx.setLineDash(snake.isPlayer ? [8, 5] : [4, 6]);
        ctx.strokeRect(x, y, CELL - 14, CELL - 14);
        ctx.setLineDash([]);
      }
    }
  }

  function drawThreatTelegraphs() {
    if (!state.threats.length) return;
    for (const threat of state.threats) {
      const headCenter = cellCenter(threat.head);
      const playerCenter = cellCenter(threat.playerHead);
      const pulse = 0.55 + Math.sin(state.pulse * 0.018 + threat.enemyIndex) * 0.18;
      const alpha = threat.level === 2 ? 0.34 : 0.2;
      ctx.strokeStyle = "rgba(255,108,116," + (alpha * pulse) + ")";
      ctx.fillStyle = "rgba(255,108,116," + (0.12 * pulse) + ")";
      ctx.lineWidth = threat.level === 2 ? 3.5 : 2;
      ctx.setLineDash(threat.lineThreat ? [10, 8] : [6, 10]);
      ctx.beginPath();
      if (threat.lineThreat) {
        ctx.moveTo(headCenter.x, headCenter.y);
        ctx.lineTo(playerCenter.x, playerCenter.y);
      } else {
        ctx.moveTo(headCenter.x, headCenter.y);
        ctx.lineTo(headCenter.x + threat.dir.x * CELL * 1.6, headCenter.y + threat.dir.y * CELL * 1.6);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(headCenter.x, headCenter.y, threat.level === 2 ? 15 : 11, 0, Math.PI * 2);
      ctx.stroke();

      const arrowX = headCenter.x + threat.dir.x * 12;
      const arrowY = headCenter.y + threat.dir.y * 12;
      ctx.beginPath();
      ctx.arc(arrowX, arrowY, threat.level === 2 ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const playerCenter = cellCenter(state.player.body[0]);
    const strongest = state.threats.some((threat) => threat.level === 2) ? 2 : 1;
    ctx.strokeStyle = strongest === 2 ? "rgba(255,108,116,0.48)" : "rgba(255,108,116,0.3)";
    ctx.lineWidth = strongest === 2 ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(playerCenter.x, playerCenter.y, strongest === 2 ? 19 : 15, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBoostWake() {
    if (!state.player || !state.player.alive) return;
    const boosting = input.boost && state.mode === "playing" && state.boost < MAX_BOOST;
    const cueActive = boosting || state.boostCueCooldown > 30;
    if (!cueActive) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < state.player.body.length; i += 1) {
      const segment = state.player.body[i];
      const center = cellCenter(segment);
      const length = 18 + i * 6;
      const angle = Math.atan2(-state.player.dir.y, -state.player.dir.x);
      const spread = 6 + i * 2;
      const alpha = Math.max(0.05, 0.24 - i * 0.04);
      ctx.strokeStyle = "rgba(125,255,155," + alpha + ")";
      ctx.lineWidth = Math.max(1.2, 4 - i * 0.7);
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(angle + 0.1) * 5, center.y + Math.sin(angle + 0.1) * 5);
      ctx.lineTo(center.x + Math.cos(angle) * length, center.y + Math.sin(angle) * length + spread * Math.sin(state.pulse * 0.02 + i));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGate() {
    const x = state.gate.x * CELL;
    const y = state.gate.y * CELL;
    const open = state.gateOpen;
    ctx.fillStyle = open ? "rgba(125, 255, 155, 0.2)" : "rgba(255, 108, 116, 0.14)";
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.strokeStyle = open ? "#7dff9b" : "#ff6c74";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8);
    if (open) {
      ctx.strokeStyle = "rgba(125, 255, 155, " + (0.22 + Math.sin(state.pulse * 0.01) * 0.12) + ")";
      ctx.lineWidth = 8;
      ctx.strokeRect(x - 2, y - 2, CELL + 4, CELL + 4);
      const gateCenter = cellCenter(state.gate);
      for (let i = 0; i < 4; i += 1) {
        const angle = state.pulse * 0.01 + i * Math.PI * 0.5;
        const orbitX = gateCenter.x + Math.cos(angle) * 20;
        const orbitY = gateCenter.y + Math.sin(angle) * 20;
        ctx.fillStyle = "rgba(125,255,155,0.7)";
        ctx.beginPath();
        ctx.arc(orbitX, orbitY, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSnake(snake) {
    for (let i = snake.body.length - 1; i >= 0; i -= 1) {
      const cell = snake.body[i];
      const x = cell.x * CELL;
      const y = cell.y * CELL;
      const scale = i === 0 ? 1 : 0.9;
      ctx.fillStyle = i === 0 ? snake.color : shadeColor(snake.color, -12 * i);
      if (snake.isPlayer && snake.flash > 0) {
        ctx.fillStyle = "#ecfff7";
      }
      const pad = i === 0 ? 2 : 4;
      const size = CELL - pad * 2;
      const actualSize = size * scale;
      const offset = pad + (size - actualSize) * 0.5;
      ctx.shadowColor = snake.isPlayer ? "rgba(125,255,155,0.28)" : colorWithAlpha(snake.color, 0.18);
      ctx.shadowBlur = i === 0 ? 10 : 4;
      ctx.beginPath();
      ctx.roundRect(x + offset, y + offset, actualSize, actualSize, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (i === 0) {
        const centerX = x + CELL / 2;
        const centerY = y + CELL / 2;
        const eyeOffsetX = snake.dir.x * 4 + (snake.dir.y !== 0 ? 4 : 0);
        const eyeOffsetY = snake.dir.y * 4 + (snake.dir.x !== 0 ? 4 : 0);
        ctx.fillStyle = snake.isPlayer ? "#082112" : "rgba(7,16,24,0.92)";
        ctx.beginPath();
        ctx.arc(centerX - eyeOffsetY * 0.5 + eyeOffsetX, centerY + eyeOffsetX * 0.08 - eyeOffsetY, 1.8, 0, Math.PI * 2);
        ctx.arc(centerX + eyeOffsetY * 0.5 + eyeOffsetX, centerY - eyeOffsetX * 0.08 - eyeOffsetY, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function shadeColor(hex, amount) {
    const value = hex.replace("#", "");
    const num = parseInt(value, 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (num & 255) + amount));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function colorWithAlpha(color, alpha) {
    if (color.startsWith("#")) {
      const value = color.replace("#", "");
      const num = parseInt(value, 16);
      const r = num >> 16;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    return color;
  }

  function drawPostFx() {
    const tint = STAGE_TINTS[state.stageIndex] || STAGE_TINTS[0];
    const vignette = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.52, 120, canvas.width * 0.5, canvas.height * 0.52, 640);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(125, 255, 155, " + Math.min(0.13, state.pulseGlow * 0.45) + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const stageWash = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    stageWash.addColorStop(0, colorWithAlpha(tint, 0.025));
    stageWash.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = stageWash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.threats.length) {
      const threatAlpha = Math.min(0.1, state.threatPulse * 0.5 + state.threats.length * 0.012);
      ctx.fillStyle = "rgba(255,108,116," + threatAlpha + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (state.flash > 0.01) {
      ctx.fillStyle = "rgba(255,255,255," + Math.min(0.16, state.flash) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = "rgba(255,255,255,0.028)";
    for (let y = 0; y < canvas.height; y += 6) {
      ctx.fillRect(0, y, canvas.width, 1);
    }

    if (state.mode === "playing" && state.boostCueCooldown > 0) {
      ctx.strokeStyle = "rgba(125,255,155," + Math.min(0.16, state.boostCueCooldown / 520) + ")";
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    }

    if (state.mode === "playing" && state.boostReadyPulse > 0 && state.player) {
      const center = cellCenter(state.player.body[0]);
      const alpha = Math.min(0.3, state.boostReadyPulse * 0.24);
      ctx.strokeStyle = "rgba(125,255,155," + alpha + ")";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 20 + (1 - state.boostReadyPulse) * 24, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawMessage() {
    if (!state.message || state.mode !== "playing") return;
    ctx.fillStyle = "rgba(3, 9, 13, 0.72)";
    ctx.fillRect(250, 14, 460, 34);
    ctx.fillStyle = "#ecfff7";
    ctx.font = "16px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(state.message, canvas.width / 2, 36);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const offsetX = state.shake > 0.05 ? Math.sin(state.pulse * 0.075) * state.shake : 0;
    const offsetY = state.shake > 0.05 ? Math.cos(state.pulse * 0.06) * state.shake * 0.65 : 0;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.fillStyle = "#0b1820";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawBackgroundAtmosphere();
    drawGrid();
    drawGate();
    drawRocks();
    drawPellets();
    drawIntentGuides();
    drawThreatTelegraphs();
    drawBoostWake();
    if (state.player) drawSnake(state.player);
    state.enemies.forEach(drawSnake);
    drawParticles();
    drawMessage();
    ctx.restore();
    drawPostFx();
  }

  function frame(time) {
    if (!frame.last) frame.last = time;
    const dt = Math.min(32, time - frame.last);
    frame.last = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function restart() {
    startGame();
  }

  document.addEventListener("keydown", (event) => {
    if (event.code === "KeyR") {
      restart();
      return;
    }
    if (event.code === "Enter") {
      if (state.mode === "menu" || state.mode === "lose" || state.mode === "win") {
        startGame();
      } else if (state.mode === "transition") {
        state.mode = "playing";
        audio.ensureContext();
        audio.playCue("stage");
        hideOverlay();
      }
      return;
    }
    const mapped = directionMap[event.code];
    if (mapped) {
      input[mapped] = true;
      event.preventDefault();
    }
  });

  document.addEventListener("keyup", (event) => {
    const mapped = directionMap[event.code];
    if (mapped) {
      input[mapped] = false;
      event.preventDefault();
    }
  });

  startButton.addEventListener("click", () => {
    if (state.mode === "transition") {
      state.mode = "playing";
      audio.ensureContext();
      audio.playCue("stage");
      hideOverlay();
      return;
    }
    startGame();
  });

  audioButton.addEventListener("click", () => {
    const order = ["full", "low", "mute"];
    const current = order.findIndex((profileId) => AUDIO_PROFILES[profileId].label === audioButton.textContent);
    const nextProfileId = order[(current + 1 + order.length) % order.length];
    audio.ensureContext();
    setAudioProfile(nextProfileId);
    saveAudioProfileId(nextProfileId);
  });

  seedStage(0);
  setAudioProfile(loadAudioProfileId());
  showOverlay(
    "Snake Pit Arena",
    "Outgrow the pit, open the exit gate, and cross it before rival snakes close the path.",
    "Collect pellets to unlock the gate.",
    "You can restart at any time with R.",
    "Start Run"
  );
  requestAnimationFrame(frame);

  function createAudioEngine() {
    let context = null;
    let master = null;
    let musicGain = null;
    let profile = AUDIO_PROFILES.full;
    let step = 0;
    let nextNoteTime = 0;
    let nextRhythmTime = 0;
    let rhythmStep = 0;
    let noiseBuffer = null;

    function ensureContext() {
      if (context) {
        if (context.state === "suspended") {
          context.resume().catch(() => {});
        }
        return context;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = profile.master;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.0001;
      musicGain.connect(master);
      nextNoteTime = context.currentTime;
      nextRhythmTime = context.currentTime;
      return context;
    }

    function ensureNoiseBuffer() {
      if (!context || noiseBuffer) return noiseBuffer;
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      return noiseBuffer;
    }

    function setProfile(nextProfile) {
      profile = nextProfile;
      if (!context || !master || !musicGain) return;
      const ctx = context;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(profile.master, ctx.currentTime + 0.12);
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(profile.music * 0.12, ctx.currentTime + 0.2);
    }

    function oneShot(type, frequency, duration, gainValue, options = {}) {
      return toneShotAt(ensureContext()?.currentTime ?? 0, type, frequency, duration, gainValue, options);
    }

    function toneShotAt(startTime, type, frequency, duration, gainValue, options = {}) {
      const ctx = ensureContext();
      if (!ctx || !master) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = options.filterType || "lowpass";
      filter.frequency.value = options.filterFreq || 1800;
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, startTime);
      if (options.sweep) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * options.sweep), startTime + duration);
      }
      gain.gain.setValueAtTime(gainValue, startTime);
      if (options.attack) {
        gain.gain.linearRampToValueAtTime(gainValue, startTime + options.attack);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    function noiseShotAt(startTime, duration, gainValue, options = {}) {
      const ctx = ensureContext();
      if (!ctx || !master) return;
      const buffer = ensureNoiseBuffer();
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = options.filterType || "bandpass";
      filter.frequency.value = options.filterFreq || 1400;
      filter.Q.value = options.q || 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(startTime);
      source.stop(startTime + duration);
    }

    function playCue(name) {
      if (profile.music <= 0 && profile.master <= 0.001) return;
      switch (name) {
        case "start":
          oneShot("triangle", 260, 0.24, 0.08, { sweep: 1.5, filterFreq: 1600 });
          oneShot("sine", 390, 0.16, 0.035, { sweep: 1.22, filterFreq: 2200 });
          break;
        case "crash":
          oneShot("sawtooth", 220, 0.2, 0.08, { sweep: 0.48, filterFreq: 860 });
          noiseShotAt(ensureContext()?.currentTime ?? 0, 0.16, 0.055, { filterType: "lowpass", filterFreq: 920, q: 1.1 });
          break;
        case "pellet":
          oneShot("square", 680, 0.1, 0.036, { sweep: 1.25, filterFreq: 2400 });
          oneShot("triangle", 980, 0.08, 0.018, { sweep: 0.92, filterFreq: 2800 });
          break;
        case "warning":
          oneShot("square", 540, 0.08, 0.03, { sweep: 1.08, filterFreq: 2200 });
          oneShot("square", 420, 0.12, 0.022, { sweep: 0.96, filterFreq: 1800 });
          noiseShotAt(ensureContext()?.currentTime ?? 0, 0.08, 0.018, { filterType: "highpass", filterFreq: 2800, q: 0.7 });
          break;
        case "gate":
          oneShot("triangle", 420, 0.4, 0.07, { sweep: 1.8, filterFreq: 1800 });
          oneShot("sine", 620, 0.28, 0.03, { sweep: 1.35, filterFreq: 2400 });
          break;
        case "cutoff":
          oneShot("sawtooth", 180, 0.22, 0.08, { sweep: 1.6, filterFreq: 1100 });
          noiseShotAt(ensureContext()?.currentTime ?? 0, 0.14, 0.028, { filterType: "bandpass", filterFreq: 1800, q: 1.4 });
          break;
        case "boost":
          oneShot("triangle", 320, 0.11, 0.022, { sweep: 1.18, filterFreq: 1800 });
          noiseShotAt(ensureContext()?.currentTime ?? 0, 0.09, 0.014, { filterType: "highpass", filterFreq: 2600, q: 0.9 });
          break;
        case "ready":
          oneShot("triangle", 520, 0.14, 0.026, { sweep: 1.12, filterFreq: 2400 });
          oneShot("sine", 780, 0.16, 0.018, { sweep: 1.06, filterFreq: 3000 });
          break;
        case "stage":
          oneShot("triangle", 310, 0.28, 0.07, { sweep: 1.7, filterFreq: 1500 });
          oneShot("sine", 470, 0.24, 0.03, { sweep: 1.4, filterFreq: 2200 });
          break;
        case "lose":
          oneShot("sawtooth", 160, 0.42, 0.09, { sweep: 0.55, filterFreq: 900 });
          noiseShotAt(ensureContext()?.currentTime ?? 0, 0.22, 0.032, { filterType: "lowpass", filterFreq: 720, q: 1.1 });
          break;
        case "win":
          oneShot("triangle", 520, 0.44, 0.08, { sweep: 1.65, filterFreq: 2200 });
          oneShot("sine", 780, 0.24, 0.03, { sweep: 1.3, filterFreq: 2600 });
          break;
      }
    }

    function update(currentState) {
      if (!context || !musicGain) return;
      const ctx = context;
      const energy = currentState.mode === "playing" ? 1 : currentState.mode === "transition" ? 0.45 : 0.2;
      const danger = currentState.mode === "playing"
        ? Math.min(1, currentState.enemies.length / 5 + (1 - currentState.boost / MAX_BOOST) * 0.35 + (currentState.gateOpen ? 0.18 : 0))
        : 0.18;
      const targetGain = profile.music > 0 ? (0.035 + danger * 0.035) * profile.music * energy : 0.0001;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.15);

      while (nextNoteTime < ctx.currentTime + 0.18) {
        const scale = currentState.mode === "lose"
          ? [0, -3, -5, -7]
          : currentState.mode === "win"
            ? [0, 4, 7, 11]
            : currentState.gateOpen
              ? [0, 3, 7, 10]
              : [0, 2, 5, 7];
        const root = 164.81 + currentState.stageIndex * 16;
        const semitone = scale[step % scale.length];
        const frequency = root * Math.pow(2, semitone / 12);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = currentState.mode === "playing" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(frequency, nextNoteTime);
        gain.gain.setValueAtTime(0.0001, nextNoteTime);
        gain.gain.linearRampToValueAtTime(targetGain * 0.85, nextNoteTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + 0.24);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + 0.28);

        if (step % 2 === 0) {
          const bass = ctx.createOscillator();
          const bassGain = ctx.createGain();
          bass.type = "sine";
          bass.frequency.setValueAtTime(root * 0.5, nextNoteTime);
          bassGain.gain.setValueAtTime(targetGain * 0.42, nextNoteTime);
          bassGain.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + 0.35);
          bass.connect(bassGain);
          bassGain.connect(musicGain);
          bass.start(nextNoteTime);
          bass.stop(nextNoteTime + 0.36);
        }

        nextNoteTime += currentState.mode === "playing" ? 0.18 - Math.min(0.04, danger * 0.03) : 0.26;
        step += 1;
      }

      while (nextRhythmTime < ctx.currentTime + 0.24) {
        if (currentState.mode === "playing" && profile.music > 0) {
          const beatSpacing = 0.36 - Math.min(0.06, danger * 0.05);
          const kickFreq = currentState.gateOpen ? 62 : 54;
          toneShotAt(nextRhythmTime, "sine", kickFreq, 0.16, targetGain * 1.55, { sweep: 0.62, filterFreq: 260 });
          if (rhythmStep % 2 === 1) {
            noiseShotAt(nextRhythmTime, 0.09, targetGain * 0.8, { filterType: "bandpass", filterFreq: 1900, q: 0.85 });
          }
          noiseShotAt(nextRhythmTime + beatSpacing * 0.5, 0.05, targetGain * 0.42, { filterType: "highpass", filterFreq: 4400, q: 0.7 });
          if (currentState.threats.length) {
            toneShotAt(nextRhythmTime + beatSpacing * 0.5, "triangle", 210, 0.1, targetGain * 0.38, { sweep: 0.88, filterFreq: 620 });
          }
          nextRhythmTime += beatSpacing;
        } else {
          nextRhythmTime += 0.42;
        }
        rhythmStep += 1;
      }
    }

    return { ensureContext, playCue, setProfile, update };
  }
})();
