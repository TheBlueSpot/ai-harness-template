(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const goalEl = document.getElementById("goal");
  const speedEl = document.getElementById("speed");
  const chainEl = document.getElementById("chain");
  const statusLineEl = document.getElementById("status-line");
  const hintLineEl = document.getElementById("hint-line");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayCopyEl = document.getElementById("overlay-copy");
  const overlayButtonEl = document.getElementById("overlay-button");

  const COLS = 6;
  const ROWS = 12;
  const HIDDEN_ROWS = 2;
  const CELL = 54;
  const BOARD_X = 108;
  const BOARD_Y = 58;
  const VISIBLE_HEIGHT = ROWS * CELL;
  const COLORS = [
    { id: "ruby", fill: "#ec5a68", accent: "#ffd4da" },
    { id: "citrus", fill: "#f5b24f", accent: "#fff0b8" },
    { id: "leaf", fill: "#74d87d", accent: "#d8ffde" },
    { id: "aqua", fill: "#4fc6d9", accent: "#d7fbff" },
    { id: "iris", fill: "#8b7af0", accent: "#ece8ff" },
    { id: "rose", fill: "#df6fc4", accent: "#ffd9f6" }
  ];
  const SCORE_TARGET = 4000;
  const audio = createAudioEngine();

  let state = null;
  let lastTime = 0;

  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
    raise: false
  };

  function createTile(colorIndex) {
    return {
      color: colorIndex,
      state: "idle",
      timer: 0,
      chain: 0
    };
  }

  function boardPixelX(x) {
    return BOARD_X + x * CELL + CELL * 0.5;
  }

  function boardPixelY(boardY) {
    return BOARD_Y + (boardY - HIDDEN_ROWS) * CELL + CELL * 0.5 - state.riseOffset;
  }

  function createAudioEngine() {
    const audioState = {
      ctx: null,
      master: null,
      musicGain: null,
      sfxGain: null,
      lowpass: null,
      unlocked: false,
      nextBeatAt: 0,
      beatIndex: 0,
      dangerPulseAt: 0
    };

    function ensureContext() {
      if (audioState.ctx) {
        return audioState.ctx;
      }
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }
      const ctx = new AudioContextCtor();
      const master = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      const musicGain = ctx.createGain();
      const sfxGain = ctx.createGain();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1800;
      master.gain.value = 0.22;
      musicGain.gain.value = 0.42;
      sfxGain.gain.value = 0.78;
      musicGain.connect(master);
      sfxGain.connect(master);
      master.connect(lowpass);
      lowpass.connect(ctx.destination);
      audioState.ctx = ctx;
      audioState.master = master;
      audioState.musicGain = musicGain;
      audioState.sfxGain = sfxGain;
      audioState.nextBeatAt = ctx.currentTime;
      return ctx;
    }

    function unlock() {
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }
      audioState.unlocked = true;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    }

    function pulseNoise(start, duration, gainValue, filterFrequency) {
      const ctx = ensureContext();
      if (!ctx || !audioState.unlocked) {
        return;
      }
      const source = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(filterFrequency, start);
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioState.sfxGain);
      source.start(start);
      source.stop(start + duration);
    }

    function chirp(type, frequency, duration, gainValue, detune = 0, destination = "sfx") {
      const ctx = ensureContext();
      if (!ctx || !audioState.unlocked) {
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.detune.setValueAtTime(detune, ctx.currentTime);
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(destination === "music" ? audioState.musicGain : audioState.sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      return { osc, gain, ctx };
    }

    function playMove() {
      chirp("square", 540, 0.03, 0.02, rand(-8, 8));
    }

    function playSwap() {
      chirp("triangle", 320, 0.07, 0.045, 0);
      chirp("square", 420, 0.05, 0.024, 6);
    }

    function playRaise() {
      chirp("sawtooth", 170, 0.12, 0.04, -2);
      pulseNoise(ensureContext()?.currentTime ?? 0, 0.08, 0.02, 420);
    }

    function playClear(cleared, chain) {
      const base = 360 + Math.min(240, cleared * 28);
      chirp("triangle", base, 0.12, 0.05, 0);
      chirp("square", base * (chain > 1 ? 1.5 : 1.25), 0.16, 0.035, 4);
      if (chain > 1) {
        chirp("sine", base * 2, 0.24, 0.03, 0);
      }
      pulseNoise(ensureContext()?.currentTime ?? 0, 0.14, 0.045, 1200 + chain * 220);
    }

    function playDanger() {
      const ctx = ensureContext();
      if (!ctx || !audioState.unlocked) {
        return;
      }
      if (ctx.currentTime < audioState.dangerPulseAt) {
        return;
      }
      audioState.dangerPulseAt = ctx.currentTime + 0.48;
      chirp("sine", 148, 0.22, 0.04);
      chirp("square", 296, 0.12, 0.012, -6);
    }

    function playLose() {
      chirp("sawtooth", 180, 0.35, 0.05, -14);
      chirp("triangle", 110, 0.48, 0.05, -8);
      pulseNoise(ensureContext()?.currentTime ?? 0, 0.22, 0.06, 320);
    }

    function playWin() {
      chirp("triangle", 420, 0.16, 0.05);
      chirp("triangle", 560, 0.18, 0.045, 2);
      chirp("sine", 840, 0.28, 0.03);
    }

    function updateMusic() {
      if (!audioState.unlocked || !state || state.mode !== "playing") {
        return;
      }
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }
      const beatDuration = Math.max(0.24, 0.42 - (state.phase - 1) * 0.032 - (state.danger ? 0.05 : 0));
      while (audioState.nextBeatAt < ctx.currentTime + 0.18) {
        const beat = audioState.beatIndex;
        const root = state.danger ? 146.83 : 174.61;
        const bass = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bass.type = "triangle";
        bass.frequency.setValueAtTime(root * (beat % 8 === 4 ? 1.122 : 1), audioState.nextBeatAt);
        bassGain.gain.setValueAtTime(0.0001, audioState.nextBeatAt);
        bassGain.gain.linearRampToValueAtTime(state.danger ? 0.05 : 0.035, audioState.nextBeatAt + 0.012);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, audioState.nextBeatAt + beatDuration * 0.88);
        bass.connect(bassGain);
        bassGain.connect(audioState.musicGain);
        bass.start(audioState.nextBeatAt);
        bass.stop(audioState.nextBeatAt + beatDuration * 0.95);

        if (beat % 2 === 0) {
          const top = ctx.createOscillator();
          const topGain = ctx.createGain();
          top.type = "square";
          top.frequency.setValueAtTime(root * (beat % 4 === 0 ? 2 : 1.5), audioState.nextBeatAt);
          topGain.gain.setValueAtTime(0.0001, audioState.nextBeatAt);
          topGain.gain.linearRampToValueAtTime(0.012 + state.phase * 0.002, audioState.nextBeatAt + 0.01);
          topGain.gain.exponentialRampToValueAtTime(0.0001, audioState.nextBeatAt + beatDuration * 0.5);
          top.connect(topGain);
          topGain.connect(audioState.musicGain);
          top.start(audioState.nextBeatAt);
          top.stop(audioState.nextBeatAt + beatDuration * 0.55);
        }

        audioState.beatIndex += 1;
        audioState.nextBeatAt += beatDuration;
      }
    }

    return {
      unlock,
      playMove,
      playSwap,
      playRaise,
      playClear,
      playDanger,
      playLose,
      playWin,
      updateMusic
    };
  }

  function createParticle(x, y, color, options = {}) {
    return {
      x,
      y,
      vx: options.vx ?? rand(-60, 60),
      vy: options.vy ?? rand(-120, -20),
      life: options.life ?? 0.45,
      maxLife: options.life ?? 0.45,
      radius: options.radius ?? rand(3, 7),
      color,
      alpha: options.alpha ?? 0.7
    };
  }

  function createShockwave(x, y, color, radius, life) {
    return { x, y, color, radius, life, maxLife: life };
  }

  function spawnBurst(x, y, color, count, options = {}) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push(createParticle(x, y, color, options));
    }
  }

  function addBoardPulse(amount) {
    state.boardPulse = Math.min(1, state.boardPulse + amount);
  }

  function addShake(amount) {
    state.shake = Math.min(12, state.shake + amount);
  }

  function updateEffects(dt) {
    state.shake = Math.max(0, state.shake - dt * 20);
    state.boardPulse = Math.max(0, state.boardPulse - dt * 1.8);
    state.vignettePulse = Math.max(0, state.vignettePulse - dt * 1.1);
    state.scanlineOffset = (state.scanlineOffset + dt * 48) % 6;
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 210 * dt;
    }
    for (let i = state.shockwaves.length - 1; i >= 0; i -= 1) {
      const ring = state.shockwaves[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        state.shockwaves.splice(i, 1);
        continue;
      }
      ring.radius += dt * 180;
    }
  }

  function randColor() {
    return Math.floor(Math.random() * COLORS.length);
  }

  function createBoard() {
    const totalRows = ROWS + HIDDEN_ROWS + 2;
    const board = [];
    for (let y = 0; y < totalRows; y += 1) {
      const row = [];
      for (let x = 0; x < COLS; x += 1) {
        row.push(null);
      }
      board.push(row);
    }
    return board;
  }

  function createPreviewRow(board) {
    const row = [];
    for (let x = 0; x < COLS; x += 1) {
      let color = randColor();
      let guard = 0;
      while (guard < 8) {
        const left1 = row[x - 1];
        const left2 = row[x - 2];
        const below1 = board[1] ? board[1][x] : null;
        const below2 = board[2] ? board[2][x] : null;
        const badHorizontal = left1 !== undefined && left2 !== undefined && left1 === color && left2 === color;
        const badVertical = below1 && below2 && below1.color === color && below2.color === color;
        if (!badHorizontal && !badVertical) {
          break;
        }
        color = randColor();
        guard += 1;
      }
      row.push(color);
    }
    return row;
  }

  function setupInitialStack(board) {
    for (let y = HIDDEN_ROWS + 5; y < HIDDEN_ROWS + ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        let color = randColor();
        let guard = 0;
        while (guard < 10) {
          const left1 = board[y][x - 1];
          const left2 = board[y][x - 2];
          const down1 = board[y + 1] ? board[y + 1][x] : null;
          const down2 = board[y + 2] ? board[y + 2][x] : null;
          const badHorizontal = left1 && left2 && left1.color === color && left2.color === color;
          const badVertical = down1 && down2 && down1.color === color && down2.color === color;
          if (!badHorizontal && !badVertical) {
            break;
          }
          color = randColor();
          guard += 1;
        }
        board[y][x] = createTile(color);
      }
    }
  }

  function resetGame() {
    const board = createBoard();
    setupInitialStack(board);
    state = {
      mode: "menu",
      board,
      previewRow: createPreviewRow(board),
      riseOffset: 0,
      riseBase: 10,
      cursorX: 2,
      cursorY: ROWS - 4,
      score: 0,
      chain: 0,
      highestChain: 0,
      danger: false,
      phase: 1,
      swapCooldown: 0,
      moveCooldown: 0,
      comboFlash: 0,
      chainMessage: "",
      topDangerTimer: 0,
      particles: [],
      shockwaves: [],
      boardPulse: 0,
      vignettePulse: 0,
      scanlineOffset: 0,
      shake: 0
    };
    syncHud();
    setStatus("Match 3+ panels. Hold the top line low.", "Arrow keys move. Space swaps. Shift raises. Enter starts or restarts.");
    showOverlay("Panel Panic Rising", "Swap adjacent panels into lines of 3 or more before the stack reaches the ceiling.", "Start");
  }

  function setStatus(primary, secondary) {
    statusLineEl.textContent = primary;
    hintLineEl.textContent = secondary;
  }

  function showOverlay(title, copy, button) {
    overlayTitleEl.textContent = title;
    overlayCopyEl.textContent = copy;
    overlayButtonEl.textContent = button;
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function startGame() {
    audio.unlock();
    resetGame();
    state.mode = "playing";
    hideOverlay();
    state.boardPulse = 0.3;
    setStatus("Build fast clears before the stack climbs.", "Manual raise is strongest when you already see the next match.");
  }

  function updatePhase() {
    state.phase = Math.min(5, 1 + Math.floor(state.score / 900));
    state.riseBase = 10 + (state.phase - 1) * 3.4;
  }

  function syncHud() {
    scoreEl.textContent = String(state.score);
    goalEl.textContent = String(SCORE_TARGET);
    speedEl.textContent = state.phase.toFixed(0);
    chainEl.textContent = String(Math.max(state.chain, state.highestChain));
  }

  function boardTopReached() {
    for (let x = 0; x < COLS; x += 1) {
      if (state.board[0][x]) {
        return true;
      }
    }
    return false;
  }

  function moveCursor(dx, dy) {
    const nextX = Math.max(0, Math.min(COLS - 2, state.cursorX + dx));
    const nextY = Math.max(0, Math.min(ROWS - 1, state.cursorY + dy));
    if (nextX !== state.cursorX || nextY !== state.cursorY) {
      state.cursorX = nextX;
      state.cursorY = nextY;
      audio.playMove();
    }
  }

  function tileAtVisible(x, visibleY) {
    const boardY = visibleY + HIDDEN_ROWS;
    return state.board[boardY] ? state.board[boardY][x] : null;
  }

  function canSwap(tile) {
    return !tile || tile.state === "idle";
  }

  function swapCursor() {
    if (state.swapCooldown > 0) {
      return;
    }
    const boardY = state.cursorY + HIDDEN_ROWS;
    const a = state.board[boardY][state.cursorX];
    const b = state.board[boardY][state.cursorX + 1];
    if (!canSwap(a) || !canSwap(b)) {
      return;
    }
    state.board[boardY][state.cursorX] = b;
    state.board[boardY][state.cursorX + 1] = a;
    state.swapCooldown = 0.09;
    state.boardPulse = Math.max(state.boardPulse, 0.08);
    audio.playSwap();
  }

  function markMatches() {
    const marks = new Set();
    const board = state.board;
    for (let y = 0; y < board.length; y += 1) {
      let runColor = -1;
      let runStart = 0;
      let runLength = 0;
      for (let x = 0; x <= COLS; x += 1) {
        const tile = x < COLS ? board[y][x] : null;
        const color = tile && tile.state === "idle" ? tile.color : -1;
        if (color === runColor) {
          runLength += 1;
        } else {
          if (runColor !== -1 && runLength >= 3) {
            for (let markX = runStart; markX < runStart + runLength; markX += 1) {
              marks.add(`${markX},${y}`);
            }
          }
          runColor = color;
          runStart = x;
          runLength = color === -1 ? 0 : 1;
        }
      }
    }

    for (let x = 0; x < COLS; x += 1) {
      let runColor = -1;
      let runStart = 0;
      let runLength = 0;
      for (let y = 0; y <= board.length; y += 1) {
        const tile = y < board.length ? board[y][x] : null;
        const color = tile && tile.state === "idle" ? tile.color : -1;
        if (color === runColor) {
          runLength += 1;
        } else {
          if (runColor !== -1 && runLength >= 3) {
            for (let markY = runStart; markY < runStart + runLength; markY += 1) {
              marks.add(`${x},${markY}`);
            }
          }
          runColor = color;
          runStart = y;
          runLength = color === -1 ? 0 : 1;
        }
      }
    }

    let found = 0;
    marks.forEach((key) => {
      const [xText, yText] = key.split(",");
      const x = Number(xText);
      const y = Number(yText);
      const tile = board[y][x];
      if (tile && tile.state === "idle") {
        tile.state = "matching";
        tile.timer = 0.22;
        tile.chain = state.chain;
        found += 1;
      }
    });
    return found;
  }

  function applyGravity() {
    let moved = false;
    for (let y = state.board.length - 2; y >= 0; y -= 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = state.board[y][x];
        if (!tile || tile.state !== "idle") {
          continue;
        }
        let targetY = y;
        while (targetY + 1 < state.board.length && state.board[targetY + 1][x] === null) {
          targetY += 1;
        }
        if (targetY !== y) {
          state.board[targetY][x] = tile;
          state.board[y][x] = null;
          moved = true;
        }
      }
    }
    return moved;
  }

  function clearMatchedTiles() {
    let cleared = 0;
    let maxChain = 0;
    const clearedTiles = [];
    for (let y = 0; y < state.board.length; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = state.board[y][x];
        if (!tile || tile.state !== "matching") {
          continue;
        }
        tile.timer -= state.dt;
        if (tile.timer <= 0) {
          cleared += 1;
          maxChain = Math.max(maxChain, tile.chain);
          clearedTiles.push({ x, y, color: COLORS[tile.color].fill });
          state.board[y][x] = null;
        }
      }
    }
    if (cleared > 0) {
      const comboScore = cleared * 40;
      const chainBonus = maxChain > 1 ? maxChain * 90 : 0;
      state.score += comboScore + chainBonus;
      state.comboFlash = 0.45;
      state.highestChain = Math.max(state.highestChain, maxChain);
      if (maxChain > 1) {
        state.chainMessage = `Chain x${maxChain}`;
        setStatus(`${cleared} panels popped. ${state.chainMessage}.`, "Keep the cursor near hanging panels to convert the fall into another clear.");
      } else {
        state.chainMessage = cleared >= 4 ? `Combo ${cleared}` : "";
        setStatus(`${cleared} panels popped.`, "Raise only when the next line gives you an immediate pattern to cash in.");
      }
      let centerX = 0;
      let centerY = 0;
      clearedTiles.forEach((tile, index) => {
        const px = boardPixelX(tile.x);
        const py = boardPixelY(tile.y);
        centerX += px;
        centerY += py;
        spawnBurst(px, py, tile.color, 4, {
          life: 0.5 + index * 0.008,
          radius: rand(3, 6),
          vx: rand(-100, 100),
          vy: rand(-150, -30)
        });
      });
      if (clearedTiles.length > 0) {
        centerX /= clearedTiles.length;
        centerY /= clearedTiles.length;
        state.shockwaves.push(createShockwave(centerX, centerY, maxChain > 1 ? "#ffe998" : "#b7f0ff", 24, 0.32));
      }
      addShake(Math.min(7, 1.5 + cleared * 0.45 + maxChain));
      addBoardPulse(0.18 + Math.min(0.26, cleared * 0.018));
      state.vignettePulse = Math.min(1, state.vignettePulse + 0.14 + maxChain * 0.08);
      audio.playClear(cleared, maxChain);
      updatePhase();
      syncHud();
    }
    return cleared;
  }

  function hasActiveMatches() {
    for (let y = 0; y < state.board.length; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = state.board[y][x];
        if (tile && tile.state === "matching") {
          return true;
        }
      }
    }
    return false;
  }

  function riseBoard(rowsToAdd) {
    for (let step = 0; step < rowsToAdd; step += 1) {
      state.board.shift();
      const newRow = [];
      for (let x = 0; x < COLS; x += 1) {
        newRow.push(createTile(state.previewRow[x]));
      }
      state.board.push(newRow);
      state.previewRow = createPreviewRow(state.board);
      state.cursorY = Math.max(0, state.cursorY - 1);
      for (let x = 0; x < COLS; x += 1) {
        spawnBurst(boardPixelX(x), BOARD_Y + VISIBLE_HEIGHT + 4, COLORS[newRow[x].color].accent, 2, {
          vx: rand(-40, 40),
          vy: rand(-120, -50),
          life: 0.34,
          radius: rand(2, 4),
          alpha: 0.48
        });
      }
      addBoardPulse(0.12);
      state.vignettePulse = Math.min(1, state.vignettePulse + 0.06);
      audio.playRaise();
      if (boardTopReached()) {
        loseGame();
        return;
      }
    }
  }

  function loseGame() {
    state.mode = "lose";
    addShake(10);
    addBoardPulse(0.42);
    state.vignettePulse = 0.9;
    state.shockwaves.push(createShockwave(BOARD_X + (COLS * CELL) * 0.5, BOARD_Y + VISIBLE_HEIGHT * 0.45, "#ff7d90", 80, 0.52));
    audio.playLose();
    showOverlay("Stack Collapsed", "The ceiling got you. Restart and keep one safe clear pocket near the cursor.", "Restart");
    setStatus("The stack hit the top.", "Enter restarts instantly.");
  }

  function winGame() {
    state.mode = "win";
    addShake(6);
    addBoardPulse(0.36);
    state.vignettePulse = 0.5;
    state.shockwaves.push(createShockwave(BOARD_X + (COLS * CELL) * 0.5, BOARD_Y + VISIBLE_HEIGHT * 0.4, "#ffe998", 70, 0.48));
    audio.playWin();
    showOverlay("Board Controlled", "You hit the score goal before the stack broke through. Restart for a faster chain route.", "Restart");
    setStatus("Target reached.", "Enter restarts instantly.");
  }

  function updatePlaying(dt) {
    state.dt = dt;
    state.swapCooldown = Math.max(0, state.swapCooldown - dt);
    state.moveCooldown = Math.max(0, state.moveCooldown - dt);
    state.comboFlash = Math.max(0, state.comboFlash - dt);

    if (state.moveCooldown <= 0) {
      if (input.left) {
        moveCursor(-1, 0);
        state.moveCooldown = 0.11;
      } else if (input.right) {
        moveCursor(1, 0);
        state.moveCooldown = 0.11;
      } else if (input.up) {
        moveCursor(0, -1);
        state.moveCooldown = 0.11;
      } else if (input.down) {
        moveCursor(0, 1);
        state.moveCooldown = 0.11;
      }
    }

    const activeMatches = hasActiveMatches();
    if (activeMatches) {
      const cleared = clearMatchedTiles();
      if (cleared > 0) {
        applyGravity();
      }
    } else {
      const fell = applyGravity();
      if (fell) {
        state.chain = Math.max(2, state.chain + 1 || 2);
      } else {
        state.chain = 1;
        const found = markMatches();
        if (found === 0) {
          const riseRate = state.riseBase + (input.raise ? 22 : 0);
          state.riseOffset += riseRate * dt;
          if (state.riseOffset >= CELL) {
            const rows = Math.floor(state.riseOffset / CELL);
            state.riseOffset -= rows * CELL;
            riseBoard(rows);
          }
        }
      }
    }

    const visibleTopCount = state.board[HIDDEN_ROWS].filter(Boolean).length;
    state.danger = visibleTopCount > 0;
    if (state.danger) {
      state.topDangerTimer += dt;
      state.vignettePulse = Math.min(1, state.vignettePulse + dt * 0.28);
      audio.playDanger();
      setStatus("Top row occupied. Clear space now.", "Manual raise is disabled by survival pressure. Find the nearest 3-line.");
    } else if (state.topDangerTimer > 0.3 && !activeMatches && state.comboFlash <= 0) {
      state.topDangerTimer = 0;
      setStatus("Build fast clears before the stack climbs.", "Manual raise is strongest when you already see the next match.");
    }

    if (state.score >= SCORE_TARGET) {
      winGame();
    }
    syncHud();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#13264a");
    gradient.addColorStop(1, "#08101c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#83d6ff" : "#ffd66d";
      ctx.beginPath();
      ctx.arc(70 + i * 48, 40 + (i % 3) * 18, 12 + (i % 4) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoardFrame() {
    ctx.fillStyle = "#0a1525";
    ctx.fillRect(BOARD_X - 12, BOARD_Y - 12, COLS * CELL + 24, VISIBLE_HEIGHT + 24);
    ctx.strokeStyle = state.danger ? "#ff7d90" : "rgba(198, 227, 255, 0.2)";
    ctx.lineWidth = 3;
    ctx.strokeRect(BOARD_X - 12, BOARD_Y - 12, COLS * CELL + 24, VISIBLE_HEIGHT + 24);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x <= COLS; x += 1) {
      ctx.fillRect(BOARD_X + x * CELL - 1, BOARD_Y, 2, VISIBLE_HEIGHT);
    }
    for (let y = 0; y <= ROWS; y += 1) {
      ctx.fillRect(BOARD_X, BOARD_Y + y * CELL - 1, COLS * CELL, 2);
    }
  }

  function drawTile(x, y, tile) {
    const color = COLORS[tile.color];
    const px = BOARD_X + x * CELL + 4;
    const py = BOARD_Y + y * CELL + 4 - state.riseOffset;
    const size = CELL - 8;
    if (py < BOARD_Y - CELL || py > BOARD_Y + VISIBLE_HEIGHT) {
      return;
    }
    const flash = tile.state === "matching" ? 0.55 + Math.sin(tile.timer * 60) * 0.15 : 0;
    ctx.fillStyle = color.fill;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = color.accent;
    ctx.globalAlpha = 0.34 + flash;
    ctx.fillRect(px + 4, py + 4, size - 8, 10);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

    ctx.fillStyle = "rgba(6, 12, 24, 0.32)";
    ctx.beginPath();
    ctx.moveTo(px + size * 0.5, py + 10);
    ctx.lineTo(px + size - 12, py + size * 0.5);
    ctx.lineTo(px + size * 0.5, py + size - 10);
    ctx.lineTo(px + 12, py + size * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function drawPreviewRow() {
    const previewY = BOARD_Y + VISIBLE_HEIGHT + 16;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(BOARD_X, previewY, COLS * CELL, 28);
    for (let x = 0; x < COLS; x += 1) {
      const color = COLORS[state.previewRow[x]];
      ctx.fillStyle = color.fill;
      ctx.fillRect(BOARD_X + x * CELL + 4, previewY + 4, CELL - 8, 20);
    }
    ctx.fillStyle = "#9db2c8";
    ctx.font = "12px Trebuchet MS";
    ctx.fillText("Next rise", BOARD_X, previewY - 6);
  }

  function drawEffects() {
    for (const particle of state.particles) {
      const alpha = (particle.life / particle.maxLife) * particle.alpha;
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const ring of state.shockwaves) {
      const alpha = ring.life / ring.maxLife;
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 3 + (1 - alpha) * 4;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCursor() {
    const x = BOARD_X + state.cursorX * CELL;
    const y = BOARD_Y + state.cursorY * CELL - state.riseOffset;
    ctx.strokeStyle = "#ffe998";
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, CELL * 2 - 4, CELL - 4);
  }

  function drawCeilingDanger() {
    if (!state.danger) {
      return;
    }
    const alpha = 0.16 + Math.sin(performance.now() / 80) * 0.07;
    ctx.fillStyle = `rgba(255, 92, 112, ${alpha})`;
    ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, 24);
  }

  function drawSideInfo() {
    ctx.fillStyle = "#e9f5ff";
    ctx.font = "700 22px Trebuchet MS";
    ctx.fillText("Pressure", 28, 110);

    const progress = Math.min(1, state.score / SCORE_TARGET);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(28, 126, 52, 420);
    ctx.fillStyle = state.danger ? "#ff7d90" : "#6ee797";
    ctx.fillRect(28, 126 + (1 - progress) * 420, 52, progress * 420);

    ctx.fillStyle = "#9db2c8";
    ctx.font = "15px Trebuchet MS";
    ctx.fillText(`Phase ${state.phase}`, 28, 574);
    ctx.fillText(state.chainMessage || "No chain", 28, 602);
    ctx.fillText(input.raise ? "Raising" : "Steady", 28, 630);

    ctx.fillStyle = "#e9f5ff";
    ctx.font = "700 18px Trebuchet MS";
    ctx.fillText("Goal", 450, 110);
    ctx.font = "700 28px Trebuchet MS";
    ctx.fillText(String(SCORE_TARGET), 450, 146);
    ctx.font = "15px Trebuchet MS";
    ctx.fillStyle = "#9db2c8";
    ctx.fillText("Manual raise feeds the next row.", 450, 178);
    ctx.fillText("Only spend that risk into a real clear.", 450, 200);
  }

  function drawPostFx() {
    if (state.boardPulse > 0) {
      ctx.fillStyle = `rgba(255, 238, 168, ${state.boardPulse * 0.12})`;
      ctx.fillRect(BOARD_X - 12, BOARD_Y - 12, COLS * CELL + 24, VISIBLE_HEIGHT + 24);
    }

    const vignetteAlpha = 0.16 + state.vignettePulse * 0.18 + (state.danger ? 0.08 : 0);
    const vignette = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.42,
      180,
      canvas.width * 0.5,
      canvas.height * 0.42,
      520
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, `rgba(3, 7, 15, ${vignetteAlpha})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let y = -6 + state.scanlineOffset; y < canvas.height; y += 6) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }

  function render() {
    const shakeX = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
    const shakeY = state.shake > 0 ? rand(-state.shake * 0.65, state.shake * 0.65) : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawBoardFrame();
    drawCeilingDanger();

    for (let visibleY = 0; visibleY < ROWS; visibleY += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = tileAtVisible(x, visibleY);
        if (tile) {
          drawTile(x, visibleY, tile);
        }
      }
    }

    drawEffects();
    drawCursor();
    drawPreviewRow();
    drawSideInfo();

    if (state.comboFlash > 0) {
      ctx.fillStyle = `rgba(255, 233, 152, ${state.comboFlash * 0.18})`;
      ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, VISIBLE_HEIGHT);
    }
    drawPostFx();
    ctx.restore();
  }

  function frame(time) {
    const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
    lastTime = time;
    updateEffects(dt);
    audio.updateMusic();
    if (state.mode === "playing") {
      updatePlaying(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  function onKeyDown(event) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Shift", " ", "Enter", "r", "R"].includes(event.key) || event.code === "Space" || event.code === "KeyR") {
      audio.unlock();
    }
    if (event.key === "ArrowLeft") {
      input.left = true;
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      input.right = true;
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      input.up = true;
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      input.down = true;
      event.preventDefault();
    } else if (event.key === "Shift") {
      input.raise = true;
    } else if (event.key === " " || event.code === "Space") {
      if (state.mode === "playing") {
        swapCursor();
      }
      event.preventDefault();
    } else if (event.key === "Enter") {
      if (state.mode === "playing") {
        return;
      }
      startGame();
    } else if (event.key === "r" || event.key === "R") {
      startGame();
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (event.key === "ArrowLeft") {
      input.left = false;
    } else if (event.key === "ArrowRight") {
      input.right = false;
    } else if (event.key === "ArrowUp") {
      input.up = false;
    } else if (event.key === "ArrowDown") {
      input.down = false;
    } else if (event.key === "Shift") {
      input.raise = false;
    }
  }

  overlayButtonEl.addEventListener("click", startGame);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  resetGame();
  requestAnimationFrame(frame);
})();
