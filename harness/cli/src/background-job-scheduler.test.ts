import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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

function createRepositoryWithPath() {
  const tempRoot = createTempDir();
  const dbPath = path.join(tempRoot, `background-jobs-${crypto.randomUUID()}.sqlite`);
  return { repository: new WorkspaceRepository(dbPath, process.cwd()), dbPath };
}

function addProject(repository: WorkspaceRepository) {
  const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  return repository.addProject(projectRoot);
}

function saveAssistant(repository: WorkspaceRepository, projectId: string, overrides: Partial<Parameters<WorkspaceRepository["saveAssistant"]>[0]> = {}) {
  const now = new Date().toISOString();
  const assistant = {
    id: createAssistantId(),
    name: "Background assistant",
    scope: "project" as const,
    projectId,
    description: undefined,
    personalityPrompt: "Direct.",
    jobPrompt: "Review.",
    agentId: "pi" as const,
    modeId: undefined,
    executionModelId: undefined,
    runState: "active" as const,
    bootstrapState: "completed" as const,
    clonedFromAssistantId: undefined,
    failureStreakCount: 0,
    circuitBreakerState: "closed" as const,
    circuitBreakerReason: undefined,
    deletedAt: undefined,
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
  repository.saveAssistant(assistant);
  return assistant;
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
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id, { assistantId: assistant.id });
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
    expect(state.runs[0]?.summary).toBe(
      "Due review is waiting before launch. Reason: unsafe schedule run requires approval under Always ask."
    );
    expect(state.runs[0]?.events[0]).toMatchObject({
      stage: "awaiting-approval",
      message: "Waiting for approval before launching Due review"
    });

    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    saveDueJob(repository, project.id, { name: "Allowed due review" });
    await scheduler.tick(false);

    state = repository.loadBackgroundJobsState();
    expect(state.runs.some((run) => run.status === "queued" && run.approvalStatus === "approved")).toBe(true);
  });

  test("does not queue another occurrence while a previous run is waiting for input", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "awaiting-user-input",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    expect(repository.loadBackgroundJobsState().runs).toHaveLength(1);
  });

  test("tick does not await launched background execution", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    saveDueJob(repository, project.id);
    const scheduler = new BackgroundJobScheduler({
      repository,
      onRunQueued() {
        return new Promise<void>(() => undefined);
      }
    });

    const startedAt = performance.now();
    await scheduler.tick(false);
    const elapsedMs = performance.now() - startedAt;

    const state = repository.loadBackgroundJobsState();
    expect(elapsedMs).toBeLessThan(500);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.status).toBe("queued");
  });

  test("marks due same-job requeues blocked without advancing schedule", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const blockedJob = repository.getBackgroundJob(job.id)!;
    expect(blockedJob.nextRunAt).toBe(job.nextRunAt);
    expect(blockedJob.schedulerStatus).toBe("running");
    expect(blockedJob.blockedReason).toContain("Job already has running run");
  });

  test("queues due assistant jobs while another assistant job is active", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const assistant = saveAssistant(repository, project.id);
    const activeJob = saveDueJob(repository, project.id, { assistantId: assistant.id, lane: "concurrent", name: "Active assistant job" });
    const blockedJob = saveDueJob(repository, project.id, { assistantId: assistant.id, lane: "concurrent", name: "Blocked assistant job" });
    repository.updateBackgroundJobSchedule(activeJob.id, {
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        sourceText: "1h"
      },
      nextRunAt: new Date(Date.now() + 3600 * 1000).toISOString()
    });
    repository.createBackgroundJobRun({
      jobId: activeJob.id,
      projectId: activeJob.projectId,
      assistantId: assistant.id,
      automationThreadId: activeJob.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: activeJob.riskLevel,
      approvalStatus: "approved"
    });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const nextJob = repository.getBackgroundJob(blockedJob.id)!;
    expect(nextJob.schedulerStatus).toBe("queued");
    expect(repository.getActiveBackgroundJobRuns(blockedJob.id)).toHaveLength(1);
    expect(repository.getActiveBackgroundJobRunsByAssistant(assistant.id)).toHaveLength(2);
  });

  test("repairs interrupted running rows before deciding a due job is blocked", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunReady(
      project.id,
      linkedRunId,
      {
        type: "ready",
        summary: "Ready but no executor owns it.",
        difficultyScore: 1,
        executionModelId: "openai/gpt-5.4",
        subtasks: [],
        usesSubagents: false,
        finalExecutionBrief: "Run main executor."
      },
      undefined,
      [],
      "openai/gpt-5.4"
    );
    const interruptedRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(interruptedRun.id, "running", { linkedAgentRunId: linkedRunId });

    const scheduler = new BackgroundJobScheduler({
      repository,
      repairActiveRuns(now) {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => false,
          now: new Date(now.getTime() + 3 * 60 * 1000)
        });
      }
    });
    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    expect(state.runs.some((run) => run.id === interruptedRun.id && run.status === "failed")).toBe(true);
    expect(repository.getRun(project.id, linkedRunId)?.status).toBe("failed");
    expect(repository.getRun(project.id, linkedRunId)?.failureCategory).toBe("controller-lost");
    expect(state.runs.some((run) => run.id !== interruptedRun.id && run.jobId === job.id && run.status === "queued")).toBe(true);
  });

  test("does not repair ready linked runs while a live controller owns the background run", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunReady(
      project.id,
      linkedRunId,
      {
        type: "ready",
        summary: "Ready and still live.",
        difficultyScore: 1,
        executionModelId: "openai/gpt-5.4",
        subtasks: [],
        usesSubagents: false,
        finalExecutionBrief: "Run main executor."
      },
      undefined,
      [],
      "openai/gpt-5.4"
    );
    const activeRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(activeRun.id, "running", { linkedAgentRunId: linkedRunId });

    const scheduler = new BackgroundJobScheduler({
      repository,
      repairActiveRuns(now) {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => true,
          now: new Date(now.getTime() + 3 * 60 * 1000)
        });
      }
    });
    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    expect(state.runs.find((run) => run.id === activeRun.id)?.status).toBe("running");
    expect(state.runs.filter((run) => run.jobId === job.id)).toHaveLength(1);
  });

  test("does not repair controllerless running rows before persisted lease expires", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    const startedAt = new Date("2026-05-01T15:00:00.000Z");
    const now = new Date("2026-05-01T15:05:00.000Z");
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, linkedRunId, "running-subagents");
    const activeRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(activeRun.id, "running", {
      linkedAgentRunId: linkedRunId,
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: "2026-05-01T15:20:00.000Z"
    });
    repository.touchBackgroundJobRun(activeRun.id, {
      stage: "execution-running",
      detail: "still working",
      now: startedAt
    });

    const scheduler = new BackgroundJobScheduler({
      repository,
      repairActiveRuns() {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => false,
          now
        });
      }
    });
    await scheduler.tick(false);

    const repairedRun = repository.getBackgroundJobRun(activeRun.id);
    expect(repairedRun?.status).toBe("running");
    expect(repository.getRun(project.id, linkedRunId)?.status).toBe("running-subagents");
    expect(repairedRun?.events.some((event) => event.message === "Background run repaired: no live controller")).toBe(false);
  });

  test("repairs controllerless running rows after persisted lease grace expires", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    const now = new Date("2026-05-01T15:20:00.000Z");
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, linkedRunId, "running-subagents");
    const activeRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(activeRun.id, "running", {
      linkedAgentRunId: linkedRunId,
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: "2026-05-01T15:05:00.000Z"
    });

    const scheduler = new BackgroundJobScheduler({
      repository,
      repairActiveRuns() {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => false,
          now
        });
      }
    });
    await scheduler.tick(false);

    const repairedRun = repository.getBackgroundJobRun(activeRun.id);
    expect(repairedRun?.status).toBe("failed");
    expect(repairedRun?.failureCategory).toBe("controller-lost");
    expect(repository.getRun(project.id, linkedRunId)?.status).toBe("failed");
    expect(repairedRun?.events.some((event) => event.message === "Background run repaired: no live controller")).toBe(true);
  });

  test("repairs stale running rows even when linked agent run is still running", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, linkedRunId, "running-main");
    const staleRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(staleRun.id, "running", { linkedAgentRunId: linkedRunId });

    const scheduler = new BackgroundJobScheduler({
      repository,
      repairActiveRuns(now) {
        return repository.repairStaleRunningBackgroundJobRuns({
          isRunLive: () => false,
          now: new Date(now.getTime() + 3 * 60 * 1000)
        });
      }
    });
    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    const repairedRun = state.runs.find((run) => run.id === staleRun.id);
    expect(repairedRun?.status).toBe("failed");
    expect(repairedRun?.events.some((event) => event.message === "Background run repaired: no live controller")).toBe(true);
    expect(repository.getRun(project.id, linkedRunId)?.status).toBe("failed");
    expect(repository.getRun(project.id, linkedRunId)?.failureCategory).toBe("controller-lost");
    expect(state.runs.some((run) => run.id !== staleRun.id && run.jobId === job.id && run.status === "queued")).toBe(true);
  });

  test("times out live running rows with no progress heartbeat", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id, { assistantId: assistant.id });
    const staleRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(staleRun.id, "running");
    repository.touchBackgroundJobRun(staleRun.id, {
      stage: "execution",
      detail: "stale",
      now: new Date(Date.now() - 11 * 60 * 1000)
    });
    const timedOut: string[] = [];

    const scheduler = new BackgroundJobScheduler({
      repository,
      isRunLive: () => true,
      onRunsTimingOut(runs) {
        timedOut.push(...runs.map((run) => run.id));
      },
      repairActiveRuns(now) {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => true,
          now
        });
      }
    });
    await scheduler.tick(false);

    const repairedRun = repository.getBackgroundJobRun(staleRun.id);
    expect(timedOut).toContain(staleRun.id);
    expect(repairedRun?.status).toBe("failed");
    expect(repairedRun?.failureMessage).toBe("Timed out: no background progress heartbeat");
    expect(repairedRun?.timedOutAt).toBeTruthy();
    expect(repairedRun?.events.some((event) => event.message === "Background run timed out")).toBe(true);
    expect(repository.getActiveBackgroundJobRuns(job.id)).toHaveLength(1);
    expect(repository.getActiveBackgroundJobRuns(job.id)[0]?.status).toBe("queued");
  });

  test("times out live running rows that exceed max runtime", async () => {
    const { repository, dbPath } = createRepositoryWithPath();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id, { assistantId: assistant.id });
    const staleRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(staleRun.id, "running");
    repository.touchBackgroundJobRun(staleRun.id, {
      stage: "execution-running",
      detail: "recent progress",
      now: new Date(Date.now() - 60_000)
    });
    const db = new Database(dbPath);
    db.query(`UPDATE background_job_runs SET started_at = ?2 WHERE id = ?1`).run(
      staleRun.id,
      new Date(Date.now() - 31 * 60 * 1000).toISOString()
    );
    db.close();

    const scheduler = new BackgroundJobScheduler({
      repository,
      isRunLive: () => true,
      repairActiveRuns(now) {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => true,
          now
        });
      }
    });
    await scheduler.tick(false);

    const repairedRun = repository.getBackgroundJobRun(staleRun.id);
    expect(repairedRun?.status).toBe("failed");
    expect(repairedRun?.failureMessage).toBe("Timed out: background run exceeded max runtime");
    expect(repairedRun?.failureCategory).toBe("max-runtime-timeout");
    expect(repairedRun?.timedOutAt).toBeTruthy();
    expect(repairedRun?.events.some((event) => event.message === "Background run timed out")).toBe(true);
  });

  test("keeps live running rows with fresh liveness heartbeat", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id, { assistantId: assistant.id });
    const staleRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(staleRun.id, "running");
    repository.touchBackgroundJobRun(staleRun.id, {
      stage: "execution-running",
      detail: "Main Codex CLI execution still running",
      now: new Date(Date.now() - 60_000)
    });
    const timedOut: string[] = [];

    const scheduler = new BackgroundJobScheduler({
      repository,
      isRunLive: () => true,
      onRunsTimingOut(runs) {
        timedOut.push(...runs.map((run) => run.id));
      },
      repairActiveRuns(now) {
        return repository.repairInterruptedBackgroundJobRuns({
          isRunLive: () => true,
          now
        });
      }
    });
    await scheduler.tick(false);

    const activeRun = repository.getBackgroundJobRun(staleRun.id);
    expect(timedOut).not.toContain(staleRun.id);
    expect(activeRun?.status).toBe("running");
    expect(activeRun?.heartbeatStage).toBe("execution-running");
    expect(repository.getActiveBackgroundJobRuns(job.id)).toHaveLength(1);
  });

  test("queues all due assistant jobs for concurrent launch", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const now = Date.now();
    const slightlyOverdue = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      lane: "concurrent",
      name: "Five minute sweep",
      schedule: {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: new Date(now - 6 * 60 * 1000).toISOString(),
        sourceText: "5m"
      },
      scheduleInput: "5m",
      nextRunAt: new Date(now - 6 * 60 * 1000).toISOString()
    });
    const veryOverdue = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      lane: "concurrent",
      name: "Ten minute review",
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: new Date(now - 20 * 60 * 1000).toISOString(),
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: new Date(now - 20 * 60 * 1000).toISOString()
    });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const reviewRuns = repository.getActiveBackgroundJobRuns(veryOverdue.id);
    const sweepRuns = repository.getActiveBackgroundJobRuns(slightlyOverdue.id);
    expect(reviewRuns).toHaveLength(1);
    expect(reviewRuns[0]?.status).toBe("queued");
    expect(sweepRuns).toHaveLength(1);
    expect(sweepRuns[0]?.status).toBe("queued");
    expect(repository.getActiveBackgroundJobRunsByAssistant(assistant.id)).toHaveLength(2);
  });

  test("repairs stale assistant and automation-thread refs before queuing due jobs", async () => {
    const { repository, dbPath } = createRepositoryWithPath();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const staleThreadId = createThreadId();
    const job = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      automationThreadId: staleThreadId
    });

    const db = new Database(dbPath);
    db.exec("PRAGMA foreign_keys = OFF;");
    db.query(`DELETE FROM assistants WHERE id = ?1`).run(assistant.id);
    db.query(`DELETE FROM project_threads WHERE id = ?1`).run(staleThreadId);
    db.close();

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const queuedRun = repository.getActiveBackgroundJobRuns(job.id)[0];
    const repairedJob = repository.getBackgroundJob(job.id);
    expect(queuedRun?.status).toBe("queued");
    expect(queuedRun?.assistantId).toBeUndefined();
    expect(queuedRun?.automationThreadId).toBe(staleThreadId);
    expect(repairedJob?.assistantId).toBeUndefined();
    expect(repository.getProject(project.id).threads.some((thread) => thread.id === staleThreadId && thread.kind === "automation")).toBe(true);
  });

  test("marks assistant schedules congested and scales next interval", async () => {
    const { repository, dbPath } = createRepositoryWithPath();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      schedule: {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: new Date(Date.now() - 60_000).toISOString(),
        sourceText: "5m"
      },
      scheduleInput: "5m",
      lastRunAt: new Date(Date.now() - 60_000).toISOString()
    });
    const db = new Database(dbPath);
    for (let index = 0; index < 5; index += 1) {
      const completedAt = new Date(Date.now() - (5 + index) * 60 * 1000).toISOString();
      const startedAt = new Date(Date.now() - (11 + index) * 60 * 1000).toISOString();
      db.query(
        `UPDATE background_job_runs
         SET started_at = ?2, completed_at = ?3, status = 'succeeded'
         WHERE id = ?1`
      ).run(repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: assistant.id,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "succeeded",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      }).id, startedAt, completedAt);
    }
    db.close();

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const refreshedJob = repository.getBackgroundJob(job.id);
    expect(refreshedJob?.schedulerCongested).toBe(true);
    expect(refreshedJob?.schedulerStatus).toBe("idle");
    expect(refreshedJob?.schedulerDetail).toContain("Congested");
    expect(repository.getActiveBackgroundJobRuns(job.id)).toHaveLength(0);
  });

  test("queues due assistant work without congestion metadata when congestion control is disabled", async () => {
    const { repository, dbPath } = createRepositoryWithPath();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    repository.setAssistantCongestionControlEnabledDefault(false);
    const job = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      schedule: {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: new Date(Date.now() - 60_000).toISOString(),
        sourceText: "5m"
      },
      scheduleInput: "5m",
      lastRunAt: new Date(Date.now() - 60_000).toISOString()
    });
    const db = new Database(dbPath);
    for (let index = 0; index < 5; index += 1) {
      const completedAt = new Date(Date.now() - (5 + index) * 60 * 1000).toISOString();
      const startedAt = new Date(Date.now() - (11 + index) * 60 * 1000).toISOString();
      db.query(
        `UPDATE background_job_runs
         SET started_at = ?2, completed_at = ?3, status = 'succeeded'
         WHERE id = ?1`
      ).run(repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: assistant.id,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "succeeded",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      }).id, startedAt, completedAt);
    }
    db.close();

    const queuedRunIds: string[] = [];
    const scheduler = new BackgroundJobScheduler({
      repository,
      onRunQueued(run) {
        queuedRunIds.push(run.id);
      }
    });
    await scheduler.tick(false);

    const refreshedJob = repository.getBackgroundJob(job.id);
    expect(queuedRunIds).toHaveLength(1);
    expect(refreshedJob?.schedulerCongested).toBe(false);
    expect(refreshedJob?.schedulerCongestionRatio).toBeUndefined();
    expect(repository.getActiveBackgroundJobRuns(job.id)[0]?.status).toBe("queued");
  });

  test("blocks exclusive assistant jobs when another exclusive assistant job is active", async () => {
    const { repository, dbPath } = createRepositoryWithPath();
    const project = addProject(repository);
    const assistant = saveAssistant(repository, project.id);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const activeJob = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      name: "Active assistant work",
      schedule: {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: new Date(Date.now() + 60_000).toISOString(),
        sourceText: "5m"
      },
      scheduleInput: "5m",
      nextRunAt: new Date(Date.now() + 60_000).toISOString()
    });
    const dueJob = saveDueJob(repository, project.id, {
      assistantId: assistant.id,
      name: "Due congested work",
      schedule: {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: new Date(Date.now() - 60_000).toISOString(),
        sourceText: "5m"
      },
      scheduleInput: "5m",
      nextRunAt: new Date(Date.now() - 60_000).toISOString()
    });
    const activeRun = repository.createBackgroundJobRun({
      jobId: activeJob.id,
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: activeJob.automationThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: activeJob.riskLevel,
      approvalStatus: "approved"
    });

    const db = new Database(dbPath);
    for (let index = 0; index < 5; index += 1) {
      const completedAt = new Date(Date.now() - (5 + index) * 60 * 1000).toISOString();
      const startedAt = new Date(Date.now() - (11 + index) * 60 * 1000).toISOString();
      db.query(
        `UPDATE background_job_runs
         SET started_at = ?2, completed_at = ?3, status = 'succeeded'
         WHERE id = ?1`
      ).run(repository.createBackgroundJobRun({
        jobId: dueJob.id,
        projectId: project.id,
        assistantId: assistant.id,
        automationThreadId: dueJob.automationThreadId,
        triggerSource: "manual",
        status: "succeeded",
        riskLevel: dueJob.riskLevel,
        approvalStatus: "approved"
      }).id, startedAt, completedAt);
    }
    db.close();

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const refreshedDueJob = repository.getBackgroundJob(dueJob.id);
    expect(repository.getActiveBackgroundJobRuns(dueJob.id)).toHaveLength(0);
    expect(refreshedDueJob?.schedulerStatus).toBe("blocked");
    expect(refreshedDueJob?.schedulerDetail).toContain(activeRun.id);
    expect(refreshedDueJob?.schedulerCongested).toBe(true);
  });

  test("reconciles active background runs when linked agent runs already failed", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, linkedRunId, "failed", "empty response");
    const staleRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(staleRun.id, "running", { linkedAgentRunId: linkedRunId });

    const scheduler = new BackgroundJobScheduler({ repository });
    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    const repairedRun = state.runs.find((run) => run.id === staleRun.id);
    expect(repairedRun?.status).toBe("failed");
    expect(repairedRun?.failureMessage).toBe("empty response");
    expect(repairedRun?.events.some((event) => event.stage === "failed" && event.message === "Reconciled linked agent run")).toBe(true);
    expect(state.runs.some((run) => run.id !== staleRun.id && run.jobId === job.id && run.status === "queued")).toBe(true);
  });

  test("reconciles linked partial-complete runs without backoff or blocking", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id, {
      consecutiveFailureCount: 2,
      backoffUntil: new Date(Date.now() - 60_000).toISOString(),
      lastFailureCategory: "controller-lost"
    });
    repository.createAgentRun(project.id, "plan work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, linkedRunId, "partial-complete", "Background run partial complete");
    const activeRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(activeRun.id, "running", { linkedAgentRunId: linkedRunId });

    const scheduler = new BackgroundJobScheduler({
      repository,
      onRunsRepaired(runs) {
        for (const run of runs) {
          if (run.status === "partial-complete") {
            repository.clearBackgroundJobFailureTracking(run.jobId);
          }
        }
      }
    });
    await scheduler.tick(false);

    const repairedRun = repository.getBackgroundJobRun(activeRun.id);
    const refreshedJob = repository.getBackgroundJob(job.id);
    expect(repairedRun?.status).toBe("partial-complete");
    expect(repairedRun?.failureCategory).toBeUndefined();
    expect(repository.getActiveBackgroundJobRuns(job.id)).toHaveLength(1);
    expect(repository.getActiveBackgroundJobRuns(job.id)[0]?.id).not.toBe(activeRun.id);
    expect(repository.getActiveBackgroundJobRuns(job.id)[0]?.status).toBe("queued");
    expect(refreshedJob?.consecutiveFailureCount).toBe(0);
    expect(refreshedJob?.backoffUntil).toBeUndefined();
    expect(refreshedJob?.lastFailureCategory).toBeUndefined();
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

  test("does not overwrite heartbeat timeout when launch callback rejects after timeout repair", async () => {
    const repository = createRepository();
    const project = addProject(repository);
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");
    const job = saveDueJob(repository, project.id);

    const scheduler = new BackgroundJobScheduler({
      repository,
      async onRunQueued(run) {
        repository.setBackgroundJobRunStatus(run.id, "failed", {
          failureMessage: "Timed out: no background progress heartbeat",
          failureCategory: "heartbeat-timeout",
          timedOutAt: new Date().toISOString()
        });
        throw new Error("generic launch failure");
      }
    });

    await scheduler.tick(false);

    const state = repository.loadBackgroundJobsState();
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.status).toBe("failed");
    expect(state.runs[0]?.failureMessage).toBe("Timed out: no background progress heartbeat");
    expect(state.runs[0]?.failureCategory).toBe("heartbeat-timeout");
    expect(state.runs[0]?.timedOutAt).toBeTruthy();
    expect(state.runs[0]?.events.some((event) => event.detail === "generic launch failure")).toBe(false);
  });

  test("reports asynchronous tick failures from the scheduler loop", async () => {
    const repository = createRepository();
    const failures: unknown[] = [];
    Object.defineProperty(repository, "loadBackgroundJobsState", {
      value() {
        throw new Error("tick failed");
      }
    });
    const scheduler = new BackgroundJobScheduler({
      repository,
      onTickFailed(error) {
        failures.push(error);
      }
    });

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.stop();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(Error);
  });
});
