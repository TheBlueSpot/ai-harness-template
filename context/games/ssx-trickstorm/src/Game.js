import {
  CHECKPOINTS,
  TRACK_LENGTH,
  getRampAt,
  getTrackCatalog,
  getWindowObjects,
  sampleSlope,
  sampleTerrain,
} from "./track.js";

const LANES = [-56, 0, 56];
const GRAVITY = 1180;
const MAX_SPEED = 1240;
const MIN_SPEED = 180;
const CRASH_RECOVER_MS = 1400;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapDegrees(value) {
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

function createRunState() {
  return {
    mode: "menu",
    width: 1280,
    height: 720,
    time: 0,
    checkpointIndex: 0,
    checkpointX: 0,
    score: 0,
    boost: 35,
    comboLabel: "None",
    comboBank: 0,
    trickSpin: 0,
    trickGrabFrames: 0,
    pendingCrashReason: "",
    result: null,
    passedGates: 0,
    gateMisses: 0,
    rider: {
      x: 0,
      lane: 1,
      laneVisual: 1,
      y: sampleTerrain(0),
      vy: 0,
      speed: 320,
      grounded: true,
      angle: 0,
      spinVelocity: 0,
      canJump: true,
    },
    collected: new Set(),
    hitHazards: new Set(),
  };
}

export class Game {
  constructor({ width = 1280, height = 720 } = {}) {
    this.track = getTrackCatalog();
    this.state = createRunState();
    this.resize(width, height);
  }

  start() {
    if (this.state.mode === "menu") {
      this.state.mode = "playing";
    }
  }

  restart() {
    const { width, height } = this.state;
    this.state = createRunState();
    this.resize(width, height);
    this.state.mode = "playing";
  }

  resize(width, height) {
    this.state.width = width;
    this.state.height = height;
  }

  update(rawDt, input) {
    const dt = Math.min(rawDt || 0, 1 / 30);
    const state = this.state;

    if (state.mode === "menu") {
      if (input.startPressed) {
        this.start();
      }
      return;
    }

    if (state.mode === "clear" || state.mode === "failed") {
      if (input.restartPressed || input.startPressed) {
        this.restart();
      }
      return;
    }

    if (state.mode === "crashed") {
      state.time += dt;
      state.result.timer -= dt * 1000;
      if (state.result.timer <= 0) {
        this.resumeFromCheckpoint();
      }
      return;
    }

    state.time += dt;
    this.updateLane(input, dt);
    this.updateMotion(input, dt);
    this.updateTrackCollisions(input);
    this.updateProgress();
  }

  updateLane(input, dt) {
    const rider = this.state.rider;
    if (!rider.grounded) {
      rider.laneVisual += (rider.lane - rider.laneVisual) * Math.min(1, dt * 6);
      return;
    }

    if (input.leftPressed) {
      rider.lane = clamp(rider.lane - 1, 0, 2);
    } else if (input.rightPressed) {
      rider.lane = clamp(rider.lane + 1, 0, 2);
    }

    rider.laneVisual += (rider.lane - rider.laneVisual) * Math.min(1, dt * 9);
  }

  updateMotion(input, dt) {
    const state = this.state;
    const rider = state.rider;
    const terrainY = sampleTerrain(rider.x);
    const slope = sampleSlope(rider.x);

    if (rider.grounded) {
      let accel = 210 - slope * 180;
      if (input.tuck) {
        accel += 160;
      }
      if (input.brake) {
        accel -= 340;
      }
      if (input.boost && state.boost > 0) {
        accel += 430;
        state.boost = clamp(state.boost - dt * 24, 0, 100);
      }

      rider.speed = clamp(rider.speed + accel * dt, MIN_SPEED, MAX_SPEED);
      rider.x += rider.speed * dt;
      rider.y = sampleTerrain(rider.x);
      rider.angle = clamp(-slope * 45, -22, 22);

      const ramp = getRampAt(rider.x);
      const wantsJump = input.jumpPressed && rider.canJump;
      const launchNow = ramp && rider.x > ramp.x + ramp.width * 0.52;

      if (wantsJump || launchNow) {
        rider.grounded = false;
        rider.vy = -(210 + rider.speed * 0.24 + (ramp?.height ?? 0) * 4.1);
        rider.y = sampleTerrain(rider.x);
        rider.canJump = false;
        rider.spinVelocity = 0;
        state.comboBank = 0;
        state.comboLabel = "Airborne";
      }

      if (!input.jumpHeld) {
        rider.canJump = true;
      }
    } else {
      rider.x += rider.speed * dt;
      rider.vy += GRAVITY * dt;
      rider.y += rider.vy * dt;
      rider.speed = clamp(rider.speed - dt * 24, MIN_SPEED, MAX_SPEED);

      if (input.spinLeft) {
        rider.spinVelocity -= 680 * dt;
        state.comboBank += 26 * dt;
      }
      if (input.spinRight) {
        rider.spinVelocity += 680 * dt;
        state.comboBank += 26 * dt;
      }
      if (input.grab) {
        state.trickGrabFrames += 1;
        state.comboBank += 22 * dt;
      }

      rider.angle += rider.spinVelocity * dt;
      rider.spinVelocity *= 0.986;
      state.trickSpin = wrapDegrees(rider.angle);

      const landingY = sampleTerrain(rider.x);
      if (rider.y >= landingY) {
        rider.y = landingY;
        rider.grounded = true;
        const landedClean = Math.abs(state.trickSpin) < 24 && rider.vy < 760;
        if (landedClean) {
          const spinCount = Math.round(Math.abs(rider.angle) / 360);
          const spinText = spinCount > 0 ? `${spinCount * 360} spin` : "clean landing";
          const grabText = state.trickGrabFrames > 10 ? " + grab" : "";
          const banked = Math.round(state.comboBank + spinCount * 320 + state.trickGrabFrames * 3);
          state.score += banked;
          state.boost = clamp(state.boost + 14 + spinCount * 8, 0, 100);
          state.comboLabel = `${spinText}${grabText}  +${banked}`;
        } else {
          this.crash("Hard landing");
          return;
        }

        rider.angle = 0;
        rider.vy = 0;
        rider.spinVelocity = 0;
        state.comboBank = 0;
        state.trickSpin = 0;
        state.trickGrabFrames = 0;
      }
    }

    const expectedCheckpoint = CHECKPOINTS[state.checkpointIndex] ?? TRACK_LENGTH;
    if (rider.x >= expectedCheckpoint && state.checkpointIndex < CHECKPOINTS.length - 1) {
      state.checkpointX = expectedCheckpoint;
      state.checkpointIndex += 1;
      state.boost = clamp(state.boost + 18, 0, 100);
      state.comboLabel = `Checkpoint ${state.checkpointIndex}`;
    }

    if (rider.x >= TRACK_LENGTH) {
      state.mode = "clear";
      state.result = {
        title: "Summit Cleared",
        body: `Score ${Math.round(state.score)} | Gates ${state.passedGates}/3 | Boost ${Math.round(state.boost)}%`,
      };
    }
  }

  updateTrackCollisions(input) {
    const state = this.state;
    const rider = state.rider;
    const hitRadius = rider.grounded ? 44 : 32;

    for (const pickup of this.track.pickups) {
      const key = `pickup-${pickup.x}-${pickup.lane}`;
      if (state.collected.has(key)) {
        continue;
      }
      if (Math.abs(pickup.x - rider.x) < 44 && Math.abs(pickup.lane - rider.laneVisual) < 0.45) {
        state.collected.add(key);
        state.boost = clamp(state.boost + 28, 0, 100);
        state.score += 90;
        state.comboLabel = "Boost canister";
      }
    }

    for (const hazard of this.track.hazards) {
      const key = `hazard-${hazard.x}-${hazard.lane}`;
      if (state.hitHazards.has(key)) {
        continue;
      }
      if (Math.abs(hazard.x - rider.x) < hitRadius && Math.abs(hazard.lane - rider.laneVisual) < 0.35) {
        state.hitHazards.add(key);
        if (hazard.type === "ice" && rider.grounded) {
          rider.speed = clamp(rider.speed - 160, MIN_SPEED, MAX_SPEED);
          rider.angle += input.left || input.right ? 18 : 42;
          state.comboLabel = "Ice wobble";
        } else {
          this.crash(hazard.type === "tree" ? "Clipped a tree" : "Caught a rock");
          return;
        }
      }
    }

    for (const gate of this.track.gates) {
      const key = `gate-${gate.x}`;
      if (state.collected.has(key)) {
        continue;
      }
      if (rider.x >= gate.x) {
        state.collected.add(key);
        const centerAligned = Math.abs(rider.laneVisual - 1) < 0.42;
        if (centerAligned) {
          state.passedGates += 1;
          state.score += 220;
          state.boost = clamp(state.boost + 10, 0, 100);
          state.comboLabel = "Gate threaded";
        } else {
          state.gateMisses += 1;
          state.comboLabel = "Gate missed";
        }
      }
    }
  }

  updateProgress() {
    const state = this.state;
    const rider = state.rider;
    if (rider.x > state.checkpointX + 420) {
      state.checkpointX = rider.x - 160;
    }
  }

  resumeFromCheckpoint() {
    const state = this.state;
    const rider = state.rider;

    state.mode = "playing";
    state.result = null;
    state.score = Math.max(0, state.score - 220);
    state.boost = Math.max(28, state.boost - 16);
    state.comboBank = 0;
    state.comboLabel = "Back on line";
    state.trickSpin = 0;
    state.trickGrabFrames = 0;
    rider.x = state.checkpointX;
    rider.y = sampleTerrain(rider.x);
    rider.vy = 0;
    rider.speed = Math.max(320, rider.speed * 0.72);
    rider.grounded = true;
    rider.angle = 0;
    rider.spinVelocity = 0;
    rider.lane = 1;
    rider.laneVisual = 1;
    rider.canJump = true;
  }

  crash(reason) {
    const state = this.state;
    const rider = state.rider;
    state.mode = "crashed";
    state.pendingCrashReason = reason;
    state.result = {
      title: "Crash",
      body: `${reason}. Dropping back to the last clean line.`,
      timer: CRASH_RECOVER_MS,
    };
    rider.grounded = false;
  }

  getFrameState() {
    const state = this.state;
    const rider = state.rider;
    const cameraX = clamp(rider.x - state.width * 0.24, 0, Math.max(0, TRACK_LENGTH - state.width * 0.4));

    return {
      mode: state.mode,
      width: state.width,
      height: state.height,
      cameraX,
      terrainBase: sampleTerrain,
      viewport: getWindowObjects(rider.x, state.width * 0.9),
      rider: {
        x: rider.x,
        y: rider.y,
        lane: rider.laneVisual,
        grounded: rider.grounded,
        speed: rider.speed,
        angle: rider.angle,
      },
      hud: {
        speed: Math.round(rider.speed),
        boost: Math.round(state.boost),
        score: Math.round(state.score),
        distance: `${Math.min(TRACK_LENGTH, Math.round(rider.x))} m`,
        combo: state.comboLabel,
        gate: `${state.passedGates} / 3`,
      },
      overlay:
        state.mode === "menu"
          ? {
              eyebrow: "Downhill Jam",
              title: "SSX Trickstorm",
              body: "Chain spins and grabs off the big ramps, then land clean to bank the score and keep your boost alive.",
              button: "Start Run",
            }
          : state.mode === "clear"
            ? {
                eyebrow: "Course Cleared",
                title: state.result.title,
                body: state.result.body,
                button: "Run Again",
              }
            : state.mode === "failed"
              ? {
                  eyebrow: "Wipeout",
                  title: state.result.title,
                  body: state.result.body,
                  button: "Retry",
                }
              : state.mode === "crashed"
                ? {
                    eyebrow: "Resetting Line",
                    title: state.result.title,
                    body: state.result.body,
                    button: "Recovering",
                    disabled: true,
                  }
                : null,
      trackLength: TRACK_LENGTH,
    };
  }
}
