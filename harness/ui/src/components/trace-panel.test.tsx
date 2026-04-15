/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { TracePanel } from "./trace-panel";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
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

    expect(screen.getByLabelText("Subtask running")).not.toBeNull();
    expect(screen.getByLabelText("Subtask completed")).not.toBeNull();
    expect(screen.getByLabelText("Subtask failed")).not.toBeNull();

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
});
