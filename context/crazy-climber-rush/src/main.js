import { Game } from "./Game.js";
import { HEIGHT, WIDTH } from "./data.js";
import { renderScene } from "./render.js";

const app = document.getElementById("app");
const hud = document.getElementById("hud");
const playSurface = document.getElementById("play-surface");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const altitudeValue = document.getElementById("altitude-value");
const staminaValue = document.getElementById("stamina-value");
const livesValue = document.getElementById("lives-value");
const timeValue = document.getElementById("time-value");
const ledgeValue = document.getElementById("ledge-value");
const stageValue = document.getElementById("stage-value");
const menuScreen = document.getElementById("menu-screen");
const resultScreen = document.getElementById("result-screen");
const resultEyebrow = document.getElementById("result-eyebrow");
const resultTitle = document.getElementById("result-title");
const resultCopy = document.getElementById("result-copy");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

const heldDirections = {
  left: false,
  right: false,
};
let laneRepeatTimer = 0;

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();

function syncUi(state) {
  app.dataset.mode = state.mode;
  hud.setAttribute("aria-hidden", state.mode === "playing" ? "false" : "true");
  altitudeValue.textContent = state.altitudeText;
  staminaValue.textContent = state.staminaText;
  livesValue.textContent = state.livesText;
  timeValue.textContent = state.timeText;
  ledgeValue.textContent = state.nextLedgeText;
  stageValue.textContent = state.stageText;

  menuScreen.hidden = state.overlay?.type !== "menu";
  menuScreen.setAttribute("aria-hidden", state.overlay?.type === "menu" ? "false" : "true");
  resultScreen.hidden = state.overlay?.type !== "result";
  resultScreen.setAttribute("aria-hidden", state.overlay?.type === "result" ? "false" : "true");

  if (state.overlay?.type === "result") {
    resultEyebrow.textContent = state.overlay.eyebrow;
    resultTitle.textContent = state.overlay.title;
    resultCopy.textContent = `${state.overlay.copy} Score ${state.overlay.score}.`;
  }
}

function startRun() {
  game.start();
  syncUi(game.getFrameState());
  playSurface.focus();
}

function resetToMenu() {
  game.restartRun();
  syncUi(game.getFrameState());
  playSurface.focus();
}

function moveDirection(direction) {
  if (direction === "left") {
    game.moveLane(-1);
  } else if (direction === "right") {
    game.moveLane(1);
  }
}

function getHeldDirection() {
  if (heldDirections.left === heldDirections.right) {
    return null;
  }
  return heldDirections.left ? "left" : "right";
}

function armHeldMovement(direction) {
  laneRepeatTimer = direction ? 0.18 : 0;
}

function pressDirection(direction) {
  heldDirections[direction] = true;
  moveDirection(direction);
  armHeldMovement(direction);
}

function releaseDirection(direction) {
  heldDirections[direction] = false;
  armHeldMovement(getHeldDirection());
}

function updateHeldMovement(dt) {
  const direction = getHeldDirection();
  if (!direction) {
    laneRepeatTimer = 0;
    return;
  }

  laneRepeatTimer -= dt;
  if (laneRepeatTimer > 0) {
    return;
  }

  moveDirection(direction);
  laneRepeatTimer = 0.18;
}

startButton.addEventListener("click", startRun);
restartButton.addEventListener("click", resetToMenu);
playSurface.addEventListener("pointerdown", () => {
  playSurface.focus();
});

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if ((event.code === "Enter" || event.code === "NumpadEnter") && !event.repeat) {
    if (game.mode === "menu") {
      startRun();
    } else if (game.mode === "result") {
      resetToMenu();
    }
    return;
  }

  if (event.code === "KeyR" && !event.repeat) {
    if (game.mode === "playing") {
      startRun();
    } else {
      resetToMenu();
    }
    return;
  }

  if ((event.code === "ArrowLeft" || event.code === "KeyA") && !event.repeat) {
    pressDirection("left");
  }

  if ((event.code === "ArrowRight" || event.code === "KeyD") && !event.repeat) {
    pressDirection("right");
  }

  if (event.code === "KeyQ" && !event.repeat) {
    game.stroke("left");
  }

  if (event.code === "KeyE" && !event.repeat) {
    game.stroke("right");
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    releaseDirection("left");
  }

  if (event.code === "ArrowRight" || event.code === "KeyD") {
    releaseDirection("right");
  }
});

syncUi(game.getFrameState());
playSurface.focus();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateHeldMovement(dt);
  game.update(dt);
  const state = game.getFrameState();
  renderScene(ctx, state);
  syncUi(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
