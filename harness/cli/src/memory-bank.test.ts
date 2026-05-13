import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createMemoryEntryId } from "../../shared/protocol";
import { extractRunMemories, retrieveMemorySummaries } from "./memory-bank";
import { WorkspaceRepository } from "./workspace-repository";

function createRepository() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return new WorkspaceRepository(path.join(tempRoot, `memory-bank-${crypto.randomUUID()}.sqlite`), process.cwd(), {
    durability: "test-fast"
  });
}

function addProject(repository: WorkspaceRepository) {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data", `memory-bank-repo-${crypto.randomUUID()}`);
  mkdirSync(tempRoot, { recursive: true });
  return repository.addProject(tempRoot);
}

function saveMemory(repository: WorkspaceRepository, input: { projectId: string; title: string; priority: number; pinned?: boolean }) {
  const now = new Date().toISOString();
  return repository.saveMemoryEntry({
    id: createMemoryEntryId(),
    projectId: input.projectId,
    kind: "task-summary",
    status: "active",
    title: input.title,
    summary: `${input.title} shared query`,
    tags: ["shared", "query"],
    pathGlobs: ["src/**"],
    confidence: "medium",
    freshness: "fresh",
    pinned: input.pinned ?? false,
    priority: input.priority,
    hitCount: 0,
    createdAt: now,
    updatedAt: now
  })!;
}

describe("memory bank", () => {
  test("manual priority affects retrieval ranking", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, { projectId: project.id, title: "Low priority", priority: 900 });
    saveMemory(repository, { projectId: project.id, title: "High priority", priority: 100 });
    const run = repository.createAgentRun(project.id, "shared query", "openai/gpt-5.4").activeRun!;

    const result = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "shared query",
      maxEntries: 2
    });

    expect(result.memorySummaries.map((summary) => summary.label)).toEqual([
      "task-summary | High priority",
      "task-summary | Low priority"
    ]);
  });

  test("pinned memory wins when relevance and priority match", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, { projectId: project.id, title: "Plain", priority: 500 });
    saveMemory(repository, { projectId: project.id, title: "Pinned", priority: 500, pinned: true });
    const run = repository.createAgentRun(project.id, "shared query", "openai/gpt-5.4").activeRun!;

    const result = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "shared query",
      maxEntries: 2
    });

    expect(result.memorySummaries[0]?.label).toBe("task-summary | Pinned");
  });

  test("generated memories append priority and dedupe preserves existing priority", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, { projectId: project.id, title: "Existing", priority: 100 });
    const run = repository.createAgentRun(project.id, "shared task", "openai/gpt-5.4").activeRun!;
    const completedRun = {
      ...run,
      status: "completed" as const,
      summary: "Generated memory summary"
    };

    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: completedRun
    });

    const generated = repository.listMemoryEntries(project.id).find((entry) => entry.title === `Run ${run.id} summary`);
    expect(generated?.priority).toBe(200);

    repository.saveMemoryEntry({
      ...generated!,
      priority: 123
    });
    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: completedRun
    });

    expect(repository.getMemoryEntry(generated!.id)?.priority).toBe(123);
  });
});
