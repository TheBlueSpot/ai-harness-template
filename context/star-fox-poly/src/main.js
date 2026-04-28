import { Game } from "./Game.js";

const canvas = document.getElementById("gameCanvas");
const hud = document.getElementById("hud");
const hudScore = document.getElementById("hudScore");
const hudHealth = document.getElementById("hudHealth");
const hudProgress = document.getElementById("hudProgress");
const hudAlert = document.getElementById("hudAlert");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");

if (!canvas) {
  throw new Error("Missing #gameCanvas");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas context unavailable");
}

const game = new Game();
const input = {
  held: Object.create(null),
  pressed: Object.create(null),
};

function resizeCanvas() {
  const width = Math.max(320, Math.floor(window.innerWidth));
  const height = Math.max(240, Math.floor(window.innerHeight));
  const scale = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (typeof game.resize === "function") {
    game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
  }
}

function queuePressed(code) {
  input.pressed[code] = true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) {
    queuePressed(event.code);
  }
  if (event.code === "Space" || event.code === "ArrowUp") {
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

overlayButton.addEventListener("click", () => {
  queuePressed("Enter");
});

function syncUi(frameState) {
  hudScore.textContent = String(frameState.score ?? 0);
  hudHealth.textContent = `${Math.max(0, Math.round(frameState.health ?? 0))}%`;
  hudProgress.textContent = `${Math.max(0, Math.round(frameState.progress ?? 0))}%`;

  const alertText = frameState.bossAlert || frameState.alert || "";
  hudAlert.textContent = alertText;
  hudAlert.hidden = !alertText;

  const shellMode = frameState.mode ?? "menu";
  hud.dataset.mode = shellMode;
  overlay.hidden = shellMode === "play";
  hud.hidden = false;

  if (!overlay.hidden) {
    overlayEyebrow.textContent = frameState.overlayEyebrow ?? "Mission";
    overlayTitle.textContent = frameState.overlayTitle ?? "Star Fox Polygon Strike";
    overlayCopy.textContent =
      frameState.overlayCopy ??
      (shellMode === "win"
        ? "Mission complete. Press Start to run it again."
        : shellMode === "lose"
          ? "Team down. Press Start to retry."
          : "Press Start to launch the run.");
    overlayButton.textContent = frameState.overlayButton ?? "Start";
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt, input);
  const state = game.getFrameState();
  game.render(ctx);
  syncUi(state);

  input.pressed = Object.create(null);
  requestAnimationFrame(frame);
}

resizeCanvas();
syncUi(game.getFrameState());
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(frame);
