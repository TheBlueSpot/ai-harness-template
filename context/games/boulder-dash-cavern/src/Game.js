import { LEVELS } from "./levels.js";

const TILE = {
  WALL: "#",
  DIRT: ".",
  EMPTY: " ",
  ROCK: "O",
  GEM: "*",
  EXIT: "X"
};

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

const ENEMY_RULE = [1, 0, 3, 2];
const RULE_LEGEND = [
  "Collect every gem before the exit opens.",
  "Patrols only travel through empty or dug tiles, so dirt is temporary cover.",
  "You can only push boulders sideways into open space.",
  "Amber shafts mark active or potential drop lanes before you dig underneath them."
];
const LEVEL_CONFIGS = [
  {
    brief: "Open with safe tunnels, then collect every gem to unlock the exit.",
    enemySpeed: 1.1,
    routeHint: {
      focus: "Opening line",
      detail: "Take the upper gem first, then drop through the center before patrol lanes open fully.",
      path: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 8, y: 1 },
        { x: 8, y: 6 },
        { x: 11, y: 6 }
      ]
    },
    threat: "Warm-up pressure",
    tips: [
      "Open a clean tunnel before you chase the upper gem.",
      "Patrols only threaten dug lanes, so leave dirt as cover until you need it.",
      "Once every gem is gone, exit fast before patrol routes grow."
    ]
  },
  {
    brief: "This cavern teaches boulder routing: clear the widened top-left bailout first, then work side-push rocks from safe lanes.",
    enemySpeed: 1.28,
    routeHint: {
      focus: "Safe opening",
      detail: "Grab the top-left gem, rotate through the widened left elbow, then drop into the lower pocket before you challenge the middle boulders.",
      path: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 3, y: 6 },
        { x: 3, y: 12 },
        { x: 16, y: 12 },
        { x: 16, y: 9 }
      ]
    },
    threat: "Patrol chase",
    tips: [
      "Take the top-left pocket first while the widened elbow still gives you a clean bailout.",
      "Amber lanes mark where a loose rock will drop if you dig its support.",
      "Middle boulders are for side pushes, not head-on digs."
    ]
  },
  {
    brief: "Final cavern mixes patrol pressure with tighter rock timing. Clear lanes before you commit.",
    enemySpeed: 1.42,
    routeHint: {
      focus: "Pressure lane",
      detail: "Open one corridor at a time. The route line shows the clean loop back to the exit after the last gem falls.",
      path: [
        { x: 1, y: 1 },
        { x: 6, y: 1 },
        { x: 6, y: 6 },
        { x: 14, y: 6 },
        { x: 14, y: 12 },
        { x: 16, y: 12 },
        { x: 16, y: 1 }
      ]
    },
    threat: "Exit-rush gauntlet",
    tips: [
      "Clear one pressure lane at a time instead of opening the whole cavern.",
      "Use falling rocks to break patrol timing before you dive low.",
      "When the exit opens, commit to the lane you already made."
    ]
  }
];

export class Game {
  constructor() {
    this.stepInterval = 0.12;
    this.accumulator = 0;
    this.mode = "menu";
    this.levelIndex = 0;
    this.score = 0;
    this.message = "Collect every gem, then reach the exit.";
    this.input = {
      move: null,
      confirm: false,
      restart: false
    };
    this.setupLevel(0);
  }

  setupLevel(index) {
    const rows = LEVELS[index];
    this.levelIndex = index;
    this.height = rows.length;
    this.width = rows[0].length;
    this.grid = rows.map((row) => row.split(""));
    this.falling = new Set();
    this.enemies = [];
    this.enemyMoveCharge = 0;
    this.player = { x: 1, y: 1, alive: true };
    this.exit = { x: 0, y: 0, open: false };
    this.gemsRemaining = 0;
    this.totalGems = 0;
    this.levelConfig = LEVEL_CONFIGS[index] ?? LEVEL_CONFIGS[0];

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const cell = this.grid[y][x];
        if (cell === "P") {
          this.player.x = x;
          this.player.y = y;
          this.grid[y][x] = TILE.EMPTY;
        } else if (cell === "F") {
          this.enemies.push({ x, y, dir: 1, alive: true });
          this.grid[y][x] = TILE.EMPTY;
        } else if (cell === TILE.GEM) {
          this.gemsRemaining += 1;
        } else if (cell === TILE.EXIT) {
          this.exit = { x, y, open: false };
        }
      }
    }

    this.totalGems = this.gemsRemaining;
    this.message = `Cavern ${index + 1}. Collect ${this.gemsRemaining} gems.`;
    this.brief = this.levelConfig.brief;
    this.tips = this.levelConfig.tips;
    this.routeHint = this.levelConfig.routeHint;
    this.accumulator = 0;
  }

  start() {
    this.score = 0;
    this.setupLevel(0);
    this.mode = "ready";
  }

  restart() {
    this.mode = "playing";
    this.setupLevel(this.levelIndex);
  }

  queueMove(move) {
    this.input.move = move;
  }

  confirm() {
    this.input.confirm = true;
  }

  requestRestart() {
    this.input.restart = true;
  }

  update(dt) {
    if (this.input.restart) {
      if (this.mode === "menu" || this.mode === "win") this.start();
      else this.restart();
    }

    if ((this.mode === "menu" || this.mode === "win") && this.input.confirm) {
      this.start();
    } else if (this.mode === "lose" && this.input.confirm) {
      this.restart();
    } else if (this.mode === "ready" && this.input.confirm) {
      this.mode = "playing";
    }

    this.input.confirm = false;
    this.input.restart = false;

    if (this.mode !== "playing") {
      this.input.move = null;
      return;
    }

    this.accumulator += dt;
    while (this.accumulator >= this.stepInterval) {
      this.accumulator -= this.stepInterval;
      this.step();
      if (this.mode !== "playing") {
        this.accumulator = 0;
        break;
      }
    }
  }

  step() {
    this.applyPlayerMove();
    this.updateFallingObjects();
    this.updateExitState();
    this.updateEnemiesWithPacing();
    this.checkPlayerEnemyTouch();
  }

  applyPlayerMove() {
    const move = this.input.move;
    this.input.move = null;
    if (!move) return;

    const targetX = this.player.x + move.x;
    const targetY = this.player.y + move.y;
    const cell = this.getCell(targetX, targetY);

    if (this.enemyAt(targetX, targetY)) {
      this.killPlayer("Patrol caught you. Retry fast.");
      return;
    }

    if (cell === TILE.WALL) return;

    if (cell === TILE.ROCK && move.y === 0) {
      const pushX = targetX + move.x;
      if (this.getCell(pushX, targetY) === TILE.EMPTY && !this.isFalling(targetX, targetY)) {
        this.setCell(pushX, targetY, TILE.ROCK);
        this.setCell(targetX, targetY, TILE.EMPTY);
        this.movePlayer(targetX, targetY);
      }
      return;
    }

    if (cell === TILE.DIRT || cell === TILE.EMPTY) {
      this.movePlayer(targetX, targetY);
      return;
    }

    if (cell === TILE.GEM) {
      this.score += 100;
      this.gemsRemaining -= 1;
      this.setCell(targetX, targetY, TILE.EMPTY);
      this.movePlayer(targetX, targetY);
      this.message =
        this.gemsRemaining > 0
          ? `${this.gemsRemaining} gems left. Keep your escape lane intact.`
          : "Exit is live. Patrols accelerate now, so run your carved lane home.";
      return;
    }

    if (cell === TILE.EXIT && this.exit.open) {
      this.score += 500;
      if (this.levelIndex === LEVELS.length - 1) {
        this.mode = "win";
        this.message = "Every cavern clear. Clean run.";
      } else {
        this.setupLevel(this.levelIndex + 1);
        this.mode = "ready";
      }
    }
  }

  movePlayer(x, y) {
    this.player.x = x;
    this.player.y = y;
  }

  updateExitState() {
    this.exit.open = this.gemsRemaining <= 0;
  }

  updateEnemiesWithPacing() {
    const phase = this.getPhaseState();
    const baseSpeed = (this.levelConfig.enemySpeed ?? 1) * phase.speedMultiplier;
    this.enemyMoveCharge += baseSpeed;
    while (this.enemyMoveCharge >= 1 && this.mode === "playing") {
      this.enemyMoveCharge -= 1;
      this.updateEnemies();
      this.checkPlayerEnemyTouch();
    }
  }

  updateFallingObjects() {
    const nextFalling = new Set();
    for (let y = this.height - 2; y >= 1; y -= 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const cell = this.getCell(x, y);
        if (cell !== TILE.ROCK && cell !== TILE.GEM) continue;

        const key = this.makeKey(x, y);
        const below = this.getCell(x, y + 1);
        const wasFalling = this.falling.has(key);

        if (this.player.x === x && this.player.y === y + 1) {
          this.setCell(x, y, TILE.EMPTY);
          this.setCell(x, y + 1, cell);
          this.killPlayer("Crushed by a falling boulder.");
          continue;
        }

        const enemyBelow = this.enemyAt(x, y + 1);
        if (enemyBelow) {
          this.setCell(x, y, TILE.EMPTY);
          this.setCell(x, y + 1, cell);
          enemyBelow.alive = false;
          this.score += 250;
          this.message = "Rock crush. Keep using the cave.";
          nextFalling.add(this.makeKey(x, y + 1));
          continue;
        }

        if (below === TILE.EMPTY) {
          this.setCell(x, y, TILE.EMPTY);
          this.setCell(x, y + 1, cell);
          nextFalling.add(this.makeKey(x, y + 1));
          continue;
        }

        if (this.canRoll(x, y, -1)) {
          this.setCell(x, y, TILE.EMPTY);
          this.setCell(x - 1, y + 1, cell);
          nextFalling.add(this.makeKey(x - 1, y + 1));
          continue;
        }

        if (this.canRoll(x, y, 1)) {
          this.setCell(x, y, TILE.EMPTY);
          this.setCell(x + 1, y + 1, cell);
          nextFalling.add(this.makeKey(x + 1, y + 1));
        }
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
    this.falling = nextFalling;
  }

  canRoll(x, y, dir) {
    const side = this.getCell(x + dir, y);
    const downSide = this.getCell(x + dir, y + 1);
    const below = this.getCell(x, y + 1);
    const blockedBelow = below === TILE.ROCK || below === TILE.GEM || below === TILE.WALL || below === TILE.EXIT;
    const destinationBlocked = this.enemyAt(x + dir, y + 1) || (this.player.x === x + dir && this.player.y === y + 1);
    return blockedBelow && side === TILE.EMPTY && downSide === TILE.EMPTY && !destinationBlocked;
  }

  updateEnemies() {
    for (const enemy of this.enemies) {
      let moved = false;
      for (const candidate of ENEMY_RULE) {
        const nextDir = (enemy.dir + candidate) % 4;
        const step = DIRS[nextDir];
        const nx = enemy.x + step.x;
        const ny = enemy.y + step.y;
        const cell = this.getCell(nx, ny);
        if (cell !== TILE.EMPTY && cell !== TILE.DIRT) continue;
        if (this.enemyAt(nx, ny)) continue;
        enemy.x = nx;
        enemy.y = ny;
        enemy.dir = nextDir;
        moved = true;
        break;
      }
      if (!moved) enemy.dir = (enemy.dir + 2) % 4;
    }
  }

  checkPlayerEnemyTouch() {
    if (this.enemyAt(this.player.x, this.player.y)) {
      this.killPlayer("Patrol boxed you in.");
    }
  }

  killPlayer(message) {
    this.mode = "lose";
    this.player.alive = false;
    this.message = message;
  }

  enemyAt(x, y) {
    return this.enemies.find((enemy) => enemy.alive && enemy.x === x && enemy.y === y) || null;
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return TILE.WALL;
    return this.grid[y][x];
  }

  setCell(x, y, value) {
    this.grid[y][x] = value;
  }

  isFalling(x, y) {
    return this.falling.has(this.makeKey(x, y));
  }

  makeKey(x, y) {
    return `${x},${y}`;
  }

  getFrameState() {
    return {
      mode: this.mode,
      level: this.levelIndex + 1,
      totalLevels: LEVELS.length,
      score: this.score,
      gemsRemaining: this.gemsRemaining,
      message: this.message,
      brief: this.brief,
      tips: this.tips,
      legend: RULE_LEGEND,
      objective: this.getObjective(),
      phase: this.getPhaseState(),
      routeCoach: this.getRouteCoach(),
      routeHint: this.routeHint,
      threat: this.getThreatLabel(),
      exit: this.exit,
      grid: this.grid,
      dropHints: this.getDropHints(),
      enemies: this.enemies.filter((enemy) => enemy.alive),
      player: this.player,
      falling: this.falling
    };
  }

  getObjective() {
    if (this.mode === "menu") {
      return {
        title: "Collect gems, then escape.",
        detail: "Plan a tunnel that grabs every gem without opening too many patrol lanes at once."
      };
    }

    if (this.mode === "ready") {
      return {
        title: this.routeHint?.focus ?? "Route briefing",
        detail: this.routeHint?.detail ?? this.brief
      };
    }

    if (this.exit.open) {
      return {
        title: "Exit is open.",
        detail: "Stop exploring and sprint the lane you already carved before patrol speed ramps over it."
      };
    }

    return {
      title: `Collect ${this.gemsRemaining} gem${this.gemsRemaining === 1 ? "" : "s"}.`,
      detail: "Use dirt as temporary cover and only dig under boulders when the amber drop lane is safe."
    };
  }

  getThreatLabel() {
    if (this.mode === "menu") return "Briefing";
    if (this.mode === "ready") return this.levelConfig.threat;
    if (this.mode === "lose") return "Collapsed";
    if (this.mode === "win") return "Clear";
    if (this.exit.open) return `${this.levelConfig.threat} + exit rush`;
    return this.levelConfig.threat;
  }

  getDropHints() {
    const hints = [];
    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const tile = this.grid[y][x];
        if (tile !== TILE.ROCK && tile !== TILE.GEM) continue;

        const below = this.getCell(x, y + 1);
        if (below !== TILE.EMPTY && below !== TILE.DIRT) continue;

        const cells = [];
        for (let scanY = y + 1; scanY < this.height - 1; scanY += 1) {
          const cell = this.getCell(x, scanY);
          if (cell === TILE.WALL || cell === TILE.ROCK || cell === TILE.GEM || cell === TILE.EXIT) break;
          cells.push({ x, y: scanY });
          if (cell === TILE.EMPTY) continue;
          if (cell === TILE.DIRT) continue;
        }

        if (cells.length > 0) {
          hints.push({
            active: below === TILE.EMPTY,
            cells
          });
        }
      }
    }
    return hints;
  }

  getProgressRatio() {
    if (!this.totalGems) {
      return 1;
    }
    return (this.totalGems - this.gemsRemaining) / this.totalGems;
  }

  getPhaseState() {
    if (this.mode === "menu") {
      return {
        label: "Briefing",
        detail: "Read cave rules, then drop in with one safe route already in mind.",
        speedMultiplier: 1
      };
    }

    if (this.mode === "ready") {
      return {
        label: "Route preview",
        detail: this.routeHint?.detail ?? this.brief,
        speedMultiplier: 1
      };
    }

    if (this.mode === "lose") {
      return {
        label: "Collapsed",
        detail: "Restart fast and keep one cleaner fallback lane open.",
        speedMultiplier: 1
      };
    }

    if (this.mode === "win") {
      return {
        label: "Clear",
        detail: "Every cavern escaped.",
        speedMultiplier: 1
      };
    }

    if (this.exit.open) {
      return {
        label: "Exit sprint",
        detail: "Patrols are at max pressure now. Stop exploring and run the lane you already carved.",
        speedMultiplier: 1.55
      };
    }

    const progress = this.getProgressRatio();
    if (progress < 0.34) {
      return {
        label: "Scout dig",
        detail: "Open only the first safe pockets so dirt still blocks long patrol routes behind you.",
        speedMultiplier: 1
      };
    }

    if (progress < 0.6) {
      return {
        label: "Gem sweep",
        detail: "Mid-cavern lanes are live now, so each extra tunnel should pay for a gem or your return route.",
        speedMultiplier: 1.2
      };
    }

    return {
      label: "Collapse pressure",
      detail: "Most cover is gone. Finish the last gem with your escape tunnel already connected.",
      speedMultiplier: 1.38
    };
  }

  getRouteCoach() {
    if (this.mode === "menu" || this.mode === "ready") {
      return {
        title: this.routeHint?.focus ?? "Route focus",
        detail: this.routeHint?.detail ?? this.brief
      };
    }

    if (this.mode === "lose") {
      return {
        title: "Retry cue",
        detail: "Reopen less cave on the next run so patrols have fewer lanes to borrow."
      };
    }

    if (this.mode === "win") {
      return {
        title: "Clean route",
        detail: "You kept pressure readable long enough to finish every cavern."
      };
    }

    if (this.exit.open) {
      return {
        title: "Escape lane",
        detail: "Ignore stray rocks and side pockets. The only good move now is the shortest run back to the open exit."
      };
    }

    const progress = this.getProgressRatio();
    if (progress < 0.34) {
      return {
        title: this.routeHint?.focus ?? "Opening line",
        detail: this.routeHint?.detail ?? "Take the first clean pocket before you open the cave too wide."
      };
    }

    if (progress < 0.6) {
      return {
        title: "Protect return lane",
        detail: "Keep one dirt-backed fallback intact while you harvest middle gems and side-push boulders."
      };
    }

    return {
      title: "Last-gem commit",
      detail: "Take the final gem only when its tunnel already points back toward the exit."
    };
  }
}
