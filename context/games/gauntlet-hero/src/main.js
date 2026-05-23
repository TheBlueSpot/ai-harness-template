import { AudioEngine } from "./audio.js";
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
const runMeta = document.getElementById("run-meta");
const chapterValue = document.getElementById("chapter-value");
const omenValue = document.getElementById("omen-value");
const relicValue = document.getElementById("relic-value");
const statsValue = document.getElementById("stats-value");
const statsHelp = document.getElementById("stats-help");
const classGrid = document.getElementById("class-grid");
const relicGrid = document.getElementById("relic-grid");
const menuScreen = document.getElementById("menu-screen");
const intermissionScreen = document.getElementById("intermission-screen");
const intermissionEyebrow = document.getElementById("intermission-eyebrow");
const intermissionTitle = document.getElementById("intermission-title");
const intermissionCopy = document.getElementById("intermission-copy");
const resultScreen = document.getElementById("result-screen");
const resultEyebrow = document.getElementById("result-eyebrow");
const resultTitle = document.getElementById("result-title");
const resultCopy = document.getElementById("result-copy");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const changeHeroButton = document.getElementById("change-hero-button");

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();
const audio = new AudioEngine();
const heldKeys = new Set();
const classButtons = new Map();
let renderedRelicSignature = "";

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
  runMeta.setAttribute("aria-hidden", state.mode === "playing" ? "false" : "true");
  heroValue.textContent = state.heroName;
  hpValue.textContent = `${Math.max(0, Math.ceil(state.heroHp))} / ${state.heroMaxHp}`;
  floorValue.textContent = `${state.floorNumber}`;
  scoreValue.textContent = `${state.score}`;
  generatorValue.textContent = `${state.generatorsLeft}`;
  doorValue.textContent = state.doorLocked ? "Locked" : "Open";
  chapterValue.textContent = state.chapterTitle;
  omenValue.textContent = state.floorOmen;
  relicValue.textContent = state.currentRelic ? state.currentRelic.name : "No relic";
  statsValue.textContent = state.heroStatSummary;
  statsHelp.textContent = state.heroStatGuide;

  for (const [heroId, button] of classButtons) {
    button.dataset.selected = heroId === state.heroId ? "true" : "false";
  }

  const overlay = state.overlay;
  menuScreen.setAttribute("aria-hidden", overlay?.type === "menu" ? "false" : "true");
  menuScreen.hidden = overlay?.type !== "menu";
  intermissionScreen.setAttribute("aria-hidden", overlay?.type === "intermission" ? "false" : "true");
  intermissionScreen.hidden = overlay?.type !== "intermission";
  resultScreen.setAttribute("aria-hidden", overlay?.type === "result" ? "false" : "true");
  resultScreen.hidden = overlay?.type !== "result";

  if (overlay?.type === "intermission") {
    intermissionEyebrow.textContent = overlay.eyebrow;
    intermissionTitle.textContent = overlay.title;
    intermissionCopy.textContent = overlay.copy;
    const relicSignature = `${overlay.title}:${overlay.relicOptions.map((relic) => relic.id).join("|")}`;
    if (relicSignature !== renderedRelicSignature) {
      renderedRelicSignature = relicSignature;
      relicGrid.replaceChildren();
      for (const relic of overlay.relicOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "class-card relic-card";
        button.innerHTML = `<strong>${relic.name}</strong><span>${relic.effectText}</span><p class="relic-preview">${relic.previewText}</p><p class="relic-reason">${relic.pickReason}</p><small>${relic.flavor}</small>`;
        button.addEventListener("click", () => {
          game.chooseRelic(relic.id);
          syncUi(game.getFrameState());
        });
        relicGrid.appendChild(button);
      }
    }
  } else {
    renderedRelicSignature = "";
  }

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

function retryRun() {
  game.start();
  syncUi(game.getFrameState());
}

function returnToHeroSelect() {
  game.restartRun();
  syncUi(game.getFrameState());
}

startButton.addEventListener("click", startRun);
restartButton.addEventListener("click", retryRun);
changeHeroButton.addEventListener("click", returnToHeroSelect);

function unlockAudio() {
  audio.unlock();
}

window.addEventListener("keydown", (event) => {
  unlockAudio();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if ((event.code === "Enter" || event.code === "NumpadEnter") && !event.repeat) {
    if (game.mode === "menu") {
      startRun();
    } else if (game.mode === "result") {
      retryRun();
    }
    return;
  }

  if (event.code === "KeyR" && !event.repeat) {
    if (game.mode === "playing" || game.mode === "result") {
      retryRun();
    } else {
      startRun();
    }
    return;
  }

  if (event.code === "Escape" && !event.repeat && game.mode === "result") {
    returnToHeroSelect();
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
  unlockAudio();
  game.setPointerDown(true);
});

window.addEventListener("mouseup", () => {
  game.setPointerDown(false);
});
window.addEventListener("pointerdown", unlockAudio, { once: true });

buildClassButtons();
syncUi(game.getFrameState());
window.__gauntletHeroDebug = { game, syncUi };

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  const state = game.getFrameState();
  audio.sync(state, game.consumeEvents());
  renderScene(ctx, state);
  syncUi(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
