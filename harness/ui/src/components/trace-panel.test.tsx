/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import type { ClientCommand } from "../../../shared/protocol";
import { TracePanel } from "./trace-panel";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createBrowserActivityFixture,
  createBrowserSessionFixture,
  createAgentPlanFixture,
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createRunFixture,
  createSubtaskFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";

createUiTest("TracePanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("shows explicit subtask status icons and opens full plan", () => {
    const executionPlan = createExecutionPlanFixture();
    const project = createViewProjectFixture({
      id: "project-1",
      activeRun: createRunFixture({
        id: "run-1",
        status: "running-subagents",
        subtasks: [
          createSubtaskFixture({ id: "task-running", status: "running" }),
          createSubtaskFixture({ id: "task-done", status: "completed" }),
          createSubtaskFixture({ id: "task-fail", status: "failed", errorMessage: "boom" })
        ]
      }),
      lastRun: createRunFixture({
        id: "run-1",
        status: "running-subagents",
        subtasks: [
          createSubtaskFixture({ id: "task-running", status: "running" }),
          createSubtaskFixture({ id: "task-done", status: "completed" }),
          createSubtaskFixture({ id: "task-fail", status: "failed", errorMessage: "boom" })
        ]
      }),
      latestPlan: createAgentPlanFixture({
        executionPlan,
        subtaskCount: 3
      }),
      traces: [
        {
          sessionId: "session-1",
          stage: "subagent-complete",
          message: "Use **markdown** output",
          detail: "See [docs](https://example.com)"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel sendCommand={() => undefined} />);

    expect(screen.getByLabelText("Subtask running")).not.toBeNull();
    expect(screen.getByLabelText("Subtask completed")).not.toBeNull();
    expect(screen.getByLabelText("Subtask failed")).not.toBeNull();
    expect(screen.getByText("markdown").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "docs" }).getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: "Open the full execution plan" }));
    expect(harnessStore.state.executionPlanDialogOpen).toBe(true);
    expect(harnessStore.state.selectedExecutionPlan?.runId).toBe(executionPlan.runId);
  });

  it("disables refresh when no run is available", () => {
    const project = createViewProjectFixture({ id: "project-no-run" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel sendCommand={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Refresh the active run" })).toBeNull();
  });

  it("disables refresh for a finished subtask and retry while project is streaming", () => {
    const project = createViewProjectFixture({
      id: "project-finished",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      },
      activeRun: createRunFixture({
        id: "run-finished",
        status: "running-subagents",
        subtasks: [createSubtaskFixture({ id: "task-done", status: "completed" })]
      }),
      lastRun: createRunFixture({
        id: "run-finished",
        status: "running-subagents",
        subtasks: [createSubtaskFixture({ id: "task-done", status: "completed" })]
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel sendCommand={() => undefined} />);

    expect((screen.getByRole("button", { name: "Refresh the active run" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Refresh this active subagent" }) as HTMLButtonElement).disabled).toBe(true);
    const retryButtons = screen.getAllByRole("button", { name: /Retry/ });
    expect((retryButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((retryButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends explicit browser approval decisions from run UI", () => {
    const commands: ClientCommand[] = [];
    const project = createViewProjectFixture({
      id: "project-browser",
      activeRun: createRunFixture({
        id: "run-browser",
        status: "running-main",
        browserSessions: [
          createBrowserSessionFixture({
            id: "browser-session-1",
            runId: "run-browser",
            status: "awaiting-approval",
            pendingApproval: {
              toolCallId: "tool-call-1",
              toolName: "playwright-browser",
              kind: "navigate",
              label: "Open https://example.com",
              inputSummary: "{\"url\":\"https://example.com\"}",
              status: "pending",
              requestedAt: new Date().toISOString()
            },
            activities: [
              createBrowserActivityFixture({
                toolCallId: "tool-call-1",
                status: "pending-approval",
                outputSummary: "```json\n{\"ok\":true}\n```"
              })
            ]
          })
        ]
      }),
      lastRun: createRunFixture({
        id: "run-browser",
        status: "running-main"
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel sendCommand={(command) => commands.push(command)} />);
    expect(screen.getByRole("button", { name: "Copy code block" })).not.toBeNull();
    expect(document.querySelector(".markdown-code-content")?.textContent).toContain("{\"ok\":true}");
    expect(screen.getByText("{\"url\":\"https://example.com\"}").closest("a")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve this browser step" }));
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe("browser.approval.resolve");
    expect(commands[0]).toMatchObject({
      payload: {
        projectId: "project-browser",
        threadId: project.activeThreadId,
        runId: "run-browser",
        sessionId: "browser-session-1",
        toolCallId: "tool-call-1",
        approved: true
      }
    });
  });
});
