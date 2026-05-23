export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createBody(name, x, y, mass, radius) {
  const invMass = mass > 0 ? 1 / mass : 0;
  return {
    name,
    x,
    y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    mass,
    invMass,
    radius,
    grounded: false,
  };
}

export function integrateBody(body, dt, gravity, drag = 0.995) {
  if (body.invMass <= 0) return body;
  body.vy += gravity * dt;
  body.vx += (body.ax ?? 0) * dt;
  body.vy += (body.ay ?? 0) * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.vx *= drag;
  body.vy *= drag;
  body.ax = 0;
  body.ay = 0;
  body.grounded = false;
  return body;
}

export function dampVelocity(body, factor = 0.85) {
  body.vx *= factor;
  body.vy *= factor;
  return body;
}

export function applyImpulse(body, ix, iy) {
  if (body.invMass <= 0) return body;
  body.vx += ix * body.invMass;
  body.vy += iy * body.invMass;
  return body;
}

export function projectPointOnGround(x, terrain) {
  return terrain?.sampleY ? terrain.sampleY(x) : 0;
}

export function resolveGroundContact(body, terrain, friction = 0.84) {
  const groundY = projectPointOnGround(body.x, terrain);
  const floor = groundY - (body.radius ?? 0);
  if (body.y <= floor) return false;
  const penetration = body.y - floor;
  body.y = floor;
  if (body.vy > 0) body.vy = 0;
  body.vx *= friction;
  if (penetration > 0) body.vy -= Math.min(body.vy, penetration * 12);
  body.grounded = true;
  body.contactDepth = penetration;
  return true;
}
