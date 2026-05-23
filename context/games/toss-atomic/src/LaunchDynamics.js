import { LAUNCH, PHYSICS, RUN_STATES, WORLD } from "./constants.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const mag = Math.hypot(x, y) || 1;
  return [x / mag, y / mag];
}

export class LaunchDynamics {
  constructor(options = {}) {
    this.boundGame = options && typeof options === "object" && "projectile" in options ? options : null;
    this.trails = arguments.length > 1 ? arguments[1] : options?.trails ?? null;
    this.config = {
      gravity: options.gravity ?? options?.game?.gravity ?? PHYSICS.gravity,
      airDrag: options.airDrag ?? PHYSICS.airDrag,
      linearDamping: options.linearDamping ?? PHYSICS.linearDamping,
      angularDamping: options.angularDamping ?? PHYSICS.angularDamping,
      maxSpeed: options.maxSpeed ?? PHYSICS.maxSpeed,
      maxDownwardSpeed: options.maxDownwardSpeed ?? PHYSICS.maxDownwardSpeed,
      maxUpwardSpeed: options.maxUpwardSpeed ?? PHYSICS.maxUpwardSpeed,
      terminalSpeed: options.terminalSpeed ?? PHYSICS.terminalSpeed,
      midairThrust: options.midairThrust ?? LAUNCH.midairThrust,
      midairLift: options.midairLift ?? LAUNCH.midairLift,
      midairFuelMax: options.midairFuelMax ?? LAUNCH.midairFuelMax,
      fuelDrainPerSecond: options.fuelDrainPerSecond ?? LAUNCH.fuelDrainPerSecond,
      fuelRegenPerSecond: options.fuelRegenPerSecond ?? LAUNCH.fuelRegenPerSecond,
      altitudeAssist: options.altitudeAssist ?? LAUNCH.altitudeAssist,
      speedCapBuffer: options.speedCapBuffer ?? LAUNCH.speedCapBuffer,
    };

    this.state = {
      mode: RUN_STATES.READY,
      elapsed: 0,
      launchTimer: 0,
      fuelSpent: 0,
      maxSpeed: 0,
      lastThrust: 0,
      lastLift: 0,
      currentImpulse: 0,
      currentAngle: 0,
      launchVector: [0, 0],
    };
  }

  reset() {
    this.state.mode = RUN_STATES.READY;
    this.state.elapsed = 0;
    this.state.launchTimer = 0;
    this.state.fuelSpent = 0;
    this.state.maxSpeed = 0;
    this.state.lastThrust = 0;
    this.state.lastLift = 0;
    this.state.currentImpulse = 0;
    this.state.currentAngle = 0;
    this.state.launchVector = [0, 0];
  }

  resetProjectile() {
    if (!this.boundGame) {
      return;
    }
    const projectile = this.boundGame.projectile;
    projectile.active = false;
    projectile.launched = false;
    projectile.settled = false;
    projectile.x = this.boundGame.launcher.x;
    projectile.y = this.boundGame.launcher.y;
    projectile.vx = 0;
    projectile.vy = 0;
    projectile.age = 0;
    projectile.trailAge = 0;
    projectile.speed = 0;
    projectile.launchOriginX = this.boundGame.launcher.x;
    projectile.launchOriginY = this.boundGame.launcher.y;
  }

  launchToward(pointer) {
    if (!this.boundGame) {
      return false;
    }

    const canLaunch =
      typeof this.boundGame.canLaunch === "function"
        ? this.boundGame.canLaunch()
        : !this.boundGame.projectile?.active;

    if (!canLaunch) {
      return false;
    }

    const origin = this.boundGame.launcher;
    const target = pointer ?? this.boundGame.pointer ?? origin;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const distance = Math.max(length(dx, dy), 1);
    const aimX = dx / distance;
    const aimY = dy / distance;
    const power = clamp(distance / 560, 0.36, 1);
    const speed = LAUNCH.releasePowerMin + (LAUNCH.releasePowerMax - LAUNCH.releasePowerMin) * power;

    this.boundGame.projectile.active = true;
    this.boundGame.projectile.launched = true;
    this.boundGame.projectile.x = origin.x;
    this.boundGame.projectile.y = origin.y;
    this.boundGame.projectile.vx = aimX * speed;
    this.boundGame.projectile.vy = aimY * speed - 160;
    this.boundGame.projectile.radius = this.boundGame.projectile.radius ?? 15;
    this.boundGame.projectile.age = 0;
    this.boundGame.projectile.trailAge = 0;
    this.boundGame.projectile.launchOriginX = origin.x;
    this.boundGame.projectile.launchOriginY = origin.y;
    this.boundGame.message = "Capsule in flight.";
    return true;
  }

  primeLaunch(entity, { power = 1, angle = 0, spin = 0 } = {}) {
    const launchPower = clamp(power, 0, 1);
    const launchSpeed =
      LAUNCH.releasePowerMin +
      (LAUNCH.releasePowerMax - LAUNCH.releasePowerMin) * launchPower;
    const releaseAngle = clamp(angle, LAUNCH.releaseAngleMin, LAUNCH.releaseAngleMax);

    entity.vx = Math.cos(releaseAngle) * launchSpeed;
    entity.vy = -Math.sin(releaseAngle) * launchSpeed;
    entity.spin = clamp(spin, LAUNCH.releaseSpinMin, LAUNCH.releaseSpinMax);
    entity.grounded = false;
    entity.launched = true;
    entity.active = true;
    entity.settled = false;
    entity.combo = 0;
    entity.impactCooldown = 0;
    entity.speed = launchSpeed;
    entity.launchOriginX = entity.launchOriginX ?? entity.x;
    entity.launchOriginY = entity.launchOriginY ?? entity.y;
    this.state.mode = RUN_STATES.LAUNCHED;
    this.state.currentImpulse = launchSpeed;
    this.state.currentAngle = releaseAngle;
    this.state.launchVector = normalize(entity.vx, entity.vy);
  }

  update(...args) {
    if (args.length === 1 && typeof args[0] === "number" && this.boundGame) {
      return this.updateBoundGame(args[0]);
    }
    return this.updateEntity(...args);
  }

  updateEntity(entity, input = {}, dt = 1 / 60, context = {}) {
    const events = [];
    this.state.elapsed += dt;
    this.state.launchTimer += dt;

    const launched = entity.launched ?? entity.active ?? false;
    if (!launched) {
      if (entity.fuel !== undefined) {
        entity.fuel = clamp((entity.fuel ?? this.config.midairFuelMax) + this.config.fuelRegenPerSecond * dt, 0, this.config.midairFuelMax);
      }
      return {
        entity,
        events,
        mode: this.state.mode,
        speed: 0,
        altitude: context.altitude ?? 0,
      };
    }

    const controls = {
      left: Boolean(input.left),
      right: Boolean(input.right),
      up: Boolean(input.up),
      down: Boolean(input.down),
    };

    const controlX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const controlY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
    const moveIntent = length(controlX, controlY);
    const hasFuel = entity.fuel === undefined ? true : entity.fuel > 0.0001;
    let thrustApplied = 0;
    let liftApplied = 0;

    if (moveIntent > 0 && hasFuel) {
      const [nx, ny] = normalize(controlX, controlY);
      const thrustScale = this.config.midairThrust * dt * (0.3 + 0.7 * moveIntent);
      const liftScale = this.config.midairLift * dt * (controls.up ? 1 : 0.25 + 0.25 * controls.down);

      entity.vx += nx * thrustScale;
      entity.vy += ny * thrustScale * 0.78;
      entity.vy -= liftScale * this.config.gravity;
      entity.spin += nx * 3.4 * dt;
      if (entity.fuel !== undefined) {
        entity.fuel = clamp(entity.fuel - this.config.fuelDrainPerSecond * dt * (1 + moveIntent * 0.8), 0, this.config.midairFuelMax);
      }
      thrustApplied = thrustScale;
      liftApplied = liftScale;

      events.push({
        type: "thrust",
        x: entity.x,
        y: entity.y,
        intensity: thrustScale,
        vx: entity.vx,
        vy: entity.vy,
      });
    } else {
      if (entity.fuel !== undefined) {
        entity.fuel = clamp(entity.fuel + this.config.fuelRegenPerSecond * dt, 0, this.config.midairFuelMax);
      }
    }

    const altitudeAssist = clamp((context.altitude ?? 0) / 620, 0, 1) * this.config.altitudeAssist;
    entity.vy -= altitudeAssist * this.config.gravity * dt * 0.2;

    entity.vy += this.config.gravity * dt;
    entity.vx *= Math.pow(Math.max(0.72, this.config.linearDamping - this.config.airDrag * dt * 60), dt * 60);
    entity.vy *= Math.pow(this.config.linearDamping, dt * 60);
    entity.spin *= Math.pow(this.config.angularDamping, dt * 60);

    const speed = length(entity.vx, entity.vy);
    entity.speed = speed;
    const launchOriginX = context.launchOriginX ?? entity.launchOriginX ?? entity.x;
    entity.distance = Math.max(entity.distance ?? 0, Math.abs(entity.x - launchOriginX));
    if (speed > this.config.maxSpeed) {
      const ratio = this.config.maxSpeed / speed;
      entity.vx *= ratio;
      entity.vy *= ratio;
      events.push({
        type: "speedCap",
        x: entity.x,
        y: entity.y,
        speed,
        cappedTo: this.config.maxSpeed,
      });
    }

    if (entity.vy > this.config.maxDownwardSpeed) {
      entity.vy = this.config.maxDownwardSpeed;
      events.push({ type: "downwardClamp", x: entity.x, y: entity.y });
    }

    if (entity.vy < -this.config.maxUpwardSpeed) {
      entity.vy = -this.config.maxUpwardSpeed;
      events.push({ type: "upwardClamp", x: entity.x, y: entity.y });
    }

    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;

    entity.x = clamp(entity.x, 0, WORLD.width);
    entity.y = clamp(entity.y, WORLD.skyTop - 250, WORLD.height + 500);

    entity.airborne = true;
    entity.altitude = context.altitude ?? entity.altitude ?? 0;
    entity.distance = Math.max(entity.distance, entity.x);
    entity.maxSpeed = Math.max(entity.maxSpeed, speed);
    entity.maxAltitude = Math.max(entity.maxAltitude, entity.altitude);
    entity.airtime += dt;
    entity.lastControl = { ...controls };

    this.state.maxSpeed = Math.max(this.state.maxSpeed, speed);
    this.state.lastThrust = thrustApplied;
    this.state.lastLift = liftApplied;
    this.state.launchVector = normalize(entity.vx, entity.vy);
    this.state.currentImpulse = speed;
    this.state.currentAngle = Math.atan2(-entity.vy, entity.vx);
    this.state.mode = RUN_STATES.AIRBORNE;

    return {
      entity,
      events,
      mode: this.state.mode,
      speed,
      altitude: entity.altitude,
    };
  }

  updateBoundGame(dt = 1 / 60) {
    if (!this.boundGame) {
      return null;
    }

    const projectile = this.boundGame.projectile;
    if (!projectile.active) {
      return {
        entity: projectile,
        events: [],
        mode: this.state.mode,
        speed: 0,
        altitude: 0,
      };
    }

    const controls = this.boundGame.controls ?? this.boundGame.input ?? {};
    const result = this.updateEntity(projectile, controls, dt, {
      altitude: projectile.altitude ?? 0,
      launchOriginX: projectile.launchOriginX ?? this.boundGame.launcher?.x,
    });

    if (this.trails && typeof this.trails.emitTrail === "function") {
      this.trails.emitTrail(projectile.x, projectile.y, projectile.vx, projectile.vy);
    }

    return result;
  }

  peekTrajectory(entity, seconds = 1, step = 1 / 30, gravity = this.config.gravity) {
    const result = [];
    let x = entity.x;
    let y = entity.y;
    let vx = entity.vx;
    let vy = entity.vy;

    for (let t = 0; t < seconds; t += step) {
      vy += gravity * step;
      x += vx * step;
      y += vy * step;
      result.push({ x, y, vx, vy, t: t + step });
    }

    return result;
  }
}

export function createLaunchDynamics(options) {
  return new LaunchDynamics(options);
}

export default LaunchDynamics;
