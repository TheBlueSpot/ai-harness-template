import { describe, expect, test } from "bun:test";
import type { PlannerSubtask } from "../../shared/protocol";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import {
  canRunSameWorktreeTask,
  isPathWithinSameWorktreeScope,
  orderSameWorktreeTasks,
  sameWorktreeOwnedPathsOverlap,
  type TaskContractSettings
} from "./pi-orchestrator";
import { buildSubagentPrompt, executeSubagents, scheduleSubagentTasks, type SubagentResult } from "./pi-subagents";
import { buildSubagentEnvironmentBrief } from "./subagent-environment";
import { WorkspaceRepository } from "./workspace-repository";

type ScopedTask = {
  task: PlannerSubtask;
  contractSettings: TaskContractSettings;
  recoveryAttempt: number;
};

describe("subagent scheduler", () => {
  test("builds implementation-worker prompts for isolated subagents", () => {
    const prompt = buildSubagentPrompt({
      brief: "Build the feature",
      environmentBrief: buildSubagentEnvironmentBrief({
        projectRoot: "C:\\repo\\context",
        repoRoot: "C:\\repo",
        availableSkillPaths: [".agents/skills/caveman/SKILL.md"]
      }),
      recoveryPrompt: "Recovery attempt. Focus on the previous failure cause.",
      task: {
        id: "task-1",
        title: "Create module",
        instruction: "Create src/new-module.ts and wire src/index.ts"
      }
    });

    expect(prompt).toContain("focused implementation subagent");
    expect(prompt).toContain("Start in the provided cwd");
    expect(prompt).toContain("Create missing directories and the first listed missing file immediately");
    expect(prompt).toContain("Return a concise changed-file summary.");
    expect(prompt).toContain("Do not run browser, Playwright, dev server");
    expect(prompt).toContain("PowerShell-compatible syntax");
    expect(prompt).toContain("Prefer bundled rg");
    expect(prompt).toContain("MILESTONE:");
    expect(prompt).toContain("Execution cwd: C:\\repo\\context");
    expect(prompt).toContain("Repository root: C:\\repo");
    expect(prompt).toContain("Git repository state:");
    expect(prompt).toContain("This project may be nested inside the repo.");
    expect(prompt).toContain("Repo-level files such as AGENTS.md and .agents live at repo root.");
    expect(prompt).toContain(".ai-harness-template");
    expect(prompt).toContain(".agents/skills/caveman/SKILL.md");
    expect(prompt).not.toContain(".agents/skills/.system");
    expect(prompt).toContain("Test-Path .\\tower-hologram");
    expect(prompt).toContain("stable meaning");
    expect(prompt).toContain("Do not run ffmpeg -version unless the task explicitly asks");
    expect(prompt).toContain("Recovery attempt. Focus on the previous failure cause.");
    expect(prompt).not.toContain("Verification commands:");
  });

  test("same-worktree dependency roots sort before sibling tasks", () => {
    const ordered = orderSameWorktreeTasks(
      [
        { id: "task-b", title: "HUD", instruction: "Wire HUD" },
        { id: "task-a", title: "Shell", instruction: "Create shell" }
      ],
      [
        {
          taskId: "task-b",
          title: "HUD",
          instruction: "Wire HUD",
          effortPoints: 2,
          ownedPaths: ["src/HUD.js"],
          dependsOnPrerequisiteIds: [],
          deliverables: ["HUD"],
          integrationPoints: ["src/main.js"],
          verificationScope: "owned-files-only",
          verificationCommands: [],
          mergeNotes: "merge hud"
        },
        {
          taskId: "task-a",
          title: "Shell",
          instruction: "Create shell",
          effortPoints: 3,
          ownedPaths: ["index.html", "src/main.js"],
          dependsOnPrerequisiteIds: [],
          deliverables: ["shell"],
          integrationPoints: ["index.html"],
          verificationScope: "owned-files-only",
          verificationCommands: [],
          mergeNotes: "merge shell"
        }
      ]
    );

    expect(ordered.map((task) => task.id)).toEqual(["task-a", "task-b"]);
  });

  test("same-worktree disjoint owned paths run in parallel", async () => {
    const release = createReleaseMap(["task-a", "task-b"]);
    const starts: string[] = [];
    let activeCount = 0;
    let maxActiveCount = 0;

    const run = scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [
        createScopedTask("task-a", ["src/a.ts"]),
        createScopedTask("task-b", ["src/b.ts"])
      ],
      getTaskId(entry) {
        return entry.task.id;
      },
      canStart: canRunSameWorktreeTask,
      async executeTask(entry) {
        starts.push(entry.task.id);
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await release.wait(entry.task.id);
        activeCount -= 1;
        return {
          result: createResult(entry.task.id, "completed")
        };
      }
    });

    await waitFor(() => starts.length === 2);
    expect(maxActiveCount).toBe(2);

    release.release("task-a");
    release.release("task-b");
    await run;
  });

  test("planner-unspecified scope forces exclusive same-worktree execution", async () => {
    const release = createReleaseMap(["task-a", "task-b"]);
    const starts: string[] = [];

    const run = scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [
        createScopedTask("task-a", [], true),
        createScopedTask("task-b", ["src/b.ts"])
      ],
      getTaskId(entry) {
        return entry.task.id;
      },
      canStart: canRunSameWorktreeTask,
      async executeTask(entry) {
        starts.push(entry.task.id);
        await release.wait(entry.task.id);
        return {
          result: createResult(entry.task.id, "completed")
        };
      }
    });

    await waitFor(() => starts.length === 1);
    expect(starts).toEqual(["task-a"]);

    release.release("task-a");
    await waitFor(() => starts.length === 2);
    expect(starts).toEqual(["task-a", "task-b"]);

    release.release("task-b");
    await run;
  });

  test("overlapping same-worktree tasks queue while disjoint work continues", async () => {
    const release = createReleaseMap(["task-a", "task-b", "task-c"]);
    const starts: string[] = [];

    const run = scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [
        createScopedTask("task-a", ["src"]),
        createScopedTask("task-b", ["src/components"]),
        createScopedTask("task-c", ["docs"])
      ],
      getTaskId(entry) {
        return entry.task.id;
      },
      canStart: canRunSameWorktreeTask,
      async executeTask(entry) {
        starts.push(entry.task.id);
        await release.wait(entry.task.id);
        return {
          result: createResult(entry.task.id, "completed")
        };
      }
    });

    await waitFor(() => starts.length === 2);
    expect(starts).toEqual(["task-a", "task-c"]);

    release.release("task-c");
    await Bun.sleep(20);
    expect(starts).toEqual(["task-a", "task-c"]);

    release.release("task-a");
    await waitFor(() => starts.length === 3);
    expect(starts).toEqual(["task-a", "task-c", "task-b"]);

    release.release("task-b");
    await run;
  });

  test("parallel subagents reserve turns without exceeding max budget", async () => {
    const repository = new WorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
    const project = repository.addProject(process.cwd());
    const run = repository.createAgentRun(project.id, "parallel budget", "openai/gpt-5.4", project.activeThreadId, 2).activeRun!;

    await scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [createScopedTask("task-a", ["src/a.ts"]), createScopedTask("task-b", ["src/b.ts"])],
      getTaskId(entry) {
        return entry.task.id;
      },
      async executeTask(entry) {
        repository.reserveAgentRunTurn(project.id, run.id);
        return { result: createResult(entry.task.id, "completed") };
      }
    });

    expect(repository.getRun(project.id, run.id)?.runtimeBudget).toMatchObject({
      maxTurns: 2,
      turnsUsed: 2,
      remainingTurns: 0,
      exhausted: true
    });
    expect(() => repository.reserveAgentRunTurn(project.id, run.id)).toThrow("turn-budget-exhausted");
  });

  test("same-worktree path helpers support Windows case-insensitive ownership", () => {
    expect(sameWorktreeOwnedPathsOverlap("src/Foo.ts", "src/foo.ts", "case-insensitive")).toBe(true);
    expect(isPathWithinSameWorktreeScope("src/Foo.ts", "src/foo.ts", "case-insensitive")).toBe(true);
    expect(sameWorktreeOwnedPathsOverlap("src/Foo.ts", "src/foo.ts", "case-sensitive")).toBe(false);
  });

  test("settled callbacks fire before sibling work finishes", async () => {
    const release = createReleaseMap(["task-a", "task-b"]);
    const settled: string[] = [];

    const run = scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [
        createScopedTask("task-a", ["src/a.ts"]),
        createScopedTask("task-b", ["src/b.ts"])
      ],
      getTaskId(entry) {
        return entry.task.id;
      },
      async executeTask(entry) {
        await release.wait(entry.task.id);
        return {
          result: createResult(entry.task.id, "completed")
        };
      },
      onSettled(_entry, result) {
        settled.push(result.id);
      }
    });

    release.release("task-a");
    await waitFor(() => settled.length === 1);
    expect(settled).toEqual(["task-a"]);

    release.release("task-b");
    await run;
  });

  test("recovery retry enqueues once and preserves final success", async () => {
    const attempts = new Map<string, number>();
    const settled: Array<{ id: string; status: string; attemptCount: number }> = [];

    const run = await scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [createScopedTask("task-a", ["src/a.ts"])],
      getTaskId(entry) {
        return entry.task.id;
      },
      async executeTask(entry) {
        const attempt = (attempts.get(entry.task.id) ?? 0) + 1;
        attempts.set(entry.task.id, attempt);
        return {
          result:
            attempt === 1
              ? createResult(entry.task.id, "failed", attempt, "verification failed")
              : createResult(entry.task.id, "completed", attempt)
        };
      },
      onSettled(_entry, result) {
        settled.push({
          id: result.id,
          status: result.status,
          attemptCount: result.attemptCount
        });
      },
      scheduleRetry(entry, result) {
        if (result.status === "failed" && entry.recoveryAttempt === 0) {
          return {
            ...entry,
            recoveryAttempt: 1
          };
        }

        return undefined;
      }
    });

    expect(settled).toEqual([
      { id: "task-a", status: "failed", attemptCount: 1 },
      { id: "task-a", status: "completed", attemptCount: 2 }
    ]);
    expect(run.results[0]?.status).toBe("completed");
    expect(attempts.get("task-a")).toBe(2);
  });

  test("recovery retry does not exceed one scheduler-level retry", async () => {
    const attempts = new Map<string, number>();

    const run = await scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
      tasks: [createScopedTask("task-a", ["src/a.ts"])],
      getTaskId(entry) {
        return entry.task.id;
      },
      async executeTask(entry) {
        const attempt = (attempts.get(entry.task.id) ?? 0) + 1;
        attempts.set(entry.task.id, attempt);
        return {
          result: createResult(entry.task.id, "failed", attempt, "still failing")
        };
      },
      scheduleRetry(entry, result) {
        if (result.status === "failed" && entry.recoveryAttempt === 0) {
          return {
            ...entry,
            recoveryAttempt: 1
          };
        }

        return undefined;
      }
    });

    expect(attempts.get("task-a")).toBe(2);
    expect(run.results[0]?.status).toBe("failed");
    expect(run.results[0]?.attemptCount).toBe(2);
  });

  test("abort-style failures do not trigger scheduler recovery", async () => {
    let retryCount = 0;

    await expect(
      scheduleSubagentTasks<ScopedTask, SubagentResult, never>({
        tasks: [createScopedTask("task-a", ["src/a.ts"])],
        getTaskId(entry) {
          return entry.task.id;
        },
        async executeTask() {
          throw new Error("abort requested");
        },
        scheduleRetry() {
          retryCount += 1;
          return undefined;
        }
      })
    ).rejects.toThrow("abort requested");

    expect(retryCount).toBe(0);
  });

  test("failed isolated subagents discard leases and tag branchfs traces", async () => {
    const traces: Array<{ stage: string; subagentId?: string }> = [];
    let discardCount = 0;
    const adapter = createSuccessfulAdapter("subagent output");

    const { results, retainedSnapshots } = await executeSubagents(adapter, {
      cwd: process.cwd(),
      runId: "run-branchfs-failure",
      providerBrand: "gpt",
      brief: "Do work",
      tasks: [{ id: "task-a", title: "Task A", instruction: "Fail once" }],
      debugEnabled: false,
      executionModelId: "openai/gpt-5.4",
      async verifyResult() {
        throw new Error("syntax failed");
      },
      branchfsManagerFactory(_context, callbacks) {
        return {
          async prepareExperimentLease() {
            callbacks.onTrace?.({
              stage: "branchfs-inherit-dirty",
              message: "Inherited base dirty state into BranchFS mount",
              detail: "src/a.ts"
            });
            return createLease("run-branchfs-failure-task-a-attempt-1");
          },
          async discardExperiment() {
            discardCount += 1;
          },
          async readInspection() {
            throw new Error("inspection should not run");
          }
        };
      },
      callbacks: {
        onTrace(trace) {
          traces.push({ stage: trace.stage, subagentId: trace.subagentId });
        }
      }
    });

    expect(results).toMatchObject([{ id: "task-a", status: "failed", errorMessage: "syntax failed" }]);
    expect(retainedSnapshots).toHaveLength(0);
    expect(discardCount).toBe(1);
    expect(traces).toContainEqual({ stage: "branchfs-inherit-dirty", subagentId: "task-a" });
  });

  test("branchfs lease preparation failures become failed subagent results", async () => {
    const errors: string[] = [];
    const adapter = createSuccessfulAdapter("subagent output");

    const { results, retainedSnapshots } = await executeSubagents(adapter, {
      cwd: process.cwd(),
      runId: "run-branchfs-prepare-failure",
      providerBrand: "gpt",
      brief: "Do work",
      tasks: [{ id: "task-a", title: "Task A", instruction: "Prepare worktree" }],
      debugEnabled: false,
      executionModelId: "openai/gpt-5.4",
      branchfsManagerFactory() {
        return {
          async prepareExperimentLease() {
            throw new Error("BranchFS prepare failed");
          },
          async discardExperiment() {
            throw new Error("discard should not run without a lease");
          },
          async readInspection() {
            throw new Error("inspection should not run");
          }
        };
      },
      callbacks: {
        onError(_task, error) {
          errors.push(error.message);
        }
      }
    });

    expect(results).toMatchObject([{ id: "task-a", status: "failed", errorMessage: "BranchFS prepare failed" }]);
    expect(retainedSnapshots).toHaveLength(0);
    expect(errors).toEqual(["BranchFS prepare failed"]);
  });

  test("sanitizes task ids before using them in branchfs run ids", async () => {
    const runIds: string[] = [];
    const adapter = createSuccessfulAdapter("subagent output");

    await executeSubagents(adapter, {
      cwd: process.cwd(),
      runId: "run-branchfs-safe-id",
      providerBrand: "gpt",
      brief: "Do work",
      tasks: [{ id: "ui/sidebar", title: "UI Sidebar", instruction: "Patch sidebar" }],
      debugEnabled: false,
      executionModelId: "openai/gpt-5.4",
      branchfsManagerFactory(context) {
        runIds.push(context.runId);
        return {
          async prepareExperimentLease() {
            return createLease(context.runId);
          },
          async discardExperiment() {},
          async readInspection() {
            return {
              experiment: createLease(context.runId).experiment,
              diffText: "",
              files: [],
              inspectedAt: new Date().toISOString(),
              filesChanged: 0,
              insertions: 0,
              deletions: 0,
              changedPaths: []
            };
          }
        };
      }
    });

    expect(runIds).toEqual(["run-branchfs-safe-id-ui-sidebar-attempt-1"]);
  });
});

function createScopedTask(id: string, ownedPaths: string[], exclusive: boolean = false): ScopedTask {
  return {
    task: {
      id,
      title: id,
      instruction: `run ${id}`
    },
    recoveryAttempt: 0,
    contractSettings: {
      ownedContracts: [],
      explicitOwnedPaths: ownedPaths,
      verificationCommands: [],
      exclusive
    }
  };
}

function createResult(
  id: string,
  status: "completed" | "failed",
  attemptCount: number = 1,
  errorMessage?: string
): SubagentResult {
  return {
    id,
    title: id,
    instruction: `run ${id}`,
    status,
    output: status === "completed" ? `${id} done` : undefined,
    errorMessage,
    attemptCount,
    durationMs: 1
  };
}

function createReleaseMap(taskIds: string[]) {
  const resolvers = new Map<string, () => void>();
  return {
    wait(taskId: string) {
      return new Promise<void>((resolve) => {
        resolvers.set(taskId, resolve);
      });
    },
    release(taskId: string) {
      resolvers.get(taskId)?.();
      resolvers.delete(taskId);
    }
  };
}

async function waitFor(check: () => boolean, timeoutMs: number = 500) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }

    await Bun.sleep(10);
  }
}

function createLease(runId: string) {
  const root = pathForTest(runId);
  return {
    experiment: {
      id: runId,
      runId,
      status: "prepared" as const,
      virtualBranchName: `ai-experiment/${runId}`,
      repoMountPath: root,
      projectMountPath: root,
      baseDirtyFingerprint: "clean",
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    repoRoot: root,
    projectRelativePath: "",
    repoMountPath: root,
    projectMountPath: root,
    baseProjectPath: root,
    manifestPath: `${root}\\manifest.json`,
    dirtySeedPath: `${root}\\dirty-seed`,
    upperPath: `${root}\\upper`
  };
}

function pathForTest(id: string) {
  return `C:\\tmp\\${id}`;
}

function createSuccessfulAdapter(text: string): PiAgentAdapter {
  return {
    async runPrompt(): Promise<PiAgentPromptResult> {
      return { text };
    },
    async startExecution(_request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
      return {
        result: Promise.resolve({ text }),
        async continueWithPrompt() {
          return { text };
        },
        async abort() {},
        dispose() {}
      };
    },
    setApiKey() {},
    hasApiKey() {
      return true;
    }
  };
}
