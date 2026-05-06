import { Game } from "./Game.js";
import { createRenderer } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const app = document.getElementById("app");
const hudScore = document.getElementById("hudScore");
const hudSpeed = document.getElementById("hudSpeed");
const hudCombo = document.getElementById("hudCombo");
const hudLine = document.getElementById("hudLine");
const hudGoal = document.getElementById("hudGoal");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayStart = document.getElementById("overlayStart");
const overlayRestart = document.getElementById("overlayRestart");

if (!canvas || !app || !hudScore || !hudSpeed || !hudCombo || !hudLine || !hudGoal || !overlay || !overlayEyebrow || !overlayTitle || !overlayCopy || !overlayStart || !overlayRestart) {
  throw new Error("Missing shell nodes");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas context unavailable");
}

const game = new Game();
const renderer = createRenderer(canvas, ctx);
const input = createInputState();
let lastTime = performance.now();

overlayStart.addEventListener("click", () => triggerStart());
overlayRestart.addEventListener("click", () => triggerRestart());
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearInput);
window.addEventListener("resize", resize);

resize();
syncShell(game.getFrameState());
requestAnimationFrame(step);

function createInputState() {
  return {
    start: false,
    restart: false,
    left: false,
    right: false,
    up: false,
    down: false,
    grind: false,
    jump: false,
  };
}

function normalizeKey(event) {
  return event.code || event.key || "";
}

function clearInput() {
  for (const key of Object.keys(input)) {
    input[key] = false;
  }
}

function resize() {
  const width = Math.max(320, Math.floor(window.innerWidth));
  const height = Math.max(240, Math.floor(window.innerHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  renderer.resize({ width, height, dpr });
  game.resize(width, height);
}

function triggerStart() {
  input.start = true;
}

function triggerRestart() {
  input.restart = true;
}

function onKeyDown(event) {
  const key = normalizeKey(event);
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter", "KeyZ", "KeyX", "KeyR"].includes(key)) {
    event.preventDefault();
  }
  if (event.repeat && key !== "KeyR") {
    return;
  }

  switch (key) {
    case "ArrowLeft":
    case "KeyA":
      input.left = true;
      break;
    case "ArrowRight":
    case "KeyD":
      input.right = true;
      break;
    case "ArrowUp":
    case "KeyW":
      input.up = true;
      break;
    case "ArrowDown":
    case "KeyS":
      input.down = true;
      break;
    case "Space":
    case "KeyZ":
      input.jump = true;
      break;
    case "KeyX":
      input.grind = true;
      break;
    case "Enter":
      triggerStart();
      break;
    case "KeyR":
      triggerRestart();
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  switch (normalizeKey(event)) {
    case "ArrowLeft":
    case "KeyA":
      input.left = false;
      break;
    case "ArrowRight":
    case "KeyD":
      input.right = false;
      break;
    case "ArrowUp":
    case "KeyW":
      input.up = false;
      break;
    case "ArrowDown":
    case "KeyS":
      input.down = false;
      break;
    case "Space":
    case "KeyZ":
      input.jump = false;
      break;
    case "KeyX":
      input.grind = false;
      break;
    default:
      break;
  }
}

function step(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
  lastTime = now;

  game.update?.(dt, input);
  const frameState = game.getFrameState();
  renderer.render(frameState);
  syncShell(frameState);

  input.start = false;
  input.restart = false;

  requestAnimationFrame(step);
}

function syncShell(frameState = {}) {
  const state = frameState.state ?? frameState.mode ?? "menu";
  app.dataset.state = state;
  overlay.hidden = state === "playing" || state === "play" || state === "run";

  hudScore.textContent = formatNumber(frameState.score ?? 0);
  hudSpeed.textContent = formatNumber(frameState.speed ?? 0);
  hudCombo.textContent = frameState.combo ? `x${formatNumber(frameState.combo)}` : "x1";
  hudLine.textContent = frameState.lineName ?? frameState.message ?? "Idle";
  hudGoal.textContent = frameState.goalLabel ?? frameState.goalProgress ?? "Build score";

  overlayEyebrow.textContent = frameState.overlayEyebrow ?? (state === "playing" ? "Line live" : "Skate line");
  overlayTitle.textContent = frameState.overlayTitle ?? "Combo Lines";
  overlayCopy.textContent =
    frameState.overlayCopy ??
    (state === "playing"
      ? frameState.goalCopy ?? "Chain manuals, grinds, and gaps before the line drops."
      : "Press Start or Enter to drop in.");
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "0";
}
