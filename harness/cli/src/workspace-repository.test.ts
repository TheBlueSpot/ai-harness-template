import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { normalizeWindowsEscapedPath, WorkspaceRepository } from "./workspace-repository";

describe("workspace repository", () => {
  test("bootstraps default project and persists added project history", () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const extraProjectRoot = path.join(tempRoot, `repo-${crypto.randomUUID()}`);
    mkdirSync(extraProjectRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);

    const repository = new WorkspaceRepository(dbPath, process.cwd());
    const defaultWorkspace = repository.loadWorkspace();
    expect(defaultWorkspace.projects).toHaveLength(1);

    const nextProject = repository.addProject(extraProjectRoot);
    repository.appendMessage(nextProject.id, "user", "hello");
    repository.appendMessage(nextProject.id, "assistant", "world");

    const reloadedRepository = new WorkspaceRepository(dbPath, process.cwd());
    const workspace = reloadedRepository.loadWorkspace();
    const restoredProject = workspace.projects.find((project) => project.id === nextProject.id);

    expect(restoredProject?.session.messages).toHaveLength(2);
    expect(restoredProject?.session.messages[0].content).toBe("hello");
    expect(restoredProject?.session.messages[1].content).toBe("world");
  });

  test("reset archives thread and starts empty active thread", () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd());
    const projectId = repository.loadWorkspace().activeProjectId;

    repository.appendMessage(projectId, "user", "hello");
    const resetProject = repository.resetProject(projectId);

    expect(resetProject.session.messages).toHaveLength(0);
    expect(resetProject.activeThreadId).toBe(resetProject.session.sessionId);
  });

  test("persists API key and global defaults", () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd());

    repository.setStoredOpenAiApiKey("sk-test-123");
    repository.setStoredGoogleApiKey("gsk-test-456");
    repository.setProviderBrand("gemini");
    repository.setDebugEnabledDefault(true);
    repository.setTracePanelDefaultOpen(false);

    const reloadedRepository = new WorkspaceRepository(dbPath, process.cwd());
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
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `workspace-${crypto.randomUUID()}.sqlite`);
    const repository = new WorkspaceRepository(dbPath, process.cwd());
    const projectId = repository.loadWorkspace().activeProjectId;

    repository.appendMessage(projectId, "user", "needs clarification");
    const withRun = repository.createAgentRun(projectId, "needs clarification", "openai/gpt-5.4");
    const runId = withRun.activeRun?.id;
    expect(runId).toBeDefined();

    repository.appendPlanningQuestion(projectId, runId!, {
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
    repository.answerPlanningQuestion(projectId, runId!, "question-1", "api/users/[id]");
    repository.setAgentRunReady(projectId, runId!, {
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
    repository.markSubtaskCompleted(projectId, runId!, "task-1", "inspection complete", 1);
    repository.markSubtaskFailed(projectId, runId!, "task-2", "timeout", 2);
    repository.setAgentRunStatus(projectId, runId!, "partial-complete");

    const reloadedRepository = new WorkspaceRepository(dbPath, process.cwd());
    const restoredProject = reloadedRepository.getProject(projectId);

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
});
