import { loadAssets } from "./assets.js";
import { Pathfinder } from "./Pathfinder.js";
import {
  TOWER_TYPES,
  TOWER_UPGRADES,
  advanceProjectiles,
  canUpgradeTower,
  createTower,
  getTowerDefinition,
  getUpgradeOptions,
  drawProjectiles,
  drawTowers,
  upgradeTower,
  updateTowerFire,
} from "./TowerLogic.js";
import { WaveManager } from "./WaveManager.js";
import {
  createEffects,
  drawEffects,
  spawnHologramPulse,
  spawnBurst,
  spawnShockwave,
  triggerScreenFlash,
  updateEffects,
} from "./effects.js";

const INITIAL_ENERGY = 260;
const DEFAULT_FAST_MULTIPLIER = 2;
const BOARD_ASPECT = 1.65;
const VIEW_WIDTH = 1440;
const VIEW_HEIGHT = 900;
const TOWER_RADIUS = 28;
const TOWER_CLEARANCE = 12;

const app = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const menuScreen = document.getElementById("menu-screen");
const hud = document.getElementById("hud");
const winScreen = document.getElementById("win-screen");
const startButton = document.getElementById("start-button");
const menuRestartButton = document.getElementById("menu-restart-button");
const restartButton = document.getElementById("restart-button");
const winRestartButton = document.getElementById("win-restart-button");
const pauseButton = document.getElementById("pause-button");
const fastToggle = document.getElementById("fast-toggle");
const waveValue = document.getElementById("wave-value");
const waveNameValue = document.getElementById("wave-name-value");
const waveStateValue = document.getElementById("wave-state-value");
const energyValue = document.getElementById("energy-value");
const livesValue = document.getElementById("lives-value");
const countdownValue = document.getElementById("countdown-value");
const bossValue = document.getElementById("boss-value");
const enemyTraitsValue = document.getElementById("enemy-traits-value");
const signalFeedTitle = document.getElementById("signal-feed-title");
const signalFeedBody = document.getElementById("signal-feed-body");
const winWavesValue = document.getElementById("win-waves-value");
const gameoverWavesValue = document.getElementById("gameover-waves-value");
const gameoverScreen = document.getElementById("gameover-screen");
const gameoverRestartButton = document.getElementById("gameover-restart-button");
const selectedTowerTitle = document.getElementById("selected-tower-title");
const selectedTowerRole = document.getElementById("selected-tower-role");
const selectedTowerStats = document.getElementById("selected-tower-stats");
const towerPanel = hud.querySelector(".tower-panel");
const towerUpgradeChoices = document.getElementById("tower-upgrade-choices");
const towerUpgradeNote = document.getElementById("tower-upgrade-note");
const statusMessage = document.createElement("p");
statusMessage.id = "status-message";
statusMessage.className = "hud__notice";
statusMessage.setAttribute("aria-live", "polite");
statusMessage.hidden = true;
hud.insertBefore(statusMessage, hud.querySelector(".hud__bar--bottom"));

const towerButtons = new Map([
  ["splash", document.getElementById("tower-splash")],
  ["slow", document.getElementById("tower-slow")],
  ["burn", document.getElementById("tower-burn")],
  ["needle", document.getElementById("tower-needle")],
  ["relay", document.getElementById("tower-relay")],
  ["disrupt", document.getElementById("tower-disrupt")],
]);

const pathfinder = new Pathfinder({
  width: 900,
  height: 540,
  spawn: { x: 60, y: 270 },
  goal: { x: 840, y: 270 },
  sampleStep: 46,
  margin: 12,
});
const waveManager = new WaveManager({ lives: 10 });

const state = {
  phase: "menu",
  selectedTowerType: "splash",
  selectedTowerId: null,
  fastMode: false,
  energy: INITIAL_ENERGY,
  towers: [],
  projectiles: [],
  impacts: [],
  effects: createEffects(),
  hoverPoint: null,
  layout: {
    originX: 0,
    originY: 0,
    cellSize: 54,
    width: 900,
    height: 540,
  },
  viewWidth: 0,
  viewHeight: 0,
  inputScaleX: 1,
  inputScaleY: 1,
  messageUntil: 0,
  messageTone: "info",
  messageText: "",
  lastFrame: 0,
};

function setPhase(phase) {
  state.phase = phase;
  app.dataset.state = phase;
  menuScreen.setAttribute("aria-hidden", String(phase !== "menu"));
  hud.setAttribute("aria-hidden", String(phase !== "playing" && phase !== "paused"));
  winScreen.setAttribute("aria-hidden", String(phase !== "win"));
  gameoverScreen.setAttribute("aria-hidden", String(phase !== "gameover"));
  pauseButton.textContent = phase === "paused" ? "Resume" : "Pause";
}

function updatePlacementTower(type) {
  state.selectedTowerType = type;
  for (const [towerType, button] of towerButtons) {
    if (!button) {
      continue;
    }
    button.setAttribute("aria-pressed", String(towerType === type));
  }
}

function selectedTower() {
  return state.towers.find((tower) => tower.id === state.selectedTowerId) ?? null;
}

function setSelectedTower(tower) {
  state.selectedTowerId = tower?.id ?? null;
  for (const item of state.towers) {
    item.selected = item.id === state.selectedTowerId;
  }
  renderTowerPanel();
}

function clearTowerSelection() {
  state.selectedTowerId = null;
  for (const item of state.towers) {
    item.selected = false;
  }
  renderTowerPanel();
}

function computeLayout(width, height) {
  const marginX = Math.max(52, Math.floor(width * 0.07));
  const marginTop = Math.max(72, Math.floor(height * 0.09));
  const marginBottom = Math.max(86, Math.floor(height * 0.11));
  const availableWidth = width - marginX * 2;
  const availableHeight = height - marginTop - marginBottom;
  let boardWidth = availableWidth;
  let boardHeight = boardWidth / BOARD_ASPECT;
  if (boardHeight > availableHeight) {
    boardHeight = availableHeight;
    boardWidth = boardHeight * BOARD_ASPECT;
  }
  const originX = Math.floor((width - boardWidth) / 2);
  const originY = Math.floor(Math.max(marginTop, (height - boardHeight) / 2 + 22));
  return {
    originX,
    originY,
    cellSize: Math.max(36, Math.min(68, Math.floor(boardHeight / 10))),
    width: boardWidth,
    height: boardHeight,
    spawn: { x: originX + Math.max(42, boardWidth * 0.06), y: originY + boardHeight * 0.5 },
    goal: { x: originX + boardWidth - Math.max(42, boardWidth * 0.06), y: originY + boardHeight * 0.5 },
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(VIEW_WIDTH * dpr));
  canvas.height = Math.max(1, Math.round(VIEW_HEIGHT * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.viewWidth = VIEW_WIDTH;
  state.viewHeight = VIEW_HEIGHT;
  state.inputScaleX = rect.width > 0 ? VIEW_WIDTH / rect.width : 1;
  state.inputScaleY = rect.height > 0 ? VIEW_HEIGHT / rect.height : 1;
  state.layout = computeLayout(VIEW_WIDTH, VIEW_HEIGHT);
  pathfinder.setWorld({
    width: state.layout.width,
    height: state.layout.height,
    spawn: state.layout.spawn,
    goal: state.layout.goal,
    sampleStep: Math.max(34, Math.floor(state.layout.cellSize * 0.78)),
    margin: TOWER_CLEARANCE,
    layout: state.layout,
  });
  refreshBlockers();
}

function showMessage(text, tone = "info", duration = 1700) {
  state.messageText = text;
  state.messageTone = tone;
  state.messageUntil = performance.now() + duration;
  statusMessage.textContent = text;
  statusMessage.dataset.tone = tone;
  statusMessage.hidden = false;
}

function hideMessageIfExpired(now) {
  if (state.messageUntil && now >= state.messageUntil) {
    state.messageUntil = 0;
    statusMessage.hidden = true;
    statusMessage.textContent = "";
  }
}

function addEnergy(amount, source = "energy") {
  if (!(amount > 0)) {
    return 0;
  }

  state.energy += amount;
  triggerScreenFlash(state.effects, "energy", Math.min(0.55, 0.12 + amount * 0.03));
  if (source === "wave") {
    showMessage(`Wave bonus +${Math.round(amount)} energy`, "success", 1200);
  }

  return amount;
}

function resetRun() {
  state.energy = INITIAL_ENERGY;
  state.towers = [];
  state.projectiles = [];
  state.impacts = [];
  state.effects = createEffects();
  state.hoverPoint = null;
  state.selectedTowerId = null;
  waveManager.reset();
  refreshBlockers();
  updateHud();
  updatePlacementTower(state.selectedTowerType);
  renderTowerPanel();
}

function startRun() {
  resetRun();
  waveManager.start();
  setPhase("playing");
  showMessage("Wave 1 primed", "info");
}

function restartRun() {
  startRun();
}

function goToMenu() {
  resetRun();
  setPhase("menu");
}

function goToWin() {
  triggerScreenFlash(state.effects, "win", 1);
  setPhase("win");
  const info = waveManager.getWaveInfo();
  winWavesValue.textContent = `${info.clearedWaves} / ${info.totalWaves}`;
}

function goToGameOver() {
  triggerScreenFlash(state.effects, "gameOver", 1);
  setPhase("gameover");
  const info = waveManager.getWaveInfo();
  gameoverWavesValue.textContent = `${info.clearedWaves} / ${info.totalWaves}`;
}

function updateHud() {
  const info = waveManager.getWaveInfo();
  waveValue.textContent = `${info.wave} / ${info.totalWaves}`;
  waveNameValue.textContent = info.waveName;
  waveStateValue.textContent = info.waveState === "countdown" ? `Countdown ${info.countdown.toFixed(1)}s` : info.waveState === "complete" ? "Victory path" : info.waveState === "idle" ? "Ready" : "Active";
  energyValue.textContent = String(Math.max(0, Math.floor(state.energy)));
  livesValue.textContent = String(info.lives);
  countdownValue.textContent = info.waveState === "countdown" ? `${Math.max(0, info.countdown).toFixed(1)}s` : "0.0s";
  bossValue.textContent = info.bossActive ? (info.waveState === "countdown" ? "Incoming" : "Live") : info.bossWave ? "Queued" : "None";
  enemyTraitsValue.textContent = (info.enemyTraits && info.enemyTraits.length > 0 ? info.enemyTraits.join(" / ") : "Quiet").slice(0, 36);
  updateSignalFeed(info);
  if (fastToggle) {
    fastToggle.textContent = state.fastMode ? "Fast x2" : "Fast x1";
    fastToggle.setAttribute("aria-pressed", String(state.fastMode));
  }
  pauseButton.textContent = state.phase === "paused" ? "Resume" : "Pause";
  if (gameoverScreen) {
    gameoverScreen.setAttribute("aria-hidden", String(state.phase !== "gameover"));
  }
  renderTowerPanel();
}

function defaultWaveBriefing(info) {
  const threats = info.enemyTraits?.slice(0, 3).join(", ");
  if (info.waveState === "countdown") {
    return info.nextBriefing ?? `Next wave ${info.nextWaveName ?? "broadcast"} is lining up across ${Math.max(1, info.spawnPoints?.length ?? 1)} breach routes.`;
  }

  if (info.bossActive || info.bossWave) {
    return info.briefing ?? `Boss pressure is active. Hold one clean route, strip shields, and answer the focal lane before the next phase wall forms.`;
  }

  if (threats) {
    return info.briefing ?? `Current pressure mix: ${threats}. Keep the center route readable and punish gaps between spawn bursts.`;
  }

  return info.briefing ?? "Routes are stable. Build off the center lane and prepare for split entries.";
}

function updateSignalFeed(info) {
  if (!signalFeedTitle || !signalFeedBody) {
    return;
  }

  if (info.waveState === "countdown") {
    signalFeedTitle.textContent = `Next: ${info.nextWaveName ?? "Complete"}`;
    signalFeedBody.textContent = defaultWaveBriefing(info);
    return;
  }

  signalFeedTitle.textContent = `Wave ${info.wave}: ${info.waveName}`;
  signalFeedBody.textContent = defaultWaveBriefing(info);
}

function currentBlockers() {
  return state.towers.map((tower) => ({
    x: tower.x,
    y: tower.y,
    radius: tower.radius ?? TOWER_RADIUS,
    margin: TOWER_CLEARANCE,
  }));
}

function refreshBlockers() {
  pathfinder.updateBlockers(currentBlockers());
}

function pointInBoard(point) {
  const { originX, originY, width, height } = state.layout;
  return point
    && point.x >= originX + TOWER_RADIUS
    && point.y >= originY + TOWER_RADIUS
    && point.x <= originX + width - TOWER_RADIUS
    && point.y <= originY + height - TOWER_RADIUS;
}

function towerAtPoint(point) {
  return state.towers.find((tower) => Math.hypot(tower.x - point.x, tower.y - point.y) < TOWER_RADIUS * 2 + 8) ?? null;
}

function placementBlocker(point) {
  return {
    x: point.x,
    y: point.y,
    radius: TOWER_RADIUS,
    margin: TOWER_CLEARANCE,
  };
}

function canPlaceAt(point) {
  const definition = TOWER_TYPES[state.selectedTowerType];
  return Boolean(
    pointInBoard(point)
      && definition
      && state.energy >= definition.cost
      && !towerAtPoint(point)
      && pathfinder.canPlaceBlocker(placementBlocker(point)),
  );
}

function placeTowerAt(point) {
  if (!pointInBoard(point)) {
    return;
  }

  if (towerAtPoint(point)) {
    showMessage("Tower field overlaps", "error");
    return;
  }

  const definition = TOWER_TYPES[state.selectedTowerType];
  if (!definition) {
    showMessage("Tower type unavailable", "error");
    return;
  }

  if (state.energy < definition.cost) {
    showMessage("Not enough energy", "error");
    return;
  }

  if (!pathfinder.canPlaceBlocker(placementBlocker(point))) {
    showMessage("Route blocked. Placement rejected.", "error", 2200);
    state.impacts.push({
      x: point.x,
      y: point.y,
      color: "#ff6f7d",
      life: 0.5,
    });
    return;
  }

  const tower = createTower(state.selectedTowerType, point.x, point.y, state.layout);
  tower.radius = TOWER_RADIUS;
  tower.baseType = state.selectedTowerType;
  tower.upgradeStage = 0;
  tower.upgradeBranch = null;
  tower.roleLabel = definition.roleLabel ?? definition.label;
  state.towers.push(tower);
  state.energy -= definition.cost;
  refreshBlockers();
  playPlacementSound();
  spawnBurst(state.effects, { x: tower.x, y: tower.y, color: definition.color, count: 12, speed: 120, life: 0.35, size: 2.4, glow: 0.9 });
  triggerScreenFlash(state.effects, "spawn", 0.5);
  setSelectedTower(tower);
  showMessage(`${definition.label} placed`, "success");
  updateHud();
}

function upgradeTreeForTower(tower) {
  if (!tower) {
    return null;
  }

  return TOWER_UPGRADES[tower.baseType ?? tower.type.split("_")[0]] ?? null;
}

function upgradeChoicesForTower(tower) {
  return getUpgradeOptions(tower);
}

function effectSummary(definition) {
  if (definition.family === "needle") {
    return `Marks targets ${definition.markDuration.toFixed(1)}s`;
  }

  if (definition.family === "relay") {
    return `Scan energy +${definition.scanReward ?? 0}`;
  }

  if (definition.family === "disrupt") {
    return `Shield break ${Math.round(definition.shieldBreak ?? 0)}`;
  }

  if (definition.burnDps) {
    return `Burn ${definition.burnDps.toFixed(0)} DPS`;
  }

  if (definition.slowFactor) {
    return `Slow ${(100 - definition.slowFactor * 100).toFixed(0)}%`;
  }

  return `Blast radius ${definition.impactRadiusCells.toFixed(2)} cells`;
}

function currentTowerStats(tower) {
  const definition = getTowerDefinition(tower?.type ?? state.selectedTowerType);
  return {
    damage: `${Math.round(definition.damage)}`,
    range: `${definition.rangeCells.toFixed(1)} cells`,
    rate: `${definition.fireRate.toFixed(2)}/s`,
    effect: effectSummary(definition),
  };
}

function towerPanelSignature() {
  const tower = selectedTower();
  const energy = Math.max(0, Math.floor(state.energy));
  if (!tower) {
    return `browse|${state.selectedTowerType}|${energy}`;
  }

  const branches = upgradeChoicesForTower(tower)
    .map((branch) => `${branch.id}:${canUpgradeTower(state, tower, branch.id) ? 1 : 0}`)
    .join("|");

  return [
    "tower",
    tower.id,
    tower.type,
    tower.baseType ?? "",
    tower.upgradeStage ?? 0,
    tower.upgradeBranch ?? "",
    tower.roleLabel ?? "",
    energy,
    branches,
  ].join("|");
}

function renderTowerPanel() {
  const signature = towerPanelSignature();
  if (state.towerPanelSignature === signature) {
    return;
  }
  state.towerPanelSignature = signature;

  const tower = selectedTower();
  const isTower = Boolean(tower);
  const baseType = tower?.baseType ?? tower?.type?.split("_")[0] ?? state.selectedTowerType;
  const definition = getTowerDefinition(tower?.type ?? state.selectedTowerType);
  const tree = TOWER_UPGRADES[baseType] ?? null;
  const label = tower ? definition.label : definition.label;

  if (towerPanel) {
    towerPanel.dataset.mode = isTower ? "selected" : "browse";
  }

  if (selectedTowerTitle) {
    selectedTowerTitle.textContent = label;
  }

  if (selectedTowerRole) {
    selectedTowerRole.textContent = tower ? (tower.roleLabel ?? definition.roleLabel ?? definition.label) : (definition.roleLabel ?? definition.label);
  }

  if (selectedTowerStats) {
    selectedTowerStats.innerHTML = "";
    const stats = tower ? currentTowerStats(tower) : currentTowerStats({ type: state.selectedTowerType });
    for (const [key, value] of Object.entries(stats)) {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value;
      wrap.append(dt, dd);
      selectedTowerStats.append(wrap);
    }
  }

  if (towerUpgradeChoices) {
    towerUpgradeChoices.innerHTML = "";
    const branches = upgradeChoicesForTower(tower);
    if (isTower && branches.length === 0) {
      const done = document.createElement("button");
      done.type = "button";
      done.disabled = true;
      done.innerHTML = "<strong>Max role</strong><span>Final form reached.</span>";
      towerUpgradeChoices.append(done);
    } else if (isTower) {
      for (const branch of branches) {
        const upgradeDefinition = branch.definition ?? getTowerDefinition(branch.type);
        const button = document.createElement("button");
        button.type = "button";
        button.disabled = !canUpgradeTower(state, tower, branch.id);
        button.innerHTML = `
          <strong>${branch.label}</strong>
          <span>Cost ${branch.cost} energy</span>
          <span>${branch.finalRole}</span>
          <span>D ${Math.round(upgradeDefinition.damage)} / R ${upgradeDefinition.rangeCells.toFixed(1)}</span>
          <span>${effectSummary(upgradeDefinition)}</span>
        `;
        button.addEventListener("click", () => applyTowerUpgrade(tower, branch));
        towerUpgradeChoices.append(button);
      }
    }
  }

  if (towerUpgradeNote) {
    if (!isTower) {
      towerUpgradeNote.textContent = tree ? `Place ${tree.label} towers to unlock branches.` : "Place a tower to inspect upgrade paths.";
    } else if (upgradeChoicesForTower(tower).length === 0) {
      towerUpgradeNote.textContent = "This tower is at its final role.";
    } else {
      towerUpgradeNote.textContent = "Choose a branch. Disabled buttons mean energy is short.";
    }
  }
}

function applyTowerUpgrade(tower, branch) {
  if (!tower || !branch) {
    return;
  }

  if (!canUpgradeTower(state, tower, branch.id)) {
    showMessage("Not enough energy", "error");
    triggerScreenFlash(state.effects, "damage", 0.15);
    return;
  }

  const result = upgradeTower(state, tower, branch.id);
  if (!result) {
    showMessage("Upgrade failed", "error");
    return;
  }

  const nextDefinition = result.definition;
  triggerScreenFlash(state.effects, "upgrade", 0.65);
  spawnBurst(state.effects, { x: tower.x, y: tower.y, color: nextDefinition.color, count: 16, speed: 150, life: 0.4, size: 2.8, glow: 1, ring: true });
  spawnShockwave(state.effects, { x: tower.x, y: tower.y, color: nextDefinition.color, radius: TOWER_RADIUS + 10, life: 0.45 });
  showMessage(`${branch.finalRole} online`, "success");
  updateHud();
}

function playPlacementSound() {
  if (!assets?.place) {
    return;
  }

  const sound = assets.place.cloneNode();
  sound.volume = 0.55;
  void sound.play().catch(() => {});
}

function updatePointerCell(event) {
  const rect = canvas.getBoundingClientRect();
  const point = {
    x: (event.clientX - rect.left) * state.inputScaleX,
    y: (event.clientY - rect.top) * state.inputScaleY,
  };
  state.hoverPoint = pointInBoard(point) ? point : null;
}

function handleBoardClick(event) {
  if (state.phase !== "playing") {
    return;
  }

  updatePointerCell(event);
  if (!state.hoverPoint) {
    return;
  }

  const tower = towerAtPoint(state.hoverPoint);
  if (tower) {
    setSelectedTower(tower);
    return;
  }

  placeTowerAt(state.hoverPoint);
}

function getPathPoints() {
  return pathfinder.findPath(pathfinder.spawn, pathfinder.goalPoint);
}

function getPreviewPaths() {
  if (typeof waveManager.getPreviewPaths === "function") {
    return waveManager.getPreviewPaths(pathfinder);
  }

  const fallbackPath = getPathPoints();
  return fallbackPath.length > 0 ? [{ spawnPoint: "default", spawn: state.layout.spawn, path: fallbackPath }] : [];
}

function drawBackground() {
  const { width, height } = state.viewWidth > 0 ? { width: state.viewWidth, height: state.viewHeight } : canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(4, 13, 24, 1)");
  gradient.addColorStop(1, "rgba(1, 5, 10, 1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "rgba(125, 243, 255, 0.03)";
  for (let x = 0; x < width; x += 56) {
    ctx.fillRect(x, 0, 1, height);
  }
  for (let y = 0; y < height; y += 56) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

function drawBoard() {
  const { originX, originY, cellSize, width, height } = state.layout;
  const previewPaths = getPreviewPaths();
  const start = state.layout.spawn;
  const goal = state.layout.goal;

  ctx.save();
  ctx.fillStyle = "rgba(8, 18, 32, 0.72)";
  ctx.strokeStyle = "rgba(125, 243, 255, 0.2)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(originX - 8, originY - 8, width + 16, height + 16, 18);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(125, 243, 255, 0.12)";
  for (let ring = 1; ring <= 3; ring += 1) {
    const inset = ring * cellSize * 0.9;
    if (inset * 2 >= width || inset * 2 >= height) {
      break;
    }
    ctx.beginPath();
    ctx.roundRect(originX + inset, originY + inset, width - inset * 2, height - inset * 2, 24);
    ctx.stroke();
  }

  if (previewPaths.length > 0) {
    previewPaths.forEach(({ path, spawn }, index) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = index === 0 ? "rgba(125, 243, 255, 0.3)" : "rgba(125, 243, 255, 0.18)";
      ctx.lineWidth = index === 0 ? 5 : 3;
      ctx.setLineDash(index === 0 ? [] : [8, 10]);
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i += 1) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (spawn) {
        ctx.fillStyle = "rgba(125, 243, 255, 0.08)";
        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, cellSize * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  if (start) {
    ctx.save();
    ctx.fillStyle = "rgba(125, 243, 255, 0.12)";
    ctx.beginPath();
    ctx.arc(start.x, start.y, cellSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(125, 243, 255, 0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  if (goal) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 174, 87, 0.12)";
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, cellSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 174, 87, 0.72)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  for (const tower of state.towers) {
    ctx.save();
    ctx.fillStyle = "rgba(8, 18, 32, 0.42)";
    ctx.strokeStyle = TOWER_TYPES[tower.type].color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, TOWER_RADIUS + TOWER_CLEARANCE, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (tower.id === state.selectedTowerId) {
      ctx.strokeStyle = "rgba(125, 243, 255, 0.92)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, TOWER_RADIUS + TOWER_CLEARANCE + 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (tower.upgradeStage > 0) {
      ctx.strokeStyle = "rgba(255, 174, 87, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, TOWER_RADIUS + TOWER_CLEARANCE + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (state.phase === "playing" && state.hoverPoint) {
    const valid = canPlaceAt(state.hoverPoint);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = valid ? "rgba(125, 243, 255, 0.8)" : "rgba(255, 111, 125, 0.95)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(state.hoverPoint.x, state.hoverPoint.y, TOWER_RADIUS + TOWER_CLEARANCE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = valid ? "rgba(125, 243, 255, 0.12)" : "rgba(255, 111, 125, 0.12)";
    ctx.fill();
    ctx.restore();
  }
}

function drawImpacts(dt) {
  for (const impact of state.impacts) {
    impact.life -= dt;
  }
  state.impacts = state.impacts.filter((impact) => impact.life > 0);

  for (const impact of state.impacts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, impact.life / 0.5));
    ctx.strokeStyle = impact.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, 16 + (1 - impact.life / 0.5) * 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function update(dt) {
  if (state.phase !== "playing") {
    updateHud();
    return;
  }

  updateEffects(state.effects, dt);

  const events = waveManager.update(dt, pathfinder);
  const enemies = waveManager.getEnemies();
  if (events.energyGain > 0) {
    addEnergy(events.energyGain, "wave");
  }

  const combatContext = {
    effects: state.effects,
    onEnergyGain: (amount) => addEnergy(amount, "combat"),
  };

  const fired = updateTowerFire(dt, state.towers, enemies, state.layout, combatContext);
  state.projectiles.push(...fired);
  const bursts = advanceProjectiles(dt, state.projectiles, enemies, state.layout, combatContext);
  state.impacts.push(
    ...bursts.map((burst) => ({
      x: burst.x,
      y: burst.y,
      color: burst.color,
      life: 0.22,
    })),
  );
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);

  for (const enemy of events.spawnedEnemies) {
    spawnBurst(state.effects, { x: enemy.x, y: enemy.y, color: enemy.tint, count: enemy.isBoss ? 16 : 8, speed: enemy.isBoss ? 180 : 120, life: enemy.isBoss ? 0.5 : 0.3, size: enemy.isBoss ? 3.2 : 2.4, glow: 0.8, ring: enemy.isBoss });
    if (enemy.isBoss) {
      triggerScreenFlash(state.effects, "boss", 1);
      spawnHologramPulse(state.effects, { x: enemy.x, y: enemy.y, color: enemy.tint, radius: enemy.radius + 18, life: 0.7 });
    }
  }

  for (const enemy of events.destroyedEnemies) {
    spawnBurst(state.effects, { x: enemy.x, y: enemy.y, color: "#ffffff", count: enemy.isBoss ? 20 : 10, speed: enemy.isBoss ? 200 : 140, life: 0.35, size: enemy.isBoss ? 3.4 : 2.5, glow: 0.9, ring: true });
    spawnShockwave(state.effects, { x: enemy.x, y: enemy.y, color: enemy.tint, radius: enemy.radius + 14, life: 0.28 });
    triggerScreenFlash(state.effects, "death", enemy.isBoss ? 0.55 : 0.25);
    if (enemy.isBoss) {
      triggerScreenFlash(state.effects, "boss", 1.2);
      spawnHologramPulse(state.effects, { x: enemy.x, y: enemy.y, color: "#bffcff", radius: enemy.radius + 26, life: 0.8 });
    }
  }

  if (events.bossPulse) {
    const boss = enemies.find((enemy) => enemy.isBoss && !enemy.dead) ?? events.spawnedEnemies.find((enemy) => enemy.isBoss) ?? null;
    if (boss) {
      triggerScreenFlash(state.effects, "disruption", 0.9);
      spawnHologramPulse(state.effects, { x: boss.x, y: boss.y, color: boss.tint, radius: boss.radius + 30, life: 0.45 });
    }
  }

  for (const enemy of events.leakedEnemies) {
    triggerScreenFlash(state.effects, "damage", 0.7);
    spawnBurst(state.effects, { x: enemy.x, y: enemy.y, color: "#ff6f7d", count: 10, speed: 180, life: 0.32, size: 2.8, glow: 0.9, ring: true });
  }

  if (events.waveAdvanced) {
    showMessage(`Wave ${waveManager.getWaveInfo().wave} deployed`, "info");
  }

  if (events.leaked > 0) {
    showMessage("Leak registered", "error");
  }

  updateHud();

  if (waveManager.getWaveInfo().lives <= 0) {
    goToGameOver();
    return;
  }

  if (waveManager.isComplete()) {
    goToWin();
  }
}

function draw(now, dt) {
  hideMessageIfExpired(now);
  drawBackground();
  drawBoard();
  drawImpacts(dt);
  waveManager.draw(ctx, assets);
  drawProjectiles(ctx, state.projectiles);
  drawTowers(ctx, state.towers, state.layout);
  drawEffects(ctx, state.effects, state.viewWidth, state.viewHeight);

  if (state.phase === "paused") {
    ctx.save();
    ctx.fillStyle = "rgba(2, 6, 12, 0.32)";
    ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);
    ctx.restore();
  }
}

function frame(now) {
  const last = state.lastFrame || now;
  const dt = Math.min(0.033, (now - last) / 1000);
  const simDt = dt * (state.fastMode ? DEFAULT_FAST_MULTIPLIER : 1);
  state.lastFrame = now;
  state.lastDt = dt;

  if (state.phase === "playing") {
    update(simDt);
  } else {
    updateHud();
    updateEffects(state.effects, dt);
  }

  draw(now, dt);
  requestAnimationFrame(frame);
}

function togglePause() {
  if (state.phase === "playing") {
    setPhase("paused");
    showMessage("Paused", "info", 900);
  } else if (state.phase === "paused") {
    setPhase("playing");
    showMessage("Resumed", "info", 900);
  }
}

function toggleFastMode() {
  state.fastMode = !state.fastMode;
  showMessage(state.fastMode ? "Fast mode x2" : "Fast mode x1", "info", 900);
  updateHud();
}

function bindEvents() {
  startButton.addEventListener("click", startRun);
  menuRestartButton.addEventListener("click", restartRun);
  restartButton.addEventListener("click", restartRun);
  winRestartButton.addEventListener("click", restartRun);
  gameoverRestartButton.addEventListener("click", restartRun);
  pauseButton.addEventListener("click", togglePause);
  fastToggle.addEventListener("click", toggleFastMode);

  for (const [type, button] of towerButtons) {
    if (!button) {
      continue;
    }
    button.addEventListener("click", () => updatePlacementTower(type));
  }

  canvas.addEventListener("mousemove", updatePointerCell);
  canvas.addEventListener("mouseleave", () => {
    state.hoverPoint = null;
  });
  canvas.addEventListener("click", handleBoardClick);

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.phase === "playing") {
        setPhase("paused");
      } else if (state.phase === "paused") {
        setPhase("playing");
      }
    }

    if (event.key === "1") {
      updatePlacementTower("splash");
    } else if (event.key === "2") {
      updatePlacementTower("slow");
    } else if (event.key === "3") {
      updatePlacementTower("burn");
    } else if (event.key === "4") {
      updatePlacementTower("needle");
    } else if (event.key === "5") {
      updatePlacementTower("relay");
    } else if (event.key === "6") {
      updatePlacementTower("disrupt");
    } else if (event.key === "f") {
      toggleFastMode();
    }

    if (event.key === "r") {
      restartRun();
    }
  });
}

let assets;

async function boot() {
  bindEvents();
  updatePlacementTower("splash");
  resizeCanvas();
  setPhase("menu");

  try {
    assets = await loadAssets();
  } catch (error) {
    console.error(error);
    showMessage("Asset load failed, using vector fallback.", "error", 2600);
  }

  updateHud();
  renderTowerPanel();
  requestAnimationFrame(frame);
}

boot();
