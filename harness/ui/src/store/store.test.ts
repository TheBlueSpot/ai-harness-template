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
  COMPOSER_FAST_MODE_STORAGE_KEY,
  COMPOSER_REASONING_STRENGTH_STORAGE_KEY,
  PREFERENCES_ACTIVE_SECTION_STORAGE_KEY,
  PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY,
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
  getVisibleAssistants,
  getResolvedModes,
  persistBrowserUiSession,
  persistMergedLocalPreferences,
  readLocalPreferences,
  readBrowserUiSession,
  readProjectSidebarPreferences,
  reduceServerEvent
} from "../harness-store";

const defaultPreferences: PreferencesState = {
  hasUsableApiKey: false,
  hasStoredApiKey: false,
  hasUsableOpenAiApiKey: false,
  hasStoredOpenAiApiKey: false,
  hasUsableGoogleApiKey: false,
  hasStoredGoogleApiKey: false,
  hasUsableAnthropicApiKey: false,
  hasStoredAnthropicApiKey: false,
  providerBrand: "gpt",
  debugEnabledDefault: false,
  tracePanelDefaultOpen: true,
  subagentWorktreeStrategyDefault: "same-worktree",
  blockChatOnDirtyGitDefault: true,
  dirtyGitChangeLimitDefault: 20,
  autoCompactContextThresholdPercentDefault: 40,
  planExecutionModeDefault: "countdown",
  planExecutionDelaySecondsDefault: 10,
  singleAgentModelPreferenceDefault: "intelligence",
  subagentModelPreferenceDefault: "inference",
  correctnessIterationModeDefault: "ask-before-iterate",
  backgroundJobApprovalPolicyDefault: "ask-risky",
  memoryBankEnabledDefault: true,
  memoryBankRecordRunsDefault: true,
  checkCliUpdatesDefault: true,
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
  globalThis.localStorage?.removeItem(COMPOSER_REASONING_STRENGTH_STORAGE_KEY);
  globalThis.localStorage?.removeItem(COMPOSER_FAST_MODE_STORAGE_KEY);
  globalThis.localStorage?.removeItem(PREFERENCES_ACTIVE_SECTION_STORAGE_KEY);
  globalThis.localStorage?.removeItem(PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY);
}

describe("harness store reducer", () => {
  test("browser trace session override beats default trace preference on ready", () => {
    clearBrowserUiSessionStorage();
    persistBrowserUiSession({ tracePanelMode: "closed" });

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
    expect(store.state.tracePanelMode).toBe("closed");
    expect(store.state.hasPersistedTracePanelOpen).toBe(true);
  });

  test("migrates legacy trace panel boolean session state to trace mode", () => {
    clearBrowserUiSessionStorage();
    globalThis.localStorage?.setItem(BROWSER_UI_SESSION_STORAGE_KEY, JSON.stringify({ tracePanelOpen: false }));

    const store = createHarnessStore();
    store.actions.hydrateBrowserUiSession();

    expect(store.state.tracePanelMode).toBe("closed");
    expect(store.state.tracePanelOpen).toBe(false);
    expect(readBrowserUiSession().tracePanelMode).toBe("closed");
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

  test("hydrates browser ui session with full latest view", () => {
    clearBrowserUiSessionStorage();
    globalThis.localStorage?.setItem(
      BROWSER_UI_SESSION_STORAGE_KEY,
      JSON.stringify({
        activeLeftTab: "assistants",
        chatPaneTab: "events",
        assistantPane: {
          selectedAssistantId: "assistant-1",
          selectedTab: "learnings",
          scopeFilter: "project"
        },
        jobsPane: {
          segment: "jobs",
          runFilter: "failed",
          selectedJobId: "job-1",
          selectedRunId: "run-1"
        }
      })
    );

    const store = createHarnessStore();
    store.actions.hydrateBrowserUiSession();

    expect(store.state.activeLeftTab).toBe("assistants");
    expect(store.state.activeSurface).toBe("assistants");
    expect(store.state.chatPaneTab).toBe("events");
    expect(store.state.assistants.selectedTab).toBe("learnings");
    expect(store.state.assistants.scopeFilter).toBe("project");
    expect(store.state.assistants.selectedAssistantId).toBe("assistant-1");
    expect(store.state.jobsPanePreferences.segment).toBe("jobs");
    expect(store.state.jobsPanePreferences.selectedJobId).toBe("job-1");
    expect(store.state.jobsPanePreferences.selectedRunId).toBe("run-1");
    expect(store.state.jobsRunFilter).toBe("failed");
  });

  test("repairs invalid browser ui session view values", () => {
    clearBrowserUiSessionStorage();
    globalThis.localStorage?.setItem(
      BROWSER_UI_SESSION_STORAGE_KEY,
      JSON.stringify({
        activeLeftTab: "missing",
        chatPaneTab: "diff",
        assistantPane: {
          selectedTab: "metrics",
          scopeFilter: "team"
        },
        jobsPane: {
          segment: "archive",
          jobSort: "owner",
          runFilter: "blocked"
        }
      })
    );

    const store = createHarnessStore();
    store.actions.hydrateBrowserUiSession();
    const repaired = readBrowserUiSession();

    expect(store.state.activeLeftTab).toBe("projects");
    expect(store.state.chatPaneTab).toBe("chat");
    expect(store.state.assistants.selectedTab).toBe("chat");
    expect(store.state.jobsPanePreferences.segment).toBe("inbox");
    expect(store.state.jobsRunFilter).toBe("all");
    expect(repaired.activeLeftTab).toBe("projects");
    expect(repaired.chatPaneTab).toBe("chat");
    expect(repaired.assistantPane?.selectedTab).toBe("chat");
    expect(repaired.jobsPane?.segment).toBe("inbox");
    expect(repaired.jobsPane?.runFilter).toBe("all");
  });

  test("persists assistant learnings tab across refresh", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();

    store.setActiveLeftTab("assistants");
    store.setAssistantDetailTab("learnings");

    expect(readBrowserUiSession()).toMatchObject({
      activeLeftTab: "assistants",
      assistantPane: {
        selectedTab: "learnings"
      }
    });

    const restoredStore = createHarnessStore();
    restoredStore.actions.hydrateBrowserUiSession();

    expect(restoredStore.state.activeLeftTab).toBe("assistants");
    expect(restoredStore.state.assistants.selectedTab).toBe("learnings");
  });

  test("clears stale selected ids but keeps latest tab choices", () => {
    clearBrowserUiSessionStorage();
    globalThis.localStorage?.setItem(
      BROWSER_UI_SESSION_STORAGE_KEY,
      JSON.stringify({
        activeLeftTab: "jobs",
        assistantPane: {
          selectedAssistantId: "missing-assistant",
          selectedTab: "learnings",
          selectedLogDetailsId: "missing-log"
        },
        jobsPane: {
          segment: "jobs",
          selectedJobId: "missing-job",
          selectedRunId: "missing-run"
        }
      })
    );
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
        preferences: defaultPreferences,
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });

    expect(store.state.activeLeftTab).toBe("jobs");
    expect(store.state.assistants.selectedTab).toBe("learnings");
    expect(store.state.assistants.selectedAssistantId).toBeUndefined();
    expect(store.state.assistants.selectedLogDetailsId).toBeUndefined();
    expect(store.state.jobsPanePreferences.segment).toBe("jobs");
    expect(store.state.jobsPanePreferences.selectedJobId).toBeUndefined();
    expect(store.state.jobsPanePreferences.selectedRunId).toBeUndefined();
  });

  test("stores projects tab explicitly", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();

    store.setActiveLeftTab("projects");

    expect(readBrowserUiSession().activeLeftTab).toBe("projects");

    const restoredStore = createHarnessStore();
    restoredStore.actions.hydrateBrowserUiSession();

    expect(restoredStore.state.activeLeftTab).toBe("projects");
  });

  test("repairs and persists project sidebar preferences", () => {
    clearBrowserUiSessionStorage();
    globalThis.localStorage?.setItem(
      PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        projectSort: "manual",
        threadSort: "bad",
        grouping: "repository-path",
        manualProjectOrder: ["project-2", "missing-project", "project-2"],
        collapsedProjectIds: ["project-2", "missing-project", "project-2"]
      })
    );
    const firstProject = createWorkspaceProjectState({
      id: "project-1",
      name: "repo-one",
      rootPath: "C:\\repos\\repo-one"
    });
    const secondProject = createWorkspaceProjectState({
      id: "project-2",
      name: "repo-two",
      rootPath: "C:\\repos\\repo-two"
    });
    const store = createHarnessStore();

    store.applyServerEvent({
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [firstProject, secondProject],
          activeProjectId: firstProject.id
        },
        preferences: defaultPreferences,
        setup: defaultSetup,
        backgroundJobs: createEmptyBackgroundJobsState(),
        assistants: createEmptyAssistantsState(),
        notifications: defaultNotifications,
        executionControl: defaultExecutionControl
      }
    });
    store.hydrateLocalPreferences();

    expect(store.state.projectSidebarPreferences).toMatchObject({
      projectSort: "manual",
      threadSort: "last-user-message",
      grouping: "repository-path",
      manualProjectOrder: ["project-2", "project-1"],
      collapsedProjectIds: ["project-2"]
    });

    store.setProjectSidebarPreferences({
      projectSort: "created-at",
      manualProjectOrder: ["project-1", "project-2"],
      collapsedProjectIds: ["project-1"]
    });

    expect(readProjectSidebarPreferences()).toMatchObject({
      projectSort: "created-at",
      manualProjectOrder: ["project-1", "project-2"],
      collapsedProjectIds: ["project-1"]
    });
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
    expect(readBrowserUiSession()).toMatchObject({
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
              supportsFastModeControl: true,
              discoveredModels: ["openai/gpt-5.5", "openai/gpt-5.4-mini"],
              activeModel: "openai/gpt-5.5",
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
      { modelId: "openai/gpt-5.5", label: "GPT-5.5" },
      { modelId: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" }
    ]);
    expect(getFallbackExecutionModelIdForAgent(state, "codex-cli", "gpt")).toBe("openai/gpt-5.5");
    expect(getComposerControlState(state, "codex-cli", "openai/gpt-5.5")).toMatchObject({
      availableStrengths: ["low", "medium", "high", "extra-high"],
      supportsFastMode: true
    });
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
    expect(readLocalPreferences()).toMatchObject({
      selectedReasoningStrength: "medium",
      selectedFastMode: true
    });
  });

  test("hydrates composer reasoning and fast mode selections from local preferences", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();

    store.setSelectedReasoningStrength("medium");
    store.setSelectedFastMode(true);
    globalThis.localStorage?.removeItem(BROWSER_UI_SESSION_STORAGE_KEY);

    const nextStore = createHarnessStore();
    nextStore.hydrateLocalPreferences();

    expect(nextStore.state.selectedReasoningStrength).toBe("medium");
    expect(nextStore.state.selectedFastMode).toBe(true);
    expect(nextStore.state.hasGlobalSelectedReasoningStrength).toBe(true);
    expect(nextStore.state.hasGlobalSelectedFastMode).toBe(true);
  });

  test("persists and hydrates the last selected preferences section", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();

    store.setPreferencesActiveSectionId("ide-settings");
    expect(readLocalPreferences().preferencesActiveSectionId).toBe("ide-settings");

    const nextStore = createHarnessStore();
    nextStore.hydrateLocalPreferences();
    nextStore.openPreferencesModal();

    expect(nextStore.state.preferencesActiveSectionId).toBe("ide-settings");
  });

  test("merges partial local preference saves without dropping composer controls", () => {
    clearBrowserUiSessionStorage();
    const store = createHarnessStore();

    store.setSelectedReasoningStrength("medium");
    store.setSelectedFastMode(true);
    persistMergedLocalPreferences({
      providerBrand: "gpt",
      debugEnabled: true
    });

    expect(readLocalPreferences()).toMatchObject({
      providerBrand: "gpt",
      debugEnabled: true,
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
    expect(store.state.selectedFastMode).toBe(true);
    expect(getComposerControlState(store.state, "pi", "google/gemini-2.5-flash")).toEqual({
      availableStrengths: ["low", "medium", "high"],
      supportsFastMode: false,
      selectedReasoningStrength: "high",
      selectedFastMode: false
    });
  });

  test("keeps saved fast mode preference when switching through unsupported models", () => {
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
    store.setSelectedExecutionModelId("openai/gpt-5.4");
    store.setSelectedFastMode(true);
    store.setProviderBrand("gemini");
    store.setSelectedExecutionModelId("google/gemini-2.5-flash");

    expect(store.state.selectedFastMode).toBe(true);
    expect(readLocalPreferences()).toMatchObject({ selectedFastMode: true });
    expect(readBrowserUiSession()).toMatchObject({ selectedFastMode: true });
    expect(getComposerControlState(store.state, "pi", "google/gemini-2.5-flash")).toMatchObject({
      supportsFastMode: false,
      selectedFastMode: false
    });

    store.setProviderBrand("gpt");
    store.setSelectedExecutionModelId("openai/gpt-5.4");

    expect(getComposerControlState(store.state, "pi", "openai/gpt-5.4")).toMatchObject({
      supportsFastMode: true,
      selectedFastMode: true
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

    expect(readBrowserUiSession()).toMatchObject({
      lastActiveProjectId: project.id,
      lastActiveThreadByProjectId: {
        [project.id]: "thread-2"
      }
    });
  });

  test("hydrates pending planning run when thread activation switches into questioned thread", () => {
    const project = createWorkspaceProjectState({
      id: "project-question-thread",
      name: "repo-question-thread",
      rootPath: "C:\\repo-question-thread",
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
      ],
      session: {
        ...createEmptySession("thread-1"),
        messages: []
      }
    });
    const initialState = createConnectedState(project);
    const question = {
      id: "run-question:question-1",
      prompt: "Which route should handle this?",
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
      status: "pending" as const,
      askedAt: new Date().toISOString()
    };
    const activeRun = {
      id: "run-question",
      threadId: "thread-2",
      status: "awaiting-user-input" as const,
      latestUserPrompt: "needs clarification",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      difficultyScore: 40,
      summary: "Need one detail before planning",
      finalExecutionBrief: "Wait for user answer",
      questions: [question],
      subtasks: [],
      resumable: false,
      retryable: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextState = reduceServerEvent(initialState, {
      type: "thread.activated",
      requestId: "req-thread-question-activated",
      payload: {
        projectId: project.id,
        project: {
          ...project,
          activeThreadId: "thread-2",
          session: {
            ...createEmptySession("thread-2"),
            messages: []
          },
          activeRun,
          lastRun: activeRun,
          runSummaries: []
        }
      }
    });

    expect(nextState.workspace.projects[0]?.activeThreadId).toBe("thread-2");
    expect(nextState.workspace.projects[0]?.activeRun?.status).toBe("awaiting-user-input");
    expect(nextState.workspace.projects[0]?.activeRun?.questions[0]?.prompt).toContain("Which route");
    expect(nextState.workspace.projects[0]?.activeRun?.questions[0]?.status).toBe("pending");
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
    const messageCreatedAt = new Date().toISOString();
    const withAppendedMessage = reduceServerEvent(withDelta, {
      type: "assistant.chat.message-appended",
      requestId: "assistant-4",
      payload: {
        assistantId,
        sessionId: "session-1",
        message: {
          id: "message-1",
          role: "user",
          kind: "plain",
          content: "Need balance help",
          createdAt: messageCreatedAt
        },
        thread: {
          id: "assistant-thread-1",
          assistantId,
          sessionId: "session-1",
          messageCount: 1,
          messages: [
            {
              id: "message-1",
              role: "user",
              kind: "plain",
              content: "Need balance help",
              createdAt: messageCreatedAt
            }
          ],
          updatedAt: messageCreatedAt
        }
      }
    });
    const withQuestion = reduceServerEvent(withAppendedMessage, {
      type: "assistant.question.updated",
      requestId: "assistant-5",
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
    const withDetail = reduceServerEvent(withQuestion, {
      type: "assistant.detail.loaded",
      requestId: "assistant-detail",
      payload: {
        detail: {
          assistant: hydratedState.assistants.assistants[0]!,
          thread: withAppendedMessage.assistants.threads[0],
          todos: {
            items: [
              {
                id: "todo-1",
                assistantId,
                title: "Practice stance",
                state: "pending",
                sortOrder: 0,
                workKind: "unspecified",
                createdAt: messageCreatedAt,
                updatedAt: messageCreatedAt
              }
            ]
          },
          learnings: { items: [] },
          questions: { items: withQuestion.assistants.questions },
          logs: { items: [] },
          assetRefs: []
        }
      }
    });

    expect(withCreatedCard.activeSurface).toBe(hydratedState.activeSurface);
    expect(withCreatedCard.assistants.selectedAssistantId).toBe(assistantId);
    expect(withCreatedCard.assistants.scopeFilter).toBe("project");
    expect(getVisibleAssistants(withCreatedCard)[0]?.id).toBe(assistantId);
    expect(withDelta.assistants.streamingByAssistantId[assistantId]).toBe("wax on");
    expect(withAppendedMessage.assistants.threads[0]?.messages[0]?.content).toBe("Need balance help");
    expect(withAppendedMessage.assistants.streamingByAssistantId[assistantId]).toBe("wax on");
    expect(withQuestion.assistants.questions[0]?.prompt).toContain("Kata");
    expect(withDetail.assistants.todos[0]?.title).toBe("Practice stance");
  });

  test("assistant created card switches to created assistant scope", () => {
    const project = createProject();
    const connectedState = createConnectedState(project);
    const now = new Date().toISOString();
    const globalAssistant = {
      id: "assistant-global",
      name: "Release watcher",
      scope: "global" as const,
      projectId: undefined,
      description: "Watch releases",
      personalityPrompt: "Concise.",
      jobPrompt: "Watch releases.",
      agentId: "pi" as const,
      modeId: undefined,
      executionModelId: undefined,
      runState: "active" as const,
      bootstrapState: "completed" as const,
      clonedFromAssistantId: undefined,
      failureStreakCount: 0,
      circuitBreakerState: "closed" as const,
      circuitBreakerReason: undefined,
      deletedAt: undefined,
      latestActivityAt: now,
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const hydratedState = reduceServerEvent(connectedState, {
      type: "assistants.updated",
      requestId: "assistant-global",
      payload: {
        assistants: {
          assistants: [globalAssistant],
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
      requestId: "assistant-global-card",
      payload: {
        assistant: globalAssistant
      }
    });

    expect(withCreatedCard.assistants.scopeFilter).toBe("global");
    expect(getVisibleAssistants(withCreatedCard)[0]?.id).toBe("assistant-global");
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

  test("caps live trace history per thread", () => {
    const initialProject = createProject();
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const sessionId = initialProject.session.sessionId;
    let state = createConnectedState(initialProject);

    for (let index = 0; index < 505; index += 1) {
      state = reduceServerEvent(state, {
        type: "agent.trace",
        requestId: `req-trace-${index}`,
        payload: {
          projectId,
          threadId,
          trace: {
            sessionId,
            stage: "subagent-start",
            message: `trace ${index}`
          }
        }
      });
    }

    const project = state.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.traces).toHaveLength(500);
    expect(project?.traces[0]?.message).toBe("trace 5");
    expect(project?.traces.at(-1)?.message).toBe("trace 504");
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

  test("hydrates persisted in-flight assistant text on reconnect", () => {
    const threadId = "thread-stream";
    const project = createWorkspaceProjectState({
      id: createProjectId(),
      name: "repo-stream",
      rootPath: "C:\\repo-stream",
      activeThreadId: threadId,
      session: {
        ...createEmptySession(threadId),
        isStreaming: true,
        messages: [
          {
            id: "assistant-stream-1",
            role: "assistant",
            content: "working",
            createdAt: new Date().toISOString()
          }
        ]
      }
    });

    const state = createConnectedState(project);
    expect(state.workspace.projects[0]?.streamingAssistantText).toBe("working");
  });

  test("stores streaming tail segments and clears them on completion", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const updatedAt = new Date().toISOString();

    const tailState = reduceServerEvent(initialState, {
      type: "chat.streaming-tail-updated",
      requestId: "req-tail",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        runId: "run-1",
        segments: [
          {
            id: "run-1:subagents",
            kind: "status",
            phase: "subagents",
            content: "**Subagents**\n- Wired HUD.",
            updatedAt
          }
        ],
        state: {
          ...createEmptySession(threadId),
          isStreaming: true
        }
      }
    });

    const completeState = reduceServerEvent(tailState, {
      type: "chat.complete",
      requestId: "req-tail",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        assistantMessage: {
          id: "assistant-1",
          role: "assistant",
          content: "done",
          createdAt: updatedAt
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              content: "done",
              createdAt: updatedAt
            }
          ],
          isStreaming: false
        }
      }
    });

    expect(tailState.workspace.projects[0]?.streamingTailSegments).toHaveLength(1);
    expect(tailState.workspace.projects[0]?.streamingHeartbeatMessages).toHaveLength(1);
    expect(completeState.workspace.projects[0]?.streamingTailSegments).toHaveLength(0);
    expect(completeState.workspace.projects[0]?.streamingHeartbeatMessages).toHaveLength(0);
  });

  test("rolls streaming heartbeat content into a new live message after two updates", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;

    const firstState = reduceServerEvent(initialState, {
      type: "chat.streaming-tail-updated",
      requestId: "req-tail-1",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        runId: "run-1",
        segments: [
          {
            id: "run-1:subagents",
            kind: "status",
            phase: "subagents",
            content: "**Subagents**\n- First beat.",
            updatedAt: "2026-04-23T12:00:00.000Z"
          }
        ],
        state: {
          ...createEmptySession(threadId),
          isStreaming: true
        }
      }
    });

    const secondState = reduceServerEvent(firstState, {
      type: "chat.streaming-tail-updated",
      requestId: "req-tail-2",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        runId: "run-1",
        segments: [
          {
            id: "run-1:subagents",
            kind: "status",
            phase: "subagents",
            content: "**Subagents**\n- Second beat.",
            updatedAt: "2026-04-23T12:00:01.000Z"
          }
        ],
        state: {
          ...createEmptySession(threadId),
          isStreaming: true
        }
      }
    });

    const thirdState = reduceServerEvent(secondState, {
      type: "chat.streaming-tail-updated",
      requestId: "req-tail-3",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        runId: "run-1",
        segments: [
          {
            id: "run-1:subagents",
            kind: "status",
            phase: "subagents",
            content: "**Subagents**\n- Third beat.",
            updatedAt: "2026-04-23T12:00:02.000Z"
          }
        ],
        state: {
          ...createEmptySession(threadId),
          isStreaming: true
        }
      }
    });

    expect(firstState.workspace.projects[0]?.streamingHeartbeatMessages).toEqual([
      {
        id: "run-1:heartbeat:1",
        content: "**Subagents**\n- First beat.",
        heartbeatCount: 1,
        locked: false,
        updatedAt: "2026-04-23T12:00:00.000Z"
      }
    ]);
    expect(secondState.workspace.projects[0]?.streamingHeartbeatMessages).toEqual([
      {
        id: "run-1:heartbeat:1",
        content: "**Subagents**\n- Second beat.",
        heartbeatCount: 2,
        locked: false,
        updatedAt: "2026-04-23T12:00:01.000Z"
      }
    ]);
    expect(thirdState.workspace.projects[0]?.streamingHeartbeatMessages).toEqual([
      {
        id: "run-1:heartbeat:1",
        content: "**Subagents**\n- Second beat.",
        heartbeatCount: 2,
        locked: true,
        updatedAt: "2026-04-23T12:00:01.000Z"
      },
      {
        id: "run-1:heartbeat:2",
        content: "**Subagents**\n- Third beat.",
        heartbeatCount: 1,
        locked: false,
        updatedAt: "2026-04-23T12:00:02.000Z"
      }
    ]);
  });

  test("keeps status heartbeats separate from assistant streaming tail content", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;

    const nextState = reduceServerEvent(initialState, {
      type: "chat.streaming-tail-updated",
      requestId: "req-tail-mixed",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        runId: "run-1",
        segments: [
          {
            id: "run-1:subagents",
            kind: "status",
            phase: "subagents",
            content: "**Subagents**\n- Planning done. Spawning 3 subagents. Parallel slots: 3.",
            updatedAt: "2026-04-23T12:00:00.000Z"
          },
          {
            id: "run-1:assistant",
            kind: "assistant",
            content: "Next message starts here.",
            updatedAt: "2026-04-23T12:00:01.000Z"
          }
        ],
        state: {
          ...createEmptySession(threadId),
          isStreaming: true
        }
      }
    });

    expect(nextState.workspace.projects[0]?.streamingHeartbeatMessages).toEqual([
      {
        id: "run-1:heartbeat:1",
        content: "**Subagents**\n- Planning done. Spawning 3 subagents. Parallel slots: 3.",
        heartbeatCount: 1,
        locked: false,
        updatedAt: "2026-04-23T12:00:01.000Z"
      }
    ]);
  });

  test("restores inactive thread live transcript when switching back", () => {
    const projectId = createProjectId();
    const threadOne = "thread-1";
    const threadTwo = "thread-2";
    const initialProject = createWorkspaceProjectState({
      id: projectId,
      name: "repo-switch-live",
      rootPath: "C:\\repo-switch-live",
      activeThreadId: threadTwo,
      threads: [
        createProjectThreadSummary({
          id: threadOne,
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: threadTwo,
          title: "Thread 2",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
      session: {
        ...createEmptySession(threadTwo),
        messages: []
      }
    });
    const initialState = createConnectedState(initialProject);

    const tailState = reduceServerEvent(initialState, {
      type: "chat.streaming-tail-updated",
      requestId: "req-inactive-tail",
      payload: {
        projectId,
        threadId: threadOne,
        sessionId: threadOne,
        runId: "run-restore-live",
        segments: [
          {
            id: "run-restore-live:planning",
            kind: "status",
            phase: "planning",
            content: "**Planning**\n- Need routing target.",
            updatedAt: "2026-04-23T12:00:00.000Z"
          }
        ],
        state: {
          ...createEmptySession(threadOne),
          isStreaming: true
        }
      }
    });
    const deltaState = reduceServerEvent(tailState, {
      type: "chat.delta",
      requestId: "req-inactive-delta",
      payload: {
        projectId,
        threadId: threadOne,
        sessionId: threadOne,
        delta: "Partial assistant"
      }
    });

    expect(deltaState.workspace.projects[0]?.streamingHeartbeatMessages).toEqual([]);
    expect(deltaState.workspace.projects[0]?.streamingAssistantText).toBe("");

    const switchedBack = reduceServerEvent(deltaState, {
      type: "thread.activated",
      requestId: "req-switch-back",
      payload: {
        projectId,
        project: createWorkspaceProjectState({
          id: projectId,
          name: "repo-switch-live",
          rootPath: "C:\\repo-switch-live",
          activeThreadId: threadOne,
          threads: initialProject.threads,
          session: {
            ...createEmptySession(threadOne),
            messages: []
          }
        })
      }
    });

    const restoredProject = switchedBack.workspace.projects[0];
    expect(restoredProject?.session.isStreaming).toBe(true);
    expect(restoredProject?.streamingHeartbeatMessages[0]?.content).toContain("Need routing target.");
    expect(restoredProject?.streamingAssistantText).toBe("Partial assistant");
  });

  test("routes stale streaming frames by session instead of active thread", () => {
    const projectId = createProjectId();
    const threadOne = "thread-1";
    const threadTwo = "thread-2";
    const initialProject = createWorkspaceProjectState({
      id: projectId,
      name: "repo-stale-frame",
      rootPath: "C:\\repo-stale-frame",
      activeThreadId: threadTwo,
      threads: [
        createProjectThreadSummary({
          id: threadOne,
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: threadTwo,
          title: "Thread 2",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
      session: {
        ...createEmptySession(threadTwo),
        messages: [
          {
            id: "thread-2-user",
            role: "user",
            content: "active thread text",
            createdAt: new Date().toISOString()
          }
        ]
      }
    });
    const initialState = createConnectedState(initialProject);

    const deltaState = reduceServerEvent(initialState, {
      type: "chat.delta",
      requestId: "req-stale-delta",
      payload: {
        projectId,
        threadId: threadTwo,
        sessionId: threadOne,
        delta: "background stream"
      }
    });

    const activeProject = deltaState.workspace.projects[0];
    expect(activeProject?.activeThreadId).toBe(threadTwo);
    expect(activeProject?.streamingAssistantText).toBe("");
    expect(activeProject?.threadLiveTranscriptById[threadOne]?.streamingAssistantText).toBe("background stream");
    expect(activeProject?.threadLiveTranscriptById[threadTwo]?.streamingAssistantText).toBe("");
  });

  test("restores inactive thread pending question and run state when switching back", () => {
    const projectId = createProjectId();
    const threadOne = "thread-1";
    const threadTwo = "thread-2";
    const initialProject = createWorkspaceProjectState({
      id: projectId,
      name: "repo-question-switch",
      rootPath: "C:\\repo-question-switch",
      activeThreadId: threadTwo,
      threads: [
        createProjectThreadSummary({
          id: threadOne,
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: threadTwo,
          title: "Thread 2",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
      session: {
        ...createEmptySession(threadTwo),
        messages: [
          {
            id: "thread-2-user",
            role: "user",
            content: "active thread text",
            createdAt: new Date().toISOString()
          }
        ]
      }
    });
    const initialState = createConnectedState(initialProject);
    const questionRun = {
      id: "run-thread-1-question",
      threadId: threadOne,
      status: "awaiting-user-input" as const,
      latestUserPrompt: "needs clarification",
      questions: [
        {
          id: "run-thread-1-question:question-1",
          prompt: "Which route?",
          choices: [],
          required: true,
          status: "pending" as const,
          askedAt: new Date().toISOString()
        }
      ],
      subtasks: [],
      resumable: false,
      retryable: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const questionedState = reduceServerEvent(initialState, {
      type: "run.updated",
      requestId: "req-inactive-question",
      payload: {
        projectId,
        threadId: threadOne,
        run: questionRun
      }
    });

    expect(questionedState.workspace.projects[0]?.activeThreadId).toBe(threadTwo);
    expect(questionedState.workspace.projects[0]?.activeRun).toBeUndefined();
    expect(questionedState.workspace.projects[0]?.session.messages[0]?.content).toBe("active thread text");
    expect(questionedState.workspace.projects[0]?.threads.find((thread) => thread.id === threadOne)?.badgeState).toBe("needs-input");

    const switchedBack = reduceServerEvent(questionedState, {
      type: "thread.activated",
      requestId: "req-switch-back-question",
      payload: {
        projectId,
        project: createWorkspaceProjectState({
          id: projectId,
          name: "repo-question-switch",
          rootPath: "C:\\repo-question-switch",
          activeThreadId: threadOne,
          threads: initialProject.threads,
          session: {
            ...createEmptySession(threadOne),
            messages: []
          }
        })
      }
    });

    const restoredProject = switchedBack.workspace.projects[0];
    expect(restoredProject?.activeRun?.id).toBe(questionRun.id);
    expect(restoredProject?.activeRun?.questions[0]?.prompt).toBe("Which route?");
    expect(restoredProject?.lastRun?.id).toBe(questionRun.id);
    expect(restoredProject?.runSummaries[0]?.id).toBe(questionRun.id);
  });

  test("clears inactive thread live transcript after completion", () => {
    const projectId = createProjectId();
    const threadOne = "thread-1";
    const threadTwo = "thread-2";
    const initialProject = createWorkspaceProjectState({
      id: projectId,
      name: "repo-switch-complete",
      rootPath: "C:\\repo-switch-complete",
      activeThreadId: threadTwo,
      threads: [
        createProjectThreadSummary({
          id: threadOne,
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: threadTwo,
          title: "Thread 2",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
      session: {
        ...createEmptySession(threadTwo),
        messages: []
      }
    });
    const initialState = createConnectedState(initialProject);

    const streamingState = reduceServerEvent(initialState, {
      type: "chat.delta",
      requestId: "req-inactive-delta-complete",
      payload: {
        projectId,
        threadId: threadOne,
        sessionId: threadOne,
        delta: "Partial assistant"
      }
    });
    const completedState = reduceServerEvent(streamingState, {
      type: "chat.complete",
      requestId: "req-inactive-complete",
      payload: {
        projectId,
        threadId: threadOne,
        sessionId: threadOne,
        assistantMessage: {
          id: "assistant-complete",
          role: "assistant",
          content: "done",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadOne),
          isStreaming: false,
          messages: [
            {
              id: "assistant-complete",
              role: "assistant",
              content: "done",
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    });
    const switchedBack = reduceServerEvent(completedState, {
      type: "thread.activated",
      requestId: "req-switch-back-complete",
      payload: {
        projectId,
        project: createWorkspaceProjectState({
          id: projectId,
          name: "repo-switch-complete",
          rootPath: "C:\\repo-switch-complete",
          activeThreadId: threadOne,
          threads: initialProject.threads,
          session: {
            ...createEmptySession(threadOne),
            messages: [
              {
                id: "assistant-complete",
                role: "assistant",
                content: "done",
                createdAt: new Date().toISOString()
              }
            ]
          }
        })
      }
    });

    const restoredProject = switchedBack.workspace.projects[0];
    expect(restoredProject?.session.isStreaming).toBe(false);
    expect(restoredProject?.streamingHeartbeatMessages).toEqual([]);
    expect(restoredProject?.streamingAssistantText).toBe("");
  });

  test("keeps active thread state stable when background thread completes", () => {
    const project = createWorkspaceProjectState({
      id: createProjectId(),
      name: "repo-two",
      rootPath: "C:\\repo-two",
      activeThreadId: "thread-2",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Thread 1",
          titleSource: "generated",
          badgeState: "executing",
          messageCount: 1,
          updatedAt: new Date().toISOString()
        }),
        createProjectThreadSummary({
          id: "thread-2",
          title: "Thread 2",
          titleSource: "generated",
          badgeState: "idle",
          messageCount: 0,
          updatedAt: new Date().toISOString()
        })
      ],
      session: {
        ...createEmptySession("thread-2"),
        messages: [
          {
            id: "user-thread-2",
            role: "user",
            content: "new thread",
            createdAt: new Date().toISOString()
          }
        ]
      }
    });
    const initialState = createConnectedState(project);
    const completedState = reduceServerEvent(initialState, {
      type: "chat.complete",
      requestId: "req-background-complete",
      payload: {
        projectId: project.id,
        threadId: "thread-1",
        sessionId: "thread-1",
        assistantMessage: {
          id: "assistant-thread-1",
          role: "assistant",
          content: "background done",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession("thread-1"),
          messages: [
            {
              id: "assistant-thread-1",
              role: "assistant",
              content: "background done",
              createdAt: new Date().toISOString()
            }
          ],
          isStreaming: false
        }
      }
    });

    const activeProject = completedState.workspace.projects[0];
    expect(activeProject?.activeThreadId).toBe("thread-2");
    expect(activeProject?.session.sessionId).toBe("thread-2");
    expect(activeProject?.session.messages[0]?.content).toBe("new thread");
    expect(activeProject?.threads.find((thread) => thread.id === "thread-1")?.badgeState).toBe("done");
    expect(activeProject?.threads.find((thread) => thread.id === "thread-1")?.messageCount).toBe(2);
    expect(activeProject?.threads.find((thread) => thread.id === "thread-1")?.lastMessagePreview).toBe("background done");
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

  test("uses appended thread summary to refresh generated thread title", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const createdAt = new Date().toISOString();
    const nextState = reduceServerEvent(initialState, {
      type: "chat.message-appended",
      requestId: "req-title-refresh",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "user-title",
          role: "user",
          content: "build project sorting",
          createdAt
        },
        thread: createProjectThreadSummary({
          ...(initialProject.threads[0] ?? {
            id: threadId,
            title: "Thread 1",
            titleSource: "generated" as const,
            updatedAt: createdAt
          }),
          title: "build project sorting",
          messageCount: 1,
          lastMessagePreview: "build project sorting",
          lastUserMessageAt: createdAt,
          updatedAt: createdAt
        }),
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "user-title",
              role: "user",
              content: "build project sorting",
              createdAt
            }
          ]
        }
      }
    });

    const project = nextState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.threads.find((thread) => thread.id === threadId)?.title).toBe("build project sorting");
    expect(project?.threads.find((thread) => thread.id === threadId)?.messageCount).toBe(1);
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

  test("uses thread appended session streaming state for planner responses", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const streamingState = reduceServerEvent(initialState, {
      type: "chat.delta",
      requestId: "req-thread-streaming",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        delta: "question"
      }
    });

    const questionMessage = {
      id: "assistant-question",
      role: "assistant" as const,
      content: "Which route?",
      createdAt: new Date().toISOString()
    };
    const nextState = reduceServerEvent(streamingState, {
      type: "thread.message-appended",
      requestId: "req-thread-question",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: questionMessage,
        state: {
          ...createEmptySession(threadId),
          messages: [questionMessage],
          isStreaming: false
        }
      }
    });

    expect(streamingState.workspace.projects[0]?.session.isStreaming).toBe(true);
    expect(nextState.workspace.projects[0]?.session.isStreaming).toBe(false);
    expect(nextState.workspace.projects[0]?.streamingAssistantText).toBe("");
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

  test("updates run milestone messages without duplicating thread counts", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const createdAt = new Date().toISOString();
    const appendedState = reduceServerEvent(initialState, {
      type: "chat.message-appended",
      requestId: "req-milestone",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "milestone-1",
          role: "assistant",
          kind: "run-milestones",
          content: "- Started",
          metadata: {
            type: "run-milestones",
            runId: "run-1",
            windowId: "window-1",
            status: "open",
            startedAt: createdAt,
            updatedAt: createdAt,
            lineCount: 1
          },
          createdAt
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "milestone-1",
              role: "assistant",
              kind: "run-milestones",
              content: "- Started",
              metadata: {
                type: "run-milestones",
                runId: "run-1",
                windowId: "window-1",
                status: "open",
                startedAt: createdAt,
                updatedAt: createdAt,
                lineCount: 1
              },
              createdAt
            }
          ]
        }
      }
    });
    const updatedState = reduceServerEvent(appendedState, {
      type: "chat.message-updated",
      requestId: "req-milestone-update",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "milestone-1",
          role: "assistant",
          kind: "run-milestones",
          content: "- Started\n- Finished",
          metadata: {
            type: "run-milestones",
            runId: "run-1",
            windowId: "window-1",
            status: "closed",
            startedAt: createdAt,
            updatedAt: createdAt,
            lineCount: 2
          },
          createdAt
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "milestone-1",
              role: "assistant",
              kind: "run-milestones",
              content: "- Started\n- Finished",
              metadata: {
                type: "run-milestones",
                runId: "run-1",
                windowId: "window-1",
                status: "closed",
                startedAt: createdAt,
                updatedAt: createdAt,
                lineCount: 2
              },
              createdAt
            }
          ]
        }
      }
    });

    const project = updatedState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.session.messages).toHaveLength(1);
    expect(project?.session.messages[0]?.content).toContain("Finished");
    expect(project?.threads[0]?.messageCount).toBe((initialProject.threads[0]?.messageCount ?? 0) + 1);
    expect(project?.threads[0]?.lastMessagePreview).toBe(initialProject.threads[0]?.lastMessagePreview);
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

  test("stores blocking non-git preflight with original command", () => {
    const initialProject = createProject();
    const projectId = initialProject.id;
    const command = {
      type: "chat.send" as const,
      requestId: "req-non-git",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
        agentId: "pi" as const,
        content: "simple task"
      }
    };
    const initialState = {
      ...createConnectedState(initialProject),
      pendingPreflightCommands: {
        [command.requestId]: command
      }
    };
    const nextState = reduceServerEvent(initialState, {
      type: "run.preflight",
      requestId: "req-non-git",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
        preflight: {
          severity: "blocking",
          kind: "git-not-repo",
          message: "Not a git repo.",
          changedFileCount: 0,
          repairSummary: "Init git or disable check."
        }
      }
    });

    expect(nextState.blockingNonGitPreflight?.command).toEqual(command);
    expect(nextState.blockingNonGitPreflight?.preflight.kind).toBe("git-not-repo");
  });

  test("retries blocked command after git initialization", () => {
    const store = createHarnessStore();
    const initialProject = createProject();
    const command = {
      type: "chat.send" as const,
      requestId: "req-old",
      payload: {
        projectId: initialProject.id,
        threadId: initialProject.activeThreadId,
        agentId: "pi" as const,
        content: "simple task"
      }
    };
    const commands: unknown[] = [];
    store.replaceStateForTests({
      ...createConnectedState(initialProject),
      blockingNonGitPreflight: {
        requestId: command.requestId,
        projectId: initialProject.id,
        threadId: initialProject.activeThreadId,
        preflight: {
          severity: "blocking",
          kind: "git-not-repo",
          message: "Not a git repo.",
          changedFileCount: 0,
          repairSummary: "Init git or disable check."
        },
        command
      },
      pendingPreflightRepairKind: "git-init"
    });
    store.actions.setCommandDispatcher((nextCommand) => commands.push(nextCommand));

    store.applyServerEvent({
      type: "project.git.initialized",
      requestId: "req-init",
      payload: {
        projectId: initialProject.id,
        rootPath: initialProject.rootPath,
        initialized: true,
        baselineCommitCreated: true
      }
    });

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("chat.send");
    expect((commands[0] as { requestId: string }).requestId).not.toBe(command.requestId);
  });

  test("retries blocked command after dirty git check is disabled", () => {
    const store = createHarnessStore();
    const initialProject = createProject();
    const command = {
      type: "chat.send" as const,
      requestId: "req-old-disable",
      payload: {
        projectId: initialProject.id,
        threadId: initialProject.activeThreadId,
        agentId: "pi" as const,
        content: "simple task"
      }
    };
    const commands: unknown[] = [];
    store.replaceStateForTests({
      ...createConnectedState(initialProject),
      blockingNonGitPreflight: {
        requestId: command.requestId,
        projectId: initialProject.id,
        threadId: initialProject.activeThreadId,
        preflight: {
          severity: "blocking",
          kind: "git-not-repo",
          message: "Not a git repo.",
          changedFileCount: 0,
          repairSummary: "Init git or disable check."
        },
        command
      },
      pendingPreflightRepairKind: "disable-check"
    });
    store.actions.setCommandDispatcher((nextCommand) => commands.push(nextCommand));

    store.applyServerEvent({
      type: "preferences.saved",
      requestId: "req-pref-disable",
      payload: {
        ...defaultPreferences,
        blockChatOnDirtyGitDefault: false,
        setup: defaultSetup
      }
    });

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("chat.send");
    expect((commands[0] as { requestId: string }).requestId).not.toBe(command.requestId);
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
        availableSkillPaths: [".agents/skills/grill-me/SKILL.md"],
        resolution: "created-project"
      }
    });

    expect(nextState.workspace.activeProjectId).toBe(project.id);
    expect(nextState.workspace.projects.some((entry) => entry.id === project.id)).toBe(true);
    expect(nextState.availableSkillPaths).toEqual([".agents/skills/grill-me/SKILL.md"]);
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
          hasUsableAnthropicApiKey: false,
          hasStoredAnthropicApiKey: false,
          providerBrand: "gemini",
          debugEnabledDefault: true,
          tracePanelDefaultOpen: false,
          subagentWorktreeStrategyDefault: "same-worktree",
          blockChatOnDirtyGitDefault: false,
          dirtyGitChangeLimitDefault: 6,
          autoCompactContextThresholdPercentDefault: 44,
          planExecutionModeDefault: "countdown",
          planExecutionDelaySecondsDefault: 10,
          singleAgentModelPreferenceDefault: "intelligence",
          subagentModelPreferenceDefault: "inference",
          correctnessIterationModeDefault: "ask-before-iterate",
          backgroundJobApprovalPolicyDefault: "ask-risky",
          memoryBankEnabledDefault: true,
          memoryBankRecordRunsDefault: true,
          checkCliUpdatesDefault: true,
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

  test("applies memory reordered event to active project entries", () => {
    const project = createWorkspaceProjectState({
      id: "project-memory",
      name: "Memory project",
      rootPath: "C:\\repo"
    });
    const now = new Date().toISOString();
    const state = createConnectedState(project);

    const nextState = reduceServerEvent(state, {
      type: "memory.reordered",
      requestId: "req-memory-reordered",
      payload: {
        projectId: project.id,
        entries: [
          {
            id: "memory-2",
            projectId: project.id,
            kind: "task-summary",
            status: "active",
            title: "New",
            summary: "New summary",
            tags: [],
            pathGlobs: [],
            confidence: "medium",
            freshness: "fresh",
            pinned: false,
            priority: 100,
            hitCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ]
      }
    });

    expect(nextState.workspace.projects[0]?.memoryEntries.map((entry) => entry.title)).toEqual(["New"]);
  });

  test("preserves project memory entries across thread activation refreshes", () => {
    const now = new Date().toISOString();
    const project = createWorkspaceProjectState({
      id: "project-memory-thread-switch",
      name: "Memory thread switch",
      rootPath: "C:\\repo",
      activeThreadId: "thread-1",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: now
        }),
        createProjectThreadSummary({
          id: "thread-2",
          title: "Thread 2",
          titleSource: "generated",
          updatedAt: now
        })
      ]
    });
    const stateWithMemory = reduceServerEvent(createConnectedState(project), {
      type: "memory.listed",
      requestId: "req-memory-listed",
      payload: {
        projectId: project.id,
        entries: [
          {
            id: "memory-1",
            projectId: project.id,
            kind: "task-summary",
            status: "active",
            title: "Persisted memory",
            summary: "Memory should survive thread refresh.",
            tags: [],
            pathGlobs: [],
            confidence: "medium",
            freshness: "fresh",
            pinned: false,
            priority: 100,
            hitCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ]
      }
    });

    const nextState = reduceServerEvent(stateWithMemory, {
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

    expect(nextState.workspace.projects[0]?.memoryEntries.map((entry) => entry.title)).toEqual(["Persisted memory"]);
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

  test("stores branchfs cleanup summaries from websocket events", () => {
    const project = createProject();
    const nextState = reduceServerEvent(createConnectedState(project), {
      type: "branchfs.cleaned",
      requestId: "req-branchfs-cleaned",
      payload: {
        projectId: project.id,
        summary: {
          rootsScanned: 4,
          rootsDeleted: 3,
          rootsRetained: 1,
          bytesDeleted: 1024,
          staleRunsStopped: 2,
          warnings: []
        }
      }
    });

    expect(nextState.branchfsCleanupSummary?.rootsDeleted).toBe(3);
    expect(nextState.branchfsCleanupSummary?.staleRunsStopped).toBe(2);
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
        hasUsableAnthropicApiKey: false,
        hasStoredAnthropicApiKey: false,
        providerBrand: "gpt",
        debugEnabledDefault: false,
        tracePanelDefaultOpen: true,
        subagentWorktreeStrategyDefault: "same-worktree",
        blockChatOnDirtyGitDefault: true,
        dirtyGitChangeLimitDefault: 20,
        autoCompactContextThresholdPercentDefault: 40,
        planExecutionModeDefault: "countdown",
        planExecutionDelaySecondsDefault: 10,
        singleAgentModelPreferenceDefault: "intelligence",
        subagentModelPreferenceDefault: "inference",
        correctnessIterationModeDefault: "ask-before-iterate",
        backgroundJobApprovalPolicyDefault: "ask-risky",
        memoryBankEnabledDefault: true,
        memoryBankRecordRunsDefault: true,
        checkCliUpdatesDefault: true,
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
