import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
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

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    expect(reloadedRepository.getStoredOpenAiApiKey()).toBe("sk-test-123");
    expect(reloadedRepository.getStoredGoogleApiKey()).toBe("gsk-test-456");
    expect(reloadedRepository.getProviderBrand()).toBe("gemini");
    expect(reloadedRepository.getDebugEnabledDefault()).toBe(true);
    expect(reloadedRepository.getTracePanelDefaultOpen()).toBe(false);
    expect(reloadedRepository.getBlockChatOnDirtyGitDefault()).toBe(false);
    expect(reloadedRepository.getDirtyGitChangeLimitDefault()).toBe(7);

    reloadedRepository.clearStoredOpenAiApiKey();
    reloadedRepository.clearStoredGoogleApiKey();
    expect(reloadedRepository.getStoredOpenAiApiKey()).toBeUndefined();
    expect(reloadedRepository.getStoredGoogleApiKey()).toBeUndefined();
  });

  test("persists ui mode, workspace context, and workspace modes across reload", () => {
    const repository = createRepository();

    repository.setUiModeDefault("advanced");
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
      updatedAt: new Date().toISOString()
    });

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    const workspace = reloadedRepository.loadWorkspace();

    expect(reloadedRepository.getUiModeDefault()).toBe("advanced");
    expect(workspace.workspaceRuleSource?.content).toBe("Prefer plan-first work.");
    expect(workspace.workspaceMemorySummary?.content).toBe("User likes concise updates.");
    expect((workspace.workspaceModes ?? []).map((mode) => mode.id)).toContain("ship-fast");
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

  test("persists active run questions and resumable subtasks across reload", () => {
    const repository = createRepository();
    const project = addProject(repository);

    repository.appendMessage(project.id, "user", "needs clarification");
    const withRun = repository.createAgentRun(project.id, "needs clarification", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    repository.appendPlanningQuestion(project.id, runId!, {
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
    repository.answerPlanningQuestion(project.id, runId!, "question-1", "api/users/[id]");
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
