/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ChatPanel } from "./chat-panel";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createAgentPlanFixture,
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createPlanSummaryMessage,
  createRunFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";

createUiTest("ChatPanel followup integration", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("accepts immediate plan refinement after planner-ready message stops streaming", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      runId: "run-followup",
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-followup-flow",
      draft: "make it runnable",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);

    harnessStore.applyServerEvent({
      type: "run.updated",
      requestId: "req-ready",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        run: createRunFixture({
          id: "run-followup",
          threadId: project.activeThreadId,
          status: "ready",
          plan
        })
      }
    });
    harnessStore.applyServerEvent({
      type: "agent.plan",
      requestId: "req-plan",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        plan: createAgentPlanFixture({
          executionPlan: plan,
          difficultyScore: 20,
          usesSubagents: false,
          subtaskCount: 0
        })
      }
    });
    harnessStore.applyServerEvent({
      type: "chat.message-appended",
      requestId: "req-plan-msg",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: project.session.sessionId,
        message: createPlanSummaryMessage("run-followup", plan),
        state: {
          ...project.session,
          messages: [...project.session.messages, createPlanSummaryMessage("run-followup", plan)],
          isStreaming: false
        }
      }
    });

    expect(screen.queryByText("assistant (streaming)")).toBeNull();
    cleanup();
    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    expect(screen.getAllByText(plan.summary).length).toBeGreaterThan(0);
    expect(harnessStore.state.workspace.projects[0]?.session.isStreaming).toBe(false);
    expect((screen.getByRole("button", { name: "Refine plan before execution" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));

    expect((commands[0] as { type: string }).type).toBe("planning.refine");
  });
});
