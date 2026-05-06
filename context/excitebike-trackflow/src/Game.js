import {
  GAME_MODE,
  createState,
  enterCrashState,
  enterResultState,
  resetForStart,
} from "./state.js";
import { TRACK, getTerrainEffect, getFinishProgress, getUpcomingFeature, getUpcomingFeatures, isFinishLine, sampleTrack } from "./track.js";

export class Game {
  constructor() {
    this.state = createState();
    this.started = false;
    this.viewport = { width: 1280, height: 720, dpr: 1 };
  }

  resize(width, height) {
    if (typeof width === "object" && width !== null) {
      this.viewport = { ...this.viewport, ...width };
      return;
    }
    this.viewport = {
      ...this.viewport,
      width: Number.isFinite(width) ? width : this.viewport.width,
      height: Number.isFinite(height) ? height : this.viewport.height,
    };
  }

  start() {
    this.started = true;
    this.state = resetForStart(this.state);
  }

  restart(full = true) {
    this.started = true;
    this.state = resetForStart(createState());
    this.state.message = full ? "Full restart. Track open." : "Back on track.";
  }

  update(dt, input) {
    if (!this.started && this.state.mode === GAME_MODE.MENU) return;
    if (this.state.mode === GAME_MODE.CRASH) {
      this.state.crashTimer = Math.max(0, this.state.crashTimer - dt);
      if (this.state.crashTimer === 0) {
        this.state = enterResultState(this.state, false, "Crash recovery failed. Press Start to restart.");
      }
      return;
    }
    if (this.state.mode === GAME_MODE.WIN || this.state.mode === GAME_MODE.LOSE) return;
    if (this.state.mode !== GAME_MODE.PLAY) return;

    const terrain = getTerrainEffect(this.state.distance);
    const throttle = input?.up ? 1 : 0;
    const brake = input?.down ? 1 : 0;
    const steer = (input?.right ? 1 : 0) - (input?.left ? 1 : 0);

    if (this.state.launchAssistTimer > 0) {
      this.state.launchAssistTimer = Math.max(0, this.state.launchAssistTimer - dt);
      if (!brake) {
        this.state.speed = Math.max(this.state.speed, 180);
      }
      if (!throttle) {
        this.state.message = "Hold Up to keep pace and Left/Right to level the bike over jumps.";
      }
    }

    this.state.rider.lean = clamp(this.state.rider.lean + steer * dt * 3.5, -1, 1);
    this.state.rider.lean *= Math.pow(0.28, dt);

    const accel = throttle * TRACK.accel * terrain.traction - brake * TRACK.brake;
    this.state.speed = clamp(this.state.speed + accel * dt, 0, TRACK.maxSpeed);
    if (terrain.isBoost) this.state.speed = clamp(this.state.speed + terrain.boost * dt, 0, TRACK.maxSpeed);
    if (terrain.isMud) this.state.speed = clamp(this.state.speed - (1 - terrain.traction) * 220 * dt, 0, TRACK.maxSpeed);

    this.state.distance = Math.min(TRACK.length, this.state.distance + this.state.speed * dt);
    this.state.time += dt;
    this.state.heat = clamp(this.state.heat + (throttle * 0.06 + this.state.speed / TRACK.maxSpeed * 0.02 - brake * 0.05) * dt, 0, 1);

    if (terrain.isJump) {
      this.state.rider.airborne = this.state.speed > 260;
      if (this.state.rider.airborne && Math.abs(this.state.rider.lean) > TRACK.crashLeanLimit) {
        this.state = enterCrashState(this.state, "Landed off-balance.");
        return;
      }
    }

    if (isFinishLine(this.state.distance)) {
      this.state.lap += 1;
      this.state.distance = this.state.distance % TRACK.finishX;
      this.state.message = this.state.lap > this.state.lapsTotal ? "Finish line clear." : `Lap ${this.state.lap}/${this.state.lapsTotal}.`;
    }

    if (this.state.lap > this.state.lapsTotal) {
      this.state = enterResultState(this.state, true, "Race won. Press Start for another run.");
      return;
    }

    const groundY = sampleTrack(this.state.distance);
    this.state.rider.y = groundY;
    this.state.rider.x = 120 + getFinishProgress(this.state.distance) * 900;

    if (this.state.heat >= 1 && this.state.speed < 160) {
      this.state = enterCrashState(this.state, "Heat spike. Crash.");
    }
    this.state.result.completed = false;
  }

  getFrameState() {
    return {
      ...this.state,
      width: this.viewport.width,
      height: this.viewport.height,
      track: TRACK,
      viewport: this.viewport,
      worldOffset: Math.max(0, this.state.distance - 240),
      sampledGround: sampleTrack(this.state.distance),
      finishProgress: getFinishProgress(this.state.distance),
      terrain: getTerrainEffect(this.state.distance),
      nextFeature: getUpcomingFeature(this.state.distance),
      upcomingFeatures: getUpcomingFeatures(this.state.distance),
    };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
