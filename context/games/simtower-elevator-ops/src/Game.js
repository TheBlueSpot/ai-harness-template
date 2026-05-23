import { createSimState, createTowerScenario, stepSim } from "./sim.js";

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
    toggleHelp: Boolean(input.toggleHelp),
  };
}

export class Game {
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
      if (commandState.toggleHelp) this.state.helpOpen = !this.state.helpOpen;
      if (commandState.confirm || commandState.restart) this.start();
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
    const busiestFloor =
      this.state.floors
        .filter((floor) => floor.floor !== 0)
        .sort((left, right) => right.waitPressure - left.waitPressure || right.queue - left.queue)[0]
      ?? this.state.floors[1];
    const selectedFloor = this.state.floors[this.state.selectedFloor];
    const selectedElevator = this.state.elevators[this.state.selectedElevator];
    const dispatchHotspot =
      !this.state.towerOpen
        ? "Warmup is live on the lower tower. Retail, Office, Atrium, and Clinic are the only active calls."
        : busiestFloor && busiestFloor.queue > 0
        ? `${busiestFloor.label} has ${Math.max(1, Math.ceil(busiestFloor.queue))} waiting.`
        : "No floor is backed up yet. Hold the cars for the next call.";
    const selectionStep =
      busiestFloor && selectedFloor
        ? !selectedFloor.unlocked
          ? `${selectedFloor.label} is still locked. Stay on the lower floors until the full tower opens.`
          : busiestFloor.floor === selectedFloor.floor
            ? `Press Enter to send elevator ${selectedElevator?.id + 1 ?? 1} now.`
            : busiestFloor.floor > selectedFloor.floor
              ? `Press Down ${busiestFloor.floor - selectedFloor.floor} time${busiestFloor.floor - selectedFloor.floor === 1 ? "" : "s"} to line up the hot floor.`
              : `Press Up ${selectedFloor.floor - busiestFloor.floor} time${selectedFloor.floor - busiestFloor.floor === 1 ? "" : "s"} to line up the hot floor.`
        : "Pick a floor, pick a car, then confirm.";

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
        clearTargetSurges: this.scenario.scoreRules.clearSurges,
      },
      coach: {
        objective: !this.state.towerOpen
          ? "Warmup: dispatch the lower-floor queues cleanly so the tower expansion makes sense instead of spiking all at once."
          : `Clear ${this.scenario.scoreRules.clearServed} riders and hold ${this.scenario.scoreRules.clearSurges} shifts without letting any queue hit ${this.scenario.scoreRules.failQueue}.`,
        hotspot: dispatchHotspot,
        dispatch: selectionStep,
        phaseCoach: surge?.coach ?? "Keep one elevator moving and one elevator ready for the next hotspot.",
        selectedFloorLabel: selectedFloor?.label ?? `Floor ${this.state.selectedFloor}`,
        selectedFloorQueue: selectedFloor ? Math.max(0, Math.ceil(selectedFloor.queue)) : 0,
        selectedElevatorFloor: selectedElevator ? Math.round(selectedElevator.floor) : 0,
        selectedElevatorLoad: selectedElevator ? Math.round(selectedElevator.load) : 0,
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
        unlocked: floor.unlocked,
      })),
      elevators: this.state.elevators.map((elevator) => ({
        id: elevator.id,
        floor: elevator.floor,
        target: elevator.target,
        load: elevator.load,
        capacity: elevator.capacity,
        direction: elevator.direction,
        selected: elevator.id === this.state.selectedElevator,
        doorOpen: elevator.doorTimer > 0.1,
      })),
    };
  }

  createOverlay(phase) {
    if (phase === "menu") {
      return {
        visible: true,
        title: "SimTower Elevator Ops",
        body: `Run a staged elevator shift: learn the dispatch loop on the lower floors, open the full tower once one car is moving, then survive ${this.scenario.scoreRules.clearSurges} named surge phases while clearing ${this.scenario.scoreRules.clearServed} riders through the lobby.`,
        cta: "Press Enter to start",
      };
    }

    if (phase === "fail") {
      return {
        visible: true,
        title: "Tower stalled",
        body: "A queue hit critical mass. Reset fast and redistribute the cars earlier.",
        cta: "Press R to retry",
      };
    }

    if (phase === "win") {
      return {
        visible: true,
        title: "Shift complete",
        body: `You held ${this.state.surgesCleared} surge phases and cleared ${this.state.ridersServed} riders without a floor overflowing.`,
        cta: "Press R to replay",
      };
    }

    if (this.state.helpOpen) {
      return {
        visible: true,
        title: "Dispatch help",
        body: `Select a floor, pick an elevator, then confirm to route it. Warmup only uses the lower tower. Once the full building opens, idle cars stay put until you send them and loaded cars return to the lobby automatically. Clear ${this.scenario.scoreRules.clearServed} riders and survive ${this.scenario.scoreRules.clearSurges} surge phases.`,
        cta: "Press H to close help",
      };
    }

    return {
      visible: false,
      title: "Keep the shafts flowing",
      body: this.state.message,
      cta: "",
    };
  }
}

export default Game;
