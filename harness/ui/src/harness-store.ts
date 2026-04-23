import { createStore, reconcile } from "solid-js/store";
import { defaultAgentCatalog } from "../../shared/agent-catalog";
import { defaultProviderCapabilities } from "../../shared/capabilities";
import { DEFAULT_MODE_ID, resolveModeById, resolveModeCatalog } from "../../shared/modes";
import {
  createRequestId,
  type Assistant,
  type AssistantAssetRef,
  type AssistantLearning,
  type AssistantLogEntry,
  type AssistantQuestion,
  type AssistantsState,
  type AssistantThread,
  type AssistantTodo,
  type AgentId,
  type AgentPlan,
  type AgentRunState,
  type AgentRunSummary,
  type AgentTrace,
  type AgentRuntimeCapability,
  type BackgroundJob,
  type BackgroundJobApprovalPolicy,
  type BackgroundJobsState,
  type BackgroundJobSchedulePreview,
  type ComposerReasoningStrength,
  type ExperimentInspection,
  type MemorySummary,
  type MemoryEntry,
  type ModelCapability,
  type ModeDefinition,
  type NotificationInboxState,
  type ProjectContextUsage,
  type ProviderBrand,
  type ExecutionModelId,
  type AgentOption,
  type ConnectionState,
  type PreferencesState,
  type ProviderCapability,
  type ProjectSearchResult,
  type RunPreflight,
  type ClientCommand,
  type ServerEvent,
  type SetupState,
  type StreamingTailSegment,
  type ExecutionPlan,
  type ExecutionControlState,
  type WorkspaceRuleSource,
  type WorkspaceProjectState,
  type WorkspaceState
} from "../../shared/protocol";
import { pushToast, reportUiError } from "./toast-store";

export const OPENAI_API_KEY_STORAGE_KEY = "openai_api_key";
export const GOOGLE_API_KEY_STORAGE_KEY = "google_api_key";
export const PROVIDER_BRAND_STORAGE_KEY = "provider_brand";
export const DEBUG_ENABLED_STORAGE_KEY = "debug_enabled";
export const TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY = "trace_panel_default_open";
export const SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY = "subagent_worktree_strategy_default";
export const BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY = "block_chat_on_dirty_git_default";
export const DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY = "dirty_git_change_limit_default";
export const AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY = "auto_compact_context_threshold_percent_default";
export const PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY = "plan_execution_mode_default";
export const PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY = "plan_execution_delay_seconds_default";
export const CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY = "correctness_iteration_mode_default";
export const BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY = "background_job_approval_policy_default";
export const BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY = "background_job_notifications_enabled";
export const MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY = "memory_bank_enabled_default";
export const COMPOSER_REASONING_STRENGTH_STORAGE_KEY = "composer_reasoning_strength";
export const COMPOSER_FAST_MODE_STORAGE_KEY = "composer_fast_mode";
export const THREAD_DRAFT_STORAGE_KEY_PREFIX = "pi-harness:thread-draft:v1";
export const TUTORIAL_PROGRESS_STORAGE_KEY = "pi-harness:tutorial-progress:v1";
export const BROWSER_UI_SESSION_STORAGE_KEY = "pi-harness:browser-ui-session:v1";
export const DEFAULT_COMPOSER_REASONING_STRENGTH: ComposerReasoningStrength = "high";
export const COMPOSER_REASONING_STRENGTHS: ComposerReasoningStrength[] = ["low", "medium", "high", "extra-high"];
const MAX_STREAMING_MESSAGE_HEARTBEATS = 2;

export type HarnessActiveSurface = "chat" | "background-jobs" | "assistants";
export type AssistantScopeFilter = "global" | "project";

export type BrowserUiSessionState = {
  selectedModeId?: string;
  selectedAgentId?: AgentId;
  selectedExecutionModelId?: ExecutionModelId;
  selectedReasoningStrength?: ComposerReasoningStrength;
  selectedFastMode?: boolean;
  tracePanelOpen?: boolean;
  lastActiveProjectId?: string;
  lastActiveThreadByProjectId?: Record<string, string>;
};

export type AssistantEditorDraft = {
  source: "create" | "edit";
  assistantId?: string;
  name: string;
  scope: Assistant["scope"];
  projectId?: string;
  description: string;
  personalityPrompt: string;
  jobPrompt: string;
  agentId: Assistant["agentId"];
  modeId?: string;
  executionModelId?: string;
  runState: Assistant["runState"];
  bootstrapState: Assistant["bootstrapState"];
  assetRefsText: string;
};

export type BackgroundJobEditorDraft = {
  source: "create" | "edit" | "promote";
  jobId?: string;
  projectId?: string;
  assistantId?: string;
  automationThreadId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastRunAt?: string;
  lastEnqueuedAt?: string;
  createdFromRunId?: string;
  templateId?: string;
  status?: BackgroundJob["status"];
  kind: BackgroundJob["kind"];
  name: string;
  description: string;
  scheduleInput: string;
  timezone: string;
  aiPrompt: string;
  aiModeId?: string;
  aiExecutionModelId?: string;
  aiPlanExecutionMode?: "countdown" | "approve" | "immediate";
  aiSubagentWorktreeStrategy?: "same-worktree" | "separate-worktrees";
  shellExecutable: string;
  shellArgsText: string;
  shellCwd: string;
  shellEnvRefsText: string;
  shellTimeoutSeconds: number;
  shellNetworkAccess: boolean;
};

export type StreamingHeartbeatMessage = {
  id: string;
  content: string;
  heartbeatCount: number;
  locked: boolean;
  updatedAt: string;
};

export type ThreadLiveTranscriptState = {
  isStreaming: boolean;
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  streamingHeartbeatMessages: StreamingHeartbeatMessage[];
  lastError?: string;
};

export type ViewProjectState = WorkspaceProjectState & {
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  streamingHeartbeatMessages: StreamingHeartbeatMessage[];
  threadLiveTranscriptById: Record<string, ThreadLiveTranscriptState>;
  draft: string;
  lastError?: string;
  experimentInspection?: ExperimentInspection;
  memoryEntries: MemoryEntry[];
};

export type ViewWorkspaceState = {
  activeProjectId?: string;
  projects: ViewProjectState[];
  workspaceModes?: ModeDefinition[];
  workspaceRuleSource?: WorkspaceRuleSource;
  workspaceMemorySummary?: MemorySummary;
};

export type ViewAssistantsState = AssistantsState & {
  selectedAssistantId?: string;
  scopeFilter: AssistantScopeFilter;
  streamingByAssistantId: Record<string, string>;
};

export type HarnessViewState = {
  connectionState: ConnectionState;
  connectionError?: string;
  availableAgents: AgentOption[];
  agentRuntimes: AgentRuntimeCapability[];
  setup: SetupState;
  workspace: ViewWorkspaceState;
  activeSurface: HarnessActiveSurface;
  assistants: ViewAssistantsState;
  backgroundJobs: BackgroundJobsState;
  notifications: NotificationInboxState;
  executionControl: ExecutionControlState;
  backgroundJobSchedulePreview?: {
    requestId: string;
    preview: BackgroundJobSchedulePreview;
  };
  backgroundJobEditorOpen: boolean;
  backgroundJobEditorDraft?: BackgroundJobEditorDraft;
  assistantEditorOpen: boolean;
  assistantEditorDraft?: AssistantEditorDraft;
  backgroundJobNotificationsEnabled: boolean;
  projectSwitcherOpen: boolean;
  projectSearchQuery: string;
  projectSearchLoading: boolean;
  projectSearchPendingRequestId?: string;
  projectSearchFilesystemResults: ProjectSearchResult[];
  pendingExecutionModelIds: Record<string, string | undefined>;
  debugEnabled: boolean;
  selectedModeId: string;
  hasGlobalSelectedModeId: boolean;
  selectedAgentId: AgentId;
  hasGlobalSelectedAgentId: boolean;
  selectedExecutionModelId?: ExecutionModelId;
  hasGlobalSelectedExecutionModelId: boolean;
  selectedReasoningStrength: ComposerReasoningStrength;
  hasGlobalSelectedReasoningStrength: boolean;
  selectedFastMode: boolean;
  hasGlobalSelectedFastMode: boolean;
  tracePanelOpen: boolean;
  tracePanelDefaultOpen: boolean;
  hasPersistedTracePanelOpen: boolean;
  executionPlanDialogOpen: boolean;
  selectedExecutionPlan?: ExecutionPlan;
  subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
  blockChatOnDirtyGitDefault: boolean;
  dirtyGitChangeLimitDefault: number;
  autoCompactContextThresholdPercentDefault: number;
  planExecutionModeDefault: "countdown" | "approve" | "immediate";
  planExecutionDelaySecondsDefault: number;
  correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
  backgroundJobApprovalPolicyDefault: BackgroundJobApprovalPolicy;
  memoryBankEnabledDefault: boolean;
  attachmentsEnabled: boolean;
  capabilities: ProviderCapability[];
  preferencesModalOpen: boolean;
  helpDialogOpen: boolean;
  setupChecklistOpen: boolean;
  activeTutorialId?: string;
  activeTutorialStepIndex: number;
  completedTutorialIds: string[];
  dismissedTutorialIds: string[];
  hasUsableApiKey: boolean;
  hasStoredApiKey: boolean;
  hasUsableOpenAiApiKey: boolean;
  hasStoredOpenAiApiKey: boolean;
  hasUsableGoogleApiKey: boolean;
  hasStoredGoogleApiKey: boolean;
  providerBrand: ProviderBrand;
  openAiApiKeyDraft: string;
  googleApiKeyDraft: string;
  apiKeyDirty: boolean;
  hasLocalOpenAiApiKey: boolean;
  hasLocalGoogleApiKey: boolean;
  hasLocalProviderBrandPreference: boolean;
  hasLocalDebugPreference: boolean;
  hasLocalTracePreference: boolean;
  hasLocalSubagentWorktreeStrategyPreference: boolean;
  hasLocalBlockChatOnDirtyGitPreference: boolean;
  hasLocalDirtyGitChangeLimitPreference: boolean;
  hasLocalAutoCompactContextThresholdPercentPreference: boolean;
  hasLocalPlanExecutionModePreference: boolean;
  hasLocalPlanExecutionDelaySecondsPreference: boolean;
  hasLocalCorrectnessIterationModePreference: boolean;
  hasLocalBackgroundJobApprovalPolicyPreference: boolean;
  hasLocalMemoryBankEnabledPreference: boolean;
  lastActiveProjectId?: string;
  lastActiveThreadByProjectId: Record<string, string>;
  projectPreflights: Record<string, { requestId: string; preflight: RunPreflight } | undefined>;
  pendingPreflightCommands: Record<string, ClientCommand | undefined>;
  blockingNonGitPreflight?: {
    requestId: string;
    projectId: string;
    threadId: string;
    preflight: Extract<RunPreflight, { kind: "git-not-repo" }>;
    command?: ClientCommand;
  };
  pendingPreflightRepairKind?: "git-init" | "disable-check";
  cliSessionTerminal: Record<
    string,
    {
      stdout: string;
      stderr: string;
      connected: boolean;
    }
  >;
};

export type LocalPreferencesState = {
  openAiApiKey?: string;
  googleApiKey?: string;
  providerBrand?: ProviderBrand;
  debugEnabled?: boolean;
  tracePanelDefaultOpen?: boolean;
  subagentWorktreeStrategyDefault?: "same-worktree" | "separate-worktrees";
  blockChatOnDirtyGitDefault?: boolean;
  dirtyGitChangeLimitDefault?: number;
  autoCompactContextThresholdPercentDefault?: number;
  planExecutionModeDefault?: "countdown" | "approve" | "immediate";
  planExecutionDelaySecondsDefault?: number;
  correctnessIterationModeDefault?: "ask-before-iterate" | "auto-once" | "auto-until-clean";
  backgroundJobApprovalPolicyDefault?: BackgroundJobApprovalPolicy;
  memoryBankEnabledDefault?: boolean;
  backgroundJobNotificationsEnabled?: boolean;
  selectedReasoningStrength?: ComposerReasoningStrength;
  selectedFastMode?: boolean;
};

export function createInitialWorkspaceState(): ViewWorkspaceState {
  return {
    activeProjectId: undefined,
    projects: [],
    workspaceModes: [],
    workspaceRuleSource: undefined,
    workspaceMemorySummary: undefined
  };
}

export function createEmptyBackgroundJobsState(): BackgroundJobsState {
  return {
    jobs: [],
    runs: [],
    templates: []
  };
}

export function createEmptyAssistantsState(): ViewAssistantsState {
  return {
    assistants: [],
    threads: [],
    todos: [],
    learnings: [],
    questions: [],
    logs: [],
    assetRefs: [],
    selectedAssistantId: undefined,
    scopeFilter: "project",
    streamingByAssistantId: {}
  };
}

export function createInitialExecutionControlState(): ExecutionControlState {
  return {
    isPaused: false,
    deferredPlanningQuestionCount: 0,
    deferredAssistantQuestionCount: 0,
    deferredBrowserApprovalCount: 0
  };
}

export function createEmptyNotificationInboxState(): NotificationInboxState {
  return {
    items: [],
    unreadCount: 0,
    interactiveUnreadCount: 0,
    passiveUnreadCount: 0
  };
}

export function createInitialSetupState(): SetupState {
  return {
    launchMode: "source",
    updatedAt: new Date(0).toISOString(),
    readyRequiredCount: 0,
    totalRequiredCount: 0,
    checks: []
  };
}

export function createInitialViewState(): HarnessViewState {
  return {
    connectionState: "disconnected",
    connectionError: undefined,
    availableAgents: [...defaultAgentCatalog],
    agentRuntimes: [],
    setup: createInitialSetupState(),
    workspace: createInitialWorkspaceState(),
    activeSurface: "chat",
    assistants: createEmptyAssistantsState(),
    backgroundJobs: createEmptyBackgroundJobsState(),
    notifications: createEmptyNotificationInboxState(),
    executionControl: createInitialExecutionControlState(),
    backgroundJobSchedulePreview: undefined,
    backgroundJobEditorOpen: false,
    backgroundJobEditorDraft: undefined,
    assistantEditorOpen: false,
    assistantEditorDraft: undefined,
    backgroundJobNotificationsEnabled: false,
    projectSwitcherOpen: false,
    projectSearchQuery: "",
    projectSearchLoading: false,
    projectSearchPendingRequestId: undefined,
    projectSearchFilesystemResults: [],
    pendingExecutionModelIds: {},
    debugEnabled: false,
    selectedModeId: DEFAULT_MODE_ID,
    hasGlobalSelectedModeId: false,
    selectedAgentId: "pi",
    hasGlobalSelectedAgentId: false,
    selectedExecutionModelId: undefined,
    hasGlobalSelectedExecutionModelId: false,
    selectedReasoningStrength: DEFAULT_COMPOSER_REASONING_STRENGTH,
    hasGlobalSelectedReasoningStrength: false,
    selectedFastMode: false,
    hasGlobalSelectedFastMode: false,
    tracePanelOpen: true,
    tracePanelDefaultOpen: true,
    hasPersistedTracePanelOpen: false,
    executionPlanDialogOpen: false,
    selectedExecutionPlan: undefined,
    subagentWorktreeStrategyDefault: "same-worktree",
    blockChatOnDirtyGitDefault: true,
    dirtyGitChangeLimitDefault: 20,
    autoCompactContextThresholdPercentDefault: 40,
    planExecutionModeDefault: "countdown",
    planExecutionDelaySecondsDefault: 10,
    correctnessIterationModeDefault: "ask-before-iterate",
    backgroundJobApprovalPolicyDefault: "ask-risky",
    memoryBankEnabledDefault: true,
    attachmentsEnabled: false,
    capabilities: [...defaultProviderCapabilities],
    preferencesModalOpen: false,
    helpDialogOpen: false,
    setupChecklistOpen: false,
    activeTutorialId: undefined,
    activeTutorialStepIndex: 0,
    completedTutorialIds: [],
    dismissedTutorialIds: [],
    hasUsableApiKey: false,
    hasStoredApiKey: false,
    hasUsableOpenAiApiKey: false,
    hasStoredOpenAiApiKey: false,
    hasUsableGoogleApiKey: false,
    hasStoredGoogleApiKey: false,
    providerBrand: "gpt",
    openAiApiKeyDraft: "",
    googleApiKeyDraft: "",
    apiKeyDirty: false,
    hasLocalOpenAiApiKey: false,
    hasLocalGoogleApiKey: false,
    hasLocalProviderBrandPreference: false,
    hasLocalDebugPreference: false,
    hasLocalTracePreference: false,
    hasLocalSubagentWorktreeStrategyPreference: false,
    hasLocalBlockChatOnDirtyGitPreference: false,
    hasLocalDirtyGitChangeLimitPreference: false,
    hasLocalAutoCompactContextThresholdPercentPreference: false,
    hasLocalPlanExecutionModePreference: false,
    hasLocalPlanExecutionDelaySecondsPreference: false,
    hasLocalCorrectnessIterationModePreference: false,
    hasLocalBackgroundJobApprovalPolicyPreference: false,
    hasLocalMemoryBankEnabledPreference: false,
    lastActiveProjectId: undefined,
    lastActiveThreadByProjectId: {},
    projectPreflights: {},
    pendingPreflightCommands: {},
    blockingNonGitPreflight: undefined,
    pendingPreflightRepairKind: undefined,
    cliSessionTerminal: {}
  };
}

export function getActiveProject(state: HarnessViewState) {
  return state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId);
}

export function getVisibleAssistants(state: HarnessViewState) {
  return state.assistants.assistants.filter((assistant) =>
    state.assistants.scopeFilter === "global"
      ? assistant.scope === "global"
      : assistant.scope === "project" && assistant.projectId === state.workspace.activeProjectId
  );
}

export function getSelectedAssistant(state: HarnessViewState) {
  const visibleAssistants = getVisibleAssistants(state);
  if (state.assistants.selectedAssistantId) {
    const selected = visibleAssistants.find((assistant) => assistant.id === state.assistants.selectedAssistantId);
    if (selected) {
      return selected;
    }
  }
  return visibleAssistants[0];
}

export function reduceServerEvent(state: HarnessViewState, event: ServerEvent): HarnessViewState {
  switch (event.type) {
    case "connection.ready":
      return {
        ...state,
        availableAgents: [...event.payload.agents],
        setup: event.payload.setup,
        workspace: hydrateWorkspace(event.payload.workspace),
        assistants: hydrateAssistants(state.assistants, event.payload.assistants),
        backgroundJobs: event.payload.backgroundJobs,
        notifications: event.payload.notifications,
        executionControl: event.payload.executionControl,
        projectPreflights: {},
        pendingPreflightCommands: {},
        blockingNonGitPreflight: undefined,
        pendingPreflightRepairKind: undefined,
        ...applyReadyPreferencesState(state, event.payload.preferences)
      };
    case "notifications.updated":
      return {
        ...state,
        notifications: event.payload.notifications
      };
    case "agent.list":
      return {
        ...state,
        availableAgents: [...event.payload.agents]
      };
    case "agent.runtime.updated":
      return {
        ...state,
        agentRuntimes: [...event.payload.agentRuntimes]
      };
    case "project.opened":
      return {
        ...state,
        projectSwitcherOpen: false,
        projectSearchQuery: "",
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: [],
        workspace: {
          activeProjectId: event.payload.activeProjectId,
          projects: upsertProject(state.workspace.projects, toViewProject(event.payload.project))
        }
      };
    case "project.removed":
      return {
        ...state,
        workspace: {
          activeProjectId: event.payload.activeProjectId,
          projects: state.workspace.projects.filter((project) => project.id !== event.payload.projectId)
        }
      };
    case "project.activated":
      return {
        ...state,
        projectSwitcherOpen: false,
        projectSearchQuery: "",
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: [],
        workspace: {
          ...state.workspace,
          activeProjectId: event.payload.projectId,
          projects: moveProjectToFront(state.workspace.projects, event.payload.projectId)
        }
      };
    case "project.search.results":
      return applyProjectSearchResultsState(state, event.requestId, event.payload.query, event.payload.results);
    case "workspace.updated":
      return {
        ...state,
        workspace: mergeIncomingWorkspace(state.workspace, hydrateWorkspace(event.payload.workspace))
      };
    case "project.updated":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: upsertProject(
            state.workspace.projects,
            mergeIncomingProject(
              state.workspace.projects.find((project) => project.id === event.payload.projectId) ?? toViewProject(event.payload.project),
              toViewProject(event.payload.project)
            )
          )
        }
      };
    case "thread.created":
    case "thread.activated":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) =>
          mergeIncomingProject(project, toViewProject(event.payload.project))
        ),
        executionPlanDialogOpen: false,
        selectedExecutionPlan: undefined
      };
    case "thread.renamed":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        threads: project.threads.map((thread) => (thread.id === event.payload.thread.id ? event.payload.thread : thread))
      }));
    case "agent.plan":
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            latestPlan: project.activeThreadId === event.payload.threadId ? event.payload.plan : project.latestPlan,
            threads: setThreadBadge(project.threads, event.payload.threadId, "planning")
          },
          event.payload.threadId,
          project.threadLiveTranscriptById[event.payload.threadId] ??
            createThreadLiveTranscriptState({
              isStreaming: project.activeThreadId === event.payload.threadId ? project.session.isStreaming : false
            })
        )
      );
    case "agent.trace":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        traces: project.activeThreadId === event.payload.threadId ? [...project.traces, event.payload.trace] : project.traces
      }));
    case "chat.delta":
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, event.payload.threadId, "executing")
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[event.payload.threadId] ??
              (project.activeThreadId === event.payload.threadId
                ? getActiveThreadLiveTranscriptState(project)
                : undefined)),
            isStreaming: true,
            streamingAssistantText: `${
              (project.threadLiveTranscriptById[event.payload.threadId]?.streamingAssistantText ??
                (project.activeThreadId === event.payload.threadId ? project.streamingAssistantText : ""))
            }${event.payload.delta}`,
            lastError: undefined
          })
        )
      );
    case "chat.streaming-tail-updated":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, event.payload.threadId, "executing"),
            session:
              project.activeThreadId === event.payload.threadId
                ? {
                  ...event.payload.state,
                  isStreaming: true,
                  lastError: undefined
                }
                : project.session
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            isStreaming: true,
            streamingTailSegments: event.payload.segments,
            streamingHeartbeatMessages: rolloverStreamingHeartbeatMessages(
              priorLiveTranscript?.streamingHeartbeatMessages ?? [],
              event.payload.runId,
              renderStreamingStatusTailSegments(event.payload.segments),
              getLatestStreamingTailTimestamp(event.payload.segments)
            ),
            lastError: undefined
          })
        );
      });
    case "chat.complete":
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            threads: updateThreadSummaryFromMessage(
              setThreadBadge(project.threads, event.payload.threadId, "done"),
              event.payload.threadId,
              event.payload.assistantMessage
            ),
            session:
              project.activeThreadId === event.payload.threadId
                ? {
                  ...event.payload.state,
                  isStreaming: false,
                  lastError: undefined
                }
                : project.session
          },
          event.payload.threadId,
          createThreadLiveTranscriptState()
        )
      );
    case "chat.message-appended":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
        threads: updateThreadSummaryFromMessage(project.threads, event.payload.threadId, event.payload.message),
        session:
          project.activeThreadId === event.payload.threadId
            ? {
              ...event.payload.state,
              lastError: event.payload.state.lastError
            }
            : project.session
      }));
    case "chat.message-updated":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
        threads: updateThreadSummaryFromUpdatedMessage(project.threads, event.payload.threadId, event.payload.message),
        session:
          project.activeThreadId === event.payload.threadId
            ? {
              ...event.payload.state,
              lastError: event.payload.state.lastError
            }
            : project.session
      }));
    case "chat.error":
      if (!event.payload.projectId) {
        return state;
      }

      if (!event.payload.threadId) {
        return updateProjectState(state, event.payload.projectId, (project) => ({
          ...project,
          lastError: event.payload.detail ?? event.payload.message,
          session: {
            ...project.session,
            isStreaming: false,
            lastError: event.payload.detail ?? event.payload.message
          }
        }));
      }

      const errorThreadId = event.payload.threadId;
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, errorThreadId, "error"),
            session:
              project.activeThreadId === errorThreadId
                ? {
                  ...project.session,
                  isStreaming: false,
                  lastError: event.payload.detail ?? event.payload.message
                }
                : project.session
          },
          errorThreadId,
          createThreadLiveTranscriptState({
            lastError: event.payload.detail ?? event.payload.message
          })
        )
      );
    case "session.reset":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) => ({
          ...project,
          activeThreadId: event.payload.threadId,
          latestPlan: undefined,
          activeRun: undefined,
          lastRun: undefined,
          contextUsage: undefined,
          traces: [],
          streamingAssistantText: "",
          streamingTailSegments: [],
          streamingHeartbeatMessages: [],
          threadLiveTranscriptById: {
            ...filterThreadLiveTranscriptByKnownThreads(project.threadLiveTranscriptById, project.threads),
            [event.payload.threadId]: createThreadLiveTranscriptState()
          },
          lastError: undefined,
          draft: readThreadDraft(event.payload.projectId, event.payload.threadId),
          session: {
            ...event.payload.state,
            isStreaming: false,
            lastError: undefined
          }
        })),
        executionPlanDialogOpen: false,
        selectedExecutionPlan: undefined
      };
    case "run.updated":
      const currentProject = state.workspace.projects.find((project) => project.id === event.payload.projectId);
      const isActiveThread = currentProject?.activeThreadId === event.payload.threadId;
      const latestKnownRunId = isActiveThread ? currentProject?.activeRun?.id ?? currentProject?.lastRun?.id : undefined;
      const resetPlanningTransients =
        isActiveThread &&
        event.payload.run.status === "planning" &&
        latestKnownRunId !== undefined &&
        latestKnownRunId !== event.payload.run.id;

      return {
        ...updateProjectState(state, event.payload.projectId, (project) => {
          const appliesToActiveThread = project.activeThreadId === event.payload.threadId;
          return {
            ...project,
            latestPlan: appliesToActiveThread && resetPlanningTransients ? undefined : project.latestPlan,
            contextUsage: appliesToActiveThread && resetPlanningTransients ? undefined : project.contextUsage,
            traces: appliesToActiveThread && resetPlanningTransients ? [] : project.traces,
            streamingAssistantText: appliesToActiveThread && resetPlanningTransients ? "" : project.streamingAssistantText,
            streamingTailSegments: appliesToActiveThread && resetPlanningTransients ? [] : project.streamingTailSegments,
            streamingHeartbeatMessages:
              appliesToActiveThread && resetPlanningTransients ? [] : project.streamingHeartbeatMessages,
            threadLiveTranscriptById:
              appliesToActiveThread && resetPlanningTransients
                ? {
                  ...project.threadLiveTranscriptById,
                  [event.payload.threadId]: createThreadLiveTranscriptState()
                }
                : project.threadLiveTranscriptById,
            lastError: appliesToActiveThread && resetPlanningTransients ? undefined : project.lastError,
            activeRun: appliesToActiveThread ? (event.payload.run.status === "completed" ? undefined : event.payload.run) : project.activeRun,
            lastRun: appliesToActiveThread ? event.payload.run : project.lastRun,
            runSummaries: appliesToActiveThread ? upsertRunSummary(project.runSummaries, toRunSummary(event.payload.run)) : project.runSummaries,
            threads: setThreadBadge(project.threads, event.payload.threadId, badgeFromRunStatus(event.payload.run.status))
          };
        }),
        executionPlanDialogOpen: resetPlanningTransients ? false : state.executionPlanDialogOpen,
        selectedExecutionPlan: resetPlanningTransients ? undefined : state.selectedExecutionPlan,
        projectPreflights: {
          ...state.projectPreflights,
          [event.payload.projectId]:
            event.payload.run.status === "planning"
              ? undefined
              : state.projectPreflights[event.payload.projectId]?.requestId === event.requestId
              ? state.projectPreflights[event.payload.projectId]
              : undefined
        }
      };
    case "experiment.inspected":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        experimentInspection: project.activeThreadId === event.payload.threadId ? event.payload.inspection : project.experimentInspection
      }));
    case "memory.listed":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        memoryEntries: event.payload.entries
      }));
    case "memory.inspected":
      return state;
    case "memory.updated":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects.map((project) => ({
            ...project,
            memoryEntries: project.memoryEntries.map((entry) =>
              entry.id === event.payload.entry.id ? event.payload.entry : entry
            )
          }))
        }
      };
    case "memory.deleted":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects.map((project) => ({
            ...project,
            memoryEntries: project.memoryEntries.filter((entry) => entry.id !== event.payload.memoryEntryId)
          }))
        }
      };
    case "cli-session.started":
    case "cli-session.updated":
    case "cli-session.exited":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        activeCliSession: project.activeThreadId === event.payload.threadId ? event.payload.session : project.activeCliSession
      }));
    case "cli-session.attach-ready":
    case "cli-session.hang-detected":
      return state;
    case "background-jobs.updated":
      return {
        ...state,
        backgroundJobs: event.payload.backgroundJobs
      };
    case "execution-control.updated":
      return {
        ...state,
        executionControl: event.payload.executionControl
      };
    case "assistants.updated":
      return {
        ...state,
        assistants: hydrateAssistants(state.assistants, event.payload.assistants)
      };
    case "assistant.updated":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          assistants: upsertById(state.assistants.assistants, event.payload.assistant)
        }
      };
    case "assistant.chat.delta":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          streamingByAssistantId: {
            ...state.assistants.streamingByAssistantId,
            [event.payload.assistantId]:
              (state.assistants.streamingByAssistantId[event.payload.assistantId] ?? "") + event.payload.delta
          }
        }
      };
    case "assistant.chat.complete":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          threads: upsertById(state.assistants.threads, event.payload.thread),
          streamingByAssistantId: {
            ...state.assistants.streamingByAssistantId,
            [event.payload.assistantId]: ""
          }
        }
      };
    case "assistant.question.updated":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          questions: upsertById(state.assistants.questions, event.payload.question)
        }
      };
    case "assistant.todo.updated":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          todos: upsertById(state.assistants.todos, event.payload.todo)
        }
      };
    case "assistant.log.appended":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          logs: [event.payload.entry, ...state.assistants.logs.filter((entry) => entry.id !== event.payload.entry.id)]
        }
      };
    case "assistant.created-card":
      return {
        ...state,
        activeSurface: "assistants",
        assistants: {
          ...state.assistants,
          selectedAssistantId: event.payload.assistant.id
        }
      };
    case "background-job-run.updated":
      return {
        ...state,
        backgroundJobs: {
          ...state.backgroundJobs,
          runs: upsertBackgroundJobRun(state.backgroundJobs.runs, event.payload.run)
        }
      };
    case "background-job-schedule.preview":
      return {
        ...state,
        backgroundJobSchedulePreview: {
          requestId: event.requestId,
          preview: event.payload
        }
      };
    case "run.preflight":
      return {
        ...state,
        projectPreflights: {
          ...state.projectPreflights,
          [event.payload.projectId]: {
            requestId: event.requestId,
            preflight: event.payload.preflight
          }
        },
        blockingNonGitPreflight:
          event.payload.preflight.kind === "git-not-repo"
            ? {
                requestId: event.requestId,
                projectId: event.payload.projectId,
                threadId: event.payload.threadId,
                preflight: event.payload.preflight,
                command: state.pendingPreflightCommands[event.requestId]
              }
            : state.blockingNonGitPreflight
      };
    case "project.git.initialized":
      return state;
    case "run.cleared":
      return updateThreadScopedProject(state, event.payload.projectId, event.payload.threadId, (project) => ({
        ...project,
        activeRun: project.activeRun?.id === event.payload.runId ? undefined : project.activeRun
      }));
    case "project.context":
      return updateThreadScopedProject(state, event.payload.projectId, event.payload.threadId, (project) => ({
        ...project,
        contextUsage: event.payload.contextUsage
      }));
    case "command.rejected":
    case "connection.pong":
      return state;
    case "preferences.saved":
    case "preferences.apiKeyCleared":
      return {
        ...state,
        setup: event.payload.setup,
        ...applyReadyPreferencesState(state, event.payload)
      };
    case "setup.updated":
      return {
        ...state,
        setup: event.payload.setup
      };
    default:
      return state;
  }
}

export function createHarnessStore() {
  const [state, setState] = createStore(createInitialViewState());
  let commandDispatcher: ((command: ClientCommand) => void) | undefined;

  const persistBrowserUiStateIfChanged = (previousSnapshot: BrowserUiSessionState, nextState: HarnessViewState) => {
    const nextSnapshot = getBrowserUiSessionSnapshot(nextState);
    if (JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot)) {
      persistBrowserUiSession(nextSnapshot);
    }
  };

  return {
    state,
    actions: {
      setCommandDispatcher(dispatcher?: (command: ClientCommand) => void) {
        commandDispatcher = dispatcher;
      },
      sendCommand(command: ClientCommand) {
        if (!commandDispatcher) {
          const error = new Error("Command dispatcher unavailable");
          pushToast("Connection unavailable", "Wait for workspace connection before sending commands.", "error");
          reportUiError(error, "Command send failed", { rethrow: "dev-only" });
          return false;
        }

        try {
          if (isPreflightCapableCommand(command)) {
            setState("pendingPreflightCommands", {
              ...state.pendingPreflightCommands,
              [command.requestId]: command
            });
          }
          commandDispatcher(command);
          return true;
        } catch (error) {
          pushToast("Command failed", error instanceof Error ? error.message : "Command send failed.", "error");
          reportUiError(error, "Command send failed", { rethrow: "dev-only" });
          return false;
        }
      },
      hydrateBrowserUiSession() {
        const browserUiSession = readBrowserUiSession();
        const previousSnapshot = browserUiSession;
        const nextState = finalizeHarnessViewState({
          ...state,
          selectedModeId: browserUiSession.selectedModeId ?? state.selectedModeId,
          hasGlobalSelectedModeId: browserUiSession.selectedModeId !== undefined,
          selectedAgentId: browserUiSession.selectedAgentId ?? state.selectedAgentId,
          hasGlobalSelectedAgentId: browserUiSession.selectedAgentId !== undefined,
          selectedExecutionModelId: browserUiSession.selectedExecutionModelId,
          hasGlobalSelectedExecutionModelId: browserUiSession.selectedExecutionModelId !== undefined,
          selectedReasoningStrength: browserUiSession.selectedReasoningStrength ?? state.selectedReasoningStrength,
          hasGlobalSelectedReasoningStrength: browserUiSession.selectedReasoningStrength !== undefined,
          selectedFastMode: browserUiSession.selectedFastMode ?? state.selectedFastMode,
          hasGlobalSelectedFastMode: browserUiSession.selectedFastMode !== undefined,
          tracePanelOpen: browserUiSession.tracePanelOpen ?? state.tracePanelOpen,
          hasPersistedTracePanelOpen: browserUiSession.tracePanelOpen !== undefined,
          lastActiveProjectId: browserUiSession.lastActiveProjectId,
          lastActiveThreadByProjectId: { ...(browserUiSession.lastActiveThreadByProjectId ?? {}) }
        });
        setState(reconcile(nextState));
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
        return browserUiSession;
      },
      persistBrowserUiSession() {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(state));
      }
    },
    setConnectionState(connectionState: ConnectionState, connectionError?: string) {
      setState({
        connectionState,
        connectionError
      });
    },
    openProjectSwitcher(initialQuery: string = "") {
      setState({
        projectSwitcherOpen: true,
        projectSearchQuery: initialQuery,
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: []
      });
    },
    closeProjectSwitcher() {
      setState({
        projectSwitcherOpen: false,
        projectSearchQuery: "",
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: []
      });
    },
    setProjectSearchQuery(projectSearchQuery: string) {
      setState({ projectSearchQuery });
    },
    startProjectSearch(requestId: string, query: string) {
      setState({
        projectSearchLoading: true,
        projectSearchPendingRequestId: requestId,
        projectSearchQuery: query,
        projectSearchFilesystemResults: []
      });
    },
    applyProjectSearchResults(requestId: string, query: string, results: ProjectSearchResult[]) {
      setState(reconcile(applyProjectSearchResultsState(state, requestId, query, results)));
    },
    clearProjectSearchResults() {
      setState({
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: []
      });
    },
    setActiveSurface(activeSurface: HarnessActiveSurface) {
      setState({ activeSurface });
    },
    setAssistantScopeFilter(scopeFilter: AssistantScopeFilter) {
      setState("assistants", "scopeFilter", scopeFilter);
    },
    setSelectedAssistantId(assistantId?: string) {
      setState("assistants", "selectedAssistantId", assistantId);
    },
    openAssistantEditor(assistantEditorDraft: AssistantEditorDraft) {
      setState({
        assistantEditorOpen: true,
        assistantEditorDraft,
        activeSurface: "assistants"
      });
    },
    closeAssistantEditor() {
      setState({
        assistantEditorOpen: false,
        assistantEditorDraft: undefined
      });
    },
    openBackgroundJobEditor(backgroundJobEditorDraft: BackgroundJobEditorDraft) {
      setState({
        backgroundJobEditorOpen: true,
        backgroundJobEditorDraft,
        activeSurface: "background-jobs"
      });
    },
    closeBackgroundJobEditor() {
      setState({
        backgroundJobEditorOpen: false,
        backgroundJobEditorDraft: undefined,
        backgroundJobSchedulePreview: undefined
      });
    },
    clearBackgroundJobSchedulePreview() {
      setState({ backgroundJobSchedulePreview: undefined });
    },
    setBackgroundJobNotificationsEnabled(backgroundJobNotificationsEnabled: boolean) {
      setState({ backgroundJobNotificationsEnabled });
    },
    setProjectDraft(projectId: string, draft: string) {
      const project = state.workspace.projects.find((entry) => entry.id === projectId);
      if (!project) {
        return;
      }

      persistThreadDraft(projectId, project.activeThreadId, draft);
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "draft",
        draft
      );
    },
    syncProjectDraft(projectId: string, threadId: string) {
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "draft",
        readThreadDraft(projectId, threadId)
      );
    },
    setPendingExecutionModelId(projectId: string, modelId?: string) {
      setState("pendingExecutionModelIds", {
        ...state.pendingExecutionModelIds,
        [projectId]: modelId?.trim() ? modelId.trim() : undefined
      });
    },
    clearPendingExecutionModelId(projectId: string) {
      setState("pendingExecutionModelIds", {
        ...state.pendingExecutionModelIds,
        [projectId]: undefined
      });
    },
    setProjectSelectedAgentId(projectId: string, selectedAgentId: AgentOption["id"]) {
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "session",
        "selectedAgentId",
        selectedAgentId
      );
    },
    setSelectedModeId(selectedModeId: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedModeId,
        hasGlobalSelectedModeId: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedAgentId(selectedAgentId: AgentId) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedAgentId,
        hasGlobalSelectedAgentId: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedExecutionModelId(selectedExecutionModelId?: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const normalizedExecutionModelId = selectedExecutionModelId?.trim();
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedExecutionModelId: normalizedExecutionModelId ? (normalizedExecutionModelId as ExecutionModelId) : undefined,
        hasGlobalSelectedExecutionModelId: Boolean(normalizedExecutionModelId)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedReasoningStrength(selectedReasoningStrength: ComposerReasoningStrength) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedReasoningStrength,
        hasGlobalSelectedReasoningStrength: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      persistComposerControlPreferences(nextState);
    },
    setSelectedFastMode(selectedFastMode: boolean) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedFastMode,
        hasGlobalSelectedFastMode: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      persistComposerControlPreferences(nextState);
    },
    appendCliTerminalOutput(sessionId: string, stream: "stdout" | "stderr", text: string) {
      const existing = state.cliSessionTerminal[sessionId] ?? {
        stdout: "",
        stderr: "",
        connected: false
      };
      setState("cliSessionTerminal", {
        ...state.cliSessionTerminal,
        [sessionId]: {
          ...existing,
          [stream]: `${existing[stream]}${text}`.slice(-200_000)
        }
      });
    },
    setCliTerminalConnected(sessionId: string, connected: boolean) {
      const existing = state.cliSessionTerminal[sessionId] ?? {
        stdout: "",
        stderr: "",
        connected: false
      };
      setState("cliSessionTerminal", {
        ...state.cliSessionTerminal,
        [sessionId]: {
          ...existing,
          connected
        }
      });
    },
    resetCliTerminalOutput(sessionId: string) {
      setState("cliSessionTerminal", {
        ...state.cliSessionTerminal,
        [sessionId]: {
          stdout: "",
          stderr: "",
          connected: false
        }
      });
    },
    setDebugEnabled(debugEnabled: boolean) {
      setState({ debugEnabled });
    },
    setTracePanelOpen(tracePanelOpen: boolean) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        tracePanelOpen,
        hasPersistedTracePanelOpen: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    toggleTracePanel() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        tracePanelOpen: !state.tracePanelOpen,
        hasPersistedTracePanelOpen: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setTracePanelDefaultOpen(tracePanelDefaultOpen: boolean) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        tracePanelDefaultOpen,
        tracePanelOpen: state.hasPersistedTracePanelOpen ? state.tracePanelOpen : tracePanelDefaultOpen
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    openExecutionPlanDialog(executionPlan: ExecutionPlan) {
      setState({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: executionPlan
      });
    },
    closeExecutionPlanDialog() {
      setState({
        executionPlanDialogOpen: false,
        selectedExecutionPlan: undefined
      });
    },
    setSubagentWorktreeStrategyDefault(subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees") {
      setState({ subagentWorktreeStrategyDefault });
    },
    setBlockChatOnDirtyGitDefault(blockChatOnDirtyGitDefault: boolean) {
      setState({ blockChatOnDirtyGitDefault });
    },
    setDirtyGitChangeLimitDefault(dirtyGitChangeLimitDefault: number) {
      setState({ dirtyGitChangeLimitDefault: Math.max(0, Math.min(10000, Math.round(dirtyGitChangeLimitDefault))) });
    },
    setAutoCompactContextThresholdPercentDefault(autoCompactContextThresholdPercentDefault: number) {
      setState({
        autoCompactContextThresholdPercentDefault: Math.max(10, Math.min(95, Math.round(autoCompactContextThresholdPercentDefault)))
      });
    },
    setPlanExecutionModeDefault(planExecutionModeDefault: "countdown" | "approve" | "immediate") {
      setState({ planExecutionModeDefault });
    },
    setPlanExecutionDelaySecondsDefault(planExecutionDelaySecondsDefault: number) {
      setState({ planExecutionDelaySecondsDefault });
    },
    setCorrectnessIterationModeDefault(correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean") {
      setState({ correctnessIterationModeDefault });
    },
    setBackgroundJobApprovalPolicyDefault(backgroundJobApprovalPolicyDefault: BackgroundJobApprovalPolicy) {
      setState({ backgroundJobApprovalPolicyDefault });
    },
    openPreferencesModal() {
      setState({ preferencesModalOpen: true });
    },
    closePreferencesModal() {
      setState({ preferencesModalOpen: false });
    },
    openHelpDialog() {
      setState({ helpDialogOpen: true, setupChecklistOpen: true });
    },
    closeHelpDialog() {
      setState({ helpDialogOpen: false });
    },
    openSetupChecklist() {
      setState({ setupChecklistOpen: true });
    },
    closeSetupChecklist() {
      setState({ setupChecklistOpen: false });
    },
    prepareNonGitPreflightRepair(kind: "git-init" | "disable-check") {
      setState({ pendingPreflightRepairKind: kind });
    },
    clearBlockingNonGitPreflight() {
      setState({
        blockingNonGitPreflight: undefined,
        pendingPreflightRepairKind: undefined
      });
    },
    startTutorial(tutorialId: string) {
      const progress = readTutorialProgress();
      const dismissedTutorialIds = progress.dismissedTutorialIds.filter((id) => id !== tutorialId);
      persistTutorialProgress({
        completedTutorialIds: progress.completedTutorialIds,
        dismissedTutorialIds
      });
      setState({
        helpDialogOpen: false,
        setupChecklistOpen: true,
        activeTutorialId: tutorialId,
        activeTutorialStepIndex: 0,
        dismissedTutorialIds
      });
    },
    setActiveTutorialStepIndex(activeTutorialStepIndex: number) {
      setState({ activeTutorialStepIndex: Math.max(0, activeTutorialStepIndex) });
    },
    finishTutorial(tutorialId: string) {
      const progress = readTutorialProgress();
      const completedTutorialIds = [...new Set([...progress.completedTutorialIds, tutorialId])];
      const dismissedTutorialIds = progress.dismissedTutorialIds.filter((id) => id !== tutorialId);
      persistTutorialProgress({ completedTutorialIds, dismissedTutorialIds });
      setState({
        activeTutorialId: undefined,
        activeTutorialStepIndex: 0,
        completedTutorialIds,
        dismissedTutorialIds
      });
    },
    dismissTutorial(tutorialId?: string) {
      const nextTutorialId = tutorialId ?? state.activeTutorialId;
      if (!nextTutorialId) {
        setState({
          activeTutorialId: undefined,
          activeTutorialStepIndex: 0
        });
        return;
      }

      const progress = readTutorialProgress();
      const dismissedTutorialIds = [...new Set([...progress.dismissedTutorialIds, nextTutorialId])];
      persistTutorialProgress({
        completedTutorialIds: progress.completedTutorialIds,
        dismissedTutorialIds
      });
      setState({
        activeTutorialId: undefined,
        activeTutorialStepIndex: 0,
        dismissedTutorialIds
      });
    },
    setOpenAiApiKeyDraft(openAiApiKeyDraft: string) {
      setState({
        openAiApiKeyDraft,
        apiKeyDirty: true
      });
    },
    setGoogleApiKeyDraft(googleApiKeyDraft: string) {
      setState({
        googleApiKeyDraft,
        apiKeyDirty: true
      });
    },
    setProviderBrand(providerBrand: ProviderBrand) {
      setState(reconcile(finalizeHarnessViewState({
        ...state,
        providerBrand,
        apiKeyDirty: true
      })));
    },
    commitLocalPreferences(localPreferences: LocalPreferencesState) {
      setState(reconcile(finalizeHarnessViewState({
        ...state,
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelOpen:
          state.hasPersistedTracePanelOpen ? state.tracePanelOpen : localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault:
          localPreferences.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: localPreferences.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: localPreferences.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          localPreferences.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: localPreferences.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault:
          localPreferences.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault:
          localPreferences.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          localPreferences.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        memoryBankEnabledDefault: localPreferences.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        backgroundJobNotificationsEnabled:
          localPreferences.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        selectedReasoningStrength: localPreferences.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: localPreferences.selectedFastMode ?? state.selectedFastMode,
        hasGlobalSelectedReasoningStrength:
          localPreferences.selectedReasoningStrength !== undefined || state.hasGlobalSelectedReasoningStrength,
        hasGlobalSelectedFastMode: localPreferences.selectedFastMode !== undefined || state.hasGlobalSelectedFastMode,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalProviderBrandPreference: localPreferences.providerBrand !== undefined,
        hasLocalDebugPreference: localPreferences.debugEnabled !== undefined,
        hasLocalTracePreference: localPreferences.tracePanelDefaultOpen !== undefined,
        hasLocalSubagentWorktreeStrategyPreference: localPreferences.subagentWorktreeStrategyDefault !== undefined,
        hasLocalBlockChatOnDirtyGitPreference: localPreferences.blockChatOnDirtyGitDefault !== undefined,
        hasLocalDirtyGitChangeLimitPreference: localPreferences.dirtyGitChangeLimitDefault !== undefined,
        hasLocalAutoCompactContextThresholdPercentPreference:
          localPreferences.autoCompactContextThresholdPercentDefault !== undefined,
        hasLocalPlanExecutionModePreference: localPreferences.planExecutionModeDefault !== undefined,
        hasLocalPlanExecutionDelaySecondsPreference: localPreferences.planExecutionDelaySecondsDefault !== undefined,
        hasLocalCorrectnessIterationModePreference: localPreferences.correctnessIterationModeDefault !== undefined,
        hasLocalBackgroundJobApprovalPolicyPreference: localPreferences.backgroundJobApprovalPolicyDefault !== undefined,
        hasLocalMemoryBankEnabledPreference: localPreferences.memoryBankEnabledDefault !== undefined
      })));
    },
    setHasUsableApiKey(hasUsableApiKey: boolean) {
      setState({ hasUsableApiKey });
    },
    hydrateLocalPreferences() {
      const localPreferences = readLocalPreferences();
      const nextState = finalizeHarnessViewState({
        ...state,
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelOpen:
          state.hasPersistedTracePanelOpen ? state.tracePanelOpen : localPreferences.tracePanelDefaultOpen ?? state.tracePanelOpen,
        subagentWorktreeStrategyDefault:
          localPreferences.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: localPreferences.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: localPreferences.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          localPreferences.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: localPreferences.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault:
          localPreferences.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault:
          localPreferences.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          localPreferences.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        memoryBankEnabledDefault: localPreferences.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        backgroundJobNotificationsEnabled:
          localPreferences.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        selectedReasoningStrength: localPreferences.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: localPreferences.selectedFastMode ?? state.selectedFastMode,
        hasGlobalSelectedReasoningStrength:
          localPreferences.selectedReasoningStrength !== undefined || state.hasGlobalSelectedReasoningStrength,
        hasGlobalSelectedFastMode: localPreferences.selectedFastMode !== undefined || state.hasGlobalSelectedFastMode,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalProviderBrandPreference: localPreferences.providerBrand !== undefined,
        hasLocalDebugPreference: localPreferences.debugEnabled !== undefined,
        hasLocalTracePreference: localPreferences.tracePanelDefaultOpen !== undefined,
        hasLocalSubagentWorktreeStrategyPreference: localPreferences.subagentWorktreeStrategyDefault !== undefined,
        hasLocalBlockChatOnDirtyGitPreference: localPreferences.blockChatOnDirtyGitDefault !== undefined,
        hasLocalDirtyGitChangeLimitPreference: localPreferences.dirtyGitChangeLimitDefault !== undefined,
        hasLocalAutoCompactContextThresholdPercentPreference:
          localPreferences.autoCompactContextThresholdPercentDefault !== undefined,
        hasLocalPlanExecutionModePreference: localPreferences.planExecutionModeDefault !== undefined,
        hasLocalPlanExecutionDelaySecondsPreference: localPreferences.planExecutionDelaySecondsDefault !== undefined,
        hasLocalCorrectnessIterationModePreference: localPreferences.correctnessIterationModeDefault !== undefined,
        hasLocalBackgroundJobApprovalPolicyPreference: localPreferences.backgroundJobApprovalPolicyDefault !== undefined,
        hasLocalMemoryBankEnabledPreference: localPreferences.memoryBankEnabledDefault !== undefined
      });
      setState(reconcile(nextState));
      return localPreferences;
    },
    hydrateTutorialProgress() {
      const progress = readTutorialProgress();
      setState({
        completedTutorialIds: progress.completedTutorialIds,
        dismissedTutorialIds: progress.dismissedTutorialIds
      });
      return progress;
    },
    applyServerEvent(event: ServerEvent) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState(reduceServerEvent(state, event));
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      const retryCommand = getRepairedPreflightRetryCommand(nextState, event);
      if (retryCommand && commandDispatcher) {
        const nextCommand = cloneCommandWithRequestId(retryCommand, createRequestId());
        setState({
          blockingNonGitPreflight: undefined,
          pendingPreflightRepairKind: undefined,
          pendingPreflightCommands: {
            ...state.pendingPreflightCommands,
            [nextCommand.requestId]: nextCommand
          }
        });
        commandDispatcher(nextCommand);
      }
    },
    replaceStateForTests(nextState: HarnessViewState) {
      commandDispatcher = undefined;
      setState(reconcile(nextState));
    },
    resetForTests(overrides: Partial<HarnessViewState> = {}) {
      commandDispatcher = undefined;
      setState(reconcile({ ...createInitialViewState(), ...overrides }));
    }
  };
}

export type HarnessStoreApi = ReturnType<typeof createHarnessStore>;

let activeHarnessStore: HarnessStoreApi | undefined;

export function setActiveHarnessStore(store: HarnessStoreApi | undefined) {
  activeHarnessStore = store;
}

export function getActiveHarnessStore() {
  return activeHarnessStore;
}

export function requireHarnessStore() {
  if (!activeHarnessStore) {
    throw new Error("Harness store not initialized");
  }

  return activeHarnessStore;
}

export const harnessStore = new Proxy({} as HarnessStoreApi, {
  get(_target, prop, receiver) {
    return Reflect.get(requireHarnessStore(), prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(requireHarnessStore(), prop, value, receiver);
  },
  ownKeys() {
    return Reflect.ownKeys(requireHarnessStore());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(requireHarnessStore(), prop);
  }
});

function isPreflightCapableCommand(command: ClientCommand) {
  return [
    "chat.send",
    "run.execute",
    "run.retry",
    "run.resume",
    "subagent.retry",
    "subagent.resume"
  ].includes(command.type);
}

function getRepairedPreflightRetryCommand(state: HarnessViewState, event: ServerEvent) {
  if (!state.blockingNonGitPreflight?.command || !state.pendingPreflightRepairKind) {
    return undefined;
  }

  if (state.pendingPreflightRepairKind === "git-init" && event.type === "project.git.initialized") {
    return event.payload.projectId === state.blockingNonGitPreflight.projectId
      ? state.blockingNonGitPreflight.command
      : undefined;
  }

  if (state.pendingPreflightRepairKind === "disable-check" && event.type === "preferences.saved") {
    return event.payload.blockChatOnDirtyGitDefault === false ? state.blockingNonGitPreflight.command : undefined;
  }

  return undefined;
}

function cloneCommandWithRequestId(command: ClientCommand, requestId: string): ClientCommand {
  return {
    ...command,
    requestId
  } as ClientCommand;
}

function hydrateAssistants(existing: ViewAssistantsState, incoming: AssistantsState): ViewAssistantsState {
  const nextVisibleId =
    existing.selectedAssistantId && incoming.assistants.some((assistant) => assistant.id === existing.selectedAssistantId)
      ? existing.selectedAssistantId
      : incoming.assistants[0]?.id;
  return {
    ...incoming,
    selectedAssistantId: nextVisibleId,
    scopeFilter: existing.scopeFilter,
    streamingByAssistantId: existing.streamingByAssistantId
  };
}

function upsertById<T extends { id: string }>(entries: T[], nextEntry: T) {
  return entries.some((entry) => entry.id === nextEntry.id)
    ? entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry))
    : [nextEntry, ...entries];
}

function updateProjectState(
  state: HarnessViewState,
  projectId: string,
  updater: (project: ViewProjectState) => ViewProjectState
): HarnessViewState {
  if (!state.workspace.projects.some((project) => project.id === projectId)) {
    return state;
  }

  return {
    ...state,
    workspace: {
      ...state.workspace,
      projects: state.workspace.projects.map((project) => (project.id === projectId ? updater(project) : project))
    }
  };
}

function updateThreadScopedProject(
  state: HarnessViewState,
  projectId: string,
  threadId: string,
  updater: (project: ViewProjectState) => ViewProjectState
) {
  return updateProjectState(state, projectId, (project) => (project.activeThreadId === threadId ? updater(project) : project));
}

function upsertProject(projects: ViewProjectState[], nextProject: ViewProjectState) {
  if (projects.some((project) => project.id === nextProject.id)) {
    return projects.map((project) => (project.id === nextProject.id ? nextProject : project));
  }

  return [nextProject, ...projects];
}

function moveProjectToFront(projects: ViewProjectState[], projectId: string) {
  const target = projects.find((project) => project.id === projectId);
  if (!target) {
    return projects;
  }

  return [target, ...projects.filter((project) => project.id !== projectId)];
}

function renderStreamingStatusTailSegments(segments: StreamingTailSegment[]) {
  return segments
    .filter((segment) => segment.kind === "status")
    .map((segment) => segment.content)
    .join("\n\n")
    .trim();
}

function getLatestStreamingTailTimestamp(segments: StreamingTailSegment[]) {
  return segments.reduce((latest, segment) => (segment.updatedAt > latest ? segment.updatedAt : latest), new Date(0).toISOString());
}

function rolloverStreamingHeartbeatMessages(
  messages: StreamingHeartbeatMessage[],
  runId: string,
  content: string,
  updatedAt: string
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return [];
  }

  const current = messages.at(-1);
  if (!current) {
    return [
      {
        id: `${runId}:heartbeat:1`,
        content: normalizedContent,
        heartbeatCount: 1,
        locked: false,
        updatedAt
      }
    ];
  }

  if (current.content === normalizedContent) {
    return messages.map((message, index) => (index === messages.length - 1 ? { ...message, updatedAt } : message));
  }

  if (!current.locked && current.heartbeatCount < MAX_STREAMING_MESSAGE_HEARTBEATS) {
    return messages.map((message, index) =>
      index === messages.length - 1
        ? {
          ...message,
          content: normalizedContent,
          heartbeatCount: message.heartbeatCount + 1,
          updatedAt
        }
        : message
    );
  }

  const lockedMessages = current.locked
    ? messages
    : messages.map((message, index) => (index === messages.length - 1 ? { ...message, locked: true } : message));

  return [
    ...lockedMessages,
    {
      id: `${runId}:heartbeat:${lockedMessages.length + 1}`,
      content: normalizedContent,
      heartbeatCount: 1,
      locked: false,
      updatedAt
    }
  ];
}

function createThreadLiveTranscriptState(
  overrides: Partial<ThreadLiveTranscriptState> = {}
): ThreadLiveTranscriptState {
  return {
    isStreaming: overrides.isStreaming ?? false,
    streamingAssistantText: overrides.streamingAssistantText ?? "",
    streamingTailSegments: overrides.streamingTailSegments ?? [],
    streamingHeartbeatMessages: overrides.streamingHeartbeatMessages ?? [],
    lastError: overrides.lastError
  };
}

function getPersistedThreadLiveTranscriptState(project: Pick<WorkspaceProjectState, "session">) {
  return createThreadLiveTranscriptState({
    isStreaming: project.session.isStreaming,
    streamingAssistantText: getPersistedStreamingAssistantText(project),
    lastError: project.session.lastError
  });
}

function getActiveThreadLiveTranscriptState(project: ViewProjectState) {
  return createThreadLiveTranscriptState({
    isStreaming: project.session.isStreaming,
    streamingAssistantText: project.streamingAssistantText,
    streamingTailSegments: project.streamingTailSegments,
    streamingHeartbeatMessages: project.streamingHeartbeatMessages,
    lastError: project.lastError ?? project.session.lastError
  });
}

function filterThreadLiveTranscriptByKnownThreads(
  liveTranscriptById: Record<string, ThreadLiveTranscriptState>,
  threads: ViewProjectState["threads"]
) {
  const knownThreadIds = new Set(threads.map((thread) => thread.id));
  return Object.fromEntries(
    Object.entries(liveTranscriptById).filter(([threadId]) => knownThreadIds.has(threadId))
  );
}

function applyThreadLiveTranscriptState(
  project: ViewProjectState,
  threadId: string,
  liveTranscript: ThreadLiveTranscriptState
) {
  const nextProject = {
    ...project,
    threadLiveTranscriptById: {
      ...project.threadLiveTranscriptById,
      [threadId]: liveTranscript
    }
  };

  if (nextProject.activeThreadId !== threadId) {
    return nextProject;
  }

  return {
    ...nextProject,
    streamingAssistantText: liveTranscript.streamingAssistantText,
    streamingTailSegments: liveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: liveTranscript.streamingHeartbeatMessages,
    lastError: liveTranscript.lastError,
    session: {
      ...nextProject.session,
      isStreaming: liveTranscript.isStreaming,
      lastError: liveTranscript.lastError
    }
  };
}

function hydrateWorkspace(workspace: WorkspaceState): ViewWorkspaceState {
  return {
    activeProjectId: workspace.activeProjectId,
    projects: workspace.projects.map((project) => toViewProject(project)),
    workspaceModes: workspace.workspaceModes ?? [],
    workspaceRuleSource: workspace.workspaceRuleSource,
    workspaceMemorySummary: workspace.workspaceMemorySummary
  };
}

function mergeIncomingWorkspace(existing: ViewWorkspaceState, incoming: ViewWorkspaceState): ViewWorkspaceState {
  return {
    activeProjectId: incoming.activeProjectId,
    workspaceModes: incoming.workspaceModes,
    workspaceRuleSource: incoming.workspaceRuleSource,
    workspaceMemorySummary: incoming.workspaceMemorySummary,
    projects: incoming.projects.map((project) => {
      const prior = existing.projects.find((entry) => entry.id === project.id);
      return prior ? mergeIncomingProject(prior, project) : project;
    })
  };
}

function toViewProject(project: WorkspaceProjectState): ViewProjectState {
  const activeThreadLiveTranscript = getPersistedThreadLiveTranscriptState(project);
  return {
    ...project,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: activeThreadLiveTranscript.streamingAssistantText,
    streamingTailSegments: activeThreadLiveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: activeThreadLiveTranscript.streamingHeartbeatMessages,
    threadLiveTranscriptById: {
      [project.activeThreadId]: activeThreadLiveTranscript
    },
    draft: readThreadDraft(project.id, project.activeThreadId),
    lastError: activeThreadLiveTranscript.lastError,
    experimentInspection: undefined,
    memoryEntries: []
  };
}

function mergeIncomingProject(existing: ViewProjectState, incoming: ViewProjectState): ViewProjectState {
  const activeThreadChanged = existing.activeThreadId !== incoming.activeThreadId;
  const rememberedThreadLiveTranscript = filterThreadLiveTranscriptByKnownThreads(
    {
      ...existing.threadLiveTranscriptById,
      [existing.activeThreadId]: getActiveThreadLiveTranscriptState(existing)
    },
    incoming.threads
  );
  const activeThreadLiveTranscript =
    rememberedThreadLiveTranscript[incoming.activeThreadId] ?? getPersistedThreadLiveTranscriptState(incoming);
  return {
    ...incoming,
    latestPlan: activeThreadChanged ? undefined : existing.latestPlan,
    contextUsage: activeThreadChanged ? undefined : existing.contextUsage,
    traces: activeThreadChanged ? [] : existing.traces,
    streamingAssistantText: activeThreadLiveTranscript.streamingAssistantText,
    streamingTailSegments: activeThreadLiveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: activeThreadLiveTranscript.streamingHeartbeatMessages,
    threadLiveTranscriptById: {
      ...rememberedThreadLiveTranscript,
      [incoming.activeThreadId]: activeThreadLiveTranscript
    },
    draft: readThreadDraft(incoming.id, incoming.activeThreadId),
    lastError: activeThreadLiveTranscript.lastError,
    experimentInspection: activeThreadChanged ? undefined : existing.experimentInspection,
    memoryEntries: activeThreadChanged ? [] : existing.memoryEntries,
    session: {
      ...incoming.session,
      selectedAgentId: existing.session.selectedAgentId ?? incoming.session.selectedAgentId,
      executionModelId: existing.session.executionModelId ?? incoming.session.executionModelId,
      isStreaming: activeThreadLiveTranscript.isStreaming,
      lastError: activeThreadLiveTranscript.lastError
    }
  };
}

function getPersistedStreamingAssistantText(project: Pick<WorkspaceProjectState, "session">) {
  if (!project.session.isStreaming) {
    return "";
  }

  const lastMessage = project.session.messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant" || lastMessage.kind === "run-milestones") {
    return "";
  }

  return lastMessage.content;
}

function applyProjectSearchResultsState(
  state: HarnessViewState,
  requestId: string,
  query: string,
  results: ProjectSearchResult[]
): HarnessViewState {
  if (state.projectSearchPendingRequestId !== requestId || state.projectSearchQuery.trim() !== query.trim()) {
    return state;
  }

  return {
    ...state,
    projectSearchLoading: false,
    projectSearchPendingRequestId: undefined,
    projectSearchFilesystemResults: [...results]
  };
}

function setThreadBadge(threads: ViewProjectState["threads"], threadId: string, badgeState: ViewProjectState["threads"][number]["badgeState"]) {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, badgeState } : thread));
}

function updateThreadSummaryFromMessage(
  threads: ViewProjectState["threads"],
  threadId: string,
  message: ViewProjectState["session"]["messages"][number]
) {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
        ...thread,
        messageCount: thread.messageCount + 1,
        lastMessagePreview: shouldUseMessageForThreadPreview(message) ? message.content : thread.lastMessagePreview,
        updatedAt: message.createdAt
      }
      : thread
  );
}

function updateThreadSummaryFromUpdatedMessage(
  threads: ViewProjectState["threads"],
  threadId: string,
  message: ViewProjectState["session"]["messages"][number]
) {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
        ...thread,
        lastMessagePreview: shouldUseMessageForThreadPreview(message) ? message.content : thread.lastMessagePreview,
        updatedAt: message.createdAt
      }
      : thread
  );
}

function shouldUseMessageForThreadPreview(message: ViewProjectState["session"]["messages"][number]) {
  return message.role !== "system" && message.kind !== "run-milestones";
}

function upsertBackgroundJobRun(
  runs: BackgroundJobsState["runs"],
  nextRun: BackgroundJobsState["runs"][number]
) {
  const nextRuns = runs.some((run) => run.id === nextRun.id)
    ? runs.map((run) => (run.id === nextRun.id ? nextRun : run))
    : [nextRun, ...runs];
  return [...nextRuns].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function badgeFromRunStatus(status: NonNullable<ViewProjectState["lastRun"]>["status"]): ViewProjectState["threads"][number]["badgeState"] {
  if (status === "failed" || status === "partial-complete") {
    return "error";
  }
  if (status === "awaiting-user-input") {
    return "needs-input";
  }
  if (status === "planning" || status === "ready") {
    return "planning";
  }
  if (status === "running-main" || status === "running-subagents" || status === "aggregating") {
    return "executing";
  }
  if (status === "completed") {
    return "done";
  }
  return "idle";
}

function applyReadyPreferencesState(state: HarnessViewState, preferences: PreferencesState) {
  const providerBrand = resolveProviderBrand(state, preferences);
  const tracePanelDefaultOpen = state.hasLocalTracePreference
    ? state.tracePanelDefaultOpen
    : preferences.tracePanelDefaultOpen;

  return {
    hasUsableApiKey: preferences.hasUsableApiKey,
    hasStoredApiKey: preferences.hasStoredApiKey,
    hasUsableOpenAiApiKey: preferences.hasUsableOpenAiApiKey,
    hasStoredOpenAiApiKey: preferences.hasStoredOpenAiApiKey,
    hasUsableGoogleApiKey: preferences.hasUsableGoogleApiKey,
    hasStoredGoogleApiKey: preferences.hasStoredGoogleApiKey,
    providerBrand,
    debugEnabled: state.hasLocalDebugPreference ? state.debugEnabled : preferences.debugEnabledDefault,
    tracePanelDefaultOpen,
    tracePanelOpen:
      state.hasPersistedTracePanelOpen || state.hasLocalTracePreference ? state.tracePanelOpen : tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault: state.hasLocalSubagentWorktreeStrategyPreference
      ? state.subagentWorktreeStrategyDefault
      : preferences.subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault: state.hasLocalBlockChatOnDirtyGitPreference
      ? state.blockChatOnDirtyGitDefault
      : preferences.blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault: state.hasLocalDirtyGitChangeLimitPreference
      ? state.dirtyGitChangeLimitDefault
      : preferences.dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault: state.hasLocalAutoCompactContextThresholdPercentPreference
      ? state.autoCompactContextThresholdPercentDefault
      : preferences.autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault: state.hasLocalPlanExecutionModePreference
      ? state.planExecutionModeDefault
      : preferences.planExecutionModeDefault,
    planExecutionDelaySecondsDefault: state.hasLocalPlanExecutionDelaySecondsPreference
      ? state.planExecutionDelaySecondsDefault
      : preferences.planExecutionDelaySecondsDefault,
    correctnessIterationModeDefault: state.hasLocalCorrectnessIterationModePreference
      ? state.correctnessIterationModeDefault
      : preferences.correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault: state.hasLocalBackgroundJobApprovalPolicyPreference
      ? state.backgroundJobApprovalPolicyDefault
      : preferences.backgroundJobApprovalPolicyDefault,
    memoryBankEnabledDefault: state.hasLocalMemoryBankEnabledPreference
      ? state.memoryBankEnabledDefault
      : preferences.memoryBankEnabledDefault,
    attachmentsEnabled: preferences.attachmentsEnabled,
    capabilities: preferences.capabilities,
    agentRuntimes: preferences.agentRuntimes
  };
}

export function readLocalPreferences(): LocalPreferencesState {
  if (typeof window === "undefined") {
    return {};
  }

  const openAiApiKey = window.localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)?.trim() || undefined;
  const googleApiKey = window.localStorage.getItem(GOOGLE_API_KEY_STORAGE_KEY)?.trim() || undefined;
  const providerBrand = parseProviderBrandStorageValue(window.localStorage.getItem(PROVIDER_BRAND_STORAGE_KEY));
  const debugEnabled = parseBooleanStorageValue(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY));
  const tracePanelDefaultOpen = parseBooleanStorageValue(
    window.localStorage.getItem(TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY)
  );
  const subagentWorktreeStrategyDefault = parseSubagentWorktreeStrategyStorageValue(
    window.localStorage.getItem(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY)
  );
  const blockChatOnDirtyGitDefault = parseBooleanStorageValue(
    window.localStorage.getItem(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY)
  );
  const dirtyGitChangeLimitDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY),
    0,
    10000
  );
  const autoCompactContextThresholdPercentDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY),
    10,
    95
  );
  const planExecutionModeDefault = parsePlanExecutionModeStorageValue(
    window.localStorage.getItem(PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY)
  );
  const planExecutionDelaySecondsDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY),
    0,
    300
  );
  const correctnessIterationModeDefault = parseCorrectnessIterationModeStorageValue(
    window.localStorage.getItem(CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY)
  );
  const backgroundJobApprovalPolicyDefault = parseBackgroundJobApprovalPolicyStorageValue(
    window.localStorage.getItem(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY)
  );
  const memoryBankEnabledDefault = parseBooleanStorageValue(
    window.localStorage.getItem(MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY)
  );
  const backgroundJobNotificationsEnabled = parseBooleanStorageValue(
    window.localStorage.getItem(BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY)
  );
  const selectedReasoningStrength = parseReasoningStrengthStorageValue(
    window.localStorage.getItem(COMPOSER_REASONING_STRENGTH_STORAGE_KEY)
  );
  const selectedFastMode = parseBooleanStorageValue(window.localStorage.getItem(COMPOSER_FAST_MODE_STORAGE_KEY));

  return {
    openAiApiKey,
    googleApiKey,
    providerBrand,
    debugEnabled,
    tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault,
    planExecutionDelaySecondsDefault,
    correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault,
    memoryBankEnabledDefault,
    backgroundJobNotificationsEnabled,
    selectedReasoningStrength,
    selectedFastMode
  };
}

export function readTutorialProgress() {
  if (typeof window === "undefined") {
    return {
      completedTutorialIds: [] as string[],
      dismissedTutorialIds: [] as string[]
    };
  }

  try {
    const raw = window.localStorage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {
        completedTutorialIds: [] as string[],
        dismissedTutorialIds: [] as string[]
      };
    }

    const parsed = JSON.parse(raw) as {
      completedTutorialIds?: unknown;
      dismissedTutorialIds?: unknown;
    };
    return {
      completedTutorialIds: Array.isArray(parsed.completedTutorialIds)
        ? parsed.completedTutorialIds.filter((value): value is string => typeof value === "string")
        : [],
      dismissedTutorialIds: Array.isArray(parsed.dismissedTutorialIds)
        ? parsed.dismissedTutorialIds.filter((value): value is string => typeof value === "string")
        : []
    };
  } catch {
    return {
      completedTutorialIds: [] as string[],
      dismissedTutorialIds: [] as string[]
    };
  }
}

export function getThreadDraftStorageKey(projectId: string, threadId: string) {
  return `${THREAD_DRAFT_STORAGE_KEY_PREFIX}:${projectId}:${threadId}`;
}

export function readThreadDraft(projectId: string, threadId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(getThreadDraftStorageKey(projectId, threadId)) ?? "";
}

export function persistThreadDraft(projectId: string, threadId: string, draft: string) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getThreadDraftStorageKey(projectId, threadId);
  if (!draft) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, draft);
}

export function persistLocalPreferences(input: LocalPreferencesState) {
  if (typeof window === "undefined") {
    return;
  }

  persistStorageValue(OPENAI_API_KEY_STORAGE_KEY, input.openAiApiKey);
  persistStorageValue(GOOGLE_API_KEY_STORAGE_KEY, input.googleApiKey);
  persistProviderBrandStorageValue(PROVIDER_BRAND_STORAGE_KEY, input.providerBrand);
  persistBooleanStorageValue(DEBUG_ENABLED_STORAGE_KEY, input.debugEnabled);
  persistBooleanStorageValue(TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY, input.tracePanelDefaultOpen);
  persistStorageValue(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY, input.subagentWorktreeStrategyDefault);
  persistBooleanStorageValue(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY, input.blockChatOnDirtyGitDefault);
  persistIntegerStorageValue(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY, input.dirtyGitChangeLimitDefault, 0, 10000);
  persistIntegerStorageValue(
    AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY,
    input.autoCompactContextThresholdPercentDefault,
    10,
    95
  );
  persistStorageValue(PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY, input.planExecutionModeDefault);
  persistIntegerStorageValue(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY, input.planExecutionDelaySecondsDefault, 0, 300);
  persistStorageValue(CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY, input.correctnessIterationModeDefault);
  persistStorageValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY, input.backgroundJobApprovalPolicyDefault);
  persistBooleanStorageValue(MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY, input.memoryBankEnabledDefault);
  persistBooleanStorageValue(BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY, input.backgroundJobNotificationsEnabled);
  persistStorageValue(COMPOSER_REASONING_STRENGTH_STORAGE_KEY, input.selectedReasoningStrength);
  persistBooleanStorageValue(COMPOSER_FAST_MODE_STORAGE_KEY, input.selectedFastMode);
}

export function persistMergedLocalPreferences(input: LocalPreferencesState) {
  persistLocalPreferences({
    ...readLocalPreferences(),
    ...input
  });
}

function persistComposerControlPreferences(state: HarnessViewState) {
  persistLocalPreferences({
    ...readLocalPreferences(),
    selectedReasoningStrength: state.hasGlobalSelectedReasoningStrength ? state.selectedReasoningStrength : undefined,
    selectedFastMode: state.hasGlobalSelectedFastMode ? state.selectedFastMode : undefined
  });
}

export function persistTutorialProgress(input: { completedTutorialIds: string[]; dismissedTutorialIds: string[] }) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    TUTORIAL_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      completedTutorialIds: [...new Set(input.completedTutorialIds)],
      dismissedTutorialIds: [...new Set(input.dismissedTutorialIds)]
    })
  );
}

export function readBrowserUiSession(): BrowserUiSessionState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_UI_SESSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as BrowserUiSessionState;
    const lastActiveThreadByProjectId =
      parsed.lastActiveThreadByProjectId && typeof parsed.lastActiveThreadByProjectId === "object"
        ? Object.fromEntries(
            Object.entries(parsed.lastActiveThreadByProjectId).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
            )
          )
        : undefined;

    return {
      selectedModeId: typeof parsed.selectedModeId === "string" ? parsed.selectedModeId : undefined,
      selectedAgentId:
        parsed.selectedAgentId === "pi" || parsed.selectedAgentId === "copilot-cli" || parsed.selectedAgentId === "codex-cli"
          ? parsed.selectedAgentId
          : undefined,
      selectedExecutionModelId:
        typeof parsed.selectedExecutionModelId === "string" ? (parsed.selectedExecutionModelId as ExecutionModelId) : undefined,
      selectedReasoningStrength: isComposerReasoningStrength(parsed.selectedReasoningStrength)
        ? parsed.selectedReasoningStrength
        : undefined,
      selectedFastMode: typeof parsed.selectedFastMode === "boolean" ? parsed.selectedFastMode : undefined,
      tracePanelOpen: typeof parsed.tracePanelOpen === "boolean" ? parsed.tracePanelOpen : undefined,
      lastActiveProjectId: typeof parsed.lastActiveProjectId === "string" ? parsed.lastActiveProjectId : undefined,
      lastActiveThreadByProjectId
    };
  } catch {
    return {};
  }
}

export function persistBrowserUiSession(input: BrowserUiSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedInput: BrowserUiSessionState = {
    selectedModeId: input.selectedModeId?.trim() || undefined,
    selectedAgentId: input.selectedAgentId,
    selectedExecutionModelId: input.selectedExecutionModelId?.trim()
      ? (input.selectedExecutionModelId.trim() as ExecutionModelId)
      : undefined,
    selectedReasoningStrength: input.selectedReasoningStrength,
    selectedFastMode: input.selectedFastMode,
    tracePanelOpen: input.tracePanelOpen,
    lastActiveProjectId: input.lastActiveProjectId?.trim() || undefined,
    lastActiveThreadByProjectId: input.lastActiveThreadByProjectId
      ? Object.fromEntries(
          Object.entries(input.lastActiveThreadByProjectId).filter(
            (entry): entry is [string, string] => Boolean(entry[0]?.trim()) && Boolean(entry[1]?.trim())
          )
        )
      : undefined
  };

  if (
    !normalizedInput.selectedModeId &&
    !normalizedInput.selectedAgentId &&
    !normalizedInput.selectedExecutionModelId &&
    !normalizedInput.selectedReasoningStrength &&
    normalizedInput.selectedFastMode === undefined &&
    normalizedInput.tracePanelOpen === undefined &&
    !normalizedInput.lastActiveProjectId &&
    (!normalizedInput.lastActiveThreadByProjectId || Object.keys(normalizedInput.lastActiveThreadByProjectId).length === 0)
  ) {
    window.localStorage.removeItem(BROWSER_UI_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(BROWSER_UI_SESSION_STORAGE_KEY, JSON.stringify(normalizedInput));
}

export function getBrowserUiSessionRestoreCommands(
  state: HarnessViewState,
  browserUiSession: BrowserUiSessionState
): ClientCommand[] {
  const projects = state.workspace.projects;
  if (projects.length === 0) {
    return [];
  }

  const targetProject =
    (browserUiSession.lastActiveProjectId
      ? projects.find((project) => project.id === browserUiSession.lastActiveProjectId)
      : undefined) ?? getActiveProject(state);
  if (!targetProject) {
    return [];
  }

  const commands: ClientCommand[] = [];
  if (state.workspace.activeProjectId !== targetProject.id) {
    commands.push({
      type: "project.activate",
      requestId: crypto.randomUUID(),
      payload: {
        projectId: targetProject.id
      }
    });
  }

  const targetThreadId = browserUiSession.lastActiveThreadByProjectId?.[targetProject.id];
  if (
    targetThreadId &&
    targetThreadId !== targetProject.activeThreadId &&
    targetProject.threads.some((thread) => thread.id === targetThreadId)
  ) {
    commands.push({
      type: "thread.activate",
      requestId: crypto.randomUUID(),
      payload: {
        projectId: targetProject.id,
        threadId: targetThreadId
      }
    });
  }

  return commands;
}

function getBrowserUiSessionSnapshot(state: HarnessViewState): BrowserUiSessionState {
  return {
    selectedModeId: state.hasGlobalSelectedModeId ? state.selectedModeId : undefined,
    selectedAgentId: state.hasGlobalSelectedAgentId ? state.selectedAgentId : undefined,
    selectedExecutionModelId: state.hasGlobalSelectedExecutionModelId ? state.selectedExecutionModelId : undefined,
    selectedReasoningStrength: state.hasGlobalSelectedReasoningStrength ? state.selectedReasoningStrength : undefined,
    selectedFastMode: state.hasGlobalSelectedFastMode ? state.selectedFastMode : undefined,
    tracePanelOpen: state.hasPersistedTracePanelOpen ? state.tracePanelOpen : undefined,
    lastActiveProjectId: state.lastActiveProjectId,
    lastActiveThreadByProjectId: state.lastActiveThreadByProjectId
  };
}

function toRunSummary(run: AgentRunState): AgentRunSummary {
  return {
    id: run.id,
    threadId: run.threadId,
    status: run.status,
    failureMessage: run.failureMessage,
    resumable: run.resumable,
    retryable: run.retryable,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt
  };
}

function upsertRunSummary(summaries: AgentRunSummary[], next: AgentRunSummary) {
  const existing = summaries.filter((summary) => summary.id !== next.id);
  return [next, ...existing].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function finalizeHarnessViewState(state: HarnessViewState): HarnessViewState {
  const activeProject = getActiveProject(state);
  const availableModes = resolveModeCatalog(state.workspace.workspaceModes, activeProject?.projectModes ?? []);
  const fallbackModeId =
    resolveModeById(activeProject?.selectedModeId ?? DEFAULT_MODE_ID, state.workspace.workspaceModes, activeProject?.projectModes ?? [])
      ?.id ?? DEFAULT_MODE_ID;
  const selectedModeId =
    state.hasGlobalSelectedModeId && availableModes.some((mode) => mode.id === state.selectedModeId)
      ? state.selectedModeId
      : fallbackModeId;
  const selectedAgentId =
    state.hasGlobalSelectedAgentId && state.availableAgents.some((agent) => agent.id === state.selectedAgentId)
      ? state.selectedAgentId
      : activeProject?.session.selectedAgentId ?? "pi";
  const selectedExecutionModelId = resolveSelectedExecutionModelId(state, activeProject, selectedAgentId);
  const composerControls = resolveComposerControlState(state, selectedAgentId, selectedExecutionModelId);
  const validProjectIds = new Set(state.workspace.projects.map((project) => project.id));
  const lastActiveThreadByProjectId = Object.fromEntries(
    Object.entries(state.lastActiveThreadByProjectId).filter(([projectId, threadId]) => {
      const project = state.workspace.projects.find((entry) => entry.id === projectId);
      return Boolean(project && project.threads.some((thread) => thread.id === threadId));
    })
  );
  if (activeProject) {
    lastActiveThreadByProjectId[activeProject.id] = activeProject.activeThreadId;
  }

  const nextLastActiveProjectId =
    activeProject?.id ??
    (state.lastActiveProjectId && validProjectIds.has(state.lastActiveProjectId) ? state.lastActiveProjectId : undefined);

  return {
    ...state,
    selectedModeId,
    selectedAgentId,
    selectedExecutionModelId,
    selectedReasoningStrength: composerControls.selectedReasoningStrength,
    selectedFastMode: composerControls.selectedFastMode,
    lastActiveProjectId: nextLastActiveProjectId,
    lastActiveThreadByProjectId,
    tracePanelOpen: state.hasPersistedTracePanelOpen ? state.tracePanelOpen : state.tracePanelDefaultOpen
  };
}

function resolveSelectedExecutionModelId(
  state: HarnessViewState,
  project: Pick<ViewProjectState, "session"> | undefined,
  selectedAgentId: AgentId
) {
  const candidates = [
    state.hasGlobalSelectedExecutionModelId ? state.selectedExecutionModelId : undefined,
    project?.session.executionModelId,
    getFallbackExecutionModelIdForAgent(state, selectedAgentId, state.providerBrand)
  ];
  return candidates.find((modelId) =>
    isExecutionModelIdAvailableForAgent(state, selectedAgentId, modelId, state.providerBrand)
  ) as ExecutionModelId | undefined;
}

function isComposerReasoningStrength(value: unknown): value is ComposerReasoningStrength {
  return typeof value === "string" && COMPOSER_REASONING_STRENGTHS.includes(value as ComposerReasoningStrength);
}

function coerceReasoningStrength(
  availableStrengths: ComposerReasoningStrength[],
  requestedStrength: ComposerReasoningStrength | undefined
) {
  const normalizedRequested = requestedStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH;
  const requestedIndex = COMPOSER_REASONING_STRENGTHS.indexOf(normalizedRequested);
  for (let index = requestedIndex; index >= 0; index -= 1) {
    const candidate = COMPOSER_REASONING_STRENGTHS[index];
    if (availableStrengths.includes(candidate)) {
      return candidate;
    }
  }

  return availableStrengths[availableStrengths.length - 1] ?? DEFAULT_COMPOSER_REASONING_STRENGTH;
}

function resolveComposerControlState(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: ExecutionModelId | undefined
) {
  const availableStrengths = getAvailableReasoningStrengthsForSelection(state, agentId, modelId);
  const requestedStrength = state.hasGlobalSelectedReasoningStrength ? state.selectedReasoningStrength : undefined;
  const selectedReasoningStrength = coerceReasoningStrength(availableStrengths, requestedStrength);
  const supportsFastMode = getSupportsFastModeForSelection(state, agentId, modelId);
  const selectedFastMode = supportsFastMode && state.hasGlobalSelectedFastMode ? state.selectedFastMode : false;

  return {
    availableStrengths,
    supportsFastMode,
    selectedReasoningStrength,
    selectedFastMode
  };
}

function parseBooleanStorageValue(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function parseProviderBrandStorageValue(value: string | null): ProviderBrand | undefined {
  return value === "gpt" || value === "gemini" ? value : undefined;
}

function parseReasoningStrengthStorageValue(value: string | null): ComposerReasoningStrength | undefined {
  return isComposerReasoningStrength(value) ? value : undefined;
}

function parseSubagentWorktreeStrategyStorageValue(value: string | null) {
  return value === "same-worktree" || value === "separate-worktrees" ? value : undefined;
}

function parsePlanExecutionModeStorageValue(value: string | null) {
  return value === "countdown" || value === "approve" || value === "immediate" ? value : undefined;
}

function parseCorrectnessIterationModeStorageValue(value: string | null) {
  return value === "ask-before-iterate" || value === "auto-once" || value === "auto-until-clean" ? value : undefined;
}

function parseBackgroundJobApprovalPolicyStorageValue(value: string | null) {
  return value === "allow-all" || value === "allow-safe" || value === "ask-risky" || value === "always-ask"
    ? value
    : undefined;
}

function parseBoundedIntegerStorageValue(value: string | null, min: number, max: number) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : undefined;
}

function persistStorageValue(key: string, value: string | undefined) {
  if (value?.trim()) {
    window.localStorage.setItem(key, value.trim());
    return;
  }

  window.localStorage.removeItem(key);
}

function persistBooleanStorageValue(key: string, value: boolean | undefined) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, String(value));
}

function persistIntegerStorageValue(key: string, value: number | undefined, min: number, max: number) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, String(Math.max(min, Math.min(max, Math.round(value)))));
}

function persistProviderBrandStorageValue(key: string, value: ProviderBrand | undefined) {
  if (!value) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function resolveProviderBrand(state: HarnessViewState, preferences: PreferencesState): ProviderBrand {
  const preferredBrand = state.hasLocalProviderBrandPreference ? state.providerBrand : preferences.providerBrand;
  if (isProviderBrandSelectable(state, preferences, preferredBrand)) {
    return preferredBrand;
  }

  if (isProviderBrandSelectable(state, preferences, "gpt")) {
    return "gpt";
  }

  if (isProviderBrandSelectable(state, preferences, "gemini")) {
    return "gemini";
  }

  return preferredBrand;
}

function isProviderBrandSelectable(
  state: Pick<
    HarnessViewState,
    "openAiApiKeyDraft" | "googleApiKeyDraft" | "hasLocalOpenAiApiKey" | "hasLocalGoogleApiKey"
  >,
  preferences: Pick<
    PreferencesState,
    "hasUsableOpenAiApiKey" | "hasStoredOpenAiApiKey" | "hasUsableGoogleApiKey" | "hasStoredGoogleApiKey"
  >,
  providerBrand: ProviderBrand
) {
  if (providerBrand === "gpt") {
    return Boolean(
      preferences.hasUsableOpenAiApiKey ||
        preferences.hasStoredOpenAiApiKey ||
        state.hasLocalOpenAiApiKey ||
        state.openAiApiKeyDraft.trim()
    );
  }

  return Boolean(
    preferences.hasUsableGoogleApiKey ||
      preferences.hasStoredGoogleApiKey ||
      state.hasLocalGoogleApiKey ||
      state.googleApiKeyDraft.trim()
  );
}

export function hasUsableApiKeyForProvider(state: HarnessViewState, providerBrand: ProviderBrand) {
  return providerBrand === "gemini" ? state.hasUsableGoogleApiKey : state.hasUsableOpenAiApiKey;
}

export function resolveUsablePiProviderBrand(state: HarnessViewState): ProviderBrand | undefined {
  if (hasUsableApiKeyForProvider(state, state.providerBrand)) {
    return state.providerBrand;
  }

  if (hasUsableApiKeyForProvider(state, "gpt")) {
    return "gpt";
  }

  if (hasUsableApiKeyForProvider(state, "gemini")) {
    return "gemini";
  }

  return undefined;
}

export function getBlockingSetupCheck(state: HarnessViewState) {
  return state.setup.checks.find(
    (check) => check.requiredForFirstTask && (check.status === "action-required" || check.status === "warning")
  );
}

export function shouldShowSetupChecklist(state: HarnessViewState) {
  return (
    state.setupChecklistOpen ||
    state.setup.checks.some((check) => check.requiredForFirstTask && check.status !== "ready")
  );
}

export function requireActiveProject(state: HarnessViewState) {
  const project = getActiveProject(state);
  if (!project) {
    throw new Error("No active project");
  }

  return project;
}

export function canSelectProviderBrand(state: HarnessViewState, providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return Boolean(
      state.hasUsableGoogleApiKey ||
        state.hasStoredGoogleApiKey ||
        state.hasLocalGoogleApiKey ||
        state.googleApiKeyDraft.trim()
    );
  }

  return Boolean(
    state.hasUsableOpenAiApiKey ||
      state.hasStoredOpenAiApiKey ||
      state.hasLocalOpenAiApiKey ||
      state.openAiApiKeyDraft.trim()
  );
}

export function getDefaultExecutionModelIdForProvider(providerBrand: ProviderBrand) {
  return providerBrand === "gemini" ? "google/gemini-2.5-flash" : "openai/gpt-5.4";
}

export function getEffectiveProviderBrandForAgent(agentId: AgentId, providerBrand: ProviderBrand) {
  return agentId === "pi" ? providerBrand : agentId === "codex-cli" ? "gpt" : undefined;
}

export function getExecutionModelOptionsForAgent(
  state: HarnessViewState,
  agentId: AgentId,
  providerBrand: ProviderBrand
): Array<{ modelId: string; label: string }> {
  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
    const modelIds = [...new Set([...(runtime?.discoveredModels ?? []), ...(runtime?.activeModel ? [runtime.activeModel] : [])])];
    if (modelIds.length > 0) {
      return modelIds.map((modelId) => ({
        modelId,
        label: getModelCapability(state, modelId)?.label ?? modelId
      }));
    }

    if (agentId === "codex-cli") {
      return [];
    }
  }

  const effectiveProviderBrand = getEffectiveProviderBrandForAgent(agentId, providerBrand) ?? "gpt";
  const provider = state.capabilities.find((entry) => entry.providerBrand === effectiveProviderBrand);
  return (provider?.models ?? []).map((model) => ({
    modelId: model.modelId,
    label: model.label
  }));
}

export function isExecutionModelIdAvailableForAgent(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined,
  providerBrand: ProviderBrand
) {
  if (!modelId) {
    return false;
  }

  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
    const discovered = runtime?.activeModel === modelId || runtime?.discoveredModels.includes(modelId) || false;
    if (discovered) {
      return true;
    }

    if (agentId === "codex-cli") {
      return false;
    }
  }

  const effectiveProviderBrand = getEffectiveProviderBrandForAgent(agentId, providerBrand) ?? "gpt";
  return isModelIdForProvider(modelId, effectiveProviderBrand);
}

export function getFallbackExecutionModelIdForAgent(
  state: HarnessViewState,
  agentId: AgentId,
  providerBrand: ProviderBrand
): ExecutionModelId {
  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
    return (runtime?.activeModel ??
      runtime?.discoveredModels[0] ??
      getDefaultExecutionModelIdForProvider("gpt")) as ExecutionModelId;
  }

  return getDefaultExecutionModelIdForProvider(getEffectiveProviderBrandForAgent(agentId, providerBrand) ?? "gpt");
}

export function resolveExecutionModelIdForProject(
  state: HarnessViewState,
  project: Pick<ViewProjectState, "id" | "session">
) {
  return (
    resolveSelectedExecutionModelId(state, project, state.selectedAgentId) ??
    getFallbackExecutionModelIdForAgent(state, state.selectedAgentId, state.providerBrand)
  );
}

export function getResolvedModes(state: HarnessViewState, project = getActiveProject(state)) {
  return resolveModeCatalog(state.workspace.workspaceModes, project?.projectModes ?? []);
}

export function getActiveMode(state: HarnessViewState, project = getActiveProject(state)) {
  const hasValidGlobalMode =
    state.hasGlobalSelectedModeId &&
    Boolean(resolveModeById(state.selectedModeId, state.workspace.workspaceModes, project?.projectModes ?? []));
  const modeId = hasValidGlobalMode ? state.selectedModeId : project?.selectedModeId ?? DEFAULT_MODE_ID;
  return resolveModeById(modeId, state.workspace.workspaceModes, project?.projectModes ?? []);
}

export function getModelCapability(state: HarnessViewState, modelId: string | undefined): ModelCapability | undefined {
  if (!modelId) {
    return undefined;
  }

  return state.capabilities.flatMap((provider) => provider.models).find((model) => model.modelId === modelId);
}

export function getAvailableReasoningStrengthsForSelection(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined
): ComposerReasoningStrength[] {
  const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
  if (runtime?.supportsReasoningStrengthControl === false) {
    return [DEFAULT_COMPOSER_REASONING_STRENGTH];
  }

  const modelStrengths = getModelCapability(state, modelId)?.supportedReasoningStrengths ?? COMPOSER_REASONING_STRENGTHS;
  return COMPOSER_REASONING_STRENGTHS.filter((strength) => modelStrengths.includes(strength));
}

export function getSupportsFastModeForSelection(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined
) {
  const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
  if (runtime?.supportsFastModeControl === false) {
    return false;
  }

  return Boolean(getModelCapability(state, modelId)?.supportsFastMode);
}

export function getComposerControlState(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined
) {
  return resolveComposerControlState(state, agentId, modelId as ExecutionModelId | undefined);
}

export function getCapabilityTags(state: HarnessViewState, modelId: string | undefined) {
  return getModelCapability(state, modelId)?.tags ?? [];
}

export function isModelIdForProvider(modelId: string | undefined, providerBrand: ProviderBrand) {
  if (!modelId) {
    return false;
  }

  return providerBrand === "gemini" ? modelId.startsWith("google/") : modelId.startsWith("openai/");
}
