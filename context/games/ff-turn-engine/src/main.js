import { Game } from "./Game.js";

const app = document.getElementById("app");
const canvas = document.getElementById("battle-canvas");
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const result = document.getElementById("result");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const resultRestartButton = document.getElementById("result-restart-button");
const stateValue = document.getElementById("state-value");
const atbValue = document.getElementById("atb-value");
const partyValue = document.getElementById("party-value");
const enemyValue = document.getElementById("enemy-value");
const commandValue = document.getElementById("command-value");
const logValue = document.getElementById("log-value");
const resultTitle = document.getElementById("result-title");
const resultCopy = document.getElementById("result-copy");
const resultEyebrow = document.getElementById("result-eyebrow");

const input = createInput();
let game = new Game({ canvas });
let rafId = 0;
let lastTime = 0;

function createInput() {
  return { up: false, down: false, left: false, right: false, confirm: false, cancel: false, start: false, restart: false };
}

function setState(state) {
  app.dataset.state = state;
  const resultVisible = state === "victory" || state === "defeat";
  menu.classList.toggle("is-visible", state === "menu");
  hud.classList.toggle("is-visible", state !== "menu");
  result.classList.toggle("is-visible", resultVisible);
  menu.hidden = state !== "menu";
  hud.hidden = state === "menu";
  result.hidden = !resultVisible;
  result.setAttribute("aria-hidden", String(!resultVisible));
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  game.resize(rect.width, rect.height);
}

function syncHud(frame) {
  setState(frame.state ?? "menu");
  stateValue.textContent = formatLabel(frame.state);
  atbValue.textContent = `${Math.round((frame.battle?.progress ?? 0) * 100)}%`;
  partyValue.textContent = `${livingCount(frame.party)} / ${frame.party?.length ?? 0}`;
  enemyValue.textContent = `${livingCount(frame.enemies)} / ${frame.enemies?.length ?? 0}`;
  commandValue.textContent = frame.command ?? "Ready";
  logValue.textContent = frame.log ?? "Ready";

  if (frame.state === "victory") {
    resultEyebrow.textContent = "win";
    resultTitle.textContent = "Victory.";
    resultCopy.textContent = formatResultCopy(frame.result, "Enemy line broken.");
  } else if (frame.state === "defeat") {
    resultEyebrow.textContent = "loss";
    resultTitle.textContent = "Party down.";
    resultCopy.textContent = formatResultCopy(frame.result, "Try again.");
  }
}

function livingCount(list = []) {
  return list.filter((item) => (item?.hp ?? 0) > 0).length;
}

function formatLabel(value) {
  return String(value ?? "menu")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatResultCopy(result, fallback) {
  if (typeof result === "string" && result.trim()) return result;
  if (result?.summary) return result.summary;
  if (result?.detail) return result.detail;
  return fallback;
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
  lastTime = now;
  game.update(dt, input);
  game.render(canvas.getContext("2d"));
  syncHud(game.getFrameState());
  input.confirm = false;
  input.cancel = false;
  input.start = false;
  input.restart = false;
  rafId = window.requestAnimationFrame(tick);
}

function startBattle() {
  input.start = true;
  game.start();
}

function restartBattle() {
  input.restart = true;
  game.restart();
}

function onKeyDown(event) {
  if (event.repeat && event.key !== "Escape") return;
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
    case "Enter":
    case " ":
      input.confirm = true;
      if (game.getFrameState().state === "menu") startBattle();
      break;
    case "Escape":
      input.cancel = true;
      break;
    case "r":
    case "R":
      restartBattle();
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
    default:
      break;
  }
}

startButton.addEventListener("click", startBattle);
restartButton.addEventListener("click", restartBattle);
resultRestartButton.addEventListener("click", restartBattle);
window.addEventListener("resize", resize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

resize();
syncHud(game.getFrameState());
rafId = window.requestAnimationFrame(tick);
