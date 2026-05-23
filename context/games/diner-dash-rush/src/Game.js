export const WIDTH = 1280;
export const HEIGHT = 720;

const FLOOR = { x: 112, y: 116, width: 1056, height: 544 };
const HOST_STAND = { x: 168, y: 198, radius: 54 };
const KITCHEN = { x: 1042, y: 192, radius: 74 };
const MAX_WALKOUTS = 5;
const PLAYER_SPEED = 392;
const QUEUE_LIMIT = 4;
const EARLY_SHIFT_PATIENCE_MULTIPLIER = [0.82, 0.92, 1];

const SHIFTS = [
  { quota: 4, duration: 78, spawnMin: 5.1, spawnMax: 7.2 },
  { quota: 5, duration: 82, spawnMin: 4.3, spawnMax: 6.2 },
  { quota: 6, duration: 86, spawnMin: 3.7, spawnMax: 5.4 },
];

const TABLE_LAYOUT = [
  { id: "table-1", x: 386, y: 218, seats: 2 },
  { id: "table-2", x: 630, y: 218, seats: 4 },
  { id: "table-3", x: 878, y: 218, seats: 2 },
  { id: "table-4", x: 386, y: 476, seats: 4 },
  { id: "table-5", x: 630, y: 476, seats: 2 },
  { id: "table-6", x: 878, y: 476, seats: 3 },
];

const PARTY_NAMES = ["Salad", "Burgers", "Pancakes", "Milkshakes", "Fries", "Chili", "Pie"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function rand(min, max) {
  return lerp(min, max, Math.random());
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function patienceMultiplierForShift(shiftIndex) {
  return EARLY_SHIFT_PATIENCE_MULTIPLIER[shiftIndex] ?? 1;
}

function formatCarry(carry) {
  if (!carry) {
    return "Empty";
  }
  return `Dish ${carry.tableLabel}`;
}

function makeParty(index = 0) {
  const size = 1 + Math.floor(Math.random() * 3);
  return {
    id: `party-${Math.random().toString(36).slice(2, 8)}`,
    size,
    meal: pick(PARTY_NAMES),
    patience: 1,
    mood: index === 0 ? "fresh" : "waiting",
  };
}

function createTable(config) {
  return {
    ...config,
    radius: config.seats >= 4 ? 72 : 62,
    status: "empty",
    party: null,
    patience: 0,
    dirtyLevel: 0,
    meal: "",
    seatPulse: 0,
  };
}

function taskFor(label, detail, target, priority = "normal") {
  return { label, detail, target, priority };
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.mode = "menu";
    this.shiftIndex = 0;
    this.score = 0;
    this.walkouts = 0;
    this.transitionTimer = 0;
    this.status = "Seat guests, take orders, serve fast, then clear the table.";
    this.player = {
      x: FLOOR.x + 120,
      y: FLOOR.y + FLOOR.height - 70,
      moveX: 0,
      moveY: 0,
      facing: 1,
      carry: null,
    };
    this.queue = [];
    this.tables = TABLE_LAYOUT.map(createTable);
    this.kitchenReady = [];
    this.spawnTimer = 2.2;
    this.servedThisShift = 0;
    this.phasePulse = 0;
    this.resetShiftState();
  }

  resetShiftState() {
    const shift = SHIFTS[this.shiftIndex];
    this.timeLeft = shift.duration;
    this.servedThisShift = 0;
    this.spawnTimer = 2.4;
    this.transitionTimer = 0;
    this.kitchenReady = [];
    this.queue = [];
    this.player.carry = null;
    this.tables = TABLE_LAYOUT.map(createTable);
  }

  start() {
    if (this.mode !== "menu") {
      return;
    }
    this.mode = "playing";
    this.status = "Seat the first party from the host stand.";
  }

  setMove(x, y) {
    this.player.moveX = x;
    this.player.moveY = y;
    if (x !== 0) {
      this.player.facing = x > 0 ? 1 : -1;
    }
  }

  handleInteract() {
    if (this.mode !== "playing" || this.transitionTimer > 0) {
      return;
    }

    if (this.isNear(this.player, HOST_STAND, HOST_STAND.radius + 18)) {
      if (this.queue.length === 0) {
        this.status = "No party waiting. Use the downtime to clear the floor.";
        return;
      }
      const table = this.tables.find((entry) => entry.status === "empty");
      if (!table) {
        this.status = "No clean table open. Clear or serve before seating more guests.";
        return;
      }
      const party = this.queue.shift();
      table.status = "waiting-order";
      table.party = party;
      table.patience = 1;
      table.meal = party.meal;
      table.dirtyLevel = 0;
      table.seatPulse = 1;
      this.score += 35;
      this.status = `${party.meal} seated at ${this.tableLabel(table)}. Take the order before patience drops.`;
      return;
    }

    if (this.isNear(this.player, KITCHEN, KITCHEN.radius + 18)) {
      if (this.player.carry) {
        this.status = "Hands full. Serve the current dish first.";
        return;
      }
      if (this.kitchenReady.length === 0) {
        this.status = "Kitchen is still cooking. Check the tables or seat the line.";
        return;
      }
      const ready = this.kitchenReady.shift();
      ready.status = "waiting-serve";
      this.player.carry = {
        tableId: ready.id,
        tableLabel: this.tableLabel(ready),
        meal: ready.meal,
      };
      this.status = `${ready.meal} plated for ${this.tableLabel(ready)}. Deliver it now.`;
      return;
    }

    const table = this.closestTable(92);
    if (!table) {
      this.status = "Interact near the host stand, kitchen, or a table to keep the shift moving.";
      return;
    }

    if (table.status === "waiting-order") {
      table.status = "cooking";
      table.patience = clamp(table.patience + 0.08, 0, 1);
      table.cookTimer = rand(8.2, 12.1);
      this.score += 55;
      this.status = `Order punched in for ${this.tableLabel(table)}. Watch the kitchen for the plate.`;
      return;
    }

    if (table.status === "waiting-serve") {
      if (!this.player.carry || this.player.carry.tableId !== table.id) {
        this.status = `Wrong dish. Pick up ${table.meal} for ${this.tableLabel(table)} at the kitchen.`;
        return;
      }
      table.status = "eating";
      table.eatTimer = rand(6.2, 8.8);
      table.patience = 1;
      this.player.carry = null;
      this.score += 130;
      this.status = `${this.tableLabel(table)} served. Clear them as soon as they finish.`;
      return;
    }

    if (table.status === "dirty") {
      table.status = "empty";
      table.party = null;
      table.patience = 0;
      table.dirtyLevel = 0;
      table.meal = "";
      this.score += 40;
      this.status = `${this.tableLabel(table)} reset. Seat the next waiting party.`;
      return;
    }

    if (table.status === "eating") {
      this.status = `${this.tableLabel(table)} is eating. Sweep to the next task.`;
      return;
    }

    if (table.status === "cooking") {
      this.status = `${this.tableLabel(table)} is already cooking. Grab another task while the kitchen works.`;
      return;
    }

    this.status = `${this.tableLabel(table)} is ready for the next party. Seat from the host stand.`;
  }

  update(dt) {
    const step = Math.min(0.033, dt);
    this.phasePulse += step;
    this.updatePlayer(step);
    this.tables.forEach((table) => {
      table.seatPulse = Math.max(0, table.seatPulse - step * 1.8);
    });

    if (this.mode !== "playing") {
      return;
    }

    if (this.transitionTimer > 0) {
      this.transitionTimer = Math.max(0, this.transitionTimer - step);
      if (this.transitionTimer === 0) {
        if (this.shiftIndex === SHIFTS.length - 1) {
          this.mode = "win";
          this.status = "The diner survived the whole rush.";
        } else {
          this.shiftIndex += 1;
          this.resetShiftState();
          this.status = `Shift ${this.shiftIndex + 1} starts. Seat early to stay ahead of the wave.`;
        }
      }
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - step);
    this.spawnTimer -= step;

    if (this.spawnTimer <= 0 && this.queue.length < QUEUE_LIMIT) {
      this.queue.push(makeParty(this.queue.length));
      this.spawnTimer = rand(SHIFTS[this.shiftIndex].spawnMin, SHIFTS[this.shiftIndex].spawnMax);
      if (this.queue.length > 2) {
        this.status = "Queue is stacking. Seat the host line before patience snaps.";
      }
    }

    this.updateQueue(step);
    this.updateTables(step);

    if (this.walkouts >= MAX_WALKOUTS) {
      this.mode = "lose";
      this.status = "Too many walkouts. The rush broke the diner.";
      return;
    }

    if (this.timeLeft === 0 && this.servedThisShift < SHIFTS[this.shiftIndex].quota) {
      this.mode = "lose";
      this.status = "Shift timer ran out before quota. Reset and tighten the route.";
      return;
    }

    if (this.servedThisShift >= SHIFTS[this.shiftIndex].quota && this.transitionTimer === 0) {
      this.transitionTimer = 2.8;
      this.status =
        this.shiftIndex === SHIFTS.length - 1
          ? "Final quota cleared. Close out the floor."
          : `Quota hit. Shift ${this.shiftIndex + 2} opens in a moment.`;
    }
  }

  updatePlayer(dt) {
    const magnitude = Math.hypot(this.player.moveX, this.player.moveY) || 1;
    const dx = magnitude > 0 ? this.player.moveX / magnitude : 0;
    const dy = magnitude > 0 ? this.player.moveY / magnitude : 0;
    this.player.x = clamp(this.player.x + dx * PLAYER_SPEED * dt, FLOOR.x + 30, FLOOR.x + FLOOR.width - 30);
    this.player.y = clamp(this.player.y + dy * PLAYER_SPEED * dt, FLOOR.y + 30, FLOOR.y + FLOOR.height - 30);
  }

  updateQueue(dt) {
    const patienceMultiplier = patienceMultiplierForShift(this.shiftIndex);
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const party = this.queue[i];
      party.patience = Math.max(0, party.patience - dt * (0.029 + i * 0.006) * patienceMultiplier);
      if (party.patience === 0) {
        this.queue.splice(i, 1);
        this.walkouts += 1;
        this.status = "A waiting party walked out. Keep the host line moving.";
      }
    }
  }

  updateTables(dt) {
    const patienceMultiplier = patienceMultiplierForShift(this.shiftIndex);
    for (const table of this.tables) {
      if (table.status === "waiting-order") {
        table.patience = Math.max(0, table.patience - dt * 0.048 * patienceMultiplier);
        if (table.patience === 0) {
          this.walkoutFromTable(table, "Guests left before ordering. Clear the mess and recover.");
        }
      } else if (table.status === "cooking") {
        table.patience = Math.max(0, table.patience - dt * 0.026 * patienceMultiplier);
        table.cookTimer -= dt;
        if (table.cookTimer <= 0) {
          table.status = "ready-pickup";
          this.kitchenReady.push(table);
          this.score += 45;
          this.status = `${table.meal} is up in the kitchen for ${this.tableLabel(table)}.`;
        } else if (table.patience === 0) {
          this.walkoutFromTable(table, "Table walked out while waiting on the kitchen. Clear and reset.");
        }
      } else if (table.status === "waiting-serve" || table.status === "ready-pickup") {
        table.patience = Math.max(0, table.patience - dt * 0.052 * patienceMultiplier);
        if (table.patience === 0) {
          this.removeReadyDish(table.id);
          this.walkoutFromTable(table, "The food was late. That table bailed on the check.");
        }
      } else if (table.status === "eating") {
        table.eatTimer -= dt;
        if (table.eatTimer <= 0) {
          table.status = "dirty";
          table.dirtyLevel = 1;
          this.servedThisShift += 1;
          this.score += 150;
          this.status = `${this.tableLabel(table)} finished. Clear it and keep the next seat open.`;
        }
      }
    }
  }

  walkoutFromTable(table, message) {
    table.status = "dirty";
    table.party = null;
    table.patience = 0;
    table.dirtyLevel = 1;
    table.meal = "";
    this.walkouts += 1;
    this.score = Math.max(0, this.score - 30);
    this.status = message;
  }

  removeReadyDish(tableId) {
    this.kitchenReady = this.kitchenReady.filter((table) => table.id !== tableId);
    if (this.player.carry?.tableId === tableId) {
      this.player.carry = null;
    }
  }

  closestTable(distance) {
    let best = null;
    let bestDist = distance;
    for (const table of this.tables) {
      const d = Math.hypot(this.player.x - table.x, this.player.y - table.y);
      if (d <= bestDist) {
        best = table;
        bestDist = d;
      }
    }
    return best;
  }

  isNear(a, b, radius) {
    return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
  }

  tableLabel(table) {
    return `T${this.tables.findIndex((entry) => entry.id === table.id) + 1}`;
  }

  getNextTask() {
    if (this.mode !== "playing") {
      return taskFor("Open", "Start the shift from the floor rush prompt.", null);
    }

    if (this.player.carry) {
      const targetTable = this.tables.find((table) => table.id === this.player.carry.tableId);
      if (targetTable) {
        return taskFor(
          "Serve",
          `Bring ${this.player.carry.meal} to ${this.tableLabel(targetTable)}.`,
          { x: targetTable.x, y: targetTable.y },
          "urgent",
        );
      }
    }

    const criticalTable = this.tables
      .filter((table) =>
        table.status === "waiting-order" ||
        table.status === "ready-pickup" ||
        table.status === "waiting-serve" ||
        table.status === "dirty",
      )
      .sort((a, b) => {
        const aRank = a.status === "dirty" ? 1.05 : a.patience;
        const bRank = b.status === "dirty" ? 1.05 : b.patience;
        return aRank - bRank;
      })[0];

    if (criticalTable?.status === "waiting-order") {
      return taskFor(
        "Take Order",
        `Go to ${this.tableLabel(criticalTable)} before patience breaks.`,
        { x: criticalTable.x, y: criticalTable.y },
        criticalTable.patience < 0.4 ? "urgent" : "normal",
      );
    }

    if (criticalTable?.status === "ready-pickup") {
      return taskFor(
        "Kitchen",
        `Pick up ${criticalTable.meal} for ${this.tableLabel(criticalTable)}.`,
        { x: KITCHEN.x, y: KITCHEN.y },
        "urgent",
      );
    }

    if (criticalTable?.status === "waiting-serve") {
      return taskFor(
        "Serve",
        `${this.tableLabel(criticalTable)} is waiting on the plate.`,
        { x: criticalTable.x, y: criticalTable.y },
        criticalTable.patience < 0.45 ? "urgent" : "normal",
      );
    }

    if (criticalTable?.status === "dirty") {
      return taskFor(
        "Clear Table",
        `Bus ${this.tableLabel(criticalTable)} to free a new seat.`,
        { x: criticalTable.x, y: criticalTable.y },
      );
    }

    const emptyTable = this.tables.find((table) => table.status === "empty");
    if (this.queue.length > 0 && emptyTable) {
      return taskFor(
        "Seat Queue",
        `Go to HOST and seat the next party into ${this.tableLabel(emptyTable)}.`,
        { x: HOST_STAND.x, y: HOST_STAND.y },
      );
    }

    if (this.kitchenReady.length > 0) {
      return taskFor("Kitchen", "A plate is waiting at the pass.", { x: KITCHEN.x, y: KITCHEN.y });
    }

    if (this.queue.length > 0) {
      return taskFor("Make Space", "No clean table is open. Clear or serve first.", null);
    }

    return taskFor("Hold Route", "Stay central and watch for the next queue or kitchen call.", null);
  }

  getFrameState() {
    const nextTask = this.getNextTask();
    return {
      mode: this.mode,
      width: WIDTH,
      height: HEIGHT,
      floor: FLOOR,
      hostStand: HOST_STAND,
      kitchen: KITCHEN,
      shift: this.shiftIndex + 1,
      shiftCount: SHIFTS.length,
      quota: SHIFTS[this.shiftIndex].quota,
      served: this.servedThisShift,
      timeLeft: this.timeLeft,
      maxWalkouts: MAX_WALKOUTS,
      walkouts: this.walkouts,
      score: this.score,
      queue: this.queue.map((party, index) => ({
        size: party.size,
        meal: party.meal,
        patience: party.patience,
        index,
      })),
      kitchenReadyCount: this.kitchenReady.length,
      tables: this.tables.map((table) => ({
        id: table.id,
        x: table.x,
        y: table.y,
        radius: table.radius,
        seats: table.seats,
        status: table.status,
        patience: table.patience,
        meal: table.meal,
        eatTimer: table.eatTimer ?? 0,
        label: this.tableLabel(table),
        seatPulse: table.seatPulse,
      })),
      player: {
        x: this.player.x,
        y: this.player.y,
        facing: this.player.facing,
        carry: this.player.carry ? { ...this.player.carry } : null,
      },
      carryLabel: formatCarry(this.player.carry),
      nextTask,
      status: this.status,
      transitionTimer: this.transitionTimer,
      overlay: this.getOverlayState(),
      pulse: this.phasePulse,
    };
  }

  getOverlayState() {
    if (this.mode === "menu") {
      return {
        eyebrow: "floor rush",
        title: "Diner Dash Rush",
        copy:
          "Seat parties from the host stand, take table orders, grab dishes when the kitchen calls them, and clear dirty tables before patience collapses the shift.",
        button: "Open the Diner",
      };
    }
    if (this.mode === "win") {
      return {
        eyebrow: "service clear",
        title: "Rush Survived",
        copy: `All three shifts cleared with ${this.score} score and ${this.walkouts} walkouts. Restart for a cleaner route.`,
        button: "Run It Again",
      };
    }
    if (this.mode === "lose") {
      return {
        eyebrow: "service break",
        title: "Floor Fell Behind",
        copy: `Final score ${this.score}. Keep the host line short, get orders in sooner, and never let dirty tables block seats.`,
        button: "Retry Shift",
      };
    }
    return null;
  }
}
