import { describe, expect, test } from "bun:test";
import {
  createEmptySession,
  createProjectId,
  createProjectThreadSummary,
  type ProjectSearchResult,
  createWorkspaceProjectState,
  type ExecutionPlan,
  type PreferencesState,
  type ServerEvent,
  type WorkspaceProjectState
} from "../../../shared/protocol";
import { defaultProviderCapabilities } from "../../../shared/capabilities";
import {
  BROWSER_UI_SESSION_STORAGE_KEY,
  createEmptyAssistantsState,
  createEmptyBackgroundJobsState,
  createEmptyNotificationInboxState,
  createHarnessStore,
  createInitialExecutionControlState,
  createInitialSetupState,
  createInitialViewState,
  getBrowserUiSessionRestoreCommands,
  getActiveMode,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getFallbackExecutionModelIdForAgent,
  getResolvedModes,
  persistBrowserUiSession,
  readBrowserUiSession,
  reduceServerEvent
} from "../harness-store";

const defaultPreferences: PreferencesState = {
  hasUsableApiKey: false,
  hasStoredApiKey: false,
  hasUsableOpenAiApiKey: false,
  hasStoredOpenAiApiKey: false,
  hasUsableGoogleApiKey: false,
  hasStoredGoogleApiKey: false,
  providerBrand: "gpt",
  debugEnabledDefault: false,
  tracePanelDefaultOpen: true,
  subagentWorktreeStrategyDefault: "same-worktree",
  blockChatOnDirtyGitDefault: true,
  dirtyGitChangeLimitDefault: 20,
  autoCompactContextThresholdPercentDefault: 40,
  planExecutionModeDefault: "countdown",
  planExecutionDelaySecondsDefault: 10,
  correctnessIterationModeDefault: "ask-before-iterate",
  backgroundJobApprovalPolicyDefault: "ask-risky",
  memoryBankEnabledDefault: true,
  attachmentsEnabled: true,
  capabilities: [...defaultProviderCapabilities],
  agentRuntimes: []
};

const defaultExecutionControl = createInitialExecutionControlState();
const defaultSetup = createInitialSetupState();
const defaultNotifications = createEmptyNotificationInboxState();

function createConnectedState(project?: WorkspaceProjectState) {
  return reduceServerEvent(createInitialViewState(), {
    type: "connection.ready",
    payload: {
      agents: [{ id: "pi", label: "Pi" }],
      workspace: {
        projects: project ? [project] : [],
        activeProjectId: project?.id
      },
      preferences: defaultPreferences,
      setup: defaultSetup,
      backgroundJobs: createEmptyBackgroundJobsState(),
      assistants: createEmptyAssistantsState(),
      notifications: defaultNotifications,
      executionControl: defaultExecutionControl
    }
  });
}

function createProject() {
  return createWorkspaceProjectState({
    id: createProjectId(),
    name: "repo-one",
    rootPath: "C:\\repo-one"
  });
}

function clearBrowserUiSessionStorage() {
  globalThis.localStorage?.removeItem(BROWSER_UI_SESSION_STORAGE_KEY);
}

describe("harness store reducer", () => {
  test("browser trace session override beats default trace preference on ready", () => {
    clearBrowserUiSessionStorage();
    persistBrowserUiSession({ tracePanelOpen: false });

    const store = createHarnessStore();
    store.actions.hydrateBrowserUiSession();
    store.applyServerEvent({
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [],
          activeProjectId: undefined
        },
        preferences: {
          ...defaultPreferences,
          tracePanelDefaultOpen: true
        },
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });

    expect(store.state.tracePanelOpen).toBe(false);
    expect(store.state.hasPersistedTracePanelOpen).toBe(true);
  });

  test("repairs invalid browser ui session selections during hydrate", () => {
    clearBrowserUiSessionStorage();
    globalThis.localStorage?.setItem(
      BROWSER_UI_SESSION_STORAGE_KEY,
      JSON.stringify({
        selectedModeId: "missing-mode"
      })
    );

    const store = createHarnessStore();
    store.actions.hydrateBrowserUiSession();

    expect(store.state.selectedModeId).toBe("implement");
    expect(store.state.hasGlobalSelectedModeId).toBe(true);
    expect(readBrowserUiSession().selectedModeId).toBe("implement");
  });

  test("explicit global mode override beats later project mode updates", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();
    const project = createProject();

    store.applyServerEvent({
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [
            {
              ...project,
              selectedModeId: "debug"
            }
          ],
          activeProjectId: project.id
        },
        preferences: defaultPreferences,
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });

    store.setSelectedModeId("plan");
    store.applyServerEvent({
      type: "project.updated",
      requestId: "req-project-updated",
      payload: {
        projectId: project.id,
        project: {
          ...project,
          selectedModeId: "review"
        }
      }
    });

    expect(getActiveMode(store.state)?.id).toBe("plan");
    expect(readBrowserUiSession()).toEqual({
      selectedModeId: "plan",
      lastActiveProjectId: project.id,
      lastActiveThreadByProjectId: {
        [project.id]: project.activeThreadId
      }
    });
  });

  test("codex runtime model options use runtime-compatible list", () => {
    const state = reduceServerEvent(createInitialViewState(), {
      type: "connection.ready",
      payload: {
        agents: [
          { id: "pi", label: "Pi" },
          { id: "codex-cli", label: "Codex CLI" }
        ],
        workspace: {
          projects: [],
          activeProjectId: undefined
        },
        preferences: {
          ...defaultPreferences,
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
              discoveredModels: ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
              activeModel: "openai/gpt-5.4",
              modelDiscoveryConfidence: "partial"
            }
          ]
        },
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });

    expect(getExecutionModelOptionsForAgent(state, "codex-cli", "gpt")).toEqual([
      { modelId: "openai/gpt-5.4", label: "GPT-5.4" },
      { modelId: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" }
    ]);
    expect(getFallbackExecutionModelIdForAgent(state, "codex-cli", "gpt")).toBe("openai/gpt-5.4");
  });

  test("persists composer reasoning and fast mode selections in browser ui session", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();

    store.setSelectedReasoningStrength("medium");
    store.setSelectedFastMode(true);

    expect(readBrowserUiSession()).toMatchObject({
      selectedReasoningStrength: "medium",
      selectedFastMode: true
    });
  });

  test("coerces unsupported composer controls for current model and runtime", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();
    const project = createProject();

    store.applyServerEvent({
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [project],
          activeProjectId: project.id
        },
        preferences: {
          ...defaultPreferences,
          agentRuntimes: [
            {
              agentId: "pi",
              label: "Pi",
              runtimeKind: "sdk",
              installed: true,
              authenticated: true,
              interactivePipeCompatible: false,
              supportsInteractive: false,
              supportsProgrammatic: true,
              supportsPlanning: true,
              supportsReview: true,
              supportsReasoningStrengthControl: true,
              supportsFastModeControl: true,
              discoveredModels: [],
              modelDiscoveryConfidence: "unknown"
            }
          ]
        },
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });
    store.setSelectedAgentId("pi");
    store.setProviderBrand("gemini");
    store.setSelectedExecutionModelId("google/gemini-2.5-flash");
    store.setSelectedReasoningStrength("extra-high");
    store.setSelectedFastMode(true);

    expect(store.state.selectedReasoningStrength).toBe("high");
    expect(store.state.selectedFastMode).toBe(false);
    expect(getComposerControlState(store.state, "pi", "google/gemini-2.5-flash")).toEqual({
      availableStrengths: ["low", "medium", "high"],
      supportsFastMode: false,
      selectedReasoningStrength: "high",
      selectedFastMode: false
    });
  });

  test("persists active project and per-project last thread after thread activation", () => {
    clearBrowserUiSessionStorage();
    const project = createWorkspaceProjectState({
      id: createProjectId(),
      name: "repo-one",
      rootPath: "C:\\repo-one",
      activeThreadId: "thread-1",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: "thread-2",
          title: "Thread 2",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ]
    });
    const store = createHarnessStore();

    store.applyServerEvent({
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [project],
          activeProjectId: project.id
        },
        preferences: defaultPreferences,
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });
    store.applyServerEvent({
      type: "thread.activated",
      requestId: "req-thread-activated",
      payload: {
        projectId: project.id,
        project: {
          ...project,
          activeThreadId: "thread-2"
        }
      }
    });

    expect(readBrowserUiSession()).toEqual({
      lastActiveProjectId: project.id,
      lastActiveThreadByProjectId: {
        [project.id]: "thread-2"
      }
    });
  });

  test("builds restore commands for saved project and thread on reopen", () => {
    const projectA = createWorkspaceProjectState({
      id: "project-a",
      name: "repo-a",
      rootPath: "C:\\repo-a",
      activeThreadId: "thread-a-1",
      threads: [
        createProjectThreadSummary({
          id: "thread-a-1",
          title: "A1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ]
    });
    const projectB = createWorkspaceProjectState({
      id: "project-b",
      name: "repo-b",
      rootPath: "C:\\repo-b",
      activeThreadId: "thread-b-1",
      threads: [
        createProjectThreadSummary({
          id: "thread-b-1",
          title: "B1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: "thread-b-2",
          title: "B2",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ]
    });
    const state = reduceServerEvent(createInitialViewState(), {
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [projectA, projectB],
          activeProjectId: projectA.id
        },
        preferences: defaultPreferences,
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });

    const commands = getBrowserUiSessionRestoreCommands(state, {
      lastActiveProjectId: projectB.id,
      lastActiveThreadByProjectId: {
        [projectB.id]: "thread-b-2"
      }
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]?.type).toBe("project.activate");
    expect(commands[1]?.type).toBe("thread.activate");
    if (commands[0]?.type !== "project.activate" || commands[1]?.type !== "thread.activate") {
      throw new Error("Expected restore commands to activate saved project and thread.");
    }
    expect(commands[0].payload).toEqual({
      projectId: projectB.id
    });
    expect(commands[1].payload).toEqual({
      projectId: projectB.id,
      threadId: "thread-b-2"
    });
  });

  test("starts with empty workspace", () => {
    const initialState = createInitialViewState();

    expect(initialState.workspace.projects).toHaveLength(0);
    expect(initialState.workspace.activeProjectId).toBeUndefined();
  });

  test("hydrates and updates background jobs state", () => {
    const connectedState = createConnectedState();
    const queuedState = reduceServerEvent(connectedState, {
      type: "background-jobs.updated",
      requestId: "bg-1",
      payload: {
        backgroundJobs: {
          jobs: [
            {
              id: "job-1",
              projectId: "project-1",
              automationThreadId: "thread-auto-1",
              kind: "ai-routine",
              name: "Nightly review",
              status: "enabled",
              riskLevel: "unsafe",
              definition: {
                kind: "ai-routine",
                prompt: "Review repo"
              },
              schedule: {
                type: "interval",
                intervalSeconds: 3600,
                nextRunAt: "2026-04-16T13:00:00.000Z",
                sourceText: "1h"
              },
              scheduleInput: "1h",
              nextRunAt: "2026-04-16T13:00:00.000Z",
              createdAt: "2026-04-16T12:00:00.000Z",
              updatedAt: "2026-04-16T12:00:00.000Z"
            }
          ],
          runs: [],
          templates: []
        }
      }
    });

    const nextState = reduceServerEvent(queuedState, {
      type: "background-job-run.updated",
      requestId: "bg-2",
      payload: {
        run: {
          id: "run-1",
          jobId: "job-1",
          projectId: "project-1",
          automationThreadId: "thread-auto-1",
          triggerSource: "schedule",
          status: "failed",
          riskLevel: "unsafe",
          approvalStatus: "approved",
          skippedOccurrenceCount: 0,
          summary: "Review failed",
          failureMessage: "Planner needed clarification",
          queuedAt: "2026-04-16T12:00:00.000Z",
          startedAt: "2026-04-16T12:00:10.000Z",
          completedAt: "2026-04-16T12:00:20.000Z",
          createdAt: "2026-04-16T12:00:00.000Z",
          updatedAt: "2026-04-16T12:00:20.000Z",
          events: []
        }
      }
    });

    expect(nextState.backgroundJobs.jobs[0]?.name).toBe("Nightly review");
    expect(nextState.backgroundJobs.runs[0]?.status).toBe("failed");
    expect(nextState.backgroundJobs.runs[0]?.failureMessage).toContain("clarification");
  });

  test("hydrates assistant state and routes assistant events into inspector state", () => {
    const project = createProject();
    const connectedState = createConnectedState(project);
    const assistantId = "assistant-1";

    const hydratedState = reduceServerEvent(connectedState, {
      type: "assistants.updated",
      requestId: "assistant-1",
      payload: {
        assistants: {
          assistants: [
            {
              id: assistantId,
              name: "Mr Miyagi",
              scope: "project",
              projectId: project.id,
              description: "Karate mentor",
              personalityPrompt: "Patient, direct, calm.",
              jobPrompt: "Teach fundamentals first.",
              agentId: "pi",
              modeId: undefined,
              executionModelId: undefined,
              runState: "active",
              bootstrapState: "completed",
              clonedFromAssistantId: undefined,
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              circuitBreakerReason: undefined,
              deletedAt: undefined,
              latestActivityAt: new Date().toISOString(),
              unreadQuestionCount: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          threads: [],
          todos: [],
          learnings: [],
          questions: [],
          logs: [],
          assetRefs: []
        }
      }
    });

    const withCreatedCard = reduceServerEvent(hydratedState, {
      type: "assistant.created-card",
      requestId: "assistant-2",
      payload: {
        assistant: hydratedState.assistants.assistants[0]!
      }
    });
    const withDelta = reduceServerEvent(withCreatedCard, {
      type: "assistant.chat.delta",
      requestId: "assistant-3",
      payload: {
        assistantId,
        sessionId: "session-1",
        delta: "wax on"
      }
    });
    const withQuestion = reduceServerEvent(withDelta, {
      type: "assistant.question.updated",
      requestId: "assistant-4",
      payload: {
        question: {
          id: "question-1",
          assistantId,
          prompt: "Kata or sparring?",
          status: "pending",
          linkedTodoIds: [],
          askedAt: new Date().toISOString()
        }
      }
    });

    expect(withCreatedCard.activeSurface).toBe("assistants");
    expect(withCreatedCard.assistants.selectedAssistantId).toBe(assistantId);
    expect(withDelta.assistants.streamingByAssistantId[assistantId]).toBe("wax on");
    expect(withQuestion.assistants.questions[0]?.prompt).toContain("Kata");
  });

  test("records plans and traces on active project without polluting messages", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const sessionId = initialProject.session.sessionId;

    const nextState = reduceServerEvent(initialState, {
      type: "agent.plan",
      requestId: "req-1",
      payload: {
        projectId,
        threadId,
        plan: {
          sessionId,
          agentId: "pi",
          planningModelId: "openai/gpt-5.4",
          difficultyScore: 72,
          usesSubagents: true,
          executionModelId: "openai/gpt-5.4",
          subtaskCount: 2
        }
      }
    });

    const tracedState = reduceServerEvent(nextState, {
      type: "agent.trace",
      requestId: "req-1",
      payload: {
        projectId,
        threadId,
        trace: {
          sessionId,
          stage: "subagent-start",
          message: "Starting scout",
          subagentId: "task-1",
          modelId: "openai/gpt-5.4-nano"
        }
      }
    });

    const project = tracedState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.latestPlan?.difficultyScore).toBe(72);
    expect(project?.traces).toHaveLength(1);
    expect(project?.session.messages).toHaveLength(0);
  });

  test("clears traces and plan on session reset", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const stateWithTrace = reduceServerEvent(initialState, {
      type: "agent.trace",
      requestId: "req-2",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
        trace: {
          sessionId: initialProject.session.sessionId,
          stage: "planning",
          message: "Planning"
        }
      }
    });

    const resetState = reduceServerEvent(stateWithTrace, {
      type: "session.reset",
      requestId: "req-3",
      payload: {
        projectId,
        threadId: "thread-2",
        sessionId: "thread-2",
        state: createEmptySession("thread-2")
      }
    });

    const project = resetState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.traces).toHaveLength(0);
    expect(project?.latestPlan).toBeUndefined();
    expect(project?.activeThreadId).toBe("thread-2");
  });

  test("stores streaming deltas until completion for matching project", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const deltaState = reduceServerEvent(initialState, {
      type: "chat.delta",
      requestId: "req-4",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        delta: "hello"
      }
    });

    const completeEvent: ServerEvent = {
      type: "chat.complete",
      requestId: "req-4",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        assistantMessage: {
          id: "assistant-1",
          role: "assistant",
          content: "hello world",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              content: "hello world",
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    };

    const completeState = reduceServerEvent(deltaState, completeEvent);
    const beforeProject = deltaState.workspace.projects.find((entry) => entry.id === projectId);
    const afterProject = completeState.workspace.projects.find((entry) => entry.id === projectId);

    expect(beforeProject?.streamingAssistantText).toBe("hello");
    expect(afterProject?.streamingAssistantText).toBe("");
  });

  test("appends chat messages without waiting for completion", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const nextState = reduceServerEvent(initialState, {
      type: "chat.message-appended",
      requestId: "req-append",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "user-1",
          role: "user",
          content: "hello planner",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "user-1",
              role: "user",
              content: "hello planner",
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    });

    const project = nextState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.session.messages).toHaveLength(1);
    expect(project?.session.messages[0]?.content).toBe("hello planner");
  });

  test("uses appended session streaming state instead of stale local streaming state", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const streamingState = reduceServerEvent(initialState, {
      type: "chat.delta",
      requestId: "req-streaming",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        delta: "hello"
      }
    });

    const nextState = reduceServerEvent(streamingState, {
      type: "chat.message-appended",
      requestId: "req-streaming-stop",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "assistant-plan",
          role: "assistant",
          kind: "plan-summary",
          content: "Plan ready",
          metadata: {
            type: "plan-summary",
            runId: "run-1",
            plan: {
              runId: "run-1",
              origin: "initial",
              iteration: 1,
              summary: "Plan ready",
              finalExecutionBrief: "Do work",
              difficultyScore: 20,
              planningModelId: "openai/gpt-5.4",
              executionModelId: "openai/gpt-5.4",
              route: "main",
              subagentWorktreeStrategy: "same-worktree",
              targetSubagentCount: 0,
              actualSubagentCount: 0,
              gating: {
                mode: "approve",
                delaySeconds: 0
              },
              prerequisites: [],
              contracts: [],
              correctnessPolicy: "ask-before-iterate"
            }
          },
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "assistant-plan",
              role: "assistant",
              kind: "plan-summary",
              content: "Plan ready",
              metadata: {
                type: "plan-summary",
                runId: "run-1",
                plan: {
                  runId: "run-1",
                  origin: "initial",
                  iteration: 1,
                  summary: "Plan ready",
                  finalExecutionBrief: "Do work",
                  difficultyScore: 20,
                  planningModelId: "openai/gpt-5.4",
                  executionModelId: "openai/gpt-5.4",
                  route: "main",
                  subagentWorktreeStrategy: "same-worktree",
                  targetSubagentCount: 0,
                  actualSubagentCount: 0,
                  gating: {
                    mode: "approve",
                    delaySeconds: 0
                  },
                  prerequisites: [],
                  contracts: [],
                  correctnessPolicy: "ask-before-iterate"
                }
              },
              createdAt: new Date().toISOString()
            }
          ],
          isStreaming: false
        }
      }
    });

    expect(streamingState.workspace.projects[0]?.session.isStreaming).toBe(true);
    expect(nextState.workspace.projects[0]?.session.isStreaming).toBe(false);
  });

  test("stores persisted system status messages inline with chat history", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const nextState = reduceServerEvent(initialState, {
      type: "chat.message-appended",
      requestId: "req-status",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "system-1",
          role: "system",
          content: "Planning task.",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "system-1",
              role: "system",
              content: "Planning task.",
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    });

    const project = nextState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.session.messages).toHaveLength(1);
    expect(project?.session.messages[0]?.role).toBe("system");
    expect(project?.session.messages[0]?.content).toBe("Planning task.");
  });

  test("hydrates active run and clears it", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const stateWithRun = reduceServerEvent(initialState, {
      type: "run.updated",
      requestId: "req-run",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-1",
          threadId,
          status: "partial-complete",
          latestUserPrompt: "complex task",
          executionModelId: "openai/gpt-5.4",
          difficultyScore: 72,
          summary: "Split work",
          finalExecutionBrief: "Combine outputs",
          questions: [],
          subtasks: [
            {
              id: "task-1",
              title: "Inspect",
              instruction: "Inspect files",
              status: "completed",
              attemptCount: 1,
              output: "done",
              updatedAt: new Date().toISOString()
            },
            {
              id: "task-2",
              title: "Patch",
              instruction: "Patch code",
              status: "failed",
              attemptCount: 2,
              errorMessage: "timeout",
              updatedAt: new Date().toISOString()
            }
          ],
          resumable: true,
          retryable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });

    const clearedState = reduceServerEvent(stateWithRun, {
      type: "run.cleared",
      requestId: "req-run-clear",
      payload: {
        projectId,
        threadId,
        runId: "run-1"
      }
    });

    expect(stateWithRun.workspace.projects[0]?.activeRun?.status).toBe("partial-complete");
    expect(clearedState.workspace.projects[0]?.activeRun).toBeUndefined();
  });

  test("stores completed runs as lastRun but clears activeRun", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const nextState = reduceServerEvent(initialState, {
      type: "run.updated",
      requestId: "req-run-complete",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-complete",
          threadId,
          status: "completed",
          latestUserPrompt: "simple task",
          executionModelId: "openai/gpt-5.4",
          questions: [],
          subtasks: [],
          resumable: false,
          retryable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      }
    });

    expect(nextState.workspace.projects[0]?.activeRun).toBeUndefined();
    expect(nextState.workspace.projects[0]?.lastRun?.id).toBe("run-complete");
  });

  test("clears transient planning state when a new run starts after a completed run", () => {
    const initialProject = createProject();
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const stateWithCompletedRun = reduceServerEvent(
      reduceServerEvent(
        reduceServerEvent(initialStateWithPlan(initialProject), {
          type: "agent.trace",
          requestId: "req-trace-old",
          payload: {
            projectId,
            threadId,
            trace: {
              sessionId: threadId,
              stage: "plan-presented",
              message: "Presented plan"
            }
          }
        }),
        {
          type: "project.context",
          requestId: "req-context-old",
          payload: {
            projectId,
            threadId,
            contextUsage: {
              sourceKind: "planner",
              sourceLabel: "planner",
              modelId: "openai/gpt-5.4",
              tokens: 100,
              contextWindow: 200000,
              usagePercent: 0.1,
              updatedAt: new Date().toISOString()
            }
          }
        }
      ),
      {
        type: "run.updated",
        requestId: "req-run-old",
        payload: {
          projectId,
          threadId,
          run: {
            id: "run-old",
            threadId,
            status: "completed",
            latestUserPrompt: "old task",
            executionModelId: "openai/gpt-5.4",
            questions: [],
            subtasks: [],
            resumable: false,
            retryable: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
          }
        }
      }
    );

    const nextState = reduceServerEvent(stateWithCompletedRun, {
      type: "run.updated",
      requestId: "req-run-new",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-new",
          threadId,
          status: "planning",
          latestUserPrompt: "new task",
          questions: [],
          subtasks: [],
          resumable: false,
          retryable: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });

    expect(stateWithCompletedRun.workspace.projects[0]?.traces.length).toBe(1);
    expect(nextState.workspace.projects[0]?.traces.length).toBe(0);
    expect(nextState.workspace.projects[0]?.latestPlan).toBeUndefined();
    expect(nextState.workspace.projects[0]?.contextUsage).toBeUndefined();
  });

  test("closes selected execution plan on session reset and new planning runs", () => {
    const initialProject = createProject();
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const seededRunState = reduceServerEvent(initialStateWithPlan(initialProject), {
      type: "run.updated",
      requestId: "req-existing-run",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-1",
          threadId,
          status: "completed",
          latestUserPrompt: "existing task",
          questions: [],
          subtasks: [],
          resumable: false,
          retryable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      }
    });
    const selectedExecutionPlan: ExecutionPlan = {
      runId: "run-1",
      origin: "initial",
      iteration: 1,
      summary: "Plan",
      finalExecutionBrief: "Do work",
      difficultyScore: 20,
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      route: "main",
      subagentWorktreeStrategy: "same-worktree",
      targetSubagentCount: 0,
      actualSubagentCount: 0,
      gating: {
        mode: "approve",
        delaySeconds: 0
      },
      prerequisites: [],
      contracts: [],
      correctnessPolicy: "ask-before-iterate"
    };

    const stateWithDialog = {
      ...seededRunState,
      executionPlanDialogOpen: true,
      selectedExecutionPlan
    };

    const resetState = reduceServerEvent(stateWithDialog, {
      type: "session.reset",
      requestId: "req-reset-dialog",
      payload: {
        projectId,
        threadId: "thread-2",
        sessionId: "thread-2",
        state: createEmptySession("thread-2")
      }
    });
    const planningState = reduceServerEvent(stateWithDialog, {
      type: "run.updated",
      requestId: "req-planning-dialog",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-2",
          threadId,
          status: "planning",
          latestUserPrompt: "new task",
          questions: [],
          subtasks: [],
          resumable: false,
          retryable: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });

    expect(resetState.executionPlanDialogOpen).toBe(false);
    expect(resetState.selectedExecutionPlan).toBeUndefined();
    expect(planningState.executionPlanDialogOpen).toBe(false);
    expect(planningState.selectedExecutionPlan).toBeUndefined();
  });

  test("stores transient preflight warning by project", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const nextState = reduceServerEvent(initialState, {
      type: "run.preflight",
      requestId: "req-preflight",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
        preflight: {
          severity: "warning",
          kind: "git-dirty",
          message: "Git dirty. 5 files changed. Run anyway.",
          changedFileCount: 5
        }
      }
    });

    expect(nextState.projectPreflights[projectId]?.preflight.changedFileCount).toBe(5);
  });

  test("stores project context usage snapshots", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const nextState = reduceServerEvent(initialState, {
      type: "project.context",
      requestId: "req-context",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
        contextUsage: {
          sourceKind: "planner",
          sourceLabel: "planner",
          modelId: "openai/gpt-5.4",
          tokens: 1234,
          contextWindow: 200000,
          usagePercent: 0.7,
          updatedAt: new Date().toISOString()
        }
      }
    });

    expect(nextState.workspace.projects[0]?.contextUsage?.tokens).toBe(1234);
    expect(nextState.workspace.projects[0]?.contextUsage?.sourceKind).toBe("planner");
  });

  test("opens project and activates it", () => {
    const initialState = createInitialViewState();
    const project = createProject();

    const nextState = reduceServerEvent(initialState, {
      type: "project.opened",
      requestId: "req-5",
      payload: {
        project,
        activeProjectId: project.id,
        resolution: "created-project"
      }
    });

    expect(nextState.workspace.activeProjectId).toBe(project.id);
    expect(nextState.workspace.projects.some((entry) => entry.id === project.id)).toBe(true);
  });

  test("stores fresh project search results and ignores stale ones", () => {
    const results: ProjectSearchResult[] = [
      {
        id: "C:\\repo-one",
        name: "repo-one",
        rootPath: "C:\\repo-one",
        repoKind: "git-repo",
        matchKind: "name-prefix"
      }
    ];
    const seededState = {
      ...createInitialViewState(),
      projectSwitcherOpen: true,
      projectSearchQuery: "repo",
      projectSearchLoading: true,
      projectSearchPendingRequestId: "req-search"
    };

    const staleState = reduceServerEvent(seededState, {
      type: "project.search.results",
      requestId: "req-stale",
      payload: {
        query: "repo",
        results
      }
    });
    const nextState = reduceServerEvent(seededState, {
      type: "project.search.results",
      requestId: "req-search",
      payload: {
        query: "repo",
        results
      }
    });

    expect(staleState.projectSearchFilesystemResults).toHaveLength(0);
    expect(nextState.projectSearchFilesystemResults).toHaveLength(1);
    expect(nextState.projectSearchLoading).toBe(false);
    expect(nextState.projectSearchPendingRequestId).toBeUndefined();
  });

  test("removes last project and leaves empty workspace", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);

    const nextState = reduceServerEvent(initialState, {
      type: "project.removed",
      requestId: "req-remove",
      payload: {
        projectId: initialProject.id,
        activeProjectId: undefined
      }
    });

    expect(nextState.workspace.projects).toHaveLength(0);
    expect(nextState.workspace.activeProjectId).toBeUndefined();
  });

  test("opens and closes project switcher transient state", () => {
    const store = createHarnessStore();
    store.openProjectSwitcher("repo");

    expect(store.state.projectSwitcherOpen).toBe(true);
    expect(store.state.projectSearchQuery).toBe("repo");

    store.startProjectSearch("req-search", "repo");
    expect(store.state.projectSearchLoading).toBe(true);
    expect(store.state.projectSearchPendingRequestId).toBe("req-search");

    store.closeProjectSwitcher();
    expect(store.state.projectSwitcherOpen).toBe(false);
    expect(store.state.projectSearchQuery).toBe("");
    expect(store.state.projectSearchFilesystemResults).toHaveLength(0);
  });

  test("applies server preference payload on connection ready", () => {
    const nextState = reduceServerEvent(createInitialViewState(), {
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [],
          activeProjectId: undefined
        },
        preferences: {
          hasUsableApiKey: true,
          hasStoredApiKey: true,
          hasUsableOpenAiApiKey: false,
          hasStoredOpenAiApiKey: false,
          hasUsableGoogleApiKey: true,
          hasStoredGoogleApiKey: true,
          providerBrand: "gemini",
          debugEnabledDefault: true,
          tracePanelDefaultOpen: false,
          subagentWorktreeStrategyDefault: "same-worktree",
          blockChatOnDirtyGitDefault: false,
          dirtyGitChangeLimitDefault: 6,
          autoCompactContextThresholdPercentDefault: 44,
          planExecutionModeDefault: "countdown",
          planExecutionDelaySecondsDefault: 10,
          correctnessIterationModeDefault: "ask-before-iterate",
          backgroundJobApprovalPolicyDefault: "ask-risky",
          memoryBankEnabledDefault: true,
          attachmentsEnabled: true,
          capabilities: [...defaultProviderCapabilities],
          agentRuntimes: []
        },
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: {
          ...defaultExecutionControl,
          isPaused: true,
          deferredPlanningQuestionCount: 2
        }
      }
    });

    expect(nextState.hasUsableApiKey).toBe(true);
    expect(nextState.hasStoredApiKey).toBe(true);
    expect(nextState.hasUsableGoogleApiKey).toBe(true);
    expect(nextState.providerBrand).toBe("gemini");
    expect(nextState.debugEnabled).toBe(true);
    expect(nextState.tracePanelOpen).toBe(false);
    expect(nextState.blockChatOnDirtyGitDefault).toBe(false);
    expect(nextState.dirtyGitChangeLimitDefault).toBe(6);
    expect(nextState.autoCompactContextThresholdPercentDefault).toBe(44);
    expect(nextState.executionControl.isPaused).toBe(true);
    expect(nextState.executionControl.deferredPlanningQuestionCount).toBe(2);
  });

  test("uses server trace preference and capabilities on connection ready", () => {
    const nextState = reduceServerEvent(createInitialViewState(), {
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [],
          activeProjectId: undefined,
          workspaceModes: [],
          workspaceRuleSource: undefined,
          workspaceMemorySummary: undefined
        },
        preferences: {
          ...defaultPreferences,
          attachmentsEnabled: true,
          capabilities: [
            {
              providerBrand: "gpt",
              label: "OpenAI",
              defaultPlanningModelId: "openai/gpt-5.4",
              defaultExecutionModelId: "openai/gpt-5.4",
              defaultSubagentModelId: "openai/gpt-5.4-mini",
              models: [
                {
                  modelId: "openai/gpt-5.4",
                  providerBrand: "gpt",
                  label: "GPT 5.4",
                  tags: ["tools", "long-context", "fast"],
                  contextWindow: 256000,
                  summary: "Primary model."
                }
              ]
            }
          ]
        },
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });

    expect(nextState.tracePanelOpen).toBe(true);
    expect(nextState.capabilities[0]?.models[0]?.tags).toEqual(["tools", "long-context", "fast"]);
  });

  test("updates execution control from websocket events", () => {
    const nextState = reduceServerEvent(createConnectedState(), {
      type: "execution-control.updated",
      requestId: "req-execution-control",
      payload: {
        executionControl: {
          isPaused: true,
          deferredPlanningQuestionCount: 1,
          deferredAssistantQuestionCount: 2,
          deferredBrowserApprovalCount: 3
        }
      }
    });

    expect(nextState.executionControl.isPaused).toBe(true);
    expect(nextState.executionControl.deferredAssistantQuestionCount).toBe(2);
    expect(nextState.executionControl.deferredBrowserApprovalCount).toBe(3);
  });

  test("updates setup state from websocket events", () => {
    const nextState = reduceServerEvent(createConnectedState(), {
      type: "setup.updated",
      requestId: "req-setup",
      payload: {
        setup: {
          launchMode: "portable-launcher",
          updatedAt: new Date().toISOString(),
          readyRequiredCount: 2,
          totalRequiredCount: 4,
          checks: [
            {
              id: "project-selected",
              title: "Project selected",
              summary: "Repo ready",
              status: "ready",
              requiredForFirstTask: true,
              updatedAt: new Date().toISOString()
            }
          ]
        }
      }
    });

    expect(nextState.setup.launchMode).toBe("portable-launcher");
    expect(nextState.setup.readyRequiredCount).toBe(2);
    expect(nextState.setup.checks[0]?.id).toBe("project-selected");
  });

  test("updates usable key state from preferences events", () => {
    const nextState = reduceServerEvent(createInitialViewState(), {
      type: "preferences.saved",
      requestId: "req-6",
      payload: {
        hasUsableApiKey: true,
        hasStoredApiKey: true,
        hasUsableOpenAiApiKey: true,
        hasStoredOpenAiApiKey: true,
        hasUsableGoogleApiKey: false,
        hasStoredGoogleApiKey: false,
        providerBrand: "gpt",
        debugEnabledDefault: false,
        tracePanelDefaultOpen: true,
        subagentWorktreeStrategyDefault: "same-worktree",
        blockChatOnDirtyGitDefault: true,
        dirtyGitChangeLimitDefault: 20,
        autoCompactContextThresholdPercentDefault: 40,
        planExecutionModeDefault: "countdown",
        planExecutionDelaySecondsDefault: 10,
        correctnessIterationModeDefault: "ask-before-iterate",
        backgroundJobApprovalPolicyDefault: "ask-risky",
        memoryBankEnabledDefault: true,
        attachmentsEnabled: true,
        capabilities: [...defaultProviderCapabilities],
        agentRuntimes: [],
        setup: defaultSetup
      }
    });

    expect(nextState.hasUsableApiKey).toBe(true);
    expect(nextState.hasStoredApiKey).toBe(true);
    expect(nextState.hasUsableOpenAiApiKey).toBe(true);
    expect(nextState.blockChatOnDirtyGitDefault).toBe(true);
    expect(nextState.dirtyGitChangeLimitDefault).toBe(20);
    expect(nextState.autoCompactContextThresholdPercentDefault).toBe(40);
  });

  test("merges workspace and project context updates into active mode resolution", () => {
    const project = createProject();
    const connectedState = createConnectedState(project);

    const workspaceUpdated = reduceServerEvent(connectedState, {
      type: "workspace.updated",
      requestId: "req-workspace-updated",
      payload: {
        workspace: {
          ...connectedState.workspace,
          workspaceModes: [
            {
              id: "ship-fast",
              scope: "workspace",
              label: "Ship Fast",
              description: "Direct delivery mode.",
              plannerPrompt: "Bias toward direct implementation.",
              executionPrompt: "Implement smallest safe change.",
              toolPolicy: "full-access",
              executionAccess: "workspace-write",
              updatedAt: new Date().toISOString()
            }
          ],
          workspaceRuleSource: {
            id: "workspace-rules",
            scope: "workspace",
            label: "Workspace Rules",
            content: "Keep updates concise.",
            updatedAt: new Date().toISOString()
          },
          workspaceMemorySummary: {
            id: "workspace-memory",
            scope: "workspace",
            label: "Workspace Memory",
            content: "User cares about fast iteration.",
            updatedAt: new Date().toISOString(),
            source: "user"
          }
        }
      }
    });

    const projectUpdated = reduceServerEvent(workspaceUpdated, {
      type: "project.updated",
      requestId: "req-project-updated",
      payload: {
        projectId: project.id,
        project: {
          ...workspaceUpdated.workspace.projects[0]!,
          selectedModeId: "focus-fix",
          projectModes: [
            {
              id: "focus-fix",
              scope: "project",
              label: "Focus Fix",
              description: "Small targeted repair mode.",
              plannerPrompt: "Keep scope narrow.",
              executionPrompt: "Touch smallest safe slice.",
              toolPolicy: "read-heavy",
              executionAccess: "workspace-write",
              updatedAt: new Date().toISOString()
            }
          ],
          projectRuleSource: {
            id: "project-rules",
            scope: "project",
            label: "Project Rules",
            content: "Stay inside selected package.",
            updatedAt: new Date().toISOString()
          },
          threadMemorySummary: {
            id: "thread-memory",
            scope: "thread",
            label: "Thread Memory",
            content: "Current work is planner bugfix.",
            updatedAt: new Date().toISOString(),
            source: "generated"
          }
        }
      }
    });

    expect(projectUpdated.workspace.workspaceRuleSource?.content).toBe("Keep updates concise.");
    expect(projectUpdated.workspace.workspaceMemorySummary?.content).toBe("User cares about fast iteration.");
    expect(projectUpdated.workspace.projects[0]?.projectRuleSource?.content).toBe("Stay inside selected package.");
    expect(projectUpdated.workspace.projects[0]?.threadMemorySummary?.content).toBe("Current work is planner bugfix.");
    expect(getResolvedModes(projectUpdated).map((mode) => mode.id)).toContain("ship-fast");
    expect(getResolvedModes(projectUpdated).map((mode) => mode.id)).toContain("focus-fix");
    expect(getActiveMode(projectUpdated)?.id).toBe("focus-fix");
  });
});

function initialStateWithPlan(project: WorkspaceProjectState) {
  return reduceServerEvent(createConnectedState(project), {
    type: "agent.plan",
    requestId: "req-plan-seed",
    payload: {
      projectId: project.id,
      threadId: project.activeThreadId,
      plan: {
        sessionId: project.session.sessionId,
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 20,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: {
          runId: "run-1",
          origin: "initial",
          iteration: 1,
          summary: "Plan",
          finalExecutionBrief: "Do work",
          difficultyScore: 20,
          planningModelId: "openai/gpt-5.4",
          executionModelId: "openai/gpt-5.4",
          route: "main",
          subagentWorktreeStrategy: "same-worktree",
          targetSubagentCount: 0,
          actualSubagentCount: 0,
          gating: {
            mode: "approve",
            delaySeconds: 0
          },
          prerequisites: [],
          contracts: [],
          correctnessPolicy: "ask-before-iterate"
        }
      }
    }
  });
}
