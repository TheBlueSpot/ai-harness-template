import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayBody = document.getElementById("overlayBody");
const overlayButton = document.getElementById("overlayButton");

const speedValue = document.getElementById("speedValue");
const boostValue = document.getElementById("boostValue");
const scoreValue = document.getElementById("scoreValue");
const distanceValue = document.getElementById("distanceValue");
const comboValue = document.getElementById("comboValue");
const gateValue = document.getElementById("gateValue");

const pressed = new Set();
const justPressed = new Set();

const game = new Game({ width: canvas.width, height: canvas.height });

function resize() {
  const width = Math.min(window.innerWidth - 24, 1280);
  const height = Math.min(window.innerHeight - 24, 720);
  canvas.width = Math.max(960, width);
  canvas.height = Math.max(540, height);
  game.resize(canvas.width, canvas.height);
}

function mapInput() {
  return {
    left: pressed.has("KeyA") || pressed.has("ArrowLeft"),
    right: pressed.has("KeyD") || pressed.has("ArrowRight"),
    leftPressed: justPressed.has("KeyA") || justPressed.has("ArrowLeft"),
    rightPressed: justPressed.has("KeyD") || justPressed.has("ArrowRight"),
    tuck: pressed.has("KeyW") || pressed.has("ArrowUp"),
    brake: pressed.has("KeyS") || pressed.has("ArrowDown"),
    jumpHeld: pressed.has("Space"),
    jumpPressed: justPressed.has("Space"),
    spinLeft: pressed.has("KeyJ"),
    spinRight: pressed.has("KeyL"),
    grab: pressed.has("KeyK"),
    boost: pressed.has("ShiftLeft") || pressed.has("ShiftRight"),
    startPressed: justPressed.has("Enter"),
    restartPressed: justPressed.has("KeyR"),
  };
}

function syncHud(frame) {
  speedValue.textContent = `${frame.hud.speed}`;
  boostValue.textContent = `${frame.hud.boost}%`;
  scoreValue.textContent = `${frame.hud.score}`;
  distanceValue.textContent = frame.hud.distance;
  comboValue.textContent = frame.hud.combo;
  gateValue.textContent = frame.hud.gate;

  if (frame.overlay) {
    overlay.hidden = false;
    overlayEyebrow.textContent = frame.overlay.eyebrow;
    overlayTitle.textContent = frame.overlay.title;
    overlayBody.textContent = frame.overlay.body;
    overlayButton.textContent = frame.overlay.button;
    overlayButton.disabled = Boolean(frame.overlay.disabled);
  } else {
    overlay.hidden = true;
  }
}

window.addEventListener("keydown", (event) => {
  if (!pressed.has(event.code)) {
    justPressed.add(event.code);
  }
  pressed.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  pressed.delete(event.code);
});

window.addEventListener("resize", resize);
overlayButton.addEventListener("click", () => {
  const frame = game.getFrameState();
  if (frame.mode === "menu") {
    game.start();
  } else if (frame.mode === "clear" || frame.mode === "failed") {
    game.restart();
  }
});

resize();

let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  game.update(dt, mapInput());
  const state = game.getFrameState();
  renderFrame(ctx, state);
  syncHud(state);
  justPressed.clear();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
