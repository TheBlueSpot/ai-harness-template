import {
  type BrowserActivity,
  type BrowserSession,
  createChatMessage,
  createEmptySession,
  createProjectId,
  createProjectThreadSummary,
  createWorkspaceProjectState,
  type AgentPlan,
  type AgentRunState,
  type AgentTrace,
  type ExecutionPlan,
  type PreferencesState,
  type SubagentTaskState
} from "../../../../shared/protocol";
import { defaultProviderCapabilities } from "../../../../shared/capabilities";
import { createInitialViewState, type HarnessViewState, type ViewProjectState } from "../../harness-store";

export const defaultPreferencesFixture: PreferencesState = {
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
  correctnessIterationModeDefault: "ask-before-iterate",
  backgroundJobApprovalPolicyDefault: "ask-risky",
  memoryBankEnabledDefault: true,
  memoryBankRecordRunsDefault: true,
  checkCliUpdatesDefault: true,
  attachmentsEnabled: true,
  capabilities: [...defaultProviderCapabilities],
  agentRuntimes: []
};

export function createExecutionPlanFixture(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    runId: overrides.runId ?? "run-1",
    origin: overrides.origin ?? "initial",
    iteration: overrides.iteration ?? 1,
    summary: overrides.summary ?? "Plan summary",
    finalExecutionBrief: overrides.finalExecutionBrief ?? "Do thing",
    difficultyScore: overrides.difficultyScore ?? 72,
    planningModelId: overrides.planningModelId ?? "openai/gpt-5.4",
    executionModelId: overrides.executionModelId ?? "openai/gpt-5.4",
    route: overrides.route ?? "pi-subagents",
    subagentWorktreeStrategy: overrides.subagentWorktreeStrategy ?? "same-worktree",
    targetSubagentCount: overrides.targetSubagentCount ?? 2,
    actualSubagentCount: overrides.actualSubagentCount ?? 2,
    gating: overrides.gating ?? {
      mode: "countdown",
      delaySeconds: 10
    },
    prerequisites: overrides.prerequisites ?? [
      {
        id: "prereq-1",
        title: "Prep",
        instruction: "Prepare files",
        reason: "Need setup",
        requiredForTaskIds: ["task-1"],
        owner: "main",
        status: "pending"
      }
    ],
    contracts: overrides.contracts ?? [
      {
        taskId: "task-1",
        title: "Inspect",
        instruction: "Inspect files",
        effortPoints: 2,
        ownedPaths: ["src"],
        dependsOnPrerequisiteIds: ["prereq-1"],
        deliverables: ["inspection"],
        integrationPoints: ["chat"],
        verificationScope: "owned-files-only",
        verificationCommands: ["bun test"],
        mergeNotes: "Merge cleanly"
      }
    ],
    correctnessPolicy: overrides.correctnessPolicy ?? "ask-before-iterate"
  };
}

export function createAgentPlanFixture(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    agentId: "pi",
    planningModelId: overrides.planningModelId ?? "openai/gpt-5.4",
    difficultyScore: overrides.difficultyScore ?? 72,
    usesSubagents: overrides.usesSubagents ?? true,
    executionModelId: overrides.executionModelId ?? "openai/gpt-5.4",
    subtaskCount: overrides.subtaskCount ?? 2,
    executionPlan: overrides.executionPlan ?? createExecutionPlanFixture()
  };
}

export function createSubtaskFixture(overrides: Partial<SubagentTaskState> = {}): SubagentTaskState {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Inspect files",
    instruction: overrides.instruction ?? "Inspect files",
    status: overrides.status ?? "pending",
    attemptCount: overrides.attemptCount ?? 0,
    output: overrides.output,
    errorMessage: overrides.errorMessage,
    commitSha: overrides.commitSha,
    worktreePath: overrides.worktreePath,
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  };
}

export function createRunFixture(overrides: Partial<AgentRunState> = {}): AgentRunState {
  return {
    id: overrides.id ?? "run-1",
    threadId: overrides.threadId ?? "thread-1",
    status: overrides.status ?? "ready",
    latestUserPrompt: overrides.latestUserPrompt ?? "Do work",
    planningModelId: overrides.planningModelId ?? "openai/gpt-5.4",
    executionModelId: overrides.executionModelId ?? "openai/gpt-5.4",
    difficultyScore: overrides.difficultyScore ?? 72,
    summary: overrides.summary ?? "Plan summary",
    finalExecutionBrief: overrides.finalExecutionBrief ?? "Do work",
    failureMessage: overrides.failureMessage,
    plan: overrides.plan ?? createExecutionPlanFixture({ runId: overrides.id ?? "run-1" }),
    correctnessReview: overrides.correctnessReview,
    questions: overrides.questions ?? [],
    subtasks: overrides.subtasks ?? [],
    browserSessions: overrides.browserSessions,
    toolActivities: overrides.toolActivities,
    experiment: overrides.experiment,
    ledger: overrides.ledger,
    proofBundle: overrides.proofBundle,
    resumable: overrides.resumable ?? false,
    retryable: overrides.retryable ?? true,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt
  };
}

export function createBrowserActivityFixture(overrides: Partial<BrowserActivity> = {}): BrowserActivity {
  return {
    id: overrides.id ?? "browser-activity-1",
    toolCallId: overrides.toolCallId ?? "tool-call-1",
    toolName: overrides.toolName ?? "playwright-browser",
    kind: overrides.kind ?? "navigate",
    label: overrides.label ?? "Open https://example.com",
    inputSummary: overrides.inputSummary ?? "{\"url\":\"https://example.com\"}",
    outputSummary: overrides.outputSummary,
    status: overrides.status ?? "completed",
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt,
    errorMessage: overrides.errorMessage,
    approval: overrides.approval,
    replay: overrides.replay ?? [],
    verification: overrides.verification ?? []
  };
}

export function createBrowserSessionFixture(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    id: overrides.id ?? "browser-session-1",
    runId: overrides.runId ?? "run-1",
    owner: overrides.owner ?? "main",
    subagentId: overrides.subagentId,
    status: overrides.status ?? "completed",
    approvalMode: "per-tool",
    lastActivityLabel: overrides.lastActivityLabel ?? "Open https://example.com",
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt,
    pendingApproval: overrides.pendingApproval,
    activities: overrides.activities ?? [createBrowserActivityFixture()]
  };
}

export function createTraceFixture(overrides: Partial<AgentTrace> = {}): AgentTrace {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    stage: overrides.stage ?? "subagent-start",
    message: overrides.message ?? "Starting task",
    detail: overrides.detail,
    subagentId: overrides.subagentId,
    modelId: overrides.modelId,
    durationMs: overrides.durationMs,
    createdAt: overrides.createdAt ?? new Date().toISOString()
  };
}

export function createViewProjectFixture(overrides: Partial<ViewProjectState> = {}): ViewProjectState {
  const projectId = overrides.id ?? createProjectId();
  const activeThreadId = overrides.activeThreadId ?? "thread-1";
  const baseProject = createWorkspaceProjectState({
    id: projectId,
    name: overrides.name ?? "repo-one",
    rootPath: overrides.rootPath ?? "C:\\repo-one",
    activeThreadId,
    threads:
      overrides.threads ??
      [
        createProjectThreadSummary({
          id: activeThreadId,
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
    session:
      overrides.session ??
      {
        ...createEmptySession(activeThreadId),
        messages: []
      }
  });

  return {
    ...baseProject,
    latestPlan: overrides.latestPlan,
    contextUsage: overrides.contextUsage,
    traces: overrides.traces ?? [],
    streamingAssistantText: overrides.streamingAssistantText ?? "",
    streamingTailSegments: overrides.streamingTailSegments ?? [],
    streamingHeartbeatMessages: overrides.streamingHeartbeatMessages ?? [],
    threadLiveTranscriptById:
      overrides.threadLiveTranscriptById ?? {
        [activeThreadId]: {
          isStreaming: overrides.session?.isStreaming ?? false,
          streamingAssistantText: overrides.streamingAssistantText ?? "",
          streamingTailSegments: overrides.streamingTailSegments ?? [],
          streamingHeartbeatMessages: overrides.streamingHeartbeatMessages ?? [],
          latestPlan: overrides.latestPlan,
          contextUsage: overrides.contextUsage,
          traces: overrides.traces ?? [],
          activeRun: overrides.activeRun ?? baseProject.activeRun,
          lastRun: overrides.lastRun ?? baseProject.lastRun,
          runSummaries: overrides.runSummaries ?? baseProject.runSummaries,
          lastError: overrides.lastError
        }
      },
    draft: overrides.draft ?? "",
    lastError: overrides.lastError,
    experimentInspection: overrides.experimentInspection,
    memoryEntries: overrides.memoryEntries ?? [],
    activeRun: overrides.activeRun ?? baseProject.activeRun,
    lastRun: overrides.lastRun ?? baseProject.lastRun,
    runSummaries: overrides.runSummaries ?? baseProject.runSummaries
  };
}

export function createHarnessStateFixture(overrides: Partial<HarnessViewState> = {}): HarnessViewState {
  const baseState = createInitialViewState();
  return {
    ...baseState,
    ...overrides,
    workspace: {
      ...baseState.workspace,
      ...overrides.workspace
    },
    pendingExecutionModelIds: {
      ...baseState.pendingExecutionModelIds,
      ...overrides.pendingExecutionModelIds
    },
    projectPreflights: {
      ...baseState.projectPreflights,
      ...overrides.projectPreflights
    }
  };
}

export function createPlanSummaryMessage(runId: string, plan: ExecutionPlan) {
  return createChatMessage("assistant", plan.summary, {
    kind: "plan-summary",
    metadata: {
      type: "plan-summary",
      runId,
      plan
    }
  });
}
