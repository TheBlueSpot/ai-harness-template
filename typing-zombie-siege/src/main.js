import Game from "./Game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const game = new Game();

let lastTime = performance.now();

function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(window.innerWidth * ratio));
  const height = Math.max(1, Math.floor(window.innerHeight * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    game.resize(width, height);
  }
}

function frame(now) {
  const delta = now - lastTime;
  lastTime = now;

  fitCanvas();
  game.update(delta);
  render(context, game.getFrameState(), { width: canvas.width, height: canvas.height });
  requestAnimationFrame(frame);
}

function isTypingKey(event) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

window.addEventListener("resize", fitCanvas);
window.addEventListener("keydown", (event) => {
  if (isTypingKey(event)) {
    event.preventDefault();
    canvas.focus();
    game.handleCharacter(event.key);
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    canvas.focus();
    game.handleBackspace();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    canvas.focus();
    game.submitWord();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    canvas.focus();
    game.reset();
  }
});

canvas.addEventListener("pointerdown", () => {
  canvas.focus();
});

canvas.focus();
fitCanvas();
requestAnimationFrame(frame);
