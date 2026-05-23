import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");
const hudLap = document.getElementById("hudLap");
const hudSpeed = document.getElementById("hudSpeed");
const hudTime = document.getElementById("hudTime");
const hudStatus = document.getElementById("hudStatus");

const ctx = canvas.getContext("2d");
const game = new Game();
const input = { left: false, right: false, up: false, down: false };

function resize() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1);
  canvas.width = 1280;
  canvas.height = 720;
  canvas.style.width = `${1280 * scale}px`;
  canvas.style.height = `${720 * scale}px`;
  game.resize({ width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio || 1 });
}

function syncUi(frame) {
  hudLap.textContent = `${frame.lap}/${frame.lapsTotal}`;
  hudSpeed.textContent = `${Math.round(frame.speed)}`;
  hudTime.textContent = formatTime(frame.time);
  hudStatus.textContent = buildStatusText(frame);
  hudStatus.hidden = !frame.message;

  overlay.hidden = frame.mode === "play";
  if (!overlay.hidden) {
    overlayEyebrow.textContent = frame.mode === "menu" ? "Race" : frame.mode === "win" ? "Finish" : "Crash";
    overlayTitle.textContent = frame.mode === "win" ? "Track Cleared" : "Excitebike Trackflow";
    overlayCopy.textContent =
      frame.mode === "menu"
        ? "Hold speed, keep the bike stable, and clear three laps."
        : frame.mode === "win"
          ? "Race complete. Press Start for a fresh run."
          : "Run over. Press Start to restart the course.";
    overlayButton.textContent = frame.mode === "win" ? "Restart" : "Start";
  }
}

function buildStatusText(frame) {
  if (frame.mode !== "play") {
    return frame.mode === "menu" ? "Press Start to race." : frame.message;
  }

  const [upcoming, following] = frame.upcomingFeatures ?? (frame.nextFeature ? [frame.nextFeature] : []);
  if (upcoming && upcoming.distance <= 900) {
    const distance = Math.max(0, Math.round(upcoming.distance));
    if (
      upcoming.label === "triple crest" &&
      following &&
      following.kind === "mud" &&
      following.distance - upcoming.distance <= 700
    ) {
      const followDistance = Math.max(0, Math.round(following.distance - upcoming.distance));
      return `Triple crest in ${distance}m. Stay level, then ease for the soft bend ${followDistance}m after landing.`;
    }
    if (upcoming.kind === "jump") {
      return `${toTitleCase(upcoming.label)} in ${distance}m. Hold Up and tap Left/Right to level the bike.`;
    }
    if (upcoming.kind === "mud") {
      return `${toTitleCase(upcoming.label)} in ${distance}m. Ease off so the rear wheel keeps grip.`;
    }
    if (upcoming.kind === "boost") {
      return `${toTitleCase(upcoming.label)} in ${distance}m. Stay level and cash the straight-line speed.`;
    }
  }

  return frame.message;
}

function toTitleCase(value) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatTime(seconds) {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = (total % 60).toFixed(1).padStart(4, "0");
  return `${mins}:${secs}`;
}

function keyHandler(code, pressed) {
  if (code === "ArrowLeft" || code === "KeyA") input.left = pressed;
  if (code === "ArrowRight" || code === "KeyD") input.right = pressed;
  if (code === "ArrowUp" || code === "KeyW") input.up = pressed;
  if (code === "ArrowDown" || code === "KeyS") input.down = pressed;
  if (pressed && code === "Enter") {
    if (game.getFrameState().mode === "menu") game.start();
    else game.restart(true);
  }
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  keyHandler(event.code, true);
});

window.addEventListener("keyup", (event) => keyHandler(event.code, false));
overlayButton.addEventListener("click", () => {
  if (game.getFrameState().mode === "menu") game.start();
  else game.restart(true);
});

window.addEventListener("blur", () => {
  input.left = input.right = input.up = input.down = false;
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt, input);
  const frame = game.getFrameState();
  renderFrame(ctx, frame);
  syncUi(frame);
  requestAnimationFrame(loop);
}

resize();
syncUi(game.getFrameState());
window.addEventListener("resize", resize);
requestAnimationFrame(loop);
