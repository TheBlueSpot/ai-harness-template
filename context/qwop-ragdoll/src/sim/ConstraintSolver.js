import { clamp, resolveGroundContact } from "./physics.js";

export class ConstraintSolver {
  constructor(options = {}) {
    this.iterations = Math.max(1, options.iterations ?? 8);
    this.stiffness = clamp(options.stiffness ?? 0.72, 0, 1);
    this.damping = clamp(options.damping ?? 0.12, 0, 1);
    this.friction = clamp(options.friction ?? 0.84, 0, 1);
  }

  step(bodies, constraints, terrain) {
    for (let i = 0; i < this.iterations; i += 1) {
      for (const constraint of constraints) {
        if (constraint.type === "distance") this.solveDistance(constraint);
        if (constraint.type === "ground") resolveGroundContact(constraint.body, terrain, this.friction);
      }
      for (const body of bodies) resolveGroundContact(body, terrain, this.friction);
    }
  }

  solveDistance(constraint) {
    const a = constraint.a;
    const b = constraint.b;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(1e-6, Math.hypot(dx, dy));
    const error = distance - constraint.length;
    const nx = dx / distance;
    const ny = dy / distance;
    const invMassA = a.invMass ?? 0;
    const invMassB = b.invMass ?? 0;
    const total = invMassA + invMassB || 1;
    const correction = (error * this.stiffness) / total;
    const bias = Math.max(-24, Math.min(24, error * 0.25));

    if (invMassA > 0) {
      a.x += nx * correction * invMassA;
      a.y += ny * correction * invMassA;
    }
    if (invMassB > 0) {
      b.x -= nx * correction * invMassB;
      b.y -= ny * correction * invMassB;
    }

    const relVx = (b.vx ?? 0) - (a.vx ?? 0);
    const relVy = (b.vy ?? 0) - (a.vy ?? 0);
    const swing = relVx * nx + relVy * ny;
    const fix = (swing + bias) * this.damping;
    if (invMassA > 0) {
      a.vx += nx * fix * invMassA;
      a.vy += ny * fix * invMassA;
    }
    if (invMassB > 0) {
      b.vx -= nx * fix * invMassB;
      b.vy -= ny * fix * invMassB;
    }
  }
}
