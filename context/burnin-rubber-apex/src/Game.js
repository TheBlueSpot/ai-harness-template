import {
  CHECKPOINTS,
  FINISH_DISTANCE,
  RIVALS,
  ROAD_HALF_WIDTH,
  SEGMENT_LENGTH,
  TRACK_LENGTH,
  getRoadCenter,
  getRoadCurve,
  getTrafficDensity,
  getTrafficPhase,
} from "./data.js";

const DEFAULT_SIZE = { width: 1280, height: 720, dpr: 1 };

export class Game {
  constructor(options = {}) {
    this.size = { ...DEFAULT_SIZE, ...(options.size ?? {}) };
    this.input = createInput();
    this.restart();
  }

  resize(widthOrSize, height) {
    if (typeof widthOrSize === "object" && widthOrSize) {
      this.size = {
        width: widthOrSize.width ?? this.size.width,
        height: widthOrSize.height ?? this.size.height,
        dpr: widthOrSize.dpr ?? this.size.dpr,
      };
      return;
    }
    this.size = { ...this.size, width: widthOrSize, height };
  }

  setInput(input) {
    this.input = {
      ...this.input,
      ...input,
      pointer: { ...this.input.pointer, ...(input?.pointer ?? {}) },
    };
  }

  restart() {
    this.mode = "menu";
    this.time = 0;
    this.stateTime = 0;
    this.message = "Drift corners, bank boost, clear checkpoints.";
    this.distance = 0;
    this.speed = 0;
    this.lane = 0;
    this.heading = 0;
    this.boost = 0;
    this.driftCharge = 0;
    this.driftSide = 0;
    this.timer = 27;
    this.health = 100;
    this.impactCooldown = 0;
    this.score = 0;
    this.takedowns = 0;
    this.takedownsSinceCheckpoint = 0;
    this.checkpointIndex = 0;
    this.checkpointPulse = 0;
    this.trafficSeed = 1;
    this.finishTime = 0;
    this.rivals = RIVALS.map((rival) => ({ ...rival, active: true, stun: 0, blaze: 0 }));
    this.traffic = [];
    this.spawnDistance = 520;
    this.lastTrafficSweep = -1;
    this.frame = this.buildFrameState();
  }

  start() {
    if (this.mode === "menu" || this.mode === "gameover" || this.mode === "win") {
      this.mode = "countdown";
      this.stateTime = 0;
      this.message = "Engines up.";
    }
  }

  update(dt, input = this.input) {
    this.setInput(input);
    const frameDt = Math.min(0.033, Math.max(0, dt || 0));
    this.time += frameDt;
    this.stateTime += frameDt;

    if (this.input.restart) {
      this.restart();
      return;
    }
    if (this.input.start) {
      this.start();
    }

    if (this.mode === "menu" || this.mode === "gameover" || this.mode === "win") {
      this.frame = this.buildFrameState();
      return;
    }

    if (this.mode === "countdown") {
      const remaining = Math.max(0, 3 - this.stateTime);
      this.message = remaining > 0.05 ? `Launch in ${Math.ceil(remaining)}.` : "Go.";
      if (this.stateTime >= 3) {
        this.mode = "running";
        this.stateTime = 0;
        this.message = "Find the first apex.";
      }
      this.frame = this.buildFrameState();
      return;
    }

    this.updateRunning(frameDt);
    this.frame = this.buildFrameState();
  }

  updateRunning(dt) {
    this.checkpointPulse = Math.max(0, this.checkpointPulse - dt * 2.4);
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this.mode = "gameover";
      this.finishTime = this.time;
      this.message = "Clock empty.";
      return;
    }

    const steerInput = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    const accelInput = this.input.accelerate ? 1 : 0;
    const brakeInput = this.input.brake ? 1 : 0;
    const roadCurve = getRoadCurve(this.distance);
    const drifting = Math.abs(steerInput) > 0 && this.speed > 132;
    const boostFire = this.input.boost && this.boost > 0.08;

    let targetSpeed = 118 + accelInput * 110 - brakeInput * 84;
    if (boostFire) {
      const spend = Math.min(this.boost, dt * 0.52);
      this.boost = Math.max(0, this.boost - spend);
      targetSpeed += 150 + spend * 180;
      this.message = "Boost line lit.";
    } else if (this.speed > 122) {
      this.boost = Math.max(0, this.boost - dt * 0.03);
    }

    if (drifting) {
      const gain = dt * (0.22 + Math.min(1, Math.abs(steerInput)) * 0.18);
      this.driftCharge = clamp(this.driftCharge + gain, 0, 1);
      this.driftSide = steerInput;
      this.message = this.driftCharge > 0.58 ? "Boost primed. Straighten or fire it." : "Drift loading.";
    } else {
      if (this.driftCharge > 0.22) {
        this.boost = clamp(this.boost + this.driftCharge * 0.68, 0, 1);
        this.message = "Apex banked.";
      }
      this.driftCharge = Math.max(0, this.driftCharge - dt * 1.4);
      this.driftSide = 0;
    }

    const drag = this.speed > targetSpeed ? 1.9 : 1.15;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * drag);
    this.speed = clamp(this.speed, 60, 305);

    const laneResponse = this.speed > 180 ? 0.77 : 0.95;
    this.heading += (steerInput * laneResponse - roadCurve * 0.92 - this.lane * 0.28) * dt * 2.2;
    this.heading *= this.input.accelerate ? 0.88 : 0.83;
    this.lane += this.heading * dt * 1.4;
    this.lane = clamp(this.lane, -1.28, 1.28);

    if (Math.abs(this.lane) > 0.96) {
      this.speed = Math.max(82, this.speed - 110 * dt);
      this.health = Math.max(0, this.health - 12 * dt);
      this.message = "Shoulder scrape.";
    }

    const lanePenalty = Math.max(0, Math.abs(this.lane) - 0.82);
    if (lanePenalty > 0) {
      this.speed = Math.max(78, this.speed - lanePenalty * 180 * dt);
    }

    this.distance += this.speed * dt;
    this.updateTraffic(dt);
    this.updateRivals(dt);
    this.checkCollisions(dt, boostFire);
    this.resolveCheckpoint();

    if (this.health <= 0) {
      this.mode = "gameover";
      this.finishTime = this.time;
      this.message = "Car totaled.";
      return;
    }

    if (this.distance >= FINISH_DISTANCE) {
      this.distance = FINISH_DISTANCE;
      this.mode = "win";
      this.finishTime = this.time;
      this.message = "Final checkpoint clear.";
    }
  }

  updateTraffic(dt) {
    const sweep = Math.floor(this.distance / 240);
    if (sweep !== this.lastTrafficSweep) {
      this.lastTrafficSweep = sweep;
      const density = getTrafficDensity(this.distance);
      const spawnCount = density > 1 ? 3 : density > 0.55 ? 2 : 1;
      for (let i = 0; i < spawnCount; i += 1) {
        this.spawnTrafficCar(this.distance + 340 + i * 120 + random01(++this.trafficSeed) * 140);
      }
    }

    this.traffic = this.traffic.filter((car) => car.distance > this.distance - 120);
    for (const car of this.traffic) {
      car.distance += car.speed * dt;
      car.phase += dt;
      car.lane += Math.sin(car.phase * car.weaveRate) * car.weaveAmount * dt;
      car.lane = clamp(car.lane, -0.72, 0.72);
      car.hit = Math.max(0, car.hit - dt * 2.4);
    }
  }

  spawnTrafficCar(distance) {
    if (distance >= FINISH_DISTANCE + 220) return;
    const laneSeed = random01(++this.trafficSeed);
    const speedSeed = random01(++this.trafficSeed);
    const offsetSeed = random01(++this.trafficSeed);
    this.traffic.push({
      id: this.trafficSeed,
      distance,
      lane: -0.62 + laneSeed * 1.24,
      speed: 116 + speedSeed * 46 + getTrafficDensity(this.distance) * 10,
      color: offsetSeed > 0.66 ? "#ff6161" : offsetSeed > 0.33 ? "#56c7ff" : "#ffd666",
      phase: random01(++this.trafficSeed) * Math.PI * 2,
      weaveRate: 0.8 + random01(++this.trafficSeed) * 1.6,
      weaveAmount: 0.02 + random01(++this.trafficSeed) * 0.08,
      hit: 0,
    });
  }

  updateRivals(dt) {
    for (const rival of this.rivals) {
      if (!rival.active) continue;
      rival.distance += rival.speed * dt;
      rival.stun = Math.max(0, rival.stun - dt);
      rival.blaze = Math.max(0, rival.blaze - dt);

      const targetLane = Math.sin((rival.distance + rival.speed) * 0.0033) * 0.42;
      rival.lane += (targetLane - rival.lane) * dt * 0.65;
      rival.lane = clamp(rival.lane, -0.76, 0.76);

      if (rival.distance < this.distance - 180) {
        rival.distance = this.distance + 420 + random01(++this.trafficSeed) * 220;
        rival.lane = -0.5 + random01(++this.trafficSeed) * 1;
      }
    }
  }

  checkCollisions(dt, boosting) {
    const playerRadius = 18;
    for (const car of this.traffic) {
      const dz = car.distance - this.distance;
      if (Math.abs(dz) > 24) continue;
      const laneGap = Math.abs(car.lane - this.lane);
      if (laneGap > 0.16) continue;

      if (boosting && this.speed > car.speed + 18 && dz >= -6) {
        car.distance = this.distance - 160;
        car.hit = 1;
        this.score += 160;
        this.message = "Traffic punt.";
        continue;
      }

      if (this.impactCooldown > 0 || car.hit > 0.4) continue;

      const severity = clamp((playerRadius - laneGap * 100) / playerRadius, 0.2, 1);
      this.speed = Math.max(74, this.speed - severity * 90);
      this.health = Math.max(0, this.health - severity * 12);
      car.hit = 0.85;
      this.impactCooldown = 0.32;
      this.message = "Traffic clip.";
    }

    for (const rival of this.rivals) {
      if (!rival.active) continue;
      const dz = rival.distance - this.distance;
      if (Math.abs(dz) > 26) continue;
      const laneGap = Math.abs(rival.lane - this.lane);
      if (laneGap > 0.19) continue;

      const takedown = (boosting || this.boost > 0.28 || this.driftCharge > 0.36) && this.speed > rival.speed - 4 && dz >= -4;
      if (takedown) {
        rival.active = false;
        rival.stun = 2;
        rival.blaze = 1.5;
        this.takedowns += 1;
        this.takedownsSinceCheckpoint += 1;
        this.score += 450;
        this.boost = clamp(this.boost + 0.18, 0, 1);
        this.message = `${rival.name} takedown.`;
        continue;
      }

      if (this.impactCooldown > 0) continue;

      this.speed = Math.max(88, this.speed - 60);
      this.health = Math.max(0, this.health - 16);
      this.impactCooldown = 0.42;
      this.message = `${rival.name} boxed you in.`;
    }
  }

  resolveCheckpoint() {
    const checkpointDistance = CHECKPOINTS[this.checkpointIndex];
    if (checkpointDistance === undefined) return;
    if (this.distance < checkpointDistance) return;

    const isFinish = checkpointDistance >= FINISH_DISTANCE;
    this.checkpointIndex += 1;
    this.checkpointPulse = 1;
    if (!isFinish) {
      const bonus = this.takedownsSinceCheckpoint * 1.8;
      this.timer = Math.min(42, this.timer + 9 + bonus);
      this.score += 320 + this.takedownsSinceCheckpoint * 140;
      this.message =
        this.takedownsSinceCheckpoint > 0
          ? `Checkpoint hit. +${(9 + bonus).toFixed(1)}s with takedown bonus.`
          : "Checkpoint hit. +9.0s.";
      this.takedownsSinceCheckpoint = 0;
    }
  }

  getFrameState() {
    return structuredClone(this.frame ?? this.buildFrameState());
  }

  buildFrameState() {
    return {
      mode: this.mode,
      state: this.mode,
      distance: this.distance,
      finishDistance: FINISH_DISTANCE,
      speed: this.speed,
      lane: this.lane,
      roadCenter: getRoadCenter(this.distance),
      roadCurve: getRoadCurve(this.distance),
      boost: this.boost,
      driftCharge: this.driftCharge,
      timer: this.timer,
      health: this.health,
      score: this.score,
      takedowns: this.takedowns,
      checkpointIndex: this.checkpointIndex,
      checkpointTotal: CHECKPOINTS.length,
      checkpointPulse: this.checkpointPulse,
      nextCheckpoint: buildNextCheckpoint(this.checkpointIndex, this.distance),
      trafficPhase: getTrafficPhase(this.distance),
      message: this.message,
      countdown: this.mode === "countdown" ? Math.max(0, Math.ceil(3 - this.stateTime)) : 0,
      rivalsRemaining: this.rivals.filter((rival) => rival.active).length,
      finishTime: this.finishTime,
      segments: buildViewSegments(this.distance),
      traffic: this.traffic.map((car) => ({
        distance: car.distance,
        lane: car.lane,
        color: car.color,
        hit: car.hit,
      })),
      rivals: this.rivals.map((rival) => ({
        distance: rival.distance,
        lane: rival.lane,
        color: rival.color,
        name: rival.name,
        active: rival.active,
        blaze: rival.blaze,
      })),
    };
  }
}

function buildViewSegments(distance) {
  const segments = [];
  const start = Math.floor(distance / SEGMENT_LENGTH) * SEGMENT_LENGTH;
  for (let i = 0; i < 42; i += 1) {
    const segDistance = start + i * SEGMENT_LENGTH;
    segments.push({
      distance: segDistance,
      center: getRoadCenter(segDistance),
      curve: getRoadCurve(segDistance),
      checkpoint: CHECKPOINTS.some((point) => Math.abs(point - segDistance) < SEGMENT_LENGTH * 0.5),
      finish: Math.abs(FINISH_DISTANCE - segDistance) < SEGMENT_LENGTH * 0.5,
    });
  }
  return segments;
}

function buildNextCheckpoint(checkpointIndex, distance) {
  const checkpointDistance = CHECKPOINTS[checkpointIndex];
  if (checkpointDistance === undefined) {
    return null;
  }

  return {
    distance: checkpointDistance,
    remaining: Math.max(0, checkpointDistance - distance),
    isFinish: checkpointDistance >= FINISH_DISTANCE,
    turnHint: describeTurn(getRoadCurve(Math.min(TRACK_LENGTH, checkpointDistance + 120))),
  };
}

function describeTurn(curve) {
  if (curve <= -0.26) {
    return "left";
  }
  if (curve >= 0.26) {
    return "right";
  }
  return "straight";
}

function createInput() {
  return {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    boost: false,
    start: false,
    restart: false,
    pointer: { x: 0, y: 0, active: false },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function random01(seed) {
  return fract(Math.sin(seed * 12.9898) * 43758.5453);
}

function fract(value) {
  return value - Math.floor(value);
}
