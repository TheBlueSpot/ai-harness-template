/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createRequestId, createProjectThreadSummary, type CliSession } from "../../../shared/protocol";
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
