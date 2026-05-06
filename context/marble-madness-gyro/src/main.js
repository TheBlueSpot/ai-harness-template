import { Game } from "./Game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlay-kicker");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const overlayButton = document.getElementById("overlay-button");

const stageValue = document.getElementById("stage-value");
const timeValue = document.getElementById("time-value");
const gemValue = document.getElementById("gem-value");
const fallValue = document.getElementById("fall-value");

const game = new Game();
const input = {
  up: false,
  down: false,
  left: false,
  right: false,
};

function setKey(code, pressed) {
  if (code === "ArrowUp" || code === "KeyW") input.up = pressed;
  if (code === "ArrowDown" || code === "KeyS") input.down = pressed;
  if (code === "ArrowLeft" || code === "KeyA") input.left = pressed;
  if (code === "ArrowRight" || code === "KeyD") input.right = pressed;
}

window.addEventListener("keydown", (event) => {
  setKey(event.code, true);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "Enter" || event.code === "Space") {
    if (game.mode === "menu") {
      game.start();
    } else if (game.mode === "stage-intro") {
      game.beginStage();
    } else if (game.mode === "win" || game.mode === "lose") {
      game.restart();
    }
  }
  if (event.code === "KeyR" && game.mode !== "menu") {
    game.restart();
  }
});

window.addEventListener("keyup", (event) => {
  setKey(event.code, false);
});

overlayButton.addEventListener("click", () => {
  if (game.mode === "menu") {
    game.start();
  } else if (game.mode === "stage-intro") {
    game.beginStage();
  } else {
    game.restart();
  }
});

function syncUi(frame) {
  stageValue.textContent = `${frame.stageNumber} / ${frame.stageCount}`;
  timeValue.textContent = frame.timeLeft.toFixed(1);
  gemValue.textContent = `${frame.gemsCollected} / ${frame.gemsRequired}`;
  fallValue.textContent = String(frame.falls);

  if (frame.mode === "menu") {
    overlay.hidden = false;
    overlayKicker.textContent = "Marble Madness Gyro";
    overlayTitle.textContent = "Tilt Into The Course";
    overlayBody.textContent = "Clear six stages of checkpoints, collect enough gems to unlock each exit ring, and survive the rotating gyro arms.";
    overlayButton.textContent = "View Stage 1";
  } else if (frame.mode === "stage-intro") {
    overlay.hidden = false;
    overlayKicker.textContent = `Stage ${frame.stageNumber} / ${frame.stageCount}`;
    overlayTitle.textContent = frame.stageName;
    overlayBody.textContent = `${frame.stageBriefing} Collect ${frame.gemsRequired} gems, lock every checkpoint, and finish with time left for bonus score.`;
    overlayButton.textContent = "Drop In";
  } else if (frame.mode === "win") {
    overlay.hidden = false;
    overlayKicker.textContent = "Course Clear";
    overlayTitle.textContent = `Score ${frame.score}`;
    overlayBody.textContent = `You cleared all ${frame.stageCount} stages with ${frame.totalGems} total gems and ${frame.falls} falls.`;
    overlayButton.textContent = "Run Again";
  } else if (frame.mode === "lose") {
    overlay.hidden = false;
    overlayKicker.textContent = "Run Lost";
    overlayTitle.textContent = "Time Expired";
    overlayBody.textContent = "Tilt earlier into open lanes and use bumpers to recover speed instead of fighting every wall.";
    overlayButton.textContent = "Retry";
  } else {
    overlay.hidden = true;
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const frame = game.getFrameState();
  syncUi(frame);
  render(ctx, frame);
  requestAnimationFrame(loop);
}

syncUi(game.getFrameState());
render(ctx, game.getFrameState());
requestAnimationFrame(loop);
