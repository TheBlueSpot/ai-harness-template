import { Game } from "./Game.js";
import { syncHud } from "./ui/hud.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const startScreen = document.getElementById("start-screen");
const hud = document.getElementById("hud");
const restartScreen = document.getElementById("restart-screen");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const hudRefs = {
  phaseValue: document.getElementById("phase-value"),
  dayValue: document.getElementById("day-value"),
  nightValue: document.getElementById("night-value"),
  scrapValue: document.getElementById("scrap-value"),
  ammoValue: document.getElementById("ammo-value"),
  barricadeValue: document.getElementById("barricade-value"),
  survivorsValue: document.getElementById("survivors-value"),
  statusValue: document.getElementById("status-value"),
  restartEyebrow: document.getElementById("restart-eyebrow"),
  restartTitle: document.getElementById("restart-title"),
  restartCopy: document.getElementById("restart-copy"),
};

const input = createInputState();
const game = new Game(canvas);
let lastTime = 0;

function createInputState() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    melee: false,
    confirm: false,
    restart: false,
    start: false,
    pointer: null,
  };
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  game.resize({ width: rect.width, height: rect.height, dpr });
}

function step(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
  lastTime = now;
  game.update(dt, input);
  game.render();
  syncFrame();
  input.confirm = false;
  input.restart = false;
  input.start = false;
  input.melee = false;
  window.requestAnimationFrame(step);
}

function syncFrame() {
  const frame = game.getFrameState();
  const shellState = frame.phase === "menu" ? "menu" : frame.phase === "win" || frame.phase === "gameover" ? "restart" : "hud";
  app.dataset.state = shellState;
  startScreen.setAttribute("aria-hidden", String(shellState !== "menu"));
  hud.setAttribute("aria-hidden", String(shellState !== "hud"));
  restartScreen.setAttribute("aria-hidden", String(shellState !== "restart"));
  syncHud(frame, hudRefs);
}

function startGame() {
  game.start();
  syncFrame();
}

function restartGame() {
  game.restart();
  syncFrame();
}

function onKeyDown(event) {
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      input.up = true;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.down = true;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      input.left = true;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      input.right = true;
      break;
    case " ":
      input.fire = true;
      break;
    case "Enter":
      if (app.dataset.state === "menu") {
        input.start = true;
        startGame();
      } else if (app.dataset.state === "restart") {
        input.restart = true;
        restartGame();
      } else {
        input.confirm = true;
      }
      break;
    case "e":
    case "E":
      input.confirm = true;
      break;
    case "f":
    case "F":
      input.melee = true;
      break;
    case "r":
    case "R":
      input.restart = true;
      restartGame();
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      input.up = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.down = false;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      input.left = false;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      input.right = false;
      break;
    case " ":
      input.fire = false;
      break;
    default:
      break;
  }
}

function onPointerDown(event) {
  updatePointer(event);
  if (app.dataset.state === "menu") {
    startGame();
    return;
  }
  if (event.button === 2) {
    input.confirm = true;
    return;
  }
  input.fire = true;
}

function onPointerMove(event) {
  updatePointer(event);
}

function onPointerUp() {
  input.fire = false;
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  input.pointer = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function bindEvents() {
  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", restartGame);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

bindEvents();
resize();
syncFrame();
window.requestAnimationFrame(step);
