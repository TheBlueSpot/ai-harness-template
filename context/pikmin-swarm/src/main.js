import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const canvas = document.getElementById("game");
const stage = document.querySelector(".stage");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");
const hudDay = document.getElementById("hudDay");
const hudTime = document.getElementById("hudTime");
const hudSeeds = document.getElementById("hudSeeds");
const hudCarried = document.getElementById("hudCarried");
const hudRescued = document.getElementById("hudRescued");
const hudPrompt = document.getElementById("hudPrompt");

if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas context unavailable");

const game = new Game();
const input = { held: Object.create(null), pressed: Object.create(null) };

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  game.resize(canvas.width, canvas.height);
}

function press(code) {
  input.pressed[code] = true;
}

function requestLaunch() {
  const state = game.getFrameState();
  if (state.state !== "menu") return false;
  overlay.hidden = true;
  press("Enter");
  return true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) press(event.code);
  if (!event.repeat && ["Enter", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    requestLaunch();
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  input.held[event.code] = false;
});

window.addEventListener("blur", () => {
  input.held = Object.create(null);
  input.pressed = Object.create(null);
});

overlayButton.addEventListener("click", requestLaunch);
canvas.addEventListener("pointerdown", requestLaunch);
stage?.addEventListener("pointerdown", requestLaunch);

function syncUi(state) {
  hudDay.textContent = String(state.day);
  hudTime.textContent = String(Math.ceil(state.timeLeft));
  hudSeeds.textContent = String(state.seeds);
  hudCarried.textContent = String(state.carried);
  hudRescued.textContent = String(state.rescued);
  hudPrompt.textContent = state.message || "";
  overlay.hidden = state.state === "play";
  if (!overlay.hidden) {
    overlayEyebrow.textContent = state.overlayEyebrow || "Launch";
    overlayTitle.textContent = state.overlayTitle || "Pikmin Swarm";
    overlayCopy.textContent = state.overlayCopy || "";
    overlayButton.textContent = state.overlayButton || "Launch";
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const state = game.getFrameState();
  renderFrame(ctx, state, { time: now / 1000 });
  syncUi(state);
  input.pressed = Object.create(null);
  requestAnimationFrame(frame);
}

resize();
syncUi(game.getFrameState());
window.addEventListener("resize", resize);
requestAnimationFrame(frame);
