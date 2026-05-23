import { Game } from "./Game.js";
import { AudioEngine } from "./audio.js";
import { renderFrame } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const startButton = document.getElementById("start-button");
const healthEl = document.getElementById("health");
const batteriesEl = document.getElementById("batteries");
const stageEl = document.getElementById("stage");
const checkpointEl = document.getElementById("checkpoint");
const statusEl = document.getElementById("status");

const game = new Game();
const audio = new AudioEngine();
const input = createInput();
let lastTime = performance.now();

window.__bionicSwing = {
  audio,
  game,
  input,
};

function resize() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1);
  canvas.style.width = `${1280 * scale}px`;
  canvas.style.height = `${720 * scale}px`;
  game.resize(canvas.width, canvas.height);
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  game.update(dt, input);
  const frame = game.getFrameState();
  const events = game.consumeEvents();
  audio.sync(frame, events);
  renderFrame(ctx, frame);
  syncHud(frame);
  syncOverlay(frame);
  input.jumpPressed = false;
  input.restartPressed = false;

  requestAnimationFrame(loop);
}

function syncHud(frame) {
  healthEl.textContent = `HP ${frame.health}/${frame.maxHealth}`;
  batteriesEl.textContent = `Batteries ${frame.batteryCount}/${frame.batteryTotal}`;
  stageEl.textContent = `${frame.stageName} (${frame.stageIndex}/${frame.stageTotal})`;
  checkpointEl.textContent = `Checkpoint ${frame.checkpoint}`;
  statusEl.textContent = formatStatus(frame);
}

function syncOverlay(frame) {
  if (frame.mode === "playing") {
    overlay.hidden = true;
    return;
  }

  overlay.hidden = false;
  if (frame.mode === "menu") {
    overlayTitle.textContent = "Bionic Grapple Breakout";
    overlayBody.textContent = "Swing through the prison wall line, pump with movement, dodge telegraphed turret fire, and hit checkpoints for instant retries.";
    startButton.textContent = "Start Run";
    return;
  }

  if (frame.mode === "win") {
    overlayTitle.textContent = "Wall Line Breached";
    overlayBody.textContent = "All batteries secured. Press R or tap Start Run to launch a fresh breakout.";
    startButton.textContent = "Restart Run";
    return;
  }

  overlayTitle.textContent = "Runner Down";
  overlayBody.textContent = "Press R for a checkpoint retry or tap Start Run to relaunch from the first checkpoint.";
  startButton.textContent = "Full Restart";
}

function formatStatus(frame) {
  const message = stringifyStatus(frame.message);

  if (frame.mode === "menu") {
    return "Latch to anchors. Clear the wall line.";
  }

  if (frame.mode === "win") {
    return "Run clear. Tap restart for a fresh route.";
  }

  if (frame.mode === "down") {
    return "Checkpoint retry ready on R.";
  }

  if (frame.batteriesRemaining > 0 && frame.stageIndex >= 5 && frame.batteryGuide) {
    const direction = frame.batteryGuide.x >= frame.player.x ? "right" : "left";
    return `${frame.batteriesRemaining} cells left. Sweep ${direction} toward the guide beacon.`;
  }

  return message || "Keep the route moving.";
}

function stringifyStatus(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.text === "string" && value.text.trim()) {
    return value.text.trim();
  }
  if (typeof value.label === "string" && value.label.trim()) {
    return value.label.trim();
  }
  if (typeof value.title === "string" && value.title.trim()) {
    return value.title.trim();
  }
  if (Array.isArray(value)) {
    return value.map(stringifyStatus).filter(Boolean).join(" ");
  }

  return Object.values(value)
    .map(stringifyStatus)
    .filter(Boolean)
    .join(" ");
}

function createInput() {
  const state = {
    left: false,
    right: false,
    jumpPressed: false,
    restartPressed: false,
    grappleHeld: false,
    aimScreenX: 640,
    aimScreenY: 260,
  };

  const updatePointerAim = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    state.aimScreenX = (event.clientX - rect.left) * scaleX;
    state.aimScreenY = (event.clientY - rect.top) * scaleY;
  };

  const setKey = (code, pressed) => {
    if (code === "ArrowLeft" || code === "KeyA") {
      state.left = pressed;
    }
    if (code === "ArrowRight" || code === "KeyD") {
      state.right = pressed;
    }
    if (code === "Space" && pressed) {
      state.jumpPressed = true;
    }
    if (code === "KeyE") {
      state.grappleHeld = pressed;
    }
    if (code === "KeyR" && pressed) {
      state.restartPressed = true;
    }
    if (code === "Enter" && pressed) {
      audio.unlock();
      game.start();
    }
  };

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    audio.unlock();
    setKey(event.code, true);
  });

  window.addEventListener("keyup", (event) => {
    setKey(event.code, false);
  });

  canvas.addEventListener("pointermove", updatePointerAim);

  canvas.addEventListener("pointerdown", (event) => {
    updatePointerAim(event);
    audio.unlock();
    state.grappleHeld = true;
    game.start();
  });

  window.addEventListener("pointerup", () => {
    state.grappleHeld = false;
  });

  startButton.addEventListener("click", () => {
    audio.unlock();
    if (game.getFrameState().mode === "menu") {
      game.start();
    } else {
      game.restart(true);
    }
  });

  return state;
}

resize();
syncHud(game.getFrameState());
syncOverlay(game.getFrameState());
window.addEventListener("resize", resize);
requestAnimationFrame(loop);
