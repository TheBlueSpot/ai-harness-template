import {
  createChatMessage,
  type AgentPlan,
  type AgentTrace,
  type ChatMessage,
  type ChatSessionState,
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
  type SubagentContract,
  type SubagentWorktreeStrategy,
  type WorkspaceRuleSource
} from "../../shared/protocol";
import type { ManagedExecutionState, ManagedRefreshAction } from "./execution-runtime";
import { GitWorktreeManager } from "./git-worktree-manager";
import { debugLog } from "./logging";
import { runManagedAgentExecution } from "./managed-agent-execution";
import type { PiAgentAdapter, PiAgentExecutionEvent } from "./pi-agent-adapter";
import {
  getDefaultPlanningModelId,
  getDefaultSubagentModelId,
  planTask
} from "./pi-planner";
import { executeSubagents, type SubagentResult } from "./pi-subagents";
import { buildPromptAttachmentContext } from "./chat-attachment-prompt";

export type PiOrchestratorCallbacks = {
  onPlan?: (plan: AgentPlan) => void;
  onTrace?: (trace: AgentTrace) => void;
  onDelta?: (delta: string) => void;
  onContextUsage?: (contextUsage: ProjectContextUsage) => void;
  onSubagentStart?: (task: PlannerSubtask) => void;
  onSubagentResult?: (result: SubagentResult) => void;
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

export async function runPlannerTurn(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    sessionId: string;
    messages: ChatMessage[];
    latestUserPrompt: string;
    runId: string;
    providerBrand: ProviderBrand;
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
    mode: options.mode,
    ruleSources: options.ruleSources,
    memorySummaries: options.memorySummaries,
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
  const executionTasks = executionPlanToTasks(executionPlan);
  const readyPlannerResult: PlannerReadyTurn = {
    ...plannerResult,
    usesSubagents: executionTasks.length > 0,
    subtasks: executionTasks
  };

  const plan: AgentPlan = {
    sessionId: options.sessionId,
    agentId: "pi",
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
    message: readyPlannerResult.usesSubagents ? "Routing task to pi-subagents" : "Routing task to main pi executor",
    detail: executionPlan.summary,
    modelId: executionPlan.executionModelId,
    durationMs: Date.now() - planningStartedAt
  });

  return {
    planningModelId,
    plannerResult: readyPlannerResult,
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
    providerBrand: ProviderBrand;
    readyPlan: PlannerReadyTurn;
    debugEnabled: boolean;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
    existingSubagentResults?: SubagentResult[];
    tasksToRun?: PlannerSubtask[];
    resumeNote?: string;
    executionPlan?: ExecutionPlan;
  }
): Promise<ExecutionOutcome> {
  if (!options.readyPlan.usesSubagents) {
    return {
      assistantMessage: await executeMainAgent(
        adapter,
        {
          cwd: options.cwd,
          runId: options.runId,
          sessionId: options.sessionId,
          messages: options.messages,
          executionPlan: options.executionPlan,
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

  if (options.executionPlan?.subagentWorktreeStrategy === "same-worktree") {
    const freshResults = await executeSameWorktreeSubagents(adapter, options);
    for (const result of freshResults) {
      options.callbacks?.onSubagentResult?.(result);
    }

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
      runId: options.runId,
      sessionId: options.sessionId,
      messages: options.messages,
      executionPlan: options.executionPlan,
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
    providerBrand: ProviderBrand;
    readyPlan: PlannerReadyTurn;
    debugEnabled: boolean;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
    existingSubagentResults?: SubagentResult[];
    tasksToRun?: PlannerSubtask[];
    resumeNote?: string;
    executionPlan?: ExecutionPlan;
  }
) {
  const tasks = options.tasksToRun ?? options.readyPlan.subtasks;
  const contracts = options.executionPlan?.contracts ?? options.readyPlan.contracts ?? [];
  const subagentModelId = getDefaultSubagentModelId(options.providerBrand);
  const results: SubagentResult[] = [];

  for (const task of tasks) {
    options.callbacks?.onSubagentStart?.(task);
    emitTrace(options.callbacks, {
      sessionId: options.sessionId,
      stage: "subagent-start",
      message: `Starting ${task.title}`,
      subagentId: task.id,
      modelId: subagentModelId
    });

    const ownedContracts = resolveContractsForTask(task.id, contracts);
    const ownedPaths = ownedContracts.flatMap((contract) => contract.ownedPaths).filter((value) => value !== "(planner-unspecified)");
    const verificationCommands = ownedContracts.flatMap((contract) => contract.verificationCommands);
    const beforePaths = new Set(await listChangedFiles(options.cwd));
    const startedAt = Date.now();

    try {
      const basePrompt = [
        "You are a focused coding subagent.",
        "Complete only the assigned instruction.",
        "Work in same git worktree. Edit only owned paths.",
        ownedPaths.length > 0 ? `Owned paths: ${ownedPaths.join(", ")}` : "Owned paths: planner did not specify paths.",
        verificationCommands.length > 0 ? `Verification commands: ${verificationCommands.join(" && ")}` : "",
        "",
        `Shared brief: ${options.readyPlan.finalExecutionBrief}`,
        `Subtask title: ${task.title}`,
        `Subtask instruction: ${task.instruction}`
      ]
        .filter(Boolean)
        .join("\n");
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: task.id,
        originalRequest: {
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: basePrompt,
          onExecutionEvent(event: PiAgentExecutionEvent) {
            void options.callbacks?.onExecutionEvent?.({
              owner: "subagent",
              subagentId: task.id,
              event
            });
          },
          requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
            return options.callbacks?.requestBrowserApproval?.({
              owner: "subagent",
              subagentId: task.id,
              ...input
            }) ?? Promise.resolve({ approved: true });
          }
        },
        continuationRequest: {
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: ["continue", "", basePrompt].join("\n"),
          onExecutionEvent(event: PiAgentExecutionEvent) {
            void options.callbacks?.onExecutionEvent?.({
              owner: "subagent",
              subagentId: task.id,
              event
            });
          },
          requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
            return options.callbacks?.requestBrowserApproval?.({
              owner: "subagent",
              subagentId: task.id,
              ...input
            }) ?? Promise.resolve({ approved: true });
          }
        },
        abortSignal: options.abortSignal,
        store: createExecutionStore(options.callbacks, options.runId, "subagent", task.id)
      });
      const afterPaths = new Set(await listChangedFiles(options.cwd));
      const changedByTask = [...afterPaths].filter((relativePath) => !beforePaths.has(relativePath));
      const outOfScopePaths =
        ownedPaths.length === 0
          ? []
          : changedByTask.filter(
              (relativePath) => !ownedPaths.some((ownedPath) => isPathWithinScope(relativePath, ownedPath))
            );
      if (outOfScopePaths.length > 0) {
        throw new Error(`Out-of-contract edits: ${outOfScopePaths.join(", ")}`);
      }

      for (const verificationCommand of verificationCommands) {
        await runShellCommand(options.cwd, verificationCommand, options.abortSignal);
      }

      emitTrace(options.callbacks, {
        sessionId: options.sessionId,
        stage: "subagent-complete",
        message: `Completed ${task.title}`,
        detail: response.text.slice(0, 240),
        subagentId: task.id,
        modelId: subagentModelId,
        durationMs: Date.now() - startedAt
      });
      results.push({
        id: task.id,
        title: task.title,
        instruction: task.instruction,
        status: "completed",
        output: response.text.trim(),
        attemptCount: 1,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error("Unknown same-worktree subagent failure");
      emitTrace(options.callbacks, {
        sessionId: options.sessionId,
        stage: "subagent-error",
        message: `Failed ${task.title}`,
        detail: typedError.message,
        subagentId: task.id,
        modelId: subagentModelId
      });
      results.push({
        id: task.id,
        title: task.title,
        instruction: task.instruction,
        status: "failed",
        errorMessage: typedError.message,
        attemptCount: 1,
        durationMs: Date.now() - startedAt
      });
    }
  }

  return results;
}

async function executeMainAgent(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    executionPlan?: ExecutionPlan;
    abortSignal?: AbortSignal;
    callbacks?: PiOrchestratorCallbacks;
  },
  executionModelId: ProviderModelId,
  finalExecutionBrief: string
) {
  const startedAt = Date.now();
  const executionInput = await buildExecutionInput(options.messages, finalExecutionBrief, options.executionPlan);
  const continuationInput = await buildExecutionInput(
    options.messages,
    finalExecutionBrief,
    options.executionPlan,
    "continue"
  );
  emitTrace(options.callbacks, {
    sessionId: options.sessionId,
    stage: "execution-start",
    message: "Starting main pi execution",
    modelId: executionModelId
  });

  const originalRequest = {
    kind: "executor" as const,
    cwd: options.cwd,
    modelId: executionModelId,
    prompt: executionInput.prompt,
    images: executionInput.images,
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
      images: continuationInput.images
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

async function listChangedFiles(cwd: string) {
  const tracked = await runShellCommand(cwd, "git diff --name-only --relative");
  const untracked = await runShellCommand(cwd, "git ls-files --others --exclude-standard");
  return [...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)].map((value) => value.trim()).filter(Boolean);
}

async function runShellCommand(cwd: string, command: string, abortSignal?: AbortSignal) {
  const proc = Bun.spawn({
    cmd: ["powershell", "-NoProfile", "-Command", command],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: abortSignal
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `${command} failed`);
  }

  return stdout.trim();
}

function resolveContractsForTask(taskId: string, contracts: SubagentContract[]) {
  const contractIds = taskId.split("+");
  const matchingContracts = contracts.filter((contract) => contractIds.includes(contract.taskId));
  return matchingContracts.length > 0 ? matchingContracts : contracts.filter((contract) => contract.taskId === taskId);
}

function isPathWithinScope(relativePath: string, ownedPath: string) {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const normalizedOwnedPath = ownedPath.replace(/\\/g, "/");
  return (
    normalizedRelativePath === normalizedOwnedPath ||
    normalizedRelativePath.startsWith(`${normalizedOwnedPath}/`) ||
    normalizedOwnedPath === "(planner-unspecified)"
  );
}

export async function aggregateSubagentResults(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    sessionId: string;
    messages: ChatMessage[];
    executionPlan?: ExecutionPlan;
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
  const executionInput = await buildExecutionInput(options.messages, finalExecutionBrief, options.executionPlan);
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

export function buildExecutionPrompt(messages: ChatMessage[], finalExecutionBrief: string, executionPlan?: ExecutionPlan) {
  return [
    "You are the execution stage for a local coding harness.",
    "Use the available coding tools when needed and respond with the final assistant answer only.",
    "",
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
    "",
    "Conversation transcript:",
    formatMessages(messages),
    "",
    `Execution brief: ${finalExecutionBrief}`
  ].filter(Boolean).join("\n");
}

function buildContinuationPrompt(prefix: string, messages: ChatMessage[], finalExecutionBrief: string, executionPlan?: ExecutionPlan) {
  return [prefix, "", buildExecutionPrompt(messages, finalExecutionBrief, executionPlan)].join("\n");
}

async function buildExecutionInput(
  messages: ChatMessage[],
  finalExecutionBrief: string,
  executionPlan?: ExecutionPlan,
  prefix?: string
) {
  const attachmentContext = await buildPromptAttachmentContext(messages);
  const prompt = [
    prefix,
    prefix ? "" : undefined,
    [
      "You are the execution stage for a local coding harness.",
      "Use the available coding tools when needed and respond with the final assistant answer only.",
      "",
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
      "",
      "Conversation transcript:",
      attachmentContext.transcript,
      "",
      `Execution brief: ${finalExecutionBrief}`
    ]
      .filter(Boolean)
      .join("\n")
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prompt,
    images: attachmentContext.images
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
              contract.ownedPaths.length > 0 ? `Owned paths: ${contract.ownedPaths.join(", ")}` : "",
              contract.verificationCommands.length > 0 ? `Verify with: ${contract.verificationCommands.join(" && ")}` : ""
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
  const targetSubagentCount = contracts.length === 0 ? 0 : getTargetSubagentCount(input.plannerResult.difficultyScore);
  const actualSubagentCount =
    targetSubagentCount < 2 ? 0 : getActualSubagentCount(contracts, targetSubagentCount, input.subagentWorktreeStrategy);

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
    subagentWorktreeStrategy: input.subagentWorktreeStrategy,
    targetSubagentCount,
    actualSubagentCount: actualSubagentCount > 1 ? actualSubagentCount : 0,
    gating: {
      mode: input.planExecutionMode,
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
  const totalEffort = prepared.reduce((sum, contract) => sum + contract.effortPoints, 0);
  const targetEffort = totalEffort / bucketCount;
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
    currentEffort += contract.effortPoints;
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

  const effortPerBucket = buckets.map((bucket) => bucket.reduce((sum, contract) => sum + contract.effortPoints, 0));
  const mean = effortPerBucket.reduce((sum, value) => sum + value, 0) / effortPerBucket.length;
  return effortPerBucket.every((value) => Math.abs(value - mean) <= Math.max(1, mean * 0.25));
}

function hasDisjointOwnedPaths(buckets: SubagentContract[][]) {
  const ownedPathSets = buckets.map((bucket) =>
    bucket.flatMap((contract) => contract.ownedPaths).filter((value) => value !== "(planner-unspecified)")
  );

  for (let leftIndex = 0; leftIndex < ownedPathSets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ownedPathSets.length; rightIndex += 1) {
      if (pathsOverlap(ownedPathSets[leftIndex]!, ownedPathSets[rightIndex]!)) {
        return false;
      }
    }
  }

  return true;
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
