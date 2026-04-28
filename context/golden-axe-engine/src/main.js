import { Game } from "./Game.js";
import { HEIGHT, MAGIC_MAX, MAX_HEALTH, WIDTH } from "./data.js";
import { renderScene } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");
const healthText = document.getElementById("healthText");
const magicText = document.getElementById("magicText");
const stageText = document.getElementById("stageText");
const mountText = document.getElementById("mountText");

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();
const input = { held: {}, pressed: {} };

function setPressed(code) {
  input.pressed[code] = true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) {
    setPressed(event.code);
  }
});

window.addEventListener("keyup", (event) => {
  input.held[event.code] = false;
});

overlayButton.addEventListener("click", () => {
  if (game.state === "menu") {
    game.start();
  } else {
    game.restart();
    game.start();
  }
  syncUi(game.getFrameState());
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const state = game.getFrameState();
  renderScene(ctx, state);
  syncUi(state);
  input.pressed = {};
  requestAnimationFrame(frame);
}

function syncUi(state) {
  healthText.textContent = `${Math.max(0, Math.ceil(state.player.health))} / ${MAX_HEALTH}`;
  magicText.textContent = `${Math.min(MAGIC_MAX, Math.ceil(state.player.magic))} / ${MAGIC_MAX}`;
  stageText.textContent = `${state.stageNumber} / ${state.stageTotal}`;
  mountText.textContent = state.player.mounted ? "Riding" : "On Foot";

  if (state.overlay) {
    overlay.hidden = false;
    overlayEyebrow.textContent = state.overlay.eyebrow;
    overlayTitle.textContent = state.overlay.title;
    overlayCopy.textContent = state.overlay.copy;
    overlayButton.textContent = state.overlay.button;
  } else {
    overlay.hidden = true;
  }
}

syncUi(game.getFrameState());
requestAnimationFrame(frame);
