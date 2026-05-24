import { type AtlasFrame, type TextureAtlas } from "../atlas.ts";

export type AtlasAnimationFrameRef = string | { name: string; duration?: number };

export type AtlasAnimationOptions = {
  loop?: boolean;
  frameDuration?: number;
};

export type AtlasAnimationFrame = {
  name: string;
  duration: number;
  frame: AtlasFrame;
};

export type AtlasAnimation = {
  readonly atlas: TextureAtlas;
  readonly loop: boolean;
  readonly frameCount: number;
  readonly frameNames: () => string[];
  readonly frameAt: (index: number) => AtlasFrame;
  readonly currentFrame: () => AtlasFrame;
  readonly currentFrameName: () => string;
  readonly reset: () => AtlasFrame;
  readonly advance: (deltaMs: number) => AtlasFrame;
  readonly setTime: (timeMs: number) => AtlasFrame;
  readonly getFrame: (name: string) => AtlasFrame | undefined;
  readonly requireFrame: (name: string) => AtlasFrame;
};

function resolveFrames(atlas: TextureAtlas, frames: readonly AtlasAnimationFrameRef[], defaultDuration: number) {
  return frames.map<AtlasAnimationFrame>((frame) => {
    const name = typeof frame === "string" ? frame : frame.name;
    return {
      name,
      duration: typeof frame === "string" ? defaultDuration : frame.duration ?? defaultDuration,
      frame: atlas.requireFrame(name)
    };
  });
}

export function createAtlasAnimation(
  atlas: TextureAtlas,
  frames: readonly AtlasAnimationFrameRef[],
  options: AtlasAnimationOptions = {}
): AtlasAnimation {
  const resolved = resolveFrames(atlas, frames, options.frameDuration ?? 100);
  if (!resolved.length) {
    throw new Error("Atlas animation needs at least one frame.");
  }

  const loop = options.loop ?? true;
  let timeMs = 0;

  function frameIndexAt(time: number) {
    const total = resolved.reduce((sum, item) => sum + item.duration, 0);
    if (total <= 0) return 0;
    const normalized = loop ? ((time % total) + total) % total : Math.min(Math.max(time, 0), total - 1);
    let elapsed = 0;
    for (let index = 0; index < resolved.length; index += 1) {
      elapsed += resolved[index].duration;
      if (normalized < elapsed) return index;
    }
    return resolved.length - 1;
  }

  function current() {
    return resolved[frameIndexAt(timeMs)].frame;
  }

  return {
    atlas,
    loop,
    get frameCount() {
      return resolved.length;
    },
    frameNames() {
      return resolved.map((frame) => frame.name);
    },
    frameAt(index: number) {
      const normalized = ((Math.trunc(index) % resolved.length) + resolved.length) % resolved.length;
      return resolved[normalized].frame;
    },
    currentFrame() {
      return current();
    },
    currentFrameName() {
      return resolved[frameIndexAt(timeMs)].name;
    },
    reset() {
      timeMs = 0;
      return current();
    },
    advance(deltaMs: number) {
      timeMs += deltaMs;
      return current();
    },
    setTime(time: number) {
      timeMs = time;
      return current();
    },
    getFrame(name: string) {
      return atlas.getFrame(name);
    },
    requireFrame(name: string) {
      return atlas.requireFrame(name);
    }
  };
}
