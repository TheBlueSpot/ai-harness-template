import { Game } from "./Game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayBody = document.getElementById("overlayBody");
const roundLabel = document.getElementById("roundLabel");
const statusLabel = document.getElementById("statusLabel");
const boostLabel = document.getElementById("boostLabel");
const livesLabel = document.getElementById("livesLabel");

const game = new Game();
const pressed = new Set();

function syncSize() {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(bounds.width || window.innerWidth));
  const height = Math.max(240, Math.floor(bounds.height || window.innerHeight * 0.5625));
  canvas.width = width;
  canvas.height = height;
  game.resize(width, height);
}

function updateHud() {
  const state = game.getFrameState();
  roundLabel.textContent = `Round ${Math.min(state.round, 4)}`;
  boostLabel.textContent = `Boost ${state.boost}`;
  livesLabel.textContent = `Lives ${state.lives}`;

  if (state.mode === "menu") {
    overlay.hidden = false;
    overlayTitle.textContent = "Tron Lightcycle Duel";
    overlayBody.textContent = "Arrow keys steer. Hold Space to burn boost. Press Enter to launch.";
    statusLabel.textContent = "Cut off the rivals.";
  } else if (state.mode === "gameOver") {
    overlay.hidden = false;
    overlayTitle.textContent = "System Crash";
    overlayBody.textContent = `Score ${state.score}. Press Enter for a clean rematch.`;
    statusLabel.textContent = "Bike lost.";
  } else if (state.mode === "victory") {
    overlay.hidden = false;
    overlayTitle.textContent = "Grid Secured";
    overlayBody.textContent = `Score ${state.score}. Press Enter to run the bracket again.`;
    statusLabel.textContent = "All rounds clear.";
  } else if (state.mode === "roundClear") {
    overlay.hidden = false;
    overlayTitle.textContent = "Arena Clear";
    overlayBody.textContent = `Score ${state.score}. Press Enter for the next wave.`;
    statusLabel.textContent = "Rivals boxed in.";
  } else {
    overlay.hidden = true;
    statusLabel.textContent = state.banner || "Cut off the rivals.";
  }
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code)) {
    event.preventDefault();
  }
  if (pressed.has(event.code)) {
    return;
  }
  pressed.add(event.code);

  if (event.code === "ArrowUp") {
    game.setTurn("up");
  } else if (event.code === "ArrowDown") {
    game.setTurn("down");
  } else if (event.code === "ArrowLeft") {
    game.setTurn("left");
  } else if (event.code === "ArrowRight") {
    game.setTurn("right");
  } else if (event.code === "Space") {
    game.setBoost(true);
  } else if (event.code === "Enter") {
    game.pressStart();
  }
});

window.addEventListener("keyup", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code)) {
    event.preventDefault();
  }
  pressed.delete(event.code);
  if (event.code === "Space") {
    game.setBoost(false);
  }
});

window.addEventListener("resize", syncSize);
syncSize();

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  game.update(dt);
  game.render(ctx);
  updateHud();
  requestAnimationFrame(frame);
}

updateHud();
requestAnimationFrame(frame);
