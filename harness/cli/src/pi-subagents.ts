import type { AgentTrace, PlannerSubtask, ProjectContextUsage, ProviderBrand } from "../../shared/protocol";
import { GitWorktreeManager } from "./git-worktree-manager";
import { getDefaultSubagentModelId } from "./pi-planner";
import type { PiAgentAdapter } from "./pi-agent-adapter";

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
    abortSignal: AbortSignal | undefined;
    callbacks: SubagentProgressCallbacks | undefined;
    executionModelId: string;
    debugEnabled: boolean;
  }
): Promise<SubagentResult> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    const startedAt = Date.now();
    if (attempt === 1) {
      options.callbacks?.onStart?.(task);
    }

    const lease = await manager.prepareSubagentLease(task.id);
    try {
      const response = await adapter.runPrompt({
        kind: "subagent",
        cwd: lease.worktreePath,
        modelId: getDefaultSubagentModelId(providerBrand),
        prompt: [
          "You are a focused coding subagent.",
          "Complete only the assigned instruction.",
          "Return concise, implementation-focused output.",
          "",
          `Shared brief: ${brief}`,
          `Subtask title: ${task.title}`,
          `Subtask instruction: ${task.instruction}`
        ].join("\n"),
        abortSignal: options.abortSignal
      });
      if (response.contextUsage) {
        options.callbacks?.onContextUsage?.(task, {
          sourceKind: "subagent",
          sourceLabel: task.id,
          modelId: getDefaultSubagentModelId(providerBrand),
          tokens: response.contextUsage.tokens,
          contextWindow: response.contextUsage.contextWindow,
          usagePercent: response.contextUsage.usagePercent,
          updatedAt: new Date().toISOString()
        });
      }

      const commit = await manager.finalizeSubagentLease(lease);
      await manager.cleanupSubagentLease(lease);
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
        worktreePath: commit.worktreePath,
        contextUsage: response.contextUsage
          ? {
              sourceKind: "subagent",
              sourceLabel: task.id,
              modelId: getDefaultSubagentModelId(providerBrand),
              tokens: response.contextUsage.tokens,
              contextWindow: response.contextUsage.contextWindow,
              usagePercent: response.contextUsage.usagePercent,
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
