/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createEmptyAssistantsState, createInitialViewState, harnessStore, readBrowserUiSession, type HarnessViewState } from "../harness-store";
import { formatShortTimestamp } from "../lib/time-format";
import { toastStore } from "../toast-store";
import { createUiTest } from "../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { AssistantsPanel } from "./assistants-panel";

createUiTest("AssistantsPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("persists and restores assistant learnings tab", () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-learnings"
    });
    const assistantId = "assistant-learnings";
    const assistants = createEmptyAssistantsState();
    const assistantState = {
      ...assistants,
      assistants: [
        {
          id: assistantId,
          name: "Repo helper",
          scope: "project" as const,
          projectId: project.id,
          description: "Handles repo tasks",
          personalityPrompt: "Be helpful",
          jobPrompt: "Do repo work",
          agentId: "pi" as const,
          modeId: "implement",
          executionModelId: "openai/gpt-5.4",
          runState: "active" as const,
          bootstrapState: "completed" as const,
          failureStreakCount: 0,
          circuitBreakerState: "closed" as const,
          unreadQuestionCount: 0,
          createdAt: now,
          updatedAt: now
        }
      ],
      selectedAssistantId: assistantId
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: assistantState
      })
    );

    render(() => <AssistantsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open learnings tab" }));

    expect(harnessStore.state.assistants.selectedTab).toBe("learnings");
    expect(readBrowserUiSession().assistantPane?.selectedTab).toBe("learnings");

    cleanup();
    harnessStore.replaceStateForTests(createInitialViewState());
    harnessStore.actions.hydrateBrowserUiSession();

    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: harnessStore.state.activeLeftTab,
        activeSurface: harnessStore.state.activeSurface,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...assistantState,
          selectedTab: harnessStore.state.assistants.selectedTab
        }
      })
    );
    render(() => <AssistantsPanel />);

    expect(harnessStore.state.assistants.selectedTab).toBe("learnings");
    expect(screen.getByRole("button", { name: "Open learnings tab" }).className).toContain("bg-(--accent)");
  });

  it("seeds new assistants from current composer routing", async () => {
    const project = createViewProjectFixture({
      id: "project-assistant-routing"
    });
    const state: Partial<HarnessViewState> = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      providerBrand: "gemini",
      selectedAgentId: "pi",
      selectedExecutionModelId: "google/gemini-2.5-flash",
      selectedFastMode: true,
      assistants: {
        ...createEmptyAssistantsState(),
        scopeFilter: "project"
      }
    });
    seedHarnessStoreForTests(state);

    render(() => <AssistantsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Create project assistant" }));

    await waitFor(() => expect(harnessStore.state.assistantEditorOpen).toBe(true));
    expect(harnessStore.state.assistantEditorDraft).toMatchObject({
      source: "create",
      projectId: project.id,
      agentId: "pi",
      providerBrand: "gemini",
      executionModelId: "google/gemini-2.5-flash",
      fastMode: true
    });
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

    const now = new Date(2026, 3, 28, 10, 4).toISOString();
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
            messages: [
              {
                id: "message-user-1",
                role: "user",
                kind: "plain",
                content: "Need status",
                createdAt: now
              },
              {
                id: "message-assistant-1",
                role: "assistant",
                kind: "plain",
                content: "Status ready",
                createdAt: now
              }
            ],
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
    expect(screen.getAllByText(formatShortTimestamp(now)).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "Copy assistant message" }));
    await Promise.resolve();

    expect(copiedText).toBe("Status ready");
    expect(toastStore.toasts[0]?.title).toBe("Message copied");
  });

  it("sends assistant chat from shared composer", async () => {
    const commands: unknown[] = [];
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-send"
    });
    const assistantId = "assistant-send";
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
            id: "assistant-thread-send",
            assistantId,
            sessionId: "assistant-session-send",
            messageCount: 0,
            messages: [],
            updatedAt: now
          }
        ],
        selectedAssistantId: assistantId
      }
    });
    seedHarnessStoreForTests(state);
    captureDispatchedCommands(commands);

    render(() => <AssistantsPanel />);

    const composer = document.querySelector("[data-test-chat-composer]");
    expect(composer).not.toBeNull();
    const textarea = screen.getByPlaceholderText("Ask Repo helper something.") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Need status" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "assistant.chat.send",
      payload: {
        assistantId,
        content: "Need status"
      }
    });
    await waitFor(() => expect(textarea.value).toBe(""));
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

  it("opens assistant log details in a dialog", async () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-log"
    });
    const assistantId = "assistant-log";
    const state: Partial<HarnessViewState> = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...createEmptyAssistantsState(),
        selectedAssistantId: assistantId,
        selectedTab: "log",
        selectedLogDetailsId: "log-detail-1",
        assistants: [
          {
            id: assistantId,
            name: "Log helper",
            scope: "project",
            projectId: project.id,
            personalityPrompt: "Log clearly",
            jobPrompt: "Do logged work",
            agentId: "pi",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ],
        logs: [
          {
            id: "log-detail-1",
            assistantId,
            level: "info",
            summary: "Job completed",
            detail: "Collected release notes.",
            detailsJson: { runId: "run-1", files: ["CHANGELOG.md"] },
            createdAt: now
          }
        ]
      }
    });
    seedHarnessStoreForTests(state);

    render(() => <AssistantsPanel />);

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Job completed" })).not.toBeNull());
    expect(screen.getAllByText("Collected release notes.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/CHANGELOG.md/)).not.toBeNull();
  });
});
