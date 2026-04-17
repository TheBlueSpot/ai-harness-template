/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { render, screen } from "@solidjs/testing-library";
import { ChatPanel } from "./chat-panel";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createAgentPlanFixture,
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createRunFixture,
  createTraceFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";
import { createChatMessage } from "../../../shared/protocol";

createUiTest("Followup reset integration", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("clears transient execution state on a new planning run while preserving chat history", () => {
    const existingMessage = createChatMessage("assistant", "Old answer");
    const plan = createExecutionPlanFixture({ runId: "run-old" });
    const project = createViewProjectFixture({
      id: "project-reset",
      session: {
        ...createViewProjectFixture().session,
        messages: [existingMessage]
      },
      latestPlan: createAgentPlanFixture({ executionPlan: plan }),
      contextUsage: {
        sourceKind: "planner",
        sourceLabel: "planner",
        modelId: "openai/gpt-5.4",
        tokens: 1200,
        contextWindow: 200000,
        usagePercent: 0.6,
        updatedAt: new Date().toISOString()
      },
      traces: [createTraceFixture()],
      streamingAssistantText: "old stream",
      lastRun: createRunFixture({
        id: "run-old",
        status: "completed",
        completedAt: new Date().toISOString()
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    expect(screen.getByText("Old answer")).not.toBeNull();

    harnessStore.applyServerEvent({
      type: "run.updated",
      requestId: "req-new-run",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        run: createRunFixture({
          id: "run-new",
          threadId: project.activeThreadId,
          status: "planning",
          latestUserPrompt: "new task"
        })
      }
    });

    const nextProject = harnessStore.state.workspace.projects[0];
    expect(nextProject?.traces).toHaveLength(0);
    expect(nextProject?.contextUsage).toBeUndefined();
    expect(nextProject?.latestPlan).toBeUndefined();
    expect(nextProject?.streamingAssistantText).toBe("");
    expect(harnessStore.state.executionPlanDialogOpen).toBe(false);
    expect(harnessStore.state.selectedExecutionPlan).toBeUndefined();
    expect(screen.getByText("Old answer")).not.toBeNull();
  });
});
