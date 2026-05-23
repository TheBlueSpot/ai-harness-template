import { CONFIG } from "./data.js";
import { Game } from "./Game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

const distanceEl = document.getElementById("distance");
const goalEl = document.getElementById("goal");
const speedEl = document.getElementById("speed");
const healthEl = document.getElementById("health");

canvas.width = CONFIG.width;
canvas.height = CONFIG.height;

const game = new Game();
const keys = new Set();
const presses = new Set();

function setOverlay(frame) {
  if (frame.mode === "playing") {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  if (frame.mode === "menu") {
    overlayTitle.textContent = "SkiFree Avalanche";
    overlayText.textContent = "Thread clean gates, hit ramps for breathing room, and stay ahead of the wall.";
  } else if (frame.mode === "win") {
    overlayTitle.textContent = "Lodge Reached";
    overlayText.textContent = frame.message;
  } else {
    overlayTitle.textContent = "Buried";
    overlayText.textContent = frame.message;
  }
}

function syncHud(frame) {
  distanceEl.textContent = `Distance ${frame.distance}m`;
  goalEl.textContent = frame.nextGateDistance > 0 ? `Next gate ${frame.nextGateDistance}m` : "Finish stretch";
  speedEl.textContent = `Speed ${frame.speed}`;
  healthEl.textContent = `Wipes ${frame.health}`;
}

function frameInput() {
  return {
    left: keys.has("ArrowLeft"),
    right: keys.has("ArrowRight"),
    up: keys.has("ArrowUp"),
    down: keys.has("ArrowDown"),
    jumpPressed: consume("Space"),
    startPressed: consume("Enter"),
  };
}

function consume(code) {
  if (!presses.has(code)) {
    return false;
  }
  presses.delete(code);
  return true;
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  presses.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt, frameInput());
  const frame = game.getFrameState();
  render(ctx, frame);
  syncHud(frame);
  setOverlay(frame);
  requestAnimationFrame(loop);
}

const initial = game.getFrameState();
render(ctx, initial);
syncHud(initial);
setOverlay(initial);
requestAnimationFrame(loop);
