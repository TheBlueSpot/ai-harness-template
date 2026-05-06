import { Game } from "./Game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const targetEl = document.getElementById("target");
const timerEl = document.getElementById("timer");
const comboEl = document.getElementById("combo");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const startButton = document.getElementById("start-button");

const game = new Game();

function syncHud() {
  const frame = game.getFrameState();
  scoreEl.textContent = String(frame.score);
  targetEl.textContent = String(frame.targetScore);
  timerEl.textContent = frame.timer.toFixed(1);
  comboEl.textContent = `x${Math.max(1, frame.combo - 1)}`;

  if (frame.mode === "playing") {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  if (frame.mode === "menu") {
    overlayEyebrow.textContent = "Match-3 blitz";
    overlayTitle.textContent = "Bejeweled Burst Cascade";
    overlayBody.textContent = "Swap adjacent gems, stack cascades, and race the timer to hit the target score.";
    startButton.textContent = "Start Run";
  } else if (frame.mode === "win") {
    overlayEyebrow.textContent = "Board cleared";
    overlayTitle.textContent = "Target reached";
    overlayBody.textContent = `Score ${frame.score}. Max combo x${frame.maxCombo}. Start another blitz?`;
    startButton.textContent = "Play Again";
  } else {
    overlayEyebrow.textContent = "Time over";
    overlayTitle.textContent = "Blitz failed";
    overlayBody.textContent = `Score ${frame.score} / ${frame.targetScore}. Chase a cleaner cascade route.`;
    startButton.textContent = "Retry";
  }
}

function frameLoop(now) {
  if (!frameLoop.last) {
    frameLoop.last = now;
  }
  const dt = Math.min(0.05, (now - frameLoop.last) / 1000);
  frameLoop.last = now;
  game.update(dt);
  render(ctx, game.getFrameState());
  syncHud();
  requestAnimationFrame(frameLoop);
}

canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  game.handlePointer(x, y);
  syncHud();
});

startButton.addEventListener("click", () => {
  if (game.getFrameState().mode === "menu") {
    game.start();
  } else {
    game.restart();
  }
  syncHud();
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    game.restart();
    syncHud();
    return;
  }

  if (event.key === "Enter" && game.getFrameState().mode !== "playing") {
    game.restart();
    syncHud();
  }
});

render(ctx, game.getFrameState());
syncHud();
requestAnimationFrame(frameLoop);
