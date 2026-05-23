import { TEAM_IDS, UNIT_STATS, UNIT_TYPES } from "../game/config.js";

function getPlayerUnits(state) {
  return (state.references?.units ?? [])
    .map((id) => state.entities.get(id))
    .filter((unit) => unit && unit.entityType === "unit" && unit.team === TEAM_IDS.PLAYER && unit.alive !== false);
}

function getPlayerResourceNodes(state) {
  if (Array.isArray(state.resourceNodes) && state.resourceNodes.length && typeof state.resourceNodes[0] === "object") {
    return state.resourceNodes.filter((node) => node && node.entityType === "resource" && node.alive !== false);
  }

  const resourceIds = state.references?.resources ?? [];
  return resourceIds.map((id) => state.entities.get(id)).filter((node) => node && node.entityType === "resource" && node.alive !== false);
}

function isMinerAssignedToVein(unit, resourceNodes) {
  if (unit.unitType !== UNIT_TYPES.MINER) {
    return false;
  }

  const targetId = unit.mining?.targetResourceId ?? unit.ai?.targetEntityId ?? null;
  if (!targetId) {
    return false;
  }

  const vein = resourceNodes.find((node) => node.id === targetId);
  return Boolean(vein && vein.resource?.amount > 0);
}

function countQueuedPopulation(queue = []) {
  return queue.reduce((sum, entry) => {
    const popCost = entry?.popCost ?? UNIT_STATS[entry?.unitType]?.popCost ?? 0;
    return sum + popCost;
  }, 0);
}

export class EconomySystem {
  constructor(config = {}) {
    this.config = config;
  }

  tick(state, dt) {
    const economy = state.economy ?? (state.economy = {});
    const units = getPlayerUnits(state);
    const resourceNodes = getPlayerResourceNodes(state);
    const queue = state.production?.queue ?? [];

    const activeMiners = units.filter((unit) => isMinerAssignedToVein(unit, resourceNodes));
    const baseRate = Number(economy.baseGoldRate ?? this.config.baseGoldRate ?? economy.goldRate ?? 0);
    const minerYield = this.config.minerYield ?? 0.35;

    economy.baseGoldRate = baseRate;
    economy.goldRate = baseRate + activeMiners.length * minerYield;
    economy.population = units.reduce((sum, unit) => sum + (unit.stats?.populationCost ?? 0), 0);
    economy.queuePopulation = countQueuedPopulation(queue);
    economy.popUsed = economy.population + economy.queuePopulation;

    const goldIncome = economy.goldRate * Math.max(0, dt);
    economy.gold = Math.max(0, (economy.gold ?? 0) + goldIncome);

    return economy;
  }

  canAfford(state, cost) {
    return (state.economy?.gold ?? 0) >= cost;
  }

  spend(state, cost) {
    if (!this.canAfford(state, cost)) {
      return false;
    }

    state.economy.gold = Math.max(0, (state.economy.gold ?? 0) - cost);
    return true;
  }

  canTrain(state, unitType) {
    const stats = UNIT_STATS[unitType];
    if (!stats) {
      return false;
    }

    const economy = state.economy ?? {};
    const projectedPop = (economy.popUsed ?? economy.population ?? 0) + (stats.popCost ?? 0);

    return this.canAfford(state, stats.cost) && projectedPop <= (economy.popCap ?? 0);
  }

  queueOrReject(state, unitType) {
    const stats = UNIT_STATS[unitType];
    if (!stats) {
      return { accepted: false, reason: "unknown-unit" };
    }

    if (!this.canTrain(state, unitType)) {
      const economy = state.economy ?? {};
      if ((economy.popUsed ?? economy.population ?? 0) + (stats.popCost ?? 0) > (economy.popCap ?? 0)) {
        return { accepted: false, reason: "pop-cap" };
      }
      if (!this.canAfford(state, stats.cost)) {
        return { accepted: false, reason: "gold" };
      }
      return { accepted: false, reason: "rejected" };
    }

    state.production ??= { queue: [] };
    state.production.queue ??= [];
    state.production.queue.push({
      unitType,
      cost: stats.cost,
      popCost: stats.popCost ?? 0,
      duration: stats.trainTime ?? this.config.defaultTrainTime ?? 5,
      progress: 0,
      team: TEAM_IDS.PLAYER,
      queuedAt: state.clock?.elapsed ?? 0,
    });
    this.spend(state, stats.cost);
    state.economy.popUsed = (state.economy.popUsed ?? state.economy.population ?? 0) + (stats.popCost ?? 0);
    return { accepted: true, reason: "queued" };
  }
}

export function createEconomySystem(config) {
  return new EconomySystem(config);
}

export function updateEconomySystem(state, dt, system) {
  return (system ?? new EconomySystem()).tick(state, dt);
}
