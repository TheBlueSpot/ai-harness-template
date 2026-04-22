import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type StartupPhaseId = "bootstrap" | "workspace" | "runtimes" | "setup" | "ui-assets" | "serve";

export type StartupEventKind =
  | "session-start"
  | "phase-start"
  | "phase-pulse"
  | "phase-slow"
  | "phase-complete"
  | "retry"
  | "complete"
  | "failed";

export type StartupTelemetryEvent = {
  timestamp: string;
  pid: number;
  attempt: number;
  kind: StartupEventKind;
  phaseId?: StartupPhaseId;
  label: string;
  message: string;
  progressPercent: number;
  etaMs?: number;
  etaLowerBound?: boolean;
  elapsedMs: number;
  totalElapsedMs: number;
  hint?: string;
  details?: Record<string, unknown>;
  logPath?: string;
};

export type StartupTelemetrySink = {
  readonly logPath: string;
  sessionStart: (message?: string, details?: Record<string, unknown>) => void;
  pulse: (message: string, details?: Record<string, unknown>) => void;
  phaseStart: (phaseId: StartupPhaseId, message: string, details?: Record<string, unknown>) => void;
  phaseComplete: (message: string, details?: Record<string, unknown>) => void;
  retry: (message: string, details?: Record<string, unknown>) => void;
  complete: (message: string, details?: Record<string, unknown>) => void;
  failed: (message: string, details?: Record<string, unknown>) => void;
  getAttempt: () => number;
  getCurrentPhaseId: () => StartupPhaseId | undefined;
  dispose: () => void;
};

type StartupTelemetryOptions = {
  serverOnly?: boolean;
  now?: () => number;
  pid?: number;
  tmpDir?: string;
  writeLine?: (line: string) => void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
};

type PhaseDefinition = {
  label: string;
  weight: number;
  expectedMs: number;
  slowHint: string;
};

type EmitEventInput = {
  kind: StartupEventKind;
  message: string;
  phaseId?: StartupPhaseId;
  hint?: string;
  details?: Record<string, unknown>;
  elapsedMs?: number;
  includeLogPath?: boolean;
  suppressHumanLine?: boolean;
};

const STARTUP_LOG_DIR = "pi-harness-startup";
const LOG_RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_RETENTION_MAX_FILES = 20;
const FAST_PULSE_MS = 2_000;
const SLOW_PULSE_MS = 5_000;

const PHASES: Record<StartupPhaseId, PhaseDefinition> = {
  bootstrap: {
    label: "bootstrap",
    weight: 5,
    expectedMs: 300,
    slowHint: "possible early process init stall"
  },
  workspace: {
    label: "workspace",
    weight: 25,
    expectedMs: 800,
    slowHint: "possible SQLite migration, lock, or workspace recovery stall"
  },
  runtimes: {
    label: "runtimes",
    weight: 25,
    expectedMs: 1_500,
    slowHint: "possible CLI/runtime discovery or auth probe stall"
  },
  setup: {
    label: "setup",
    weight: 15,
    expectedMs: 500,
    slowHint: "possible setup health scan stall"
  },
  "ui-assets": {
    label: "ui-assets",
    weight: 20,
    expectedMs: 4_000,
    slowHint: "possible Bun/Solid/Tailwind build stall"
  },
  serve: {
    label: "serve",
    weight: 10,
    expectedMs: 250,
    slowHint: "possible port bind or Bun serve stall"
  }
};

export function createStartupTelemetrySession(options: StartupTelemetryOptions = {}): StartupTelemetrySink {
  const now = options.now ?? Date.now;
  const writeLine = options.writeLine ?? ((line: string) => console.log(line));
  const scheduleTimeout = options.setTimeout ?? globalThis.setTimeout;
  const cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout;
  const pid = options.pid ?? process.pid;
  const sessionStartedAt = now();
  const includedPhases = (
    ["bootstrap", "workspace", "runtimes", "setup", "ui-assets", "serve"] as StartupPhaseId[]
  ).filter((phaseId) => !(options.serverOnly && phaseId === "ui-assets"));
  const normalizedWeights = normalizeWeights(includedPhases);
  const logDir = path.join(options.tmpDir ?? os.tmpdir(), STARTUP_LOG_DIR);
  const logPath = path.join(logDir, `${formatFileTimestamp(sessionStartedAt)}-pid${pid}.jsonl`);

  mkdirSync(logDir, { recursive: true });
  appendFileSync(logPath, "");
  pruneStartupLogs(logDir, logPath, sessionStartedAt);
  writeLine(`startup telemetry: ${logPath}`);

  let attempt = 1;
  let currentPhaseId: StartupPhaseId | undefined;
  let currentPhaseStartedAt: number | undefined;
  let slowMarked = false;
  let finalized = false;
  const completedPhases = new Set<StartupPhaseId>();
  let fastPulseTimer: ReturnType<typeof setTimeout> | undefined;
  let slowPulseTimer: ReturnType<typeof setTimeout> | undefined;
  let slowThresholdTimer: ReturnType<typeof setTimeout> | undefined;

  const emitEvent = ({
    kind,
    message,
    phaseId = currentPhaseId,
    hint,
    details,
    elapsedMs,
    includeLogPath = false,
    suppressHumanLine = false
  }: EmitEventInput) => {
    const timestampMs = now();
    const phaseElapsedMs = elapsedMs ?? computePhaseElapsedMs(timestampMs, phaseId, currentPhaseStartedAt);
    const totalElapsedMs = Math.max(0, timestampMs - sessionStartedAt);
    const { progressPercent, etaMs, etaLowerBound } = computeProgressSnapshot({
      includedPhases,
      normalizedWeights,
      completedPhases,
      currentPhaseId,
      currentPhaseStartedAt,
      timestampMs,
      kind
    });
    const label = phaseId ? PHASES[phaseId].label : "startup";
    const event: StartupTelemetryEvent = {
      timestamp: new Date(timestampMs).toISOString(),
      pid,
      attempt,
      kind,
      phaseId,
      label,
      message,
      progressPercent,
      elapsedMs: phaseElapsedMs,
      totalElapsedMs
    };

    if (etaMs !== undefined) {
      event.etaMs = etaMs;
    }
    if (etaLowerBound) {
      event.etaLowerBound = true;
    }
    if (hint) {
      event.hint = hint;
    }
    if (details) {
      event.details = details;
    }
    if (includeLogPath) {
      event.logPath = logPath;
    }

    appendFileSync(logPath, `${JSON.stringify(event)}\n`);
    if (!suppressHumanLine) {
      writeLine(renderHumanLine(event));
    }
  };

  const clearPhaseTimers = () => {
    if (fastPulseTimer) {
      cancelTimeout(fastPulseTimer);
      fastPulseTimer = undefined;
    }
    if (slowPulseTimer) {
      cancelTimeout(slowPulseTimer);
      slowPulseTimer = undefined;
    }
    if (slowThresholdTimer) {
      cancelTimeout(slowThresholdTimer);
      slowThresholdTimer = undefined;
    }
  };

  const scheduleFastPulse = () => {
    fastPulseTimer = scheduleTimeout(() => {
      if (!currentPhaseId || finalized || slowMarked) {
        return;
      }

      emitEvent({
        kind: "phase-pulse",
        message: `${PHASES[currentPhaseId].label} in progress`
      });
      scheduleFastPulse();
    }, FAST_PULSE_MS);
  };

  const scheduleSlowPulse = () => {
    slowPulseTimer = scheduleTimeout(() => {
      if (!currentPhaseId || finalized) {
        return;
      }

      emitEvent({
        kind: "phase-pulse",
        message: `${PHASES[currentPhaseId].label} still in progress`
      });
      scheduleSlowPulse();
    }, SLOW_PULSE_MS);
  };

  const schedulePhaseTimers = () => {
    clearPhaseTimers();
    if (!currentPhaseId || finalized) {
      return;
    }

    scheduleFastPulse();
    const thresholdMs = Math.max(PHASES[currentPhaseId].expectedMs, 5_000);
    slowThresholdTimer = scheduleTimeout(() => {
      if (!currentPhaseId || finalized || slowMarked) {
        return;
      }

      slowMarked = true;
      if (fastPulseTimer) {
        cancelTimeout(fastPulseTimer);
        fastPulseTimer = undefined;
      }
      emitEvent({
        kind: "phase-slow",
        hint: PHASES[currentPhaseId].slowHint,
        message: `${PHASES[currentPhaseId].label} exceeded expected startup time`,
        details: {
          thresholdMs
        }
      });
      scheduleSlowPulse();
    }, thresholdMs + 1);
  };

  return {
    logPath,
    sessionStart(message = "startup session created", details) {
      if (finalized) {
        return;
      }

      emitEvent({
        kind: "session-start",
        message,
        details,
        includeLogPath: true,
        suppressHumanLine: true
      });
    },
    pulse(message, details) {
      if (finalized) {
        return;
      }

      emitEvent({
        kind: "phase-pulse",
        message,
        details
      });
    },
    phaseStart(phaseId, message, details) {
      if (finalized) {
        return;
      }

      currentPhaseId = phaseId;
      currentPhaseStartedAt = now();
      slowMarked = false;
      emitEvent({
        kind: "phase-start",
        phaseId,
        message,
        details,
        elapsedMs: 0
      });
      schedulePhaseTimers();
    },
    phaseComplete(message, details) {
      if (finalized || !currentPhaseId) {
        return;
      }

      const phaseId = currentPhaseId;
      const phaseElapsedMs = computePhaseElapsedMs(now(), phaseId, currentPhaseStartedAt);
      clearPhaseTimers();
      completedPhases.add(phaseId);
      currentPhaseId = undefined;
      currentPhaseStartedAt = undefined;
      slowMarked = false;
      emitEvent({
        kind: "phase-complete",
        phaseId,
        message,
        details,
        elapsedMs: phaseElapsedMs
      });
    },
    retry(message, details) {
      if (finalized) {
        return;
      }

      emitEvent({
        kind: "retry",
        message,
        details
      });
      clearPhaseTimers();
      completedPhases.clear();
      currentPhaseId = undefined;
      currentPhaseStartedAt = undefined;
      slowMarked = false;
      attempt += 1;
    },
    complete(message, details) {
      if (finalized) {
        return;
      }

      clearPhaseTimers();
      finalized = true;
      const totalElapsedMs = Math.max(0, now() - sessionStartedAt);
      emitEvent({
        kind: "complete",
        message: `${message} after ${formatDuration(totalElapsedMs)}`,
        details
      });
    },
    failed(message, details) {
      if (finalized) {
        return;
      }

      clearPhaseTimers();
      finalized = true;
      const phaseId = currentPhaseId;
      const totalElapsedMs = Math.max(0, now() - sessionStartedAt);
      const phaseLabel = phaseId ? PHASES[phaseId].label : "startup";
      emitEvent({
        kind: "failed",
        phaseId,
        message: `${message} after ${formatDuration(totalElapsedMs)} (last phase ${phaseLabel}; log ${logPath})`,
        details: {
          ...details,
          lastPhaseId: phaseId,
          logPath
        }
      });
    },
    getAttempt() {
      return attempt;
    },
    getCurrentPhaseId() {
      return currentPhaseId;
    },
    dispose() {
      clearPhaseTimers();
    }
  };
}

function computeProgressSnapshot(input: {
  includedPhases: StartupPhaseId[];
  normalizedWeights: Map<StartupPhaseId, number>;
  completedPhases: Set<StartupPhaseId>;
  currentPhaseId: StartupPhaseId | undefined;
  currentPhaseStartedAt: number | undefined;
  timestampMs: number;
  kind: StartupEventKind;
}) {
  if (input.kind === "complete") {
    return {
      progressPercent: 100,
      etaMs: 0,
      etaLowerBound: false
    };
  }

  const completedWeight = [...input.completedPhases].reduce(
    (sum, phaseId) => sum + (input.normalizedWeights.get(phaseId) ?? 0),
    0
  );
  let activeWeight = 0;
  let etaMs = input.includedPhases
    .filter((phaseId) => !input.completedPhases.has(phaseId))
    .reduce((sum, phaseId) => sum + PHASES[phaseId].expectedMs, 0);
  let etaLowerBound = false;

  if (input.currentPhaseId) {
    const phase = PHASES[input.currentPhaseId];
    const phaseElapsedMs = computePhaseElapsedMs(input.timestampMs, input.currentPhaseId, input.currentPhaseStartedAt);
    activeWeight = (input.normalizedWeights.get(input.currentPhaseId) ?? 0) * Math.min(phaseElapsedMs / phase.expectedMs, 0.92);
    const futureEtaMs = input.includedPhases
      .filter((phaseId) => phaseId !== input.currentPhaseId && !input.completedPhases.has(phaseId))
      .reduce((sum, phaseId) => sum + PHASES[phaseId].expectedMs, 0);

    if (phaseElapsedMs > phase.expectedMs) {
      etaMs = futureEtaMs;
      etaLowerBound = true;
    } else {
      etaMs = phase.expectedMs - phaseElapsedMs + futureEtaMs;
    }
  }

  const progressPercent = Math.min(99, Math.max(0, Math.round(completedWeight + activeWeight)));
  return {
    progressPercent,
    etaMs,
    etaLowerBound
  };
}

function computePhaseElapsedMs(
  timestampMs: number,
  phaseId: StartupPhaseId | undefined,
  phaseStartedAt: number | undefined
) {
  if (!phaseId || phaseStartedAt === undefined) {
    return 0;
  }

  return Math.max(0, timestampMs - phaseStartedAt);
}

function normalizeWeights(includedPhases: StartupPhaseId[]) {
  const totalWeight = includedPhases.reduce((sum, phaseId) => sum + PHASES[phaseId].weight, 0);
  const normalized = new Map<StartupPhaseId, number>();
  for (const phaseId of includedPhases) {
    normalized.set(phaseId, (PHASES[phaseId].weight / totalWeight) * 100);
  }
  return normalized;
}

function pruneStartupLogs(logDir: string, activeLogPath: string, nowMs: number) {
  const retainedEntries: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const entry of readdirSync(logDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
      continue;
    }

    const filePath = path.join(logDir, entry.name);
    const stats = statSync(filePath);
    if (nowMs - stats.mtimeMs > LOG_RETENTION_MAX_AGE_MS) {
      rmSync(filePath, { force: true });
      continue;
    }

    retainedEntries.push({
      filePath,
      mtimeMs: stats.mtimeMs
    });
  }

  retainedEntries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const entry of retainedEntries.slice(LOG_RETENTION_MAX_FILES)) {
    if (entry.filePath === activeLogPath) {
      continue;
    }

    rmSync(entry.filePath, { force: true });
  }
}

function renderHumanLine(event: StartupTelemetryEvent) {
  const etaValue = event.etaMs !== undefined ? formatDuration(event.etaMs) : "--";
  const etaSegment = event.etaLowerBound ? `eta > ${etaValue}` : `eta ${etaValue}`;
  const phaseLabel = event.kind === "phase-slow" ? `${event.label} slow` : event.label;
  const message = event.kind === "phase-slow" ? event.hint ?? event.message : event.message;
  return `[startup a${event.attempt}] ${event.progressPercent}% | ${etaSegment} | ${phaseLabel} | ${message}`;
}

function formatDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "0s";
  }

  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.round(durationMs / 100) / 10;
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round((seconds - minutes * 60) * 10) / 10;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function formatFileTimestamp(timestampMs: number) {
  return new Date(timestampMs).toISOString().replaceAll(":", "-");
}
