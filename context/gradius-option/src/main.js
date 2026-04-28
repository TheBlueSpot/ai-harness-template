import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("gameCanvas");
const hud = document.getElementById("hud");
const hudScore = document.getElementById("hudScore");
const hudLives = document.getElementById("hudLives");
const hudShield = document.getElementById("hudShield");
const hudBoss = document.getElementById("hudBoss");
const hudWeapon = document.getElementById("hudWeapon");
const powerBar = document.getElementById("powerBar");
const powerBarHint = document.getElementById("powerBarHint");
const hudAlert = document.getElementById("hudAlert");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayButton = document.getElementById("overlayButton");

if (!canvas || !hud || !powerBar || !overlayButton) {
  throw new Error("Missing shell elements");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas context unavailable");
}

const game = new Game();
const input = {
  held: Object.create(null),
  pressed: Object.create(null),
};

function resizeCanvas() {
  const width = Math.max(320, Math.floor(window.innerWidth));
  const height = Math.max(240, Math.floor(window.innerHeight));
  const scale = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (typeof game.resize === "function") {
    game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
  }
}

function press(code) {
  input.pressed[code] = true;
}

window.addEventListener("keydown", (event) => {
  input.held[event.code] = true;
  if (!event.repeat) {
    press(event.code);
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  input.held[event.code] = false;
});

window.addEventListener("blur", () => {
  input.held = Object.create(null);
  input.pressed = Object.create(null);
});

overlayButton.addEventListener("click", () => {
  press("Enter");
});

function syncHud(frameState) {
  hudScore.textContent = String(frameState.score ?? 0);
  hudLives.textContent = String(frameState.lives ?? 0);
  hudShield.textContent = `${Math.max(0, Math.round(frameState.shield ?? 0))}%`;
  hudBoss.textContent = frameState.bossState ?? frameState.bossStatus ?? "Idle";
  hudWeapon.textContent = frameState.weaponState ?? frameState.weapon ?? "Normal";

  const powerIndex = Math.max(0, Math.min(6, Math.round(frameState.powerBarIndex ?? 0)));
  powerBar.dataset.active = String(powerIndex);
  powerBar.style.setProperty("--active", String(powerIndex));
  powerBar.setAttribute("aria-valuenow", String(powerIndex));
  powerBarHint.textContent = frameState.powerBarLabel ?? (frameState.powerBarReady ? "Ready" : "Charging");

  const alertText = frameState.alert || frameState.bossAlert || "";
  hudAlert.textContent = alertText;
  hudAlert.hidden = !alertText;

  const mode = frameState.mode ?? "menu";
  hud.dataset.mode = mode;
  overlay.hidden = mode === "play";
  if (!overlay.hidden) {
    overlayEyebrow.textContent = frameState.overlayEyebrow ?? "Mission";
    overlayTitle.textContent = frameState.overlayTitle ?? "Gradius Option-Drive";
    overlayCopy.textContent =
      frameState.overlayCopy ??
      (mode === "gameover"
        ? "Ship lost. Press Start to restart."
        : mode === "clear"
          ? "Boss down. Press Start to run again."
          : "Press Start to launch.");
    overlayButton.textContent = frameState.overlayButton ?? "Start";
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt, input);
  renderGame(ctx, game.getFrameState());
  syncHud(game.getFrameState());
  input.pressed = Object.create(null);
  requestAnimationFrame(frame);
}

resizeCanvas();
syncHud(game.getFrameState());
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(frame);
