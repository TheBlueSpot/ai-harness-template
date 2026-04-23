const DEFAULT_FPS = 60;

function toFrameIndex(nowMs, fps) {
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  return Math.floor((safeNow * safeFps) / 1000);
}

export class GlobalTimer {
  constructor({ fps = DEFAULT_FPS, startMs = 0 } = {}) {
    this.fps = fps;
    this.startMs = startMs;
  }

  getFrame(nowMs) {
    return Math.max(0, toFrameIndex(nowMs - this.startMs, this.fps));
  }

  getLoopFrame(loopLength, nowMs) {
    const length = Math.max(1, Math.floor(loopLength || 1));
    return this.getFrame(nowMs) % length;
  }
}

function normalizeFrames(input, fallback = []) {
  if (!Array.isArray(input)) {
    return fallback.slice();
  }
  return input.map((value) => (Number.isFinite(value) ? value : 0));
}

export class KeyframePath {
  constructor({ xFrames = [], yFrames = [] } = {}) {
    this.xFrames = normalizeFrames(xFrames);
    this.yFrames = normalizeFrames(yFrames);
  }

  getFrame(frame) {
    const index = Math.max(0, Math.floor(Number.isFinite(frame) ? frame : 0));
    return {
      x: this.xFrames[index] ?? this.xFrames[this.xFrames.length - 1] ?? 0,
      y: this.yFrames[index] ?? this.yFrames[this.yFrames.length - 1] ?? 0
    };
  }
}

export function createGlobalTimer(options) {
  return new GlobalTimer(options);
}
