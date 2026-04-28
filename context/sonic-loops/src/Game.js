import {
  buildFrameState,
  createRuntimeState,
  getCheckpointByX,
  getModeTransition,
  scatterRingsFromDamage,
  stepRuntimeState,
} from "./state.js";
import {
  getSurfaceContact,
  sampleTrack,
  updateCollectedRings,
} from "./track.js";

const RUN_SPEED_CAP = 760;
const GROUND_ACCEL = 1180;
const AIR_ACCEL = 760;
const BRAKE_DRAG = 0.88;
const AIR_DRAG = 0.992;
const JUMP_SPEED = 820;
const CROUCH_TIME = 0.14;

export class Game {
  constructor() {
    this.resetToMenu();
  }

  start() {
    if (!this.state) this.state = createRuntimeState();
    this.state.mode = "running";
    this.state.status = "Running";
    this.state.message = "Run started.";
    this.frameState = buildFrameState(this.state, sampleTrack(this.state.world));
  }

  restart() {
    this.resetToMenu();
    this.start();
  }

  resize(width, height) {
    this.state.viewport = { width, height };
    this.frameState = buildFrameState(this.state, sampleTrack(this.state.world));
  }

  update(dt, input = {}) {
    const state = this.state;
    stepRuntimeState(state, dt);

    if (state.mode !== "running") {
      this.frameState = buildFrameState(state, sampleTrack(state.world));
      return;
    }

    const world = state.world;
    const track = sampleTrack(world);
    const contact = getSurfaceContact(track, state.player);
    const hazard = track.hazards.find((item) => Math.hypot(state.player.x - item.x, state.player.y - item.y) <= item.radius + 14);

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetAccel = contact.attached ? GROUND_ACCEL : AIR_ACCEL;
    state.player.ax = steer * targetAccel;
    state.player.vx += state.player.ax * dt;

    if (input.brake) {
      state.player.vx *= BRAKE_DRAG;
      state.player.crouch = Math.min(1, state.player.crouch + dt / CROUCH_TIME);
      state.player.spin = true;
    } else {
      state.player.crouch = Math.max(0, state.player.crouch - dt / CROUCH_TIME);
      state.player.spin = input.jump || state.player.crouch > 0.5;
    }

    if (contact.attached) {
      if (input.jump) {
        state.player.attached = false;
        state.player.grounded = false;
        state.player.vy = -JUMP_SPEED;
        state.player.y -= 1;
        state.player.canJump = 0;
      } else {
        const tangentBoost = contact.tangent * state.player.vx;
        state.player.vx = clamp(state.player.vx + tangentBoost * dt * 0.08, -RUN_SPEED_CAP, RUN_SPEED_CAP);
        state.player.vy = 0;
        state.player.x += state.player.vx * dt;
        state.player.y = contact.point.y;
        state.player.grounded = true;
        state.player.normalForce = contact.normalForce;
        const shouldDetach =
          contact.release ||
          contact.normalForce < state.tuning.detachNormalForce ||
          Math.abs(state.player.vx) < contact.minAdhesionSpeed;
        if (shouldDetach) {
          state.player.attached = false;
          state.player.vy = Math.max(-40, -Math.abs(state.player.vx) * 0.18);
          state.status = "Falling";
          state.message = "Grip lost.";
        }
      }
    } else {
      state.player.grounded = false;
      state.player.attached = false;
      state.player.vy += state.gravity * dt;
      state.player.vx *= AIR_DRAG;
      if (input.jump && state.player.canJump > 0) {
        state.player.vy = -JUMP_SPEED;
        state.player.canJump = 0;
      }
      state.player.x += state.player.vx * dt;
      state.player.y += state.player.vy * dt;

      const landing = getSurfaceContact(track, state.player, true);
      if (landing && state.player.vy >= 0) {
        state.player.attached = landing.attached;
        state.player.grounded = true;
        state.player.y = landing.point.y;
        state.player.vy = 0;
        state.player.normalForce = landing.normalForce;
      }
    }

    state.player.speed = Math.abs(state.player.vx);
    state.speed = state.player.speed;
    state.timer += dt;

    const checkpoint = getCheckpointByX(state.world.checkpoints, state.player.x);
    if (checkpoint && checkpoint.id !== state.activeCheckpointId) {
      state.activeCheckpointId = checkpoint.id;
      state.lastCheckpoint = { ...checkpoint };
      state.message = checkpoint.message;
      state.status = "Checkpoint";
    }

    updateCollectedRings(state);
    if (hazard && state.damageCooldown <= 0) {
      scatterRingsFromDamage(state, 8);
      state.message = "Ring burst on impact.";
      state.status = "Hit";
      if (state.lastCheckpoint) {
        state.player.x = state.lastCheckpoint.x;
        state.player.y = state.lastCheckpoint.y;
        state.player.vx = 0;
        state.player.vy = 0;
        state.player.attached = true;
      }
      if (state.health <= 0) {
        state.mode = "lose";
        state.status = "Lost";
        state.message = "Run failed.";
      }
    }
    if (state.player.y > world.fallY) {
      state.mode = "lose";
      state.status = "Lost";
      state.message = "Fallout.";
    }

    if (state.player.x >= world.finish.x) {
      state.mode = "win";
      state.status = "Finished";
      state.message = "Loop cleared.";
    }

    const transition = getModeTransition(state.mode, {
      health: state.health,
      rings: state.rings.collected,
      timer: state.timer,
    });
    if (transition) {
      state.mode = transition.mode;
      state.status = transition.status;
      state.message = transition.message;
    }

    this.frameState = buildFrameState(state, track);
  }

  resetToMenu() {
    this.state = createRuntimeState();
    this.frameState = buildFrameState(this.state, sampleTrack(this.state.world));
  }

  getFrameState() {
    return this.frameState;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
