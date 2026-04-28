import { Game } from "./Game.js";
import { HEIGHT, WIDTH } from "./data.js";
import { renderScene } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayButton = document.getElementById("overlay-button");
const app = document.getElementById("app");

const scoreValue = document.getElementById("score-value");
const livesValue = document.getElementById("lives-value");
const levelValue = document.getElementById("level-value");
const ballsValue = document.getElementById("balls-value");
const laserValue = document.getElementById("laser-value");

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();
const heldKeys = new Set();

function syncMovement() {
  const left = heldKeys.has("ArrowLeft") || heldKeys.has("KeyA");
  const right = heldKeys.has("ArrowRight") || heldKeys.has("KeyD");
  game.setMoveDirection((right ? 1 : 0) - (left ? 1 : 0));
}

function syncUi(state) {
  app.dataset.mode = state.mode;
  scoreValue.textContent = `${state.score}`;
  livesValue.textContent = `${state.lives}`;
  levelValue.textContent = `${Math.min(state.level, state.levelCount)} / ${state.levelCount}`;
  ballsValue.textContent = `${state.ballCount}`;
  laserValue.textContent = state.laserActive ? `${state.laserTime.toFixed(1)}s` : "Offline";

  if (state.overlay) {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    overlayEyebrow.textContent = state.overlay.eyebrow;
    overlayTitle.textContent = state.overlay.title;
    overlayCopy.textContent = state.overlay.copy;
    overlayButton.textContent = state.overlay.button;
  } else {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }
}

function startOrRestart() {
  if (game.mode === "menu") {
    game.start();
  } else if (game.mode === "win" || game.mode === "lose") {
    game.restartRound();
  }
  syncUi(game.getFrameState());
}

overlayButton.addEventListener("click", startOrRestart);

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  game.setPointer((event.clientX - rect.left) * scaleX);
});

canvas.addEventListener("mouseleave", () => {
  game.clearPointer();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
  }

  if (event.code === "Enter" && !event.repeat) {
    startOrRestart();
    return;
  }

  if (event.code === "KeyR" && !event.repeat) {
    game.restart();
    game.start();
    syncUi(game.getFrameState());
    return;
  }

  if (event.code === "Space") {
    game.setFire(true);
  }

  if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "KeyA" || event.code === "KeyD") {
    heldKeys.add(event.code);
    syncMovement();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    game.setFire(false);
  }

  if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "KeyA" || event.code === "KeyD") {
    heldKeys.delete(event.code);
    syncMovement();
  }
});

syncUi(game.getFrameState());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  const state = game.getFrameState();
  renderScene(ctx, state);
  syncUi(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
