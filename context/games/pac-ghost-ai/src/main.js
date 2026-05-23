const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const app = document.getElementById("app");
const hud = document.getElementById("hud");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayButton = document.getElementById("overlay-button");

const scoreValue = document.getElementById("score-value");
const livesValue = document.getElementById("lives-value");
const levelValue = document.getElementById("level-value");
const modeValue = document.getElementById("mode-value");

const { Game } = window.PacGhostGame;
const { renderGame } = window.PacGhostRender;

const game = new Game();
const input = {
  direction: null,
  startPressed: false,
  restartPressed: false,
};

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") {
    input.direction = "left";
  } else if (key === "arrowright" || key === "d") {
    input.direction = "right";
  } else if (key === "arrowup" || key === "w") {
    input.direction = "up";
  } else if (key === "arrowdown" || key === "s") {
    input.direction = "down";
  } else if (key === "enter" || key === " ") {
    input.startPressed = true;
  } else if (key === "r") {
    input.restartPressed = true;
  }
});

overlayButton.addEventListener("click", () => {
  input.startPressed = true;
});

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt, input);
  input.startPressed = false;
  input.restartPressed = false;

  const state = game.getFrameState();
  renderGame(ctx, state);
  syncUi(state);
  window.requestAnimationFrame(frame);
}

function syncUi(state) {
  app.dataset.mode = state.mode;
  scoreValue.textContent = String(state.score);
  livesValue.textContent = String(state.lives);
  levelValue.textContent = String(state.level);
  modeValue.textContent = state.ghostMode[0].toUpperCase() + state.ghostMode.slice(1);

  const showOverlay = state.mode === "menu" || state.mode === "win" || state.mode === "lose";
  overlay.hidden = !showOverlay;
  overlay.setAttribute("aria-hidden", showOverlay ? "false" : "true");
  hud.setAttribute("aria-hidden", showOverlay ? "true" : "false");

  if (state.mode === "menu") {
    overlayEyebrow.textContent = "maze pursuit";
    overlayTitle.textContent = "Pac Ghost-Hunt AI";
    overlayCopy.textContent = "Blinky chases direct, Pinky aims ahead, Inky bends off Blinky, and Clyde breaks pattern when you get close.";
    overlayButton.textContent = "Start Run";
  } else if (state.mode === "win") {
    overlayEyebrow.textContent = "maze cleared";
    overlayTitle.textContent = `Level ${state.level} Cleared`;
    overlayCopy.textContent = `Score ${state.score}. Start again to run the full ghost script harder.`;
    overlayButton.textContent = "Play Again";
  } else if (state.mode === "lose") {
    overlayEyebrow.textContent = "caught";
    overlayTitle.textContent = "Maze Over";
    overlayCopy.textContent = `Final score ${state.score}. Re-enter the grid and route cleaner turns.`;
    overlayButton.textContent = "Retry";
  }
}

syncUi(game.getFrameState());
window.requestAnimationFrame(frame);
