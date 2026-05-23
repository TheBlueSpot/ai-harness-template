import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const canvas = document.getElementById("game-canvas");
const hud = document.getElementById("hud");
const hudTarget = document.getElementById("hudTarget");
const hudObjective = document.getElementById("hudObjective");
const hudDamage = document.getElementById("hudDamage");
const hudWave = document.getElementById("hudWave");
const hudHealth = document.getElementById("hudHealth");
const hudPrompt = document.getElementById("hudPrompt");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");

if (!canvas || !hud || !overlay || !overlayButton) throw new Error("Shell missing");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas context unavailable");

const game = new Game();
const input = { held: Object.create(null), pressed: Object.create(null) };

function resizeCanvas() {
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  game.resize(width, height);
}

function press(code) {
  input.pressed[code] = true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) press(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyR"].includes(event.code)) event.preventDefault();
});
window.addEventListener("keyup", (event) => {
  input.held[event.code] = false;
});
window.addEventListener("blur", () => {
  input.held = Object.create(null);
  input.pressed = Object.create(null);
});
overlayButton.addEventListener("click", () => {
  const phase = game.getFrameState().phase;
  if (phase === "menu") {
    startGame();
    return;
  }
  if (phase === "win" || phase === "lose") {
    restartGame();
    startGame();
  }
});

function syncHud(state) {
  hud.dataset.phase = state.phase ?? "menu";
  hudTarget.textContent = String(state.targetScore ?? 0);
  if (hudObjective) hudObjective.textContent = state.hud?.objective ?? "First tower";
  hudDamage.textContent = String(state.score ?? 0);
  hudWave.textContent = String(state.hud?.wavesCleared ?? 0);
  if (hudHealth) hudHealth.textContent = String(state.health ?? 0);
  hudPrompt.textContent = state.prompt ?? state.overlays?.prompt ?? "";
  overlay.hidden = state.phase === "play";
  overlayEyebrow.textContent = state.overlayEyebrow ?? "Arcade run";
  overlayTitle.textContent = state.overlayTitle ?? "Rampage City Smash";
  overlayCopy.textContent = state.overlayCopy ?? "Press Enter to start.";
  overlayButton.textContent = state.overlayButton ?? "Start";
}

function startGame() {
  game.start();
  syncHud(game.getFrameState());
}

function restartGame() {
  game.restart();
  syncHud(game.getFrameState());
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (input.pressed.Enter) {
    if (game.getFrameState().phase === "menu") {
      startGame();
    } else if (game.getFrameState().phase === "win" || game.getFrameState().phase === "lose") {
      restartGame();
      startGame();
    }
  }
  if (input.pressed.KeyR && game.getFrameState().phase !== "menu") {
    restartGame();
  }

  game.update(dt, input);
  const state = game.getFrameState();
  renderFrame(ctx, state);
  syncHud(state);
  input.pressed = Object.create(null);
  requestAnimationFrame(frame);
}

resizeCanvas();
syncHud(game.getFrameState());
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(frame);
