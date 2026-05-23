"use strict";
(() => {
  // stick-empire-logic/src/game/config.js
  var GAME_TITLE = "Stick War: Empire RTS";
  var TEAM_IDS = Object.freeze({
    PLAYER: "player",
    ENEMY: "enemy",
    NEUTRAL: "neutral"
  });
  var ENTITY_TYPES = Object.freeze({
    UNIT: "unit",
    STRUCTURE: "structure",
    RESOURCE: "resource"
  });
  var UNIT_TYPES = Object.freeze({
    MINER: "Miner",
    SWORDWRATH: "Swordwrath",
    ARCHIDON: "Archidon"
  });
  var STRUCTURE_TYPES = Object.freeze({
    STATUE: "Statue"
  });
  var RESOURCE_TYPES = Object.freeze({
    GOLD_VEIN: "Gold-Vein"
  });
  var COMMAND_TYPES = Object.freeze({
    MOVE: "move",
    ATTACK_MOVE: "attack-move",
    HARVEST: "harvest",
    HOLD: "hold",
    RETREAT: "retreat",
    POSSESS: "possess"
  });
  var DECISION_MODES = Object.freeze({
    DECISION_TREE: "decision-tree",
    USER_CONTROLLED: "user-controlled",
    HOLDING: "holding",
    IDLE: "idle"
  });
  var FORMATION_ROLES = Object.freeze({
    ECON: "econ",
    FRONTLINE: "frontline",
    RANGED: "ranged"
  });
  var WORLD_DIMENSIONS = Object.freeze({
    width: 1920,
    height: 1080,
    groundY: 760,
    frontLineX: 960,
    mineLaneY: 710
  });
  var CAMERA_BOUNDS = Object.freeze({
    minX: 0,
    maxX: WORLD_DIMENSIONS.width
  });
  var ARCHER_STANDOFF_DISTANCE = 300;
  var USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER = 1.5;
  var MULTI_SELECT = Object.freeze({
    minDragDistance: 8
  });
  var ECONOMY_DEFAULTS = Object.freeze({
    startingGold: 425,
    goldRate: 1.5,
    population: 0,
    popCap: 18
  });
  var ECONOMY_COSTS = Object.freeze({
    popCapUpgrade: 150,
    popCapIncrease: 6
  });
  var TEAM_COLORS = Object.freeze({
    [TEAM_IDS.PLAYER]: Object.freeze({
      fill: "#e8f0ff",
      accent: "#7cd7eb",
      shadow: "rgba(124, 215, 235, 0.3)"
    }),
    [TEAM_IDS.ENEMY]: Object.freeze({
      fill: "#ffe5de",
      accent: "#ef7b6f",
      shadow: "rgba(239, 123, 111, 0.32)"
    }),
    [TEAM_IDS.NEUTRAL]: Object.freeze({
      fill: "#f8cb74",
      accent: "#dcc28a",
      shadow: "rgba(248, 203, 116, 0.28)"
    })
  });
  var UNIT_STATS = Object.freeze({
    [UNIT_TYPES.MINER]: Object.freeze({
      cost: 60,
      popCost: 1,
      trainTime: 4,
      hp: 65,
      damage: 6,
      attackSpeed: 1,
      speed: 92,
      range: 34,
      radius: 24,
      selectionRadius: 34,
      role: FORMATION_ROLES.ECON
    }),
    [UNIT_TYPES.SWORDWRATH]: Object.freeze({
      cost: 125,
      popCost: 1,
      trainTime: 6.5,
      hp: 110,
      damage: 16,
      attackSpeed: 1.15,
      speed: 104,
      range: 42,
      radius: 28,
      selectionRadius: 38,
      role: FORMATION_ROLES.FRONTLINE
    }),
    [UNIT_TYPES.ARCHIDON]: Object.freeze({
      cost: 160,
      popCost: 1,
      trainTime: 7.5,
      hp: 84,
      damage: 13,
      attackSpeed: 0.9,
      speed: 88,
      range: ARCHER_STANDOFF_DISTANCE,
      radius: 26,
      selectionRadius: 36,
      role: FORMATION_ROLES.RANGED
    })
  });
  var HUD_BUILD_ACTIONS = Object.freeze([
    {
      id: "build-miner",
      label: "Train Miner",
      detail: "60 gold, 1 pop",
      unitType: UNIT_TYPES.MINER
    },
    {
      id: "build-swordwrath",
      label: "Train Swordwrath",
      detail: "125 gold, 1 pop",
      unitType: UNIT_TYPES.SWORDWRATH
    },
    {
      id: "build-archidon",
      label: "Train Archidon",
      detail: "160 gold, 1 pop",
      unitType: UNIT_TYPES.ARCHIDON
    },
    {
      id: "upgrade-pop-cap",
      label: "Raise PopCap",
      detail: "150 gold, +6 cap"
    }
  ]);
  var HUD_COMMAND_ACTIONS = Object.freeze([
    {
      id: COMMAND_TYPES.MOVE,
      label: "Move",
      detail: "Stage rally target"
    },
    {
      id: COMMAND_TYPES.ATTACK_MOVE,
      label: "Attack-Move",
      detail: "Advance with threat scan"
    },
    {
      id: COMMAND_TYPES.HARVEST,
      label: "Harvest",
      detail: "Route miners to gold"
    },
    {
      id: COMMAND_TYPES.HOLD,
      label: "Hold",
      detail: "Freeze formation anchor"
    },
    {
      id: COMMAND_TYPES.POSSESS,
      label: "Possess",
      detail: "Direct keyboard control"
    }
  ]);
  var SYSTEM_MODULE_SPECS = Object.freeze({
    unitAI: Object.freeze({
      path: "./UnitAI.js",
      createExport: "createUnitAISystem",
      updateExport: "updateUnitAI"
    }),
    economySystem: Object.freeze({
      path: "./EconomySystem.js",
      createExport: "createEconomySystem",
      updateExport: "updateEconomySystem"
    }),
    commandDirector: Object.freeze({
      path: "./CommandDirector.js",
      createExport: "createCommandDirector",
      updateExport: "updateCommandDirector"
    }),
    formationLogic: Object.freeze({
      path: "./FormationLogic.js",
      createExport: "createFormationLogic",
      updateExport: "updateFormationLogic"
    })
  });
  var ASSET_SLOT_NOTES = Object.freeze({
    units: "Swap placeholder SVGs with transparent public-domain unit art by slot.",
    structures: "Replace statue placeholder independently from unit art.",
    resources: "Gold veins can stay code-native or switch to painted props."
  });

  // stick-empire-logic/src/game/GameState.js
  var entitySequence = 0;
  function createEntityId(prefix = "entity") {
    entitySequence += 1;
    return `${prefix}-${String(entitySequence).padStart(4, "0")}`;
  }
  function createInitialGameState() {
    return {
      meta: {
        title: GAME_TITLE,
        scaffoldId: "setup-1"
      },
      clock: {
        elapsed: 0,
        delta: 0,
        frame: 0,
        paused: false
      },
      camera: {
        x: 0,
        y: 0,
        zoom: 1
      },
      world: {
        width: WORLD_DIMENSIONS.width,
        height: WORLD_DIMENSIONS.height,
        groundY: WORLD_DIMENSIONS.groundY,
        frontLineX: WORLD_DIMENSIONS.frontLineX
      },
      economy: {
        gold: ECONOMY_DEFAULTS.startingGold,
        goldRate: ECONOMY_DEFAULTS.goldRate,
        population: ECONOMY_DEFAULTS.population,
        popCap: ECONOMY_DEFAULTS.popCap,
        popUsed: ECONOMY_DEFAULTS.population,
        queuePopulation: 0
      },
      battle: {
        playerStatueId: "player-statue",
        enemyStatueId: "enemy-statue",
        winner: null,
        winScreen: null,
        enemyRecruitCooldown: 7,
        enemyWaveIndex: 0
      },
      selection: {
        box: null,
        selectedIds: [],
        primaryId: null,
        hoveredId: null,
        possessionTargetId: null
      },
      input: {
        pointer: {
          down: false,
          dragging: false,
          screenX: 0,
          screenY: 0,
          worldX: 0,
          worldY: 0
        },
        keyboard: {}
      },
      ui: {
        statusText: "Shell ready. Drag to multi-select or click a unit to possess it.",
        buildMenu: HUD_BUILD_ACTIONS.map((action) => ({ ...action })),
        commandMenu: HUD_COMMAND_ACTIONS.map((action) => ({ ...action })),
        eventFeed: [
          "Shared state contract established.",
          "Future systems plug into src/game/config.js module specs."
        ],
        activeCommandId: COMMAND_TYPES.MOVE,
        overlay: {
          visible: false,
          title: "Battle resolved",
          body: "One empire has fallen."
        }
      },
      commandState: {
        activeCommandId: COMMAND_TYPES.MOVE,
        orderQueue: [],
        lastIssuedAt: 0
      },
      production: {
        queue: []
      },
      formations: {
        anchors: {
          [TEAM_IDS.PLAYER]: { x: 360, y: WORLD_DIMENSIONS.mineLaneY },
          [TEAM_IDS.ENEMY]: { x: WORLD_DIMENSIONS.width - 360, y: WORLD_DIMENSIONS.mineLaneY }
        },
        lastSolvedAt: 0
      },
      systems: {
        specs: SYSTEM_MODULE_SPECS,
        unitAI: null,
        economySystem: null,
        commandDirector: null,
        formationLogic: null
      },
      entities: /* @__PURE__ */ new Map(),
      entityIds: [],
      units: [],
      resourceNodes: [],
      structures: [],
      references: {
        units: [],
        resources: [],
        structures: []
      }
    };
  }
  function registerEntity(state2, entity) {
    state2.entities.set(entity.id, entity);
    if (!state2.entityIds.includes(entity.id)) {
      state2.entityIds.push(entity.id);
    }
    if (entity.entityType === "unit" && !state2.references.units.includes(entity.id)) {
      state2.references.units.push(entity.id);
    }
    if (entity.entityType === "resource" && !state2.references.resources.includes(entity.id)) {
      state2.references.resources.push(entity.id);
    }
    if (entity.entityType === "structure" && !state2.references.structures.includes(entity.id)) {
      state2.references.structures.push(entity.id);
    }
    return entity;
  }
  function unregisterEntity(state2, entityId) {
    var _a;
    const entity = state2.entities.get(entityId);
    if (!entity) {
      return null;
    }
    state2.entities.delete(entityId);
    state2.entityIds = state2.entityIds.filter((id) => id !== entityId);
    state2.references.units = state2.references.units.filter((id) => id !== entityId);
    state2.references.resources = state2.references.resources.filter((id) => id !== entityId);
    state2.references.structures = state2.references.structures.filter((id) => id !== entityId);
    state2.selection.selectedIds = state2.selection.selectedIds.filter((id) => id !== entityId);
    if (state2.selection.primaryId === entityId) {
      state2.selection.primaryId = (_a = state2.selection.selectedIds[0]) != null ? _a : null;
    }
    if (state2.selection.possessionTargetId === entityId) {
      state2.selection.possessionTargetId = null;
    }
    return entity;
  }
  function getEntityById(state2, entityId) {
    var _a;
    return (_a = state2.entities.get(entityId)) != null ? _a : null;
  }
  function listEntities(state2, predicate = () => true) {
    return state2.entityIds.map((id) => state2.entities.get(id)).filter((entity) => entity && predicate(entity));
  }
  function selectEntityIds(state2, entityIds) {
    var _a;
    const validIds = entityIds.filter((id) => state2.entities.has(id));
    state2.selection.selectedIds = validIds;
    state2.selection.primaryId = (_a = validIds[0]) != null ? _a : null;
    if (!validIds.includes(state2.selection.possessionTargetId)) {
      state2.selection.possessionTargetId = null;
    }
  }
  function pushEvent(state2, message) {
    state2.ui.eventFeed = [message, ...state2.ui.eventFeed].slice(0, 6);
  }
  function setBattleResult(state2, winner, title, body) {
    state2.battle.winner = winner;
    state2.battle.winScreen = { title, body };
    state2.ui.overlay.visible = true;
    state2.ui.overlay.title = title;
    state2.ui.overlay.body = body;
  }

  // stick-empire-logic/src/game/EntityFactory.js
  function createVector(x, y) {
    return { x, y };
  }
  function resolveFormationRole(unitType) {
    var _a, _b;
    return (_b = (_a = UNIT_STATS[unitType]) == null ? void 0 : _a.role) != null ? _b : FORMATION_ROLES.FRONTLINE;
  }
  function resolveDecisionTreeId(unitType) {
    return `${unitType.replaceAll(" ", "")}DecisionTree`;
  }
  function createUnitEntity({
    id = createEntityId("unit"),
    team = TEAM_IDS.PLAYER,
    unitType = UNIT_TYPES.SWORDWRATH,
    x = 0,
    y = WORLD_DIMENSIONS.mineLaneY
  } = {}) {
    const statBlock = UNIT_STATS[unitType];
    if (!statBlock) {
      throw new Error(`Unknown unit type: ${unitType}`);
    }
    return {
      id,
      entityType: ENTITY_TYPES.UNIT,
      team,
      unitType,
      position: createVector(x, y),
      velocity: createVector(0, 0),
      render: {
        width: 92,
        height: 128,
        facing: team === TEAM_IDS.PLAYER ? 1 : -1,
        bobPhase: Math.random() * Math.PI * 2
      },
      collision: {
        radius: statBlock.radius,
        selectionRadius: statBlock.selectionRadius
      },
      stats: {
        maxHp: statBlock.hp,
        hp: statBlock.hp,
        damage: statBlock.damage,
        attackSpeed: statBlock.attackSpeed,
        speed: statBlock.speed,
        range: statBlock.range,
        populationCost: statBlock.popCost,
        goldCost: statBlock.cost
      },
      command: {
        type: "move",
        target: null,
        targetEntityId: null,
        queued: []
      },
      ai: {
        mode: DECISION_MODES.DECISION_TREE,
        decisionTreeId: resolveDecisionTreeId(unitType),
        targetEntityId: null,
        targetTag: null,
        lastDecisionAt: 0
      },
      formation: {
        role: resolveFormationRole(unitType),
        slotIndex: 0,
        offset: createVector(0, 0),
        preferredDistance: unitType === UNIT_TYPES.ARCHIDON ? ARCHER_STANDOFF_DISTANCE : statBlock.range
      },
      mining: {
        carriedGold: 0,
        preferredResourceType: RESOURCE_TYPES.GOLD_VEIN
      },
      combat: {
        cooldown: 0,
        attackSpeedMultiplier: 1
      },
      possession: {
        active: false,
        bonusAttackSpeedMultiplier: USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER,
        movementVector: createVector(0, 0)
      },
      desiredPosition: createVector(x, y),
      formationRole: resolveFormationRole(unitType),
      intent: "idle",
      targetId: null,
      attackTargetId: null,
      moveTarget: null,
      aiState: "idle",
      alive: true
    };
  }
  function createStatueEntity({
    id,
    team = TEAM_IDS.PLAYER,
    x = 0,
    y = WORLD_DIMENSIONS.mineLaneY
  } = {}) {
    return {
      id: id != null ? id : `${team}-statue`,
      entityType: ENTITY_TYPES.STRUCTURE,
      structureType: STRUCTURE_TYPES.STATUE,
      team,
      position: createVector(x, y),
      render: {
        width: 164,
        height: 220,
        facing: team === TEAM_IDS.PLAYER ? 1 : -1
      },
      collision: {
        radius: 74,
        selectionRadius: 92
      },
      stats: {
        maxHp: 1200,
        hp: 1200
      },
      alive: true
    };
  }
  function createGoldVeinEntity({
    id = createEntityId("gold-vein"),
    x = 0,
    y = WORLD_DIMENSIONS.mineLaneY + 34,
    amount = 900
  } = {}) {
    return {
      id,
      entityType: ENTITY_TYPES.RESOURCE,
      resourceType: RESOURCE_TYPES.GOLD_VEIN,
      team: TEAM_IDS.NEUTRAL,
      position: createVector(x, y),
      render: {
        width: 104,
        height: 104,
        facing: 1
      },
      collision: {
        radius: 44,
        selectionRadius: 44
      },
      resource: {
        amount,
        maxAmount: amount
      },
      alive: true
    };
  }
  function createSkirmishSeed() {
    return [
      createStatueEntity({
        id: "player-statue",
        team: TEAM_IDS.PLAYER,
        x: 180,
        y: WORLD_DIMENSIONS.mineLaneY - 14
      }),
      createStatueEntity({
        id: "enemy-statue",
        team: TEAM_IDS.ENEMY,
        x: WORLD_DIMENSIONS.width - 180,
        y: WORLD_DIMENSIONS.mineLaneY - 14
      }),
      createGoldVeinEntity({ id: "gold-vein-alpha", x: 590 }),
      createGoldVeinEntity({ id: "gold-vein-beta", x: 825 }),
      createGoldVeinEntity({ id: "gold-vein-gamma", x: 1070 }),
      createUnitEntity({
        id: "player-miner-alpha",
        team: TEAM_IDS.PLAYER,
        unitType: UNIT_TYPES.MINER,
        x: 320
      }),
      createUnitEntity({
        id: "player-swordwrath-alpha",
        team: TEAM_IDS.PLAYER,
        unitType: UNIT_TYPES.SWORDWRATH,
        x: 390
      }),
      createUnitEntity({
        id: "player-archidon-alpha",
        team: TEAM_IDS.PLAYER,
        unitType: UNIT_TYPES.ARCHIDON,
        x: 450
      }),
      createUnitEntity({
        id: "enemy-swordwrath-alpha",
        team: TEAM_IDS.ENEMY,
        unitType: UNIT_TYPES.SWORDWRATH,
        x: 1450
      }),
      createUnitEntity({
        id: "enemy-archidon-alpha",
        team: TEAM_IDS.ENEMY,
        unitType: UNIT_TYPES.ARCHIDON,
        x: 1520
      })
    ];
  }

  // stick-empire-logic/src/core/EconomySystem.js
  function getPlayerUnits(state2) {
    var _a, _b;
    return ((_b = (_a = state2.references) == null ? void 0 : _a.units) != null ? _b : []).map((id) => state2.entities.get(id)).filter((unit) => unit && unit.entityType === "unit" && unit.team === TEAM_IDS.PLAYER && unit.alive !== false);
  }
  function getPlayerResourceNodes(state2) {
    var _a, _b;
    if (Array.isArray(state2.resourceNodes) && state2.resourceNodes.length && typeof state2.resourceNodes[0] === "object") {
      return state2.resourceNodes.filter((node) => node && node.entityType === "resource" && node.alive !== false);
    }
    const resourceIds = (_b = (_a = state2.references) == null ? void 0 : _a.resources) != null ? _b : [];
    return resourceIds.map((id) => state2.entities.get(id)).filter((node) => node && node.entityType === "resource" && node.alive !== false);
  }
  function isMinerAssignedToVein(unit, resourceNodes) {
    var _a, _b, _c, _d, _e;
    if (unit.unitType !== UNIT_TYPES.MINER) {
      return false;
    }
    const targetId = (_d = (_c = (_a = unit.mining) == null ? void 0 : _a.targetResourceId) != null ? _c : (_b = unit.ai) == null ? void 0 : _b.targetEntityId) != null ? _d : null;
    if (!targetId) {
      return false;
    }
    const vein = resourceNodes.find((node) => node.id === targetId);
    return Boolean(vein && ((_e = vein.resource) == null ? void 0 : _e.amount) > 0);
  }
  function countQueuedPopulation(queue = []) {
    return queue.reduce((sum, entry) => {
      var _a, _b, _c;
      const popCost = (_c = (_b = entry == null ? void 0 : entry.popCost) != null ? _b : (_a = UNIT_STATS[entry == null ? void 0 : entry.unitType]) == null ? void 0 : _a.popCost) != null ? _c : 0;
      return sum + popCost;
    }, 0);
  }
  var EconomySystem = class {
    constructor(config = {}) {
      this.config = config;
    }
    tick(state2, dt) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const economy = (_a = state2.economy) != null ? _a : state2.economy = {};
      const units = getPlayerUnits(state2);
      const resourceNodes = getPlayerResourceNodes(state2);
      const queue = (_c = (_b = state2.production) == null ? void 0 : _b.queue) != null ? _c : [];
      const activeMiners = units.filter((unit) => isMinerAssignedToVein(unit, resourceNodes));
      const baseRate = Number((_f = (_e = (_d = economy.baseGoldRate) != null ? _d : this.config.baseGoldRate) != null ? _e : economy.goldRate) != null ? _f : 0);
      const minerYield = (_g = this.config.minerYield) != null ? _g : 0.35;
      economy.baseGoldRate = baseRate;
      economy.goldRate = baseRate + activeMiners.length * minerYield;
      economy.population = units.reduce((sum, unit) => {
        var _a2, _b2;
        return sum + ((_b2 = (_a2 = unit.stats) == null ? void 0 : _a2.populationCost) != null ? _b2 : 0);
      }, 0);
      economy.queuePopulation = countQueuedPopulation(queue);
      economy.popUsed = economy.population + economy.queuePopulation;
      const goldIncome = economy.goldRate * Math.max(0, dt);
      economy.gold = Math.max(0, ((_h = economy.gold) != null ? _h : 0) + goldIncome);
      return economy;
    }
    canAfford(state2, cost) {
      var _a, _b;
      return ((_b = (_a = state2.economy) == null ? void 0 : _a.gold) != null ? _b : 0) >= cost;
    }
    spend(state2, cost) {
      var _a;
      if (!this.canAfford(state2, cost)) {
        return false;
      }
      state2.economy.gold = Math.max(0, ((_a = state2.economy.gold) != null ? _a : 0) - cost);
      return true;
    }
    canTrain(state2, unitType) {
      var _a, _b, _c, _d, _e;
      const stats = UNIT_STATS[unitType];
      if (!stats) {
        return false;
      }
      const economy = (_a = state2.economy) != null ? _a : {};
      const projectedPop = ((_c = (_b = economy.popUsed) != null ? _b : economy.population) != null ? _c : 0) + ((_d = stats.popCost) != null ? _d : 0);
      return this.canAfford(state2, stats.cost) && projectedPop <= ((_e = economy.popCap) != null ? _e : 0);
    }
    queueOrReject(state2, unitType) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
      const stats = UNIT_STATS[unitType];
      if (!stats) {
        return { accepted: false, reason: "unknown-unit" };
      }
      if (!this.canTrain(state2, unitType)) {
        const economy = (_a = state2.economy) != null ? _a : {};
        if (((_c = (_b = economy.popUsed) != null ? _b : economy.population) != null ? _c : 0) + ((_d = stats.popCost) != null ? _d : 0) > ((_e = economy.popCap) != null ? _e : 0)) {
          return { accepted: false, reason: "pop-cap" };
        }
        if (!this.canAfford(state2, stats.cost)) {
          return { accepted: false, reason: "gold" };
        }
        return { accepted: false, reason: "rejected" };
      }
      (_f = state2.production) != null ? _f : state2.production = { queue: [] };
      (_h = (_g = state2.production).queue) != null ? _h : _g.queue = [];
      state2.production.queue.push({
        unitType,
        cost: stats.cost,
        popCost: (_i = stats.popCost) != null ? _i : 0,
        duration: (_k = (_j = stats.trainTime) != null ? _j : this.config.defaultTrainTime) != null ? _k : 5,
        progress: 0,
        team: TEAM_IDS.PLAYER,
        queuedAt: (_m = (_l = state2.clock) == null ? void 0 : _l.elapsed) != null ? _m : 0
      });
      this.spend(state2, stats.cost);
      state2.economy.popUsed = ((_o = (_n = state2.economy.popUsed) != null ? _n : state2.economy.population) != null ? _o : 0) + ((_p = stats.popCost) != null ? _p : 0);
      return { accepted: true, reason: "queued" };
    }
  };

  // stick-empire-logic/src/core/FormationLogic.js
  function normalizeFacing(facing) {
    return facing >= 0 ? 1 : -1;
  }
  function getSelectionUnits(selection) {
    var _a;
    return Array.isArray(selection) ? selection : (_a = selection == null ? void 0 : selection.units) != null ? _a : [];
  }
  function getSelectionTeam(selection, units) {
    var _a, _b, _c;
    return (_c = (_b = selection == null ? void 0 : selection.team) != null ? _b : (_a = units[0]) == null ? void 0 : _a.team) != null ? _c : TEAM_IDS.PLAYER;
  }
  function makeAnchor(selection, worldState, anchorPoint) {
    var _a, _b, _c, _d;
    if (anchorPoint) {
      return anchorPoint;
    }
    if (selection == null ? void 0 : selection.anchorPoint) {
      return selection.anchorPoint;
    }
    return {
      x: (_c = (_b = (_a = selection == null ? void 0 : selection.anchorPoint) == null ? void 0 : _a.x) != null ? _b : worldState == null ? void 0 : worldState.frontLineX) != null ? _c : WORLD_DIMENSIONS.frontLineX,
      y: (_d = worldState == null ? void 0 : worldState.mineLaneY) != null ? _d : WORLD_DIMENSIONS.mineLaneY
    };
  }
  function computeFrontlineSlots(units, facing, anchorPoint = { x: WORLD_DIMENSIONS.frontLineX, y: WORLD_DIMENSIONS.mineLaneY }) {
    const direction = normalizeFacing(facing);
    const columns = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(Math.max(1, units.length)))));
    const spacingX = 56;
    const spacingY = 42;
    return units.map((unit, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const offsetX = 72 + row * spacingX;
      const centeredColumn = column - (columns - 1) * 0.5;
      const offsetY = centeredColumn * spacingY;
      return {
        unitId: unit.id,
        x: anchorPoint.x + offsetX * direction,
        y: anchorPoint.y + offsetY,
        role: FORMATION_ROLES.FRONTLINE,
        slotIndex: index
      };
    });
  }
  function computeArcherKiteTarget(unit, nearestEnemy, desiredRange = ARCHER_STANDOFF_DISTANCE) {
    if (!unit || !nearestEnemy) {
      return (unit == null ? void 0 : unit.position) ? { x: unit.position.x, y: unit.position.y } : null;
    }
    const dx = unit.position.x - nearestEnemy.position.x;
    const dy = unit.position.y - nearestEnemy.position.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance >= desiredRange) {
      return { x: unit.position.x, y: unit.position.y };
    }
    const scale = desiredRange / distance;
    return {
      x: nearestEnemy.position.x + dx * scale,
      y: unit.position.y + dy * 0.25
    };
  }
  function applyFlockingOffsets(units, desiredTargets, dt) {
    var _a, _b, _c, _d, _e, _f, _g;
    const smoothing = Math.max(0, Math.min(1, dt * 8));
    for (const unit of units) {
      const target = desiredTargets.get(unit.id);
      if (!target) {
        continue;
      }
      (_a = unit.desiredPosition) != null ? _a : unit.desiredPosition = { x: unit.position.x, y: unit.position.y };
      unit.desiredPosition.x += (target.x - unit.desiredPosition.x) * smoothing;
      unit.desiredPosition.y += (target.y - unit.desiredPosition.y) * smoothing;
      unit.formationRole = (_d = (_c = target.role) != null ? _c : (_b = unit.formation) == null ? void 0 : _b.role) != null ? _d : FORMATION_ROLES.FRONTLINE;
      (_e = unit.formation) != null ? _e : unit.formation = {};
      unit.formation.slotIndex = (_g = (_f = target.slotIndex) != null ? _f : unit.formation.slotIndex) != null ? _g : 0;
      unit.formation.offset = {
        x: unit.desiredPosition.x - unit.position.x,
        y: unit.desiredPosition.y - unit.position.y
      };
    }
    return units;
  }
  function computeFormationTargets(selection, worldState, anchorPoint) {
    var _a, _b;
    const units = getSelectionUnits(selection).filter((unit) => unit && unit.entityType === "unit" && unit.alive !== false);
    if (!units.length) {
      return /* @__PURE__ */ new Map();
    }
    const team = getSelectionTeam(selection, units);
    const anchor = makeAnchor(selection, worldState, anchorPoint);
    const frontline = units.filter((unit) => {
      var _a2;
      return unit.unitType !== UNIT_TYPES.MINER && ((_a2 = unit.formation) == null ? void 0 : _a2.role) !== FORMATION_ROLES.RANGED;
    });
    const miners = units.filter((unit) => unit.unitType === UNIT_TYPES.MINER);
    const archers = units.filter((unit) => unit.unitType === UNIT_TYPES.ARCHIDON);
    const desiredTargets = /* @__PURE__ */ new Map();
    const allUnits = (_a = worldState == null ? void 0 : worldState.units) != null ? _a : [];
    const enemies = allUnits.filter((unit) => unit && unit.team !== team && unit.alive !== false);
    const facing = team === TEAM_IDS.PLAYER ? 1 : -1;
    const frontlineAnchor = {
      x: anchor.x + facing * 22,
      y: anchor.y
    };
    const frontlineSlots = computeFrontlineSlots(frontline, facing, frontlineAnchor);
    for (const slot of frontlineSlots) {
      desiredTargets.set(slot.unitId, {
        x: slot.x,
        y: slot.y,
        role: slot.role,
        slotIndex: slot.slotIndex
      });
    }
    miners.forEach((unit, index) => {
      const row = Math.floor(index / 2);
      desiredTargets.set(unit.id, {
        x: anchor.x - facing * (142 + row * 18),
        y: anchor.y + (index % 2 === 0 ? 46 : 86),
        role: FORMATION_ROLES.ECON,
        slotIndex: index
      });
    });
    archers.forEach((unit, index) => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h;
      let nearestEnemy = null;
      let nearestDistance = Infinity;
      for (const enemy of enemies) {
        if (!enemy) {
          continue;
        }
        const distance = Math.hypot(((_b2 = (_a2 = enemy.position) == null ? void 0 : _a2.x) != null ? _b2 : 0) - unit.position.x, ((_d = (_c = enemy.position) == null ? void 0 : _c.y) != null ? _d : 0) - unit.position.y);
        if (distance < nearestDistance) {
          nearestEnemy = enemy;
          nearestDistance = distance;
        }
      }
      const target = computeArcherKiteTarget(unit, nearestEnemy, (_f = (_e = unit.formation) == null ? void 0 : _e.preferredDistance) != null ? _f : ARCHER_STANDOFF_DISTANCE);
      const homeTarget = {
        x: anchor.x - facing * 110,
        y: anchor.y + (index - (archers.length - 1) * 0.5) * 40
      };
      desiredTargets.set(unit.id, {
        x: nearestEnemy ? homeTarget.x * 0.35 + ((_g = target == null ? void 0 : target.x) != null ? _g : homeTarget.x) * 0.65 : homeTarget.x,
        y: nearestEnemy ? homeTarget.y * 0.45 + ((_h = target == null ? void 0 : target.y) != null ? _h : homeTarget.y) * 0.55 : homeTarget.y,
        role: FORMATION_ROLES.RANGED,
        slotIndex: index
      });
    });
    applyFlockingOffsets(units, desiredTargets, (_b = worldState == null ? void 0 : worldState.delta) != null ? _b : 0);
    return desiredTargets;
  }

  // stick-empire-logic/src/core/UnitAI.js
  function getEntityPosition(entity) {
    var _a;
    return (_a = entity == null ? void 0 : entity.position) != null ? _a : { x: 0, y: 0 };
  }
  function distanceBetween(a, b) {
    const pa = getEntityPosition(a);
    const pb = getEntityPosition(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }
  function isEnemy(unit, entity) {
    return Boolean(entity) && entity.team && entity.team !== unit.team && entity.team !== TEAM_IDS.NEUTRAL;
  }
  function getFrontLineX(state2, team) {
    var _a, _b;
    const hint = (_b = (_a = state2 == null ? void 0 : state2.formations) == null ? void 0 : _a.anchors) == null ? void 0 : _b[team];
    if (hint && Number.isFinite(hint.x)) {
      return hint.x;
    }
    return WORLD_DIMENSIONS.frontLineX;
  }
  function getEnemyFrontLineX(state2, unit) {
    return getFrontLineX(state2, unit.team === TEAM_IDS.PLAYER ? TEAM_IDS.ENEMY : TEAM_IDS.PLAYER);
  }
  function getHomeFrontLineX(state2, unit) {
    return getFrontLineX(state2, unit.team);
  }
  function isPossessed(unit) {
    var _a, _b;
    return Boolean((_a = unit == null ? void 0 : unit.possession) == null ? void 0 : _a.active) || ((_b = unit == null ? void 0 : unit.ai) == null ? void 0 : _b.mode) === DECISION_MODES.USER_CONTROLLED || Boolean(unit == null ? void 0 : unit.isUserControlled);
  }
  function isStatue(entity) {
    return (entity == null ? void 0 : entity.entityType) === ENTITY_TYPES.STRUCTURE && (entity == null ? void 0 : entity.structureType) === STRUCTURE_TYPES.STATUE;
  }
  function isReachable(unit, target) {
    if (!unit || !target) {
      return false;
    }
    if (target.alive === false) {
      return false;
    }
    return true;
  }
  function setMoveIntent(unit, target) {
    var _a, _b, _c, _d, _e, _f;
    unit.intent = "move";
    unit.moveTarget = target ? {
      x: (_c = (_b = (_a = target.position) == null ? void 0 : _a.x) != null ? _b : target.x) != null ? _c : unit.position.x,
      y: (_f = (_e = (_d = target.position) == null ? void 0 : _d.y) != null ? _e : target.y) != null ? _f : unit.position.y
    } : null;
  }
  function setAttackIntent(unit, target) {
    var _a, _b;
    unit.intent = "attack";
    unit.attackTargetId = (_a = target == null ? void 0 : target.id) != null ? _a : null;
    unit.targetId = (_b = target == null ? void 0 : target.id) != null ? _b : null;
    unit.moveTarget = target ? { x: target.position.x, y: target.position.y } : null;
  }
  function setIdleIntent(unit) {
    unit.intent = "idle";
    unit.targetId = null;
    unit.attackTargetId = null;
    unit.moveTarget = null;
  }
  function selectNearestEnemy(unit, enemies) {
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of enemies != null ? enemies : []) {
      if (!isEnemy(unit, enemy) || enemy.alive === false) {
        continue;
      }
      const distance = distanceBetween(unit, enemy);
      if (distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  }
  function selectPriorityGoldVein(unit, resourceNodes) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of resourceNodes != null ? resourceNodes : []) {
      if ((node == null ? void 0 : node.resourceType) !== RESOURCE_TYPES.GOLD_VEIN || node.alive === false) {
        continue;
      }
      const distance = distanceBetween(unit, node);
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }
  function isFrontlineClear(unit, state2) {
    const enemyFrontLineX = getEnemyFrontLineX(state2, unit);
    const allUnits = (state2 == null ? void 0 : state2.entities) ? [...state2.entities.values()] : [];
    for (const entity of allUnits) {
      if (!entity || entity.entityType !== ENTITY_TYPES.UNIT || !isEnemy(unit, entity) || entity.alive === false) {
        continue;
      }
      if (unit.team === TEAM_IDS.PLAYER) {
        if (entity.position.x <= enemyFrontLineX) {
          return false;
        }
      } else if (entity.position.x >= enemyFrontLineX) {
        return false;
      }
    }
    return true;
  }
  function buildDecisionTree(unitType) {
    var _a;
    if (unitType === UNIT_TYPES.MINER) {
      return {
        id: "MinerDecisionTree",
        evaluate: evaluateMinerDecision
      };
    }
    if (unitType === UNIT_TYPES.ARCHIDON) {
      return {
        id: "ArchidonDecisionTree",
        evaluate: evaluateRangedDecision
      };
    }
    return {
      id: `${(_a = unitType == null ? void 0 : unitType.replaceAll(" ", "")) != null ? _a : "Unit"}DecisionTree`,
      evaluate: evaluateFrontlineDecision
    };
  }
  function evaluateUnitDecision(unit, state2, context = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    if (!unit || unit.alive === false) {
      return null;
    }
    if (isPossessed(unit)) {
      return {
        intent: (_a = unit.intent) != null ? _a : "manual",
        targetId: (_b = unit.targetId) != null ? _b : null,
        attackTargetId: (_c = unit.attackTargetId) != null ? _c : null,
        moveTarget: (_d = unit.moveTarget) != null ? _d : null,
        aiState: (_e = unit.aiState) != null ? _e : "manual"
      };
    }
    const tree = buildDecisionTree(unit.unitType);
    const decision = (_f = tree.evaluate(unit, state2, context)) != null ? _f : {};
    unit.intent = (_h = (_g = decision.intent) != null ? _g : unit.intent) != null ? _h : "idle";
    unit.targetId = (_i = decision.targetId) != null ? _i : null;
    unit.attackTargetId = (_j = decision.attackTargetId) != null ? _j : null;
    unit.moveTarget = (_k = decision.moveTarget) != null ? _k : null;
    unit.aiState = (_l = decision.aiState) != null ? _l : "active";
    unit.ai = (_m = unit.ai) != null ? _m : {};
    unit.ai.mode = DECISION_MODES.DECISION_TREE;
    unit.ai.lastDecisionAt = (_o = (_n = context.now) != null ? _n : unit.ai.lastDecisionAt) != null ? _o : 0;
    return decision;
  }
  function evaluateMinerDecision(unit, state2, context) {
    var _a, _b, _c, _d, _e;
    const resourceNodes = (_d = context == null ? void 0 : context.resourceNodes) != null ? _d : (_c = (_b = (_a = state2 == null ? void 0 : state2.references) == null ? void 0 : _a.resources) == null ? void 0 : _b.map((id) => state2.entities.get(id)).filter(Boolean)) != null ? _c : [];
    const vein = selectPriorityGoldVein(unit, resourceNodes);
    if (vein && isReachable(unit, vein)) {
      unit.aiState = "mining";
      (_e = unit.mining) != null ? _e : unit.mining = {};
      unit.mining.targetResourceId = vein.id;
      setMoveIntent(unit, vein);
      unit.targetId = vein.id;
      unit.attackTargetId = null;
      return {
        intent: unit.intent,
        targetId: unit.targetId,
        moveTarget: unit.moveTarget,
        aiState: unit.aiState
      };
    }
    unit.aiState = "idle";
    unit.mining.targetResourceId = null;
    setIdleIntent(unit);
    return {
      intent: unit.intent,
      targetId: null,
      moveTarget: null,
      aiState: unit.aiState
    };
  }
  function evaluateFrontlineDecision(unit, state2, context) {
    var _a;
    const enemies = (_a = context.enemies) != null ? _a : collectHostiles(unit, state2);
    const nearestEnemy = selectNearestEnemy(unit, enemies);
    if (nearestEnemy) {
      const treeClear = isFrontlineClear(unit, state2);
      const shouldTargetStatue = treeClear && isStatue(nearestEnemy);
      if (!treeClear && isStatue(nearestEnemy)) {
        const frontlineEnemy = selectNearestEnemy(unit, enemies.filter((entity) => !isStatue(entity)));
        if (frontlineEnemy) {
          setAttackIntent(unit, frontlineEnemy);
          unit.aiState = "engage-frontline";
          return decisionFromTarget(unit);
        }
      }
      if (shouldTargetStatue || !isStatue(nearestEnemy)) {
        setAttackIntent(unit, nearestEnemy);
        unit.aiState = isStatue(nearestEnemy) ? "siege" : "engage";
        return decisionFromTarget(unit);
      }
    }
    setMoveIntent(unit, {
      position: {
        x: getEnemyFrontLineX(state2, unit),
        y: unit.position.y
      },
      id: null
    });
    unit.aiState = "advance";
    return decisionFromTarget(unit);
  }
  function evaluateRangedDecision(unit, state2, context) {
    var _a;
    const enemies = (_a = context.enemies) != null ? _a : collectHostiles(unit, state2);
    const nearestEnemy = selectNearestEnemy(unit, enemies);
    if (nearestEnemy) {
      const frontlineClear = isFrontlineClear(unit, state2);
      if (!frontlineClear && isStatue(nearestEnemy)) {
        const frontlineEnemy = selectNearestEnemy(unit, enemies.filter((entity) => !isStatue(entity)));
        if (frontlineEnemy) {
          setAttackIntent(unit, frontlineEnemy);
          unit.aiState = "cover-frontline";
          return decisionFromTarget(unit);
        }
      }
      if (isStatue(nearestEnemy) && !frontlineClear) {
        unit.aiState = "hold-range";
        return decisionFromTarget(unit);
      }
      setAttackIntent(unit, nearestEnemy);
      unit.aiState = "ranged-engage";
      return decisionFromTarget(unit);
    }
    setMoveIntent(unit, {
      position: {
        x: getEnemyFrontLineX(state2, unit) - (unit.team === TEAM_IDS.PLAYER ? 140 : -140),
        y: unit.position.y
      },
      id: null
    });
    unit.aiState = "ranged-advance";
    return decisionFromTarget(unit);
  }
  function collectHostiles(unit, state2) {
    return (state2 == null ? void 0 : state2.entities) ? [...state2.entities.values()].filter((entity) => entity && (entity.entityType === ENTITY_TYPES.UNIT || entity.entityType === ENTITY_TYPES.STRUCTURE) && isEnemy(unit, entity)) : [];
  }
  function decisionFromTarget(unit) {
    var _a, _b, _c, _d, _e;
    return {
      intent: (_a = unit.intent) != null ? _a : "idle",
      targetId: (_b = unit.targetId) != null ? _b : null,
      attackTargetId: (_c = unit.attackTargetId) != null ? _c : null,
      moveTarget: (_d = unit.moveTarget) != null ? _d : null,
      aiState: (_e = unit.aiState) != null ? _e : "idle"
    };
  }
  function tickUnitAI(units, state2, dt) {
    var _a, _b, _c, _d, _e;
    const now = (_b = (_a = state2 == null ? void 0 : state2.clock) == null ? void 0 : _a.elapsed) != null ? _b : 0;
    for (const unit of units != null ? units : []) {
      if (!unit || unit.alive === false) {
        continue;
      }
      evaluateUnitDecision(unit, state2, {
        now,
        dt,
        enemies: collectHostiles(unit, state2),
        resourceNodes: (_e = (_d = (_c = state2 == null ? void 0 : state2.references) == null ? void 0 : _c.resources) == null ? void 0 : _d.map((id) => state2.entities.get(id)).filter(Boolean)) != null ? _e : [],
        frontlineX: getEnemyFrontLineX(state2, unit),
        homeFrontLineX: getHomeFrontLineX(state2, unit)
      });
    }
  }

  // stick-empire-logic/src/core/CommandDirector.js
  var POSSESSION_INPUT_KEYS = /* @__PURE__ */ new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
  var CommandDirector = class {
    constructor() {
      this.state = {
        selection: {
          active: false,
          start: null,
          current: null
        }
      };
    }
    beginSelection(screenPoint) {
      this.state.selection.active = true;
      this.state.selection.start = normalizePoint(screenPoint);
      this.state.selection.current = normalizePoint(screenPoint);
    }
    updateSelection(screenPoint) {
      if (!this.state.selection.active) {
        return;
      }
      this.state.selection.current = normalizePoint(screenPoint);
    }
    finalizeSelection(worldState, projection) {
      var _a, _b, _c;
      if (!this.state.selection.active || !this.state.selection.start || !this.state.selection.current) {
        return [];
      }
      const start = this.state.selection.start;
      const current = this.state.selection.current;
      const left = Math.min(start.x, current.x);
      const right = Math.max(start.x, current.x);
      const top = Math.min(start.y, current.y);
      const bottom = Math.max(start.y, current.y);
      const selectedIds = [];
      for (const unit of listUnits(worldState)) {
        if (unit.team !== TEAM_IDS.PLAYER) {
          continue;
        }
        const screenPoint = projectEntityToScreen(unit, projection);
        const radius = (_b = (_a = unit.collision) == null ? void 0 : _a.selectionRadius) != null ? _b : 0;
        if (screenPoint.x >= left - radius && screenPoint.x <= right + radius && screenPoint.y >= top - radius && screenPoint.y <= bottom + radius) {
          selectedIds.push(unit.id);
        }
      }
      if (((_c = worldState.selection) == null ? void 0 : _c.possessionTargetId) && !selectedIds.includes(worldState.selection.possessionTargetId)) {
        this.releasePossession(worldState);
      }
      selectEntityIds(worldState, selectedIds);
      worldState.selection.box = null;
      this.state.selection.active = false;
      this.state.selection.start = null;
      this.state.selection.current = null;
      return selectedIds;
    }
    clearSelection(worldState) {
      selectEntityIds(worldState, []);
      worldState.selection.box = null;
      this.releasePossession(worldState);
    }
    issueMove(worldState, worldPoint) {
      return queueCommand(worldState, {
        type: COMMAND_TYPES.MOVE,
        target: normalizePoint(worldPoint)
      });
    }
    issueAttackMove(worldState, worldPoint) {
      return queueCommand(worldState, {
        type: COMMAND_TYPES.ATTACK_MOVE,
        target: normalizePoint(worldPoint)
      });
    }
    issueHarvest(worldState, targetNodeId) {
      return queueCommand(worldState, {
        type: COMMAND_TYPES.HARVEST,
        targetEntityId: targetNodeId
      });
    }
    possessUnit(worldState, unitId) {
      const unit = getEntityById(worldState, unitId);
      if (!unit || unit.entityType !== "unit" || unit.team !== TEAM_IDS.PLAYER) {
        return null;
      }
      if (worldState.selection.possessionTargetId && worldState.selection.possessionTargetId !== unitId) {
        const previous = getEntityById(worldState, worldState.selection.possessionTargetId);
        if (previous) {
          releaseUnitControl(previous);
        }
      }
      worldState.selection.possessionTargetId = unitId;
      unit.possession.active = true;
      unit.possession.movementVector.x = 0;
      unit.possession.movementVector.y = 0;
      unit.ai.mode = DECISION_MODES.USER_CONTROLLED;
      unit.ai.targetEntityId = null;
      unit.ai.targetTag = null;
      unit.command.type = COMMAND_TYPES.MOVE;
      unit.command.target = null;
      unit.command.targetEntityId = null;
      unit.command.queued = [];
      unit.combat.attackSpeedMultiplier = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
      unit.stats.userControlBonus = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
      unit.isUserControlled = true;
      return unit;
    }
    releasePossession(worldState) {
      const unit = getEntityById(worldState, worldState.selection.possessionTargetId);
      if (unit) {
        releaseUnitControl(unit);
      }
      worldState.selection.possessionTargetId = null;
      return unit;
    }
    applyKeyboardControl(worldState, inputState, dt) {
      var _a, _b;
      const unit = getEntityById(worldState, worldState.selection.possessionTargetId);
      if (!unit || unit.entityType !== "unit") {
        return null;
      }
      const keys = (_a = inputState == null ? void 0 : inputState.keyboard) != null ? _a : {};
      const moveX = (pressed(keys, "arrowright") || pressed(keys, "d") ? 1 : 0) - (pressed(keys, "arrowleft") || pressed(keys, "a") ? 1 : 0);
      const moveY = (pressed(keys, "arrowdown") || pressed(keys, "s") ? 1 : 0) - (pressed(keys, "arrowup") || pressed(keys, "w") ? 1 : 0);
      const attack = Boolean(keys.space || keys[" "]);
      unit.possession.active = true;
      unit.ai.mode = DECISION_MODES.USER_CONTROLLED;
      unit.isUserControlled = true;
      unit.combat.attackSpeedMultiplier = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
      unit.stats.userControlBonus = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
      unit.possession.movementVector.x = moveX;
      unit.possession.movementVector.y = moveY;
      unit.intent = "manual";
      unit.moveTarget = moveX || moveY ? {
        x: unit.position.x + moveX * 120,
        y: unit.position.y + moveY * 120
      } : null;
      unit.attackTargetId = null;
      if (attack) {
        unit.command.type = COMMAND_TYPES.ATTACK_MOVE;
        unit.command.target = {
          x: unit.position.x + moveX * 48,
          y: unit.position.y + moveY * 48
        };
      }
      if (moveX === 0 && moveY === 0) {
        return unit;
      }
      const magnitude = Math.hypot(moveX, moveY) || 1;
      const speed = (_b = unit.stats.speed) != null ? _b : 0;
      unit.position.x += moveX / magnitude * speed * dt;
      unit.position.y += moveY / magnitude * speed * 0.75 * dt;
      return unit;
    }
  };
  function queueCommand(worldState, command) {
    var _a, _b, _c, _d, _e;
    (_a = worldState.commandState) != null ? _a : worldState.commandState = {};
    if (!Array.isArray(worldState.commandState.orderQueue)) {
      worldState.commandState.orderQueue = [];
    }
    const queuedCommand = {
      ...command,
      team: TEAM_IDS.PLAYER,
      unitIds: [...(_c = (_b = worldState.selection) == null ? void 0 : _b.selectedIds) != null ? _c : []],
      issuedAt: (_e = (_d = worldState.clock) == null ? void 0 : _d.elapsed) != null ? _e : 0
    };
    worldState.commandState.orderQueue.push(queuedCommand);
    worldState.commandState.lastIssuedAt = queuedCommand.issuedAt;
    return queuedCommand;
  }
  function releaseUnitControl(unit) {
    var _a;
    unit.possession.active = false;
    unit.possession.movementVector.x = 0;
    unit.possession.movementVector.y = 0;
    unit.ai.mode = DECISION_MODES.DECISION_TREE;
    unit.combat.attackSpeedMultiplier = 1;
    unit.stats.userControlBonus = 1;
    unit.isUserControlled = false;
    unit.intent = "idle";
    unit.moveTarget = null;
    unit.attackTargetId = null;
    unit.command.type = COMMAND_TYPES.MOVE;
    unit.command.target = (_a = unit.desiredPosition) != null ? _a : null;
    unit.command.targetEntityId = null;
  }
  function normalizePoint(point) {
    var _a, _b, _c, _d;
    return {
      x: Number((_b = (_a = point == null ? void 0 : point.x) != null ? _a : point == null ? void 0 : point.screenX) != null ? _b : 0),
      y: Number((_d = (_c = point == null ? void 0 : point.y) != null ? _c : point == null ? void 0 : point.screenY) != null ? _d : 0)
    };
  }
  function projectEntityToScreen(entity, projection) {
    var _a;
    if (typeof projection === "function") {
      return normalizePoint(projection(entity));
    }
    if (projection && typeof projection.worldToScreen === "function") {
      return normalizePoint(projection.worldToScreen(entity.position));
    }
    const camera = (_a = projection == null ? void 0 : projection.camera) != null ? _a : { x: 0, y: 0, zoom: 1 };
    return {
      x: (entity.position.x - camera.x) * camera.zoom,
      y: (entity.position.y - camera.y) * camera.zoom
    };
  }
  function listUnits(worldState) {
    if (!(worldState == null ? void 0 : worldState.entities) || !worldState.entityIds) {
      return [];
    }
    return worldState.entityIds.map((id) => worldState.entities.get(id)).filter((entity) => entity && entity.entityType === "unit");
  }
  function pressed(keys, key) {
    return Boolean(keys[key]) || Boolean(keys[key.toUpperCase()]) || POSSESSION_INPUT_KEYS.has(key) && Boolean(keys[key.toLowerCase()]);
  }

  // stick-empire-logic/src/assets/UnitSprites.js
  var assetOverrides = /* @__PURE__ */ new Map();
  function encodeSvg(markup) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(markup)}`;
  }
  function buildSvg(width, height, body) {
    return encodeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>`
    );
  }
  function getPalette(team) {
    var _a;
    return (_a = TEAM_COLORS[team]) != null ? _a : TEAM_COLORS[TEAM_IDS.NEUTRAL];
  }
  function buildMinerBody(palette) {
    return `
    <ellipse cx="50" cy="108" rx="30" ry="8" fill="${palette.shadow}" />
    <path d="M34 92 L45 50" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M66 92 L55 50" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 28 L50 74" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <circle cx="50" cy="19" r="10" stroke="${palette.fill}" stroke-width="6" />
    <path d="M50 42 L28 60" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 44 L77 54" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M74 52 L88 44 L83 34" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round" />
    <path d="M35 16 L50 8 L65 16" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" />
  `;
  }
  function buildSwordwrathBody(palette) {
    return `
    <ellipse cx="50" cy="108" rx="32" ry="8" fill="${palette.shadow}" />
    <path d="M36 94 L47 48" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M64 94 L53 48" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 28 L50 74" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <circle cx="50" cy="19" r="10" stroke="${palette.fill}" stroke-width="6" />
    <path d="M50 42 L29 56" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 44 L72 30" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M72 30 L89 11" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" />
    <path d="M89 11 L95 17" stroke="${palette.fill}" stroke-width="5" stroke-linecap="round" />
    <path d="M31 58 L21 45 L28 32 L41 37 Z" fill="${palette.accent}" fill-opacity="0.75" />
  `;
  }
  function buildArchidonBody(palette) {
    return `
    <ellipse cx="50" cy="108" rx="30" ry="8" fill="${palette.shadow}" />
    <path d="M34 94 L47 52" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M66 94 L53 52" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 28 L50 76" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <circle cx="50" cy="19" r="10" stroke="${palette.fill}" stroke-width="6" />
    <path d="M50 44 L28 58" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 42 L73 48" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M76 36 C88 44 88 66 76 74" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" />
    <path d="M74 48 L92 32" stroke="${palette.fill}" stroke-width="4" stroke-linecap="round" />
    <path d="M74 62 L92 46" stroke="${palette.fill}" stroke-width="4" stroke-linecap="round" />
  `;
  }
  function buildStatueBody(palette) {
    return `
    <ellipse cx="82" cy="190" rx="54" ry="12" fill="${palette.shadow}" />
    <path d="M26 186 H138" stroke="${palette.accent}" stroke-width="12" stroke-linecap="round" />
    <path d="M58 182 V78" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M106 182 V70" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M82 48 V140" stroke="${palette.fill}" stroke-width="12" stroke-linecap="round" />
    <circle cx="82" cy="28" r="18" stroke="${palette.fill}" stroke-width="10" />
    <path d="M82 86 L46 110" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M82 88 L118 68" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M118 68 L136 44" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" />
  `;
  }
  function buildGoldVeinBody() {
    return `
    <ellipse cx="52" cy="94" rx="34" ry="8" fill="rgba(248, 203, 116, 0.25)" />
    <path d="M19 86 L38 34 L57 55 L77 22 L89 72 L68 90 Z" fill="#f8cb74" fill-opacity="0.92" />
    <path d="M34 48 L45 58 L62 40" stroke="#fff0c5" stroke-width="4" stroke-linecap="round" />
  `;
  }
  function buildPlaceholderSrc(entity) {
    const palette = getPalette(entity.team);
    if (entity.entityType === ENTITY_TYPES.UNIT) {
      if (entity.unitType === UNIT_TYPES.MINER) {
        return buildSvg(100, 120, buildMinerBody(palette));
      }
      if (entity.unitType === UNIT_TYPES.ARCHIDON) {
        return buildSvg(100, 120, buildArchidonBody(palette));
      }
      return buildSvg(100, 120, buildSwordwrathBody(palette));
    }
    if (entity.entityType === ENTITY_TYPES.STRUCTURE && entity.structureType === STRUCTURE_TYPES.STATUE) {
      return buildSvg(164, 220, buildStatueBody(palette));
    }
    if (entity.entityType === ENTITY_TYPES.RESOURCE && entity.resourceType === RESOURCE_TYPES.GOLD_VEIN) {
      return buildSvg(104, 104, buildGoldVeinBody());
    }
    return buildSvg(64, 64, `<circle cx="32" cy="32" r="18" stroke="${palette.fill}" stroke-width="5" />`);
  }
  function resolveSlot(entity) {
    if (entity.entityType === ENTITY_TYPES.UNIT) {
      return `units/${entity.unitType.toLowerCase()}/${entity.team}`;
    }
    if (entity.entityType === ENTITY_TYPES.STRUCTURE) {
      return `structures/${entity.structureType.toLowerCase()}/${entity.team}`;
    }
    if (entity.entityType === ENTITY_TYPES.RESOURCE) {
      return `resources/${entity.resourceType.toLowerCase()}`;
    }
    return `misc/${entity.entityType}`;
  }
  function getAssetDescriptor(entity) {
    var _a;
    const slot = resolveSlot(entity);
    return {
      slot,
      notes: slot.startsWith("units/") ? ASSET_SLOT_NOTES.units : slot.startsWith("structures/") ? ASSET_SLOT_NOTES.structures : ASSET_SLOT_NOTES.resources,
      src: (_a = assetOverrides.get(slot)) != null ? _a : buildPlaceholderSrc(entity)
    };
  }

  // stick-empire-logic/src/render/Renderer.js
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  var Renderer = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      this.ctx = canvas2.getContext("2d");
      this.assetCache = /* @__PURE__ */ new Map();
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
    }
    worldToScreen(state2, x, y) {
      return {
        x: (x - state2.camera.x) * state2.camera.zoom,
        y: (y - state2.camera.y) * state2.camera.zoom
      };
    }
    getImage(src) {
      let image = this.assetCache.get(src);
      if (!image) {
        image = new Image();
        image.src = src;
        this.assetCache.set(src, image);
      }
      return image;
    }
    render(state2) {
      this.resize();
      const { ctx } = this;
      const width = this.canvas.width;
      const height = this.canvas.height;
      ctx.clearRect(0, 0, width, height);
      this.drawSky(width, height);
      this.drawGround(state2, width, height);
      this.drawFrontLine(state2, height);
      const entities = state2.entityIds.map((id) => state2.entities.get(id)).filter(Boolean).sort((left, right) => {
        var _a, _b, _c, _d;
        return ((_b = (_a = left.position) == null ? void 0 : _a.y) != null ? _b : 0) - ((_d = (_c = right.position) == null ? void 0 : _c.y) != null ? _d : 0);
      });
      for (const entity of entities) {
        this.drawEntity(state2, entity);
      }
      this.drawFormationGuides(state2);
      this.drawSelection(state2);
      this.drawFooterLegend(state2, width, height);
    }
    drawSky(width, height) {
      const { ctx } = this;
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#15283a");
      gradient.addColorStop(0.55, "#192e43");
      gradient.addColorStop(1, "#24311e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let index = 0; index < 12; index += 1) {
        ctx.beginPath();
        ctx.arc(width / 12 * index + 40, 90 + Math.sin(index) * 18, 2 + index % 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawGround(state2, width, height) {
      const { ctx } = this;
      const groundY = this.worldToScreen(state2, 0, state2.world.groundY).y;
      const gradient = ctx.createLinearGradient(0, groundY - 40, 0, height);
      gradient.addColorStop(0, "#475531");
      gradient.addColorStop(1, "#1b2415");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, groundY, width, height - groundY);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
    }
    drawFrontLine(state2, height) {
      const { ctx } = this;
      const screen = this.worldToScreen(state2, state2.world.frontLineX, 0);
      ctx.save();
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = "rgba(248, 203, 116, 0.42)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screen.x, 60);
      ctx.lineTo(screen.x, height - 80);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(248, 203, 116, 0.92)";
      ctx.font = "600 14px Trebuchet MS";
      ctx.fillText("Frontline", screen.x + 10, 78);
    }
    drawEntity(state2, entity) {
      var _a, _b, _c, _d, _e, _f, _g;
      const { ctx } = this;
      const { x, y } = this.worldToScreen(state2, entity.position.x, entity.position.y);
      const renderWidth = ((_b = (_a = entity.render) == null ? void 0 : _a.width) != null ? _b : 90) * state2.camera.zoom;
      const renderHeight = ((_d = (_c = entity.render) == null ? void 0 : _c.height) != null ? _d : 90) * state2.camera.zoom;
      const asset = getAssetDescriptor(entity);
      const image = this.getImage(asset.src);
      const flip = ((_e = entity.render) == null ? void 0 : _e.facing) === -1 ? -1 : 1;
      const bob = entity.entityType === "unit" ? Math.sin(state2.clock.elapsed * 3 + entity.render.bobPhase) * 3 : 0;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(flip, 1);
      ctx.globalAlpha = entity.alive === false && entity.entityType !== "unit" ? 0.35 : 1;
      if (image.complete) {
        ctx.drawImage(image, -renderWidth / 2, -renderHeight, renderWidth, renderHeight);
      } else {
        ctx.fillStyle = (_g = (_f = TEAM_COLORS[entity.team]) == null ? void 0 : _f.accent) != null ? _g : "#ffffff";
        ctx.fillRect(-renderWidth / 4, -renderHeight / 2, renderWidth / 2, renderHeight / 2);
      }
      ctx.restore();
      this.drawHealthBar(state2, entity, x, y - renderHeight + 8, renderWidth);
      this.drawSelectionRing(state2, entity, x, y);
    }
    drawFormationGuides(state2) {
      var _a, _b;
      const { ctx } = this;
      for (const team of [TEAM_IDS.PLAYER, TEAM_IDS.ENEMY]) {
        const anchor = (_b = (_a = state2.formations) == null ? void 0 : _a.anchors) == null ? void 0 : _b[team];
        if (!anchor) {
          continue;
        }
        const point = this.worldToScreen(state2, anchor.x, anchor.y);
        ctx.save();
        ctx.fillStyle = team === TEAM_IDS.PLAYER ? "rgba(124, 215, 235, 0.8)" : "rgba(239, 123, 111, 0.8)";
        ctx.beginPath();
        ctx.moveTo(point.x, point.y - 28);
        ctx.lineTo(point.x + 10, point.y - 8);
        ctx.lineTo(point.x - 10, point.y - 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      for (const entity of state2.entities.values()) {
        if (!entity || entity.entityType !== "unit" || !entity.desiredPosition) {
          continue;
        }
        const origin = this.worldToScreen(state2, entity.position.x, entity.position.y - 14);
        const target = this.worldToScreen(state2, entity.desiredPosition.x, entity.desiredPosition.y - 14);
        ctx.save();
        ctx.strokeStyle = entity.team === TEAM_IDS.PLAYER ? "rgba(124, 215, 235, 0.2)" : "rgba(239, 123, 111, 0.14)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    drawHealthBar(state2, entity, x, y, width) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const hp = (_d = (_c = (_a = entity.stats) == null ? void 0 : _a.hp) != null ? _c : (_b = entity.resource) == null ? void 0 : _b.amount) != null ? _d : 1;
      const maxHp = (_h = (_g = (_e = entity.stats) == null ? void 0 : _e.maxHp) != null ? _g : (_f = entity.resource) == null ? void 0 : _f.maxAmount) != null ? _h : 1;
      const ratio = clamp(hp / Math.max(1, maxHp), 0, 1);
      const barWidth = Math.max(36, width * 0.68);
      const barHeight = 6;
      const { ctx } = this;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
      ctx.fillStyle = entity.team === TEAM_IDS.ENEMY ? "#ef7b6f" : "#7adf9d";
      ctx.fillRect(x - barWidth / 2, y, barWidth * ratio, barHeight);
    }
    drawSelectionRing(state2, entity, x, y) {
      var _a;
      const { ctx } = this;
      const isSelected = state2.selection.selectedIds.includes(entity.id);
      const isPossessed2 = state2.selection.possessionTargetId === entity.id;
      if (!isSelected && !isPossessed2) {
        return;
      }
      ctx.save();
      ctx.strokeStyle = isPossessed2 ? "rgba(248, 203, 116, 0.95)" : "rgba(124, 215, 235, 0.85)";
      ctx.lineWidth = isPossessed2 ? 4 : 2;
      ctx.beginPath();
      ctx.arc(x, y + 2, (_a = entity.collision.selectionRadius) != null ? _a : 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSelection(state2) {
      const box = state2.selection.box;
      if (!box) {
        return;
      }
      const { ctx } = this;
      const x = Math.min(box.startX, box.currentX);
      const y = Math.min(box.startY, box.currentY);
      const width = Math.abs(box.currentX - box.startX);
      const height = Math.abs(box.currentY - box.startY);
      ctx.save();
      ctx.fillStyle = "rgba(124, 215, 235, 0.12)";
      ctx.strokeStyle = "rgba(124, 215, 235, 0.8)";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }
    drawFooterLegend(state2, width, height) {
      const { ctx } = this;
      ctx.fillStyle = "rgba(10,17,27,0.72)";
      ctx.fillRect(16, height - 46, 700, 30);
      ctx.fillStyle = "#f4efe2";
      ctx.font = "14px Trebuchet MS";
      ctx.fillText(
        `Left drag: multi-select | Left click: possess | Right click: issue ${state2.commandState.activeCommandId} | Space: possessed attack`,
        28,
        height - 25
      );
    }
  };

  // stick-empire-logic/src/ui/HUD.js
  var HUD = class {
    constructor(rootDocument) {
      this.root = rootDocument;
      this.nodes = {
        gold: rootDocument.getElementById("gold-value"),
        goldRate: rootDocument.getElementById("gold-rate-value"),
        pop: rootDocument.getElementById("pop-value"),
        popCap: rootDocument.getElementById("pop-cap-value"),
        selection: rootDocument.getElementById("selection-value"),
        possession: rootDocument.getElementById("possession-value"),
        status: rootDocument.getElementById("status-value"),
        buildMenu: rootDocument.getElementById("base-build-menu"),
        commandMenu: rootDocument.getElementById("unit-command-menu"),
        feed: rootDocument.getElementById("event-feed"),
        overlay: rootDocument.getElementById("result-overlay"),
        overlayTitle: rootDocument.getElementById("overlay-title"),
        overlayBody: rootDocument.getElementById("overlay-body"),
        overlayButton: rootDocument.getElementById("overlay-button")
      };
      this.handlers = {
        onAction: () => {
        },
        onRestart: () => {
        }
      };
    }
    setHandlers(handlers) {
      this.handlers = {
        ...this.handlers,
        ...handlers
      };
      this.nodes.overlayButton.onclick = () => {
        this.handlers.onRestart();
      };
    }
    render(state2) {
      var _a, _b;
      this.nodes.gold.textContent = Math.floor(state2.economy.gold).toString();
      this.nodes.goldRate.textContent = state2.economy.goldRate.toFixed(2);
      this.nodes.pop.textContent = String(state2.economy.population);
      this.nodes.popCap.textContent = String(state2.economy.popCap);
      this.nodes.selection.textContent = state2.selection.selectedIds.length ? `${state2.selection.selectedIds.length} unit(s)` : "None";
      const possessionId = (_a = state2.selection.possessionTargetId) != null ? _a : "None";
      this.nodes.possession.textContent = possessionId;
      this.nodes.status.textContent = state2.ui.statusText;
      this.renderActionMenu(
        this.nodes.buildMenu,
        state2.ui.buildMenu,
        (_b = state2.ui.activeBuildId) != null ? _b : null,
        "build"
      );
      this.renderActionMenu(
        this.nodes.commandMenu,
        state2.ui.commandMenu,
        state2.ui.activeCommandId,
        "command"
      );
      this.nodes.feed.innerHTML = "";
      for (const item of state2.ui.eventFeed) {
        const line = document.createElement("p");
        line.className = "feed-item";
        line.textContent = item;
        this.nodes.feed.append(line);
      }
      this.nodes.overlay.classList.toggle("is-visible", state2.ui.overlay.visible);
      this.nodes.overlay.setAttribute("aria-hidden", String(!state2.ui.overlay.visible));
      this.nodes.overlayTitle.textContent = state2.ui.overlay.title;
      this.nodes.overlayBody.textContent = state2.ui.overlay.body;
    }
    renderActionMenu(container, actions, activeId, scope) {
      if (container.dataset.signature === `${scope}:${activeId}:${actions.length}`) {
        for (const button of container.querySelectorAll("button")) {
          button.classList.toggle("is-active", button.dataset.actionId === activeId);
        }
        return;
      }
      container.dataset.signature = `${scope}:${activeId}:${actions.length}`;
      container.innerHTML = "";
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action-button";
        button.dataset.actionId = action.id;
        button.classList.toggle("is-active", action.id === activeId);
        button.innerHTML = `<strong>${action.label}</strong><small>${action.detail}</small>`;
        button.addEventListener("click", () => {
          this.handlers.onAction(scope, action.id);
        });
        container.append(button);
      }
    }
  };

  // stick-empire-logic/src/main.js
  var canvas = document.getElementById("battlefield");
  var renderer = new Renderer(canvas);
  var hud = new HUD(document);
  var ENEMY_REINFORCEMENT_CYCLE = [
    UNIT_TYPES.SWORDWRATH,
    UNIT_TYPES.ARCHIDON,
    UNIT_TYPES.SWORDWRATH,
    UNIT_TYPES.MINER
  ];
  var state = buildSeededState();
  var lastFrame = performance.now();
  hud.setHandlers({
    onAction: handleHudAction,
    onRestart: () => {
      state = buildSeededState();
    }
  });
  attachPointerInput();
  attachKeyboardInput();
  requestAnimationFrame(frame);
  function buildSeededState() {
    const nextState = createInitialGameState();
    nextState.systems.economySystem = new EconomySystem({
      baseGoldRate: ECONOMY_DEFAULTS.goldRate,
      minerYield: 1.15
    });
    nextState.systems.commandDirector = new CommandDirector();
    for (const entity of createSkirmishSeed()) {
      registerEntity(nextState, entity);
    }
    refreshDerivedState(nextState);
    selectEntityIds(nextState, ["player-swordwrath-alpha", "player-archidon-alpha"]);
    nextState.systems.commandDirector.possessUnit(nextState, "player-swordwrath-alpha");
    nextState.ui.statusText = "Left-drag multi-select. Left-click a friendly unit to possess. Right-click to issue the active command.";
    pushEvent(nextState, "Empire engine online.");
    return nextState;
  }
  function frame(now) {
    const dt = Math.min(1 / 20, (now - lastFrame) / 1e3 || 0);
    lastFrame = now;
    if (!state.clock.paused) {
      state.clock.delta = dt;
      state.clock.elapsed += dt;
      state.clock.frame += 1;
      stepSimulation(dt);
    }
    hud.render(state);
    renderer.render(state);
    requestAnimationFrame(frame);
  }
  function stepSimulation(dt) {
    refreshDerivedState(state);
    state.systems.economySystem.tick(state, dt);
    processEnemyReinforcements(dt);
    processProductionQueue(dt);
    processOrderQueue();
    solveFormations(dt);
    state.systems.commandDirector.applyKeyboardControl(state, state.input, dt);
    tickUnitAI(state.units, state, dt);
    simulateUnits(dt);
    drainGoldVeins(dt);
    cleanupDefeatedEntities();
    refreshDerivedState(state);
  }
  function refreshDerivedState(worldState) {
    worldState.units = listEntities(worldState, (entity) => entity.entityType === "unit" && entity.alive !== false);
    worldState.resourceNodes = listEntities(worldState, (entity) => entity.entityType === "resource");
    worldState.structures = listEntities(worldState, (entity) => entity.entityType === "structure");
    worldState.economy.population = getTeamPopulation(worldState, TEAM_IDS.PLAYER);
    worldState.economy.popUsed = worldState.economy.population + countQueuePopulation(worldState.production.queue);
  }
  function attachPointerInput() {
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      updatePointer(event);
      issueContextCommand();
    });
    canvas.addEventListener("pointerdown", (event) => {
      updatePointer(event);
      if (event.button !== 0) {
        return;
      }
      state.input.pointer.down = true;
      state.input.pointer.dragging = false;
      state.systems.commandDirector.beginSelection({
        x: state.input.pointer.screenX,
        y: state.input.pointer.screenY
      });
      state.selection.box = {
        startX: state.input.pointer.screenX,
        startY: state.input.pointer.screenY,
        currentX: state.input.pointer.screenX,
        currentY: state.input.pointer.screenY
      };
    });
    canvas.addEventListener("pointermove", (event) => {
      updatePointer(event);
      if (!state.input.pointer.down || !state.selection.box) {
        return;
      }
      state.systems.commandDirector.updateSelection({
        x: state.input.pointer.screenX,
        y: state.input.pointer.screenY
      });
      state.selection.box.currentX = state.input.pointer.screenX;
      state.selection.box.currentY = state.input.pointer.screenY;
      const dx = state.selection.box.currentX - state.selection.box.startX;
      const dy = state.selection.box.currentY - state.selection.box.startY;
      state.input.pointer.dragging = Math.hypot(dx, dy) >= MULTI_SELECT.minDragDistance;
    });
    canvas.addEventListener("pointerup", (event) => {
      updatePointer(event);
      if (event.button !== 0) {
        return;
      }
      state.input.pointer.down = false;
      if (state.input.pointer.dragging) {
        const selected = state.systems.commandDirector.finalizeSelection(state, {
          camera: state.camera
        });
        state.ui.statusText = selected.length ? `Multi-select locked ${selected.length} unit(s).` : "Selection box clear.";
        if (selected.length) {
          pushEvent(state, `Multi-select acquired ${selected.length} units.`);
        }
      } else {
        commitPointSelection();
      }
      state.input.pointer.dragging = false;
      state.selection.box = null;
    });
  }
  function attachKeyboardInput() {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      state.input.keyboard[key] = true;
      if (event.code === "Space") {
        state.input.keyboard.space = true;
        event.preventDefault();
      }
      if (key.startsWith("arrow")) {
        event.preventDefault();
      }
      if (event.repeat) {
        return;
      }
      if (key === "m") {
        setActiveCommand(COMMAND_TYPES.MOVE);
      } else if (key === "f") {
        setActiveCommand(COMMAND_TYPES.ATTACK_MOVE);
      } else if (key === "h") {
        setActiveCommand(COMMAND_TYPES.HARVEST);
      } else if (key === "p") {
        togglePossession();
      } else if (key === "escape") {
        state.systems.commandDirector.clearSelection(state);
        state.ui.statusText = "Selection cleared.";
      }
    });
    window.addEventListener("keyup", (event) => {
      state.input.keyboard[event.key.toLowerCase()] = false;
      if (event.code === "Space") {
        state.input.keyboard.space = false;
      }
    });
  }
  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    state.input.pointer.screenX = (event.clientX - rect.left) * scaleX;
    state.input.pointer.screenY = (event.clientY - rect.top) * scaleY;
    state.input.pointer.worldX = state.input.pointer.screenX / state.camera.zoom + state.camera.x;
    state.input.pointer.worldY = state.input.pointer.screenY / state.camera.zoom + state.camera.y;
  }
  function commitPointSelection() {
    const hit = findTopEntityAtWorldPoint(state.input.pointer.worldX, state.input.pointer.worldY);
    if (!hit) {
      state.systems.commandDirector.clearSelection(state);
      state.ui.statusText = "Selection cleared.";
      return;
    }
    if (hit.entityType === "unit" && hit.team === TEAM_IDS.PLAYER) {
      selectEntityIds(state, [hit.id]);
      state.systems.commandDirector.possessUnit(state, hit.id);
      state.ui.statusText = `Possessing ${hit.unitType}. WASD or arrows override its decision tree.`;
      pushEvent(state, `Possession linked to ${hit.id}.`);
      return;
    }
    if (state.selection.possessionTargetId) {
      state.systems.commandDirector.releasePossession(state);
    }
    selectEntityIds(state, [hit.id]);
    state.ui.statusText = `${hit.team === TEAM_IDS.ENEMY ? "Enemy" : "Neutral"} ${describeEntity(hit)} selected.`;
  }
  function issueContextCommand() {
    if (!state.selection.selectedIds.length) {
      state.ui.statusText = "Select units before issuing orders.";
      return;
    }
    const resourceHit = findTargetAtWorldPoint(state.input.pointer.worldX, state.input.pointer.worldY, "resource");
    const currentCommand = state.commandState.activeCommandId;
    if (resourceHit && (currentCommand === COMMAND_TYPES.HARVEST || selectionHasMiner())) {
      state.systems.commandDirector.issueHarvest(state, resourceHit.id);
      state.ui.statusText = `Harvest command issued to ${resourceHit.id}.`;
      pushEvent(state, `Harvest route staged for ${resourceHit.id}.`);
      return;
    }
    if (currentCommand === COMMAND_TYPES.ATTACK_MOVE) {
      state.systems.commandDirector.issueAttackMove(state, {
        x: state.input.pointer.worldX,
        y: state.input.pointer.worldY
      });
      state.ui.statusText = "Attack-move order issued.";
      pushEvent(state, "Attack-move order issued.");
      return;
    }
    state.systems.commandDirector.issueMove(state, {
      x: state.input.pointer.worldX,
      y: state.input.pointer.worldY
    });
    state.ui.statusText = "Move order issued.";
    pushEvent(state, "Move order issued.");
  }
  function processOrderQueue() {
    var _a, _b;
    const queue = state.commandState.orderQueue;
    if (!queue.length) {
      return;
    }
    while (queue.length) {
      const order = queue.shift();
      const units = order.unitIds.map((id) => getEntityById(state, id)).filter((unit) => unit && unit.entityType === "unit");
      if (!units.length) {
        continue;
      }
      if (order.type === COMMAND_TYPES.MOVE || order.type === COMMAND_TYPES.ATTACK_MOVE) {
        state.formations.anchors[order.team] = {
          x: clamp2(order.target.x, 260, WORLD_DIMENSIONS.width - 260),
          y: clamp2(order.target.y, WORLD_DIMENSIONS.mineLaneY - 90, WORLD_DIMENSIONS.groundY - 20)
        };
      }
      for (const unit of units) {
        unit.command.type = order.type;
        unit.command.target = (_a = order.target) != null ? _a : unit.command.target;
        unit.command.targetEntityId = (_b = order.targetEntityId) != null ? _b : null;
        if (order.type === COMMAND_TYPES.HARVEST) {
          unit.mining.targetResourceId = order.targetEntityId;
        }
      }
    }
  }
  function solveFormations(dt) {
    const worldSnapshot = {
      ...state.world,
      units: state.units,
      delta: dt
    };
    for (const team of [TEAM_IDS.PLAYER, TEAM_IDS.ENEMY]) {
      const teamUnits = state.units.filter((unit) => unit.team === team);
      computeFormationTargets(
        {
          units: teamUnits,
          team,
          anchorPoint: state.formations.anchors[team]
        },
        worldSnapshot,
        state.formations.anchors[team]
      );
    }
    const enemyAnchor = state.formations.anchors[TEAM_IDS.ENEMY];
    enemyAnchor.x = Math.max(640, enemyAnchor.x - dt * 26);
    enemyAnchor.y = WORLD_DIMENSIONS.mineLaneY;
    state.formations.lastSolvedAt = state.clock.elapsed;
  }
  function simulateUnits(dt) {
    var _a;
    for (const unit of state.units) {
      unit.combat.cooldown = Math.max(0, ((_a = unit.combat.cooldown) != null ? _a : 0) - dt);
      if (unit.possession.active) {
        resolveUserControlledUnit(unit);
        continue;
      }
      resolveCommandLayer(unit);
      resolveAutonomousUnit(unit, dt);
    }
  }
  function resolveUserControlledUnit(unit) {
    const target = findNearestEnemyInRange(unit, unit.stats.range + 80);
    if ((state.input.keyboard.space || state.input.keyboard[" "]) && target) {
      attemptAttack(unit, target);
    }
  }
  function resolveCommandLayer(unit) {
    var _a, _b, _c;
    if (unit.command.type === COMMAND_TYPES.HARVEST && unit.mining.targetResourceId) {
      const node = getEntityById(state, unit.mining.targetResourceId);
      if ((node == null ? void 0 : node.alive) !== false && ((_a = node.resource) == null ? void 0 : _a.amount) > 0) {
        unit.intent = "harvest";
        unit.moveTarget = { x: node.position.x, y: node.position.y };
        unit.targetId = node.id;
        return;
      }
      unit.command.type = COMMAND_TYPES.MOVE;
      unit.command.targetEntityId = null;
    }
    if (unit.command.type === COMMAND_TYPES.MOVE) {
      unit.intent = "move";
      unit.moveTarget = (_b = unit.desiredPosition) != null ? _b : unit.command.target;
      return;
    }
    if (unit.command.type === COMMAND_TYPES.ATTACK_MOVE && !unit.attackTargetId) {
      unit.intent = "move";
      unit.moveTarget = (_c = unit.desiredPosition) != null ? _c : unit.command.target;
    }
  }
  function resolveAutonomousUnit(unit, dt) {
    var _a, _b, _c;
    const target = getEntityById(state, (_a = unit.attackTargetId) != null ? _a : unit.targetId);
    const enemyInRange = target && target.alive !== false && isEnemy2(unit, target);
    if (enemyInRange) {
      const distance = distanceBetween2(unit, target);
      if (distance <= unit.stats.range + ((_c = (_b = target.collision) == null ? void 0 : _b.radius) != null ? _c : 0)) {
        attemptAttack(unit, target);
        if (unit.unitType === UNIT_TYPES.ARCHIDON && distance < unit.stats.range * 0.75 && unit.desiredPosition) {
          moveUnitToward(unit, unit.desiredPosition, dt, 0.9);
        }
        return;
      }
      moveUnitToward(unit, target.position, dt);
      return;
    }
    if (unit.intent === "harvest" && unit.moveTarget) {
      moveUnitToward(unit, unit.moveTarget, dt, 0.75);
      return;
    }
    if (unit.moveTarget) {
      const arrived = moveUnitToward(unit, unit.moveTarget, dt);
      if (arrived && unit.command.type === COMMAND_TYPES.MOVE) {
        unit.command.type = COMMAND_TYPES.HOLD;
      }
    }
  }
  function drainGoldVeins(dt) {
    for (const miner of state.units.filter((unit) => unit.team === TEAM_IDS.PLAYER && unit.unitType === UNIT_TYPES.MINER)) {
      const node = getEntityById(state, miner.mining.targetResourceId);
      if (!node || node.alive === false || node.resource.amount <= 0) {
        continue;
      }
      if (distanceBetween2(miner, node) > 80) {
        continue;
      }
      node.resource.amount = Math.max(0, node.resource.amount - dt * 4.2);
      if (node.resource.amount === 0) {
        node.alive = false;
        miner.mining.targetResourceId = null;
        miner.command.type = COMMAND_TYPES.MOVE;
        pushEvent(state, `${node.id} depleted.`);
      }
    }
  }
  function cleanupDefeatedEntities() {
    var _a;
    for (const entity of [...state.entities.values()]) {
      if (!entity || entity.alive === false) {
        continue;
      }
      if (((_a = entity.stats) == null ? void 0 : _a.hp) > 0) {
        continue;
      }
      entity.alive = false;
      if (entity.entityType === "structure") {
        resolveBattle(entity.team === TEAM_IDS.PLAYER ? TEAM_IDS.ENEMY : TEAM_IDS.PLAYER);
        return;
      }
      unregisterEntity(state, entity.id);
      pushEvent(state, `${describeEntity(entity)} ${entity.id} eliminated.`);
    }
  }
  function resolveBattle(winner) {
    if (state.battle.winner) {
      return;
    }
    if (winner === TEAM_IDS.PLAYER) {
      setBattleResult(state, TEAM_IDS.PLAYER, "Victory", "Enemy statue destroyed. Your formation line broke the empire.");
      pushEvent(state, "Enemy statue destroyed.");
    } else {
      setBattleResult(state, TEAM_IDS.ENEMY, "Defeat", "Player statue destroyed. Your empire collapsed under siege.");
      pushEvent(state, "Player statue destroyed.");
    }
    state.clock.paused = true;
  }
  function processProductionQueue(dt) {
    const nextJob = state.production.queue[0];
    if (!nextJob) {
      return;
    }
    nextJob.progress += dt;
    if (nextJob.progress < nextJob.duration) {
      return;
    }
    state.production.queue.shift();
    spawnTrainedUnit(nextJob.team, nextJob.unitType);
  }
  function spawnTrainedUnit(team, unitType) {
    var _a;
    const statueId = team === TEAM_IDS.PLAYER ? state.battle.playerStatueId : state.battle.enemyStatueId;
    const statue = getEntityById(state, statueId);
    const facing = team === TEAM_IDS.PLAYER ? 1 : -1;
    const spawnY = WORLD_DIMENSIONS.mineLaneY - Math.random() * 26;
    const unit = createUnitEntity({
      team,
      unitType,
      x: ((_a = statue == null ? void 0 : statue.position.x) != null ? _a : team === TEAM_IDS.PLAYER ? 220 : WORLD_DIMENSIONS.width - 220) + facing * 120,
      y: spawnY
    });
    registerEntity(state, unit);
    if (team === TEAM_IDS.PLAYER) {
      selectEntityIds(state, [unit.id]);
      state.systems.commandDirector.possessUnit(state, unit.id);
      state.ui.statusText = `${unitType} deployed from the base-building HUD.`;
    } else {
      pushEvent(state, `Enemy reinforcement: ${unitType}.`);
    }
  }
  function processEnemyReinforcements(dt) {
    state.battle.enemyRecruitCooldown -= dt;
    if (state.battle.enemyRecruitCooldown > 0) {
      return;
    }
    const enemyCount = state.units.filter((unit) => unit.team === TEAM_IDS.ENEMY).length;
    if (enemyCount < 12) {
      const unitType = ENEMY_REINFORCEMENT_CYCLE[state.battle.enemyWaveIndex % ENEMY_REINFORCEMENT_CYCLE.length];
      state.battle.enemyWaveIndex += 1;
      spawnTrainedUnit(TEAM_IDS.ENEMY, unitType);
    }
    state.battle.enemyRecruitCooldown = 6.5;
  }
  function handleHudAction(scope, actionId) {
    if (scope === "build") {
      handleBuildAction(actionId);
      return;
    }
    if (actionId === COMMAND_TYPES.POSSESS) {
      togglePossession();
      return;
    }
    setActiveCommand(actionId);
  }
  function handleBuildAction(actionId) {
    if (actionId === "upgrade-pop-cap") {
      if (!state.systems.economySystem.canAfford(state, ECONOMY_COSTS.popCapUpgrade)) {
        state.ui.statusText = "Need more gold for PopCap upgrade.";
        return;
      }
      state.systems.economySystem.spend(state, ECONOMY_COSTS.popCapUpgrade);
      state.economy.popCap += ECONOMY_COSTS.popCapIncrease;
      pushEvent(state, `PopCap raised to ${state.economy.popCap}.`);
      state.ui.statusText = "Global economy expanded.";
      return;
    }
    const unitType = actionId === "build-miner" ? UNIT_TYPES.MINER : actionId === "build-swordwrath" ? UNIT_TYPES.SWORDWRATH : UNIT_TYPES.ARCHIDON;
    const result = state.systems.economySystem.queueOrReject(state, unitType);
    if (result.accepted) {
      pushEvent(state, `${unitType} training queued.`);
      state.ui.statusText = `${unitType} entering production.`;
      return;
    }
    state.ui.statusText = result.reason === "gold" ? `Need ${UNIT_STATS[unitType].cost} gold for ${unitType}.` : result.reason === "pop-cap" ? "Population capped. Raise PopCap first." : "Training rejected.";
  }
  function setActiveCommand(actionId) {
    state.ui.activeCommandId = actionId;
    state.commandState.activeCommandId = actionId;
    state.ui.statusText = `Active command set to ${actionId}.`;
  }
  function togglePossession() {
    if (state.selection.possessionTargetId) {
      state.systems.commandDirector.releasePossession(state);
      state.ui.statusText = "Possession released.";
      return;
    }
    if (state.selection.primaryId) {
      const unit = getEntityById(state, state.selection.primaryId);
      if ((unit == null ? void 0 : unit.entityType) === "unit" && unit.team === TEAM_IDS.PLAYER) {
        state.systems.commandDirector.possessUnit(state, unit.id);
        state.ui.statusText = `Possessing ${unit.unitType}.`;
      }
    }
  }
  function attemptAttack(unit, target) {
    var _a;
    if (unit.combat.cooldown > 0) {
      return false;
    }
    target.stats.hp = Math.max(0, target.stats.hp - unit.stats.damage);
    const cadence = 1 / Math.max(0.15, unit.stats.attackSpeed * ((_a = unit.combat.attackSpeedMultiplier) != null ? _a : 1));
    unit.combat.cooldown = cadence;
    unit.render.facing = target.position.x < unit.position.x ? -1 : 1;
    return true;
  }
  function moveUnitToward(unit, targetPoint, dt, speedMultiplier = 1) {
    var _a;
    if (!targetPoint) {
      return true;
    }
    const dx = targetPoint.x - unit.position.x;
    const dy = targetPoint.y - unit.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 6) {
      unit.velocity.x = 0;
      unit.velocity.y = 0;
      return true;
    }
    const speed = ((_a = unit.stats.speed) != null ? _a : 0) * speedMultiplier;
    const step = Math.min(distance, speed * dt);
    unit.velocity.x = dx / distance * speed;
    unit.velocity.y = dy / distance * speed;
    unit.position.x = clamp2(unit.position.x + dx / distance * step, 80, WORLD_DIMENSIONS.width - 80);
    unit.position.y = clamp2(unit.position.y + dy / distance * step, WORLD_DIMENSIONS.mineLaneY - 140, WORLD_DIMENSIONS.groundY);
    if (Math.abs(dx) > 2) {
      unit.render.facing = dx < 0 ? -1 : 1;
    }
    return distance - step <= 6;
  }
  function findTopEntityAtWorldPoint(worldX, worldY) {
    var _a, _b;
    let best = null;
    let bestDistance = Infinity;
    for (const entity of listEntities(state, (candidate) => candidate.alive !== false)) {
      const distance = distanceToPoint(entity.position, { x: worldX, y: worldY });
      if (distance <= ((_b = (_a = entity.collision) == null ? void 0 : _a.selectionRadius) != null ? _b : 36) && distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }
  function findTargetAtWorldPoint(worldX, worldY, entityType) {
    var _a;
    return (_a = listEntities(state, (entity) => entity.entityType === entityType && entity.alive !== false).find((entity) => {
      var _a2, _b;
      return distanceToPoint(entity.position, { x: worldX, y: worldY }) <= ((_b = (_a2 = entity.collision) == null ? void 0 : _a2.selectionRadius) != null ? _b : 36);
    })) != null ? _a : null;
  }
  function findNearestEnemyInRange(unit, maxRange) {
    let best = null;
    let bestDistance = maxRange;
    for (const candidate of state.units) {
      if (!isEnemy2(unit, candidate)) {
        continue;
      }
      const distance = distanceBetween2(unit, candidate);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    for (const structure of state.structures) {
      if (!isEnemy2(unit, structure)) {
        continue;
      }
      const distance = distanceBetween2(unit, structure);
      if (distance < bestDistance) {
        best = structure;
        bestDistance = distance;
      }
    }
    return best;
  }
  function selectionHasMiner() {
    return state.selection.selectedIds.some((id) => {
      var _a;
      return ((_a = getEntityById(state, id)) == null ? void 0 : _a.unitType) === UNIT_TYPES.MINER;
    });
  }
  function getTeamPopulation(worldState, team) {
    return worldState.units.filter((unit) => unit.team === team).reduce((sum, unit) => {
      var _a;
      return sum + ((_a = unit.stats.populationCost) != null ? _a : 0);
    }, 0);
  }
  function countQueuePopulation(queue) {
    return queue.reduce((sum, item) => {
      var _a;
      return sum + ((_a = item.popCost) != null ? _a : 0);
    }, 0);
  }
  function isEnemy2(unit, entity) {
    return Boolean(entity) && entity.team !== unit.team && entity.team !== TEAM_IDS.NEUTRAL;
  }
  function describeEntity(entity) {
    var _a, _b, _c;
    return (_c = (_b = (_a = entity.unitType) != null ? _a : entity.structureType) != null ? _b : entity.resourceType) != null ? _c : entity.entityType;
  }
  function distanceBetween2(left, right) {
    return distanceToPoint(left.position, right.position);
  }
  function distanceToPoint(left, right) {
    var _a, _b, _c, _d;
    return Math.hypot(((_a = left == null ? void 0 : left.x) != null ? _a : 0) - ((_b = right == null ? void 0 : right.x) != null ? _b : 0), ((_c = left == null ? void 0 : left.y) != null ? _c : 0) - ((_d = right == null ? void 0 : right.y) != null ? _d : 0));
  }
  function clamp2(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
