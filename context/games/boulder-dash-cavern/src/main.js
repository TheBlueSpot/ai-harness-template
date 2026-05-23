import { Game } from "./Game.js";
import { renderGame } from "./render.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const stats = document.getElementById("stats");
const guide = document.getElementById("guide");
const ctx = canvas.getContext("2d");
const game = new Game();

let lastTime = performance.now();

const DIRECTIONS = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 }
};

window.addEventListener("keydown", (event) => {
  if (DIRECTIONS[event.code]) {
    event.preventDefault();
    game.queueMove(DIRECTIONS[event.code]);
  }

  if (event.code === "Enter" || event.code === "Space") {
    event.preventDefault();
    game.confirm();
  }

  if (event.code === "KeyR") {
    event.preventDefault();
    game.requestRestart();
  }
});

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt);
  const state = game.getFrameState();
  renderGame(ctx, state, canvas.width, canvas.height);
  syncHud(state);
  requestAnimationFrame(frame);
}

function syncHud(state) {
  stats.innerHTML = `
    <div class="stat"><span>Phase</span><strong>${state.phase.label}</strong></div>
    <div class="stat"><span>Cavern</span><strong>${state.level}/${state.totalLevels}</strong></div>
    <div class="stat"><span>Score</span><strong>${state.score}</strong></div>
    <div class="stat"><span>Gems Left</span><strong>${state.gemsRemaining}</strong></div>
    <div class="stat"><span>Exit</span><strong>${state.exit.open ? "Open" : "Locked"}</strong></div>
    <div class="stat"><span>Threat</span><strong>${state.threat}</strong></div>
  `;
  guide.innerHTML = `
    <p class="eyebrow">Current Goal</p>
    <h2>${state.objective.title}</h2>
    <p>${state.objective.detail}</p>
    <div class="guide-focus">
      <strong>${state.routeCoach.title}</strong>
      <p>${state.routeCoach.detail}</p>
      <p class="phase-note">Current phase: ${state.phase.label}</p>
    </div>
    <ul class="guide-list">
      ${state.legend.map((item) => `<li>${item}</li>`).join("")}
    </ul>
  `;

  overlay.innerHTML = buildOverlay(state);
  overlay.className = `overlay${state.mode === "playing" ? " hidden" : ""}${state.mode === "ready" ? " ready" : ""}`;
}

function buildOverlay(state) {
  if (state.mode === "menu") {
    return `
      <div class="panel">
        <p class="tag">Menu</p>
        <h2>Route the cave.</h2>
        <p>Every gem opens the exit. Falling rocks crush patrols and careless runs the same way.</p>
        <ul class="checklist">
          <li>Push boulders sideways into open space only.</li>
          <li>Amber shafts show each rock's drop line before you dig under it.</li>
          <li>Patrols follow dug lanes, so leave yourself an escape route.</li>
          <li>Do not tunnel under stacked rocks unless you can clear the drop line.</li>
        </ul>
        <p class="hint">Press Enter or Space to start.</p>
      </div>
    `;
  }

  if (state.mode === "ready") {
    const tips = state.tips.map((tip) => `<li>${tip}</li>`).join("");
    return `
      <div class="panel route-brief">
        <p class="tag">Brief</p>
        <h2>Cavern ${state.level}</h2>
        <p>${state.brief}</p>
        <div class="focus">
          <strong>${state.routeHint?.focus ?? "Route focus"}</strong>
          <p>${state.routeHint?.detail ?? ""}</p>
        </div>
        <ul class="checklist">${tips}</ul>
        <p class="hint">Press Enter or Space to drop in.</p>
      </div>
    `;
  }

  if (state.mode === "win") {
    return `
      <div class="panel">
        <p class="tag">Clear</p>
        <h2>All caverns escaped.</h2>
        <p>${state.message}</p>
        <p class="hint">Press Enter or Space to run again.</p>
      </div>
    `;
  }

  if (state.mode === "lose") {
    return `
      <div class="panel">
        <p class="tag">Down</p>
        <h2>Run collapsed.</h2>
        <p>${state.message}</p>
        <p class="hint">Press Enter, Space, or R to restart.</p>
      </div>
    `;
  }

  return `
      <div class="panel subtle">
      <p class="tag">Live</p>
      <p class="brief">${state.brief}</p>
      <p>${state.message}</p>
      <p class="hint">Amber shafts mark live boulder drop lanes.</p>
    </div>
  `;
}

function labelMode(mode) {
  if (mode === "menu") return "Ready";
  if (mode === "ready") return "Brief";
  if (mode === "win") return "Clear";
  if (mode === "lose") return "Down";
  return "Live";
}

requestAnimationFrame(frame);
