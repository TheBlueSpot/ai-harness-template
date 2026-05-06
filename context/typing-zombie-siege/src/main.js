import Game from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const game = new Game();

const viewport = { width: canvas.width, height: canvas.height };

function resize() {
  const width = Math.max(960, Math.min(window.innerWidth, 1600));
  const height = Math.max(640, Math.min(window.innerHeight, 900));
  canvas.width = width;
  canvas.height = height;
  viewport.width = width;
  viewport.height = height;
  game.resize(width, height);
}

function restartRun() {
  game.restart();
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  const mode = game.getFrameState().mode;
  if (event.key === "Backspace") {
    event.preventDefault();
    game.handleBackspace();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (mode === "win" || mode === "lose") {
      restartRun();
      return;
    }
    game.submitWord();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    restartRun();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
    event.preventDefault();
    restartRun();
    return;
  }
  if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
    game.handleCharacter(event.key);
  }
});

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt);
  renderGame(ctx, game.getFrameState(), viewport);
  requestAnimationFrame(frame);
}

resize();
renderGame(ctx, game.getFrameState(), viewport);
requestAnimationFrame(frame);
