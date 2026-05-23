import { VIEW_HEIGHT, VIEW_WIDTH } from "./data.js";
import { Game } from "./Game.js";
import { renderScene } from "./render.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayButton = document.getElementById("overlay-button");

const healthValue = document.getElementById("health-value");
const ammoValue = document.getElementById("ammo-value");
const depthValue = document.getElementById("depth-value");
const scoreValue = document.getElementById("score-value");
const zoneValue = document.getElementById("zone-value");
const relayValue = document.getElementById("relay-value");

canvas.width = VIEW_WIDTH;
canvas.height = VIEW_HEIGHT;

const game = new Game();
const held = new Set();

function syncMovement() {
  const left = held.has("ArrowLeft") || held.has("KeyA");
  const right = held.has("ArrowRight") || held.has("KeyD");
  game.setMoveDirection((right ? 1 : 0) - (left ? 1 : 0));
}

function syncUi(state) {
  app.dataset.mode = state.mode;
  healthValue.textContent = `${state.health}`;
  ammoValue.textContent = `${state.ammo}`;
  depthValue.textContent = `${state.depth} m`;
  scoreValue.textContent = `${state.score}`;
  zoneValue.textContent = state.zone;
  relayValue.textContent = `${state.relaysActivated} / ${state.requiredRelays}`;

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

  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    game.queueJump();
  }

  if (event.code === "KeyJ" || event.code === "KeyK") {
    game.setFire(true);
  }

  if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "KeyA" || event.code === "KeyD") {
    held.add(event.code);
    syncMovement();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyJ" || event.code === "KeyK") {
    game.setFire(false);
  }

  if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "KeyA" || event.code === "KeyD") {
    held.delete(event.code);
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
