import { Game } from "./Game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const waveNode = document.getElementById("wave");
const keepNode = document.getElementById("keep");
const stoneNode = document.getElementById("stone");
const phaseNode = document.getElementById("phase");
const scoreNode = document.getElementById("score");
const panel = document.getElementById("panel");
const titleNode = document.getElementById("title");
const messageNode = document.getElementById("message");
const detailNode = document.getElementById("detail");
const actionNode = document.getElementById("action");

const game = new Game();

function syncHud() {
  const frame = game.getFrameState();
  waveNode.textContent = `${frame.wave} / 4`;
  keepNode.textContent = String(frame.keepHp);
  stoneNode.textContent = String(frame.materials);
  phaseNode.textContent = game.mode === "playing" ? frame.phase : game.mode;
  scoreNode.textContent = String(frame.score);
  render(ctx, frame);
}

function syncPanel() {
  if (game.mode === "menu") {
    panel.hidden = false;
    titleNode.textContent = "Rampart Rubble";
    messageNode.textContent = "Rebuild the wall in daylight, then survive the fleet bombardment at dusk.";
    detailNode.textContent = "Mouse places blocks in rebuild. Hold click to fire in defend. `Q` / `E` rotate. `Space` skips to the next phase.";
    actionNode.textContent = "Start";
    return;
  }
  if (game.mode === "win") {
    panel.hidden = false;
    titleNode.textContent = "Fleet Broken";
    messageNode.textContent = game.message;
    detailNode.textContent = "The keep stands. Run it again to route the fleet with fewer broken stones.";
    actionNode.textContent = "Restart";
    return;
  }
  if (game.mode === "lose") {
    panel.hidden = false;
    titleNode.textContent = "Keep Fallen";
    messageNode.textContent = game.message;
    detailNode.textContent = "Patch cleaner walls, start defend later, and delete the heaviest ships first.";
    actionNode.textContent = "Retry";
    return;
  }
  panel.hidden = true;
}

function handleAction() {
  if (game.mode === "menu") {
    game.start();
  } else {
    game.restart();
  }
  syncPanel();
  syncHud();
}

actionNode.addEventListener("click", handleAction);
canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  game.setPointer(x, y);
});
canvas.addEventListener("mousedown", () => {
  if (game.mode === "playing") {
    game.pointerDown();
  }
});
window.addEventListener("mouseup", () => {
  game.pointerUp();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleAction();
    return;
  }
  if (game.mode !== "playing") {
    return;
  }
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    game.queueSpace();
  } else if (event.key.toLowerCase() === "q") {
    game.queueRotate(-1);
  } else if (event.key.toLowerCase() === "e") {
    game.queueRotate(1);
  } else if (event.key.toLowerCase() === "r") {
    game.restart();
    syncPanel();
    syncHud();
  }
});

let last = performance.now();
function frame(now) {
  const step = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(step);
  syncPanel();
  syncHud();
  requestAnimationFrame(frame);
}

syncPanel();
syncHud();
requestAnimationFrame(frame);
