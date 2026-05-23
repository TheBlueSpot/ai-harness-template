export class ConstraintSolver {
  constructor(options = {}) {
    this.iterations = Math.max(1, options.iterations ?? 8);
    this.stiffness = Math.min(1, Math.max(0, options.stiffness ?? 0.7));
    this.groundY = options.groundY ?? 0;
    this.friction = Math.min(1, Math.max(0, options.friction ?? 0.82));
  }

  step(bodies, constraints, dt) {
    const safeDt = Math.max(1e-6, dt);
    for (let i = 0; i < this.iterations; i += 1) {
      for (const constraint of constraints) {
        if (constraint.type === "distance") this.resolveDistance(constraint, safeDt);
        if (constraint.type === "ground") this.resolveGround(constraint);
      }
      for (const body of bodies) this.resolveBodyGround(body);
    }
  }

  resolveDistance(constraint, dt) {
    const a = constraint.a;
    const b = constraint.b;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1;
    const error = distance - constraint.length;
    const nx = dx / distance;
    const ny = dy / distance;
    const invMassA = a.invMass ?? 0;
    const invMassB = b.invMass ?? 0;
    const total = invMassA + invMassB || 1;
    const correction = error * this.stiffness / total;
    if (invMassA > 0) {
      a.x += nx * correction * invMassA;
      a.y += ny * correction * invMassA;
    }
    if (invMassB > 0) {
      b.x -= nx * correction * invMassB;
      b.y -= ny * correction * invMassB;
    }
    const damp = constraint.damping ?? 0.12;
    const relVx = (b.vx ?? 0) - (a.vx ?? 0);
    const relVy = (b.vy ?? 0) - (a.vy ?? 0);
    const swing = relVx * nx + relVy * ny;
    const velocityFix = swing * damp * dt * 0.5;
    if (invMassA > 0) {
      a.vx += nx * velocityFix * invMassA;
      a.vy += ny * velocityFix * invMassA;
    }
    if (invMassB > 0) {
      b.vx -= nx * velocityFix * invMassB;
      b.vy -= ny * velocityFix * invMassB;
    }
  }

  resolveGround(constraint) {
    const body = constraint.body;
    const radius = constraint.radius ?? 0;
    const floor = (constraint.groundY ?? this.groundY) - radius;
    if (body.y <= floor) return;
    body.y = floor;
    body.vy = Math.min(0, body.vy ?? 0);
    body.vx = (body.vx ?? 0) * this.friction;
    body.supported = true;
  }

  resolveBodyGround(body) {
    const radius = body.radius ?? 0;
    const floor = this.groundY - radius;
    if (body.y > floor) {
      body.y = floor;
      body.vy = Math.min(0, body.vy ?? 0);
      body.vx = (body.vx ?? 0) * this.friction;
      body.supported = true;
    }
  }
}
