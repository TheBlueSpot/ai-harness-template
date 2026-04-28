import { createHud, renderHud, bindMenuActions } from "./ui.js";
import { renderScene } from "./render.js";
import Game from "./Game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hudRoot = document.getElementById("hud-root");
const menuRoot = document.getElementById("menu-root");

const hud = createHud(hudRoot);
const game = new Game();

const input = { left: false, right: false, up: false, down: false, start: false, restart: false, pointerStart: false };
let pointerHeld = false;
let lastTime = performance.now();

bindMenuActions({
  startRun: () => game.startRun(),
  restart: () => game.restart(),
  purchaseUpgrade: (id) => game.purchaseUpgrade(id),
  selectUpgrade: (id) => game.selectUpgrade(id),
});

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function applyInputEvents() {
  if (input.pointerStart) input.start = true;
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;
  resizeCanvas();
  applyInputEvents();
  game.update(dt, input);
  input.start = false;
  input.restart = false;
  input.pointerStart = false;
  const frameState = game.getFrameState();
  renderHud(frameState, hud);
  renderScene(ctx, frameState, { width: canvas.width, height: canvas.height, dpr: Math.max(1, window.devicePixelRatio || 1) });
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = true;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = true;
  if (event.code === "KeyW" || event.code === "ArrowUp") input.up = true;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.down = true;
  if (event.code === "Enter" || event.code === "Space") {
    input.start = true;
    event.preventDefault();
  }
  if (event.code === "KeyR") input.restart = true;
  if (event.code.startsWith("Digit")) {
    const upgradeIndex = Number(event.code.slice(5)) - 1;
    const upgradeId = game.getFrameState().shop[upgradeIndex]?.id;
    if (upgradeId) game.selectUpgrade(upgradeId);
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = false;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = false;
  if (event.code === "KeyW" || event.code === "ArrowUp") input.up = false;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.down = false;
});

window.addEventListener("pointerdown", (event) => {
  pointerHeld = true;
  input.pointerStart = true;
  if (event.target instanceof HTMLElement) event.target.setPointerCapture?.(event.pointerId);
});

window.addEventListener("pointerup", () => {
  pointerHeld = false;
  input.pointerStart = false;
  input.left = false;
  input.right = false;
});

window.addEventListener("pointermove", (event) => {
  const steer = Math.sign((event.clientX / Math.max(1, window.innerWidth)) - 0.5);
  input.left = steer < 0 && pointerHeld;
  input.right = steer > 0 && pointerHeld;
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
requestAnimationFrame(frame);
