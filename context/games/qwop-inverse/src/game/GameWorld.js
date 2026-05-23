import { CONFIG } from "../config.js";
import { GamePhase, createInitialRunState } from "./state.js";
import { Track } from "./Track.js";
import { HurdleSystem } from "./HurdleSystem.js";
import { RagdollPhysics } from "../physics/RagdollPhysics.js";

export class GameWorld {
  constructor({ config = CONFIG, physics } = {}) {
    this.config = config;
    this.physics = physics ?? new RagdollPhysics(config);
    this.track = new Track(config);
    this.hurdles = new HurdleSystem(config);
    this.state = createInitialRunState(config);
    this.originX = this.physics.getCenterOfMass().x;
    this.bestDistance = 0;
    this.bestLean = 0;
    this.runner = {
      x: this.originX,
      vx: config.startSpeed ?? 140,
      lean: 0,
      torsoHeight: 0,
      falling: false,
    };
    this.state.ragdoll = this.physics.getSnapshot();
  }

  startRun() {
    this.physics.reset();
    this.originX = this.physics.getCenterOfMass().x;
    this.state = createInitialRunState(this.config);
    this.state.phase = GamePhase.Play;
    this.state.ragdoll = this.physics.getSnapshot();
    this.bestDistance = 0;
    this.bestLean = 0;
    this.runner = {
      x: this.originX,
      vx: this.config.startSpeed ?? 140,
      lean: 0,
      torsoHeight: 0,
      falling: false,
    };
    this.hurdles.reset(1);
  }

  resetToMenu() {
    this.physics.reset();
    this.originX = this.physics.getCenterOfMass().x;
    this.state = createInitialRunState(this.config);
    this.state.ragdoll = this.physics.getSnapshot();
    this.hurdles.reset(0);
  }

  update(dt, controlState) {
    this.state.time += dt;
    if (this.state.phase === GamePhase.Menu) {
      if (controlState?.start) this.startRun();
      return;
    }
    if (this.state.phase === GamePhase.Lose) {
      if (controlState?.restart || controlState?.start) this.startRun();
      return;
    }

    const drive = this.computeDrive(controlState);
    const ragdollSnapshot = this.physics.step(dt, controlState, {
      drive,
      lean: this.runner.lean,
      supportContacts: [],
    });
    this.state.ragdoll = ragdollSnapshot;
    this.runner.x = ragdollSnapshot.com.x;
    this.runner.vx = ragdollSnapshot.forwardSpeed;
    this.runner.lean = ragdollSnapshot.leanAngle;
    this.runner.torsoHeight = ragdollSnapshot.torsoHeight;

    const distance = this.track.getDistance(this.originX, ragdollSnapshot.com.x);
    this.state.distance = distance;
    this.state.bestDistance = Math.max(this.bestDistance, distance);
    this.state.lean = this.runner.lean;
    this.state.bestLean = Math.max(this.bestLean, Math.abs(this.runner.lean));
    this.bestDistance = this.state.bestDistance;
    this.bestLean = this.state.bestLean;

    const activeHurdles = this.hurdles.update(dt, distance, ragdollSnapshot);
    const leanLimit = this.config.maxLean ?? 1.15;
    if (Math.abs(this.runner.lean) >= leanLimit || this.physics.isIrrecoverablyFallen()) {
      this.state.fallLocked = true;
      this.state.phase = GamePhase.Lose;
      this.state.failReason = "lean";
    }

    if (!this.state.failReason) {
      const hit = activeHurdles.find((hurdle) => hurdle.hit);
      if (hit) {
        this.state.fallLocked = true;
        this.state.phase = GamePhase.Lose;
        this.state.failReason = "hurdle";
      }
    }

    if (this.state.phase === GamePhase.Lose) this.runner.falling = true;
  }

  computeDrive(controlState) {
    const intents = controlState?.torqueIntents ?? {};
    const thighCycle = (intents.leftThigh ?? 0) - (intents.rightThigh ?? 0);
    const calfCycle = (intents.rightCalf ?? 0) - (intents.leftCalf ?? 0);
    const solePush = Math.max(0, intents.leftSole ?? 0) + Math.max(0, intents.rightSole ?? 0);
    const cadence = Math.abs(thighCycle) + Math.abs(calfCycle);
    const balancePenalty = Math.max(0.2, 1 - Math.abs(this.runner.lean) * 0.65);
    const baseDrive = 0.95;
    return baseDrive + (thighCycle * 0.85 + calfCycle * 0.45 + solePush * 0.35 + cadence * 0.12) * balancePenalty;
  }

  getViewModel() {
    return {
      scene: this.state.phase,
      phase: this.state.phase,
      status: this.state.failReason ?? this.state.phase,
      distance: this.state.distance,
      bestDistance: this.state.bestDistance,
      lean: this.state.lean,
      bestLean: this.state.bestLean,
      failReason: this.state.failReason,
      hurdles: this.hurdles.getActiveHurdles(),
      originX: this.originX,
      centerOfMass: this.physics.getCenterOfMass(),
      leanMetrics: this.physics.getLeanMetrics(),
      ragdoll: this.state.ragdoll,
      art: this.config.art,
      lossCopy: this.getLossCopy(),
      copyKey: this.state.failReason === "hurdle" ? "timing" : this.state.failReason === "lean" ? "lean" : "menu",
    };
  }

  getRunnerPose() {
    return this.state.ragdoll ?? this.physics.getSnapshot();
  }

  getLossCopy() {
    if (this.state.failReason === "hurdle") return "You discovered the hurdle with your face before your lead foot did.";
    if (this.state.failReason === "lean") return "Balance threshold exceeded. Gravity accepted your application immediately.";
    return "Inverse gymnastics remains a hostile workplace.";
  }
}
