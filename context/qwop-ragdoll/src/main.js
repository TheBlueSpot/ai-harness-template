import { Game } from "./Game.js";
import { renderRunner } from "./render/runnerRenderer.js";
import { renderHud } from "./render/hudRenderer.js";

const canvas = document.getElementById("game-canvas");
const menuRoot = document.getElementById("menu-root");
const hudRoot = document.getElementById("hud-root");
const statusRoot = document.getElementById("status-root");

if (!(canvas instanceof HTMLCanvasElement) || !menuRoot || !hudRoot || !statusRoot) {
  throw new Error("qwop-ragdoll shell missing");
}

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("qwop-ragdoll canvas context missing");

const game = new Game();
const controls = bindInput(window);
let last = performance.now();
let resizeQueued = true;

function bindInput(target) {
  const state = {
    q: false,
    w: false,
    o: false,
    p: false,
    start: false,
    restart: false,
  };

  const keyDown = (event) => {
    const code = event.code;
    if (code === "KeyQ") state.q = true;
    if (code === "KeyW") state.w = true;
    if (code === "KeyO") state.o = true;
    if (code === "KeyP") state.p = true;
    if (code === "Enter" || code === "Space") state.start = true;
    if (code === "KeyR" || code === "Escape") state.restart = true;
    if (code === "Space" || code === "Enter" || code === "KeyR" || code === "Escape") event.preventDefault();
  };

  const keyUp = (event) => {
    const code = event.code;
    if (code === "KeyQ") state.q = false;
    if (code === "KeyW") state.w = false;
    if (code === "KeyO") state.o = false;
    if (code === "KeyP") state.p = false;
  };

  target.addEventListener("keydown", keyDown);
  target.addEventListener("keyup", keyUp);

  return {
    read() {
      return { ...state };
    },
    consumePulse() {
      const pulse = { start: state.start, restart: state.restart };
      state.start = false;
      state.restart = false;
      return pulse;
    },
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  resizeQueued = false;
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 1 / 60);
  last = now;
  if (resizeQueued) resizeCanvas();

  const input = controls.read();
  const pulse = controls.consumePulse();
  const controlState = {
    q: input.q,
    w: input.w,
    o: input.o,
    p: input.p,
    start: pulse.start,
    restart: pulse.restart,
  };

  game.update?.(dt, controlState);
  const frameState = game.getFrameState?.() ?? {};
  renderRunner(ctx, frameState, { width: canvas.width, height: canvas.height });
  renderHud({ menuRoot, hudRoot, statusRoot }, frameState);

  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
  resizeQueued = true;
});
resizeCanvas();
requestAnimationFrame(frame);

export { bindInput };
