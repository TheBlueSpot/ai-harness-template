export class ReplayRecorder {
  constructor({ levelId = null, frameStride = 1 } = {}) {
    this.levelId = levelId;
    this.frameStride = Math.max(1, frameStride | 0);
    this.frames = [];
    this.closed = false;
    this.lastFrameIndex = -1;
  }

  captureFrame(sample) {
    if (this.closed || !sample) return null;
    const frameIndex = sample.frameIndex ?? this.frames.length;
    if (!sample.force && this.frames.length > 0 && frameIndex - this.lastFrameIndex < this.frameStride) {
      return null;
    }
    const frame = {
      frameIndex,
      t: sample.t ?? this.frames.length,
      x: sample.x ?? 0,
      y: sample.y ?? 0,
      vx: sample.vx ?? 0,
      vy: sample.vy ?? 0,
      facing: sample.facing ?? (sample.vx < 0 ? -1 : 1),
      grounded: Boolean(sample.grounded),
      alive: sample.alive !== false,
      deathTint: sample.deathTint ?? 0,
    };
    this.frames.push(frame);
    this.lastFrameIndex = frame.frameIndex;
    return frame;
  }

  finalize(meta = {}) {
    this.closed = true;
    return {
      levelId: this.levelId,
      frames: this.frames.slice(),
      deathFrameIndex: meta.deathFrameIndex ?? (this.frames.length ? this.frames.length - 1 : 0),
      cause: meta.cause ?? "unknown",
      timestamp: meta.timestamp ?? null,
    };
  }
}

export function createReplayRecorder(options) {
  return new ReplayRecorder(options);
}
