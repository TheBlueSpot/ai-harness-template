import type { AgentTrace, PlannerSubtask, ProjectContextUsage, ProviderBrand } from "../../shared/protocol";
import type { ManagedExecutionState } from "./execution-runtime";
import { GitWorktreeManager } from "./git-worktree-manager";
import { debugLog } from "./logging";
import { runManagedAgentExecution } from "./managed-agent-execution";
import { getDefaultSubagentModelId } from "./pi-planner";
import type { PiAgentAdapter, PiAgentExecutionEvent } from "./pi-agent-adapter";

export type SubagentResult = {
  id: string;
  title: string;
  instruction: string;
  status: "completed" | "failed";
  output?: string;
  errorMessage?: string;
  attemptCount: number;
  durationMs: number;
  commitSha?: string;
  branchName?: string;
  mountPath?: string;
  worktreePath?: string;
  contextUsage?: ProjectContextUsage;
};

export type SubagentProgressCallbacks = {
  onStart?: (task: PlannerSubtask) => void;
  onRetry?: (task: PlannerSubtask, attempt: number, error: Error) => void;
  onComplete?: (task: PlannerSubtask, output: string, durationMs: number) => void;
  onError?: (task: PlannerSubtask, error: Error) => void;
  onContextUsage?: (task: PlannerSubtask, contextUsage: ProjectContextUsage) => void;
  onTrace?: (trace: Pick<AgentTrace, "stage" | "message" | "detail" | "subagentId">) => void;
  setExecutionState?: (state: ManagedExecutionState) => void;
  getExecutionState?: (input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) => ManagedExecutionState | undefined;
  clearExecutionState?: (input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) => void;
  onExecutionEvent?: (input: { owner: "subagent"; subagentId: string; event: PiAgentExecutionEvent }) => void | Promise<void>;
  requestBrowserApproval?: (input: {
    owner: "subagent";
    subagentId: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
  }) => Promise<{ approved: boolean }>;
};

const MAX_CONCURRENCY = 4;

export async function executeSubagents(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    providerBrand: ProviderBrand;
    brief: string;
    tasks: PlannerSubtask[];
    debugEnabled: boolean;
    executionModelId: string;
    abortSignal?: AbortSignal;
    callbacks?: SubagentProgressCallbacks;
  }
): Promise<SubagentResult[]> {
  const queue = [...options.tasks];
  const results: SubagentResult[] = [];
  const manager = new GitWorktreeManager(
    {
      rootPath: options.cwd,
      runId: options.runId,
      debugEnabled: options.debugEnabled,
      executionModelId: options.executionModelId
    },
    {
      onTrace(trace) {
        options.callbacks?.onTrace?.(trace);
      }
    }
  );

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) {
        return;
      }

      const result = await executeSubagentWithRetry(adapter, manager, options.providerBrand, task, options.brief, {
        runId: options.runId,
        abortSignal: options.abortSignal,
        callbacks: options.callbacks,
        executionModelId: options.executionModelId,
        debugEnabled: options.debugEnabled
      });
      results.push(result);
    }
  });

  await Promise.all(workers);
  const order = new Map(options.tasks.map((task, index) => [task.id, index]));
  return results.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

async function executeSubagentWithRetry(
  adapter: PiAgentAdapter,
  manager: GitWorktreeManager,
  providerBrand: ProviderBrand,
  task: PlannerSubtask,
  brief: string,
  options: {
    runId: string;
    abortSignal: AbortSignal | undefined;
    callbacks: SubagentProgressCallbacks | undefined;
    executionModelId: string;
    debugEnabled: boolean;
  }
): Promise<SubagentResult> {
  let attempt = 0;
  const dequeuedAt = Date.now();

  while (true) {
    attempt += 1;
    const startedAt = Date.now();
    if (attempt === 1) {
      options.callbacks?.onStart?.(task);
    }

    const worktreePrepareStartedAt = Date.now();
    const lease = await manager.prepareSubagentLease(task.id);
    const worktreeReadyAt = Date.now();
    let settledExecutionState: ManagedExecutionState | undefined;
    try {
      const subagentModelId = getDefaultSubagentModelId(providerBrand);
      const basePrompt = [
        "You are a focused coding subagent.",
        "Complete only the assigned instruction.",
        "Return concise, implementation-focused output.",
        "",
        `Shared brief: ${brief}`,
        `Subtask title: ${task.title}`,
        `Subtask instruction: ${task.instruction}`
      ].join("\n");
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: task.id,
        originalRequest: {
          kind: "subagent",
          cwd: lease.worktreePath,
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
          cwd: lease.worktreePath,
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
        store: createExecutionStore(options.callbacks, options.runId, task.id, {
          dequeuedAt,
          worktreePrepareStartedAt,
          worktreeReadyAt
        }),
        onSettledState(state) {
          settledExecutionState = state;
        },
        onRefreshComplete(mode) {
          options.callbacks?.onTrace?.({
            stage: "refresh-complete",
            message: `Refresh complete for ${task.title} (${mode})`,
            subagentId: task.id
          });
        }
      });
      if (response.contextUsage) {
        options.callbacks?.onContextUsage?.(task, {
          sourceKind: "subagent",
          sourceLabel: task.id,
          modelId: subagentModelId,
          tokens: response.contextUsage.tokens,
          contextWindow: response.contextUsage.contextWindow,
          usagePercent: response.contextUsage.usagePercent,
          totalProcessedTokens: response.contextUsage.sessionStats.tokens.total,
          updatedAt: new Date().toISOString()
        });
      }

      const commit = await manager.finalizeSubagentLease(lease);
      await manager.cleanupSubagentLease(lease);
      emitSpawnTiming(options.callbacks, task, {
        dequeuedAt,
        worktreePrepareStartedAt,
        worktreeReadyAt,
        sessionCreatedAt: settledExecutionState?.spawnTiming?.sessionCreatedAt,
        firstActivityAt: settledExecutionState?.spawnTiming?.firstActivityAt,
        firstToolStartAt: settledExecutionState?.spawnTiming?.firstToolStartAt,
        completedAt: Date.now()
      });
      options.callbacks?.onComplete?.(task, response.text, Date.now() - startedAt);
      return {
        id: task.id,
        title: task.title,
        instruction: task.instruction,
        status: "completed",
        output: response.text.trim(),
        attemptCount: attempt,
        durationMs: Date.now() - startedAt,
        commitSha: commit.commitSha,
        branchName: commit.branchName,
        mountPath: commit.worktreePath,
        worktreePath: commit.worktreePath,
        contextUsage: response.contextUsage
          ? {
              sourceKind: "subagent",
              sourceLabel: task.id,
              modelId: getDefaultSubagentModelId(providerBrand),
              tokens: response.contextUsage.tokens,
              contextWindow: response.contextUsage.contextWindow,
              usagePercent: response.contextUsage.usagePercent,
              totalProcessedTokens: response.contextUsage.sessionStats.tokens.total,
              updatedAt: new Date().toISOString()
            }
          : undefined
      };
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error("Unknown subagent failure");
      if (isAbortError(typedError, options.abortSignal)) {
        await manager.cleanupSubagentLease(lease, { preserveWorktree: options.debugEnabled });
        throw typedError;
      }

      if (!isTransientError(typedError) || attempt > 1) {
        emitSpawnTiming(options.callbacks, task, {
          dequeuedAt,
          worktreePrepareStartedAt,
          worktreeReadyAt,
          sessionCreatedAt: settledExecutionState?.spawnTiming?.sessionCreatedAt,
          firstActivityAt: settledExecutionState?.spawnTiming?.firstActivityAt,
          firstToolStartAt: settledExecutionState?.spawnTiming?.firstToolStartAt,
          failedAt: Date.now()
        });
        options.callbacks?.onError?.(task, typedError);
        await manager.cleanupSubagentLease(lease, { preserveWorktree: options.debugEnabled });
        return {
          id: task.id,
          title: task.title,
          instruction: task.instruction,
          status: "failed",
          errorMessage: typedError.message,
          attemptCount: attempt,
          durationMs: Date.now() - startedAt,
          branchName: lease.branchName,
          mountPath: options.debugEnabled ? lease.worktreePath : undefined,
          worktreePath: options.debugEnabled ? lease.worktreePath : undefined
        };
      }

      options.callbacks?.onRetry?.(task, attempt, typedError);
      await manager.cleanupSubagentLease(lease);
    }
  }
}

function isTransientError(error: Error) {
  const value = error.message.toLowerCase();
  return ["timeout", "temporar", "429", "rate limit", "overload", "network", "socket", "econn", "reset"].some(
    (token) => value.includes(token)
  );
}

function isAbortError(error: Error, abortSignal: AbortSignal | undefined) {
  return abortSignal?.aborted === true || error.message.toLowerCase().includes("abort");
}

function createExecutionStore(
  callbacks: SubagentProgressCallbacks | undefined,
  runId: string,
  subagentId: string,
  seedTiming: NonNullable<ManagedExecutionState["spawnTiming"]>
) {
  return {
    getState() {
      return callbacks?.getExecutionState?.({
        runId,
        kind: "subagent",
        subagentId
      });
    },
    setState(state: ManagedExecutionState) {
      const current = callbacks?.getExecutionState?.({
        runId,
        kind: "subagent",
        subagentId
      });
      const nextState = {
        ...state,
        spawnTiming: {
          ...seedTiming,
          ...current?.spawnTiming,
          ...state.spawnTiming
        }
      };
      callbacks?.setExecutionState?.(nextState);
    },
    clearState() {
      callbacks?.clearExecutionState?.({
        runId,
        kind: "subagent",
        subagentId
      });
    }
  };
}

function emitSpawnTiming(
  callbacks: SubagentProgressCallbacks | undefined,
  task: PlannerSubtask,
  timing: {
    dequeuedAt: number;
    worktreePrepareStartedAt: number;
    worktreeReadyAt: number;
    sessionCreatedAt?: number;
    firstActivityAt?: number;
    firstToolStartAt?: number;
    completedAt?: number;
    failedAt?: number;
  }
) {
  const endAt = timing.completedAt ?? timing.failedAt ?? Date.now();
  const detail = [
    `queue=${Math.max(0, timing.worktreePrepareStartedAt - timing.dequeuedAt)}ms`,
    `provision=${Math.max(0, timing.worktreeReadyAt - timing.worktreePrepareStartedAt)}ms`,
    `session=${timing.sessionCreatedAt ? Math.max(0, timing.sessionCreatedAt - timing.worktreeReadyAt) : "?"}ms`,
    `first-activity=${timing.firstActivityAt ? Math.max(0, timing.firstActivityAt - (timing.sessionCreatedAt ?? timing.worktreeReadyAt)) : "?"}ms`,
    `first-tool=${timing.firstToolStartAt ? Math.max(0, timing.firstToolStartAt - timing.worktreeReadyAt) : "?"}ms`,
    `total=${Math.max(0, endAt - timing.dequeuedAt)}ms`
  ].join(" ");

  debugLog("subagent.spawn", {
    taskId: task.id,
    detail
  });
  callbacks?.onTrace?.({
    stage: "subagent-spawn-timing",
    message: `Spawn timing for ${task.title}`,
    detail,
    subagentId: task.id
  });
}
