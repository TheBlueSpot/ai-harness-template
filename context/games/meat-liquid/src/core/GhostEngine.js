import { createReplayRecorder } from "./ReplayRecorder.js";

export class GhostEngine {
  constructor({
    frameStride = 4,
    renderLimit = 24,
    cullMargin = 720,
    scanLimit = null,
    maxRunsPerLevel = 18,
    maxTotalRuns = 54,
  } = {}) {
    this.runs = [];
    this.currentRecorder = null;
    this.currentRun = null;
    this._totalDeaths = 0;
    this.frameIndex = 0;
    this.levelId = null;
    this.frameStride = Math.max(1, frameStride | 0);
    this.renderLimit = Math.max(1, renderLimit | 0);
    this.cullMargin = cullMargin;
    this.scanLimit = Math.max(this.renderLimit, scanLimit ?? this.renderLimit * 8);
    this.maxRunsPerLevel = Math.max(this.renderLimit, maxRunsPerLevel | 0);
    this.maxTotalRuns = Math.max(this.maxRunsPerLevel, maxTotalRuns | 0);
  }

  beginRun(levelId) {
    this.currentRecorder = createReplayRecorder({ levelId, frameStride: this.frameStride });
    this.currentRun = { levelId, finalized: false, deathCounted: false };
    this.levelId = levelId;
    return this.currentRecorder;
  }

  restartRun(levelId) {
    return this.beginRun(levelId);
  }

  captureFrame(sample) {
    if (!this.currentRecorder || !this.currentRun || !sample) return null;
    return this.currentRecorder.captureFrame({
      ...sample,
      frameIndex: sample.frameIndex ?? this.frameIndex,
    });
  }

  finalizeDeath(meta = {}) {
    if (!this.currentRecorder || !this.currentRun || this.currentRun.deathCounted) return null;
    const run = this.currentRecorder.finalize(meta);
    this.currentRun.finalized = true;
    this.currentRun.deathCounted = true;
    this._totalDeaths += 1;
    this.runs.push({
      levelId: run.levelId,
      frames: run.frames,
      deathFrameIndex: run.deathFrameIndex,
      cause: run.cause,
      timestamp: run.timestamp,
    });
    this.pruneRuns(run.levelId);
    this.currentRecorder = null;
    this.currentRun = null;
    return run;
  }

  pruneRuns(levelId = null) {
    if (levelId) {
      const kept = [];
      let levelRuns = 0;
      for (let index = this.runs.length - 1; index >= 0; index -= 1) {
        const run = this.runs[index];
        if (run.levelId === levelId) {
          levelRuns += 1;
          if (levelRuns > this.maxRunsPerLevel) continue;
        }
        kept.push(run);
      }
      this.runs = kept.reverse();
    }

    if (this.runs.length > this.maxTotalRuns) {
      this.runs = this.runs.slice(this.runs.length - this.maxTotalRuns);
    }
  }

  update(frameIndex = this.frameIndex, levelId = null) {
    this.frameIndex = frameIndex;
    this.levelId = levelId;
    return null;
  }

  findFrameSample(run, frameIndex) {
    const frames = run.frames;
    if (!frames || frames.length === 0) return null;

    let low = 0;
    let high = frames.length - 1;
    let best = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const midFrame = frames[mid].frameIndex ?? mid;
      if (midFrame === frameIndex) {
        return frames[mid];
      }
      if (midFrame < frameIndex) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return frames[best] ?? frames[frames.length - 1];
  }

  sampleRun(run, frameIndex, swarmIndex) {
    const sample = this.findFrameSample(run, frameIndex);
    if (!sample) return null;
    return {
      id: `${run.levelId ?? "level"}:${swarmIndex}`,
      x: sample.x,
      y: sample.y,
      facing: sample.facing,
      flip: sample.facing < 0,
      alive: sample.alive,
      opacity: sample.alive ? 0.54 : 0.7,
      deathTint: sample.deathTint ?? 0,
      levelId: run.levelId,
    };
  }

  getRenderableGhosts(levelId = null, camera = null, viewport = null) {
    const viewLevelId = levelId ?? this.levelId;
    const viewCenterX = camera?.x ?? null;
    const viewCenterY = camera?.y ?? null;
    const halfWidth = viewport?.width ? viewport.width * 0.5 + this.cullMargin : null;
    const halfHeight = viewport?.height ? viewport.height * 0.5 + this.cullMargin : null;
    const result = [];
    let index = 0;
    let scanned = 0;

    for (let runIndex = this.runs.length - 1; runIndex >= 0; runIndex -= 1) {
      if (scanned >= this.scanLimit) break;
      const run = this.runs[runIndex];
      scanned += 1;
      if (viewLevelId && run.levelId !== viewLevelId) continue;
      if (run.frames.length === 0) continue;
      const ghost = this.sampleRun(run, this.frameIndex, index);
      if (!ghost) continue;
      index += 1;
      if (viewCenterX !== null && viewCenterY !== null && halfWidth !== null && halfHeight !== null) {
        if (Math.abs(ghost.x - viewCenterX) > halfWidth || Math.abs(ghost.y - viewCenterY) > halfHeight) {
          continue;
        }
      }
      result.push(ghost);
      if (result.length >= this.renderLimit) break;
    }

    return result.reverse();
  }

  getTotalDeaths() {
    return this._totalDeaths;
  }

  totalDeaths() {
    return this.getTotalDeaths();
  }

  recordSample(sample) {
    return this.captureFrame(sample);
  }

  ghostPoses(levelId = null) {
    return this.getRenderableGhosts(levelId);
  }
}
