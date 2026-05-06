import { Game } from "./Game.js";
import { renderScene } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const hud = document.getElementById("hud");
const hudScore = document.getElementById("hudScore");
const hudLives = document.getElementById("hudLives");
const hudRadar = document.getElementById("hudRadar");
const hudAlert = document.getElementById("hudAlert");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");

if (!canvas) throw new Error("Missing #gameCanvas");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas context unavailable");

const game = new Game();
const input = { held: Object.create(null), pressed: Object.create(null) };

function resize() {
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  canvas.width = Math.max(320, width * scale);
  canvas.height = Math.max(240, height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
}

function press(code) {
  input.pressed[code] = true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) press(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyZ", "KeyX"].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  input.held[event.code] = false;
});

window.addEventListener("blur", () => {
  input.held = Object.create(null);
  input.pressed = Object.create(null);
});

overlayButton.addEventListener("click", () => press("Enter"));

function syncHud(frame) {
  hudScore.textContent = String(frame.score ?? 0);
  hudLives.textContent = String(frame.lives ?? 0);
  hudRadar.textContent = `${Math.round((frame.radar ?? 0) * 100)}%`;
  hudAlert.textContent = frame.alert ?? "";
  hudAlert.hidden = !frame.alert;
  hud.hidden = false;

  const showOverlay = frame.mode !== "play";
  overlay.hidden = !showOverlay;
  if (showOverlay) {
    overlayEyebrow.textContent = frame.overlayEyebrow ?? "Mission";
    overlayTitle.textContent = frame.overlayTitle ?? "Xevious Sky Assault";
    overlayCopy.textContent = frame.overlayCopy ?? "Press Start to launch the run.";
    overlayButton.textContent = frame.overlayButton ?? "Start";
  }
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const frame = game.getFrameState();
  renderScene(ctx, frame);
  syncHud(frame);
  input.pressed = Object.create(null);
  requestAnimationFrame(tick);
}

resize();
syncHud(game.getFrameState());
window.addEventListener("resize", resize);
requestAnimationFrame(tick);
