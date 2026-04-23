import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantLearningId,
  createAssistantLogEntryId,
  createAssistantQuestionId,
  createAssistantTodoId,
  createBackgroundJobId,
  createExperimentId,
  createMemoryEntryId,
  createMemoryRetrievalId
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
  return new WorkspaceRepository(dbPath, process.cwd());
}

function addProject(repository: WorkspaceRepository) {
  const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  return repository.addProject(projectRoot);
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
    expect(assistants.threads[0]?.messages[0]?.content).toBe("Teach me balance.");
    expect(assistants.todos[0]?.title).toContain("karate stance");
    expect(assistants.questions[0]?.prompt).toContain("kata");

    repository.deleteAssistant(assistantId);

    expect(repository.getAssistant(assistantId, true)?.deletedAt).toBeDefined();
    expect(repository.loadAssistantsState().assistants).toHaveLength(0);
    expect(repository.loadBackgroundJobsState().jobs).toHaveLength(0);
    expect(repository.getBackgroundJobRun(savedRun.id)).toBeUndefined();
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

    expect(firstQuestion.activeRun?.questions[0]?.id).toBe(`${firstRunId}:question-1`);
    expect(secondQuestion.activeRun?.questions[0]?.id).toBe(`${secondRunId}:question-1`);
    expect(firstQuestion.activeRun?.questions[0]?.id).not.toBe(secondQuestion.activeRun?.questions[0]?.id);
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
        `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('background_job_run_events', 'notifications')`
      )
      .all();
    repairedDb.close(false);

    expect(repairedRepository.loadBackgroundJobsState()).toEqual({
      jobs: [],
      runs: [],
      templates: expect.any(Array)
    });
    expect(schemas.every((row) => !row.sql.includes("background_job_runs_legacy"))).toBe(true);
    expect(schemas.every((row) => row.sql.includes("REFERENCES background_job_runs"))).toBe(true);
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
