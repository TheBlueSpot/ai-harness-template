import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createAssistantId, createBackgroundJobId, createThreadId, type BackgroundJob } from "../../shared/protocol";
import { BackgroundJobScheduler } from "./background-job-scheduler";
import { WorkspaceRepository } from "./workspace-repository";

function createTempDir() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const tempRoot = createTempDir();
  const dbPath = path.join(tempRoot, `background-jobs-${crypto.randomUUID()}.sqlite`);
  return new WorkspaceRepository(dbPath, process.cwd());
}

function addProject(repository: WorkspaceRepository) {
  const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  return repository.addProject(projectRoot);
}

function saveDueJob(
  repository: WorkspaceRepository,
  projectId: string,
  overrides: Partial<BackgroundJob> = {}
) {
  const now = Date.now();
  const job: BackgroundJob = {
    id: createBackgroundJobId(),
    projectId,
    automationThreadId: createThreadId(),
    kind: "ai-routine",
    name: "Due review",
    status: "enabled",
    riskLevel: "unsafe",
    definition: {
      kind: "ai-routine",
      prompt: "Review repo.",
      planExecutionMode: "countdown",
      subagentWorktreeStrategy: "separate-worktrees"
    },
    schedule: {
      type: "interval",
      intervalSeconds: 3600,
      nextRunAt: new Date(now - 3600 * 1000).toISOString(),
      sourceText: "1h"
    },
    scheduleInput: "1h",
    nextRunAt: new Date(now - 3600 * 1000).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...overrides
  };
  return repository.saveBackgroundJob(job).jobs.find((entry) => entry.id === job.id)!;
}

describe("background job scheduler", () => {
  test("queues one startup catch-up run and advances schedule", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const now = Date.now();

    repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Nightly review",
      status: "enabled",
      riskLevel: "unsafe",
      definition: {
        kind: "ai-routine",
        prompt: "Review repo and summarize.",
        planExecutionMode: "countdown",
        subagentWorktreeStrategy: "separate-worktrees"
      },
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: new Date(now - 2 * 3600 * 1000).toISOString(),
        sourceText: "1h"
      },
      scheduleInput: "1h",
      nextRunAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    });

    const queuedRunIds: string[] = [];
    const scheduler = new BackgroundJobScheduler({
      repository,
      onRunQueued(run) {
        queuedRunIds.push(run.id);
      }
    });

    await scheduler.tick(true);
    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    expect(queuedRunIds).toHaveLength(1);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.triggerSource).toBe("startup-catchup");
    expect(state.runs[0]?.status).toBe("queued");
    expect(state.runs[0]?.skippedOccurrenceCount).toBeGreaterThanOrEqual(2);
    expect(new Date(state.jobs[0]?.nextRunAt ?? 0).getTime()).toBeGreaterThan(now);
  });

  test("queues a due one-off job only once across repeated ticks and restart", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const createdAt = "2026-04-24T10:00:00.000Z";

    repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "One-off review",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review repo once.",
        planExecutionMode: "countdown",
        subagentWorktreeStrategy: "separate-worktrees"
      },
      schedule: {
        type: "one-off",
        runAt: "2026-04-24T09:00:00.000Z",
        sourceText: "2026-04-24 09:00"
      },
      scheduleInput: "2026-04-24 09:00",
      nextRunAt: undefined,
      createdAt,
      updatedAt: createdAt
    });

    const firstScheduler = new BackgroundJobScheduler({ repository });
    await firstScheduler.tick(true);
    await firstScheduler.tick(false);

    const afterFirstPass = repository.loadBackgroundJobsState();
    expect(afterFirstPass.runs).toHaveLength(1);
    expect(afterFirstPass.jobs[0]?.schedule).toEqual({
      type: "one-off",
      runAt: "2026-04-24T09:00:00.000Z",
      consumedAt: afterFirstPass.jobs[0]?.schedule.type === "one-off" ? afterFirstPass.jobs[0].schedule.consumedAt : undefined,
      sourceText: "2026-04-24 09:00"
    });
    expect(afterFirstPass.jobs[0]?.lastRunAt).toBeDefined();

    const restartedScheduler = new BackgroundJobScheduler({ repository });
    await restartedScheduler.tick(true);

    const afterRestart = repository.loadBackgroundJobsState();
    expect(afterRestart.runs).toHaveLength(1);
    expect(afterRestart.jobs[0]?.schedule.type).toBe("one-off");
    expect(afterRestart.jobs[0]?.schedule.type === "one-off" ? afterRestart.jobs[0].schedule.consumedAt : undefined).toBeDefined();
  });

  test("does not advance due schedules while global execution is paused", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.setGlobalExecutionPaused(true);

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    expect(state.runs).toHaveLength(0);
    expect(state.jobs[0]?.lastRunAt).toBeUndefined();
    expect(state.jobs[0]?.nextRunAt).toBe(job.nextRunAt);
  });

  test("uses current approval policy when queueing due runs", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("always-ask");
    saveDueJob(repository, project.id, { riskLevel: "unsafe" });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    let state = repository.loadBackgroundJobsState();
    expect(state.runs[0]?.status).toBe("awaiting-approval");
    expect(state.runs[0]?.approvalStatus).toBe("pending");

    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    saveDueJob(repository, project.id, { name: "Allowed due review" });
    await scheduler.tick(false);

    state = repository.loadBackgroundJobsState();
    expect(state.runs.some((run) => run.status === "queued" && run.approvalStatus === "approved")).toBe(true);
  });

  test("skips assistant-linked jobs when assistant is paused", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    const assistantId = createAssistantId();
    const now = new Date().toISOString();
    repository.saveAssistant({
      id: assistantId,
      name: "Paused assistant",
      scope: "project",
      projectId: project.id,
      description: undefined,
      personalityPrompt: "Direct.",
      jobPrompt: "Review.",
      agentId: "pi",
      modeId: undefined,
      executionModelId: undefined,
      runState: "paused",
      bootstrapState: "completed",
      clonedFromAssistantId: undefined,
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      circuitBreakerReason: undefined,
      deletedAt: undefined,
      latestActivityAt: now,
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });
    saveDueJob(repository, project.id, { assistantId });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    expect(repository.loadBackgroundJobsState().runs).toHaveLength(0);
  });

  test("marks queued runs failed when launch callback rejects", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);

    const scheduler = new BackgroundJobScheduler({
      repository,
      async onRunQueued() {
        throw new Error("launch failed");
      }
    });

    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.jobId).toBe(job.id);
    expect(state.runs[0]?.status).toBe("failed");
    expect(state.runs[0]?.failureMessage).toBe("launch failed");
    expect(state.runs[0]?.events.some((event) => event.stage === "failed" && event.detail === "launch failed")).toBe(true);
  });
});
