import { lerp } from "./math.js";

const TWO_PI = Math.PI * 2;

function buildSegments() {
  const segments = [];
  const total = 900;

  for (let i = 0; i < total; i += 1) {
    const p = i / total;
    const curve =
      Math.sin(p * TWO_PI * 1.5) * 0.0025 +
      Math.sin(p * TWO_PI * 5) * 0.0014 +
      Math.cos(p * TWO_PI * 11) * 0.0009;
    const elevation = Math.sin(p * TWO_PI * 2.3) * 0.55 + Math.cos(p * TWO_PI * 4.5) * 0.25;
    const width = 1.0 + Math.sin(p * TWO_PI * 3.0) * 0.08 + Math.cos(p * TWO_PI * 7.0) * 0.04;
    const strip = p > 0.19 && p < 0.25 || p > 0.53 && p < 0.58 || p > 0.78 && p < 0.83;
    segments.push({
      index: i,
      curve,
      elevation,
      width,
      strip,
      color: i % 2 === 0 ? "#243454" : "#1b2740",
      stripeColor: strip ? "#85ffd7" : "#e2f0ff",
    });
  }

  return segments;
}

export class Track {
  constructor() {
    this.length = 900;
    this.segments = buildSegments();
    this.laps = 3;
  }

  segmentAt(distance) {
    const index = Math.floor(distance) % this.length;
    return this.segments[(index + this.length) % this.length];
  }

  sample(distance) {
    const normalized = ((distance % this.length) + this.length) % this.length;
    const index = Math.floor(normalized);
    const frac = normalized - index;
    const a = this.segments[index];
    const b = this.segments[(index + 1) % this.length];
    return {
      index,
      curve: lerp(a.curve, b.curve, frac),
      elevation: lerp(a.elevation, b.elevation, frac),
      width: lerp(a.width, b.width, frac),
      strip: a.strip || b.strip,
      color: a.color,
      stripeColor: a.stripeColor,
    };
  }
}

