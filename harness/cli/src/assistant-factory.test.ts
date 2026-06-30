import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createAssistantId, createBackgroundJobId, createThreadId, type Assistant, type BackgroundJob } from "../../shared/protocol";
import { createOrUpdateAssistantWithJobs } from "./assistant-factory";
import { WorkspaceRepository } from "./workspace-repository";

function createTempDir() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const dbPath = path.join(createTempDir(), `assistant-factory-${crypto.randomUUID()}.sqlite`);
  return new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
}

describe("assistant factory", () => {
  test("refreshes intent contract for dialog-created and edited assistant prompts", () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistant: Assistant = {
      id: createAssistantId(),
      name: "Factory Builder",
      scope: "project",
      projectId: project.id,
      description: "Short purpose summary.",
      personalityPrompt: "Be concise.",
      jobPrompt: "Build a SaaS factory that produces usable web app slices with tests.",
      agentId: "codex-cli",
      providerBrand: "gpt",
      modeId: "implement",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const created = createOrUpdateAssistantWithJobs({
      repository,
      assistant,
      launchDefaults: {
        providerBrand: "gpt",
        modeId: "implement"
      }
    });
    const edited = createOrUpdateAssistantWithJobs({
      repository,
      assistant: {
        ...created.assistant,
        description: "Build a SaaS factory that produces usable web app slices with tests.",
        jobPrompt: "Keep catalog notes only when they support factory app implementation.",
        updatedAt: new Date(Date.parse(now) + 1000).toISOString()
      },
      launchDefaults: {
        providerBrand: "gpt",
        modeId: "implement"
      }
    });
    const persisted = repository.getAssistant(assistant.id);

    expect(created.created).toBe(true);
    expect(created.assistant.intentContract?.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
    expect(created.assistant.intentContract?.artifactTypes).toContain("app-code");
    expect(edited.created).toBe(false);
    expect(edited.assistant.intentContract?.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
    expect(edited.assistant.intentContract?.artifactTypes).toContain("app-code");
    expect(edited.assistant.intentContract?.artifactTypes).toContain("automation-code");
    expect(edited.assistant.intentContract?.artifactTypes).toContain("test-evidence");
    expect(persisted?.intentContract?.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
  });

  test("creates assistant-owned jobs with launch profile snapshot", () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistant: Assistant = {
      id: createAssistantId(),
      name: "Omega",
      scope: "project",
      projectId: project.id,
      description: "Builds assistants.",
      personalityPrompt: "Be direct.",
      jobPrompt: "Create assistants and jobs.",
      agentId: "codex-cli",
      providerBrand: "gpt",
      executionModelId: "openai/gpt-5.4",
      reasoningStrength: "high",
      fastMode: true,
      modeId: "implement",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Omega factory",
      status: "enabled",
      riskLevel: "unsafe",
      definition: {
        kind: "ai-routine",
        prompt: "Build an assistant for release notes."
      },
      schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: now, sourceText: "hourly" },
      scheduleInput: "hourly",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };

    const result = createOrUpdateAssistantWithJobs({
      repository,
      assistant,
      jobs: [job],
      launchDefaults: {
        providerBrand: "gpt",
        planningModelId: "openai/gpt-5.4-mini",
        executionModelId: "openai/gpt-5.4",
        modeId: "implement"
      }
    });

    const savedJob = result.jobs[0];
    expect(result.created).toBe(true);
    expect(result.assistant.intentContract?.objective).toBe("Create assistants and jobs.");
    expect(result.assistant.intentContract?.artifactTypes).toContain("automation-code");
    expect(savedJob?.intentContract?.objective).toBe("Build an assistant for release notes.");
    expect(savedJob?.intentContract?.artifactTypes).toContain("automation-code");
    expect(savedJob?.definition.kind).toBe("ai-routine");
    if (savedJob?.definition.kind === "ai-routine") {
      expect(savedJob.definition.launchProfile).toMatchObject({
        agentId: "codex-cli",
        providerBrand: "gpt",
        planningModelId: "openai/gpt-5.4-mini",
        executionModelId: "openai/gpt-5.4",
        reasoningStrength: "high",
        fastMode: true,
        modeId: "implement"
      });
    }
    expect(repository.loadAssistantsState().logs.some((entry) => entry.assistantId === assistant.id && entry.summary === "Assistant created")).toBe(true);
  });
});
