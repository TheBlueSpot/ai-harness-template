const TILE = {
  WALL: "#",
  FLOOR: ".",
  TARGET: "T",
  DOOR: "E",
  PLAYER: "P",
  CRATE: "C",
  CRATE_ON_TARGET: "O",
  PLAYER_ON_TARGET: "Q",
  SWITCH: "B",
  GATE: "G",
  CRATE_ON_SWITCH: "K",
  PLAYER_ON_SWITCH: "V",
  WARP_A: "1",
  WARP_B: "2",
};

const LEVELS = [
  {
    name: "Entry Bay",
    focus: "Socket Route",
    tip: "Push the nearest power cell onto the glowing socket first. The open route is directly beside you.",
    rows: [
      "#########",
      "#.......#",
      "#.T.C...#",
      "#...P...#",
      "#...E...#",
      "#.......#",
      "#########",
    ],
  },
  {
    name: "Security Hall",
    focus: "Lane Order",
    tip: "Use the side corridor to get behind each cell. If you shove one into the corner, undo immediately.",
    rows: [
      "##########",
      "#..T.....#",
      "#..C..##.#",
      "#.##.....#",
      "#.P..C.TE#",
      "#........#",
      "##########",
    ],
  },
  {
    name: "Mirror Vault",
    focus: "Pocket Solve",
    tip: "One target sits deep in the pocket. Solve that lane before the center route closes.",
    rows: [
      "###########",
      "#.........#",
      "#.C..T....#",
      "#.........#",
      "#...###...#",
      "#...P..C..#",
      "#.....T..E#",
      "#.........#",
      "###########",
    ],
  },
  {
    name: "Core Safe",
    focus: "Multi-Crate Route",
    tip: "The vault door is already visible, but the central crate will block the final line if you solve the wrong side first.",
    rows: [
      "###########",
      "#....T....#",
      "#..C......#",
      "#..###....#",
      "#..P..C.TE#",
      "#.........#",
      "###########",
    ],
  },
  {
    name: "Relay Lock",
    focus: "Relay Intro",
    tip: "Blue floor switches hold the gate open. Park a spare cell on one switch so the rest of the route stays live.",
    rows: [
      "############",
      "#..........#",
      "#.P.CBGT.E.#",
      "#...##.##..#",
      "#.....C....#",
      "#..T....T..#",
      "#.....C....#",
      "#..........#",
      "############",
    ],
  },
  {
    name: "Split Current",
    focus: "Relay Staging",
    tip: "Thread one crate onto a switch, then route the other two through the reopened lane before you commit the final socket.",
    rows: [
      "############",
      "#....#.....#",
      "#.P.CBGT.E.#",
      "#.#.###.#..#",
      "#.#C..C.#..#",
      "#.#.###.#..#",
      "#...T..T#..#",
      "############",
    ],
  },
  {
    name: "Vault Crown",
    focus: "Final Relay",
    tip: "The last floor wants a relay: dedicate one cell to the switch, solve the right wing, then thread the crown route without sealing yourself in.",
    rows: [
      "############",
      "#..T....E..#",
      "#.P.CBGT...#",
      "#....##....#",
      "#..C....T..#",
      "#....C.....#",
      "#..........#",
      "############",
    ],
  },
  {
    name: "Transit Loom",
    focus: "Warp Pads",
    tip: "Warp pads only move you, not the cells. Use them to get behind the upper crate before you solve the lower socket lane.",
    rows: [
      "############",
      "#..1....T..#",
      "#.###.###..#",
      "#.C.....#..#",
      "#.###.###..#",
      "#.P...C..E.#",
      "#..T....2..#",
      "############",
    ],
  },
  {
    name: "Relay Exchange",
    focus: "Warp Relay",
    tip: "Stage one cell onto the relay, then warp back across the chamber to route the second cell through the shutter lane.",
    rows: [
      "#############",
      "#..1..T.....#",
      "#.###G###...#",
      "#.C..B..#E..#",
      "#.###.###...#",
      "#.P....C.2T.#",
      "#...........#",
      "#############",
    ],
  },
  {
    name: "Crown Transit",
    focus: "Warp Finale",
    tip: "The finale blends both systems. Lock the relay first, then use the warp loop to reach the far side without ruining the crown route.",
    rows: [
      "##############",
      "#..1....T....#",
      "#.###G##.###.#",
      "#.C..B...#E#.#",
      "#.###.##.#.#.#",
      "#.P....C.2.T.#",
      "#............#",
      "##############",
    ],
  },
];

const STORY_BEATS = [
  "Rookie route. Learn the shove, watch the socket, leave no crate stranded.",
  "Security wakes up. The vault starts asking for lane order, not raw movement.",
  "Split paths appear. Solve the deep pocket before the center collapses.",
  "The core vault mixes every lane you know so far into one tight final shove.",
  "Relay tech comes online. Switches open heavy shutters, but only while something keeps pressure on them.",
  "Now the room forks. You need a staged relay and two clean scoring routes.",
  "The crown vault combines targets, shutters, and relay parking into one long-form breach.",
  "Transit pads arrive. They extend the route length without hiding the core sokoban logic.",
  "Now the vault wants both systems at once: relay parking plus warp repositioning.",
  "The crown transit floor turns the whole breach into a longer final exam.",
];

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const stageValue = document.querySelector("#stage-value");
const stepValue = document.querySelector("#step-value");
const pushValue = document.querySelector("#push-value");
const socketValue = document.querySelector("#socket-value");
const switchValue = document.querySelector("#switch-value");
const focusValue = document.querySelector("#focus-value");
const briefText = document.querySelector("#brief-text");
const focusText = document.querySelector("#focus-text");
const stageList = document.querySelector("#stage-list");

const overlay = document.querySelector("#overlay");
const overlayKicker = document.querySelector("#overlay-kicker");
const overlayTitle = document.querySelector("#overlay-title");
const overlayBody = document.querySelector("#overlay-body");
const overlayButton = document.querySelector("#overlay-button");

const state = {
  levelIndex: 0,
  level: null,
  steps: 0,
  pushes: 0,
  solved: false,
  win: false,
  history: [],
  messageTimer: 0,
  bannerText: "",
  bannerTone: "danger",
};

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function parseLevel(levelIndex) {
  const level = LEVELS[levelIndex];
  const grid = level.rows.map((row) => row.split(""));
  let player = { x: 0, y: 0 };

  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === TILE.PLAYER) {
        player = { x, y };
        grid[y][x] = TILE.FLOOR;
      } else if (grid[y][x] === TILE.PLAYER_ON_TARGET) {
        player = { x, y };
        grid[y][x] = TILE.TARGET;
      } else if (grid[y][x] === TILE.PLAYER_ON_SWITCH) {
        player = { x, y };
        grid[y][x] = TILE.SWITCH;
      }
    }
  }

  return {
    name: level.name,
    focus: level.focus,
    tip: level.tip,
    grid,
    player,
  };
}

function currentCell(x, y) {
  return state.level.grid[y]?.[x] ?? TILE.WALL;
}

function setCell(x, y, value) {
  state.level.grid[y][x] = value;
}

function isSwitchPressedCell(cell) {
  return cell === TILE.CRATE_ON_SWITCH;
}

function isAnySwitchPressed() {
  for (const row of state.level.grid) {
    for (const cell of row) {
      if (isSwitchPressedCell(cell)) {
        return true;
      }
    }
  }
  const { x, y } = state.level.player;
  return currentCell(x, y) === TILE.SWITCH;
}

function hasWarpPads() {
  for (const row of state.level.grid) {
    for (const cell of row) {
      if (cell === TILE.WARP_A || cell === TILE.WARP_B) {
        return true;
      }
    }
  }
  return false;
}

function isWalkable(cell) {
  if ([TILE.FLOOR, TILE.TARGET, TILE.SWITCH, TILE.DOOR, TILE.WARP_A, TILE.WARP_B].includes(cell)) {
    return true;
  }
  if (cell === TILE.GATE) {
    return isAnySwitchPressed();
  }
  return false;
}

function setBanner(text, tone = "danger", duration = 1.8) {
  state.bannerText = text;
  state.bannerTone = tone;
  state.messageTimer = duration;
}

function loadLevel(levelIndex) {
  state.levelIndex = levelIndex;
  state.level = parseLevel(levelIndex);
  state.steps = 0;
  state.pushes = 0;
  state.solved = false;
  state.history = [];
  setBanner(`Floor ${levelIndex + 1} online.`, "info", 2.2);
  updateHud();
}

function countTargets() {
  let total = 0;
  let filled = 0;
  for (const row of state.level.grid) {
    for (const cell of row) {
      if (cell === TILE.TARGET || cell === TILE.CRATE_ON_TARGET) {
        total += 1;
      }
      if (cell === TILE.CRATE_ON_TARGET) {
        filled += 1;
      }
    }
  }
  return { total, filled };
}

function countSwitches() {
  let total = 0;
  let active = 0;

  for (const row of state.level.grid) {
    for (const cell of row) {
      if (cell === TILE.SWITCH || cell === TILE.CRATE_ON_SWITCH) {
        total += 1;
      }
      if (cell === TILE.CRATE_ON_SWITCH) {
        active += 1;
      }
    }
  }

  if (currentCell(state.level.player.x, state.level.player.y) === TILE.SWITCH) {
    active += 1;
  }

  return { total, active };
}

function canExit() {
  const { total, filled } = countTargets();
  return total > 0 && total === filled;
}

function saveSnapshot() {
  state.history.push({
    grid: cloneGrid(state.level.grid),
    player: { ...state.level.player },
    steps: state.steps,
    pushes: state.pushes,
    bannerText: state.bannerText,
    bannerTone: state.bannerTone,
    messageTimer: state.messageTimer,
  });
  if (state.history.length > 160) {
    state.history.shift();
  }
}

function undoMove() {
  const snapshot = state.history.pop();
  if (!snapshot || state.win || overlay.hidden === false) {
    return;
  }

  state.level.grid = snapshot.grid;
  state.level.player = snapshot.player;
  state.steps = snapshot.steps;
  state.pushes = snapshot.pushes;
  state.bannerText = snapshot.bannerText;
  state.bannerTone = snapshot.bannerTone;
  state.messageTimer = snapshot.messageTimer;
  updateHud();
}

function clearStandingCell(x, y) {
  const standingCell = currentCell(x, y);
  if (
    [TILE.SWITCH, TILE.TARGET, TILE.GATE, TILE.DOOR, TILE.WARP_A, TILE.WARP_B].includes(standingCell)
  ) {
    return standingCell;
  }
  return TILE.FLOOR;
}

function crateToCell(destinationCell) {
  if (destinationCell === TILE.TARGET) {
    return TILE.CRATE_ON_TARGET;
  }
  if (destinationCell === TILE.SWITCH) {
    return TILE.CRATE_ON_SWITCH;
  }
  return TILE.CRATE;
}

function normalizeCellAfterPush(cell) {
  if (cell === TILE.CRATE_ON_TARGET) {
    return TILE.TARGET;
  }
  if (cell === TILE.CRATE_ON_SWITCH) {
    return TILE.SWITCH;
  }
  return TILE.FLOOR;
}

function findWarpExit(sourceCell) {
  const targetCell = sourceCell === TILE.WARP_A ? TILE.WARP_B : sourceCell === TILE.WARP_B ? TILE.WARP_A : null;
  if (!targetCell) {
    return null;
  }

  for (let y = 0; y < state.level.grid.length; y += 1) {
    for (let x = 0; x < state.level.grid[y].length; x += 1) {
      if (state.level.grid[y][x] === targetCell) {
        return { x, y };
      }
    }
  }
  return null;
}

function teleportPlayer(sourceCell) {
  const exit = findWarpExit(sourceCell);
  if (!exit) {
    return;
  }
  state.level.player.x = exit.x;
  state.level.player.y = exit.y;
  setBanner("Warp synced. Reposition and keep routing.", "info", 1.4);
}

function move(dx, dy) {
  if (state.win || overlay.hidden === false) {
    return;
  }

  const { player } = state.level;
  const originX = player.x;
  const originY = player.y;
  const nextX = player.x + dx;
  const nextY = player.y + dy;
  const nextCell = currentCell(nextX, nextY);

  if (nextCell === TILE.WALL) {
    return;
  }

  if ([TILE.CRATE, TILE.CRATE_ON_TARGET, TILE.CRATE_ON_SWITCH].includes(nextCell)) {
    const beyondX = nextX + dx;
    const beyondY = nextY + dy;
    const beyondCell = currentCell(beyondX, beyondY);
    if (!isWalkable(beyondCell) || beyondCell === TILE.DOOR || beyondCell === TILE.WARP_A || beyondCell === TILE.WARP_B) {
      return;
    }

    saveSnapshot();
    setCell(nextX, nextY, normalizeCellAfterPush(nextCell));
    setCell(beyondX, beyondY, crateToCell(beyondCell));
    player.x = nextX;
    player.y = nextY;
    state.steps += 1;
    state.pushes += 1;
  } else if (nextCell === TILE.DOOR) {
    if (!canExit()) {
      setBanner("Door locked. Charge every glowing socket first.", "danger");
      return;
    }
    saveSnapshot();
    player.x = nextX;
    player.y = nextY;
    state.steps += 1;
    finishLevel();
    return;
  } else if (isWalkable(nextCell)) {
    saveSnapshot();
    player.x = nextX;
    player.y = nextY;
    state.steps += 1;
    if (nextCell === TILE.WARP_A || nextCell === TILE.WARP_B) {
      teleportPlayer(nextCell);
    }
  } else {
    return;
  }

  setCell(originX, originY, clearStandingCell(originX, originY));
  updateHud();
}

function finishLevel() {
  if (state.levelIndex < LEVELS.length - 1) {
    overlayKicker.textContent = "Floor Cleared";
    overlayTitle.textContent = LEVELS[state.levelIndex + 1].name;
    overlayBody.textContent = STORY_BEATS[state.levelIndex + 1];
    overlayButton.textContent = "Next Floor";
    overlay.hidden = false;
    state.solved = true;
    return;
  }

  state.win = true;
  overlayKicker.textContent = "Vault Open";
  overlayTitle.textContent = "All Floors Cleared";
  overlayBody.textContent =
    "Ten floors breached. You solved relay shutters, staged spare cells, and used transit pads to crack the whole tower.";
  overlayButton.textContent = "Run Again";
  overlay.hidden = false;
}

function resetLevel() {
  loadLevel(state.levelIndex);
}

function updateStageList() {
  stageList.innerHTML = "";
  LEVELS.forEach((level, index) => {
    const item = document.createElement("li");
    if (index < state.levelIndex) {
      item.textContent = `${index + 1}. ${level.name} cleared`;
      item.className = "stage-list__item stage-list__item--done";
    } else if (index === state.levelIndex) {
      item.textContent = `${index + 1}. ${level.name} active · ${level.focus}`;
      item.className = "stage-list__item stage-list__item--active";
    } else {
      item.textContent = `${index + 1}. ${level.name} · ${level.focus}`;
      item.className = "stage-list__item";
    }
    stageList.appendChild(item);
  });
}

function updateHud() {
  const { total, filled } = countTargets();
  const switches = countSwitches();
  stageValue.textContent = `${state.levelIndex + 1} / ${LEVELS.length}`;
  stepValue.textContent = String(state.steps);
  pushValue.textContent = String(state.pushes);
  socketValue.textContent = `${filled} / ${total}`;
  switchValue.textContent = switches.total === 0 ? "none" : `${switches.active} / ${switches.total}`;
  focusValue.textContent = state.level.focus;
  focusText.textContent = `Floor focus: ${state.level.focus.toLowerCase()}.`;
  briefText.textContent = canExit()
    ? "All sockets are charged. Walk through the vault door now."
    : `${state.level.tip} ${switches.total > 0 ? "Keep one relay switch pressed if you need the shutter open." : ""} ${hasWarpPads() ? "Warp pads move only the runner, so use them to fix your angle before a shove." : ""}`.trim();
  updateStageList();
}

function worldMetrics() {
  const width = state.level.grid[0].length;
  const height = state.level.grid.length;
  const tileSize = Math.min(
    48,
    Math.floor(Math.min((canvas.width - 180) / width, (canvas.height - 160) / height)),
  );
  const offsetX = Math.floor((canvas.width - width * tileSize) / 2);
  const offsetY = Math.floor((canvas.height - height * tileSize) / 2) + 18;
  return { width, height, tileSize, offsetX, offsetY };
}

function drawTile(x, y, type, metrics) {
  const { tileSize, offsetX, offsetY } = metrics;
  const px = offsetX + x * tileSize;
  const py = offsetY + y * tileSize;
  const gateOpen = type === TILE.GATE && isAnySwitchPressed();

  ctx.save();
  ctx.translate(px, py);

  ctx.fillStyle = "#122331";
  ctx.fillRect(0, 0, tileSize, tileSize);

  if (type === TILE.WALL) {
    ctx.fillStyle = "#254358";
    ctx.fillRect(2, 2, tileSize - 4, tileSize - 4);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 6; i < tileSize - 6; i += 14) {
      ctx.fillRect(i, 6, 8, tileSize - 12);
    }
  } else {
    ctx.fillStyle = "#0d1924";
    ctx.fillRect(1, 1, tileSize - 2, tileSize - 2);
  }

  if ([TILE.TARGET, TILE.CRATE_ON_TARGET].includes(type)) {
    ctx.strokeStyle = "#6fe7ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, tileSize - 20, tileSize - 20);
    ctx.beginPath();
    ctx.arc(tileSize / 2, tileSize / 2, tileSize * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }

  if ([TILE.SWITCH, TILE.CRATE_ON_SWITCH].includes(type)) {
    const pressed = type === TILE.CRATE_ON_SWITCH;
    ctx.fillStyle = pressed ? "rgba(125, 255, 197, 0.22)" : "rgba(125, 255, 197, 0.08)";
    ctx.fillRect(8, tileSize * 0.58, tileSize - 16, tileSize * 0.18);
    ctx.strokeStyle = pressed ? "#7dffc5" : "#4ba884";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, tileSize * 0.58, tileSize - 16, tileSize * 0.18);
    ctx.fillStyle = pressed ? "#bfffe5" : "#8ccbb0";
    ctx.fillRect(tileSize * 0.3, tileSize * 0.44, tileSize * 0.4, tileSize * 0.08);
  }

  if (type === TILE.GATE) {
    ctx.fillStyle = gateOpen ? "rgba(125, 255, 197, 0.14)" : "rgba(255, 115, 115, 0.22)";
    ctx.fillRect(tileSize * 0.22, 0, tileSize * 0.56, tileSize);
    ctx.strokeStyle = gateOpen ? "#7dffc5" : "#ff8585";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tileSize * 0.3, tileSize * 0.08);
    ctx.lineTo(tileSize * 0.3, tileSize * 0.92);
    ctx.moveTo(tileSize * 0.5, tileSize * 0.08);
    ctx.lineTo(tileSize * 0.5, tileSize * 0.92);
    ctx.moveTo(tileSize * 0.7, tileSize * 0.08);
    ctx.lineTo(tileSize * 0.7, tileSize * 0.92);
    ctx.stroke();
  }

  if (type === TILE.WARP_A || type === TILE.WARP_B) {
    const warpColor = type === TILE.WARP_A ? "#ff79dc" : "#bb86ff";
    ctx.strokeStyle = warpColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tileSize / 2, tileSize / 2, tileSize * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tileSize / 2, tileSize / 2, tileSize * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(tileSize * 0.3, tileSize * 0.3, tileSize * 0.4, tileSize * 0.4);
  }

  if (type === TILE.DOOR) {
    ctx.fillStyle = canExit() ? "#b8ff7b" : "#563335";
    ctx.fillRect(tileSize * 0.22, tileSize * 0.14, tileSize * 0.56, tileSize * 0.72);
    ctx.fillStyle = canExit() ? "#152508" : "#1e0d0d";
    ctx.fillRect(tileSize * 0.32, tileSize * 0.24, tileSize * 0.36, tileSize * 0.5);
    ctx.fillStyle = canExit() ? "#dffff1" : "#d09a7e";
    ctx.beginPath();
    ctx.arc(tileSize * 0.61, tileSize * 0.5, tileSize * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  if ([TILE.CRATE, TILE.CRATE_ON_TARGET, TILE.CRATE_ON_SWITCH].includes(type)) {
    ctx.fillStyle = type === TILE.CRATE_ON_SWITCH ? "#c0ffd0" : "#f5ad42";
    ctx.fillRect(8, 8, tileSize - 16, tileSize - 16);
    ctx.strokeStyle = type === TILE.CRATE_ON_SWITCH ? "#3a8f64" : "#6f4615";
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, tileSize - 20, tileSize - 20);
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(tileSize - 14, tileSize - 14);
    ctx.moveTo(tileSize - 14, 14);
    ctx.lineTo(14, tileSize - 14);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayer(metrics) {
  const { tileSize, offsetX, offsetY } = metrics;
  const px = offsetX + state.level.player.x * tileSize;
  const py = offsetY + state.level.player.y * tileSize;
  const pulse = 0.5 + Math.sin(performance.now() * 0.01) * 0.08;
  const standingCell = currentCell(state.level.player.x, state.level.player.y);
  const onSwitch = standingCell === TILE.SWITCH;
  const onWarp = standingCell === TILE.WARP_A || standingCell === TILE.WARP_B;

  ctx.save();
  ctx.translate(px + tileSize / 2, py + tileSize / 2);
  ctx.fillStyle = onSwitch ? "#bfffe5" : onWarp ? "#ffd8fb" : "#d6f8ff";
  ctx.beginPath();
  ctx.arc(0, -tileSize * 0.1, tileSize * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = onSwitch ? "#7dffc5" : onWarp ? "#ff79dc" : "#6fe7ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, tileSize * 0.05, tileSize * 0.23 * pulse, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, tileSize * 0.04);
  ctx.lineTo(0, tileSize * 0.26);
  ctx.moveTo(-tileSize * 0.12, tileSize * 0.16);
  ctx.lineTo(tileSize * 0.12, tileSize * 0.16);
  ctx.moveTo(0, tileSize * 0.26);
  ctx.lineTo(-tileSize * 0.1, tileSize * 0.42);
  ctx.moveTo(0, tileSize * 0.26);
  ctx.lineTo(tileSize * 0.1, tileSize * 0.42);
  ctx.stroke();
  ctx.restore();
}

function drawObjectiveHighlight(metrics) {
  if (canExit()) {
    return;
  }

  const { tileSize, offsetX, offsetY } = metrics;
  let closest = null;

  for (let y = 0; y < state.level.grid.length; y += 1) {
    for (let x = 0; x < state.level.grid[y].length; x += 1) {
      if (state.level.grid[y][x] === TILE.TARGET) {
        const distance = Math.abs(state.level.player.x - x) + Math.abs(state.level.player.y - y);
        if (!closest || distance < closest.distance) {
          closest = { x, y, distance, color: "rgba(111, 231, 255, 0.9)" };
        }
      }
      if (state.level.grid[y][x] === TILE.SWITCH && !isAnySwitchPressed()) {
        const distance = Math.abs(state.level.player.x - x) + Math.abs(state.level.player.y - y);
        if (!closest || distance < closest.distance + 1) {
          closest = { x, y, distance, color: "rgba(125, 255, 197, 0.9)" };
        }
      }
    }
  }

  if (!closest) {
    return;
  }

  const px = offsetX + closest.x * tileSize + tileSize / 2;
  const py = offsetY + closest.y * tileSize + tileSize / 2;
  const radius = tileSize * (0.34 + Math.sin(performance.now() * 0.008) * 0.04);
  ctx.save();
  ctx.strokeStyle = closest.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBanner(metrics) {
  if (state.messageTimer <= 0 || !state.bannerText) {
    return;
  }

  const { width, tileSize, offsetX, offsetY } = metrics;
  ctx.save();
  ctx.fillStyle = state.bannerTone === "info" ? "rgba(111, 231, 255, 0.18)" : "rgba(255, 109, 109, 0.18)";
  ctx.fillRect(offsetX, offsetY - 44, width * tileSize, 34);
  ctx.fillStyle = state.bannerTone === "info" ? "#d4fbff" : "#ffd1d1";
  ctx.font = '16px "Trebuchet MS", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(state.bannerText, offsetX + (width * tileSize) / 2, offsetY - 20);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#0d1b28");
  gradient.addColorStop(1, "#04090e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const metrics = worldMetrics();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(
    metrics.offsetX - 18,
    metrics.offsetY - 18,
    metrics.width * metrics.tileSize + 36,
    metrics.height * metrics.tileSize + 36,
  );

  for (let y = 0; y < state.level.grid.length; y += 1) {
    for (let x = 0; x < state.level.grid[y].length; x += 1) {
      drawTile(x, y, state.level.grid[y][x], metrics);
    }
  }

  drawObjectiveHighlight(metrics);
  drawPlayer(metrics);
  drawBanner(metrics);

  ctx.fillStyle = "#ecf8ff";
  ctx.font = '22px "Trebuchet MS", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(state.level.name, metrics.offsetX, metrics.offsetY - 60);
}

function loop(timestamp) {
  const deltaSeconds = loop.previousTimestamp ? (timestamp - loop.previousTimestamp) / 1000 : 0;
  loop.previousTimestamp = timestamp;
  state.messageTimer = Math.max(0, state.messageTimer - deltaSeconds);
  render();
  requestAnimationFrame(loop);
}
loop.previousTimestamp = 0;

function handleOverlayAction() {
  if (state.win) {
    state.win = false;
    overlay.hidden = true;
    loadLevel(0);
    return;
  }

  if (state.solved) {
    state.solved = false;
    overlay.hidden = true;
    loadLevel(state.levelIndex + 1);
    return;
  }

  overlay.hidden = true;
  loadLevel(state.levelIndex);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "z", "r", " "].includes(key)) {
    event.preventDefault();
  }

  if (overlay.hidden === false && (key === " " || key === "enter")) {
    handleOverlayAction();
    return;
  }

  if (key === "arrowup" || key === "w") {
    move(0, -1);
  } else if (key === "arrowdown" || key === "s") {
    move(0, 1);
  } else if (key === "arrowleft" || key === "a") {
    move(-1, 0);
  } else if (key === "arrowright" || key === "d") {
    move(1, 0);
  } else if (key === "z") {
    undoMove();
  } else if (key === "r") {
    resetLevel();
  }
});

overlayButton.addEventListener("click", handleOverlayAction);

window.__vaultDebug = { LEVELS, TILE, state, loadLevel, move, canExit };

loadLevel(0);
requestAnimationFrame(loop);
