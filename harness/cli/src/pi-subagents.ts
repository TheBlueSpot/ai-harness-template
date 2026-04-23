import type { AgentId, AgentTrace, ComposerReasoningStrength, PlannerSubtask, ProjectContextUsage, ProviderBrand } from "../../shared/protocol";
import type { ManagedExecutionState } from "./execution-runtime";
import { BranchfsManager, type BranchfsExperimentLease } from "./branchfs-manager";
import { debugLog } from "./logging";
import { runManagedAgentExecution } from "./managed-agent-execution";
import type { PiAgentAdapter, PiAgentExecutionEvent } from "./pi-agent-adapter";
import { resolveSubagentModelId, resolveSubagentReasoningStrength } from "./subagent-defaults";
import { createMilestoneDeltaParser, extractMilestoneLines, stripMilestoneLines } from "./run-milestone-windows";
import {
  buildSubagentEnvironmentBrief,
  discoverRepoSkillPaths,
  resolveRepoRoot,
  SUBAGENT_MILESTONE_INSTRUCTION
} from "./subagent-environment";

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
  contractDriftPaths?: string[];
};

export type SubagentProgressCallbacks = {
  onStart?: (task: PlannerSubtask, attempt: number) => void;
  onRetry?: (task: PlannerSubtask, attempt: number, error: Error) => void;
  onComplete?: (task: PlannerSubtask, output: string, durationMs: number) => void;
  onError?: (task: PlannerSubtask, error: Error) => void;
  onSettled?: (result: SubagentResult) => void | Promise<void>;
  onMilestone?: (task: PlannerSubtask, line: string) => void;
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

export type BranchfsSubagentSnapshot = {
  taskId: string;
  manager: BranchfsManager;
  lease: BranchfsExperimentLease;
};

export type SubagentVerificationInput = {
  task: PlannerSubtask;
  mountPath: string;
  worktreePath: string;
  output: string;
  attemptCount: number;
  abortSignal?: AbortSignal;
};

type ScheduledTaskEntry<Task> = {
  order: number;
  task: Task;
};

export const MAX_SUBAGENT_CONCURRENCY = 4;

export async function scheduleSubagentTasks<Task, Result extends { id: string }, Snapshot>(
  options: {
    tasks: Task[];
    maxConcurrency?: number;
    getTaskId: (task: Task) => string;
    canStart?: (task: Task, activeTasks: Task[]) => boolean;
    executeTask: (task: Task) => Promise<{ result: Result; retainedSnapshot?: Snapshot }>;
    onSettled?: (task: Task, result: Result) => void | Promise<void>;
    scheduleRetry?: (task: Task, result: Result) => Task | undefined | Promise<Task | undefined>;
  }
) {
  const queue = options.tasks.map((task, order) => ({ order, task }));
  const orderById = new Map(queue.map((entry) => [options.getTaskId(entry.task), entry.order]));
  const active = new Map<string, ScheduledTaskEntry<Task>>();
  const results = new Map<string, Result>();
  const retainedSnapshots = new Map<string, Snapshot>();
  const waiters: Array<() => void> = [];
  let fatalError: Error | undefined;

  const signal = () => {
    while (waiters.length > 0) {
      waiters.shift()?.();
    }
  };

  const waitForSignal = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
    });

  const dequeueNext = () => {
    const activeTasks = [...active.values()].map((entry) => entry.task);
    for (let index = 0; index < queue.length; index += 1) {
      const entry = queue[index];
      if (options.canStart && !options.canStart(entry.task, activeTasks)) {
        continue;
      }

      queue.splice(index, 1);
      active.set(options.getTaskId(entry.task), entry);
      return entry;
    }

    return undefined;
  };

  const workers = Array.from({ length: Math.min(options.maxConcurrency ?? MAX_SUBAGENT_CONCURRENCY, queue.length) }, async () => {
    while (!fatalError) {
      const entry = dequeueNext();
      if (!entry) {
        if (active.size === 0 && queue.length === 0) {
          return;
        }

        await waitForSignal();
        continue;
      }

      const taskId = options.getTaskId(entry.task);
      try {
        const execution = await options.executeTask(entry.task);
        results.set(taskId, execution.result);
        if (execution.retainedSnapshot) {
          retainedSnapshots.set(taskId, execution.retainedSnapshot);
        } else {
          retainedSnapshots.delete(taskId);
        }

        await options.onSettled?.(entry.task, execution.result);
        const retryTask = await options.scheduleRetry?.(entry.task, execution.result);
        if (retryTask) {
          queue.push({
            order: orderById.get(taskId) ?? entry.order,
            task: retryTask
          });
        }
      } catch (error) {
        fatalError = error instanceof Error ? error : new Error("Subagent scheduler failed");
      } finally {
        active.delete(taskId);
        signal();
      }
    }
  });

  await Promise.all(workers);
  if (fatalError) {
    throw fatalError;
  }

  const sortedResults = [...results.values()].sort(
    (left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0)
  );
  const sortedSnapshots = [...retainedSnapshots.entries()]
    .sort((left, right) => (orderById.get(left[0]) ?? 0) - (orderById.get(right[0]) ?? 0))
    .map(([, snapshot]) => snapshot);

  return {
    results: sortedResults,
    retainedSnapshots: sortedSnapshots
  };
}

export async function executeSubagents(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    agentId?: AgentId;
    providerBrand: ProviderBrand;
    brief: string;
    tasks: PlannerSubtask[];
    debugEnabled: boolean;
    executionModelId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal?: AbortSignal;
    verifyResult?: (input: SubagentVerificationInput) => Promise<string[] | void>;
    recoveryPrompt?: (input: { task: PlannerSubtask; result: SubagentResult }) => string;
    callbacks?: SubagentProgressCallbacks;
  }
): Promise<{ results: SubagentResult[]; retainedSnapshots: BranchfsSubagentSnapshot[] }> {
  return scheduleSubagentTasks<
    {
      task: PlannerSubtask;
      startingAttempt: number;
      recoveryAttempt: number;
      recoveryPrompt?: string;
    },
    SubagentResult,
    BranchfsSubagentSnapshot
  >({
    tasks: options.tasks.map((task) => ({
      task,
      startingAttempt: 1,
      recoveryAttempt: 0,
      recoveryPrompt: undefined as string | undefined
    })),
    maxConcurrency: MAX_SUBAGENT_CONCURRENCY,
    getTaskId(entry) {
      return entry.task.id;
    },
    async executeTask(entry) {
      return executeSubagentWithRetry(adapter, options.providerBrand, entry, options.brief, {
        runId: options.runId,
        agentId: options.agentId,
        rootPath: options.cwd,
        abortSignal: options.abortSignal,
        callbacks: options.callbacks,
        executionModelId: options.executionModelId,
        debugEnabled: options.debugEnabled,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        verifyResult: options.verifyResult
      });
    },
    async onSettled(_entry, result) {
      await options.callbacks?.onSettled?.(result);
    },
    scheduleRetry(entry, result) {
      if (result.status !== "failed" || entry.recoveryAttempt > 0 || options.abortSignal?.aborted) {
        return undefined;
      }

      const recoveryPrompt = options.recoveryPrompt?.({
        task: entry.task,
        result
      });
      if (!recoveryPrompt?.trim()) {
        return undefined;
      }

      options.callbacks?.onRetry?.(
        entry.task,
        result.attemptCount + 1,
        new Error(result.errorMessage ?? "Unknown subagent failure")
      );
      return {
        task: entry.task,
        startingAttempt: result.attemptCount + 1,
        recoveryAttempt: entry.recoveryAttempt + 1,
        recoveryPrompt
      };
    }
  });
}

async function executeSubagentWithRetry(
  adapter: PiAgentAdapter,
  providerBrand: ProviderBrand,
  queuedTask: {
    task: PlannerSubtask;
    startingAttempt: number;
    recoveryAttempt: number;
    recoveryPrompt?: string;
  },
  brief: string,
  options: {
    runId: string;
    agentId?: AgentId;
    rootPath: string;
    abortSignal: AbortSignal | undefined;
    callbacks: SubagentProgressCallbacks | undefined;
    executionModelId: string;
    debugEnabled: boolean;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    verifyResult?: (input: SubagentVerificationInput) => Promise<string[] | void>;
  }
): Promise<{ result: SubagentResult; retainedSnapshot?: BranchfsSubagentSnapshot }> {
  const task = queuedTask.task;
  let attempt = 0;
  const dequeuedAt = Date.now();

  while (true) {
    attempt += 1;
    const effectiveAttempt = queuedTask.startingAttempt + attempt - 1;
    const startedAt = Date.now();
    if (attempt === 1) {
      options.callbacks?.onStart?.(task, effectiveAttempt);
    }

    const worktreePrepareStartedAt = Date.now();
    const manager = new BranchfsManager(
      {
        rootPath: options.rootPath,
        runId: `${options.runId}-${task.id}-attempt-${attempt}`
      },
      {
        onTrace(trace) {
          options.callbacks?.onTrace?.(trace);
        }
      }
    );
    const lease = await manager.prepareExperimentLease();
    const worktreeReadyAt = Date.now();
    let settledExecutionState: ManagedExecutionState | undefined;
    try {
      const subagentModelId = resolveSubagentModelId({
        agentId: options.agentId,
        providerBrand,
        executionModelId: options.executionModelId
      });
      const subagentReasoningStrength = resolveSubagentReasoningStrength(options.reasoningStrength);
      const repoRoot = resolveRepoRoot(options.rootPath);
      const availableSkillPaths = discoverRepoSkillPaths(repoRoot);
      const basePrompt = buildSubagentPrompt({
        brief,
        environmentBrief: buildSubagentEnvironmentBrief({
          projectRoot: lease.projectMountPath,
          repoRoot: lease.repoMountPath,
          relativeProjectRoot: lease.projectRelativePath,
          availableSkillPaths
        }),
        task,
        recoveryPrompt: queuedTask.recoveryPrompt
      });
      const milestoneParser = createMilestoneDeltaParser((line) => options.callbacks?.onMilestone?.(task, line));
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: task.id,
        originalRequest: {
          kind: "subagent",
          cwd: lease.projectMountPath,
          modelId: subagentModelId,
          prompt: basePrompt,
          reasoningStrength: subagentReasoningStrength,
          fastMode: options.fastMode,
          onTextDelta(delta: string) {
            milestoneParser.push(delta);
          },
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
          cwd: lease.projectMountPath,
          modelId: subagentModelId,
          prompt: ["continue", "", basePrompt].join("\n"),
          reasoningStrength: subagentReasoningStrength,
          fastMode: options.fastMode,
          onTextDelta(delta: string) {
            milestoneParser.push(delta);
          },
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
      milestoneParser.flush();
      if (!milestoneParser.hasEmitted()) {
        for (const line of extractMilestoneLines(response.text)) {
          options.callbacks?.onMilestone?.(task, line);
        }
      }
      const output = stripMilestoneLines(response.text);
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
      const contractDriftPaths = await options.verifyResult?.({
        task,
        mountPath: lease.projectMountPath,
        worktreePath: lease.projectMountPath,
        output,
        attemptCount: effectiveAttempt,
        abortSignal: options.abortSignal
      });
      emitSpawnTiming(options.callbacks, task, {
        dequeuedAt,
        worktreePrepareStartedAt,
        worktreeReadyAt,
        sessionCreatedAt: settledExecutionState?.spawnTiming?.sessionCreatedAt,
        firstActivityAt: settledExecutionState?.spawnTiming?.firstActivityAt,
        firstToolStartAt: settledExecutionState?.spawnTiming?.firstToolStartAt,
        completedAt: Date.now()
      });
      options.callbacks?.onComplete?.(task, output, Date.now() - startedAt);
      return {
        result: {
          id: task.id,
          title: task.title,
          instruction: task.instruction,
          status: "completed",
          output,
          attemptCount: effectiveAttempt,
          durationMs: Date.now() - startedAt,
          mountPath: lease.projectMountPath,
          worktreePath: lease.projectMountPath,
          contextUsage: response.contextUsage
            ? {
                sourceKind: "subagent",
                sourceLabel: task.id,
                modelId: subagentModelId,
                tokens: response.contextUsage.tokens,
                contextWindow: response.contextUsage.contextWindow,
                usagePercent: response.contextUsage.usagePercent,
                totalProcessedTokens: response.contextUsage.sessionStats.tokens.total,
                updatedAt: new Date().toISOString()
              }
            : undefined,
          contractDriftPaths: contractDriftPaths && contractDriftPaths.length > 0 ? contractDriftPaths : undefined
        },
        retainedSnapshot: {
          taskId: task.id,
          manager,
          lease
        }
      };
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error("Unknown subagent failure");
      if (isAbortError(typedError, options.abortSignal)) {
        if (!options.debugEnabled) {
          await manager.discardExperiment(lease).catch(() => undefined);
        }
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
        return {
          result: {
            id: task.id,
            title: task.title,
            instruction: task.instruction,
            status: "failed",
            errorMessage: typedError.message,
            attemptCount: effectiveAttempt,
            durationMs: Date.now() - startedAt,
            mountPath: options.debugEnabled ? lease.projectMountPath : undefined,
            worktreePath: options.debugEnabled ? lease.projectMountPath : undefined
          }
        };
      }

      options.callbacks?.onRetry?.(task, effectiveAttempt + 1, typedError);
      await manager.discardExperiment(lease).catch(() => undefined);
    }
  }
}

function isTransientError(error: Error) {
  const value = error.message.toLowerCase();
  return ["timeout", "temporar", "429", "rate limit", "overload", "network", "socket", "econn", "reset"].some(
    (token) => value.includes(token)
  );
}

export function buildSubagentPrompt(input: { brief: string; task: PlannerSubtask; recoveryPrompt?: string; environmentBrief?: string }) {
  return [
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
    input.recoveryPrompt?.trim() ? input.recoveryPrompt.trim() : "",
    input.environmentBrief?.trim() ? input.environmentBrief.trim() : "",
    "",
    `Shared brief: ${input.brief}`,
    `Subtask title: ${input.task.title}`,
    `Subtask instruction: ${input.task.instruction}`
  ].join("\n");
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
