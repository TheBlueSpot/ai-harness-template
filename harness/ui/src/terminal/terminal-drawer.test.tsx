/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createRequestId, createProjectThreadSummary, type CliSession, type TerminalSession } from "../../../shared/protocol";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, captureDispatchedCommands, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { createUiTest } from "../utils/tests/test-harness";
import { TerminalDrawer } from "./terminal-drawer";
import { terminalStore } from "./terminal-store";

createUiTest("TerminalDrawer", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    terminalStore.resetForTests({
      open: true,
      height: 320,
      preferences: {
        scrollbackLimit: 10000,
        copyOnSelect: false,
        ctrlCMode: "auto",
        rendererMode: "solid-prototype"
      }
    });
  });

  it("lists CLI sessions from active and job threads and closes them from tabs", async () => {
    const commands: unknown[] = [];
    const startedAt = new Date(2026, 0, 1, 9, 0).toISOString();
    const activeSession = createCliSession({
      id: "cli-active",
      projectId: "project-terminal-drawer",
      threadId: "thread-1",
      agentId: "codex-cli",
      startedAt
    });
    const jobSession = createCliSession({
      id: "cli-job",
      projectId: "project-terminal-drawer",
      threadId: "thread-job",
      agentId: "copilot-cli",
      startedAt: new Date(2026, 0, 1, 9, 5).toISOString()
    });
    const project = {
      ...createViewProjectFixture({
        id: "project-terminal-drawer",
        activeThreadId: "thread-1",
        threads: [
          createProjectThreadSummary({
            id: "thread-1",
            kind: "user",
            title: "Main chat",
            titleSource: "custom",
            updatedAt: startedAt
          }),
          createProjectThreadSummary({
            id: "thread-job",
            kind: "automation",
            title: "Nightly job",
            titleSource: "custom",
            updatedAt: startedAt
          })
        ]
      }),
      activeCliSession: activeSession,
      cliSessions: [activeSession, jobSession]
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        cliSessionTerminal: {
          "cli-job": {
            stdout: "job stdout\n",
            stderr: "job stderr\n",
            connected: false
          }
        }
      })
    );
    terminalStore.focusSession("cli-job");
    captureDispatchedCommands(commands);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: () => true
    });

    render(() => <TerminalDrawer />);

    expect(screen.getAllByText("Codex CLI - Main chat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Copilot CLI - Nightly job").length).toBeGreaterThan(0);
    expect(screen.getByText("job stdout")).not.toBeNull();
    expect(screen.getByText("job stderr")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reconnect CLI terminal" }));
    expect(commands).toContainEqual(
      expect.objectContaining({
        type: "cli-session.attach",
        payload: expect.objectContaining({
          projectId: project.id,
          threadId: "thread-job",
          sessionId: "cli-job"
        })
      })
    );

    fireEvent.click(screen.getByLabelText("Close Copilot CLI - Nightly job"));

    expect(commands.at(-1)).toMatchObject({
      type: "cli-session.stop",
      payload: {
        projectId: project.id,
        threadId: "thread-job",
        sessionId: "cli-job"
      }
    });
  });

  it("keeps inactive-thread CLI session events in project session list", () => {
    const project = createViewProjectFixture({
      id: "project-cli-events",
      activeThreadId: "thread-1"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    const session = createCliSession({
      id: "cli-job-event",
      projectId: project.id,
      threadId: "thread-job",
      agentId: "codex-cli"
    });

    harnessStore.applyServerEvent({
      type: "cli-session.started",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: "thread-job",
        session
      }
    });

    expect(harnessStore.state.workspace.projects[0]?.activeCliSession).toBeUndefined();
    expect(harnessStore.state.workspace.projects[0]?.cliSessions).toEqual([session]);

    harnessStore.applyServerEvent({
      type: "cli-session.exited",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: "thread-job",
        session: {
          ...session,
          status: "exited",
          attachState: "detached",
          exitedAt: new Date().toISOString()
        }
      }
    });

    expect(harnessStore.state.workspace.projects[0]?.cliSessions).toEqual([]);
  });

  it("labels pipe-transport terminal sessions", () => {
    const project = createViewProjectFixture({ id: "project-pipe-terminal" });
    const session = createTerminalSession({
      id: "terminal-pipe",
      projectId: project.id,
      transportMode: "pipe",
      transportWarning: "Windows pipe transport"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    terminalStore.resetForTests({
      open: true,
      height: 320,
      sessions: [session],
      focusedSessionId: session.id,
      preferences: {
        scrollbackLimit: 10000,
        copyOnSelect: false,
        ctrlCMode: "auto",
        rendererMode: "solid-prototype"
      }
    });

    render(() => <TerminalDrawer />);

    expect(screen.getByText("pipe mode")).not.toBeNull();
  });

  it("shows spawned terminal category and sends input override commands", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({ id: "project-agent-terminal" });
    const session = createTerminalSession({
      id: "terminal-agent",
      projectId: project.id,
      source: {
        kind: "agent",
        threadId: "thread-1",
        runId: "run-1",
        label: "Run run-1",
        trigger: "run"
      },
      inputMode: "read-only",
      inputOverride: false,
      inputLockReason: "Agent-spawned terminal is read-only while its run is in progress."
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    terminalStore.resetForTests({
      open: true,
      height: 320,
      sessions: [session],
      focusedSessionId: session.id,
      preferences: {
        scrollbackLimit: 10000,
        copyOnSelect: false,
        ctrlCMode: "auto",
        rendererMode: "solid-prototype"
      }
    });
    captureDispatchedCommands(commands);

    render(() => <TerminalDrawer />);

    expect(screen.getByText("Spawned")).not.toBeNull();
    expect(screen.getByText("read-only")).not.toBeNull();
    expect(screen.getByText(/Caution:/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Override terminal input lock" }));

    expect(commands).toContainEqual(
      expect.objectContaining({
        type: "terminal.session.set-input-override",
        payload: {
          projectId: project.id,
          sessionId: session.id,
          allowInput: true
        }
      })
    );
  });

  it("saves split resize once after drag release", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({ id: "project-split-resize" });
    const leftSession = createTerminalSession({
      id: "terminal-left",
      projectId: project.id,
      name: "Left terminal"
    });
    const rightSession = createTerminalSession({
      id: "terminal-right",
      projectId: project.id,
      name: "Right terminal"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    terminalStore.resetForTests({
      open: true,
      height: 320,
      sessions: [leftSession, rightSession],
      focusedSessionId: leftSession.id,
      layout: {
        type: "split",
        id: "split-root",
        direction: "vertical",
        sizes: [50, 50],
        children: [
          { type: "leaf", id: "left-leaf", sessionId: leftSession.id },
          { type: "leaf", id: "right-leaf", sessionId: rightSession.id }
        ]
      },
      preferences: {
        scrollbackLimit: 10000,
        copyOnSelect: false,
        ctrlCMode: "auto",
        rendererMode: "solid-prototype"
      }
    });
    captureDispatchedCommands(commands);

    render(() => <TerminalDrawer />);

    const handle = screen.getByRole("button", { name: "Resize terminal split" });
    Object.defineProperty(handle.parentElement, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 400, height: 320, top: 0, right: 400, bottom: 320, left: 0, toJSON: () => ({}) })
    });
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 0 });
    fireEvent.pointerUp(window, { clientX: 120, clientY: 0 });

    const saveCommands = commands.filter((command) => {
      return typeof command === "object" && command !== null && "type" in command && command.type === "terminal.preferences.save";
    });
    expect(saveCommands).toHaveLength(1);
    expect(saveCommands[0]).toMatchObject({
      payload: {
        layout: {
          type: "split",
          sizes: [80, 20]
        }
      }
    });
  });

  it("toggles terminal search from drawer keyboard shortcuts", () => {
    const project = createViewProjectFixture({ id: "project-terminal-search" });
    const session = createTerminalSession({
      id: "terminal-search",
      projectId: project.id
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    terminalStore.resetForTests({
      open: true,
      height: 320,
      sessions: [session],
      focusedSessionId: session.id,
      preferences: {
        scrollbackLimit: 10000,
        copyOnSelect: false,
        ctrlCMode: "auto",
        rendererMode: "solid-prototype"
      }
    });

    const result = render(() => <TerminalDrawer />);
    const drawer = result.container.querySelector("[data-test-terminal-drawer]") as HTMLElement;

    fireEvent.keyDown(drawer, { key: "f", ctrlKey: true });
    expect(terminalStore.state.searchOpen).toBe(true);

    fireEvent.keyDown(drawer, { key: "f", ctrlKey: true });
    expect(terminalStore.state.searchOpen).toBe(false);

    terminalStore.setSearch(true);
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(terminalStore.state.searchOpen).toBe(false);
  });
});

function createCliSession(overrides: Partial<CliSession> = {}): CliSession {
  const now = new Date(2026, 0, 1, 8, 0).toISOString();
  return {
    id: overrides.id ?? "cli-session-1",
    projectId: overrides.projectId ?? "project-1",
    threadId: overrides.threadId ?? "thread-1",
    runId: overrides.runId,
    agentId: overrides.agentId ?? "codex-cli",
    cwd: overrides.cwd ?? "C:\\repo-one",
    status: overrides.status ?? "running",
    cols: overrides.cols ?? 120,
    rows: overrides.rows ?? 32,
    attachState: overrides.attachState ?? "detached",
    idleTimeoutMs: overrides.idleTimeoutMs ?? 30 * 60 * 1000,
    totalTimeoutMs: overrides.totalTimeoutMs,
    lastStdoutAt: overrides.lastStdoutAt,
    lastStderrAt: overrides.lastStderrAt,
    startedAt: overrides.startedAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    exitedAt: overrides.exitedAt,
    exitCode: overrides.exitCode
  };
}

function createTerminalSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  const now = new Date(2026, 0, 1, 8, 0).toISOString();
  return {
    id: overrides.id ?? "terminal-1",
    projectId: overrides.projectId ?? "project-1",
    source: overrides.source,
    name: overrides.name ?? "PowerShell",
    shellId: overrides.shellId ?? "powershell",
    cwd: overrides.cwd ?? "C:\\repo-one",
    status: overrides.status ?? "running",
    inputMode: overrides.inputMode,
    inputOverride: overrides.inputOverride,
    inputLockReason: overrides.inputLockReason,
    cols: overrides.cols ?? 120,
    rows: overrides.rows ?? 32,
    transportMode: overrides.transportMode,
    transportWarning: overrides.transportWarning,
    startedAt: overrides.startedAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}
