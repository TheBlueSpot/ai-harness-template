(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayBody = document.getElementById("overlayBody");
  const overlayButton = document.getElementById("overlayButton");

  const hud = {
    score: document.getElementById("scoreValue"),
    round: document.getElementById("roundValue"),
    rally: document.getElementById("rallyValue"),
    speed: document.getElementById("speedValue"),
    status: document.getElementById("statusValue"),
  };

  const ARENA = {
    width: 360,
    height: 220,
    depth: 1000,
    nearZ: 52,
    farZ: 948,
  };

  const input = {
    pointerX: 0,
    pointerY: 0,
    pointerReady: false,
    left: false,
    right: false,
    up: false,
    down: false,
  };

  let state = null;
  let lastTime = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function createState() {
    return {
      mode: "menu",
      playerScore: 0,
      enemyScore: 0,
      round: 1,
      status: "Track the ball and shape the return.",
      pointDelay: 0,
      server: "player",
      rally: 0,
      windPhase: 0,
      player: {
        x: 0,
        y: 0,
        lastX: 0,
        lastY: 0,
        vx: 0,
        vy: 0,
        width: 86,
        height: 54,
      },
      enemy: {
        x: 0,
        y: 0,
        width: 86,
        height: 54,
      },
      ball: null,
    };
  }

  function setOverlay(title, body, buttonLabel) {
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayButton.textContent = buttonLabel;
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function updateHud() {
    hud.score.textContent = `${state.playerScore} - ${state.enemyScore}`;
    hud.round.textContent = `Round ${state.round}`;
    hud.rally.textContent = `${state.rally}`;
    hud.speed.textContent = state.ball ? `${Math.round(Math.abs(state.ball.vz) * 3.2)}` : "0";
    hud.status.textContent = state.status;
  }

  function stageConfig(round) {
    if (round === 1) {
      return { paddleScale: 1, speedBonus: 1, wind: 0, tunnelWidth: 1 };
    }
    if (round === 2) {
      return { paddleScale: 0.88, speedBonus: 1.14, wind: 0, tunnelWidth: 0.88 };
    }
    return { paddleScale: 0.74, speedBonus: 1.28, wind: 22, tunnelWidth: 0.76 };
  }

  function syncRoundFromScore() {
    const total = state.playerScore + state.enemyScore;
    state.round = total >= 6 ? 3 : total >= 3 ? 2 : 1;
    const config = stageConfig(state.round);
    state.player.width = 86 * config.paddleScale;
    state.player.height = 54 * config.paddleScale;
    state.enemy.width = 86 * config.paddleScale;
    state.enemy.height = 54 * config.paddleScale;
  }

  function resetBall(server) {
    const dir = server === "player" ? 1 : -1;
    const z = server === "player" ? 170 : 830;
    const config = stageConfig(state.round);
    state.ball = {
      x: 0,
      y: 0,
      z,
      vx: 95 * dir,
      vy: -30,
      vz: 0,
      readyVz: 255 * dir * config.speedBonus,
      spinX: 0,
      spinY: 0,
      radius: 12,
      trail: [],
      lastHit: server,
    };
    state.rally = 0;
  }

  function startMatch() {
    state = createState();
    state.mode = "playing";
    syncRoundFromScore();
    resetBall("player");
    state.status = "Serve when ready.";
    hideOverlay();
    updateHud();
    lastTime = 0;
  }

  function endMatch(mode) {
    state.mode = mode;
    const win = mode === "win";
    setOverlay(
      win ? "Spin duel won." : "Tunnel lost.",
      win
        ? "You bent enough returns off the glass to take the match. Run it again for a cleaner final round."
        : "The rival read too many angles. Restart and swipe through contact to add heavier curve.",
      "Play Again"
    );
  }

  function scorePoint(winner) {
    if (winner === "player") {
      state.playerScore += 1;
      state.status = "Point for player. Serve again.";
    } else {
      state.enemyScore += 1;
      state.status = "Point for rival. Read the next serve.";
    }
    if (state.playerScore >= 5) {
      endMatch("win");
      return;
    }
    if (state.enemyScore >= 5) {
      endMatch("lose");
      return;
    }
    state.server = winner === "player" ? "enemy" : "player";
    syncRoundFromScore();
    resetBall(state.server);
    state.pointDelay = 0.7;
  }

  function toArenaX(screenX) {
    return lerp(-ARENA.width * 0.5, ARENA.width * 0.5, screenX / canvas.width);
  }

  function toArenaY(screenY) {
    return lerp(-ARENA.height * 0.5, ARENA.height * 0.5, screenY / canvas.height);
  }

  function updatePlayer(dt) {
    const player = state.player;
    player.lastX = player.x;
    player.lastY = player.y;

    let targetX = player.x;
    let targetY = player.y;

    if (input.pointerReady) {
      targetX = toArenaX(input.pointerX);
      targetY = toArenaY(input.pointerY);
    }

    const keyboardX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const keyboardY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (keyboardX || keyboardY) {
      targetX += keyboardX * 260 * dt;
      targetY += keyboardY * 220 * dt;
    }

    const config = stageConfig(state.round);
    const boundsX = (ARENA.width * config.tunnelWidth) * 0.5 - player.width * 0.5;
    const boundsY = ARENA.height * 0.5 - player.height * 0.5;
    player.x = clamp(lerp(player.x, targetX, 1 - Math.pow(0.002, dt)), -boundsX, boundsX);
    player.y = clamp(lerp(player.y, targetY, 1 - Math.pow(0.002, dt)), -boundsY, boundsY);
    player.vx = (player.x - player.lastX) / Math.max(dt, 0.001);
    player.vy = (player.y - player.lastY) / Math.max(dt, 0.001);
  }

  function predictEnemyTarget() {
    const ball = state.ball;
    if (!ball || ball.vz <= 0) {
      return { x: 0, y: 0 };
    }
    const timeToFar = (ARENA.farZ - ball.z) / Math.max(ball.vz, 1);
    return {
      x: clamp(ball.x + ball.vx * timeToFar + ball.spinX * timeToFar * 0.7, -140, 140),
      y: clamp(ball.y + ball.vy * timeToFar + ball.spinY * timeToFar * 0.7, -80, 80),
    };
  }

  function updateEnemy(dt) {
    const enemy = state.enemy;
    const target = predictEnemyTarget();
    const speed = 170 + state.round * 45;
    enemy.x = lerp(enemy.x, target.x, clamp(dt * speed * 0.01, 0, 1));
    enemy.y = lerp(enemy.y, target.y, clamp(dt * speed * 0.01, 0, 1));
  }

  function reflectFromPaddle(paddle, isPlayer) {
    const ball = state.ball;
    const config = stageConfig(state.round);
    const offsetX = (ball.x - paddle.x) / (paddle.width * 0.5);
    const offsetY = (ball.y - paddle.y) / (paddle.height * 0.5);

    ball.vz = Math.abs(ball.vz) * config.speedBonus * (isPlayer ? 1 : -1);
    ball.vx += offsetX * 180 + (isPlayer ? state.player.vx * 0.22 : 0);
    ball.vy += offsetY * 130 + (isPlayer ? state.player.vy * 0.22 : 0);
    ball.spinX = clamp(ball.spinX + offsetX * 55 + (isPlayer ? state.player.vx * 0.05 : 0), -120, 120);
    ball.spinY = clamp(ball.spinY + offsetY * 40 + (isPlayer ? state.player.vy * 0.05 : 0), -90, 90);
    ball.lastHit = isPlayer ? "player" : "enemy";
    state.rally += 1;
    state.status = isPlayer ? "Heavy return." : "Enemy sent it back.";
  }

  function updateBall(dt) {
    if (state.pointDelay > 0) {
      state.pointDelay = Math.max(0, state.pointDelay - dt);
      if (state.pointDelay === 0) {
        state.status = state.server === "player" ? "Your serve." : "Enemy serve incoming.";
      }
      return;
    }

    const ball = state.ball;
    const config = stageConfig(state.round);
    const wind = config.wind ? Math.sin(state.windPhase * 1.6) * config.wind : 0;

    ball.vx += (ball.spinX * 0.45 + wind) * dt;
    ball.vy += ball.spinY * 0.45 * dt;
    ball.spinX *= Math.pow(0.992, dt * 60);
    ball.spinY *= Math.pow(0.992, dt * 60);

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    const halfWidth = (ARENA.width * config.tunnelWidth) * 0.5 - ball.radius;
    const halfHeight = ARENA.height * 0.5 - ball.radius;

    if (ball.x < -halfWidth || ball.x > halfWidth) {
      ball.x = clamp(ball.x, -halfWidth, halfWidth);
      ball.vx *= -1;
      ball.spinX *= -0.82;
      state.status = "Glass kiss.";
    }
    if (ball.y < -halfHeight || ball.y > halfHeight) {
      ball.y = clamp(ball.y, -halfHeight, halfHeight);
      ball.vy *= -1;
      ball.spinY *= -0.82;
      state.status = "High deflection.";
    }

    if (ball.vz < 0 && ball.z <= ARENA.nearZ) {
      if (
        Math.abs(ball.x - state.player.x) <= state.player.width * 0.5 + ball.radius &&
        Math.abs(ball.y - state.player.y) <= state.player.height * 0.5 + ball.radius
      ) {
        ball.z = ARENA.nearZ;
        reflectFromPaddle(state.player, true);
      } else {
        scorePoint("enemy");
        return;
      }
    }

    if (ball.vz > 0 && ball.z >= ARENA.farZ) {
      if (
        Math.abs(ball.x - state.enemy.x) <= state.enemy.width * 0.5 + ball.radius &&
        Math.abs(ball.y - state.enemy.y) <= state.enemy.height * 0.5 + ball.radius
      ) {
        ball.z = ARENA.farZ;
        reflectFromPaddle(state.enemy, false);
      } else {
        scorePoint("player");
        return;
      }
    }

    ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
    if (ball.trail.length > 12) {
      ball.trail.shift();
    }
  }

  function update(dt) {
    if (!state || state.mode !== "playing") {
      return;
    }
    state.windPhase += dt;
    updatePlayer(dt);
    updateEnemy(dt);
    updateBall(dt);
    updateHud();
  }

  function project(x, y, z) {
    const t = z / ARENA.depth;
    const width = lerp(canvas.width * 0.76, canvas.width * 0.18, t);
    const height = lerp(canvas.height * 0.64, canvas.height * 0.16, t);
    return {
      x: canvas.width * 0.5 + (x / (ARENA.width * 0.5)) * (width * 0.5),
      y: canvas.height * 0.54 + (y / (ARENA.height * 0.5)) * (height * 0.5),
      width,
      height,
      t,
    };
  }

  function drawTunnel() {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#112746");
    sky.addColorStop(0.45, "#091627");
    sky.addColorStop(1, "#05080f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const config = stageConfig(state.round);
    for (let i = 0; i < 9; i += 1) {
      const z = lerp(0, ARENA.depth, i / 8);
      const p = project(0, 0, z);
      const glow = 1 - i / 9;
      ctx.strokeStyle = `rgba(92, 201, 255, ${0.08 + glow * 0.2})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        canvas.width * 0.5 - (p.width * config.tunnelWidth) * 0.5,
        canvas.height * 0.54 - p.height * 0.5,
        p.width * config.tunnelWidth,
        p.height
      );
    }

    if (state.round === 3) {
      const gust = Math.sin(state.windPhase * 1.6);
      const center = canvas.width * 0.5 + gust * 90;
      ctx.strokeStyle = "rgba(173, 245, 255, 0.18)";
      ctx.lineWidth = 5;
      for (let i = 0; i < 3; i += 1) {
        const y = 180 + i * 120;
        ctx.beginPath();
        ctx.moveTo(center - 180, y);
        ctx.quadraticCurveTo(center, y + 20, center + 180, y);
        ctx.stroke();
      }
    }
  }

  function drawPaddle(entity, z, color) {
    const p = project(entity.x, entity.y, z);
    const w = (entity.width / ARENA.width) * p.width;
    const h = (entity.height / ARENA.height) * p.height;
    ctx.fillStyle = color;
    ctx.fillRect(p.x - w * 0.5, p.y - h * 0.5, w, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - w * 0.5, p.y - h * 0.5, w, h);
  }

  function drawBall() {
    const ball = state.ball;
    if (!ball) {
      return;
    }
    for (let i = 0; i < ball.trail.length; i += 1) {
      const trail = ball.trail[i];
      const p = project(trail.x, trail.y, trail.z);
      const alpha = (i + 1) / ball.trail.length;
      ctx.fillStyle = `rgba(111, 221, 255, ${alpha * 0.14})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lerp(4, 12, 1 - p.t) * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    const p = project(ball.x, ball.y, ball.z);
    const radius = lerp(18, 7, p.t);
    const gradient = ctx.createRadialGradient(p.x - radius * 0.35, p.y - radius * 0.35, radius * 0.1, p.x, p.y, radius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.4, "#95efff");
    gradient.addColorStop(1, "#33bfff");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawServeCue() {
    if (!state.ball) {
      return;
    }
    if (state.pointDelay > 0) {
      return;
    }
    if (Math.abs(state.ball.vz) > 0.1) {
      return;
    }
    ctx.fillStyle = "rgba(224, 248, 255, 0.86)";
    ctx.font = "600 18px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(state.server === "player" ? "Serve when ready" : "Launch the rival serve", canvas.width * 0.5, canvas.height - 42);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state) {
      return;
    }
    drawTunnel();
    drawPaddle(state.enemy, ARENA.farZ, "#ff8f6b");
    drawBall();
    drawPaddle(state.player, ARENA.nearZ, "#79dfff");
    drawServeCue();
  }

  function frame(time) {
    if (!lastTime) {
      lastTime = time;
    }
    const dt = Math.min(0.033, (time - lastTime) / 1000);
    lastTime = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function serveBall() {
    if (!state || state.mode !== "playing" || state.pointDelay > 0) {
      return;
    }
    if (Math.abs(state.ball.vz) <= 0.1) {
      state.ball.vz = state.ball.readyVz;
      state.status = state.server === "player" ? "Serve out." : "Enemy serve live.";
    }
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function onKey(event, pressed) {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") input.left = pressed;
    if (key === "arrowright" || key === "d") input.right = pressed;
    if (key === "arrowup" || key === "w") input.up = pressed;
    if (key === "arrowdown" || key === "s") input.down = pressed;
    if ((key === " " || key === "enter") && pressed) {
      if (!state || state.mode !== "playing") {
        startMatch();
      } else {
        serveBall();
      }
    }
    if (key === "r" && pressed && state && state.mode !== "playing") {
      startMatch();
    }
  }

  overlayButton.addEventListener("click", startMatch);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => onKey(event, true));
  window.addEventListener("keyup", (event) => onKey(event, false));
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    input.pointerX = (event.clientX - rect.left) * (canvas.width / rect.width);
    input.pointerY = (event.clientY - rect.top) * (canvas.height / rect.height);
    input.pointerReady = true;
  });
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      if (!state || state.mode !== "playing") {
        startMatch();
      } else {
        serveBall();
      }
    }
  });

  resize();
  state = createState();
  updateHud();
  setOverlay(
    "Bend the tunnel back at the bot.",
    "Move the paddle with the mouse or arrow keys. Click, press Space, or Enter to serve. Swipe across the ball to add curve. First to five points wins.",
    "Start Match"
  );
  requestAnimationFrame(frame);
})();
