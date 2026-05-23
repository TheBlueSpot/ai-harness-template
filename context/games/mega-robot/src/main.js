import { Game } from "./Game.js";
import { createInput } from "./core/input.js";

const canvas = document.getElementById("game");
const hudRoot = document.getElementById("hud-root");
const menuRoot = document.getElementById("menu-root");
const game = new Game(canvas, { hudRoot, menuRoot });
const input = createInput(window);

let lastTime = performance.now();

function resize() {
  const shell = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(shell.width * window.devicePixelRatio));
  const height = Math.max(240, Math.floor(shell.height * window.devicePixelRatio));
  canvas.width = width;
  canvas.height = height;
  game.resize(width, height);
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt, input.sample());
  game.render();
  game.syncUI();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (["Enter", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyJ", "KeyR", "ControlLeft", "ControlRight", "KeyA", "KeyD", "KeyW"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.key === "Enter" && game.getFrameState().mode !== "play") {
    if (game.getFrameState().mode === "menu") {
      game.start();
    } else {
      game.restart();
    }
  }
});

resize();
game.render();
game.syncUI();
requestAnimationFrame(frame);
