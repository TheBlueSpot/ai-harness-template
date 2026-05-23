import { Game } from "./Game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayBody = document.getElementById("overlayBody");
const overlayButton = document.getElementById("overlayButton");
const holeLabel = document.getElementById("holeLabel");
const parLabel = document.getElementById("parLabel");
const strokesLabel = document.getElementById("strokesLabel");
const scoreLabel = document.getElementById("scoreLabel");

const game = new Game();

function formatScore(value) {
  if (value === 0) {
    return "E";
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function updateHud(frame) {
  holeLabel.textContent = `Hole ${frame.holeIndex + 1} / ${frame.totalHoles}`;
  parLabel.textContent = `Par ${frame.hole.par}`;
  strokesLabel.textContent = `Strokes ${frame.holeStrokes}`;
  scoreLabel.textContent = `Card ${formatScore(frame.cardScoreVsPar)}`;
}

function syncOverlay(frame) {
  if (frame.mode === "menu") {
    overlay.hidden = false;
    overlayTitle.textContent = "Mini Golf Windmill";
    overlayBody.textContent = "Drag from the ball to aim and release. Sand slows the ball. Windmill blades can bank or ruin a shot.";
    overlayButton.textContent = "Start Round";
    return;
  }

  if (frame.mode === "win") {
    overlay.hidden = false;
    overlayTitle.textContent = "Scorecard Cleared";
    overlayBody.textContent = `Finished in ${frame.totalStrokes} strokes against par ${frame.totalPar} (${formatScore(frame.cardScoreVsPar)}). Run it again for a cleaner card.`;
    overlayButton.textContent = "Play Again";
    return;
  }

  overlay.hidden = true;
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

overlayButton.addEventListener("click", () => {
  if (game.mode === "menu" || game.mode === "win") {
    game.start();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  const pos = pointerPosition(event);
  game.onPointerDown(pos.x, pos.y);
});

window.addEventListener("pointermove", (event) => {
  const pos = pointerPosition(event);
  game.onPointerMove(pos.x, pos.y);
});

window.addEventListener("pointerup", (event) => {
  const pos = pointerPosition(event);
  game.onPointerUp(pos.x, pos.y);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (game.mode === "menu" || game.mode === "win")) {
    game.start();
  } else if (event.key.toLowerCase() === "r") {
    if (game.mode === "menu" || game.mode === "win") {
      game.start();
    } else {
      game.restartCourse();
    }
  } else if (event.key.toLowerCase() === "n") {
    game.nextHole();
  }
});

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt);
  const state = game.getFrameState();
  updateHud(state);
  syncOverlay(state);
  render(ctx, state);
  requestAnimationFrame(frame);
}

const initialState = game.getFrameState();
updateHud(initialState);
syncOverlay(initialState);
render(ctx, initialState);
requestAnimationFrame(frame);
