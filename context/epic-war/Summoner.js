import { updateLaneUnits } from "./UnitAI.js";
import { AbilitySystem, createDefaultAbilities } from "./AbilitySystem.js";

const LANE_COUNT = 3;
const BASE_MANA_REGEN = 6;
const MAX_MANA = 100;
const MAX_GOLD = 9999;
const PLAYER_CASTLE_HP = 260;
const ENEMY_CASTLE_HP = 280;
const BASE_LANE_LENGTH = 820;
const PLAYER_AUTO_INTERVAL = 2.1;
const ENEMY_AUTO_INTERVAL = 1.7;
const PLAYER_GOLD_FLOW = 0.9;
const FIELD_PADDING = 120;

const UNIT_DEFS = {
  footman: {
    label: "Footman",
    mana: 16,
    reward: 5,
    hp: 46,
    damage: 8,
    speed: 42,
    range: 22,
    radius: 18,
    color: "#8be3ff",
    sprite: "footman",
    attackFrame: 0.24,
  },
  archer: {
    label: "Archer",
    mana: 20,
    reward: 6,
    hp: 30,
    damage: 6,
    speed: 46,
    range: 120,
    radius: 16,
    color: "#78f0b3",
    sprite: "archer",
    attackFrame: 0.3,
  },
  brute: {
    label: "Brute",
    mana: 32,
    reward: 8,
    hp: 82,
    damage: 12,
    speed: 34,
    range: 24,
    radius: 24,
    color: "#ffd77a",
    sprite: "brute",
    attackFrame: 0.28,
  },
  mage: {
    label: "Mage",
    mana: 40,
    reward: 10,
    hp: 36,
    damage: 14,
    speed: 38,
    range: 132,
    radius: 18,
    color: "#cf97ff",
    sprite: "mage",
    attackFrame: 0.32,
  },
};

const ASSET_PATHS = {
  footman: "./assets/footman.svg",
  archer: "./assets/archer.svg",
  brute: "./assets/brute.svg",
  mage: "./assets/mage.svg",
  playerCastle: "./assets/player-castle.svg",
  enemyCastle: "./assets/enemy-castle.svg",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createLane(lane) {
  return {
    lane,
    playerUnits: [],
    enemyUnits: [],
    playerSpawnClock: 0,
    enemySpawnClock: 0,
    rallyUntil: 0,
    playerCastle: null,
    enemyCastle: null,
  };
}

function makeLanes() {
  return Array.from({ length: LANE_COUNT }, (_, lane) => createLane(lane));
}

function createUnit(side, lane, type, progress) {
  const def = UNIT_DEFS[type];
  return {
    id: `${side}-${lane}-${type}-${Math.random().toString(36).slice(2, 9)}`,
    side,
    lane,
    type,
    label: def.label,
    progress,
    x: progress,
    hp: def.hp,
    maxHp: def.hp,
    damage: def.damage,
    speed: def.speed,
    range: def.range,
    radius: def.radius,
    color: def.color,
    spriteKey: def.sprite,
    attackFrame: def.attackFrame,
    state: "move",
    attackTimer: 0,
    stackOffset: 0,
    alive: true,
  };
}

function buildState() {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : 0;
  return {
    running: false,
    phase: "menu",
    time: 0,
    selectedLane: 1,
    mana: 60,
    maxMana: MAX_MANA,
    gold: 45,
    manaRegenLevel: 0,
    fortressLevel: 0,
    lanes: makeLanes(),
    castles: {
      player: {
        id: "player-castle",
        side: "player",
        hp: PLAYER_CASTLE_HP,
        maxHp: PLAYER_CASTLE_HP,
        progress: 0,
      },
      enemy: {
        id: "enemy-castle",
        side: "enemy",
        hp: ENEMY_CASTLE_HP,
        maxHp: ENEMY_CASTLE_HP,
        progress: BASE_LANE_LENGTH,
      },
    },
    winner: null,
    statusText: "Menu ready.",
    lastFrame: now,
  };
}

function loadAssetImages() {
  const images = new Map();
  if (typeof Image === "undefined") {
    return images;
  }

  for (const [key, path] of Object.entries(ASSET_PATHS)) {
    const image = new Image();
    image.decoding = "async";
    image.src = path;
    images.set(key, image);
  }
  return images;
}

function sortLaneUnits(laneState) {
  laneState.playerUnits.sort((a, b) => a.progress - b.progress);
  laneState.enemyUnits.sort((a, b) => a.progress - b.progress);
}

function getFrontUnit(units, side) {
  if (!units.length) {
    return null;
  }
  return side === "player" ? units[units.length - 1] : units[0];
}

function getClusterAnchor(units, fallbackProgress, side) {
  if (!units.length) {
    return { progress: fallbackProgress, side };
  }
  const slice = side === "enemy" ? units.slice(0, Math.min(3, units.length)) : units.slice(-Math.min(3, units.length));
  const total = slice.reduce((sum, unit) => sum + unit.progress, 0);
  return { progress: total / slice.length, side };
}

function createButton(label, disabled, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

export class SummonerGame {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.menuScreen = document.getElementById("menu-screen");
    this.gameScreen = document.getElementById("game-screen");
    this.victoryScreen = document.getElementById("victory-screen");
    this.victoryTitle = document.getElementById("victory-title");
    this.startButton = document.getElementById("start-button");
    this.restartButton = document.getElementById("restart-button");
    this.manaValue = document.getElementById("mana-value");
    this.goldValue = document.getElementById("gold-value");
    this.castleHealthValue = document.getElementById("castle-health-value");
    this.enemyCastleHealthValue = document.getElementById("enemy-castle-health-value");
    this.spellBar = document.getElementById("spell-bar");
    this.upgradeHud = document.getElementById("upgrade-hud");
    this.laneStatus = document.getElementById("lane-status");
    this.battleStatus = document.getElementById("battle-status");
    this.victoryCopy = document.getElementById("victory-copy");

    this.images = loadAssetImages();
    this.abilitySystem = new AbilitySystem(createDefaultAbilities());
    this.state = buildState();

    this.boundFrame = (now) => this.frame(now);
    this.boundStart = () => this.startRun();
    this.boundRestart = () => this.startRun();
    this.boundKeydown = (event) => this.handleKeydown(event);
  }

  getManaRegen() {
    return BASE_MANA_REGEN + this.state.manaRegenLevel * 1.5;
  }

  getUpgradeCost(id) {
    if (id === "mana-well") {
      return 34 + this.state.manaRegenLevel * 20;
    }
    if (id === "fortify") {
      return 40 + this.state.fortressLevel * 24;
    }
    return 0;
  }

  startRun() {
    this.state = buildState();
    this.state.running = true;
    this.state.phase = "playing";
    this.state.statusText = "Three lanes active. Focus a lane, summon, cast, and push.";
    this.abilitySystem = new AbilitySystem(createDefaultAbilities());
    this.seedOpeningWave();
    this.syncVisibility();
    this.syncHud();
    this.draw();
  }

  seedOpeningWave() {
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      this.spawnUnit("player", lane, lane === 1 ? "archer" : "footman");
      this.spawnUnit("enemy", lane, lane === 1 ? "mage" : "brute");
    }
  }

  stopRun(winner, copy) {
    this.state.running = false;
    this.state.phase = "victory";
    this.state.winner = winner;
    this.state.statusText = copy;
    this.victoryTitle.textContent = winner === "player" ? "Victory" : "Defeat";
    this.victoryCopy.textContent = copy;
    this.syncVisibility();
    this.syncHud();
  }

  spawnUnit(side, lane, unitType, options = {}) {
    const laneState = this.state.lanes[lane];
    const def = UNIT_DEFS[unitType];
    if (!laneState || !def) {
      return null;
    }

    if (side === "player" && options.payCost) {
      if (this.state.mana < def.mana) {
        this.state.statusText = `${def.label} needs ${def.mana} mana.`;
        return null;
      }
      this.state.mana -= def.mana;
    }

    const baseProgress = side === "player" ? 32 : BASE_LANE_LENGTH - 32;
    const unit = createUnit(side, lane, unitType, baseProgress);
    const targetList = side === "player" ? laneState.playerUnits : laneState.enemyUnits;
    targetList.push(unit);
    sortLaneUnits(laneState);
    return unit;
  }

  selectLane(lane) {
    this.state.selectedLane = clamp(lane, 0, LANE_COUNT - 1);
    this.state.statusText = `Lane ${this.state.selectedLane + 1} focused.`;
    this.syncHud();
  }

  purchaseUpgrade(id) {
    if (this.state.phase !== "playing") {
      return false;
    }

    const cost = this.getUpgradeCost(id);
    if (this.state.gold < cost) {
      this.state.statusText = `Need ${cost} gold for that upgrade.`;
      this.syncHud();
      return false;
    }

    if (id === "mana-well") {
      this.state.gold -= cost;
      this.state.manaRegenLevel += 1;
      this.state.statusText = `Mana well upgraded. Regen is now ${this.getManaRegen().toFixed(1)} / s.`;
    } else if (id === "fortify") {
      this.state.gold -= cost;
      this.state.fortressLevel += 1;
      this.state.castles.player.maxHp += 40;
      this.state.castles.player.hp = Math.min(
        this.state.castles.player.maxHp,
        this.state.castles.player.hp + 40,
      );
      this.state.statusText = "Ramparts reinforced.";
    }

    this.syncHud();
    return true;
  }

  summonSelectedLane(unitType) {
    if (this.state.phase !== "playing") {
      return false;
    }
    const unit = this.spawnUnit("player", this.state.selectedLane, unitType, { payCost: true });
    if (!unit) {
      this.syncHud();
      return false;
    }
    this.state.statusText = `${UNIT_DEFS[unitType].label} summoned into lane ${this.state.selectedLane + 1}.`;
    this.syncHud();
    return true;
  }

  getSpellTarget(abilityId, laneState) {
    if (abilityId === "heal") {
      return getClusterAnchor(laneState.playerUnits, 52, "player");
    }
    if (abilityId === "meteor") {
      return getClusterAnchor(laneState.enemyUnits, BASE_LANE_LENGTH * 0.72, "enemy");
    }
    return getClusterAnchor(laneState.enemyUnits, BASE_LANE_LENGTH * 0.62, "enemy");
  }

  castSpell(id) {
    if (this.state.phase !== "playing") {
      return false;
    }

    const laneIndex = this.state.selectedLane;
    const laneState = this.state.lanes[laneIndex];
    const target = this.getSpellTarget(id, laneState);
    const payload = this.abilitySystem.cast(id, { lane: laneIndex, progress: target.progress }, this.state, this.state.time);

    if (!payload.ok) {
      this.state.statusText = payload.reason === "unavailable" ? "Spell not ready or not enough mana." : "Invalid spell target.";
      this.syncHud();
      return false;
    }

    for (const effect of payload.effects) {
      if (effect.type === "buff" && effect.buff === "rally") {
        laneState.rallyUntil = Math.max(laneState.rallyUntil, this.state.time + effect.duration);
      }
    }

    this.cleanupUnits();
    this.state.statusText = `${payload.id} resolved on lane ${laneIndex + 1}.`;
    this.checkOutcome();
    this.syncHud();
    return true;
  }

  handleAutoSpawns(dt) {
    for (const laneState of this.state.lanes) {
      laneState.playerSpawnClock += dt;
      laneState.enemySpawnClock += dt;

      const playerInterval =
        laneState.rallyUntil > this.state.time ? PLAYER_AUTO_INTERVAL * 0.72 : PLAYER_AUTO_INTERVAL;
      const enemyInterval = Math.max(1.05, ENEMY_AUTO_INTERVAL - Math.min(this.state.time * 0.01, 0.45));

      while (laneState.playerSpawnClock >= playerInterval) {
        laneState.playerSpawnClock -= playerInterval;
        const type =
          this.state.time > 55 && laneState.lane === 1
            ? "mage"
            : laneState.lane === 1
              ? "archer"
              : "footman";
        this.spawnUnit("player", laneState.lane, type);
      }

      while (laneState.enemySpawnClock >= enemyInterval) {
        laneState.enemySpawnClock -= enemyInterval;
        const type =
          this.state.time > 40 && laneState.lane === 1
            ? "mage"
            : laneState.lane === 1
              ? "brute"
              : this.state.time > 28
                ? "brute"
                : "footman";
        this.spawnUnit("enemy", laneState.lane, type);
      }
    }
  }

  updateLanes(dt) {
    for (const laneState of this.state.lanes) {
      laneState.playerCastle = this.state.castles.player;
      laneState.enemyCastle = this.state.castles.enemy;
      updateLaneUnits(laneState, dt, {
        time: this.state.time,
        laneLength: BASE_LANE_LENGTH,
        playerCastle: this.state.castles.player,
        enemyCastle: this.state.castles.enemy,
        rallyUntil: laneState.rallyUntil,
      });
      sortLaneUnits(laneState);
    }
  }

  cleanupUnits() {
    let goldGain = 0;

    for (const laneState of this.state.lanes) {
      laneState.playerUnits = laneState.playerUnits.filter((unit) => unit.alive !== false && unit.hp > 0);

      for (const enemy of laneState.enemyUnits) {
        if (enemy.alive === false || enemy.hp <= 0) {
          goldGain += UNIT_DEFS[enemy.type]?.reward ?? 1;
        }
      }
      laneState.enemyUnits = laneState.enemyUnits.filter((unit) => unit.alive !== false && unit.hp > 0);
      sortLaneUnits(laneState);
    }

    if (goldGain > 0) {
      this.state.gold = clamp(this.state.gold + goldGain, 0, MAX_GOLD);
    }
  }

  checkOutcome() {
    if (this.state.castles.player.hp <= 0 && this.state.castles.enemy.hp <= 0) {
      const winner =
        this.state.castles.enemy.hp < this.state.castles.player.hp ? "player" : "enemy";
      this.stopRun(winner, winner === "player" ? "Both keeps shattered. Yours fell last." : "Both keeps shattered. The enemy edge held.");
      return;
    }
    if (this.state.castles.player.hp <= 0) {
      this.stopRun("enemy", "Your castle collapsed before the siege line broke.");
      return;
    }
    if (this.state.castles.enemy.hp <= 0) {
      this.stopRun("player", "The enemy keep fell under the final lane push.");
    }
  }

  update(dt) {
    if (!this.state.running) {
      this.draw();
      return;
    }

    this.state.time += dt;
    this.state.mana = clamp(this.state.mana + this.getManaRegen() * dt, 0, this.state.maxMana);
    this.state.gold = clamp(this.state.gold + PLAYER_GOLD_FLOW * dt, 0, MAX_GOLD);
    this.abilitySystem.updateCooldowns(this.state.time);
    this.handleAutoSpawns(dt);
    this.updateLanes(dt);
    this.cleanupUnits();
    this.checkOutcome();
    this.syncHud();
    this.draw();
  }

  syncVisibility() {
    const menuVisible = this.state.phase === "menu";
    const gameVisible = this.state.phase === "playing";
    const victoryVisible = this.state.phase === "victory";
    this.menuScreen.classList.toggle("is-visible", menuVisible);
    this.gameScreen.classList.toggle("is-visible", gameVisible);
    this.victoryScreen.classList.toggle("is-visible", victoryVisible);
    this.victoryScreen.setAttribute("aria-hidden", String(!victoryVisible));
  }

  syncHud() {
    this.manaValue.textContent = Math.floor(this.state.mana).toString();
    this.goldValue.textContent = Math.floor(this.state.gold).toString();
    this.castleHealthValue.textContent = Math.max(0, Math.ceil(this.state.castles.player.hp)).toString();
    this.enemyCastleHealthValue.textContent = Math.max(0, Math.ceil(this.state.castles.enemy.hp)).toString();
    this.battleStatus.textContent = this.state.statusText;
    this.renderSpells();
    this.renderUpgradeHud();
    this.renderLaneStatus();
  }

  renderSpells() {
    this.spellBar.replaceChildren();
    for (const spell of this.abilitySystem.getStatus(this.state.time)) {
      const disabled = this.state.phase !== "playing" || !spell.ready || this.state.mana < spell.cost;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "spell-card";
      button.disabled = disabled;
      button.setAttribute("aria-pressed", String(this.state.selectedLane >= 0));
      button.innerHTML = `<strong>${spell.label}</strong><span>Lane ${this.state.selectedLane + 1} | ${spell.cost} mana</span><span>${spell.ready ? spell.description : `CD ${spell.cooldownRemaining.toFixed(1)}s`}</span>`;
      button.addEventListener("click", () => this.castSpell(spell.id));
      this.spellBar.append(button);
    }
  }

  renderUpgradeHud() {
    this.upgradeHud.replaceChildren();

    const recruitCard = document.createElement("div");
    recruitCard.className = "lane-card";
    recruitCard.innerHTML = `<strong>Summon Reinforcements</strong><span>Selected lane ${this.state.selectedLane + 1}. Spend mana to thicken the push.</span>`;
    const recruitGrid = document.createElement("div");
    recruitGrid.className = "action-grid";
    for (const [id, def] of Object.entries(UNIT_DEFS)) {
      recruitGrid.append(
        createButton(`${def.label} ${def.mana}m`, this.state.phase !== "playing" || this.state.mana < def.mana, () =>
          this.summonSelectedLane(id),
        ),
      );
    }
    recruitCard.append(recruitGrid);
    this.upgradeHud.append(recruitCard);

    const manaWellCost = this.getUpgradeCost("mana-well");
    const manaCard = document.createElement("div");
    manaCard.className = "lane-card";
    manaCard.innerHTML = `<strong>Mana Well</strong><span>Level ${this.state.manaRegenLevel} | ${this.getManaRegen().toFixed(1)} mana per second</span>`;
    manaCard.append(
      createButton(
        `Upgrade ${manaWellCost}g`,
        this.state.phase !== "playing" || this.state.gold < manaWellCost,
        () => this.purchaseUpgrade("mana-well"),
      ),
    );
    this.upgradeHud.append(manaCard);

    const fortifyCost = this.getUpgradeCost("fortify");
    const fortifyCard = document.createElement("div");
    fortifyCard.className = "lane-card";
    fortifyCard.innerHTML = `<strong>Fortify Castle</strong><span>Level ${this.state.fortressLevel} | restore and expand the wall.</span>`;
    fortifyCard.append(
      createButton(
        `Fortify ${fortifyCost}g`,
        this.state.phase !== "playing" || this.state.gold < fortifyCost,
        () => this.purchaseUpgrade("fortify"),
      ),
    );
    this.upgradeHud.append(fortifyCard);
  }

  renderLaneStatus() {
    this.laneStatus.replaceChildren();

    for (const laneState of this.state.lanes) {
      const row = document.createElement("div");
      row.className = "lane-card";
      const playerFront = getFrontUnit(laneState.playerUnits, "player")?.progress ?? 0;
      const enemyFront = getFrontUnit(laneState.enemyUnits, "enemy")?.progress ?? BASE_LANE_LENGTH;
      const pressure = clamp((playerFront + (BASE_LANE_LENGTH - enemyFront)) / (BASE_LANE_LENGTH * 1.3), 0, 1);
      const rallyLeft = Math.max(0, laneState.rallyUntil - this.state.time);
      row.innerHTML = `
        <strong>Lane ${laneState.lane + 1}${this.state.selectedLane === laneState.lane ? " - Focused" : ""}</strong>
        <span>Allies ${laneState.playerUnits.length} | Enemies ${laneState.enemyUnits.length}${rallyLeft > 0 ? ` | Rally ${rallyLeft.toFixed(1)}s` : ""}</span>
        <div class="meter" aria-hidden="true"><i style="width:${(pressure * 100).toFixed(0)}%"></i></div>
      `;
      row.append(
        createButton(
          this.state.selectedLane === laneState.lane ? "Focused" : "Focus Lane",
          this.state.selectedLane === laneState.lane,
          () => this.selectLane(laneState.lane),
        ),
      );
      this.laneStatus.append(row);
    }
  }

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const laneHeight = height / LANE_COUNT;
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#09111e");
    gradient.addColorStop(1, "#13253d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const top = lane * laneHeight;
      ctx.fillStyle = lane === this.state.selectedLane ? "rgba(139, 227, 255, 0.08)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(0, top, width, laneHeight - 2);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(width, top);
      ctx.stroke();
      this.drawCastle(FIELD_PADDING - 42, top + laneHeight / 2, "player");
      this.drawCastle(width - FIELD_PADDING + 42, top + laneHeight / 2, "enemy");
      this.drawLaneUnits(this.state.lanes[lane], top, laneHeight, width);
    }
  }

  drawCastle(x, y, side) {
    const key = side === "player" ? "playerCastle" : "enemyCastle";
    const image = this.images.get(key);
    const size = 94;
    if (image?.complete) {
      this.ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
      return;
    }
    this.ctx.fillStyle = side === "player" ? "#8be3ff" : "#ff6e89";
    this.ctx.beginPath();
    this.ctx.arc(x, y, 28, 0, Math.PI * 2);
    this.ctx.fill();
  }

  laneProgressToCanvas(progress, width) {
    const fieldWidth = width - FIELD_PADDING * 2;
    return FIELD_PADDING + (progress / BASE_LANE_LENGTH) * fieldWidth;
  }

  drawLaneUnits(laneState, top, laneHeight, width) {
    const centerY = top + laneHeight / 2;
    for (const unit of [...laneState.playerUnits, ...laneState.enemyUnits]) {
      const x = this.laneProgressToCanvas(unit.progress, width);
      const y = centerY + unit.stackOffset;
      this.drawUnit(unit, x, y);
    }
  }

  drawUnit(unit, x, y) {
    const image = this.images.get(unit.spriteKey);
    const size = unit.radius * 2.8;
    if (image?.complete) {
      this.ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    } else {
      this.ctx.fillStyle = unit.color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, unit.radius * 0.7, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    this.ctx.fillRect(x - 16, y + unit.radius * 0.95, 32, 4);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(
      x - 16,
      y + unit.radius * 0.95,
      32 * clamp(unit.hp / unit.maxHp, 0, 1),
      4,
    );
  }

  handleKeydown(event) {
    if (this.state.phase !== "playing") {
      return;
    }

    if (event.key === "1") this.selectLane(0);
    if (event.key === "2") this.selectLane(1);
    if (event.key === "3") this.selectLane(2);
    if (event.key.toLowerCase() === "q") this.summonSelectedLane("footman");
    if (event.key.toLowerCase() === "w") this.summonSelectedLane("archer");
    if (event.key.toLowerCase() === "e") this.summonSelectedLane("brute");
    if (event.key.toLowerCase() === "r") this.summonSelectedLane("mage");
    if (event.key.toLowerCase() === "a") this.castSpell("arrows");
    if (event.key.toLowerCase() === "s") this.castSpell("heal");
    if (event.key.toLowerCase() === "d") this.castSpell("rally");
    if (event.key.toLowerCase() === "f") this.castSpell("meteor");
  }

  frame(now) {
    const dt = Math.min(0.033, ((now ?? 0) - this.state.lastFrame) / 1000 || 0.016);
    this.state.lastFrame = now ?? this.state.lastFrame;
    this.update(dt);
    requestAnimationFrame(this.boundFrame);
  }
}

export function bootSummonerGame() {
  const game = new SummonerGame();
  game.startButton.addEventListener("click", game.boundStart);
  game.restartButton.addEventListener("click", game.boundRestart);
  window.addEventListener("keydown", game.boundKeydown);
  game.syncVisibility();
  game.syncHud();
  game.draw();
  requestAnimationFrame(game.boundFrame);
  return game;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootSummonerGame();
}
