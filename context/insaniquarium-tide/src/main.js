import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("game-canvas");
const overlayPanel = document.getElementById("overlay-panel");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayButton = document.getElementById("overlay-button");
const hudSun = document.getElementById("hud-sun");
const hudFish = document.getElementById("hud-fish");
const hudThreat = document.getElementById("hud-threat");
const hudGoal = document.getElementById("hud-goal");
const hudTip = document.getElementById("hud-tip");

if (!canvas || !overlayPanel || !overlayButton) throw new Error("Shell missing");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas context unavailable");

const game = new Game();
const pointer = { x: 0, y: 0, down: false, primaryAction: false };
let lastTime = performance.now();

function resizeCanvas() {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (typeof game.resize === "function") {
    game.resize(width, height);
  }
}

function pointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
  const y = (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
  return { x, y };
}

function emitPointer(event, down) {
  const pos = pointerFromEvent(event);
  pointer.x = pos.x;
  pointer.y = pos.y;
  pointer.down = down;
  pointer.primaryAction = true;
  if (typeof game.handlePointer === "function") {
    game.handlePointer({ ...pos, down, type: event.type, button: event.button ?? 0 });
  }
}

canvas.addEventListener("pointermove", (event) => {
  const pos = pointerFromEvent(event);
  pointer.x = pos.x;
  pointer.y = pos.y;
  if (typeof game.handlePointerMove === "function") {
    game.handlePointerMove({ ...pos, type: event.type });
  }
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture?.(event.pointerId);
  emitPointer(event, true);
});
canvas.addEventListener("pointerup", (event) => {
  emitPointer(event, false);
});
canvas.addEventListener("pointerleave", () => {
  pointer.down = false;
  if (typeof game.handlePointerLeave === "function") {
    game.handlePointerLeave();
  }
});

overlayButton.addEventListener("click", () => {
  const state = getState().state ?? "menu";
  if (state === "menu" && typeof game.start === "function") {
    game.start();
    return;
  }
  if (state === "win" || state === "lose") {
    if (typeof game.restart === "function") game.restart();
    if (typeof game.start === "function") game.start();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" || event.code === "Space") {
    event.preventDefault();
    overlayButton.click();
  }
  if (typeof game.handleKeyDown === "function") {
    game.handleKeyDown(event.code);
  }
});
window.addEventListener("keyup", (event) => {
  if (typeof game.handleKeyUp === "function") {
    game.handleKeyUp(event.code);
  }
});
window.addEventListener("blur", () => {
  pointer.down = false;
  if (typeof game.handleBlur === "function") game.handleBlur();
});
window.addEventListener("resize", resizeCanvas);

function getState() {
  return typeof game.getFrameState === "function" ? game.getFrameState() : {};
}

function syncHud(frameState) {
  hudSun.textContent = String(Math.max(0, Math.round(frameState.sun ?? frameState.score ?? 0)));
  hudFish.textContent = String(Math.max(0, Math.round(frameState.fishCount ?? frameState.population ?? 0)));
  hudThreat.textContent = String(frameState.threat ?? frameState.enemyWarning ?? frameState.status ?? "Calm");
  if (hudGoal) {
    hudGoal.textContent = String(frameState.goalText ?? "Egg 0 / 100");
  }
  hudTip.textContent = frameState.hint ?? frameState.message ?? "Keep the next attack in view and react before it reaches the tank.";

  const phase = frameState.state ?? frameState.phase ?? "menu";
  const active = phase === "playing" || phase === "play";
  overlayPanel.hidden = active;

  overlayEyebrow.textContent = frameState.overlayEyebrow ?? (phase === "menu" ? "Tank start" : "Run status");
  overlayTitle.textContent = frameState.overlayTitle ?? "Insaniquarium Tide";
  overlayCopy.textContent = frameState.overlayCopy ?? "Feed the tank, watch the warning line, and restart fast when the aliens win.";
  overlayButton.textContent = frameState.overlayButton ?? (phase === "menu" ? "Start" : "Restart");
}

function step(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (typeof game.update === "function") {
    game.update(dt, {
      pointer,
      time: now / 1000,
      width: canvas.width,
      height: canvas.height,
    });
  }

  const frameState = getState();
  renderGame(ctx, frameState, {
    width: canvas.width,
    height: canvas.height,
    dpr: Math.max(1, window.devicePixelRatio || 1),
    time: now / 1000,
  });
  syncHud(frameState);
  pointer.primaryAction = false;
  requestAnimationFrame(step);
}

resizeCanvas();
syncHud(getState());
if (typeof game.init === "function") game.init();
requestAnimationFrame(step);
