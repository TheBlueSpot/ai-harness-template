import { ARENA_HEIGHT, ARENA_WIDTH } from "./data.js";
import { Game } from "./Game.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const app = document.getElementById("app");
const menuScreen = document.getElementById("menu-screen");
const resultScreen = document.getElementById("result-screen");
const hud = document.getElementById("hud");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

const hudNodes = {
  phase: document.getElementById("phase-value"),
  timer: document.getElementById("timer-value"),
  message: document.getElementById("message-value"),
  playerHealth: document.getElementById("player-health-bar"),
  playerGuard: document.getElementById("player-guard-bar"),
  enemyHealth: document.getElementById("enemy-health-bar"),
  enemyGuard: document.getElementById("enemy-guard-bar"),
  rounds: document.getElementById("round-score-value"),
  playerState: document.getElementById("player-state-value"),
  enemyState: document.getElementById("enemy-state-value"),
  frame: document.getElementById("frame-advantage-value"),
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
    up: false,
    down: false,
  },
  pressed: {
    light: false,
    medium: false,
    heavy: false,
    start: false,
    enter: false,
    restart: false,
    debug: false,
    up: false,
  },
};

const keyMap = {
  KeyA: { type: "down", key: "left" },
  ArrowLeft: { type: "down", key: "left" },
  KeyD: { type: "down", key: "right" },
  ArrowRight: { type: "down", key: "right" },
  KeyW: { type: "down", key: "up" },
  ArrowUp: { type: "down", key: "up" },
  KeyS: { type: "down", key: "down" },
  ArrowDown: { type: "down", key: "down" },
  KeyJ: { type: "pressed", key: "light" },
  KeyK: { type: "pressed", key: "medium" },
  KeyL: { type: "pressed", key: "heavy" },
  Enter: { type: "pressed", key: "enter" },
  Space: { type: "pressed", key: "start" },
  KeyR: { type: "pressed", key: "restart" },
  KeyH: { type: "pressed", key: "debug" },
};

function setKey(code, isDown) {
  const mapping = keyMap[code];
  if (!mapping) {
    return;
  }
  if (mapping.type === "down") {
    input.down[mapping.key] = isDown;
    if (isDown && mapping.key === "up") {
      input.pressed.up = true;
    }
  } else if (isDown) {
    input.pressed[mapping.key] = true;
  }
}

function consumePressed() {
  for (const key of Object.keys(input.pressed)) {
    input.pressed[key] = false;
  }
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const scale = Math.min(rect.width / ARENA_WIDTH, rect.height / ARENA_HEIGHT);
  canvas.width = ARENA_WIDTH;
  canvas.height = ARENA_HEIGHT;
  canvas.style.width = `${ARENA_WIDTH * scale}px`;
  canvas.style.height = `${ARENA_HEIGHT * scale}px`;
  game.resize(canvas.width, canvas.height);
}

function updateUi(state) {
  app.dataset.state = state.appState;
  menuScreen.setAttribute("aria-hidden", state.appState === "menu" ? "false" : "true");
  hud.setAttribute("aria-hidden", state.appState === "playing" ? "false" : "true");
  resultScreen.setAttribute("aria-hidden", state.appState === "finished" ? "false" : "true");

  hudNodes.phase.textContent = `Round ${state.round}`;
  hudNodes.timer.textContent = `${state.timer}`;
  hudNodes.message.textContent = state.message;
  hudNodes.playerHealth.style.width = `${state.player.health}%`;
  hudNodes.playerGuard.style.width = `${state.player.guard}%`;
  hudNodes.enemyHealth.style.width = `${state.enemy.health}%`;
  hudNodes.enemyGuard.style.width = `${state.enemy.guard}%`;
  hudNodes.rounds.textContent = `${state.player.wins} - ${state.enemy.wins}`;
  hudNodes.playerState.textContent = state.player.state;
  hudNodes.enemyState.textContent = state.enemy.state;
  hudNodes.frame.textContent = `${state.frameText}${state.debugHitboxes ? " | debug on" : ""}`;

  if (state.result) {
    resultNodes.eyebrow.textContent = state.result.eyebrow;
    resultNodes.title.textContent = state.result.title;
    resultNodes.copy.textContent = state.result.copy;
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
  if (event.repeat && event.code !== "KeyA" && event.code !== "KeyD" && event.code !== "KeyS" && event.code !== "KeyW") {
    return;
  }
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
  input.pressed.restart = true;
});

window.addEventListener("resize", resize);
resize();
updateUi(game.getFrameState());
requestAnimationFrame(frame);
