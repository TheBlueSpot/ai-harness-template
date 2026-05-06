import { Game, HEIGHT, WIDTH } from "./Game.js";
import { renderScene } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const app = document.getElementById("app");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayButton = document.getElementById("overlay-button");

const shiftValue = document.getElementById("shift-value");
const quotaValue = document.getElementById("quota-value");
const timeValue = document.getElementById("time-value");
const carryValue = document.getElementById("carry-value");
const walkoutValue = document.getElementById("walkout-value");
const nextValue = document.getElementById("next-value");
const scoreValue = document.getElementById("score-value");
const statusText = document.getElementById("status-text");

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();
const heldKeys = new Set();

function syncMove() {
  const left = heldKeys.has("ArrowLeft") || heldKeys.has("KeyA");
  const right = heldKeys.has("ArrowRight") || heldKeys.has("KeyD");
  const up = heldKeys.has("ArrowUp") || heldKeys.has("KeyW");
  const down = heldKeys.has("ArrowDown") || heldKeys.has("KeyS");
  game.setMove((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
}

function syncUi(state) {
  app.dataset.mode = state.mode;
  shiftValue.textContent = `${state.shift} / ${state.shiftCount}`;
  quotaValue.textContent = `${state.served} / ${state.quota}`;
  timeValue.textContent = `${state.timeLeft.toFixed(1)}s`;
  carryValue.textContent = state.carryLabel;
  walkoutValue.textContent = `${state.walkouts} / ${state.maxWalkouts}`;
  nextValue.textContent = state.nextTask?.label ?? "Hold Route";
  scoreValue.textContent = `${state.score}`;
  statusText.textContent = state.status;

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
    game.restart();
    game.start();
  }
  syncUi(game.getFrameState());
}

overlayButton.addEventListener("click", startOrRestart);

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
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

  if ((event.code === "Space" || event.code === "KeyE") && !event.repeat) {
    game.handleInteract();
    syncUi(game.getFrameState());
    return;
  }

  if (
    event.code === "ArrowLeft" ||
    event.code === "ArrowRight" ||
    event.code === "ArrowUp" ||
    event.code === "ArrowDown" ||
    event.code === "KeyA" ||
    event.code === "KeyD" ||
    event.code === "KeyW" ||
    event.code === "KeyS"
  ) {
    heldKeys.add(event.code);
    syncMove();
  }
});

window.addEventListener("keyup", (event) => {
  if (
    event.code === "ArrowLeft" ||
    event.code === "ArrowRight" ||
    event.code === "ArrowUp" ||
    event.code === "ArrowDown" ||
    event.code === "KeyA" ||
    event.code === "KeyD" ||
    event.code === "KeyW" ||
    event.code === "KeyS"
  ) {
    heldKeys.delete(event.code);
    syncMove();
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
