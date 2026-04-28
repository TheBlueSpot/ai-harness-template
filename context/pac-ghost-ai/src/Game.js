(() => {
const { createMaze, isWall, key, MAZE_HEIGHT, MAZE_WIDTH, TILE_SIZE, wrapTileX } = window.PacGhostMaze;

const DIRECTIONS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const DIRECTION_ORDER = ["left", "up", "right", "down"];
const OPPOSITE = { left: "right", right: "left", up: "down", down: "up" };
const GHOST_NAMES = ["blinky", "pinky", "inky", "clyde"];

const GHOST_COLORS = {
  blinky: "#ff4d6d",
  pinky: "#ff8ad8",
  inky: "#5ce1e6",
  clyde: "#ffb15e",
};

const SCATTER_TARGETS = {
  blinky: { x: MAZE_WIDTH - 2, y: 1 },
  pinky: { x: 1, y: 1 },
  inky: { x: MAZE_WIDTH - 2, y: MAZE_HEIGHT - 2 },
  clyde: { x: 1, y: MAZE_HEIGHT - 2 },
};

const PLAYER_SPEED = 112;
const GHOST_SPEED = 100;
const FRIGHTENED_SPEED = 74;
const EATEN_SPEED = 180;
const POWER_DURATION = 7;
const ROUND_START_DELAY = 1.1;
const COLLISION_DISTANCE = TILE_SIZE * 0.45;
const FINAL_LEVEL = 3;
const MODE_SCRIPT = [
  { mode: "scatter", duration: 7 },
  { mode: "chase", duration: 20 },
  { mode: "scatter", duration: 7 },
  { mode: "chase", duration: 20 },
  { mode: "scatter", duration: 5 },
  { mode: "chase", duration: Infinity },
];

function toPixels(tile) {
  return {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
}

function makeActor(tile, direction, speed) {
  const px = toPixels(tile);
  return {
    x: px.x,
    y: px.y,
    direction,
    desiredDirection: direction,
    speed,
  };
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function tileFromPixels(entity) {
  return {
    x: Math.round((entity.x - TILE_SIZE * 0.5) / TILE_SIZE),
    y: Math.round((entity.y - TILE_SIZE * 0.5) / TILE_SIZE),
  };
}

function centeredOnTile(entity) {
  const tile = tileFromPixels(entity);
  const center = toPixels(tile);
  return Math.abs(entity.x - center.x) < 2 && Math.abs(entity.y - center.y) < 2;
}

class Game {
  constructor() {
    this.canvasWidth = MAZE_WIDTH * TILE_SIZE;
    this.canvasHeight = MAZE_HEIGHT * TILE_SIZE;
    this.bestScore = 0;
    this.restart();
  }

  restart() {
    this.level = 1;
    this.score = 0;
    this.lives = 3;
    this.mode = "menu";
    this.message = "Read the ghost patterns, then flip the hunt.";
    this.bestScore = Math.max(this.bestScore, this.score);
    this.buildRound();
  }

  start() {
    if (this.mode === "menu" || this.mode === "win" || this.mode === "lose") {
      if (this.mode !== "menu") {
        this.restart();
      }
      this.mode = "ready";
      this.roundDelay = ROUND_START_DELAY;
      this.message = "Ready...";
    }
  }

  buildRound() {
    this.maze = createMaze();
    this.player = makeActor(this.maze.spawns.player, "left", PLAYER_SPEED);
    this.ghosts = GHOST_NAMES.map((name, index) => {
      const ghost = makeActor(this.maze.spawns[name], index % 2 === 0 ? "left" : "right", GHOST_SPEED);
      return {
        ...ghost,
        name,
        color: GHOST_COLORS[name],
        home: { ...this.maze.spawns[name] },
        state: "normal",
        frightenedTimer: 0,
        releaseDelay: index * 1.5,
        scoreValue: 200,
      };
    });
    this.pendingDirection = "left";
    this.ghostCombo = 0;
    this.modeClock = 0;
    this.modeIndex = 0;
    this.globalGhostMode = MODE_SCRIPT[0].mode;
    this.roundDelay = ROUND_START_DELAY;
    this.frightenedTimer = 0;
    this.mode = this.mode === "menu" ? "menu" : "ready";
  }

  nextLevel() {
    if (this.level >= FINAL_LEVEL) {
      this.score += 1000;
      this.bestScore = Math.max(this.bestScore, this.score);
      this.mode = "win";
      this.message = "Maze cleared.";
      return;
    }

    this.level += 1;
    this.score += 500;
    this.bestScore = Math.max(this.bestScore, this.score);
    this.buildRound();
    this.mode = "ready";
    this.roundDelay = ROUND_START_DELAY;
    this.message = `Level ${this.level}`;
  }

  loseLife() {
    const pellets = new Set(this.maze.pellets);
    const powerPellets = new Set(this.maze.powerPellets);
    this.lives -= 1;
    if (this.lives <= 0) {
      this.mode = "lose";
      this.message = "The maze closed in.";
      this.bestScore = Math.max(this.bestScore, this.score);
      return;
    }

    const keepScore = this.score;
    const keepLevel = this.level;
    this.buildRound();
    this.score = keepScore;
    this.level = keepLevel;
    this.maze.pellets = pellets;
    this.maze.powerPellets = powerPellets;
    this.mode = "ready";
    this.roundDelay = ROUND_START_DELAY;
    this.message = "Lost a life. Resetting lanes.";
  }

  update(dt, input) {
    if (input.restartPressed) {
      this.restart();
      return;
    }

    if (input.startPressed) {
      this.start();
    }

    if (this.mode === "menu" || this.mode === "win" || this.mode === "lose") {
      return;
    }

    if (input.direction) {
      this.pendingDirection = input.direction;
    }

    if (this.mode === "ready") {
      this.roundDelay -= dt;
      if (this.roundDelay <= 0) {
        this.mode = "playing";
        this.message = "Scatter";
      }
      return;
    }

    this.updateModeTimers(dt);
    this.movePlayer(dt);
    this.consumePellets();
    this.moveGhosts(dt);
    this.handleCollisions();

    if (this.maze.pellets.size === 0 && this.maze.powerPellets.size === 0) {
      this.nextLevel();
    }

    this.bestScore = Math.max(this.bestScore, this.score);
  }

  updateModeTimers(dt) {
    if (this.frightenedTimer > 0) {
      this.frightenedTimer = Math.max(0, this.frightenedTimer - dt);
      if (this.frightenedTimer === 0) {
        this.ghostCombo = 0;
      }
    }

    const script = MODE_SCRIPT[this.modeIndex];
    if (script.duration === Infinity) {
      this.globalGhostMode = script.mode;
    } else {
      this.modeClock += dt;
      if (this.modeClock >= script.duration) {
        this.modeClock = 0;
        this.modeIndex = Math.min(MODE_SCRIPT.length - 1, this.modeIndex + 1);
      }
      this.globalGhostMode = MODE_SCRIPT[this.modeIndex].mode;
    }

    this.message = this.frightenedTimer > 0 ? "Frightened" : capitalize(this.globalGhostMode);
  }

  movePlayer(dt) {
    this.tryTurn(this.player, this.pendingDirection);
    this.moveActor(this.player, dt);
    this.tryTurn(this.player, this.pendingDirection);
  }

  consumePellets() {
    const tile = tileFromPixels(this.player);
    const tileKey = key(tile.x, tile.y);

    if (this.maze.pellets.delete(tileKey)) {
      this.score += 10;
    } else if (this.maze.powerPellets.delete(tileKey)) {
      this.score += 50;
      this.frightenedTimer = POWER_DURATION;
      this.ghostCombo = 0;
      for (const ghost of this.ghosts) {
        if (ghost.state !== "eaten") {
          ghost.state = "frightened";
          ghost.direction = OPPOSITE[ghost.direction];
        }
      }
    }
  }

  moveGhosts(dt) {
    const playerTile = tileFromPixels(this.player);
    const blinkyTile = tileFromPixels(this.ghosts[0]);

    for (const ghost of this.ghosts) {
      if (ghost.releaseDelay > 0) {
        ghost.releaseDelay = Math.max(0, ghost.releaseDelay - dt);
        continue;
      }

      if (centeredOnTile(ghost)) {
        const nextDirection = this.chooseGhostDirection(ghost, playerTile, blinkyTile);
        if (nextDirection) {
          ghost.direction = nextDirection;
        }
      }

      ghost.speed = ghost.state === "eaten" ? EATEN_SPEED : ghost.state === "frightened" && this.frightenedTimer > 0 ? FRIGHTENED_SPEED : GHOST_SPEED + (this.level - 1) * 3;

      this.moveActor(ghost, dt);

      const ghostTile = tileFromPixels(ghost);
      if (ghost.state === "eaten" && ghostTile.x === ghost.home.x && ghostTile.y === ghost.home.y) {
        ghost.state = this.frightenedTimer > 0 ? "frightened" : "normal";
        ghost.releaseDelay = 0.5;
      } else if (ghost.state === "frightened" && this.frightenedTimer <= 0) {
        ghost.state = "normal";
      }
    }
  }

  handleCollisions() {
    for (const ghost of this.ghosts) {
      if (ghost.releaseDelay > 0) {
        continue;
      }

      if (distanceSquared(this.player, ghost) > COLLISION_DISTANCE * COLLISION_DISTANCE) {
        continue;
      }

      if (ghost.state === "frightened" && this.frightenedTimer > 0) {
        ghost.state = "eaten";
        ghost.releaseDelay = 0;
        this.ghostCombo += 1;
        const points = 200 * 2 ** (this.ghostCombo - 1);
        this.score += points;
        ghost.scoreValue = points;
      } else if (ghost.state !== "eaten") {
        this.loseLife();
      }

      return;
    }
  }

  chooseGhostDirection(ghost, playerTile, blinkyTile) {
    const tile = tileFromPixels(ghost);
    const options = DIRECTION_ORDER.filter((direction) => {
      if (OPPOSITE[ghost.direction] === direction && ghost.state !== "eaten") {
        const exits = this.availableDirections(tile);
        if (exits.length > 1) {
          return false;
        }
      }

      const dir = DIRECTIONS[direction];
      const nextX = wrapTileX(tile.x + dir.x);
      const nextY = tile.y + dir.y;
      return !isWall(this.maze.tiles, nextX, nextY);
    });

    if (!options.length) {
      return OPPOSITE[ghost.direction];
    }

    if (ghost.state === "frightened" && this.frightenedTimer > 0) {
      const frightIndex = Math.floor((this.frightenedTimer * 10 + tile.x + tile.y) % options.length);
      return options[frightIndex];
    }

    const target = this.getGhostTarget(ghost, playerTile, blinkyTile);
    let bestDirection = options[0];
    let bestDistance = Infinity;

    for (const direction of options) {
      const dir = DIRECTIONS[direction];
      const nextX = wrapTileX(tile.x + dir.x);
      const nextY = tile.y + dir.y;
      const dx = target.x - nextX;
      const dy = target.y - nextY;
      const score = dx * dx + dy * dy;

      if (score < bestDistance) {
        bestDistance = score;
        bestDirection = direction;
      }
    }

    return bestDirection;
  }

  availableDirections(tile) {
    return DIRECTION_ORDER.filter((direction) => {
      const dir = DIRECTIONS[direction];
      return !isWall(this.maze.tiles, wrapTileX(tile.x + dir.x), tile.y + dir.y);
    });
  }

  getGhostTarget(ghost, playerTile, blinkyTile) {
    if (ghost.state === "eaten") {
      return ghost.home;
    }

    if (this.globalGhostMode === "scatter") {
      return SCATTER_TARGETS[ghost.name];
    }

    const playerDirection = DIRECTIONS[this.player.direction];
    if (ghost.name === "blinky") {
      return playerTile;
    }

    if (ghost.name === "pinky") {
      return {
        x: wrapTileX(playerTile.x + playerDirection.x * 4),
        y: playerTile.y + playerDirection.y * 4,
      };
    }

    if (ghost.name === "inky") {
      const ahead = {
        x: wrapTileX(playerTile.x + playerDirection.x * 2),
        y: playerTile.y + playerDirection.y * 2,
      };
      return {
        x: wrapTileX(ahead.x + (ahead.x - blinkyTile.x)),
        y: ahead.y + (ahead.y - blinkyTile.y),
      };
    }

    const dx = playerTile.x - ghost.home.x;
    const dy = playerTile.y - ghost.home.y;
    if (dx * dx + dy * dy > 64) {
      return playerTile;
    }

    return SCATTER_TARGETS.clyde;
  }

  tryTurn(entity, direction) {
    if (!direction || !centeredOnTile(entity)) {
      return;
    }

    const tile = tileFromPixels(entity);
    const dir = DIRECTIONS[direction];
    const nextX = wrapTileX(tile.x + dir.x);
    const nextY = tile.y + dir.y;

    if (isWall(this.maze.tiles, nextX, nextY)) {
      return;
    }

    const center = toPixels(tile);
    entity.x = center.x;
    entity.y = center.y;
    entity.direction = direction;
  }

  moveActor(entity, dt) {
    const dir = DIRECTIONS[entity.direction];
    const distance = entity.speed * dt;
    let remaining = distance;

    while (remaining > 0) {
      const step = Math.min(remaining, 4);
      const nextX = entity.x + dir.x * step;
      const nextY = entity.y + dir.y * step;
      const probeX = nextX + dir.x * (TILE_SIZE * 0.35);
      const probeY = nextY + dir.y * (TILE_SIZE * 0.35);
      const tileX = wrapTileX(Math.floor(probeX / TILE_SIZE));
      const tileY = Math.floor(probeY / TILE_SIZE);

      if (isWall(this.maze.tiles, tileX, tileY)) {
        const currentTile = tileFromPixels(entity);
        const center = toPixels(currentTile);
        entity.x = center.x;
        entity.y = center.y;
        return;
      }

      entity.x = nextX;
      entity.y = nextY;
      if (entity.x < -TILE_SIZE * 0.5) {
        entity.x += MAZE_WIDTH * TILE_SIZE;
      } else if (entity.x > MAZE_WIDTH * TILE_SIZE + TILE_SIZE * 0.5) {
        entity.x -= MAZE_WIDTH * TILE_SIZE;
      }

      remaining -= step;
    }
  }

  getFrameState() {
    return {
      mode: this.mode,
      message: this.message,
      level: this.level,
      score: this.score,
      lives: this.lives,
      bestScore: this.bestScore,
      ghostMode: this.frightenedTimer > 0 ? "frightened" : this.globalGhostMode,
      pellets: [...this.maze.pellets].map((value) => value.split(",").map(Number)),
      powerPellets: [...this.maze.powerPellets].map((value) => value.split(",").map(Number)),
      mazeTiles: this.maze.tiles,
      tileSize: TILE_SIZE,
      player: { ...this.player },
      ghosts: this.ghosts.map((ghost) => ({ ...ghost })),
      dimensions: {
        width: this.canvasWidth,
        height: this.canvasHeight,
      },
    };
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

window.PacGhostGame = { Game };
})();
