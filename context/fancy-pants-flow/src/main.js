import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./terrain.js";
import { Game } from "./Game.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const app = document.getElementById("app");
const hud = document.getElementById("hud");
const menuScreen = document.getElementById("menu-screen");
const resultScreen = document.getElementById("result-screen");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

const hudNodes = {
  page: document.getElementById("page-value"),
  progress: document.getElementById("progress-value"),
  zone: document.getElementById("zone-value"),
  status: document.getElementById("status-value"),
  time: document.getElementById("time-value"),
  flow: document.getElementById("flow-value"),
  tricks: document.getElementById("tricks-value"),
  speed: document.getElementById("speed-value"),
};

const resultNodes = {
  eyebrow: document.getElementById("result-eyebrow"),
  title: document.getElementById("result-title"),
  copy: document.getElementById("result-copy"),
};

const game = new Game();
window.__FANCY_PANTS_FLOW__ = { game };

const input = {
  down: {
    left: false,
    right: false,
  },
  pressed: {
    jump: false,
    up: false,
    enter: false,
    start: false,
    restart: false,
  },
};

const keyMap = {
  KeyA: { type: "down", key: "left" },
  ArrowLeft: { type: "down", key: "left" },
  KeyD: { type: "down", key: "right" },
  ArrowRight: { type: "down", key: "right" },
  KeyW: { type: "pressed", key: "up" },
  ArrowUp: { type: "pressed", key: "up" },
  Space: { type: "pressed", key: "jump" },
  Enter: { type: "pressed", key: "enter" },
  KeyR: { type: "pressed", key: "restart" },
};

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const scale = Math.min(rect.width / CANVAS_WIDTH, rect.height / CANVAS_HEIGHT);
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.width = `${CANVAS_WIDTH * scale}px`;
  canvas.style.height = `${CANVAS_HEIGHT * scale}px`;
}

function setKey(code, isDown) {
  const mapping = keyMap[code];
  if (!mapping) {
    return;
  }
  if (mapping.type === "down") {
    input.down[mapping.key] = isDown;
  } else if (isDown) {
    input.pressed[mapping.key] = true;
  }
}

function consumePressed() {
  for (const key of Object.keys(input.pressed)) {
    input.pressed[key] = false;
  }
}

function updateUi(state) {
  app.dataset.state = state.appState;
  menuScreen.setAttribute("aria-hidden", state.appState === "menu" ? "false" : "true");
  hud.setAttribute("aria-hidden", state.appState === "playing" ? "false" : "true");
  resultScreen.setAttribute("aria-hidden", state.appState === "finished" || state.appState === "intermission" ? "false" : "true");

  hudNodes.zone.textContent = state.zone;
  hudNodes.status.textContent = state.status;
  hudNodes.page.textContent = state.page;
  hudNodes.progress.textContent = state.progress;
  hudNodes.time.textContent = state.time;
  hudNodes.flow.textContent = `${state.flow}`;
  hudNodes.tricks.textContent = state.tricks;
  hudNodes.speed.textContent = `${state.speed}`;

  if (state.result) {
    resultNodes.eyebrow.textContent = state.result.eyebrow;
    resultNodes.title.textContent = state.result.title;
    resultNodes.copy.textContent = state.result.copy;
    restartButton.textContent = state.result.buttonLabel ?? "Restart";
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
  if (keyMap[event.code]) {
    event.preventDefault();
    setKey(event.code, true);
  }
});

window.addEventListener("keyup", (event) => {
  if (keyMap[event.code]) {
    event.preventDefault();
    setKey(event.code, false);
  }
});

startButton.addEventListener("click", () => {
  input.pressed.enter = true;
});

restartButton.addEventListener("click", () => {
  if (game.getFrameState().appState === "intermission") {
    input.pressed.enter = true;
    return;
  }
  input.pressed.restart = true;
});

window.addEventListener("resize", resize);
resize();
updateUi(game.getFrameState());
requestAnimationFrame(frame);
