import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const helpToggle = document.getElementById("help-toggle");
const helpPanel = document.getElementById("help-panel");
const hudBody = document.getElementById("hud-body");
const goalBody = document.getElementById("goal-body");
const dispatchBody = document.getElementById("dispatch-body");
const statusPill = document.getElementById("status-pill");
const hintPill = document.getElementById("hint-pill");

const game = new Game();
const input = { up: false, down: false, left: false, right: false, confirm: false, restart: false, toggleHelp: false };

let last = performance.now();
let heldToggle = false;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function layout() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    pad: 24,
    topMargin: 24,
    towerBox: {
      x: 24,
      y: 44,
      w: Math.min(520, window.innerWidth * 0.56),
      h: Math.max(420, window.innerHeight - 140),
    },
  };
}

function syncHud(frame) {
  statusPill.textContent = frame.phase === "menu" ? "Menu" : frame.phase === "fail" ? "Fail" : frame.phase === "win" ? "Clear" : "Live";
  hintPill.textContent = frame.headline;
  hudBody.textContent =
    `${frame.hud.phaseLabel} | Floor ${frame.selectedFloor} | Elevator ${frame.selectedElevator + 1} | Riders ${frame.hud.ridersServed}/${frame.hud.clearTargetServed} | Shift ${frame.hud.surgesCleared}/${frame.hud.clearTargetSurges} | Next rotate ${frame.hud.surgeCountdown}s`;
  goalBody.textContent = frame.coach.objective;
  dispatchBody.textContent =
    `${frame.coach.hotspot} ${frame.coach.dispatch} ${frame.coach.phaseCoach} Selected floor queue ${frame.coach.selectedFloorQueue}. Elevator load ${frame.coach.selectedElevatorLoad}.`;
  helpPanel.hidden = !frame.helpOpen;
  helpToggle.setAttribute("aria-expanded", String(frame.helpOpen));
}

function step(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(input, dt);
  const frame = game.getFrameState();
  const view = layout();
  renderFrame(ctx, frame, view);
  syncHud(frame);
  input.confirm = false;
  input.restart = false;
  input.toggleHelp = false;
  requestAnimationFrame(step);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "h", "H", "?", "r", "R", "a", "A", "s", "S", "d", "D", "w", "W"].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") input.up = true;
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") input.down = true;
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") input.left = true;
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") input.right = true;
  if (event.key === "Enter" || event.key === " ") input.confirm = true;
  if (event.key === "r" || event.key === "R") input.restart = true;
  if (event.key === "h" || event.key === "H" || event.key === "?") {
    if (!heldToggle) input.toggleHelp = true;
    heldToggle = true;
  }
});
window.addEventListener("keyup", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "h", "H", "?", "r", "R", "a", "A", "s", "S", "d", "D", "w", "W"].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") input.up = false;
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") input.down = false;
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") input.left = false;
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") input.right = false;
  if (event.key === "h" || event.key === "H" || event.key === "?") heldToggle = false;
});
helpToggle.addEventListener("click", () => {
  input.toggleHelp = true;
});

resize();
syncHud(game.getFrameState());
requestAnimationFrame(step);
