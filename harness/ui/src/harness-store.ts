import { createStore, reconcile, unwrap } from "solid-js/store";
import { defaultAgentCatalog } from "../../shared/agent-catalog";
import { defaultProviderCapabilities } from "../../shared/capabilities";
import { DEFAULT_MODE_ID, resolveModeById, resolveModeCatalog } from "../../shared/modes";
import {
  createRequestId,
  type Assistant,
  type AssistantAssetRef,
  type AssistantDetail,
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
  type BackgroundJobSchedulerStatus,
  type BackgroundJobsState,
  type BackgroundJobSchedulePreview,
  type BranchfsCleanupSummary,
  type CliSession,
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
  type ProjectThreadSummary,
  type RunModelPreference,
  type RunDiagnosticsReport,
  type RunDiagnosticsWindowDays,
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
import {
  DEFAULT_APP_HOTKEY_PREFERENCES,
  normalizeAppHotkeyPreferences,
  type AppHotkeyId,
  type AppHotkeyPreferences
} from "./lib/app-hotkeys";
import { applyThemePreference } from "./theme/theme-apply";
import {
  createDefaultCustomTheme,
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
  withThemePreference,
  type CustomThemeDefinition,
  type ThemeId,
  type ThemeModePreference,
  type ThemePreference
} from "./theme/theme-model";
import { pushToast, reportUiError } from "./toast-store";

export const OPENAI_API_KEY_STORAGE_KEY = "openai_api_key";
export const GOOGLE_API_KEY_STORAGE_KEY = "google_api_key";
export const ANTHROPIC_API_KEY_STORAGE_KEY = "anthropic_api_key";
export const PROVIDER_BRAND_STORAGE_KEY = "provider_brand";
export const DEBUG_ENABLED_STORAGE_KEY = "debug_enabled";
export const TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY = "trace_panel_default_open";
export const SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY = "subagent_worktree_strategy_default";
export const BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY = "block_chat_on_dirty_git_default";
export const DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY = "dirty_git_change_limit_default";
export const AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY = "auto_compact_context_threshold_percent_default";
export const PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY = "plan_execution_mode_default";
export const PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY = "plan_execution_delay_seconds_default";
export const SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY = "single_agent_model_preference_default";
export const SUBAGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY = "subagent_model_preference_default";
export const CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY = "correctness_iteration_mode_default";
export const BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY = "background_job_approval_policy_default";
export const ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_STORAGE_KEY =
  "assistant_auto_approve_non_blocking_questions_default";
export const ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_STORAGE_KEY = "assistant_congestion_control_enabled_default";
export const ASSISTANT_MAX_CONGESTION_DEFAULT_STORAGE_KEY = "assistant_max_congestion_default";
const AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_STORAGE_KEY = "pi-harness:auto-archive-completed-threads-default:v1";
export const BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY = "background_job_notifications_enabled";
export const MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY = "memory_bank_enabled_default";
export const MEMORY_BANK_RECORD_RUNS_DEFAULT_STORAGE_KEY = "memory_bank_record_runs_default";
export const CHECK_CLI_UPDATES_DEFAULT_STORAGE_KEY = "check_cli_updates_default";
export const COMPOSER_REASONING_STRENGTH_STORAGE_KEY = "composer_reasoning_strength";
export const COMPOSER_FAST_MODE_STORAGE_KEY = "composer_fast_mode";
export const APP_HOTKEY_PREFERENCES_STORAGE_KEY = "pi-harness:app-hotkeys:v1";
export const THEME_PREFERENCE_STORAGE_KEY = "pi-harness:theme-preference:v1";
export const PREFERENCES_ACTIVE_SECTION_STORAGE_KEY = "pi-harness:preferences-active-section:v1";
export const TOKEN_USAGE_LIFETIME_STORAGE_KEY = "pi-harness:token-usage-lifetime:v1";
export const THREAD_DRAFT_STORAGE_KEY_PREFIX = "pi-harness:thread-draft:v1";
export const TUTORIAL_PROGRESS_STORAGE_KEY = "pi-harness:tutorial-progress:v1";
export const BROWSER_UI_SESSION_STORAGE_KEY = "pi-harness:browser-ui-session:v1";
export const PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY = "pi-harness:project-sidebar-preferences:v1";
export const DEFAULT_COMPOSER_REASONING_STRENGTH: ComposerReasoningStrength = "high";
export const COMPOSER_REASONING_STRENGTHS: ComposerReasoningStrength[] = ["low", "medium", "high", "extra-high"];
const MAX_STREAMING_MESSAGE_HEARTBEATS = 2;
const MAX_LIVE_TRACE_HISTORY = 500;

export type HarnessActiveSurface = "chat" | "background-jobs" | "assistants" | "preferences" | "ide";
export type HarnessLeftTab = "projects" | "assistants" | "jobs" | "runs" | "preferences";
export type ChatPaneTab = "chat" | "plan" | "run" | "events" | "memory";
export type AssistantDetailTab = "chat" | "todos" | "questions" | "jobs" | "log" | "config" | "learnings";
export type AssistantScopeFilter = "all" | "global" | "project";
export type ProjectSidebarProjectSort = "last-user-message" | "created-at" | "manual";
export type ProjectSidebarThreadSort = "last-user-message" | "created-at";
export type ProjectSidebarGrouping = "repository" | "repository-path" | "separate";
export type JobsPaneSegment = "jobs" | "inbox" | "health";
export type AssistantRosterSort = "updated" | "created" | "name" | "run-state" | "bootstrap-state";
export type JobsPaneJobSort = "next-run" | "updated" | "created" | "status" | "risk";
export type JobsPaneRunSort = "urgency" | "updated" | "queued" | "status";
export type JobsJobStateFilter = "all" | BackgroundJobSchedulerStatus | "backoff";
export type JobsRunFilter = "all" | "approval" | "queued" | "running" | "failed" | "done";
export type TracePanelMode = "closed" | "peek" | "open";

export type RunDiagnosticsViewState = {
  loading: boolean;
  windowDays: RunDiagnosticsWindowDays;
  report?: RunDiagnosticsReport;
};

export type ProjectSidebarPreferences = {
  projectSort: ProjectSidebarProjectSort;
  threadSort: ProjectSidebarThreadSort;
  grouping: ProjectSidebarGrouping;
  manualProjectOrder: string[];
  collapsedProjectIds: string[];
};

export type JobsPanePreferences = {
  segment: JobsPaneSegment;
  search: string;
  jobSearch?: string;
  runSearch?: string;
  jobSort: JobsPaneJobSort;
  runSort?: JobsPaneRunSort;
  projectId?: string;
  assistantId?: string;
  kind?: BackgroundJob["kind"];
  status?: BackgroundJob["status"];
  jobState?: JobsJobStateFilter;
  risk?: BackgroundJob["riskLevel"];
  selectedJobId?: string;
  selectedRunId?: string;
  selectedNotificationId?: string;
};

export type ProviderConnectionProvider = "openai" | "google" | "anthropic";
export type ProviderConnectionTestState = {
  status: "idle" | "pending" | "ready" | "failed";
  message?: string;
  modelCount?: number;
};
export type PreferencesActiveSectionId =
  | "general-ui"
  | "keybinds"
  | "ide-settings"
  | "ai-providers"
  | "safety-guardrails"
  | "workspace-memory"
  | "usage"
  | "background-jobs"
  | "developer-advanced";

export type TokenUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalProcessedTokens: number;
  totalTokensIncludingCached: number;
  events: number;
  updatedAt?: string;
};

export type TokenUsageState = {
  session: TokenUsageTotals;
  lifetime: TokenUsageTotals;
  resetAt?: string;
};

export type MainPanelSizes = {
  left: number;
  center: number;
  right: number;
};

export type BrowserUiSessionState = {
  selectedModeId?: string;
  selectedAgentId?: AgentId;
  selectedExecutionModelId?: ExecutionModelId;
  selectedReasoningStrength?: ComposerReasoningStrength;
  selectedFastMode?: boolean;
  tracePanelMode?: TracePanelMode;
  tracePanelOpen?: boolean;
  activeLeftTab?: HarnessLeftTab;
  mainPanelSizes?: MainPanelSizes;
  lastActiveProjectId?: string;
  lastActiveThreadByProjectId?: Record<string, string>;
  chatPaneTab?: ChatPaneTab;
  assistantPane?: {
    scopeFilter?: AssistantScopeFilter;
    rosterSearch?: string;
    detailSearch?: string;
    runState?: Assistant["runState"];
    bootstrapState?: Assistant["bootstrapState"];
    providerBrand?: Assistant["providerBrand"];
    projectId?: string;
    selectedAssistantId?: string;
    rosterSort?: AssistantRosterSort;
    selectedTab?: AssistantDetailTab;
    selectedLogDetailsId?: string;
  };
  jobsPane?: Partial<JobsPanePreferences> & {
    runFilter?: JobsRunFilter;
  };
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
  providerBrand?: Assistant["providerBrand"];
  modeId?: string;
  executionModelId?: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
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
  lane?: BackgroundJob["lane"];
  kind: BackgroundJob["kind"];
  name: string;
  description: string;
  scheduleInput: string;
  timezone: string;
  aiPrompt: string;
  aiModeId?: string;
  aiExecutionModelId?: string;
  aiReasoningStrength?: ComposerReasoningStrength;
  aiFastMode?: boolean;
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
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  activeRun?: WorkspaceProjectState["activeRun"];
  lastRun?: WorkspaceProjectState["lastRun"];
  runSummaries: WorkspaceProjectState["runSummaries"];
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
  selectedTab: AssistantDetailTab;
  selectedLogDetailsId?: string;
  scopeFilter: AssistantScopeFilter;
  rosterSearch: string;
  detailSearch: string;
  runStateFilter?: Assistant["runState"];
  bootstrapStateFilter?: Assistant["bootstrapState"];
  providerBrandFilter?: Assistant["providerBrand"];
  projectIdFilter?: string;
  rosterSort: AssistantRosterSort;
  streamingByAssistantId: Record<string, string>;
};

export type HarnessViewState = {
  connectionState: ConnectionState;
  connectionError?: string;
  availableAgents: AgentOption[];
  availableSkillPaths: string[];
  agentRuntimes: AgentRuntimeCapability[];
  setup: SetupState;
  workspace: ViewWorkspaceState;
  activeSurface: HarnessActiveSurface;
  activeLeftTab: HarnessLeftTab;
  chatPaneTab: ChatPaneTab;
  projectSidebarPreferences: ProjectSidebarPreferences;
  jobsPanePreferences: JobsPanePreferences;
  jobsRunFilter: JobsRunFilter;
  assistants: ViewAssistantsState;
  backgroundJobs: BackgroundJobsState;
  runDiagnostics: RunDiagnosticsViewState;
  diagnosticsRefreshVersion: number;
  tokenUsage: TokenUsageState;
  tokenUsageResetDialogOpen: boolean;
  notifications: NotificationInboxState;
  executionControl: ExecutionControlState;
  backgroundJobSchedulePreview?: {
    requestId: string;
    preview: BackgroundJobSchedulePreview;
  };
  backgroundJobEditorOpen: boolean;
  backgroundJobEditorDraft?: BackgroundJobEditorDraft;
  backgroundJobDetailsRunId?: string;
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
  tracePanelMode: TracePanelMode;
  tracePanelOpen: boolean;
  tracePanelDefaultOpen: boolean;
  hasPersistedTracePanelOpen: boolean;
  mainPanelSizes: MainPanelSizes;
  executionPlanDialogOpen: boolean;
  selectedExecutionPlan?: ExecutionPlan;
  subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
  blockChatOnDirtyGitDefault: boolean;
  dirtyGitChangeLimitDefault: number;
  autoCompactContextThresholdPercentDefault: number;
  planExecutionModeDefault: "countdown" | "approve" | "immediate";
  planExecutionDelaySecondsDefault: number;
  singleAgentModelPreferenceDefault: RunModelPreference;
  subagentModelPreferenceDefault: RunModelPreference;
  correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
  backgroundJobApprovalPolicyDefault: BackgroundJobApprovalPolicy;
  assistantAutoApproveNonBlockingQuestionsDefault: boolean;
  assistantCongestionControlEnabledDefault: boolean;
  assistantMaxCongestionDefault: number;
  autoArchiveCompletedThreadsDefault: boolean;
  memoryBankEnabledDefault: boolean;
  memoryBankRecordRunsDefault: boolean;
  checkCliUpdatesDefault: boolean;
  appHotkeyPreferences: AppHotkeyPreferences;
  themePreference: ThemePreference;
  attachmentsEnabled: boolean;
  capabilities: ProviderCapability[];
  preferencesModalOpen: boolean;
  preferencesActiveSectionId: PreferencesActiveSectionId;
  preferencesSearchQuery: string;
  helpDialogOpen: boolean;
  ideFileOpenRequest?: {
    id: string;
    path: string;
    line?: number;
    column?: number;
  };
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
  hasUsableAnthropicApiKey: boolean;
  hasStoredAnthropicApiKey: boolean;
  providerConnectionTests: Record<ProviderConnectionProvider, ProviderConnectionTestState>;
  providerBrand: ProviderBrand;
  openAiApiKeyDraft: string;
  googleApiKeyDraft: string;
  anthropicApiKeyDraft: string;
  apiKeyDirty: boolean;
  hasLocalOpenAiApiKey: boolean;
  hasLocalGoogleApiKey: boolean;
  hasLocalAnthropicApiKey: boolean;
  hasLocalProviderBrandPreference: boolean;
  hasLocalDebugPreference: boolean;
  hasLocalTracePreference: boolean;
  hasLocalSubagentWorktreeStrategyPreference: boolean;
  hasLocalBlockChatOnDirtyGitPreference: boolean;
  hasLocalDirtyGitChangeLimitPreference: boolean;
  hasLocalAutoCompactContextThresholdPercentPreference: boolean;
  hasLocalPlanExecutionModePreference: boolean;
  hasLocalPlanExecutionDelaySecondsPreference: boolean;
  hasLocalSingleAgentModelPreference: boolean;
  hasLocalSubagentModelPreference: boolean;
  hasLocalCorrectnessIterationModePreference: boolean;
  hasLocalBackgroundJobApprovalPolicyPreference: boolean;
  hasLocalAssistantAutoApproveNonBlockingQuestionsPreference: boolean;
  hasLocalAssistantCongestionControlPreference: boolean;
  hasLocalAutoArchiveCompletedThreadsPreference: boolean;
  hasLocalMemoryBankEnabledPreference: boolean;
  hasLocalMemoryBankRecordRunsPreference: boolean;
  hasLocalCheckCliUpdatesPreference: boolean;
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
  branchfsCleanupSummary?: BranchfsCleanupSummary;
};

export type LocalPreferencesState = {
  openAiApiKey?: string;
  googleApiKey?: string;
  anthropicApiKey?: string;
  providerBrand?: ProviderBrand;
  debugEnabled?: boolean;
  tracePanelDefaultOpen?: boolean;
  subagentWorktreeStrategyDefault?: "same-worktree" | "separate-worktrees";
  blockChatOnDirtyGitDefault?: boolean;
  dirtyGitChangeLimitDefault?: number;
  autoCompactContextThresholdPercentDefault?: number;
  planExecutionModeDefault?: "countdown" | "approve" | "immediate";
  planExecutionDelaySecondsDefault?: number;
  singleAgentModelPreferenceDefault?: RunModelPreference;
  subagentModelPreferenceDefault?: RunModelPreference;
  correctnessIterationModeDefault?: "ask-before-iterate" | "auto-once" | "auto-until-clean";
  backgroundJobApprovalPolicyDefault?: BackgroundJobApprovalPolicy;
  assistantAutoApproveNonBlockingQuestionsDefault?: boolean;
  assistantCongestionControlEnabledDefault?: boolean;
  assistantMaxCongestionDefault?: number;
  autoArchiveCompletedThreadsDefault?: boolean;
  memoryBankEnabledDefault?: boolean;
  memoryBankRecordRunsDefault?: boolean;
  checkCliUpdatesDefault?: boolean;
  backgroundJobNotificationsEnabled?: boolean;
  selectedReasoningStrength?: ComposerReasoningStrength;
  selectedFastMode?: boolean;
  appHotkeyPreferences?: AppHotkeyPreferences;
  themePreference?: ThemePreference;
  preferencesActiveSectionId?: PreferencesActiveSectionId;
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

export function createDefaultProjectSidebarPreferences(): ProjectSidebarPreferences {
  return {
    projectSort: "last-user-message",
    threadSort: "last-user-message",
    grouping: "repository",
    manualProjectOrder: [],
    collapsedProjectIds: []
  };
}

export function createDefaultJobsPanePreferences(): JobsPanePreferences {
  return {
    segment: "inbox",
    search: "",
    jobSearch: "",
    runSearch: "",
    jobSort: "next-run",
    runSort: "urgency",
    projectId: undefined,
    assistantId: undefined,
    kind: undefined,
    status: undefined,
    jobState: "all",
    risk: undefined,
    selectedJobId: undefined,
    selectedRunId: undefined,
    selectedNotificationId: undefined
  };
}

export function createDefaultMainPanelSizes(): MainPanelSizes {
  return {
    left: 1.25,
    center: 3,
    right: 1.4
  };
}

export function createEmptyBackgroundJobsState(): BackgroundJobsState {
  return {
    jobs: [],
    runs: [],
    templates: []
  };
}

export function createInitialRunDiagnosticsState(): RunDiagnosticsViewState {
  return {
    loading: false,
    windowDays: 7,
    report: undefined
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
    selectedTab: "chat",
    selectedLogDetailsId: undefined,
    scopeFilter: "project",
    rosterSearch: "",
    detailSearch: "",
    runStateFilter: undefined,
    bootstrapStateFilter: undefined,
    providerBrandFilter: undefined,
    projectIdFilter: undefined,
    rosterSort: "updated",
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

export function createEmptyTokenUsageTotals(overrides: Partial<TokenUsageTotals> = {}): TokenUsageTotals {
  const inputTokens = Math.max(0, Math.round(overrides.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(overrides.outputTokens ?? 0));
  const totalProcessedTokens = Math.max(0, Math.round(overrides.totalProcessedTokens ?? inputTokens + outputTokens));
  const cachedInputTokens = Math.max(0, Math.round(overrides.cachedInputTokens ?? 0));
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalProcessedTokens,
    totalTokensIncludingCached: Math.max(
      0,
      Math.round(overrides.totalTokensIncludingCached ?? totalProcessedTokens + cachedInputTokens)
    ),
    events: Math.max(0, Math.round(overrides.events ?? 0)),
    updatedAt: typeof overrides.updatedAt === "string" && overrides.updatedAt.trim() ? overrides.updatedAt : undefined
  };
}

export function createEmptyTokenUsageState(overrides: Partial<TokenUsageState> = {}): TokenUsageState {
  return {
    session: createEmptyTokenUsageTotals(overrides.session ?? {}),
    lifetime: createEmptyTokenUsageTotals(overrides.lifetime ?? {}),
    resetAt: typeof overrides.resetAt === "string" && overrides.resetAt.trim() ? overrides.resetAt : undefined
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
    availableSkillPaths: [],
    agentRuntimes: [],
    setup: createInitialSetupState(),
    workspace: createInitialWorkspaceState(),
    activeSurface: "chat",
    activeLeftTab: "projects",
    chatPaneTab: "chat",
    projectSidebarPreferences: createDefaultProjectSidebarPreferences(),
    jobsPanePreferences: createDefaultJobsPanePreferences(),
    jobsRunFilter: "all",
    assistants: createEmptyAssistantsState(),
    backgroundJobs: createEmptyBackgroundJobsState(),
    runDiagnostics: createInitialRunDiagnosticsState(),
    diagnosticsRefreshVersion: 0,
    tokenUsage: createEmptyTokenUsageState(),
    tokenUsageResetDialogOpen: false,
    notifications: createEmptyNotificationInboxState(),
    executionControl: createInitialExecutionControlState(),
    backgroundJobSchedulePreview: undefined,
    backgroundJobEditorOpen: false,
    backgroundJobEditorDraft: undefined,
    backgroundJobDetailsRunId: undefined,
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
    tracePanelMode: "open",
    tracePanelOpen: true,
    tracePanelDefaultOpen: true,
    hasPersistedTracePanelOpen: false,
    mainPanelSizes: createDefaultMainPanelSizes(),
    executionPlanDialogOpen: false,
    selectedExecutionPlan: undefined,
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
    assistantAutoApproveNonBlockingQuestionsDefault: true,
    assistantCongestionControlEnabledDefault: true,
    assistantMaxCongestionDefault: 1,
    autoArchiveCompletedThreadsDefault: false,
    memoryBankEnabledDefault: true,
    memoryBankRecordRunsDefault: true,
    checkCliUpdatesDefault: true,
    appHotkeyPreferences: { ...DEFAULT_APP_HOTKEY_PREFERENCES },
    themePreference: DEFAULT_THEME_PREFERENCE,
    attachmentsEnabled: false,
    capabilities: [...defaultProviderCapabilities],
    preferencesModalOpen: false,
    preferencesActiveSectionId: "ai-providers",
    preferencesSearchQuery: "",
    helpDialogOpen: false,
    ideFileOpenRequest: undefined,
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
    hasUsableAnthropicApiKey: false,
    hasStoredAnthropicApiKey: false,
    providerConnectionTests: {
      openai: { status: "idle" },
      google: { status: "idle" },
      anthropic: { status: "idle" }
    },
    providerBrand: "gpt",
    openAiApiKeyDraft: "",
    googleApiKeyDraft: "",
    anthropicApiKeyDraft: "",
    apiKeyDirty: false,
    hasLocalOpenAiApiKey: false,
    hasLocalGoogleApiKey: false,
    hasLocalAnthropicApiKey: false,
    hasLocalProviderBrandPreference: false,
    hasLocalDebugPreference: false,
    hasLocalTracePreference: false,
    hasLocalSubagentWorktreeStrategyPreference: false,
    hasLocalBlockChatOnDirtyGitPreference: false,
    hasLocalDirtyGitChangeLimitPreference: false,
    hasLocalAutoCompactContextThresholdPercentPreference: false,
    hasLocalPlanExecutionModePreference: false,
    hasLocalPlanExecutionDelaySecondsPreference: false,
    hasLocalSingleAgentModelPreference: false,
    hasLocalSubagentModelPreference: false,
    hasLocalCorrectnessIterationModePreference: false,
    hasLocalBackgroundJobApprovalPolicyPreference: false,
    hasLocalAssistantAutoApproveNonBlockingQuestionsPreference: false,
    hasLocalAssistantCongestionControlPreference: false,
    hasLocalAutoArchiveCompletedThreadsPreference: false,
    hasLocalMemoryBankEnabledPreference: false,
    hasLocalMemoryBankRecordRunsPreference: false,
    hasLocalCheckCliUpdatesPreference: false,
    lastActiveProjectId: undefined,
    lastActiveThreadByProjectId: {},
    projectPreflights: {},
    pendingPreflightCommands: {},
    blockingNonGitPreflight: undefined,
    pendingPreflightRepairKind: undefined,
    cliSessionTerminal: {},
    branchfsCleanupSummary: undefined
  };
}

export function getActiveProject(state: HarnessViewState) {
  return state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId);
}

export function getVisibleAssistants(state: HarnessViewState) {
  if (state.assistants.scopeFilter === "all") {
    return state.assistants.assistants;
  }

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
    case "connection.ready": {
      const workspace = hydrateWorkspace(event.payload.workspace);
      const assistants = hydrateAssistants(state.assistants, event.payload.assistants);
      const backgroundJobs = event.payload.backgroundJobs;
      const notifications = event.payload.notifications;
      const readyState = {
        ...state,
        availableAgents: [...event.payload.agents],
        availableSkillPaths: event.payload.availableSkillPaths ?? [],
        setup: event.payload.setup,
        workspace,
        assistants,
        backgroundJobs,
        notifications,
        executionControl: event.payload.executionControl,
        projectPreflights: {},
        pendingPreflightCommands: {},
        blockingNonGitPreflight: undefined,
        pendingPreflightRepairKind: undefined,
        ...applyReadyPreferencesState(state, event.payload.preferences)
      };
      return {
        ...readyState,
        jobsPanePreferences: normalizeJobsPanePreferences(readyState.jobsPanePreferences, readyState, true)
      };
    }
    case "notifications.updated":
    case "cli-updates.checked":
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
        availableSkillPaths: event.payload.availableSkillPaths ?? state.availableSkillPaths,
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
        availableSkillPaths: event.payload.availableSkillPaths ?? state.availableSkillPaths,
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
    case "thread.cleanupArchived": {
      if (event.payload.archivedCount > 0) {
        pushToast("Threads archived", `Archived ${event.payload.archivedCount} old thread${event.payload.archivedCount === 1 ? "" : "s"}.`);
      } else {
        pushToast("No old threads matched", "No old threads matched this cleanup.", "info");
      }
      const incomingById = new Map(event.payload.projects.map((project) => [project.projectId, toViewProject(project.project)]));
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects.map((project) => {
            const incoming = incomingById.get(project.id);
            return incoming ? mergeIncomingProject(project, incoming) : project;
          })
        }
      };
    }
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
    case "thread.pinned":
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
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[event.payload.threadId] ??
              (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined)),
            latestPlan: event.payload.plan,
            isStreaming: project.activeThreadId === event.payload.threadId ? project.session.isStreaming : false
          })
        )
      );
    case "agent.trace":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          project,
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            traces: [...(priorLiveTranscript?.traces ?? []), event.payload.trace]
          })
        );
      });
    case "chat.delta":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const targetThreadId = event.payload.sessionId;
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, targetThreadId, "executing")
          },
          targetThreadId,
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[targetThreadId] ??
              (project.activeThreadId === targetThreadId
                ? getActiveThreadLiveTranscriptState(project)
                : undefined)),
            isStreaming: true,
            streamingAssistantText: `${
              (project.threadLiveTranscriptById[targetThreadId]?.streamingAssistantText ??
                (project.activeThreadId === targetThreadId ? project.streamingAssistantText : ""))
            }${event.payload.delta}`,
            lastError: undefined
          })
        );
      });
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
                  ...(event.payload.state ?? project.session),
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
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
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
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            isStreaming: false,
            streamingAssistantText: "",
            streamingTailSegments: [],
            streamingHeartbeatMessages: [],
            lastError: undefined
          })
        );
      });
    case "chat.message-appended":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
        threads: updateThreadSummaryFromAppendedEvent(
          project.threads,
          event.payload.threadId,
          event.payload.message,
          event.payload.thread
        ),
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
    case "thread.message-appended":
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
            threads: updateThreadSummaryFromAppendedEvent(
              project.threads,
              event.payload.threadId,
              event.payload.message,
              event.payload.thread
            ),
            session:
              project.activeThreadId === event.payload.threadId
                ? {
                  ...event.payload.state,
                  lastError: event.payload.state.lastError
                }
                : project.session
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[event.payload.threadId] ??
              (project.activeThreadId === event.payload.threadId
                ? getActiveThreadLiveTranscriptState(project)
                : undefined)),
            isStreaming: event.payload.state.isStreaming,
            streamingAssistantText: event.payload.state.isStreaming
              ? (project.threadLiveTranscriptById[event.payload.threadId]?.streamingAssistantText ??
                (project.activeThreadId === event.payload.threadId ? project.streamingAssistantText : ""))
              : "",
            streamingTailSegments: event.payload.state.isStreaming
              ? (project.threadLiveTranscriptById[event.payload.threadId]?.streamingTailSegments ??
                (project.activeThreadId === event.payload.threadId ? project.streamingTailSegments : []))
              : [],
            streamingHeartbeatMessages: event.payload.state.isStreaming
              ? (project.threadLiveTranscriptById[event.payload.threadId]?.streamingHeartbeatMessages ??
                (project.activeThreadId === event.payload.threadId ? project.streamingHeartbeatMessages : []))
              : [],
            lastError: event.payload.state.lastError
          })
        )
      );
    case "thread.message-updated":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        threads: updateThreadSummaryFromUpdatedMessage(project.threads, event.payload.threadId, event.payload.message),
        session:
          project.activeThreadId === event.payload.threadId
            ? {
              ...project.session,
              messages: project.session.messages.map((message) =>
                message.id === event.payload.message.id ? event.payload.message : message
              )
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
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[errorThreadId] ??
          (project.activeThreadId === errorThreadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
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
            ...priorLiveTranscript,
            isStreaming: false,
            streamingAssistantText: "",
            streamingTailSegments: [],
            streamingHeartbeatMessages: [],
            lastError: event.payload.detail ?? event.payload.message
          })
        );
      });
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
      const currentThreadState =
        currentProject?.threadLiveTranscriptById[event.payload.threadId] ??
        (currentProject?.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(currentProject) : undefined);
      const latestKnownRunId = currentThreadState?.activeRun?.id ?? currentThreadState?.lastRun?.id;
      const resetPlanningTransients =
        event.payload.run.status === "planning" &&
        latestKnownRunId !== undefined &&
        latestKnownRunId !== event.payload.run.id;

      return {
        ...updateProjectState(state, event.payload.projectId, (project) => {
          const appliesToActiveThread = project.activeThreadId === event.payload.threadId;
          const priorLiveTranscript =
            project.threadLiveTranscriptById[event.payload.threadId] ??
            (appliesToActiveThread ? getActiveThreadLiveTranscriptState(project) : undefined);
          const nextLiveTranscript = createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            latestPlan: resetPlanningTransients ? undefined : priorLiveTranscript?.latestPlan,
            contextUsage: resetPlanningTransients ? undefined : priorLiveTranscript?.contextUsage,
            traces: resetPlanningTransients ? [] : priorLiveTranscript?.traces,
            streamingAssistantText: resetPlanningTransients ? "" : priorLiveTranscript?.streamingAssistantText,
            streamingTailSegments: resetPlanningTransients ? [] : priorLiveTranscript?.streamingTailSegments,
            streamingHeartbeatMessages: resetPlanningTransients ? [] : priorLiveTranscript?.streamingHeartbeatMessages,
            lastError: resetPlanningTransients ? undefined : priorLiveTranscript?.lastError,
            activeRun: event.payload.run.status === "completed" ? undefined : event.payload.run,
            lastRun: event.payload.run,
            runSummaries: upsertRunSummary(priorLiveTranscript?.runSummaries ?? [], toRunSummary(event.payload.run))
          });
          return applyThreadLiveTranscriptState(
            {
              ...project,
              threads: setThreadBadge(project.threads, event.payload.threadId, badgeFromRunStatus(event.payload.run.status))
            },
            event.payload.threadId,
            nextLiveTranscript
          );
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
        },
        diagnosticsRefreshVersion: state.diagnosticsRefreshVersion + 1
      };
    case "run.status-patched":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const appliesToActiveThread = project.activeThreadId === event.payload.threadId;
        const patchRun = (run: typeof project.activeRun) =>
          run?.id === event.payload.runId
            ? {
              ...run,
              status: event.payload.status,
              failureMessage: event.payload.failureMessage,
              failureCategory: event.payload.failureCategory,
              resumable: event.payload.resumable ?? run.resumable,
              retryable: event.payload.retryable ?? run.retryable,
              updatedAt: event.payload.updatedAt,
              completedAt: event.payload.completedAt
            }
            : run;
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (appliesToActiveThread ? getActiveThreadLiveTranscriptState(project) : undefined);
        const nextLiveTranscript = createThreadLiveTranscriptState({
          ...priorLiveTranscript,
          activeRun: patchRun(priorLiveTranscript?.activeRun),
          lastRun: patchRun(priorLiveTranscript?.lastRun),
          runSummaries: (priorLiveTranscript?.runSummaries ?? []).map((run) =>
            run.id === event.payload.runId
              ? {
                ...run,
                status: event.payload.status,
                failureMessage: event.payload.failureMessage,
                failureCategory: event.payload.failureCategory,
                resumable: event.payload.resumable ?? run.resumable,
                retryable: event.payload.retryable ?? run.retryable,
                updatedAt: event.payload.updatedAt,
                completedAt: event.payload.completedAt
              }
              : run
          )
        });
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, event.payload.threadId, badgeFromRunStatus(event.payload.status))
          },
          event.payload.threadId,
          nextLiveTranscript
        );
      });
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
    case "memory.reordered":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        memoryEntries: event.payload.entries
      }));
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
        activeCliSession:
          project.activeThreadId === event.payload.threadId ? event.payload.session : project.activeCliSession,
        cliSessions: upsertCliSession(project.cliSessions ?? [], event.payload.session)
      }));
    case "cli-session.attach-ready":
      return state;
    case "background-jobs.updated":
      return {
        ...state,
        backgroundJobs: event.payload.backgroundJobs,
        diagnosticsRefreshVersion: state.diagnosticsRefreshVersion + 1
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
    case "assistant.summary.listed":
      return {
        ...state,
        assistants: hydrateAssistants(state.assistants, {
          assistants: event.payload.assistants.items,
          threads: [],
          todos: [],
          learnings: [],
          questions: [],
          logs: [],
          assetRefs: []
        })
      };
    case "assistant.detail.loaded":
      return {
        ...state,
        assistants: mergeAssistantDetail(state.assistants, event.payload.detail)
      };
    case "assistant.thread.messages.listed":
      return {
        ...state,
        assistants: mergeAssistantThreadMessages(
          state.assistants,
          event.payload.assistantId,
          event.payload.threadId,
          event.payload.messages.items
        )
      };
    case "assistant.logs.listed":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          logs: mergeScopedItems(state.assistants.logs, event.payload.assistantId, event.payload.logs.items)
        }
      };
    case "assistant.todos.listed":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          todos: mergeScopedItems(state.assistants.todos, event.payload.assistantId, event.payload.todos.items)
        }
      };
    case "assistant.learnings.listed":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          learnings: mergeScopedItems(state.assistants.learnings, event.payload.assistantId, event.payload.learnings.items)
        }
      };
    case "assistant.questions.listed":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          questions: mergeScopedItems(state.assistants.questions, event.payload.assistantId, event.payload.questions.items)
        }
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
    case "assistant.chat.message-appended":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          threads: upsertById(state.assistants.threads, event.payload.thread)
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
        assistants: {
          ...state.assistants,
          selectedAssistantId: event.payload.assistant.id,
          scopeFilter: event.payload.assistant.scope === "global" ? "global" : "project"
        }
      };
    case "background-job-run.updated":
      return {
        ...state,
        backgroundJobs: {
          ...state.backgroundJobs,
          runs: upsertBackgroundJobRun(state.backgroundJobs.runs, event.payload.run)
        },
        diagnosticsRefreshVersion: state.diagnosticsRefreshVersion + 1
      };
    case "run-diagnostics.inspected":
      return {
        ...state,
        runDiagnostics: {
          loading: false,
          windowDays: event.payload.report.windowDays,
          report: event.payload.report
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
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          project,
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            activeRun: priorLiveTranscript?.activeRun?.id === event.payload.runId ? undefined : priorLiveTranscript?.activeRun
          })
        );
      });
    case "project.context":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          project,
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            contextUsage: event.payload.contextUsage
          })
        );
      });
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
    case "preferences.providerConnectionTested":
      return {
        ...state,
        providerConnectionTests: {
          ...state.providerConnectionTests,
          [event.payload.provider]: {
            status: event.payload.status,
            message: event.payload.message,
            modelCount: event.payload.modelCount
          }
        }
      };
    case "branchfs.cleaned":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) => project),
        branchfsCleanupSummary: event.payload.summary
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

function applyTokenUsageEvent(
  state: HarnessViewState,
  event: Extract<ServerEvent, { type: "project.context" }>,
  recordedEventKeys: Set<string>
) {
  const eventKey = createTokenUsageEventKey(event);
  if (recordedEventKeys.has(eventKey)) {
    return state;
  }

  recordedEventKeys.add(eventKey);
  const delta = createTokenUsageDelta(event.payload.contextUsage);
  if (delta.totalTokensIncludingCached <= 0) {
    return state;
  }

  const tokenUsage = {
    ...state.tokenUsage,
    session: addTokenUsageTotals(state.tokenUsage.session, delta),
    lifetime: addTokenUsageTotals(state.tokenUsage.lifetime, delta)
  };
  persistTokenUsageLifetime(tokenUsage.lifetime);
  return {
    ...state,
    tokenUsage
  };
}

function createTokenUsageEventKey(event: Extract<ServerEvent, { type: "project.context" }>) {
  const usage = event.payload.contextUsage;
  return [
    event.requestId,
    event.payload.projectId,
    event.payload.threadId,
    usage.sourceKind,
    usage.sourceLabel,
    usage.modelId,
    usage.updatedAt,
    usage.tokens ?? "",
    usage.totalProcessedTokens ?? "",
    usage.cachedInputTokens ?? ""
  ].join("|");
}

function createTokenUsageDelta(usage: ProjectContextUsage) {
  const inputTokens = normalizeTokenCount(usage.tokens);
  const totalProcessedTokens = Math.max(inputTokens, normalizeTokenCount(usage.totalProcessedTokens ?? inputTokens));
  const cachedInputTokens = normalizeTokenCount(usage.cachedInputTokens);
  return createEmptyTokenUsageTotals({
    inputTokens,
    outputTokens: Math.max(0, totalProcessedTokens - inputTokens),
    cachedInputTokens,
    totalProcessedTokens,
    totalTokensIncludingCached: totalProcessedTokens + cachedInputTokens,
    events: 1,
    updatedAt: usage.updatedAt
  });
}

function addTokenUsageTotals(left: TokenUsageTotals, right: TokenUsageTotals) {
  return createEmptyTokenUsageTotals({
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    totalProcessedTokens: left.totalProcessedTokens + right.totalProcessedTokens,
    totalTokensIncludingCached: left.totalTokensIncludingCached + right.totalTokensIncludingCached,
    events: left.events + right.events,
    updatedAt: [left.updatedAt, right.updatedAt].filter(Boolean).sort().at(-1)
  });
}

export function createHarnessStore() {
  const [state, setState] = createStore(createInitialViewState());
  let commandDispatcher: ((command: ClientCommand) => void) | undefined;
  const recordedTokenUsageEventKeys = new Set<string>();

  const persistBrowserUiStateIfChanged = (previousSnapshot: BrowserUiSessionState, nextState: HarnessViewState) => {
    const nextSnapshot = getBrowserUiSessionSnapshot(nextState);
    if (JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot)) {
      persistBrowserUiSession(nextSnapshot);
    }
  };
  const setThemePreferenceState = (themePreference: ThemePreference) => {
    const normalized = normalizeThemePreference(themePreference);
    setState({ themePreference: normalized });
    persistMergedLocalPreferences({ themePreference: normalized });
    applyThemePreference(normalized);
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
          activeLeftTab: normalizeLeftTab(browserUiSession.activeLeftTab),
          activeSurface: leftTabToActiveSurface(normalizeLeftTab(browserUiSession.activeLeftTab)),
          mainPanelSizes: normalizeMainPanelSizes(browserUiSession.mainPanelSizes),
          chatPaneTab: normalizeChatPaneTab(browserUiSession.chatPaneTab),
        assistants: {
          ...state.assistants,
          scopeFilter: normalizeAssistantScopeFilter(browserUiSession.assistantPane?.scopeFilter ?? state.assistants.scopeFilter),
          rosterSearch: normalizeSearchText(browserUiSession.assistantPane?.rosterSearch ?? state.assistants.rosterSearch),
          detailSearch: normalizeSearchText(browserUiSession.assistantPane?.detailSearch ?? state.assistants.detailSearch),
          runStateFilter: normalizeAssistantRunStateFilter(browserUiSession.assistantPane?.runState ?? state.assistants.runStateFilter),
          bootstrapStateFilter: normalizeAssistantBootstrapStateFilter(
            browserUiSession.assistantPane?.bootstrapState ?? state.assistants.bootstrapStateFilter
          ),
          providerBrandFilter: normalizeAssistantProviderBrandFilter(
            browserUiSession.assistantPane?.providerBrand ?? state.assistants.providerBrandFilter
          ),
          projectIdFilter: normalizeOptionalStorageString(browserUiSession.assistantPane?.projectId ?? state.assistants.projectIdFilter),
          rosterSort: normalizeAssistantRosterSort(browserUiSession.assistantPane?.rosterSort ?? state.assistants.rosterSort),
          selectedAssistantId: normalizeOptionalStorageString(
            browserUiSession.assistantPane?.selectedAssistantId ?? state.assistants.selectedAssistantId
          ),
            selectedTab: normalizeAssistantDetailTab(browserUiSession.assistantPane?.selectedTab ?? state.assistants.selectedTab),
            selectedLogDetailsId: normalizeOptionalStorageString(
              browserUiSession.assistantPane?.selectedLogDetailsId ?? state.assistants.selectedLogDetailsId
            )
          },
          jobsPanePreferences: normalizeJobsPanePreferences(browserUiSession.jobsPane ?? state.jobsPanePreferences),
          jobsRunFilter: normalizeJobsRunFilter(browserUiSession.jobsPane?.runFilter ?? state.jobsRunFilter),
          tracePanelMode: browserUiSession.tracePanelMode ?? state.tracePanelMode,
          tracePanelOpen: (browserUiSession.tracePanelMode ?? state.tracePanelMode) !== "closed",
          hasPersistedTracePanelOpen: browserUiSession.tracePanelMode !== undefined,
          lastActiveProjectId: browserUiSession.lastActiveProjectId,
          lastActiveThreadByProjectId: { ...(browserUiSession.lastActiveThreadByProjectId ?? {}) }
        });
        setState(reconcile(nextState));
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
        return browserUiSession;
      },
      persistBrowserUiSession() {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(state));
      },
      startRunDiagnosticsRequest(windowDays: RunDiagnosticsWindowDays) {
        setState({
          runDiagnostics: {
            loading: true,
            windowDays,
            report:
              state.runDiagnostics.report?.windowDays === windowDays
                ? state.runDiagnostics.report
                : undefined
          }
        });
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
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const activeLeftTab = activeSurfaceToLeftTab(activeSurface);
      const nextState = finalizeHarnessViewState({
        ...state,
        activeSurface,
        activeLeftTab
      });
      setState(reconcile(nextState));
      if (JSON.stringify(previousSnapshot) === JSON.stringify(getBrowserUiSessionSnapshot(nextState))) {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(nextState));
      } else {
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      }
    },
    setActiveLeftTab(activeLeftTab: HarnessLeftTab) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const normalizedTab = normalizeLeftTab(activeLeftTab);
      const nextState = finalizeHarnessViewState({
        ...state,
        activeLeftTab: normalizedTab,
        activeSurface: leftTabToActiveSurface(normalizedTab)
      });
      setState(reconcile(nextState));
      if (JSON.stringify(previousSnapshot) === JSON.stringify(getBrowserUiSessionSnapshot(nextState))) {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(nextState));
      } else {
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      }
    },
    openIdeFile(path: string, line?: number, column?: number) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const isIdePage = typeof window !== "undefined" && window.location.pathname === "/ide";
      const nextState = finalizeHarnessViewState({
        ...state,
        activeSurface: isIdePage ? "ide" : state.activeSurface,
        ideFileOpenRequest: {
          id: createRequestId(),
          path,
          line,
          column
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setChatPaneTab(chatPaneTab: ChatPaneTab) {
      const currentState = unwrap(state) as HarnessViewState;
      const previousSnapshot = getBrowserUiSessionSnapshot(currentState);
      const nextState = finalizeHarnessViewState({
        ...currentState,
        chatPaneTab: normalizeChatPaneTab(chatPaneTab)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setProjectSidebarPreferences(projectSidebarPreferences: Partial<ProjectSidebarPreferences>) {
      const nextPreferences = normalizeProjectSidebarPreferences(
        {
          ...state.projectSidebarPreferences,
          ...projectSidebarPreferences,
          manualProjectOrder:
            projectSidebarPreferences.manualProjectOrder ?? state.projectSidebarPreferences.manualProjectOrder,
          collapsedProjectIds:
            projectSidebarPreferences.collapsedProjectIds ?? state.projectSidebarPreferences.collapsedProjectIds
        },
        state.workspace.projects.map((project) => project.id)
      );
      setState({ projectSidebarPreferences: nextPreferences });
      persistProjectSidebarPreferences(nextPreferences);
    },
    setJobsPanePreferences(jobsPanePreferences: Partial<JobsPanePreferences>) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        jobsPanePreferences: normalizeJobsPanePreferences({
          ...state.jobsPanePreferences,
          ...jobsPanePreferences
        })
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setJobsRunFilter(jobsRunFilter: JobsRunFilter) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        jobsRunFilter: normalizeJobsRunFilter(jobsRunFilter)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantScopeFilter(scopeFilter: AssistantScopeFilter) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          scopeFilter: normalizeAssistantScopeFilter(scopeFilter)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantPaneFilters(filters: Partial<Pick<ViewAssistantsState, "rosterSearch" | "detailSearch" | "runStateFilter" | "bootstrapStateFilter" | "providerBrandFilter" | "projectIdFilter" | "rosterSort">>) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const hasFilter = (key: keyof typeof filters) => Object.prototype.hasOwnProperty.call(filters, key);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          rosterSearch: normalizeSearchText(hasFilter("rosterSearch") ? filters.rosterSearch : state.assistants.rosterSearch),
          detailSearch: normalizeSearchText(hasFilter("detailSearch") ? filters.detailSearch : state.assistants.detailSearch),
          runStateFilter: normalizeAssistantRunStateFilter(hasFilter("runStateFilter") ? filters.runStateFilter : state.assistants.runStateFilter),
          bootstrapStateFilter: normalizeAssistantBootstrapStateFilter(hasFilter("bootstrapStateFilter") ? filters.bootstrapStateFilter : state.assistants.bootstrapStateFilter),
          providerBrandFilter: normalizeAssistantProviderBrandFilter(hasFilter("providerBrandFilter") ? filters.providerBrandFilter : state.assistants.providerBrandFilter),
          projectIdFilter: normalizeOptionalStorageString(hasFilter("projectIdFilter") ? filters.projectIdFilter : state.assistants.projectIdFilter),
          rosterSort: normalizeAssistantRosterSort(hasFilter("rosterSort") ? filters.rosterSort : state.assistants.rosterSort)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantDetailTab(selectedTab: AssistantDetailTab) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          selectedTab: normalizeAssistantDetailTab(selectedTab)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantLogDetailsId(selectedLogDetailsId?: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          selectedLogDetailsId: normalizeOptionalStorageString(selectedLogDetailsId)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedAssistantId(assistantId?: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          selectedAssistantId: normalizeOptionalStorageString(assistantId)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    openAssistantEditor(assistantEditorDraft: AssistantEditorDraft) {
      setState({
        assistantEditorOpen: true,
        assistantEditorDraft,
        activeSurface: "assistants",
        activeLeftTab: "assistants"
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
        activeSurface: "background-jobs",
        activeLeftTab: "jobs"
      });
    },
    closeBackgroundJobEditor() {
      setState({
        backgroundJobEditorOpen: false,
        backgroundJobEditorDraft: undefined,
        backgroundJobSchedulePreview: undefined
      });
    },
    openBackgroundJobDetailsDialog(runId: string) {
      setState({ backgroundJobDetailsRunId: runId });
    },
    closeBackgroundJobDetailsDialog() {
      setState({ backgroundJobDetailsRunId: undefined });
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
      setState({
        selectedModeId: nextState.selectedModeId,
        hasGlobalSelectedModeId: nextState.hasGlobalSelectedModeId
      });
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
    setThemeId(themeId: ThemeId) {
      setThemePreferenceState(withThemePreference(state.themePreference, { themeId }));
    },
    setThemeMode(mode: ThemeModePreference) {
      setThemePreferenceState(withThemePreference(state.themePreference, { mode }));
    },
    setCustomTheme(custom: CustomThemeDefinition) {
      setThemePreferenceState(withThemePreference(state.themePreference, { themeId: "custom", custom }));
    },
    resetCustomTheme() {
      setThemePreferenceState(withThemePreference(state.themePreference, {
        themeId: "custom",
        custom: createDefaultCustomTheme(state.themePreference.custom?.baseThemeId)
      }));
    },
    setTracePanelOpen(tracePanelOpen: boolean) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const tracePanelMode: TracePanelMode = tracePanelOpen ? "open" : "closed";
      const nextState = finalizeHarnessViewState({
        ...state,
        tracePanelMode,
        tracePanelOpen,
        hasPersistedTracePanelOpen: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setTracePanelMode(tracePanelMode: TracePanelMode) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        tracePanelMode,
        tracePanelOpen: tracePanelMode !== "closed",
        hasPersistedTracePanelOpen: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    toggleTracePanel() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const tracePanelMode: TracePanelMode = state.tracePanelMode === "closed" ? "peek" : state.tracePanelMode === "peek" ? "open" : "closed";
      const nextState = finalizeHarnessViewState({
        ...state,
        tracePanelMode,
        tracePanelOpen: tracePanelMode !== "closed",
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
        tracePanelMode: state.hasPersistedTracePanelOpen ? state.tracePanelMode : tracePanelDefaultOpen ? "open" : "closed",
        tracePanelOpen: state.hasPersistedTracePanelOpen ? state.tracePanelOpen : tracePanelDefaultOpen
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setMainPanelSizes(mainPanelSizes: MainPanelSizes) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        mainPanelSizes: normalizeMainPanelSizes(mainPanelSizes)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    resetMainPanelSizes() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        mainPanelSizes: createDefaultMainPanelSizes()
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
      setState({ planExecutionDelaySecondsDefault: Math.max(0, Math.min(300, Math.round(planExecutionDelaySecondsDefault))) });
    },
    setSingleAgentModelPreferenceDefault(singleAgentModelPreferenceDefault: RunModelPreference) {
      setState({ singleAgentModelPreferenceDefault });
    },
    setSubagentModelPreferenceDefault(subagentModelPreferenceDefault: RunModelPreference) {
      setState({ subagentModelPreferenceDefault });
    },
    setCorrectnessIterationModeDefault(correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean") {
      setState({ correctnessIterationModeDefault });
    },
    setBackgroundJobApprovalPolicyDefault(backgroundJobApprovalPolicyDefault: BackgroundJobApprovalPolicy) {
      setState({ backgroundJobApprovalPolicyDefault });
    },
    setAssistantAutoApproveNonBlockingQuestionsDefault(assistantAutoApproveNonBlockingQuestionsDefault: boolean) {
      setState({ assistantAutoApproveNonBlockingQuestionsDefault });
    },
    setAssistantCongestionControlEnabledDefault(assistantCongestionControlEnabledDefault: boolean) {
      setState({ assistantCongestionControlEnabledDefault });
    },
    setAssistantMaxCongestionDefault(assistantMaxCongestionDefault: number) {
      setState({ assistantMaxCongestionDefault: Math.max(0.25, Math.min(3, Math.round(assistantMaxCongestionDefault * 4) / 4)) });
    },
    setMemoryBankEnabledDefault(memoryBankEnabledDefault: boolean) {
      setState({ memoryBankEnabledDefault });
    },
    setMemoryBankRecordRunsDefault(memoryBankRecordRunsDefault: boolean) {
      setState({ memoryBankRecordRunsDefault });
    },
    setCheckCliUpdatesDefault(checkCliUpdatesDefault: boolean) {
      setState({ checkCliUpdatesDefault });
    },
    setAppHotkeyPreference(appHotkeyId: AppHotkeyId, hotkeys: string[]) {
      setState("appHotkeyPreferences", appHotkeyId, hotkeys.map((hotkey) => hotkey.trim()).filter(Boolean));
    },
    setAutoArchiveCompletedThreadsDefault(autoArchiveCompletedThreadsDefault: boolean) {
      setState({ autoArchiveCompletedThreadsDefault });
    },
    beginProviderConnectionTest(provider: ProviderConnectionProvider) {
      setState("providerConnectionTests", provider, {
        status: "pending",
        message: "Testing connection..."
      });
    },
    openPreferencesModal() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        activeLeftTab: "preferences",
        activeSurface: "preferences",
        preferencesModalOpen: false,
        preferencesActiveSectionId: state.preferencesActiveSectionId,
        preferencesSearchQuery: ""
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    closePreferencesModal() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        activeLeftTab: "projects",
        activeSurface: "chat",
        preferencesModalOpen: false
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setPreferencesActiveSectionId(preferencesActiveSectionId: PreferencesActiveSectionId) {
      setState({ preferencesActiveSectionId, preferencesSearchQuery: "" });
      persistMergedLocalPreferences({ preferencesActiveSectionId });
    },
    setPreferencesSearchQuery(preferencesSearchQuery: string) {
      setState({ preferencesSearchQuery });
    },
    openHelpDialog() {
      setState({ helpDialogOpen: true, setupChecklistOpen: true });
    },
    closeHelpDialog() {
      setState({ helpDialogOpen: false });
    },
    openTokenUsageResetDialog() {
      setState({ tokenUsageResetDialogOpen: true });
    },
    closeTokenUsageResetDialog() {
      setState({ tokenUsageResetDialogOpen: false });
    },
    resetTokenUsage() {
      const resetAt = new Date().toISOString();
      const tokenUsage = createEmptyTokenUsageState({ resetAt });
      recordedTokenUsageEventKeys.clear();
      persistTokenUsageLifetime(tokenUsage.lifetime);
      setState({ tokenUsage, tokenUsageResetDialogOpen: false });
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
    setAnthropicApiKeyDraft(anthropicApiKeyDraft: string) {
      setState({
        anthropicApiKeyDraft,
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
      const themePreference = normalizeThemePreference(localPreferences.themePreference ?? state.themePreference);
      setState(reconcile(finalizeHarnessViewState({
        ...state,
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelMode:
          state.hasPersistedTracePanelOpen
            ? state.tracePanelMode
            : localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen
              ? "open"
              : "closed",
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
        singleAgentModelPreferenceDefault:
          localPreferences.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault:
          localPreferences.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault:
          localPreferences.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          localPreferences.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault ??
          state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault:
          localPreferences.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          localPreferences.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        autoArchiveCompletedThreadsDefault:
          localPreferences.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: localPreferences.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault:
          localPreferences.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: localPreferences.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(
          localPreferences.appHotkeyPreferences ?? state.appHotkeyPreferences
        ),
        themePreference,
        backgroundJobNotificationsEnabled:
          localPreferences.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        preferencesActiveSectionId:
          localPreferences.preferencesActiveSectionId ?? state.preferencesActiveSectionId,
        projectSidebarPreferences: normalizeProjectSidebarPreferences(
          readProjectSidebarPreferences(),
          state.workspace.projects.map((project) => project.id)
        ),
        selectedReasoningStrength: localPreferences.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: localPreferences.selectedFastMode ?? state.selectedFastMode,
        hasGlobalSelectedReasoningStrength:
          localPreferences.selectedReasoningStrength !== undefined || state.hasGlobalSelectedReasoningStrength,
        hasGlobalSelectedFastMode: localPreferences.selectedFastMode !== undefined || state.hasGlobalSelectedFastMode,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        anthropicApiKeyDraft: localPreferences.anthropicApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalAnthropicApiKey: Boolean(localPreferences.anthropicApiKey),
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
        hasLocalSingleAgentModelPreference: localPreferences.singleAgentModelPreferenceDefault !== undefined,
        hasLocalSubagentModelPreference: localPreferences.subagentModelPreferenceDefault !== undefined,
        hasLocalCorrectnessIterationModePreference: localPreferences.correctnessIterationModeDefault !== undefined,
        hasLocalBackgroundJobApprovalPolicyPreference: localPreferences.backgroundJobApprovalPolicyDefault !== undefined,
        hasLocalAssistantAutoApproveNonBlockingQuestionsPreference:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault !== undefined,
        hasLocalAssistantCongestionControlPreference:
          localPreferences.assistantCongestionControlEnabledDefault !== undefined ||
          localPreferences.assistantMaxCongestionDefault !== undefined,
        hasLocalAutoArchiveCompletedThreadsPreference: localPreferences.autoArchiveCompletedThreadsDefault !== undefined,
        hasLocalMemoryBankEnabledPreference: localPreferences.memoryBankEnabledDefault !== undefined,
        hasLocalMemoryBankRecordRunsPreference: localPreferences.memoryBankRecordRunsDefault !== undefined,
        hasLocalCheckCliUpdatesPreference: localPreferences.checkCliUpdatesDefault !== undefined
      })));
      applyThemePreference(themePreference);
    },
    setHasUsableApiKey(hasUsableApiKey: boolean) {
      setState({ hasUsableApiKey });
    },
    hydrateLocalPreferences() {
      const localPreferences = readLocalPreferences();
      const themePreference = normalizeThemePreference(localPreferences.themePreference ?? state.themePreference);
      const tokenUsage = createEmptyTokenUsageState({
        session: state.tokenUsage.session,
        lifetime: readTokenUsageLifetime(),
        resetAt: state.tokenUsage.resetAt
      });
      const nextState = finalizeHarnessViewState({
        ...state,
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelMode:
          state.hasPersistedTracePanelOpen
            ? state.tracePanelMode
            : localPreferences.tracePanelDefaultOpen ?? state.tracePanelOpen
              ? "open"
              : "closed",
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
        singleAgentModelPreferenceDefault:
          localPreferences.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault:
          localPreferences.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault:
          localPreferences.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          localPreferences.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault ??
          state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault:
          localPreferences.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          localPreferences.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        autoArchiveCompletedThreadsDefault:
          localPreferences.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: localPreferences.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault:
          localPreferences.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: localPreferences.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(
          localPreferences.appHotkeyPreferences ?? state.appHotkeyPreferences
        ),
        themePreference,
        backgroundJobNotificationsEnabled:
          localPreferences.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        tokenUsage,
        preferencesActiveSectionId:
          localPreferences.preferencesActiveSectionId ?? state.preferencesActiveSectionId,
        projectSidebarPreferences: normalizeProjectSidebarPreferences(
          readProjectSidebarPreferences(),
          state.workspace.projects.map((project) => project.id)
        ),
        selectedReasoningStrength: localPreferences.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: localPreferences.selectedFastMode ?? state.selectedFastMode,
        hasGlobalSelectedReasoningStrength:
          localPreferences.selectedReasoningStrength !== undefined || state.hasGlobalSelectedReasoningStrength,
        hasGlobalSelectedFastMode: localPreferences.selectedFastMode !== undefined || state.hasGlobalSelectedFastMode,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        anthropicApiKeyDraft: localPreferences.anthropicApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalAnthropicApiKey: Boolean(localPreferences.anthropicApiKey),
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
        hasLocalSingleAgentModelPreference: localPreferences.singleAgentModelPreferenceDefault !== undefined,
        hasLocalSubagentModelPreference: localPreferences.subagentModelPreferenceDefault !== undefined,
        hasLocalCorrectnessIterationModePreference: localPreferences.correctnessIterationModeDefault !== undefined,
        hasLocalBackgroundJobApprovalPolicyPreference: localPreferences.backgroundJobApprovalPolicyDefault !== undefined,
        hasLocalAssistantAutoApproveNonBlockingQuestionsPreference:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault !== undefined,
        hasLocalAssistantCongestionControlPreference:
          localPreferences.assistantCongestionControlEnabledDefault !== undefined ||
          localPreferences.assistantMaxCongestionDefault !== undefined,
        hasLocalAutoArchiveCompletedThreadsPreference: localPreferences.autoArchiveCompletedThreadsDefault !== undefined,
        hasLocalMemoryBankEnabledPreference: localPreferences.memoryBankEnabledDefault !== undefined,
        hasLocalMemoryBankRecordRunsPreference: localPreferences.memoryBankRecordRunsDefault !== undefined,
        hasLocalCheckCliUpdatesPreference: localPreferences.checkCliUpdatesDefault !== undefined
      });
      setState(reconcile(nextState));
      applyThemePreference(themePreference);
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
      const currentState = unwrap(state) as HarnessViewState;
      const previousSnapshot = getBrowserUiSessionSnapshot(currentState);
      let reducedState = reduceServerEvent(currentState, event);
      if (event.type === "project.context") {
        reducedState = applyTokenUsageEvent(reducedState, event, recordedTokenUsageEventKeys);
      }
      const nextState = finalizeHarnessViewState(reducedState);
      setState(reconcile(nextState));
      if (event.type === "preferences.providerConnectionTested") {
        if (typeof document !== "undefined") {
          document
            .querySelectorAll<HTMLElement>(`[data-provider-test-message="${event.payload.provider}"]`)
            .forEach((element) => element.replaceChildren(event.payload.message));
        }
      }
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
      recordedTokenUsageEventKeys.clear();
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
  const activeAssistantIds = new Set(incoming.assistants.map((assistant) => assistant.id));
  const keepActive = <T extends { assistantId: string }>(entries: T[]) =>
    entries.filter((entry) => activeAssistantIds.has(entry.assistantId));
  const nextThreads = incoming.threads.length > 0 ? incoming.threads : keepActive(existing.threads);
  const nextTodos = incoming.todos.length > 0 ? incoming.todos : keepActive(existing.todos);
  const nextLearnings = incoming.learnings.length > 0 ? incoming.learnings : keepActive(existing.learnings);
  const nextQuestions = incoming.questions.length > 0 ? incoming.questions : keepActive(existing.questions);
  const nextLogs = incoming.logs.length > 0 ? incoming.logs : keepActive(existing.logs);
  const nextAssetRefs = incoming.assetRefs.length > 0 ? incoming.assetRefs : keepActive(existing.assetRefs);
  const nextVisibleId =
    existing.selectedAssistantId && incoming.assistants.some((assistant) => assistant.id === existing.selectedAssistantId)
      ? existing.selectedAssistantId
      : incoming.assistants[0]?.id;
  return {
    ...existing,
    assistants: incoming.assistants,
    threads: nextThreads,
    todos: nextTodos,
    learnings: nextLearnings,
    questions: nextQuestions,
    logs: nextLogs,
    assetRefs: nextAssetRefs,
    selectedAssistantId: nextVisibleId,
    selectedTab: existing.selectedTab,
    selectedLogDetailsId:
      existing.selectedLogDetailsId && nextLogs.some((entry) => entry.id === existing.selectedLogDetailsId)
        ? existing.selectedLogDetailsId
        : undefined,
    scopeFilter: existing.scopeFilter,
    rosterSearch: existing.rosterSearch,
    detailSearch: existing.detailSearch,
    runStateFilter: existing.runStateFilter,
    bootstrapStateFilter: existing.bootstrapStateFilter,
    providerBrandFilter: existing.providerBrandFilter,
    projectIdFilter: existing.projectIdFilter,
    rosterSort: existing.rosterSort,
    streamingByAssistantId: existing.streamingByAssistantId
  };
}

function mergeAssistantDetail(existing: ViewAssistantsState, detail: AssistantDetail): ViewAssistantsState {
  const selectedAssistantId =
    existing.selectedAssistantId && existing.assistants.some((assistant) => assistant.id === existing.selectedAssistantId)
      ? existing.selectedAssistantId
      : detail.assistant.id;
  const nextLogs = replaceScopedItems(existing.logs, detail.assistant.id, detail.logs.items);
  return {
    ...existing,
    assistants: upsertById(existing.assistants, detail.assistant),
    threads: detail.thread ? upsertById(existing.threads, detail.thread) : existing.threads,
    todos: replaceScopedItems(existing.todos, detail.assistant.id, detail.todos.items),
    learnings: replaceScopedItems(existing.learnings, detail.assistant.id, detail.learnings.items),
    questions: replaceScopedItems(existing.questions, detail.assistant.id, detail.questions.items),
    logs: nextLogs,
    assetRefs: replaceScopedItems(existing.assetRefs, detail.assistant.id, detail.assetRefs),
    selectedAssistantId,
    selectedLogDetailsId:
      existing.selectedLogDetailsId && nextLogs.some((entry) => entry.id === existing.selectedLogDetailsId)
        ? existing.selectedLogDetailsId
        : undefined
  };
}

function mergeAssistantThreadMessages(
  existing: ViewAssistantsState,
  assistantId: string,
  threadId: string,
  messages: AssistantThread["messages"]
): ViewAssistantsState {
  const thread = existing.threads.find((entry) => entry.id === threadId && entry.assistantId === assistantId);
  if (!thread) {
    return existing;
  }
  return {
    ...existing,
    threads: existing.threads.map((entry) =>
      entry.id === threadId
        ? {
          ...entry,
          messages: mergeItemsById(messages, entry.messages).sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
          messageCount: Math.max(entry.messageCount, messages.length)
        }
        : entry
    )
  };
}

function upsertById<T extends { id: string }>(entries: T[], nextEntry: T) {
  return entries.some((entry) => entry.id === nextEntry.id)
    ? entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry))
    : [nextEntry, ...entries];
}

function mergeItemsById<T extends { id: string }>(incoming: T[], existing: T[]) {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const entry of [...incoming, ...existing]) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

function replaceScopedItems<T extends { assistantId: string }>(existing: T[], assistantId: string, incoming: T[]) {
  return [...incoming, ...existing.filter((entry) => entry.assistantId !== assistantId)];
}

function mergeScopedItems<T extends { id: string; assistantId: string }>(existing: T[], assistantId: string, incoming: T[]) {
  return mergeItemsById(incoming, existing.filter((entry) => entry.assistantId === assistantId)).concat(
    existing.filter((entry) => entry.assistantId !== assistantId)
  );
}

function upsertCliSession(sessions: CliSession[], session: CliSession) {
  const next = sessions.filter((entry) => entry.id !== session.id);
  if (session.status !== "exited" && session.status !== "failed" && session.status !== "stopped") {
    next.push(session);
  }
  return next;
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
    latestPlan: overrides.latestPlan,
    contextUsage: overrides.contextUsage,
    traces: capLiveTraceHistory(overrides.traces ?? []),
    activeRun: overrides.activeRun,
    lastRun: overrides.lastRun,
    runSummaries: overrides.runSummaries ?? [],
    lastError: overrides.lastError
  };
}

function getPersistedThreadLiveTranscriptState(project: Pick<WorkspaceProjectState, "session" | "activeRun" | "lastRun" | "runSummaries">) {
  return createThreadLiveTranscriptState({
    isStreaming: project.session.isStreaming,
    streamingAssistantText: getPersistedStreamingAssistantText(project),
    activeRun: project.activeRun,
    lastRun: project.lastRun,
    runSummaries: project.runSummaries,
    lastError: project.session.lastError
  });
}

function getActiveThreadLiveTranscriptState(project: ViewProjectState) {
  return createThreadLiveTranscriptState({
    isStreaming: project.session.isStreaming,
    streamingAssistantText: project.streamingAssistantText,
    streamingTailSegments: project.streamingTailSegments,
    streamingHeartbeatMessages: project.streamingHeartbeatMessages,
    latestPlan: project.latestPlan,
    contextUsage: project.contextUsage,
    traces: project.traces,
    activeRun: project.activeRun,
    lastRun: project.lastRun,
    runSummaries: project.runSummaries,
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
    latestPlan: liveTranscript.latestPlan,
    contextUsage: liveTranscript.contextUsage,
    traces: liveTranscript.traces,
    activeRun: liveTranscript.activeRun,
    lastRun: liveTranscript.lastRun,
    runSummaries: liveTranscript.runSummaries,
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
    latestPlan: activeThreadLiveTranscript.latestPlan,
    contextUsage: activeThreadLiveTranscript.contextUsage,
    traces: activeThreadLiveTranscript.traces,
    streamingAssistantText: activeThreadLiveTranscript.streamingAssistantText,
    streamingTailSegments: activeThreadLiveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: activeThreadLiveTranscript.streamingHeartbeatMessages,
    threadLiveTranscriptById: {
      ...rememberedThreadLiveTranscript,
      [incoming.activeThreadId]: activeThreadLiveTranscript
    },
    draft: readThreadDraft(incoming.id, incoming.activeThreadId),
    activeRun: activeThreadLiveTranscript.activeRun,
    lastRun: activeThreadLiveTranscript.lastRun,
    runSummaries: activeThreadLiveTranscript.runSummaries,
    lastError: activeThreadLiveTranscript.lastError,
    experimentInspection: activeThreadChanged ? undefined : existing.experimentInspection,
    memoryEntries: existing.memoryEntries,
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

function updateThreadSummaryFromAppendedEvent(
  threads: ViewProjectState["threads"],
  threadId: string,
  message: ViewProjectState["session"]["messages"][number],
  serverThread: ProjectThreadSummary | undefined
) {
  if (serverThread?.id === threadId) {
    return threads.map((thread) => (thread.id === threadId ? serverThread : thread));
  }

  return updateThreadSummaryFromMessage(threads, threadId, message);
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
    hasUsableAnthropicApiKey: preferences.hasUsableAnthropicApiKey,
    hasStoredAnthropicApiKey: preferences.hasStoredAnthropicApiKey,
    providerBrand,
    debugEnabled: state.hasLocalDebugPreference ? state.debugEnabled : preferences.debugEnabledDefault,
    tracePanelDefaultOpen,
    tracePanelMode:
      state.hasPersistedTracePanelOpen || state.hasLocalTracePreference
        ? state.tracePanelMode
        : tracePanelDefaultOpen
          ? "open"
          : "closed",
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
    singleAgentModelPreferenceDefault: state.hasLocalSingleAgentModelPreference
      ? state.singleAgentModelPreferenceDefault
      : preferences.singleAgentModelPreferenceDefault,
    subagentModelPreferenceDefault: state.hasLocalSubagentModelPreference
      ? state.subagentModelPreferenceDefault
      : preferences.subagentModelPreferenceDefault,
    correctnessIterationModeDefault: state.hasLocalCorrectnessIterationModePreference
      ? state.correctnessIterationModeDefault
      : preferences.correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault: state.hasLocalBackgroundJobApprovalPolicyPreference
      ? state.backgroundJobApprovalPolicyDefault
      : preferences.backgroundJobApprovalPolicyDefault,
    assistantAutoApproveNonBlockingQuestionsDefault: state.hasLocalAssistantAutoApproveNonBlockingQuestionsPreference
      ? state.assistantAutoApproveNonBlockingQuestionsDefault
      : (preferences.assistantAutoApproveNonBlockingQuestionsDefault ?? true),
    assistantCongestionControlEnabledDefault: state.hasLocalAssistantCongestionControlPreference
      ? state.assistantCongestionControlEnabledDefault
      : (preferences.assistantCongestionControlEnabledDefault ?? true),
    assistantMaxCongestionDefault: state.hasLocalAssistantCongestionControlPreference
      ? state.assistantMaxCongestionDefault
      : (preferences.assistantMaxCongestionDefault ?? 1),
    autoArchiveCompletedThreadsDefault: state.hasLocalAutoArchiveCompletedThreadsPreference
      ? state.autoArchiveCompletedThreadsDefault
      : (preferences.autoArchiveCompletedThreadsDefault ?? false),
    memoryBankEnabledDefault: state.hasLocalMemoryBankEnabledPreference
      ? state.memoryBankEnabledDefault
      : preferences.memoryBankEnabledDefault,
    memoryBankRecordRunsDefault: state.hasLocalMemoryBankRecordRunsPreference
      ? state.memoryBankRecordRunsDefault
      : preferences.memoryBankRecordRunsDefault,
    checkCliUpdatesDefault: state.hasLocalCheckCliUpdatesPreference
      ? state.checkCliUpdatesDefault
      : preferences.checkCliUpdatesDefault,
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
  const anthropicApiKey = window.localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY)?.trim() || undefined;
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
  const singleAgentModelPreferenceDefault = parseRunModelPreferenceStorageValue(
    window.localStorage.getItem(SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY)
  );
  const subagentModelPreferenceDefault = parseRunModelPreferenceStorageValue(
    window.localStorage.getItem(SUBAGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY)
  );
  const backgroundJobApprovalPolicyDefault = parseBackgroundJobApprovalPolicyStorageValue(
    window.localStorage.getItem(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY)
  );
  const assistantAutoApproveNonBlockingQuestionsDefault = parseBooleanStorageValue(
    window.localStorage.getItem(ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_STORAGE_KEY)
  );
  const assistantCongestionControlEnabledDefault = parseBooleanStorageValue(
    window.localStorage.getItem(ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_STORAGE_KEY)
  );
  const assistantMaxCongestionDefault = parseBoundedDecimalStorageValue(
    window.localStorage.getItem(ASSISTANT_MAX_CONGESTION_DEFAULT_STORAGE_KEY),
    0.25,
    3,
    0.25
  );
  const autoArchiveCompletedThreadsDefault = parseBooleanStorageValue(
    window.localStorage.getItem(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_STORAGE_KEY)
  );
  const memoryBankEnabledDefault = parseBooleanStorageValue(
    window.localStorage.getItem(MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY)
  );
  const memoryBankRecordRunsDefault = parseBooleanStorageValue(
    window.localStorage.getItem(MEMORY_BANK_RECORD_RUNS_DEFAULT_STORAGE_KEY)
  );
  const checkCliUpdatesDefault = parseBooleanStorageValue(
    window.localStorage.getItem(CHECK_CLI_UPDATES_DEFAULT_STORAGE_KEY)
  );
  const backgroundJobNotificationsEnabled = parseBooleanStorageValue(
    window.localStorage.getItem(BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY)
  );
  const selectedReasoningStrength = parseReasoningStrengthStorageValue(
    window.localStorage.getItem(COMPOSER_REASONING_STRENGTH_STORAGE_KEY)
  );
  const selectedFastMode = parseBooleanStorageValue(window.localStorage.getItem(COMPOSER_FAST_MODE_STORAGE_KEY));
  const appHotkeyPreferences = readAppHotkeyPreferences();
  const themePreference = parseThemePreferenceStorageValue(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  const preferencesActiveSectionId = parsePreferencesActiveSectionStorageValue(
    window.localStorage.getItem(PREFERENCES_ACTIVE_SECTION_STORAGE_KEY)
  );

  return {
    openAiApiKey,
    googleApiKey,
    anthropicApiKey,
    providerBrand,
    debugEnabled,
    tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault,
    planExecutionDelaySecondsDefault,
    singleAgentModelPreferenceDefault,
    subagentModelPreferenceDefault,
    correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault,
    assistantAutoApproveNonBlockingQuestionsDefault,
    assistantCongestionControlEnabledDefault,
    assistantMaxCongestionDefault,
    autoArchiveCompletedThreadsDefault,
    memoryBankEnabledDefault,
    memoryBankRecordRunsDefault,
    checkCliUpdatesDefault,
    backgroundJobNotificationsEnabled,
    selectedReasoningStrength,
    selectedFastMode,
    appHotkeyPreferences,
    themePreference,
    preferencesActiveSectionId
  };
}

export function readTokenUsageLifetime(): TokenUsageTotals {
  if (typeof window === "undefined") {
    return createEmptyTokenUsageTotals();
  }

  try {
    const raw = window.localStorage.getItem(TOKEN_USAGE_LIFETIME_STORAGE_KEY);
    if (!raw) {
      return createEmptyTokenUsageTotals();
    }
    return normalizeTokenUsageTotals(JSON.parse(raw));
  } catch {
    return createEmptyTokenUsageTotals();
  }
}

export function readAppHotkeyPreferences(): AppHotkeyPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_APP_HOTKEY_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(APP_HOTKEY_PREFERENCES_STORAGE_KEY);
    return normalizeAppHotkeyPreferences(raw ? JSON.parse(raw) : undefined);
  } catch {
    return { ...DEFAULT_APP_HOTKEY_PREFERENCES };
  }
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
  persistStorageValue(ANTHROPIC_API_KEY_STORAGE_KEY, input.anthropicApiKey);
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
  persistStorageValue(SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY, input.singleAgentModelPreferenceDefault);
  persistStorageValue(SUBAGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY, input.subagentModelPreferenceDefault);
  persistStorageValue(CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY, input.correctnessIterationModeDefault);
  persistStorageValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY, input.backgroundJobApprovalPolicyDefault);
  persistBooleanStorageValue(
    ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_STORAGE_KEY,
    input.assistantAutoApproveNonBlockingQuestionsDefault
  );
  persistBooleanStorageValue(
    ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_STORAGE_KEY,
    input.assistantCongestionControlEnabledDefault
  );
  persistDecimalStorageValue(ASSISTANT_MAX_CONGESTION_DEFAULT_STORAGE_KEY, input.assistantMaxCongestionDefault, 0.25, 3, 0.25);
  persistBooleanStorageValue(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_STORAGE_KEY, input.autoArchiveCompletedThreadsDefault);
  persistBooleanStorageValue(MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY, input.memoryBankEnabledDefault);
  persistBooleanStorageValue(MEMORY_BANK_RECORD_RUNS_DEFAULT_STORAGE_KEY, input.memoryBankRecordRunsDefault);
  persistBooleanStorageValue(CHECK_CLI_UPDATES_DEFAULT_STORAGE_KEY, input.checkCliUpdatesDefault);
  persistBooleanStorageValue(BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY, input.backgroundJobNotificationsEnabled);
  persistStorageValue(COMPOSER_REASONING_STRENGTH_STORAGE_KEY, input.selectedReasoningStrength);
  persistBooleanStorageValue(COMPOSER_FAST_MODE_STORAGE_KEY, input.selectedFastMode);
  persistAppHotkeyPreferences(input.appHotkeyPreferences);
  persistThemePreference(input.themePreference);
  persistStorageValue(PREFERENCES_ACTIVE_SECTION_STORAGE_KEY, input.preferencesActiveSectionId);
}

function persistAppHotkeyPreferences(input: AppHotkeyPreferences | undefined) {
  if (!input) {
    window.localStorage.removeItem(APP_HOTKEY_PREFERENCES_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(APP_HOTKEY_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeAppHotkeyPreferences(input)));
}

function persistThemePreference(input: ThemePreference | undefined) {
  if (!input) {
    window.localStorage.removeItem(THEME_PREFERENCE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, JSON.stringify(normalizeThemePreference(input)));
}

function persistTokenUsageLifetime(input: TokenUsageTotals) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_USAGE_LIFETIME_STORAGE_KEY, JSON.stringify(createEmptyTokenUsageTotals(input)));
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

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lastActiveThreadByProjectId =
      parsed.lastActiveThreadByProjectId && typeof parsed.lastActiveThreadByProjectId === "object"
        ? Object.fromEntries(
            Object.entries(parsed.lastActiveThreadByProjectId).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
            )
          )
        : undefined;

    const result: BrowserUiSessionState = {};
    if (typeof parsed.selectedModeId === "string") {
      result.selectedModeId = parsed.selectedModeId;
    }
    if (parsed.selectedAgentId === "pi" || parsed.selectedAgentId === "copilot-cli" || parsed.selectedAgentId === "codex-cli") {
      result.selectedAgentId = parsed.selectedAgentId;
    }
    if (typeof parsed.selectedExecutionModelId === "string") {
      result.selectedExecutionModelId = parsed.selectedExecutionModelId as ExecutionModelId;
    }
    if (isComposerReasoningStrength(parsed.selectedReasoningStrength)) {
      result.selectedReasoningStrength = parsed.selectedReasoningStrength;
    }
    if (typeof parsed.selectedFastMode === "boolean") {
      result.selectedFastMode = parsed.selectedFastMode;
    }
    if (isTracePanelMode(parsed.tracePanelMode)) {
      result.tracePanelMode = parsed.tracePanelMode;
    } else if (typeof parsed.tracePanelOpen === "boolean") {
      result.tracePanelMode = parsed.tracePanelOpen ? "open" : "closed";
    }
    if (typeof parsed.tracePanelOpen === "boolean") {
      result.tracePanelOpen = parsed.tracePanelOpen;
    }
    if (typeof parsed.activeLeftTab === "string") {
      result.activeLeftTab = normalizeLeftTab(parsed.activeLeftTab);
    }
    if (isRecord(parsed.mainPanelSizes)) {
      result.mainPanelSizes = normalizeMainPanelSizes(parsed.mainPanelSizes);
    }
    if (typeof parsed.chatPaneTab === "string") {
      result.chatPaneTab = normalizeChatPaneTab(parsed.chatPaneTab);
    }
    if (isRecord(parsed.assistantPane)) {
      result.assistantPane = {
        scopeFilter: normalizeAssistantScopeFilter(parsed.assistantPane.scopeFilter),
        rosterSearch: normalizeSearchText(parsed.assistantPane.rosterSearch),
        detailSearch: normalizeSearchText(parsed.assistantPane.detailSearch),
        runState: normalizeAssistantRunStateFilter(parsed.assistantPane.runState),
        bootstrapState: normalizeAssistantBootstrapStateFilter(parsed.assistantPane.bootstrapState),
        providerBrand: normalizeAssistantProviderBrandFilter(parsed.assistantPane.providerBrand),
        projectId: normalizeOptionalStorageString(parsed.assistantPane.projectId),
        rosterSort: normalizeAssistantRosterSort(parsed.assistantPane.rosterSort),
        selectedAssistantId: normalizeOptionalStorageString(parsed.assistantPane.selectedAssistantId),
        selectedTab: normalizeAssistantDetailTab(parsed.assistantPane.selectedTab),
        selectedLogDetailsId: normalizeOptionalStorageString(parsed.assistantPane.selectedLogDetailsId)
      };
    }
    if (isRecord(parsed.jobsPane)) {
      result.jobsPane = {
        ...normalizeJobsPanePreferences(parsed.jobsPane),
        runFilter: normalizeJobsRunFilter(parsed.jobsPane.runFilter)
      };
    }
    if (typeof parsed.lastActiveProjectId === "string") {
      result.lastActiveProjectId = parsed.lastActiveProjectId;
    }
    if (lastActiveThreadByProjectId) {
      result.lastActiveThreadByProjectId = lastActiveThreadByProjectId;
    }
    return result;
  } catch {
    return {};
  }
}

export function readProjectSidebarPreferences(): ProjectSidebarPreferences {
  if (typeof window === "undefined") {
    return createDefaultProjectSidebarPreferences();
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return createDefaultProjectSidebarPreferences();
    }

    return normalizeProjectSidebarPreferences(JSON.parse(raw), []);
  } catch {
    return createDefaultProjectSidebarPreferences();
  }
}

export function persistProjectSidebarPreferences(input: ProjectSidebarPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeProjectSidebarPreferences(input, [])));
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
    tracePanelMode: input.tracePanelMode ? normalizeTracePanelMode(input.tracePanelMode) : undefined,
    tracePanelOpen: input.tracePanelOpen,
    activeLeftTab: input.activeLeftTab ? normalizeLeftTab(input.activeLeftTab) : undefined,
    mainPanelSizes: input.mainPanelSizes ? normalizeMainPanelSizes(input.mainPanelSizes) : undefined,
    lastActiveProjectId: input.lastActiveProjectId?.trim() || undefined,
    lastActiveThreadByProjectId: input.lastActiveThreadByProjectId
      ? Object.fromEntries(
          Object.entries(input.lastActiveThreadByProjectId).filter(
            (entry): entry is [string, string] => Boolean(entry[0]?.trim()) && Boolean(entry[1]?.trim())
          )
        )
      : undefined,
    chatPaneTab: input.chatPaneTab ? normalizeChatPaneTab(input.chatPaneTab) : undefined,
    assistantPane: input.assistantPane
      ? {
          scopeFilter: input.assistantPane.scopeFilter
            ? normalizeAssistantScopeFilter(input.assistantPane.scopeFilter)
            : undefined,
          rosterSearch: normalizeSearchText(input.assistantPane.rosterSearch),
          detailSearch: normalizeSearchText(input.assistantPane.detailSearch),
          runState: normalizeAssistantRunStateFilter(input.assistantPane.runState),
          bootstrapState: normalizeAssistantBootstrapStateFilter(input.assistantPane.bootstrapState),
          providerBrand: normalizeAssistantProviderBrandFilter(input.assistantPane.providerBrand),
          projectId: normalizeOptionalStorageString(input.assistantPane.projectId),
          rosterSort: input.assistantPane.rosterSort ? normalizeAssistantRosterSort(input.assistantPane.rosterSort) : undefined,
          selectedAssistantId: normalizeOptionalStorageString(input.assistantPane.selectedAssistantId),
          selectedTab: input.assistantPane.selectedTab ? normalizeAssistantDetailTab(input.assistantPane.selectedTab) : undefined,
          selectedLogDetailsId: normalizeOptionalStorageString(input.assistantPane.selectedLogDetailsId)
        }
      : undefined,
    jobsPane: input.jobsPane
      ? {
          ...normalizeJobsPanePreferences(input.jobsPane),
          runFilter: input.jobsPane.runFilter ? normalizeJobsRunFilter(input.jobsPane.runFilter) : undefined
        }
      : undefined
  };

  if (
    !normalizedInput.selectedModeId &&
    !normalizedInput.selectedAgentId &&
    !normalizedInput.selectedExecutionModelId &&
    !normalizedInput.selectedReasoningStrength &&
    normalizedInput.selectedFastMode === undefined &&
    normalizedInput.tracePanelMode === undefined &&
    normalizedInput.tracePanelOpen === undefined &&
    normalizedInput.activeLeftTab === undefined &&
    normalizedInput.mainPanelSizes === undefined &&
    normalizedInput.chatPaneTab === undefined &&
    normalizedInput.assistantPane === undefined &&
    normalizedInput.jobsPane === undefined &&
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
    tracePanelMode: state.hasPersistedTracePanelOpen ? state.tracePanelMode : undefined,
    activeLeftTab: state.activeLeftTab,
    mainPanelSizes: state.mainPanelSizes,
    chatPaneTab: state.chatPaneTab,
    assistantPane: {
      scopeFilter: state.assistants.scopeFilter,
      rosterSearch: state.assistants.rosterSearch,
      detailSearch: state.assistants.detailSearch,
      runState: state.assistants.runStateFilter,
      bootstrapState: state.assistants.bootstrapStateFilter,
      providerBrand: state.assistants.providerBrandFilter,
      projectId: state.assistants.projectIdFilter,
      rosterSort: state.assistants.rosterSort,
      selectedAssistantId: state.assistants.selectedAssistantId,
      selectedTab: state.assistants.selectedTab,
      selectedLogDetailsId: state.assistants.selectedLogDetailsId
    },
    jobsPane: {
      ...state.jobsPanePreferences,
      runFilter: state.jobsRunFilter
    },
    lastActiveProjectId: state.lastActiveProjectId,
    lastActiveThreadByProjectId: state.lastActiveThreadByProjectId
  };
}

function activeSurfaceToLeftTab(activeSurface: HarnessActiveSurface): HarnessLeftTab {
  switch (activeSurface) {
    case "assistants":
      return "assistants";
    case "background-jobs":
      return "runs";
    case "preferences":
      return "preferences";
    case "ide":
      return "projects";
    case "chat":
      return "projects";
  }
}

function leftTabToActiveSurface(activeLeftTab: HarnessLeftTab): HarnessActiveSurface {
  switch (activeLeftTab) {
    case "assistants":
      return "assistants";
    case "runs":
    case "jobs":
      return "background-jobs";
    case "preferences":
      return "preferences";
    case "projects":
      return "chat";
  }
}

function normalizeLeftTab(input: unknown): HarnessLeftTab {
  return input === "assistants" || input === "jobs" || input === "runs" || input === "projects" || input === "preferences" ? input : "projects";
}

function normalizeChatPaneTab(input: unknown): ChatPaneTab {
  return input === "chat" || input === "plan" || input === "run" || input === "events" || input === "memory" ? input : "chat";
}

function isTracePanelMode(input: unknown): input is TracePanelMode {
  return input === "closed" || input === "peek" || input === "open";
}

function normalizeTracePanelMode(input: unknown): TracePanelMode {
  return isTracePanelMode(input) ? input : "closed";
}

function normalizeAssistantDetailTab(input: unknown): AssistantDetailTab {
  return input === "chat" ||
    input === "todos" ||
    input === "questions" ||
    input === "jobs" ||
    input === "log" ||
    input === "config" ||
    input === "learnings"
    ? input
    : "chat";
}

function normalizeAssistantScopeFilter(input: unknown): AssistantScopeFilter {
  return input === "all" || input === "global" || input === "project" ? input : "project";
}

function normalizeSearchText(input: unknown) {
  return typeof input === "string" ? input.slice(0, 512) : "";
}

function normalizeAssistantRunStateFilter(input: unknown): Assistant["runState"] | undefined {
  return input === "active" || input === "paused" ? input : undefined;
}

function normalizeAssistantBootstrapStateFilter(input: unknown): Assistant["bootstrapState"] | undefined {
  return input === "pending" || input === "running" || input === "completed" || input === "failed" ? input : undefined;
}

function normalizeAssistantProviderBrandFilter(input: unknown): Assistant["providerBrand"] | undefined {
  return input === "gpt" || input === "gemini" || input === "claude" ? input : undefined;
}

function normalizeAssistantRosterSort(input: unknown): AssistantRosterSort {
  return input === "updated" || input === "created" || input === "name" || input === "run-state" || input === "bootstrap-state"
    ? input
    : "updated";
}

function normalizeJobsPaneSegment(input: unknown): JobsPaneSegment {
  return input === "jobs" || input === "inbox" || input === "health" ? input : "inbox";
}

function normalizeJobsPaneJobSort(input: unknown): JobsPaneJobSort {
  return input === "next-run" || input === "updated" || input === "created" || input === "status" || input === "risk"
    ? input
    : "next-run";
}

function normalizeJobsPaneRunSort(input: unknown): JobsPaneRunSort {
  return input === "urgency" || input === "updated" || input === "queued" || input === "status" ? input : "urgency";
}

function normalizeJobsRunFilter(input: unknown): JobsRunFilter {
  return input === "all" || input === "approval" || input === "queued" || input === "running" || input === "failed" || input === "done"
    ? input
    : "all";
}

function normalizeJobsJobStateFilter(input: unknown): JobsJobStateFilter {
  return input === "all" ||
    input === "idle" ||
    input === "due" ||
    input === "queued" ||
    input === "blocked" ||
    input === "running" ||
    input === "stale" ||
    input === "backoff"
    ? input
    : "all";
}

function normalizeJobsPanePreferences(input: unknown, state?: HarnessViewState, clearMissingIds: boolean = false): JobsPanePreferences {
  const source = isRecord(input) ? input : {};
  const preferences: JobsPanePreferences = {
    segment: normalizeJobsPaneSegment(source.segment),
    search: typeof source.search === "string" ? source.search : "",
    jobSearch: normalizeSearchText(source.jobSearch ?? source.search),
    runSearch: normalizeSearchText(source.runSearch ?? source.search),
    jobSort: normalizeJobsPaneJobSort(source.jobSort),
    runSort: normalizeJobsPaneRunSort(source.runSort),
    projectId: normalizeOptionalStorageString(source.projectId),
    assistantId: normalizeOptionalStorageString(source.assistantId),
    kind: source.kind === "ai-routine" || source.kind === "shell" ? source.kind : undefined,
    status: source.status === "enabled" || source.status === "paused" || source.status === "disabled" ? source.status : undefined,
    jobState: normalizeJobsJobStateFilter(source.jobState),
    risk: source.risk === "safe" || source.risk === "slightly-unsafe" || source.risk === "unsafe" ? source.risk : undefined,
    selectedJobId: normalizeOptionalStorageString(source.selectedJobId),
    selectedRunId: normalizeOptionalStorageString(source.selectedRunId),
    selectedNotificationId: normalizeOptionalStorageString(source.selectedNotificationId)
  };

  if (!state) {
    return preferences;
  }

  const projectIds = new Set(state.workspace.projects.map((project) => project.id));
  const assistantIds = new Set(state.assistants.assistants.map((assistant) => assistant.id));
  const jobIds = new Set(state.backgroundJobs.jobs.map((job) => job.id));
  const runIds = new Set(state.backgroundJobs.runs.map((run) => run.id));
  const notificationIds = new Set(state.notifications.items.map((notification) => notification.id));

  return {
    ...preferences,
    projectId:
      preferences.projectId && (projectIds.has(preferences.projectId) || (!clearMissingIds && projectIds.size === 0))
        ? preferences.projectId
        : undefined,
    assistantId:
      preferences.assistantId && (assistantIds.has(preferences.assistantId) || (!clearMissingIds && assistantIds.size === 0))
        ? preferences.assistantId
        : undefined,
    selectedJobId:
      preferences.selectedJobId && (jobIds.has(preferences.selectedJobId) || (!clearMissingIds && jobIds.size === 0))
        ? preferences.selectedJobId
        : undefined,
    selectedRunId:
      preferences.selectedRunId && (runIds.has(preferences.selectedRunId) || (!clearMissingIds && runIds.size === 0))
        ? preferences.selectedRunId
        : undefined,
    selectedNotificationId:
      preferences.selectedNotificationId &&
      (notificationIds.has(preferences.selectedNotificationId) || (!clearMissingIds && notificationIds.size === 0))
        ? preferences.selectedNotificationId
        : undefined
  };
}

function normalizeOptionalStorageString(input: unknown) {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
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

function normalizeAssistantsViewState(state: HarnessViewState): ViewAssistantsState {
  const scopeFilter = normalizeAssistantScopeFilter(state.assistants.scopeFilter);
  const visibleAssistants = state.assistants.assistants.filter((assistant) =>
    scopeFilter === "all"
      ? true
      : scopeFilter === "global"
      ? assistant.scope === "global"
      : assistant.scope === "project" && assistant.projectId === state.workspace.activeProjectId
  );
  const selectedAssistantId = normalizeOptionalStorageString(state.assistants.selectedAssistantId);
  const selectedLogDetailsId = normalizeOptionalStorageString(state.assistants.selectedLogDetailsId);

  return {
    ...state.assistants,
    scopeFilter,
    selectedAssistantId:
      selectedAssistantId &&
      (visibleAssistants.some((assistant) => assistant.id === selectedAssistantId) || state.assistants.assistants.length === 0)
        ? selectedAssistantId
        : visibleAssistants[0]?.id,
    selectedTab: normalizeAssistantDetailTab(state.assistants.selectedTab),
    selectedLogDetailsId:
      selectedLogDetailsId && (state.assistants.logs.some((entry) => entry.id === selectedLogDetailsId) || state.assistants.logs.length === 0)
        ? selectedLogDetailsId
        : undefined
  };
}

function finalizeHarnessViewState(state: HarnessViewState): HarnessViewState {
  const activeProject = getActiveProject(state);
  const availableModes = resolveModeCatalog(state.workspace.workspaceModes, activeProject?.projectModes ?? []);
  const fallbackModeId =
    resolveModeById(activeProject?.selectedModeId ?? DEFAULT_MODE_ID, state.workspace.workspaceModes, activeProject?.projectModes ?? [])
      ?.id ?? DEFAULT_MODE_ID;
  const selectedModeId =
    state.hasGlobalSelectedModeId && (state.selectedModeId === "auto" || availableModes.some((mode) => mode.id === state.selectedModeId))
      ? state.selectedModeId
      : fallbackModeId;
  const selectedAgentId =
    state.hasGlobalSelectedAgentId && state.availableAgents.some((agent) => agent.id === state.selectedAgentId)
      ? state.selectedAgentId
      : resolveProjectSelectedAgentId(state, activeProject);
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
  const projectSidebarPreferences = normalizeProjectSidebarPreferences(
    state.projectSidebarPreferences,
    state.workspace.projects.map((project) => project.id)
  );
  const assistants = normalizeAssistantsViewState(state);
  const jobsPanePreferences = normalizeJobsPanePreferences(state.jobsPanePreferences, state);

  return {
    ...state,
    selectedModeId,
    selectedAgentId,
    selectedExecutionModelId,
    selectedReasoningStrength: composerControls.selectedReasoningStrength,
    selectedFastMode: state.selectedFastMode,
    chatPaneTab: normalizeChatPaneTab(state.chatPaneTab),
    assistants,
    jobsPanePreferences,
    jobsRunFilter: normalizeJobsRunFilter(state.jobsRunFilter),
    projectSidebarPreferences,
    lastActiveProjectId: nextLastActiveProjectId,
    lastActiveThreadByProjectId,
    tracePanelMode: state.hasPersistedTracePanelOpen ? state.tracePanelMode : state.tracePanelDefaultOpen ? "open" : "closed",
    tracePanelOpen:
      state.hasPersistedTracePanelOpen ? state.tracePanelMode !== "closed" : state.tracePanelDefaultOpen
  };
}

function capLiveTraceHistory(traces: AgentTrace[]) {
  return traces.length > MAX_LIVE_TRACE_HISTORY ? traces.slice(-MAX_LIVE_TRACE_HISTORY) : traces;
}

function resolveProjectSelectedAgentId(
  state: HarnessViewState,
  activeProject: Pick<ViewProjectState, "session"> | undefined
): AgentId {
  const projectAgentId = activeProject?.session.selectedAgentId;
  if (projectAgentId && projectAgentId !== "pi") {
    return projectAgentId;
  }

  const agentAvailable = state.setup.checks.find((check) => check.id === "agent-available");
  if (agentAvailable?.status === "ready" && !resolveUsablePiProviderBrand(state)) {
    const usableRuntime = state.agentRuntimes.find(
      (runtime) =>
        runtime.runtimeKind === "cli" &&
        runtime.installed &&
        runtime.authenticated &&
        runtime.supportsProgrammatic &&
        state.availableAgents.some((agent) => agent.id === runtime.agentId)
    );
    if (usableRuntime) {
      return usableRuntime.agentId;
    }
  }

  return projectAgentId ?? "pi";
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

function normalizeTokenUsageTotals(input: unknown): TokenUsageTotals {
  const source = isRecord(input) ? input : {};
  const inputTokens = normalizeTokenCount(source.inputTokens);
  const outputTokens = normalizeTokenCount(source.outputTokens);
  const cachedInputTokens = normalizeTokenCount(source.cachedInputTokens);
  const totalProcessedTokens = normalizeTokenCount(source.totalProcessedTokens ?? inputTokens + outputTokens);
  return createEmptyTokenUsageTotals({
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalProcessedTokens,
    totalTokensIncludingCached: normalizeTokenCount(source.totalTokensIncludingCached ?? totalProcessedTokens + cachedInputTokens),
    events: normalizeTokenCount(source.events),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined
  });
}

function normalizeTokenCount(input: unknown) {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 0;
  }
  return Math.max(0, Math.round(input));
}

function parseThemePreferenceStorageValue(value: string | null): ThemePreference | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeThemePreference(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function parseProviderBrandStorageValue(value: string | null): ProviderBrand | undefined {
  return value === "gpt" || value === "gemini" || value === "claude" ? value : undefined;
}

function parseReasoningStrengthStorageValue(value: string | null): ComposerReasoningStrength | undefined {
  return isComposerReasoningStrength(value) ? value : undefined;
}

function isProjectSidebarProjectSort(value: unknown): value is ProjectSidebarProjectSort {
  return value === "last-user-message" || value === "created-at" || value === "manual";
}

function isProjectSidebarThreadSort(value: unknown): value is ProjectSidebarThreadSort {
  return value === "last-user-message" || value === "created-at";
}

function isProjectSidebarGrouping(value: unknown): value is ProjectSidebarGrouping {
  return value === "repository" || value === "repository-path" || value === "separate";
}

function normalizeProjectSidebarPreferences(input: unknown, projectIds: string[]): ProjectSidebarPreferences {
  const defaults = createDefaultProjectSidebarPreferences();
  const parsed =
    input && typeof input === "object" ? (input as Partial<ProjectSidebarPreferences>) : defaults;
  const seenProjectIds = new Set<string>();
  const manualProjectOrder = Array.isArray(parsed.manualProjectOrder)
    ? parsed.manualProjectOrder.filter((projectId): projectId is string => {
        if (typeof projectId !== "string" || !projectId.trim() || seenProjectIds.has(projectId)) {
          return false;
        }
        seenProjectIds.add(projectId);
        return projectIds.length === 0 || projectIds.includes(projectId);
      })
    : [];

  for (const projectId of projectIds) {
    if (!seenProjectIds.has(projectId)) {
      manualProjectOrder.push(projectId);
    }
  }
  const seenCollapsedProjectIds = new Set<string>();
  const collapsedProjectIds = Array.isArray(parsed.collapsedProjectIds)
    ? parsed.collapsedProjectIds.filter((projectId): projectId is string => {
        if (typeof projectId !== "string" || !projectId.trim() || seenCollapsedProjectIds.has(projectId)) {
          return false;
        }
        seenCollapsedProjectIds.add(projectId);
        return projectIds.length === 0 || projectIds.includes(projectId);
      })
    : [];

  return {
    projectSort: isProjectSidebarProjectSort(parsed.projectSort) ? parsed.projectSort : defaults.projectSort,
    threadSort: isProjectSidebarThreadSort(parsed.threadSort) ? parsed.threadSort : defaults.threadSort,
    grouping: isProjectSidebarGrouping(parsed.grouping) ? parsed.grouping : defaults.grouping,
    manualProjectOrder,
    collapsedProjectIds
  };
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

function parseRunModelPreferenceStorageValue(value: string | null) {
  return value === "inference" || value === "intelligence" ? value : undefined;
}

function parseBackgroundJobApprovalPolicyStorageValue(value: string | null) {
  return value === "allow-all" || value === "allow-safe" || value === "ask-risky" || value === "always-ask"
    ? value
    : undefined;
}

function parsePreferencesActiveSectionStorageValue(value: string | null): PreferencesActiveSectionId | undefined {
  return value === "general-ui" ||
    value === "keybinds" ||
    value === "ide-settings" ||
    value === "ai-providers" ||
    value === "safety-guardrails" ||
    value === "workspace-memory" ||
    value === "usage" ||
    value === "background-jobs" ||
    value === "developer-advanced"
    ? value
    : undefined;
}

function normalizeMainPanelSizes(input: unknown): MainPanelSizes {
  const defaults = createDefaultMainPanelSizes();
  if (!input || typeof input !== "object") {
    return defaults;
  }

  const parsed = input as Partial<Record<keyof MainPanelSizes, unknown>>;
  return {
    left: clampPanelSize(parsed.left, defaults.left),
    center: clampPanelSize(parsed.center, defaults.center),
    right: clampPanelSize(parsed.right, defaults.right)
  };
}

function clampPanelSize(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0.75, Math.min(5, value)) : fallback;
}

function parseBoundedIntegerStorageValue(value: string | null, min: number, max: number) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : undefined;
}

function parseBoundedDecimalStorageValue(value: string | null, min: number, max: number, step: number) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed / step) * step)) : undefined;
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

function persistDecimalStorageValue(key: string, value: number | undefined, min: number, max: number, step: number) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  const normalized = Math.max(min, Math.min(max, Math.round(value / step) * step));
  window.localStorage.setItem(key, normalized.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
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

  if (isProviderBrandSelectable(state, preferences, "claude")) {
    return "claude";
  }

  return preferredBrand;
}

function isProviderBrandSelectable(
  _state: Pick<
    HarnessViewState,
    | "openAiApiKeyDraft"
    | "googleApiKeyDraft"
    | "anthropicApiKeyDraft"
    | "hasLocalOpenAiApiKey"
    | "hasLocalGoogleApiKey"
    | "hasLocalAnthropicApiKey"
  >,
  _preferences: Pick<
    PreferencesState,
    | "hasUsableOpenAiApiKey"
    | "hasStoredOpenAiApiKey"
    | "hasUsableGoogleApiKey"
    | "hasStoredGoogleApiKey"
    | "hasUsableAnthropicApiKey"
    | "hasStoredAnthropicApiKey"
  >,
  _providerBrand: ProviderBrand
) {
  return true;
}

export function hasUsableApiKeyForProvider(state: HarnessViewState, providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return state.hasUsableGoogleApiKey;
  }
  if (providerBrand === "claude") {
    return state.hasUsableAnthropicApiKey;
  }
  return state.hasUsableOpenAiApiKey;
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

  if (hasUsableApiKeyForProvider(state, "claude")) {
    return "claude";
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

export function canSelectProviderBrand(_state: HarnessViewState, _providerBrand: ProviderBrand) {
  return true;
}

export function getDefaultExecutionModelIdForProvider(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "google/gemini-2.5-flash";
  }
  if (providerBrand === "claude") {
    return "anthropic/claude-sonnet-4-6";
  }
  return "openai/gpt-5.4";
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
    state.selectedModeId !== "auto" &&
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

  if (providerBrand === "gemini") {
    return modelId.startsWith("google/");
  }
  if (providerBrand === "claude") {
    return modelId.startsWith("anthropic/");
  }
  return modelId.startsWith("openai/");
}
