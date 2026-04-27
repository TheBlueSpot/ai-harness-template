import {
  COMMAND_TYPES,
  ECONOMY_COSTS,
  ECONOMY_DEFAULTS,
  MULTI_SELECT,
  TEAM_IDS,
  UNIT_STATS,
  UNIT_TYPES,
  WORLD_DIMENSIONS,
} from "./game/config.js";
import {
  createInitialGameState,
  getEntityById,
  listEntities,
  pushEvent,
  registerEntity,
  selectEntityIds,
  setBattleResult,
  unregisterEntity,
} from "./game/GameState.js";
import { createSkirmishSeed, createUnitEntity } from "./game/EntityFactory.js";
import { EconomySystem } from "./core/EconomySystem.js";
import { computeFormationTargets } from "./core/FormationLogic.js";
import { tickUnitAI } from "./core/UnitAI.js";
import { CommandDirector } from "./core/CommandDirector.js";
import { Renderer } from "./render/Renderer.js";
import { HUD } from "./ui/HUD.js";

const canvas = document.getElementById("battlefield");
const renderer = new Renderer(canvas);
const hud = new HUD(document);
const ENEMY_REINFORCEMENT_CYCLE = [
  UNIT_TYPES.SWORDWRATH,
  UNIT_TYPES.ARCHIDON,
  UNIT_TYPES.SWORDWRATH,
  UNIT_TYPES.MINER,
];

let state = buildSeededState();
let lastFrame = performance.now();

hud.setHandlers({
  onAction: handleHudAction,
  onRestart: () => {
    state = buildSeededState();
  },
});

attachPointerInput();
attachKeyboardInput();
requestAnimationFrame(frame);

function buildSeededState() {
  const nextState = createInitialGameState();
  nextState.systems.economySystem = new EconomySystem({
    baseGoldRate: ECONOMY_DEFAULTS.goldRate,
    minerYield: 1.15,
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
  const dt = Math.min(1 / 20, (now - lastFrame) / 1000 || 0);
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
      y: state.input.pointer.screenY,
    });
    state.selection.box = {
      startX: state.input.pointer.screenX,
      startY: state.input.pointer.screenY,
      currentX: state.input.pointer.screenX,
      currentY: state.input.pointer.screenY,
    };
  });

  canvas.addEventListener("pointermove", (event) => {
    updatePointer(event);
    if (!state.input.pointer.down || !state.selection.box) {
      return;
    }

    state.systems.commandDirector.updateSelection({
      x: state.input.pointer.screenX,
      y: state.input.pointer.screenY,
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
        camera: state.camera,
      });
      state.ui.statusText = selected.length
        ? `Multi-select locked ${selected.length} unit(s).`
        : "Selection box clear.";
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
      y: state.input.pointer.worldY,
    });
    state.ui.statusText = "Attack-move order issued.";
    pushEvent(state, "Attack-move order issued.");
    return;
  }

  state.systems.commandDirector.issueMove(state, {
    x: state.input.pointer.worldX,
    y: state.input.pointer.worldY,
  });
  state.ui.statusText = "Move order issued.";
  pushEvent(state, "Move order issued.");
}

function processOrderQueue() {
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
        x: clamp(order.target.x, 260, WORLD_DIMENSIONS.width - 260),
        y: clamp(order.target.y, WORLD_DIMENSIONS.mineLaneY - 90, WORLD_DIMENSIONS.groundY - 20),
      };
    }

    for (const unit of units) {
      unit.command.type = order.type;
      unit.command.target = order.target ?? unit.command.target;
      unit.command.targetEntityId = order.targetEntityId ?? null;
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
    delta: dt,
  };

  for (const team of [TEAM_IDS.PLAYER, TEAM_IDS.ENEMY]) {
    const teamUnits = state.units.filter((unit) => unit.team === team);
    computeFormationTargets(
      {
        units: teamUnits,
        team,
        anchorPoint: state.formations.anchors[team],
      },
      worldSnapshot,
      state.formations.anchors[team],
    );
  }

  const enemyAnchor = state.formations.anchors[TEAM_IDS.ENEMY];
  enemyAnchor.x = Math.max(640, enemyAnchor.x - dt * 26);
  enemyAnchor.y = WORLD_DIMENSIONS.mineLaneY;
  state.formations.lastSolvedAt = state.clock.elapsed;
}

function simulateUnits(dt) {
  for (const unit of state.units) {
    unit.combat.cooldown = Math.max(0, (unit.combat.cooldown ?? 0) - dt);

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
  if (unit.command.type === COMMAND_TYPES.HARVEST && unit.mining.targetResourceId) {
    const node = getEntityById(state, unit.mining.targetResourceId);
    if (node?.alive !== false && node.resource?.amount > 0) {
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
    unit.moveTarget = unit.desiredPosition ?? unit.command.target;
    return;
  }

  if (unit.command.type === COMMAND_TYPES.ATTACK_MOVE && !unit.attackTargetId) {
    unit.intent = "move";
    unit.moveTarget = unit.desiredPosition ?? unit.command.target;
  }
}

function resolveAutonomousUnit(unit, dt) {
  const target = getEntityById(state, unit.attackTargetId ?? unit.targetId);
  const enemyInRange = target && target.alive !== false && isEnemy(unit, target);

  if (enemyInRange) {
    const distance = distanceBetween(unit, target);
    if (distance <= unit.stats.range + (target.collision?.radius ?? 0)) {
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

    if (distanceBetween(miner, node) > 80) {
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
  for (const entity of [...state.entities.values()]) {
    if (!entity || entity.alive === false) {
      continue;
    }

    if (entity.stats?.hp > 0) {
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
  const statueId = team === TEAM_IDS.PLAYER ? state.battle.playerStatueId : state.battle.enemyStatueId;
  const statue = getEntityById(state, statueId);
  const facing = team === TEAM_IDS.PLAYER ? 1 : -1;
  const spawnY = WORLD_DIMENSIONS.mineLaneY - Math.random() * 26;
  const unit = createUnitEntity({
    team,
    unitType,
    x: (statue?.position.x ?? (team === TEAM_IDS.PLAYER ? 220 : WORLD_DIMENSIONS.width - 220)) + facing * 120,
    y: spawnY,
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

  const unitType =
    actionId === "build-miner" ? UNIT_TYPES.MINER
    : actionId === "build-swordwrath" ? UNIT_TYPES.SWORDWRATH
    : UNIT_TYPES.ARCHIDON;
  const result = state.systems.economySystem.queueOrReject(state, unitType);
  if (result.accepted) {
    pushEvent(state, `${unitType} training queued.`);
    state.ui.statusText = `${unitType} entering production.`;
    return;
  }

  state.ui.statusText =
    result.reason === "gold" ? `Need ${UNIT_STATS[unitType].cost} gold for ${unitType}.`
    : result.reason === "pop-cap" ? "Population capped. Raise PopCap first."
    : "Training rejected.";
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
    if (unit?.entityType === "unit" && unit.team === TEAM_IDS.PLAYER) {
      state.systems.commandDirector.possessUnit(state, unit.id);
      state.ui.statusText = `Possessing ${unit.unitType}.`;
    }
  }
}

function attemptAttack(unit, target) {
  if (unit.combat.cooldown > 0) {
    return false;
  }

  target.stats.hp = Math.max(0, target.stats.hp - unit.stats.damage);
  const cadence = 1 / Math.max(0.15, unit.stats.attackSpeed * (unit.combat.attackSpeedMultiplier ?? 1));
  unit.combat.cooldown = cadence;
  unit.render.facing = target.position.x < unit.position.x ? -1 : 1;
  return true;
}

function moveUnitToward(unit, targetPoint, dt, speedMultiplier = 1) {
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

  const speed = (unit.stats.speed ?? 0) * speedMultiplier;
  const step = Math.min(distance, speed * dt);
  unit.velocity.x = (dx / distance) * speed;
  unit.velocity.y = (dy / distance) * speed;
  unit.position.x = clamp(unit.position.x + (dx / distance) * step, 80, WORLD_DIMENSIONS.width - 80);
  unit.position.y = clamp(unit.position.y + (dy / distance) * step, WORLD_DIMENSIONS.mineLaneY - 140, WORLD_DIMENSIONS.groundY);
  if (Math.abs(dx) > 2) {
    unit.render.facing = dx < 0 ? -1 : 1;
  }
  return distance - step <= 6;
}

function findTopEntityAtWorldPoint(worldX, worldY) {
  let best = null;
  let bestDistance = Infinity;

  for (const entity of listEntities(state, (candidate) => candidate.alive !== false)) {
    const distance = distanceToPoint(entity.position, { x: worldX, y: worldY });
    if (distance <= (entity.collision?.selectionRadius ?? 36) && distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }

  return best;
}

function findTargetAtWorldPoint(worldX, worldY, entityType) {
  return listEntities(state, (entity) => entity.entityType === entityType && entity.alive !== false)
    .find((entity) => distanceToPoint(entity.position, { x: worldX, y: worldY }) <= (entity.collision?.selectionRadius ?? 36)) ?? null;
}

function findNearestEnemyInRange(unit, maxRange) {
  let best = null;
  let bestDistance = maxRange;

  for (const candidate of state.units) {
    if (!isEnemy(unit, candidate)) {
      continue;
    }

    const distance = distanceBetween(unit, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  for (const structure of state.structures) {
    if (!isEnemy(unit, structure)) {
      continue;
    }

    const distance = distanceBetween(unit, structure);
    if (distance < bestDistance) {
      best = structure;
      bestDistance = distance;
    }
  }

  return best;
}

function selectionHasMiner() {
  return state.selection.selectedIds.some((id) => getEntityById(state, id)?.unitType === UNIT_TYPES.MINER);
}

function getTeamPopulation(worldState, team) {
  return worldState.units
    .filter((unit) => unit.team === team)
    .reduce((sum, unit) => sum + (unit.stats.populationCost ?? 0), 0);
}

function countQueuePopulation(queue) {
  return queue.reduce((sum, item) => sum + (item.popCost ?? 0), 0);
}

function isEnemy(unit, entity) {
  return Boolean(entity) && entity.team !== unit.team && entity.team !== TEAM_IDS.NEUTRAL;
}

function describeEntity(entity) {
  return entity.unitType ?? entity.structureType ?? entity.resourceType ?? entity.entityType;
}

function distanceBetween(left, right) {
  return distanceToPoint(left.position, right.position);
}

function distanceToPoint(left, right) {
  return Math.hypot((left?.x ?? 0) - (right?.x ?? 0), (left?.y ?? 0) - (right?.y ?? 0));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
