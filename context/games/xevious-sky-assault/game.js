(function () {
  const GAME_CONFIG = {
    width: 1280,
    height: 720,
    playerSpeedX: 390,
    playerSpeedY: 300,
    fireCooldown: 0.16,
    shotLife: 1.3,
    bombLife: 3,
    scrollSpeed: 120,
    trenchTopRatio: 0.56,
    winRadarThreshold: 0.98,
  };

  const WAVE_TYPES = {
    air: {
      kind: "air",
      hp: 1,
      score: 100,
      yMin: 120,
      yMax: 300,
      driftMin: -1,
      driftMax: 1,
    },
    ground: {
      kind: "ground",
      hp: 2,
      score: 150,
      yMin: 0.64,
      yMax: 0.76,
    },
  };

  const WAVES = [
    { afterRadar: 0.1, interval: 0.72, airChance: 0.42, maxActive: 4 },
    { afterRadar: 0.45, interval: 0.62, airChance: 0.36, maxActive: 5 },
    { afterRadar: 0.75, interval: 0.54, airChance: 0.28, maxActive: 6 },
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function wrap(value, size) {
    return ((value % size) + size) % size;
  }

  function rand(seed) {
    const x = Math.sin(seed * 999.1) * 10000;
    return x - Math.floor(x);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function createPlayer(width, height) {
    return {
      x: width * 0.5,
      y: height * 0.75,
      angle: 0,
      fireAir: 0,
      fireGround: 0,
    };
  }

  function createGameState(width = GAME_CONFIG.width, height = GAME_CONFIG.height) {
    return {
      width,
      height,
      mode: "menu",
      time: 0,
      score: 0,
      lives: 3,
      radar: 0,
      scroll: 0,
      banner: "Press Start",
      alert: "Launch ready",
      over: false,
      waveIndex: 0,
      nextSpawn: 0.6,
      player: createPlayer(width, height),
      shots: [],
      bombs: [],
      airEnemies: [],
      groundTargets: [],
      radarMarks: [],
      stripes: [],
    };
  }

  function resetDynamicState(state) {
    state.time = 0;
    state.score = 0;
    state.lives = 3;
    state.radar = 0;
    state.scroll = 0;
    state.banner = "Press Start";
    state.alert = "Launch ready";
    state.over = false;
    state.waveIndex = 0;
    state.nextSpawn = 0.6;
    state.player = createPlayer(state.width, state.height);
    state.shots = [];
    state.bombs = [];
    state.airEnemies = [];
    state.groundTargets = [];
    state.radarMarks = [];
    state.stripes = [];
    return state;
  }

  function nextWave(state) {
    return WAVES[Math.min(WAVES.length - 1, state.waveIndex)];
  }

  function spawnEnemy(state) {
    const wave = nextWave(state);
    const seed = state.time * 3.1 + state.score * 0.01 + state.airEnemies.length + state.groundTargets.length;
    const makeAir = rand(seed) < wave.airChance || state.groundTargets.length > state.airEnemies.length + 1;
    const x = 120 + rand(seed + 2) * (state.width - 240);
    if (makeAir) {
      const spec = WAVE_TYPES.air;
      state.airEnemies.push({
        kind: spec.kind,
        x,
        y: spec.yMin + rand(seed + 5) * (spec.yMax - spec.yMin),
        hp: spec.hp,
        score: spec.score,
        drift: spec.driftMin + rand(seed + 6) * (spec.driftMax - spec.driftMin),
      });
      return;
    }
    const spec = WAVE_TYPES.ground;
    state.groundTargets.push({
      kind: spec.kind,
      x,
      y: state.height * spec.yMin + rand(seed + 4) * state.height * (spec.yMax - spec.yMin),
      hp: spec.hp,
      score: spec.score,
      pulse: 0,
    });
  }

  function fireShot(state, kind) {
    const cooldownKey = kind === "air" ? "fireAir" : "fireGround";
    if (state.player[cooldownKey] > 0) return;
    state.player[cooldownKey] = GAME_CONFIG.fireCooldown;
    state.shots.push({
      kind,
      x: state.player.x,
      y: state.player.y - 18,
      vy: kind === "air" ? -720 : 820,
      life: GAME_CONFIG.shotLife,
    });
  }

  function buildFrame(state) {
    return {
      width: state.width,
      height: state.height,
      mode: state.mode,
      score: state.score,
      lives: state.lives,
      radar: state.radar,
      scroll: state.scroll,
      banner: state.banner,
      alert: state.alert,
      overlayEyebrow: state.mode === "win" ? "Success" : state.mode === "lose" ? "Failure" : "Mission",
      overlayTitle: "Xevious Sky Assault",
      overlayCopy:
        state.mode === "menu"
          ? "Arrow keys move. Space or Z fires air targets. X or Ctrl fires ground targets."
          : state.mode === "win"
            ? "Run complete. Press Start to play again."
            : state.mode === "lose"
              ? "Ship lost. Press Start for an instant retry."
              : "Two fire modes. Keep radar pressure low and the trench readable.",
      overlayButton: state.mode === "menu" ? "Start" : "Restart",
      player: { ...state.player },
      airEnemies: state.airEnemies.map((entity) => ({ ...entity })),
      groundTargets: state.groundTargets.map((entity) => ({ ...entity })),
      shots: state.shots.map((shot) => ({ ...shot })),
      bombs: state.bombs.map((bomb) => ({ ...bomb })),
      radarMarks: state.radarMarks.map((mark) => ({ ...mark })),
      trench: { top: state.height * GAME_CONFIG.trenchTopRatio },
      stripes: state.stripes.map((stripe) => ({ ...stripe })),
    };
  }

  class Game {
    constructor() {
      this.state = createGameState();
    }

    resize(widthOrSize, height) {
      const width = typeof widthOrSize === "object" ? widthOrSize.width : widthOrSize;
      const nextHeight = typeof widthOrSize === "object" ? widthOrSize.height : height;
      this.state.width = width ?? this.state.width;
      this.state.height = nextHeight ?? this.state.height;
      this.state.player.x = clamp(this.state.player.x, 80, this.state.width - 80);
      this.state.player.y = clamp(this.state.player.y, 90, this.state.height - 70);
    }

    restart() {
      resetDynamicState(this.state);
    }

    start() {
      if (this.state.mode === "menu") {
        this.state.mode = "play";
        this.state.banner = "Air and ground targets live";
        this.state.alert = "Engage";
      } else if (this.state.mode === "lose" || this.state.mode === "win") {
        this.restart();
        this.state.mode = "play";
        this.state.banner = "Air and ground targets live";
        this.state.alert = "Engage";
      }
    }

    update(dt, input) {
      const state = this.state;
      state.time += dt;
      if (state.mode === "menu") {
        state.alert = "Press Start";
        if (input.pressed.Enter || input.pressed.Space) this.start();
        return;
      }
      if (state.mode === "lose" || state.mode === "win") {
        if (input.pressed.Enter || input.pressed.Space) this.start();
        return;
      }

      const held = input.held || {};
      const steer = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
      const thrust = (held.ArrowDown || held.KeyS ? 1 : 0) - (held.ArrowUp || held.KeyW ? 1 : 0);
      state.player.x = clamp(state.player.x + steer * dt * GAME_CONFIG.playerSpeedX, 80, state.width - 80);
      state.player.y = clamp(state.player.y + thrust * dt * GAME_CONFIG.playerSpeedY, 90, state.height - 70);
      state.player.angle = steer * 0.18;
      state.player.fireAir = Math.max(0, state.player.fireAir - dt);
      state.player.fireGround = Math.max(0, state.player.fireGround - dt);

      if (input.pressed.Space || input.pressed.KeyZ || held.Space || held.KeyZ) fireShot(state, "air");
      if (input.pressed.KeyX || input.pressed.ControlLeft || held.KeyX || held.ControlLeft) fireShot(state, "ground");

      state.scroll += dt * GAME_CONFIG.scrollSpeed;
      state.radar = clamp(state.scroll / 1600, 0, 1);

      const wave = nextWave(state);
      state.nextSpawn -= dt;
      if (state.nextSpawn <= 0) {
        spawnEnemy(state);
        if (state.radar >= wave.afterRadar) {
          state.waveIndex = Math.min(WAVES.length - 1, state.waveIndex + 1);
        }
        state.nextSpawn = wave.interval;
        if (state.airEnemies.length + state.groundTargets.length >= wave.maxActive) {
          state.nextSpawn += 0.15;
        }
      }

      for (const enemy of state.airEnemies) {
        enemy.x += Math.sin(state.time * 1.8 + enemy.y) * dt * 60 + enemy.drift * dt * 90;
        enemy.y += dt * 20;
      }
      for (const target of state.groundTargets) target.pulse += dt;

      for (const shot of state.shots) {
        shot.y += shot.vy * dt;
        shot.life -= dt;
      }
      state.shots = state.shots.filter((shot) => shot.life > 0 && shot.y > -20 && shot.y < state.height + 20);

      for (const bomb of state.bombs) {
        bomb.y += bomb.vy * dt;
        bomb.life -= dt;
      }
      state.bombs = state.bombs.filter((bomb) => bomb.life > 0 && bomb.y < state.height + 30);

      for (const enemy of state.airEnemies) {
        if (rand(enemy.x + state.time) > 0.995) {
          state.bombs.push({ x: enemy.x, y: enemy.y, vy: 260, life: GAME_CONFIG.bombLife });
        }
      }

      for (let i = state.airEnemies.length - 1; i >= 0; i -= 1) {
        if (state.airEnemies[i].y > state.height + 30) state.airEnemies.splice(i, 1);
      }

      for (let s = state.shots.length - 1; s >= 0; s -= 1) {
        const shot = state.shots[s];
        const pool = shot.kind === "air" ? state.airEnemies : state.groundTargets;
        for (let e = pool.length - 1; e >= 0; e -= 1) {
          const enemy = pool[e];
          const yRange = enemy.kind === "ground" ? 30 : 22;
          if (Math.abs(shot.x - enemy.x) >= 24 || Math.abs(shot.y - enemy.y) >= yRange) continue;
          enemy.hp -= 1;
          shot.life = 0;
          if (enemy.hp <= 0) {
            state.score += enemy.score;
            pool.splice(e, 1);
            if (enemy.kind === "ground") state.banner = "Trench clear";
          }
          break;
        }
      }

      for (const bomb of state.bombs) {
        const hitPlayer = Math.abs(bomb.x - state.player.x) < 20 && Math.abs(bomb.y - state.player.y) < 18;
        if (!hitPlayer) continue;
        bomb.life = 0;
        state.lives -= 1;
        state.alert = "Hit!";
        if (state.lives <= 0) {
          state.over = true;
          state.mode = "lose";
          state.banner = "Retry fast";
          return;
        }
      }

      if (state.radar > GAME_CONFIG.winRadarThreshold && state.airEnemies.length + state.groundTargets.length < 4) {
        state.over = true;
        state.mode = "win";
        state.banner = "Mission clear";
        state.alert = "Base secured";
      }

      state.radarMarks = state.airEnemies.concat(state.groundTargets).slice(0, 10).map((enemy) => ({
        x: enemy.x / state.width,
        y: enemy.y / state.height,
        threat: enemy.kind === "ground",
      }));
      state.stripes = Array.from({ length: 6 }, (_, index) => ({
        x: ((state.scroll * 1.6 + index * 220) % (state.width + 220)) - 110,
        y: state.height * 0.58 + (index % 2) * 10,
        w: 90,
        h: 4,
      }));
    }

    getFrameState() {
      return buildFrame(this.state);
    }
  }

  function drawShip(ctx, entity, fill, stroke) {
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.rotate(entity.angle || 0);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(14, 10);
    ctx.lineTo(0, 6);
    ctx.lineTo(-14, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(ctx, bullet, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.kind === "ground" ? 3.2 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTerrain(ctx, frame) {
    const { width, height, scroll } = frame;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#091826");
    sky.addColorStop(0.56, "#0a2232");
    sky.addColorStop(1, "#03070c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(0, wrap(scroll * 0.35, 120));
    for (let y = -120; y < height + 160; y += 120) {
      ctx.strokeStyle = "rgba(130, 210, 255, 0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();

    const trenchTop = frame.trench ? frame.trench.top : height * 0.56;
    ctx.fillStyle = "#08101a";
    ctx.fillRect(0, trenchTop, width, height - trenchTop);

    ctx.fillStyle = "rgba(42, 70, 88, 0.84)";
    ctx.fillRect(0, trenchTop - 12, width, 12);
    ctx.fillStyle = "rgba(24, 38, 48, 0.9)";
    ctx.fillRect(0, trenchTop + 14, width, 18);

    for (const mark of frame.radarMarks) {
      const x = mark.x * width;
      const y = trenchTop + 14 + mark.y * (height - trenchTop - 24);
      ctx.fillStyle = mark.threat ? "rgba(255, 120, 120, 0.9)" : "rgba(121, 235, 255, 0.72)";
      ctx.beginPath();
      ctx.arc(x, y, mark.threat ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255, 227, 132, 0.85)";
    for (const stripe of frame.stripes) {
      ctx.fillRect(stripe.x, stripe.y, stripe.w, stripe.h);
    }
  }

  function drawBase(ctx, base) {
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.fillStyle = base.threat ? "#82343d" : "#3a5f75";
    roundRect(ctx, -18, -18, 36, 36, 6);
    ctx.fill();
    ctx.fillStyle = "#e6f6ff";
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }

  function renderScene(ctx, frame) {
    const { width, height } = frame;
    ctx.clearRect(0, 0, width, height);
    drawTerrain(ctx, frame);

    for (const entity of frame.airEnemies) drawShip(ctx, entity, "#ffcf68", "#5f3d00");
    for (const entity of frame.groundTargets) drawBase(ctx, entity);

    for (const bomb of frame.bombs) {
      ctx.fillStyle = "rgba(255, 148, 82, 0.92)";
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const shot of frame.shots) {
      drawBullet(ctx, shot, shot.kind === "ground" ? "#8df3ff" : "#ffe38f");
    }

    drawShip(ctx, frame.player, "#86f2ff", "#08344b");

    ctx.fillStyle = "rgba(2, 8, 14, 0.6)";
    roundRect(ctx, 18, 18, 278, 104, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    ctx.fillStyle = "#eaf6ff";
    ctx.font = "700 20px Trebuchet MS";
    ctx.fillText("Xevious Sky Assault", 36, 48);
    ctx.font = "14px Trebuchet MS";
    ctx.fillStyle = "#b4d2e7";
    ctx.fillText(`Score ${frame.score}`, 36, 72);
    ctx.fillText(`Lives ${frame.lives}`, 132, 72);
    ctx.fillText(`Radar ${Math.round(clamp01(frame.radar) * 100)}%`, 210, 72);

    if (frame.banner) {
      ctx.fillStyle = "rgba(2, 8, 14, 0.58)";
      roundRect(ctx, width * 0.5 - 160, height - 78, 320, 40, 999);
      ctx.fill();
      ctx.fillStyle = "#f4fbff";
      ctx.font = "700 14px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(frame.banner, width * 0.5, height - 52);
      ctx.textAlign = "left";
    }
  }

  const canvas = document.getElementById("gameCanvas");
  const hud = document.getElementById("hud");
  const hudScore = document.getElementById("hudScore");
  const hudLives = document.getElementById("hudLives");
  const hudRadar = document.getElementById("hudRadar");
  const hudAlert = document.getElementById("hudAlert");
  const overlay = document.getElementById("overlay");
  const overlayEyebrow = document.getElementById("overlayEyebrow");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayCopy = document.getElementById("overlayCopy");
  const overlayButton = document.getElementById("overlayButton");

  if (!canvas || !overlayButton) {
    throw new Error("Xevious Sky Assault shell missing required DOM nodes.");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const game = new Game();
  const input = { held: Object.create(null), pressed: Object.create(null) };

  function resize() {
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);
    canvas.width = Math.max(320, width * scale);
    canvas.height = Math.max(240, height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
  }

  function press(code) {
    input.pressed[code] = true;
  }

  window.addEventListener("keydown", (event) => {
    input.held[event.code] = true;
    if (!event.repeat) press(event.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyZ", "KeyX"].includes(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    input.held[event.code] = false;
  });

  window.addEventListener("blur", () => {
    input.held = Object.create(null);
    input.pressed = Object.create(null);
  });

  overlayButton.addEventListener("click", () => {
    if (game.state.mode === "menu") {
      game.start();
      return;
    }
    if (game.state.mode === "play") {
      return;
    }
    game.restart();
  });

  function syncHud(frame) {
    hudScore.textContent = String(frame.score || 0);
    hudLives.textContent = String(frame.lives || 0);
    hudRadar.textContent = `${Math.round((frame.radar || 0) * 100)}%`;
    hudAlert.textContent = frame.alert || "";
    hudAlert.hidden = !frame.alert;
    hud.hidden = false;

    const showOverlay = frame.mode !== "play";
    overlay.hidden = !showOverlay;
    if (showOverlay) {
      overlayEyebrow.textContent = frame.overlayEyebrow || "Mission";
      overlayTitle.textContent = frame.overlayTitle || "Xevious Sky Assault";
      overlayCopy.textContent = frame.overlayCopy || "Press Start to launch the run.";
      overlayButton.textContent = frame.overlayButton || "Start";
    }
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, input);
    const frame = game.getFrameState();
    renderScene(ctx, frame);
    syncHud(frame);
    input.pressed = Object.create(null);
    window.requestAnimationFrame(tick);
  }

  resize();
  syncHud(game.getFrameState());
  window.addEventListener("resize", resize);
  window.requestAnimationFrame(tick);
})();
