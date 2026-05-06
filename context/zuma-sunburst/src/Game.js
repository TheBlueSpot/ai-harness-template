const COLORS = [
  { fill: "#ff6b6b", glow: "rgba(255, 107, 107, 0.45)" },
  { fill: "#4ecdc4", glow: "rgba(78, 205, 196, 0.45)" },
  { fill: "#ffd166", glow: "rgba(255, 209, 102, 0.5)" },
  { fill: "#6c8cff", glow: "rgba(108, 140, 255, 0.48)" },
];

const MARBLE_RADIUS = 16;
const MARBLE_SPACING = MARBLE_RADIUS * 2.08;
const SHOT_SPEED = 920;
const HEAD_SPEED = 58;
const DANGER_SPEED = 74;
const INSERT_SNAP = MARBLE_RADIUS * 1.45;
const MAX_SHOTS = 3;
const STARTING_MARBLES = 34;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function normalize(vector) {
  const len = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / len, y: vector.y / len };
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function buildPath(width, height) {
  const points = [
    { x: width * 0.09, y: height * 0.18 },
    { x: width * 0.28, y: height * 0.2 },
    { x: width * 0.42, y: height * 0.4 },
    { x: width * 0.19, y: height * 0.63 },
    { x: width * 0.44, y: height * 0.82 },
    { x: width * 0.71, y: height * 0.73 },
    { x: width * 0.78, y: height * 0.5 },
    { x: width * 0.61, y: height * 0.31 },
    { x: width * 0.52, y: height * 0.52 },
  ];

  const segments = [];
  const cumulative = [0];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = distance(start, end);
    const direction = normalize({ x: end.x - start.x, y: end.y - start.y });
    const normal = { x: -direction.y, y: direction.x };
    segments.push({ start, end, length, direction, normal });
    totalLength += length;
    cumulative.push(totalLength);
  }

  function sample(progress) {
    const clamped = clamp(progress, 0, totalLength);
    let segmentIndex = 0;
    while (segmentIndex < segments.length - 1 && cumulative[segmentIndex + 1] < clamped) {
      segmentIndex += 1;
    }
    const segment = segments[segmentIndex];
    const localDistance = clamped - cumulative[segmentIndex];
    const t = segment.length === 0 ? 0 : localDistance / segment.length;
    return {
      x: lerp(segment.start.x, segment.end.x, t),
      y: lerp(segment.start.y, segment.end.y, t),
      tangent: segment.direction,
      normal: segment.normal,
    };
  }

  return {
    points,
    segments,
    totalLength,
    endPoint: points[points.length - 1],
    sample,
  };
}

function pickColor(rng, allowed) {
  return allowed[Math.floor(rng() * allowed.length)];
}

function buildInitialChain(rng) {
  const marbles = [];
  const allowed = [0, 1, 2];
  for (let index = 0; index < STARTING_MARBLES; index += 1) {
    marbles.push({
      id: `m-${index}-${Math.floor(rng() * 100000)}`,
      color: pickColor(rng, allowed),
      progress: 0,
      poppedAt: 0,
    });
  }
  return marbles;
}

export class Game {
  constructor() {
    this.width = 1280;
    this.height = 720;
    this.center = { x: this.width * 0.5, y: this.height * 0.5 };
    this.path = buildPath(this.width, this.height);
    this.seed = 90210;
    this.rng = createRng(this.seed);
    this.pointer = { x: this.width * 0.5, y: this.height * 0.2 };
    this.reset();
  }

  reset() {
    this.rng = createRng(this.seed);
    this.mode = "menu";
    this.score = 0;
    this.combo = 1;
    this.shotsFired = 0;
    this.message = "Aim ahead of the advancing head. Long clears pull danger back.";
    this.headProgress = 0;
    this.shots = [];
    this.popBursts = [];
    this.chain = buildInitialChain(this.rng);
    this.currentColor = pickColor(this.rng, [0, 1, 2]);
    this.nextColor = pickColor(this.rng, [0, 1, 2, 3]);
    this.lastInsertedIndex = -1;
    this.hudPulse = 0;
    this.refreshChainProgress();
  }

  start() {
    this.reset();
    this.mode = "playing";
  }

  restart() {
    this.start();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.center = { x: width * 0.5, y: height * 0.52 };
    const previousTotal = this.path.totalLength || 1;
    const headRatio = this.headProgress / previousTotal;
    this.path = buildPath(width, height);
    this.headProgress = headRatio * this.path.totalLength;
    this.refreshChainProgress();
  }

  onPointerMove(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  shoot() {
    if (this.mode !== "playing" || this.shots.length >= MAX_SHOTS) {
      return;
    }

    const angle = angleTo(this.center, this.pointer);
    this.shots.push({
      x: this.center.x + Math.cos(angle) * 44,
      y: this.center.y + Math.sin(angle) * 44,
      vx: Math.cos(angle) * SHOT_SPEED,
      vy: Math.sin(angle) * SHOT_SPEED,
      color: this.currentColor,
      radius: MARBLE_RADIUS - 2,
    });
    this.currentColor = this.nextColor;
    this.nextColor = pickColor(this.rng, [0, 1, 2, 3]);
    this.shotsFired += 1;
  }

  swapColors() {
    if (this.mode !== "playing") {
      return;
    }
    const current = this.currentColor;
    this.currentColor = this.nextColor;
    this.nextColor = current;
  }

  update(dt) {
    const step = Math.min(dt, 1 / 30);

    if (this.mode !== "playing") {
      this.updateBursts(step);
      return;
    }

    this.headProgress += HEAD_SPEED * step + clamp(this.chain.length - 20, 0, 14) * 0.42 * step;
    this.hudPulse = Math.max(0, this.hudPulse - step * 2.4);

    this.updateShots(step);
    this.refreshChainProgress();
    this.updateBursts(step);

    if (this.chain.length === 0) {
      this.mode = "win";
      this.message = `Sunburst cleared. Score ${this.score}.`;
      return;
    }

    if (this.chain[0].progress >= this.path.totalLength - DANGER_SPEED) {
      this.hudPulse = 1;
    }

    if (this.chain[0].progress >= this.path.totalLength - MARBLE_RADIUS * 1.5) {
      this.mode = "lose";
      this.message = `The chain reached the sun gate. Score ${this.score}.`;
    }
  }

  updateShots(dt) {
    for (let shotIndex = this.shots.length - 1; shotIndex >= 0; shotIndex -= 1) {
      const shot = this.shots[shotIndex];
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;

      if (
        shot.x < -80 ||
        shot.x > this.width + 80 ||
        shot.y < -80 ||
        shot.y > this.height + 80
      ) {
        this.shots.splice(shotIndex, 1);
        continue;
      }

      let inserted = false;
      for (let marbleIndex = 0; marbleIndex < this.chain.length; marbleIndex += 1) {
        const marble = this.chain[marbleIndex];
        const position = this.path.sample(marble.progress);
        if (Math.hypot(position.x - shot.x, position.y - shot.y) <= INSERT_SNAP + shot.radius) {
          const beforeProgress = marble.progress;
          const afterProgress =
            marbleIndex === this.chain.length - 1
              ? marble.progress - MARBLE_SPACING
              : this.chain[marbleIndex + 1].progress;
          const insertAhead = beforeProgress - afterProgress < MARBLE_SPACING * 0.75
            ? 0
            : shot.x * position.normal.x + shot.y * position.normal.y >
                position.x * position.normal.x + position.y * position.normal.y
              ? 0
              : 1;
          const insertIndex = marbleIndex + insertAhead;
          this.chain.splice(insertIndex, 0, {
            id: `s-${Date.now()}-${Math.floor(this.rng() * 100000)}`,
            color: shot.color,
            progress: beforeProgress,
            poppedAt: 0,
          });
          this.headProgress += MARBLE_RADIUS * 0.1;
          this.refreshChainProgress();
          this.resolveMatches(insertIndex, 1);
          this.shots.splice(shotIndex, 1);
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        continue;
      }
    }
  }

  resolveMatches(originIndex, comboDepth) {
    if (originIndex < 0 || originIndex >= this.chain.length) {
      return;
    }

    const targetColor = this.chain[originIndex].color;
    let left = originIndex;
    let right = originIndex;

    while (left > 0 && this.chain[left - 1].color === targetColor) {
      left -= 1;
    }
    while (right < this.chain.length - 1 && this.chain[right + 1].color === targetColor) {
      right += 1;
    }

    const groupSize = right - left + 1;
    if (groupSize < 3) {
      return;
    }

    const removed = this.chain.splice(left, groupSize);
    for (const marble of removed) {
      const position = this.path.sample(marble.progress);
      this.popBursts.push({
        x: position.x,
        y: position.y,
        color: marble.color,
        life: 0.6,
      });
    }

    this.score += groupSize * 120 * comboDepth;
    this.combo = comboDepth + 1;
    this.message = comboDepth > 1 ? `Chain combo x${comboDepth}.` : `Popped ${groupSize}.`;
    this.headProgress = Math.max(0, this.headProgress - 16 * comboDepth);
    this.hudPulse = 1;
    this.refreshChainProgress();

    if (left > 0 && left < this.chain.length && this.chain[left - 1].color === this.chain[left].color) {
      this.resolveMatches(left, comboDepth + 1);
    } else {
      this.combo = 1;
    }
  }

  refreshChainProgress() {
    for (let index = 0; index < this.chain.length; index += 1) {
      this.chain[index].progress = this.headProgress - index * MARBLE_SPACING;
    }
  }

  updateBursts(dt) {
    for (let index = this.popBursts.length - 1; index >= 0; index -= 1) {
      this.popBursts[index].life -= dt;
      if (this.popBursts[index].life <= 0) {
        this.popBursts.splice(index, 1);
      }
    }
  }

  getFrameState() {
    const aimAngle = angleTo(this.center, this.pointer);
    const marbles = this.chain
      .filter((marble) => marble.progress > -MARBLE_SPACING)
      .map((marble, index) => {
        const position = this.path.sample(marble.progress);
        return {
          x: position.x,
          y: position.y,
          progress: marble.progress,
          color: COLORS[marble.color],
          isHead: index === 0,
        };
      });

    const dangerRatio = clamp(
      marbles.length === 0 ? 0 : marbles[0].progress / Math.max(1, this.path.totalLength - MARBLE_RADIUS),
      0,
      1
    );

    return {
      mode: this.mode,
      score: this.score,
      chainCount: this.chain.length,
      shotsCount: this.shots.length,
      dangerRatio,
      message: this.message,
      currentColor: COLORS[this.currentColor],
      nextColor: COLORS[this.nextColor],
      aimAngle,
      center: this.center,
      width: this.width,
      height: this.height,
      path: this.path,
      marbles,
      shots: this.shots.map((shot) => ({
        x: shot.x,
        y: shot.y,
        radius: shot.radius,
        color: COLORS[shot.color],
      })),
      popBursts: this.popBursts.map((burst) => ({
        x: burst.x,
        y: burst.y,
        life: burst.life,
        color: COLORS[burst.color],
      })),
      hudPulse: this.hudPulse,
    };
  }
}
