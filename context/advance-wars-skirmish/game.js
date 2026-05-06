(() => {
  // advance-wars-skirmish/src/data.js
  var GRID_WIDTH = 10;
  var GRID_HEIGHT = 8;
  var UNIT_TYPES = {
    infantry: { move: 3, minRange: 1, maxRange: 1, ammo: 99, fuel: 99, attack: 3, maxHp: 10, capture: 10, cost: 1000, symbol: "I" },
    tank: { move: 5, minRange: 1, maxRange: 1, ammo: 6, fuel: 50, attack: 7, maxHp: 10, capture: 0, cost: 7000, symbol: "T" },
    artillery: { move: 3, minRange: 2, maxRange: 3, ammo: 6, fuel: 40, attack: 5, maxHp: 10, capture: 0, cost: 6000, symbol: "A" }
  };
  var MAP = [
    ["hq", "road", "plain", "plain", "forest", "road", "plain", "plain", "road", "plain"],
    ["road", "road", "plain", "forest", "road", "road", "plain", "forest", "road", "road"],
    ["plain", "plain", "road", "road", "plain", "forest", "road", "plain", "plain", "plain"],
    ["plain", "city", "road", "plain", "road", "road", "plain", "plain", "base", "plain"],
    ["plain", "city", "base", "forest", "road", "road", "forest", "city", "base", "plain"],
    ["plain", "plain", "road", "plain", "forest", "road", "plain", "plain", "road", "plain"],
    ["road", "forest", "road", "plain", "road", "road", "plain", "forest", "road", "road"],
    ["plain", "road", "plain", "plain", "forest", "road", "plain", "plain", "road", "hq"]
  ];
  var STRUCTURES = [
    { id: "p-hq", type: "hq", owner: "player", x: 0, y: 0 },
    { id: "p-city", type: "city", owner: "player", x: 1, y: 3 },
    { id: "p-base", type: "base", owner: "player", x: 2, y: 4 },
    { id: "mid-city", type: "city", owner: null, x: 1, y: 4 },
    { id: "mid-base", type: "base", owner: null, x: 8, y: 4 },
    { id: "e-base", type: "base", owner: "enemy", x: 8, y: 3 },
    { id: "e-city", type: "city", owner: "enemy", x: 7, y: 4 },
    { id: "e-hq", type: "hq", owner: "enemy", x: 9, y: 7 }
  ];
  var SCENARIO_SETUP = {
    funds: { player: 5000, enemy: 5000 },
    cursor: { x: 1, y: 6 },
    units: [
      { id: "p-inf-1", side: "player", type: "infantry", x: 1, y: 6 },
      { id: "p-tank-1", side: "player", type: "tank", x: 2, y: 6 },
      { id: "p-art-1", side: "player", type: "artillery", x: 0, y: 7 },
      { id: "e-inf-1", side: "enemy", type: "infantry", x: 8, y: 1 },
      { id: "e-tank-1", side: "enemy", type: "tank", x: 7, y: 1 },
      { id: "e-art-1", side: "enemy", type: "artillery", x: 9, y: 0 }
    ]
  };
  var CONTROL_TEXT = {
    menu: "Turn 1: infantry moves to the forward city, captures it, then tank screens the lane.",
    playerPhase: "Player phase. Follow the opening steps, then end turn when blue units are spent.",
    objective: "Take the enemy HQ or wipe the army."
  };

  // advance-wars-skirmish/src/rules.js
  var TERRAIN_COST = {
    plain: 1,
    road: 1,
    city: 1,
    base: 1,
    hq: 1,
    forest: 2
  };
  var DEFENSE_BONUS = {
    plain: 0,
    road: 0,
    forest: 1,
    city: 2,
    base: 2,
    hq: 3
  };
  function key(x, y) {
    return `${x},${y}`;
  }
  function inBounds(x, y) {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
  }
  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
  function terrainCost(map, x, y) {
    const terrain = map[y]?.[x] ?? "plain";
    return TERRAIN_COST[terrain] ?? 1;
  }
  function getUnitAt(units, x, y) {
    return units.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y) ?? null;
  }
  function getMoveTiles(map, unit, units) {
    const frontier = [{ x: unit.x, y: unit.y, cost: 0 }];
    const bestCost = new Map([[key(unit.x, unit.y), 0]]);
    const results = [];
    const blockers = new Set(units.filter((candidate) => candidate.hp > 0 && candidate.id !== unit.id).map((candidate) => key(candidate.x, candidate.y)));
    while (frontier.length > 0) {
      const current = frontier.shift();
      const currentKey = key(current.x, current.y);
      const knownCost = bestCost.get(currentKey);
      if (knownCost !== current.cost)
        continue;
      results.push({ x: current.x, y: current.y, cost: current.cost });
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const nextX = current.x + dx;
        const nextY = current.y + dy;
        if (!inBounds(nextX, nextY))
          continue;
        const nextKey = key(nextX, nextY);
        if (blockers.has(nextKey))
          continue;
        const nextCost = current.cost + terrainCost(map, nextX, nextY);
        if (nextCost > UNIT_TYPES[unit.type].move)
          continue;
        const best = bestCost.get(nextKey);
        if (best !== undefined && best <= nextCost)
          continue;
        bestCost.set(nextKey, nextCost);
        frontier.push({ x: nextX, y: nextY, cost: nextCost });
      }
    }
    return results;
  }
  function getAttackTiles(unit, origin = unit) {
    const spec = UNIT_TYPES[unit.type];
    const tiles = [];
    for (let y = 0;y < GRID_HEIGHT; y += 1) {
      for (let x = 0;x < GRID_WIDTH; x += 1) {
        const distance = Math.abs(origin.x - x) + Math.abs(origin.y - y);
        if (distance >= spec.minRange && distance <= spec.maxRange) {
          tiles.push({ x, y, distance });
        }
      }
    }
    return tiles;
  }
  function getAttackTargets(unit, units, origin = unit) {
    return getAttackTiles(unit, origin).map((tile) => getUnitAt(units, tile.x, tile.y)).filter((target) => target && target.side !== unit.side);
  }
  function resolveCombat(attacker, defender, map) {
    const attackerSpec = UNIT_TYPES[attacker.type];
    const defenderSpec = UNIT_TYPES[defender.type];
    const terrain = map[defender.y]?.[defender.x] ?? "plain";
    const defense = DEFENSE_BONUS[terrain] ?? 0;
    const scaledAttack = attackerSpec.attack * (attacker.hp / attackerSpec.maxHp);
    const damage = Math.max(1, Math.round(scaledAttack - defense));
    const defenderHp = Math.max(0, defender.hp - damage);
    let counterDamage = 0;
    let attackerHp = attacker.hp;
    if (defenderHp > 0) {
      const distance = manhattan(attacker, defender);
      if (defender.ammo > 0 && distance >= defenderSpec.minRange && distance <= defenderSpec.maxRange) {
        const counterScaledAttack = defenderSpec.attack * (defenderHp / defenderSpec.maxHp);
        counterDamage = Math.max(1, Math.round(counterScaledAttack - (DEFENSE_BONUS[map[attacker.y]?.[attacker.x] ?? "plain"] ?? 0)));
        attackerHp = Math.max(0, attacker.hp - counterDamage);
      }
    }
    return {
      attackerHp,
      defenderHp,
      damage,
      counterDamage,
      ammoCost: 1,
      counterAmmoCost: counterDamage > 0 ? 1 : 0
    };
  }
  function updateCaptureProgress(unit, structure) {
    const progress = (unit.capture ?? 0) + Math.max(1, Math.ceil(unit.hp / 2));
    return {
      capture: progress,
      captured: progress >= 20,
      structureId: structure.id
    };
  }
  function incomeForTurn(structures) {
    return structures.reduce((total, structure) => {
      if (!structure.owner)
        return total;
      if (structure.type === "city" || structure.type === "base" || structure.type === "hq") {
        return total + 1000;
      }
      return total;
    }, 0);
  }
  function chooseBestMove(unit, moveTiles, goal) {
    const sorted = moveTiles.filter((tile) => !(tile.x === unit.x && tile.y === unit.y)).slice().sort((a, b) => {
      const distanceA = Math.abs(goal.x - a.x) + Math.abs(goal.y - a.y);
      const distanceB = Math.abs(goal.x - b.x) + Math.abs(goal.y - b.y);
      if (distanceA !== distanceB)
        return distanceA - distanceB;
      if (a.cost !== b.cost)
        return a.cost - b.cost;
      if (a.y !== b.y)
        return a.y - b.y;
      return a.x - b.x;
    });
    return sorted[0] ?? { x: unit.x, y: unit.y };
  }
  function chooseEnemyActions({ units, structures, map }) {
    const playerUnits = units.filter((unit) => unit.side === "player" && unit.hp > 0);
    const enemies = units.filter((unit) => unit.side === "enemy" && unit.hp > 0).slice().sort((a, b) => a.id.localeCompare(b.id));
    const enemyHQTarget = structures.find((structure) => structure.id === "p-hq") ?? { x: 0, y: 0 };
    const actions = [];
    const reserved = new Set(enemies.map((unit) => key(unit.x, unit.y)));
    for (const unit of enemies) {
      reserved.delete(key(unit.x, unit.y));
      const movableUnits = units.filter((candidate) => candidate.id !== unit.id);
      const moveTiles = getMoveTiles(map, unit, movableUnits).filter((tile) => !reserved.has(key(tile.x, tile.y)));
      const capturable = structures.filter((structure) => structure.owner !== "enemy").sort((a, b) => manhattan(unit, a) - manhattan(unit, b))[0];
      if (unit.type === "infantry" && capturable) {
        const captureMove = moveTiles.find((tile) => tile.x === capturable.x && tile.y === capturable.y);
        if (captureMove) {
          actions.push({ unitId: unit.id, type: "move-capture", x: captureMove.x, y: captureMove.y });
          reserved.add(key(captureMove.x, captureMove.y));
          continue;
        }
      }
      const attackPlans = [];
      for (const tile of moveTiles) {
        const targets = getAttackTargets(unit, playerUnits, tile);
        for (const target of targets) {
          attackPlans.push({
            unitId: unit.id,
            type: tile.x === unit.x && tile.y === unit.y ? "attack" : "move-attack",
            x: tile.x,
            y: tile.y,
            targetId: target.id,
            score: target.hp + manhattan(target, enemyHQTarget)
          });
        }
      }
      attackPlans.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
      if (attackPlans[0]) {
        const action = attackPlans[0];
        actions.push(action);
        reserved.add(key(action.x, action.y));
        continue;
      }
      const goal = capturable ?? playerUnits.slice().sort((a, b) => manhattan(unit, a) - manhattan(unit, b))[0] ?? enemyHQTarget;
      const move = chooseBestMove(unit, moveTiles, goal);
      actions.push({ unitId: unit.id, type: "move", x: move.x, y: move.y });
      reserved.add(key(move.x, move.y));
    }
    return actions;
  }

  // advance-wars-skirmish/src/render.js
  var terrainFill = {
    plain: "#526c49",
    forest: "#35533a",
    road: "#7a674d",
    city: "#55697d",
    base: "#6a5b87",
    hq: "#2d456f"
  };
  function unitColor(side) {
    return side === "player" ? "#89d6ff" : "#ff9b89";
  }
  function structureStroke(owner) {
    if (owner === "player")
      return "#89d6ff";
    if (owner === "enemy")
      return "#ff9b89";
    return "#d4dce9";
  }
  function drawRect(ctx, x, y, width, height, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
  }
  function drawOverlayTiles(ctx, tiles, layout, fill) {
    const { boardX, boardY, tile } = layout;
    ctx.fillStyle = fill;
    for (const cell of tiles) {
      ctx.fillRect(boardX + cell.x * tile + 5, boardY + cell.y * tile + 5, tile - 10, tile - 10);
    }
  }
  function drawGrid(ctx, state, layout) {
    const { boardX, boardY, tile } = layout;
    for (let y = 0;y < state.map.length; y += 1) {
      for (let x = 0;x < state.map[y].length; x += 1) {
        const terrain = state.map[y][x];
        drawRect(ctx, boardX + x * tile, boardY + y * tile, tile - 1, tile - 1, terrainFill[terrain] ?? terrainFill.plain);
      }
    }
  }
  function drawStructures(ctx, state, layout) {
    const { boardX, boardY, tile } = layout;
    for (const structure of state.structures) {
      const px = boardX + structure.x * tile;
      const py = boardY + structure.y * tile;
      ctx.strokeStyle = structureStroke(structure.owner);
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 5, py + 5, tile - 10, tile - 10);
      ctx.fillStyle = "rgba(8, 10, 16, 0.3)";
      ctx.fillRect(px + 12, py + 12, tile - 24, tile - 24);
      ctx.fillStyle = "#eef5ff";
      ctx.font = `bold ${Math.floor(tile * 0.2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(structure.type.toUpperCase(), px + tile / 2, py + tile / 2);
    }
  }
  function drawUnits(ctx, state, layout) {
    const { boardX, boardY, tile } = layout;
    const targetSet = new Set(state.attackTargets ?? []);
    for (const unit of state.units) {
      const cx = boardX + unit.x * tile + tile / 2;
      const cy = boardY + unit.y * tile + tile / 2;
      if (targetSet.has(unit.id)) {
        ctx.fillStyle = "rgba(255, 111, 111, 0.22)";
        ctx.beginPath();
        ctx.arc(cx, cy, tile * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = unitColor(unit.side);
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#10151d";
      ctx.font = `bold ${Math.floor(tile * 0.24)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(unit.type[0].toUpperCase(), cx, cy + 1);
      ctx.fillStyle = "#ecf4ff";
      ctx.font = `${Math.floor(tile * 0.15)}px sans-serif`;
      ctx.fillText(`${unit.hp}`, cx, cy + tile * 0.3);
      if (unit.moved || unit.acted) {
        ctx.strokeStyle = "rgba(255, 224, 138, 0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - tile * 0.22, cy - tile * 0.22, tile * 0.44, tile * 0.44);
      }
    }
  }
  function drawCursor(ctx, state, layout) {
    const { boardX, boardY, tile } = layout;
    const cursorPx = boardX + state.cursor.x * tile;
    const cursorPy = boardY + state.cursor.y * tile;
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 4;
    ctx.strokeRect(cursorPx + 2, cursorPy + 2, tile - 4, tile - 4);
    if (state.selectedUnit) {
      const px = boardX + state.selectedUnit.x * tile;
      const py = boardY + state.selectedUnit.y * tile;
      ctx.strokeStyle = "#89d6ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 8, py + 8, tile - 16, tile - 16);
    }
  }
  function drawRouteTiles(ctx, routeTiles, layout) {
    if (!routeTiles || routeTiles.length < 2)
      return;
    const { boardX, boardY, tile } = layout;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 224, 138, 0.8)";
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.setLineDash([tile * 0.18, tile * 0.14]);
    ctx.beginPath();
    routeTiles.forEach((cell, index) => {
      const x = boardX + cell.x * tile + tile / 2;
      const y = boardY + cell.y * tile + tile / 2;
      if (index === 0) {
        ctx.moveTo(x, y);
        return;
      }
      ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
  function drawOpeningFocus(ctx, state, layout) {
    const focusTiles = state.openingBrief?.focusTiles ?? [];
    if (focusTiles.length === 0)
      return;
    const { boardX, boardY, tile } = layout;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 240);
    ctx.save();
    for (const cell of focusTiles) {
      const cx = boardX + cell.x * tile + tile / 2;
      const cy = boardY + cell.y * tile + tile / 2;
      ctx.strokeStyle = cell.kind === "capture" ? `rgba(143, 215, 255, ${0.95 - pulse * 0.15})` : `rgba(255, 224, 138, ${0.9 - pulse * 0.18})`;
      ctx.lineWidth = Math.max(3, tile * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, tile * (0.34 + pulse * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, tile * (0.48 + pulse * 0.08), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function renderGame(ctx, state, layout) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#10151d";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawGrid(ctx, state, layout);
    drawOverlayTiles(ctx, state.moveTiles ?? [], layout, "rgba(137, 214, 255, 0.16)");
    drawOverlayTiles(ctx, state.attackTiles ?? [], layout, "rgba(255, 155, 137, 0.12)");
    drawRouteTiles(ctx, state.openingBrief?.routeTiles ?? [], layout);
    drawStructures(ctx, state, layout);
    drawUnits(ctx, state, layout);
    drawCursor(ctx, state, layout);
    drawOpeningFocus(ctx, state, layout);
  }
  function createLayout(canvasLike) {
    const width = canvasLike.width;
    const height = canvasLike.height;
    const compactHud = width <= 900;
    const horizontalReserve = compactHud ? 32 : 88;
    const topReserve = compactHud ? 172 : 108;
    const bottomReserve = compactHud ? 124 : 96;
    const minimumTile = compactHud ? 24 : 32;
    const tile = Math.max(minimumTile, Math.floor(Math.min((width - horizontalReserve) / 10, (height - topReserve - bottomReserve) / 8)));
    const boardWidth = tile * 10;
    const boardHeight = tile * 8;
    const availableHeight = Math.max(boardHeight, height - topReserve - bottomReserve);
    return {
      tile,
      boardX: Math.floor((width - boardWidth) / 2),
      boardY: topReserve + Math.max(0, Math.floor((availableHeight - boardHeight) / 2))
    };
  }

  // advance-wars-skirmish/src/Game.js
  var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  var TERRAIN_LABELS = {
    plain: "Plain",
    forest: "Forest",
    road: "Road",
    city: "City",
    base: "Base",
    hq: "HQ"
  };
  var OPENING_ROLES = [
    {
      title: "Infantry",
      copy: "Only infantry captures buildings. Feed it safe tiles first so your income starts early."
    },
    {
      title: "Tank",
      copy: "Tank leads road fights. Keep it in front so enemy fire hits armor instead of your capture unit."
    },
    {
      title: "Artillery",
      copy: "Artillery fires from 2 to 3 tiles away. Park it behind the tank, not on the frontline."
    }
  ];
  var OPENING_ANCHORS = {
    "p-inf-1": { x: 1, y: 4 },
    "p-tank-1": { x: 4, y: 6 },
    "p-art-1": { x: 2, y: 6 }
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
      capture: 0
    };
  }
  function cloneUnit(unit) {
    return { ...unit };
  }

  class Game {
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
      if (this.status !== "play")
        return;
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
        height: this.viewport.height || ctx.canvas.height
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
      if (!unit)
        return this.structures.find((structure) => structure.id === "e-hq") ?? null;
      return this.structures.filter((structure) => structure.owner !== "player").slice().sort((a, b) => {
        const distanceA = Math.abs(unit.x - a.x) + Math.abs(unit.y - a.y);
        const distanceB = Math.abs(unit.x - b.x) + Math.abs(unit.y - b.y);
        return distanceA - distanceB;
      })[0] ?? null;
    }
    getTerrainAt(x, y) {
      return this.map[y]?.[x] ?? null;
    }
    getTerrainLabel(terrain) {
      return TERRAIN_LABELS[terrain] ?? "Tile";
    }
    getUnitLabel(unitOrType) {
      const type = typeof unitOrType === "string" ? unitOrType : unitOrType?.type;
      if (!type)
        return "Unit";
      return `${type[0].toUpperCase()}${type.slice(1)}`;
    }
    getUnitRoleCopy(unit) {
      if (!unit)
        return "";
      if (unit.type === "infantry")
        return "Only infantry captures buildings and starts income pressure.";
      if (unit.type === "tank")
        return "Tank is your frontline screen and safest first answer to road pressure.";
      if (unit.type === "artillery")
        return "Artillery fights from 2 to 3 tiles away and should stay behind armor.";
      return "";
    }
    getRecommendedMoveTile(unit, target = this.getAdvanceTarget(unit)) {
      if (!unit || !target)
        return null;
      return this.getMoveOptions(unit).filter((tile) => tile.x !== unit.x || tile.y !== unit.y).slice().sort((a, b) => {
        const distanceA = Math.abs(target.x - a.x) + Math.abs(target.y - a.y);
        const distanceB = Math.abs(target.x - b.x) + Math.abs(target.y - b.y);
        if (distanceA !== distanceB)
          return distanceA - distanceB;
        if (a.cost !== b.cost)
          return a.cost - b.cost;
        if (a.y !== b.y)
          return a.y - b.y;
        return a.x - b.x;
      })[0] ?? null;
    }
    getOpeningAnchor(unitOrId) {
      const id = typeof unitOrId === "string" ? unitOrId : unitOrId?.id;
      return id ? OPENING_ANCHORS[id] ?? null : null;
    }
    getOpeningMoveTile(unit) {
      const anchor = this.getOpeningAnchor(unit);
      if (!unit || !anchor)
        return null;
      if (unit.x === anchor.x && unit.y === anchor.y)
        return { ...anchor };
      return this.getMoveOptions(unit).filter((tile) => tile.x !== unit.x || tile.y !== unit.y).slice().sort((a, b) => {
        const distanceA = Math.abs(anchor.x - a.x) + Math.abs(anchor.y - a.y);
        const distanceB = Math.abs(anchor.x - b.x) + Math.abs(anchor.y - b.y);
        if (distanceA !== distanceB)
          return distanceA - distanceB;
        if (a.cost !== b.cost)
          return a.cost - b.cost;
        if (a.y !== b.y)
          return a.y - b.y;
        return a.x - b.x;
      })[0] ?? null;
    }
    primeUnit(unit, cursorTarget, message) {
      if (!unit)
        return false;
      this.selectedId = unit.id;
      this.selectionOrigin = { x: unit.x, y: unit.y };
      this.cursor = cursorTarget ? { x: cursorTarget.x, y: cursorTarget.y } : { x: unit.x, y: unit.y };
      this.endTurnConfirmKey = null;
      this.message = message;
      return true;
    }
    primeOpeningFollowup(unitId, message) {
      if (this.phase !== "player" || this.turn !== 1 || this.status !== "play")
        return false;
      const unit = this.getUnitById(unitId);
      if (!unit || unit.moved && unit.acted)
        return false;
      return this.primeUnit(unit, this.getOpeningMoveTile(unit), message);
    }
    primeOpeningTurn() {
      if (this.phase !== "player" || this.turn !== 1 || this.status !== "play")
        return;
      const infantry = this.getOpeningInfantry();
      if (!infantry || infantry.moved || infantry.acted)
        return;
      const openingTile = this.getOpeningMoveTile(infantry);
      if (openingTile) {
        this.primeUnit(infantry, openingTile, "Step 1 primed. Press Move or Enter to send infantry onto the forward city, then Capture before ending the turn.");
        return;
      }
      this.primeUnit(infantry, this.getOpeningAnchor(infantry), "Step 1 primed. Move infantry onto the forward city, then capture it before touching the other blue units.");
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
      if (!unit || unit.side !== "player" || unit.hp <= 0)
        return false;
      if (!unit.moved)
        return true;
      if (unit.acted)
        return false;
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
      if (!unit || unit.moved || unit.acted)
        return false;
      return this.getMoveOptions(unit).some((tile) => tile.x === x && tile.y === y);
    }
    getMoveOptions(unit) {
      return getMoveTiles(this.map, unit, this.units).filter((tile) => !this.getUnitAt(tile.x, tile.y) || tile.x === unit.x && tile.y === unit.y);
    }
    getAttackOptions(unit) {
      if (!unit)
        return [];
      const origin = unit.moved && this.selectionOrigin ? { x: unit.x, y: unit.y } : unit;
      return getAttackTargets(unit, this.units, origin);
    }
    selectCurrent() {
      const unit = this.getUnitAt(this.cursor.x, this.cursor.y);
      if (!this.canSelect(unit))
        return false;
      if (unit.moved && unit.acted)
        return false;
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
        if (openingInfantryAdvance && this.primeOpeningFollowup("p-tank-1", "Infantry advanced. Tank primed next; press Move or Enter to screen the road before red can punish the lane.")) {
          return true;
        }
        if (openingTankAdvance && this.primeOpeningFollowup("p-art-1", "Tank moved into the road screen. Artillery primed next; press Move or Enter to park behind the armor.")) {
          return true;
        }
        this.clearSelection();
        this.message = openingArtilleryAdvance ? "Artillery parked behind the tank. End turn now and watch how red answers the lane." : `${movedType} moved. Select another blue unit or end the turn.`;
      }
      return true;
    }
    canAttack(attacker, target) {
      if (!attacker || !target || attacker.side === target.side || attacker.acted)
        return false;
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
      if (unit.id === "p-inf-1" && this.turn === 1 && this.primeOpeningFollowup("p-tank-1", progress.captured ? "Forward city captured. Tank primed next; press Move or Enter to screen the road while infantry holds income." : `Forward city capture started at ${unit.capture}/20. Tank primed next; press Move or Enter to protect the lane while infantry holds.`)) {
        return true;
      }
      this.checkVictory();
      return true;
    }
    endTurn() {
      if (this.status !== "play" || this.phase !== "player")
        return false;
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
        map: this.map.map((row) => row.slice())
      });
      for (const action of actions) {
        const unit = this.units.find((candidate) => candidate.id === action.unitId && candidate.hp > 0);
        if (!unit)
          continue;
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
      if (this.status !== "play")
        return false;
      const selected = this.getSelectedUnit();
      const current = this.getUnitAt(this.cursor.x, this.cursor.y);
      if (!selected) {
        return this.selectCurrent();
      }
      if (this.cursor.x === selected.x && this.cursor.y === selected.y) {
        if (this.captureSelected())
          return true;
        this.clearSelection();
        this.message = "Selection cleared.";
        return true;
      }
      if (current && current.side !== selected.side) {
        return this.attackWithSelected();
      }
      if (this.moveSelected())
        return true;
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
      if (this.status !== "play")
        return false;
      if (action === "confirm")
        return this.confirm();
      if (action === "clear") {
        this.clearSelection();
        this.message = "Selection cleared.";
        return true;
      }
      if (action === "move")
        return this.moveSelected();
      if (action === "attack")
        return this.attackWithSelected();
      if (action === "capture")
        return this.captureSelected();
      if (action === "end")
        return this.endTurn();
      if (action === "select")
        return this.selectCurrent();
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
      if (this.status !== "play" || this.phase !== "player" || this.turn > 2)
        return null;
      const infantry = this.units.find((unit) => unit.id === "p-inf-1" && unit.hp > 0) ?? null;
      const tank = this.units.find((unit) => unit.id === "p-tank-1" && unit.hp > 0) ?? null;
      const artillery = this.units.find((unit) => unit.id === "p-art-1" && unit.hp > 0) ?? null;
      const centerCity = this.structures.find((structure) => structure.id === "mid-city") ?? null;
      const centerBase = this.structures.find((structure) => structure.id === "mid-base") ?? null;
      const tags = ["Move", "Capture", "Tank screens", "Artillery follows"];
      if (infantry && !selected && !infantry.moved && !infantry.acted) {
        return {
          title: "Start here",
          body: "Pick the flashing blue infantry in the lower-left. It is the only unit that can take neutral buildings, and the first turn is built around that one job.",
          tags,
          roleFocus: ["Infantry", "Tank"],
          focusTiles: [{ x: infantry.x, y: infantry.y, kind: "unit" }],
          routeTiles: []
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
            { x: 1, y: 4 }
          ]
        };
      }
      if (selected?.id === "p-inf-1" && actions.capture) {
        return {
          title: "Start the capture immediately",
          body: "Infantry is on the forward city now. Use Capture before ending the unit so the opening teaches income pressure with one obvious button.",
          tags,
          roleFocus: ["Infantry", "Tank"],
          focusTiles: [{ x: selected.x, y: selected.y, kind: "capture" }],
          routeTiles: []
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
            { x: 4, y: 6 }
          ]
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
            { x: 2, y: 6 }
          ]
        };
      }
      if (actions.end && this.getReadyUnits().length === 0) {
        return {
          title: "Close the turn",
          body: "Every blue unit has acted. End turn now so red moves resolve and your captured ground starts paying off.",
          tags,
          roleFocus: ["Infantry", "Tank"],
          focusTiles: [],
          routeTiles: []
        };
      }
      if (infantry && centerBase && centerBase.owner !== "player" && infantry.hp > 0) {
        return {
          title: "Keep the center pressure",
          body: "Hold the forward city while the tank and artillery take road space. The opener should read as one protected lane, not three isolated units.",
          tags,
          roleFocus: ["Infantry", "Tank"],
          focusTiles: [{ x: centerBase.x, y: centerBase.y, kind: "structure" }],
          routeTiles: []
        };
      }
      return null;
    }
    getOpeningSteps() {
      if (this.status !== "play" || this.turn > 2)
        return [];
      const infantry = this.getUnitById("p-inf-1");
      const tank = this.getUnitById("p-tank-1");
      const artillery = this.getUnitById("p-art-1");
      const centerCity = this.structures.find((structure) => structure.id === "mid-city") ?? null;
      const infantryMoved = !!infantry && (infantry.moved || infantry.acted || infantry.x !== 1 || infantry.y !== 6);
      const cityCaptureStarted = !!infantry && !!centerCity && (infantry.x === centerCity.x && infantry.y === centerCity.y && infantry.capture > 0 || centerCity.owner === "player");
      const tankMoved = !!tank && (tank.moved || tank.acted || tank.x !== 2 || tank.y !== 6);
      const artilleryMoved = !!artillery && (artillery.moved || artillery.acted || artillery.x !== 0 || artillery.y !== 7);
      const playerStillActing = this.phase === "player";
      return [
        {
          label: "Move to forward city",
          state: infantryMoved ? "done" : playerStillActing ? "current" : "pending",
          copy: "Start with infantry and land on the neutral city right in front of your base so the first move has one obvious payoff."
        },
        {
          label: "Start capture",
          state: cityCaptureStarted ? "done" : infantryMoved && playerStillActing ? "current" : "pending",
          copy: "Use Capture right after the move. Buildings do nothing until infantry spends an action claiming them."
        },
        {
          label: "Screen with tank",
          state: tankMoved ? "done" : infantryMoved && playerStillActing ? "current" : "pending",
          copy: "Move tank to the road screen so the first red counter-push hits armor instead of the capture lane."
        },
        {
          label: "Park artillery",
          state: artilleryMoved ? "done" : tankMoved && playerStillActing ? "current" : "pending",
          copy: "Keep artillery one tile behind the tank. Support should read from one lane, not from scattered pieces."
        },
        {
          label: this.phase === "enemy" ? "Watch red answer" : "End turn",
          state: this.phase === "enemy" || this.turn > 1 ? "current" : infantryMoved && tankMoved && artilleryMoved ? "current" : "pending",
          copy: this.phase === "enemy" ? "No input now. Watch which red unit takes center lane so your next blue move has context." : "Only end when blue units are spent. Red cannot act until you commit the turn."
        }
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
          focusTiles: []
        };
      }
      if (selected && this.turn === 1 && selected.id === openingInfantry?.id && actions.move && openingMove) {
        return {
          title: "Step 1: Move infantry",
          body: "Infantry is already selected. Press Move or Enter to step onto the forward neutral city, then Capture right away.",
          focusTiles: [openingMove]
        };
      }
      if (!selected && this.turn === 1 && openingInfantry && !openingInfantry.moved && !openingInfantry.acted) {
        return {
          title: "Step 1: Select infantry",
          body: "Start with the glowing blue infantry on the lower-left road. It is your capture unit and the safest first move.",
          focusTiles: [openingInfantry]
        };
      }
      if (selected && actions.capture) {
        return {
          title: "Step 2: Capture pressure",
          body: "Infantry is standing on the forward city. Capture now so the opener teaches building pressure before the other units act.",
          focusTiles: [{ x: selected.x, y: selected.y }]
        };
      }
      if (selected && this.turn === 1 && selected.id === openingTank?.id && actions.move && openingTankMove) {
        return {
          title: "Step 3: Screen with tank",
          body: "Tank is primed. Press Move or Enter to occupy the road screen tile and keep red fire off the capture lane.",
          focusTiles: [openingTankMove]
        };
      }
      if (selected && this.turn === 1 && selected.id === openingArtillery?.id && actions.move && openingArtilleryMove) {
        return {
          title: "Step 4: Park artillery",
          body: "Artillery is primed. Press Move or Enter to park behind the tank so the opening reads as one layered lane.",
          focusTiles: [openingArtilleryMove]
        };
      }
      if (selected && actions.attack) {
        return {
          title: "Attack window",
          body: "Your cursor is on a valid target. Fire before ending the turn so you trade damage while your line is still set.",
          focusTiles: [{ x: this.cursor.x, y: this.cursor.y }]
        };
      }
      if (actions.end && readyUnits.length === 0) {
        return {
          title: "Step 3: End turn",
          body: "Every blue unit is spent. End turn now so red units move and your next income tick arrives.",
          focusTiles: []
        };
      }
      if (!selected && firstReady) {
        return {
          title: "Spend a blue unit",
          body: `Pick ${this.getUnitLabel(firstReady)} and follow the opening order on the board. Move once, then capture or screen before ending the turn.`,
          focusTiles: [firstReady]
        };
      }
      return {
        title: "Turn flow",
        body: "Select a blue unit, move once, then attack or capture. Infantry wins buildings, tanks screen the road, and artillery wants distance.",
        focusTiles: []
      };
    }
    getCursorIntel(selected, current, actions) {
      const terrain = this.getTerrainAt(this.cursor.x, this.cursor.y);
      const terrainLabel = this.getTerrainLabel(terrain);
      const structure = this.getStructureAt(this.cursor.x, this.cursor.y);
      const ownerLabel = !structure || structure.owner == null ? "neutral" : structure.owner === "player" ? "blue-held" : "red-held";
      if (selected && current && current.side !== selected.side && actions.attack) {
        return {
          title: `${this.getUnitLabel(current)} in range`,
          copy: `${this.getUnitLabel(selected)} can fire here now. Attack before ending turn if you want to trade while your line is set.`,
          detail: `${terrainLabel} tile. ${this.getUnitLabel(current)} HP ${current.hp}.`
        };
      }
      if (selected && structure && selected.type === "infantry" && structure.owner !== "player" && actions.capture) {
        return {
          title: `${terrainLabel} ready to capture`,
          copy: "Spend infantry here to start or finish takeover. Buildings only pay after a capture action lands.",
          detail: `${ownerLabel} ${structure.type}. Infantry capture progress ${selected.capture}/20.`
        };
      }
      if (current) {
        const readyLabel = current.side === "player" ? current.moved || current.acted ? "spent this turn" : "ready to act" : "enemy unit";
        return {
          title: `${current.side === "player" ? "Blue" : "Red"} ${this.getUnitLabel(current)}`,
          copy: `${this.getUnitRoleCopy(current)} ${current.side === "player" ? `This unit is ${readyLabel}.` : "Check its lane before exposing infantry."}`,
          detail: `${terrainLabel} tile. HP ${current.hp}, ammo ${current.ammo}, fuel ${current.fuel}.`
        };
      }
      if (structure) {
        return {
          title: `${ownerLabel} ${structure.type}`,
          copy: structure.owner === "player" ? "This building already pays blue each turn." : "Only infantry can flip this building. Move armor first if the lane is not safe yet.",
          detail: `${terrainLabel} tile at ${this.cursor.x + 1}, ${this.cursor.y + 1}.`
        };
      }
      if (selected && actions.move) {
        return {
          title: `${terrainLabel} move tile`,
          copy: `${this.getUnitLabel(selected)} can move here now. End on roads for speed, forests for cover, and avoid leaving infantry unscreened.`,
          detail: `Cursor ${this.cursor.x + 1}, ${this.cursor.y + 1}.`
        };
      }
      return {
        title: `${terrainLabel} tile`,
        copy: "Move the cursor over units or buildings to read what that square contributes before you commit a turn.",
        detail: `Cursor ${this.cursor.x + 1}, ${this.cursor.y + 1}.`
      };
    }
    getTurnSummary(readyUnits, selected) {
      if (this.phase === "enemy") {
        return {
          title: "Red is answering",
          copy: "Blue cannot act during enemy phase. Watch which red unit claims the center lane so your next turn has a concrete response."
        };
      }
      if (readyUnits.length === 0) {
        return {
          title: "Blue turn spent",
          copy: "Every blue unit has acted. End turn to resolve the red answer and collect any captured income."
        };
      }
      return {
        title: `${readyUnits.length} blue unit${readyUnits.length === 1 ? "" : "s"} left`,
        copy: selected ? "Finish this unit's move, attack, or capture before jumping to another blue piece." : "Red cannot move until you press End turn, so spend your remaining blue units before giving up tempo."
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
        recommended: "select"
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
      const roleReminder = openingBrief ? getOpeningRoleSet(openingBrief.roleFocus).slice(0, 1).map((role) => role.copy).join(" ") : "Infantry captures ground, tank screens the lane, artillery stays one tile behind armor.";
      const controlHint = this.phase === "enemy" ? "Watch red finish the answer, then blue gets full control again." : actions.recommended === "move" ? "Enter follows the recommended move. Escape clears selection if you need to reset." : actions.recommended === "capture" ? "Capture spends infantry on the tile now. End turn only after blue units are spent." : actions.recommended === "attack" ? "Attack lands on the cursor target now. Red cannot answer until you end the turn." : "Blue acts first. Use the glowing unit before handing tempo to red.";
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
          title: this.status === "menu" ? "Advance Wars Skirmish" : this.status === "win" ? "Victory" : this.status === "lose" ? "Defeat" : "",
          copy: this.message
        },
        hud: {
          currentTurn: this.phase === "enemy" ? "Enemy phase" : "Player phase",
          selectedSummary: selected ? `${selected.type} HP ${selected.hp} Ammo ${selected.ammo} Fuel ${selected.fuel}` : "No unit selected.",
          canCapture
        },
        turnSummary: this.getTurnSummary(readyUnits, selected),
        cursorIntel: this.getCursorIntel(selected, current, actions),
        actions,
        guide: this.getGuide(selected, actions),
        openingBrief: openingBrief ? {
          ...openingBrief,
          steps: openingSteps,
          currentStep: currentOpeningStep,
          nextStep: nextOpeningStep,
          roleReminder,
          controlHint,
          roles: getOpeningRoleSet(openingBrief.roleFocus)
        } : this.turn <= 2 ? {
          title: this.phase === "enemy" ? "Watch the red answer" : "Opening plan",
          body: this.phase === "enemy" ? "Red moves only after you end the turn. Watch which unit claims center pressure, then retake initiative." : "Blue units act first. Spend infantry on buildings, tank on lane control, artillery on safe support fire.",
          tags: ["Blue acts now", "Red waits for End turn", "Infantry captures"],
          focusTiles: [],
          routeTiles: [],
          steps: openingSteps,
          currentStep: currentOpeningStep,
          nextStep: nextOpeningStep,
          roleReminder,
          controlHint,
          roles: getOpeningRoleSet(["Infantry", "Tank"])
        } : null
      };
    }
  }

  // advance-wars-skirmish/src/main.js
  var canvas = document.getElementById("battle-canvas");
  var ctx = canvas.getContext("2d");
  var game = new Game;
  var menuPanel = document.getElementById("menu-panel");
  var hud = document.getElementById("hud");
  var statePanel = document.getElementById("state-panel");
  var helpPanel = document.getElementById("help-panel");
  var endPanel = document.getElementById("end-panel");
  var startButton = document.getElementById("start-button");
  var restartButton = document.getElementById("restart-button");
  var helpButton = document.getElementById("help-button");
  var closeHelpButton = document.getElementById("close-help-button");
  var selectButton = document.getElementById("select-button");
  var moveButton = document.getElementById("move-button");
  var attackButton = document.getElementById("attack-button");
  var captureButton = document.getElementById("capture-button");
  var clearButton = document.getElementById("clear-button");
  var endTurnButton = document.getElementById("end-turn-button");
  var turnValue = document.getElementById("turn-value");
  var fundsValue = document.getElementById("funds-value");
  var selectedValue = document.getElementById("selected-value");
  var objectiveValue = document.getElementById("objective-value");
  var actionCopy = document.getElementById("action-copy");
  var contextCopy = document.getElementById("context-copy");
  var nextStepTitle = document.getElementById("next-step-title");
  var nextStepCopy = document.getElementById("next-step-copy");
  var turnSummaryTitle = document.getElementById("turn-summary-title");
  var turnSummaryCopy = document.getElementById("turn-summary-copy");
  var cursorIntelTitle = document.getElementById("cursor-intel-title");
  var cursorIntelCopy = document.getElementById("cursor-intel-copy");
  var cursorIntelDetail = document.getElementById("cursor-intel-detail");
  var openingBrief = document.getElementById("opening-brief");
  var openingBriefTitle = document.getElementById("opening-brief-title");
  var openingBriefCopy = document.getElementById("opening-brief-copy");
  var openingBriefTags = document.getElementById("opening-brief-tags");
  var openingBriefSteps = document.getElementById("opening-brief-steps");
  var openingBriefRoles = document.getElementById("opening-brief-roles");
  var endTitle = document.getElementById("end-title");
  var endCopy = document.getElementById("end-copy");
  var endEyebrow = document.getElementById("end-eyebrow");
  var autoStart = new URLSearchParams(window.location.search).get("autostart") === "1";
  var helpVisible = false;
  var actionButtons = [
    { key: "select", element: selectButton, label: "Select" },
    { key: "move", element: moveButton, label: "Move" },
    { key: "attack", element: attackButton, label: "Attack" },
    { key: "capture", element: captureButton, label: "Capture" },
    { key: "clear", element: clearButton, label: "Clear" },
    { key: "end", element: endTurnButton, label: "End turn" }
  ];
  function setStatePanelVisible(visible) {
    statePanel.classList.toggle("is-suppressed", !visible);
    statePanel.setAttribute("aria-hidden", visible ? "false" : "true");
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    game.resize(canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function showPlay() {
    menuPanel.classList.remove("is-visible");
    hud.classList.add("is-visible");
    statePanel.classList.add("is-visible");
    setStatePanelVisible(true);
    hideHelp();
  }
  function showEnd(status, message) {
    endPanel.classList.add("is-visible");
    endPanel.setAttribute("aria-hidden", "false");
    endEyebrow.textContent = status === "win" ? "victory" : "defeat";
    endTitle.textContent = status === "win" ? "Victory" : "Defeat";
    endCopy.textContent = message;
  }
  function hideEnd() {
    endPanel.classList.remove("is-visible");
    endPanel.setAttribute("aria-hidden", "true");
  }
  function showHelp() {
    if (game.getFrameState().status !== "play")
      return;
    helpVisible = true;
    helpPanel.classList.add("is-visible");
    helpPanel.setAttribute("aria-hidden", "false");
    helpButton.setAttribute("aria-expanded", "true");
  }
  function hideHelp() {
    helpVisible = false;
    helpPanel.classList.remove("is-visible");
    helpPanel.setAttribute("aria-hidden", "true");
    helpButton.setAttribute("aria-expanded", "false");
  }
  function toggleHelp() {
    if (helpVisible) {
      hideHelp();
      return;
    }
    showHelp();
  }
  function refreshHud(state) {
    turnValue.textContent = String(state.turn);
    fundsValue.textContent = String(state.funds);
    selectedValue.textContent = state.selectedUnit ? `${state.selectedUnit.type} (${state.selectedUnit.hp})` : "None";
    objectiveValue.textContent = state.objective;
    actionCopy.textContent = state.message;
    nextStepTitle.textContent = state.guide.title;
    nextStepCopy.textContent = state.guide.body;
    turnSummaryTitle.textContent = state.turnSummary.title;
    turnSummaryCopy.textContent = state.turnSummary.copy;
    cursorIntelTitle.textContent = state.cursorIntel.title;
    cursorIntelCopy.textContent = state.cursorIntel.copy;
    cursorIntelDetail.textContent = state.cursorIntel.detail;
    contextCopy.textContent = state.selectedUnit ? `${state.hud.currentTurn}. ${state.selectedUnit.type} HP ${state.selectedUnit.hp}, ammo ${state.selectedUnit.ammo}, fuel ${state.selectedUnit.fuel}. ${state.hud.canCapture ? "Capture ready." : state.selectedUnit.acted ? "Turn spent." : "Move ready."}` : `${state.hud.currentTurn}. ${state.objective}`;
    setStatePanelVisible(!state.openingBrief);
    if (state.openingBrief) {
      const visibleSteps = [state.openingBrief.currentStep, state.openingBrief.nextStep].filter(Boolean);
      openingBrief.hidden = false;
      openingBriefTitle.textContent = state.openingBrief.title;
      openingBriefCopy.textContent = state.openingBrief.body;
      openingBriefTags.replaceChildren(...(state.openingBrief.tags ?? []).slice(0, 3).map((tag) => {
        const chip = document.createElement("span");
        chip.className = "opening-tag";
        chip.textContent = tag;
        return chip;
      }));
      openingBriefSteps.replaceChildren(...visibleSteps.map((step) => {
        const card = document.createElement("div");
        card.className = `opening-step${step.state === "current" ? " is-current" : ""}${step.state === "done" ? " is-done" : ""}`;
        const header = document.createElement("div");
        header.className = "opening-step-header";
        const label = document.createElement("span");
        label.className = "opening-step-label";
        label.textContent = step.label;
        const stateTag = document.createElement("span");
        stateTag.className = "opening-step-state";
        stateTag.textContent = step.state === "current" ? "now" : step.state === "pending" ? "next" : step.state;
        const copy = document.createElement("p");
        copy.className = "opening-step-copy";
        copy.textContent = step.copy;
        header.append(label, stateTag);
        card.append(header, copy);
        return card;
      }));
      openingBriefRoles.replaceChildren(...[
        { title: "Why this matters", copy: state.openingBrief.roleReminder },
        { title: "Control hint", copy: state.openingBrief.controlHint }
      ].filter((role) => role.copy).map((role) => {
        const card = document.createElement("div");
        card.className = "opening-role";
        const header = document.createElement("div");
        header.className = "opening-role-header";
        const title = document.createElement("span");
        title.className = "opening-role-title";
        title.textContent = role.title;
        const copy = document.createElement("p");
        copy.className = "opening-role-copy";
        copy.textContent = role.copy;
        header.append(title);
        card.append(header, copy);
        return card;
      }));
    } else {
      openingBrief.hidden = true;
      openingBriefTags.replaceChildren();
      openingBriefSteps.replaceChildren();
      openingBriefRoles.replaceChildren();
    }
    for (const button of actionButtons) {
      const available = state.actions[button.key];
      button.element.disabled = !available;
      button.element.classList.toggle("is-recommended", state.actions.recommended === button.key && available);
      button.element.textContent = button.label;
    }
  }
  function pointerToGrid(event) {
    const rect = canvas.getBoundingClientRect();
    const layout = createLayout({ width: canvas.width, height: canvas.height });
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const translatedX = x / rect.width * canvas.width - layout.boardX;
    const translatedY = y / rect.height * canvas.height - layout.boardY;
    return {
      gx: Math.max(0, Math.min(GRID_WIDTH - 1, Math.floor(translatedX / layout.tile))),
      gy: Math.max(0, Math.min(GRID_HEIGHT - 1, Math.floor(translatedY / layout.tile)))
    };
  }
  canvas.addEventListener("click", (event) => {
    if (game.getFrameState().status !== "play")
      return;
    const { gx, gy } = pointerToGrid(event);
    game.setCursor(gx, gy);
    game.handleAction("confirm");
  });
  window.addEventListener("keydown", (event) => {
    if ((event.key === "h" || event.key === "H" || event.key === "?") && game.getFrameState().status === "play") {
      toggleHelp();
      return;
    }
    if (event.key === "Enter") {
      if (game.getFrameState().status === "menu") {
        game.start();
        showPlay();
        hideEnd();
        return;
      }
      game.handleAction("confirm");
    }
    if (event.key === "Escape") {
      if (helpVisible) {
        hideHelp();
        return;
      }
      game.handleAction("clear");
    }
    if (event.key === "r" || event.key === "R") {
      game.restart();
      showPlay();
      hideEnd();
    }
    if (event.key === "ArrowUp")
      game.moveCursor(0, -1);
    if (event.key === "ArrowDown")
      game.moveCursor(0, 1);
    if (event.key === "ArrowLeft")
      game.moveCursor(-1, 0);
    if (event.key === "ArrowRight")
      game.moveCursor(1, 0);
    if (event.key === "m" || event.key === "M")
      game.handleAction("move");
    if (event.key === "a" || event.key === "A")
      game.handleAction("attack");
    if (event.key === "c" || event.key === "C")
      game.handleAction("capture");
    if (event.key === "e" || event.key === "E")
      game.handleAction("end");
  });
  startButton.addEventListener("click", () => {
    game.start();
    showPlay();
    hideEnd();
  });
  restartButton.addEventListener("click", () => {
    game.restart();
    showPlay();
    hideEnd();
  });
  helpButton.addEventListener("click", toggleHelp);
  closeHelpButton.addEventListener("click", hideHelp);
  for (const button of actionButtons) {
    button.element.addEventListener("click", () => {
      if (button.key === "end") {
        game.handleAction("end");
        return;
      }
      game.handleAction(button.key);
    });
  }
  helpPanel.addEventListener("click", (event) => {
    if (event.target === helpPanel) {
      hideHelp();
    }
  });
  var lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    game.update(dt);
    const state = game.getFrameState();
    game.render(ctx);
    refreshHud(state);
    if (state.status === "win" || state.status === "lose") {
      hud.classList.remove("is-visible");
      statePanel.classList.remove("is-visible");
      statePanel.setAttribute("aria-hidden", "true");
      openingBrief.hidden = true;
      hideHelp();
      showEnd(state.status, state.message);
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  resize();
  if (autoStart) {
    game.start();
    showPlay();
    hideEnd();
  }
  frame(lastTime);
})();
