import { beforeEach, describe, expect, test } from "bun:test";
import type { TerminalSession } from "../../../shared/protocol";
import { terminalStore } from "./terminal-store";

const preferences = {
  scrollbackLimit: 1000,
  copyOnSelect: false,
  ctrlCMode: "auto" as const,
  rendererMode: "xterm-webgl" as const
};

describe("terminal store output model", () => {
  beforeEach(() => {
    terminalStore.resetForTests({ preferences });
  });

  test("trims copy buffer without marking xterm for reset", () => {
    const limit = preferences.scrollbackLimit * 160;
    const first = "a".repeat(limit + 10);

    terminalStore.appendOutput("terminal-1", first);
    terminalStore.appendOutput("terminal-1", "b");

    expect(terminalStore.state.outputBySessionId["terminal-1"]).toHaveLength(limit);
    expect(terminalStore.state.outputBySessionId["terminal-1"]?.endsWith("b")).toBe(true);
    expect(terminalStore.state.outputDeltaBySessionId["terminal-1"]).toBe("b");
    expect(terminalStore.state.outputVersionBySessionId["terminal-1"]).toBe(2);
    expect(terminalStore.state.outputResetVersionBySessionId["terminal-1"]).toBeUndefined();
  });

  test("snapshots mark one reset for renderer remounts", () => {
    terminalStore.replaceOutput("terminal-1", "snapshot");

    expect(terminalStore.state.outputBySessionId["terminal-1"]).toBe("snapshot");
    expect(terminalStore.state.outputDeltaBySessionId["terminal-1"]).toBe("");
    expect(terminalStore.state.outputVersionBySessionId["terminal-1"]).toBe(1);
    expect(terminalStore.state.outputResetVersionBySessionId["terminal-1"]).toBe(1);
  });

  test("keeps closed terminal rows out of active sessions while preserving history", () => {
    const now = new Date().toISOString();
    const active = createTerminalSession({ id: "terminal-active", startedAt: now, updatedAt: now });
    const closed = createTerminalSession({
      id: "terminal-closed",
      source: {
        kind: "agent",
        threadId: "thread-1",
        runId: "run-1",
        label: "Run run-1",
        trigger: "run"
      },
      status: "exited",
      startedAt: now,
      updatedAt: now,
      exitedAt: now,
      closedAt: now
    });

    terminalStore.applyServerEvent({
      type: "terminal.sessions.updated",
      requestId: "req-active",
      payload: {
        sessions: [active, closed],
        preferences
      }
    });
    terminalStore.applyServerEvent({
      type: "terminal.history.listed",
      requestId: "req-history",
      payload: {
        scope: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1"
        },
        sessions: [closed]
      }
    });

    expect(terminalStore.state.sessions.map((session) => session.id)).toEqual(["terminal-active"]);
    expect(terminalStore.state.history.sessions.map((session) => session.id)).toEqual(["terminal-closed"]);
  });
});

function createTerminalSession(overrides: Partial<TerminalSession>): TerminalSession {
  return {
    id: overrides.id ?? "terminal-1",
    projectId: overrides.projectId ?? "project-1",
    source: overrides.source,
    name: overrides.name ?? "PowerShell",
    shellId: overrides.shellId ?? "powershell",
    cwd: overrides.cwd ?? "C:\\repo",
    status: overrides.status ?? "running",
    inputMode: overrides.inputMode,
    inputOverride: overrides.inputOverride,
    inputLockReason: overrides.inputLockReason,
    cols: overrides.cols ?? 120,
    rows: overrides.rows ?? 32,
    transportMode: overrides.transportMode,
    transportWarning: overrides.transportWarning,
    pid: overrides.pid,
    exitCode: overrides.exitCode,
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    exitedAt: overrides.exitedAt,
    closedAt: overrides.closedAt,
    serverRestarted: overrides.serverRestarted
  };
}
