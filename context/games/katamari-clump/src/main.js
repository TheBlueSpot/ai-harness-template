import { Game } from "./Game.js";
import { drawFrame } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const hudMass = document.getElementById("hudMass");
const hudDistrict = document.getElementById("hudDistrict");
const hudTarget = document.getElementById("hudTarget");
const hudThreat = document.getElementById("hudThreat");
const hudHint = document.getElementById("hudHint");
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

function queuePressed(code) {
  input.pressed[code] = true;
}

function resizeCanvas() {
  const width = Math.max(320, Math.floor(window.innerWidth));
  const height = Math.max(240, Math.floor(window.innerHeight));
  const scale = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) queuePressed(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  input.held[event.code] = false;
});

window.addEventListener("blur", () => {
  input.held = Object.create(null);
  input.pressed = Object.create(null);
});

overlayButton.addEventListener("click", () => queuePressed("Enter"));
window.addEventListener("resize", resizeCanvas);

function syncUi(frame) {
  const hud = frame.hud ?? {};
  hudMass.textContent = (hud.mass ?? 0).toFixed(1);
  hudDistrict.textContent = `${(hud.districtIndex ?? 0) + 1} / ${hud.districtTotal ?? 1}`;
  hudTarget.textContent = (hud.nextTarget ?? 0).toFixed(1);
  hudThreat.textContent = hud.message ?? "Clear";
  hudHint.textContent = hud.message ?? "Reach the next district gate.";

  overlay.hidden = !(frame.overlay?.visible ?? frame.mode === "playing");
  if (!overlay.hidden) {
    overlayEyebrow.textContent = frame.overlay?.eyebrow ?? "Mission";
    overlayTitle.textContent = frame.overlay?.title ?? "Katamari Clump Rollup";
    overlayCopy.textContent = frame.overlay?.copy ?? "Press Start to begin the roll.";
    overlayButton.textContent = frame.overlay?.button ?? "Start";
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const frameState = game.getFrameState();
  drawFrame(ctx, frameState);
  syncUi(frameState);
  input.pressed = Object.create(null);
  requestAnimationFrame(frame);
}

resizeCanvas();
syncUi(game.getFrameState());
requestAnimationFrame(frame);
