import { Game } from "./Game.js";
import { render } from "./render.js";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const orangeEl = document.querySelector("#orange-count");
const shotsEl = document.querySelector("#shots-count");
const scoreEl = document.querySelector("#score-count");
const bucketEl = document.querySelector("#bucket-state");
const overlay = document.querySelector("#overlay");
const overlayKicker = document.querySelector("#overlay-kicker");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const startButton = document.querySelector("#start-button");

const game = new Game();
const pointer = { x: canvas.width / 2, y: 220 };

function syncHud(frame) {
  orangeEl.textContent = `${frame.orangeRemaining}`;
  shotsEl.textContent = `${frame.shots}`;
  scoreEl.textContent = `${frame.score}`;
  bucketEl.textContent = frame.ball ? "Tracking" : "Ready";

  if (frame.overlay.visible) {
    overlay.classList.add("overlay--visible");
    overlayKicker.textContent = frame.overlay.kicker;
    overlayTitle.textContent = frame.overlay.title;
    overlayCopy.textContent = frame.overlay.copy;
    startButton.textContent = frame.overlay.action;
  } else {
    overlay.classList.remove("overlay--visible");
  }
}

function mapPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  pointer.x = (event.clientX - bounds.left) * scaleX;
  pointer.y = (event.clientY - bounds.top) * scaleY;
  game.setPointer(pointer.x, pointer.y);
}

canvas.addEventListener("mousemove", mapPointer);
canvas.addEventListener("pointerdown", (event) => {
  mapPointer(event);
  game.fire();
});

startButton.addEventListener("click", () => {
  game.start();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    game.start();
  } else if (event.code === "KeyR") {
    game.reset();
  } else if (event.code === "Space") {
    event.preventDefault();
    game.fire();
  }
});

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 20);
  lastTime = now;
  game.update(dt);
  const state = game.getFrameState();
  render(context, state);
  syncHud(state);
  requestAnimationFrame(frame);
}

game.setPointer(pointer.x, pointer.y);
requestAnimationFrame(frame);
