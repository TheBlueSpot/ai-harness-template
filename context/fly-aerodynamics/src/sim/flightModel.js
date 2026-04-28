const G = 9.81;
const AIR_DENSITY = 1.225;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function angleOfAttack(pitch, velocityAngle) {
  return normalizeAngle(pitch - velocityAngle);
}

export function liftForce({ speed, liftCoefficient, wingArea, airDensity = AIR_DENSITY }) {
  return 0.5 * airDensity * speed * speed * wingArea * liftCoefficient;
}

export function dragForce({ speed, dragCoefficient, wingArea, airDensity = AIR_DENSITY }) {
  return 0.5 * airDensity * speed * speed * wingArea * dragCoefficient;
}

export function gravityForce(mass, gravity = G) {
  return mass * gravity;
}

export function stallFactor(aoa, stallAngle = 0.24) {
  const abs = Math.abs(aoa);
  if (abs <= stallAngle) return 1;
  const fade = clamp(1 - (abs - stallAngle) / (stallAngle * 1.5), 0, 1);
  return fade * fade;
}

export function thermalForce({ thermalStrength, altitude, radius, centerY, x, centerX }) {
  const dx = x - centerX;
  const dy = altitude - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > radius) return 0;
  const falloff = 1 - distance / radius;
  return thermalStrength * falloff * falloff;
}

export function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function integrateFlightStep(state, forces, dt) {
  const ax = forces.thrust / state.mass - forces.drag / state.mass;
  const ay = (forces.lift + forces.thermal - forces.weight) / state.mass;
  return {
    speedX: Math.max(0, state.speedX + ax * dt),
    speedY: state.speedY + ay * dt,
  };
}

