(function () {
  const WORLD = {
    left: 0.06,
    right: 0.94,
    top: 0.08,
    bottom: 0.94,
  };

  function createInitialState() {
    return {
      mode: "menu",
      score: 0,
      lives: 3,
      stage: 1,
      stageGoal: 0,
      hint: "Stand under the big blob, fire once, then sidestep the split.",
      overlayKicker: "Arcade Shell",
      overlayTitle: "Pang Skyburst",
      overlayCopy: "Stand under the big blob, fire one tether, sidestep the split, then finish the small pair.",
      overlayPrimary: "Start",
      messageTimer: 0,
      transitionTimer: 0,
      totalBlobs: 0,
      player: {
        x: 0.5,
        y: 0.81,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: true,
        width: 0.05,
        height: 0.06,
        invuln: 0,
      },
      harpoon: {
        active: false,
        x: 0.5,
        y: 0.85,
        vy: 0,
        width: 0.01,
        height: 0.16,
        cooldown: 0,
      },
      blobs: [],
      platforms: [],
    };
  }

  function createPlatformSet() {
    return [
      { x: 0.12, y: 0.84, w: 0.76, h: 0.02 },
      { x: 0.05, y: 0.58, w: 0.28, h: 0.02 },
      { x: 0.67, y: 0.58, w: 0.28, h: 0.02 },
      { x: 0.2, y: 0.34, w: 0.24, h: 0.02 },
      { x: 0.56, y: 0.34, w: 0.24, h: 0.02 },
    ];
  }

  function createStageBlobs(stage) {
    return [
      {
        id: 1,
        size: 3,
        x: 0.5,
        y: 0.24,
        vx: stage % 2 === 0 ? -0.22 : 0.22,
        vy: 0,
        radius: 0.085,
        bobSeed: 0.5,
      },
    ];
  }

  const GRAVITY = 2.3;
  const MOVE_ACCEL = 3.8;
  const MAX_SPEED = 0.38;
  const FRICTION = 8.5;
  const JUMP_SPEED = 0.72;
  const BLOB_BOUNCE = 0.84;

  function describeBlobPlan(blobs) {
    if (blobs.length === 0) return "Stage clear pending.";
    if (blobs.length === 1 && blobs[0].size >= 3) {
      return "Stand under the big blob, fire once, then sidestep the split.";
    }
    if (blobs.some((blob) => blob.size > 1)) {
      return "Split a medium blob, then clear the small pair before they box you in.";
    }
    return "Finish the small blobs. One hit each.";
  }

  function applyPlayerMotion(player, input, dt) {
    const left = Boolean(input.held.ArrowLeft || input.held.KeyA);
    const right = Boolean(input.held.ArrowRight || input.held.KeyD);
    const jump = Boolean(input.pressed.ArrowUp || input.pressed.KeyW);

    let dir = 0;
    if (left) dir -= 1;
    if (right) dir += 1;
    if (dir !== 0) player.facing = dir;

    player.vx += dir * MOVE_ACCEL * dt;
    if (dir === 0) {
      const damp = Math.min(1, FRICTION * dt);
      player.vx *= 1 - damp;
    }
    player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));

    if (jump && player.onGround) {
      player.vy = -JUMP_SPEED;
      player.onGround = false;
    }

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const halfW = player.width * 0.5;
    const minX = WORLD.left + halfW;
    const maxX = WORLD.right - halfW;
    player.x = Math.max(minX, Math.min(maxX, player.x));
    if (player.x === minX || player.x === maxX) player.vx = 0;
  }

  function updateHarpoon(harpoon, player, input, dt) {
    harpoon.cooldown = Math.max(0, harpoon.cooldown - dt);
    const fire = Boolean(input.pressed.KeyJ || input.pressed.KeyX || input.pressed.ControlLeft || input.pressed.ControlRight);
    if (fire && !harpoon.active && harpoon.cooldown === 0) {
      harpoon.active = true;
      harpoon.x = player.x + player.facing * 0.01;
      harpoon.y = player.y - player.height * 0.5;
      harpoon.vy = -1.2;
      harpoon.cooldown = 0.12;
    }
    if (harpoon.active) {
      harpoon.y += harpoon.vy * dt;
    }
  }

  function resolveGround(player, platforms) {
    player.onGround = false;
    const foot = player.y + player.height * 0.5;
    for (const platform of platforms) {
      const top = platform.y;
      const left = platform.x;
      const right = platform.x + platform.w;
      const withinX = player.x + player.width * 0.45 > left && player.x - player.width * 0.45 < right;
      const falling = player.vy >= 0;
      if (withinX && falling && foot >= top && foot - player.vy * 0.02 <= top) {
        player.y = top - player.height * 0.5;
        player.vy = 0;
        player.onGround = true;
        return;
      }
    }
  }

  function updateBlob(blob, dt, platforms) {
    blob.vy += GRAVITY * 0.82 * dt;
    blob.x += blob.vx * dt;
    blob.y += blob.vy * dt;
    blob.bobSeed += dt * 2.4;

    const left = WORLD.left + blob.radius;
    const right = WORLD.right - blob.radius;
    if (blob.x < left) {
      blob.x = left;
      blob.vx = Math.abs(blob.vx);
    }
    if (blob.x > right) {
      blob.x = right;
      blob.vx = -Math.abs(blob.vx);
    }

    const floor = WORLD.bottom - blob.radius;
    if (blob.y > floor) {
      blob.y = floor;
      blob.vy = -Math.abs(blob.vy) * BLOB_BOUNCE;
    }

    for (const platform of platforms) {
      const onTop = blob.x > platform.x - blob.radius && blob.x < platform.x + platform.w + blob.radius;
      const crossing = blob.y + blob.radius >= platform.y && blob.y + blob.radius - blob.vy * dt < platform.y;
      if (onTop && crossing && blob.vy > 0) {
        blob.y = platform.y - blob.radius;
        blob.vy = -Math.abs(blob.vy) * BLOB_BOUNCE;
      }
    }
  }

  function ballDamageRadius(size) {
    return [0.085, 0.062, 0.042][Math.max(0, Math.min(2, 3 - size))] || 0.042;
  }

  function cloneFrame(state) {
    return {
      mode: state.mode,
      score: state.score,
      lives: state.lives,
      stage: state.stage,
      stageGoal: state.stageGoal,
      hint: state.hint,
      overlayKicker: state.overlayKicker,
      overlayTitle: state.overlayTitle,
      overlayCopy: state.overlayCopy,
      overlayPrimary: state.overlayPrimary,
      player: { ...state.player },
      harpoon: { ...state.harpoon },
      blobs: state.blobs.map((blob) => ({ ...blob })),
      platforms: state.platforms.map((platform) => ({ ...platform })),
    };
  }

  class Game {
    constructor() {
      this.state = createInitialState();
      this.nextBlobId = 1;
      this.started = false;
    }

    start() {
      this.started = true;
      if (this.state.mode === "menu") this.restart();
    }

    restart() {
      this.state = createInitialState();
      this.state.mode = "play";
      this.state.overlayCopy = "Stand under the big blob, fire once, then move before the split closes your lane.";
      this.state.overlayPrimary = "Restart";
      this.state.platforms = createPlatformSet();
      this.state.blobs = createStageBlobs(1).map((blob) => ({ ...blob, id: this.nextBlobId++ }));
      this.state.totalBlobs = this.state.blobs.length;
      this.state.hint = describeBlobPlan(this.state.blobs);
    }

    update(dt, input) {
      if (!this.started) return;
      this.state.messageTimer = Math.max(0, this.state.messageTimer - dt);
      this.state.transitionTimer = Math.max(0, this.state.transitionTimer - dt);

      if (this.state.mode === "menu") {
        if (input.pressed.Enter || input.pressed.Space) this.restart();
        return;
      }

      if (this.state.mode === "lose" || this.state.mode === "clear") {
        if (this.state.transitionTimer === 0 && (input.pressed.Enter || input.pressed.Space || input.pressed.KeyR)) {
          this.restart();
        }
        return;
      }

      if (input.pressed.KeyR) {
        this.restart();
        return;
      }

      const player = this.state.player;
      const harpoon = this.state.harpoon;
      applyPlayerMotion(player, input, dt);
      updateHarpoon(harpoon, player, input, dt);
      resolveGround(player, this.state.platforms);

      for (const blob of this.state.blobs) {
        updateBlob(blob, dt, this.state.platforms);
      }

      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);

      this.resolveHarpoonHits();
      this.resolvePlayerHits();
      this.state.stageGoal = Math.max(0, Math.round((1 - this.state.blobs.length / Math.max(1, this.state.totalBlobs)) * 100));
      this.state.hint = describeBlobPlan(this.state.blobs);

      if (this.state.blobs.length === 0) {
        this.state.mode = "clear";
        this.state.overlayKicker = "Stage Clear";
        this.state.overlayTitle = "Stage 1 clear";
        this.state.overlayCopy = "All blobs popped. Restart to run again.";
        this.state.overlayPrimary = "Next Run";
        this.state.transitionTimer = 0.35;
        this.state.hint = "Stage clear. Press Start to restart.";
        this.state.score += 275;
      }

      if (this.state.lives <= 0) {
        this.state.mode = "lose";
        this.state.overlayKicker = "Run Lost";
        this.state.overlayTitle = "Skyburst failed";
        this.state.overlayCopy = "You took too many hits. Restart fast and try again.";
        this.state.overlayPrimary = "Retry";
        this.state.transitionTimer = 0.2;
        this.state.hint = "Out of lives. Restart now.";
      }
    }

    resolveHarpoonHits() {
      const harpoon = this.state.harpoon;
      if (!harpoon.active) return;
      if (harpoon.y <= WORLD.top) {
        harpoon.active = false;
        return;
      }
      for (let i = 0; i < this.state.blobs.length; i += 1) {
        const blob = this.state.blobs[i];
        const dx = Math.abs(blob.x - harpoon.x);
        const dy = Math.abs(blob.y - harpoon.y);
        if (dx <= blob.radius + harpoon.width && dy <= blob.radius + harpoon.height) {
          this.popBlob(i);
          harpoon.active = false;
          this.state.score += 100 * blob.size;
          return;
        }
      }
    }

    resolvePlayerHits() {
      const player = this.state.player;
      if (player.invuln > 0) return;
      for (const blob of this.state.blobs) {
        const dx = Math.abs(blob.x - player.x);
        const dy = Math.abs(blob.y - player.y);
        const hitRadius = blob.radius + ballDamageRadius(blob.size);
        if (dx <= hitRadius && dy <= hitRadius) {
          this.state.lives -= 1;
          player.invuln = 1.2;
          player.vy = -0.42;
          player.vx = -player.facing * 0.16;
          this.state.score = Math.max(0, this.state.score - 75);
          this.state.hint = "Hit taken. Keep moving and reset spacing.";
          return;
        }
      }
    }

    popBlob(index) {
      const blob = this.state.blobs[index];
      this.state.blobs.splice(index, 1);
      if (blob.size > 1) {
        const nextSize = blob.size - 1;
        const radius = [0.062, 0.042][nextSize - 1];
        const speed = 0.18 + nextSize * 0.05;
        this.state.blobs.push(
          { id: this.nextBlobId++, size: nextSize, x: blob.x - 0.018, y: blob.y, vx: -speed, vy: -0.35, radius, bobSeed: blob.bobSeed },
          { id: this.nextBlobId++, size: nextSize, x: blob.x + 0.018, y: blob.y, vx: speed, vy: -0.35, radius, bobSeed: blob.bobSeed + 0.3 },
        );
      }
      this.state.score += 10;
    }

    getFrameState() {
      return cloneFrame(this.state);
    }
  }

  function drawStars(ctx, width, height) {
    ctx.fillStyle = "rgba(170, 220, 255, 0.18)";
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 97) % width;
      const y = ((i * 149) % height) * 0.46;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawArena(ctx, width, height) {
    const margin = Math.min(width, height) * 0.08;
    ctx.fillStyle = "rgba(7, 13, 22, 0.82)";
    ctx.fillRect(margin, margin, width - margin * 2, height - margin * 1.5);
    ctx.strokeStyle = "rgba(135, 240, 255, 0.35)";
    ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 1.5);
  }

  function renderFrame(ctx, state) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0d2035");
    sky.addColorStop(1, "#050a11");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    drawStars(ctx, width, height);
    drawArena(ctx, width, height);

    ctx.fillStyle = "rgba(125, 171, 209, 0.25)";
    for (const platform of state.platforms) {
      const x = width * platform.x;
      const y = height * platform.y;
      const w = width * platform.w;
      ctx.fillRect(x, y, w, Math.max(10, height * 0.015));
    }

    for (const blob of state.blobs) {
      const x = width * blob.x;
      const y = height * blob.y;
      const radius = Math.max(12, Math.min(width, height) * blob.radius);
      const hue = 192 + blob.size * 12;
      const fill = ctx.createRadialGradient(x - radius * 0.28, y - radius * 0.28, radius * 0.2, x, y, radius);
      fill.addColorStop(0, `hsla(${hue}, 100%, 74%, 0.96)`);
      fill.addColorStop(1, `hsla(${hue + 12}, 80%, 48%, 0.78)`);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.26)";
      ctx.lineWidth = Math.max(2, radius * 0.08);
      ctx.stroke();
    }

    if (state.harpoon.active) {
      const x = width * state.harpoon.x;
      const top = height * state.harpoon.y;
      const bottom = height * (state.player.y - state.player.height * 0.5);
      ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
      ctx.lineWidth = Math.max(3, width * 0.004);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 239, 194, 0.95)";
      ctx.fillRect(x - 2, top - 10, 4, 20);
    }

    const player = state.player;
    const px = width * player.x;
    const py = height * player.y;
    const pw = width * player.width;
    const ph = height * player.height;
    ctx.fillStyle = player.invuln > 0 ? "#ffd166" : "#d7f3ff";
    ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);
    ctx.fillStyle = "rgba(47, 108, 168, 0.95)";
    const handOffset = Math.max(3, pw * 0.26);
    ctx.fillRect(px + handOffset * player.facing, py - ph * 0.35, Math.max(4, pw * 0.12), ph * 0.7);
    ctx.fillStyle = "rgba(255, 209, 102, 0.95)";
    ctx.fillRect(px - pw * 0.08, py - ph * 0.18, pw * 0.16, ph * 0.36);

    const text = state.mode === "play" ? describeBlobPlan(state.blobs) : "Press Start. One tether at a time.";
    ctx.fillStyle = "rgba(6, 12, 20, 0.72)";
    ctx.fillRect(width * 0.5 - 160, height - 46, 320, 26);
    ctx.fillStyle = "#87f0ff";
    ctx.font = "600 14px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width * 0.5, height - 33);
  }

  const canvas = document.getElementById("gameCanvas");
  const hud = document.getElementById("hud");
  const hudScore = document.getElementById("hudScore");
  const hudLives = document.getElementById("hudLives");
  const hudGoal = document.getElementById("hudGoal");
  const hudHint = document.getElementById("hudHint");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlayKicker");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayCopy = document.getElementById("overlayCopy");
  const overlayPrimary = document.getElementById("overlayPrimary");

  if (!canvas || !hud || !hudScore || !hudLives || !hudGoal || !hudHint || !overlay || !overlayKicker || !overlayTitle || !overlayCopy || !overlayPrimary) {
    throw new Error("Pang Skyburst shell missing required DOM nodes");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const game = new Game();
  const input = {
    held: Object.create(null),
    pressed: Object.create(null),
  };

  let started = false;
  let last = performance.now();

  function syncCanvas() {
    const width = Math.max(320, Math.floor(window.innerWidth));
    const height = Math.max(240, Math.floor(window.innerHeight));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearPressed() {
    input.pressed = Object.create(null);
  }

  function handlePrimaryAction() {
    const state = game.getFrameState();
    if (!state || state.mode === "menu") {
      game.start();
      started = true;
      return;
    }
    game.restart();
    started = true;
  }

  function syncUi(state) {
    hudScore.textContent = String(state.score || 0);
    hudLives.textContent = String(state.lives || 0);
    hudGoal.textContent = `${Math.max(0, Math.round(state.stageGoal || 0))}%`;
    hudHint.textContent = state.hint || "Move, burst, restart.";
    overlay.hidden = state.mode === "play";
    if (!overlay.hidden) {
      overlayKicker.textContent = state.overlayKicker || "Arcade Shell";
      overlayTitle.textContent = state.overlayTitle || "Pang Skyburst";
      overlayCopy.textContent = state.overlayCopy || "Press Start to begin.";
      overlayPrimary.textContent = state.overlayPrimary || "Start";
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (started) game.update(dt, input);
    renderFrame(ctx, game.getFrameState());
    syncUi(game.getFrameState());
    clearPressed();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    input.held[event.code] = true;
    if (
      event.code === "Enter" ||
      event.code === "Space" ||
      event.code === "KeyR" ||
      event.code === "KeyJ" ||
      event.code === "KeyX" ||
      event.code === "ControlLeft" ||
      event.code === "ControlRight" ||
      event.code === "ArrowUp" ||
      event.code === "KeyW"
    ) {
      input.pressed[event.code] = true;
    }
    if (
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight" ||
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "Space" ||
      event.code === "KeyX" ||
      event.code === "ControlLeft" ||
      event.code === "ControlRight"
    ) {
      event.preventDefault();
    }
    if ((event.code === "Enter" || event.code === "Space") && game.getFrameState().mode !== "play") {
      handlePrimaryAction();
    }
  });

  window.addEventListener("keyup", (event) => {
    input.held[event.code] = false;
  });

  window.addEventListener("blur", () => {
    input.held = Object.create(null);
    clearPressed();
  });

  window.addEventListener("resize", syncCanvas);
  overlayPrimary.addEventListener("click", handlePrimaryAction);

  syncCanvas();
  syncUi(game.getFrameState());
  requestAnimationFrame(frame);
})();
