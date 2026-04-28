import { Game } from "./Game.js";
import { HEIGHT, HERO_CLASSES, WIDTH } from "./data.js";
import { renderScene } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const app = document.getElementById("app");
const hud = document.getElementById("hud");
const heroValue = document.getElementById("hero-value");
const hpValue = document.getElementById("hp-value");
const floorValue = document.getElementById("floor-value");
const scoreValue = document.getElementById("score-value");
const generatorValue = document.getElementById("generator-value");
const doorValue = document.getElementById("door-value");
const classGrid = document.getElementById("class-grid");
const menuScreen = document.getElementById("menu-screen");
const resultScreen = document.getElementById("result-screen");
const resultEyebrow = document.getElementById("result-eyebrow");
const resultTitle = document.getElementById("result-title");
const resultCopy = document.getElementById("result-copy");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();
const heldKeys = new Set();
const classButtons = new Map();

function syncMove() {
  const left = heldKeys.has("ArrowLeft") || heldKeys.has("KeyA");
  const right = heldKeys.has("ArrowRight") || heldKeys.has("KeyD");
  const up = heldKeys.has("ArrowUp") || heldKeys.has("KeyW");
  const down = heldKeys.has("ArrowDown") || heldKeys.has("KeyS");
  game.setMove((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
}

function buildClassButtons() {
  for (const hero of HERO_CLASSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "class-card";
    button.dataset.heroId = hero.id;
    button.innerHTML = `<strong>${hero.name}</strong><span>${hero.description}</span>`;
    button.style.setProperty("--hero-color", hero.color);
    button.addEventListener("click", () => {
      game.selectHero(hero.id);
      syncUi(game.getFrameState());
    });
    classButtons.set(hero.id, button);
    classGrid.appendChild(button);
  }
}

function syncUi(state) {
  app.dataset.mode = state.mode;
  hud.setAttribute("aria-hidden", state.mode === "playing" ? "false" : "true");
  heroValue.textContent = state.heroName;
  hpValue.textContent = `${Math.max(0, Math.ceil(state.heroHp))} / ${state.heroMaxHp}`;
  floorValue.textContent = `${state.floorNumber}`;
  scoreValue.textContent = `${state.score}`;
  generatorValue.textContent = `${state.generatorsLeft}`;
  doorValue.textContent = state.doorLocked ? "Locked" : "Open";

  for (const [heroId, button] of classButtons) {
    button.dataset.selected = heroId === state.heroId ? "true" : "false";
  }

  const overlay = state.overlay;
  menuScreen.setAttribute("aria-hidden", overlay?.type === "menu" ? "false" : "true");
  menuScreen.hidden = overlay?.type !== "menu";
  resultScreen.setAttribute("aria-hidden", overlay?.type === "result" ? "false" : "true");
  resultScreen.hidden = overlay?.type !== "result";

  if (overlay?.type === "result") {
    resultEyebrow.textContent = overlay.eyebrow;
    resultTitle.textContent = overlay.title;
    resultCopy.textContent = overlay.copy;
  }
}

function startRun() {
  game.start();
  syncUi(game.getFrameState());
}

function restartToMenu() {
  game.restartRun();
  syncUi(game.getFrameState());
}

startButton.addEventListener("click", startRun);
restartButton.addEventListener("click", restartToMenu);

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if ((event.code === "Enter" || event.code === "NumpadEnter") && !event.repeat) {
    if (game.mode === "menu") {
      startRun();
    } else if (game.mode === "result") {
      restartToMenu();
    }
    return;
  }

  if (event.code === "KeyR" && !event.repeat) {
    if (game.mode === "playing") {
      game.start();
    } else {
      restartToMenu();
    }
    syncUi(game.getFrameState());
    return;
  }

  if (event.code === "Space") {
    game.setAttackHeld(true);
  }

  if (["KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    heldKeys.add(event.code);
    syncMove();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    game.setAttackHeld(false);
  }

  if (["KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    heldKeys.delete(event.code);
    syncMove();
  }
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  game.setPointer((event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY);
});

canvas.addEventListener("mousedown", () => {
  game.setPointerDown(true);
});

window.addEventListener("mouseup", () => {
  game.setPointerDown(false);
});

buildClassButtons();
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
