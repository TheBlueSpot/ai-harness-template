import { Game } from "./Game.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./world.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const app = document.getElementById("app");
const hud = document.getElementById("hud");
const menuScreen = document.getElementById("menu-screen");
const resultScreen = document.getElementById("result-screen");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

const hudNodes = {
  sector: document.getElementById("sector-value"),
  energy: document.getElementById("energy-value"),
  suit: document.getElementById("suit-value"),
  log: document.getElementById("log-value"),
};

const resultNodes = {
  eyebrow: document.getElementById("result-eyebrow"),
  title: document.getElementById("result-title"),
  copy: document.getElementById("result-copy"),
};

const game = new Game();

const input = {
  down: {
    left: false,
    right: false,
  },
  pressed: {
    jump: false,
    shoot: false,
    morph: false,
    start: false,
    restart: false,
  },
};

const keyMap = {
  KeyA: { type: "down", key: "left" },
  ArrowLeft: { type: "down", key: "left" },
  KeyD: { type: "down", key: "right" },
  ArrowRight: { type: "down", key: "right" },
  KeyW: { type: "pressed", key: "jump" },
  ArrowUp: { type: "pressed", key: "jump" },
  Space: { type: "pressed", key: "jump" },
  KeyJ: { type: "pressed", key: "shoot" },
  KeyX: { type: "pressed", key: "shoot" },
  ControlLeft: { type: "pressed", key: "shoot" },
  ShiftLeft: { type: "pressed", key: "morph" },
  ShiftRight: { type: "pressed", key: "morph" },
  KeyS: { type: "pressed", key: "morph" },
  ArrowDown: { type: "pressed", key: "morph" },
  Enter: { type: "pressed", key: "start" },
  KeyR: { type: "pressed", key: "restart" },
};

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const scale = Math.min(rect.width / VIEW_WIDTH, rect.height / VIEW_HEIGHT);
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  canvas.style.width = `${VIEW_WIDTH * scale}px`;
  canvas.style.height = `${VIEW_HEIGHT * scale}px`;
}

function consumePressed() {
  for (const key of Object.keys(input.pressed)) {
    input.pressed[key] = false;
  }
}

function setKey(code, isDown) {
  const mapping = keyMap[code];
  if (!mapping) return;
  if (mapping.type === "down") {
    input.down[mapping.key] = isDown;
  } else if (isDown) {
    input.pressed[mapping.key] = true;
  }
}

function updateUi(frame) {
  app.dataset.state = frame.appState;
  menuScreen.setAttribute("aria-hidden", frame.appState === "menu" ? "false" : "true");
  hud.setAttribute("aria-hidden", frame.appState === "playing" ? "false" : "true");
  resultScreen.setAttribute("aria-hidden", frame.appState === "win" || frame.appState === "lose" ? "false" : "true");

  hudNodes.sector.textContent = frame.room.zone;
  hudNodes.energy.textContent = `${Math.max(0, Math.ceil(frame.player.hp))}`;
  hudNodes.suit.textContent = frame.player.form === "morph" ? "Morph" : frame.upgrades.has("highJump") ? "High Jump" : "Combat";
  hudNodes.log.textContent = frame.objectiveLog;

  if (frame.result) {
    resultNodes.eyebrow.textContent = frame.result.eyebrow;
    resultNodes.title.textContent = frame.result.title;
    resultNodes.copy.textContent = frame.result.copy;
  }
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt, input);
  game.render(ctx);
  updateUi(game.getFrameState());
  consumePressed();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (!keyMap[event.code]) return;
  event.preventDefault();
  setKey(event.code, true);
});

window.addEventListener("keyup", (event) => {
  if (!keyMap[event.code]) return;
  event.preventDefault();
  setKey(event.code, false);
});

startButton.addEventListener("click", () => {
  if (game.getFrameState().appState === "menu") {
    game.start();
    updateUi(game.getFrameState());
    return;
  }
  input.pressed.start = true;
});

restartButton.addEventListener("click", () => {
  const appState = game.getFrameState().appState;
  if (appState === "win" || appState === "lose") {
    game.restart();
    updateUi(game.getFrameState());
    return;
  }
  input.pressed.restart = true;
});

window.addEventListener("resize", resize);
resize();
updateUi(game.getFrameState());
requestAnimationFrame(frame);
