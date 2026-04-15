import {
  createChatMessage,
  type AgentPlan,
  type AgentTrace,
  type ChatMessage,
  type ChatSessionState,
  type ProjectContextUsage,
  type PlannerReadyTurn,
  type PlannerSubtask,
  type PlanningQuestion,
  type ProviderBrand,
  type ProviderModelId
} from "../../shared/protocol";
import { GitWorktreeManager } from "./git-worktree-manager";
import { debugLog } from "./logging";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import {
  getDefaultPlanningModelId,
  getDefaultSubagentModelId,
  planTask
} from "./pi-planner";
import { executeSubagents, type SubagentResult } from "./pi-subagents";

export type PiOrchestratorCallbacks = {
  onPlan?: (plan: AgentPlan) => void;
  onTrace?: (trace: AgentTrace) => void;
  onDelta?: (delta: string) => void;
  onContextUsage?: (contextUsage: ProjectContextUsage) => void;
  onSubagentStart?: (task: PlannerSubtask) => void;
  onSubagentResult?: (result: SubagentResult) => void;
};

export type PlannerTurnOutcome = {
  planningModelId: ProviderModelId;
  plannerResult: Awaited<ReturnType<typeof planTask>>["plannerResult"];
  contextUsage?: ProjectContextUsage;
  plan?: AgentPlan;
};

export type ExecutionOutcome = {
  assistantMessage: ReturnType<typeof createChatMessage>;
  subagentResults: SubagentResult[];
  partial: boolean;
  partialReason?: string;
};

export async function runPlannerTurn(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    sessionId: string;
    messages: ChatMessage[];
    latestUserPrompt: string;
    providerBrand: ProviderBrand;
    executionModelId?: ProviderModelId;
    priorQuestions?: PlanningQuestion[];
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
  }
): Promise<PlannerTurnOutcome> {
  const planningStartedAt = Date.now();
  const planningModelId = getDefaultPlanningModelId(options.providerBrand);
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "planning",
    message: "Planning task with pi",
    modelId: planningModelId
  });

  const plannerTurn = await planTask(adapter, {
    cwd: options.cwd,
    messages: options.messages,
    latestUserPrompt: options.latestUserPrompt,
    providerBrand: options.providerBrand,
    executionModelId: options.executionModelId,
    priorQuestions: options.priorQuestions,
    abortSignal: options.abortSignal
  });
  if (plannerTurn.contextUsage) {
    options.callbacks?.onContextUsage?.(plannerTurn.contextUsage);
  }
  const plannerResult = plannerTurn.plannerResult;

  if (plannerResult.type === "question") {
    emitTrace(options.callbacks, {
      sessionId: options.sessionId,
      stage: "planning-question",
      message: plannerResult.question.prompt,
      detail: plannerResult.summary,
      modelId: planningModelId,
      durationMs: Date.now() - planningStartedAt
    });

    return {
      planningModelId,
      plannerResult,
      contextUsage: plannerTurn.contextUsage
    };
  }

  const plan: AgentPlan = {
    sessionId: options.sessionId,
    agentId: "pi",
    planningModelId,
    difficultyScore: Math.round(plannerResult.difficultyScore),
    usesSubagents: plannerResult.usesSubagents,
    executionModelId: plannerResult.executionModelId,
    subtaskCount: plannerResult.subtasks.length
  };

  options.callbacks?.onPlan?.(plan);
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "routing",
    message: plannerResult.usesSubagents ? "Routing task to pi-subagents" : "Routing task to main pi executor",
    detail: plannerResult.summary,
    modelId: plannerResult.executionModelId,
    durationMs: Date.now() - planningStartedAt
  });

  return {
    planningModelId,
    plannerResult,
    contextUsage: plannerTurn.contextUsage,
    plan
  };
}

export async function executeReadyRun(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    providerBrand: ProviderBrand;
    readyPlan: PlannerReadyTurn;
    debugEnabled: boolean;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
    existingSubagentResults?: SubagentResult[];
    tasksToRun?: PlannerSubtask[];
    resumeNote?: string;
  }
): Promise<ExecutionOutcome> {
  if (!options.readyPlan.usesSubagents) {
    return {
      assistantMessage: await executeMainAgent(
        adapter,
        {
          cwd: options.cwd,
          sessionId: options.sessionId,
          messages: options.messages,
          abortSignal: options.abortSignal,
          callbacks: options.callbacks
        },
        options.readyPlan.executionModelId,
        options.readyPlan.finalExecutionBrief
      ),
      subagentResults: [],
      partial: false
    };
  }

  const subagentModelId = getDefaultSubagentModelId(options.providerBrand);
  const freshResults = await executeSubagents(adapter, {
    cwd: options.cwd,
    runId: options.runId,
    providerBrand: options.providerBrand,
    brief: options.readyPlan.finalExecutionBrief,
    tasks: options.tasksToRun ?? options.readyPlan.subtasks,
    debugEnabled: options.debugEnabled,
    executionModelId: options.readyPlan.executionModelId,
    abortSignal: options.abortSignal,
    callbacks: {
      onTrace(trace) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          ...trace,
          modelId: options.readyPlan.executionModelId
        });
      },
      onStart(task) {
        options.callbacks?.onSubagentStart?.(task);
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-start",
          message: `Starting ${task.title}`,
          subagentId: task.id,
          modelId: subagentModelId
        });
      },
      onRetry(task, attempt, error) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-retry",
          message: `Retrying ${task.title}`,
          detail: `Attempt ${attempt + 1}: ${error.message}`,
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
      onError(task, error) {
        emitTrace(options.callbacks, {
          sessionId: options.sessionId,
          stage: "subagent-error",
          message: `Failed ${task.title}`,
          detail: error.message,
          subagentId: task.id,
          modelId: subagentModelId
        });
      }
    }
  });

  for (const result of freshResults) {
    options.callbacks?.onSubagentResult?.(result);
  }

  const mergedResults = mergeSubagentResults(
    options.readyPlan.subtasks,
    options.existingSubagentResults ?? [],
    freshResults
  );
  const manager = new GitWorktreeManager({
    rootPath: options.cwd,
    runId: options.runId,
    debugEnabled: options.debugEnabled,
    executionModelId: options.readyPlan.executionModelId
  }, {
    onTrace(trace) {
      emitTrace(options.callbacks, {
        sessionId: options.sessionId,
        ...trace,
        modelId: options.readyPlan.executionModelId
      });
    }
  });

  let partialReason: string | undefined;
  let integrationNote: string | undefined;
  let integrationWorktreePath: string | undefined;
  let finalCleanup = mergedResults.every((result) => result.status === "completed");
  const preserveWorktreePaths = mergedResults
    .map((result) => result.worktreePath)
    .filter((worktreePath): worktreePath is string => Boolean(worktreePath && options.debugEnabled));

  try {
    const integration = await manager.mergeSubagentBranches(adapter, {
      tasks: options.readyPlan.subtasks,
      subagentResults: mergedResults
        .filter((result): result is SubagentResult & { commitSha: string } => result.status === "completed" && Boolean(result.commitSha))
        .map((result) => ({
          taskId: result.id,
          commitSha: result.commitSha
        })),
      abortSignal: options.abortSignal
    });

    if (integration) {
      integrationWorktreePath = integration.integrationWorktreePath;
      await manager.verifyIntegrationWorktree(integration.integrationWorktreePath);
      await manager.syncIntegrationResultToRoot(integration.integrationWorktreePath);
    }
  } catch (error) {
    const typedError = error instanceof Error ? error : new Error("Integration worktree flow failed");
    partialReason = typedError.message;
    integrationNote = `Integration note: ${typedError.message}`;
    finalCleanup = false;
    if (integrationWorktreePath && options.debugEnabled) {
      preserveWorktreePaths.push(integrationWorktreePath);
    }
  } finally {
    await manager.cleanupRunWorktrees({
      taskIds: options.readyPlan.subtasks.map((task) => task.id),
      preserveWorktreePaths,
      finalCleanup
    });
  }

  const assistantMessage = await aggregateSubagentResults(
    adapter,
    {
      cwd: options.cwd,
      sessionId: options.sessionId,
      messages: options.messages,
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

async function executeMainAgent(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    sessionId: string;
    messages: ChatMessage[];
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
  },
  executionModelId: ProviderModelId,
  finalExecutionBrief: string
) {
  const startedAt = Date.now();
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "execution-start",
    message: "Starting main pi execution",
    modelId: executionModelId
  });

  const result = await adapter.runPrompt({
    kind: "executor",
    cwd: options.cwd,
    modelId: executionModelId,
    prompt: buildExecutionPrompt(options.messages, finalExecutionBrief),
    abortSignal: options.abortSignal,
    onTextDelta(delta) {
      options.callbacks?.onDelta?.(delta);
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
      updatedAt: new Date().toISOString()
    });
  }

  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "execution-complete",
    message: "Main pi execution completed",
    modelId: executionModelId,
    durationMs: Date.now() - startedAt
  });

  return createChatMessage("assistant", result.text.trim());
}

export async function aggregateSubagentResults(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    sessionId: string;
    messages: ChatMessage[];
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
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "aggregation-start",
    message: "Aggregating subagent results",
    modelId: executionModelId
  });

  const result = await adapter.runPrompt({
    kind: "aggregator",
    cwd: options.cwd,
    modelId: executionModelId,
    prompt: [
      buildExecutionPrompt(options.messages, finalExecutionBrief),
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
      .join("\n"),
    abortSignal: options.abortSignal,
    onTextDelta(delta) {
      options.callbacks?.onDelta?.(delta);
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

export function buildExecutionPrompt(messages: ChatMessage[], finalExecutionBrief: string) {
  return [
    "You are the execution stage for a local coding harness.",
    "Use the available coding tools when needed and respond with the final assistant answer only.",
    "",
    "Conversation transcript:",
    formatMessages(messages),
    "",
    `Execution brief: ${finalExecutionBrief}`
  ].join("\n");
}

function formatMessages(messages: ChatMessage[]) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
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
        result?.errorMessage ? `Error: ${result.errorMessage}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
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
