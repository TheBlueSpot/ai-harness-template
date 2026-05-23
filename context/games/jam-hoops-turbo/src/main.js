import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const overlayButton = document.getElementById("overlay-button");
const homeScore = document.getElementById("home-score");
const awayScore = document.getElementById("away-score");
const shotClock = document.getElementById("shot-clock");
const possessionLabel = document.getElementById("possession-label");
const controlledLabel = document.getElementById("controlled-label");
const statusLine = document.getElementById("status-line");
const turboFill = document.getElementById("turbo-fill");
const heatFill = document.getElementById("heat-fill");

const game = new Game();
const held = new Set();
const pressed = new Set();

const keyMap = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  W: "up",
  A: "left",
  S: "down",
  D: "right",
  " ": "action",
  x: "pass",
  X: "pass",
  Enter: "start",
  r: "restart",
  R: "restart",
  Shift: "turbo",
};

function consumeInput() {
  const input = {
    action: pressed.has("action"),
    moveX: (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
    moveY: (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0),
    pass: pressed.has("pass"),
    restart: pressed.has("restart"),
    start: pressed.has("start"),
    turbo: held.has("turbo"),
  };
  pressed.clear();
  return input;
}

function updateHud(frame) {
  homeScore.textContent = String(frame.score.home);
  awayScore.textContent = String(frame.score.away);
  shotClock.textContent = frame.shotClock.toFixed(1);
  possessionLabel.textContent = frame.possessionTeam === "home" ? "Home" : "Away";
  const controlled = frame.players.find((player) => player.id === frame.controlledId);
  controlledLabel.textContent = controlled?.name ?? "Blaze";
  statusLine.textContent = frame.message || "First to 21";
  turboFill.style.width = `${Math.round((controlled?.turbo ?? 0) * 100)}%`;
  heatFill.style.width = frame.fireTeam === "home" ? "100%" : frame.fireTeam === "away" ? "70%" : "0%";

  if (frame.mode === "menu") {
    overlay.classList.remove("hidden");
    overlayTitle.textContent = "2v2 arcade hoops";
    overlayBody.textContent = "Race to 21. Space shoots or strips, X swings the ball or swaps defenders, Shift burns turbo.";
    overlayButton.textContent = "Start Match";
  } else if (frame.mode === "win") {
    overlay.classList.remove("hidden");
    overlayTitle.textContent = "Home wins";
    overlayBody.textContent = "The hot hand held up to 21. Hit the button or press Enter to run it back.";
    overlayButton.textContent = "Play Again";
  } else if (frame.mode === "lose") {
    overlay.classList.remove("hidden");
    overlayTitle.textContent = "Away steals it";
    overlayBody.textContent = "The AI hit 21 first. Restart and lock the lane earlier.";
    overlayButton.textContent = "Rematch";
  } else {
    overlay.classList.add("hidden");
  }
}

window.addEventListener("keydown", (event) => {
  const mapped = keyMap[event.key];
  if (!mapped) {
    return;
  }
  event.preventDefault();
  if (!held.has(mapped)) {
    pressed.add(mapped);
  }
  held.add(mapped);
});

window.addEventListener("keyup", (event) => {
  const mapped = keyMap[event.key];
  if (!mapped) {
    return;
  }
  event.preventDefault();
  held.delete(mapped);
});

overlayButton.addEventListener("click", () => {
  if (game.getFrameState().mode === "playing") {
    game.restart();
  } else {
    game.start();
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt, consumeInput());
  const snapshot = game.getFrameState();
  renderGame(ctx, snapshot);
  updateHud(snapshot);
  requestAnimationFrame(frame);
}

updateHud(game.getFrameState());
renderGame(ctx, game.getFrameState());
requestAnimationFrame(frame);
