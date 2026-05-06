(() => {
  // lode-runner-burrow/src/level.js
  var TILE = 32;
  var COLS = 24;
  var ROWS = 18;
  var RAW_LEVEL = [
    "########################",
    "#..G....L.......G....E.#",
    "#..####..#####..####...#",
    "#..#..#......#....#....#",
    "#..#..#..##..#..#.#.##.#",
    "#..#..#..##..#..#.#.##.#",
    "#..#...P####....#.....#",
    "#..##########..#####...#",
    "#......G.....L........#",
    "#..###..####..####..##.#",
    "#..#....#..#..#..#....#",
    "#..#..###..#..#..###..#",
    "#..#..#....#..#....#..#",
    "#..#..#..#####..#..#..#",
    "#..#.....G.....#...G..#",
    "#..#########..#####...#",
    "#P...........L........P#",
    "########################"
  ];
  var LEVEL = RAW_LEVEL.map((row) => row.padEnd(COLS, "#").slice(0, COLS));
  function createLevel() {
    const gold = [];
    const ladders = [];
    const escapeLadders = [];
    const pitSeeds = [];
    for (let y = 0;y < ROWS; y += 1) {
      for (let x = 0;x < COLS; x += 1) {
        const tile = LEVEL[y][x];
        if (tile === "G")
          gold.push({ x, y, collected: false });
        if (tile === "L")
          ladders.push({ x, y, revealed: true });
        if (tile === "E")
          escapeLadders.push({ x, y, revealed: false });
        if (tile === "P")
          pitSeeds.push({ x, y, duration: 2.5 });
      }
    }
    return {
      tileSize: TILE,
      cols: COLS,
      rows: ROWS,
      raw: LEVEL,
      spawn: { x: 2, y: 16 },
      enemySpawns: [
        { x: 18, y: 16, dir: -1 },
        { x: 15, y: 8, dir: 1 }
      ],
      exit: { x: 21, y: 1 },
      gold,
      ladders,
      escapeLadders,
      pitSeeds
    };
  }
  function getTileAt(level, x, y) {
    if (!level)
      return "#";
    if (x < 0 || y < 0 || x >= level.cols || y >= level.rows)
      return "#";
    return level.raw[y]?.[x] ?? "#";
  }
  function isSolidTile(tile) {
    return tile === "#";
  }
  function isClimbableTile(tile) {
    return tile === "L" || tile === "E";
  }

  // lode-runner-burrow/src/state.js
  function createActor(x, y, dir = 1) {
    return { x: x * TILE, y: y * TILE, vx: 0, vy: 0, w: 22, h: 28, dir, onGround: false };
  }
  function createInitialState(level) {
    return {
      mode: "menu",
      time: 0,
      score: 0,
      message: "",
      player: createActor(level.spawn.x, level.spawn.y),
      enemies: level.enemySpawns.map((spawn) => createActor(spawn.x, spawn.y, spawn.dir)),
      collectibles: level.gold.map((gold) => ({ ...gold })),
      pits: level.pitSeeds.map((pit) => ({ ...pit, elapsed: 0, active: true })),
      escapeLadders: level.escapeLadders.map((ladder) => ({ ...ladder })),
      win: false,
      lose: false
    };
  }
  function cloneRunState(state) {
    return {
      ...state,
      player: { ...state.player },
      enemies: state.enemies.map((enemy) => ({ ...enemy })),
      collectibles: state.collectibles.map((gold) => ({ ...gold })),
      pits: state.pits.map((pit) => ({ ...pit })),
      escapeLadders: state.escapeLadders.map((ladder) => ({ ...ladder }))
    };
  }
  function stepPitTimers(state, dt) {
    const next = cloneRunState(state);
    next.pits = next.pits.map((pit) => {
      if (pit.active)
        return pit;
      const elapsed = pit.elapsed + dt;
      if (elapsed >= pit.duration) {
        return { ...pit, elapsed: 0, active: true };
      }
      return { ...pit, elapsed, active: false };
    });
    return next;
  }
  function revealEscapeLadders(state) {
    const next = cloneRunState(state);
    next.escapeLadders = next.escapeLadders.map((ladder) => ({ ...ladder, revealed: true }));
    return next;
  }
  function countCollectedGold(state) {
    return state.collectibles.filter((gold) => gold.collected).length;
  }
  function allGoldCollected(state) {
    return state.collectibles.length > 0 && state.collectibles.every((gold) => gold.collected);
  }
  function tileBlocksMovement(level, state, x, y) {
    const tile = getTileAt(level, x, y);
    if (!isSolidTile(tile))
      return false;
    const pit = state.pits.find((entry) => entry.x === x && entry.y === y);
    return !(pit && pit.active === false);
  }

  // lode-runner-burrow/src/Game.js
  var TILE2 = 32;
  var WORLD_WIDTH = 24 * TILE2;
  var WORLD_HEIGHT = 18 * TILE2;
  var GRAVITY = 1800;
  var MOVE_SPEED = 180;
  var CLIMB_SPEED = 150;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class Game {
    constructor() {
      this.level = createLevel();
      this.viewport = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
      this.start();
    }
    start() {
      this.mode = "menu";
      this.score = 0;
      this.time = 0;
      this.state = createInitialState(this.level);
      this.state.mode = "menu";
      this.overlay = {
        show: true,
        eyebrow: "Burrow run",
        title: "Lode Runner Burrow",
        copy: "Run the tunnels, grab the gold, and reach the ladder exit before the guards box you in.",
        button: "Start"
      };
      this.message = "Press Enter to start the burrow.";
      this.restartHint = "Enter or R to restart.";
    }
    restart() {
      this.start();
      this.beginPlay();
    }
    beginPlay() {
      this.mode = "play";
      this.overlay = { show: false };
      this.message = "Collect all gold to reveal the exit ladder.";
      this.state.mode = "play";
      this.state.message = this.message;
    }
    resize(viewport) {
      this.viewport = { ...this.viewport, ...viewport };
    }
    update(dt, input = {}) {
      const pressed = input.pressed || {};
      const held = input.held || {};
      if (this.mode !== "play") {
        if (pressed.KeyR) {
          this.restart();
          return;
        }
        if (pressed.Enter || pressed.Space) {
          if (this.mode === "menu")
            this.beginPlay();
          else
            this.restart();
        }
        return;
      }
      this.time += dt;
      this.state.time = this.time;
      this.state = stepPitTimers(this.state, dt);
      const moveX = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
      const moveY = (held.ArrowDown || held.KeyS ? 1 : 0) - (held.ArrowUp || held.KeyW ? 1 : 0);
      let digDirection = 0;
      if (pressed.KeyZ)
        digDirection = -1;
      else if (pressed.KeyX)
        digDirection = 1;
      else if (pressed.Space)
        digDirection = this.state.player.dir;
      if (moveX !== 0)
        this.state.player.dir = moveX > 0 ? 1 : -1;
      this.state.player.vx = moveX * MOVE_SPEED;
      if (moveY !== 0 && this.isOnLadder(this.state.player)) {
        this.state.player.vy = moveY * CLIMB_SPEED;
      }
      if (digDirection !== 0)
        this.digAtPlayer(digDirection);
      this.state.player.vy += GRAVITY * dt;
      this.stepActor(this.state.player, dt);
      this.resolveWorld(this.state.player);
      for (const enemy of this.state.enemies) {
        this.updateEnemy(enemy, dt);
      }
      this.collectGold();
      this.checkState();
    }
    getFrameState() {
      const goldCollected = countCollectedGold(this.state);
      const goldTotal = this.state.collectibles.length;
      const allGold = goldCollected === goldTotal && goldTotal > 0;
      const objectiveHint = allGold ? "Exit ladder open. Climb to the glowing marker at the top-right." : "Collect every gold pile to reveal the exit ladder. Z digs left, X digs right, Space digs forward.";
      return {
        mode: this.mode,
        score: this.score,
        goldCollected,
        goldTotal,
        time: this.time,
        message: this.message,
        objectiveHint,
        restartHint: this.restartHint,
        overlay: this.overlay,
        player: { ...this.state.player, facing: this.state.player.dir },
        guards: this.state.enemies.map((guard) => ({ ...guard, facing: guard.dir })),
        gold: this.state.collectibles.map((item) => ({
          x: item.x * TILE2 + TILE2 / 2,
          y: item.y * TILE2 + TILE2 / 2,
          taken: item.collected
        })),
        ladders: [
          ...this.level.ladders.map((ladder) => ({ ...ladder, revealed: true })),
          ...this.state.escapeLadders.map((ladder) => ({ ...ladder }))
        ],
        tiles: this.level.raw.flatMap((row, y) => row.split("").flatMap((tile, x) => {
          if (!tileBlocksMovement(this.level, this.state, x, y) && tile !== "#")
            return [];
          if (this.state.pits.some((pit) => pit.x === x && pit.y === y && !pit.active))
            return [];
          return [{ x, y, dug: false, base: true }];
        })),
        exit: { x: this.level.exit.x * TILE2 + 4, y: this.level.exit.y * TILE2 + 2, w: 18, h: 24 },
        exitLocked: !allGold,
        view: { ...this.viewport }
      };
    }
    isSolidAt(px, py) {
      const tx = Math.floor(px / TILE2);
      const ty = Math.floor(py / TILE2);
      return tileBlocksMovement(this.level, this.state, tx, ty);
    }
    isOnLadder(actor) {
      const feetY = actor.y + actor.h / 2;
      const centerX = actor.x;
      const tx = Math.floor(centerX / TILE2);
      const ty = Math.floor(feetY / TILE2);
      return isClimbableTile(getTileAt(this.level, tx, ty)) || this.state.escapeLadders.some((ladder) => ladder.revealed && ladder.x === tx && ladder.y === ty);
    }
    digAtPlayer(direction) {
      const tx = Math.floor(this.state.player.x / TILE2) + direction;
      const ty = Math.floor((this.state.player.y + this.state.player.h / 2 - 2) / TILE2);
      const target = this.state.pits.find((pit) => pit.x === tx && pit.y === ty);
      if (target && target.active) {
        target.active = false;
        target.elapsed = 0;
        this.score += 5;
        this.message = "Burrow dug. Stay moving.";
        this.state.message = this.message;
      }
    }
    collectGold() {
      for (const item of this.state.collectibles) {
        if (item.collected)
          continue;
        const dx = Math.abs(item.x * TILE2 + TILE2 / 2 - this.state.player.x);
        const dy = Math.abs(item.y * TILE2 + TILE2 / 2 - this.state.player.y);
        if (dx < 20 && dy < 20) {
          item.collected = true;
          this.score += 100;
          this.message = "Gold pocketed. Keep the exit in sight.";
          this.state.message = this.message;
        }
      }
    }
    updateEnemy(enemy, dt) {
      const towardPlayer = Math.sign(this.state.player.x - enemy.x) || enemy.dir;
      enemy.vx = towardPlayer * 80;
      enemy.vy += GRAVITY * dt;
      this.stepActor(enemy, dt);
      this.resolveWorld(enemy);
      if (Math.abs(enemy.x - this.state.player.x) < 18 && Math.abs(enemy.y - this.state.player.y) < 18) {
        this.mode = "lose";
        this.state.lost = true;
        this.overlay = {
          show: true,
          eyebrow: "Caught",
          title: "Burrow run lost",
          copy: "A guard closed the lane. Press Enter or R to restart and keep the next exit visible.",
          button: "Retry"
        };
        this.message = "Caught by a guard. Restart fast.";
        this.state.message = this.message;
      }
    }
    stepActor(actor, dt) {
      actor.x += actor.vx * dt;
      actor.y += actor.vy * dt;
    }
    resolveWorld(actor) {
      const halfW = actor.w / 2;
      const halfH = actor.h / 2;
      const left = actor.x - halfW;
      const right = actor.x + halfW;
      const top = actor.y - halfH;
      const bottom = actor.y + halfH;
      if (this.isSolidAt(left, actor.y) || this.isSolidAt(right, actor.y)) {
        actor.x = clamp(actor.x - actor.vx * 0.016, halfW, WORLD_WIDTH - halfW);
      } else {
        actor.x = clamp(actor.x, halfW, WORLD_WIDTH - halfW);
      }
      actor.onGround = false;
      if (this.isSolidAt(actor.x, bottom + 2)) {
        actor.onGround = true;
        actor.vy = 0;
        const row = Math.floor((bottom + 2) / TILE2);
        actor.y = row * TILE2 - halfH;
      } else if (this.isSolidAt(actor.x, top - 2) && actor.vy < 0) {
        actor.vy = 0;
      }
      actor.vx *= actor.onGround ? 0.86 : 0.98;
      if (actor.onGround)
        actor.y = Math.round(actor.y);
    }
    checkState() {
      if (this.mode !== "play")
        return;
      const allGold = allGoldCollected(this.state);
      if (allGold)
        this.state = revealEscapeLadders(this.state);
      const exitX = this.level.exit.x * TILE2 + 4;
      const exitY = this.level.exit.y * TILE2 + 2;
      const atExit = Math.abs(this.state.player.x - exitX) < 20 && Math.abs(this.state.player.y - exitY) < 28;
      if (allGold && atExit) {
        this.mode = "win";
        this.state.won = true;
        this.overlay = {
          show: true,
          eyebrow: "Cleared",
          title: "Burrow opened",
          copy: "Gold recovered. Press Enter or R to run the next burrow.",
          button: "Run again"
        };
        this.message = "Exit reached with all gold.";
        this.state.message = this.message;
      } else if (allGold) {
        this.message = "All gold taken. Head for the exit.";
        this.state.message = this.message;
      }
    }
  }

  // lode-runner-burrow/src/render.js
  function fillBackground(ctx, width, height) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#09111c");
    sky.addColorStop(0.5, "#142433");
    sky.addColorStop(1, "#20150f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  }
  function drawTile(ctx, tile, size) {
    const x = tile.x * size;
    const y = tile.y * size;
    ctx.fillStyle = tile.dug ? "rgba(0,0,0,0)" : "#8a5a2a";
    if (!tile.dug)
      ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "rgba(255, 220, 165, 0.15)";
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }
  function drawLadder(ctx, ladder, size) {
    if (!ladder.revealed)
      return;
    const x = ladder.x * size;
    const y = ladder.y * size;
    ctx.strokeStyle = "#8ce3ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 4);
    ctx.lineTo(x + 10, y + size - 4);
    ctx.moveTo(x + size - 10, y + 4);
    ctx.lineTo(x + size - 10, y + size - 4);
    ctx.moveTo(x + 10, y + 11);
    ctx.lineTo(x + size - 10, y + 11);
    ctx.moveTo(x + 10, y + 20);
    ctx.lineTo(x + size - 10, y + 20);
    ctx.stroke();
  }
  function drawExitMarker(ctx, exit, locked) {
    if (!exit)
      return;
    ctx.save();
    if (locked) {
      ctx.fillStyle = "rgba(216, 180, 74, 0.18)";
      ctx.strokeStyle = "rgba(216, 180, 74, 0.72)";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.fillRect(exit.x - 6, exit.y - 10, exit.w + 12, exit.h + 14);
      ctx.strokeRect(exit.x - 6, exit.y - 10, exit.w + 12, exit.h + 14);
      ctx.setLineDash([]);
      ctx.fillStyle = "#f1d98e";
      ctx.font = "700 12px Georgia, serif";
      ctx.fillText("EXIT", exit.x - 2, exit.y - 16);
    } else {
      ctx.fillStyle = "#89e7ff";
      ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
    }
    ctx.restore();
  }
  function drawActor(ctx, actor, color) {
    ctx.fillStyle = color;
    ctx.fillRect(actor.x - actor.w / 2, actor.y - actor.h / 2, actor.w, actor.h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(actor.x - 5 * actor.facing, actor.y - 7, 4, 4);
  }
  function renderGame(ctx, frameState) {
    if (!ctx)
      return;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const size = 32;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);
    for (const tile of frameState.tiles ?? [])
      drawTile(ctx, tile, size);
    for (const ladder of frameState.ladders ?? [])
      drawLadder(ctx, ladder, size);
    ctx.fillStyle = "#d8b44a";
    for (const gold of frameState.gold ?? []) {
      if (gold.taken)
        continue;
      ctx.beginPath();
      ctx.arc(gold.x, gold.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    drawExitMarker(ctx, frameState.exit, frameState.exitLocked);
    drawActor(ctx, frameState.player ?? { x: 0, y: 0, w: 22, h: 28, facing: 1 }, "#f2f5f8");
    for (const guard of frameState.guards ?? [])
      drawActor(ctx, guard, "#ff7d64");
    ctx.restore();
  }

  // lode-runner-burrow/src/main.js
  var canvas = document.getElementById("gameCanvas");
  var hud = document.getElementById("hud");
  var hudScore = document.getElementById("hudScore");
  var hudGold = document.getElementById("hudGold");
  var hudTime = document.getElementById("hudTime");
  var hudState = document.getElementById("hudState");
  var hudHint = document.getElementById("hudHint");
  var overlay = document.getElementById("overlay");
  var overlayEyebrow = document.getElementById("overlayEyebrow");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayCopy = document.getElementById("overlayCopy");
  var overlayButton = document.getElementById("overlayButton");
  if (!canvas || !hud || !hudScore || !hudGold || !hudTime || !hudState || !hudHint || !overlay || !overlayButton) {
    throw new Error("Missing shell elements");
  }
  var ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("Canvas context unavailable");
  var game = new Game;
  var input = { held: Object.create(null), pressed: Object.create(null) };
  function resizeCanvas() {
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(320, Math.floor(window.innerWidth));
    const height = Math.max(240, Math.floor(window.innerHeight));
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (typeof game.resize === "function")
      game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
  }
  function tap(code) {
    input.pressed[code] = true;
  }
  window.addEventListener("keydown", (event) => {
    input.held[event.code] = true;
    if (!event.repeat)
      tap(event.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code))
      event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    input.held[event.code] = false;
  });
  window.addEventListener("blur", () => {
    input.held = Object.create(null);
    input.pressed = Object.create(null);
  });
  function activateOverlay() {
    overlayButton.blur();
    if (game.mode === "menu") {
      game.beginPlay();
    } else {
      game.restart();
    }
  }
  overlayButton.addEventListener("click", activateOverlay);
  function syncHud(frameState) {
    hudScore.textContent = String(frameState.score ?? 0);
    hudGold.textContent = `${frameState.goldCollected ?? 0}/${frameState.goldTotal ?? 0} gold`;
    hudTime.textContent = `${Math.max(0, frameState.time ?? 0).toFixed(1)}s`;
    hudState.textContent = frameState.message ?? "Burrow calm";
    hudHint.textContent = frameState.objectiveHint ?? "Collect every gold pile to reveal the exit ladder. Z digs left, X digs right, Space digs forward.";
    const showOverlay = frameState.mode !== "play";
    hud.hidden = showOverlay;
    overlay.hidden = !showOverlay;
    if (showOverlay) {
      overlayEyebrow.textContent = frameState.overlay?.eyebrow ?? "Burrow run";
      overlayTitle.textContent = frameState.overlay?.title ?? "Lode Runner Burrow";
      overlayCopy.textContent = frameState.overlay?.copy ?? "Press Enter to start.";
      overlayButton.textContent = frameState.overlay?.button ?? "Start";
    } else {
      overlayButton.blur();
    }
  }
  var last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, input);
    const frameState = game.getFrameState();
    renderGame(ctx, frameState);
    syncHud(frameState);
    input.pressed = Object.create(null);
    requestAnimationFrame(frame);
  }
  resizeCanvas();
  syncHud(game.getFrameState());
  window.addEventListener("resize", resizeCanvas);
  requestAnimationFrame(frame);
})();
