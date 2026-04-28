import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const menuScreen = document.getElementById("menu-screen");
const hud = document.getElementById("hud");
const resultScreen = document.getElementById("result-screen");
const startButton = document.getElementById("start-button");
const menuRestartButton = document.getElementById("menu-restart-button");
const restartButton = document.getElementById("restart-button");
const resultRestartButton = document.getElementById("result-restart-button");
const pauseButton = document.getElementById("pause-button");
const slamButton = document.getElementById("slam-button");
const stateValue = document.getElementById("state-value");
const distanceValue = document.getElementById("distance-value");
const speedValue = document.getElementById("speed-value");
const coinValue = document.getElementById("coin-value");
const comboValue = document.getElementById("combo-value");
const queueValue = document.getElementById("queue-value");
const shopStatus = document.getElementById("shop-status");
const shopList = document.getElementById("shop-list");
const resultEyebrow = document.getElementById("result-eyebrow");
const resultTitle = document.getElementById("result-title");
const resultCopy = document.getElementById("result-copy");

const game = new Game();
const input = { slam: false, pause: false, start: false, restart: false };
let lastTime = 0;
let shopButtons = new Map();

bindEvents();
resizeCanvas();
syncUi(game.getFrameState());
requestAnimationFrame(tick);

function bindEvents() {
  startButton.addEventListener("click", () => { input.start = true; });
  menuRestartButton.addEventListener("click", () => { input.restart = true; });
  restartButton.addEventListener("click", () => { input.restart = true; });
  resultRestartButton.addEventListener("click", () => { input.restart = true; });
  pauseButton.addEventListener("click", () => { input.pause = true; });
  slamButton.addEventListener("click", () => { input.slam = true; });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", onKeyDown);
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
  const dt = Math.min(0.05, ((now - lastTime) || 16.67) / 1000);
  lastTime = now;
  game.update(dt, input);
  const frameState = game.getFrameState();
  renderFrame(ctx, frameState, { width: canvas.clientWidth, height: canvas.clientHeight, time: now / 1000 });
  syncUi(frameState);
  input.slam = false;
  input.pause = false;
  input.start = false;
  input.restart = false;
  requestAnimationFrame(tick);
}

function syncUi(frameState) {
  const state = frameState.state || "menu";
  app.dataset.state = state;
  menuScreen.hidden = state !== "menu";
  hud.hidden = state === "menu";
  const showResult = frameState.overlayType === "result";
  resultScreen.setAttribute("aria-hidden", String(!showResult));
  resultScreen.hidden = !showResult;

  stateValue.textContent = formatLabel(state);
  distanceValue.textContent = `${Math.round(frameState.distance || 0)} m`;
  speedValue.textContent = `${Math.round(frameState.speed || 0)}`;
  coinValue.textContent = `${frameState.coins || 0}`;
  comboValue.textContent = `x${Math.round((frameState.combo || 0) * 10) / 10}`;
  queueValue.textContent = `${frameState.queue?.index || 0} / ${frameState.queue?.total || 0}`;
  shopStatus.textContent = frameState.status || "Start a run to build coins for upgrades.";

  if (frameState.overlay) {
    resultEyebrow.textContent = frameState.overlay.eyebrow || "Result";
    resultTitle.textContent = frameState.overlay.title || "Slam complete.";
    resultCopy.textContent = frameState.overlay.copy || "";
  }

  syncShop(frameState.shop || []);
  pauseButton.textContent = state === "paused" ? "Resume" : "Pause";
}

function syncShop(items) {
  const nextButtons = new Map();
  for (const item of items) {
    const current = shopButtons.get(item.id) || document.createElement("button");
    current.type = "button";
    current.className = "shop-card";
    current.disabled = item.owned && item.level >= item.maxLevel;
    current.innerHTML = `<strong>${item.label}</strong><span>${item.desc}</span><em>${item.owned ? `Lv ${item.level}/${item.maxLevel}` : `Buy ${item.cost}`}</em>`;
    current.onclick = () => {
      const bought = game.buy(item.id);
      if (bought) syncUi(game.getFrameState());
    };
    nextButtons.set(item.id, current);
  }
  shopButtons = nextButtons;
  shopList.replaceChildren(...shopButtons.values());
}

function onKeyDown(event) {
  if (event.repeat) return;
  if (event.code === "Enter") {
    input.start = true;
  } else if (event.code === "Space") {
    input.slam = true;
  } else if (event.code === "KeyP" || event.code === "Escape") {
    input.pause = true;
  } else if (event.code === "KeyR") {
    input.restart = true;
  }
}

function formatLabel(value) {
  return String(value).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
