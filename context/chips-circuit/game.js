(function () {
  const TILE = 48;
  const COLORS = {
    floor: "#1b3240",
    wall: "#314d5e",
    chip: "#7df0b3",
    exitClosed: "#48636f",
    exitOpen: "#f7c96a",
    player: "#ffe07a",
    playerTrim: "#29404c",
    water: "#3b7cff",
    fire: "#ff7a59",
    flippers: "#7cd9ff",
    fireBoots: "#ffbc66",
    force: "#d086ff",
    keyRed: "#ff8a80",
    keyBlue: "#81d8ff",
    doorRed: "#9d3535",
    doorBlue: "#215a91",
    grid: "rgba(255,255,255,0.05)"
  };

  const FORCE_MAP = {
    ">": { x: 1, y: 0 },
    "<": { x: -1, y: 0 },
    "^": { x: 0, y: -1 },
    v: { x: 0, y: 1 }
  };

  const LEVELS = [
    {
      name: "Sector 1: Key Relay",
      note: "Collect every chip, pick up the red key, and spend it on the final door.",
      map: [
        "###########",
        "#@..c..r..#",
        "#.###.###.#",
        "#...#...#.#",
        "#.#.#.#.#.#",
        "#.#...#.#.#",
        "#.###R#.#E#",
        "#...c...c.#",
        "###########"
      ]
    },
    {
      name: "Sector 2: Flood Routing",
      note: "Flippers let you cross water safely. One chip sits behind the red door.",
      map: [
        "###########",
        "#@..f..c..#",
        "#.###.###.#",
        "#..www....#",
        "#.#w#w###.#",
        "#c#w.wR.E.#",
        "#.#www###.#",
        "#r....c...#",
        "###########"
      ]
    },
    {
      name: "Sector 3: Conveyor Furnace",
      note: "Grab the fire boots first, then let the force floor lane carry you cleanly.",
      map: [
        "###########",
        "#@..h..c.b#",
        "#.###.###B#",
        "#...>.F..E#",
        "#.###v###.#",
        "#c..<<....#",
        "#.#####.#.#",
        "#....c....#",
        "###########"
      ]
    }
  ];

  const state = {
    levelIndex: 0,
    mode: "title",
    grid: [],
    width: 0,
    height: 0,
    player: { x: 0, y: 0 },
    keys: { red: 0, blue: 0 },
    boots: { flippers: false, fire: false },
    chipsLeft: 0,
    status: "Collect the chips and unlock the exit.",
    queuedForce: null,
    nextForceAt: 0
  };

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const levelName = document.getElementById("level-name");
  const chipsLeft = document.getElementById("chips-left");
  const keysHeld = document.getElementById("keys-held");
  const bootsHeld = document.getElementById("boots-held");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlay-kicker");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const statusText = document.getElementById("status-text");
  const primaryAction = document.getElementById("primary-action");
  const restartAction = document.getElementById("restart-action");

  function cloneGrid(map) {
    return map.map((row) => row.split(""));
  }

  function setOverlay(mode, title, copy, buttonLabel) {
    overlay.classList.remove("hidden");
    overlayKicker.textContent = mode;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    primaryAction.textContent = buttonLabel;
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function setStatus(message) {
    state.status = message;
    statusText.textContent = message;
  }

  function syncHud() {
    const level = LEVELS[state.levelIndex];
    levelName.textContent = level ? level.name : "Chip's Challenge Circuit";
    chipsLeft.textContent = String(state.chipsLeft);
    keysHeld.textContent = [
      state.keys.red ? "Red" : "",
      state.keys.blue ? "Blue" : ""
    ].filter(Boolean).join(", ") || "-";
    bootsHeld.textContent = [
      state.boots.flippers ? "Flippers" : "",
      state.boots.fire ? "Fire Boots" : ""
    ].filter(Boolean).join(", ") || "-";
  }

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.mode = "ready";
    state.grid = cloneGrid(level.map);
    state.width = state.grid[0].length;
    state.height = state.grid.length;
    state.keys = { red: 0, blue: 0 };
    state.boots = { flippers: false, fire: false };
    state.chipsLeft = 0;
    state.queuedForce = null;
    state.nextForceAt = 0;

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const tile = state.grid[y][x];
        if (tile === "@") {
          state.player = { x, y };
          state.grid[y][x] = ".";
        } else if (tile === "c") {
          state.chipsLeft += 1;
        }
      }
    }

    canvas.width = state.width * TILE;
    canvas.height = state.height * TILE;

    setStatus(level.note);
    syncHud();
    render();
  }

  function tileAt(x, y) {
    if (y < 0 || y >= state.height || x < 0 || x >= state.width) {
      return "#";
    }
    return state.grid[y][x];
  }

  function setTile(x, y, value) {
    state.grid[y][x] = value;
  }

  function beginRun() {
    if (state.mode === "title") {
      loadLevel(0);
    }
    state.mode = "playing";
    hideOverlay();
    setStatus(LEVELS[state.levelIndex].note);
  }

  function restartLevel() {
    loadLevel(state.levelIndex);
    state.mode = "playing";
    hideOverlay();
    setStatus("Restarted. Move fast and keep the route clean.");
  }

  function failLevel(reason) {
    state.mode = "failed";
    setStatus(reason);
    setOverlay("Circuit Failed", "Hazard Hit", reason, "Retry Level");
  }

  function finishLevel() {
    if (state.levelIndex === LEVELS.length - 1) {
      state.mode = "won";
      setStatus("Circuit clear. Every puzzle sector is solved.");
      setOverlay("Circuit Clear", "Full Lock Opened", "You cleared every puzzle sector with the full key, boot, and conveyor toolset.", "Run Again");
      return;
    }

    loadLevel(state.levelIndex + 1);
    state.mode = "ready";
    setOverlay("Sector Clear", LEVELS[state.levelIndex].name, LEVELS[state.levelIndex].note, "Enter Next Sector");
  }

  function unlockDoor(tile, x, y) {
    if (tile === "R") {
      if (!state.keys.red) {
        setStatus("Red door locked. Find the red key first.");
        return false;
      }
      state.keys.red -= 1;
      setTile(x, y, ".");
      setStatus("Red door unlocked.");
      return true;
    }

    if (tile === "B") {
      if (!state.keys.blue) {
        setStatus("Blue door locked. Route to the blue key.");
        return false;
      }
      state.keys.blue -= 1;
      setTile(x, y, ".");
      setStatus("Blue door unlocked.");
      return true;
    }

    return true;
  }

  function collectTile(tile, x, y) {
    if (tile === "c") {
      state.chipsLeft -= 1;
      setTile(x, y, ".");
      setStatus(state.chipsLeft ? "Chip collected. Keep routing." : "All chips secured. Exit is live.");
      return;
    }

    if (tile === "r") {
      state.keys.red += 1;
      setTile(x, y, ".");
      setStatus("Red key secured.");
      return;
    }

    if (tile === "b") {
      state.keys.blue += 1;
      setTile(x, y, ".");
      setStatus("Blue key secured.");
      return;
    }

    if (tile === "f") {
      state.boots.flippers = true;
      setTile(x, y, ".");
      setStatus("Flippers equipped. Water is safe now.");
      return;
    }

    if (tile === "h") {
      state.boots.fire = true;
      setTile(x, y, ".");
      setStatus("Fire boots equipped. Furnace tiles are safe now.");
      return;
    }
  }

  function handleLanding(tile) {
    if (tile === "w" && !state.boots.flippers) {
      failLevel("You hit water without flippers. Restart and route the boot pickup first.");
      return false;
    }

    if (tile === "F" && !state.boots.fire) {
      failLevel("You hit fire without fire boots. Grab the orange boots before crossing.");
      return false;
    }

    if (tile === "E") {
      if (state.chipsLeft > 0) {
        setStatus("Exit locked. Collect the remaining chips first.");
        return true;
      }
      finishLevel();
      return false;
    }

    if (FORCE_MAP[tile]) {
      state.queuedForce = FORCE_MAP[tile];
      state.nextForceAt = performance.now() + 140;
      setStatus("Force floor engaged. Hold the line.");
    } else {
      state.queuedForce = null;
    }

    return true;
  }

  function tryMove(dx, dy) {
    if (state.mode !== "playing") {
      return;
    }

    const nextX = state.player.x + dx;
    const nextY = state.player.y + dy;
    const tile = tileAt(nextX, nextY);

    if (tile === "#") {
      state.queuedForce = null;
      setStatus("Wall. Find another line.");
      return;
    }

    if ((tile === "R" || tile === "B") && !unlockDoor(tile, nextX, nextY)) {
      state.queuedForce = null;
      syncHud();
      render();
      return;
    }

    state.player.x = nextX;
    state.player.y = nextY;

    const landedTile = tileAt(nextX, nextY);
    collectTile(landedTile, nextX, nextY);
    syncHud();
    handleLanding(tileAt(nextX, nextY));
    render();
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();

    if (key === "r") {
      restartLevel();
      return;
    }

    if (key === "enter") {
      if (state.mode === "title" || state.mode === "ready") {
        beginRun();
        return;
      }
      if (state.mode === "failed") {
        restartLevel();
        return;
      }
      if (state.mode === "won") {
        loadLevel(0);
        beginRun();
      }
      return;
    }

    if (state.mode !== "playing" || state.queuedForce) {
      return;
    }

    const move = {
      arrowup: { x: 0, y: -1 },
      w: { x: 0, y: -1 },
      arrowdown: { x: 0, y: 1 },
      s: { x: 0, y: 1 },
      arrowleft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 },
      d: { x: 1, y: 0 }
    }[key];

    if (move) {
      event.preventDefault();
      tryMove(move.x, move.y);
    }
  }

  function drawArrow(x, y, tile) {
    const midX = x + TILE / 2;
    const midY = y + TILE / 2;
    const size = 12;

    ctx.fillStyle = "#291b3c";
    ctx.beginPath();
    if (tile === ">") {
      ctx.moveTo(midX + size, midY);
      ctx.lineTo(midX - size, midY - size);
      ctx.lineTo(midX - size, midY + size);
    } else if (tile === "<") {
      ctx.moveTo(midX - size, midY);
      ctx.lineTo(midX + size, midY - size);
      ctx.lineTo(midX + size, midY + size);
    } else if (tile === "^") {
      ctx.moveTo(midX, midY - size);
      ctx.lineTo(midX - size, midY + size);
      ctx.lineTo(midX + size, midY + size);
    } else {
      ctx.moveTo(midX, midY + size);
      ctx.lineTo(midX - size, midY - size);
      ctx.lineTo(midX + size, midY - size);
    }
    ctx.closePath();
    ctx.fill();
  }

  function renderTile(tile, x, y) {
    const px = x * TILE;
    const py = y * TILE;
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(px, py, TILE, TILE);

    if (tile === "#") {
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(px, py, TILE, TILE);
      return;
    }

    if (tile === "c") {
      ctx.fillStyle = COLORS.chip;
      ctx.fillRect(px + 14, py + 14, 20, 20);
      ctx.fillStyle = "#244635";
      ctx.fillRect(px + 19, py + 19, 10, 10);
      return;
    }

    if (tile === "E") {
      ctx.fillStyle = state.chipsLeft ? COLORS.exitClosed : COLORS.exitOpen;
      ctx.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
      ctx.fillStyle = "#203743";
      ctx.fillRect(px + 18, py + 16, 12, 16);
      return;
    }

    if (tile === "w") {
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      return;
    }

    if (tile === "F") {
      ctx.fillStyle = COLORS.fire;
      ctx.beginPath();
      ctx.moveTo(px + 24, py + 8);
      ctx.lineTo(px + 34, py + 22);
      ctx.lineTo(px + 24, py + 40);
      ctx.lineTo(px + 14, py + 22);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (tile === "f" || tile === "h") {
      ctx.fillStyle = tile === "f" ? COLORS.flippers : COLORS.fireBoots;
      ctx.fillRect(px + 12, py + 10, 12, 26);
      ctx.fillRect(px + 26, py + 10, 12, 26);
      return;
    }

    if (tile === "r" || tile === "b") {
      ctx.fillStyle = tile === "r" ? COLORS.keyRed : COLORS.keyBlue;
      ctx.beginPath();
      ctx.arc(px + 18, py + 18, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + 24, py + 16, 12, 5);
      ctx.fillRect(px + 30, py + 14, 4, 10);
      return;
    }

    if (tile === "R" || tile === "B") {
      ctx.fillStyle = tile === "R" ? COLORS.doorRed : COLORS.doorBlue;
      ctx.fillRect(px + 8, py + 6, TILE - 16, TILE - 12);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(px + 16, py + 14, 6, 18);
      return;
    }

    if (FORCE_MAP[tile]) {
      ctx.fillStyle = COLORS.force;
      ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
      drawArrow(px, py, tile);
    }
  }

  function renderPlayer() {
    const px = state.player.x * TILE;
    const py = state.player.y * TILE;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(px + 24, py + 22, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.playerTrim;
    ctx.fillRect(px + 14, py + 28, 20, 10);
    ctx.fillRect(px + 18, py + 12, 4, 4);
    ctx.fillRect(px + 26, py + 12, 4, 4);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        renderTile(state.grid[y][x], x, y);
      }
    }
    renderPlayer();
  }

  function tick(now) {
    if (state.mode === "playing" && state.queuedForce && now >= state.nextForceAt) {
      const move = state.queuedForce;
      state.queuedForce = null;
      tryMove(move.x, move.y);
    }

    requestAnimationFrame(tick);
  }

  primaryAction.addEventListener("click", function () {
    if (state.mode === "failed") {
      restartLevel();
      return;
    }

    if (state.mode === "won") {
      loadLevel(0);
    }

    beginRun();
  });

  restartAction.addEventListener("click", function () {
    if (state.mode === "title") {
      loadLevel(0);
    }
    restartLevel();
  });

  window.addEventListener("keydown", handleKey);

  loadLevel(0);
  state.mode = "title";
  setOverlay("Puzzle Routing", "Chip's Challenge Circuit", "Collect every chip, route through color doors, grab the right boots before hazards, and let force floors shove you only when the lane is safe.", "Start Run");
  requestAnimationFrame(tick);
})();
