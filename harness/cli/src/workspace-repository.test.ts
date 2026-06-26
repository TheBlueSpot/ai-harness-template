import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantAssetRefId,
  createAssistantLearningId,
  createAssistantLogEntryId,
  createAssistantQuestionId,
  createAssistantTodoId,
  createBackgroundJobId,
  createThreadId,
  createExperimentId,
  createMemoryEntryId,
  createMemoryRetrievalId,
  type BackgroundJob,
  type ExecutionPlan
} from "../../shared/protocol";
import { normalizeWindowsEscapedPath, WorkspaceRepository } from "./workspace-repository";

function createTempDir() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const tempRoot = createTempDir();
  const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
  return new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
}

function addProject(repository: WorkspaceRepository) {
  const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  return repository.addProject(projectRoot);
}

function saveTestMemory(
  repository: WorkspaceRepository,
  input: {
    projectId: string;
    title: string;
    priority?: number;
    pinned?: boolean;
    updatedAt?: string;
  }
) {
  const now = new Date().toISOString();
  return repository.saveMemoryEntry({
    id: createMemoryEntryId(),
    projectId: input.projectId,
    kind: "task-summary",
    status: "active",
    title: input.title,
    summary: `${input.title} summary`,
    tags: [input.title.toLowerCase()],
    pathGlobs: ["src/**"],
    confidence: "medium",
    freshness: "fresh",
    pinned: input.pinned ?? false,
    priority: input.priority ?? 50000,
    hitCount: 0,
    createdAt: now,
    updatedAt: input.updatedAt ?? now
  })!;
}

function addLearningAssistant(repository: WorkspaceRepository) {
  const now = new Date().toISOString();
  return repository.saveAssistant({
    id: createAssistantId(),
    name: "Learning helper",
    scope: "global",
    personalityPrompt: "Remember useful facts.",
    jobPrompt: "Track durable learnings.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now
  });
}

describe("workspace repository", () => {
  test("loads empty workspace on fresh database", () => {
    const repository = createRepository();

    expect(repository.loadWorkspace()).toEqual({
      projects: [],
      activeProjectId: undefined,
      workspaceModes: [],
      workspaceRuleSource: undefined,
      workspaceMemorySummary: undefined
    });
  });

  test("supports in-memory test-fast databases", () => {
    const repository = new WorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "hello memory");

    expect(repository.loadWorkspace().projects[0]?.session.messages[0]?.content).toBe("hello memory");
  });

  test("defaults and persists memory record-run preference", () => {
    const repository = createRepository();

    expect(repository.getMemoryBankRecordRunsDefault()).toBe(true);
    repository.setMemoryBankRecordRunsDefault(false);

    expect(repository.getMemoryBankRecordRunsDefault()).toBe(false);
  });

  test("persists lifetime token usage in workspace metadata", () => {
    const repository = createRepository();
    const session = {
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 2,
      totalProcessedTokens: 15,
      totalTokensIncludingCached: 17,
      events: 1,
      updatedAt: "2026-06-25T12:00:00.000Z"
    };

    repository.addTokenUsageLifetime(session);

    expect(repository.getTokenUsageState(session).lifetime).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 2,
      totalTokensIncludingCached: 17,
      events: 1
    });

    const resetAt = "2026-06-25T13:00:00.000Z";
    repository.resetTokenUsageLifetime(resetAt);

    expect(repository.getTokenUsageState(session).lifetime.totalTokensIncludingCached).toBe(0);
    expect(repository.getTokenUsageState(session).resetAt).toBe(resetAt);
  });

  test("defaults and persists background job approval policy", () => {
    const repository = createRepository();

    expect(repository.getBackgroundJobApprovalPolicyDefault()).toBe("ask-risky");
    repository.setBackgroundJobApprovalPolicyDefault("allow-all");

    expect(repository.getBackgroundJobApprovalPolicyDefault()).toBe("allow-all");
  });

  test("defaults and persists non-blocking assistant question auto-approval", () => {
    const repository = createRepository();

    expect(repository.getAssistantAutoApproveNonBlockingQuestionsDefault()).toBe(true);
    repository.setAssistantAutoApproveNonBlockingQuestionsDefault(false);

    expect(repository.getAssistantAutoApproveNonBlockingQuestionsDefault()).toBe(false);
  });

  test("sorts and reorders memory entries by pinned state and priority", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveTestMemory(repository, { projectId: project.id, title: "Later", priority: 300 });
    const middle = saveTestMemory(repository, { projectId: project.id, title: "Middle", priority: 200 });
    saveTestMemory(repository, { projectId: project.id, title: "Pinned", priority: 900, pinned: true });
    saveTestMemory(repository, { projectId: project.id, title: "First", priority: 100 });

    expect(repository.listMemoryEntries(project.id).map((entry) => entry.title)).toEqual([
      "Pinned",
      "First",
      "Middle",
      "Later"
    ]);

    const reordered = repository.reorderMemoryEntry(project.id, middle.id, "up");
    expect(reordered.map((entry) => entry.title)).toEqual(["Pinned", "Middle", "First", "Later"]);
  });

  test("renumbers equal priority memories before reordering", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const first = saveTestMemory(repository, {
      projectId: project.id,
      title: "First",
      priority: 50000,
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
    const second = saveTestMemory(repository, {
      projectId: project.id,
      title: "Second",
      priority: 50000,
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    const reordered = repository.reorderMemoryEntry(project.id, second.id, "up");

    expect(reordered[0]?.id).toBe(second.id);
    expect(reordered[1]?.id).toBe(first.id);
    expect(new Set(reordered.map((entry) => entry.priority)).size).toBe(reordered.length);
  });

  test("bulk archives old inactive threads while keeping active and final threads", () => {
    const repository = createRepository();
    const firstProject = addProject(repository);
    const oldThreadProject = repository.createThread(firstProject.id);
    const oldThreadId = oldThreadProject.activeThreadId;
    const pinnedThreadProject = repository.createThread(firstProject.id);
    const pinnedThreadId = pinnedThreadProject.activeThreadId;
    const recentThreadProject = repository.createThread(firstProject.id);
    const recentThreadId = recentThreadProject.activeThreadId;
    repository.setThreadPinned(firstProject.id, pinnedThreadId, true);
    repository.activateThread(firstProject.id, firstProject.activeThreadId);
    const secondProject = addProject(repository);
    const secondOldProject = repository.createThread(secondProject.id);
    const secondOldThreadId = secondOldProject.activeThreadId;
    repository.activateThread(secondProject.id, secondProject.activeThreadId);
    const old = "2026-01-01T00:00:00.000Z";
    const recent = "2026-04-20T00:00:00.000Z";
    const db = (repository as unknown as { db: Database }).db;
    db.query(`UPDATE project_threads SET created_at = ?2, updated_at = ?2 WHERE id = ?1`).run(oldThreadId, old);
    db.query(`UPDATE project_threads SET created_at = ?2, updated_at = ?2 WHERE id = ?1`).run(pinnedThreadId, old);
    db.query(`UPDATE project_threads SET created_at = ?2, updated_at = ?2 WHERE id = ?1`).run(recentThreadId, recent);
    db.query(`UPDATE project_threads SET created_at = ?2, updated_at = ?2 WHERE id = ?1`).run(secondOldThreadId, old);
    db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
      VALUES (?1, ?2, 'user', 'plain', 'old', NULL, NULL, ?3)`).run(crypto.randomUUID(), oldThreadId, old);
    db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
      VALUES (?1, ?2, 'user', 'plain', 'pinned old', NULL, NULL, ?3)`).run(crypto.randomUUID(), pinnedThreadId, old);
    db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
      VALUES (?1, ?2, 'user', 'plain', 'recent', NULL, NULL, ?3)`).run(crypto.randomUUID(), recentThreadId, recent);
    db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
      VALUES (?1, ?2, 'user', 'plain', 'old second', NULL, NULL, ?3)`).run(crypto.randomUUID(), secondOldThreadId, old);

    const result = repository.cleanupArchiveThreads({
      cutoffIso: "2026-03-01T00:00:00.000Z",
      nowIso: "2026-05-01T00:00:00.000Z"
    });

    expect(result.archivedCount).toBe(2);
    expect(result.projects.flatMap((project) => project.archivedThreadIds).sort()).toEqual([oldThreadId, secondOldThreadId].sort());
    const nextFirstProject = repository.getProject(firstProject.id);
    expect(nextFirstProject.threads.find((thread) => thread.id === oldThreadId)?.status).toBe("archived");
    expect(nextFirstProject.threads.find((thread) => thread.id === pinnedThreadId)).toMatchObject({ pinned: true, status: "active" });
    expect(nextFirstProject.threads.find((thread) => thread.id === recentThreadId)?.status).toBe("active");
    expect(nextFirstProject.threads.find((thread) => thread.id === firstProject.activeThreadId)?.status).toBe("active");
    expect(() => repository.archiveThread(firstProject.id, pinnedThreadId)).toThrow("Pinned threads cannot be archived");
  });

  test("persists and hydrates agent run runtime budgets", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const runProject = repository.createAgentRun(project.id, "budgeted work", "openai/gpt-5.4", project.activeThreadId, 3);
    const run = runProject.activeRun;

    expect(run?.runtimeBudget).toEqual({
      maxTurns: 3,
      turnsUsed: 0,
      currentTurn: 1,
      remainingTurns: 3,
      exhausted: false
    });

    const first = repository.reserveAgentRunTurn(project.id, run!.id);
    expect(first).toEqual({
      maxTurns: 3,
      turnsUsed: 1,
      currentTurn: 1,
      remainingTurns: 2,
      exhausted: false
    });

    const hydrated = repository.getRun(project.id, run!.id);
    expect(hydrated?.runtimeBudget).toMatchObject({
      maxTurns: 3,
      turnsUsed: 1,
      currentTurn: 2,
      remainingTurns: 2,
      exhausted: false
    });
  });

  test("agent run turn reservation stops at max", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(project.id, "budgeted work", "openai/gpt-5.4", project.activeThreadId, 1).activeRun!;

    expect(repository.reserveAgentRunTurn(project.id, run.id)?.exhausted).toBe(true);
    expect(() => repository.reserveAgentRunTurn(project.id, run.id)).toThrow("turn-budget-exhausted");
    expect(repository.getRun(project.id, run.id)?.runtimeBudget?.turnsUsed).toBe(1);
  });

  test("unbudgeted agent runs keep current reservation behavior", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(project.id, "unbudgeted work", "openai/gpt-5.4", project.activeThreadId).activeRun!;

    expect(repository.reserveAgentRunTurn(project.id, run.id)).toBeUndefined();
    expect(repository.getRun(project.id, run.id)?.runtimeBudget).toBeUndefined();
  });

  test("terminal status preserves completed time", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(project.id, "complete work", "openai/gpt-5.4", project.activeThreadId, 2).activeRun!;

    repository.setAgentRunStatus(project.id, run.id, "completed");
    const completedAt = repository.getRun(project.id, run.id)?.completedAt;
    repository.setAgentRunStatus(project.id, run.id, "completed");

    expect(repository.getRun(project.id, run.id)?.completedAt).toBe(completedAt);
  });

  test("pauses enabled assistant background jobs only", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const assistant = repository.saveAssistant({
      id: createAssistantId(),
      name: "Job owner",
      scope: "project",
      projectId: project.id,
      personalityPrompt: "Own jobs.",
      jobPrompt: "Run background work.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });
    const saveJob = (input: { id: string; assistantId?: string; status: BackgroundJob["status"]; name: string }) =>
      repository.saveBackgroundJob({
        id: input.id,
        projectId: project.id,
        ...(input.assistantId ? { assistantId: input.assistantId } : {}),
        automationThreadId: createThreadId(),
        kind: "ai-routine",
        name: input.name,
        status: input.status,
        riskLevel: "safe",
        definition: {
          kind: "ai-routine",
          prompt: "Run job."
        },
        schedule: {
          type: "one-off",
          runAt: now,
          sourceText: "now"
        },
        scheduleInput: "now",
        nextRunAt: now,
        createdAt: now,
        updatedAt: now
      } satisfies BackgroundJob);

    saveJob({ id: "job-assistant-enabled", assistantId: assistant.id, status: "enabled", name: "Assistant enabled" });
    saveJob({ id: "job-assistant-disabled", assistantId: assistant.id, status: "disabled", name: "Assistant disabled" });
    saveJob({ id: "job-standalone-enabled", status: "enabled", name: "Standalone enabled" });

    const state = repository.pauseAllAssistantBackgroundJobs();
    const statuses = new Map(state.jobs.map((job) => [job.id, job.status]));

    expect(statuses.get("job-assistant-enabled")).toBe("paused");
    expect(statuses.get("job-assistant-disabled")).toBe("disabled");
    expect(statuses.get("job-standalone-enabled")).toBe("enabled");
  });

  test("persists background run heartbeats and scheduler queue metadata", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Heartbeat job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Check heartbeat."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: "safe",
      approvalStatus: "approved"
    });

    repository.touchBackgroundJobRun(run.id, { stage: "execution", detail: "progress" });
    repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: "Assistant busy",
      schedulerQueuePosition: 2,
      schedulerQueueReason: "Queue #2: waiting behind active job",
      schedulerActiveRunId: run.id,
      schedulerLastProgressAt: now,
      schedulerOverloaded: true
    });

    const hydratedRun = repository.getBackgroundJobRun(run.id);
    const hydratedJob = repository.getBackgroundJob(job.id);
    expect(hydratedRun?.lastHeartbeatAt).toBeTruthy();
    expect(hydratedRun?.heartbeatStage).toBe("execution");
    expect(hydratedJob?.schedulerQueuePosition).toBe(2);
    expect(hydratedJob?.schedulerQueueReason).toContain("Queue #2");
    expect(hydratedJob?.schedulerActiveRunId).toBe(run.id);
    expect(hydratedJob?.schedulerOverloaded).toBe(true);
  });

  test("ignores background heartbeat updates after terminal completion", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Terminal heartbeat guard",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Check heartbeat."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: "safe",
      approvalStatus: "approved"
    });

    repository.setBackgroundJobRunStatus(run.id, "cancelled", {
      failureMessage: "Stopped by user",
      failureCategory: "manual-abort"
    });
    const terminalRun = repository.getBackgroundJobRun(run.id);
    repository.touchBackgroundJobRun(run.id, { stage: "execution-running", detail: "late heartbeat" });
    repository.appendBackgroundJobRunEvent(run.id, "trace", "Late trace", "late callback");

    const updatedRun = repository.getBackgroundJobRun(run.id);
    expect(updatedRun?.status).toBe("cancelled");
    expect(updatedRun?.completedAt).toBe(terminalRun?.completedAt);
    expect(updatedRun?.updatedAt).toBe(terminalRun?.updatedAt);
    expect(updatedRun?.lastHeartbeatAt).toBe(terminalRun?.lastHeartbeatAt);
    expect(updatedRun?.heartbeatStage).toBe("cancelled");
    expect(updatedRun?.heartbeatDetail).toBe("Stopped by user");
    expect(updatedRun?.events.some((event) => event.stage === "trace" && event.message === "Late trace")).toBe(false);
  });

  test("persists partial-complete background runs as terminal warning state", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Partial job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Do partial work."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: "safe",
      approvalStatus: "approved"
    });

    repository.setBackgroundJobRunStatus(run.id, "partial-complete", {
      summary: "Useful result.",
      failureMessage: "Some subagent work failed."
    });
    repository.touchBackgroundJobRun(run.id, { stage: "late-progress", detail: "should not move terminal row" });

    const restoredRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredRun = restoredRepository.getBackgroundJobRun(run.id);
    expect(restoredRun?.status).toBe("partial-complete");
    expect(restoredRun?.summary).toBe("Useful result.");
    expect(restoredRun?.failureMessage).toBe("Some subagent work failed.");
    expect(restoredRun?.completedAt).toBeTruthy();
    expect(restoredRun?.heartbeatStage).toBe("partial-complete");
    expect(restoredRepository.getActiveBackgroundJobRuns(job.id)).toHaveLength(0);
  });

  test("reconciles linked partial-complete agent runs without hard failure", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Partial reconcile job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Do partial work."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    repository.createAgentRun(project.id, "linked work", "openai/gpt-5.4", job.automationThreadId);
    const linkedRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, linkedRunId, "partial-complete", "Background run partial complete");
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: "safe",
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(run.id, "running", { linkedAgentRunId: linkedRunId });

    const repaired = repository.repairInterruptedBackgroundJobRuns();

    expect(repaired[0]?.status).toBe("partial-complete");
    expect(repaired[0]?.failureCategory).toBeUndefined();
    expect(repository.getBackgroundJobRun(run.id)?.events.some((event) => event.stage === "partial-complete")).toBe(true);
  });

  test("persists added project history without default bootstrap", () => {
    const repository = createRepository();
    const nextProject = addProject(repository);

    repository.appendMessage(nextProject.id, "user", "hello");
    repository.appendMessage(nextProject.id, "assistant", "world");

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const workspace = reloadedRepository.loadWorkspace();
    const restoredProject = workspace.projects.find((project) => project.id === nextProject.id);

    expect(workspace.activeProjectId).toBe(nextProject.id);
    expect(restoredProject?.session.messages).toHaveLength(2);
    expect(restoredProject?.session.messages[0].content).toBe("hello");
    expect(restoredProject?.session.messages[1].content).toBe("world");
  });

  test("openProject creates new thread when project already exists", () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });

    const created = repository.openProject(projectRoot);
    const reopened = repository.openProject(projectRoot);

    expect(created.resolution).toBe("created-project");
    expect(reopened.resolution).toBe("existing-project-new-thread");
    expect(reopened.project.id).toBe(created.project.id);
    expect(reopened.project.threads).toHaveLength(2);
    expect(reopened.project.activeThreadId).not.toBe(created.project.activeThreadId);
  });

  test("forkThread copies only plain transcript messages", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const attachment = {
      id: "att-1",
      kind: "text" as const,
      name: "notes.txt",
      url: "https://example.com/notes.txt",
      sizeBytes: 12,
      mimeType: "text/plain",
      key: "notes-key",
      uploadedAt: new Date().toISOString()
    };

    repository.appendMessage(project.id, "user", "source request");
    repository.appendMessage(project.id, "assistant", "source answer", { attachments: [attachment] });
    repository.appendMessage(project.id, "assistant", "old plan", { kind: "plan-summary" });
    repository.appendMessage(project.id, "assistant", "old milestones", { kind: "run-milestones" });

    const forked = repository.forkThread(project.id, project.activeThreadId);

    expect(forked.activeThreadId).not.toBe(project.activeThreadId);
    expect(forked.threads.find((thread) => thread.id === forked.activeThreadId)?.forkedFromThreadId).toBe(project.activeThreadId);
    expect(forked.session.messages.map((message) => message.content)).toEqual(["source request", "source answer"]);
    expect(forked.session.messages.every((message) => message.kind === "plain")).toBe(true);
    expect(forked.session.messages.every((message) => message.metadata === undefined)).toBe(true);
    expect(forked.session.messages[1]?.attachments).toEqual([attachment]);
  });

  test("removeProject can clear final project and active selection", () => {
    const repository = createRepository();
    const project = addProject(repository);

    expect(repository.removeProject(project.id).activeProjectId).toBeUndefined();
    expect(repository.loadWorkspace()).toEqual({
      projects: [],
      activeProjectId: undefined,
      workspaceModes: [],
      workspaceRuleSource: undefined,
      workspaceMemorySummary: undefined
    });
  });

  test("reset starts empty active thread", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "hello");
    const resetProject = repository.resetProject(project.id);

    expect(resetProject.session.messages).toHaveLength(0);
    expect(resetProject.activeThreadId).toBe(resetProject.session.sessionId);
  });

  test("persists API key and global defaults", () => {
    const repository = createRepository();

    repository.setStoredOpenAiApiKey("sk-test-123");
    repository.setStoredGoogleApiKey("gsk-test-456");
    repository.setProviderBrand("gemini");
    repository.setDebugEnabledDefault(true);
    repository.setTracePanelDefaultOpen(false);
    repository.setBlockChatOnDirtyGitDefault(false);
    repository.setDirtyGitChangeLimitDefault(7);
    repository.setAutoCompactContextThresholdPercentDefault(45);

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    expect(reloadedRepository.getStoredOpenAiApiKey()).toBe("sk-test-123");
    expect(reloadedRepository.getStoredGoogleApiKey()).toBe("gsk-test-456");
    expect(reloadedRepository.getProviderBrand()).toBe("gemini");
    expect(reloadedRepository.getDebugEnabledDefault()).toBe(true);
    expect(reloadedRepository.getTracePanelDefaultOpen()).toBe(false);
    expect(reloadedRepository.getBlockChatOnDirtyGitDefault()).toBe(false);
    expect(reloadedRepository.getDirtyGitChangeLimitDefault()).toBe(7);
    expect(reloadedRepository.getAutoCompactContextThresholdPercentDefault()).toBe(45);

    reloadedRepository.clearStoredOpenAiApiKey();
    reloadedRepository.clearStoredGoogleApiKey();
    expect(reloadedRepository.getStoredOpenAiApiKey()).toBeUndefined();
    expect(reloadedRepository.getStoredGoogleApiKey()).toBeUndefined();
  });

  test("persists workspace context and workspace modes across reload", () => {
    const repository = createRepository();

    repository.saveWorkspaceContext({
      rulesContent: " Prefer plan-first work. ",
      memorySummaryContent: " User likes concise updates. "
    });
    repository.saveMode("workspace", {
      id: "ship-fast",
      scope: "workspace",
      label: "Ship Fast",
      description: "Bias toward direct implementation.",
      plannerPrompt: "Plan for direct delivery.",
      executionPrompt: "Implement with minimal ceremony.",
      toolPolicy: "full-access",
      executionAccess: "workspace-write",
      updatedAt: new Date().toISOString()
    });

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const workspace = reloadedRepository.loadWorkspace();

    expect(workspace.workspaceRuleSource?.content).toBe("Prefer plan-first work.");
    expect(workspace.workspaceMemorySummary?.content).toBe("User likes concise updates.");
    expect((workspace.workspaceModes ?? []).map((mode) => mode.id)).toContain("ship-fast");
    expect(workspace.workspaceModes?.find((mode) => mode.id === "ship-fast")?.executionAccess).toBe("workspace-write");
  });

  test("persists project context, selected mode, and project modes across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.saveMode("project", {
      id: "focus-fix",
      scope: "project",
      label: "Focus Fix",
      description: "Small targeted repair mode.",
      plannerPrompt: "Keep scope narrow.",
      executionPrompt: "Touch smallest safe slice.",
      toolPolicy: "read-heavy",
      executionAccess: "workspace-write",
      planExecutionModeDefault: "approve",
      updatedAt: new Date().toISOString()
    }, project.id);
    repository.setProjectSelectedMode(project.id, "focus-fix");
    repository.saveProjectContext(project.id, {
      rulesContent: " Stay inside selected package. ",
      threadMemorySummaryContent: " Current bug around planner refinement. "
    });

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.selectedModeId).toBe("focus-fix");
    expect(restoredProject.projectRuleSource?.content).toBe("Stay inside selected package.");
    expect(restoredProject.threadMemorySummary?.content).toBe("Current bug around planner refinement.");
    expect((restoredProject.projectModes ?? []).map((mode) => mode.id)).toContain("focus-fix");
    expect(restoredProject.projectModes?.find((mode) => mode.id === "focus-fix")?.executionAccess).toBe("workspace-write");

    reloadedRepository.deleteMode("project", "focus-fix", project.id);
    const afterDelete = reloadedRepository.getProject(project.id);
    expect(afterDelete.selectedModeId).toBe("implement");
    expect((afterDelete.projectModes ?? []).map((mode) => mode.id)).not.toContain("focus-fix");
  });

  test("persists message attachments across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "Review attachment", {
      attachments: [
        {
          id: "attachment-1",
          kind: "text",
          name: "spec.md",
          mimeType: "text/markdown",
          sizeBytes: 128,
          url: "https://example.com/spec.md",
          key: "spec-key",
          uploadedAt: new Date().toISOString()
        }
      ]
    });

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.session.messages[0]?.attachments?.[0]?.name).toBe("spec.md");
    expect(restoredProject.session.messages[0]?.attachments?.[0]?.kind).toBe("text");
  });

  test("persists trusted chat attachment upload metadata", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const attachment = {
      id: "attachment-1",
      kind: "text",
      name: "spec.md",
      mimeType: "text/markdown",
      sizeBytes: 128,
      url: "https://example.com/spec.md",
      key: "spec-key",
      uploadedAt: new Date().toISOString()
    } as const;

    repository.saveChatAttachmentUpload({
      projectId: project.id,
      threadId: project.activeThreadId,
      attachment
    });

    expect(repository.getChatAttachmentUpload("spec-key")).toMatchObject({
      projectId: project.id,
      threadId: project.activeThreadId,
      attachment
    });
  });

  test("persists assistant state and purges assistant jobs on delete", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const assistantId = createAssistantId();
    const now = new Date().toISOString();

    repository.saveAssistant({
      id: assistantId,
      name: "Mr Miyagi",
      scope: "project",
      projectId: project.id,
      description: "Karate mentor",
      personalityPrompt: "Patient, direct, calm.",
      jobPrompt: "Teach karate. Research first, then act when needed.",
      agentId: "pi",
      modeId: undefined,
      executionModelId: undefined,
      reasoningStrength: "extra-high",
      runState: "active",
      bootstrapState: "pending",
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
    repository.appendAssistantMessage(assistantId, "user", "Teach me balance.");
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId,
      title: "Research basic karate stance lesson",
      description: undefined,
      state: "pending",
      sortOrder: 0,
      source: "bootstrap",
      createdAt: now,
      updatedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "User prefers fundamentals first.",
      source: "bootstrap",
      confidence: "high",
      createdAt: now
    });
    repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId,
      prompt: "Do you want kata or sparring first?",
      status: "pending",
      linkedTodoIds: [],
      askedAt: now
    });
    repository.appendAssistantLogEntry({
      id: createAssistantLogEntryId(),
      assistantId,
      level: "info",
      summary: "Bootstrap started",
      detail: "Researching karate mentor role.",
      detailsJson: { stage: "bootstrap" },
      createdAt: now
    });

    repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId,
      automationThreadId: project.activeThreadId,
      templateId: undefined,
      createdFromRunId: undefined,
      kind: "ai-routine",
      name: "Morning kata",
      description: "Daily practice prompt",
      status: "enabled",
      riskLevel: "unsafe",
      definition: {
        kind: "ai-routine",
        prompt: "Plan today's kata."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: now,
        sourceText: "1h"
      },
      scheduleInput: "1h",
      timezone: "America/New_York",
      nextRunAt: now,
      lastRunAt: undefined,
      lastEnqueuedAt: undefined,
      createdAt: now,
      updatedAt: now
    });
    const savedJob = repository.loadBackgroundJobsState().jobs[0];
    expect(savedJob?.assistantId).toBe(assistantId);
    const savedRun = repository.createBackgroundJobRun({
      jobId: savedJob!.id,
      projectId: project.id,
      assistantId,
      automationThreadId: project.activeThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: "unsafe",
      approvalStatus: "approved"
    });

    const assistants = repository.loadAssistantsState();
    expect(assistants.assistants[0]?.id).toBe(assistantId);
    expect(assistants.assistants[0]?.reasoningStrength).toBe("extra-high");
    expect(assistants.threads[0]?.messages[0]?.content).toBe("Teach me balance.");
    expect(assistants.todos[0]?.title).toContain("karate stance");
    expect(assistants.questions[0]?.prompt).toContain("kata");

    repository.deleteAssistant(assistantId);

    expect(repository.getAssistant(assistantId, true)?.deletedAt).toBeDefined();
    expect(repository.loadAssistantsState().assistants).toHaveLength(0);
    expect(repository.loadBackgroundJobsState().jobs).toHaveLength(0);
    expect(repository.getBackgroundJobRun(savedRun.id)).toBeUndefined();
  });

  test("normalizes oversized assistant learning sources on save and load", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const assistantId = createAssistantId();
    const now = new Date().toISOString();
    const oversizedSource = `reprioritize:${"x".repeat(400)}`;

    repository.saveAssistant({
      id: assistantId,
      name: "Learning helper",
      scope: "global",
      personalityPrompt: "Remember useful facts.",
      jobPrompt: "Track durable learnings.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });

    const saved = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "Keep learning sources protocol-safe.",
      source: oversizedSource,
      confidence: "medium",
      createdAt: now
    });
    expect(saved).toBeDefined();
    expect(saved?.source).toHaveLength(256);

    const legacyDb = new Database(dbPath, { strict: true });
    legacyDb
      .query(
        `INSERT INTO assistant_learnings (id, assistant_id, summary, source, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(
        createAssistantLearningId(),
        assistantId,
        "Legacy oversized learning source still loads.",
        oversizedSource,
        "high",
        now
      );
    legacyDb.close();

    const learnings = repository.loadAssistantsState().learnings;
    expect(learnings).toHaveLength(2);
    expect(learnings.every((learning) => learning.source.length <= 256)).toBe(true);
    expect(learnings.every((learning) => learning.kind === "fact")).toBe(true);
  });

  test("pages assistant summaries and selected assistant detail with stable cursors", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) {
      const createdAt = new Date(now + index * 1000).toISOString();
      repository.appendAssistantMessage(assistant.id, "user", `Message ${index}`, { createdAt });
      repository.saveAssistantTodo({
        id: createAssistantTodoId(),
        assistantId: assistant.id,
        title: `Todo ${index}`,
        state: "pending",
        sortOrder: index,
        source: "assistant",
        workKind: "unspecified",
        createdAt,
        updatedAt: createdAt
      });
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Learning ${index}`,
        source: "test",
        confidence: "medium",
        createdAt
      });
      repository.saveAssistantQuestion({
        id: createAssistantQuestionId(),
        assistantId: assistant.id,
        prompt: `Question ${index}?`,
        status: "pending",
        linkedTodoIds: [],
        askedAt: createdAt
      });
      repository.appendAssistantLogEntry({
        id: createAssistantLogEntryId(),
        assistantId: assistant.id,
        level: "info",
        summary: `Log ${index}`,
        createdAt
      });
    }

    const summary = repository.listAssistantSummaries({ limit: 1 });
    expect(summary.items).toHaveLength(1);
    expect(summary.totalApprox).toBe(1);
    expect(repository.loadAssistantSummaryState().todos).toHaveLength(0);

    const firstTodos = repository.listAssistantTodos({ assistantId: assistant.id, limit: 2 });
    const secondTodos = repository.listAssistantTodos({ assistantId: assistant.id, cursor: firstTodos.nextCursor, limit: 2 });
    expect(firstTodos.items.map((todo) => todo.title)).toEqual(["Todo 0", "Todo 1"]);
    expect(secondTodos.items.map((todo) => todo.title)).toEqual(["Todo 2", "Todo 3"]);

    const firstLogs = repository.listAssistantLogs({ assistantId: assistant.id, limit: 2 });
    const secondLogs = repository.listAssistantLogs({ assistantId: assistant.id, cursor: firstLogs.nextCursor, limit: 2 });
    expect(firstLogs.items.map((entry) => entry.summary)).toEqual(["Log 4", "Log 3"]);
    expect(secondLogs.items.map((entry) => entry.summary)).toEqual(["Log 2", "Log 1"]);

    const firstMessages = repository.listAssistantThreadMessages({ assistantId: assistant.id, limit: 2 });
    const secondMessages = repository.listAssistantThreadMessages({
      assistantId: assistant.id,
      cursor: firstMessages.nextCursor,
      limit: 2
    });
    expect(firstMessages.items.map((message) => message.content)).toEqual(["Message 3", "Message 4"]);
    expect(secondMessages.items.map((message) => message.content)).toEqual(["Message 1", "Message 2"]);

    const detail = repository.getAssistantDetail({ assistantId: assistant.id });
    expect(detail.thread?.messages.at(-1)?.content).toBe("Message 4");
    expect(detail.todos.items).toHaveLength(5);
    expect(detail.learnings.items).toHaveLength(5);
    expect(detail.questions.items).toHaveLength(5);
    expect(detail.logs.items).toHaveLength(5);
  });

  test("rejects garbage assistant learning summaries", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();

    expect(
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: "merged durable assistant guidance",
        source: "compaction:test",
        confidence: "high",
        createdAt: now
      })
    ).toBeUndefined();
    expect(
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: "Compacted summary\nmerged durable assistant guidance",
        source: "compaction:test",
        confidence: "high",
        createdAt: now
      })
    ).toBeUndefined();
    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(0);
  });

  test("startup cleanup removes garbage assistant learning rows", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const legacyDb = new Database(dbPath, { strict: true });
    legacyDb
      .query(
        `INSERT INTO assistant_learnings (id, assistant_id, summary, source, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(createAssistantLearningId(), assistant.id, "Compacted summary!!!", "legacy", "high", now);
    legacyDb
      .query(
        `INSERT INTO assistant_learnings (id, assistant_id, summary, source, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(createAssistantLearningId(), assistant.id, "Keep real launch guidance.", "legacy", "medium", now);
    legacyDb.close();

    const repairedRepository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });

    expect(repairedRepository.getAssistantLearnings(assistant.id).map((learning) => learning.summary)).toEqual([
      "Keep real launch guidance."
    ]);
  });

  test("dedupes exact and fuzzy assistant learnings per assistant", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const otherAssistant = addLearningAssistant(repository);
    const now = new Date().toISOString();

    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "User prefers fundamentals first during assistant learning sessions.",
      source: "bootstrap",
      confidence: "medium",
      createdAt: now
    });
    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: " user prefers fundamentals first during assistant learning sessions ",
      source: "question:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 1000).toISOString()
    });
    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "User prefers fundamentals first during assistant learning sessions now",
      source: "reprioritize:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 2000).toISOString()
    });
    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: otherAssistant.id,
      summary: "User prefers fundamentals first.",
      source: "bootstrap",
      confidence: "medium",
      createdAt: now
    });

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]?.confidence).toBe("high");
    expect(learnings[0]?.createdAt).toBe(now);
    expect(repository.getAssistantLearnings(otherAssistant.id)).toHaveLength(1);
  });

  test("skips similar HUD guidance instead of saving another active learning", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();

    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "HUD text should stay dense and readable during combat.",
      source: "question:test",
      confidence: "medium",
      createdAt: now
    });
    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "HUD texts need denser readable combat displays.",
      source: "reprioritize:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 1000).toISOString()
    });

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]?.summary).toBe("HUD text should stay dense and readable during combat.");
  });

  test("merges shared-premise guidance while preserving identity and stronger confidence", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const first = repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Arcade games need tight controls.",
      source: "question:test",
      confidence: "medium",
      createdAt: now
    });
    if (!first) {
      throw new Error("Expected initial shared-premise learning to save");
    }
    const secondCreatedAt = new Date(Date.now() + 1000).toISOString();

    repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Arcade games need fluid physics.",
      source: "reprioritize:test",
      confidence: "high",
      createdAt: secondCreatedAt
    });

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]?.id).toBe(first.id);
    expect(learnings[0]?.createdAt).toBe(now);
    expect(learnings[0]?.confidence).toBe("high");
    expect(learnings[0]?.summary).toBe("Arcade games need tight controls and fluid physics.");
  });

  test("compacts assistant learnings while preserving active summary row", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const first = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Old low-value fact.",
      source: "bootstrap",
      confidence: "low",
      createdAt: now
    });
    const second = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Another medium fact.",
      source: "reprioritize",
      confidence: "medium",
      createdAt: now
    });
    if (!first || !second) {
      throw new Error("Expected source learnings to save");
    }

    repository.compactAssistantLearnings(
      assistant.id,
      {
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: "Merged assistant guidance.",
        source: "compaction:test",
        confidence: "high",
        createdAt: now,
        kind: "summary",
        compactedAt: now
      },
      [first.id, second.id]
    );

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]?.kind).toBe("summary");
    expect(learnings[0]?.summary).toBe("Merged assistant guidance.");
    expect(learnings[0]?.supersedesLearningIds).toEqual([first.id, second.id]);
    expect(repository.getAssistantLearningStats(assistant.id)).toMatchObject({
      activeLearningCount: 1,
      activeFactLearningCount: 0
    });
  });

  test("deletes assistant todos and learnings by assistant scope", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const otherAssistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const todo = repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Remove stale todo",
      state: "pending",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    });
    repository.saveAssistantTodo({
      ...todo,
      id: createAssistantTodoId(),
      assistantId: otherAssistant.id,
      title: "Keep other todo"
    });
    const learning = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Remove stale learning.",
      source: "test",
      confidence: "medium",
      createdAt: now
    });
    if (!learning) {
      throw new Error("Expected assistant learning to save");
    }
    repository.saveAssistantLearning({
      ...learning,
      id: createAssistantLearningId(),
      assistantId: otherAssistant.id,
      summary: "Keep other learning."
    });

    repository.deleteAssistantTodo(assistant.id, todo.id);
    repository.deleteAssistantLearning(assistant.id, learning.id);

    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantTodos(otherAssistant.id).map((entry) => entry.title)).toEqual(["Keep other todo"]);
    expect(repository.getAssistantLearnings(otherAssistant.id).map((entry) => entry.summary)).toEqual(["Keep other learning."]);
  });

  test("updates assistant todos by assistant scope", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const otherAssistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const todo = repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Original todo",
      state: "pending",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    });

    expect(() => repository.updateAssistantTodo(otherAssistant.id, todo.id, { title: "Wrong assistant" })).toThrow(
      "Unknown assistant todo for assistant"
    );

    const updated = repository.updateAssistantTodo(assistant.id, todo.id, {
      title: "Updated todo",
      state: "completed",
      workKind: "app-code",
      workTarget: "src/app.ts"
    });
    expect(updated.title).toBe("Updated todo");
    expect(updated.state).toBe("completed");
    expect(updated.workKind).toBe("app-code");
    expect(updated.workTarget).toBe("src/app.ts");
    expect(updated.completedAt).toBeDefined();
  });

  test("adds assistant todo work metadata columns during migration", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const todo = repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Build UI primitive",
      state: "pending",
      sortOrder: 0,
      workKind: "app-code",
      workTarget: "harness/ui/src/components/primitives/button.tsx",
      createdAt: now,
      updatedAt: now
    });

    const reloadedRepository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const reloaded = reloadedRepository.getAssistantTodoForAssistant(assistant.id, todo.id);

    expect(reloaded.workKind).toBe("app-code");
    expect(reloaded.workTarget).toBe("harness/ui/src/components/primitives/button.tsx");
  });

  test("normalizes legacy custom assistant todo sources during migration", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const assistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const todo = repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Legacy sourced todo",
      state: "pending",
      sortOrder: 0,
      source: "assistant",
      createdAt: now,
      updatedAt: now
    });

    const db = new Database(dbPath, { strict: true });
    db.query(`UPDATE assistant_todos SET source = 'orrn-research' WHERE id = ?1`).run(todo.id);
    db.close();

    const reloadedRepository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    expect(reloadedRepository.getAssistantTodos(assistant.id)[0]?.source).toBe("assistant");

    const reloadedDb = new Database(dbPath, { readonly: true, strict: true });
    expect(reloadedDb.query<{ source: string | null }, [string]>(`SELECT source FROM assistant_todos WHERE id = ?1`).get(todo.id)?.source).toBe("assistant");
    reloadedDb.close();
  });

  test("reorders assistant learnings by assistant scope", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const otherAssistant = addLearningAssistant(repository);
    const now = new Date().toISOString();
    const first = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "First learning.",
      source: "test",
      confidence: "medium",
      createdAt: now
    });
    const second = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Second learning.",
      source: "test",
      confidence: "medium",
      createdAt: now
    });
    const other = repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: otherAssistant.id,
      summary: "Other learning.",
      source: "test",
      confidence: "medium",
      createdAt: now
    });
    if (!first || !second || !other) {
      throw new Error("Expected assistant learnings to save");
    }

    expect(() => repository.reorderAssistantLearnings(assistant.id, [second.id, first.id, other.id])).toThrow(
      "Assistant learning reorder contains unknown learning"
    );
    repository.reorderAssistantLearnings(assistant.id, [second.id, first.id]);

    expect(repository.getAssistantLearnings(assistant.id).map((entry) => entry.summary)).toEqual([
      "Second learning.",
      "First learning."
    ]);
    expect(repository.getAssistantLearnings(otherAssistant.id).map((entry) => entry.summary)).toEqual(["Other learning."]);
  });

  test("drops completed assistant todos after retention window", () => {
    const repository = createRepository();
    const assistant = addLearningAssistant(repository);
    const now = new Date("2026-04-30T12:00:00.000Z");
    const staleCompletedAt = new Date("2026-04-10T12:00:00.000Z").toISOString();
    const recentCompletedAt = new Date("2026-04-25T12:00:00.000Z").toISOString();
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Drop old done todo",
      state: "completed",
      sortOrder: 0,
      createdAt: staleCompletedAt,
      updatedAt: staleCompletedAt,
      completedAt: staleCompletedAt
    });
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Keep recent done todo",
      state: "completed",
      sortOrder: 1,
      createdAt: recentCompletedAt,
      updatedAt: recentCompletedAt,
      completedAt: recentCompletedAt
    });
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: "Keep active todo",
      state: "pending",
      sortOrder: 2,
      createdAt: staleCompletedAt,
      updatedAt: staleCompletedAt
    });

    repository.pruneCompletedAssistantTodos(now);

    expect(repository.getAssistantTodos(assistant.id).map((entry) => entry.title)).toEqual([
      "Keep recent done todo",
      "Keep active todo"
    ]);
  });

  test("repairs recoverable assistant persisted field violations during load", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const assistantId = createAssistantId();
    const now = new Date().toISOString();
    const long = "x".repeat(40000);

    repository.saveAssistant({
      id: assistantId,
      name: "State helper",
      scope: "global",
      personalityPrompt: "Keep state safe.",
      jobPrompt: "Repair persisted rows.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId,
      title: "Short todo",
      state: "pending",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    });
    repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId,
      prompt: "Short question?",
      status: "pending",
      askedAt: now
    });
    repository.appendAssistantLogEntry({
      id: createAssistantLogEntryId(),
      assistantId,
      level: "info",
      summary: "Short log",
      createdAt: now
    });

    const db = new Database(dbPath, { strict: true });
    db.query(
      `UPDATE assistants
       SET name = ?1, description = ?1, personality_prompt = ?1, job_prompt = ?1, circuit_breaker_reason = ?1,
           failure_streak_count = 2000
       WHERE id = ?2`
    ).run(long, assistantId);
    db.query(
      `UPDATE assistant_threads
       SET memory_summary_content = ?1
       WHERE assistant_id = ?2`
    ).run(long, assistantId);
    db.query(
      `UPDATE assistant_todos
       SET title = ?1, description = ?1, blocker_reason = ?1, sort_order = -10
       WHERE assistant_id = ?2`
    ).run(long, assistantId);
    db.query(
      `UPDATE assistant_questions
       SET prompt = ?1, answer_text = ?1, linked_todo_ids_json = 'not-json'
       WHERE assistant_id = ?2`
    ).run(long, assistantId);
    db.query(
      `UPDATE assistant_log_entries
       SET summary = ?1, detail = ?1, details_json = 'not-json'
       WHERE assistant_id = ?2`
    ).run(long, assistantId);
    db.query(
      `INSERT INTO assistant_asset_refs (
        id, assistant_id, kind, label, value, canonical_value, scope, provenance, resolution_status, resolution_error, created_at
      ) VALUES (?1, ?2, 'skill', ?3, ?3, ?3, 'workspace', 'repo-skill', 'missing', ?3, ?4)`
    ).run(createAssistantAssetRefId(), assistantId, long, now);
    db.close();

    const state = repository.loadAssistantsState();

    expect(state.assistants[0]?.name).toHaveLength(256);
    expect(state.assistants[0]?.personalityPrompt).toHaveLength(8000);
    expect(state.assistants[0]?.jobPrompt).toHaveLength(12000);
    expect(state.assistants[0]?.failureStreakCount).toBe(1000);
    expect(state.threads[0]?.memorySummary?.content).toHaveLength(32000);
    expect(state.todos[0]?.title).toHaveLength(512);
    expect(state.todos[0]?.description).toHaveLength(4000);
    expect(state.todos[0]?.blockerReason).toHaveLength(4000);
    expect(state.todos[0]?.sortOrder).toBe(0);
    expect(state.questions[0]?.prompt).toHaveLength(8000);
    expect(state.questions[0]?.answerText).toHaveLength(32000);
    expect(state.questions[0]?.linkedTodoIds).toEqual([]);
    expect(state.logs[0]?.summary).toHaveLength(1024);
    expect(state.logs[0]?.detail).toHaveLength(4000);
    expect(state.logs[0]?.detailsJson).toBeUndefined();
    expect(state.assetRefs[0]?.label).toHaveLength(256);
    expect(state.assetRefs[0]?.value).toHaveLength(4096);
    expect(state.assetRefs[0]?.resolutionError).toHaveLength(1024);
  });

  test("repairs recoverable global persisted field violations during load", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const project = addProject(repository);
    const now = new Date().toISOString();
    const long = "x".repeat(40000);

    repository.appendMessage(project.id, "user", "hello", {
      attachments: [
        {
          id: "attachment-1",
          kind: "text",
          name: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 12,
          url: "https://example.com/file.txt",
          key: "file-key",
          uploadedAt: now
        }
      ]
    });
    const withRun = repository.createAgentRun(project.id, "needs work", "openai/gpt-5.4");
    const runId = withRun.activeRun!.id;
    repository.saveMemoryEntry({
      id: createMemoryEntryId(),
      projectId: project.id,
      kind: "task-summary",
      status: "active",
      title: "Memory",
      summary: "Remember this.",
      tags: ["tag"],
      pathGlobs: ["**/*"],
      confidence: "medium",
      freshness: "fresh",
      pinned: false,
      priority: 50000,
      hitCount: 0,
      createdAt: now,
      updatedAt: now
    });
    repository.logMemoryRetrieval({
      id: createMemoryRetrievalId(),
      runId,
      owner: "planner",
      queryText: "memory query",
      entryIds: [],
      createdAt: now
    });
    const jobId = createBackgroundJobId();
    repository.saveBackgroundJob({
      id: jobId,
      projectId: project.id,
      automationThreadId: project.activeThreadId,
      kind: "ai-routine",
      name: "Routine",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Check status."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: now,
        sourceText: "1h"
      },
      scheduleInput: "1h",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    });
    const jobRun = repository.createBackgroundJobRun({
      jobId,
      projectId: project.id,
      automationThreadId: project.activeThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: "safe",
      approvalStatus: "not-needed"
    });
    repository.saveNotification({
      id: "notification-global-corrupt",
      kind: "background-run-status",
      interactive: false,
      backgroundRunId: jobRun.id,
      jobId,
      projectId: project.id,
      threadId: project.activeThreadId,
      title: "Job update",
      summary: "Running",
      severity: "info",
      createdAt: now
    });

    const db = new Database(dbPath, { strict: true });
    db.query(`UPDATE project_threads SET title_source = 'manual' WHERE id = ?1`).run(project.activeThreadId);
    db.query(`UPDATE thread_messages SET content = '', attachments_json = 'not-json', metadata_json = 'not-json'`).run();
    db.query(
      `UPDATE agent_runs
       SET latest_user_prompt = '', difficulty_score = 999, plan_json = 'not-json',
           correctness_review_json = 'not-json', browser_sessions_json = 'not-json', tool_activities_json = 'not-json'
       WHERE id = ?1`
    ).run(runId);
    db.query(
      `UPDATE background_jobs
       SET name = ?1, description = ?1, definition_json = 'not-json', schedule_json = 'not-json', schedule_input = ?1
       WHERE id = ?2`
    ).run(long, jobId);
    db.query(
      `UPDATE background_job_runs
       SET skipped_occurrence_count = -5, summary = ?1, failure_message = ?1
       WHERE id = ?2`
    ).run(long, jobRun.id);
    db.query(
      `UPDATE notifications
       SET payload_json = ?1
       WHERE id = 'notification-global-corrupt'`
    ).run(JSON.stringify({ kind: "background-run-status", title: long, summary: long, severity: "info" }));
    db.query(
      `UPDATE memory_entries
       SET title = ?1, summary = ?1, evidence = ?1, tags_json = 'not-json', path_globs_json = 'not-json',
           hit_count = -10, source_commit_sha = ?1`
    ).run(long);
    db.query(`UPDATE memory_retrievals SET query_text = ?1, entry_ids_json = 'not-json'`).run(long);
    db.close();

    const workspace = repository.loadWorkspace();
    const loadedRun = repository.getRun(project.id, runId);
    const jobs = repository.loadBackgroundJobsState();
    const notifications = repository.loadNotificationInboxState();
    const memories = repository.listMemoryEntries(project.id);

    expect(workspace.projects[0]?.session.messages[0]?.content).toBe("Recovered message");
    expect(workspace.projects[0]?.threads.find((thread) => thread.id === project.activeThreadId)?.titleSource).toBe("custom");
    expect(workspace.projects[0]?.session.messages[0]?.attachments).toBeUndefined();
    expect(workspace.projects[0]?.session.messages[0]?.metadata).toBeUndefined();
    expect(loadedRun?.latestUserPrompt).toBe("Recovered prompt");
    expect(loadedRun?.difficultyScore).toBe(100);
    expect(loadedRun?.plan).toBeUndefined();
    expect(loadedRun?.correctnessReview).toBeUndefined();
    expect(loadedRun?.memoryRetrievals?.[0]?.queryText).toHaveLength(32000);
    expect(loadedRun?.memoryRetrievals?.[0]?.entryIds).toEqual([]);
    expect(jobs.jobs[0]?.name).toHaveLength(256);
    expect(jobs.jobs[0]?.description).toHaveLength(1024);
    expect(jobs.jobs[0]?.scheduleInput).toHaveLength(512);
    expect(jobs.runs[0]?.skippedOccurrenceCount).toBe(0);
    expect(jobs.runs[0]?.summary).toHaveLength(4000);
    expect(jobs.runs[0]?.failureMessage).toHaveLength(4000);
    expect(notifications.items[0]?.kind).toBe("background-run-status");
    expect(notifications.items[0]?.kind === "background-run-status" ? notifications.items[0].title.length : 0).toBe(256);
    expect(notifications.items[0]?.kind === "background-run-status" ? notifications.items[0].summary.length : 0).toBe(4000);
    expect(memories[0]?.title).toHaveLength(256);
    expect(memories[0]?.summary).toHaveLength(4000);
    expect(memories[0]?.evidence).toHaveLength(16000);
    expect(memories[0]?.tags).toEqual([]);
    expect(memories[0]?.pathGlobs).toEqual([]);
    expect(memories[0]?.hitCount).toBe(0);
    expect(memories[0]?.sourceCommitSha).toHaveLength(256);
  });

  test("keeps cleared background notifications cleared when same status is re-saved", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = "2026-04-29T12:00:00.000Z";
    const jobId = createBackgroundJobId();
    repository.saveBackgroundJob({
      id: jobId,
      projectId: project.id,
      automationThreadId: project.activeThreadId,
      kind: "ai-routine",
      name: "Routine",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review."
      },
      schedule: { type: "one-off", runAt: now, sourceText: "manual" },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    });
    const run = repository.createBackgroundJobRun({
      jobId,
      projectId: project.id,
      automationThreadId: project.activeThreadId,
      triggerSource: "manual",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed"
    });
    const notification = {
      id: `background-run-status:${run.id}`,
      kind: "background-run-status" as const,
      interactive: false as const,
      createdAt: now,
      backgroundRunId: run.id,
      jobId,
      projectId: project.id,
      threadId: project.activeThreadId,
      title: "Background task done",
      summary: "Finished",
      severity: "info" as const
    };

    repository.saveNotification(notification);
    expect(repository.loadNotificationInboxState().unreadCount).toBe(1);

    repository.markAllPassiveNotificationsRead();
    expect(repository.loadNotificationInboxState()).toMatchObject({
      items: [],
      unreadCount: 0,
      passiveUnreadCount: 0
    });

    repository.saveNotification(notification);
    expect(repository.loadNotificationInboxState()).toMatchObject({
      items: [],
      unreadCount: 0,
      passiveUnreadCount: 0
    });
  });

  test("persists cli update notifications", () => {
    const repository = createRepository();
    const now = "2026-04-29T12:00:00.000Z";

    repository.saveNotification({
      id: "cli-update:claude-cli:2.1.147",
      kind: "cli-update",
      interactive: true,
      createdAt: now,
      agentId: "claude-cli",
      label: "Claude Code",
      currentVersion: "2.1.146",
      latestVersion: "2.1.147",
      updateCommand: "claude update"
    });

    expect(repository.loadNotificationInboxState()).toMatchObject({
      items: [
        {
          id: "cli-update:claude-cli:2.1.147",
          kind: "cli-update",
          interactive: true,
          agentId: "claude-cli",
          latestVersion: "2.1.147"
        }
      ],
      unreadCount: 1,
      interactiveUnreadCount: 1,
      passiveUnreadCount: 0
    });
  });

  test("migrates legacy notification kind constraint for cli updates", () => {
    const repository = createRepository();
    const dbPath = (repository as any).dbPath as string;
    const db = new Database(dbPath, { strict: true });
    db.exec(`
      ALTER TABLE notifications RENAME TO notifications_legacy;
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('planning-question', 'planning-question-batch', 'assistant-question', 'assistant-question-batch', 'browser-approval', 'background-run-status')),
        interactive INTEGER NOT NULL CHECK(interactive IN (0, 1)),
        project_id TEXT NULL,
        thread_id TEXT NULL,
        run_id TEXT NULL,
        assistant_id TEXT NULL,
        question_id TEXT NULL,
        session_id TEXT NULL,
        tool_call_id TEXT NULL,
        background_run_id TEXT NULL,
        job_id TEXT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT NULL,
        archived_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(background_run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
      );
      DROP TABLE notifications_legacy;
    `);
    db.close(false);

    const migratedRepository = new WorkspaceRepository(dbPath, process.cwd());
    migratedRepository.saveNotification({
      id: "cli-update:claude-cli:2.1.147",
      kind: "cli-update",
      interactive: true,
      createdAt: "2026-04-29T12:00:00.000Z",
      agentId: "claude-cli",
      label: "Claude Code",
      currentVersion: "2.1.146",
      latestVersion: "2.1.147",
      updateCommand: "claude update"
    });

    expect(migratedRepository.loadNotificationInboxState().items[0]?.kind).toBe("cli-update");
  });

  test("preserves recurring job next run when only last run changes", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = "2026-04-28T12:00:00.000Z";
    const nextRunAt = "2026-04-28T13:00:00.000Z";
    const jobId = createBackgroundJobId();
    repository.saveBackgroundJob({
      id: jobId,
      projectId: project.id,
      automationThreadId: project.activeThreadId,
      kind: "ai-routine",
      name: "Hourly review",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt,
        sourceText: "1h"
      },
      scheduleInput: "1h",
      nextRunAt,
      createdAt: now,
      updatedAt: now
    });

    repository.updateBackgroundJobSchedule(jobId, {
      lastRunAt: now
    });

    const updated = repository.getBackgroundJob(jobId);
    expect(updated?.nextRunAt).toBe(nextRunAt);
    expect(updated?.lastRunAt).toBe(now);
  });

  test("recovers tripped assistant circuit breaker", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const assistantId = createAssistantId();
    const now = new Date().toISOString();

    repository.saveAssistant({
      id: assistantId,
      name: "Recovery helper",
      scope: "project",
      projectId: project.id,
      personalityPrompt: "Recover carefully.",
      jobPrompt: "Recover assistant state.",
      agentId: "pi",
      runState: "paused",
      bootstrapState: "completed",
      failureStreakCount: 3,
      circuitBreakerState: "tripped",
      circuitBreakerReason: "Repeated executor failure",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });

    const recovered = repository.recoverAssistantCircuitBreaker(assistantId);

    expect(recovered.runState).toBe("active");
    expect(recovered.failureStreakCount).toBe(0);
    expect(recovered.circuitBreakerState).toBe("closed");
    expect(recovered.circuitBreakerReason).toBeUndefined();
  });

  test("persists active run questions and resumable subtasks across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "needs clarification");
    const withRun = repository.createAgentRun(project.id, "needs clarification", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    const withQuestion = repository.appendPlanningQuestion(project.id, runId!, {
      id: "question-1",
      prompt: "Which route should handle this?",
      placeholder: "api/users/[id]",
      choices: [
        {
          id: "choice-1",
          label: "API route",
          description: "Use provided API route.",
          answerText: "api/users/[id]",
          recommended: true
        },
        {
          id: "choice-2",
          label: "Web route",
          description: "Use a page route instead.",
          answerText: "users/[id]",
          recommended: false
        },
        {
          id: "choice-3",
          label: "Custom",
          description: "Type a custom route.",
          answerText: "custom route",
          recommended: false
        }
      ],
      required: true
    });
    repository.answerPlanningQuestion(project.id, runId!, withQuestion.activeRun?.questions[0]?.id ?? "question-1", "api/users/[id]");
    repository.setAgentRunReady(project.id, runId!, {
      type: "ready",
      difficultyScore: 72,
      summary: "Split work",
      executionModelId: "openai/gpt-5.4",
      usesSubagents: true,
      subtasks: [
        {
          id: "task-1",
          title: "Inspect",
          instruction: "Inspect files"
        },
        {
          id: "task-2",
          title: "Patch",
          instruction: "Patch code"
        }
      ],
      finalExecutionBrief: "Combine outputs"
    });
    repository.markSubtaskCompleted(project.id, runId!, "task-1", "inspection complete", 1);
    repository.markSubtaskFailed(project.id, runId!, "task-2", "timeout", 2);
    repository.setAgentRunStatus(project.id, runId!, "partial-complete");

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.activeRun?.status).toBe("partial-complete");
    expect(restoredProject.activeRun?.questions[0]?.answerText).toBe("api/users/[id]");
    expect(restoredProject.activeRun?.subtasks.find((task) => task.id === "task-1")?.status).toBe("completed");
    expect(restoredProject.activeRun?.subtasks.find((task) => task.id === "task-2")?.status).toBe("failed");
    expect(restoredProject.activeRun?.resumable).toBe(true);
  });

  test("reactivates resumable terminal agent runs", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "resume me");
    const withRun = repository.createAgentRun(project.id, "resume me", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();
    repository.setAgentRunReady(project.id, runId!, {
      type: "ready",
      difficultyScore: 20,
      summary: "Resume one task",
      executionModelId: "openai/gpt-5.4",
      usesSubagents: false,
      subtasks: [],
      finalExecutionBrief: "Run again"
    });
    repository.setAgentRunStatus(project.id, runId!, "partial-complete", "Previous partial result");

    const terminalRun = repository.getRun(project.id, runId!);
    expect(terminalRun?.status).toBe("partial-complete");
    expect(terminalRun?.completedAt).toBeDefined();
    expect(terminalRun?.failureMessage).toBe("Previous partial result");

    const resumedProject = repository.resumeAgentRun(project.id, runId!, "running-main");

    expect(resumedProject.activeRun?.id).toBe(runId);
    expect(resumedProject.activeRun?.status).toBe("running-main");
    expect(resumedProject.activeRun?.completedAt).toBeUndefined();
    expect(resumedProject.activeRun?.failureMessage).toBeUndefined();
    expect(resumedProject.activeRun?.resumable).toBe(false);
  });

  test("detects active foreground runs without counting active background-linked runs", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Background work",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Run background work."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    repository.createAgentRun(project.id, "background", "openai/gpt-5.4", job.automationThreadId);
    const backgroundAgentRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)?.id;
    expect(backgroundAgentRunId).toBeDefined();
    const backgroundRun = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "running",
      riskLevel: "safe",
      approvalStatus: "approved"
    });
    const linkedBackgroundRun = repository.setBackgroundJobRunStatus(backgroundRun.id, "running", {
      linkedAgentRunId: backgroundAgentRunId
    });
    repository.setAgentRunStatus(project.id, backgroundAgentRunId!, "running-main");

    expect(linkedBackgroundRun.linkedAgentRunId).toBe(backgroundAgentRunId);
    expect(repository.hasActiveForegroundAgentRun()).toBe(false);

    const foregroundProject = repository.createAgentRun(project.id, "foreground", "openai/gpt-5.4", project.activeThreadId);
    const foregroundRunId = foregroundProject.activeRun?.id;
    expect(foregroundRunId).toBeDefined();
    repository.setAgentRunStatus(project.id, foregroundRunId!, "running-main");

    expect(repository.hasActiveForegroundAgentRun()).toBe(true);
  });

  test("persists freeform planning questions without choices", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const withRun = repository.createAgentRun(project.id, "create assistant", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    const withQuestion = repository.appendPlanningQuestion(project.id, runId!, {
      id: "assistant-create-purpose",
      prompt: "What should Kojima do for this project?",
      placeholder: "Use Kojima to triage failed tests, maintain docs, and keep project todos current.",
      responseKind: "freeform",
      required: true,
      intent: {
        type: "assistant-create-intent",
        projectId: project.id,
        threadId: project.activeThreadId,
        sourcePrompt: "create a new local project assistant kojima",
        suggestedName: "kojima",
        defaultScope: "project",
        requiresPurpose: true
      }
    });

    const stored = withQuestion.activeRun?.questions[0];
    expect(stored?.responseKind).toBe("freeform");
    expect(stored?.choices).toBeUndefined();

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restored = reloadedRepository.getProject(project.id).activeRun?.questions[0];
    expect(restored?.responseKind).toBe("freeform");
    expect(restored?.choices).toBeUndefined();
    expect(restored?.placeholder).toContain("Kojima");
  });

  test("persists planning question assistant intent metadata", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const withRun = repository.createAgentRun(project.id, "Catalog builder start executing todos", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    const withQuestion = repository.appendPlanningQuestion(project.id, runId!, {
      id: "assistant-create-intent",
      prompt: "Do you want to create a project assistant named \"Catalog builder\", or run this once in project chat?",
      choices: [
        {
          id: "choice-1",
          label: "Create project assistant",
          description: "Create a project-scoped assistant.",
          answerText: "Create a project assistant named \"Catalog builder\" from this prompt.",
          recommended: true
        },
        {
          id: "choice-2",
          label: "Run once",
          description: "Run once in project chat.",
          answerText: "Run once.",
          recommended: false
        },
        {
          id: "choice-3",
          label: "Cancel",
          description: "Cancel this request.",
          answerText: "Cancel this request.",
          recommended: false
        }
      ],
      required: true,
      intent: {
        type: "assistant-create-intent",
        projectId: project.id,
        threadId: project.activeThreadId,
        sourcePrompt: "Catalog builder start executing todos",
        suggestedName: "Catalog builder",
        defaultScope: "project"
      }
    });

    const storedIntent = withQuestion.activeRun?.questions[0]?.intent;
    expect(storedIntent?.type).toBe("assistant-create-intent");
    expect(storedIntent?.type === "assistant-create-intent" ? storedIntent.suggestedName : undefined).toBe("Catalog builder");

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);
    const restoredIntent = restoredProject.activeRun?.questions[0]?.intent;
    expect(restoredIntent?.type).toBe("assistant-create-intent");
    expect(restoredIntent?.type === "assistant-create-intent" ? restoredIntent.suggestedName : undefined).toBe("Catalog builder");
  });

  test("resolves assistant skill refs before persisting", () => {
    const tempRoot = createTempDir();
    const repoRoot = path.join(tempRoot, `assistant-repo-${crypto.randomUUID()}`);
    const skillPath = path.join(repoRoot, ".agents", "skills", "review", "SKILL.md");
    mkdirSync(path.dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, "# Review\n");
    const repository = new WorkspaceRepository(path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`), repoRoot, {
      durability: "test-fast"
    });
    const assistantId = createAssistantId();
    const now = new Date().toISOString();

    repository.saveAssistant(
      {
        id: assistantId,
        name: "Reviewer",
        scope: "global",
        personalityPrompt: "Precise.",
        jobPrompt: "Review code.",
        agentId: "pi",
        runState: "active",
        bootstrapState: "pending",
        failureStreakCount: 0,
        circuitBreakerState: "closed",
        unreadQuestionCount: 0,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: createAssistantAssetRefId(),
          assistantId,
          kind: "skill",
          label: "Review",
          value: "review",
          resolutionStatus: "resolved",
          createdAt: now
        }
      ]
    );

    expect(repository.getAssistantAssetRefs(assistantId)[0]).toMatchObject({
      canonicalValue: ".agents/skills/review/SKILL.md",
      provenance: "repo-skill",
      resolutionStatus: "resolved"
    });
  });

  test("rejects unresolved assistant refs", () => {
    const repository = createRepository();
    const assistantId = createAssistantId();
    const now = new Date().toISOString();

    expect(() =>
      repository.saveAssistant(
        {
          id: assistantId,
          name: "Reviewer",
          scope: "global",
          personalityPrompt: "Precise.",
          jobPrompt: "Review code.",
          agentId: "pi",
          runState: "active",
          bootstrapState: "pending",
          failureStreakCount: 0,
          circuitBreakerState: "closed",
          unreadQuestionCount: 0,
          createdAt: now,
          updatedAt: now
        },
        [
          {
            id: createAssistantAssetRefId(),
            assistantId,
            kind: "skill",
            label: "Missing",
            value: "missing-skill",
            resolutionStatus: "resolved",
            createdAt: now
          }
        ]
      )
    ).toThrow(/Assistant asset Missing is missing/);
  });

  test("sets completedAt for every terminal run status without overwriting it", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const createRun = (prompt: string) => {
      const withRun = repository.createAgentRun(project.id, prompt, "openai/gpt-5.4");
      const runId = withRun.activeRun?.id;
      expect(runId).toBeDefined();
      return runId!;
    };

    const failedRunId = createRun("failed run");
    repository.setAgentRunStatus(project.id, failedRunId, "failed");
    const failedCompletedAt = repository.getRun(project.id, failedRunId)?.completedAt;
    expect(failedCompletedAt).toBeDefined();
    repository.setAgentRunStatus(project.id, failedRunId, "stopped");
    expect(repository.getRun(project.id, failedRunId)?.completedAt).toBe(failedCompletedAt);

    const stoppedRunId = createRun("stopped run");
    repository.setAgentRunStatus(project.id, stoppedRunId, "stopped");
    expect(repository.getRun(project.id, stoppedRunId)?.completedAt).toBeDefined();

    const partialRunId = createRun("partial run");
    repository.setAgentRunStatus(project.id, partialRunId, "partial-complete");
    expect(repository.getRun(project.id, partialRunId)?.completedAt).toBeDefined();

    const runningRunId = createRun("running run");
    repository.setAgentRunStatus(project.id, runningRunId, "running-main");
    expect(repository.getRun(project.id, runningRunId)?.completedAt).toBeUndefined();
  });

  test("does not resurrect terminal runs from stale planning questions", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const withRun = repository.createAgentRun(project.id, "needs answer", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();
    const withQuestion = repository.appendPlanningQuestion(project.id, runId!, {
      id: "question-1",
      prompt: "Which route?",
      placeholder: "api/users",
      choices: [
        { id: "choice-1", label: "API", description: "Use API.", answerText: "api/users", recommended: true },
        { id: "choice-2", label: "Page", description: "Use page.", answerText: "users", recommended: false },
        { id: "choice-3", label: "Custom", description: "Use custom.", answerText: "custom", recommended: false }
      ],
      required: true
    });
    const questionId = withQuestion.activeRun?.questions[0]?.id;
    expect(questionId).toBeDefined();
    repository.setAgentRunStatus(project.id, runId!, "completed");
    const completedAt = repository.getRun(project.id, runId!)?.completedAt;

    expect(() => repository.answerPlanningQuestion(project.id, runId!, questionId!, "api/users")).toThrow(/Unknown pending planning question/);
    const run = repository.getRun(project.id, runId!);
    expect(run?.status).toBe("completed");
    expect(run?.completedAt).toBe(completedAt);
  });

  test("does not append planning questions to terminal runs", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const withRun = repository.createAgentRun(project.id, "terminal question", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();
    repository.setAgentRunStatus(project.id, runId!, "completed");
    const completedAt = repository.getRun(project.id, runId!)?.completedAt;

    repository.appendPlanningQuestion(project.id, runId!, {
      id: "question-1",
      prompt: "Late question?",
      choices: [],
      required: true
    });

    const run = repository.getRun(project.id, runId!);
    expect(run?.status).toBe("completed");
    expect(run?.completedAt).toBe(completedAt);
    expect(run?.questions).toHaveLength(0);
  });

  test("does not promote deferred planning questions on terminal runs", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const withRun = repository.createAgentRun(project.id, "deferred terminal question", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();
    repository.appendPlanningQuestion(
      project.id,
      runId!,
      {
        id: "question-1",
        prompt: "Deferred question?",
        choices: [],
        required: true
      },
      "deferred"
    );
    repository.setAgentRunStatus(project.id, runId!, "completed");
    const completedAt = repository.getRun(project.id, runId!)?.completedAt;

    expect(repository.promoteDeferredPlanningQuestions()).toEqual([]);
    const run = repository.getRun(project.id, runId!);
    expect(run?.status).toBe("completed");
    expect(run?.completedAt).toBe(completedAt);
    expect(run?.questions[0]?.status).toBe("deferred");
  });

  test("tracks explicit plan execution mode preference separately from fallback default", () => {
    const repository = createRepository();

    expect(repository.getPlanExecutionModeDefault()).toBe("countdown");
    expect(repository.getConfiguredPlanExecutionModeDefault()).toBeUndefined();

    repository.setPlanExecutionModeDefault("immediate");

    expect(repository.getPlanExecutionModeDefault()).toBe("immediate");
    expect(repository.getConfiguredPlanExecutionModeDefault()).toBe("immediate");
  });

  test("persists run summaries and high-effort execution plan contracts across reload", () => {
    const tempRoot = createTempDir();
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const project = addProject(repository);
    const withRun = repository.createAgentRun(project.id, "build persisted plan", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    const readyTurn = {
      type: "ready" as const,
      difficultyScore: 72,
      summary: "Persisted plan",
      executionModelId: "openai/gpt-5.4",
      usesSubagents: true,
      subtasks: [{ id: "task-1", title: "Large task", instruction: "Build the large task" }],
      finalExecutionBrief: "Build and verify",
      contracts: [
        {
          taskId: "task-1",
          title: "Large task",
          instruction: "Build the large task",
          effortPoints: 8,
          ownedPaths: ["src/large.ts"],
          dependsOnPrerequisiteIds: [],
          deliverables: ["large task"],
          integrationPoints: [],
          verificationScope: "owned-files-only" as const,
          verificationCommands: ["bun run typecheck"],
          mergeNotes: "Merge large task."
        }
      ]
    };

    const executionPlan: ExecutionPlan = {
        runId: runId!,
        origin: "initial",
        iteration: 1,
        summary: readyTurn.summary,
        finalExecutionBrief: readyTurn.finalExecutionBrief,
        difficultyScore: readyTurn.difficultyScore,
        planningModelId: "openai/gpt-5.4",
        executionModelId: "openai/gpt-5.4",
        route: "pi-subagents",
        subagentWorktreeStrategy: "same-worktree",
        targetSubagentCount: 2,
        actualSubagentCount: 2,
        gating: { mode: "approve", delaySeconds: 0 },
        prerequisites: [],
        contracts: readyTurn.contracts,
        correctnessPolicy: "ask-before-iterate"
      };

    repository.setAgentRunReady(
      project.id,
      runId!,
      readyTurn,
      executionPlan,
      readyTurn.subtasks,
      "openai/gpt-5.4"
    );

    const db = new Database(dbPath, { strict: true });
    db.query(`UPDATE agent_runs SET plan_json = ?2, correctness_review_json = ?3 WHERE id = ?1`).run(
      runId!,
      JSON.stringify({
        ...executionPlan,
        route: "subagents",
        subagentWorktreeStrategy: "same",
        gating: { mode: "manual", delaySeconds: 0 },
        correctnessPolicy: "manual",
        prerequisites: [
          {
            id: "setup-1",
            title: "Setup",
            instruction: "Prepare",
            reason: "Needed",
            requiredForTaskIds: ["task-1"],
            owner: "assistant",
            status: "done"
          }
        ],
        contracts: [{ ...readyTurn.contracts[0], verificationScope: "full-app" }]
      }),
      JSON.stringify({
        status: "failed",
        summary: "Needs work",
        gaps: [
          {
            id: "gap-1",
            category: "runtime",
            severity: "blocker",
            description: "App does not run",
            suggestedFix: "Fix runtime",
            canParallelize: false,
            ownedPaths: ["index.html"]
          }
        ],
        recommendedPlan: {
          ...executionPlan,
          origin: "correctness",
          route: "single",
          subagentWorktreeStrategy: "isolated",
          gating: { mode: "auto", delaySeconds: 0 },
          correctnessPolicy: "auto"
        }
      })
    );
    db.close();

    const reloadedRepository = new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.runSummaries).toContainEqual(
      expect.objectContaining({
        id: runId,
        status: "ready",
        resumable: false,
        retryable: false
      })
    );
    expect(restoredProject.activeRun?.plan?.contracts[0]?.effortPoints).toBe(8);
    expect(restoredProject.activeRun?.plan?.route).toBe("pi-subagents");
    expect(restoredProject.activeRun?.plan?.gating.mode).toBe("approve");
    expect(restoredProject.activeRun?.plan?.prerequisites[0]?.owner).toBe("main");
    expect(restoredProject.activeRun?.plan?.prerequisites[0]?.status).toBe("completed");
    expect(restoredProject.activeRun?.plan?.contracts[0]?.verificationScope).toBe("worktree-full");
    expect(restoredProject.activeRun?.correctnessReview?.status).toBe("needs-iteration");
    expect(restoredProject.activeRun?.correctnessReview?.gaps[0]?.category).toBe("runnable-gap");
    expect(restoredProject.activeRun?.correctnessReview?.gaps[0]?.severity).toBe("high");
    expect(restoredProject.activeRun?.correctnessReview?.recommendedPlan?.origin).toBe("correctness-followup");
    expect(restoredProject.activeRun?.correctnessReview?.recommendedPlan?.route).toBe("main");
  });

  test("reports repeated prompt hashes, owner prompt sizes, and failure categories", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();

    repository.appendMessage(project.id, "user", "diagnostic run");
    const createdRun = repository.createAgentRun(project.id, "diagnostic run", "openai/gpt-5.4");
    const agentRunId = createdRun.activeRun?.id;
    expect(agentRunId).toBeDefined();
    repository.setAgentRunPromptStats(project.id, agentRunId!, {
      promptChars: 1200,
      promptHash: "prompt-hash-agent",
      transcriptChars: 600,
      latestTaskChars: 80
    });
    repository.setAgentRunStatus(project.id, agentRunId!, "failed", "Planner returned empty response", "empty-response");

    const assistant = repository.saveAssistant({
      id: createAssistantId(),
      name: "Diagnostics helper",
      scope: "project",
      projectId: project.id,
      description: "Tracks run health",
      personalityPrompt: "Be direct.",
      jobPrompt: "Watch jobs.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });
    const savedJob = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Diagnostics job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect recurring failures."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    const firstJobRun = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: "safe",
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunPromptStats(firstJobRun.id, {
      promptChars: 2100,
      promptHash: "prompt-hash-job",
      transcriptChars: 1400,
      latestTaskChars: 120
    });
    repository.setBackgroundJobRunStatus(firstJobRun.id, "failed", {
      failureMessage: "Background run interrupted before completion",
      failureCategory: "controller-lost"
    });

    const secondJobRun = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "retry",
      status: "queued",
      riskLevel: "safe",
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunPromptStats(secondJobRun.id, {
      promptChars: 2200,
      promptHash: "prompt-hash-job",
      transcriptChars: 1500,
      latestTaskChars: 120
    });
    repository.setBackgroundJobRunStatus(secondJobRun.id, "failed", {
      failureMessage: "Background run interrupted before completion",
      failureCategory: "controller-lost"
    });

    const report = repository.getRunDiagnosticsReport(30);

    expect(report.topPromptHashes.some((entry) => entry.promptHash === "prompt-hash-job" && entry.runCount === 2)).toBe(true);
    expect(report.promptSizeByOwner.some((entry) => entry.jobId === savedJob.id && entry.assistantId === assistant.id)).toBe(true);
    expect(report.failureRows.some((entry) => entry.failureCategory === "controller-lost" && entry.jobId === savedJob.id && entry.count === 2)).toBe(true);
    expect(report.failureRows.some((entry) => entry.failureCategory === "empty-response" && entry.sourceType === "agent-run")).toBe(true);
  });

  test("renews background run leases only for the active running owner", () => {
    const repository = createRepository();
    const dbPath = (repository as any).dbPath as string;
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Lease renew",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Renew lease."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: "safe",
      approvalStatus: "approved"
    });

    repository.setBackgroundJobRunStatus(run.id, "running", {
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: "2026-05-01T15:00:00.000Z"
    });

    repository.renewBackgroundJobRunLease(run.id, "lease-1", "2026-05-01T15:15:00.000Z");
    let db = new Database(dbPath, { readonly: true, strict: true });
    expect(
      db.query<{ controller_lease_expires_at: string | null }, [string]>(
        `SELECT controller_lease_expires_at FROM background_job_runs WHERE id = ?1`
      ).get(run.id)?.controller_lease_expires_at
    ).toBe("2026-05-01T15:15:00.000Z");
    db.close(false);

    repository.renewBackgroundJobRunLease(run.id, "lease-2", "2026-05-01T15:30:00.000Z");
    db = new Database(dbPath, { readonly: true, strict: true });
    expect(
      db.query<{ controller_lease_expires_at: string | null }, [string]>(
        `SELECT controller_lease_expires_at FROM background_job_runs WHERE id = ?1`
      ).get(run.id)?.controller_lease_expires_at
    ).toBe("2026-05-01T15:15:00.000Z");
    db.close(false);

    repository.setBackgroundJobRunStatus(run.id, "failed", {
      failureMessage: "Background run interrupted before completion",
      failureCategory: "controller-lost"
    });
    repository.renewBackgroundJobRunLease(run.id, "lease-1", "2026-05-01T15:45:00.000Z");
    db = new Database(dbPath, { readonly: true, strict: true });
    expect(
      db.query<{ controller_lease_expires_at: string | null }, [string]>(
        `SELECT controller_lease_expires_at FROM background_job_runs WHERE id = ?1`
      ).get(run.id)?.controller_lease_expires_at
    ).toBe("2026-05-01T15:15:00.000Z");
    db.close(false);
  });

  test("requires owned controller lease for live background writes and keeps terminal states monotonic", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const now = new Date().toISOString();
    const job = repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Owned writes",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Check ownership."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      createdAt: now,
      updatedAt: now
    }).jobs[0]!;
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: "safe",
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(run.id, "running", {
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: "2026-05-01T15:00:00.000Z"
    });

    expect(repository.appendBackgroundJobRunEventIfOwned(run.id, "lease-2", "trace", "Late trace")).toBeUndefined();
    expect(
      repository.touchBackgroundJobRunIfOwned(run.id, "lease-2", { stage: "late-heartbeat", detail: "wrong owner" })
    ).toBeUndefined();
    expect(repository.setBackgroundJobRunStatusIfOwned(run.id, "lease-2", "succeeded", { summary: "wrong owner" })).toBeUndefined();

    let refreshedRun = repository.getBackgroundJobRun(run.id);
    expect(refreshedRun?.status).toBe("running");
    expect(refreshedRun?.heartbeatStage).toBe("running");
    expect(refreshedRun?.events.some((event) => event.message === "Late trace")).toBe(false);

    repository.appendBackgroundJobRunEventIfOwned(run.id, "lease-1", "trace", "Owned trace");
    const firstTimedOutAt = "2026-05-01T15:30:00.000Z";
    const secondTimedOutAt = "2026-05-01T15:45:00.000Z";
    repository.setBackgroundJobRunStatusIfOwned(run.id, "lease-1", "failed", {
      failureMessage: "Background run interrupted before completion",
      failureCategory: "controller-lost",
      timedOutAt: firstTimedOutAt
    });
    repository.setBackgroundJobRunStatus(run.id, "succeeded", { summary: "late success" });
    repository.setBackgroundJobRunStatus(run.id, "failed", {
      failureMessage: "late timeout rewrite",
      failureCategory: "max-runtime-timeout",
      timedOutAt: secondTimedOutAt,
      allowTerminalRewrite: true
    });
    repository.appendBackgroundJobRunEvent(run.id, "trace", "Late non-terminal trace");
    refreshedRun = repository.getBackgroundJobRun(run.id);
    expect(refreshedRun?.status).toBe("failed");
    expect(refreshedRun?.failureCategory).toBe("max-runtime-timeout");
    expect(refreshedRun?.timedOutAt).toBe(firstTimedOutAt);
    expect(refreshedRun?.events.some((event) => event.message === "Owned trace")).toBe(true);
    expect(refreshedRun?.events.some((event) => event.message === "Late non-terminal trace")).toBe(false);

    repository.createAgentRun(project.id, "terminal run", "openai/gpt-5.4", job.automationThreadId);
    const agentRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
    repository.setAgentRunStatus(project.id, agentRunId, "failed", "failed first", "controller-lost");
    repository.setAgentRunStatus(project.id, agentRunId, "completed");
    expect(repository.getRun(project.id, agentRunId)?.status).toBe("failed");
  });

  test("scopes repeated planner question ids per run", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "needs clarification");
    const firstRun = repository.createAgentRun(project.id, "needs clarification", "openai/gpt-5.4");
    const firstRunId = firstRun.activeRun?.id;
    expect(firstRunId).toBeDefined();
    const firstQuestion = repository.appendPlanningQuestion(project.id, firstRunId!, {
      id: "question-1",
      prompt: "Which route should handle this?",
      placeholder: "api/users/[id]",
      choices: [
        {
          id: "choice-1",
          label: "API route",
          description: "Use provided API route.",
          answerText: "api/users/[id]",
          recommended: true
        },
        {
          id: "choice-2",
          label: "Web route",
          description: "Use a page route instead.",
          answerText: "users/[id]",
          recommended: false
        },
        {
          id: "choice-3",
          label: "Custom",
          description: "Type a custom route.",
          answerText: "custom route",
          recommended: false
        }
      ],
      required: true
    });

    repository.appendMessage(project.id, "user", "needs clarification again");
    const secondRun = repository.createAgentRun(project.id, "needs clarification again", "openai/gpt-5.4");
    const secondRunId = secondRun.activeRun?.id;
    expect(secondRunId).toBeDefined();
    const secondQuestion = repository.appendPlanningQuestion(project.id, secondRunId!, {
      id: "question-1",
      prompt: "Which route should handle this?",
      placeholder: "api/users/[id]",
      choices: [
        {
          id: "choice-1",
          label: "API route",
          description: "Use provided API route.",
          answerText: "api/users/[id]",
          recommended: true
        },
        {
          id: "choice-2",
          label: "Web route",
          description: "Use a page route instead.",
          answerText: "users/[id]",
          recommended: false
        },
        {
          id: "choice-3",
          label: "Custom",
          description: "Type a custom route.",
          answerText: "custom route",
          recommended: false
        }
      ],
      required: true
    });

    expect(firstQuestion.activeRun?.questions[0]?.logicalQuestionId).toBe("question-1");
    expect(secondQuestion.activeRun?.questions[0]?.logicalQuestionId).toBe("question-1");
    expect(firstQuestion.activeRun?.questions[0]?.id).not.toBe(secondQuestion.activeRun?.questions[0]?.id);
  });

  test("scopes repeated planner question ids within the same run", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "needs repeated clarifications");
    const withRun = repository.createAgentRun(project.id, "needs repeated clarifications", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    const first = repository.appendPlanningQuestion(project.id, runId!, {
      id: "question-1",
      prompt: "Which route should handle this?",
      choices: [],
      required: true
    });
    const second = repository.appendPlanningQuestion(project.id, runId!, {
      id: "question-1",
      prompt: "Which database table should this use?",
      choices: [],
      required: true
    });

    const questionIds = second.activeRun?.questions.map((question) => question.id) ?? [];
    const logicalQuestionIds = second.activeRun?.questions.map((question) => question.logicalQuestionId) ?? [];
    expect(questionIds).toHaveLength(2);
    expect(logicalQuestionIds).toEqual(["question-1", "question-1"]);
    expect(questionIds[0]).not.toBe(questionIds[1]);
    expect(questionIds[1]).not.toBe(first.activeRun?.questions[0]?.id);
  });

  test("keeps long scoped planner question ids distinct after readable prefix", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "needs long clarifications");
    const withRun = repository.createAgentRun(project.id, "needs long clarifications", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    const sharedPrefix = "question-" + "x".repeat(180);
    const first = repository.appendPlanningQuestion(project.id, runId!, {
      id: `${sharedPrefix}-left`,
      prompt: "First long question?",
      choices: [],
      required: true
    });
    const second = repository.appendPlanningQuestion(project.id, runId!, {
      id: `${sharedPrefix}-right`,
      prompt: "Second long question?",
      choices: [],
      required: true
    });

    const questionIds = second.activeRun?.questions.map((question) => question.id) ?? [];
    expect(questionIds).toHaveLength(2);
    expect(questionIds[0]).toBeDefined();
    expect(questionIds[1]).toBeDefined();
    expect(first.activeRun?.questions[0]?.id).toBeDefined();
    expect(questionIds[0]!).toBe(first.activeRun!.questions[0]!.id);
    expect(questionIds[0]!).not.toBe(questionIds[1]!);
    expect(questionIds.every((id) => id.length <= 128)).toBe(true);
  });

  test("persists browser sessions on active runs across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "verify ui");
    const withRun = repository.createAgentRun(project.id, "verify ui", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    repository.setAgentRunBrowserSessions(project.id, runId!, [
      {
        id: "browser-session-1",
        runId: runId!,
        owner: "main",
        status: "awaiting-approval",
        approvalMode: "per-tool",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingApproval: {
          toolCallId: "tool-call-1",
          toolName: "playwright-browser",
          kind: "navigate",
          label: "Open https://example.com",
          inputSummary: "{\"url\":\"https://example.com\"}",
          status: "pending",
          requestedAt: new Date().toISOString()
        },
        activities: [
          {
            id: "browser-activity-1",
            toolCallId: "tool-call-1",
            toolName: "playwright-browser",
            kind: "navigate",
            label: "Open https://example.com",
            inputSummary: "{\"url\":\"https://example.com\"}",
            status: "pending-approval",
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            replay: [],
            verification: []
          }
        ]
      }
    ]);

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.activeRun?.browserSessions).toHaveLength(1);
    expect(restoredProject.activeRun?.browserSessions?.[0]?.pendingApproval?.toolCallId).toBe("tool-call-1");
    expect(restoredProject.activeRun?.browserSessions?.[0]?.activities[0]?.status).toBe("pending-approval");
  });

  test("repairs background job foreign keys that still target background_job_runs_legacy", () => {
    const repository = createRepository();
    const dbPath = (repository as any).dbPath as string;
    const db = new Database(dbPath, { strict: true });

    db.exec(`
      ALTER TABLE background_job_runs RENAME TO background_job_runs_legacy;
      CREATE TABLE background_job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        automation_thread_id TEXT NOT NULL,
        trigger_source TEXT NOT NULL CHECK(trigger_source IN ('schedule', 'startup-catchup', 'manual', 'approval-release', 'retry')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running', 'succeeded', 'failed', 'cancelled', 'skipped')),
        risk_level TEXT NOT NULL CHECK(risk_level IN ('safe', 'slightly-unsafe', 'unsafe')),
        approval_status TEXT NOT NULL CHECK(approval_status IN ('not-needed', 'pending', 'approved', 'rejected')),
        skipped_occurrence_count INTEGER NOT NULL DEFAULT 0,
        linked_agent_run_id TEXT NULL,
        summary TEXT NULL,
        failure_message TEXT NULL,
        queued_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(automation_thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );
      DROP TABLE background_job_runs_legacy;
    `);
    db.close(false);

    const repairedRepository = new WorkspaceRepository(dbPath, process.cwd());
    const repairedDb = new Database(dbPath, { readonly: true, strict: true });
    const schemas = repairedDb
      .query<{ name: string; sql: string }, []>(
        `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('background_job_runs', 'background_job_run_events', 'notifications')`
      )
      .all();
    repairedDb.close(false);

    expect(repairedRepository.loadBackgroundJobsState()).toEqual({
      jobs: [],
      runs: [],
      templates: expect.any(Array)
    });
    expect(schemas.every((row) => !row.sql.includes("background_job_runs_legacy"))).toBe(true);
    expect(schemas.filter((row) => row.name !== "background_job_runs").every((row) => row.sql.includes("REFERENCES background_job_runs"))).toBe(true);
    expect(schemas.find((row) => row.name === "background_job_runs")?.sql).toContain("'partial-complete'");
    expect(schemas.find((row) => row.name === "notifications")?.sql).toContain("'cli-update'");
  });

  test("persists experiment metadata and shared memory retrievals across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const runProject = repository.createAgentRun(project.id, "try experiment", "openai/gpt-5.4");
    const runId = runProject.activeRun!.id;

    repository.setAgentRunExecutionTarget(project.id, runId, "ephemeral-experiment");
    repository.saveExperimentRun(project.id, runId, {
      id: createExperimentId(),
      runId,
      status: "running",
      virtualBranchName: `ai-experiment/${runId}`,
      repoMountPath: path.join(project.rootPath, ".local", "branchfs", runId, "mount"),
      projectMountPath: path.join(project.rootPath, ".local", "branchfs", runId, "mount"),
      baseCommitSha: "abc123",
      baseBranchName: "main",
      baseDirtyFingerprint: "fingerprint",
      filesChanged: 2,
      insertions: 10,
      deletions: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const memoryEntry = repository.saveMemoryEntry({
      id: createMemoryEntryId(),
      projectId: project.id,
      threadId: runProject.activeRun!.threadId,
      runId,
      kind: "task-summary",
      status: "active",
      title: "Experiment summary",
      summary: "Use virtual branch for risky edits.",
      evidence: "Review before promote.",
      tags: ["experiment"],
      pathGlobs: ["src/**"],
      confidence: "high",
      freshness: "fresh",
      pinned: false,
      priority: 50000,
      hitCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    repository.logMemoryRetrieval({
      id: createMemoryRetrievalId(),
      runId,
      owner: "planner",
      queryText: "virtual branch",
      entryIds: [memoryEntry!.id],
      createdAt: new Date().toISOString()
    });

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.activeRun?.executionTarget).toBe("ephemeral-experiment");
    expect(restoredProject.activeRun?.experiment?.virtualBranchName).toBe(`ai-experiment/${runId}`);
    expect(restoredProject.activeRun?.memoryRetrievals?.[0]?.owner).toBe("planner");
    expect(reloadedRepository.listMemoryEntries(project.id)[0]?.title).toBe("Experiment summary");
  });

  test("normalizes doubled Windows separators", () => {
    expect(normalizeWindowsEscapedPath("C:\\\\repo\\\\project")).toBe("C:\\repo\\project");
    expect(normalizeWindowsEscapedPath("C:\\repo\\project")).toBe("C:\\repo\\project");
  });

  test("normalizes null fork source to undefined during load", () => {
    const repository = createRepository();
    const project = addProject(repository);

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.threads[0]?.forkedFromThreadId).toBeUndefined();
  });

  test("prefers last non-system message for thread preview", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "build feature");
    repository.appendMessage(project.id, "system", "Planning task.");
    const restoredProject = repository.getProject(project.id);

    expect(restoredProject.threads[0]?.lastMessagePreview).toBe("build feature");
  });

  test("persists and updates run milestone messages without taking over thread preview", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const threadId = project.activeThreadId;
    const created = repository.appendMessage(project.id, "assistant", "- Subagent started", {
      threadId,
      kind: "run-milestones",
      metadata: {
        type: "run-milestones",
        runId: "run-1",
        windowId: "window-1",
        status: "open",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lineCount: 1
      }
    });
    const messageId = created.session.messages[0]!.id;

    const updated = repository.updateThreadMessage(project.id, threadId, messageId, {
      content: "- Subagent started\n- Subagent finished",
      metadata: {
        type: "run-milestones",
        runId: "run-1",
        windowId: "window-1",
        status: "closed",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lineCount: 2
      }
    });

    expect(updated.session.messages[0]?.kind).toBe("run-milestones");
    expect(updated.session.messages[0]?.content).toContain("Subagent finished");
    expect(updated.threads[0]?.lastMessagePreview).toBeUndefined();
    repository.appendMessage(project.id, "assistant", "final answer", threadId);
    expect(repository.getProject(project.id).threads[0]?.lastMessagePreview).toBe("final answer");
  });

  test("persists updated in-flight assistant messages across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const threadId = project.activeThreadId;

    const created = repository.appendMessage(project.id, "assistant", "work", threadId);
    const messageId = created.session.messages[0]!.id;
    repository.updateThreadMessage(project.id, threadId, messageId, {
      content: "working"
    });

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(project.id);

    expect(restoredProject.session.messages.at(-1)?.content).toBe("working");
    expect(restoredProject.threads[0]?.lastMessagePreview).toBe("working");
  });

  test("deletes broken legacy thread rows during dev load recovery", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const activeThreadId = repository.getProject(project.id).activeThreadId;

    (repository as any).db
      .query(`UPDATE project_threads SET title = '' WHERE id = ?1 AND project_id = ?2`)
      .run(activeThreadId, project.id);

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const workspace = reloadedRepository.loadWorkspace();
    const restoredProject = workspace.projects.find((entry) => entry.id === project.id);

    expect(restoredProject).toBeDefined();
    expect(restoredProject?.threads).toHaveLength(1);
    expect(restoredProject?.threads[0]?.title).toBe("Thread 1");
    expect(restoredProject?.activeThreadId).toBe(restoredProject?.session.sessionId);
    expect(restoredProject?.activeThreadId).not.toBe(activeThreadId);
  });
});
