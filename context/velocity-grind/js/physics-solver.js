const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const hypot = Math.hypot;

const cubicPoint = (points, t) => {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * points[0].x + 3 * uu * t * points[1].x + 3 * u * tt * points[2].x + tt * t * points[3].x,
    y: uu * u * points[0].y + 3 * uu * t * points[1].y + 3 * u * tt * points[2].y + tt * t * points[3].y
  };
};

const cubicDerivative = (points, t) => {
  const u = 1 - t;
  return {
    x: 3 * u * u * (points[1].x - points[0].x) + 6 * u * t * (points[2].x - points[1].x) + 3 * t * t * (points[3].x - points[2].x),
    y: 3 * u * u * (points[1].y - points[0].y) + 6 * u * t * (points[2].y - points[1].y) + 3 * t * t * (points[3].y - points[2].y)
  };
};

const normalize = (vector) => {
  const length = hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length, length };
};

export class BezierTrack {
  constructor(segments, samplesPerSegment = 64) {
    this.segments = segments;
    this.samplesPerSegment = samplesPerSegment;
    this.samples = [];
    this.totalLength = 0;
    this.rebuild();
  }

  rebuild() {
    this.samples = [];
    this.totalLength = 0;
    let lastPoint = null;

    this.segments.forEach((segment, segmentIndex) => {
      const start = segmentIndex === 0 ? 0 : 1;
      for (let index = start; index <= this.samplesPerSegment; index += 1) {
        const localT = index / this.samplesPerSegment;
        const point = cubicPoint(segment, localT);
        if (lastPoint) {
          this.totalLength += hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        }
        this.samples.push({
          point,
          segmentIndex,
          localT,
          length: this.totalLength
        });
        lastPoint = point;
      }
    });
  }

  locate(progress) {
    const target = clamp(progress, 0, 0.999999) * this.totalLength;
    let low = 0;
    let high = this.samples.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.samples[mid].length < target) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const current = this.samples[low];
    const previous = this.samples[Math.max(0, low - 1)];
    const span = Math.max(0.0001, current.length - previous.length);
    const t = clamp((target - previous.length) / span, 0, 1);
    return {
      index: low,
      progress: target / this.totalLength,
      point: {
        x: lerp(previous.point.x, current.point.x, t),
        y: lerp(previous.point.y, current.point.y, t)
      }
    };
  }

  sample(progress) {
    return this.locate(progress).point;
  }

  tangent(progress) {
    const target = clamp(progress, 0, 1);
    const sample = this.locate(target);
    const previous = this.samples[Math.max(0, sample.index - 1)];
    const next = this.samples[Math.min(this.samples.length - 1, sample.index + 1)];
    const vector = {
      x: next.point.x - previous.point.x,
      y: next.point.y - previous.point.y
    };
    return normalize(vector);
  }

  normal(progress) {
    const tangent = this.tangent(progress);
    return { x: -tangent.y, y: tangent.x };
  }

  curvature(progress) {
    const delta = 0.003;
    const a = this.tangent(clamp(progress - delta, 0, 1));
    const b = this.tangent(clamp(progress + delta, 0, 1));
    const angleA = Math.atan2(a.y, a.x);
    const angleB = Math.atan2(b.y, b.x);
    return (angleB - angleA) / (delta * 2);
  }

  nearest(point, hintProgress = 0) {
    const targetIndex = Math.floor(clamp(hintProgress, 0, 1) * (this.samples.length - 1));
    const window = Math.min(this.samples.length, 36);
    let start = Math.max(0, targetIndex - window);
    let end = Math.min(this.samples.length - 1, targetIndex + window);
    let best = { index: targetIndex, distance: Number.POSITIVE_INFINITY };

    const scan = (from, to) => {
      for (let index = from; index <= to; index += 1) {
        const sample = this.samples[index];
        const distance = hypot(point.x - sample.point.x, point.y - sample.point.y);
        if (distance < best.distance) {
          best = { index, distance };
        }
      }
    };

    scan(start, end);
    if (!Number.isFinite(best.distance) || best.distance > 90) {
      scan(0, this.samples.length - 1);
    }

    const sample = this.samples[best.index];
    return {
      progress: sample.length / this.totalLength,
      point: sample.point,
      distance: best.distance
    };
  }
}

export class TrickSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.airTime = 0;
    this.rotation = 0;
    this.peakSpin = 0;
  }

  beginAirborne() {
    this.active = true;
    this.airTime = 0;
    this.rotation = 0;
    this.peakSpin = 0;
  }

  updateAirborne(dt, angularVelocity) {
    if (!this.active) {
      return 0;
    }

    this.airTime += dt;
    this.rotation += Math.abs(angularVelocity) * dt;
    this.peakSpin = Math.max(this.peakSpin, Math.abs(angularVelocity));
    return 0;
  }

  land() {
    if (!this.active) {
      return null;
    }

    const airTime = this.airTime;
    const rotationDegrees = this.rotation * (180 / Math.PI);
    const spins = rotationDegrees / 360;
    const effectiveAir = Math.max(0, airTime - 0.12);
    const airtimeScore = Math.round(effectiveAir * 180);
    const rotationScore = Math.round(Math.abs(rotationDegrees) * 0.52);
    const spinBonus = Math.round(Math.max(0, Math.floor(Math.abs(spins)) - 1) * 90);
    const styleBonus = Math.round(Math.min(160, this.peakSpin * 6));
    const points = airtimeScore + rotationScore + spinBonus + styleBonus;

    this.active = false;
    return {
      points,
      airTime,
      rotationDegrees,
      spins
    };
  }
}

export class PhysicsSolver {
  constructor(track, rider = {}) {
    this.track = track;
    this.rider = rider;
    this.gravity = 860;
    this.trickSystem = new TrickSystem();
    this.state = null;
    this.score = 0;
    this.reset();
  }

  reset(progress = 0.025) {
    const start = this.track.locate(progress);
    const tangent = this.track.tangent(progress);
    const normal = this.track.normal(progress);
    this.trickSystem.reset();
    this.score = 0;
    this.state = {
      progress: start.progress,
      speed: 230 + (this.rider.speed ?? 0.7) * 130,
      laneOffset: 0,
      targetOffset: 0,
      stability: 100,
      attached: true,
      position: {
        x: start.point.x,
        y: start.point.y
      },
      velocity: { x: tangent.x * 0, y: tangent.y * 0 },
      angle: Math.atan2(tangent.y, tangent.x) + Math.PI / 2,
      rotation: 0,
      angularVelocity: 0,
      airTime: 0,
      combo: 0,
      comboPeak: 0,
      lastTrick: null,
      lastEvent: null
    };

    this.state.position.x += normal.x * this.state.laneOffset;
    this.state.position.y += normal.y * this.state.laneOffset;
  }

  addScore(points) {
    this.score += Math.max(0, Math.round(points));
  }

  addStability(delta) {
    this.state.stability = clamp(this.state.stability + delta, 0, 100);
  }

  update(dt, controls = {}) {
    const state = this.state;
    const riderSpeed = this.rider.speed ?? 0.7;
    const riderGrip = this.rider.grip ?? 0.7;
    const riderFlow = this.rider.flow ?? 0.7;
    const steer = clamp(controls.steer ?? 0, -1, 1);
    const throttle = controls.throttle ? 1 : 0;
    const brake = controls.brake ? 1 : 0;
    const result = {
      launched: false,
      landed: false,
      trick: null
    };

    state.targetOffset = clamp(state.targetOffset + steer * (126 + riderGrip * 38) * dt, -138, 138);
    state.laneOffset = lerp(state.laneOffset, state.targetOffset, 1 - Math.pow(0.0015, dt * (0.9 + riderGrip * 0.8)));

    if (state.attached) {
      const tangent = this.track.tangent(state.progress);
      const normal = this.track.normal(state.progress);
      const point = this.track.sample(state.progress);
      const curvature = Math.abs(this.track.curvature(state.progress));
      const slope = tangent.y;
      const acceleration =
        throttle * (310 + riderFlow * 220) -
        brake * (250 + (1 - riderGrip) * 120) +
        slope * this.gravity * 0.35 -
        36;

      state.speed = clamp(state.speed + acceleration * dt, 92, 860);
      state.progress = clamp(state.progress + (state.speed * dt) / this.track.totalLength, 0, 1);
      state.position.x = point.x + normal.x * state.laneOffset;
      state.position.y = point.y + normal.y * state.laneOffset;
      state.angle = Math.atan2(tangent.y, tangent.x) + Math.PI / 2;
      state.rotation = 0;
      state.angularVelocity = 0;
      state.airTime = 0;
      state.lastEvent = null;

      const turnRadius = curvature > 0.00001 ? 1 / curvature : Number.POSITIVE_INFINITY;
      const holdSpeed = Number.isFinite(turnRadius) ? Math.sqrt(Math.max(0, this.gravity * turnRadius)) : 0;
      const lanePressure = Math.abs(state.laneOffset) / 138;

      if ((Number.isFinite(holdSpeed) && state.speed < holdSpeed * 0.68 && Math.abs(curvature) > 0.0016) || lanePressure > 0.97) {
        const launchVelocity = normalize({
          x: tangent.x * state.speed + normal.x * (steer * 130 + lanePressure * 40),
          y: tangent.y * state.speed + normal.y * (steer * 130 + lanePressure * 40)
        });
        state.attached = false;
        state.velocity = {
          x: launchVelocity.x * state.speed,
          y: launchVelocity.y * state.speed
        };
        state.angularVelocity = steer * 4.8 + throttle * 1.5 - brake * 1.2 + lanePressure * 2.5;
        state.airTime = 0;
        this.trickSystem.beginAirborne();
        state.lastEvent = "launched";
        result.launched = true;
      }
    } else {
      state.velocity.y += this.gravity * dt;
      state.position.x += state.velocity.x * dt;
      state.position.y += state.velocity.y * dt;
      state.rotation += state.angularVelocity * dt;
      state.angularVelocity *= Math.pow(0.992, dt * 60);
      state.airTime += dt;
      state.lastEvent = "airborne";

      const trickGain = this.trickSystem.updateAirborne(dt, state.angularVelocity);
      if (trickGain > 0) {
        this.addScore(trickGain);
      }

      const nearest = this.track.nearest(state.position, state.progress);
      const tangent = this.track.tangent(nearest.progress);
      const normal = this.track.normal(nearest.progress);
      const trackPoint = this.track.sample(nearest.progress);
      const offsetX = state.position.x - trackPoint.x;
      const offsetY = state.position.y - trackPoint.y;
      const normalOffset = offsetX * normal.x + offsetY * normal.y;
      const tangentSpeed = state.velocity.x * tangent.x + state.velocity.y * tangent.y;
      const distance = hypot(offsetX, offsetY);

      const landingWindow = 120 + Math.abs(state.angularVelocity) * 4;
      if (distance < landingWindow && tangentSpeed > 22) {
        const trick = this.trickSystem.land();
        if (trick && trick.points > 0) {
          this.addScore(trick.points);
          state.lastTrick = trick;
        }
        state.attached = true;
        state.progress = nearest.progress;
        state.laneOffset = clamp(normalOffset, -138, 138);
        state.targetOffset = state.laneOffset;
        state.speed = clamp(tangentSpeed, 92, 860);
        state.rotation = 0;
        state.angularVelocity = 0;
        state.position.x = trackPoint.x + normal.x * state.laneOffset;
        state.position.y = trackPoint.y + normal.y * state.laneOffset;
        state.angle = Math.atan2(tangent.y, tangent.x) + Math.PI / 2;
        state.airTime = 0;
        state.combo += trick?.points > 0 ? 1 : 0;
        state.comboPeak = Math.max(state.comboPeak, state.combo);
        state.lastEvent = "landed";
        result.landed = true;
        result.trick = trick;
      } else if (state.position.y > 1040 || state.position.x < -220 || state.position.x > 1840) {
        this.addStability(-18 * dt * 60);
      }
    }

    if (state.attached) {
      const gripBoost = 10 + riderGrip * 8;
      const flowBoost = 4 + riderFlow * 4;
      this.addStability((gripBoost + flowBoost) * dt);
    } else {
      this.addStability(-4.5 * dt * 60);
    }

    return result;
  }
}

export function buildVelocityTrack() {
  return new BezierTrack([
    [
      { x: 140, y: 730 },
      { x: 220, y: 790 },
      { x: 290, y: 520 },
      { x: 430, y: 470 }
    ],
    [
      { x: 430, y: 470 },
      { x: 560, y: 430 },
      { x: 630, y: 210 },
      { x: 790, y: 200 }
    ],
    [
      { x: 790, y: 200 },
      { x: 970, y: 188 },
      { x: 910, y: 760 },
      { x: 1090, y: 760 }
    ],
    [
      { x: 1090, y: 760 },
      { x: 1240, y: 760 },
      { x: 1280, y: 318 },
      { x: 1410, y: 320 }
    ],
    [
      { x: 1410, y: 320 },
      { x: 1490, y: 322 },
      { x: 1540, y: 560 },
      { x: 1600, y: 595 }
    ]
  ]);
}
