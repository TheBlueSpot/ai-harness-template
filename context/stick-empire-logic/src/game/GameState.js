import {
  COMMAND_TYPES,
  ECONOMY_DEFAULTS,
  GAME_TITLE,
  HUD_BUILD_ACTIONS,
  HUD_COMMAND_ACTIONS,
  SYSTEM_MODULE_SPECS,
  TEAM_IDS,
  WORLD_DIMENSIONS,
} from "./config.js";

let entitySequence = 0;

export function createEntityId(prefix = "entity") {
  entitySequence += 1;
  return `${prefix}-${String(entitySequence).padStart(4, "0")}`;
}

export function createInitialGameState() {
  return {
    meta: {
      title: GAME_TITLE,
      scaffoldId: "setup-1",
    },
    clock: {
      elapsed: 0,
      delta: 0,
      frame: 0,
      paused: false,
    },
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    world: {
      width: WORLD_DIMENSIONS.width,
      height: WORLD_DIMENSIONS.height,
      groundY: WORLD_DIMENSIONS.groundY,
      frontLineX: WORLD_DIMENSIONS.frontLineX,
    },
    economy: {
      gold: ECONOMY_DEFAULTS.startingGold,
      goldRate: ECONOMY_DEFAULTS.goldRate,
      population: ECONOMY_DEFAULTS.population,
      popCap: ECONOMY_DEFAULTS.popCap,
      popUsed: ECONOMY_DEFAULTS.population,
      queuePopulation: 0,
    },
    battle: {
      playerStatueId: "player-statue",
      enemyStatueId: "enemy-statue",
      winner: null,
      winScreen: null,
      enemyRecruitCooldown: 7,
      enemyWaveIndex: 0,
    },
    selection: {
      box: null,
      selectedIds: [],
      primaryId: null,
      hoveredId: null,
      possessionTargetId: null,
    },
    input: {
      pointer: {
        down: false,
        dragging: false,
        screenX: 0,
        screenY: 0,
        worldX: 0,
        worldY: 0,
      },
      keyboard: {},
    },
    ui: {
      statusText:
        "Hold the line: mine gold, queue a fighter, then drag-select units and click one to possess it.",
      buildMenu: HUD_BUILD_ACTIONS.map((action) => ({ ...action })),
      commandMenu: HUD_COMMAND_ACTIONS.map((action) => ({ ...action })),
      eventFeed: [
        "Quick start: M, F, and H swap build orders without leaving the battlefield.",
        "Objective: keep the statue standing while your miners fund the push.",
      ],
      activeCommandId: COMMAND_TYPES.MOVE,
      overlay: {
        visible: false,
        title: "Battle resolved",
        body: "One empire has fallen.",
      },
    },
    commandState: {
      activeCommandId: COMMAND_TYPES.MOVE,
      orderQueue: [],
      lastIssuedAt: 0,
    },
    production: {
      queue: [],
    },
    formations: {
      anchors: {
        [TEAM_IDS.PLAYER]: { x: 360, y: WORLD_DIMENSIONS.mineLaneY },
        [TEAM_IDS.ENEMY]: { x: WORLD_DIMENSIONS.width - 360, y: WORLD_DIMENSIONS.mineLaneY },
      },
      lastSolvedAt: 0,
    },
    systems: {
      specs: SYSTEM_MODULE_SPECS,
      unitAI: null,
      economySystem: null,
      commandDirector: null,
      formationLogic: null,
    },
    entities: new Map(),
    entityIds: [],
    units: [],
    resourceNodes: [],
    structures: [],
    references: {
      units: [],
      resources: [],
      structures: [],
    },
  };
}

export function registerEntity(state, entity) {
  state.entities.set(entity.id, entity);
  if (!state.entityIds.includes(entity.id)) {
    state.entityIds.push(entity.id);
  }

  if (entity.entityType === "unit" && !state.references.units.includes(entity.id)) {
    state.references.units.push(entity.id);
  }
  if (entity.entityType === "resource" && !state.references.resources.includes(entity.id)) {
    state.references.resources.push(entity.id);
  }
  if (entity.entityType === "structure" && !state.references.structures.includes(entity.id)) {
    state.references.structures.push(entity.id);
  }

  return entity;
}

export function unregisterEntity(state, entityId) {
  const entity = state.entities.get(entityId);
  if (!entity) {
    return null;
  }

  state.entities.delete(entityId);
  state.entityIds = state.entityIds.filter((id) => id !== entityId);
  state.references.units = state.references.units.filter((id) => id !== entityId);
  state.references.resources = state.references.resources.filter((id) => id !== entityId);
  state.references.structures = state.references.structures.filter((id) => id !== entityId);
  state.selection.selectedIds = state.selection.selectedIds.filter((id) => id !== entityId);

  if (state.selection.primaryId === entityId) {
    state.selection.primaryId = state.selection.selectedIds[0] ?? null;
  }
  if (state.selection.possessionTargetId === entityId) {
    state.selection.possessionTargetId = null;
  }

  return entity;
}

export function getEntityById(state, entityId) {
  return state.entities.get(entityId) ?? null;
}

export function listEntities(state, predicate = () => true) {
  return state.entityIds
    .map((id) => state.entities.get(id))
    .filter((entity) => entity && predicate(entity));
}

export function selectEntityIds(state, entityIds) {
  const validIds = entityIds.filter((id) => state.entities.has(id));
  state.selection.selectedIds = validIds;
  state.selection.primaryId = validIds[0] ?? null;
  if (!validIds.includes(state.selection.possessionTargetId)) {
    state.selection.possessionTargetId = null;
  }
}

export function pushEvent(state, message) {
  state.ui.eventFeed = [message, ...state.ui.eventFeed].slice(0, 6);
}

export function setBattleResult(state, winner, title, body) {
  state.battle.winner = winner;
  state.battle.winScreen = { title, body };
  state.ui.overlay.visible = true;
  state.ui.overlay.title = title;
  state.ui.overlay.body = body;
}
