import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const hud = document.getElementById("hud");
const hudScore = document.getElementById("hudScore");
const hudGold = document.getElementById("hudGold");
const hudTime = document.getElementById("hudTime");
const hudState = document.getElementById("hudState");
const hudHint = document.getElementById("hudHint");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");

if (!canvas || !hud || !hudScore || !hudGold || !hudTime || !hudState || !hudHint || !overlay || !overlayButton) {
  throw new Error("Missing shell elements");
}

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas context unavailable");

const game = new Game();
const input = { held: Object.create(null), pressed: Object.create(null) };

function resizeCanvas() {
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(320, Math.floor(window.innerWidth));
  const height = Math.max(240, Math.floor(window.innerHeight));
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (typeof game.resize === "function") game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
}

function tap(code) {
  input.pressed[code] = true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) tap(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code)) event.preventDefault();
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
  hudHint.textContent =
    frameState.objectiveHint ?? "Collect every gold pile to reveal the exit ladder. Z digs left, X digs right, Space digs forward.";

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

let last = performance.now();
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
