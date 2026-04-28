import { Game } from "./Game.js";
import { HEIGHT, TOWER_DEFS, WIDTH } from "./data.js";
import { renderScene } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");
const cashText = document.getElementById("cashText");
const livesText = document.getElementById("livesText");
const waveText = document.getElementById("waveText");
const popsText = document.getElementById("popsText");
const towerButtons = document.getElementById("towerButtons");
const selectionText = document.getElementById("selectionText");
const statusText = document.getElementById("statusText");
const nextWaveButton = document.getElementById("nextWaveButton");
const speedButton = document.getElementById("speedButton");

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();

function buildTowerButtons() {
  for (const tower of Object.values(TOWER_DEFS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.towerId = tower.id;
    button.textContent = `${tower.name} ($${tower.cost})`;
    button.addEventListener("click", () => {
      game.selectTower(tower.id);
      syncUi(game.getFrameState());
    });
    towerButtons.appendChild(button);
  }
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener("mousemove", (event) => {
  const point = canvasPoint(event);
  game.updatePreview(point.x, point.y);
});

canvas.addEventListener("click", (event) => {
  const point = canvasPoint(event);
  game.tryPlaceSelectedTower(point.x, point.y);
  syncUi(game.getFrameState());
});

overlayButton.addEventListener("click", () => {
  if (game.mode === "menu") {
    game.start();
  } else {
    game.restart();
    game.start();
  }
  syncUi(game.getFrameState());
});

nextWaveButton.addEventListener("click", () => {
  game.requestNextWave();
  syncUi(game.getFrameState());
});

speedButton.addEventListener("click", () => {
  game.toggleSpeed();
  syncUi(game.getFrameState());
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }
  if (event.code === "Digit1") {
    game.selectTower("dart");
  } else if (event.code === "Digit2") {
    game.selectTower("bomb");
  } else if (event.code === "Digit3") {
    game.selectTower("glue");
  } else if (event.code === "KeyN") {
    game.requestNextWave();
  } else if (event.code === "KeyF") {
    game.toggleSpeed();
  } else if (event.code === "Enter" && game.mode === "menu") {
    game.start();
  } else if (event.code === "Enter" && (game.mode === "win" || game.mode === "lose")) {
    game.restart();
    game.start();
  }
  syncUi(game.getFrameState());
});

function syncUi(state) {
  cashText.textContent = `$${state.cash}`;
  livesText.textContent = `${state.lives}`;
  waveText.textContent = `${state.waveNumber} / ${state.waveTotal}`;
  popsText.textContent = `${state.pops}`;
  selectionText.textContent = state.preview.reason;
  statusText.textContent = state.status;
  nextWaveButton.disabled = !state.nextWaveReady;
  speedButton.textContent = `Speed ${state.speedLabel}`;

  const buttons = towerButtons.querySelectorAll("button");
  buttons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.towerId === state.selectedTowerId);
  });

  if (state.overlay) {
    overlay.hidden = false;
    overlayEyebrow.textContent = state.overlay.eyebrow;
    overlayTitle.textContent = state.overlay.title;
    overlayCopy.textContent = state.overlay.copy;
    overlayButton.textContent = state.overlay.button;
  } else {
    overlay.hidden = true;
  }
}

buildTowerButtons();
syncUi(game.getFrameState());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  const state = game.getFrameState();
  renderScene(ctx, state);
  syncUi(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
