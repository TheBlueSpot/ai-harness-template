import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const game = new Game();

const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  flap: false,
  surge: false,
  startPressed: false,
  restartPressed: false,
};

const keyMap = new Map([
  ["arrowleft", "left"],
  ["a", "left"],
  ["arrowright", "right"],
  ["d", "right"],
  ["arrowup", "up"],
  ["w", "up"],
  ["arrowdown", "down"],
  ["s", "down"],
  [" ", "flap"],
  ["shift", "surge"],
]);

function setOverlay(mode, frame) {
  if (mode === "menu") {
    overlay.className = "overlay visible";
    overlay.innerHTML = `
      <div class="card">
        <p class="eyebrow">Sky Circuit</p>
        <h1>Joust Sky Lances</h1>
        <p>Float above riders, win the lance clash from the high angle, and steal every loose egg before a fresh rider hatches back in.</p>
        <ul>
          <li>Clear four waves of hover-lift duels.</li>
          <li>React to red dive tells near the rider, not the HUD edge.</li>
          <li>Press <strong>Enter</strong> to start. Press <strong>R</strong> any time to reset.</li>
        </ul>
      </div>
    `;
    return;
  }

  if (mode === "win" || mode === "lose") {
    overlay.className = "overlay visible";
    overlay.innerHTML = `
      <div class="card">
        <p class="eyebrow">${mode === "win" ? "Circuit Cleared" : "Knight Down"}</p>
        <h1>${mode === "win" ? "Every Nest Denied" : "The Flock Regroups"}</h1>
        <p>Score ${frame.player.score}. Eggs saved ${frame.player.eggsSaved}. Best ${frame.best}.</p>
        <ul>
          <li>${mode === "win" ? "You kept the sky lane clean through all four waves." : "One more bad angle ended the run. Retry is instant."}</li>
          <li>Press <strong>Enter</strong> to run again.</li>
        </ul>
      </div>
    `;
    return;
  }

  overlay.className = "overlay";
  overlay.innerHTML = "";
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "enter") {
    input.startPressed = true;
  }
  if (key === "r") {
    input.restartPressed = true;
  }
  const mapped = keyMap.get(key);
  if (mapped) {
    input[mapped] = true;
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  const mapped = keyMap.get(key);
  if (mapped) {
    input[mapped] = false;
    event.preventDefault();
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  game.update(dt, input);
  const state = game.getFrameState();
  renderGame(ctx, state);
  setOverlay(state.mode, state);
  input.startPressed = false;
  input.restartPressed = false;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
