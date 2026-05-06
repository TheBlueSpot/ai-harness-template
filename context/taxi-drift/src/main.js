import { Game } from "./Game.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const fareStatus = document.getElementById("fare-status");
const ctx = canvas.getContext("2d");
const game = new Game();
const autostart = new URLSearchParams(window.location.search).get("autostart") === "1";

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  drift: false,
  confirmPressed: false,
  restartPressed: false,
};

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(960, Math.round(rect.width * dpr));
  canvas.height = Math.max(540, Math.round(rect.height * dpr));
  game.resize(canvas.width, canvas.height);
}

function syncHud(frame) {
  const activeFare = frame.activeFare;
  if (!activeFare) {
    fareStatus.textContent = frame.mode === "playing" ? "Dispatching next fare" : "Shift paused";
    return;
  }
  const approach = activeFare.pickedUp ? activeFare.dropoffApproach : activeFare.pickupApproach;
  const suffix = approach?.insidePreview
    ? approach.speedReady
      ? " | ready"
      : " | slow down"
    : "";
  fareStatus.textContent = activeFare.pickedUp
    ? `${activeFare.pickup.label} -> ${activeFare.dropoff.label}${suffix}`
    : `Pickup ${activeFare.pickup.label}${suffix}`;
}

function syncOverlay(frame) {
  if (!frame.overlay) {
    overlay.innerHTML = "";
    overlay.classList.remove("is-active");
    return;
  }
  overlay.classList.add("is-active");
  overlay.innerHTML = `
    <button class="overlay-action" type="button">${frame.overlay.action}</button>
  `;
}

function keyState(event, pressed) {
  const key = event.key.toLowerCase();
  if (key === "arrowup" || key === "w") input.up = pressed;
  if (key === "arrowdown" || key === "s") input.down = pressed;
  if (key === "arrowleft" || key === "a") input.left = pressed;
  if (key === "arrowright" || key === "d") input.right = pressed;
  if (key === " " || key === "shift") input.drift = pressed;

  if (pressed && (key === "enter" || key === " ")) {
    input.confirmPressed = true;
  }
  if (pressed && key === "r") {
    input.restartPressed = true;
  }
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  keyState(event, true);
});

window.addEventListener("keyup", (event) => keyState(event, false));
window.addEventListener("resize", resize);

overlay.addEventListener("click", () => {
  input.confirmPressed = true;
});

resize();
if (autostart) {
  game.restart();
}

let previous = performance.now();
function loop(now) {
  const dt = (now - previous) / 1000;
  previous = now;
  game.update(dt, input);
  const frame = game.getFrameState();
  game.render(ctx);
  syncHud(frame);
  syncOverlay(frame);
  input.confirmPressed = false;
  input.restartPressed = false;
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
