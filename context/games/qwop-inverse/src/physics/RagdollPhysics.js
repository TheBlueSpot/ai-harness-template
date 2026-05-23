import { CONFIG } from "../config.js";
import { ConstraintSolver } from "./ConstraintSolver.js";

function makeBody(name, x, y, mass, radius) {
  return { name, x, y, vx: 0, vy: 0, mass, invMass: mass > 0 ? 1 / mass : 0, radius, supported: false };
}

export class RagdollPhysics {
  constructor(config) {
    this.config = config;
    this.solver = new ConstraintSolver({
      iterations: config.solverIterations ?? CONFIG.solverIterations,
      stiffness: config.jointStiffness ?? CONFIG.jointStiffness,
      groundY: config.groundY ?? CONFIG.groundY,
      friction: config.groundFriction ?? CONFIG.groundFriction,
    });
    this.reset();
  }

  reset(seedState = null) {
    const baseX = seedState?.x ?? 0;
    const baseY = seedState?.y ?? (this.config.groundY ?? CONFIG.groundY) - 180;
    const lengths = this.config.limbLengths ?? CONFIG.limbLengths;
    const masses = this.config.massProfile ?? CONFIG.massProfile;
    this.torso = makeBody("torso", baseX, baseY, masses.torso, 18);
    this.leftThigh = makeBody("leftThigh", baseX - 10, baseY + lengths.thigh * 0.5, masses.thigh, 10);
    this.rightThigh = makeBody("rightThigh", baseX + 10, baseY + lengths.thigh * 0.5, masses.thigh, 10);
    this.leftCalf = makeBody("leftCalf", baseX - 12, baseY + lengths.thigh + lengths.calf * 0.5, masses.calf, 8);
    this.rightCalf = makeBody("rightCalf", baseX + 12, baseY + lengths.thigh + lengths.calf * 0.5, masses.calf, 8);
    this.leftSole = makeBody("leftSole", baseX - 14, this.config.groundY ?? CONFIG.groundY, masses.sole, 6);
    this.rightSole = makeBody("rightSole", baseX + 14, this.config.groundY ?? CONFIG.groundY, masses.sole, 6);
    this.bodies = [this.torso, this.leftThigh, this.rightThigh, this.leftCalf, this.rightCalf, this.leftSole, this.rightSole];
    this.constraints = [
      { type: "distance", a: this.torso, b: this.leftThigh, length: lengths.thigh, damping: 0.08 },
      { type: "distance", a: this.torso, b: this.rightThigh, length: lengths.thigh, damping: 0.08 },
      { type: "distance", a: this.leftThigh, b: this.leftCalf, length: lengths.calf, damping: 0.08 },
      { type: "distance", a: this.rightThigh, b: this.rightCalf, length: lengths.calf, damping: 0.08 },
      { type: "distance", a: this.leftCalf, b: this.leftSole, length: lengths.sole, damping: 0.05 },
      { type: "distance", a: this.rightCalf, b: this.rightSole, length: lengths.sole, damping: 0.05 },
      { type: "ground", body: this.leftSole, groundY: this.config.groundY ?? CONFIG.groundY, radius: this.leftSole.radius },
      { type: "ground", body: this.rightSole, groundY: this.config.groundY ?? CONFIG.groundY, radius: this.rightSole.radius },
    ];
    this.time = 0;
    this.fallLatched = false;
    this.snapshot = this.buildSnapshot([]);
  }

  step(dt, controlState, worldState = {}) {
    const safeDt = Math.max(0, dt);
    this.time += safeDt;
    for (const body of this.bodies) body.supported = false;
    this.applyMotion(safeDt, controlState?.torqueIntents ?? {}, worldState);
    this.integrate(safeDt);
    this.solver.step(this.bodies, this.constraints, safeDt);
    const snapshot = this.buildSnapshot(worldState.supportContacts ?? []);
    if (Math.abs(snapshot.leanAngle) > (this.config.leanFallThreshold ?? CONFIG.leanFallThreshold)) {
      this.fallLatched = true;
    }
    if (Math.abs(snapshot.leanAngle) > (this.config.irrecoverableLean ?? CONFIG.irrecoverableLean)) {
      this.fallLatched = true;
    }
    snapshot.fallLatched = this.fallLatched;
    snapshot.irrecoverable = this.fallLatched;
    this.snapshot = snapshot;
    return snapshot;
  }

  applyMotion(dt, intents, worldState) {
    const torqueScale = this.config.torqueScale ?? CONFIG.torqueScale;
    const recoverScale = this.config.recoverTorqueScale ?? CONFIG.recoverTorqueScale;
    const drive = this.fallLatched ? -0.2 : worldState.drive ?? 0;
    const lean = worldState.lean ?? 0;
    const torqueFalloff = this.fallLatched ? 0.18 : 1;
    const torqueFor = (name) => ((intents[name] ?? 0) * torqueScale + lean * recoverScale) * torqueFalloff;
    const pairs = [
      [this.leftThigh, this.torso, torqueFor("leftThigh")],
      [this.rightThigh, this.torso, torqueFor("rightThigh")],
      [this.leftCalf, this.leftThigh, torqueFor("leftCalf")],
      [this.rightCalf, this.rightThigh, torqueFor("rightCalf")],
      [this.leftSole, this.leftCalf, torqueFor("leftSole")],
      [this.rightSole, this.rightCalf, torqueFor("rightSole")],
    ];
    for (const [body, anchor, torque] of pairs) {
      const bias = Math.max(-1, Math.min(1, torque / torqueScale));
      const liftScale = body.name.includes("Sole") ? 480 : body.name.includes("Calf") ? 260 : 120;
      body.vx += (drive * 34 + bias * 8) * dt;
      body.vy += (bias * -liftScale) * dt;
      anchor.vx -= bias * 2 * dt;
    }
    this.torso.vx += drive * 56 * dt;
    if (this.fallLatched) this.torso.vy += 55 * dt;
  }

  integrate(dt) {
    for (const body of this.bodies) {
      body.vy += (this.config.gravity ?? CONFIG.gravity) * dt * 0.18;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.vx *= 0.985;
      body.vy *= 0.992;
    }
  }

  buildSnapshot(supportContacts) {
    const com = this.computeCenterOfMass();
    const leanAngle = this.computeLeanAngle();
    const groundY = this.config.groundY ?? CONFIG.groundY;
    const leftFootLift = Math.max(0, groundY - (this.leftSole.y + this.leftSole.radius));
    const rightFootLift = Math.max(0, groundY - (this.rightSole.y + this.rightSole.radius));
    const supportBodies = this.bodies.filter((body) => body.supported).map((body) => body.name);
    const mergedSupport = [...new Set([...supportBodies, ...supportContacts])];
    const averageVelocity = this.bodies.reduce(
      (velocity, body) => ({ x: velocity.x + body.vx, y: velocity.y + body.vy }),
      { x: 0, y: 0 },
    );
    averageVelocity.x /= this.bodies.length;
    averageVelocity.y /= this.bodies.length;
    return {
      time: this.time,
      bodies: Object.fromEntries(this.bodies.map((body) => [body.name, { x: body.x, y: body.y, vx: body.vx, vy: body.vy }])),
      joints: this.constraints.filter((constraint) => constraint.type === "distance").map((constraint) => ({ a: constraint.a.name, b: constraint.b.name, length: constraint.length })),
      supportContacts: mergedSupport,
      com,
      centerOfMass: com,
      leanAngle,
      lean: leanAngle,
      torsoHeight: Math.max(0, groundY - this.torso.y),
      leftFootLift,
      rightFootLift,
      legSplit: Math.abs(this.leftSole.x - this.rightSole.x),
      forwardSpeed: averageVelocity.x,
      velocity: averageVelocity,
      fallLatched: this.fallLatched,
      irrecoverable: this.fallLatched,
    };
  }

  computeCenterOfMass() {
    let sumX = 0;
    let sumY = 0;
    let mass = 0;
    for (const body of this.bodies) {
      sumX += body.x * body.mass;
      sumY += body.y * body.mass;
      mass += body.mass;
    }
    return { x: sumX / mass, y: sumY / mass, mass };
  }

  computeLeanAngle() {
    const supportMidX = (this.leftSole.x + this.rightSole.x) * 0.5;
    const supportMidY = (this.leftSole.y + this.rightSole.y) * 0.5;
    return Math.atan2(this.torso.x - supportMidX, Math.max(1, supportMidY - this.torso.y));
  }

  getSnapshot() {
    return this.snapshot;
  }

  getCenterOfMass() {
    return this.snapshot.com;
  }

  getLeanMetrics() {
    return { angle: this.snapshot.leanAngle, absAngle: Math.abs(this.snapshot.leanAngle) };
  }

  isIrrecoverablyFallen() {
    return this.fallLatched;
  }
}
