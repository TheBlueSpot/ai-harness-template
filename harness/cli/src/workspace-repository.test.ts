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
      activeProjectId: undefined
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
      activeProjectId: undefined
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

    const reloadedRepository = new WorkspaceRepository((repository as any).dbPath, process.cwd());
    expect(reloadedRepository.getStoredOpenAiApiKey()).toBe("sk-test-123");
    expect(reloadedRepository.getStoredGoogleApiKey()).toBe("gsk-test-456");
    expect(reloadedRepository.getProviderBrand()).toBe("gemini");
    expect(reloadedRepository.getDebugEnabledDefault()).toBe(true);
    expect(reloadedRepository.getTracePanelDefaultOpen()).toBe(false);

    reloadedRepository.clearStoredOpenAiApiKey();
    reloadedRepository.clearStoredGoogleApiKey();
    expect(reloadedRepository.getStoredOpenAiApiKey()).toBeUndefined();
    expect(reloadedRepository.getStoredGoogleApiKey()).toBeUndefined();
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
