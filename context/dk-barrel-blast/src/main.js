import Game from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas?.getContext("2d");
const statusText = document.getElementById("statusText");
const scoreText = document.getElementById("scoreText");
const livesText = document.getElementById("livesText");
const stageText = document.getElementById("stageText");
const bananaText = document.getElementById("bananaText");
const menuOverlay = document.getElementById("menuOverlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");
const resultBanner = document.getElementById("resultBanner");
const resultText = document.getElementById("resultText");

const game = new Game();
const input = { left: false, right: false, up: false, down: false, jump: false, start: false, restart: false };
let lastTime = performance.now();

function updateHud(frameState) {
  if (statusText) statusText.textContent = frameState?.status ?? "";
  if (scoreText) scoreText.textContent = String(frameState?.score ?? 0).padStart(6, "0");
  if (livesText) livesText.textContent = String(frameState?.lives ?? 0);
  if (stageText) stageText.textContent = String(frameState?.stage ?? 1);
  if (bananaText) bananaText.textContent = `${frameState?.bananas ?? 0} / ${frameState?.bananaTarget ?? 0}`;

  const active = frameState?.state === "playing";
  menuOverlay?.toggleAttribute("hidden", active);
  resultBanner?.toggleAttribute("hidden", active);

  if (!active) {
    const won = frameState?.state === "win";
    const lost = frameState?.state === "lose";
    if (overlayEyebrow) overlayEyebrow.textContent = won ? "victory" : lost ? "try again" : "ready";
    if (overlayTitle) overlayTitle.textContent = won ? "Golden banana won." : lost ? "Barrel run lost." : "Barrel-Blast";
    if (overlayCopy) overlayCopy.textContent = frameState?.hint ?? frameState?.status ?? "";
    if (overlayButton) overlayButton.textContent = frameState?.state === "ready" ? "Start Game" : "Restart Run";
    if (resultText) resultText.textContent = frameState?.state === "ready" ? "Ready" : frameState?.status ?? "Restart";
  }
}

function frameInput() {
  return {
    left: input.left,
    right: input.right,
    up: input.up,
    down: input.down,
    jump: input.jump,
    start: input.start,
    restart: input.restart,
  };
}

function clearPulse() {
  input.start = false;
  input.restart = false;
  input.jump = false;
}

function tick(now) {
  const deltaTime = Math.max(0, (now - lastTime) / 1000);
  lastTime = now;
  game.update(frameInput(), deltaTime);
  const frameState = game.getFrameState();
  renderGame(ctx, frameState);
  updateHud(frameState);
  clearPulse();
  window.requestAnimationFrame(tick);
}

function startGame() {
  input.start = true;
}

function restartGame() {
  input.restart = true;
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "ArrowLeft" || event.code === "KeyA") input.left = true;
  if (event.code === "ArrowRight" || event.code === "KeyD") input.right = true;
  if (event.code === "ArrowUp" || event.code === "KeyW") input.up = true;
  if (event.code === "ArrowDown" || event.code === "KeyS") input.down = true;
  if (event.code === "Space") input.jump = true;
  if (event.code === "ArrowUp" && game.getFrameState().state === "playing") input.jump = true;
  if (event.code === "Enter" && game.getFrameState().state !== "playing") startGame();
  if (event.code === "KeyR") restartGame();
});

document.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") input.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") input.right = false;
  if (event.code === "ArrowUp" || event.code === "KeyW") input.up = false;
  if (event.code === "ArrowDown" || event.code === "KeyS") input.down = false;
});

overlayButton?.addEventListener("click", () => {
  if (game.getFrameState().state !== "playing") startGame();
});

menuOverlay?.addEventListener("click", (event) => {
  if (event.target === menuOverlay) startGame();
});

updateHud(game.getFrameState());
window.requestAnimationFrame(tick);
