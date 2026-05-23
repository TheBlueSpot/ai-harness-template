type CanvasImageSourceLike = CanvasImageSource;

export type Anchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";

export type SpriteAsset = {
  image: CanvasImageSourceLike;
  width?: number;
  height?: number;
};

export type SpriteOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  width?: number;
  height?: number;
  scale?: number | { x?: number; y?: number };
  rotation?: number;
  alpha?: number;
  anchor?: Anchor | { x?: number; y?: number };
  flipX?: boolean;
  flipY?: boolean;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

export type SpriteSliceOptions = SpriteOptions & {
  frameWidth: number;
  frameHeight: number;
  columns?: number;
  margin?: number;
  spacing?: number;
};

export type StrokeFillOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  fill?: string | CanvasGradient | CanvasPattern;
  stroke?: string | CanvasGradient | CanvasPattern;
  lineWidth?: number;
  alpha?: number;
};

export type LineOptions = Omit<StrokeFillOptions, "fill"> & {
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
};

export type TransformOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  x?: number;
  y?: number;
  translateX?: number;
  translateY?: number;
  rotation?: number;
  scale?: number | { x?: number; y?: number };
  alpha?: number;
};

const spriteAssets = new Map<string, SpriteAsset>();
const transformDepth = new WeakMap<CanvasRenderingContext2D, number>();

let activeContext: CanvasRenderingContext2D | undefined;

export function getDrawContext(options?: { ctx?: CanvasRenderingContext2D; context?: CanvasRenderingContext2D }) {
  const ctx = options?.ctx ?? options?.context ?? activeContext;
  if (!ctx) throw new Error("No canvas context available. Pass { ctx } or call setDrawContext(ctx).");
  return ctx;
}

function sourceSize(image: CanvasImageSourceLike) {
  if ("naturalWidth" in image && image.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
  if ("videoWidth" in image && image.videoWidth) return { width: image.videoWidth, height: image.videoHeight };
  if ("width" in image && "height" in image) return { width: Number(image.width) || 0, height: Number(image.height) || 0 };
  return { width: 0, height: 0 };
}

function anchorOffset(anchor: SpriteOptions["anchor"], width: number, height: number) {
  if (!anchor) return { x: 0, y: 0 };
  if (typeof anchor === "object") return { x: (anchor.x ?? 0) * width, y: (anchor.y ?? 0) * height };
  const x = anchor.includes("right") ? width : anchor === "top" || anchor === "center" || anchor === "bottom" ? width / 2 : 0;
  const y = anchor.includes("bottom") ? height : anchor === "left" || anchor === "center" || anchor === "right" ? height / 2 : 0;
  return { x, y };
}

function scaleParts(scale: SpriteOptions["scale"]) {
  if (typeof scale === "number") return { x: scale, y: scale };
  return { x: scale?.x ?? 1, y: scale?.y ?? 1 };
}

function withState(ctx: CanvasRenderingContext2D, alpha: number | undefined, draw: () => void) {
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha *= alpha;
  draw();
  ctx.restore();
}

export function setDrawContext(ctx: CanvasRenderingContext2D | undefined) {
  activeContext = ctx;
}

export function registerSprite(id: string, image: CanvasImageSourceLike | SpriteAsset) {
  spriteAssets.set(id, "image" in image ? image : { image });
}

export function unregisterSprite(id: string) {
  spriteAssets.delete(id);
}

export function getSprite(id: string) {
  return spriteAssets.get(id);
}

export function drawSprite(id: string, x: number, y: number, options: SpriteOptions = {}) {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const ctx = getDrawContext(options);
  const size = sourceSize(asset.image);
  const sx = options.sourceX ?? 0;
  const sy = options.sourceY ?? 0;
  const sw = options.sourceWidth ?? asset.width ?? size.width;
  const sh = options.sourceHeight ?? asset.height ?? size.height;
  const dw = options.width ?? sw;
  const dh = options.height ?? sh;
  const anchor = anchorOffset(options.anchor, dw, dh);
  const scale = scaleParts(options.scale);

  withState(ctx, options.alpha, () => {
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    ctx.scale((options.flipX ? -1 : 1) * scale.x, (options.flipY ? -1 : 1) * scale.y);
    ctx.drawImage(asset.image, sx, sy, sw, sh, -anchor.x, -anchor.y, dw, dh);
  });
}

export function drawSpriteSlice(id: string, x: number, y: number, frameIndex: number, options: SpriteSliceOptions) {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const size = sourceSize(asset.image);
  const columns = options.columns ?? Math.max(1, Math.floor(size.width / options.frameWidth));
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const frameX = frameIndex % columns;
  const frameY = Math.floor(frameIndex / columns);
  drawSprite(id, x, y, {
    ...options,
    sourceX: options.sourceX ?? margin + frameX * (options.frameWidth + spacing),
    sourceY: options.sourceY ?? margin + frameY * (options.frameHeight + spacing),
    sourceWidth: options.sourceWidth ?? options.frameWidth,
    sourceHeight: options.sourceHeight ?? options.frameHeight,
    width: options.width ?? options.frameWidth,
    height: options.height ?? options.frameHeight
  });
}

export function drawRect(x: number, y: number, width: number, height: number, options: StrokeFillOptions = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    if (options.fill) {
      ctx.fillStyle = options.fill;
      ctx.fillRect(x, y, width, height);
    }
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      ctx.lineWidth = options.lineWidth ?? 1;
      ctx.strokeRect(x, y, width, height);
    }
  });
}

export function drawCircle(x: number, y: number, radius: number, options: StrokeFillOptions = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    fillStroke(ctx, options);
  });
}

export function drawLine(x1: number, y1: number, x2: number, y2: number, options: LineOptions = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.lineCap = options.cap ?? ctx.lineCap;
    ctx.lineJoin = options.join ?? ctx.lineJoin;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = options.stroke ?? "#fff";
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.stroke();
  });
}

export function drawPolygon(points: Array<{ x: number; y: number }>, options: StrokeFillOptions = {}) {
  if (points.length < 2) return;
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    fillStroke(ctx, options);
  });
}

function fillStroke(ctx: CanvasRenderingContext2D, options: StrokeFillOptions) {
  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.stroke();
  }
}

export function pushTransform(options: TransformOptions = {}) {
  const ctx = getDrawContext(options);
  ctx.save();
  transformDepth.set(ctx, (transformDepth.get(ctx) ?? 0) + 1);
  if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
  ctx.translate(options.x ?? options.translateX ?? 0, options.y ?? options.translateY ?? 0);
  if (options.rotation) ctx.rotate(options.rotation);
  const scale = scaleParts(options.scale);
  ctx.scale(scale.x, scale.y);
}

export function popTransform(options: { ctx?: CanvasRenderingContext2D; context?: CanvasRenderingContext2D } = {}) {
  const ctx = getDrawContext(options);
  const depth = transformDepth.get(ctx) ?? 0;
  if (depth <= 0) return false;
  ctx.restore();
  transformDepth.set(ctx, depth - 1);
  return true;
}
