const TILE_SIZE = 32;
const SURFACE_ROW = 6;
const COLS = 88;
const ROWS = 74;
const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 720;
const START_COL = Math.floor(COLS / 2);
const GOAL_CREDITS = 1800;
const GOAL_DEPTH = 900;

const TILE_TYPES = {
  dirt: { solid: true, hardness: 18, value: 4, cargo: 0.35, color: "#6f4d34" },
  rock: { solid: true, hardness: 34, value: 8, cargo: 0.5, color: "#7f726c" },
  coal: { solid: true, hardness: 24, value: 26, cargo: 0.75, color: "#2a2a33" },
  iron: { solid: true, hardness: 38, value: 58, cargo: 0.95, color: "#b8785d" },
  gold: { solid: true, hardness: 48, value: 110, cargo: 1.15, color: "#e2bb43" },
  crystal: { solid: true, hardness: 60, value: 180, cargo: 1.45, color: "#72e6ff" },
  lava: { solid: false, hazard: "lava", damage: 24, color: "#ff6b2d" },
  gas: { solid: false, hazard: "gas", damage: 10, color: "#99ffbf" },
  bedrock: { solid: true, hardness: 9999, value: 0, cargo: 0, color: "#20262f" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

class Game {
  constructor({ canvas, overlayRoot, dockPanel }) {
    this.canvas = canvas;
    this.overlayRoot = overlayRoot;
    this.dockPanel = dockPanel;
    this.view = { width: VIEW_WIDTH, height: VIEW_HEIGHT };
    this.tileSize = TILE_SIZE;
    this.surfaceY = SURFACE_ROW * TILE_SIZE;
    this.worldWidth = COLS * TILE_SIZE;
    this.worldHeight = ROWS * TILE_SIZE;
    this.camera = { x: 0, y: 0 };
    this.state = "title";
    this.message = "Drill down. Bring ore home.";
    this.messageTimer = 0;
    this.sparkles = [];
    this.drillFlash = null;
    this.previousDocked = false;
    this.createWorld();
    this.resetRun();
    this.updateOverlay();
    this.updateDockPanel();
  }

  createWorld() {
    const rand = randomFromSeed(0xC0AEBE11);
    this.world = Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) => this.makeTile(row, col, rand)),
    );
    for (let row = 0; row < 12; row += 1) {
      for (let col = START_COL - 2; col <= START_COL + 2; col += 1) {
        this.world[row][col] = null;
      }
    }
  }

  makeTile(row, col, rand) {
    if (row < SURFACE_ROW) return null;
    if (row >= ROWS - 1 || col <= 1 || col >= COLS - 2) return this.makeTileState("bedrock");
    if (row === SURFACE_ROW) return this.makeTileState("dirt");

    const depth = row - SURFACE_ROW;
    const caveChance = clamp(depth * 0.003 + Math.abs(col - START_COL) * 0.00025, 0.02, 0.14);
    const veinNoise = Math.sin(col * 0.38 + depth * 0.12) * 0.5 + 0.5;

    if (depth > 2 && rand() < caveChance * 0.45) return null;
    if (depth > 18 && rand() < 0.03 + veinNoise * 0.03) return this.makeTileState("gas");
    if (depth > 34 && rand() < 0.022 + veinNoise * 0.026) return this.makeTileState("lava");

    if (depth > 42 && rand() < 0.08 + veinNoise * 0.06) return this.makeTileState("crystal");
    if (depth > 28 && rand() < 0.12 + veinNoise * 0.07) return this.makeTileState("gold");
    if (depth > 16 && rand() < 0.14 + veinNoise * 0.08) return this.makeTileState("iron");
    if (depth > 7 && rand() < 0.18 + veinNoise * 0.06) return this.makeTileState("coal");
    if (depth > 22 && rand() < 0.38) return this.makeTileState("rock");
    return this.makeTileState("dirt");
  }

  makeTileState(type) {
    const definition = TILE_TYPES[type];
    return {
      type,
      hp: definition.hardness,
      maxHp: definition.hardness,
    };
  }

  resetRun() {
    this.player = {
      x: START_COL * TILE_SIZE + TILE_SIZE * 0.5,
      y: this.surfaceY - 46,
      vx: 0,
      vy: 0,
      width: 34,
      height: 22,
      maxFuel: 125,
      fuel: 125,
      maxHull: 100,
      hull: 100,
      cargo: 0,
      maxCargo: 14,
      cargoValue: 0,
      drillLevel: 1,
      drillRate: 28,
      landed: true,
    };
    this.cash = 120;
    this.deepestMeters = 0;
    this.state = "title";
    this.previousDocked = false;
    this.sparkles = [];
    this.drillFlash = null;
    this.message = "Surface dock ready.";
    this.messageTimer = 4;
    this.createWorld();
    this.updateOverlay();
    this.updateDockPanel();
  }

  startRun() {
    if (this.state === "running") return;
    this.state = "running";
    this.player.landed = false;
    this.message = "Run live. Dig rich. Return intact.";
    this.messageTimer = 3;
    this.updateOverlay();
  }

  finishRun(state, line) {
    this.state = state;
    this.message = line;
    this.messageTimer = 999;
    this.updateOverlay();
  }

  setMessage(text, time = 2.4) {
    this.message = text;
    this.messageTimer = time;
  }

  update(dt, input) {
    if (input.pointerStart || input.start) {
      if (this.state === "title") {
        this.startRun();
      } else if (this.state === "gameover" || this.state === "won") {
        this.resetRun();
        this.startRun();
      }
    }

    if (this.messageTimer > 0 && this.messageTimer < 900) {
      this.messageTimer = Math.max(0, this.messageTimer - dt);
    }

    if (this.state !== "running") {
      this.updateDockPanel();
      this.updateCamera();
      return;
    }

    this.updateMovement(dt, input);
    this.applyHazards(dt);
    this.updateDockState(input);
    this.updateEffects(dt);
    this.updateCamera();

    if (this.player.hull <= 0) {
      this.finishRun("gameover", "Hull broke under pressure. Surface crew found scrap.");
    }

    if (this.player.landed && this.cash >= GOAL_CREDITS && this.deepestMeters >= GOAL_DEPTH) {
      this.finishRun("won", "Core route mapped. Cargo sold. Breach cleared.");
    }

    this.updateDockPanel();
  }

  updateMovement(dt, input) {
    const loadRatio = clamp(this.player.cargo / this.player.maxCargo, 0, 1.3);
    const massFactor = 1 + loadRatio * 1.45;
    const thrust = 880 / massFactor;
    const gravity = 420 + massFactor * 36;
    const maxVX = 250 / (0.82 + loadRatio * 0.55);
    const maxVY = 320 / (0.9 + loadRatio * 0.4);

    let ax = 0;
    let ay = gravity;
    let usedFuel = false;

    if (this.player.fuel > 0) {
      if (input.left) {
        ax -= thrust;
        usedFuel = true;
      }
      if (input.right) {
        ax += thrust;
        usedFuel = true;
      }
      if (input.up) {
        ay -= thrust * 1.08;
        usedFuel = true;
      }
      if (input.down) {
        ay += thrust * 0.25;
        usedFuel = true;
      }
    }

    if (usedFuel) {
      this.player.fuel = Math.max(0, this.player.fuel - dt * (8 + loadRatio * 4));
      this.player.landed = false;
    }

    this.player.vx += ax * dt;
    this.player.vy += ay * dt;
    this.player.vx *= Math.pow(0.9, dt * 60);
    this.player.vy *= Math.pow(0.94, dt * 60);
    this.player.vx = clamp(this.player.vx, -maxVX, maxVX);
    this.player.vy = clamp(this.player.vy, -maxVY, maxVY);

    this.moveAxis("x", this.player.vx * dt, input, dt);
    this.moveAxis("y", this.player.vy * dt, input, dt);

    this.player.x = clamp(this.player.x, 48, this.worldWidth - 48);
    this.player.y = clamp(this.player.y, 32, this.worldHeight - this.player.height);

    const depthMeters = Math.max(0, Math.floor((this.player.y - this.surfaceY) * 3.2));
    this.deepestMeters = Math.max(this.deepestMeters, depthMeters);

    const pressureLimit = 440 + this.player.drillLevel * 190;
    if (depthMeters > pressureLimit) {
      const overflow = depthMeters - pressureLimit;
      this.player.hull = Math.max(0, this.player.hull - overflow * 0.012 * dt);
      if (overflow > 120) this.setMessage("Pressure redline. Drill upgrade or retreat.", 0.4);
    }
  }

  moveAxis(axis, amount, input, dt) {
    if (amount === 0) return;
    const nextX = axis === "x" ? this.player.x + amount : this.player.x;
    const nextY = axis === "y" ? this.player.y + amount : this.player.y;
    const contacts = this.getSolidContacts(nextX, nextY);
    if (contacts.length === 0) {
      this.player.x = nextX;
      this.player.y = nextY;
      return;
    }

    if (axis === "x") this.player.vx = 0;
    if (axis === "y") this.player.vy = 0;

    const wantsDrill =
      (axis === "x" && ((amount < 0 && input.left) || (amount > 0 && input.right))) ||
      (axis === "y" && amount > 0 && input.down) ||
      (axis === "y" && amount < 0 && input.up);

    if (wantsDrill && this.player.fuel > 0) {
      const target = this.pickDrillTarget(contacts, axis, amount);
      if (target) this.drillTile(target.row, target.col, dt);
    }
  }

  getSolidContacts(x, y) {
    const halfW = this.player.width * 0.5;
    const halfH = this.player.height * 0.5;
    const minCol = clamp(Math.floor((x - halfW) / TILE_SIZE), 0, COLS - 1);
    const maxCol = clamp(Math.floor((x + halfW) / TILE_SIZE), 0, COLS - 1);
    const minRow = clamp(Math.floor((y - halfH) / TILE_SIZE), 0, ROWS - 1);
    const maxRow = clamp(Math.floor((y + halfH) / TILE_SIZE), 0, ROWS - 1);
    const contacts = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const tile = this.world[row][col];
        if (!tile || !TILE_TYPES[tile.type].solid) continue;
        contacts.push({ row, col, tile });
      }
    }

    return contacts;
  }

  pickDrillTarget(contacts, axis, amount) {
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const contact of contacts) {
      if (contact.tile.type === "bedrock") continue;
      const centerX = contact.col * TILE_SIZE + TILE_SIZE * 0.5;
      const centerY = contact.row * TILE_SIZE + TILE_SIZE * 0.5;
      const primary =
        axis === "x"
          ? Math.abs(centerX - (this.player.x + Math.sign(amount) * this.player.width * 0.5))
          : Math.abs(centerY - (this.player.y + Math.sign(amount) * this.player.height * 0.5));
      const secondary =
        axis === "x" ? Math.abs(centerY - this.player.y) : Math.abs(centerX - this.player.x);
      const score = primary + secondary * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = contact;
      }
    }
    return best;
  }

  drillTile(row, col, dt) {
    const tile = this.world[row][col];
    if (!tile || tile.type === "bedrock") return;
    const power = this.player.drillRate * (1 + (this.player.drillLevel - 1) * 0.18);
    tile.hp -= power * dt;
    this.player.fuel = Math.max(0, this.player.fuel - dt * 7.5);
    this.drillFlash = { row, col, timer: 0.14 };

    if (tile.hp > 0) return;

    this.collectTile(tile);
    this.world[row][col] = null;
    for (let i = 0; i < 6; i += 1) {
      this.sparkles.push({
        x: col * TILE_SIZE + TILE_SIZE * 0.5,
        y: row * TILE_SIZE + TILE_SIZE * 0.5,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        life: 0.5 + Math.random() * 0.35,
        color: TILE_TYPES[tile.type].color,
      });
    }
  }

  collectTile(tile) {
    const definition = TILE_TYPES[tile.type];
    if (definition.value <= 0) return;
    if (this.player.cargo + definition.cargo > this.player.maxCargo) {
      this.setMessage("Cargo bay packed. Some ore lost.", 1.8);
      return;
    }
    this.player.cargo += definition.cargo;
    this.player.cargoValue += definition.value;
    this.setMessage(`${tile.type.toUpperCase()} secured.`, 0.55);
  }

  applyHazards(dt) {
    const row = clamp(Math.floor(this.player.y / TILE_SIZE), 0, ROWS - 1);
    const col = clamp(Math.floor(this.player.x / TILE_SIZE), 0, COLS - 1);
    const tile = this.world[row][col];
    if (!tile) return;

    const definition = TILE_TYPES[tile.type];
    if (definition.hazard === "gas") {
      this.player.hull = Math.max(0, this.player.hull - definition.damage * dt);
      this.player.fuel = Math.max(0, this.player.fuel - 4.5 * dt);
      this.setMessage("Gas pocket burning fuel.", 0.35);
    }
    if (definition.hazard === "lava") {
      this.player.hull = Math.max(0, this.player.hull - definition.damage * dt);
      this.setMessage("Lava contact. Climb now.", 0.35);
    }
  }

  updateDockState(input) {
    const dockX = START_COL * TILE_SIZE + TILE_SIZE * 0.5;
    const wantsLaunch = input.left || input.right || input.up || input.down;
    const docked =
      !wantsLaunch &&
      Math.abs(this.player.x - dockX) < 78 &&
      this.player.y < this.surfaceY - 18 &&
      Math.abs(this.player.vx) < 48 &&
      Math.abs(this.player.vy) < 64;

    if (docked) {
      this.player.landed = true;
      this.player.x = lerp(this.player.x, dockX, 0.24);
      this.player.y = lerp(this.player.y, this.surfaceY - 46, 0.3);
      this.player.vx *= 0.72;
      this.player.vy *= 0.72;
      if (!this.previousDocked) {
        this.setMessage("Dock clamp locked. Cargo transfer live.", 2);
        if (this.player.cargoValue > 0) {
          this.cash += this.player.cargoValue;
          this.player.cargo = 0;
          this.player.cargoValue = 0;
        }
      }
      this.handleDockActions(input);
    } else {
      this.player.landed = false;
    }

    this.previousDocked = docked;
  }

  handleDockActions(input) {
    if (input.shop1) {
      const cost = 28;
      if (this.cash >= cost && this.player.fuel < this.player.maxFuel) {
        this.cash -= cost;
        this.player.fuel = Math.min(this.player.maxFuel, this.player.fuel + this.player.maxFuel * 0.42);
        this.setMessage("Fuel cells swapped.", 1.3);
      } else {
        this.setMessage("Refuel denied. Need space or credits.", 1.2);
      }
    }

    if (input.shop2) {
      const cost = 42;
      if (this.cash >= cost && this.player.hull < this.player.maxHull) {
        this.cash -= cost;
        this.player.hull = Math.min(this.player.maxHull, this.player.hull + 34);
        this.setMessage("Hull plates welded.", 1.3);
      } else {
        this.setMessage("Repair denied. Need damage or credits.", 1.2);
      }
    }

    if (input.shop3) {
      const cost = 135 + Math.round((this.player.maxCargo - 14) * 18);
      if (this.cash >= cost) {
        this.cash -= cost;
        this.player.maxCargo += 3.5;
        this.setMessage("Cargo bay expanded.", 1.4);
      } else {
        this.setMessage("Cargo upgrade too expensive.", 1.2);
      }
    }

    if (input.shop4) {
      const cost = 160 + (this.player.drillLevel - 1) * 90;
      if (this.cash >= cost) {
        this.cash -= cost;
        this.player.drillLevel += 1;
        this.player.drillRate += 9;
        this.setMessage("Drill core overclocked.", 1.4);
      } else {
        this.setMessage("Drill upgrade too expensive.", 1.2);
      }
    }
  }

  updateEffects(dt) {
    if (this.drillFlash) {
      this.drillFlash.timer -= dt;
      if (this.drillFlash.timer <= 0) this.drillFlash = null;
    }
    this.sparkles = this.sparkles
      .map((spark) => ({
        ...spark,
        x: spark.x + spark.vx * dt,
        y: spark.y + spark.vy * dt,
        vy: spark.vy + 120 * dt,
        life: spark.life - dt,
      }))
      .filter((spark) => spark.life > 0);
  }

  updateCamera() {
    this.camera.x = clamp(this.player.x - this.view.width * 0.5, 0, this.worldWidth - this.view.width);
    this.camera.y = clamp(this.player.y - this.view.height * 0.54, 0, this.worldHeight - this.view.height);
  }

  updateOverlay() {
    const titleCopy =
      this.state === "title"
        ? {
            eyebrow: "Surface Brief",
            title: "Motherload Core Breach",
            body:
              "Strip shallow dirt, chase richer veins below, then drag full cargo back through pressure, gas, and lava before hull gives out.",
            button: "Launch Drill",
          }
        : this.state === "won"
          ? {
              eyebrow: "Run Cleared",
              title: "Core Route Secured",
              body: `Deepest run ${this.deepestMeters}m. Credits banked ${this.cash}. Press button or R to dive again.`,
              button: "Run Again",
            }
          : this.state === "gameover"
            ? {
                eyebrow: "Hull Loss",
                title: "Rig Crushed Underground",
                body: `Deepest run ${this.deepestMeters}m. Credits banked ${this.cash}. Press button or R for new frame.`,
                button: "Restart Run",
              }
            : null;

    if (!titleCopy) {
      this.overlayRoot.innerHTML = "";
      return;
    }

    this.overlayRoot.innerHTML = `
      <section class="modal">
        <div class="panel">
          <p class="eyebrow">${titleCopy.eyebrow}</p>
          <h1>${titleCopy.title}</h1>
          <p class="lede">${titleCopy.body}</p>
          <div class="summary">
            <div><span>Goal</span><strong>${GOAL_DEPTH}m + ${GOAL_CREDITS}cr</strong></div>
            <div><span>Dock</span><strong>1 Fuel  2 Repair  3 Cargo  4 Drill</strong></div>
          </div>
          <button type="button" data-action="start">${titleCopy.button}</button>
        </div>
      </section>
    `;

    const button = this.overlayRoot.querySelector("[data-action='start']");
    if (button) {
      button.addEventListener("click", () => {
        if (this.state === "title") {
          this.startRun();
        } else if (this.state === "won" || this.state === "gameover") {
          this.resetRun();
          this.startRun();
        }
      });
    }
  }

  updateDockPanel() {
    const fuelCost = 28;
    const repairCost = 42;
    const cargoCost = 135 + Math.round((this.player.maxCargo - 14) * 18);
    const drillCost = 160 + (this.player.drillLevel - 1) * 90;
    const depth = Math.max(0, Math.floor((this.player.y - this.surfaceY) * 3.2));
    this.dockPanel.classList.toggle("live", this.player.landed && this.state === "running");
    this.dockPanel.innerHTML = `
      <div class="dock-card">
        <p class="eyebrow">Dock Systems</p>
        <div class="dock-grid">
          <div><span>Credits</span><strong>${Math.floor(this.cash)}</strong></div>
          <div><span>Depth</span><strong>${depth}m</strong></div>
          <div><span>Cargo</span><strong>${this.player.cargo.toFixed(1)} / ${this.player.maxCargo.toFixed(1)}</strong></div>
          <div><span>Goal</span><strong>${this.deepestMeters}m / ${GOAL_DEPTH}m</strong></div>
        </div>
        <div class="dock-actions">
          <span>1 Fuel ${fuelCost}</span>
          <span>2 Repair ${repairCost}</span>
          <span>3 Cargo ${cargoCost}</span>
          <span>4 Drill ${drillCost}</span>
        </div>
      </div>
    `;
  }

  render(ctx) {
    ctx.clearRect(0, 0, this.view.width, this.view.height);
    this.renderSky(ctx);
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    this.renderWorld(ctx);
    this.renderPlayer(ctx);
    this.renderEffects(ctx);
    ctx.restore();
    this.renderHud(ctx);
  }

  renderSky(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, this.view.height);
    sky.addColorStop(0, "#140f18");
    sky.addColorStop(0.35, "#31203c");
    sky.addColorStop(1, "#05070d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.view.width, this.view.height);
  }

  renderWorld(ctx) {
    ctx.fillStyle = "#e28a3d";
    ctx.fillRect(0, this.surfaceY - 14, this.worldWidth, 14);

    for (let row = SURFACE_ROW; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const tile = this.world[row][col];
        if (!tile) continue;
        const def = TILE_TYPES[tile.type];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        ctx.fillStyle = def.color;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        if (tile.type === "gas") {
          ctx.fillStyle = "rgba(208,255,226,0.45)";
          ctx.beginPath();
          ctx.arc(x + 11, y + 12, 6, 0, Math.PI * 2);
          ctx.arc(x + 21, y + 18, 8, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile.type === "lava") {
          ctx.fillStyle = "rgba(255, 216, 112, 0.75)";
          ctx.fillRect(x + 4, y + 18, 24, 6);
        } else if (tile.type !== "dirt" && tile.type !== "rock" && tile.type !== "bedrock") {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(x + 8, y + 8, 6, 6);
          ctx.fillRect(x + 18, y + 16, 4, 4);
        }

        if (tile.maxHp < 9999 && tile.hp < tile.maxHp) {
          const ratio = clamp(tile.hp / tile.maxHp, 0, 1);
          ctx.fillStyle = "rgba(0,0,0,0.42)";
          ctx.fillRect(x, y + TILE_SIZE - 4, TILE_SIZE, 4);
          ctx.fillStyle = "#f6df88";
          ctx.fillRect(x, y + TILE_SIZE - 4, TILE_SIZE * ratio, 4);
        }
      }
    }

    const dockX = START_COL * TILE_SIZE + TILE_SIZE * 0.5;
    ctx.fillStyle = "#cfdbef";
    ctx.fillRect(dockX - 74, this.surfaceY - 22, 148, 10);
    ctx.fillStyle = "#5ec6ff";
    ctx.fillRect(dockX - 52, this.surfaceY - 28, 104, 6);
    ctx.fillStyle = "rgba(94,198,255,0.16)";
    ctx.fillRect(dockX - 88, this.surfaceY - 42, 176, 42);
  }

  renderPlayer(ctx) {
    const x = this.player.x;
    const y = this.player.y;
    const loadRatio = clamp(this.player.cargo / this.player.maxCargo, 0, 1);

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f4d7b2";
    ctx.beginPath();
    ctx.moveTo(-18, -7);
    ctx.lineTo(14, -11);
    ctx.lineTo(18, 0);
    ctx.lineTo(12, 10);
    ctx.lineTo(-16, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#9b4d2b";
    ctx.fillRect(-22, -5, 8, 10);
    ctx.fillStyle = "#76e4ff";
    ctx.fillRect(-8, -4, 10, 8);
    ctx.fillStyle = "#f59e5d";
    ctx.fillRect(-10, 8, 16 + loadRatio * 10, 8);
    ctx.fillStyle = "#311620";
    ctx.fillRect(2, -3, 14, 4);

    if (!this.player.landed && this.player.fuel > 0) {
      ctx.fillStyle = "rgba(255,174,78,0.85)";
      if (this.player.vy < 20) {
        ctx.beginPath();
        ctx.moveTo(-14, 10);
        ctx.lineTo(-4, 10);
        ctx.lineTo(-9, 26 + Math.random() * 8);
        ctx.closePath();
        ctx.fill();
      }
      if (this.player.vx > 20) {
        ctx.beginPath();
        ctx.moveTo(-23, -3);
        ctx.lineTo(-23, 3);
        ctx.lineTo(-34 - Math.random() * 8, 0);
        ctx.closePath();
        ctx.fill();
      }
      if (this.player.vx < -20) {
        ctx.beginPath();
        ctx.moveTo(18, -3);
        ctx.lineTo(18, 3);
        ctx.lineTo(28 + Math.random() * 8, 0);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  renderEffects(ctx) {
    if (this.drillFlash) {
      const x = this.drillFlash.col * TILE_SIZE + TILE_SIZE * 0.5;
      const y = this.drillFlash.row * TILE_SIZE + TILE_SIZE * 0.5;
      ctx.strokeStyle = "rgba(255,244,180,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12 + Math.random() * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const spark of this.sparkles) {
      ctx.fillStyle = spark.color;
      ctx.globalAlpha = clamp(spark.life * 1.5, 0, 1);
      ctx.fillRect(spark.x - 2, spark.y - 2, 4, 4);
      ctx.globalAlpha = 1;
    }
  }

  renderHud(ctx) {
    const fuelRatio = clamp(this.player.fuel / this.player.maxFuel, 0, 1);
    const hullRatio = clamp(this.player.hull / this.player.maxHull, 0, 1);
    const cargoRatio = clamp(this.player.cargo / this.player.maxCargo, 0, 1);
    const depth = Math.max(0, Math.floor((this.player.y - this.surfaceY) * 3.2));

    ctx.fillStyle = "rgba(9, 11, 17, 0.76)";
    ctx.fillRect(20, 20, 340, 182);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(20, 20, 340, 1);

    ctx.fillStyle = "#f3d18c";
    ctx.font = "700 16px Trebuchet MS";
    ctx.fillText("Rig Status", 40, 46);

    this.drawMeter(ctx, "Fuel", 40, 68, fuelRatio, "#6be3ff");
    this.drawMeter(ctx, "Hull", 40, 104, hullRatio, "#ff7a7a");
    this.drawMeter(ctx, "Cargo", 40, 140, cargoRatio, "#f0b84a");

    ctx.fillStyle = "#d8d8de";
    ctx.font = "14px Trebuchet MS";
    ctx.fillText(`Credits ${Math.floor(this.cash)}`, 40, 182);
    ctx.fillText(`Depth ${depth}m`, 168, 182);
    ctx.fillText(`Best ${this.deepestMeters}m`, 264, 182);

    ctx.fillStyle = "rgba(11,13,19,0.72)";
    ctx.fillRect(this.view.width - 360, 20, 320, 110);
    ctx.fillStyle = "#a7f0c8";
    ctx.font = "700 14px Trebuchet MS";
    ctx.fillText("Run Brief", this.view.width - 336, 46);
    ctx.fillStyle = "#f5f5f8";
    ctx.font = "13px Trebuchet MS";
    ctx.fillText(`Goal: ${GOAL_DEPTH}m + ${GOAL_CREDITS}cr, then dock`, this.view.width - 336, 70);
    ctx.fillText(`Drill Lv.${this.player.drillLevel}  Cargo ${this.player.maxCargo.toFixed(1)}`, this.view.width - 336, 92);
    ctx.fillStyle = "#f0cfa7";
    ctx.fillText(this.messageTimer > 0 ? this.message : "Dig smart. Return richer.", this.view.width - 336, 114);
  }

  drawMeter(ctx, label, x, y, ratio, color) {
    ctx.fillStyle = "#d8d8de";
    ctx.font = "13px Trebuchet MS";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(x + 64, y - 11, 230, 12);
    ctx.fillStyle = color;
    ctx.fillRect(x + 64, y - 11, 230 * ratio, 12);
  }
}

window.MotherloadCoreGame = Game;
