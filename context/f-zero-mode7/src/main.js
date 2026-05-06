import { Game } from "./Game.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const menuScreen = document.getElementById("menu-screen");
const hud = document.getElementById("hud");
const restartScreen = document.getElementById("restart-screen");
const startButton = document.getElementById("start-button");
const menuRestartButton = document.getElementById("menu-restart-button");
const restartButton = document.getElementById("restart-screen-button");
const stateValue = document.getElementById("state-value");
const lapValue = document.getElementById("lap-value");
const speedValue = document.getElementById("speed-value");
const energyValue = document.getElementById("energy-value");
const placeValue = document.getElementById("place-value");
const lineValue = document.getElementById("line-value");
const restartTitle = document.getElementById("restart-title");
const restartCopy = document.getElementById("restart-copy");
const restartEyebrow = document.getElementById("restart-eyebrow");

const dprCap = 2;
const input = createInputState();
let game = null;
let frameId = 0;
let lastTime = 0;

function createInputState() {
  return {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    start: false,
    restart: false,
    pause: false,
    pointer: { x: 0, y: 0, active: false },
  };
}

function setShellState(state) {
  app.dataset.state = state;
  menuScreen.setAttribute("aria-hidden", String(state !== "menu"));
  hud.setAttribute("aria-hidden", String(state === "menu"));
  restartScreen.setAttribute("aria-hidden", String(state !== "restart" && state !== "gameover" && state !== "win"));
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  if (game?.resize) {
    game.resize({ width: rect.width, height: rect.height, dpr });
  }
}

function syncOverlay(snapshot = {}) {
  const state = snapshot.state ?? snapshot.mode ?? "menu";
  const overlayState =
    state === "menu" ? "menu" : state === "running" || state === "playing" || state === "countdown" || state === "paused" ? "hud" : "restart";
  setShellState(overlayState);

  stateValue.textContent = formatState(state);
  lapValue.textContent = snapshot.lap ? `${snapshot.lap.current ?? snapshot.lap} / ${snapshot.lap.total ?? 3}` : "1 / 3";
  speedValue.textContent = snapshot.speed != null ? `${Math.round(snapshot.speed)}` : "0";
  energyValue.textContent = snapshot.energy != null ? `${Math.max(0, Math.round(snapshot.energy))}%` : "100%";
  placeValue.textContent = snapshot.place != null ? `${snapshot.place} / 4` : "1 / 4";
  lineValue.textContent =
    state === "countdown" && snapshot.countdown > 0
      ? `T-${snapshot.countdown}`
      : snapshot.message ?? snapshot.status ?? "Ready";

  if (state === "win" || state === "won") {
    restartEyebrow.textContent = "finish";
    restartTitle.textContent = "Grand prix clear.";
    restartCopy.textContent = snapshot.message ?? "Track held. Press restart for another run.";
  } else if (state === "gameover" || state === "lost" || state === "dead") {
    restartEyebrow.textContent = "energy lost";
    restartTitle.textContent = "Machine drained.";
    restartCopy.textContent = snapshot.message ?? "Energy collapsed. Press restart to try again.";
  } else if (state === "paused") {
    restartEyebrow.textContent = "hold";
    restartTitle.textContent = "Race paused.";
    restartCopy.textContent = snapshot.message ?? "Press Escape to resume.";
  } else {
    restartEyebrow.textContent = "race result";
    restartTitle.textContent = "Track complete.";
    restartCopy.textContent = snapshot.message ?? "Press restart to run it back.";
  }
}

function formatState(state) {
  return String(state ?? "menu")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function buildGame() {
  const options = { canvas };
  try {
    return new Game(options);
  } catch {
    return new Game(canvas);
  }
}

function applyInputFrame() {
  if (game?.setInput) {
    game.setInput(input);
  } else if (game?.input) {
    Object.assign(game.input, input);
  }
}

function step(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
  lastTime = now;

  applyInputFrame();
  game?.update?.(dt, input);
  game?.render?.(canvas.getContext("2d"));
  syncOverlay(game?.getFrameState?.() ?? {});
  input.start = false;
  input.restart = false;
  input.pause = false;
  frameId = window.requestAnimationFrame(step);
}

function startRace() {
  input.start = true;
  if (game?.start) {
    game.start();
  } else if (game?.reset) {
    game.reset();
  }
  syncOverlay(game?.getFrameState?.() ?? { state: "running" });
}

function restartRace() {
  input.restart = true;
  if (game?.restart) {
    game.restart();
  } else if (game?.reset) {
    game.reset();
  }
  syncOverlay(game?.getFrameState?.() ?? { state: "menu" });
}

function bindEvents() {
  startButton.addEventListener("click", startRace);
  menuRestartButton.addEventListener("click", restartRace);
  restartButton.addEventListener("click", restartRace);

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
}

function onKeyDown(event) {
  if (event.repeat && event.key !== "Escape") {
    return;
  }

  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      input.accelerate = true;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.brake = true;
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
      input.start = true;
      break;
    case "r":
    case "R":
      input.restart = true;
      restartRace();
      break;
    case "Escape":
      input.pause = true;
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
      input.accelerate = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      input.brake = false;
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

function onPointerDown(event) {
  input.pointer.active = true;
  updatePointer(event);
  startRace();
}

function onPointerMove(event) {
  updatePointer(event);
}

function onPointerUp() {
  input.pointer.active = false;
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  input.pointer.x = event.clientX - rect.left;
  input.pointer.y = event.clientY - rect.top;
}

function boot() {
  game = buildGame();
  bindEvents();
  resizeCanvas();
  syncOverlay(game?.getFrameState?.() ?? { state: "menu" });
  frameId = window.requestAnimationFrame(step);
}

boot();
