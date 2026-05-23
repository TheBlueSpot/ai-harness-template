/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { ChatPanel } from "./chat-panel";
import { buildProjectChatSearchResults } from "../lib/project-chat-search";
import { createInitialViewState, harnessStore, readBrowserUiSession } from "../harness-store";
import { DEFAULT_APP_HOTKEY_PREFERENCES } from "../lib/app-hotkeys";
import { toastStore } from "../toast-store";
import { formatShortTimestamp } from "../lib/time-format";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createPlanSummaryMessage,
  createRunFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";
import { createChatMessage, createEmptySession } from "../../../shared/protocol";

createUiTest("ChatPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    toastStore.toasts.length = 0;
  });

  it("persists and restores active chat pane tab", () => {
    const project = createViewProjectFixture({ id: "project-chat-pane" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open events pane" }));

    expect(harnessStore.state.chatPaneTab).toBe("events");
    expect(readBrowserUiSession().chatPaneTab).toBe("events");

    cleanup();
    harnessStore.replaceStateForTests(createInitialViewState());
    harnessStore.actions.hydrateBrowserUiSession();

    seedHarnessStoreForTests(
      createHarnessStateFixture({
        chatPaneTab: harnessStore.state.chatPaneTab,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    render(() => <ChatPanel />);

    expect(screen.getByRole("button", { name: "Open events pane" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the create-thread hotkey in the chat toolbar tooltip", async () => {
    const project = createViewProjectFixture({ id: "project-chat-hotkey" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        appHotkeyPreferences: {
          ...DEFAULT_APP_HOTKEY_PREFERENCES,
          createProjectChat: ["Alt+N"]
        },
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    expect(screen.getByRole("button", { name: /Create a new thread in this project \(Alt.*N\)/ })).not.toBeNull();
  });

  it("orders project chat search by project title hits before active thread transcript", () => {
    const projectAlpha = createViewProjectFixture({
      id: "project-alpha-search",
      name: "Alpha dashboard",
      activeThreadId: "thread-alpha",
      session: {
        ...createEmptySession("thread-alpha"),
        messages: [createChatMessage("user", "Find billing regression")]
      },
      threads: [
        {
          id: "thread-alpha",
          title: "Alpha thread",
          kind: "user",
          titleSource: "custom",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 1,
          lastMessagePreview: "Find billing regression",
          badgeState: "idle"
        }
      ]
    });
    const projectBilling = createViewProjectFixture({
      id: "project-billing-search",
      name: "Billing api",
      activeThreadId: "thread-billing",
      session: createEmptySession("thread-billing")
    });
    const results = buildProjectChatSearchResults([projectAlpha, projectBilling], "billing");

    expect(results[0]).toMatchObject({ projectId: projectBilling.id, title: "Billing api" });
    expect(results[1]).toMatchObject({ projectId: projectAlpha.id, threadId: "thread-alpha" });
  });

  it("submits planner answers when a planning question is pending", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-question",
      draft: "api/users/[id]",
      activeRun: createRunFixture({
        id: "run-question",
        status: "awaiting-user-input",
        questions: [
          {
            id: "question-1",
            prompt: "Which route?",
            placeholder: "api/users/[id]",
            choices: [
              {
                id: "choice-1",
                label: "API route",
                description: "Use API route",
                answerText: "api/users/[id]",
                recommended: true
              },
              {
                id: "choice-2",
                label: "Web route",
                description: "Use page route",
                answerText: "users/[id]",
                recommended: false
              },
              {
                id: "choice-3",
                label: "Custom",
                description: "Type custom route",
                answerText: "custom route",
                recommended: false
              }
            ],
            required: true,
            status: "pending",
            askedAt: new Date().toISOString()
          }
        ]
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send planner answer" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("planning.answer");
  });

  it("renders assistant setup freeform questions without choice buttons", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-assistant-purpose",
      draft: "Maintain docs and stale todos.",
      activeRun: createRunFixture({
        id: "run-assistant-purpose",
        status: "awaiting-user-input",
        questions: [
          {
            id: "assistant-create-purpose",
            prompt: "What should Kojima do for this project?",
            placeholder: "Use Kojima to triage failed tests, maintain docs, and keep project todos current.",
            responseKind: "freeform",
            required: true,
            status: "pending",
            askedAt: new Date().toISOString(),
            intent: {
              type: "assistant-create-intent",
              projectId: "project-assistant-purpose",
              threadId: "thread-assistant-purpose",
              sourcePrompt: "create a new local project assistant kojima",
              suggestedName: "Kojima",
              defaultScope: "project",
              requiresPurpose: true
            }
          }
        ]
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);

    expect(screen.getByText("Assistant setup")).toBeTruthy();
    expect(screen.queryByText("Planner question")).toBeNull();
    expect(screen.queryByText("Recommended")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send planner answer" }));
    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("planning.answer");
  });

  it("submits plan refinements when a ready run exists", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-ready",
      draft: "make it runnable",
      activeRun: createRunFixture({
        id: "run-ready",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 20,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: plan
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("planning.refine");
  });

  it("switches between compact chat panes without the old cockpit card", () => {
    const project = createViewProjectFixture({
      id: "project-pane-nav"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    expect(document.querySelector("[data-test-task-cockpit]")).toBeNull();
    expect(screen.getByRole("button", { name: "Open chat pane" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Open plan pane" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open run pane" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open memory pane" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open events pane" })).not.toBeNull();
    expect(screen.queryByText(/transcript\s*\|/i)).toBeNull();
  });

  it("shows memory priority controls and confirms delete before dispatch", () => {
    const commands: unknown[] = [];
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-memory-controls",
      memoryEntries: [
        {
          id: "memory-1",
          projectId: "project-memory-controls",
          kind: "task-summary",
          status: "active",
          title: "First memory",
          summary: "First summary",
          tags: [],
          pathGlobs: [],
          confidence: "medium",
          freshness: "fresh",
          pinned: false,
          priority: 100,
          hitCount: 0,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "memory-2",
          projectId: "project-memory-controls",
          kind: "task-summary",
          status: "active",
          title: "Second memory",
          summary: "Second summary",
          tags: [],
          pathGlobs: [],
          confidence: "high",
          freshness: "fresh",
          pinned: false,
          priority: 200,
          hitCount: 3,
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        chatPaneTab: "memory",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open memory pane" }));

    expect(screen.getByText("priority 100 | medium | fresh | hits 0")).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Move memory down" })[0]!);
    expect((commands.at(-1) as { type: string }).type).toBe("memory.reorder");

    const deleteButtons = screen.getAllByRole("button", { name: "Permanently delete this memory entry" });
    fireEvent.click(deleteButtons[0]!);
    expect(commands.some((command) => (command as { type: string }).type === "memory.delete")).toBe(false);
    fireEvent.click(deleteButtons[0]!);
    expect((commands.at(-1) as { type: string }).type).toBe("memory.delete");
  });

  it("loads memory entries when memory pane opens with a ready connection", async () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-memory-connect"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        chatPaneTab: "chat",
        connectionState: "connected",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);

    expect(commands.some((command) => (command as { type: string }).type === "memory.list")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open memory pane" }));

    await waitFor(() => expect((commands.at(-1) as { type: string } | undefined)?.type).toBe("memory.list"));
    expect((commands.at(-1) as { payload: { projectId: string } }).payload.projectId).toBe(project.id);
  });

  it("blocks plain submit for resumable runs and shows toast", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-resume",
      draft: "please continue",
      activeRun: createRunFixture({
        id: "run-resume",
        status: "partial-complete",
        resumable: true,
        subtasks: []
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    const textbox = screen.getByRole("textbox");
    const form = textbox.closest("form");
    if (!form) {
      throw new Error("Expected chat form");
    }

    fireEvent.submit(form);
    expect(commands.length).toBe(0);
    expect(toastStore.toasts[0]?.title).toBe("Cannot send yet");
    expect(toastStore.toasts[0]?.description).toBe("Use resume failed agents to continue this run");
  });

  it("submits top-level chat sends for plain drafts", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to Pi" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("chat.send");
  });

  it("switches Pi to an alternate usable provider key before sending", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send-gemini",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        providerBrand: "gpt",
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: false,
        hasUsableGoogleApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to Pi" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["preferences.save", "chat.send"]);
    expect(commands[0]).toMatchObject({
      type: "preferences.save",
      payload: {
        providerBrand: "gemini"
      }
    });
  });

  it("disables Pi sends with a tooltip reason when no provider key exists", () => {
    const project = createViewProjectFixture({
      id: "project-send-no-keys",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    const sendButton = screen.getByRole("button", { name: "Send task to Pi" }) as HTMLButtonElement;

    expect(sendButton.disabled).toBe(true);
    expect(sendButton.getAttribute("aria-description")).toContain("Add an OpenAI or Google API key to use Pi");
  });

  it("disables Pi send with tooltip reason when only alternate agents are ready", () => {
    const project = createViewProjectFixture({
      id: "project-send-pi-disabled",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        availableAgents: [
          { id: "pi", label: "Pi" },
          { id: "codex-cli", label: "Codex CLI" }
        ],
        agentRuntimes: [
          {
            agentId: "codex-cli",
            label: "Codex CLI",
            runtimeKind: "cli",
            installed: true,
            authenticated: true,
            interactivePipeCompatible: true,
            supportsInteractive: true,
            supportsProgrammatic: true,
            supportsPlanning: true,
            supportsReview: true,
            discoveredModels: ["openai/gpt-5.4"],
            activeModel: "openai/gpt-5.4",
            modelDiscoveryConfidence: "exact"
          }
        ],
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    const sendButton = screen.getByRole("button", { name: "Send task to Pi" }) as HTMLButtonElement;

    expect(sendButton.disabled).toBe(true);
    expect(sendButton.getAttribute("aria-description")).toContain("Add an OpenAI or Google API key to use Pi");
  });

  it("uses agent-available readiness to default sends to a ready CLI runtime", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send-agent-available",
      draft: "simple task"
    });
    const state = createHarnessStateFixture({
      availableAgents: [
        { id: "pi", label: "Pi" },
        { id: "codex-cli", label: "Codex CLI" }
      ],
      agentRuntimes: [
        {
          agentId: "codex-cli",
          label: "Codex CLI",
          runtimeKind: "cli",
          installed: true,
          authenticated: true,
          interactivePipeCompatible: true,
          supportsInteractive: true,
          supportsProgrammatic: true,
          supportsPlanning: true,
          supportsReview: true,
          discoveredModels: ["openai/gpt-5.4"],
          activeModel: "openai/gpt-5.4",
          modelDiscoveryConfidence: "exact"
        }
      ],
      setup: {
        launchMode: "source",
        updatedAt: new Date(0).toISOString(),
        readyRequiredCount: 1,
        totalRequiredCount: 1,
        checks: [
          {
            id: "agent-available",
            title: "Agent available",
            summary: "Codex CLI can run without a Pi provider key.",
            status: "ready",
            requiredForFirstTask: true,
            updatedAt: new Date(0).toISOString()
          },
          {
            id: "provider-auth",
            title: "Pi provider missing",
            summary: "Add an OpenAI or Google API key to enable Pi.",
            status: "action-required",
            requiredForFirstTask: false,
            updatedAt: new Date(0).toISOString()
          }
        ]
      },
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      }
    });

    harnessStore.applyServerEvent({
      type: "connection.ready",
      payload: {
        agents: state.availableAgents,
        workspace: state.workspace,
        executionControl: state.executionControl,
        preferences: {
          hasUsableApiKey: state.hasUsableApiKey,
          hasStoredApiKey: state.hasStoredApiKey,
          hasUsableOpenAiApiKey: state.hasUsableOpenAiApiKey,
          hasStoredOpenAiApiKey: state.hasStoredOpenAiApiKey,
          hasUsableGoogleApiKey: state.hasUsableGoogleApiKey,
          hasStoredGoogleApiKey: state.hasStoredGoogleApiKey,
          hasUsableAnthropicApiKey: state.hasUsableAnthropicApiKey,
          hasStoredAnthropicApiKey: state.hasStoredAnthropicApiKey,
          providerBrand: state.providerBrand,
          debugEnabledDefault: state.debugEnabled,
          tracePanelDefaultOpen: state.tracePanelDefaultOpen,
          subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
          blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
          dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
          autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
          planExecutionModeDefault: state.planExecutionModeDefault,
          planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
          singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
          subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
          correctnessIterationModeDefault: state.correctnessIterationModeDefault,
          backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
          memoryBankEnabledDefault: state.memoryBankEnabledDefault,
          memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
          checkCliUpdatesDefault: state.checkCliUpdatesDefault,
          attachmentsEnabled: state.attachmentsEnabled,
          capabilities: state.capabilities,
          agentRuntimes: state.agentRuntimes
        },
        setup: state.setup,
        backgroundJobs: state.backgroundJobs,
        assistants: state.assistants,
        notifications: state.notifications
      }
    });
    harnessStore.setProjectDraft(project.id, "simple task");

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to Codex CLI" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "chat.send",
      payload: {
        agentId: "codex-cli"
      }
    });
  });

  it("sends with CLI runtimes without Pi API keys", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send-codex",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        selectedAgentId: "codex-cli",
        hasGlobalSelectedAgentId: true,
        availableAgents: [
          { id: "pi", label: "Pi" },
          { id: "codex-cli", label: "Codex CLI" }
        ],
        agentRuntimes: [
          {
            agentId: "codex-cli",
            label: "Codex CLI",
            runtimeKind: "cli",
            installed: true,
            authenticated: true,
            interactivePipeCompatible: true,
            supportsInteractive: true,
            supportsProgrammatic: true,
            supportsPlanning: true,
            supportsReview: true,
            discoveredModels: ["openai/gpt-5.4"],
            activeModel: "openai/gpt-5.4",
            modelDiscoveryConfidence: "exact"
          }
        ],
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to Codex CLI" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "chat.send",
      payload: {
        agentId: "codex-cli"
      }
    });
  });

  it("disables selected CLI send with tooltip reason when runtime cannot send", () => {
    const project = createViewProjectFixture({
      id: "project-send-codex-disabled",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        selectedAgentId: "codex-cli",
        hasGlobalSelectedAgentId: true,
        availableAgents: [
          { id: "pi", label: "Pi" },
          { id: "codex-cli", label: "Codex CLI" }
        ],
        agentRuntimes: [
          {
            agentId: "codex-cli",
            label: "Codex CLI",
            runtimeKind: "cli",
            installed: true,
            authenticated: false,
            interactivePipeCompatible: true,
            supportsInteractive: true,
            supportsProgrammatic: true,
            supportsPlanning: true,
            supportsReview: true,
            healthMessage: "Run `codex login` before sending tasks.",
            discoveredModels: ["openai/gpt-5.4"],
            activeModel: "openai/gpt-5.4",
            modelDiscoveryConfidence: "exact"
          }
        ],
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    const sendButton = screen.getByRole("button", { name: "Send task to Codex CLI" }) as HTMLButtonElement;

    expect(sendButton.disabled).toBe(true);
    expect(sendButton.getAttribute("aria-description")).toBe("Run `codex login` before sending tasks.");
  });

  it("locks mode on chat.send when user explicitly selected one", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send-locked",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        selectedModeId: "plan",
        hasGlobalSelectedModeId: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to Pi" }));

    expect(commands[0]).toMatchObject({
      type: "chat.send",
      payload: {
        modeId: "plan",
        modeLocked: true
      }
    });
  });

  it("sends auto mode unlocked so server can classify each prompt", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send-auto",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        selectedModeId: "auto",
        hasGlobalSelectedModeId: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to Pi" }));

    expect(commands[0]).toMatchObject({
      type: "chat.send",
      payload: {
        modeId: "auto",
        modeLocked: false
      }
    });
  });

  it("keeps Auto selected in the mode dropdown", async () => {
    const project = createViewProjectFixture({
      id: "project-select-auto"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        selectedModeId: "auto",
        hasGlobalSelectedModeId: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    expect(harnessStore.state.selectedModeId).toBe("auto");
    expect(harnessStore.state.hasGlobalSelectedModeId).toBe(true);
    await screen.findByText("Auto");
  });

it("updates composer effort label and sends reasoning plus fast mode", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-effort-send",
      draft: "ship it"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        selectedReasoningStrength: "medium",
        hasGlobalSelectedReasoningStrength: true,
        selectedFastMode: true,
        hasGlobalSelectedFastMode: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);

    const effortTrigger = document.querySelector("[data-test-effort-trigger]") as HTMLButtonElement | null;
    if (!effortTrigger) {
      throw new Error("Expected effort trigger");
    }
    expect(effortTrigger.textContent).toContain("Medium");
    expect(effortTrigger.textContent).toContain("Fast");

    fireEvent.click(screen.getByRole("button", { name: "Send task to Pi" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "chat.send",
      payload: {
        reasoningStrength: "medium",
        fastMode: true
      }
    });
  });

  it("keeps effort in the shared control row and hides single-choice dropdowns", () => {
    const project = createViewProjectFixture({
      id: "project-compact-controls"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        selectedAgentId: "codex-cli",
        hasGlobalSelectedAgentId: true,
        agentRuntimes: [
          {
            agentId: "codex-cli",
            label: "Codex CLI",
            runtimeKind: "cli",
            installed: true,
            authenticated: true,
            interactivePipeCompatible: true,
            supportsInteractive: true,
            supportsProgrammatic: true,
            supportsPlanning: true,
            supportsReview: true,
            supportsReasoningStrengthControl: true,
            supportsFastModeControl: true,
            discoveredModels: ["openai/gpt-5.4"],
            activeModel: "openai/gpt-5.4",
            modelDiscoveryConfidence: "partial"
          }
        ],
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    const controlRow = document.querySelector("[data-test-composer-control-row]");
    const effortTrigger = document.querySelector("[data-test-effort-trigger]");

    expect(controlRow).not.toBeNull();
    expect(effortTrigger).not.toBeNull();
    expect(controlRow?.contains(effortTrigger)).toBe(true);
    expect(document.querySelector("[data-test-provider-select]")).toBeNull();
    expect(document.querySelector("[data-test-model-select]")).toBeNull();
    expect(screen.queryByText("Mode")).toBeNull();
    expect(screen.queryByText("Agent")).toBeNull();
  });

  it("submits composer with Enter when textarea is focused", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-enter-send",
      draft: "send from keyboard"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    const textbox = screen.getByRole("textbox");
    textbox.focus();

    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("chat.send");
  });

  it("grows composer to a viewport-bound height before internal scroll", () => {
    const project = createViewProjectFixture({
      id: "project-composer-height",
      draft: ""
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 360 });

    render(() => <ChatPanel />);
    const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textbox, "scrollHeight", { configurable: true, value: 400 });

    fireEvent.input(textbox, { target: { value: "long\n".repeat(40) } });

    expect(textbox.style.maxHeight).toBe("180px");
    expect(textbox.style.height).toBe("180px");
  });

  it("blocks Enter submit while the active thread is streaming", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-enter-streaming",
      draft: "send while streaming",
      activeRun: createRunFixture({
        id: "run-enter-streaming",
        status: "running-main"
      }),
      session: {
        ...createEmptySession("thread-1"),
        messages: [],
        isStreaming: true
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    const textbox = screen.getByRole("textbox");
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(commands).toHaveLength(0);
    expect(toastStore.toasts[0]?.description).toBe("Project is streaming");
  });

  it("allows a follow-up when only a stale stream flag remains after a live CLI session", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-stale-stream-cli",
      draft: "next task",
      activeRun: createRunFixture({
        id: "run-stale-stream-cli",
        status: "completed"
      }),
      session: {
        ...createEmptySession("thread-1"),
        messages: [],
        isStreaming: true
      },
      activeCliSession: {
        id: "cli-session-1",
        projectId: "project-stale-stream-cli",
        threadId: "thread-1",
        agentId: "codex-cli",
        cwd: "C:/repo",
        status: "running",
        cols: 120,
        rows: 32,
        attachState: "attached",
        idleTimeoutMs: 30 * 60_000,
        startedAt: "2026-05-10T12:00:00.000Z",
        updatedAt: "2026-05-10T12:00:01.000Z"
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect((commands[0] as { type: string }).type).toBe("chat.send");
  });

  it("shows a waiting timer above the composer while the active thread is streaming", () => {
    const project = createViewProjectFixture({
      id: "project-waiting-timer",
      activeRun: createRunFixture({
        id: "run-waiting-timer",
        status: "running-main",
        createdAt: new Date(Date.now() - 65_000).toISOString()
      }),
      session: {
        ...createEmptySession("thread-1"),
        messages: [],
        isStreaming: true
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

    render(() => <ChatPanel />);

    expect(screen.getByRole("status").textContent).toContain("Working for 1m 5s");
    expect(document.querySelector("[data-test-waiting-timer]")).not.toBeNull();
    expect(document.querySelectorAll(".agent-waiting-dot")).toHaveLength(3);
    expect(document.querySelector(".agent-waiting-dot-2")).not.toBeNull();
    expect(document.querySelector(".agent-waiting-dot-3")).not.toBeNull();
  });

  it("shows the last response time and duration above the composer after the agent finishes", () => {
    const completedAt = new Date("2026-04-27T17:10:33.000Z");
    const project = createViewProjectFixture({
      id: "project-last-response-timer",
      lastRun: createRunFixture({
        id: "run-last-response-timer",
        status: "completed",
        createdAt: new Date(completedAt.getTime() - 13_000).toISOString(),
        updatedAt: completedAt.toISOString(),
        completedAt: completedAt.toISOString()
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

    render(() => <ChatPanel />);

    const timerText = screen.getByRole("status").textContent ?? "";
    expect(timerText).toContain("• 13s");
    expect(timerText).not.toContain("Working");
  });

  it("keeps active thread rename and copy controls available while streaming", async () => {
    let copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copiedText = value;
        }
      }
    });
    const project = createViewProjectFixture({
      id: "project-rename-streaming",
      activeThreadId: "thread-streaming",
      session: {
        ...createEmptySession("thread-streaming"),
        messages: [],
        isStreaming: true
      },
      threads: [
        {
          id: "thread-streaming",
          kind: "user",
          title: "Thread 1",
          titleSource: "generated",
          status: "active",
          badgeState: "executing",
          messageCount: 1,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    const renameButton = screen.getByRole("button", { name: "Rename this thread" }) as HTMLButtonElement;
    expect(renameButton.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Copy thread id" }));
    await Promise.resolve();
    expect(copiedText).toBe("thread-streaming");
    expect(toastStore.toasts[0]?.title).toBe("Thread id copied");
  });

  it("blocks Enter submit while setup gates fresh tasks", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-enter-setup",
      draft: "send before setup"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        setup: {
          launchMode: "source",
          updatedAt: new Date(0).toISOString(),
          readyRequiredCount: 1,
          totalRequiredCount: 1,
          checks: [
            {
              id: "runtime-auth",
              title: "Runtime auth",
              summary: "Connect a runtime before first task",
              status: "action-required",
              requiredForFirstTask: true,
              updatedAt: new Date(0).toISOString()
            }
          ]
        },
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    const textbox = screen.getByRole("textbox");
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(commands).toHaveLength(0);
    expect(toastStore.toasts[0]?.description).toBe("Connect a runtime before first task");
  });

  it("blocks Enter submit for resumable runs", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-enter-resume",
      draft: "resume hint",
      activeRun: createRunFixture({
        id: "run-enter-resume",
        status: "failed",
        resumable: true
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    const textbox = screen.getByRole("textbox");
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(commands).toHaveLength(0);
    expect(toastStore.toasts[0]?.description).toBe("Use resume failed agents to continue this run");
  });

  it("does not render a transcript plan card when the backend suppresses ask-mode summaries", () => {
    const plan = createExecutionPlanFixture({
      gating: {
        mode: "immediate",
        delaySeconds: 0
      },
      route: "main",
      targetSubagentCount: 0,
      actualSubagentCount: 0
    });
    const readyProject = createViewProjectFixture({
      id: "project-immediate",
      session: {
        ...createViewProjectFixture().session,
        messages: []
      },
      activeRun: createRunFixture({
        id: "run-immediate",
        threadId: "thread-1",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 20,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: plan
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: readyProject.id,
          projects: [readyProject]
        }
      })
    );

    render(() => <ChatPanel />);
    expect(screen.queryByText("Plan summary")).toBeNull();
    expect(screen.queryByText(plan.summary)).toBeNull();
  });

  it("sends resume and retry commands when the thread is idle", () => {
    const commands: unknown[] = [];
    const resumableRun = createRunFixture({
      id: "run-active",
      status: "partial-complete",
      resumable: true,
      retryable: true
    });
    const retryRun = createRunFixture({
      id: "run-last",
      status: "completed",
      retryable: true,
      completedAt: new Date().toISOString()
    });
    const project = createViewProjectFixture({
      id: "project-actions",
      draft: "extra guidance",
      activeRun: resumableRun,
      lastRun: retryRun
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Resume failed or pending subagents" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry last run" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["run.resume", "run.retry"]);
  });

  it("sends stop commands when the thread is streaming", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-stop",
      activeRun: createRunFixture({
        id: "run-stop",
        status: "running-main"
      }),
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Stop active run" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["chat.stop"]);
  });

  it("shows streaming assistant text only when a stream exists", () => {
    const project = createViewProjectFixture({
      id: "project-stream",
      streamingAssistantText: "# Partial output"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    expect(screen.getByText("harness")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Partial output" })).not.toBeNull();

    const clearedProject = createViewProjectFixture({
      ...project,
      streamingAssistantText: ""
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: clearedProject.id,
          projects: [clearedProject]
        }
      })
    );
    harnessStore.replaceStateForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: clearedProject.id,
          projects: [clearedProject]
        }
      })
    );
    cleanup();
    render(() => <ChatPanel />);
    expect(screen.queryByText("harness")).toBeNull();
  });

  it("hides duplicated persisted assistant row while the stream is still live", () => {
    const threadId = "thread-streaming-dup";
    const project = createViewProjectFixture({
      id: "project-streaming-dup",
      activeRun: createRunFixture({
        id: "run-streaming-dup",
        status: "running-main"
      }),
      session: {
        ...createViewProjectFixture().session,
        sessionId: threadId,
        isStreaming: true,
        messages: [
          {
            id: "assistant-streaming-dup",
            role: "assistant",
            content: "# Partial output",
            createdAt: new Date().toISOString()
          }
        ]
      },
      streamingAssistantText: "# Partial output"
    });

    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);
    expect(screen.getAllByRole("heading", { name: "Partial output" })).toHaveLength(1);
  });

  it("renders assistant action cards and dispatches typed actions", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-assistant-action-card",
      session: {
        ...createEmptySession("thread-assistant-action-card"),
        messages: [
          createChatMessage("assistant", "Created assistant job.", {
            metadata: {
              type: "assistant-action",
              assistantId: "assistant-1",
              assistantName: "Release watcher",
              actionKind: "run-job",
              jobId: "job-1",
              summaryRows: [{ label: "Assistant", value: "Release watcher" }],
              actions: [
                { kind: "open-assistant", label: "Open assistant" },
                { kind: "open-jobs", label: "Open jobs" },
                { kind: "run-job", label: "Run job" },
                { kind: "pause", label: "Pause" }
              ]
            }
          })
        ]
      }
    });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] } }));
    captureDispatchedCommands(commands);

    render(() => <ChatPanel />);
    expect(screen.getByText("Assistant action")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run job" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["background-job.run-now", "assistant.pause"]);
  });

  it("renders streamed markdown content from chat.delta state", async () => {
    const project = createViewProjectFixture({
      id: "project-stream-delta",
      session: {
        ...createViewProjectFixture().session,
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

    render(() => <ChatPanel />);
    harnessStore.applyServerEvent({
      type: "chat.delta",
      requestId: "req-stream-delta",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: project.session.sessionId,
        delta: "```ts\nconst streamed = true;\n```"
      }
    });

    cleanup();
    render(() => <ChatPanel />);
    expect(screen.getByRole("button", { name: "Copy code block" })).not.toBeNull();
    expect(document.querySelector(".markdown-code-content")?.textContent).toContain("const streamed = true;");
  });

  it("renders live planning status even before transcript messages exist", () => {
    const project = createViewProjectFixture({
      id: "project-stream-status-only",
      session: {
        ...createViewProjectFixture().session,
        messages: []
      },
      streamingTailSegments: [
        {
          id: "run-1:planning",
          kind: "status",
          phase: "planning",
          content: "**Planning**\n- Need routing target.",
          updatedAt: new Date().toISOString()
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

    cleanup();
    render(() => <ChatPanel />);
    expect(screen.queryByText("Choose project, then send task. Each project keeps its own persisted thread history.")).toBeNull();
    expect(screen.getByText("Need routing target.")).not.toBeNull();
  });

  it("renders streaming tail after finalized transcript messages", () => {
    const project = createViewProjectFixture({
      id: "project-stream-tail",
      session: {
        ...createViewProjectFixture().session,
        messages: [createChatMessage("assistant", "Persisted answer")]
      },
      streamingTailSegments: [
        {
          id: "run-1:subagents",
          kind: "status",
          phase: "subagents",
          content: "**Subagents**\n- Wired HUD.",
          updatedAt: new Date().toISOString()
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

    cleanup();
    render(() => <ChatPanel />);
    const articles = Array.from(document.querySelectorAll("article"));
    expect(articles.at(-1)?.textContent).toContain("Wired HUD");
  });

  it("renders status milestones above streaming assistant text without collapsing them together", () => {
    const project = createViewProjectFixture({
      id: "project-stream-split-live",
      session: {
        ...createViewProjectFixture().session,
        messages: []
      },
      streamingHeartbeatMessages: [
        {
          id: "run-1:heartbeat:1",
          content: "**Subagents**\n- Planning done. Spawning 3 subagents. Parallel slots: 3.",
          heartbeatCount: 1,
          locked: false,
          updatedAt: new Date().toISOString()
        }
      ],
      streamingAssistantText: "New assistant text only."
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    cleanup();
    render(() => <ChatPanel />);
    expect(screen.getAllByText("harness").length).toBeGreaterThanOrEqual(2);
    const articles = Array.from(document.querySelectorAll("article"));
    expect(articles.at(-2)?.textContent).toContain("Planning done. Spawning 3 subagents. Parallel slots: 3.");
    expect(articles.at(-1)?.textContent).toContain("New assistant text only.");
    expect(articles.at(-1)?.textContent).not.toContain("Planning done. Spawning 3 subagents. Parallel slots: 3.");
  });

  it("renders locked heartbeat rows above current live heartbeat row", () => {
    const project = createViewProjectFixture({
      id: "project-stream-heartbeats",
      session: {
        ...createViewProjectFixture().session,
        messages: [createChatMessage("assistant", "Persisted answer")]
      },
      streamingHeartbeatMessages: [
        {
          id: "run-1:heartbeat:1",
          content: "**Subagents**\n- Second beat.",
          heartbeatCount: 2,
          locked: true,
          updatedAt: new Date().toISOString()
        },
        {
          id: "run-1:heartbeat:2",
          content: "**Subagents**\n- Third beat.",
          heartbeatCount: 1,
          locked: false,
          updatedAt: new Date().toISOString()
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

    cleanup();
    render(() => <ChatPanel />);
    const articles = Array.from(document.querySelectorAll("article"));
    expect(articles.at(-2)?.textContent).toContain("Second beat");
    expect(articles.at(-1)?.textContent).toContain("Third beat");
  });

  it("renders transcript markdown instead of raw plain text", () => {
    const project = createViewProjectFixture({
      id: "project-markdown",
      session: {
        ...createViewProjectFixture().session,
        messages: [createChatMessage("assistant", "Use **bold** and [docs](https://example.com).")]
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

    render(() => <ChatPanel />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "docs" }).getAttribute("target")).toBe("_blank");
  });

  it("virtualizes long transcript lists at the latest rows", () => {
    const project = createViewProjectFixture({
      id: "project-long-transcript",
      session: {
        ...createViewProjectFixture().session,
        messages: Array.from({ length: 125 }, (_, index) => createChatMessage("user", `message ${index}`))
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

    render(() => <ChatPanel />);

    expect(screen.queryByText("message 0")).toBeNull();
    expect(screen.getByText("message 124")).not.toBeNull();

    expect(screen.queryByRole("button", { name: "Show every transcript row" })).toBeNull();
  });

  it("renders system transcript rows as harness messages", () => {
    const project = createViewProjectFixture({
      id: "project-system-message",
      session: {
        ...createViewProjectFixture().session,
        messages: [
          {
            id: "system-1",
            role: "system",
            content: "Planning task.",
            createdAt: new Date().toISOString()
          }
        ]
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

    render(() => <ChatPanel />);
    expect(screen.getByText("harness")).not.toBeNull();
    expect(screen.getByText("Planning task.")).not.toBeNull();
    expect(screen.queryByText("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy harness message" })).not.toBeNull();
  });

  it("renders run milestone rows as Harness messages", () => {
    const createdAt = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-milestones",
      session: {
        ...createViewProjectFixture().session,
        messages: [
          createChatMessage("assistant", "- Subagent 1 started", {
            kind: "run-milestones",
            metadata: {
              type: "run-milestones",
              runId: "run-1",
              windowId: "window-1",
              status: "open",
              startedAt: createdAt,
              updatedAt: createdAt,
              lineCount: 1
            }
          })
        ]
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

    render(() => <ChatPanel />);
    expect(screen.getByText("harness")).not.toBeNull();
    expect(screen.getByText("In progress")).not.toBeNull();
    expect(screen.getByText("Subagent 1 started")).not.toBeNull();
    expect(screen.queryByText("status")).toBeNull();
  });

  it("renders closed run milestones without in-progress state", () => {
    const createdAt = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-closed-milestones",
      session: {
        ...createViewProjectFixture().session,
        messages: [
          createChatMessage("assistant", "- Subagent 1 done", {
            kind: "run-milestones",
            metadata: {
              type: "run-milestones",
              runId: "run-1",
              windowId: "window-1",
              status: "closed",
              startedAt: createdAt,
              updatedAt: createdAt,
              lineCount: 1
            }
          })
        ]
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

    render(() => <ChatPanel />);
    expect(screen.getByText("Subagent 1 done")).not.toBeNull();
    expect(screen.queryByText("In progress")).toBeNull();
  });

  it("renders copy buttons for transcript messages and copies plan summaries", async () => {
    let copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copiedText = value;
        }
      }
    });

    const plan = createExecutionPlanFixture({
      runId: "run-copy",
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const createdAt = new Date(2026, 3, 28, 10, 4).toISOString();
    const userMessage = createChatMessage("user", "User prompt");
    userMessage.createdAt = createdAt;
    const assistantMessage = createChatMessage("assistant", "Assistant reply");
    assistantMessage.createdAt = createdAt;
    const planMessage = createPlanSummaryMessage("run-copy", plan);
    planMessage.createdAt = createdAt;
    const project = createViewProjectFixture({
      id: "project-copy",
      session: {
        ...createViewProjectFixture().session,
        messages: [userMessage, assistantMessage, planMessage]
      },
      activeRun: createRunFixture({ id: "run-copy", createdAt, updatedAt: createdAt }),
      streamingAssistantText: "Streaming reply"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    expect(screen.getByRole("button", { name: "Copy user message" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy plan summary" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Copy harness message" })).toHaveLength(2);
    expect(screen.getAllByText(formatShortTimestamp(createdAt)).length).toBeGreaterThanOrEqual(4);

    fireEvent.click(screen.getByRole("button", { name: "Copy plan summary" }));
    await Promise.resolve();

    expect(copiedText).toContain("Plan summary");
    expect(copiedText).toContain(`Route: ${plan.route}`);
    expect(toastStore.toasts[0]?.title).toBe("Plan summary copied");
  });

  it("shows branchfs size warning badge only when warning trace exists", () => {
    const plan = createExecutionPlanFixture({ runId: "run-branchfs-warning" });
    const planMessage = createPlanSummaryMessage("run-branchfs-warning", plan);
    const project = createViewProjectFixture({
      id: "project-branchfs-warning",
      session: {
        ...createViewProjectFixture().session,
        messages: [planMessage]
      },
      traces: [
        {
          sessionId: "session-1",
          stage: "branchfs-size-warning",
          message: "BranchFS materialization is large"
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

    const rendered = render(() => <ChatPanel />);
    expect(screen.getByText("BranchFS large")).not.toBeNull();

    rendered.unmount();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [{ ...project, traces: [] }]
        }
      })
    );
    render(() => <ChatPanel />);
    expect(screen.queryByText("BranchFS large")).toBeNull();
  });

  it("keeps ready plan controls usable when only a stale stream flag remains", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      runId: "run-ready",
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-followup",
      draft: "make it runnable",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      },
      activeRun: createRunFixture({
        id: "run-ready",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 20,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: plan
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    expect((screen.getByRole("button", { name: "Refine plan before execution" }) as HTMLButtonElement).disabled).toBe(false);

    harnessStore.applyServerEvent({
      type: "chat.message-appended",
      requestId: "req-followup",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: project.session.sessionId,
        message: createPlanSummaryMessage("run-ready", plan),
        state: {
          ...project.session,
          messages: [...project.session.messages, createPlanSummaryMessage("run-ready", plan)],
          isStreaming: false
        }
      }
    });

    cleanup();
    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    expect(harnessStore.state.workspace.projects[0]?.session.isStreaming).toBe(false);
    expect((screen.getByRole("button", { name: "Refine plan before execution" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));
    expect((commands[0] as { type: string }).type).toBe("planning.refine");
  });

  it("keeps approve-gated implement subagent plans startable from the transcript card", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      runId: "run-subagents-approve",
      gating: {
        mode: "approve",
        delaySeconds: 0
      },
      route: "pi-subagents",
      targetSubagentCount: 2,
      actualSubagentCount: 2
    });
    const planMessage = createPlanSummaryMessage("run-subagents-approve", plan);
    const project = createViewProjectFixture({
      id: "project-subagents-approve",
      session: {
        ...createViewProjectFixture().session,
        messages: [planMessage]
      },
      activeRun: createRunFixture({
        id: "run-subagents-approve",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 72,
        usesSubagents: true,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 2,
        executionPlan: plan
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Build this persisted plan now" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("run.execute");
  });

  it("starts virtual branch experiments from the transcript card", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      runId: "run-experiment",
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const planMessage = createPlanSummaryMessage("run-experiment", plan);
    const project = createViewProjectFixture({
      id: "project-experiment",
      session: {
        ...createViewProjectFixture().session,
        messages: [planMessage]
      },
      activeRun: createRunFixture({
        id: "run-experiment",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 72,
        usesSubagents: true,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 2,
        executionPlan: plan
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

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run this plan in isolated virtual branch" }));

    expect(commands.length).toBe(1);
    expect(commands[0]).toMatchObject({
      type: "run.execute",
      payload: {
        runId: "run-experiment",
        target: "ephemeral-experiment"
      }
    });
  });

  it("renders compact run ledger and proof bundle details", () => {
    const project = createViewProjectFixture({
      id: "project-run-ledger",
      activeRun: createRunFixture({
        id: "run-ledger",
        ledger: {
          currentPhase: "Reviewing",
          nextStep: "Run focused tests",
          waitingOn: "approval"
        },
        proofBundle: {
          diffSummary: "2 files changed",
          commands: ["bun test"],
          browserEvidenceRefs: ["home-desktop.png"],
          finalReviewNotes: "Looks bounded"
        }
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        chatPaneTab: "run",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    expect(screen.getByText("Run ledger")).not.toBeNull();
    expect(screen.getByText("Next: Run focused tests")).not.toBeNull();
    expect(screen.getByText("Proof bundle")).not.toBeNull();
    expect(screen.getByText("Evidence refs: 2")).not.toBeNull();
  });

  it("builds persisted ready plans from transcript run summaries", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({ runId: "run-ready-summary" });
    const project = createViewProjectFixture({
      id: "project-ready-summary",
      session: {
        ...createViewProjectFixture().session,
        messages: [createPlanSummaryMessage("run-ready-summary", plan)]
      },
      runSummaries: [
        {
          id: "run-ready-summary",
          threadId: "thread-1",
          status: "ready",
          resumable: false,
          retryable: false,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] } }));

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Build this persisted plan now" }));

    expect(commands[0]).toMatchObject({
      type: "run.execute",
      payload: { runId: "run-ready-summary" }
    });
  });

  it("shows retry and resume actions from persisted plan states", () => {
    const commands: unknown[] = [];
    const failedPlan = createExecutionPlanFixture({ runId: "run-failed-summary" });
    const stoppedPlan = createExecutionPlanFixture({ runId: "run-stopped-summary" });
    const project = createViewProjectFixture({
      id: "project-retry-resume-summary",
      session: {
        ...createViewProjectFixture().session,
        messages: [createPlanSummaryMessage("run-failed-summary", failedPlan), createPlanSummaryMessage("run-stopped-summary", stoppedPlan)]
      },
      runSummaries: [
        {
          id: "run-failed-summary",
          threadId: "thread-1",
          status: "failed",
          resumable: false,
          retryable: true,
          updatedAt: new Date().toISOString()
        },
        {
          id: "run-stopped-summary",
          threadId: "thread-1",
          status: "stopped",
          resumable: true,
          retryable: true,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] } }));

    captureDispatchedCommands(commands as never[]);
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Retry this persisted run" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume this persisted run" }));

    expect(commands).toMatchObject([
      { type: "run.retry", payload: { runId: "run-failed-summary" } },
      { type: "run.resume", payload: { runId: "run-stopped-summary" } }
    ]);
  });

  it("disables terminal or unavailable persisted plan states", () => {
    const completedPlan = createExecutionPlanFixture({ runId: "run-completed-summary" });
    const runningPlan = createExecutionPlanFixture({ runId: "run-running-summary" });
    const missingPlan = createExecutionPlanFixture({ runId: "run-missing-summary" });
    const project = createViewProjectFixture({
      id: "project-disabled-summary",
      session: {
        ...createViewProjectFixture().session,
        messages: [
          createPlanSummaryMessage("run-completed-summary", completedPlan),
          createPlanSummaryMessage("run-running-summary", runningPlan),
          createPlanSummaryMessage("run-missing-summary", missingPlan)
        ]
      },
      runSummaries: [
        {
          id: "run-completed-summary",
          threadId: "thread-1",
          status: "completed",
          resumable: false,
          retryable: true,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        },
        {
          id: "run-running-summary",
          threadId: "thread-1",
          status: "running-main",
          resumable: false,
          retryable: false,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] } }));

    render(() => <ChatPanel />);

    expect((screen.getByRole("button", { name: "This plan has completed" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "This plan is already in progress" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "This persisted run is not available" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
