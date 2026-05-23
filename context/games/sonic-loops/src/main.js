import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const resultRestartButton = document.getElementById("result-restart-button");
const menuScreen = document.getElementById("menu-screen");
const hud = document.getElementById("hud");
const resultScreen = document.getElementById("result-screen");
const stateValue = document.getElementById("state-value");
const ringsValue = document.getElementById("rings-value");
const speedValue = document.getElementById("speed-value");
const timerValue = document.getElementById("timer-value");
const healthValue = document.getElementById("health-value");
const statusValue = document.getElementById("status-value");
const resultEyebrow = document.getElementById("result-eyebrow");
const resultTitle = document.getElementById("result-title");
const resultCopy = document.getElementById("result-copy");

const ctx = canvas.getContext("2d");
const input = createInputState();
const game = new Game();
let lastTime = 0;

bindEvents();
resizeCanvas();
syncShell(game.getFrameState());
requestAnimationFrame(tick);

function createInputState() {
  return { left: false, right: false, jump: false, brake: false, start: false, restart: false };
}

function bindEvents() {
  startButton.addEventListener("click", startRun);
  restartButton.addEventListener("click", restartRun);
  resultRestartButton.addEventListener("click", restartRun);
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize(rect.width, rect.height);
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
  lastTime = now;
  game.update(dt, input);
  renderFrame(ctx, game.getFrameState(), {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    time: now / 1000,
  });
  syncShell(game.getFrameState());
  input.start = false;
  input.restart = false;
  requestAnimationFrame(tick);
}

function syncShell(frameState) {
  const state = frameState.state ?? "menu";
  app.dataset.state = state;
  menuScreen.hidden = state !== "menu";
  hud.hidden = state === "menu";
  resultScreen.hidden = state !== "win" && state !== "lose";

  stateValue.textContent = formatLabel(state);
  ringsValue.textContent = `${frameState.rings?.collected ?? 0} / ${frameState.rings?.total ?? 0}`;
  speedValue.textContent = `${Math.round(frameState.speed ?? 0)}`;
  timerValue.textContent = `${(frameState.timer ?? 0).toFixed(1)}s`;
  healthValue.textContent = frameState.guard ?? "Exposed";
  statusValue.textContent = frameState.status ?? "Ready";

  if (state === "win") {
    resultEyebrow.textContent = "finish";
    resultTitle.textContent = "Loop cleared.";
    resultCopy.textContent = frameState.message ?? "Restart to run again.";
  } else if (state === "lose") {
    resultEyebrow.textContent = "ring loss";
    resultTitle.textContent = "Run failed.";
    resultCopy.textContent = frameState.message ?? "Restart to try again.";
  }
}

function startRun() {
  input.start = true;
  game.start();
  syncShell(game.getFrameState());
}

function restartRun() {
  input.restart = true;
  game.restart();
  syncShell(game.getFrameState());
}

function onKeyDown(event) {
  if (event.repeat && event.key !== "r" && event.key !== "R") return;
  switch (event.key) {
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
    case "ArrowUp":
    case "w":
    case "W":
    case " ":
      input.jump = true;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.brake = true;
      break;
    case "Enter":
      input.start = true;
      game.start();
      break;
    case "r":
    case "R":
      restartRun();
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  switch (event.key) {
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
    case "ArrowUp":
    case "w":
    case "W":
    case " ":
      input.jump = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.brake = false;
      break;
    default:
      break;
  }
}

function formatLabel(value) {
  return String(value).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
