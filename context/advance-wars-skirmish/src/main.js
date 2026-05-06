import { GRID_HEIGHT, GRID_WIDTH } from "./data.js";
import { Game } from "./Game.js";
import { createLayout } from "./render.js";

const canvas = document.getElementById("battle-canvas");
const ctx = canvas.getContext("2d");
const game = new Game();

const menuPanel = document.getElementById("menu-panel");
const hud = document.getElementById("hud");
const statePanel = document.getElementById("state-panel");
const helpPanel = document.getElementById("help-panel");
const endPanel = document.getElementById("end-panel");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const helpButton = document.getElementById("help-button");
const closeHelpButton = document.getElementById("close-help-button");
const selectButton = document.getElementById("select-button");
const moveButton = document.getElementById("move-button");
const attackButton = document.getElementById("attack-button");
const captureButton = document.getElementById("capture-button");
const clearButton = document.getElementById("clear-button");
const endTurnButton = document.getElementById("end-turn-button");

const turnValue = document.getElementById("turn-value");
const fundsValue = document.getElementById("funds-value");
const selectedValue = document.getElementById("selected-value");
const objectiveValue = document.getElementById("objective-value");
const actionCopy = document.getElementById("action-copy");
const contextCopy = document.getElementById("context-copy");
const nextStepTitle = document.getElementById("next-step-title");
const nextStepCopy = document.getElementById("next-step-copy");
const turnSummaryTitle = document.getElementById("turn-summary-title");
const turnSummaryCopy = document.getElementById("turn-summary-copy");
const cursorIntelTitle = document.getElementById("cursor-intel-title");
const cursorIntelCopy = document.getElementById("cursor-intel-copy");
const cursorIntelDetail = document.getElementById("cursor-intel-detail");
const openingBrief = document.getElementById("opening-brief");
const openingBriefTitle = document.getElementById("opening-brief-title");
const openingBriefCopy = document.getElementById("opening-brief-copy");
const openingBriefTags = document.getElementById("opening-brief-tags");
const openingBriefSteps = document.getElementById("opening-brief-steps");
const openingBriefRoles = document.getElementById("opening-brief-roles");
const endTitle = document.getElementById("end-title");
const endCopy = document.getElementById("end-copy");
const endEyebrow = document.getElementById("end-eyebrow");
const autoStart = new URLSearchParams(window.location.search).get("autostart") === "1";
let helpVisible = false;
const actionButtons = [
  { key: "select", element: selectButton, label: "Select" },
  { key: "move", element: moveButton, label: "Move" },
  { key: "attack", element: attackButton, label: "Attack" },
  { key: "capture", element: captureButton, label: "Capture" },
  { key: "clear", element: clearButton, label: "Clear" },
  { key: "end", element: endTurnButton, label: "End turn" },
];

function setStatePanelVisible(visible) {
  statePanel.classList.toggle("is-suppressed", !visible);
  statePanel.setAttribute("aria-hidden", visible ? "false" : "true");
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  game.resize(canvas.width, canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function showPlay() {
  menuPanel.classList.remove("is-visible");
  hud.classList.add("is-visible");
  statePanel.classList.add("is-visible");
  setStatePanelVisible(true);
  hideHelp();
}

function showEnd(status, message) {
  endPanel.classList.add("is-visible");
  endPanel.setAttribute("aria-hidden", "false");
  endEyebrow.textContent = status === "win" ? "victory" : "defeat";
  endTitle.textContent = status === "win" ? "Victory" : "Defeat";
  endCopy.textContent = message;
}

function hideEnd() {
  endPanel.classList.remove("is-visible");
  endPanel.setAttribute("aria-hidden", "true");
}

function showHelp() {
  if (game.getFrameState().status !== "play") return;
  helpVisible = true;
  helpPanel.classList.add("is-visible");
  helpPanel.setAttribute("aria-hidden", "false");
  helpButton.setAttribute("aria-expanded", "true");
}

function hideHelp() {
  helpVisible = false;
  helpPanel.classList.remove("is-visible");
  helpPanel.setAttribute("aria-hidden", "true");
  helpButton.setAttribute("aria-expanded", "false");
}

function toggleHelp() {
  if (helpVisible) {
    hideHelp();
    return;
  }
  showHelp();
}

function refreshHud(state) {
  turnValue.textContent = String(state.turn);
  fundsValue.textContent = String(state.funds);
  selectedValue.textContent = state.selectedUnit ? `${state.selectedUnit.type} (${state.selectedUnit.hp})` : "None";
  objectiveValue.textContent = state.objective;
  actionCopy.textContent = state.message;
  nextStepTitle.textContent = state.guide.title;
  nextStepCopy.textContent = state.guide.body;
  turnSummaryTitle.textContent = state.turnSummary.title;
  turnSummaryCopy.textContent = state.turnSummary.copy;
  cursorIntelTitle.textContent = state.cursorIntel.title;
  cursorIntelCopy.textContent = state.cursorIntel.copy;
  cursorIntelDetail.textContent = state.cursorIntel.detail;
  contextCopy.textContent = state.selectedUnit
    ? `${state.hud.currentTurn}. ${state.selectedUnit.type} HP ${state.selectedUnit.hp}, ammo ${state.selectedUnit.ammo}, fuel ${state.selectedUnit.fuel}. ${state.hud.canCapture ? "Capture ready." : state.selectedUnit.acted ? "Turn spent." : "Move ready."}`
    : `${state.hud.currentTurn}. ${state.objective}`;
  setStatePanelVisible(!state.openingBrief);

  if (state.openingBrief) {
    const visibleSteps = [state.openingBrief.currentStep, state.openingBrief.nextStep].filter(Boolean);
    openingBrief.hidden = false;
    openingBriefTitle.textContent = state.openingBrief.title;
    openingBriefCopy.textContent = state.openingBrief.body;
    openingBriefTags.replaceChildren(
      ...(state.openingBrief.tags ?? []).slice(0, 3).map((tag) => {
        const chip = document.createElement("span");
        chip.className = "opening-tag";
        chip.textContent = tag;
        return chip;
      }),
    );
    openingBriefSteps.replaceChildren(
      ...visibleSteps.map((step) => {
        const card = document.createElement("div");
        card.className = `opening-step${step.state === "current" ? " is-current" : ""}${step.state === "done" ? " is-done" : ""}`;

        const header = document.createElement("div");
        header.className = "opening-step-header";

        const label = document.createElement("span");
        label.className = "opening-step-label";
        label.textContent = step.label;

        const stateTag = document.createElement("span");
        stateTag.className = "opening-step-state";
        stateTag.textContent = step.state === "current" ? "now" : step.state === "pending" ? "next" : step.state;

        const copy = document.createElement("p");
        copy.className = "opening-step-copy";
        copy.textContent = step.copy;

        header.append(label, stateTag);
        card.append(header, copy);
        return card;
      }),
    );
    openingBriefRoles.replaceChildren(
      ...[
        { title: "Why this matters", copy: state.openingBrief.roleReminder },
        { title: "Control hint", copy: state.openingBrief.controlHint },
      ]
        .filter((role) => role.copy)
        .map((role) => {
        const card = document.createElement("div");
        card.className = "opening-role";

        const header = document.createElement("div");
        header.className = "opening-role-header";

        const title = document.createElement("span");
        title.className = "opening-role-title";
        title.textContent = role.title;

        const copy = document.createElement("p");
        copy.className = "opening-role-copy";
        copy.textContent = role.copy;

        header.append(title);
        card.append(header, copy);
        return card;
      }),
    );
  } else {
    openingBrief.hidden = true;
    openingBriefTags.replaceChildren();
    openingBriefSteps.replaceChildren();
    openingBriefRoles.replaceChildren();
  }

  for (const button of actionButtons) {
    const available = state.actions[button.key];
    button.element.disabled = !available;
    button.element.classList.toggle("is-recommended", state.actions.recommended === button.key && available);
    button.element.textContent = button.label;
  }
}

function pointerToGrid(event) {
  const rect = canvas.getBoundingClientRect();
  const layout = createLayout({ width: canvas.width, height: canvas.height });
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const translatedX = (x / rect.width) * canvas.width - layout.boardX;
  const translatedY = (y / rect.height) * canvas.height - layout.boardY;
  return {
    gx: Math.max(0, Math.min(GRID_WIDTH - 1, Math.floor(translatedX / layout.tile))),
    gy: Math.max(0, Math.min(GRID_HEIGHT - 1, Math.floor(translatedY / layout.tile))),
  };
}

canvas.addEventListener("click", (event) => {
  if (game.getFrameState().status !== "play") return;
  const { gx, gy } = pointerToGrid(event);
  game.setCursor(gx, gy);
  game.handleAction("confirm");
});

window.addEventListener("keydown", (event) => {
  if ((event.key === "h" || event.key === "H" || event.key === "?") && game.getFrameState().status === "play") {
    toggleHelp();
    return;
  }
  if (event.key === "Enter") {
    if (game.getFrameState().status === "menu") {
      game.start();
      showPlay();
      hideEnd();
      return;
    }
    game.handleAction("confirm");
  }
  if (event.key === "Escape") {
    if (helpVisible) {
      hideHelp();
      return;
    }
    game.handleAction("clear");
  }
  if (event.key === "r" || event.key === "R") {
    game.restart();
    showPlay();
    hideEnd();
  }
  if (event.key === "ArrowUp") game.moveCursor(0, -1);
  if (event.key === "ArrowDown") game.moveCursor(0, 1);
  if (event.key === "ArrowLeft") game.moveCursor(-1, 0);
  if (event.key === "ArrowRight") game.moveCursor(1, 0);
  if (event.key === "m" || event.key === "M") game.handleAction("move");
  if (event.key === "a" || event.key === "A") game.handleAction("attack");
  if (event.key === "c" || event.key === "C") game.handleAction("capture");
  if (event.key === "e" || event.key === "E") game.handleAction("end");
});

startButton.addEventListener("click", () => {
  game.start();
  showPlay();
  hideEnd();
});

restartButton.addEventListener("click", () => {
  game.restart();
  showPlay();
  hideEnd();
});

helpButton.addEventListener("click", toggleHelp);
closeHelpButton.addEventListener("click", hideHelp);
for (const button of actionButtons) {
  button.element.addEventListener("click", () => {
    if (button.key === "end") {
      game.handleAction("end");
      return;
    }
    game.handleAction(button.key);
  });
}
helpPanel.addEventListener("click", (event) => {
  if (event.target === helpPanel) {
    hideHelp();
  }
});

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt);
  const state = game.getFrameState();
  game.render(ctx);
  refreshHud(state);
  if (state.status === "win" || state.status === "lose") {
    hud.classList.remove("is-visible");
    statePanel.classList.remove("is-visible");
    statePanel.setAttribute("aria-hidden", "true");
    openingBrief.hidden = true;
    hideHelp();
    showEnd(state.status, state.message);
  }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
if (autoStart) {
  game.start();
  showPlay();
  hideEnd();
}
frame(lastTime);
