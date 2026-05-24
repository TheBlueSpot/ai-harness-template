export type Pixel = [number, number, number, number];

export type PostProcessContext = {
  width: number;
  height: number;
  time?: number;
  intensity?: number;
  centerX?: number;
  centerY?: number;
  seed?: number;
};

export type PostProcessCostTier = "overlay" | "pixel" | "distortion";

export const postProcessCosts = {
  overlay: { tier: "overlay", readsPixels: false, writesPixels: false, fullCanvasPasses: 1 },
  pixel: { tier: "pixel", readsPixels: true, writesPixels: true, fullCanvasPasses: 1 },
  distortion: { tier: "distortion", readsPixels: true, writesPixels: true, fullCanvasPasses: 2 }
} as const satisfies Record<PostProcessCostTier, PostProcessEffectCost>;

export type PostProcessEffectCost = {
  tier: PostProcessCostTier;
  readsPixels: boolean;
  writesPixels: boolean;
  fullCanvasPasses: number;
};

export type PostProcessBudget = {
  maxPixelEffects?: number;
  maxDistortionEffects?: number;
  maxFullCanvasPasses?: number;
  allowDistortion?: boolean;
};

export type PostProcessBudgetReport = {
  ok: boolean;
  pixelEffects: number;
  distortionEffects: number;
  fullCanvasPasses: number;
  violations: string[];
};

export type PostProcessApiStatus = "stable" | "prototype";
export type PostProcessApiProof = "engine-contract" | "migrated-game" | "candidate";
export type PostProcessApiPromotion = "stable" | "blocked";
export type PostProcessApiExposure = "root" | "prototype-root";

export type PostProcessApiProfile = {
  status: PostProcessApiStatus;
  tier: PostProcessCostTier;
  proof: PostProcessApiProof;
  promotion: PostProcessApiPromotion;
  exposure: PostProcessApiExposure;
};

export const postProcessApiProfileNames = [
  "createPostProcessStack",
  "getPostProcessEffectCost",
  "summarizePostProcessCost",
  "checkPostProcessBudget",
  "grayscale",
  "invert",
  "brightness",
  "contrast",
  "sepia",
  "threshold",
  "tint",
  "posterize",
  "gamma",
  "colorGrading",
  "filmGrain",
  "digitalNoise",
  "retroDithering",
  "vignette",
  "colorLut",
  "screenShake",
  "bloom",
  "neonGlow",
  "flashbang",
  "crtScanlines",
  "scanlineFlicker",
  "chromaticAberration",
  "colorFringe",
  "chromaticDistortion",
  "motionBlur",
  "radialBlur",
  "lensFlare",
  "starStreak",
  "pixelate",
  "barrelDistortion",
  "shockwaveDistortion",
  "heatHaze",
  "glitch"
] as const;

export type PostProcessApiProfileName = (typeof postProcessApiProfileNames)[number];

const stableProfile = (
  tier: PostProcessCostTier,
  proof: PostProcessApiProof = "engine-contract"
): PostProcessApiProfile => ({ status: "stable", tier, proof, promotion: "stable", exposure: "root" });

const prototypeProfile = (tier: PostProcessCostTier, proof: PostProcessApiProof = "candidate"): PostProcessApiProfile => ({
  status: "prototype",
  tier,
  proof,
  promotion: "blocked",
  exposure: "prototype-root"
});

export const postProcessApiProfiles = {
  createPostProcessStack: stableProfile("pixel"),
  getPostProcessEffectCost: stableProfile("overlay"),
  summarizePostProcessCost: stableProfile("overlay"),
  checkPostProcessBudget: stableProfile("overlay"),
  grayscale: stableProfile("pixel"),
  invert: stableProfile("pixel"),
  brightness: stableProfile("pixel"),
  contrast: stableProfile("pixel"),
  sepia: stableProfile("pixel"),
  threshold: stableProfile("pixel"),
  tint: stableProfile("pixel"),
  posterize: stableProfile("pixel"),
  gamma: stableProfile("pixel"),
  colorGrading: stableProfile("pixel"),
  filmGrain: stableProfile("pixel"),
  digitalNoise: stableProfile("pixel"),
  retroDithering: stableProfile("pixel"),
  vignette: stableProfile("pixel"),
  colorLut: stableProfile("pixel"),
  screenShake: stableProfile("overlay", "migrated-game"),
  bloom: prototypeProfile("overlay"),
  neonGlow: prototypeProfile("overlay"),
  flashbang: prototypeProfile("overlay", "migrated-game"),
  crtScanlines: stableProfile("overlay"),
  scanlineFlicker: prototypeProfile("overlay"),
  chromaticAberration: prototypeProfile("overlay"),
  colorFringe: prototypeProfile("overlay"),
  chromaticDistortion: prototypeProfile("overlay"),
  motionBlur: prototypeProfile("overlay"),
  radialBlur: prototypeProfile("overlay"),
  lensFlare: prototypeProfile("overlay"),
  starStreak: prototypeProfile("overlay"),
  pixelate: prototypeProfile("distortion"),
  barrelDistortion: prototypeProfile("distortion"),
  shockwaveDistortion: prototypeProfile("distortion"),
  heatHaze: prototypeProfile("distortion"),
  glitch: prototypeProfile("distortion")
} as const satisfies Record<PostProcessApiProfileName, PostProcessApiProfile>;

export type PixelEffect = {
  name: string;
  cost?: PostProcessEffectCost;
  apply(pixel: Pixel, x: number, y: number, context: PostProcessContext): Pixel;
};

export type CanvasOverlayEffect = {
  name: string;
  cost?: PostProcessEffectCost;
  draw(ctx: CanvasRenderingContext2D, context: PostProcessContext): void;
};

export type PostProcessEffect = PixelEffect | CanvasOverlayEffect;

export type PostProcessStack = {
  add(effect: PostProcessEffect): PostProcessStack;
  remove(name: string): boolean;
  clear(): void;
  apply(ctx: CanvasRenderingContext2D, context?: Partial<PostProcessContext>): void;
  effects(): readonly PostProcessEffect[];
};

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const hasApply = (effect: PostProcessEffect): effect is PixelEffect => "apply" in effect;
const hasDraw = (effect: PostProcessEffect): effect is CanvasOverlayEffect => "draw" in effect;
const overlayCost = postProcessCosts.overlay;
const pixelCost = postProcessCosts.pixel;
const distortionCost = postProcessCosts.distortion;

function hashNoise(x: number, y: number, seed = 0): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function sampleNearest(source: Uint8ClampedArray, width: number, height: number, x: number, y: number): Pixel {
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (sy * width + sx) * 4;
  return [source[index], source[index + 1], source[index + 2], source[index + 3]];
}

export function getPostProcessEffectCost(effect: PostProcessEffect): PostProcessEffectCost {
  if (effect.cost) return effect.cost;
  return hasApply(effect) ? pixelCost : overlayCost;
}

export function summarizePostProcessCost(effects: readonly PostProcessEffect[]): PostProcessBudgetReport {
  let pixelEffects = 0;
  let distortionEffects = 0;
  let fullCanvasPasses = 0;

  for (const effect of effects) {
    const cost = getPostProcessEffectCost(effect);
    if (cost.tier === "pixel") pixelEffects += 1;
    if (cost.tier === "distortion") distortionEffects += 1;
    fullCanvasPasses += cost.fullCanvasPasses;
  }

  return { ok: true, pixelEffects, distortionEffects, fullCanvasPasses, violations: [] };
}

export function checkPostProcessBudget(effects: readonly PostProcessEffect[], budget: PostProcessBudget): PostProcessBudgetReport {
  const report = summarizePostProcessCost(effects);
  const violations: string[] = [];

  if (budget.maxPixelEffects !== undefined && report.pixelEffects > budget.maxPixelEffects) {
    violations.push(`pixel effects ${report.pixelEffects} exceeds ${budget.maxPixelEffects}`);
  }
  if (budget.maxDistortionEffects !== undefined && report.distortionEffects > budget.maxDistortionEffects) {
    violations.push(`distortion effects ${report.distortionEffects} exceeds ${budget.maxDistortionEffects}`);
  }
  if (budget.maxFullCanvasPasses !== undefined && report.fullCanvasPasses > budget.maxFullCanvasPasses) {
    violations.push(`full canvas passes ${report.fullCanvasPasses} exceeds ${budget.maxFullCanvasPasses}`);
  }
  if (budget.allowDistortion === false && report.distortionEffects > 0) {
    violations.push("distortion effects are not allowed");
  }

  return { ...report, ok: violations.length === 0, violations };
}

export function createPostProcessStack(effects: PostProcessEffect[] = []): PostProcessStack {
  const stack = [...effects];

  return {
    add(effect) {
      stack.push(effect);
      return this;
    },
    remove(name) {
      const index = stack.findIndex((effect) => effect.name === name);
      if (index === -1) return false;
      stack.splice(index, 1);
      return true;
    },
    clear() {
      stack.length = 0;
    },
    apply(ctx, partial = {}) {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      if (width <= 0 || height <= 0 || stack.length === 0) return;

      const context: PostProcessContext = {
        width,
        height,
        time: 0,
        intensity: 1,
        centerX: width * 0.5,
        centerY: height * 0.5,
        seed: 1,
        ...partial
      };

      const pixelEffects = stack.filter(hasApply);
      if (pixelEffects.length > 0) {
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            let pixel: Pixel = [data[index], data[index + 1], data[index + 2], data[index + 3]];
            for (const effect of pixelEffects) {
              pixel = effect.apply(pixel, x, y, context);
            }
            data[index] = clampByte(pixel[0]);
            data[index + 1] = clampByte(pixel[1]);
            data[index + 2] = clampByte(pixel[2]);
            data[index + 3] = clampByte(pixel[3]);
          }
        }
        ctx.putImageData(image, 0, 0);
      }

      for (const effect of stack.filter(hasDraw)) {
        effect.draw(ctx, context);
      }
    },
    effects() {
      return stack;
    }
  };
}

export function grayscale(amount = 1): PixelEffect {
  return {
    name: "grayscale",
    cost: pixelCost,
    apply: ([r, g, b, a]) => {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      return [r + (gray - r) * amount, g + (gray - g) * amount, b + (gray - b) * amount, a];
    }
  };
}

export function invert(amount = 1): PixelEffect {
  return { name: "invert", cost: pixelCost, apply: ([r, g, b, a]) => [r + (255 - r * 2) * amount, g + (255 - g * 2) * amount, b + (255 - b * 2) * amount, a] };
}

export function brightness(amount = 0): PixelEffect {
  return { name: "brightness", cost: pixelCost, apply: ([r, g, b, a]) => [r + amount * 255, g + amount * 255, b + amount * 255, a] };
}

export function contrast(amount = 0): PixelEffect {
  const factor = 1 + amount;
  return { name: "contrast", cost: pixelCost, apply: ([r, g, b, a]) => [(r - 128) * factor + 128, (g - 128) * factor + 128, (b - 128) * factor + 128, a] };
}

export function sepia(amount = 1): PixelEffect {
  return {
    name: "sepia",
    cost: pixelCost,
    apply: ([r, g, b, a]) => [
      r + (r * 0.393 + g * 0.769 + b * 0.189 - r) * amount,
      g + (r * 0.349 + g * 0.686 + b * 0.168 - g) * amount,
      b + (r * 0.272 + g * 0.534 + b * 0.131 - b) * amount,
      a
    ]
  };
}

export function threshold(level = 128): PixelEffect {
  return { name: "threshold", cost: pixelCost, apply: ([r, g, b, a]) => {
    const value = r * 0.299 + g * 0.587 + b * 0.114 >= level ? 255 : 0;
    return [value, value, value, a];
  } };
}

export function tint(color: [number, number, number], amount = 0.25): PixelEffect {
  return { name: "tint", cost: pixelCost, apply: ([r, g, b, a]) => [r + (color[0] - r) * amount, g + (color[1] - g) * amount, b + (color[2] - b) * amount, a] };
}

export function posterize(levels = 4): PixelEffect {
  const count = Math.max(2, Math.floor(levels));
  const step = 255 / (count - 1);
  return { name: "posterize", cost: pixelCost, apply: ([r, g, b, a]) => [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step, a] };
}

export function gamma(value = 1): PixelEffect {
  const inverse = 1 / Math.max(0.01, value);
  return { name: "gamma", cost: pixelCost, apply: ([r, g, b, a]) => [255 * ((r / 255) ** inverse), 255 * ((g / 255) ** inverse), 255 * ((b / 255) ** inverse), a] };
}

export function colorGrading(options: { lift?: number; gain?: number; temperature?: number; saturation?: number } = {}): PixelEffect {
  const { lift = 0, gain = 1, temperature = 0, saturation = 1 } = options;
  return {
    name: "color-grading",
    cost: pixelCost,
    apply: ([r, g, b, a]) => {
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      return [
        luma + ((r + lift * 255) * gain + temperature * 32 - luma) * saturation,
        luma + ((g + lift * 255) * gain - luma) * saturation,
        luma + ((b + lift * 255) * gain - temperature * 32 - luma) * saturation,
        a
      ];
    }
  };
}

export function filmGrain(amount = 0.08): PixelEffect {
  return { name: "film-grain", cost: pixelCost, apply: ([r, g, b, a], x, y, context) => {
    const noise = (hashNoise(x, y, (context.seed ?? 0) + Math.floor((context.time ?? 0) * 24)) - 0.5) * amount * 255;
    return [r + noise, g + noise, b + noise, a];
  } };
}

export function digitalNoise(amount = 0.08): PixelEffect {
  return { ...filmGrain(amount), name: "digital-noise" };
}

export function retroDithering(levels = 4): PixelEffect {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return { name: "retro-dithering", cost: pixelCost, apply: ([r, g, b, a], x, y) => {
    const n = matrix[(y % 4) * 4 + (x % 4)] / 16 - 0.5;
    const shift = n * (255 / Math.max(2, levels));
    return posterize(levels).apply([r + shift, g + shift, b + shift, a], x, y, { width: 1, height: 1 });
  } };
}

export function vignette(amount = 0.45, radius = 0.72): PixelEffect {
  return { name: "vignette", cost: pixelCost, apply: ([r, g, b, a], x, y, context) => {
    const dx = (x - (context.centerX ?? context.width * 0.5)) / context.width;
    const dy = (y - (context.centerY ?? context.height * 0.5)) / context.height;
    const edge = clampUnit((Math.sqrt(dx * dx + dy * dy) / radius) ** 2);
    const scale = 1 - edge * amount;
    return [r * scale, g * scale, b * scale, a];
  } };
}

export function pixelate(ctx: CanvasRenderingContext2D, size = 4): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const block = Math.max(1, Math.floor(size));
  const source = ctx.getImageData(0, 0, width, height);
  const data = source.data;
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      const sample = sampleNearest(data, width, height, x, y);
      for (let yy = y; yy < Math.min(height, y + block); yy += 1) {
        for (let xx = x; xx < Math.min(width, x + block); xx += 1) {
          const index = (yy * width + xx) * 4;
          data[index] = sample[0];
          data[index + 1] = sample[1];
          data[index + 2] = sample[2];
          data[index + 3] = sample[3];
        }
      }
    }
  }
  ctx.putImageData(source, 0, 0);
}
pixelate.cost = distortionCost;

export function screenShake(amount: number, time = 0): { x: number; y: number } {
  return {
    x: Math.sin(time * 71.3) * amount + Math.sin(time * 19.7) * amount * 0.35,
    y: Math.cos(time * 83.1) * amount * 0.7
  };
}

export function bloom(ctx: CanvasRenderingContext2D, amount = 0.35, blur = 8): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = amount;
  ctx.filter = `blur(${blur}px) brightness(1.45)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}
bloom.cost = overlayCost;

export function neonGlow(ctx: CanvasRenderingContext2D, color = "rgba(0, 255, 220, 0.22)", blur = 12): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
neonGlow.cost = overlayCost;

export function flashbang(ctx: CanvasRenderingContext2D, amount = 1): void {
  ctx.save();
  ctx.globalAlpha = clampUnit(amount);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
flashbang.cost = overlayCost;

export function crtScanlines(spacing = 3, alpha = 0.18): CanvasOverlayEffect {
  return { name: "crt-scanlines", cost: overlayCost, draw: (ctx) => {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < ctx.canvas.height; y += spacing) ctx.fillRect(0, y, ctx.canvas.width, 1);
    ctx.restore();
  } };
}

export const scanlineFlicker = (spacing = 3, alpha = 0.12): CanvasOverlayEffect => ({
  name: "scanline-flicker",
  cost: overlayCost,
  draw: (ctx, context) => crtScanlines(spacing, alpha + Math.sin((context.time ?? 0) * 40) * alpha * 0.35).draw(ctx, context)
});

export function chromaticAberration(ctx: CanvasRenderingContext2D, offset = 2): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.55;
  ctx.filter = "sepia(1) saturate(4) hue-rotate(-35deg)";
  ctx.drawImage(canvas, offset, 0);
  ctx.filter = "sepia(1) saturate(4) hue-rotate(165deg)";
  ctx.drawImage(canvas, -offset, 0);
  ctx.restore();
}
chromaticAberration.cost = overlayCost;

export const colorFringe = chromaticAberration;
export const chromaticDistortion = chromaticAberration;

export function motionBlur(ctx: CanvasRenderingContext2D, dx = 3, dy = 0, samples = 4, alpha = 0.12): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 1; i <= samples; i += 1) ctx.drawImage(canvas, dx * i, dy * i);
  ctx.restore();
}
motionBlur.cost = overlayCost;

export function radialBlur(ctx: CanvasRenderingContext2D, amount = 0.02, samples = 5): void {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let i = 1; i <= samples; i += 1) {
    const scale = 1 + amount * i;
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(scale, scale);
    ctx.drawImage(ctx.canvas, -width * 0.5, -height * 0.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}
radialBlur.cost = overlayCost;

export function barrelDistortion(ctx: CanvasRenderingContext2D, amount = 0.18): void {
  distort(ctx, (nx, ny) => {
    const r2 = nx * nx + ny * ny;
    const factor = 1 + amount * r2;
    return [nx * factor, ny * factor];
  });
}
barrelDistortion.cost = distortionCost;

export function shockwaveDistortion(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, amount = 8): void {
  distort(ctx, (nx, ny, width, height) => {
    const x = nx * width * 0.5 + width * 0.5;
    const y = ny * height * 0.5 + height * 0.5;
    const distance = Math.hypot(x - centerX, y - centerY);
    const ring = Math.max(0, 1 - Math.abs(distance - radius) / 24);
    const push = (ring * amount) / Math.max(1, distance);
    return [nx + (x - centerX) * push / width, ny + (y - centerY) * push / height];
  });
}
shockwaveDistortion.cost = distortionCost;

export function heatHaze(ctx: CanvasRenderingContext2D, time = 0, amount = 3): void {
  distort(ctx, (nx, ny, width) => [nx + Math.sin(ny * 28 + time * 5) * amount / width, ny]);
}
heatHaze.cost = distortionCost;

export function glitch(ctx: CanvasRenderingContext2D, amount = 6, seed = 1): void {
  const { width, height } = ctx.canvas;
  const source = ctx.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y += 4) {
    const shift = Math.round((hashNoise(y, seed) - 0.5) * amount * 2);
    ctx.putImageData(source, shift, 0, 0, y, width, Math.min(4, height - y));
  }
}
glitch.cost = distortionCost;

export function lensFlare(ctx: CanvasRenderingContext2D, x: number, y: number, amount = 0.5): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(ctx.canvas.width, ctx.canvas.height) * 0.28);
  gradient.addColorStop(0, `rgba(255, 255, 230, ${0.65 * amount})`);
  gradient.addColorStop(0.2, `rgba(255, 180, 90, ${0.22 * amount})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
lensFlare.cost = overlayCost;

export function starStreak(ctx: CanvasRenderingContext2D, x: number, y: number, length = 120, amount = 0.5): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(255, 255, 245, ${amount})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - length * 0.5, y);
  ctx.lineTo(x + length * 0.5, y);
  ctx.moveTo(x, y - length * 0.2);
  ctx.lineTo(x, y + length * 0.2);
  ctx.stroke();
  ctx.restore();
}
starStreak.cost = overlayCost;

export function colorLut(mapper: (pixel: Pixel) => Pixel): PixelEffect {
  return { name: "color-lut", cost: pixelCost, apply: (pixel) => mapper(pixel) };
}


function distort(ctx: CanvasRenderingContext2D, map: (nx: number, ny: number, width: number, height: number) => [number, number]): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const source = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x / width) * 2 - 1;
      const ny = (y / height) * 2 - 1;
      const [mx, my] = map(nx, ny, width, height);
      const sample = sampleNearest(source.data, width, height, (mx + 1) * width * 0.5, (my + 1) * height * 0.5);
      const index = (y * width + x) * 4;
      output.data[index] = sample[0];
      output.data[index + 1] = sample[1];
      output.data[index + 2] = sample[2];
      output.data[index + 3] = sample[3];
    }
  }
  ctx.putImageData(output, 0, 0);
}
