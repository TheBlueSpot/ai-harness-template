/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createChatMessage } from "../../../shared/protocol";
import { createEmptyAssistantsState, type HarnessViewState } from "../harness-store";
import { toastStore } from "../toast-store";
import { createUiTest } from "../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { AssistantsPanel } from "./assistants-panel";

createUiTest("AssistantsPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders copy buttons for assistant chat messages", async () => {
    let copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copiedText = value;
        }
      }
    });

    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-copy"
    });
    const assistantId = "assistant-1";
    const assistants = createEmptyAssistantsState();
    const state: Partial<HarnessViewState> = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...assistants,
        assistants: [
          {
            id: assistantId,
            name: "Repo helper",
            scope: "project",
            projectId: project.id,
            description: "Handles repo tasks",
            personalityPrompt: "Be helpful",
            jobPrompt: "Do repo work",
            agentId: "pi",
            modeId: "implement",
            executionModelId: "openai/gpt-5.4",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ],
        threads: [
          {
            id: "assistant-thread-1",
            assistantId,
            sessionId: "assistant-session-1",
            messageCount: 2,
            messages: [createChatMessage("user", "Need status"), createChatMessage("assistant", "Status ready")],
            updatedAt: now
          }
        ],
        selectedAssistantId: assistantId,
        streamingByAssistantId: {
          [assistantId]: "Streaming status"
        }
      }
    });
    seedHarnessStoreForTests(state);

    render(() => <AssistantsPanel />);

    expect(screen.getByRole("button", { name: "Copy user message" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy assistant message" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy streaming assistant message" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy assistant message" }));
    await Promise.resolve();

    expect(copiedText).toBe("Status ready");
    expect(toastStore.toasts[0]?.title).toBe("Message copied");
  });

  it("opens circuit breaker dialog and retries without bootstrap command", async () => {
    const commands: unknown[] = [];
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-breaker"
    });
    const assistantId = "assistant-breaker";
    const assistants = createEmptyAssistantsState();
    const state: Partial<HarnessViewState> = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...assistants,
        assistants: [
          {
            id: assistantId,
            name: "Breaker helper",
            scope: "project",
            projectId: project.id,
            personalityPrompt: "Recover carefully",
            jobPrompt: "Recover jobs",
            agentId: "pi",
            runState: "paused",
            bootstrapState: "completed",
            failureStreakCount: 3,
            circuitBreakerState: "tripped",
            circuitBreakerReason: "Repeated executor failure",
            unreadQuestionCount: 1,
            createdAt: now,
            updatedAt: now
          }
        ],
        logs: [
          {
            id: "log-1",
            assistantId,
            level: "critical",
            summary: "Circuit breaker tripped",
            detail: "Repeated executor failure",
            createdAt: now
          }
        ],
        questions: [
          {
            id: "question-1",
            assistantId,
            prompt: "How should I proceed?",
            status: "pending",
            linkedTodoIds: [],
            askedAt: now
          }
        ],
        selectedAssistantId: assistantId
      },
      backgroundJobs: {
        jobs: [],
        templates: [],
        runs: [
          {
            id: "run-1",
            jobId: "job-1",
            projectId: project.id,
            assistantId,
            automationThreadId: "thread-auto-1",
            triggerSource: "manual",
            status: "failed",
            riskLevel: "unsafe",
            approvalStatus: "approved",
            skippedOccurrenceCount: 0,
            failureMessage: "Repeated executor failure",
            queuedAt: now,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
            events: []
          }
        ]
      }
    });
    seedHarnessStoreForTests(state);
    captureDispatchedCommands(commands);

    render(() => <AssistantsPanel initialCircuitBreakerAssistantId={assistantId} />);

    expect(screen.getByRole("button", { name: "Inspect failure" })).not.toBeNull();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Circuit breaker" })).not.toBeNull());
    expect(screen.getAllByText("Repeated executor failure").length).toBeGreaterThan(0);
    expect(screen.getByText("How should I proceed?")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["assistant.circuit-breaker.retry"]);
  });
});
