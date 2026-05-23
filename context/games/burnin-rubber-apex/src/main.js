import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");

const hud = {
  speed: document.getElementById("speed"),
  timer: document.getElementById("timer"),
  checkpoint: document.getElementById("checkpoint"),
  boost: document.getElementById("boost"),
  takedowns: document.getElementById("takedowns"),
  traffic: document.getElementById("traffic"),
  message: document.getElementById("message"),
};

const input = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  start: false,
  restart: false,
  pointer: { x: 0, y: 0, active: false },
};

const game = new Game();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.round(bounds.width * dpr);
  canvas.height = Math.round(bounds.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize({ width: bounds.width, height: bounds.height, dpr });
}

window.addEventListener("resize", resize);

window.addEventListener("keydown", (event) => {
  const active = true;
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      input.accelerate = active;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.brake = active;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      input.left = active;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      input.right = active;
      break;
    case " ":
      input.boost = active;
      break;
    case "Enter":
      input.start = true;
      break;
    case "r":
    case "R":
      input.restart = true;
      break;
    default:
      break;
  }
});

window.addEventListener("keyup", (event) => {
  const active = false;
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      input.accelerate = active;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.brake = active;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      input.left = active;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      input.right = active;
      break;
    case " ":
      input.boost = active;
      break;
    default:
      break;
  }
});

overlay.addEventListener("click", () => {
  input.start = true;
});

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const state = game.getFrameState();
  renderGame(ctx, state, { width: canvas.clientWidth, height: canvas.clientHeight });
  syncHud(state);
  syncOverlay(state);
  input.start = false;
  input.restart = false;
  requestAnimationFrame(frame);
}

function syncHud(state) {
  const gate = state.nextCheckpoint;
  hud.speed.textContent = `${Math.round(state.speed)} mph`;
  hud.timer.textContent = `${state.timer.toFixed(1)}s`;
  hud.checkpoint.textContent = gate
    ? `CP ${Math.min(state.checkpointIndex, state.checkpointTotal)}/${state.checkpointTotal} | ${Math.ceil(gate.remaining)}m`
    : `CP ${Math.min(state.checkpointIndex, state.checkpointTotal)}/${state.checkpointTotal}`;
  hud.boost.textContent = `Boost ${Math.round(state.boost * 100)}%`;
  hud.takedowns.textContent = `Takedowns ${state.takedowns}`;
  hud.traffic.textContent = state.trafficPhase;
  hud.message.textContent = state.message;
}

function syncOverlay(state) {
  overlay.hidden = state.mode === "running";
  if (state.mode === "menu") {
    overlayText.textContent =
      "Drift into the checkpoint rhythm. Slalom through traffic, knock rivals out when the lane opens, and keep the timer alive.";
  } else if (state.mode === "countdown") {
    overlayText.textContent = `Launch in ${state.countdown || 1}.`;
  } else if (state.mode === "win") {
    overlayText.textContent = `Course clear in ${state.finishTime.toFixed(1)}s with ${state.takedowns} takedowns. Press R to run it back.`;
  } else if (state.mode === "gameover") {
    overlayText.textContent = `${state.message} Press R to retry the route.`;
  }
}

resize();
syncHud(game.getFrameState());
syncOverlay(game.getFrameState());
requestAnimationFrame(frame);
