import { CONFIG } from "./config.js";
import { GAME_PHASE, createFrameState, createInitialState } from "./state.js";
import { createRunnerRig, resetRunnerRig, stepRunnerRig } from "./sim/RunnerRig.js";
import { createTerrain } from "./sim/terrain.js";

function createDefaultSim() {
  let rig = null;
  let terrain = null;

  function buildTerrain(config) {
    return createTerrain({
      groundY: config.groundY,
      startX: config.runnerStartX,
      finishX: config.runnerStartX + config.finishDistance,
      bumps: [
        { x: config.runnerStartX + 260, width: 110, height: 18 },
        { x: config.runnerStartX + 560, width: 150, height: 26 },
        { x: config.runnerStartX + 940, width: 120, height: 20 },
      ],
    });
  }

  function buildSnapshot(config, simState) {
    return {
      ...simState,
      elapsed: simState.time ?? 0,
      reason:
        simState.phase === "finish"
          ? "finish"
          : simState.phase === "fail"
            ? simState.failReason ?? "fall"
            : "running",
      world: {
        width: config.worldWidth,
        height: config.worldHeight,
        groundY: terrain.groundY,
        startX: terrain.startX,
        finishX: terrain.finishX,
        progress: simState.progress ?? 0,
        distance: simState.distance ?? 0,
        terrain: {
          groundY: terrain.groundY,
          startX: terrain.startX,
          finishX: terrain.finishX,
          bumps: terrain.bumps,
        },
        obstacles: [],
      },
      runner: {
        ...(simState.runner ?? {}),
        grounded: simState.grounded ?? false,
        fallen: simState.fallen ?? false,
        fallLatched: simState.phase === "fail" || simState.fallen === true,
        lean: simState.lean ?? 0,
        stability: simState.stability ?? 0,
      },
    };
  }

  return {
    reset(_, config) {
      terrain = buildTerrain(config);
      rig = createRunnerRig({ world: terrain });
      resetRunnerRig(rig);
      return buildSnapshot(config, stepRunnerRig(rig, {}, 0, { terrain }));
    },
    step(context) {
      if (!rig || !terrain) return this.reset(context.state, context.config);
      return buildSnapshot(context.config, stepRunnerRig(rig, context.controls, context.dt, { terrain }));
    },
  };
}

export class Game {
  constructor(options = {}) {
    this.config = { ...CONFIG, ...(options.config ?? {}) };
    this.sim = options.sim ?? createDefaultSim();
    this.state = createInitialState(this.config);
  }

  start() {
    this.state = createInitialState(this.config);
    const snapshot = this.sim.reset?.(this.state, this.config) ?? {};
    this.applySnapshot(snapshot);
    this.state.phase = GAME_PHASE.RUNNING;
    this.state.elapsed = 0;
    this.state.distance = 0;
    this.state.bestDistance = 0;
    this.state.finishTime = null;
    this.state.reason = "running";
    this.state.message = "Running.";
    return this.getFrameState();
  }

  restart() {
    return this.start();
  }

  update(dt = 0, controls = {}) {
    if (controls.restart) return this.restart();
    if (controls.start && this.state.phase === GAME_PHASE.MENU) return this.start();
    if (this.state.phase !== GAME_PHASE.RUNNING) return this.getFrameState();

    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const next = this.sim.step?.({
      dt: safeDt,
      controls,
      state: this.state,
      config: this.config,
    }) ?? {};

    this.applySnapshot(next);
    this.state.elapsed += safeDt;
    this.state.bestDistance = Math.max(this.state.bestDistance, this.state.distance);
    this.state.phase = this.resolvePhase(next.phase);
    this.state.message = this.resolveMessage(this.state.phase);
    if (this.state.phase === GAME_PHASE.FINISHED && this.state.finishTime == null) this.state.finishTime = this.state.elapsed;

    return this.getFrameState();
  }

  getFrameState() {
    return createFrameState(this.state, this.config);
  }

  isFinished() {
    const phase = this.state.phase;
    return phase === GAME_PHASE.FALLEN || phase === GAME_PHASE.FINISHED;
  }

  applySnapshot(snapshot = {}) {
    if (snapshot.world) this.state.world = snapshot.world;
    if (snapshot.runner) this.state.runner = snapshot.runner;
    if (typeof snapshot.distance === "number") this.state.distance = snapshot.distance;
    if (typeof snapshot.elapsed === "number") this.state.elapsed = snapshot.elapsed;
    if (typeof snapshot.bestDistance === "number") this.state.bestDistance = snapshot.bestDistance;
    if (typeof snapshot.reason === "string") this.state.reason = snapshot.reason;
    if (typeof snapshot.message === "string") this.state.message = snapshot.message;
    if (typeof snapshot.finishTime === "number") this.state.finishTime = snapshot.finishTime;
    this.state.bestDistance = Math.max(this.state.bestDistance, this.state.distance);
  }

  resolvePhase(simPhase) {
    if (simPhase === "finish") return GAME_PHASE.FINISHED;
    if (simPhase === "fail") return GAME_PHASE.FALLEN;
    if (this.config.finishDistance != null && this.state.distance >= this.config.finishDistance) return GAME_PHASE.FINISHED;
    if (this.config.timeoutSeconds != null && this.state.elapsed >= this.config.timeoutSeconds) return GAME_PHASE.FALLEN;
    if (this.state.runner?.fallLatched) return GAME_PHASE.FALLEN;
    return simPhase === GAME_PHASE.FALLEN || simPhase === GAME_PHASE.FINISHED ? simPhase : GAME_PHASE.RUNNING;
  }

  resolveMessage(phase) {
    if (phase === GAME_PHASE.FALLEN) return "Runner down. Press R to restart.";
    if (phase === GAME_PHASE.FINISHED) return "Finish reached. Press R to run again.";
    if (phase === GAME_PHASE.RUNNING) return "Running.";
    return "Press Enter or Space to start.";
  }
}
