import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

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

const game = new Game({ canvas });
const input = {
  held: Object.create(null),
  pressed: Object.create(null),
  pointer: { x: 0.5, y: 0.5, active: false },
};

let started = false;

function syncCanvas() {
  const width = Math.max(320, Math.floor(window.innerWidth));
  const height = Math.max(240, Math.floor(window.innerHeight));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (typeof game.resize === "function") {
    game.resize({ width, height, dpr });
  }
}

function clearPressed() {
  input.pressed = Object.create(null);
}

function startGame() {
  if (!started) {
    game.start();
    started = true;
  }
}

function restartGame() {
  game.restart();
  started = true;
}

function handlePrimaryAction() {
  const state = game.getFrameState?.();
  if (!state || state.mode === "menu") {
    startGame();
    return;
  }
  restartGame();
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
  input.pointer.active = false;
});

window.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  input.pointer.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  input.pointer.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)));
  input.pointer.active = true;
});

overlayPrimary.addEventListener("click", handlePrimaryAction);

function syncUi(state) {
  hudScore.textContent = String(state.score ?? 0);
  hudLives.textContent = String(state.lives ?? 0);
  hudGoal.textContent = `${Math.max(0, Math.round(state.stageGoal ?? 0))}%`;
  hudHint.textContent = state.hint ?? "Move, burst, restart.";

  hud.dataset.mode = state.mode ?? "menu";
  overlay.hidden = state.mode === "play";
  if (!overlay.hidden) {
    overlayKicker.textContent = state.overlayKicker ?? "Arcade Shell";
    overlayTitle.textContent = state.overlayTitle ?? "Pang Skyburst";
    overlayCopy.textContent = state.overlayCopy ?? "Press Start to begin.";
    overlayPrimary.textContent = state.overlayPrimary ?? (state.mode === "lose" ? "Retry" : "Start");
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt, input);
  renderFrame(ctx, game.getFrameState());
  syncUi(game.getFrameState());

  clearPressed();
  requestAnimationFrame(frame);
}

syncCanvas();
syncUi(game.getFrameState());
window.addEventListener("resize", syncCanvas);
requestAnimationFrame(frame);
