import { CITY, STANDS, TRAFFIC_ROUTES, GAME_RULES, createFareSequence, createTrafficCars } from "./data.js";
import { renderFrame } from "./render.js";

const STEP = 1 / 60;
const MAX_DT = 0.1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function getRoadInfluence(x, y) {
  const moduloX = ((x % CITY.blockSize) + CITY.blockSize) % CITY.blockSize;
  const moduloY = ((y % CITY.blockSize) + CITY.blockSize) % CITY.blockSize;
  const nearestRoadEdge = Math.min(moduloX - CITY.roadWidth, moduloY - CITY.roadWidth);

  if (nearestRoadEdge <= 0) {
    return 1;
  }

  return clamp(1 - nearestRoadEdge / CITY.roadShoulderGrace, 0, 1);
}

function getApproachState(player, stand, interactRadius, previewRadius, speedLimit) {
  const gap = distance(player, stand);
  const speed = Math.hypot(player.vx, player.vy);
  return {
    distance: gap,
    speed,
    insideInteract: gap <= interactRadius,
    insidePreview: gap <= previewRadius,
    speedReady: speed <= speedLimit,
  };
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function makeOverlay(state) {
  if (state.mode === "menu") {
    return {
      title: "Crazy Taxi Neon Fare Rush",
      copy: "Chain five fares before the clock bleeds out. Drift corners for boost, then brake inside pickup and drop-off rings.",
      action: "Start Shift",
      hint: "Press Enter or click Start Shift.",
    };
  }
  if (state.mode === "win") {
    return {
      title: "Shift Cleared",
      copy: `You banked ${state.score} fare credits and landed ${state.completedFares} clean drop-offs.`,
      action: "Run It Again",
      hint: "Press Enter or click to restart from Downtown.",
    };
  }
  if (state.mode === "lose") {
    return {
      title: "Taxi Wrecked",
      copy: state.timer <= 0 ? "Time ran dry before the city did." : "Traffic chewed through the cab before the shift ended.",
      action: "Retry Shift",
      hint: "Press Enter or click to restart fast.",
    };
  }
  return null;
}

function createPlayer() {
  return {
    x: 360,
    y: 320,
    vx: 0,
    vy: 0,
    angle: 0,
    driftCharge: 0,
    boostTimer: 0,
    health: GAME_RULES.maxHealth,
    flash: 0,
  };
}

function createTraffic() {
  return createTrafficCars().map((carDef, index) => {
    const route = TRAFFIC_ROUTES.find((entry) => entry.id === carDef.routeId);
    const t = carDef.offset;
    const car = {
      id: carDef.id,
      routeId: carDef.routeId,
      color: route.color,
      width: route.axis === "x" ? 72 : 42,
      height: route.axis === "x" ? 42 : 72,
      progress: t,
      speed: route.speed * (1 + ((index % 3) - 1) * 0.08),
      x: route.axis === "x" ? lerp(route.startX, route.endX, t) : route.x,
      y: route.axis === "y" ? lerp(route.startY, route.endY, t) : route.y,
    };
    return car;
  });
}

function createState() {
  return {
    mode: "menu",
    width: 1280,
    height: 720,
    camera: { x: 0, y: 0 },
    player: createPlayer(),
    traffic: createTraffic(),
    fareSequence: createFareSequence(),
    fareIndex: 0,
    activeFare: null,
    completedFares: 0,
    score: 0,
    timer: GAME_RULES.startTime,
    combo: 1,
    prompt: "Start the shift.",
    promptTimer: 2,
    collisionCooldown: 0,
    skidMarks: [],
  };
}

function isOnRoad(x, y) {
  return getRoadInfluence(x, y) >= 1;
}

function spawnFare(state) {
  const sequence = state.fareSequence[state.fareIndex % state.fareSequence.length];
  const pickup = STANDS.find((stand) => stand.id === sequence.pickupId);
  const dropoff = STANDS.find((stand) => stand.id === sequence.dropoffId);
  state.activeFare = {
    pickupId: pickup.id,
    dropoffId: dropoff.id,
    pickedUp: false,
    bonus: 300,
    passengerMood: "Waiting",
    pickupApproach: null,
    dropoffApproach: null,
  };
}

function updateTraffic(state, dt) {
  for (const car of state.traffic) {
    const route = TRAFFIC_ROUTES.find((entry) => entry.id === car.routeId);
    const span = route.axis === "x" ? Math.abs(route.endX - route.startX) : Math.abs(route.endY - route.startY);
    const delta = (car.speed * dt) / Math.max(1, span);
    car.progress = (car.progress + delta) % 1;
    if (route.axis === "x") {
      car.x = lerp(route.startX, route.endX, car.progress);
      car.y = route.y;
    } else {
      car.x = route.x;
      car.y = lerp(route.startY, route.endY, car.progress);
    }
  }
}

function resolveCollision(state, car) {
  if (state.collisionCooldown > 0) return;
  state.collisionCooldown = 0.8;
  state.player.health = Math.max(0, state.player.health - GAME_RULES.trafficDamage);
  state.player.flash = 0.35;
  state.combo = Math.max(1, state.combo - 0.5);
  state.prompt = "Traffic hit. Keep the cab together.";
  state.promptTimer = 1.25;
  const nx = state.player.x - car.x;
  const ny = state.player.y - car.y;
  const length = Math.max(1, Math.hypot(nx, ny));
  state.player.vx += (nx / length) * 220;
  state.player.vy += (ny / length) * 220;
}

function updatePlayer(state, input, dt) {
  const player = state.player;
  const accelerating = input.up ? 1 : 0;
  const braking = input.down ? 1 : 0;
  const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const drifting = input.drift;

  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const forwardSpeed = player.vx * forwardX + player.vy * forwardY;
  const sideSpeed = player.vx * rightX + player.vy * rightY;
  const roadInfluence = getRoadInfluence(player.x, player.y);
  const grip = lerp(CITY.offroadGrip, 1, roadInfluence);

  let engineForce = 0;
  if (accelerating) engineForce += drifting ? 420 : 620;
  if (braking) engineForce -= 520;
  if (player.boostTimer > 0) engineForce += 260;

  player.vx += forwardX * engineForce * dt;
  player.vy += forwardY * engineForce * dt;

  const turnSpeed = clamp(Math.abs(forwardSpeed) / 300, 0.3, 1.4) * (drifting ? 1.55 : 1);
  player.angle = wrapAngle(player.angle + steering * turnSpeed * dt * 2.8 * (forwardSpeed >= -20 ? 1 : -0.6));

  const sideGrip = drifting ? 1.6 : 6.8;
  player.vx -= rightX * sideSpeed * Math.min(1, sideGrip * grip * dt);
  player.vy -= rightY * sideSpeed * Math.min(1, sideGrip * grip * dt);

  const drag = lerp(CITY.offroadDrag, 0.988, roadInfluence);
  player.vx *= drag;
  player.vy *= drag;

  if (drifting && Math.abs(sideSpeed) > 70 && Math.abs(forwardSpeed) > 140) {
    player.driftCharge = clamp(player.driftCharge + dt * 1.15, 0, 1);
    state.skidMarks.push({
      x: player.x - forwardX * 24,
      y: player.y - forwardY * 24,
      life: 0.75,
    });
  } else if (!drifting && player.driftCharge > 0.2 && Math.abs(forwardSpeed) > 100) {
    player.boostTimer = clamp(player.boostTimer + player.driftCharge * 0.75, 0, 1.8);
    state.prompt = "Boost lit. Stay on the lane.";
    state.promptTimer = 0.8;
    player.driftCharge = 0;
  } else {
    player.driftCharge = Math.max(0, player.driftCharge - dt * 0.4);
  }

  player.boostTimer = Math.max(0, player.boostTimer - dt);
  player.flash = Math.max(0, player.flash - dt);
  player.x = clamp(player.x + player.vx * dt, 80, CITY.width - 80);
  player.y = clamp(player.y + player.vy * dt, 80, CITY.height - 80);
}

function updateFareState(state, dt) {
  if (!state.activeFare) {
    spawnFare(state);
  }
  const fare = state.activeFare;
  fare.bonus = Math.max(60, fare.bonus - dt * 22);

  const pickup = STANDS.find((stand) => stand.id === fare.pickupId);
  const dropoff = STANDS.find((stand) => stand.id === fare.dropoffId);
  const pickupApproach = getApproachState(
    state.player,
    pickup,
    GAME_RULES.pickupRadius,
    GAME_RULES.pickupPreviewRadius,
    GAME_RULES.pickupSpeedLimit,
  );
  const dropoffApproach = getApproachState(
    state.player,
    dropoff,
    GAME_RULES.dropoffRadius,
    GAME_RULES.dropoffPreviewRadius,
    GAME_RULES.dropoffSpeedLimit,
  );
  fare.pickupApproach = pickupApproach;
  fare.dropoffApproach = dropoffApproach;

  if (!fare.pickedUp) {
    state.prompt = `Pick up at ${pickup.label}. Lift early, then brake in the green ring.`;
    if (pickupApproach.insidePreview) {
      state.prompt = pickupApproach.speedReady
        ? `Pickup live at ${pickup.label}. Coast in now.`
        : `Approaching ${pickup.label}. Bleed speed to board.`;
    }
    if (pickupApproach.insideInteract && pickupApproach.speedReady) {
      fare.pickedUp = true;
      fare.passengerMood = "Riding";
      state.score += 80;
      state.timer = clamp(state.timer + 6, 0, 120);
      state.prompt = `${pickup.label} boarded. Burn to ${dropoff.label}.`;
      state.promptTimer = 1.25;
    }
  } else {
    state.prompt = `Drop off at ${dropoff.label}. Stay hot, then scrub speed late.`;
    if (dropoffApproach.insidePreview) {
      state.prompt = dropoffApproach.speedReady
        ? `Drop-off live at ${dropoff.label}. Set it down.`
        : `Drop-off ahead at ${dropoff.label}. Brake harder.`;
    }
    if (dropoffApproach.insideInteract && dropoffApproach.speedReady) {
      state.completedFares += 1;
      state.score += Math.round(fare.bonus * state.combo);
      state.timer = clamp(state.timer + 12, 0, 120);
      state.combo = clamp(state.combo + 0.45, 1, 4);
      state.fareIndex += 1;
      state.activeFare = null;
      state.prompt = `${dropoff.label} landed. Combo up.`;
      state.promptTimer = 1.4;
    }
  }
}

function updateSkidMarks(state, dt) {
  state.skidMarks = state.skidMarks
    .map((mark) => ({ ...mark, life: mark.life - dt }))
    .filter((mark) => mark.life > 0);
}

export class Game {
  constructor() {
    this.state = createState();
    this.accumulator = 0;
    this.lastInput = null;
  }

  start() {
    if (this.state.mode === "menu") {
      this.restart();
    }
  }

  restart() {
    this.state = createState();
    this.state.mode = "playing";
    spawnFare(this.state);
  }

  resize(width, height) {
    this.state.width = width;
    this.state.height = height;
  }

  update(dt, input) {
    const clamped = Math.min(MAX_DT, Math.max(0, dt || 0));
    this.lastInput = input;

    if (this.state.mode !== "playing") {
      if (input.confirmPressed) {
        this.restart();
      }
      return;
    }

    if (input.restartPressed) {
      this.restart();
      return;
    }

    this.accumulator += clamped;
    while (this.accumulator >= STEP) {
      this.step(STEP, input);
      this.accumulator -= STEP;
    }
  }

  step(dt, input) {
    const state = this.state;
    state.timer = Math.max(0, state.timer - dt);
    state.combo = Math.max(1, state.combo - GAME_RULES.comboDecayPerSecond * dt);
    state.collisionCooldown = Math.max(0, state.collisionCooldown - dt);
    state.promptTimer = Math.max(0, state.promptTimer - dt);

    updatePlayer(state, input, dt);
    updateTraffic(state, dt);
    updateFareState(state, dt);
    updateSkidMarks(state, dt);

    for (const car of state.traffic) {
      const hitRadius = 44;
      if (Math.abs(state.player.x - car.x) < hitRadius && Math.abs(state.player.y - car.y) < hitRadius) {
        resolveCollision(state, car);
      }
    }

    state.camera.x = clamp(state.player.x, state.width / 2, CITY.width - state.width / 2);
    state.camera.y = clamp(state.player.y, state.height / 2, CITY.height - state.height / 2);

    if (state.completedFares >= GAME_RULES.targetFares) {
      state.mode = "win";
      return;
    }

    if (state.timer <= 0 || state.player.health <= 0) {
      state.mode = "lose";
    }
  }

  getFrameState() {
    const state = this.state;
    const fare = state.activeFare;
    const pickup = fare ? STANDS.find((stand) => stand.id === fare.pickupId) : null;
    const dropoff = fare ? STANDS.find((stand) => stand.id === fare.dropoffId) : null;
    return {
      mode: state.mode,
      city: CITY,
      camera: state.camera,
      player: state.player,
      traffic: state.traffic,
      stands: STANDS,
      activeFare: fare ? { ...fare, pickup, dropoff } : null,
      skidMarks: state.skidMarks,
      hud: {
        score: state.score,
        timer: state.timer,
        health: state.player.health,
        completedFares: state.completedFares,
        targetFares: GAME_RULES.targetFares,
        combo: state.combo,
        prompt: state.promptTimer > 0 || state.mode === "playing" ? state.prompt : "",
      },
      overlay: makeOverlay(state),
    };
  }

  render(ctx) {
    renderFrame(ctx, this.getFrameState());
  }
}
