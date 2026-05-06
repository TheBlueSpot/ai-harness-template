import { Game } from "./Game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const chainEl = document.getElementById("chain");
const shotsEl = document.getElementById("shots");
const dangerEl = document.getElementById("danger");
const overlayEl = document.getElementById("overlay");
const eyebrowEl = document.getElementById("eyebrow");
const titleEl = document.getElementById("title");
const messageEl = document.getElementById("message");
const actionEl = document.getElementById("action");

const game = new Game();
const input = {
  pointerX: canvas.width * 0.5,
  pointerY: canvas.height * 0.2,
};

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * window.devicePixelRatio);
  canvas.height = Math.round(rect.height * window.devicePixelRatio);
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  game.resize(rect.width, rect.height);
  game.onPointerMove(input.pointerX, input.pointerY);
}

function updateOverlay(mode, message) {
  if (mode === "playing") {
    overlayEl.classList.add("is-hidden");
    return;
  }

  overlayEl.classList.remove("is-hidden");
  if (mode === "menu") {
    eyebrowEl.textContent = "Marble-chain pressure";
    titleEl.textContent = "Zuma Sunburst";
    messageEl.textContent =
      "Aim with the mouse. Click or press Space to fire. Press Shift or right click to swap colors.";
    actionEl.textContent = "Start Run";
  } else if (mode === "win") {
    eyebrowEl.textContent = "Sun gate secured";
    titleEl.textContent = "Clear";
    messageEl.textContent = `${message} Press R or use the button for an instant rematch.`;
    actionEl.textContent = "Play Again";
  } else if (mode === "lose") {
    eyebrowEl.textContent = "Chain breach";
    titleEl.textContent = "Defeat";
    messageEl.textContent = `${message} Press R or use the button to retry immediately.`;
    actionEl.textContent = "Retry";
  }
}

function draw(state) {
  const width = state.width;
  const height = state.height;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(
    width * 0.55,
    height * 0.48,
    40,
    width * 0.5,
    height * 0.5,
    width * 0.65
  );
  gradient.addColorStop(0, "#3d214d");
  gradient.addColorStop(0.55, "#140d1d");
  gradient.addColorStop(1, "#07050a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawArena(state);
  drawPath(state);
  drawGate(state);
  drawMarbles(state);
  drawShots(state);
  drawBursts(state);
  drawShooter(state);
}

function drawArena(state) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let ring = 0; ring < 6; ring += 1) {
    ctx.strokeStyle = ring % 2 === 0 ? "rgba(255, 214, 162, 0.07)" : "rgba(255, 191, 71, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(state.center.x, state.center.y, 90 + ring * 48, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath(state) {
  const { totalLength, sample } = state.path;
  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(242, 214, 162, 0.14)";
  ctx.lineWidth = 36;
  ctx.beginPath();
  for (let progress = 0; progress <= totalLength; progress += 18) {
    const point = sample(progress);
    if (progress === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 191, 71, 0.22)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let progress = 0; progress <= totalLength; progress += 18) {
    const point = sample(progress);
    if (progress === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawGate(state) {
  const gate = state.path.endPoint;
  ctx.save();
  const gateGlow = 24 + state.dangerRatio * 22;
  const radial = ctx.createRadialGradient(gate.x, gate.y, 4, gate.x, gate.y, gateGlow * 2.8);
  radial.addColorStop(0, "rgba(255, 226, 139, 1)");
  radial.addColorStop(0.38, "rgba(255, 168, 52, 0.66)");
  radial.addColorStop(1, "rgba(255, 120, 40, 0)");
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(gate.x, gate.y, gateGlow * 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMarbles(state) {
  for (const marble of state.marbles) {
    ctx.save();
    ctx.shadowBlur = marble.isHead ? 28 : 16;
    ctx.shadowColor = marble.color.glow;
    ctx.fillStyle = marble.color.fill;
    ctx.beginPath();
    ctx.arc(marble.x, marble.y, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(marble.x - 5, marble.y - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    if (marble.isHead) {
      ctx.strokeStyle = `rgba(255, 239, 209, ${0.4 + state.dangerRatio * 0.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(marble.x, marble.y, 20 + state.dangerRatio * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawShots(state) {
  for (const shot of state.shots) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = shot.color.glow;
    ctx.fillStyle = shot.color.fill;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBursts(state) {
  for (const burst of state.popBursts) {
    const lifeRatio = burst.life / 0.6;
    ctx.save();
    ctx.globalAlpha = lifeRatio;
    ctx.strokeStyle = burst.color.fill;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, 20 + (1 - lifeRatio) * 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawShooter(state) {
  ctx.save();
  ctx.translate(state.center.x, state.center.y);
  ctx.rotate(state.aimAngle);

  ctx.fillStyle = "#2e1637";
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffbf47";
  ctx.beginPath();
  ctx.moveTo(-8, -12);
  ctx.lineTo(56, 0);
  ctx.lineTo(-8, 12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.shadowBlur = 22;
  ctx.shadowColor = state.currentColor.glow;
  ctx.fillStyle = state.currentColor.fill;
  ctx.beginPath();
  ctx.arc(state.center.x, state.center.y, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = state.nextColor.fill;
  ctx.beginPath();
  ctx.arc(state.center.x - 46, state.center.y + 46, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderUi(state) {
  scoreEl.textContent = `Score ${state.score}`;
  chainEl.textContent = `Chain ${state.chainCount}`;
  shotsEl.textContent = `Shots ${state.shotsCount}/3`;
  dangerEl.textContent = `Danger ${Math.round(state.dangerRatio * 100)}%`;
  dangerEl.style.boxShadow = state.hudPulse > 0 ? "0 0 24px rgba(255, 107, 107, 0.4)" : "none";
  updateOverlay(state.mode, state.message);
}

let lastTime = performance.now();
function frame(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  game.update(dt);
  const state = game.getFrameState();
  draw(state);
  renderUi(state);
  requestAnimationFrame(frame);
}

function pointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  input.pointerX = event.clientX - rect.left;
  input.pointerY = event.clientY - rect.top;
  game.onPointerMove(input.pointerX, input.pointerY);
}

canvas.addEventListener("mousemove", pointerFromEvent);
canvas.addEventListener("pointerdown", (event) => {
  pointerFromEvent(event);
  if (game.mode === "menu") {
    game.start();
    return;
  }
  if (game.mode === "playing") {
    game.shoot();
    return;
  }
  game.restart();
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  pointerFromEvent(event);
  game.swapColors();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (game.mode === "menu") {
      game.start();
    } else if (game.mode === "playing") {
      game.shoot();
    } else {
      game.restart();
    }
  } else if (event.code === "Enter") {
    if (game.mode === "menu") {
      game.start();
    } else if (game.mode !== "playing") {
      game.restart();
    }
  } else if (event.code === "KeyR" && game.mode !== "playing") {
    game.restart();
  } else if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "KeyX") {
    game.swapColors();
  }
});

actionEl.addEventListener("click", () => {
  if (game.mode === "menu") {
    game.start();
  } else {
    game.restart();
  }
});

window.addEventListener("resize", resize);

resize();
renderUi(game.getFrameState());
requestAnimationFrame(frame);
