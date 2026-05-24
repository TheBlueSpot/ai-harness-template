export type TextureAtlasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TexturePackerRect = TextureAtlasRect;

export type TextureAtlasFrameData = {
  frame: TextureAtlasRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: TextureAtlasRect;
  sourceSize?: { w: number; h: number };
  pivot?: { x: number; y: number };
};

export type TexturePackerSize = { w: number; h: number };
export type TexturePackerPivot = { x: number; y: number };
export type TexturePackerFrameData = TextureAtlasFrameData;
export type TexturePackerFrameRecord = Record<string, TextureAtlasFrameData>;
export type TexturePackerMeta = {
  image?: string;
  size?: TexturePackerSize;
  scale?: string | number;
  app?: string;
  version?: string;
};

export type TextureAtlasFrameInput = TextureAtlasFrameData & {
  filename?: string;
  name?: string;
};

export type TextureAtlasJson = {
  frames: TexturePackerFrameRecord | TextureAtlasFrameInput[];
  meta?: TexturePackerMeta;
};

export type TexturePackerAtlasJson = TextureAtlasJson;
export type TextureAtlasMetadata = TexturePackerMeta;
export type TextureAtlasOptions = {
  image?: CanvasImageSource;
};

export type AtlasFrame = TextureAtlasFrame;

export type TextureAtlasFrame = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: TextureAtlasRect;
  rotated: boolean;
  trimmed: boolean;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  pivotX: number;
  pivotY: number;
};

export type TextureAtlas = {
  image?: CanvasImageSource;
  meta?: TextureAtlasJson["meta"];
  getFrame(name: string): TextureAtlasFrame | undefined;
  requireFrame(name: string): TextureAtlasFrame;
  hasFrame(name: string): boolean;
  frameNames(): string[];
  frames(): TextureAtlasFrame[];
};

function normalizeFrame(
  name: string,
  data: TextureAtlasFrameData,
): TextureAtlasFrame {
  const sourceSize = data.sourceSize ?? data.frame;
  const sourceRect = data.spriteSourceSize ?? { x: 0, y: 0, w: sourceSize.w, h: sourceSize.h };
  const frame = {
    x: data.frame.x,
    y: data.frame.y,
    w: data.frame.w,
    h: data.frame.h
  };

  const normalized = {
    name,
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    frame,
    rotated: data.rotated ?? false,
    trimmed: data.trimmed ?? false,
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceSize.w,
    sourceHeight: sourceSize.h,
    pivotX: data.pivot?.x ?? 0.5,
    pivotY: data.pivot?.y ?? 0.5
  };

  Object.defineProperty(normalized, "frame", {
    value: frame,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return normalized;
}

export function createTextureAtlas(json: TextureAtlasJson, image?: CanvasImageSource): TextureAtlas {
  const frames = new Map<string, TextureAtlasFrame>();

  if (Array.isArray(json.frames)) {
    for (const entry of json.frames) {
      const name = entry.filename ?? entry.name;
      if (!name) continue;
      frames.set(name, normalizeFrame(name, entry));
    }
  } else {
    for (const [name, entry] of Object.entries(json.frames)) {
      frames.set(name, normalizeFrame(name, entry));
    }
  }

  return {
    image,
    meta: json.meta,
    getFrame(name: string) {
      return frames.get(name);
    },
    requireFrame(name: string) {
      const frame = frames.get(name);
      if (!frame) throw new Error(`Texture atlas frame not found: ${name}`);
      return frame;
    },
    hasFrame(name: string) {
      return frames.has(name);
    },
    frameNames() {
      return [...frames.keys()];
    },
    frames() {
      return [...frames.values()];
    }
  };
}

export function parseTexturePackerAtlas(json: TexturePackerAtlasJson, image?: CanvasImageSource) {
  return createTextureAtlas(json, image);
}

export type TexturePackerAtlas = TextureAtlas;
export type TexturePackerAtlasFrame = TextureAtlasFrame;
export type TexturePackerAtlasMetadata = TextureAtlasMetadata;
export type TexturePackerAtlasOptions = TextureAtlasOptions;

export function createTexturePackerAtlas(json: TextureAtlasJson, image?: CanvasImageSource) {
  return createTextureAtlas(json, image);
}
