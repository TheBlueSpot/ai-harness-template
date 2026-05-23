(() => {
  // simtower-elevator-ops/src/data.js
  var TOWER_SCENARIO = {
    title: "SimTower Elevator Ops",
    floors: 10,
    elevators: 3,
    maxQueue: 28,
    basePassengerCap: 8,
    floorHeight: 1,
    floorLabels: ["Lobby", "Retail", "Office", "Atrium", "Clinic", "Lab", "Club", "Penthouse", "Sky Deck", "Roof"]
  };
  var PASSENGER_ARCHETYPES = [
    { id: "commuter", label: "Commuter", preferredDirection: 1, patience: 1, load: 1, boardBias: 1 },
    { id: "visitor", label: "Visitor", preferredDirection: 1, patience: 0.85, load: 1, boardBias: 0.8 },
    { id: "service", label: "Service", preferredDirection: -1, patience: 1.15, load: 2, boardBias: 1.1 }
  ];
  var FLOOR_METADATA = Array.from({ length: TOWER_SCENARIO.floors }, (_, floor) => ({
    floor,
    label: TOWER_SCENARIO.floorLabels[floor] ?? `Floor ${floor}`,
    hub: floor === 0 || floor === TOWER_SCENARIO.floors - 1,
    demandBias: floor === 0 ? 0.35 : 1 + floor % 4 * 0.18
  }));
  var SURGE_DEFINITIONS = [
    {
      id: "warmup",
      label: "Warmup lane",
      floor: 2,
      interval: 18,
      pressure: 1.15,
      queueRate: 0.7,
      coach: "Clear the lower floors first so the dispatch pattern reads before the full tower opens."
    },
    {
      id: "atrium",
      label: "Atrium crush",
      floor: 4,
      interval: 20,
      pressure: 1.55,
      queueRate: 0.95,
      coach: "Full tower is live now. Keep one car feeding the lobby while another shadows the active surge floor."
    },
    {
      id: "roof",
      label: "Roof spill",
      floor: 8,
      interval: 22,
      pressure: 1.95,
      queueRate: 1.15,
      coach: "Late shift pressure climbs at the top of the tower. Clear loaded cars fast before the roof stacks up."
    }
  ];
  var SCORE_RULES = {
    servicePoints: 8,
    pressurePerQueue: 0.28,
    failQueue: 28,
    clearScore: 432,
    clearServed: 72,
    clearSurges: 3
  };

  // simtower-elevator-ops/src/sim.js
  var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  var round = (value) => Math.round(value * 1000) / 1000;
  function createTowerScenario(overrides = {}) {
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
        demandBias: floor === 0 ? 0.35 : 1 + floor % 4 * 0.18
      })),
      passengerArchetypes: PASSENGER_ARCHETYPES.map((type) => ({ ...type })),
      surges: SURGE_DEFINITIONS.map((surge) => ({ ...surge })),
      scoreRules: { ...SCORE_RULES }
    };
  }
  function createSimState(scenario = createTowerScenario()) {
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
        unlocked: meta.floor === 0 || meta.floor <= 4
      })),
      elevators: Array.from({ length: scenario.elevators }, (_, id) => ({
        id,
        floor: round(id * (scenario.floors - 1) / Math.max(1, scenario.elevators - 1)),
        target: 0,
        direction: 0,
        load: 0,
        capacity: scenario.basePassengerCap + id * 2,
        doorTimer: 0,
        dispatchTarget: null,
        passengers: []
      })),
      terminal: null
    };
  }
  function getDispatchTargets(state) {
    return state.floors.filter((floor) => floor.queue > 0).sort((a, b) => b.waitPressure - a.waitPressure || b.queue - a.queue).map((floor) => floor.floor);
  }
  function stepSim(state, commandState = {}, dt = 0.016) {
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
    if (commandState.toggleHelp)
      state.helpOpen = !state.helpOpen;
    if (commandState.up)
      state.selectedFloor = Math.max(0, state.selectedFloor - 1);
    if (commandState.down)
      state.selectedFloor = Math.min(scenario.floors - 1, state.selectedFloor + 1);
    if (commandState.left)
      state.selectedElevator = Math.max(0, state.selectedElevator - 1);
    if (commandState.right)
      state.selectedElevator = Math.min(scenario.elevators - 1, state.selectedElevator + 1);
    if (!state.towerOpen && (state.dispatchesIssued > 0 || state.time >= 12)) {
      state.towerOpen = true;
      state.message = "Full tower is live. Keep the lobby cycling before the Atrium crush lands.";
    }
    const surge = scenario.surges[state.surgeIndex];
    const dispatchTargets = getDispatchTargets(state);
    const claimedTargets = new Set;
    for (const floor of state.floors) {
      if (floor.floor === 0)
        continue;
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
      state.pressure += floor.queue / scenario.maxQueue * SCORE_RULES.pressurePerQueue;
    }
    if (state.surgeTimer <= 0) {
      state.surgesCleared += 1;
      state.alertTimer = 2.5;
      if (state.surgeIndex < scenario.surges.length - 1) {
        state.surgeIndex += 1;
        state.surgeTimer = scenario.surges[state.surgeIndex].interval;
        const nextSurge = scenario.surges[state.surgeIndex];
        const nextFloorLabel = scenario.floorMetadata[nextSurge.floor]?.label ?? `Floor ${nextSurge.floor}`;
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
    } else if (state.surgesCleared >= SCORE_RULES.clearSurges && state.score >= SCORE_RULES.clearScore && state.ridersServed >= SCORE_RULES.clearServed) {
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
      state.message = state.towerOpen ? `Queues are building on ${label}. Pick a car, then confirm a dispatch.` : `${label} is the warmup lane. Send one car there, then the full tower unlocks.`;
    }
    return elevator.floor;
  }
  function serviceFloor(state, elevator) {
    const floor = state.floors[Math.round(elevator.floor)];
    if (!floor)
      return;
    const dispatchedHere = elevator.dispatchTarget === floor.floor;
    if (elevator.load > 0 && floor.floor === 0) {
      state.ridersServed += elevator.load;
      state.score += elevator.load * SCORE_RULES.servicePoints;
      state.message = `${elevator.load} riders cleared through the lobby. Shift progress ${state.ridersServed}/${SCORE_RULES.clearServed}.`;
      elevator.load = 0;
      elevator.passengers.length = 0;
    }
    const availableSpace = Math.max(0, elevator.capacity - elevator.load);
    if (availableSpace <= 0 || floor.floor === 0)
      return;
    if (!dispatchedHere)
      return;
    if (elevator.direction !== 0 && elevator.direction !== floor.preferredDirection)
      return;
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
    if (floor <= 2)
      return 2;
    if (floor === 3 || floor === 4)
      return 1;
    return 0;
  }
  function isFloorUnlocked(state, floor) {
    if (floor === 0)
      return true;
    if (state.towerOpen)
      return true;
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
      load: archetype.load
    }));
  }

  // simtower-elevator-ops/src/Game.js
  function normalizeUpdateArgs(first, second) {
    if (typeof first === "number") {
      return { dt: first, input: second ?? {} };
    }
    return { dt: second ?? 0.016, input: first ?? {} };
  }
  function createCommandState(input = {}) {
    return {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      confirm: Boolean(input.confirm),
      restart: Boolean(input.restart),
      toggleHelp: Boolean(input.toggleHelp)
    };
  }

  class Game {
    constructor(config = {}) {
      this.scenario = createTowerScenario(config);
      this.width = 0;
      this.height = 0;
      this.mode = "menu";
      this.state = createSimState(this.scenario);
      this.frame = this.buildFrame();
    }
    start() {
      this.mode = "play";
      this.state = createSimState(this.scenario);
      this.frame = this.buildFrame();
      return this;
    }
    restart() {
      return this.start();
    }
    resize(width, height) {
      this.width = width;
      this.height = height;
      return this;
    }
    update(first, second) {
      const { dt, input } = normalizeUpdateArgs(first, second);
      const commandState = createCommandState(input);
      if (this.mode === "menu") {
        if (commandState.toggleHelp)
          this.state.helpOpen = !this.state.helpOpen;
        if (commandState.confirm || commandState.restart)
          this.start();
        this.frame = this.buildFrame();
        return this.frame;
      }
      if (commandState.restart && this.mode !== "play") {
        this.restart();
        return this.frame;
      }
      stepSim(this.state, commandState, dt);
      if (this.state.phase === "fail") {
        this.mode = "lose";
      } else if (this.state.phase === "win") {
        this.mode = "win";
      } else {
        this.mode = "play";
      }
      this.frame = this.buildFrame();
      return this.frame;
    }
    getFrameState() {
      return this.frame ?? this.buildFrame();
    }
    buildFrame() {
      const phase = this.mode === "menu" ? "menu" : this.state.phase;
      const surge = this.scenario.surges[this.state.surgeIndex] ?? this.scenario.surges[0];
      const overlay = this.createOverlay(phase);
      const busiestFloor = this.state.floors.filter((floor) => floor.floor !== 0).sort((left, right) => right.waitPressure - left.waitPressure || right.queue - left.queue)[0] ?? this.state.floors[1];
      const selectedFloor = this.state.floors[this.state.selectedFloor];
      const selectedElevator = this.state.elevators[this.state.selectedElevator];
      const dispatchHotspot = !this.state.towerOpen ? "Warmup is live on the lower tower. Retail, Office, Atrium, and Clinic are the only active calls." : busiestFloor && busiestFloor.queue > 0 ? `${busiestFloor.label} has ${Math.max(1, Math.ceil(busiestFloor.queue))} waiting.` : "No floor is backed up yet. Hold the cars for the next call.";
      const selectionStep = busiestFloor && selectedFloor ? !selectedFloor.unlocked ? `${selectedFloor.label} is still locked. Stay on the lower floors until the full tower opens.` : busiestFloor.floor === selectedFloor.floor ? `Press Enter to send elevator ${selectedElevator?.id + 1 ?? 1} now.` : busiestFloor.floor > selectedFloor.floor ? `Press Down ${busiestFloor.floor - selectedFloor.floor} time${busiestFloor.floor - selectedFloor.floor === 1 ? "" : "s"} to line up the hot floor.` : `Press Up ${selectedFloor.floor - busiestFloor.floor} time${selectedFloor.floor - busiestFloor.floor === 1 ? "" : "s"} to line up the hot floor.` : "Pick a floor, pick a car, then confirm.";
      return {
        mode: phase === "fail" ? "lose" : phase,
        phase,
        width: this.width,
        height: this.height,
        headline: overlay.title ?? "Keep the shafts flowing",
        overlay,
        hud: {
          score: Math.floor(this.state.score),
          ridersServed: this.state.ridersServed,
          surgesCleared: this.state.surgesCleared,
          pressure: Math.round(this.state.pressure * 100),
          message: this.state.message,
          surgeLabel: surge?.label ?? "Active surge",
          surgeFloor: surge?.floor ?? 0,
          surgeCountdown: Math.max(0, Math.ceil(this.state.surgeTimer)),
          phaseLabel: !this.state.towerOpen ? "Warmup shift" : this.state.surgesCleared >= 2 ? "Late tower" : "Full tower",
          clearTargetServed: this.scenario.scoreRules.clearServed,
          clearTargetSurges: this.scenario.scoreRules.clearSurges
        },
        coach: {
          objective: !this.state.towerOpen ? "Warmup: dispatch the lower-floor queues cleanly so the tower expansion makes sense instead of spiking all at once." : `Clear ${this.scenario.scoreRules.clearServed} riders and hold ${this.scenario.scoreRules.clearSurges} shifts without letting any queue hit ${this.scenario.scoreRules.failQueue}.`,
          hotspot: dispatchHotspot,
          dispatch: selectionStep,
          phaseCoach: surge?.coach ?? "Keep one elevator moving and one elevator ready for the next hotspot.",
          selectedFloorLabel: selectedFloor?.label ?? `Floor ${this.state.selectedFloor}`,
          selectedFloorQueue: selectedFloor ? Math.max(0, Math.ceil(selectedFloor.queue)) : 0,
          selectedElevatorFloor: selectedElevator ? Math.round(selectedElevator.floor) : 0,
          selectedElevatorLoad: selectedElevator ? Math.round(selectedElevator.load) : 0
        },
        selectedFloor: this.state.selectedFloor,
        selectedElevator: this.state.selectedElevator,
        helpOpen: this.state.helpOpen,
        surgeFloor: surge?.floor ?? 0,
        alertTimer: this.state.alertTimer,
        time: this.state.time,
        visibleControls: "Move floor/elevator: Arrow keys or WASD  Confirm: Enter or Space  Help: H  Restart: R",
        floors: this.state.floors.map((floor) => ({
          floor: floor.floor,
          label: floor.label,
          queue: floor.queue,
          waitPressure: floor.waitPressure,
          callUp: floor.callUp,
          callDown: floor.callDown,
          preferredDirection: floor.preferredDirection,
          selected: floor.floor === this.state.selectedFloor,
          unlocked: floor.unlocked
        })),
        elevators: this.state.elevators.map((elevator) => ({
          id: elevator.id,
          floor: elevator.floor,
          target: elevator.target,
          load: elevator.load,
          capacity: elevator.capacity,
          direction: elevator.direction,
          selected: elevator.id === this.state.selectedElevator,
          doorOpen: elevator.doorTimer > 0.1
        }))
      };
    }
    createOverlay(phase) {
      if (phase === "menu") {
        return {
          visible: true,
          title: "SimTower Elevator Ops",
          body: `Run a staged elevator shift: learn the dispatch loop on the lower floors, open the full tower once one car is moving, then survive ${this.scenario.scoreRules.clearSurges} named surge phases while clearing ${this.scenario.scoreRules.clearServed} riders through the lobby.`,
          cta: "Press Enter to start"
        };
      }
      if (phase === "fail") {
        return {
          visible: true,
          title: "Tower stalled",
          body: "A queue hit critical mass. Reset fast and redistribute the cars earlier.",
          cta: "Press R to retry"
        };
      }
      if (phase === "win") {
        return {
          visible: true,
          title: "Shift complete",
          body: `You held ${this.state.surgesCleared} surge phases and cleared ${this.state.ridersServed} riders without a floor overflowing.`,
          cta: "Press R to replay"
        };
      }
      if (this.state.helpOpen) {
        return {
          visible: true,
          title: "Dispatch help",
          body: `Select a floor, pick an elevator, then confirm to route it. Warmup only uses the lower tower. Once the full building opens, idle cars stay put until you send them and loaded cars return to the lobby automatically. Clear ${this.scenario.scoreRules.clearServed} riders and survive ${this.scenario.scoreRules.clearSurges} surge phases.`,
          cta: "Press H to close help"
        };
      }
      return {
        visible: false,
        title: "Keep the shafts flowing",
        body: this.state.message,
        cta: ""
      };
    }
  }

  // simtower-elevator-ops/src/render.js
  function renderFrame(ctx, frameState, layout) {
    const { width, height, towerBox } = layout;
    drawBackground(ctx, width, height);
    drawTower(ctx, towerBox);
    drawFloors(ctx, frameState, towerBox, layout);
    drawElevators(ctx, frameState, towerBox, layout);
    drawQueues(ctx, frameState, towerBox, layout);
    drawAlerts(ctx, frameState, layout);
    drawHud(ctx, frameState, layout);
    drawOverlay(ctx, frameState, layout);
  }
  function drawBackground(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#091116";
    ctx.fillRect(0, 0, width, height);
  }
  function drawTower(ctx, towerBox) {
    ctx.fillStyle = "#10202a";
    ctx.fillRect(towerBox.x, towerBox.y, towerBox.w, towerBox.h);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.strokeRect(towerBox.x, towerBox.y, towerBox.w, towerBox.h);
  }
  function drawFloors(ctx, frameState, towerBox, layout) {
    const floorH = towerBox.h / frameState.floors.length;
    ctx.strokeStyle = "rgba(173, 214, 255, 0.12)";
    ctx.font = "12px Arial, sans-serif";
    for (let i = 0;i < frameState.floors.length; i += 1) {
      const y = towerBox.y + towerBox.h - i * floorH;
      ctx.beginPath();
      ctx.moveTo(towerBox.x, y);
      ctx.lineTo(towerBox.x + towerBox.w, y);
      ctx.stroke();
      const floor = frameState.floors[i];
      ctx.fillStyle = i === frameState.selectedFloor ? "rgba(127, 204, 255, 0.12)" : floor.unlocked ? "transparent" : "rgba(7, 12, 16, 0.38)";
      ctx.fillRect(towerBox.x, y - floorH, towerBox.w, floorH);
      ctx.fillStyle = floor.unlocked ? "rgba(232, 244, 255, 0.72)" : "rgba(232, 244, 255, 0.3)";
      ctx.fillText(floor.label, towerBox.x + 12, y - floorH * 0.35);
    }
  }
  function drawElevators(ctx, frameState, towerBox, layout) {
    const shaftW = towerBox.w * 0.22;
    const floorH = towerBox.h / frameState.floors.length;
    const shaftGap = (towerBox.w - shaftW * frameState.elevators.length) / (frameState.elevators.length + 1);
    frameState.elevators.forEach((elevator, index) => {
      const x = towerBox.x + shaftGap + index * (shaftW + shaftGap);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(x, towerBox.y + 8, shaftW, towerBox.h - 16);
      const y = towerBox.y + towerBox.h - (elevator.floor + 1) * floorH + 10;
      ctx.fillStyle = index === frameState.selectedElevator ? "#ffcf6e" : "#9bd5ff";
      ctx.fillRect(x + 8, y, shaftW - 16, floorH - 18);
      if (elevator.doorOpen) {
        ctx.strokeStyle = "#081015";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + shaftW / 2, y + 8);
        ctx.lineTo(x + shaftW / 2, y + floorH - 26);
        ctx.stroke();
      }
      ctx.fillStyle = "#091116";
      ctx.fillRect(x + 14, y + 10, shaftW - 28, 4);
      ctx.fillRect(x + 14, y + 20, shaftW - 28, 4);
      ctx.fillStyle = "#e8f4ff";
      ctx.font = "12px Arial, sans-serif";
      ctx.fillText(`${Math.round(elevator.load)}/${elevator.capacity}`, x + 14, y + floorH - 28);
    });
  }
  function drawQueues(ctx, frameState, towerBox, layout) {
    const floorH = towerBox.h / frameState.floors.length;
    frameState.floors.forEach((floor) => {
      if (!floor.unlocked)
        return;
      const y = towerBox.y + towerBox.h - (floor.floor + 1) * floorH;
      const queueW = Math.min(120, floor.queue * 10);
      ctx.fillStyle = floor.floor === frameState.surgeFloor ? "rgba(255, 104, 104, 0.9)" : "rgba(133, 220, 153, 0.8)";
      ctx.fillRect(towerBox.x + towerBox.w + 18, y + 8, queueW, floorH - 16);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(`F${floor.floor} ${Math.round(floor.queue)}`, towerBox.x + towerBox.w + 20, y + floorH * 0.58);
    });
  }
  function drawAlerts(ctx, frameState, layout) {
    if (frameState.alertTimer <= 0)
      return;
    ctx.fillStyle = "rgba(255, 104, 104, 0.92)";
    ctx.fillRect(layout.width - 18, layout.topMargin, 8, 110);
  }
  function drawHud(ctx, frameState, layout) {
    ctx.fillStyle = "rgba(7, 12, 16, 0.78)";
    ctx.fillRect(layout.pad, layout.height - 104, layout.width - layout.pad * 2, 80);
    ctx.fillStyle = "#e8f4ff";
    ctx.font = "600 16px Arial, sans-serif";
    ctx.fillText(frameState.hud.message, layout.pad + 16, layout.height - 72);
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText(`Score ${frameState.hud.score}  Riders ${frameState.hud.ridersServed}/${frameState.hud.clearTargetServed}  Shift ${frameState.hud.surgesCleared}/${frameState.hud.clearTargetSurges}  Pressure ${frameState.hud.pressure}%`, layout.pad + 16, layout.height - 46);
    ctx.fillStyle = "#ffcf6e";
    ctx.fillText(frameState.visibleControls, layout.pad + 16, layout.height - 24);
    ctx.fillStyle = "#e8f4ff";
    ctx.fillText(`${frameState.hud.phaseLabel}  |  ${frameState.hud.surgeLabel} F${frameState.hud.surgeFloor}  |  Rotate in ${frameState.hud.surgeCountdown}s`, layout.width - 420, layout.height - 24);
  }
  function drawOverlay(ctx, frameState, layout) {
    if (!frameState.overlay?.visible)
      return;
    const boxW = Math.min(460, layout.width - 64);
    const boxH = 164;
    const boxX = (layout.width - boxW) / 2;
    const boxY = Math.max(56, (layout.height - boxH) / 2);
    ctx.fillStyle = "rgba(3, 8, 11, 0.78)";
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = "rgba(10, 18, 24, 0.96)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = "#e8f4ff";
    ctx.font = "700 28px Arial, sans-serif";
    ctx.fillText(frameState.overlay.title, boxX + 24, boxY + 48);
    ctx.font = "15px Arial, sans-serif";
    wrapText(ctx, frameState.overlay.body, boxX + 24, boxY + 84, boxW - 48, 22);
    ctx.fillStyle = "#ffcf6e";
    ctx.font = "600 15px Arial, sans-serif";
    ctx.fillText(frameState.overlay.cta, boxX + 24, boxY + boxH - 24);
  }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let cursorY = y;
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line)
      ctx.fillText(line, x, cursorY);
  }

  // simtower-elevator-ops/src/main.js
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var helpToggle = document.getElementById("help-toggle");
  var helpPanel = document.getElementById("help-panel");
  var hudBody = document.getElementById("hud-body");
  var goalBody = document.getElementById("goal-body");
  var dispatchBody = document.getElementById("dispatch-body");
  var statusPill = document.getElementById("status-pill");
  var hintPill = document.getElementById("hint-pill");
  var game = new Game;
  var input = { up: false, down: false, left: false, right: false, confirm: false, restart: false, toggleHelp: false };
  var last = performance.now();
  var heldToggle = false;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function layout() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pad: 24,
      topMargin: 24,
      towerBox: {
        x: 24,
        y: 44,
        w: Math.min(520, window.innerWidth * 0.56),
        h: Math.max(420, window.innerHeight - 140)
      }
    };
  }
  function syncHud(frame) {
    statusPill.textContent = frame.phase === "menu" ? "Menu" : frame.phase === "fail" ? "Fail" : frame.phase === "win" ? "Clear" : "Live";
    hintPill.textContent = frame.headline;
    hudBody.textContent = `${frame.hud.phaseLabel} | Floor ${frame.selectedFloor} | Elevator ${frame.selectedElevator + 1} | Riders ${frame.hud.ridersServed}/${frame.hud.clearTargetServed} | Shift ${frame.hud.surgesCleared}/${frame.hud.clearTargetSurges} | Next rotate ${frame.hud.surgeCountdown}s`;
    goalBody.textContent = frame.coach.objective;
    dispatchBody.textContent = `${frame.coach.hotspot} ${frame.coach.dispatch} ${frame.coach.phaseCoach} Selected floor queue ${frame.coach.selectedFloorQueue}. Elevator load ${frame.coach.selectedElevatorLoad}.`;
    helpPanel.hidden = !frame.helpOpen;
    helpToggle.setAttribute("aria-expanded", String(frame.helpOpen));
  }
  function step(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    game.update(input, dt);
    const frame = game.getFrameState();
    const view = layout();
    renderFrame(ctx, frame, view);
    syncHud(frame);
    input.confirm = false;
    input.restart = false;
    input.toggleHelp = false;
    requestAnimationFrame(step);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "h", "H", "?", "r", "R", "a", "A", "s", "S", "d", "D", "w", "W"].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key === "w" || event.key === "W")
      input.up = true;
    if (event.key === "ArrowDown" || event.key === "s" || event.key === "S")
      input.down = true;
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A")
      input.left = true;
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D")
      input.right = true;
    if (event.key === "Enter" || event.key === " ")
      input.confirm = true;
    if (event.key === "r" || event.key === "R")
      input.restart = true;
    if (event.key === "h" || event.key === "H" || event.key === "?") {
      if (!heldToggle)
        input.toggleHelp = true;
      heldToggle = true;
    }
  });
  window.addEventListener("keyup", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "h", "H", "?", "r", "R", "a", "A", "s", "S", "d", "D", "w", "W"].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key === "w" || event.key === "W")
      input.up = false;
    if (event.key === "ArrowDown" || event.key === "s" || event.key === "S")
      input.down = false;
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A")
      input.left = false;
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D")
      input.right = false;
    if (event.key === "h" || event.key === "H" || event.key === "?")
      heldToggle = false;
  });
  helpToggle.addEventListener("click", () => {
    input.toggleHelp = true;
  });
  resize();
  syncHud(game.getFrameState());
  requestAnimationFrame(step);
})();
