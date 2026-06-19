/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createEmptyAssistantsState, createInitialViewState, harnessStore, readBrowserUiSession, type HarnessViewState } from "../harness-store";
import type { AssistantLearning, AssistantLogEntry, AssistantTodo, BackgroundJob, BackgroundJobRun } from "../../../shared/protocol";
import { formatShortTimestamp } from "../lib/time-format";
import { toastStore } from "../toast-store";
import { createUiTest } from "../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { AssistantsPanel } from "./assistants-panel";

function defineScrollMetrics(scrollHeight: number, clientHeight: number) {
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
  const scrollTops = new WeakMap<HTMLElement, number>();
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return scrollTops.get(this) ?? 0;
    },
    set(value) {
      scrollTops.set(this, Number(value));
    }
  });
  return () => {
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
    if (originalScrollTop) {
      Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
    }
  };
}

function seedAssistantDetailState(input: {
  assistantId: string;
  projectId: string;
  learnings?: AssistantLearning[];
  logs?: AssistantLogEntry[];
  todos?: AssistantTodo[];
  selectedTab?: "chat" | "todos" | "questions" | "jobs" | "log" | "config" | "learnings";
}) {
  const now = new Date().toISOString();
  const project = createViewProjectFixture({ id: input.projectId });
  seedHarnessStoreForTests(
    createHarnessStateFixture({
      activeLeftTab: "assistants",
      activeSurface: "assistants",
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...createEmptyAssistantsState(),
        assistants: [
          {
            id: input.assistantId,
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
        selectedAssistantId: input.assistantId,
        selectedTab: input.selectedTab ?? "learnings",
        learnings: input.learnings ?? [],
        logs: input.logs ?? [],
        todos: input.todos ?? []
      }
    })
  );
}

createUiTest("AssistantsPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("uses shared left pane shell and empty-state hooks", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        assistants: createEmptyAssistantsState()
      })
    );

    render(() => <AssistantsPanel />);

    expect(document.querySelector("[data-test-left-pane-shell][data-left-pane-kind='assistants']")).not.toBeNull();
    expect(screen.getByText("No assistants match current search or filters.").closest("[data-test-left-pane-empty-state]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "New assistant" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Create from current thread" })).not.toBeNull();
    expect(screen.getByText("Select assistant to inspect config, chat, todos, and logs.").closest("[data-test-detail-empty-state]")).not.toBeNull();
  });

  it("shows enabled filter count on assistant search menu", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        assistants: {
          ...createEmptyAssistantsState(),
          runStateFilter: "paused",
          providerBrandFilter: "gpt"
        }
      })
    );

    render(() => <AssistantsPanel variant="roster" />);

    expect(screen.getByRole("button", { name: "Filter and sort assistants" }).textContent).toContain("2");
  });

  it("shows global and project assistants with the All scope filter", () => {
    const now = new Date().toISOString();
    const activeProject = createViewProjectFixture({ id: "project-active-scope" });
    const otherProject = createViewProjectFixture({ id: "project-other-scope" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: activeProject.id,
          projects: [activeProject, otherProject]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          scopeFilter: "all",
          assistants: [
            {
              id: "assistant-global-scope",
              name: "Global helper",
              scope: "global",
              description: "Shared tasks",
              personalityPrompt: "Share context",
              jobPrompt: "Work globally",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            },
            {
              id: "assistant-active-project-scope",
              name: "Active project helper",
              scope: "project",
              projectId: activeProject.id,
              description: "Active repo tasks",
              personalityPrompt: "Work here",
              jobPrompt: "Handle active project",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            },
            {
              id: "assistant-other-project-scope",
              name: "Other project helper",
              scope: "project",
              projectId: otherProject.id,
              description: "Other repo tasks",
              personalityPrompt: "Work there",
              jobPrompt: "Handle other project",
              agentId: "pi",
              runState: "paused",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            }
          ]
        }
      })
    );

    render(() => <AssistantsPanel variant="roster" />);

    expect(screen.getByText("Global helper")).toBeTruthy();
    expect(screen.getByText("Active project helper")).toBeTruthy();
    expect(screen.getByText("Other project helper")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create project assistant" })).toBeTruthy();
    harnessStore.setAssistantScopeFilter("all");
    expect(readBrowserUiSession().assistantPane?.scopeFilter).toBe("all");
  });

  it("clears assistant bootstrap filter state", () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({ id: "project-bootstrap-filter" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          bootstrapStateFilter: "failed",
          assistants: [
            {
              id: "assistant-failed",
              name: "Failed bootstrap",
              scope: "project",
              projectId: project.id,
              description: "Needs retry",
              personalityPrompt: "Repair",
              jobPrompt: "Retry setup",
              agentId: "pi",
              runState: "active",
              bootstrapState: "failed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            },
            {
              id: "assistant-completed",
              name: "Completed bootstrap",
              scope: "project",
              projectId: project.id,
              description: "Ready",
              personalityPrompt: "Ship",
              jobPrompt: "Work",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            }
          ]
        }
      })
    );

    render(() => <AssistantsPanel variant="roster" />);

    expect(screen.getByText("Failed bootstrap")).toBeTruthy();
    expect(screen.queryByText("Completed bootstrap")).toBeNull();

    harnessStore.setAssistantPaneFilters({ bootstrapStateFilter: undefined });

    expect(harnessStore.state.assistants.bootstrapStateFilter).toBeUndefined();
    expect(readBrowserUiSession().assistantPane?.bootstrapState).toBeUndefined();
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
    fireEvent.click(screen.getByRole("tab", { name: "Learnings" }));

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
    expect(screen.getByRole("tab", { name: "Learnings" }).className).toContain("border-(--accent)");
  });

  it("filters assistant roster by search and persists query", async () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({ id: "project-assistant-filter" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          rosterSearch: "backend",
          assistants: [
            {
              id: "assistant-frontend",
              name: "Frontend operator",
              scope: "project",
              projectId: project.id,
              description: "UI tasks",
              personalityPrompt: "UI",
              jobPrompt: "Work on interfaces",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            },
            {
              id: "assistant-backend",
              name: "Backend operator",
              scope: "project",
              projectId: project.id,
              description: "API tasks",
              personalityPrompt: "API",
              jobPrompt: "Work on services",
              agentId: "pi",
              runState: "paused",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            }
          ]
        }
      })
    );

    render(() => <AssistantsPanel variant="roster" />);

    expect(screen.queryByText("Frontend operator")).toBeNull();
    expect(screen.getByText("Backend operator")).toBeTruthy();
    harnessStore.setAssistantPaneFilters({ rosterSearch: "backend" });
    expect(readBrowserUiSession().assistantPane?.rosterSearch).toBe("backend");
  });

  it("shows an empty assistant learnings state", () => {
    seedAssistantDetailState({
      assistantId: "assistant-empty-learnings",
      projectId: "project-empty-learnings"
    });

    render(() => <AssistantsPanel variant="detail" />);

    expect(screen.getByText("No learnings yet.")).not.toBeNull();
  });

  it("renders assistant detail navigation as tabs", () => {
    cleanup();
    seedAssistantDetailState({
      assistantId: "assistant-detail-tabs",
      projectId: "project-detail-tabs",
      selectedTab: "chat"
    });

    render(() => <AssistantsPanel variant="detail" />);

    expect(screen.getByRole("tablist", { name: "Assistant detail sections" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe(
      String(harnessStore.state.assistants.selectedTab === "chat")
    );
    fireEvent.click(screen.getByRole("tab", { name: "Todos" }));
    expect(harnessStore.state.assistants.selectedTab).toBe("todos");
  });

  it("virtualizes assistant learnings without a batch control", () => {
    const assistantId = "assistant-many-learnings";
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    const learnings = Array.from({ length: 55 }, (_, index): AssistantLearning => ({
      id: `learning-${index}`,
      assistantId,
      summary: `Learning row ${index}`,
      source: "test",
      confidence: "medium",
      createdAt: new Date(Date.parse(now) + index).toISOString()
    }));
    learnings.push({
      id: "learning-summary",
      assistantId,
      summary: "Compacted assistant memory",
      source: "compaction:test",
      confidence: "high",
      createdAt: now,
      kind: "summary",
      compactedAt: now
    });
    seedAssistantDetailState({
      assistantId,
      projectId: "project-many-learnings",
      learnings
    });

    render(() => <AssistantsPanel variant="detail" />);

    expect(screen.queryByText("Compacted summary")).toBeNull();
    expect(screen.getByText("Compacted assistant memory")).not.toBeNull();
    expect(screen.getByText("Learning row 54")).not.toBeNull();
    expect(screen.queryByText("Learning row 0")).toBeNull();

    expect(screen.queryByRole("button", { name: "Show more assistant learnings" })).toBeNull();
  });

  it("sends delete commands for assistant todos and learnings", async () => {
    const commands: unknown[] = [];
    const assistantId = "assistant-delete-memory";
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    seedAssistantDetailState({
      assistantId,
      projectId: "project-delete-memory",
      selectedTab: "todos",
      todos: [
        {
          id: "todo-delete",
          assistantId,
          title: "Clean up old task",
          state: "pending",
          sortOrder: 0,
          workKind: "documentation",
          createdAt: now,
          updatedAt: now
        }
      ],
      learnings: [
        {
          id: "learning-delete",
          assistantId,
          summary: "Old guidance",
          source: "test",
          confidence: "medium",
          createdAt: now
        }
      ]
    });
    captureDispatchedCommands(commands);
    const originalConfirm = window.confirm;
    window.confirm = () => true;

    render(() => <AssistantsPanel variant="detail" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Clean up old task" }));

    cleanup();
    seedAssistantDetailState({
      assistantId,
      projectId: "project-delete-memory",
      selectedTab: "learnings",
      learnings: [
        {
          id: "learning-delete",
          assistantId,
          summary: "Old guidance",
          source: "test",
          confidence: "medium",
          createdAt: now
        }
      ]
    });
    captureDispatchedCommands(commands);
    render(() => <AssistantsPanel variant="detail" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete learning Old guidance" }));

    window.confirm = originalConfirm;
    expect(commands).toMatchObject([
      {
        type: "assistant.todo.delete",
        payload: {
          assistantId,
          todoId: "todo-delete"
        }
      },
      {
        type: "assistant.learning.delete",
        payload: {
          assistantId,
          learningId: "learning-delete"
        }
      }
    ]);
  });

  it("sends server-owned assistant todo patch payloads", () => {
    const commands: unknown[] = [];
    const assistantId = "assistant-todo-patch";
    seedAssistantDetailState({
      assistantId,
      projectId: "project-todo-patch",
      selectedTab: "todos"
    });
    captureDispatchedCommands(commands);

    render(() => <AssistantsPanel variant="detail" />);
    fireEvent.input(screen.getByPlaceholderText("Add manual todo."), { target: { value: "Write patch test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add todo to assistant list" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "assistant.todo.update",
      payload: {
        assistantId,
        patch: {
          title: "Write patch test",
          state: "pending",
          workKind: "app-code"
        }
      }
    });
    expect((commands[0] as { payload: { todo?: unknown; todoId?: string } }).payload.todo).toBeUndefined();
    expect(typeof (commands[0] as { payload: { todoId?: string } }).payload.todoId).toBe("string");
  });

  it("renders and updates assistant todo work metadata", () => {
    const commands: unknown[] = [];
    const assistantId = "assistant-todo-metadata";
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    seedAssistantDetailState({
      assistantId,
      projectId: "project-todo-metadata",
      selectedTab: "todos",
      todos: [
        {
          id: "todo-metadata",
          assistantId,
          title: "Build app shell",
          state: "pending",
          sortOrder: 0,
          source: "assistant",
          workKind: "app-code",
          workTarget: "src/app.tsx",
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    captureDispatchedCommands(commands);

    render(() => <AssistantsPanel variant="detail" />);

    expect(screen.getAllByText("app-code").length).toBeGreaterThan(0);
    expect(screen.getByText("Target: src/app.tsx")).not.toBeNull();
    fireEvent.change(screen.getByDisplayValue("src/app.tsx"), { target: { value: "src/routes/home.tsx" } });

    expect(commands.at(-1)).toMatchObject({
      type: "assistant.todo.update",
      payload: {
        assistantId,
        todoId: "todo-metadata",
        patch: {
          workTarget: "src/routes/home.tsx"
        }
      }
    });
  });

  it("sends reorder commands for assistant todos and learnings", () => {
    const commands: unknown[] = [];
    const assistantId = "assistant-reorder-memory";
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    seedAssistantDetailState({
      assistantId,
      projectId: "project-reorder-memory",
      selectedTab: "todos",
      todos: [
        { id: "todo-first", assistantId, title: "First task", state: "pending", sortOrder: 0, workKind: "app-code", createdAt: now, updatedAt: now },
        { id: "todo-second", assistantId, title: "Second task", state: "pending", sortOrder: 1, workKind: "app-code", createdAt: now, updatedAt: now }
      ]
    });
    captureDispatchedCommands(commands);

    render(() => <AssistantsPanel variant="detail" />);
    fireEvent.click(screen.getByRole("button", { name: "Move Second task up" }));

    cleanup();
    seedAssistantDetailState({
      assistantId,
      projectId: "project-reorder-memory",
      selectedTab: "learnings",
      learnings: [
        { id: "learning-first", assistantId, summary: "First learning", source: "test", confidence: "medium", sortOrder: 0, createdAt: now },
        { id: "learning-second", assistantId, summary: "Second learning", source: "test", confidence: "medium", sortOrder: 1, createdAt: now }
      ]
    });
    captureDispatchedCommands(commands);
    render(() => <AssistantsPanel variant="detail" />);
    fireEvent.click(screen.getByRole("button", { name: "Move learning Second learning up" }));

    expect(commands).toMatchObject([
      {
        type: "assistant.todo.reorder",
        payload: {
          assistantId,
          todoIds: ["todo-second", "todo-first"]
        }
      },
      {
        type: "assistant.learning.reorder",
        payload: {
          assistantId,
          learningIds: ["learning-second", "learning-first"]
        }
      }
    ]);
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

  it("keeps assistant chat latest content visible by default", async () => {
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-default-scroll"
    });
    const assistantId = "assistant-default-scroll";
    const state: Partial<HarnessViewState> = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...createEmptyAssistantsState(),
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
            id: "assistant-thread-default-scroll",
            assistantId,
            sessionId: "assistant-session-default-scroll",
            messageCount: 20,
            messages: Array.from({ length: 20 }, (_, index) => ({
              id: `message-user-default-scroll-${index}`,
              role: "user" as const,
              kind: "plain" as const,
              content: `Need status ${index}`,
              createdAt: new Date(Date.parse(now) + index).toISOString()
            })),
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

    const restoreScrollMetrics = defineScrollMetrics(1000, 200);
    render(() => <AssistantsPanel variant="detail" />);

    const viewport = document.querySelector("[data-test-assistant-chat-scroll]") as HTMLElement;
    expect(viewport).not.toBeNull();

    await waitFor(() => expect(screen.getByText("Streaming status")).not.toBeNull());
    restoreScrollMetrics();
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
        content: "Need status",
        reasoningStrength: "high",
        fastMode: false
      }
    });
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  it("keeps assistant chat draft when send fails", () => {
    const now = new Date(2026, 3, 28, 10, 4).toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-send-failed"
    });
    const assistantId = "assistant-send-failed";
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
            id: "assistant-thread-send-failed",
            assistantId,
            sessionId: "assistant-session-send-failed",
            messageCount: 0,
            messages: [],
            updatedAt: now
          }
        ],
        selectedAssistantId: assistantId
      }
    });
    seedHarnessStoreForTests(state);
    harnessStore.actions.setCommandDispatcher(() => {
      throw new Error("Socket closed");
    });

    render(() => <AssistantsPanel />);

    const textarea = screen.getByPlaceholderText("Ask Repo helper something.") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Need status" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));

    expect(textarea.value).toBe("Need status");
    expect(toastStore.toasts.some((toast) => toast.title === "Command failed")).toBe(true);
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
            detailsJsonSummary: "Details JSON truncated to 12000 characters.",
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
    expect(screen.getByText("Details JSON truncated to 12000 characters.")).not.toBeNull();
  });

  it("shows assistant job failure tracking and run diagnostics", () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({ id: "project-assistant-jobs" });
    const assistantId = "assistant-jobs";
    const job: BackgroundJob = {
      id: "job-assistant-jobs",
      projectId: project.id,
      assistantId,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Release patrol",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect release status."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      consecutiveFailureCount: 3,
      backoffUntil: new Date(Date.parse(now) + 5 * 60_000).toISOString(),
      lastFailureCategory: "controller-lost",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-assistant-jobs",
      jobId: job.id,
      projectId: project.id,
      assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "retry",
      status: "failed",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      failureMessage: "Background run interrupted before completion",
      failureCategory: "controller-lost",
      promptStats: {
        promptChars: 1800,
        promptHash: "hash-assistant"
      },
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          selectedAssistantId: assistantId,
          selectedTab: "jobs",
          assistants: [
            {
              id: assistantId,
              name: "Release watcher",
              scope: "project",
              projectId: project.id,
              description: "Tracks release risk.",
              personalityPrompt: "Be direct.",
              jobPrompt: "Watch release blockers.",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            }
          ]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [run],
          templates: []
        }
      })
    );

    render(() => <AssistantsPanel variant="detail" />);

    expect(screen.getByText(/Failure streak 3/)).not.toBeNull();
    expect(screen.getByText(/Failure category: controller lost/)).not.toBeNull();
    expect(screen.getByText(/Prompt: 1800 chars, hash hash-assistant/)).not.toBeNull();
  });
});
