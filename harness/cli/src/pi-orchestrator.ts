import {
  createChatMessage,
  type AgentId,
  type AgentPlan,
  type AgentTrace,
  type ChatMessage,
  type ChatSessionState,
  type ComposerReasoningStrength,
  type CorrectnessIterationMode,
  type ExecutionPlan,
  type MemorySummary,
  type ModeDefinition,
  type PlanExecutionMode,
  type PlanPrerequisite,
  type ProjectContextUsage,
  type PlannerReadyTurn,
  type PlannerSubtask,
  type PlanningQuestion,
  type ProviderBrand,
  type ProviderModelId,
  type RunModelPreference,
  type SubagentContract,
  type SubagentWorktreeStrategy,
  type WorkspaceRuleSource
} from "../../shared/protocol";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ManagedExecutionState, ManagedRefreshAction } from "./execution-runtime";
import { debugLog } from "./logging";
import { runManagedAgentExecution } from "./managed-agent-execution";
import type { PiAgentAdapter, PiAgentExecutionEvent } from "./pi-agent-adapter";
import { modeUsesReadOnlyExecution } from "../../shared/modes";
import {
  discardBranchfsIntegrationLease,
  discardBranchfsSnapshots,
  flushBranchfsIntegrationLease,
  prepareBranchfsIntegrationLease,
  verifyBranchfsIntegrationLease
} from "./branchfs-subagent-integration";
import {
  getDefaultPlanningModelId,
  planTask
} from "./pi-planner";
import { buildWorkspacePathGuidance, normalizeWorkspaceRelativePaths } from "./workspace-path-intent";
import {
  executeSubagents,
  MAX_SUBAGENT_CONCURRENCY,
  scheduleSubagentTasks,
  type SubagentResult
} from "./pi-subagents";
import { buildPromptAttachmentContext } from "./chat-attachment-prompt";
import { resolveSingleAgentModelId, resolveSubagentModelId, resolveSubagentReasoningStrength } from "./subagent-defaults";
import { createMilestoneDeltaParser, extractMilestoneLines, stripMilestoneLines } from "./run-milestone-windows";
import { assembleDeterministicPrompt } from "./deterministic-prompt";
import type { PromptCacheIdentity } from "./prompt-cache";
import type { GeminiCachedAttachmentContext } from "./gemini-cached-contents";
import {
  buildSubagentEnvironmentBrief,
  discoverRepoSkillPaths,
  resolveRepoRoot,
  SUBAGENT_MILESTONE_INSTRUCTION
} from "./subagent-environment";

export type PiOrchestratorCallbacks = {
  onPlan?: (plan: AgentPlan) => void;
  onTrace?: (trace: AgentTrace) => void;
  onDelta?: (delta: string) => void;
  onContextUsage?: (contextUsage: ProjectContextUsage) => void;
  onSubagentStart?: (task: PlannerSubtask, attempt: number) => void;
  onSubagentRetry?: (task: PlannerSubtask, attempt: number, error: Error) => void;
  onSubagentResult?: (result: SubagentResult) => void;
  onRunMilestone?: (line: string) => void;
  closeRunMilestones?: () => void;
  onAggregationStart?: () => void;
  setExecutionState?: (state: ManagedExecutionState) => void;
  getExecutionState?: (input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) => ManagedExecutionState | undefined;
  clearExecutionState?: (input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) => void;
  onExecutionEvent?: (input: {
    owner: "main" | "subagent" | "aggregator";
    subagentId?: string;
    event: PiAgentExecutionEvent;
  }) => void | Promise<void>;
  requestBrowserApproval?: (input: {
    owner: "main" | "subagent" | "aggregator";
    subagentId?: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
  }) => Promise<{ approved: boolean }>;
};

export type PlannerTurnOutcome = {
  planningModelId: ProviderModelId;
  plannerResult: Awaited<ReturnType<typeof planTask>>["plannerResult"];
  promptStats: Awaited<ReturnType<typeof planTask>>["promptStats"];
  contextUsage?: ProjectContextUsage;
  plan?: AgentPlan;
  executionPlan?: ExecutionPlan;
};

export type ExecutionOutcome = {
  assistantMessage: ReturnType<typeof createChatMessage>;
  subagentResults: SubagentResult[];
  partial: boolean;
  partialReason?: string;
};

export function resolveExecutionPlanGateMode(
  mode: Pick<ModeDefinition, "id"> | undefined,
  requestedGateMode: PlanExecutionMode,
  actualSubagentCount: number
): PlanExecutionMode {
  if (mode?.id === "implement" && actualSubagentCount > 1) {
    return "approve";
  }

  return requestedGateMode;
}

export async function runPlannerTurn(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    sessionId: string;
    messages: ChatMessage[];
    latestUserPrompt: string;
    runId: string;
    agentId?: AgentId;
    providerBrand: ProviderBrand;
    planningModelId?: ProviderModelId;
    executionModelId?: ProviderModelId;
    subagentWorktreeStrategy: SubagentWorktreeStrategy;
    planExecutionMode: PlanExecutionMode;
    planExecutionDelaySeconds: number;
    correctnessIterationMode: CorrectnessIterationMode;
    mode?: ModeDefinition;
    ruleSources?: WorkspaceRuleSource[];
    memorySummaries?: MemorySummary[];
    iteration?: number;
    origin?: ExecutionPlan["origin"];
    priorQuestions?: PlanningQuestion[];
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
  }
): Promise<PlannerTurnOutcome> {
  const planningStartedAt = Date.now();
  const planningModelId = options.planningModelId ?? getDefaultPlanningModelId(options.providerBrand);
  const agentLabel = getAgentRuntimeLabel(options.agentId);
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "planning",
    message: `Planning task with ${agentLabel}`,
    modelId: planningModelId
  });

  const plannerTurn = await planTask(adapter, {
    cwd: options.cwd,
    messages: options.messages,
    latestUserPrompt: options.latestUserPrompt,
    providerBrand: options.providerBrand,
    planningModelId,
    executionModelId: options.executionModelId,
    mode: options.mode,
    ruleSources: options.ruleSources,
    memorySummaries: options.memorySummaries,
    priorQuestions: options.priorQuestions,
    abortSignal: options.abortSignal,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode
  });
  if (plannerTurn.contextUsage) {
    options.callbacks?.onContextUsage?.(plannerTurn.contextUsage);
  }
  const plannerResult = plannerTurn.plannerResult;

  if (plannerResult.type === "question") {
    emitTrace(options.callbacks, {
      sessionId: options.sessionId,
      stage: "planning-question",
      message: plannerResult.questions.map((question) => question.prompt).join("\n\n"),
      detail: plannerResult.summary,
      modelId: planningModelId,
      durationMs: Date.now() - planningStartedAt
    });

    return {
      planningModelId,
      plannerResult,
      promptStats: plannerTurn.promptStats,
      contextUsage: plannerTurn.contextUsage
    };
  }

  const executionPlan = buildExecutionPlan({
    runId: options.runId,
    planningModelId,
    plannerResult,
    subagentWorktreeStrategy: options.subagentWorktreeStrategy,
    planExecutionMode: options.planExecutionMode,
    planExecutionDelaySeconds: options.planExecutionDelaySeconds,
    correctnessIterationMode: options.correctnessIterationMode,
    mode: options.mode,
    ruleSources: options.ruleSources,
    memorySummaries: options.memorySummaries,
    iteration: options.iteration ?? 1,
    origin: options.origin ?? "initial"
  });
  if (options.subagentWorktreeStrategy === "same-worktree" && executionPlan.subagentWorktreeStrategy === "separate-worktrees") {
    emitTrace(options.callbacks, {
      sessionId: options.sessionId,
      stage: "worktree-provision",
      message: "Upgraded subagent isolation",
      detail: "same-worktree -> separate-worktrees due to overlapping owned paths",
      modelId: executionPlan.executionModelId
    });
  }
  const executionTasks = executionPlanToTasks(executionPlan);
  const readyPlannerResult: PlannerReadyTurn = {
    ...plannerResult,
    usesSubagents: executionTasks.length > 0,
    subtasks: executionTasks
  };

  const plan: AgentPlan = {
    sessionId: options.sessionId,
    agentId: options.agentId ?? "pi",
    planningModelId,
    difficultyScore: Math.round(executionPlan.difficultyScore),
    usesSubagents: executionTasks.length > 0,
    executionModelId: executionPlan.executionModelId,
    subtaskCount: executionTasks.length,
    executionPlan
  };

  options.callbacks?.onPlan?.(plan);
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "routing",
    message: readyPlannerResult.usesSubagents
      ? `Routing task to ${agentLabel} subagents`
      : `Routing task to main ${agentLabel} executor`,
    detail: executionPlan.summary,
    modelId: executionPlan.executionModelId,
    durationMs: Date.now() - planningStartedAt
  });

  return {
    planningModelId,
    plannerResult: readyPlannerResult,
    promptStats: plannerTurn.promptStats,
    contextUsage: plannerTurn.contextUsage,
    plan,
    executionPlan
  };
}

export async function executeReadyRun(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    agentId?: AgentId;
    providerBrand: ProviderBrand;
    readyPlan: PlannerReadyTurn;
    debugEnabled: boolean;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
    existingSubagentResults?: SubagentResult[];
    tasksToRun?: PlannerSubtask[];
    resumeNote?: string;
    executionPlan?: ExecutionPlan;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    singleAgentModelPreference?: RunModelPreference;
    subagentModelPreference?: RunModelPreference;
  }
): Promise<ExecutionOutcome> {
  if (!options.readyPlan.usesSubagents) {
    const singleAgentModelId = resolveSingleAgentModelId({
      agentId: options.agentId,
      providerBrand: options.providerBrand,
      executionModelId: options.readyPlan.executionModelId,
      modelPreference: options.singleAgentModelPreference
    });
    return {
      assistantMessage: await executeMainAgent(
        adapter,
        {
          cwd: options.cwd,
          runId: options.runId,
          sessionId: options.sessionId,
          messages: options.messages,
          agentId: options.agentId,
          executionPlan: options.executionPlan,
          reasoningStrength: options.reasoningStrength,
          fastMode: options.fastMode,
          promptCacheIdentity: options.promptCacheIdentity,
          geminiCachedAttachmentContext: options.geminiCachedAttachmentContext,
          abortSignal: options.abortSignal,
          callbacks: options.callbacks
        },
        singleAgentModelId,
        options.readyPlan.finalExecutionBrief
      ),
      subagentResults: [],
      partial: false
    };
  }

  if (options.executionPlan?.subagentWorktreeStrategy === "same-worktree") {
    const freshResults = await executeSameWorktreeSubagents(adapter, options);
    const mergedResults = mergeSubagentResults(
      options.readyPlan.subtasks,
      options.existingSubagentResults ?? [],
      freshResults
    );
    const assistantMessage = await aggregateSubagentResults(
      adapter,
      {
        cwd: options.cwd,
        runId: options.runId,
        sessionId: options.sessionId,
        messages: options.messages,
        executionPlan: options.executionPlan,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        promptCacheIdentity: options.promptCacheIdentity,
        geminiCachedAttachmentContext: options.geminiCachedAttachmentContext,
        abortSignal: options.abortSignal,
        callbacks: options.callbacks
      },
      options.readyPlan.executionModelId,
      options.readyPlan.finalExecutionBrief,
      options.readyPlan.subtasks,
      mergedResults,
      options.resumeNote
    );

    return {
      assistantMessage,
      subagentResults: mergedResults,
      partial: mergedResults.some((result) => result.status === "failed")
    };
  }

  const subagentModelId = resolveSubagentModelId({
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.readyPlan.executionModelId,
    modelPreference: options.subagentModelPreference
  });
  const contracts = options.executionPlan?.contracts ?? options.readyPlan.contracts ?? [];
  const { results: freshResults, retainedSnapshots } = await executeSubagents(adapter, {
    cwd: options.cwd,
    runId: options.runId,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    brief: options.readyPlan.finalExecutionBrief,
    tasks: options.tasksToRun ?? options.readyPlan.subtasks,
    debugEnabled: options.debugEnabled,
    executionModelId: options.readyPlan.executionModelId,
    reasoningStrength: resolveSubagentReasoningStrength(options.reasoningStrength, options.subagentModelPreference),
    fastMode: options.fastMode,
    promptCacheIdentity: options.promptCacheIdentity,
    modelPreference: options.subagentModelPreference,
    abortSignal: options.abortSignal,
    verifyResult(input) {
      return verifySubagentResultAgainstContracts(input.task.id, contracts, input.mountPath, input.abortSignal);
    },
    recoveryPrompt({ task, result }) {
      return buildSubagentRecoveryPrompt(task, result, resolveTaskContractSettings(task.id, contracts), "separate-worktrees");
    },
    callbacks: {
      onTrace(trace) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          ...trace,
          modelId: options.readyPlan.executionModelId
        });
      },
      onStart(task, attempt) {
        options.callbacks?.onSubagentStart?.(task, attempt);
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-start",
          message: `Starting ${task.title}`,
          subagentId: task.id,
          modelId: subagentModelId
        });
      },
      onRetry(task, attempt, error) {
        options.callbacks?.onSubagentRetry?.(task, attempt, error);
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-retry",
          message: `Retrying ${task.title}`,
          detail: `Attempt ${attempt}: ${error.message}`,
          subagentId: task.id,
          modelId: subagentModelId
        });
      },
      onContextUsage(_task, contextUsage) {
        options.callbacks?.onContextUsage?.(contextUsage);
      },
      onComplete(task, output, durationMs) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-complete",
          message: `Completed ${task.title}`,
          detail: output.slice(0, 240),
          subagentId: task.id,
          modelId: subagentModelId,
          durationMs
        });
      },
      onMilestone(task, line) {
        options.callbacks?.onRunMilestone?.(`Subagent ${task.title}: ${line}`);
      },
      onError(task, error) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-error",
          message: `Failed ${task.title}`,
          detail: error.message,
          subagentId: task.id,
          modelId: subagentModelId
        });
      },
      onSettled(result) {
        options.callbacks?.onSubagentResult?.(result);
      }
    }
  });

  const mergedResults = mergeSubagentResults(
    options.readyPlan.subtasks,
    options.existingSubagentResults ?? [],
    freshResults
  );

  let partialReason: string | undefined;
  let integrationNote: string | undefined;
  let integration = undefined;

  try {
    integration = await prepareBranchfsIntegrationLease(adapter, {
      rootPath: options.cwd,
      runId: options.runId,
      executionModelId: options.readyPlan.executionModelId,
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      onTrace(trace) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          ...trace,
          modelId: options.readyPlan.executionModelId
        });
      }
    }, {
      tasks: options.readyPlan.subtasks,
      snapshots: retainedSnapshots,
      abortSignal: options.abortSignal
    });

    if (integration) {
      await verifyBranchfsIntegrationLease(integration);
      await flushBranchfsIntegrationLease(integration);
    }
  } catch (error) {
    const typedError = error instanceof Error ? error : new Error("Integration worktree flow failed");
    partialReason = typedError.message;
    integrationNote = `Integration note: ${typedError.message}`;
  } finally {
    if (!partialReason || !options.debugEnabled) {
      await discardBranchfsIntegrationLease(integration).catch(() => undefined);
      await discardBranchfsSnapshots(retainedSnapshots).catch(() => undefined);
    }
  }

  const assistantMessage = await aggregateSubagentResults(
    adapter,
    {
      cwd: options.cwd,
      runId: options.runId,
      sessionId: options.sessionId,
      messages: options.messages,
      executionPlan: options.executionPlan,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    promptCacheIdentity: options.promptCacheIdentity,
    geminiCachedAttachmentContext: options.geminiCachedAttachmentContext,
    abortSignal: options.abortSignal,
      callbacks: options.callbacks
    },
    options.readyPlan.executionModelId,
    options.readyPlan.finalExecutionBrief,
    options.readyPlan.subtasks,
    mergedResults,
    options.resumeNote,
    integrationNote
  );

  return {
    assistantMessage,
    subagentResults: mergedResults,
    partial: mergedResults.some((result) => result.status === "failed") || Boolean(partialReason),
    partialReason
  };
}

async function executeSameWorktreeSubagents(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    agentId?: AgentId;
    providerBrand: ProviderBrand;
    readyPlan: PlannerReadyTurn;
    debugEnabled: boolean;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
    existingSubagentResults?: SubagentResult[];
    tasksToRun?: PlannerSubtask[];
    resumeNote?: string;
    executionPlan?: ExecutionPlan;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    subagentModelPreference?: RunModelPreference;
  }
) {
  const tasks = options.tasksToRun ?? options.readyPlan.subtasks;
  const contracts = options.executionPlan?.contracts ?? options.readyPlan.contracts ?? [];
  const subagentModelId = resolveSubagentModelId({
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.readyPlan.executionModelId,
    modelPreference: options.subagentModelPreference
  });
  const subagentReasoningStrength = resolveSubagentReasoningStrength(options.reasoningStrength, options.subagentModelPreference);
  const repoRoot = resolveRepoRoot(options.cwd);
  const subagentEnvironmentBrief = buildSubagentEnvironmentBrief({
    projectRoot: options.cwd,
    repoRoot,
    availableSkillPaths: discoverRepoSkillPaths(repoRoot)
  });
  return (
    await scheduleSubagentTasks<
      {
        task: PlannerSubtask;
        startingAttempt: number;
        recoveryAttempt: number;
        recoveryPrompt?: string;
        contractSettings: TaskContractSettings;
      },
      SubagentResult,
      never
    >({
      tasks: orderSameWorktreeTasks(tasks, contracts).map((task) => ({
        task,
        startingAttempt: 1,
        recoveryAttempt: 0,
        recoveryPrompt: undefined as string | undefined,
        contractSettings: resolveTaskContractSettings(task.id, contracts)
      })),
      maxConcurrency: MAX_SUBAGENT_CONCURRENCY,
      getTaskId(entry) {
        return entry.task.id;
      },
      canStart(entry, activeEntries) {
        return canRunSameWorktreeTask(entry, activeEntries);
      },
      async executeTask(entry) {
        options.callbacks?.onSubagentStart?.(entry.task, entry.startingAttempt);
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-start",
          message: `Starting ${entry.task.title}`,
          subagentId: entry.task.id,
          modelId: subagentModelId
        });

        const beforeSnapshot = await snapshotChangedFiles(options.cwd);
        const startedAt = Date.now();

        try {
          const basePrompt = [
            "You are a focused implementation subagent.",
            "Start in the provided cwd and apply the assigned file plan exactly.",
            "Create missing directories and the first listed missing file immediately when the assignment names new paths.",
            "Use owned paths as the primary work area; edit integration files when the assignment requires wiring.",
            "Do not run browser, Playwright, dev server, python -m http.server, visible app smoke tests, or commands that can open windows.",
            "Do not use Start-Process for verification.",
            "Do not perform broad verification unless this subtask explicitly names a verification command.",
            "On Windows, use PowerShell-compatible syntax only; do not use Bash heredocs like <<'EOF'.",
            "Prefer bundled rg for search. If rg is unavailable, use Get-ChildItem plus Select-String.",
            "Return a concise changed-file summary.",
            SUBAGENT_MILESTONE_INSTRUCTION,
            entry.recoveryPrompt?.trim() ? entry.recoveryPrompt.trim() : "",
            subagentEnvironmentBrief,
            entry.contractSettings.explicitOwnedPaths.length > 0
              ? `Owned paths: ${entry.contractSettings.explicitOwnedPaths.join(", ")}`
              : "Owned paths: planner did not specify paths.",
            "",
            `Shared brief: ${options.readyPlan.finalExecutionBrief}`,
            `Subtask title: ${entry.task.title}`,
            `Subtask instruction: ${entry.task.instruction}`
          ]
            .filter(Boolean)
            .join("\n");
          const milestoneParser = createMilestoneDeltaParser((line) => options.callbacks?.onRunMilestone?.(`Subagent ${entry.task.title}: ${line}`));
          const response = await runManagedAgentExecution(adapter, {
            runId: options.runId,
            kind: "subagent",
            subagentId: entry.task.id,
            originalRequest: {
              kind: "subagent",
              cwd: options.cwd,
              modelId: subagentModelId,
              prompt: basePrompt,
              reasoningStrength: subagentReasoningStrength,
              fastMode: options.fastMode,
              promptCacheIdentity: options.promptCacheIdentity,
              onTextDelta(delta: string) {
                milestoneParser.push(delta);
              },
              onExecutionEvent(event: PiAgentExecutionEvent) {
                void options.callbacks?.onExecutionEvent?.({
                  owner: "subagent",
                  subagentId: entry.task.id,
                  event
                });
              },
              requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
                return options.callbacks?.requestBrowserApproval?.({
                  owner: "subagent",
                  subagentId: entry.task.id,
                  ...input
                }) ?? Promise.resolve({ approved: true });
              }
            },
            continuationRequest: {
              kind: "subagent",
              cwd: options.cwd,
              modelId: subagentModelId,
              prompt: ["continue", "", basePrompt].join("\n"),
              reasoningStrength: subagentReasoningStrength,
              fastMode: options.fastMode,
              promptCacheIdentity: options.promptCacheIdentity,
              onTextDelta(delta: string) {
                milestoneParser.push(delta);
              },
              onExecutionEvent(event: PiAgentExecutionEvent) {
                void options.callbacks?.onExecutionEvent?.({
                  owner: "subagent",
                  subagentId: entry.task.id,
                  event
                });
              },
              requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
                return options.callbacks?.requestBrowserApproval?.({
                  owner: "subagent",
                  subagentId: entry.task.id,
                  ...input
                }) ?? Promise.resolve({ approved: true });
              }
            },
            abortSignal: options.abortSignal,
            store: createExecutionStore(options.callbacks, options.runId, "subagent", entry.task.id)
          });
          milestoneParser.flush();
          if (!milestoneParser.hasEmitted()) {
            for (const line of extractMilestoneLines(response.text)) {
              options.callbacks?.onRunMilestone?.(`Subagent ${entry.task.title}: ${line}`);
            }
          }
          const output = stripMilestoneLines(response.text);
          const contractDriftPaths = await inspectSameWorktreeSubagentDrift(
            options.cwd,
            beforeSnapshot,
            entry.contractSettings
          );

          emitTrace(options.callbacks, {
            sessionId: options.sessionId,
            stage: "subagent-complete",
            message: `Completed ${entry.task.title}`,
            detail: formatSubagentCompletionDetail(output, contractDriftPaths),
            subagentId: entry.task.id,
            modelId: subagentModelId,
            durationMs: Date.now() - startedAt
          });
          return {
            result: {
              id: entry.task.id,
              title: entry.task.title,
              instruction: entry.task.instruction,
              status: "completed" as const,
              output,
              attemptCount: entry.startingAttempt,
              durationMs: Date.now() - startedAt,
              mountPath: options.cwd,
              worktreePath: options.cwd,
              contractDriftPaths: contractDriftPaths.length > 0 ? contractDriftPaths : undefined
            }
          };
        } catch (error) {
          const typedError = error instanceof Error ? error : new Error("Unknown same-worktree subagent failure");
          if (options.abortSignal?.aborted) {
            throw typedError;
          }

          emitTrace(options.callbacks, {
            sessionId: options.sessionId,
            stage: "subagent-error",
            message: `Failed ${entry.task.title}`,
            detail: typedError.message,
            subagentId: entry.task.id,
            modelId: subagentModelId
          });
          return {
            result: {
              id: entry.task.id,
              title: entry.task.title,
              instruction: entry.task.instruction,
              status: "failed" as const,
              errorMessage: typedError.message,
              attemptCount: entry.startingAttempt,
              durationMs: Date.now() - startedAt,
              mountPath: options.cwd,
              worktreePath: options.cwd
            }
          };
        }
      },
      async onSettled(_entry, result) {
        await options.callbacks?.onSubagentResult?.(result);
      },
      scheduleRetry(entry, result) {
        if (result.status !== "failed" || entry.recoveryAttempt > 0 || options.abortSignal?.aborted) {
          return undefined;
        }

        const retryError = new Error(result.errorMessage ?? "Unknown same-worktree subagent failure");
        options.callbacks?.onSubagentRetry?.(entry.task, result.attemptCount + 1, retryError);
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-retry",
          message: `Retrying ${entry.task.title}`,
          detail: `Attempt ${result.attemptCount + 1}: ${retryError.message}`,
          subagentId: entry.task.id,
          modelId: subagentModelId
        });

        return {
          ...entry,
          startingAttempt: result.attemptCount + 1,
          recoveryAttempt: entry.recoveryAttempt + 1,
          recoveryPrompt: buildSubagentRecoveryPrompt(
            entry.task,
            result,
            entry.contractSettings,
            "same-worktree"
          )
        };
      }
    })
  ).results;
}

async function executeMainAgent(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    agentId?: AgentId;
    executionPlan?: ExecutionPlan;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
  },
  executionModelId: ProviderModelId,
  finalExecutionBrief: string
) {
  const startedAt = Date.now();
  const executionInput = await buildExecutionInput(options.cwd, options.messages, finalExecutionBrief, options.executionPlan, undefined, {
    geminiCachedAttachmentContext: options.geminiCachedAttachmentContext
  });
  const continuationInput = await buildExecutionInput(
    options.cwd,
    options.messages,
    finalExecutionBrief,
    options.executionPlan,
    "continue",
    {
      geminiCachedAttachmentContext: options.geminiCachedAttachmentContext
    }
  );
  const agentLabel = getAgentRuntimeLabel(options.agentId);
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "execution-start",
    message: `Starting main ${agentLabel} execution`,
    modelId: executionModelId
  });

  const originalRequest = {
    kind: "executor" as const,
    cwd: options.cwd,
    modelId: executionModelId,
    prompt: executionInput.prompt,
    images: executionInput.images,
    cacheableUserBlocks: executionInput.cacheableUserBlocks,
    promptCacheIdentity: options.promptCacheIdentity,
    geminiCachedContentName: options.geminiCachedAttachmentContext?.cachedContentName,
    readOnly: shouldUseReadOnlyExecutionTools(options.executionPlan),
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    onTextDelta(delta: string) {
      options.callbacks?.onDelta?.(delta);
    },
    onExecutionEvent(event: PiAgentExecutionEvent) {
      void options.callbacks?.onExecutionEvent?.({
        owner: "main",
        event
      });
    },
    requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
      return options.callbacks?.requestBrowserApproval?.({
        owner: "main",
        ...input
      }) ?? Promise.resolve({ approved: true });
    }
  };
  const result = await runManagedAgentExecution(adapter, {
    runId: options.runId,
    kind: "main",
    originalRequest,
    continuationRequest: {
      ...originalRequest,
      prompt: continuationInput.prompt,
      images: continuationInput.images,
      cacheableUserBlocks: continuationInput.cacheableUserBlocks
    },
    abortSignal: options.abortSignal,
    store: createExecutionStore(options.callbacks, options.runId, "main"),
    onRefreshComplete(mode) {
      emitTrace(options.callbacks, {
        sessionId: options.sessionId,
        stage: "refresh-complete",
        message: `Refresh complete for main execution (${mode})`,
        modelId: executionModelId
      });
    }
  });
  if (result.contextUsage) {
    options.callbacks?.onContextUsage?.({
      sourceKind: "main",
      sourceLabel: "main",
      modelId: executionModelId,
      tokens: result.contextUsage.tokens,
      contextWindow: result.contextUsage.contextWindow,
      usagePercent: result.contextUsage.usagePercent,
      totalProcessedTokens: result.contextUsage.sessionStats.tokens.total,
      cachedInputTokens: result.contextUsage.cachedInputTokens,
      updatedAt: new Date().toISOString()
    });
  }

  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "execution-complete",
    message: `Main ${agentLabel} execution completed`,
    modelId: executionModelId,
    durationMs: Date.now() - startedAt
  });

  return createChatMessage("assistant", result.text.trim());
}

async function listChangedFiles(cwd: string) {
  const tracked = await runProcess(cwd, ["git", "diff", "--name-only", "--relative"]);
  const untracked = await runProcess(cwd, ["git", "ls-files", "--others", "--exclude-standard"]);
  return [...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)].map((value) => value.trim()).filter(Boolean);
}

export async function executePlanPrerequisites(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    executionPlan: ExecutionPlan;
    executionModelId: ProviderModelId;
    agentId?: AgentId;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
    onPrerequisiteComplete?: (executionPlan: ExecutionPlan) => void | Promise<void>;
  }
) {
  if (options.executionPlan.prerequisites.every((prerequisite) => prerequisite.status === "completed")) {
    return options.executionPlan;
  }

  const executionPlan = {
    ...options.executionPlan,
    prerequisites: options.executionPlan.prerequisites.map((prerequisite) => ({ ...prerequisite }))
  };

  for (const prerequisite of executionPlan.prerequisites) {
    if (prerequisite.status === "completed") {
      continue;
    }

    emitTrace(options.callbacks, {
      sessionId: options.sessionId,
      stage: "prerequisite-start",
      message: `Running prerequisite: ${prerequisite.title}`,
      detail: prerequisite.instruction,
      modelId: options.executionModelId
    });

    const prompt = buildPrerequisitePrompt(options.messages, executionPlan, prerequisite, options.cwd);
    const response = await adapter.runPrompt({
      kind: "executor",
      cwd: options.cwd,
      modelId: options.executionModelId,
      prompt,
      readOnly: shouldUseReadOnlyExecutionTools(executionPlan),
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      promptCacheIdentity: options.promptCacheIdentity,
      geminiCachedContentName: options.geminiCachedAttachmentContext?.cachedContentName,
      abortSignal: options.abortSignal
    });

    if (response.contextUsage) {
      options.callbacks?.onContextUsage?.({
        sourceKind: "main",
        sourceLabel: "prerequisite",
        modelId: options.executionModelId,
        tokens: response.contextUsage.tokens,
        contextWindow: response.contextUsage.contextWindow,
        usagePercent: response.contextUsage.usagePercent,
        totalProcessedTokens: response.contextUsage.sessionStats.tokens.total,
        cachedInputTokens: response.contextUsage.cachedInputTokens,
        updatedAt: new Date().toISOString()
      });
    }

    prerequisite.status = "completed";
    emitTrace(options.callbacks, {
      sessionId: options.sessionId,
      stage: "prerequisite-complete",
      message: `Completed prerequisite: ${prerequisite.title}`,
      detail: stripMilestoneLines(response.text).slice(0, 800),
      modelId: options.executionModelId
    });
    await options.onPrerequisiteComplete?.(executionPlan);
  }

  return executionPlan;
}

async function runProcess(cwd: string, cmd: string[]) {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `${cmd.join(" ")} failed`);
  }

  return stdout.trim();
}

function resolveContractsForTask(taskId: string, contracts: SubagentContract[]) {
  const contractIds = taskId.split("+");
  const matchingContracts = contracts.filter((contract) => contractIds.includes(contract.taskId));
  return matchingContracts.length > 0 ? matchingContracts : contracts.filter((contract) => contract.taskId === taskId);
}

export type TaskContractSettings = {
  ownedContracts: SubagentContract[];
  explicitOwnedPaths: string[];
  verificationCommands: string[];
  exclusive: boolean;
};

function resolveTaskContractSettings(taskId: string, contracts: SubagentContract[]): TaskContractSettings {
  const ownedContracts = resolveContractsForTask(taskId, contracts);
  const allOwnedPaths = ownedContracts.flatMap((contract) => contract.ownedPaths);
  const touchesDependencyRoot = allOwnedPaths.some(isDependencyRootPath);
  return {
    ownedContracts,
    explicitOwnedPaths: allOwnedPaths.filter((value) => value !== "(planner-unspecified)"),
    verificationCommands: ownedContracts.flatMap((contract) => contract.verificationCommands),
    exclusive: touchesDependencyRoot || allOwnedPaths.includes("(planner-unspecified)") || allOwnedPaths.length === 0
  };
}

export function orderSameWorktreeTasks(tasks: PlannerSubtask[], contracts: SubagentContract[]) {
  return [...tasks].sort((left, right) => {
    const leftSettings = resolveTaskContractSettings(left.id, contracts);
    const rightSettings = resolveTaskContractSettings(right.id, contracts);
    const leftRoot = leftSettings.explicitOwnedPaths.some(isDependencyRootPath);
    const rightRoot = rightSettings.explicitOwnedPaths.some(isDependencyRootPath);
    return Number(rightRoot) - Number(leftRoot);
  });
}

export function canRunSameWorktreeTask(
  entry: { contractSettings: TaskContractSettings },
  activeEntries: Array<{ contractSettings: TaskContractSettings }>
) {
  if (entry.contractSettings.exclusive) {
    return activeEntries.length === 0;
  }

  return activeEntries.every((activeEntry) => {
    if (activeEntry.contractSettings.exclusive) {
      return false;
    }

    return ownedPathsAreDisjoint(
      entry.contractSettings.explicitOwnedPaths,
      activeEntry.contractSettings.explicitOwnedPaths
    );
  });
}

export type SameWorktreePathCaseMode = "case-sensitive" | "case-insensitive";

type ChangedFileSnapshot = {
  relativePath: string;
  normalizedPath: string;
  fingerprint: string;
};

const defaultSameWorktreePathCaseMode: SameWorktreePathCaseMode =
  process.platform === "win32" ? "case-insensitive" : "case-sensitive";

export function normalizeSameWorktreePath(
  relativePath: string,
  caseMode: SameWorktreePathCaseMode = defaultSameWorktreePathCaseMode
) {
  if (relativePath === "(planner-unspecified)") {
    return relativePath;
  }

  let normalized = relativePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/\/+$/g, "");
  return caseMode === "case-insensitive" ? normalized.toLowerCase() : normalized;
}

export function isPathWithinSameWorktreeScope(
  relativePath: string,
  ownedPath: string,
  caseMode: SameWorktreePathCaseMode = defaultSameWorktreePathCaseMode
) {
  const normalizedRelativePath = normalizeSameWorktreePath(relativePath, caseMode);
  const normalizedOwnedPath = normalizeSameWorktreePath(ownedPath, caseMode);
  return (
    normalizedRelativePath === normalizedOwnedPath ||
    normalizedRelativePath.startsWith(`${normalizedOwnedPath}/`) ||
    normalizedOwnedPath === "(planner-unspecified)"
  );
}

function ownedPathsAreDisjoint(leftPaths: string[], rightPaths: string[]) {
  return leftPaths.every((leftPath) =>
    rightPaths.every((rightPath) => !sameWorktreeOwnedPathsOverlap(leftPath, rightPath))
  );
}

export function sameWorktreeOwnedPathsOverlap(
  leftPath: string,
  rightPath: string,
  caseMode: SameWorktreePathCaseMode = defaultSameWorktreePathCaseMode
) {
  const normalizedLeft = normalizeSameWorktreePath(leftPath, caseMode);
  const normalizedRight = normalizeSameWorktreePath(rightPath, caseMode);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  );
}

function isDependencyRootPath(relativePath: string) {
  const normalized = normalizeSameWorktreePath(relativePath, "case-insensitive");
  return (
    /(^|\/)index\.html$/.test(normalized) ||
    /(^|\/)package\.json$/.test(normalized) ||
    /(^|\/)src\/main\.[cm]?[jt]sx?$/.test(normalized)
  );
}

async function inspectSameWorktreeSubagentDrift(
  cwd: string,
  beforeSnapshot: Map<string, ChangedFileSnapshot>,
  contractSettings: TaskContractSettings
) {
  const afterSnapshot = await snapshotChangedFiles(cwd);
  const normalizedPaths = new Set([...beforeSnapshot.keys(), ...afterSnapshot.keys()]);
  const changedByTask = [...normalizedPaths].flatMap((normalizedPath) => {
    const before = beforeSnapshot.get(normalizedPath);
    const after = afterSnapshot.get(normalizedPath);
    if (before?.fingerprint === after?.fingerprint) {
      return [];
    }

    return [after?.relativePath ?? before!.relativePath];
  });
  const outOfScopePaths =
    contractSettings.explicitOwnedPaths.length === 0
      ? []
      : changedByTask.filter(
          (relativePath) =>
            !contractSettings.explicitOwnedPaths.some((ownedPath) =>
              isPathWithinSameWorktreeScope(relativePath, ownedPath)
            )
        );
  return outOfScopePaths;
}

async function snapshotChangedFiles(
  cwd: string,
  caseMode: SameWorktreePathCaseMode = defaultSameWorktreePathCaseMode
) {
  const entries = await Promise.all(
    (await listChangedFiles(cwd)).map(async (relativePath): Promise<ChangedFileSnapshot> => {
      const normalizedPath = normalizeSameWorktreePath(relativePath, caseMode);
      return {
        relativePath,
        normalizedPath,
        fingerprint: await fingerprintChangedFile(cwd, relativePath)
      };
    })
  );

  return new Map(entries.map((entry) => [entry.normalizedPath, entry]));
}

async function fingerprintChangedFile(cwd: string, relativePath: string) {
  const absolutePath = path.resolve(cwd, relativePath);
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return "non-file";
    }

    return createHash("sha256").update(await readFile(absolutePath)).digest("hex");
  } catch (error) {
    if (isMissingFileError(error)) {
      return "missing";
    }

    throw error;
  }
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function verifySubagentResultAgainstContracts(
  taskId: string,
  contracts: SubagentContract[],
  cwd: string,
  _abortSignal?: AbortSignal
) {
  const contractSettings = resolveTaskContractSettings(taskId, contracts);
  try {
    const changedPaths = await listChangedFiles(cwd);
    const outOfScopePaths =
      contractSettings.explicitOwnedPaths.length === 0
        ? []
        : changedPaths.filter(
            (relativePath) =>
              !contractSettings.explicitOwnedPaths.some((ownedPath) =>
                isPathWithinSameWorktreeScope(relativePath, ownedPath)
              )
          );
    return outOfScopePaths;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("not a git repository")) {
      throw error;
    }
  }

  return [];
}

function buildSubagentRecoveryPrompt(
  task: PlannerSubtask,
  result: SubagentResult,
  contractSettings: TaskContractSettings,
  strategy: "same-worktree" | "separate-worktrees"
) {
  return [
    "Recovery attempt. Repair this subtask.",
    `Previous failure: ${result.errorMessage ?? "Unknown subagent failure"}`,
    strategy === "same-worktree"
      ? "Work in the same checkout and use owned paths as the primary work area."
      : "Work inside this isolated subagent mount.",
    contractSettings.explicitOwnedPaths.length > 0
      ? `Owned paths: ${contractSettings.explicitOwnedPaths.join(", ")}`
      : "Owned paths: planner did not specify paths. Treat task as exclusive.",
    `Retry subtask title: ${task.title}`,
    "Focus on the previous failure cause, complete the file changes, and return a concise changed-file summary."
  ]
    .filter(Boolean)
    .join("\n");
}

export async function aggregateSubagentResults(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    executionPlan?: ExecutionPlan;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
  },
  executionModelId: ProviderModelId,
  finalExecutionBrief: string,
  subtasks: PlannerSubtask[],
  subagentResults: SubagentResult[],
  resumeNote?: string,
  integrationNote?: string
) {
  const startedAt = Date.now();
  const executionInput = await buildExecutionInput(options.cwd, options.messages, finalExecutionBrief, options.executionPlan, undefined, {
    geminiCachedAttachmentContext: options.geminiCachedAttachmentContext
  });
  options.callbacks?.onAggregationStart?.();
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "aggregation-start",
    message: "Aggregating subagent results",
    modelId: executionModelId
  });

  const aggregationPrompt = [
    executionInput.prompt,
    "",
    resumeNote ? `Resume note: ${resumeNote}` : "",
    integrationNote ?? "",
    subagentResults.some((entry) => entry.status === "failed")
      ? "Some subagents failed. Produce best-effort answer and call out any residual gaps."
      : "",
    "Subagent outputs:",
    formatSubagentResults(subtasks, subagentResults)
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runManagedAgentExecution(adapter, {
    runId: options.runId,
    kind: "aggregator",
    originalRequest: {
      kind: "aggregator",
      cwd: options.cwd,
      modelId: executionModelId,
      prompt: aggregationPrompt,
      images: executionInput.images,
      cacheableUserBlocks: executionInput.cacheableUserBlocks,
      promptCacheIdentity: options.promptCacheIdentity,
      geminiCachedContentName: options.geminiCachedAttachmentContext?.cachedContentName,
      readOnly: shouldUseReadOnlyExecutionTools(options.executionPlan),
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      onTextDelta(delta: string) {
        options.callbacks?.onDelta?.(delta);
      },
      onExecutionEvent(event: PiAgentExecutionEvent) {
        void options.callbacks?.onExecutionEvent?.({
          owner: "aggregator",
          event
        });
      },
      requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
        return options.callbacks?.requestBrowserApproval?.({
          owner: "aggregator",
          ...input
        }) ?? Promise.resolve({ approved: true });
      }
    },
    continuationRequest: {
      kind: "aggregator",
      cwd: options.cwd,
      modelId: executionModelId,
      prompt: [
        "continue",
        "",
        aggregationPrompt
      ].join("\n"),
      images: executionInput.images,
      cacheableUserBlocks: executionInput.cacheableUserBlocks,
      promptCacheIdentity: options.promptCacheIdentity,
      geminiCachedContentName: options.geminiCachedAttachmentContext?.cachedContentName,
      readOnly: shouldUseReadOnlyExecutionTools(options.executionPlan),
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      onTextDelta(delta: string) {
        options.callbacks?.onDelta?.(delta);
      },
      onExecutionEvent(event: PiAgentExecutionEvent) {
        void options.callbacks?.onExecutionEvent?.({
          owner: "aggregator",
          event
        });
      },
      requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
        return options.callbacks?.requestBrowserApproval?.({
          owner: "aggregator",
          ...input
        }) ?? Promise.resolve({ approved: true });
      }
    },
    abortSignal: options.abortSignal,
    store: createExecutionStore(options.callbacks, options.runId, "aggregator"),
    onRefreshComplete(mode) {
      emitTrace(options.callbacks, {
        sessionId: options.sessionId,
        stage: "refresh-complete",
        message: `Refresh complete for aggregation (${mode})`,
        modelId: executionModelId
      });
    }
  });
  if (result.contextUsage) {
    options.callbacks?.onContextUsage?.({
      sourceKind: "aggregator",
      sourceLabel: "aggregator",
      modelId: executionModelId,
      tokens: result.contextUsage.tokens,
      contextWindow: result.contextUsage.contextWindow,
      usagePercent: result.contextUsage.usagePercent,
      totalProcessedTokens: result.contextUsage.sessionStats.tokens.total,
      cachedInputTokens: result.contextUsage.cachedInputTokens,
      updatedAt: new Date().toISOString()
    });
  }

  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "aggregation-complete",
    message: "Subagent aggregation completed",
    modelId: executionModelId,
    durationMs: Date.now() - startedAt
  });

  return createChatMessage("assistant", result.text.trim());
}

export function buildExecutionPrompt(
  messages: ChatMessage[],
  finalExecutionBrief: string,
  executionPlan?: ExecutionPlan,
  cwd?: string
) {
  return assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        "You are the execution stage for a local coding harness.",
        "Use the available coding tools when needed and respond with the final assistant answer only."
      ]
    },
    {
      kind: "workspace",
      content: cwd ? buildExecutionWorkspaceContext(messages, finalExecutionBrief, executionPlan, cwd) : undefined
    },
    {
      kind: "frozen-plan",
      content: finalExecutionBrief
    },
    {
      kind: "dynamic",
      content: ["Conversation transcript:", formatMessages(messages)]
    }
  ]);
}

function buildExecutionWorkspaceContext(
  messages: ChatMessage[],
  finalExecutionBrief: string,
  executionPlan?: ExecutionPlan,
  cwd?: string
) {
  const workspacePathGuidance = cwd
    ? buildWorkspacePathGuidance(
        [...messages.filter((message) => message.role === "user").slice(-3).map((message) => message.content), finalExecutionBrief].join(
          "\n"
        ),
        cwd
      )
    : undefined;
  const normalizedFinalExecutionBrief = cwd
    ? normalizeWorkspaceRelativePaths(finalExecutionBrief, cwd)
    : finalExecutionBrief;
  return [
    executionPlan?.mode
      ? [
          "Active mode:",
          `- ${executionPlan.mode.label}: ${executionPlan.mode.description}`,
          `- Execution guidance: ${executionPlan.mode.executionPrompt}`,
          `- Tool policy: ${executionPlan.mode.toolPolicy}`
        ].join("\n")
      : "",
    executionPlan?.ruleSources && executionPlan.ruleSources.length > 0
      ? ["Rule sources:", ...executionPlan.ruleSources.map((rule) => `[${rule.scope}] ${rule.label}: ${rule.content}`)].join("\n")
      : "",
    executionPlan?.memorySummaries && executionPlan.memorySummaries.length > 0
      ? [
          "Memory summaries:",
          ...executionPlan.memorySummaries.map((memory) => `[${memory.scope}] ${memory.label}: ${memory.content}`)
        ].join("\n")
      : "",
    cwd ? buildExecutionSkillContext(cwd) : "",
    workspacePathGuidance ?? "",
    `Execution brief: ${normalizedFinalExecutionBrief}`
  ].filter(Boolean).join("\n");
}

function buildExecutionSkillContext(cwd: string) {
  const repoRoot = resolveRepoRoot(cwd);
  const availableSkillPaths = discoverRepoSkillPaths(repoRoot);
  if (availableSkillPaths.length === 0) {
    return "Available repository/global skill files: none discovered.";
  }

  return [
    "Available repository/global skill files:",
    ...availableSkillPaths.map((skillPath) => `- ${skillPath}`),
    "If the user asks what skills are available, include these repository/global skills in the answer."
  ].join("\n");
}

export function shouldUseReadOnlyExecutionTools(executionPlan?: Pick<ExecutionPlan, "mode">) {
  return modeUsesReadOnlyExecution(executionPlan?.mode);
}

function buildContinuationPrompt(
  prefix: string,
  cwd: string,
  messages: ChatMessage[],
  finalExecutionBrief: string,
  executionPlan?: ExecutionPlan
) {
  return [prefix, "", buildExecutionPrompt(messages, finalExecutionBrief, executionPlan, cwd)].join("\n");
}

function buildPrerequisitePrompt(
  messages: ChatMessage[],
  executionPlan: ExecutionPlan,
  prerequisite: PlanPrerequisite,
  cwd: string
) {
  const requiredTasks = prerequisite.requiredForTaskIds.length > 0
    ? prerequisite.requiredForTaskIds.join(", ")
    : "all planned work";
  return [
    buildExecutionPrompt(messages, executionPlan.finalExecutionBrief, executionPlan, cwd),
    "",
    "Run this prerequisite setup step now. Complete only this prerequisite before subagent work starts.",
    `Prerequisite id: ${prerequisite.id}`,
    `Title: ${prerequisite.title}`,
    `Instruction: ${prerequisite.instruction}`,
    `Reason: ${prerequisite.reason}`,
    `Required for task ids: ${requiredTasks}`,
    "",
    "Report concise setup result when complete."
  ].join("\n");
}

async function buildExecutionInput(
  cwd: string,
  messages: ChatMessage[],
  finalExecutionBrief: string,
  executionPlan?: ExecutionPlan,
  prefix?: string,
  options: { geminiCachedAttachmentContext?: GeminiCachedAttachmentContext } = {}
) {
  const attachmentContext = await buildPromptAttachmentContext(messages, {
    geminiCachedAttachmentContext: options.geminiCachedAttachmentContext
  });
  const basePrompt = assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        "You are the execution stage for a local coding harness.",
        "Use the available coding tools when needed and respond with the final assistant answer only."
      ]
    },
    {
      kind: "workspace",
      content: buildExecutionWorkspaceContext(messages, finalExecutionBrief, executionPlan, cwd)
    },
    {
      kind: "attachments",
      content: attachmentContext.transcript === formatMessages(messages) ? undefined : attachmentContext.transcript
    },
    {
      kind: "frozen-plan",
      content: finalExecutionBrief
    },
    {
      kind: "dynamic",
      content: ["Conversation transcript:", formatMessages(messages)]
    }
  ]);
  const prompt = [prefix, prefix ? "" : undefined, basePrompt].filter(Boolean).join("\n");

  return {
    prompt,
    images: attachmentContext.images,
    cacheableUserBlocks: attachmentContext.cacheableUserBlocks
  };
}

function formatMessages(messages: ChatMessage[]) {
  const visibleMessages = messages.filter((message) => message.role !== "system");
  return visibleMessages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
}

function formatSubagentResults(subtasks: PlannerSubtask[], subagentResults: SubagentResult[]) {
  return subtasks
    .map((task) => {
      const result = subagentResults.find((entry) => entry.id === task.id);
      return [
        `Subtask ${task.id}: ${task.title}`,
        `Instruction: ${task.instruction}`,
        `Status: ${result?.status ?? "missing"}`,
        result?.output ? `Output: ${result.output}` : "Output: (missing)",
        result?.contractDriftPaths && result.contractDriftPaths.length > 0
          ? `Contract drift paths: ${result.contractDriftPaths.join(", ")}`
          : "",
        result?.errorMessage ? `Error: ${result.errorMessage}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function formatSubagentCompletionDetail(output: string, contractDriftPaths: string[]) {
  return [
    output.slice(0, 240),
    contractDriftPaths.length > 0 ? `Contract drift paths: ${contractDriftPaths.join(", ")}` : ""
  ].filter(Boolean).join("\n");
}

function mergeSubagentResults(subtasks: PlannerSubtask[], existing: SubagentResult[], incoming: SubagentResult[]) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const result of incoming) {
    byId.set(result.id, result);
  }
  const order = new Map(subtasks.map((task, index) => [task.id, index]));
  return [...byId.values()].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

function emitTrace(callbacks: PiOrchestratorCallbacks | undefined, trace: AgentTrace) {
  debugLog("agent.trace", {
    stage: trace.stage,
    modelId: trace.modelId,
    subagentId: trace.subagentId
  });
  callbacks?.onTrace?.(trace);
}

function getAgentRuntimeLabel(agentId: AgentId | undefined) {
  switch (agentId) {
    case "codex-cli":
      return "Codex CLI";
    case "copilot-cli":
      return "GitHub Copilot CLI";
    default:
      return "Pi";
  }
}

function createExecutionStore(
  callbacks: PiOrchestratorCallbacks | undefined,
  runId: string,
  kind: ManagedExecutionState["kind"],
  subagentId?: string
) {
  return {
    getState() {
      return callbacks?.getExecutionState?.({
        runId,
        kind,
        subagentId
      });
    },
    setState(state: ManagedExecutionState) {
      callbacks?.setExecutionState?.(state);
    },
    clearState() {
      callbacks?.clearExecutionState?.({
        runId,
        kind,
        subagentId
      });
    }
  };
}

export function executionPlanToTasks(executionPlan: ExecutionPlan): PlannerSubtask[] {
  return executionPlan.actualSubagentCount <= 1
    ? []
    : bucketContracts(
        executionPlan.contracts,
        executionPlan.actualSubagentCount,
        executionPlan.subagentWorktreeStrategy
      ).map((bucket, index) => {
        const taskId = bucket.length === 1 ? bucket[0]!.taskId : bucket.map((contract) => contract.taskId).join("+");
        const title =
          bucket.length === 1
            ? bucket[0]!.title
            : bucket.map((contract) => contract.title).join(" + ").slice(0, 120);
        const instruction = bucket
          .map((contract) =>
            [
              contract.instruction,
              contract.deliverables.length > 0 ? `Deliverables: ${contract.deliverables.join(", ")}` : "",
              contract.integrationPoints.length > 0 ? `Integrate with: ${contract.integrationPoints.join(", ")}` : "",
              contract.ownedPaths.length > 0 ? `Owned paths: ${contract.ownedPaths.join(", ")}` : ""
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n");

        return {
          id: taskId,
          title,
          instruction
        };
      });
}

export function buildExecutionPlan(input: {
  runId: string;
  planningModelId: ProviderModelId;
  plannerResult: PlannerReadyTurn;
  subagentWorktreeStrategy: SubagentWorktreeStrategy;
  planExecutionMode: PlanExecutionMode;
  planExecutionDelaySeconds: number;
  correctnessIterationMode: CorrectnessIterationMode;
  mode?: ModeDefinition;
  ruleSources?: WorkspaceRuleSource[];
  memorySummaries?: MemorySummary[];
  iteration: number;
  origin: ExecutionPlan["origin"];
}): ExecutionPlan {
  const prerequisites = normalizePrerequisites(input.plannerResult);
  const contracts = normalizeContracts(input.plannerResult, input.subagentWorktreeStrategy);
  const effectiveSubagentWorktreeStrategy =
    input.subagentWorktreeStrategy === "same-worktree" && requiresSeparateWorktreesForContracts(contracts)
      ? "separate-worktrees"
      : input.subagentWorktreeStrategy;
  const targetSubagentCount = contracts.length === 0 ? 0 : getTargetSubagentCount(input.plannerResult.difficultyScore);
  const actualSubagentCount =
    targetSubagentCount < 2 ? 0 : getActualSubagentCount(contracts, targetSubagentCount, effectiveSubagentWorktreeStrategy);
  const gateMode = resolveExecutionPlanGateMode(input.mode, input.planExecutionMode, actualSubagentCount);

  return {
    runId: input.runId,
    origin: input.origin,
    iteration: input.iteration,
    summary: input.plannerResult.summary,
    finalExecutionBrief: input.plannerResult.finalExecutionBrief,
    difficultyScore: Math.round(input.plannerResult.difficultyScore),
    planningModelId: input.planningModelId,
    executionModelId: input.plannerResult.executionModelId,
    route: actualSubagentCount > 1 ? "pi-subagents" : "main",
    subagentWorktreeStrategy: effectiveSubagentWorktreeStrategy,
    targetSubagentCount,
    actualSubagentCount: actualSubagentCount > 1 ? actualSubagentCount : 0,
    gating: {
      mode: gateMode,
      delaySeconds: input.planExecutionDelaySeconds
    },
    mode: input.mode,
    ruleSources: input.ruleSources,
    memorySummaries: input.memorySummaries,
    prerequisites,
    contracts,
    correctnessPolicy: input.correctnessIterationMode
  };
}

function normalizePrerequisites(plannerResult: PlannerReadyTurn): PlanPrerequisite[] {
  return (plannerResult.prerequisites ?? []).map((prerequisite) => ({
    ...prerequisite,
    status: prerequisite.status ?? "pending"
  }));
}

function normalizeContracts(
  plannerResult: PlannerReadyTurn,
  subagentWorktreeStrategy: SubagentWorktreeStrategy
): SubagentContract[] {
  if (plannerResult.contracts && plannerResult.contracts.length > 0) {
    return plannerResult.contracts.map((contract) => ({
      ...contract,
      verificationCommands:
        contract.verificationCommands.length > 0
          ? contract.verificationCommands
          : defaultVerificationCommands(contract.ownedPaths, subagentWorktreeStrategy, contract.verificationScope)
    }));
  }

  return plannerResult.subtasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    instruction: task.instruction,
    effortPoints: inferEffortPoints(task.instruction),
    ownedPaths: inferOwnedPaths(task.instruction),
    dependsOnPrerequisiteIds: [],
    deliverables: [task.title],
    integrationPoints: [],
    verificationScope: subagentWorktreeStrategy === "same-worktree" ? "owned-files-only" : "worktree-full",
    verificationCommands: defaultVerificationCommands(
      inferOwnedPaths(task.instruction),
      subagentWorktreeStrategy,
      subagentWorktreeStrategy === "same-worktree" ? "owned-files-only" : "worktree-full"
    ),
    mergeNotes: `Merge ${task.title} into final solution without dropping sibling work.`
  }));
}

function inferEffortPoints(instruction: string) {
  const lowered = instruction.toLowerCase();
  if (lowered.includes("refactor") || lowered.includes("migrate") || lowered.includes("pipeline")) {
    return 5;
  }
  if (lowered.includes("integrat") || lowered.includes("state") || lowered.includes("build")) {
    return 4;
  }
  if (lowered.includes("implement") || lowered.includes("feature")) {
    return 3;
  }
  if (lowered.includes("inspect") || lowered.includes("copy")) {
    return 1;
  }
  return 2;
}

function inferOwnedPaths(instruction: string) {
  const matches = instruction.matchAll(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|css|html|md))/g);
  const values = [...matches].map((match) => match[1]!).filter(Boolean);
  return values.length > 0 ? values : ["(planner-unspecified)"];
}

function defaultVerificationCommands(
  ownedPaths: string[],
  subagentWorktreeStrategy: SubagentWorktreeStrategy,
  verificationScope: SubagentContract["verificationScope"]
) {
  if (subagentWorktreeStrategy === "same-worktree" || verificationScope === "owned-files-only") {
    const fileArgs = ownedPaths.filter((value) => value !== "(planner-unspecified)");
    return fileArgs.length > 0 ? [`bunx tsc --noEmit ${fileArgs.join(" ")}`] : ["bunx tsc --noEmit"];
  }

  return ["bun run typecheck", "bun run test"];
}

function getTargetSubagentCount(difficultyScore: number) {
  if (difficultyScore < 30) {
    return 0;
  }

  return Math.max(2, Math.min(10, Math.round(2 + ((difficultyScore - 30) / 70) * 8)));
}

function getActualSubagentCount(
  contracts: SubagentContract[],
  targetSubagentCount: number,
  subagentWorktreeStrategy: SubagentWorktreeStrategy
) {
  let bucketCount = Math.min(targetSubagentCount, contracts.length);
  while (bucketCount > 1) {
    const buckets = bucketContracts(contracts, bucketCount, subagentWorktreeStrategy);
    if (isEvenlyBucketed(buckets) && (subagentWorktreeStrategy !== "same-worktree" || hasDisjointOwnedPaths(buckets))) {
      return buckets.length;
    }

    bucketCount -= 1;
  }

  if (subagentWorktreeStrategy === "same-worktree" && targetSubagentCount >= 2 && contracts.length >= 2) {
    return Math.min(targetSubagentCount, contracts.length);
  }

  return 0;
}

function bucketContracts(
  contracts: SubagentContract[],
  bucketCount: number,
  subagentWorktreeStrategy: SubagentWorktreeStrategy
) {
  if (bucketCount <= 0) {
    return [];
  }

  if (bucketCount >= contracts.length) {
    return contracts.map((contract) => [withDerivedVerification(contract, subagentWorktreeStrategy)]);
  }

  const prepared = contracts.map((contract) => withDerivedVerification(contract, subagentWorktreeStrategy));
  const targetEffort = prepared.reduce((sum, contract) => sum + getSchedulingEffortPoints(contract.effortPoints), 0) / bucketCount;
  const buckets: SubagentContract[][] = [];
  let currentBucket: SubagentContract[] = [];
  let currentEffort = 0;

  for (const contract of prepared) {
    const remainingContracts = prepared.length - buckets.flat().length - currentBucket.length;
    const remainingBuckets = bucketCount - buckets.length - 1;
    const shouldSplit =
      currentBucket.length > 0 &&
      currentEffort >= targetEffort &&
      remainingContracts >= remainingBuckets;

    if (shouldSplit) {
      buckets.push(currentBucket);
      currentBucket = [];
      currentEffort = 0;
    }

    currentBucket.push(contract);
    currentEffort += getSchedulingEffortPoints(contract.effortPoints);
  }

  if (currentBucket.length > 0) {
    buckets.push(currentBucket);
  }

  return buckets;
}

function withDerivedVerification(
  contract: SubagentContract,
  subagentWorktreeStrategy: SubagentWorktreeStrategy
): SubagentContract {
  return {
    ...contract,
    verificationCommands:
      contract.verificationCommands.length > 0
        ? contract.verificationCommands
        : defaultVerificationCommands(contract.ownedPaths, subagentWorktreeStrategy, contract.verificationScope)
  };
}

function isEvenlyBucketed(buckets: SubagentContract[][]) {
  if (buckets.length <= 1) {
    return false;
  }

  const effortPerBucket = buckets.map((bucket) =>
    bucket.reduce((sum, contract) => sum + getSchedulingEffortPoints(contract.effortPoints), 0)
  );
  const mean = effortPerBucket.reduce((sum, value) => sum + value, 0) / effortPerBucket.length;
  return effortPerBucket.every((value) => Math.abs(value - mean) <= Math.max(1, mean * 0.25));
}

function getSchedulingEffortPoints(value: number) {
  return Math.min(20, Math.max(1, value));
}

function hasDisjointOwnedPaths(buckets: SubagentContract[][]) {
  const ownedPathSets = buckets.map((bucket) =>
    bucket.flatMap((contract) => contract.ownedPaths).filter((value) => value !== "(planner-unspecified)")
  );
  if (ownedPathSets.some((paths) => paths.length === 0)) {
    return false;
  }

  for (let leftIndex = 0; leftIndex < ownedPathSets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ownedPathSets.length; rightIndex += 1) {
      if (pathsOverlap(ownedPathSets[leftIndex]!, ownedPathSets[rightIndex]!)) {
        return false;
      }
    }
  }

  return true;
}

function requiresSeparateWorktreesForContracts(contracts: SubagentContract[]) {
  if (contracts.length < 2) {
    return false;
  }
  if (contracts.some((contract) => contract.ownedPaths.includes("(planner-unspecified)") || contract.ownedPaths.length === 0)) {
    return true;
  }
  return !hasDisjointOwnedPaths(contracts.map((contract) => [contract]));
}

function pathsOverlap(leftPaths: string[], rightPaths: string[]) {
  return leftPaths.some((leftPath) =>
    rightPaths.some((rightPath) => {
      const left = leftPath.replace(/\\/g, "/");
      const right = rightPath.replace(/\\/g, "/");
      return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
    })
  );
}

export function chooseExecutionPath(difficultyScore: number) {
  return difficultyScore > 40 ? "subagents" : "main";
}

export function applyAssistantMessage(state: ChatSessionState, assistantMessage: ChatMessage): ChatSessionState {
  return {
    ...state,
    messages: [...state.messages, assistantMessage],
    lastError: undefined,
    isStreaming: false
  };
}

