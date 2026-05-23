import { Game } from "./Game.js";
import { renderGame, renderNextPair } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const chainEl = document.getElementById("chain");
const pressureEl = document.getElementById("pressure");
const targetEl = document.getElementById("target");
const phaseEl = document.getElementById("phase");
const surgeEl = document.getElementById("surge");
const stackRiskEl = document.getElementById("stack-risk");
const reactorCopyEl = document.getElementById("reactor-copy");
const overlayEl = document.getElementById("overlay");
const overlayKickerEl = document.getElementById("overlay-kicker");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayBodyEl = document.getElementById("overlay-body");
const statusBarEl = document.getElementById("status-bar");
const statusLabelEl = document.getElementById("status-label");
const statusCopyEl = document.getElementById("status-copy");

const game = new Game();

const held = new Set();
const edge = {
  rotate: false,
  hardDrop: false,
  restart: false,
};

function isPressed(code) {
  return held.has(code);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.repeat) {
    if (event.code === "Enter") {
      event.preventDefault();
    }
    return;
  }
  held.add(event.code);
  if (event.code === "ArrowUp" || event.code === "KeyW") edge.rotate = true;
  if (event.code === "Space") edge.hardDrop = true;
  if (event.code === "Enter") edge.restart = true;
});

window.addEventListener("keyup", (event) => {
  held.delete(event.code);
});

let last = performance.now();

function getStackHeight(board) {
  for (let y = 0; y < board.length; y += 1) {
    if (board[y].some(Boolean)) {
      return board.length - y;
    }
  }
  return 0;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = {
    left: isPressed("ArrowLeft") || isPressed("KeyA"),
    right: isPressed("ArrowRight") || isPressed("KeyD"),
    softDrop: isPressed("ArrowDown") || isPressed("KeyS"),
    rotate: edge.rotate,
    hardDrop: edge.hardDrop,
    restart: edge.restart,
  };

  game.update(dt, input);
  edge.rotate = false;
  edge.hardDrop = false;
  edge.restart = false;

  const state = game.getFrameState();
  scoreEl.textContent = `${state.score}`;
  chainEl.textContent = `${state.bestChain}`;
  pressureEl.textContent = `${state.pressure} / ${state.pressureLimit}`;
  targetEl.textContent = `${state.targetScore}`;
  statusCopyEl.textContent = state.message;

  const stackHeight = getStackHeight(state.board);
  const stackRatio = state.board.length > 0 ? stackHeight / state.board.length : 0;

  let statusTone = "calm";
  let statusLabel = "Containment";
  let phase = "Cold Start";
  let surge = `${state.turnsUntilPressure} drops`;
  let stackRisk = "Low";
  let reactorCopy = "Clear chains to vent heat before the sludge injectors fire.";

  if (state.mode === "playing") {
    overlayEl.classList.remove("visible");
    if (state.lastChain > 1) {
      statusTone = "chain";
      statusLabel = "Chain Reaction";
      phase = "Venting";
      reactorCopy = `${state.lastChain} chain is cooling the chamber and buying board space.`;
    } else if (state.pressure >= state.pressureLimit - 1) {
      statusTone = "danger";
      statusLabel = "Critical Heat";
      phase = "Critical";
      reactorCopy = "One more dead drop triggers a sludge surge from below.";
    } else if (state.pressure >= Math.ceil(state.pressureLimit / 2)) {
      statusTone = "warn";
      statusLabel = "Heat Warning";
      phase = "Heating";
      reactorCopy = "The chamber is warming up. Set up a clear before the injectors prime.";
    } else {
      phase = "Stable";
      reactorCopy = "Build a chain now while the chamber still has room to breathe.";
    }
  } else {
    overlayEl.classList.add("visible");
    if (state.mode === "menu") {
      overlayKickerEl.textContent = "Containment briefing";
      overlayTitleEl.textContent = "Puyo Chain Reactor";
      overlayBodyEl.textContent = "Feed paired slime cores into the chamber. Match four to vent them before heat surges from below.";
      statusLabel = "Containment";
      phase = "Cold Start";
      reactorCopy = "Dead drops wake the injectors. Long chains cool the chamber back down.";
    } else if (state.mode === "win") {
      overlayKickerEl.textContent = `Best chain ${state.bestChain}`;
      overlayTitleEl.textContent = "Containment Stable";
      overlayBodyEl.textContent = `${state.message} Press Enter to run again.`;
      statusTone = "chain";
      statusLabel = "Stabilized";
      phase = "Stabilized";
      reactorCopy = "Containment held. Restart and push for a cleaner vent cycle.";
    } else {
      overlayKickerEl.textContent = `Score ${state.score}`;
      overlayTitleEl.textContent = "Reactor Overflow";
      overlayBodyEl.textContent = `${state.message} Press Enter to restart immediately.`;
      statusTone = "danger";
      statusLabel = "Meltdown";
      phase = "Overflow";
      reactorCopy = "The stack closed the feed pipe before the chamber could vent.";
    }
  }

  if (stackRatio >= 0.72) {
    stackRisk = "High";
  } else if (stackRatio >= 0.45) {
    stackRisk = "Rising";
  }
  if (state.mode === "lose") {
    surge = "tripped";
    stackRisk = "Critical";
  } else if (state.mode === "win") {
    surge = "vented";
    stackRisk = "Clear";
  } else if (state.lastChain > 1) {
    surge = "cooling";
  }

  phaseEl.textContent = phase;
  surgeEl.textContent = surge;
  stackRiskEl.textContent = stackRisk;
  reactorCopyEl.textContent = reactorCopy;

  statusBarEl.dataset.tone = statusTone;
  statusLabelEl.textContent = statusLabel;

  renderGame(ctx, state);
  renderNextPair(nextCtx, state.nextPair);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
