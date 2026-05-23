(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const clockEl = document.getElementById("clock");
  const echoesEl = document.getElementById("echoes");
  const signalEl = document.getElementById("signal");
  const banner = document.getElementById("banner");
  const bannerTitle = document.getElementById("banner-title");
  const bannerText = document.getElementById("banner-text");
  const keys = new Set();

  const world = { w: 960, h: 540 };
  const player = { x: 120, y: 420, r: 12, speed: 220 };
  const goal = { x: 850, y: 110, r: 24 };
  const hazards = [
    { x: 280, y: 200, w: 160, h: 24, phase: 0.0 },
    { x: 560, y: 300, w: 190, h: 24, phase: 0.6 },
    { x: 410, y: 410, w: 210, h: 24, phase: 1.2 },
  ];
  const echoTrail = [];
  const echoRuns = [];
  let state = "play";
  let timer = 0;
  let pulse = 0;
  let gateTimer = 0;
  let messageTimer = 0;

  function resize() {
    const scale = Math.min(window.innerWidth / world.w, window.innerHeight / world.h);
    canvas.width = Math.floor(world.w * devicePixelRatio * scale);
    canvas.height = Math.floor(world.h * devicePixelRatio * scale);
    ctx.setTransform(devicePixelRatio * scale, 0, 0, devicePixelRatio * scale, 0, 0);
  }

  function reset() {
    player.x = 120;
    player.y = 420;
    timer = 0;
    pulse = 0;
    gateTimer = 0;
    state = "play";
    banner.classList.add("hidden");
    echoTrail.length = 0;
    echoRuns.length = 0;
    signalEl.textContent = "Stable";
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function drawGrid() {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--grid");
    ctx.lineWidth = 1;
    for (let x = 0; x <= world.w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.h);
      ctx.stroke();
    }
    for (let y = 0; y <= world.h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(world.w, y);
      ctx.stroke();
    }
  }

  function drawHazard(h, t) {
    const wobble = Math.sin(t * 2 + h.phase) * 8;
    ctx.fillStyle = "rgba(255,111,139,0.18)";
    ctx.fillRect(h.x, h.y + wobble, h.w, h.h);
    ctx.fillStyle = "rgba(255,111,139,0.78)";
    ctx.fillRect(h.x, h.y + wobble, h.w * 0.25, h.h);
  }

  function hitRectCircle(h, p) {
    const cx = clamp(p.x, h.x, h.x + h.w);
    const cy = clamp(p.y, h.y, h.y + h.h);
    const dx = p.x - cx;
    const dy = p.y - cy;
    return dx * dx + dy * dy < p.r * p.r;
  }

  function updateEchoes(dt) {
    if (keys.has(" ")) {
      if (echoTrail.length > 8) {
        echoRuns.push(echoTrail.splice(0, echoTrail.length));
        signalEl.textContent = "Echoed";
        messageTimer = 1.2;
      }
      keys.delete(" ");
    }
  }

  function replayEchoes(t) {
    for (const run of echoRuns) {
      if (run.length < 2) continue;
      const idx = Math.min(run.length - 1, Math.floor((t * 3) % run.length));
      const p = run[idx];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(126,167,255,0.8)";
      ctx.fill();
    }
  }

  function step(dt) {
    if (state !== "play") return;
    timer += dt;
    pulse += dt;
    gateTimer += dt;

    const moveX = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    const moveY = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
    const length = Math.hypot(moveX, moveY) || 1;
    player.x = clamp(player.x + (moveX / length) * player.speed * dt, 20, world.w - 20);
    player.y = clamp(player.y + (moveY / length) * player.speed * dt, 20, world.h - 20);

    updateEchoes(dt);
    echoTrail.push({ x: player.x, y: player.y });
    if (echoTrail.length > 90) echoTrail.shift();
    if (echoRuns.length > 6) echoRuns.shift();

    for (const h of hazards) {
      if (hitRectCircle(h, player)) {
        signalEl.textContent = "Broken";
        banner.classList.remove("hidden");
        bannerTitle.textContent = "Pulse caught you";
        bannerText.textContent = "Restart with R and try a cleaner echo line.";
        state = "fail";
      }
    }

    const dx = player.x - goal.x;
    const dy = player.y - goal.y;
    if (Math.hypot(dx, dy) < player.r + goal.r) {
      state = "win";
      banner.classList.remove("hidden");
      bannerTitle.textContent = "Gate open";
      bannerText.textContent = "You braided the loop and reached the exit.";
      signalEl.textContent = "Clear";
    }

    if (pulse > 9) {
      pulse = 0;
      signalEl.textContent = "Pulse";
      messageTimer = 1.0;
    }

    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0 && state === "play") signalEl.textContent = "Stable";
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, world.w, world.h);
    const glow = ctx.createLinearGradient(0, 0, world.w, world.h);
    glow.addColorStop(0, "rgba(126,167,255,0.06)");
    glow.addColorStop(1, "rgba(129,244,199,0.05)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, world.w, world.h);
    drawGrid();

    for (const h of hazards) drawHazard(h, t);
    replayEchoes(t);

    ctx.fillStyle = "rgba(129,244,199,0.9)";
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.r + Math.sin(t * 3) * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(11,16,32,0.95)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(129,244,199,0.95)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(126,167,255,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.r + 12, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < echoTrail.length; i += 6) {
      const p = echoTrail[i];
      ctx.fillStyle = `rgba(126,167,255,${i / echoTrail.length * 0.45})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state === "play") {
      ctx.fillStyle = `rgba(126,167,255,${0.12 + Math.abs(Math.sin(t * 4)) * 0.12})`;
      ctx.fillRect(0, 0, world.w, world.h);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    step(dt);
    draw(now / 1000);
    clockEl.textContent = timer.toFixed(1);
    echoesEl.textContent = String(echoRuns.length);
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "r" || event.key === "R") reset();
    keys.add(event.key);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key));
  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(frame);
})();
