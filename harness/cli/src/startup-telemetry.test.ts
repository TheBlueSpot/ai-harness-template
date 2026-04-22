import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createStartupTelemetrySession, type StartupTelemetryEvent } from "./startup-telemetry";

class FakeClock {
  private nextTimerId = 1;
  private readonly timers = new Map<number, { runAt: number; callback: () => void }>();
  nowMs = 0;

  now = () => this.nowMs;

  setTimeout = ((callback: TimerHandler, delay?: number) => {
    const timerId = this.nextTimerId++;
    this.timers.set(timerId, {
      runAt: this.nowMs + Number(delay ?? 0),
      callback: () => {
        if (typeof callback === "function") {
          callback();
          return;
        }

        throw new Error("String timer callbacks are not supported in tests");
      }
    });
    return timerId as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof globalThis.setTimeout;

  clearTimeout = ((timerId: ReturnType<typeof setTimeout>) => {
    this.timers.delete(Number(timerId));
  }) as unknown as typeof globalThis.clearTimeout;

  advanceBy(durationMs: number) {
    const targetMs = this.nowMs + durationMs;
    while (true) {
      const nextTimer = [...this.timers.entries()].sort((left, right) => left[1].runAt - right[1].runAt)[0];
      if (!nextTimer || nextTimer[1].runAt > targetMs) {
        break;
      }

      this.nowMs = nextTimer[1].runAt;
      this.timers.delete(nextTimer[0]);
      nextTimer[1].callback();
    }

    this.nowMs = targetMs;
  }
}

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("startup telemetry", () => {
  test("computes normalized progress with ui-assets included", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const session = createStartupTelemetrySession({
      now: clock.now,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart();
    session.phaseStart("bootstrap", "boot");
    clock.advanceBy(300);
    session.phaseComplete("boot done");
    session.phaseStart("workspace", "workspace start");
    clock.advanceBy(400);
    session.pulse("workspace pulse");

    const events = readEvents(session.logPath);
    expect(events.at(-1)?.progressPercent).toBe(18);
    expect(events.at(-1)?.etaMs).toBe(6_650);
    expect(events.at(-1)?.etaLowerBound).toBeUndefined();
  });

  test("computes normalized progress with serverOnly skipping ui-assets", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const session = createStartupTelemetrySession({
      now: clock.now,
      serverOnly: true,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart();
    session.phaseStart("bootstrap", "boot");
    clock.advanceBy(300);
    session.phaseComplete("boot done");
    session.phaseStart("workspace", "workspace start");
    clock.advanceBy(400);
    session.pulse("workspace pulse");

    const events = readEvents(session.logPath);
    expect(events.at(-1)?.progressPercent).toBe(22);
    expect(events.at(-1)?.etaMs).toBe(2_650);
  });

  test("renders normal ETA before estimate overrun", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const session = createStartupTelemetrySession({
      now: clock.now,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart();
    session.phaseStart("bootstrap", "boot");
    clock.advanceBy(300);
    session.phaseComplete("boot done");
    session.phaseStart("workspace", "workspace");
    clock.advanceBy(800);
    session.phaseComplete("workspace done");
    session.phaseStart("runtimes", "refresh runtimes");
    clock.advanceBy(900);
    session.pulse("runtimes pulse");

    const event = readEvents(session.logPath).at(-1);
    expect(event?.etaMs).toBe(5_350);
    expect(event?.etaLowerBound).toBeUndefined();
  });

  test("flips to lower-bound ETA after estimate overrun", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const session = createStartupTelemetrySession({
      now: clock.now,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart();
    session.phaseStart("bootstrap", "boot");
    clock.advanceBy(300);
    session.phaseComplete("boot done");
    session.phaseStart("workspace", "workspace");
    clock.advanceBy(800);
    session.phaseComplete("workspace done");
    session.phaseStart("runtimes", "runtimes");
    clock.advanceBy(1_500);
    session.phaseComplete("runtimes done");
    session.phaseStart("setup", "setup");
    clock.advanceBy(500);
    session.phaseComplete("setup done");
    session.phaseStart("ui-assets", "build ui");
    clock.advanceBy(4_500);
    session.pulse("ui pulse");

    const event = readEvents(session.logPath).at(-1);
    expect(event?.etaMs).toBe(250);
    expect(event?.etaLowerBound).toBe(true);
  });

  test("emits phase-slow once threshold crosses", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const session = createStartupTelemetrySession({
      now: clock.now,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart();
    session.phaseStart("workspace", "load workspace");
    clock.advanceBy(5_001);
    clock.advanceBy(10_000);
    session.phaseComplete("workspace done");

    const slowEvents = readEvents(session.logPath).filter((event) => event.kind === "phase-slow");
    expect(slowEvents).toHaveLength(1);
    expect(slowEvents[0]?.hint).toContain("SQLite migration");
  });

  test("uses log-safe line output without ANSI control chars", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const lines: string[] = [];
    const session = createStartupTelemetrySession({
      now: clock.now,
      tmpDir: tempRoot,
      writeLine(line) {
        lines.push(line);
      },
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart();
    session.phaseStart("bootstrap", "boot");
    clock.advanceBy(2_000);

    expect(lines[0]).toMatch(/^startup telemetry: /);
    expect(lines.some((line) => line.includes("\u001b["))).toBe(false);
    expect(lines.some((line) => line.includes("\r"))).toBe(false);
  });

  test("writes jsonl events with required fields", () => {
    const clock = new FakeClock();
    const tempRoot = createTempRoot();
    const session = createStartupTelemetrySession({
      now: clock.now,
      pid: 4321,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    session.sessionStart("session start");
    session.phaseStart("bootstrap", "boot");
    clock.advanceBy(300);
    session.phaseComplete("boot done");
    session.complete("Harness server listening on http://localhost:8787");

    const [sessionStartEvent, phaseStartEvent, phaseCompleteEvent, completeEvent] = readEvents(session.logPath);
    expect(sessionStartEvent).toMatchObject({
      pid: 4321,
      attempt: 1,
      kind: "session-start",
      label: "startup",
      message: "session start",
      logPath: session.logPath
    });
    expect(typeof sessionStartEvent.timestamp).toBe("string");
    expect(phaseStartEvent).toMatchObject({
      kind: "phase-start",
      phaseId: "bootstrap",
      label: "bootstrap",
      progressPercent: 0,
      etaMs: 7_350
    });
    expect(phaseCompleteEvent).toMatchObject({
      kind: "phase-complete",
      phaseId: "bootstrap",
      progressPercent: 5
    });
    expect(completeEvent.kind).toBe("complete");
    expect(completeEvent.progressPercent).toBe(100);
    expect(completeEvent.etaMs).toBe(0);
  });

  test("prunes temp logs by age and count", () => {
    const clock = new FakeClock();
    clock.nowMs = Date.parse("2026-04-22T12:00:00.000Z");
    const tempRoot = createTempRoot();
    const logDir = path.join(tempRoot, "pi-harness-startup");
    mkdirSync(logDir, { recursive: true });

    const oldFile = path.join(logDir, "old.jsonl");
    writeFileSync(oldFile, "{}\n");
    const oldAgeMs = 8 * 24 * 60 * 60 * 1000;
    const oldDate = new Date(clock.nowMs - oldAgeMs);

    for (let index = 0; index < 25; index += 1) {
      const filePath = path.join(logDir, `recent-${index.toString().padStart(2, "0")}.jsonl`);
      writeFileSync(filePath, "{}\n");
      const statsDate = new Date(clock.nowMs - index * 1_000);
      utimesSync(filePath, statsDate, statsDate);
    }

    utimesSync(oldFile, oldDate, oldDate);
    const session = createStartupTelemetrySession({
      now: clock.now,
      tmpDir: tempRoot,
      writeLine() {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });

    const remainingFiles = readdirSync(logDir);
    expect(remainingFiles).toHaveLength(20);
    expect(remainingFiles.includes(path.basename(session.logPath))).toBe(true);
    expect(existsSync(oldFile)).toBe(false);
  });
});

function createTempRoot() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data", `startup-telemetry-${crypto.randomUUID()}`);
  mkdirSync(tempRoot, { recursive: true });
  tempRoots.push(tempRoot);
  return tempRoot;
}

function readEvents(logPath: string) {
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StartupTelemetryEvent);
}
