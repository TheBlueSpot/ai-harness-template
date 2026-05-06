import { FLOOR_METADATA, PASSENGER_ARCHETYPES, SCORE_RULES, SURGE_DEFINITIONS, TOWER_SCENARIO } from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value) => Math.round(value * 1000) / 1000;

export function createTowerScenario(overrides = {}) {
  const floors = overrides.floors ?? TOWER_SCENARIO.floors;
  const elevators = overrides.elevators ?? TOWER_SCENARIO.elevators;
  const floorLabels = TOWER_SCENARIO.floorLabels;
  return {
    ...TOWER_SCENARIO,
    ...overrides,
    floors,
    elevators,
    floorMetadata: Array.from({ length: floors }, (_, floor) => ({
      floor,
      label: floorLabels[floor] ?? `Floor ${floor}`,
      hub: floor === 0 || floor === floors - 1,
      demandBias: floor === 0 ? 0.35 : 1 + (floor % 4) * 0.18,
    })),
    passengerArchetypes: PASSENGER_ARCHETYPES.map((type) => ({ ...type })),
    surges: SURGE_DEFINITIONS.map((surge) => ({ ...surge })),
    scoreRules: { ...SCORE_RULES },
  };
}

export function createSimState(scenario = createTowerScenario()) {
  return {
    time: 0,
    score: 0,
    ridersServed: 0,
    surgesCleared: 0,
    phase: "play",
    helpOpen: false,
    selectedFloor: 2,
    selectedElevator: 0,
    surgeIndex: 0,
    surgeTimer: scenario.surges[0]?.interval ?? 20,
    alertTimer: 0,
    pressure: 0,
    towerOpen: false,
    dispatchesIssued: 0,
    message: "Warmup: clear Retail and Office first, then brace for the tower to open.",
    scenario,
    floors: scenario.floorMetadata.map((meta) => ({
      ...meta,
      queue: meta.floor === 0 ? 0 : floorSeedQueue(meta.floor),
      waitPressure: 0,
      callUp: meta.floor < scenario.floors - 1,
      callDown: meta.floor > 0,
      preferredDirection: meta.floor === 0 ? 1 : meta.floor === scenario.floors - 1 ? -1 : meta.floor % 2 === 0 ? 1 : -1,
      unlocked: meta.floor === 0 || meta.floor <= 4,
    })),
    elevators: Array.from({ length: scenario.elevators }, (_, id) => ({
      id,
      floor: round((id * (scenario.floors - 1)) / Math.max(1, scenario.elevators - 1)),
      target: 0,
      direction: 0,
      load: 0,
      capacity: scenario.basePassengerCap + id * 2,
      doorTimer: 0,
      dispatchTarget: null,
      passengers: [],
    })),
    terminal: null,
  };
}

export function getDispatchTargets(state) {
  return state.floors
    .filter((floor) => floor.queue > 0)
    .sort((a, b) => b.waitPressure - a.waitPressure || b.queue - a.queue)
    .map((floor) => floor.floor);
}

export function stepSim(state, commandState = {}, dt = 0.016) {
  if (state.phase !== "play") {
    if (commandState.restart) {
      const reset = createSimState(state.scenario);
      Object.assign(state, reset);
    }
    return state;
  }

  const scenario = state.scenario;
  state.time += dt;
  state.surgeTimer -= dt;
  state.alertTimer = Math.max(0, state.alertTimer - dt);
  state.pressure = 0;

  if (commandState.toggleHelp) state.helpOpen = !state.helpOpen;
  if (commandState.up) state.selectedFloor = Math.max(0, state.selectedFloor - 1);
  if (commandState.down) state.selectedFloor = Math.min(scenario.floors - 1, state.selectedFloor + 1);
  if (commandState.left) state.selectedElevator = Math.max(0, state.selectedElevator - 1);
  if (commandState.right) state.selectedElevator = Math.min(scenario.elevators - 1, state.selectedElevator + 1);

  if (!state.towerOpen && (state.dispatchesIssued > 0 || state.time >= 12)) {
    state.towerOpen = true;
    state.message = "Full tower is live. Keep the lobby cycling before the Atrium crush lands.";
  }

  const surge = scenario.surges[state.surgeIndex];
  const dispatchTargets = getDispatchTargets(state);
  const claimedTargets = new Set();

  for (const floor of state.floors) {
    if (floor.floor === 0) continue;
    floor.unlocked = isFloorUnlocked(state, floor.floor);
    if (!floor.unlocked) {
      floor.queue = 0;
      floor.waitPressure = 0;
      floor.callUp = false;
      floor.callDown = false;
      continue;
    }
    const baseDemand = surge.queueRate ?? 1;
    const surgeBoost = floor.floor === surge.floor ? surge.pressure : baseDemand;
    floor.waitPressure = round(floor.waitPressure + dt * scenario.floorMetadata[floor.floor].demandBias * surgeBoost * 0.32);
    floor.queue = clamp(round(floor.queue + dt * (0.2 * baseDemand + floor.waitPressure * 0.05)), 0, scenario.maxQueue);
    floor.callUp = floor.floor < scenario.floors - 1 && floor.queue > 0;
    floor.callDown = floor.floor > 0 && floor.queue > 0;
    state.pressure += (floor.queue / scenario.maxQueue) * SCORE_RULES.pressurePerQueue;
  }

  if (state.surgeTimer <= 0) {
    state.surgesCleared += 1;
    state.alertTimer = 2.5;
    if (state.surgeIndex < scenario.surges.length - 1) {
      state.surgeIndex += 1;
      state.surgeTimer = scenario.surges[state.surgeIndex].interval;
      const nextSurge = scenario.surges[state.surgeIndex];
      const nextFloorLabel =
        scenario.floorMetadata[nextSurge.floor]?.label ?? `Floor ${nextSurge.floor}`;
      state.message = `${nextSurge.label} is live on ${nextFloorLabel}.`;
    } else {
      state.surgeTimer = scenario.surges[state.surgeIndex].interval;
      state.message = "Final pressure is live. Clear the last loads and keep the roof from overflowing.";
    }
  }

  if (commandState.confirm) {
    const targetFloor = state.floors[state.selectedFloor];
    const elevator = state.elevators[state.selectedElevator];
    if (targetFloor && elevator) {
      if (!targetFloor.unlocked) {
        state.message = `${targetFloor.label} is still locked. Hold lower floors until the tower opens.`;
        return state;
      }
      elevator.dispatchTarget = targetFloor.floor;
      elevator.target = targetFloor.floor;
      elevator.doorTimer = Math.min(elevator.doorTimer, 0.15);
      targetFloor.waitPressure = Math.max(targetFloor.waitPressure, 1);
      state.dispatchesIssued += 1;
      if (!state.towerOpen) {
        state.towerOpen = true;
      }
      state.message = `Elevator ${elevator.id + 1} routed to ${targetFloor.label}`;
    }
  }

    for (const elevator of state.elevators) {
      const target = chooseElevatorTarget(state, elevator, dispatchTargets, claimedTargets);
      claimedTargets.add(target);
      elevator.target = target;
      const delta = target - elevator.floor;
      const stepSize = dt * (1.42 + elevator.load * 0.04);
      elevator.direction = Math.sign(delta);

      if (Math.abs(delta) > 0.02) {
        if (Math.abs(delta) <= stepSize) {
          elevator.floor = target;
        } else {
          elevator.floor = clamp(round(elevator.floor + elevator.direction * stepSize), 0, scenario.floors - 1);
          elevator.doorTimer = Math.max(0, elevator.doorTimer - dt);
          continue;
        }
      }

      elevator.floor = target;
    elevator.direction = 0;
    elevator.doorTimer = 0.45;
    serviceFloor(state, elevator);
  }

  if (state.floors.some((floor) => floor.queue >= SCORE_RULES.failQueue)) {
    state.phase = "fail";
    state.terminal = "queue_overflow";
    state.message = "A floor overflowed. The tower stalled.";
    } else if (
      state.surgesCleared >= SCORE_RULES.clearSurges
      && state.score >= SCORE_RULES.clearScore
      && state.ridersServed >= SCORE_RULES.clearServed
    ) {
      state.phase = "win";
      state.terminal = "stabilized";
      state.message = "Tower stabilized. Shift complete.";
    }

  if (commandState.restart) {
    const reset = createSimState(state.scenario);
    Object.assign(state, reset);
  }

  return state;
}

function chooseElevatorTarget(state, elevator, dispatchTargets, claimedTargets) {
  if (typeof elevator.dispatchTarget === "number") {
    return elevator.dispatchTarget;
  }
  if (elevator.load > 0) {
    return 0;
  }
  const activeCalls = dispatchTargets.filter((floor) => !claimedTargets.has(floor));
  if (activeCalls.length > 0) {
    const nextFloor = activeCalls[0];
    const label = state.scenario.floorMetadata[nextFloor]?.label ?? `Floor ${nextFloor}`;
    state.message = state.towerOpen
      ? `Queues are building on ${label}. Pick a car, then confirm a dispatch.`
      : `${label} is the warmup lane. Send one car there, then the full tower unlocks.`;
  }
  return elevator.floor;
}

function serviceFloor(state, elevator) {
  const floor = state.floors[Math.round(elevator.floor)];
  if (!floor) return;
  const dispatchedHere = elevator.dispatchTarget === floor.floor;

  if (elevator.load > 0 && floor.floor === 0) {
    state.ridersServed += elevator.load;
    state.score += elevator.load * SCORE_RULES.servicePoints;
    state.message = `${elevator.load} riders cleared through the lobby. Shift progress ${state.ridersServed}/${SCORE_RULES.clearServed}.`;
    elevator.load = 0;
    elevator.passengers.length = 0;
  }

  const availableSpace = Math.max(0, elevator.capacity - elevator.load);
  if (availableSpace <= 0 || floor.floor === 0) return;
  if (!dispatchedHere) return;
  if (elevator.direction !== 0 && elevator.direction !== floor.preferredDirection) return;

  const boarding = Math.min(availableSpace, Math.max(1, Math.ceil(floor.queue * 0.35)));
  const boarded = spawnPassengers(floor, boarding);
  elevator.load += boarded.length;
  elevator.passengers.push(...boarded);
  floor.queue = Math.max(0, round(floor.queue - boarded.length));
  floor.waitPressure = Math.max(0, round(floor.waitPressure - boarded.length * 0.25));
  if (boarded.length > 0) {
    state.message = `${boarded.length} riders boarded on ${floor.label}`;
  }
  elevator.dispatchTarget = null;
}

function floorSeedQueue(floor) {
  if (floor <= 2) return 2;
  if (floor === 3 || floor === 4) return 1;
  return 0;
}

function isFloorUnlocked(state, floor) {
  if (floor === 0) return true;
  if (state.towerOpen) return true;
  return floor <= 4;
}

function spawnPassengers(floor, count) {
  const desiredDirection = floor.preferredDirection;
  const archetype = PASSENGER_ARCHETYPES[(floor.floor + count) % PASSENGER_ARCHETYPES.length];
  return Array.from({ length: count }, (_, index) => ({
    id: `${floor.floor}-${index}-${Math.floor(floor.queue)}`,
    archetype: archetype.id,
    direction: desiredDirection,
    patience: archetype.patience,
    load: archetype.load,
  }));
}
