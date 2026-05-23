(function () {
  const WIDTH = 960;
  const HEIGHT = 540;
  const TOTAL_ROUNDS = 12;
  const START_LIVES = 3;
  const MICROGAME_ORDER = ["dodge", "catch", "prompt", "jump"];
  const ROUND_INTRO_BASE_DURATION = 1.5;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayBody = document.getElementById("overlayBody");
  const objectiveLabel = document.getElementById("objectiveLabel");
  const roundLabel = document.getElementById("roundLabel");
  const timerLabel = document.getElementById("timerLabel");
  const livesLabel = document.getElementById("livesLabel");
  const scoreLabel = document.getElementById("scoreLabel");

  const keyState = new Map();
  const justPressed = new Set();

  let lastFrame = performance.now();
  let game = createSession();

  function createSession() {
    return {
      mode: "menu",
      round: 0,
      score: 0,
      lives: START_LIVES,
      flash: 0,
      pulse: 0,
      microgame: null,
      message: "",
      result: "",
      introTimer: 0,
      introDuration: ROUND_INTRO_BASE_DURATION,
    };
  }

  function createMicrogame(roundIndex) {
    const id = MICROGAME_ORDER[(roundIndex - 1) % MICROGAME_ORDER.length];
    const speed = 1 + (roundIndex - 1) * 0.12;
    const duration = Math.max(3.8, 7.2 - (roundIndex - 1) * 0.24);

    if (id === "dodge") {
      return {
        id,
        title: "Dodge Drop",
        objective: "Stay alive. Do not touch the red scrap.",
        duration,
        timer: duration,
        playerX: WIDTH * 0.5,
        playerSpeed: 340 + speed * 25,
        width: 48,
        height: 24,
        hazards: [],
        spawnTimer: 0,
        spawnRate: Math.max(0.2, 0.62 - speed * 0.05),
        successAt: duration,
        survived: 0,
        speed,
        introHint: "Move left or right. Survive only. No action button.",
      };
    }

    if (id === "catch") {
      return {
        id,
        title: "Catch Rush",
        objective: "Catch 6 stars before time runs out. Skip the bombs.",
        duration,
        timer: duration,
        basketX: WIDTH * 0.5,
        basketSpeed: 390 + speed * 20,
        width: 96,
        items: [],
        spawnTimer: 0,
        spawnRate: Math.max(0.28, 0.74 - speed * 0.06),
        caught: 0,
        target: 6,
        speed,
        introHint: "Slide under blue stars. Let red bombs fall past.",
      };
    }

    if (id === "prompt") {
      const prompts = [];
      const count = Math.min(10, 4 + roundIndex);
      const choices = ["left", "right", "up", "down", "space"];
      for (let i = 0; i < count; i += 1) {
        prompts.push(choices[Math.floor(Math.random() * choices.length)]);
      }
      return {
        id,
        title: "Prompt Panic",
        objective: "Hit the shown input before the stack runs out.",
        duration,
        timer: duration,
        prompts,
        current: 0,
        wobble: 0,
        introHint: "Hit exact shown key. Clear stack before it fills.",
      };
    }

    const jumpTarget = 5 + Math.floor(roundIndex * 0.25);
    return {
      id,
      title: "Gate Jump",
      objective: `Leap ${jumpTarget} blockers. Crash once and you fail.`,
      duration,
      timer: duration,
      runnerX: 180,
      runnerY: HEIGHT - 126,
      runnerVy: 0,
      gravity: 1240,
      jumpVelocity: -560,
      grounded: true,
      obstacles: [],
      spawnTimer: 0,
      spawnRate: Math.max(0.52, 1.2 - speed * 0.08),
      worldSpeed: 360 + speed * 45,
      cleared: 0,
      target: jumpTarget,
      introHint: "Jump with Up, W, Space, or Enter. One crash fails round.",
    };
  }

  function getIntroDuration(microgame) {
    if (!microgame) return ROUND_INTRO_BASE_DURATION;
    if (microgame.id === "prompt") return 2.25;
    if (microgame.id === "jump" || microgame.id === "catch") return 1.9;
    return 1.7;
  }

  function startRun() {
    game = createSession();
    game.message = "Round 1";
    nextRound();
  }

  function nextRound() {
    game.round += 1;
    if (game.round > TOTAL_ROUNDS) {
      winRun();
      return;
    }
    game.microgame = createMicrogame(game.round);
    game.mode = "countdown";
    game.introDuration = getIntroDuration(game.microgame);
    game.introTimer = game.introDuration;
    game.flash = 1;
    game.pulse = 0.4;
    game.message = `Next: ${game.microgame.title}`;
  }

  function loseLife(reason) {
    game.lives -= 1;
    game.flash = 1;
    game.pulse = 1;
    if (game.lives <= 0) {
      endRun("Game Over", reason);
      return;
    }
    game.message = `${reason} Next up.`;
    nextRound();
  }

  function clearRound(points) {
    game.score += points;
    game.flash = 0.45;
    game.pulse = 1;
    game.message = "Clear";
    nextRound();
  }

  function winRun() {
    endRun("You Cleared The Gauntlet", "All twelve microgames survived.");
  }

  function endRun(title, body) {
    game.mode = "result";
    game.result = title;
    game.message = body;
    game.microgame = null;
  }

  function axis() {
    let value = 0;
    if (isDown("ArrowLeft") || isDown("KeyA")) value -= 1;
    if (isDown("ArrowRight") || isDown("KeyD")) value += 1;
    return value;
  }

  function pressedAction() {
    return wasPressed("Space") || wasPressed("Enter");
  }

  function wasPressed(code) {
    return justPressed.has(code);
  }

  function isDown(code) {
    return keyState.get(code) === true;
  }

  function update(dt) {
    game.flash = Math.max(0, game.flash - dt * 1.8);
    game.pulse = Math.max(0, game.pulse - dt * 1.4);

    if (game.mode === "menu") {
      if (wasPressed("Enter") || wasPressed("Space")) startRun();
      return;
    }

    if (game.mode === "result") {
      if (wasPressed("KeyR") || wasPressed("Enter") || wasPressed("Space")) startRun();
      return;
    }

    if (game.mode === "countdown") {
      game.introTimer = Math.max(0, game.introTimer - dt);
      if (game.introTimer === 0) {
        game.mode = "playing";
        game.message = game.microgame ? game.microgame.title : "";
      }
      return;
    }

    const current = game.microgame;
    if (!current) return;

    current.timer -= dt;
    if (current.timer <= 0) {
      if (current.id === "dodge") {
        clearRound(100 + Math.ceil(current.duration * 20));
      } else {
        loseLife("Too slow");
      }
      return;
    }

    if (current.id === "dodge") updateDodge(current, dt);
    else if (current.id === "catch") updateCatch(current, dt);
    else if (current.id === "prompt") updatePrompt(current, dt);
    else if (current.id === "jump") updateJump(current, dt);
  }

  function updateDodge(current, dt) {
    current.playerX += axis() * current.playerSpeed * dt;
    current.playerX = clamp(current.playerX, 60, WIDTH - 60);

    current.spawnTimer -= dt;
    if (current.spawnTimer <= 0) {
      current.spawnTimer = current.spawnRate;
      current.hazards.push({
        x: 90 + Math.random() * (WIDTH - 180),
        y: -28,
        w: 42 + Math.random() * 24,
        h: 24 + Math.random() * 22,
        vy: 240 + Math.random() * 120 + current.speed * 60,
      });
    }

    for (const hazard of current.hazards) {
      hazard.y += hazard.vy * dt;
      const hit =
        Math.abs(hazard.x - current.playerX) < (hazard.w + current.width) * 0.42 &&
        Math.abs(hazard.y - (HEIGHT - 88)) < (hazard.h + current.height) * 0.5;
      if (hit) {
        loseLife("Crushed");
        return;
      }
    }

    current.hazards = current.hazards.filter((hazard) => hazard.y < HEIGHT + 40);
    current.survived += dt;
  }

  function updateCatch(current, dt) {
    current.basketX += axis() * current.basketSpeed * dt;
    current.basketX = clamp(current.basketX, 72, WIDTH - 72);

    current.spawnTimer -= dt;
    if (current.spawnTimer <= 0) {
      current.spawnTimer = current.spawnRate;
      current.items.push({
        kind: Math.random() < 0.72 ? "star" : "bomb",
        x: 80 + Math.random() * (WIDTH - 160),
        y: -16,
        vy: 260 + Math.random() * 110 + current.speed * 50,
      });
    }

    const basketY = HEIGHT - 80;
    for (let i = current.items.length - 1; i >= 0; i -= 1) {
      const item = current.items[i];
      item.y += item.vy * dt;
      const caught =
        Math.abs(item.x - current.basketX) < 58 &&
        Math.abs(item.y - basketY) < 24;
      if (caught) {
        current.items.splice(i, 1);
        if (item.kind === "bomb") {
          loseLife("Wrong catch");
          return;
        }
        current.caught += 1;
        game.score += 20;
        if (current.caught >= current.target) {
          clearRound(140);
          return;
        }
        continue;
      }
      if (item.y > HEIGHT + 30) {
        current.items.splice(i, 1);
      }
    }
  }

  function updatePrompt(current) {
    current.wobble += 0.15;
    const expected = current.prompts[current.current];
    if (!expected) {
      clearRound(150);
      return;
    }

    const hit =
      (expected === "left" && (wasPressed("ArrowLeft") || wasPressed("KeyA"))) ||
      (expected === "right" && (wasPressed("ArrowRight") || wasPressed("KeyD"))) ||
      (expected === "up" && (wasPressed("ArrowUp") || wasPressed("KeyW"))) ||
      (expected === "down" && (wasPressed("ArrowDown") || wasPressed("KeyS"))) ||
      (expected === "space" && (wasPressed("Space") || wasPressed("Enter")));

    if (hit) {
      current.current += 1;
      game.score += 25;
      if (current.current >= current.prompts.length) {
        clearRound(160);
      }
      return;
    }

    const pressedWrong =
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space", "Enter"]
        .some((code) => justPressed.has(code));

    if (pressedWrong) {
      loseLife("Wrong prompt");
    }
  }

  function updateJump(current, dt) {
    if (current.grounded && (wasPressed("ArrowUp") || wasPressed("KeyW") || pressedAction())) {
      current.runnerVy = current.jumpVelocity;
      current.grounded = false;
    }

    current.spawnTimer -= dt;
    if (current.spawnTimer <= 0) {
      current.spawnTimer = current.spawnRate + Math.random() * 0.28;
      current.obstacles.push({
        x: WIDTH + 40,
        y: HEIGHT - 110,
        w: 28 + Math.random() * 28,
        h: 48 + Math.random() * 30,
      });
    }

    current.runnerVy += current.gravity * dt;
    current.runnerY += current.runnerVy * dt;
    if (current.runnerY >= HEIGHT - 126) {
      current.runnerY = HEIGHT - 126;
      current.runnerVy = 0;
      current.grounded = true;
    }

    for (const obstacle of current.obstacles) {
      obstacle.x -= current.worldSpeed * dt;
      const hit =
        obstacle.x < current.runnerX + 26 &&
        obstacle.x + obstacle.w > current.runnerX - 20 &&
        obstacle.y < current.runnerY + 58 &&
        obstacle.y + obstacle.h > current.runnerY;
      if (hit) {
        loseLife("Missed jump");
        return;
      }
    }

    const before = current.obstacles.length;
    current.obstacles = current.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10);
    current.cleared += before - current.obstacles.length;
    if (current.cleared >= current.target) {
      clearRound(150);
    }
  }

  function renderBackground() {
    const glow = 0.16 + game.flash * 0.2;
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, `rgba(${18 + Math.floor(glow * 120)}, 35, 63, 1)`);
    bg.addColorStop(1, "rgba(7, 11, 22, 1)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 73 + game.round * 17) % WIDTH;
      const y = (i * 41 + game.round * 11) % HEIGHT;
      ctx.fillStyle = i % 2 === 0 ? "#6dd3ff" : "#ffd166";
      ctx.beginPath();
      ctx.arc(x, y, 2 + ((i + game.round) % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    renderBackground();

    if (game.mode === "menu") {
      renderMenuBackdrop();
    } else if (game.mode === "result") {
      renderResultBackdrop();
    } else if (game.microgame) {
      if (game.microgame.id === "dodge") renderDodge(game.microgame);
      else if (game.microgame.id === "catch") renderCatch(game.microgame);
      else if (game.microgame.id === "prompt") renderPrompt(game.microgame);
      else if (game.microgame.id === "jump") renderJump(game.microgame);
      if (game.mode === "countdown") renderCountdown();
    }

    renderFrame();
    updateHud();
    updateOverlay();
  }

  function renderMenuBackdrop() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    for (let i = 0; i < 4; i += 1) {
      const x = 160 + i * 170;
      ctx.fillRect(x, 130 + ((i % 2) * 60), 120, 120);
    }
    ctx.fillStyle = "#59f0a8";
    ctx.fillRect(200, 190, 84, 18);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(444, 222, 110, 18);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(655, 170, 96, 18);
  }

  function renderResultBackdrop() {
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#6dd3ff" : "#ffd166";
      ctx.fillRect(60 + i * 72, 110 + Math.sin(i + performance.now() * 0.002) * 24, 32, 180);
    }
    ctx.restore();
  }

  function renderDodge(current) {
    drawArenaGrid("#6dd3ff");

    ctx.fillStyle = "#1e2d49";
    ctx.fillRect(0, HEIGHT - 64, WIDTH, 64);

    for (const hazard of current.hazards) {
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(hazard.x - hazard.w * 0.5, hazard.y - hazard.h * 0.5, hazard.w, hazard.h);
    }

    ctx.fillStyle = "#59f0a8";
    ctx.fillRect(current.playerX - current.width * 0.5, HEIGHT - 100, current.width, current.height);
  }

  function renderCatch(current) {
    drawArenaGrid("#ffd166");

    for (const item of current.items) {
      ctx.fillStyle = item.kind === "star" ? "#ffd166" : "#ff6b6b";
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.kind === "star" ? 12 : 14, 0, Math.PI * 2);
      ctx.fill();
      if (item.kind === "star") {
        ctx.strokeStyle = "#fff2c9";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(item.x - 14, item.y);
        ctx.lineTo(item.x + 14, item.y);
        ctx.moveTo(item.x, item.y - 14);
        ctx.lineTo(item.x, item.y + 14);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#6dd3ff";
    ctx.fillRect(current.basketX - current.width * 0.5, HEIGHT - 82, current.width, 22);
    ctx.fillStyle = "rgba(109, 211, 255, 0.25)";
    ctx.fillRect(current.basketX - current.width * 0.5, HEIGHT - 100, current.width, 18);

    drawProgressBar(30, 30, 240, 16, current.caught / current.target, "#59f0a8");
  }

  function renderPrompt(current) {
    drawArenaGrid("#59f0a8");

    const expected = current.prompts[current.current];
    const wobble = Math.sin(current.wobble) * 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(240, 120, 480, 260);

    ctx.fillStyle = "#edf4ff";
    ctx.font = "700 32px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("Hit This", WIDTH * 0.5, 188);

    ctx.font = "700 110px Trebuchet MS";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(promptGlyph(expected), WIDTH * 0.5, 286 + wobble);

    ctx.font = "600 22px Trebuchet MS";
    ctx.fillStyle = "#6dd3ff";
    ctx.fillText(`${current.current + 1} / ${current.prompts.length}`, WIDTH * 0.5, 338);

    const progress = current.current / current.prompts.length;
    drawProgressBar(250, 368, 460, 18, progress, "#59f0a8");
  }

  function renderJump(current) {
    drawArenaGrid("#ff6b6b");

    ctx.fillStyle = "#1e2d49";
    ctx.fillRect(0, HEIGHT - 66, WIDTH, 66);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    for (let i = 0; i < WIDTH; i += 80) {
      ctx.fillRect(i, HEIGHT - 54, 40, 6);
    }

    for (const obstacle of current.obstacles) {
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
    }

    ctx.fillStyle = "#59f0a8";
    ctx.fillRect(current.runnerX - 16, current.runnerY, 32, 58);
    ctx.fillStyle = "#edf4ff";
    ctx.fillRect(current.runnerX + 8, current.runnerY + 10, 18, 10);
  }

  function renderFrame() {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, WIDTH - 36, HEIGHT - 36);
    ctx.restore();

    if (game.flash > 0) {
      ctx.save();
      ctx.globalAlpha = game.flash * 0.16;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(18, HEIGHT - 48, WIDTH - 36, 2);
  }

  function renderCountdown() {
    const current = game.microgame;
    if (!current) return;

    const remaining = Math.max(1, Math.ceil(game.introTimer));
    const progress = 1 - clamp(game.introTimer / Math.max(0.001, game.introDuration), 0, 1);

    ctx.save();
    ctx.fillStyle = "rgba(3, 6, 12, 0.62)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(14, 20, 36, 0.92)";
    ctx.fillRect(220, 118, 520, 348);

    ctx.textAlign = "center";
    ctx.fillStyle = "#6dd3ff";
    ctx.font = "700 20px Trebuchet MS";
    ctx.fillText(`Round ${game.round} / ${TOTAL_ROUNDS}`, WIDTH * 0.5, 196);

    ctx.fillStyle = "#edf4ff";
    ctx.font = "700 44px Trebuchet MS";
    ctx.fillText(current.title, WIDTH * 0.5, 246);

    ctx.fillStyle = "#d6e3ff";
    ctx.font = "600 24px Trebuchet MS";
    ctx.fillText(current.objective, WIDTH * 0.5, 288);

    ctx.fillStyle = "#8fb8ff";
    ctx.font = "700 18px Trebuchet MS";
    ctx.fillText("HOW", WIDTH * 0.5, 322);

    ctx.fillStyle = "#edf4ff";
    ctx.font = "600 18px Trebuchet MS";
    ctx.fillText(current.introHint || "Read rule. Then move.", WIDTH * 0.5, 346);

    ctx.fillStyle = "#ffd166";
    ctx.font = "700 84px Trebuchet MS";
    ctx.fillText(String(remaining), WIDTH * 0.5, 408);

    drawProgressBar(278, 430, 404, 14, progress, "#59f0a8");
    ctx.restore();
  }

  function drawArenaGrid(color) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18 + game.pulse * 0.08;
    ctx.fillRect(0, 0, WIDTH, 18);
    ctx.restore();
  }

  function drawProgressBar(x, y, width, height, progress, color) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * clamp(progress, 0, 1), height);
  }

  function updateHud() {
    if (game.mode === "menu") {
      objectiveLabel.textContent = "Press Enter to start";
      roundLabel.textContent = `Round 0 / ${TOTAL_ROUNDS}`;
      timerLabel.textContent = "0.0s";
    } else if (game.mode === "result") {
      objectiveLabel.textContent = game.message;
      roundLabel.textContent = `Round ${Math.min(game.round, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS}`;
      timerLabel.textContent = "0.0s";
    } else if (game.mode === "countdown" && game.microgame) {
      objectiveLabel.textContent = `${game.microgame.title}: ${game.microgame.objective}`;
      roundLabel.textContent = `Round ${game.round} / ${TOTAL_ROUNDS}`;
      timerLabel.textContent = `Ready ${Math.max(0, game.introTimer).toFixed(1)}s`;
    } else if (game.microgame) {
      objectiveLabel.textContent = `${game.microgame.title}: ${game.microgame.objective}`;
      roundLabel.textContent = `Round ${game.round} / ${TOTAL_ROUNDS}`;
      timerLabel.textContent = `${Math.max(0, game.microgame.timer).toFixed(1)}s`;
    }

    livesLabel.textContent = `Lives ${game.lives}`;
    scoreLabel.textContent = `Score ${game.score}`;
  }

  function updateOverlay() {
    if (game.mode === "playing" || game.mode === "countdown") {
      overlay.classList.add("hidden");
      return;
    }

    overlay.classList.remove("hidden");
    if (game.mode === "menu") {
      overlayTitle.textContent = "Eight Seconds. One Rule.";
      overlayBody.textContent = "Clear short one-screen microgames before the prompt speed crushes you.";
      return;
    }

    overlayTitle.textContent = game.result;
    overlayBody.textContent = `${game.message} Score ${game.score}. Press Enter or R to run again.`;
  }

  function promptGlyph(prompt) {
    if (prompt === "left") return "LEFT";
    if (prompt === "right") return "RIGHT";
    if (prompt === "up") return "UP";
    if (prompt === "down") return "DOWN";
    return "SPACE";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loop(timestamp) {
    const dt = Math.min(0.033, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    update(dt);
    render();
    justPressed.clear();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    if (!keyState.get(event.code)) justPressed.add(event.code);
    keyState.set(event.code, true);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    keyState.set(event.code, false);
  });

  updateHud();
  updateOverlay();
  requestAnimationFrame(loop);
})();
