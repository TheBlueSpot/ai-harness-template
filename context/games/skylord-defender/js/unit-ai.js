import { clamp, lerp, normalize, randRange } from "./math.js";

const steeringVector = (x, y) => normalize(x, y);

export class UnitAI {
  constructor() {
    this.dogfightClearance = 96;
    this.bomberClearance = 118;
  }

  updateDogfighter(unit, session, dt) {
    const target = unit.grabbed
      ? session.player
      : session.findNearestCivilian(unit.x, unit.y, 900, true) || session.player;
    const targetY = unit.grabbed ? Math.max(108, session.player.y - 72) : target.y;
    const toTarget = steeringVector(target.x - unit.x, targetY - unit.y);
    const orbit = Math.sin(session.time * 1.35 + unit.wobble) * 0.42;
    const lateral = { x: -toTarget.y, y: toTarget.x };
    const desired = steeringVector(
      toTarget.x * 0.72 + lateral.x * orbit,
      toTarget.y * 0.72 + lateral.y * orbit
    );

    this.applyAltitudeRules(unit, session, desired, this.dogfightClearance);
    const speed = unit.grabbed ? unit.speed * 0.78 : unit.speed;
    this.applySteering(unit, desired, speed, unit.turnRate, dt);
    this.emitThrust(session, unit, desired, "#76d7ff", unit.grabbed ? 0.7 : 1);
    unit.bank = lerp(unit.bank ?? 0, clamp(unit.vx / Math.max(1, speed), -1, 1), clamp(dt * 3, 0, 1));
    return target;
  }

  updateBomber(unit, session, dt) {
    const target = session.findNearestCivilian(unit.x, unit.y, 900, true) || session.player;
    const toTarget = steeringVector(target.x - unit.x, target.y - unit.y);
    const weave = Math.sin(session.time * 0.8 + unit.wobble) * 0.28;
    const desired = steeringVector(
      toTarget.x * 0.84 + weave,
      clamp(toTarget.y * 0.62 + weave * 0.35, -1, 1)
    );

    this.applyAltitudeRules(unit, session, desired, this.bomberClearance);
    this.applySteering(unit, desired, unit.speed, unit.turnRate * 0.84, dt);
    this.emitThrust(session, unit, desired, "#ff8f7c", 0.9);

    unit.dropCooldown -= dt;
    if (unit.dropCooldown <= 0 && unit.y > 120) {
      session.launchBomb(unit, target);
      unit.dropCooldown = randRange(0.95, 1.55);
    }

    return target;
  }

  applySteering(unit, desired, speed, turnRate, dt) {
    const step = clamp(dt * turnRate * 3.2, 0, 1);
    const nextVX = desired.x * speed;
    const nextVY = desired.y * speed;
    unit.vx = lerp(unit.vx, nextVX, step);
    unit.vy = lerp(unit.vy, nextVY, step);
    const currentSpeed = Math.hypot(unit.vx, unit.vy);
    if (currentSpeed > speed) {
      const scale = speed / currentSpeed;
      unit.vx *= scale;
      unit.vy *= scale;
    }
    unit.heading = Math.atan2(unit.vy, unit.vx || 0.001);
  }

  applyAltitudeRules(unit, session, desired, clearance) {
    const lookAhead = unit.x + desired.x * 96;
    const terrainY = session.terrain.heightAt(lookAhead);
    const margin = terrainY - unit.y;
    if (margin < clearance) {
      desired.y -= (clearance - margin) / clearance * 1.2;
    }

    if (unit.y < 88) {
      desired.y += (88 - unit.y) / 88 * 0.45;
    }

    const leftEdge = 84;
    const rightEdge = session.terrain.width - 84;
    if (unit.x < leftEdge) {
      desired.x += (leftEdge - unit.x) / leftEdge * 0.35;
    } else if (unit.x > rightEdge) {
      desired.x -= (unit.x - rightEdge) / 84 * 0.35;
    }
  }

  emitThrust(session, unit, desired, color, intensity = 1) {
    if (!session?.particles) {
      return;
    }

    const speed = Math.hypot(unit.vx, unit.vy);
    if (speed < 18) {
      return;
    }

    session.particles.emitThrust(
      unit.x - desired.x * unit.radius * 0.75,
      unit.y - desired.y * unit.radius * 0.75,
      desired.x,
      desired.y,
      intensity,
      color
    );
  }
}
