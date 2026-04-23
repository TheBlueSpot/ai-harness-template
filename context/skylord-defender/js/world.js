import { HEIGHT, WIDTH } from "./config.js";
import { clamp, lerp, randRange } from "./math.js";

export class Terrain {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.surface = new Float32Array(width);
    this._scratch = new Float32Array(width);
    this.reset();
  }

  reset() {
    const base = this.height * 0.72;
    for (let x = 0; x < this.width; x += 1) {
      const waveA = Math.sin(x * 0.0052) * 34;
      const waveB = Math.sin(x * 0.017 + 1.6) * 22;
      const waveC = Math.sin(x * 0.041 + 0.5) * 10;
      const ridge = Math.sin(x * 0.0023 + 0.7) * 48;
      this.surface[x] = clamp(base + waveA + waveB + waveC + ridge, this.height * 0.42, this.height - 70);
    }

    for (let pass = 0; pass < 3; pass += 1) {
      this.smooth(0.35);
    }
  }

  smooth(strength = 0.25) {
    const { surface, _scratch: scratch } = this;
    for (let x = 0; x < this.width; x += 1) {
      const left = surface[Math.max(0, x - 1)];
      const here = surface[x];
      const right = surface[Math.min(this.width - 1, x + 1)];
      scratch[x] = lerp(here, (left + here + right) / 3, strength);
    }
    surface.set(scratch);
  }

  settle(dt) {
    const mix = clamp(dt * 0.9, 0, 0.08);
    if (mix > 0) {
      this.smooth(mix);
    }
  }

  heightAt(x) {
    const clamped = clamp(x, 0, this.width - 1);
    const left = Math.floor(clamped);
    const right = Math.min(this.width - 1, left + 1);
    const t = clamped - left;
    return lerp(this.surface[left], this.surface[right], t);
  }

  deform(x, radius, depth) {
    const left = Math.max(0, Math.floor(x - radius));
    const right = Math.min(this.width - 1, Math.ceil(x + radius));
    for (let column = left; column <= right; column += 1) {
      const falloff = 1 - clamp(Math.abs(column - x) / radius, 0, 1);
      const drop = depth * falloff * falloff;
      this.surface[column] = clamp(this.surface[column] + drop, this.height * 0.35, this.height - 48);
    }
    this.smooth(0.16);
  }

  blast(x, radius, depth) {
    this.deform(x, radius, depth);
    const nudge = randRange(-0.15, 0.15);
    const center = clamp(Math.floor(x), 0, this.width - 1);
    this.surface[center] = clamp(this.surface[center] + depth * nudge, this.height * 0.35, this.height - 48);
  }
}
