(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const stageLabel = document.getElementById("stage-label");
  const savedLabel = document.getElementById("saved-label");
  const lostLabel = document.getElementById("lost-label");
  const arrowsLabel = document.getElementById("arrows-label");
  const promptLabel = document.getElementById("prompt-label");
  const hintLabel = document.getElementById("hint-label");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const overlayButton = document.getElementById("overlay-button");
  const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

  const TILE = 48;
  const GRID_W = 16;
  const GRID_H = 11;
  const BOARD_X = 96;
  const BOARD_Y = 64;
  const DIRS = {
    up: { x: 0, y: -1, angle: -Math.PI / 2 },
    right: { x: 1, y: 0, angle: 0 },
    down: { x: 0, y: 1, angle: Math.PI / 2 },
    left: { x: -1, y: 0, angle: Math.PI },
  };
  const DIR_ORDER = ["up", "right", "down", "left"];

  const STAGES = [
    {
      name: "1",
      targetSaved: 7,
      maxLost: 4,
      arrowLimit: 8,
      spawnInterval: 2.4,
      totalMice: 11,
      catDelay: 8,
      mouseStart: "1,5",
      rockets: ["14,2", "14,8"],
      catSpawns: ["8,1"],
      walls: [
        "5,1", "5,2", "5,3", "5,7", "5,8", "5,9",
        "9,2", "9,3", "9,7", "9,8",
        "10,5", "11,5", "12,5",
      ],
      blocks: ["7,5", "8,5"],
      holes: ["3,3", "3,7", "12,2", "12,8"],
    },
    {
      name: "2",
      targetSaved: 9,
      maxLost: 4,
      arrowLimit: 10,
      spawnInterval: 2,
      totalMice: 14,
      catDelay: 6,
      mouseStart: "1,5",
      rockets: ["14,1", "14,9"],
      catSpawns: ["7,1", "7,9"],
      walls: [
        "4,2", "4,3", "4,7", "4,8",
        "7,3", "7,4", "7,6", "7,7",
        "10,1", "10,2", "10,8", "10,9",
        "11,5", "12,5", "13,5",
      ],
      blocks: ["6,5", "8,5", "9,5"],
      holes: ["2,1", "2,9", "12,3", "12,7"],
    },
    {
      name: "3",
      targetSaved: 11,
      maxLost: 5,
      arrowLimit: 12,
      spawnInterval: 1.7,
      totalMice: 17,
      catDelay: 4.5,
      mouseStart: "1,5",
      rockets: ["14,1", "14,5", "14,9"],
      catSpawns: ["6,1", "6,9", "11,5"],
      walls: [
        "4,1", "4,2", "4,8", "4,9",
        "6,3", "6,4", "6,6", "6,7",
        "8,1", "8,2", "8,8", "8,9",
        "10,3", "10,4", "10,6", "10,7",
        "12,1", "12,2", "12,8", "12,9",
      ],
      blocks: ["5,5", "7,5", "9,5", "11,5"],
      holes: ["2,3", "2,7", "13,3", "13,7"],
    },
  ];

  const state = {
    mode: "menu",
    stageIndex: 0,
    selectedTool: "right",
    hoverCell: null,
    arrows: new Map(),
    mice: [],
    cats: [],
    particles: [],
    saved: 0,
    lost: 0,
    spawned: 0,
    spawnTimer: 0,
    catTimer: 0,
    catSpawned: 0,
    message: "Click floor tiles to place arrows.",
  };

  function key(x, y) {
    return `${x},${y}`;
  }

  function parseCell(text) {
    const [x, y] = text.split(",").map(Number);
    return { x, y };
  }

  function buildStage(index) {
    const cfg = STAGES[index];
    state.stageIndex = index;
    state.arrows = new Map();
    state.mice = [];
    state.cats = [];
    state.particles = [];
    state.saved = 0;
    state.lost = 0;
    state.spawned = 0;
    state.spawnTimer = 0;
    state.catTimer = 0;
    state.catSpawned = 0;
    state.message = `Rescue ${cfg.targetSaved} mice before ${cfg.maxLost} are lost.`;
    state.grid = new Map();
    state.stage = {
      ...cfg,
      mouseStartCell: parseCell(cfg.mouseStart),
      rocketCells: cfg.rockets.map(parseCell),
      catSpawnCells: cfg.catSpawns.map(parseCell),
    };

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        state.grid.set(key(x, y), "floor");
      }
    }

    for (const text of cfg.walls) state.grid.set(text, "wall");
    for (const text of cfg.blocks) state.grid.set(text, "block");
    for (const text of cfg.holes) state.grid.set(text, "hole");
    state.grid.set(cfg.mouseStart, "nest");
    for (const text of cfg.rockets) state.grid.set(text, "rocket");
    for (const text of cfg.catSpawns) state.grid.set(text, "catnest");
  }

  function startRun() {
    buildStage(0);
    state.mode = "playing";
    hideOverlay();
    updateHud();
  }

  function restartRun() {
    buildStage(0);
    state.mode = "playing";
    hideOverlay();
    updateHud();
  }

  function nextStage() {
    if (state.stageIndex >= STAGES.length - 1) {
      state.mode = "won";
      showOverlay("Run Clear", "All rocket bays survived. Press R to start a fresh run.", "Play Again");
      return;
    }
    buildStage(state.stageIndex + 1);
    state.mode = "playing";
    hideOverlay();
    updateHud();
  }

  function showOverlay(title, copy, buttonText) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlayButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function setTool(tool) {
    state.selectedTool = tool;
    for (const button of toolButtons) {
      button.classList.toggle("active", button.dataset.tool === tool);
    }
    hintLabel.textContent =
      tool === "erase" ? "Erase arrow tiles on floor cells." : `Placing ${tool} arrows. Click floor tiles.`;
  }

  function mouseToCell(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    const x = Math.floor((px - BOARD_X) / TILE);
    const y = Math.floor((py - BOARD_Y) / TILE);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  function canEditCell(cell) {
    const type = state.grid.get(key(cell.x, cell.y));
    return type === "floor";
  }

  function placeTool(cell) {
    if (!state.stage || !canEditCell(cell) || state.mode !== "playing") return;
    const cellKey = key(cell.x, cell.y);
    if (state.selectedTool === "erase") {
      if (state.arrows.delete(cellKey)) spawnParticle(cell.x, cell.y, "#ffb16b");
      return;
    }
    const already = state.arrows.has(cellKey);
    if (!already && state.arrows.size >= state.stage.arrowLimit) {
      state.message = "Arrow budget full. Erase one first.";
      return;
    }
    state.arrows.set(cellKey, state.selectedTool);
    spawnParticle(cell.x, cell.y, "#76e5ff");
  }

  function spawnParticle(x, y, color) {
    for (let i = 0; i < 8; i += 1) {
      state.particles.push({
        x: BOARD_X + x * TILE + TILE / 2,
        y: BOARD_Y + y * TILE + TILE / 2,
        vx: (Math.random() - 0.5) * 70,
        vy: (Math.random() - 0.5) * 70,
        life: 0.45 + Math.random() * 0.25,
        color,
      });
    }
  }

  function createMover(kind, cell, dir) {
    return {
      kind,
      x: cell.x,
      y: cell.y,
      px: cell.x,
      py: cell.y,
      progress: 0,
      dir,
      speed: kind === "mouse" ? 2.5 : 2.9,
      alive: true,
    };
  }

  function spawnMouse() {
    if (state.spawned >= state.stage.totalMice) return;
    const start = state.stage.mouseStartCell;
    const dir = start.x <= GRID_W / 2 ? "right" : "left";
    state.mice.push(createMover("mouse", start, dir));
    state.spawned += 1;
  }

  function spawnCat() {
    if (state.catSpawned >= state.stage.catSpawnCells.length) return;
    const start = state.stage.catSpawnCells[state.catSpawned];
    state.cats.push(createMover("cat", start, "left"));
    state.catSpawned += 1;
  }

  function isBlocked(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return true;
    const type = state.grid.get(key(x, y));
    return type === "wall" || type === "block";
  }

  function chooseMouseDir(mover) {
    const cellKey = key(mover.x, mover.y);
    const forced = state.arrows.get(cellKey);
    if (forced && !isBlocked(mover.x + DIRS[forced].x, mover.y + DIRS[forced].y)) return forced;

    const preferred = [mover.dir, turnRight(mover.dir), turnLeft(mover.dir), reverseDir(mover.dir)];
    for (const dir of preferred) {
      const nx = mover.x + DIRS[dir].x;
      const ny = mover.y + DIRS[dir].y;
      if (!isBlocked(nx, ny)) return dir;
    }
    return mover.dir;
  }

  function chooseCatDir(mover) {
    const target = nearestMouse(mover);
    if (!target) return chooseMouseDir(mover);
    const candidates = DIR_ORDER.filter((dir) => !isBlocked(mover.x + DIRS[dir].x, mover.y + DIRS[dir].y));
    candidates.sort((a, b) => {
      const ad = distance(mover.x + DIRS[a].x, mover.y + DIRS[a].y, target.x, target.y);
      const bd = distance(mover.x + DIRS[b].x, mover.y + DIRS[b].y, target.x, target.y);
      return ad - bd;
    });
    return candidates[0] || mover.dir;
  }

  function nearestMouse(mover) {
    let best = null;
    let bestDist = Infinity;
    for (const mouse of state.mice) {
      if (!mouse.alive) continue;
      const d = distance(mover.x, mover.y, mouse.x, mouse.y);
      if (d < bestDist) {
        best = mouse;
        bestDist = d;
      }
    }
    return best;
  }

  function turnLeft(dir) {
    return { up: "left", left: "down", down: "right", right: "up" }[dir];
  }

  function turnRight(dir) {
    return { up: "right", right: "down", down: "left", left: "up" }[dir];
  }

  function reverseDir(dir) {
    return { up: "down", down: "up", left: "right", right: "left" }[dir];
  }

  function distance(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function updateMover(mover, dt, chooser) {
    mover.progress += mover.speed * dt;
    while (mover.progress >= 1) {
      mover.progress -= 1;
      mover.x += DIRS[mover.dir].x;
      mover.y += DIRS[mover.dir].y;
      mover.px = mover.x;
      mover.py = mover.y;

      const cellType = state.grid.get(key(mover.x, mover.y));
      if (cellType === "hole") {
        mover.alive = false;
        state.lost += 1;
        state.message = "A route crossed a floor hole.";
        spawnParticle(mover.x, mover.y, "#ff6b6b");
        return;
      }
      if (mover.kind === "mouse" && cellType === "rocket") {
        mover.alive = false;
        state.saved += 1;
        state.message = "Mouse rescued. Keep the lane stable.";
        spawnParticle(mover.x, mover.y, "#8fe388");
        return;
      }

      mover.dir = chooser(mover);
      const nx = mover.x + DIRS[mover.dir].x;
      const ny = mover.y + DIRS[mover.dir].y;
      if (isBlocked(nx, ny)) {
        mover.dir = reverseDir(mover.dir);
      }
    }
  }

  function update(dt) {
    if (state.mode !== "playing") return;

    state.spawnTimer += dt;
    state.catTimer += dt;
    if (state.spawnTimer >= state.stage.spawnInterval) {
      state.spawnTimer = 0;
      spawnMouse();
    }
    if (state.catTimer >= state.stage.catDelay && state.catSpawned < state.stage.catSpawnCells.length) {
      state.catTimer = 0;
      spawnCat();
      state.message = "Cat entered the maze. Tighten the route.";
    }

    for (const mouse of state.mice) {
      if (mouse.alive) updateMover(mouse, dt, chooseMouseDir);
    }
    for (const cat of state.cats) {
      if (cat.alive) updateMover(cat, dt, chooseCatDir);
    }

    for (const cat of state.cats) {
      if (!cat.alive) continue;
      for (const mouse of state.mice) {
        if (!mouse.alive) continue;
        if (mouse.x === cat.x && mouse.y === cat.y) {
          mouse.alive = false;
          state.lost += 1;
          state.message = "A cat caught a mouse.";
          spawnParticle(mouse.x, mouse.y, "#ff6b6b");
        }
      }
    }

    state.mice = state.mice.filter((entity) => entity.alive);
    state.cats = state.cats.filter((entity) => entity.alive);

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.95;
      particle.vy *= 0.95;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);

    const exhausted = state.spawned >= state.stage.totalMice && state.mice.length === 0;
    if (state.saved >= state.stage.targetSaved) {
      state.mode = "stage-clear";
      showOverlay(`Stage ${state.stage.name} Clear`, "Quota met. Press continue for the next maze.", state.stageIndex >= STAGES.length - 1 ? "Finish Run" : "Continue");
    } else if (state.lost >= state.stage.maxLost || exhausted) {
      state.mode = "lost";
      showOverlay("Route Failed", "Too many mice were lost before the quota was met. Press R or restart.", "Restart");
    }

    updateHud();
  }

  function updateHud() {
    if (!state.stage) return;
    stageLabel.textContent = state.stage.name;
    savedLabel.textContent = `${state.saved} / ${state.stage.targetSaved}`;
    lostLabel.textContent = `${state.lost} / ${state.stage.maxLost}`;
    arrowsLabel.textContent = `${state.arrows.size} / ${state.stage.arrowLimit}`;
    promptLabel.textContent = state.message;
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#151d23";
    ctx.fillRect(BOARD_X - 18, BOARD_Y - 18, GRID_W * TILE + 36, GRID_H * TILE + 36);

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const px = BOARD_X + x * TILE;
        const py = BOARD_Y + y * TILE;
        const type = state.grid?.get(key(x, y)) ?? "floor";
        drawTile(type, px, py, x, y);
      }
    }

    for (const [cellKey, dir] of state.arrows.entries()) {
      const [x, y] = cellKey.split(",").map(Number);
      drawArrow(BOARD_X + x * TILE + TILE / 2, BOARD_Y + y * TILE + TILE / 2, dir, "#76e5ff");
    }

    if (state.hoverCell && canEditCell(state.hoverCell)) {
      const { x, y } = state.hoverCell;
      ctx.strokeStyle = state.selectedTool === "erase" ? "#ffb16b" : "#ffe26d";
      ctx.lineWidth = 3;
      ctx.strokeRect(BOARD_X + x * TILE + 3, BOARD_Y + y * TILE + 3, TILE - 6, TILE - 6);
    }

    for (const rocket of state.stage?.rocketCells ?? []) {
      const px = BOARD_X + rocket.x * TILE + TILE / 2;
      const py = BOARD_Y + rocket.y * TILE + TILE / 2;
      drawRocket(px, py);
    }

    drawNest(state.stage?.mouseStartCell, "#e8d4a2");
    for (const catCell of state.stage?.catSpawnCells ?? []) {
      drawNest(catCell, "#ff9c7d");
    }

    for (const mouse of state.mice) drawMover(mouse, "#f1efe4", "#d0b983");
    for (const cat of state.cats) drawMover(cat, "#ff8d7b", "#8b2d29");

    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life * 1.2);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawTile(type, px, py, x, y) {
    ctx.fillStyle = (x + y) % 2 === 0 ? "#202b30" : "#223239";
    if (type === "wall") ctx.fillStyle = "#435266";
    if (type === "block") ctx.fillStyle = "#69798d";
    if (type === "hole") ctx.fillStyle = "#091018";
    if (type === "nest") ctx.fillStyle = "#654534";
    if (type === "catnest") ctx.fillStyle = "#66313a";
    if (type === "rocket") ctx.fillStyle = "#1d4343";

    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = "#31404f";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);

    if (type === "hole") {
      ctx.fillStyle = "#020406";
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawArrow(cx, cy, dir, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(DIRS[dir].angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(2, -8);
    ctx.lineTo(2, -16);
    ctx.lineTo(16, 0);
    ctx.lineTo(2, 16);
    ctx.lineTo(2, 8);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRocket(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#76e5ff";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(12, 8);
    ctx.lineTo(0, 2);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe26d";
    ctx.fillRect(-3, 8, 6, 10);
    ctx.restore();
  }

  function drawNest(cell, color) {
    if (!cell) return;
    const px = BOARD_X + cell.x * TILE + TILE / 2;
    const py = BOARD_Y + cell.y * TILE + TILE / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#151922";
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMover(mover, body, accent) {
    const px = BOARD_X + (mover.x + DIRS[mover.dir].x * mover.progress) * TILE + TILE / 2;
    const py = BOARD_Y + (mover.y + DIRS[mover.dir].y * mover.progress) * TILE + TILE / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(-8, -7, 3, 0, Math.PI * 2);
    ctx.arc(8, -7, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(4, -1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  canvas.addEventListener("mousemove", (event) => {
    state.hoverCell = mouseToCell(event);
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverCell = null;
  });

  canvas.addEventListener("click", (event) => {
    const cell = mouseToCell(event);
    if (cell) placeTool(cell);
  });

  overlayButton.addEventListener("click", () => {
    if (state.mode === "menu") startRun();
    else if (state.mode === "stage-clear") nextStage();
    else restartRun();
  });

  toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (state.mode === "menu") startRun();
      else if (state.mode === "stage-clear") nextStage();
    }
    if (event.key.toLowerCase() === "r" && state.mode !== "playing") restartRun();
    if (event.key.toLowerCase() === "x") setTool("erase");
    if (event.key === "1") setTool("up");
    if (event.key === "2") setTool("right");
    if (event.key === "3") setTool("down");
    if (event.key === "4") setTool("left");
  });

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    drawBoard();
    requestAnimationFrame(frame);
  }

  setTool("right");
  buildStage(0);
  updateHud();
  showOverlay("Rocket Mice Maze", "Place arrows to route mice into rocket bays before the cats take the maze over.", "Start");
  requestAnimationFrame(frame);
})();
