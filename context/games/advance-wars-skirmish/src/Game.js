import { CONTROL_TEXT, GRID_HEIGHT, GRID_WIDTH, MAP, SCENARIO_SETUP, STRUCTURES, UNIT_TYPES } from "./data.js";
import {
  chooseEnemyActions,
  getAttackTargets,
  getAttackTiles,
  getMoveTiles,
  getUnitAt,
  incomeForTurn,
  resolveCombat,
  terrainCost,
  updateCaptureProgress,
} from "./rules.js";
import { createLayout, renderGame } from "./render.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TERRAIN_LABELS = {
  plain: "Plain",
  forest: "Forest",
  road: "Road",
  city: "City",
  base: "Base",
  hq: "HQ",
};
const OPENING_ROLES = [
  {
    title: "Infantry",
    copy: "Only infantry captures buildings. Feed it safe tiles first so your income starts early.",
  },
  {
    title: "Tank",
    copy: "Tank leads road fights. Keep it in front so enemy fire hits armor instead of your capture unit.",
  },
  {
    title: "Artillery",
    copy: "Artillery fires from 2 to 3 tiles away. Park it behind the tank, not on the frontline.",
  },
];
const OPENING_ANCHORS = {
  "p-inf-1": { x: 1, y: 4 },
  "p-tank-1": { x: 4, y: 6 },
  "p-art-1": { x: 2, y: 6 },
};

function getOpeningRoleSet(roleFocus = []) {
  if (!Array.isArray(roleFocus) || roleFocus.length === 0) {
    return OPENING_ROLES;
  }
  return OPENING_ROLES.filter((role) => roleFocus.includes(role.title));
}

function createUnit(id, side, type, x, y) {
  const spec = UNIT_TYPES[type];
  return {
    id,
    side,
    type,
    x,
    y,
    hp: spec.maxHp,
    ammo: spec.ammo,
    fuel: spec.fuel,
    moved: false,
    acted: false,
    capture: 0,
  };
}

function cloneUnit(unit) {
  return { ...unit };
}

export class Game {
  constructor() {
    this.viewport = { width: 1280, height: 720 };
    this.enemyTimer = 0;
    this.reset();
  }

  reset() {
    this.status = "menu";
    this.phase = "menu";
    this.turn = 1;
    this.funds = { ...SCENARIO_SETUP.funds };
    this.cursor = { ...SCENARIO_SETUP.cursor };
    this.selectedId = null;
    this.selectionOrigin = null;
    this.message = CONTROL_TEXT.menu;
    this.winner = null;
    this.map = MAP.map((row) => row.slice());
    this.units = SCENARIO_SETUP.units.map((unit) => createUnit(unit.id, unit.side, unit.type, unit.x, unit.y));
    this.structures = STRUCTURES.map((structure) => ({ ...structure }));
    this.enemyTimer = 0;
    this.endTurnConfirmKey = null;
  }

  start() {
    this.status = "play";
    this.phase = "player";
    this.selectedId = null;
    this.selectionOrigin = null;
    this.enemyTimer = 0;
    this.endTurnConfirmKey = null;
    this.message = CONTROL_TEXT.playerPhase;
    this.winner = null;
    this.primeOpeningTurn();
  }

  restart() {
    this.reset();
    this.start();
  }

  resize(width, height) {
    this.viewport = { width, height };
  }

  update(dt = 0, input = null) {
    if (input) {
      if (typeof input.cursorX === "number" && typeof input.cursorY === "number") {
        this.setCursor(input.cursorX, input.cursorY);
      }
      if (input.action) {
        this.handleAction(input.action);
      }
    }

    if (this.status !== "play") return;

    if (this.phase === "enemy") {
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0) {
        this.enemyTurn();
        this.turn += 1;
        this.phase = "player";
        this.refreshUnits("player");
        this.funds.player += incomeForTurn(this.structures.filter((structure) => structure.owner === "player"));
        this.endTurnConfirmKey = null;
        this.message = CONTROL_TEXT.playerPhase;
        this.checkVictory();
      }
    }
  }

  render(ctx) {
    const layout = createLayout({
      width: this.viewport.width || ctx.canvas.width,
      height: this.viewport.height || ctx.canvas.height,
    });
    renderGame(ctx, this.getFrameState(), layout);
  }

  getUnitAt(x, y) {
    return getUnitAt(this.units, x, y);
  }

  getStructureAt(x, y) {
    return this.structures.find((structure) => structure.x === x && structure.y === y) ?? null;
  }

  getSelectedUnit() {
    return this.units.find((unit) => unit.id === this.selectedId && unit.hp > 0) ?? null;
  }

  getUnitById(id) {
    return this.units.find((unit) => unit.id === id && unit.hp > 0) ?? null;
  }

  getOpeningInfantry() {
    return this.getUnitById("p-inf-1") ?? this.units.find((unit) => unit.side === "player" && unit.type === "infantry" && unit.hp > 0) ?? null;
  }

  getAdvanceTarget(unit) {
    if (!unit) return this.structures.find((structure) => structure.id === "e-hq") ?? null;
    return (
      this.structures
        .filter((structure) => structure.owner !== "player")
        .slice()
        .sort((a, b) => {
          const distanceA = Math.abs(unit.x - a.x) + Math.abs(unit.y - a.y);
          const distanceB = Math.abs(unit.x - b.x) + Math.abs(unit.y - b.y);
          return distanceA - distanceB;
        })[0] ?? null
    );
  }

  getTerrainAt(x, y) {
    return this.map[y]?.[x] ?? null;
  }

  getTerrainLabel(terrain) {
    return TERRAIN_LABELS[terrain] ?? "Tile";
  }

  getUnitLabel(unitOrType) {
    const type = typeof unitOrType === "string" ? unitOrType : unitOrType?.type;
    if (!type) return "Unit";
    return `${type[0].toUpperCase()}${type.slice(1)}`;
  }

  getUnitRoleCopy(unit) {
    if (!unit) return "";
    if (unit.type === "infantry") return "Only infantry captures buildings and starts income pressure.";
    if (unit.type === "tank") return "Tank is your frontline screen and safest first answer to road pressure.";
    if (unit.type === "artillery") return "Artillery fights from 2 to 3 tiles away and should stay behind armor.";
    return "";
  }

  getRecommendedMoveTile(unit, target = this.getAdvanceTarget(unit)) {
    if (!unit || !target) return null;
    return (
      this.getMoveOptions(unit)
        .filter((tile) => tile.x !== unit.x || tile.y !== unit.y)
        .slice()
        .sort((a, b) => {
          const distanceA = Math.abs(target.x - a.x) + Math.abs(target.y - a.y);
          const distanceB = Math.abs(target.x - b.x) + Math.abs(target.y - b.y);
          if (distanceA !== distanceB) return distanceA - distanceB;
          if (a.cost !== b.cost) return a.cost - b.cost;
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        })[0] ?? null
    );
  }

  getOpeningAnchor(unitOrId) {
    const id = typeof unitOrId === "string" ? unitOrId : unitOrId?.id;
    return id ? OPENING_ANCHORS[id] ?? null : null;
  }

  getOpeningMoveTile(unit) {
    const anchor = this.getOpeningAnchor(unit);
    if (!unit || !anchor) return null;
    if (unit.x === anchor.x && unit.y === anchor.y) return { ...anchor };
    return (
      this.getMoveOptions(unit)
        .filter((tile) => tile.x !== unit.x || tile.y !== unit.y)
        .slice()
        .sort((a, b) => {
          const distanceA = Math.abs(anchor.x - a.x) + Math.abs(anchor.y - a.y);
          const distanceB = Math.abs(anchor.x - b.x) + Math.abs(anchor.y - b.y);
          if (distanceA !== distanceB) return distanceA - distanceB;
          if (a.cost !== b.cost) return a.cost - b.cost;
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        })[0] ?? null
    );
  }

  primeUnit(unit, cursorTarget, message) {
    if (!unit) return false;
    this.selectedId = unit.id;
    this.selectionOrigin = { x: unit.x, y: unit.y };
    this.cursor = cursorTarget ? { x: cursorTarget.x, y: cursorTarget.y } : { x: unit.x, y: unit.y };
    this.endTurnConfirmKey = null;
    this.message = message;
    return true;
  }

  primeOpeningFollowup(unitId, message) {
    if (this.phase !== "player" || this.turn !== 1 || this.status !== "play") return false;
    const unit = this.getUnitById(unitId);
    if (!unit || (unit.moved && unit.acted)) return false;
    return this.primeUnit(unit, this.getOpeningMoveTile(unit), message);
  }

  primeOpeningTurn() {
    if (this.phase !== "player" || this.turn !== 1 || this.status !== "play") return;
    const infantry = this.getOpeningInfantry();
    if (!infantry || infantry.moved || infantry.acted) return;
    const openingTile = this.getOpeningMoveTile(infantry);
    if (openingTile) {
      this.primeUnit(
        infantry,
        openingTile,
        "Opening move primed. Press Move or Enter to send infantry onto the forward neutral city, then Capture.",
      );
      return;
    }

    this.primeUnit(
      infantry,
      this.getOpeningAnchor(infantry),
      "Opening infantry primed. Move onto the forward city, then start capture before touching the other blue units.",
    );
  }

  setCursor(x, y) {
    this.endTurnConfirmKey = null;
    this.cursor = { x: clamp(x, 0, GRID_WIDTH - 1), y: clamp(y, 0, GRID_HEIGHT - 1) };
  }

  moveCursor(dx, dy) {
    this.setCursor(this.cursor.x + dx, this.cursor.y + dy);
  }

  clearSelection() {
    this.selectedId = null;
    this.selectionOrigin = null;
    this.endTurnConfirmKey = null;
  }

  isUnitReady(unit) {
    if (!unit || unit.side !== "player" || unit.hp <= 0) return false;
    if (!unit.moved) return true;
    if (unit.acted) return false;
    const structure = this.getStructureAt(unit.x, unit.y);
    const canCapture = unit.type === "infantry" && structure && structure.owner !== "player";
    const canAttack = this.getAttackOptions(unit).length > 0;
    return canCapture || canAttack;
  }

  getReadyUnits() {
    return this.units.filter((unit) => this.isUnitReady(unit));
  }

  canSelect(unit) {
    return unit && unit.side === "player" && unit.hp > 0 && this.phase === "player" && this.status === "play";
  }

  canMoveTo(unit, x, y) {
    if (!unit || unit.moved || unit.acted) return false;
    return this.getMoveOptions(unit).some((tile) => tile.x === x && tile.y === y);
  }

  getMoveOptions(unit) {
    return getMoveTiles(this.map, unit, this.units).filter(
      (tile) => !this.getUnitAt(tile.x, tile.y) || (tile.x === unit.x && tile.y === unit.y),
    );
  }

  getAttackOptions(unit) {
    if (!unit) return [];
    const origin = unit.moved && this.selectionOrigin ? { x: unit.x, y: unit.y } : unit;
    return getAttackTargets(unit, this.units, origin);
  }

  selectCurrent() {
    const unit = this.getUnitAt(this.cursor.x, this.cursor.y);
    if (!this.canSelect(unit)) return false;
    if (unit.moved && unit.acted) return false;
    this.selectedId = unit.id;
    this.selectionOrigin = { x: unit.x, y: unit.y };
    this.message = `${unit.type} selected. Move, attack, or capture from the highlighted space.`;
    return true;
  }

  moveSelected() {
    const unit = this.getSelectedUnit();
    if (!this.canMoveTo(unit, this.cursor.x, this.cursor.y)) {
      this.message = "Move blocked.";
      return false;
    }
    unit.x = this.cursor.x;
    unit.y = this.cursor.y;
    unit.moved = true;
    unit.fuel = Math.max(0, unit.fuel - terrainCost(this.map, unit.x, unit.y));
    unit.capture = 0;
    this.message = `${unit.type} moved.`;

    const structure = this.getStructureAt(unit.x, unit.y);
    const canCaptureNow = unit.type === "infantry" && structure && structure.owner !== "player";
    const canAttackNow = this.getAttackOptions(unit).length > 0;
    const openingInfantryAdvance = unit.id === "p-inf-1" && this.turn === 1;
    const openingTankAdvance = unit.id === "p-tank-1" && this.turn === 1;
    const openingArtilleryAdvance = unit.id === "p-art-1" && this.turn === 1;

    if (openingInfantryAdvance && canCaptureNow) {
      this.message = "Infantry reached the forward city. Capture now so the opener teaches buildings before the frontline accelerates.";
      return true;
    }

    if (!canCaptureNow && !canAttackNow) {
      const movedType = unit.type;
      if (
        openingInfantryAdvance &&
        this.primeOpeningFollowup(
          "p-tank-1",
          "Infantry advanced. Tank primed next; press Move or Enter to screen the road before red can punish the lane.",
        )
      ) {
        return true;
      }
      if (
        openingTankAdvance &&
        this.primeOpeningFollowup(
          "p-art-1",
          "Tank moved into the road screen. Artillery primed next; press Move or Enter to park behind the armor.",
        )
      ) {
        return true;
      }
      this.clearSelection();
      this.message = openingArtilleryAdvance
        ? "Artillery parked behind the tank. End turn now and watch how red answers the lane."
        : `${movedType} moved. Select another blue unit or end the turn.`;
    }

    return true;
  }

  canAttack(attacker, target) {
    if (!attacker || !target || attacker.side === target.side || attacker.acted) return false;
    return this.getAttackOptions(attacker).some((candidate) => candidate.id === target.id) && attacker.ammo > 0;
  }

  attackWithSelected() {
    const attacker = this.getSelectedUnit();
    const target = this.getUnitAt(this.cursor.x, this.cursor.y);
    if (!attacker || !target || !this.canAttack(attacker, target)) {
      this.message = "Target out of range.";
      return false;
    }

    const outcome = resolveCombat(attacker, target, this.map);
    attacker.hp = outcome.attackerHp;
    target.hp = outcome.defenderHp;
    attacker.ammo = Math.max(0, attacker.ammo - outcome.ammoCost);
    target.ammo = Math.max(0, target.ammo - outcome.counterAmmoCost);
    attacker.acted = true;
    attacker.moved = true;
    attacker.capture = 0;

    if (target.hp <= 0) {
      this.message = `${target.type} destroyed.`;
    } else if (outcome.counterDamage > 0) {
      this.message = `${attacker.type} dealt ${outcome.damage}. Counter hit for ${outcome.counterDamage}.`;
    } else {
      this.message = `${attacker.type} dealt ${outcome.damage}.`;
    }

    this.units = this.units.filter((unit) => unit.hp > 0);
    if (attacker.hp <= 0) {
      this.clearSelection();
    }
    this.checkVictory();
    return true;
  }

  captureSelected() {
    const unit = this.getSelectedUnit();
    const structure = this.getStructureAt(unit?.x ?? -1, unit?.y ?? -1);
    if (!unit || unit.type !== "infantry" || !structure || structure.owner === "player" || unit.acted) {
      this.message = "Capture not available here.";
      return false;
    }

    const progress = updateCaptureProgress(unit, structure);
    unit.capture = progress.capture;
    unit.acted = true;
    unit.moved = true;

    if (progress.captured) {
      structure.owner = "player";
      unit.capture = 0;
      this.message = `${structure.type} captured.`;
    } else {
      this.message = `Capture progress ${unit.capture}/20.`;
    }

    if (
      unit.id === "p-inf-1" &&
      this.turn === 1 &&
      this.primeOpeningFollowup(
        "p-tank-1",
        progress.captured
          ? "Forward city captured. Tank primed next; press Move or Enter to screen the road while infantry holds income."
          : `Forward city capture started at ${unit.capture}/20. Tank primed next; press Move or Enter to protect the lane while infantry holds.`,
      )
    ) {
      return true;
    }

    this.checkVictory();
    return true;
  }

  endTurn() {
    if (this.status !== "play" || this.phase !== "player") return false;
    const readyUnits = this.getReadyUnits();
    if (this.turn <= 2 && readyUnits.length > 0) {
      const confirmKey = `${this.turn}:${readyUnits.length}`;
      if (this.endTurnConfirmKey !== confirmKey) {
        this.endTurnConfirmKey = confirmKey;
        this.message = `${readyUnits.length} blue unit${readyUnits.length === 1 ? "" : "s"} still ready. Spend them first, or press End turn again to hand tempo to red.`;
        return false;
      }
    }
    this.endTurnConfirmKey = null;
    this.clearSelection();
    this.phase = "enemy";
    this.enemyTimer = this.turn <= 2 ? 2.45 : 1.2;
    this.message = "Enemy phase. No input now. Watch the frontline, then answer on your next blue turn.";
    this.funds.enemy += incomeForTurn(this.structures.filter((structure) => structure.owner === "enemy"));
    return true;
  }

  refreshUnits(side = null) {
    for (const unit of this.units) {
      if (!side || unit.side === side) {
        unit.moved = false;
        unit.acted = false;
        unit.capture = 0;
      }
      unit.ammo = Math.max(0, unit.ammo);
      unit.fuel = Math.max(0, unit.fuel);
    }
  }

  enemyTurn() {
    const actions = chooseEnemyActions({
      units: this.units.map(cloneUnit),
      structures: this.structures.map((structure) => ({ ...structure })),
      map: this.map.map((row) => row.slice()),
    });

    for (const action of actions) {
      const unit = this.units.find((candidate) => candidate.id === action.unitId && candidate.hp > 0);
      if (!unit) continue;

      if (typeof action.x === "number" && typeof action.y === "number") {
        const occupied = this.getUnitAt(action.x, action.y);
        if (!occupied || occupied.id === unit.id) {
          unit.x = action.x;
          unit.y = action.y;
        }
      }

      if (action.type === "attack" || action.type === "move-attack") {
        const target = this.units.find((candidate) => candidate.id === action.targetId && candidate.hp > 0);
        if (target && this.canAttack(unit, target)) {
          const outcome = resolveCombat(unit, target, this.map);
          unit.hp = outcome.attackerHp;
          target.hp = outcome.defenderHp;
          unit.ammo = Math.max(0, unit.ammo - outcome.ammoCost);
          target.ammo = Math.max(0, target.ammo - outcome.counterAmmoCost);
        }
      } else if (action.type === "move-capture") {
        const structure = this.getStructureAt(unit.x, unit.y);
        if (structure && structure.owner !== "enemy") {
          const progress = updateCaptureProgress(unit, structure);
          if (progress.captured) {
            structure.owner = "enemy";
          }
        }
      }
    }

    this.units = this.units.filter((unit) => unit.hp > 0);
  }

  confirm() {
    if (this.status !== "play") return false;

    const selected = this.getSelectedUnit();
    const current = this.getUnitAt(this.cursor.x, this.cursor.y);

    if (!selected) {
      return this.selectCurrent();
    }

    if (this.cursor.x === selected.x && this.cursor.y === selected.y) {
      if (this.captureSelected()) return true;
      this.clearSelection();
      this.message = "Selection cleared.";
      return true;
    }

    if (current && current.side !== selected.side) {
      return this.attackWithSelected();
    }

    if (this.moveSelected()) return true;

    return this.selectCurrent();
  }

  handleAction(action) {
    if (action !== "end") {
      this.endTurnConfirmKey = null;
    }
    if (action === "restart") {
      this.restart();
      return true;
    }
    if (action === "start") {
      this.start();
      return true;
    }
    if (this.status !== "play") return false;

    if (action === "confirm") return this.confirm();
    if (action === "clear") {
      this.clearSelection();
      this.message = "Selection cleared.";
      return true;
    }
    if (action === "move") return this.moveSelected();
    if (action === "attack") return this.attackWithSelected();
    if (action === "capture") return this.captureSelected();
    if (action === "end") return this.endTurn();
    if (action === "select") return this.selectCurrent();
    return false;
  }

  checkVictory() {
    const playerHQ = this.structures.find((structure) => structure.id === "p-hq");
    const enemyHQ = this.structures.find((structure) => structure.id === "e-hq");
    const playerAlive = this.units.some((unit) => unit.side === "player" && unit.hp > 0);
    const enemyAlive = this.units.some((unit) => unit.side === "enemy" && unit.hp > 0);

    if (playerHQ?.owner === "enemy" || !playerAlive) {
      this.status = "lose";
      this.phase = "lose";
      this.winner = "enemy";
      this.message = "Your line broke and the HQ fell.";
      return;
    }

    if (enemyHQ?.owner === "player" || !enemyAlive) {
      this.status = "win";
      this.phase = "win";
      this.winner = "player";
      this.message = "Enemy HQ taken. The skirmish is yours.";
    }
  }

  getOpeningBrief(selected, actions) {
    if (this.status !== "play" || this.phase !== "player" || this.turn > 2) return null;

    const infantry = this.units.find((unit) => unit.id === "p-inf-1" && unit.hp > 0) ?? null;
    const tank = this.units.find((unit) => unit.id === "p-tank-1" && unit.hp > 0) ?? null;
    const artillery = this.units.find((unit) => unit.id === "p-art-1" && unit.hp > 0) ?? null;
    const centerCity = this.structures.find((structure) => structure.id === "mid-city") ?? null;
    const centerBase = this.structures.find((structure) => structure.id === "mid-base") ?? null;
    const tags = ["Move", "Capture", "Tank screens", "Artillery follows"];

    if (infantry && !selected && !infantry.moved && !infantry.acted) {
      return {
        title: "Start here",
        body: "Pick the flashing blue infantry in the lower-left. Infantry is the only unit that can take neutral buildings, so it owns the first move.",
        tags,
        roleFocus: ["Infantry", "Tank"],
        focusTiles: [{ x: infantry.x, y: infantry.y, kind: "unit" }],
        routeTiles: [],
      };
    }

    if (selected?.id === "p-inf-1" && !selected.moved) {
      return {
        title: "Take the forward city first",
        body: "Infantry is already primed. Press Move or Enter now to step onto the neutral city, then Capture before touching the other blue units.",
        tags,
        roleFocus: ["Infantry", "Tank"],
        focusTiles: centerCity ? [{ x: centerCity.x, y: centerCity.y, kind: "capture" }] : [],
        routeTiles: [
          { x: 1, y: 6 },
          { x: 1, y: 5 },
          { x: 1, y: 4 },
        ],
      };
    }

    if (selected?.id === "p-inf-1" && actions.capture) {
      return {
        title: "Start the capture immediately",
        body: "Infantry is on the forward city now. Use Capture before ending the unit so the opening teaches income pressure with one obvious button.",
        tags,
        roleFocus: ["Infantry", "Tank"],
        focusTiles: [{ x: selected.x, y: selected.y, kind: "capture" }],
        routeTiles: [],
      };
    }

    if (tank && !tank.moved && !tank.acted) {
      return {
        title: "Screen the road with the tank",
        body: "Use the tank next. Move it onto the highlighted road tile so red answers armor before it reaches your infantry.",
        tags,
        roleFocus: ["Tank", "Artillery"],
        focusTiles: [{ x: tank.x, y: tank.y, kind: "unit" }],
        routeTiles: [
          { x: tank.x, y: tank.y },
          { x: 3, y: 6 },
          { x: 4, y: 6 },
        ],
      };
    }

    if (artillery && !artillery.moved && !artillery.acted) {
      return {
        title: "Park artillery behind the line",
        body: "Move artillery last. Park it behind the tank so the opening reads as capture in front, armor in lane, support in back.",
        tags,
        roleFocus: ["Artillery"],
        focusTiles: [{ x: artillery.x, y: artillery.y, kind: "unit" }],
        routeTiles: [
          { x: artillery.x, y: artillery.y },
          { x: 1, y: 7 },
          { x: 1, y: 6 },
          { x: 2, y: 6 },
        ],
      };
    }

    if (actions.end && this.getReadyUnits().length === 0) {
      return {
        title: "Close the turn",
        body: "Every blue unit has acted. End turn now so red moves resolve and your captured ground starts paying off.",
        tags,
        roleFocus: ["Infantry", "Tank"],
        focusTiles: [],
        routeTiles: [],
      };
    }

    if (infantry && centerBase && centerBase.owner !== "player" && infantry.hp > 0) {
      return {
        title: "Keep the center pressure",
        body: "Hold the forward city while the tank and artillery take road space. The opener should read as one protected lane, not three isolated units.",
        tags,
        roleFocus: ["Infantry", "Tank"],
        focusTiles: [{ x: centerBase.x, y: centerBase.y, kind: "structure" }],
        routeTiles: [],
      };
    }

    return null;
  }

  getOpeningSteps() {
    if (this.status !== "play" || this.turn > 2) return [];

    const infantry = this.getUnitById("p-inf-1");
    const tank = this.getUnitById("p-tank-1");
    const artillery = this.getUnitById("p-art-1");
    const centerCity = this.structures.find((structure) => structure.id === "mid-city") ?? null;

    const infantryMoved = !!infantry && (infantry.moved || infantry.acted || infantry.x !== 1 || infantry.y !== 6);
    const cityCaptureStarted =
      !!infantry &&
      !!centerCity &&
      ((infantry.x === centerCity.x && infantry.y === centerCity.y && infantry.capture > 0) || centerCity.owner === "player");
    const tankMoved = !!tank && (tank.moved || tank.acted || tank.x !== 2 || tank.y !== 6);
    const artilleryMoved = !!artillery && (artillery.moved || artillery.acted || artillery.x !== 0 || artillery.y !== 7);
    const playerStillActing = this.phase === "player";

    return [
      {
        label: "Move to forward city",
        state: infantryMoved ? "done" : playerStillActing ? "current" : "pending",
        copy: "Start with infantry and land on the neutral city right in front of your base so the first move has one obvious payoff.",
      },
      {
        label: "Start capture",
        state: cityCaptureStarted ? "done" : infantryMoved && playerStillActing ? "current" : "pending",
        copy: "Use Capture right after the move. Buildings do nothing until infantry spends an action claiming them.",
      },
      {
        label: "Screen with tank",
        state: tankMoved ? "done" : infantryMoved && playerStillActing ? "current" : "pending",
        copy: "Move tank to the road screen so the first red counter-push hits armor instead of the capture lane.",
      },
      {
        label: "Park artillery",
        state: artilleryMoved ? "done" : tankMoved && playerStillActing ? "current" : "pending",
        copy: "Keep artillery one tile behind the tank. Support should read from one lane, not from scattered pieces.",
      },
      {
        label: this.phase === "enemy" ? "Watch red answer" : "End turn",
        state: this.phase === "enemy" || this.turn > 1 ? "current" : infantryMoved && tankMoved && artilleryMoved ? "current" : "pending",
        copy:
          this.phase === "enemy"
            ? "No input now. Watch which red unit takes center lane so your next blue move has context."
            : "Only end when blue units are spent. Red cannot act until you commit the turn.",
      },
    ];
  }

  getGuide(selected, actions) {
    const readyUnits = this.getReadyUnits();
    const firstReady = readyUnits[0] ?? null;
    const openingInfantry = this.getOpeningInfantry();
    const openingMove = this.getOpeningMoveTile(openingInfantry);
    const openingTank = this.getUnitById("p-tank-1");
    const openingTankMove = this.getOpeningMoveTile(openingTank);
    const openingArtillery = this.getUnitById("p-art-1");
    const openingArtilleryMove = this.getOpeningMoveTile(openingArtillery);

    if (this.phase === "enemy") {
      return {
        title: "Enemy phase",
        body: "Red units resolve automatically after a short beat. Watch who advances into center lane, then answer with a fresh blue unit.",
        focusTiles: [],
      };
    }

    if (selected && this.turn === 1 && selected.id === openingInfantry?.id && actions.move && openingMove) {
      return {
        title: "Step 1: Move infantry",
        body: "Infantry is already selected. Press Move or Enter to step onto the forward neutral city, then Capture right away.",
        focusTiles: [openingMove],
      };
    }

    if (!selected && this.turn === 1 && openingInfantry && !openingInfantry.moved && !openingInfantry.acted) {
      return {
        title: "Step 1: Select infantry",
        body: "Start with the glowing blue infantry on the lower-left road. It is your capture unit and the safest first move.",
        focusTiles: [openingInfantry],
      };
    }

    if (selected && actions.capture) {
      return {
        title: "Step 2: Capture pressure",
        body: "Infantry is standing on the forward city. Capture now so the opener teaches building pressure before combat noise starts.",
        focusTiles: [{ x: selected.x, y: selected.y }],
      };
    }

    if (selected && this.turn === 1 && selected.id === openingTank?.id && actions.move && openingTankMove) {
      return {
        title: "Step 3: Screen with tank",
        body: "Tank is primed. Press Move or Enter to occupy the road screen tile and keep red fire off the capture lane.",
        focusTiles: [openingTankMove],
      };
    }

    if (selected && this.turn === 1 && selected.id === openingArtillery?.id && actions.move && openingArtilleryMove) {
      return {
        title: "Step 4: Park artillery",
        body: "Artillery is primed. Press Move or Enter to park behind the tank so the opening reads as one layered lane.",
        focusTiles: [openingArtilleryMove],
      };
    }

    if (selected && actions.attack) {
      return {
        title: "Attack window",
        body: "Your cursor is on a valid target. Fire before ending the turn so you trade damage while your line is still set.",
        focusTiles: [{ x: this.cursor.x, y: this.cursor.y }],
      };
    }

    if (actions.end && readyUnits.length === 0) {
      return {
        title: "Step 3: End turn",
        body: "Every blue unit is spent. End turn now so red units move and your next income tick arrives.",
        focusTiles: [],
      };
    }

    if (!selected && firstReady) {
      return {
        title: "Spend a blue unit",
        body: "Pick a glowing ready unit, then move once before ending the turn. Tanks screen the road; artillery fights from behind them.",
        focusTiles: [firstReady],
      };
    }

    return {
      title: "Turn flow",
      body: "Select a blue unit, move once, then attack or capture. Tanks front the road, artillery wants distance, infantry wins buildings.",
      focusTiles: [],
    };
  }

  getCursorIntel(selected, current, actions) {
    const terrain = this.getTerrainAt(this.cursor.x, this.cursor.y);
    const terrainLabel = this.getTerrainLabel(terrain);
    const structure = this.getStructureAt(this.cursor.x, this.cursor.y);
    const ownerLabel =
      !structure || structure.owner == null ? "neutral" : structure.owner === "player" ? "blue-held" : "red-held";

    if (selected && current && current.side !== selected.side && actions.attack) {
      return {
        title: `${this.getUnitLabel(current)} in range`,
        copy: `${this.getUnitLabel(selected)} can fire here now. Attack before ending turn if you want to trade while your line is set.`,
        detail: `${terrainLabel} tile. ${this.getUnitLabel(current)} HP ${current.hp}.`,
      };
    }

    if (selected && structure && selected.type === "infantry" && structure.owner !== "player" && actions.capture) {
      return {
        title: `${terrainLabel} ready to capture`,
        copy: "Spend infantry here to start or finish takeover. Buildings only pay after a capture action lands.",
        detail: `${ownerLabel} ${structure.type}. Infantry capture progress ${selected.capture}/20.`,
      };
    }

    if (current) {
      const readyLabel = current.side === "player" ? (current.moved || current.acted ? "spent this turn" : "ready to act") : "enemy unit";
      return {
        title: `${current.side === "player" ? "Blue" : "Red"} ${this.getUnitLabel(current)}`,
        copy: `${this.getUnitRoleCopy(current)} ${current.side === "player" ? `This unit is ${readyLabel}.` : "Check its lane before exposing infantry."}`,
        detail: `${terrainLabel} tile. HP ${current.hp}, ammo ${current.ammo}, fuel ${current.fuel}.`,
      };
    }

    if (structure) {
      return {
        title: `${ownerLabel} ${structure.type}`,
        copy:
          structure.owner === "player"
            ? "This building already pays blue each turn."
            : "Only infantry can flip this building. Move armor first if the lane is not safe yet.",
        detail: `${terrainLabel} tile at ${this.cursor.x + 1}, ${this.cursor.y + 1}.`,
      };
    }

    if (selected && actions.move) {
      return {
        title: `${terrainLabel} move tile`,
        copy: `${this.getUnitLabel(selected)} can move here now. End on roads for speed, forests for cover, and avoid leaving infantry unscreened.`,
        detail: `Cursor ${this.cursor.x + 1}, ${this.cursor.y + 1}.`,
      };
    }

    return {
      title: `${terrainLabel} tile`,
      copy: "Move the cursor over units or buildings to read what that square contributes before you commit a turn.",
      detail: `Cursor ${this.cursor.x + 1}, ${this.cursor.y + 1}.`,
    };
  }

  getTurnSummary(readyUnits, selected) {
    if (this.phase === "enemy") {
      return {
        title: "Red is answering",
        copy: "Blue cannot act during enemy phase. Watch which red unit claims the center lane so your next turn has a concrete response.",
      };
    }

    if (readyUnits.length === 0) {
      return {
        title: "Blue turn spent",
        copy: "Every blue unit has acted. End turn to resolve the red answer and collect any captured income.",
      };
    }

    return {
      title: `${readyUnits.length} blue unit${readyUnits.length === 1 ? "" : "s"} left`,
      copy: selected
        ? "Finish this unit's move, attack, or capture before jumping to another blue piece."
        : "Red cannot move until you press End turn, so spend your remaining blue units before giving up tempo.",
    };
  }

  getFrameState() {
    const selected = this.getSelectedUnit();
    const moveTiles = selected && !selected.moved && !selected.acted ? this.getMoveOptions(selected) : [];
    const attackTiles = selected && !selected.acted ? getAttackTiles(selected, { x: selected.x, y: selected.y }) : [];
    const attackTargets = selected && !selected.acted ? this.getAttackOptions(selected).map((unit) => unit.id) : [];
    const structure = selected ? this.getStructureAt(selected.x, selected.y) : null;
    const canCapture = !!selected && selected.type === "infantry" && structure && structure.owner !== "player" && !selected.acted;
    const current = this.getUnitAt(this.cursor.x, this.cursor.y);
    const readyUnits = this.getReadyUnits();
    const actions = {
      select: !selected && !!current && this.canSelect(current) && (!current.moved || !current.acted),
      move: !!selected && this.canMoveTo(selected, this.cursor.x, this.cursor.y),
      attack: !!selected && !!current && this.canAttack(selected, current),
      capture: canCapture,
      clear: !!selected,
      end: this.phase === "player" && this.status === "play",
      recommended: "select",
    };

    if (this.phase === "enemy") {
      actions.recommended = "clear";
    } else if (actions.capture) {
      actions.recommended = "capture";
    } else if (actions.attack) {
      actions.recommended = "attack";
    } else if (actions.move) {
      actions.recommended = "move";
    } else if (actions.select) {
      actions.recommended = "select";
    } else if (actions.end && readyUnits.length === 0) {
      actions.recommended = "end";
    } else if (actions.clear) {
      actions.recommended = "clear";
    } else {
      actions.recommended = "end";
    }

    const openingBrief = this.getOpeningBrief(selected, actions);
    const openingSteps = this.getOpeningSteps();
    const currentOpeningStep = openingSteps.find((step) => step.state === "current") ?? null;
    const nextOpeningStep = openingSteps.find((step) => step.state === "pending") ?? null;
    const roleReminder = openingBrief
      ? getOpeningRoleSet(openingBrief.roleFocus)
          .slice(0, 1)
          .map((role) => role.copy)
          .join(" ")
      : "Infantry captures ground, tank screens the lane, artillery stays one tile behind armor.";
    const controlHint =
      this.phase === "enemy"
        ? "Watch red finish the answer, then blue gets full control again."
        : actions.recommended === "move"
          ? "Enter follows the recommended move. Escape clears selection if you need to reset."
          : actions.recommended === "capture"
            ? "Capture spends infantry on the tile now. End turn only after blue units are spent."
            : actions.recommended === "attack"
              ? "Attack lands on the cursor target now. Red cannot answer until you end the turn."
              : "Blue acts first. Use the glowing unit before handing tempo to red.";

    return {
      status: this.status,
      phase: this.phase,
      turn: this.turn,
      funds: this.funds.player,
      enemyFunds: this.funds.enemy,
      cursor: { ...this.cursor },
      selectedUnit: selected ? { ...selected } : null,
      units: this.units.map((unit) => ({ ...unit })),
      structures: this.structures.map((structureItem) => ({ ...structureItem })),
      map: this.map.map((row) => row.slice()),
      moveTiles,
      attackTiles,
      attackTargets,
      message: this.message,
      objective: CONTROL_TEXT.objective,
      overlay: {
        title:
          this.status === "menu"
            ? "Advance Wars Skirmish"
            : this.status === "win"
              ? "Victory"
              : this.status === "lose"
                ? "Defeat"
                : "",
        copy: this.message,
      },
      hud: {
        currentTurn: this.phase === "enemy" ? "Enemy phase" : "Player phase",
        selectedSummary: selected
          ? `${selected.type} HP ${selected.hp} Ammo ${selected.ammo} Fuel ${selected.fuel}`
          : "No unit selected.",
        canCapture,
      },
      turnSummary: this.getTurnSummary(readyUnits, selected),
      cursorIntel: this.getCursorIntel(selected, current, actions),
      actions,
      guide: this.getGuide(selected, actions),
      openingBrief: openingBrief
        ? {
            ...openingBrief,
            steps: openingSteps,
            currentStep: currentOpeningStep,
            nextStep: nextOpeningStep,
            roleReminder,
            controlHint,
            roles: getOpeningRoleSet(openingBrief.roleFocus),
          }
        : this.turn <= 2
          ? {
              title: this.phase === "enemy" ? "Watch the red answer" : "Opening plan",
              body:
                this.phase === "enemy"
                  ? "Red moves only after you end the turn. Watch which unit claims center pressure, then retake initiative."
                  : "Blue units act first. Spend infantry on buildings, tank on lane control, artillery on safe support fire.",
              tags: ["Blue acts now", "Red waits for End turn", "Infantry captures"],
              focusTiles: [],
              routeTiles: [],
              steps: openingSteps,
              currentStep: currentOpeningStep,
              nextStep: nextOpeningStep,
              roleReminder,
              controlHint,
              roles: getOpeningRoleSet(["Infantry", "Tank"]),
            }
          : null,
    };
  }
}
