import { Game } from "./Game.js";
import { HEIGHT, OPERATIONS, TOWER_DEFS, WIDTH } from "./data.js";
import { createAudioEngine } from "./audio.js";
import { renderScene } from "./render.js";

const STORAGE_KEY = "bloons-pop-unlocked-operations";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlayEyebrow");
const overlayTitle = document.getElementById("overlayTitle");
const overlayCopy = document.getElementById("overlayCopy");
const overlayHint = document.getElementById("overlayHint");
const overlayButton = document.getElementById("overlayButton");
const playHint = document.getElementById("playHint");
const playHintPrimary = document.getElementById("playHintPrimary");
const playHintSecondary = document.getElementById("playHintSecondary");
const cashText = document.getElementById("cashText");
const livesText = document.getElementById("livesText");
const waveText = document.getElementById("waveText");
const popsText = document.getElementById("popsText");
const commandTierText = document.getElementById("commandText");
const towerButtons = document.getElementById("towerButtons");
const selectionText = document.getElementById("selectionText");
const upgradeButton = document.getElementById("upgradeButton");
const upgradeText = document.getElementById("upgradeText");
const statusText = document.getElementById("statusText");
const commandStatusText = document.getElementById("commandStatusText");
const intelLabelText = document.getElementById("intelLabelText");
const intelMixText = document.getElementById("intelMixText");
const intelThreatText = document.getElementById("intelThreatText");
const intelGrowthText = document.getElementById("intelGrowthText");
const nextWaveButton = document.getElementById("nextWaveButton");
const speedButton = document.getElementById("speedButton");
const audioButton = document.getElementById("audioButton");
const operationButtons = document.getElementById("operationButtons");
const operationStatusText = document.getElementById("operationStatusText");
const audio = createAudioEngine();
const AUDIO_PROFILE_STORAGE_KEY = "bloons-pop-audio-profile";
const SPEED_INDEX_STORAGE_KEY = "bloons-pop-speed-index";
const DEFAULT_SELECTION_HINT = "Press 1 2 3 to arm a tower, then click grass to place it.";
const DEFAULT_UPGRADE_HINT = "Click a placed tower to inspect its upgrade path, then press U or use Upgrade Tower.";
const DEFAULT_PLAY_HINT_SECONDARY = "1/2/3 towers | tap grass | U upgrade | N launch | F pace";
const LIVE_PLAY_HINT_SUFFIX = "F pace | U inspect";

canvas.width = WIDTH;
canvas.height = HEIGHT;

const game = new Game();
let unlockedOperations = loadUnlockedOperations();
let audioProfileId = loadAudioProfileId();
let speedIndex = loadSpeedIndex();

function loadUnlockedOperations() {
  try {
    const value = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) || "1", 10);
    return clamp(value, 1, OPERATIONS.length);
  } catch {
    return 1;
  }
}

function saveUnlockedOperations() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(unlockedOperations));
  } catch {
    // Storage is optional for direct browser play.
  }
}

function loadAudioProfileId() {
  try {
    return window.localStorage.getItem(AUDIO_PROFILE_STORAGE_KEY) || "full";
  } catch {
    return "full";
  }
}

function saveAudioProfileId(profileId) {
  try {
    window.localStorage.setItem(AUDIO_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // Storage is optional for direct browser play.
  }
}

function loadSpeedIndex() {
  try {
    const value = Number.parseInt(window.localStorage.getItem(SPEED_INDEX_STORAGE_KEY) || "0", 10);
    return clamp(value, 0, 2);
  } catch {
    return 0;
  }
}

function saveSpeedIndex(value) {
  try {
    window.localStorage.setItem(SPEED_INDEX_STORAGE_KEY, String(value));
  } catch {
    // Storage is optional for direct browser play.
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTowerButtons() {
  for (const tower of Object.values(TOWER_DEFS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.towerId = tower.id;
    button.textContent = `${tower.name} ($${tower.cost})`;
    button.addEventListener("click", () => {
      game.selectTower(tower.id);
      syncUi(game.getFrameState());
    });
    towerButtons.appendChild(button);
  }
}

function buildOperationButtons() {
  for (const [index, operation] of OPERATIONS.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.operationIndex = String(index);
    button.addEventListener("click", () => {
      if (index >= unlockedOperations || game.mode === "playing") {
        return;
      }
      game.setOperation(index);
      syncUi(game.getFrameState());
    });
    operationButtons.appendChild(button);
  }
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

function updatePointerPreview(event) {
  const point = canvasPoint(event);
  game.updatePreview(point.x, point.y);
}

function placeFromPointer(event) {
  event.preventDefault();
  const point = canvasPoint(event);
  game.tryPlaceSelectedTower(point.x, point.y);
  syncUi(game.getFrameState());
}

canvas.addEventListener("pointermove", updatePointerPreview);
canvas.addEventListener("pointerdown", placeFromPointer);

overlayButton.addEventListener("click", () => {
  audio.unlock();
  if (game.mode === "menu") {
    game.start();
  } else {
    game.restart();
    game.start();
  }
  syncUi(game.getFrameState());
});

nextWaveButton.addEventListener("click", () => {
  audio.unlock();
  game.requestNextWave();
  syncUi(game.getFrameState());
});

speedButton.addEventListener("click", () => {
  audio.unlock();
  game.toggleSpeed();
  speedIndex = game.speedIndex;
  saveSpeedIndex(speedIndex);
  syncUi(game.getFrameState());
});

audioButton.addEventListener("click", () => {
  audio.unlock();
  const profile = audio.cycleMixProfile();
  audioProfileId = profile.id;
  saveAudioProfileId(audioProfileId);
  syncUi(game.getFrameState());
});

upgradeButton.addEventListener("click", () => {
  audio.unlock();
  game.upgradeSelectedTower();
  syncUi(game.getFrameState());
});

window.addEventListener("keydown", (event) => {
  audio.unlock();
  if (event.repeat) {
    return;
  }
  if (event.code === "Digit1") {
    game.selectTower("dart");
  } else if (event.code === "Digit2") {
    game.selectTower("bomb");
  } else if (event.code === "Digit3") {
    game.selectTower("glue");
  } else if (event.code === "KeyN") {
    game.requestNextWave();
  } else if (event.code === "KeyF") {
    game.toggleSpeed();
    speedIndex = game.speedIndex;
    saveSpeedIndex(speedIndex);
  } else if (event.code === "KeyU") {
    game.upgradeSelectedTower();
  } else if (event.code === "Enter" && game.mode === "menu") {
    game.start();
  } else if (event.code === "Enter" && (game.mode === "win" || game.mode === "lose")) {
    game.restart();
    game.start();
  }
  syncUi(game.getFrameState());
});

function maybeUnlockOperation(state) {
  if (state.mode !== "win") {
    return;
  }
  const nextUnlocked = Math.max(unlockedOperations, state.operationIndex + 2);
  if (nextUnlocked !== unlockedOperations) {
    unlockedOperations = clamp(nextUnlocked, 1, OPERATIONS.length);
    saveUnlockedOperations();
  }
}

function syncOperationButtons(state) {
  const buttons = operationButtons.querySelectorAll("button");
  buttons.forEach((button, index) => {
    const operation = OPERATIONS[index];
    const locked = index >= unlockedOperations;
    button.disabled = locked || state.mode === "playing";
    button.classList.toggle("is-selected", index === state.operationIndex);
    button.classList.toggle("is-locked", locked);
    button.innerHTML = `<strong>${operation.label}</strong><span>${operation.name}</span><small>${locked ? "Locked: clear prior route" : operation.summary}</small>`;
  });

  if (unlockedOperations >= OPERATIONS.length) {
    operationStatusText.textContent = "Full campaign unlocked. Pick any route between runs.";
  } else {
    const clearedOperation = OPERATIONS[Math.max(0, unlockedOperations - 1)];
    const nextOperation = OPERATIONS[unlockedOperations];
    operationStatusText.textContent = clearedOperation && nextOperation
      ? `Clear ${clearedOperation.name} to unlock ${nextOperation.name}.`
      : "Full campaign unlocked. Pick any route between runs.";
  }
}

function summarizeStarterPads(state) {
  if (!Array.isArray(state.starterPads) || state.starterPads.length === 0) {
    return "";
  }
  return state.starterPads.map((pad) => pad.label || "Build").join(", ");
}

function getPlayHintPrimary(state) {
  if (state.mode !== "playing") {
    return "";
  }
  const starterPadSummary = summarizeStarterPads(state);
  const starterPadHint = starterPadSummary ? ` Pads mark ${starterPadSummary}.` : "";
  if (state.waveActive) {
    return state.liveHintPrimary;
  }
  return `Quiet window.${starterPadHint} Build, tap F for pace, or press N to launch ${state.nextWaveLabel}.`;
}

function getPlayHintSecondary(state) {
  if (state.mode === "lose") {
    return state.waveIntel.threat;
  }
  if (state.mode !== "playing") {
    return DEFAULT_PLAY_HINT_SECONDARY;
  }
  if (!state.waveActive) {
    return DEFAULT_PLAY_HINT_SECONDARY;
  }
  return `${state.waveIntel.threat} ${LIVE_PLAY_HINT_SUFFIX}`;
}

function syncUi(state) {
  const profile = audio.getMixProfile();
  const runEnded = state.mode === "lose" || state.mode === "win";
  const inspectTower = state.mode === "playing" ? state.selectedPlacedTower : null;
  maybeUnlockOperation(state);
  cashText.textContent = `$${state.cash}`;
  livesText.textContent = `${state.lives}`;
  waveText.textContent = `${state.waveNumber} / ${state.waveTotal}`;
  popsText.textContent = `${state.pops}`;
  commandTierText.textContent = `T${state.commandTier}`;
  selectionText.textContent = state.mode === "menu" && !inspectTower
    ? DEFAULT_SELECTION_HINT
    : runEnded
      ? state.mode === "lose"
        ? "Retry keeps this route. Rebuild, set pace, and relaunch."
        : "Route clear locked in. Replay this route or pick another unlocked operation."
      : state.preview?.reason || DEFAULT_SELECTION_HINT;
  statusText.textContent = state.status;
  commandStatusText.textContent = state.commandSummary;
  intelLabelText.textContent = state.mode === "lose"
    ? `Route breached: ${state.waveIntel.label}`
    : state.waveActive
      ? `Live wave: ${state.waveIntel.label}`
      : `Up next: ${state.waveIntel.label}`;
  intelMixText.textContent = state.waveIntel.mix;
  intelThreatText.textContent = state.waveIntel.threat;
  intelGrowthText.textContent = state.mode === "lose"
    ? "Retry restarts the same route immediately. Rebuild, set pace, and relaunch."
    : state.nextWaveReady
      ? `${state.nextCommandUnlock} Auto-send in ${state.intermission.toFixed(1)}s.`
      : state.nextCommandUnlock;
  nextWaveButton.disabled = !state.nextWaveReady;
  nextWaveButton.textContent = state.nextWaveReady
    ? `Launch ${state.nextWaveLabel}`
    : state.mode === "playing"
      ? "Wave Active"
      : state.mode === "win"
        ? "Route Cleared"
        : state.mode === "lose"
          ? "Route Breached"
          : "Start Run";
  speedButton.textContent = `Speed ${state.speedLabel}`;
  audioButton.textContent = profile.label;
  syncOperationButtons(state);

  if (inspectTower) {
    const tower = inspectTower;
    selectionText.textContent = `${tower.name} level ${tower.level}/${tower.maxLevel}.`;
    upgradeButton.disabled = !tower.upgradeCost || state.cash < tower.upgradeCost || Boolean(tower.upgradeLockedUntilTier);
    upgradeButton.textContent = tower.upgradeCost
      ? tower.upgradeLockedUntilTier
        ? `Unlocks at T${tower.upgradeLockedUntilTier}`
        : `Upgrade for $${tower.upgradeCost}`
      : "Tower Maxed";
    upgradeText.textContent = tower.upgradeCost
      ? tower.upgradeLockedUntilTier
        ? `${tower.nextUpgradeName} unlocks at Command Tier ${tower.upgradeLockedUntilTier}. ${tower.nextUpgradeSummary}.`
        : `${tower.nextUpgradeName}: ${tower.nextUpgradeSummary}.`
      : "This tower reached final upgrade.";
  } else {
    upgradeButton.disabled = true;
    upgradeButton.textContent = runEnded ? "Upgrade Offline" : "Upgrade Tower";
    upgradeText.textContent = runEnded
      ? state.mode === "lose"
        ? "Restart the route to rebuild, then inspect a placed tower again for upgrade options."
        : "Replay the route to inspect towers again, or switch operations from the route picker."
      : DEFAULT_UPGRADE_HINT;
  }

  const buttons = towerButtons.querySelectorAll("button");
  buttons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.towerId === state.selectedTowerId);
  });

  if (state.overlay) {
    overlay.hidden = false;
    overlayEyebrow.textContent = state.overlay.eyebrow;
    overlayTitle.textContent = state.overlay.title;
    overlayCopy.textContent = state.overlay.copy;
    overlayHint.textContent = state.overlay.hint || "";
    overlayHint.hidden = !state.overlay.hint;
    overlayButton.textContent = state.overlay.button;
    playHintPrimary.textContent = state.mode === "lose" ? `Route breached on ${state.waveIntel.label}.` : "";
    playHintSecondary.textContent = state.mode === "lose" ? state.waveIntel.threat : DEFAULT_PLAY_HINT_SECONDARY;
    playHint.hidden = true;
  } else {
    overlay.hidden = true;
    playHint.hidden = false;
    playHintPrimary.textContent = getPlayHintPrimary(state);
    playHintSecondary.textContent = getPlayHintSecondary(state);
  }
}

buildTowerButtons();
buildOperationButtons();
audio.setMixProfile(audioProfileId);
game.setSpeedIndex(speedIndex);
syncUi(game.getFrameState());

let last = performance.now();
let backgroundPaused = false;

function setBackgroundPaused(paused) {
  backgroundPaused = paused;
  if (!backgroundPaused) {
    last = performance.now();
  }
}

document.addEventListener("visibilitychange", () => {
  setBackgroundPaused(document.hidden);
});

window.addEventListener("blur", () => {
  setBackgroundPaused(true);
});

window.addEventListener("focus", () => {
  setBackgroundPaused(document.hidden);
});

function frame(now) {
  if (backgroundPaused) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  audio.playEvents(game.consumeAudioEvents());
  const state = game.getFrameState();
  audio.syncMusic(state);
  renderScene(ctx, state);
  syncUi(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
