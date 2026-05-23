import { ConstraintSolver } from "./ConstraintSolver.js";
import { clamp, createBody, integrateBody, applyImpulse, dampVelocity } from "./physics.js";
import { createTerrain, getTerrainProgress } from "./terrain.js";

function controlValue(controls, leftKey, rightKey) {
  return (controls?.[leftKey] ? 1 : 0) - (controls?.[rightKey] ? 1 : 0);
}

function bodySnapshot(body) {
  return {
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    grounded: body.grounded,
    contactDepth: body.contactDepth ?? 0,
  };
}

export function createRunnerRig(options = {}) {
  const terrain = options.terrain ?? createTerrain(options.world);
  const rig = {
    terrain,
    solver: new ConstraintSolver(options.solver),
    gravity: options.gravity ?? 1800,
    groundFriction: options.groundFriction ?? 0.84,
    torso: null,
    pelvis: null,
    leftThigh: null,
    rightThigh: null,
    leftCalf: null,
    rightCalf: null,
    leftFoot: null,
    rightFoot: null,
    bodies: [],
    constraints: [],
    fallen: false,
    grounded: false,
    distance: 0,
    time: 0,
    finish: false,
    progress: 0,
    supportPhase: 0,
    gaitPhase: 0,
    stability: 1,
    lastDrive: 0,
    lastStrideSide: null,
    lastStrideTime: -Infinity,
    strideChain: 0,
    cadenceMeter: 0,
    failReason: null,
    resetSeed: options.seed ?? 0,
  };
  resetRunnerRig(rig);
  return rig;
}

export function resetRunnerRig(rig) {
  const groundY = rig.terrain.groundY;
  const baseX = 220;
  const baseY = groundY - 126;
  rig.torso = createBody("torso", baseX, baseY, 8.5, 18);
  rig.pelvis = createBody("pelvis", baseX, baseY + 34, 6.8, 16);
  rig.leftThigh = createBody("leftThigh", baseX - 12, baseY + 54, 3.2, 11);
  rig.rightThigh = createBody("rightThigh", baseX + 12, baseY + 54, 3.2, 11);
  rig.leftCalf = createBody("leftCalf", baseX - 16, baseY + 108, 2.5, 9);
  rig.rightCalf = createBody("rightCalf", baseX + 16, baseY + 108, 2.5, 9);
  rig.leftFoot = createBody("leftFoot", baseX - 18, groundY - 4, 1.1, 7);
  rig.rightFoot = createBody("rightFoot", baseX + 18, groundY - 4, 1.1, 7);
  rig.bodies = [rig.torso, rig.pelvis, rig.leftThigh, rig.rightThigh, rig.leftCalf, rig.rightCalf, rig.leftFoot, rig.rightFoot];
  rig.constraints = [
    { type: "distance", a: rig.torso, b: rig.pelvis, length: 34 },
    { type: "distance", a: rig.pelvis, b: rig.leftThigh, length: 54 },
    { type: "distance", a: rig.pelvis, b: rig.rightThigh, length: 54 },
    { type: "distance", a: rig.leftThigh, b: rig.leftCalf, length: 54 },
    { type: "distance", a: rig.rightThigh, b: rig.rightCalf, length: 54 },
    { type: "distance", a: rig.leftCalf, b: rig.leftFoot, length: 28 },
    { type: "distance", a: rig.rightCalf, b: rig.rightFoot, length: 28 },
    { type: "ground", body: rig.leftFoot },
    { type: "ground", body: rig.rightFoot },
  ];
  rig.fallen = false;
  rig.grounded = true;
  rig.distance = 0;
  rig.time = 0;
  rig.finish = false;
  rig.progress = 0;
  rig.supportPhase = 0;
  rig.gaitPhase = 0;
  rig.stability = 1;
  rig.lastDrive = 0;
  rig.lastStrideSide = null;
  rig.lastStrideTime = -Infinity;
  rig.strideChain = 0;
  rig.cadenceMeter = 0;
  rig.failReason = null;
  return rig;
}

function applyControls(rig, controls) {
  const leftDrive = controlValue(controls, "q", "w");
  const rightDrive = controlValue(controls, "o", "p");
  const leftPulse = Math.max(0, leftDrive);
  const rightPulse = Math.max(0, rightDrive);
  const reverse = Math.max(0, -leftDrive) + Math.max(0, -rightDrive);
  const drive = leftPulse + rightPulse;
  const activeSide = leftPulse > rightPulse ? "left" : rightPulse > leftPulse ? "right" : null;
  const gap = rig.time - rig.lastStrideTime;
  let cadenceBurst = 0;
  rig.lastDrive = drive;
  rig.gaitPhase = (rig.gaitPhase + (0.7 + drive * 0.4) * 0.016) % 1;
  rig.supportPhase = leftPulse >= rightPulse ? 0 : 0.5;

  if (activeSide) {
    const swappedSide = rig.lastStrideSide && rig.lastStrideSide !== activeSide;
    const onBeat = swappedSide && gap >= 0.12 && gap <= 0.4;
    if (swappedSide) {
      rig.strideChain = onBeat ? Math.min(6, rig.strideChain + 1) : 1;
      cadenceBurst = onBeat ? 160 + rig.strideChain * 18 : 72;
      rig.cadenceMeter = onBeat ? 1 : 0.45;
    } else if (!rig.lastStrideSide) {
      rig.strideChain = 1;
      cadenceBurst = 42;
      rig.cadenceMeter = 0.3;
    } else {
      rig.strideChain = Math.max(0, rig.strideChain - 0.03);
      rig.cadenceMeter = Math.max(0.1, rig.cadenceMeter * 0.985);
    }
    if (swappedSide || !rig.lastStrideSide) {
      rig.lastStrideSide = activeSide;
      rig.lastStrideTime = rig.time;
    }
  } else {
    rig.cadenceMeter *= 0.95;
    rig.strideChain = Math.max(0, rig.strideChain - 0.05);
  }

  const alternating = leftPulse - rightPulse;
  const forwardKick = cadenceBurst + drive * 18 - reverse * 120;
  const leanKick = alternating * 0.9;
  const lift = Math.sin(rig.gaitPhase * Math.PI * 2) * 0.5 + drive * 0.12;
  const rootX = (rig.torso.x + rig.pelvis.x) * 0.5;
  const idleDrift = Math.max(0, rootX - 220);

  if (drive === 0 && reverse === 0 && idleDrift > 0) {
    const correction = Math.min(48, idleDrift * 0.5);
    applyImpulse(rig.torso, -correction, 0);
    applyImpulse(rig.pelvis, -correction * 0.95, 0);
    applyImpulse(rig.leftFoot, Math.max(-10, (202 - rig.leftFoot.x) * 0.25), 0);
    applyImpulse(rig.rightFoot, Math.min(10, (238 - rig.rightFoot.x) * 0.25), 0);
    rig.torso.x += (220 - rig.torso.x) * 0.035;
    rig.pelvis.x += (220 - rig.pelvis.x) * 0.045;
    rig.leftFoot.x += (202 - rig.leftFoot.x) * 0.08;
    rig.rightFoot.x += (238 - rig.rightFoot.x) * 0.08;
    dampVelocity(rig.torso, 0.82);
    dampVelocity(rig.pelvis, 0.82);
    dampVelocity(rig.leftFoot, 0.84);
    dampVelocity(rig.rightFoot, 0.84);
  }

  applyImpulse(rig.torso, forwardKick * 0.18, -Math.abs(leanKick) * 10);
  applyImpulse(rig.pelvis, forwardKick * 0.14, -lift * 5);
  applyImpulse(rig.leftThigh, leftPulse * 72 - rightPulse * 18, leftPulse * 10 - reverse * 4);
  applyImpulse(rig.rightThigh, rightPulse * 72 - leftPulse * 18, rightPulse * 10 - reverse * 4);
  applyImpulse(rig.leftCalf, leftPulse * 48 - rightPulse * 12, -leftPulse * 10);
  applyImpulse(rig.rightCalf, rightPulse * 48 - leftPulse * 12, -rightPulse * 10);
  applyImpulse(rig.leftFoot, leftPulse * 30 - rightPulse * 6, -lift * 7);
  applyImpulse(rig.rightFoot, rightPulse * 30 - leftPulse * 6, -lift * 7);
}

function settlePose(rig, dt) {
  const supportFoot = rig.leftFoot.grounded && !rig.rightFoot.grounded ? rig.leftFoot : rig.rightFoot.grounded && !rig.leftFoot.grounded ? rig.rightFoot : null;
  const anchorX = supportFoot ? supportFoot.x : (rig.leftFoot.x + rig.rightFoot.x) * 0.5;
  const supportY = supportFoot ? supportFoot.y : Math.min(rig.leftFoot.y, rig.rightFoot.y);
  const lean = clamp((rig.torso.x - anchorX) / 140, -2, 2);
  const torsoLow = rig.torso.y > supportY + 84;
  const overLean = Math.abs(lean) > 1.15;
  const lossOfSupport = !rig.leftFoot.grounded && !rig.rightFoot.grounded && rig.time > 0.45;
  const badCadence = rig.lastDrive < 0.25 && rig.time > 0.8;
  const stability = clamp(1 - Math.abs(lean) * 0.55 - (torsoLow ? 0.35 : 0) - (lossOfSupport ? 0.15 : 0), 0, 1);
  rig.stability = stability;

  if (!rig.fallen && (overLean || torsoLow || (badCadence && rig.supportPhase > 0.9) || (lossOfSupport && stability < 0.42))) {
    rig.fallen = true;
    rig.failReason = overLean ? "over-lean" : torsoLow ? "collapse" : badCadence ? "bad-timing" : "loss-of-support";
  }

  if (rig.fallen) {
    rig.torso.vx *= 0.985;
    rig.torso.vy += 220 * dt;
    rig.pelvis.vx *= 0.99;
    rig.pelvis.vy += 160 * dt;
  } else {
    rig.torso.x += (anchorX + lean * 16 - rig.torso.x) * 0.08;
    rig.torso.y += (supportY - 118 - rig.torso.y) * 0.03;
    rig.pelvis.x += (anchorX - rig.pelvis.x) * 0.06;
  }
  return lean;
}

export function stepRunnerRig(rig, controls = {}, dt = 1 / 60, world = {}) {
  const safeDt = Math.max(0, dt);
  rig.time += safeDt;
  const terrain = world.terrain ?? rig.terrain;
  applyControls(rig, controls);
  for (const body of rig.bodies) integrateBody(body, safeDt, rig.gravity, rig.fallen ? 0.992 : 0.996);
  rig.solver.step(rig.bodies, rig.constraints, terrain);
  const lean = settlePose(rig, safeDt);
  const leftGround = rig.leftFoot.grounded;
  const rightGround = rig.rightFoot.grounded;
  rig.grounded = leftGround || rightGround;

  const forward = (rig.torso.x + rig.pelvis.x) * 0.5;
  rig.distance = Math.max(rig.distance, Math.max(0, forward - 220));
  rig.progress = getTerrainProgress(terrain, forward);
  rig.finish = terrain.reachedFinish(forward);
  if (rig.fallen && rig.grounded && rig.stability > 0.75 && Math.abs(lean) < 0.38 && rig.lastDrive > 0.45) {
    rig.fallen = false;
    rig.failReason = null;
  }

  if (rig.fallen) {
    dampVelocity(rig.torso, 0.94);
    dampVelocity(rig.pelvis, 0.94);
  }

  return {
    phase: rig.finish ? "finish" : rig.fallen ? "fail" : "run",
    distance: rig.distance,
    time: rig.time,
    progress: rig.progress,
    fallen: rig.fallen,
    grounded: rig.grounded,
    lean,
    stability: rig.stability,
    failReason: rig.failReason,
    runner: {
      bodies: Object.fromEntries(rig.bodies.map((body) => [body.name, bodySnapshot(body)])),
      joints: rig.constraints.filter((constraint) => constraint.type === "distance").map((constraint) => ({
        a: constraint.a.name,
        b: constraint.b.name,
        length: constraint.length,
      })),
      torso: bodySnapshot(rig.torso),
      pelvis: bodySnapshot(rig.pelvis),
      leftFoot: bodySnapshot(rig.leftFoot),
      rightFoot: bodySnapshot(rig.rightFoot),
      supportPhase: rig.supportPhase,
      gaitPhase: rig.gaitPhase,
      cadenceMeter: rig.cadenceMeter,
      strideChain: rig.strideChain,
      strideSide: rig.lastStrideSide,
    },
    world: {
      groundY: terrain.groundY,
      finishX: terrain.finishX,
      startX: terrain.startX ?? 220,
      progress: rig.progress,
      distance: rig.distance,
      terrain,
    },
  };
}
