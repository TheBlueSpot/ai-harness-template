import { add, clamp, dot, len, mul, norm, perp, sub, catmullRom, catmullRomTangent } from "./geometry.js";

const DEFAULT_TRACK = Object.freeze({
  points: [
    { x: 120, y: 420 },
    { x: 340, y: 420 },
    { x: 520, y: 360 },
    { x: 650, y: 235 },
    { x: 660, y: 120 },
    { x: 760, y: 70 },
    { x: 940, y: 70 },
    { x: 1040, y: 125 },
    { x: 1060, y: 275 },
    { x: 1220, y: 390 },
    { x: 1440, y: 430 },
    { x: 1660, y: 330 },
    { x: 1900, y: 300 },
    { x: 2120, y: 300 }
  ]
});

const defaultPlayer = () => ({ position: { x: 160, y: 402 }, velocity: { x: 0, y: 0 }, radius: 18, grounded: false, normal: { x: 0, y: -1 }, tangent: { x: 1, y: 0 }, surfaceT: 0 });

const pickPoint = (points, index) => points[clamp(index, 0, points.length - 1)];

export function createTrackSpline(track = DEFAULT_TRACK) {
  const points = (track?.points || DEFAULT_TRACK.points).map((p) => ({ x: p.x, y: p.y }));
  return { points };
}

export function sampleSurface(track, t) {
  const spline = track?.points ? track : createTrackSpline(track);
  const points = spline.points;
  if (points.length < 2) return { position: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, normal: { x: 0, y: -1 }, t: 0 };
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  const p0 = pickPoint(points, i - 1);
  const p1 = pickPoint(points, i);
  const p2 = pickPoint(points, i + 1);
  const p3 = pickPoint(points, i + 2);
  const position = catmullRom(p0, p1, p2, p3, localT);
  const tangent = norm(catmullRomTangent(p0, p1, p2, p3, localT));
  const normal = norm(perp(tangent));
  return { position, tangent, normal, t: clamp(t, 0, 1) };
}

export function projectOntoSpline(point, track) {
  const spline = track?.points ? track : createTrackSpline(track);
  let best = null;
  for (let i = 0; i <= 240; i += 1) {
    const t = i / 240;
    const sample = sampleSurface(spline, t);
    const delta = sub(point, sample.position);
    const distance = len(delta);
    if (!best || distance < best.distance) best = { ...sample, distance, projected: sample.position };
  }
  return best || { position: point, tangent: { x: 1, y: 0 }, normal: { x: 0, y: -1 }, t: 0, distance: 0 };
}

export function transferMomentumOnSlope(velocity, tangent, normal, gravity, dt) {
  const tangentSpeed = dot(velocity, tangent);
  const normalSpeed = dot(velocity, normal);
  const slopeBoost = clamp(-dot(gravity, tangent) * dt, -140, 140);
  const downhill = Math.sign(dot(gravity, tangent)) || Math.sign(tangentSpeed) || 1;
  const impactTransfer = normalSpeed < 0 ? -normalSpeed * 0.82 * downhill : 0;
  const retained = tangentSpeed + slopeBoost + impactTransfer;
  return add(mul(tangent, retained), mul(normal, Math.max(0, normalSpeed)));
}

export function resolveSplineCollision(player, track, options = {}) {
  const radius = player.radius ?? 18;
  const skinWidth = options.skinWidth ?? 2;
  const contact = projectOntoSpline(player.position, track);
  const offset = sub(player.position, contact.position);
  const signed = dot(offset, contact.normal);
  const side = signed >= 0 ? 1 : -1;
  const distance = Math.abs(signed);
  const speed = len(player.velocity || { x: 0, y: 0 });
  const attachBand = radius + skinWidth + (player.grounded ? 34 : clamp(speed * 0.018, 6, 28));
  const normal = mul(contact.normal, side);
  const movingTowardSurface = dot(player.velocity || { x: 0, y: 0 }, normal) < 60;
  const grounded = distance <= attachBand && (movingTowardSurface || player.grounded);
  const correctedPosition = grounded ? add(contact.position, mul(normal, radius + skinWidth)) : player.position;
  return {
    position: correctedPosition,
    velocity: player.velocity,
    radius,
    grounded,
    normal,
    tangent: contact.tangent,
    surfaceT: contact.t
  };
}

export class SplinePhysics {
  constructor({ gravity = 1600, maxSpeed = 860, skinWidth = 2 } = {}) {
    this.gravity = gravity;
    this.maxSpeed = maxSpeed;
    this.skinWidth = skinWidth;
    this.track = createTrackSpline(DEFAULT_TRACK);
  }
  reset() {}
  step(playerState = defaultPlayer(), input = {}, track = this.track, dt = 1 / 60) {
    const state = {
      position: { ...(playerState.position || { x: playerState.x || 0, y: playerState.y || 0 }) },
      velocity: { ...(playerState.velocity || { x: playerState.vx || 0, y: playerState.vy || 0 }) },
      radius: playerState.radius ?? 18,
      grounded: !!playerState.grounded,
      normal: { ...(playerState.normal || { x: 0, y: -1 }) },
      tangent: { ...(playerState.tangent || { x: 1, y: 0 }) },
      surfaceT: playerState.surfaceT ?? 0
    };
    const spline = track?.points ? track : createTrackSpline(track);
    const contactState = resolveSplineCollision(state, spline, { skinWidth: this.skinWidth });
    const activeNormal = state.grounded ? contactState.normal : state.normal;
    const contact = state.grounded ? contactState : projectOntoSpline(state.position, spline);
    const gravityVec = { x: 0, y: this.gravity };
    const drive = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let velocity = state.velocity;
    if (state.grounded) {
      const tangentGravity = dot(gravityVec, contact.tangent);
      velocity = add(velocity, mul(contact.tangent, tangentGravity * dt));
    } else {
      velocity = add(velocity, mul(gravityVec, dt));
    }
    if (drive !== 0) velocity = add(velocity, mul(contact.tangent, drive * 1400 * dt));
    if (input.jump && state.grounded) {
      velocity = add(mul(activeNormal, 540), mul(contact.tangent, dot(velocity, contact.tangent)));
      state.grounded = false;
    }
    const speed = len(velocity);
    if (speed > this.maxSpeed) velocity = mul(norm(velocity), this.maxSpeed);
    let next = { ...state, position: add(state.position, mul(velocity, dt)), velocity };
    const resolved = resolveSplineCollision(next, spline, { skinWidth: this.skinWidth });
    if (resolved.grounded) {
      const carried = transferMomentumOnSlope(resolved.velocity, resolved.tangent, resolved.normal, gravityVec, dt);
      const normalSpeed = dot(carried, resolved.normal);
      const tangentSpeed = dot(carried, resolved.tangent);
      const clampedTangent = clamp(tangentSpeed, -this.maxSpeed, this.maxSpeed);
      resolved.velocity = add(mul(resolved.tangent, clampedTangent), mul(resolved.normal, Math.max(0, normalSpeed)));
      if (Math.abs(clampedTangent) < 12 && drive === 0) resolved.velocity = mul(resolved.velocity, 0.98);
    }
    return {
      ...resolved,
      position: resolved.position,
      velocity: resolved.velocity,
      grounded: resolved.grounded,
      contact: resolved.grounded ? "surface" : "air",
      dead: resolved.position.y > 960
    };
  }
  sampleSurface(track, t) {
    return sampleSurface(track, t);
  }
  getContactState(player, track) {
    return resolveSplineCollision(player, track);
  }
}
