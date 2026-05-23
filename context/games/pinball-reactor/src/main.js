import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayBody = document.querySelector("#overlay-body");
const overlayButton = document.querySelector("#overlay-button");

const hud = {
  score: document.querySelector("#score"),
  balls: document.querySelector("#balls"),
  combo: document.querySelector("#combo"),
  reactor: document.querySelector("#reactor"),
};

const game = new Game();
const input = {
  left: false,
  right: false,
  launch: false,
  nudge: false,
};

function syncHud(frame) {
  hud.score.textContent = String(frame.score);
  hud.balls.textContent = String(Math.max(0, frame.ballsRemaining));
  hud.combo.textContent = `x${frame.combo.toFixed(1)}`;
  hud.reactor.textContent = frame.reactorReady ? "HOT" : `${frame.reactorCharge}/3`;
}

function syncOverlay(frame) {
  if (frame.mode === "playing") {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  if (frame.mode === "menu") {
    overlayTitle.textContent = "Pinball Reactor";
    overlayBody.textContent = "Charge the reactor with ramp shots, light the target bank, and lock two balls for multiball.";
    overlayButton.textContent = "Start Run";
    return;
  }
  if (frame.mode === "win") {
    overlayTitle.textContent = "Table Cleared";
    overlayBody.textContent = `You hit ${frame.score} points and stabilized the reactor. Launch again for a cleaner combo chain.`;
    overlayButton.textContent = "Play Again";
    return;
  }
  overlayTitle.textContent = "Drain Complete";
  overlayBody.textContent = `The reactor went cold at ${frame.score} points. Keep one ball alive longer through multiball.`;
  overlayButton.textContent = "Retry";
}

function triggerPrimaryAction() {
  const frame = game.getFrameState();
  if (frame.mode === "menu") {
    game.start();
    return;
  }
  if (frame.mode === "win" || frame.mode === "gameover") {
    game.restart();
    return;
  }
  input.launch = true;
  window.setTimeout(() => {
    input.launch = false;
  }, 0);
}

overlayButton.addEventListener("click", () => {
  triggerPrimaryAction();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat && event.code !== "ShiftLeft" && event.code !== "ShiftRight") {
    return;
  }
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    input.left = true;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    input.right = true;
  }
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    input.launch = true;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    input.nudge = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    input.left = false;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    input.right = false;
  }
  if (event.code === "Space" || event.code === "Enter") {
    input.launch = false;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    input.nudge = false;
  }
});

let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 1 / 20);
  previous = now;
  game.update(dt, input);
  const view = game.getFrameState();
  renderGame(ctx, view);
  syncHud(view);
  syncOverlay(view);
  requestAnimationFrame(frame);
}

const initial = game.getFrameState();
renderGame(ctx, initial);
syncHud(initial);
syncOverlay(initial);
requestAnimationFrame(frame);
