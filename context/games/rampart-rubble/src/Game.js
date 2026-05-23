import {
  CANNON_FIRE_RATE,
  CELL_SIZE,
  DEFEND_SECONDS,
  ENEMY_FIRE_RATE,
  GRAVITY,
  GRID_COLS,
  GRID_ROWS,
  GRID_X,
  GRID_Y,
  MAX_WAVES,
  PIECES,
  REBUILD_SECONDS,
  WAVES
} from "./data.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rotateCells(cells, rotation) {
  let points = cells.map(([x, y]) => ({ x, y }));
  for (let step = 0; step < rotation; step += 1) {
    points = points.map((point) => ({ x: point.y, y: -point.x }));
  }
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
}

function makeGrid() {
  return Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => null));
}

function makeBurst(x, y, color, radius) {
  return { x, y, color, radius, alpha: 0.9, life: 0.42 };
}

function solvePlayerShot(originX, originY, targetX, targetY) {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const travelTime = clamp(0.5 + (Math.abs(dx) / 520), 0.46, 0.98);
  return {
    vx: dx / travelTime,
    vy: (dy - (0.5 * GRAVITY * travelTime * travelTime)) / travelTime
  };
}

export class Game {
  constructor() {
    this.time = 0;
    this.mode = "menu";
    this.phase = "rebuild";
    this.waveIndex = 0;
    this.score = 0;
    this.keepHp = 100;
    this.phaseTimer = REBUILD_SECONDS;
    this.materials = 0;
    this.grid = makeGrid();
    this.pieceIndex = 0;
    this.rotation = 0;
    this.pointer = { x: 480, y: 320, down: false, clicked: false };
    this.spaceQueued = false;
    this.rotateQueued = 0;
    this.fireCooldown = 0;
    this.shells = [];
    this.ships = [];
    this.bursts = [];
    this.message = "";
    this.spawnWave();
  }

  start() {
    this.mode = "playing";
    this.waveIndex = 0;
    this.score = 0;
    this.keepHp = 100;
    this.grid = makeGrid();
    this.setupRebuild();
  }

  restart() {
    this.start();
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  pointerDown() {
    this.pointer.down = true;
    this.pointer.clicked = true;
  }

  pointerUp() {
    this.pointer.down = false;
  }

  queueSpace() {
    this.spaceQueued = true;
  }

  queueRotate(direction) {
    this.rotateQueued += direction;
  }

  getCurrentWave() {
    return WAVES[this.waveIndex];
  }

  setupRebuild() {
    const wave = this.getCurrentWave();
    this.phase = "rebuild";
    this.phaseTimer = REBUILD_SECONDS;
    this.materials = wave.materials;
    this.shells = [];
    this.bursts = [];
    this.fireCooldown = 0;
    this.pieceIndex = (this.waveIndex * 2) % PIECES.length;
    this.rotation = 0;
    this.spawnWave();
  }

  setupDefend() {
    this.phase = "defend";
    this.phaseTimer = DEFEND_SECONDS;
    this.fireCooldown = 0;
  }

  spawnWave() {
    const wave = this.getCurrentWave();
    this.ships = Array.from({ length: wave.ships }, (_, index) => ({
      x: 140 + index * (700 / Math.max(1, wave.ships - 1)),
      y: 208 + (index % 2) * 18,
      hp: wave.shipHp,
      reload: 0.8 + index * 0.2
    }));
  }

  nextWave() {
    if (this.waveIndex >= MAX_WAVES - 1) {
      this.mode = "win";
      this.message = `Fleet broken. Score ${this.score}.`;
      return;
    }
    this.waveIndex += 1;
    this.setupRebuild();
  }

  lose() {
    this.mode = "lose";
    this.message = `Keep fell on wave ${this.waveIndex + 1}. Score ${this.score}.`;
  }

  getGhostCells() {
    const piece = PIECES[this.pieceIndex];
    const cells = rotateCells(piece.cells, ((this.rotation % 4) + 4) % 4);
    const col = Math.floor((this.pointer.x - GRID_X) / CELL_SIZE);
    const row = Math.floor((this.pointer.y - GRID_Y) / CELL_SIZE);
    const placed = cells.map((cell) => ({ col: col + cell.x, row: row + cell.y }));
    const valid = placed.every((cell) => cell.col >= 0 && cell.col < GRID_COLS && cell.row >= 0 && cell.row < GRID_ROWS && !this.grid[cell.row][cell.col]);
    return { cells: placed, valid };
  }

  placeCurrentPiece() {
    if (this.materials <= 0) {
      return;
    }
    const ghost = this.getGhostCells();
    if (!ghost.valid || ghost.cells.length > this.materials) {
      return;
    }
    for (const cell of ghost.cells) {
      this.grid[cell.row][cell.col] = { hp: 2 };
    }
    this.materials -= ghost.cells.length;
    this.score += ghost.cells.length * 3;
    this.pieceIndex = (this.pieceIndex + 1) % PIECES.length;
    this.rotation = 0;
  }

  firePlayerShell() {
    if (this.fireCooldown > 0) {
      return;
    }
    const originX = 480;
    const originY = 424;
    const dx = this.pointer.x - originX;
    const dy = this.pointer.y - originY;
    const angle = Math.atan2(dy, dx);
    const velocity = solvePlayerShot(originX, originY, this.pointer.x, this.pointer.y);
    this.shells.push({
      x: originX + Math.cos(angle) * 40,
      y: originY + Math.sin(angle) * 40,
      vx: velocity.vx,
      vy: velocity.vy,
      radius: 7,
      friendly: true
    });
    this.fireCooldown = CANNON_FIRE_RATE;
  }

  fireEnemyShell(ship) {
    const wave = this.getCurrentWave();
    const targetX = clamp(400 + Math.random() * 160, 320, 640);
    const targetY = 444;
    const dx = targetX - ship.x;
    const dy = targetY - ship.y;
    const time = Math.max(0.9, Math.min(1.4, Math.abs(dx) / wave.shellSpeed));
    const vx = dx / time;
    const vy = (dy - 0.5 * GRAVITY * time * time) / time;
    this.shells.push({
      x: ship.x,
      y: ship.y - 48,
      vx,
      vy,
      radius: 8,
      friendly: false
    });
    ship.reload = wave.shellRate + Math.random() * ENEMY_FIRE_RATE;
  }

  damageCellAt(x, y) {
    const col = Math.floor((x - GRID_X) / CELL_SIZE);
    const row = Math.floor((y - GRID_Y) / CELL_SIZE);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
      return false;
    }
    const cell = this.grid[row][col];
    if (!cell) {
      return false;
    }
    cell.hp -= 1;
    if (cell.hp <= 0) {
      this.grid[row][col] = null;
      this.score += 4;
    }
    this.bursts.push(makeBurst(x, y, "#deb472", 18));
    return true;
  }

  updateShells(step) {
    for (const shell of this.shells) {
      shell.vy += GRAVITY * step;
      shell.x += shell.vx * step;
      shell.y += shell.vy * step;
    }

    const survivors = [];
    for (const shell of this.shells) {
      if (shell.friendly) {
        let hit = false;
        for (const ship of this.ships) {
          const dx = shell.x - ship.x;
          const dy = shell.y - ship.y;
          if ((dx * dx) + (dy * dy) <= 42 * 42) {
            ship.hp -= 1;
            this.bursts.push(makeBurst(shell.x, shell.y, "#ffd585", 24));
            this.score += 40;
            hit = true;
            break;
          }
        }
        if (!hit && shell.x >= -20 && shell.x <= 980 && shell.y >= -40 && shell.y <= 560) {
          survivors.push(shell);
        }
        continue;
      }

      if (shell.y >= GRID_Y && shell.y <= GRID_Y + GRID_ROWS * CELL_SIZE && shell.x >= GRID_X && shell.x <= GRID_X + GRID_COLS * CELL_SIZE) {
        const blocked = this.damageCellAt(shell.x, shell.y);
        this.bursts.push(makeBurst(shell.x, shell.y, "#e58b5f", 28));
        if (blocked) {
          continue;
        }
      }

      if (shell.y >= 424 && shell.x >= 424 && shell.x <= 536) {
        this.keepHp = Math.max(0, this.keepHp - 12);
        this.bursts.push(makeBurst(shell.x, shell.y, "#ff6e56", 32));
        if (this.keepHp === 0) {
          this.lose();
        }
        continue;
      }

      if (shell.x >= -30 && shell.x <= 990 && shell.y >= -40 && shell.y <= 580) {
        survivors.push(shell);
      }
    }
    this.shells = survivors;
    this.ships = this.ships.filter((ship) => ship.hp > 0);
  }

  updateBursts(step) {
    for (const burst of this.bursts) {
      burst.life -= step;
      burst.alpha = clamp(burst.life / 0.42, 0, 1);
      burst.radius += step * 36;
    }
    this.bursts = this.bursts.filter((burst) => burst.life > 0);
  }

  update(step) {
    this.time += step;
    if (this.mode !== "playing") {
      this.pointer.clicked = false;
      this.spaceQueued = false;
      this.rotateQueued = 0;
      return;
    }

    if (this.rotateQueued !== 0) {
      this.rotation += this.rotateQueued;
      this.rotateQueued = 0;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - step);
    this.phaseTimer = Math.max(0, this.phaseTimer - step);

    if (this.phase === "rebuild") {
      if (this.pointer.clicked) {
        this.placeCurrentPiece();
      }
      if (this.spaceQueued || this.phaseTimer === 0 || this.materials === 0) {
        this.setupDefend();
      }
    } else if (this.phase === "defend") {
      if (this.pointer.down) {
        this.firePlayerShell();
      }
      for (const ship of this.ships) {
        ship.reload -= step;
        if (ship.reload <= 0) {
          this.fireEnemyShell(ship);
        }
      }
      this.updateShells(step);
      if (this.mode !== "playing") {
        this.pointer.clicked = false;
        this.spaceQueued = false;
        return;
      }
      if (this.ships.length === 0) {
        this.score += 150 + Math.round(this.phaseTimer * 5);
        this.nextWave();
      } else if (this.phaseTimer === 0) {
        this.nextWave();
      }
    }

    this.updateBursts(step);
    this.pointer.clicked = false;
    this.spaceQueued = false;
  }

  getFrameState() {
    const ghost = this.phase === "rebuild" ? this.getGhostCells() : { cells: [], valid: false };
    const piece = PIECES[this.pieceIndex];
    const cannonX = 480;
    const cannonY = 424;
    return {
      time: this.time,
      phase: this.phase,
      phaseLabel: this.phase === "rebuild" ? `Rebuild ${this.waveIndex + 1}/${MAX_WAVES}  ${this.phaseTimer.toFixed(1)}s` : `Defend ${this.waveIndex + 1}/${MAX_WAVES}  ${this.phaseTimer.toFixed(1)}s`,
      instruction: this.phase === "rebuild" ? "Place wall pieces before the bombardment starts." : "Hold click to fire. Sink the fleet or outlast the barrage.",
      pieceLabel: this.phase === "rebuild" ? `${piece.name} piece · ${ghost.valid ? "placeable" : "blocked"}` : "Aim from the breach line and break ships before their reload cycles.",
      keepHp: this.keepHp,
      wave: this.waveIndex + 1,
      score: this.score,
      materials: this.materials,
      grid: this.grid,
      ships: this.ships,
      shells: this.shells,
      bursts: this.bursts,
      cannon: {
        x: cannonX,
        y: cannonY,
        angle: Math.atan2(this.pointer.y - cannonY, this.pointer.x - cannonX)
      },
      ghost
    };
  }
}
