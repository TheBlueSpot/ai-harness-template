import { type TransformOptions, getDrawContext, pushTransform, popTransform } from "./drawing.ts";

export type FontOptions = {
  family?: string;
  weight?: string;
  style?: string;
  display?: FontDisplay;
};

export type TextOptions = TransformOptions & {
  fontFamily?: string;
  fontId?: string;
  size?: number;
  weight?: string | number;
  style?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  fill?: string | CanvasGradient | CanvasPattern;
  stroke?: string | CanvasGradient | CanvasPattern;
  lineWidth?: number;
  maxWidth?: number;
};

const fontFamilies = new Map<string, string>();
const pendingFonts = new Map<string, Promise<FontFace | undefined>>();

function fontString(options: TextOptions = {}) {
  const family = options.fontId ? fontFamilies.get(options.fontId) ?? options.fontId : options.fontFamily ?? "sans-serif";
  const style = options.style ?? "normal";
  const weight = options.weight ?? "400";
  const size = options.size ?? 16;
  return `${style} ${weight} ${size}px ${family}`;
}

export function registerFont(id: string, family: string) {
  fontFamilies.set(id, family);
}

export function loadFont(id: string, source: string, options: FontOptions = {}) {
  const family = options.family ?? id;
  registerFont(id, family);
  const FontFaceCtor = globalThis.FontFace;
  if (!FontFaceCtor) return Promise.resolve(undefined);

  const promise = new FontFaceCtor(family, `url(${source})`, {
    weight: options.weight,
    style: options.style,
    display: options.display
  }).load().then((font) => {
    const fonts = globalThis.document?.fonts;
    if (fonts && "add" in fonts && typeof fonts.add === "function") {
      fonts.add(font);
    }
    return font;
  });
  pendingFonts.set(id, promise);
  return promise;
}

export function textReady(id?: string) {
  if (id) return pendingFonts.get(id) ?? Promise.resolve(undefined);
  return Promise.all([...pendingFonts.values()]);
}

export function measureText(text: string, options: TextOptions = {}) {
  const ctx = getDrawContext(options);
  ctx.save();
  ctx.font = fontString(options);
  const metrics = ctx.measureText(text);
  ctx.restore();
  return metrics;
}

export function drawText(text: string, x: number, y: number, options: TextOptions = {}) {
  const ctx = getDrawContext(options);
  pushTransform({ ...options, x, y });
  try {
    ctx.font = fontString(options);
    ctx.textAlign = options.align ?? "left";
    ctx.textBaseline = options.baseline ?? "alphabetic";
    if (options.lineWidth !== undefined) ctx.lineWidth = options.lineWidth;
    const fill = options.fill ?? "#fff";
    ctx.fillStyle = fill;
    if (options.maxWidth !== undefined) ctx.fillText(text, 0, 0, options.maxWidth);
    else ctx.fillText(text, 0, 0);
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      if (options.maxWidth !== undefined) ctx.strokeText(text, 0, 0, options.maxWidth);
      else ctx.strokeText(text, 0, 0);
    }
  } finally {
    popTransform({ ctx });
  }
  return measureText(text, options);
}
