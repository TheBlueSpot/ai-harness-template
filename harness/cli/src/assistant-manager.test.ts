import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createAssistantId, createAssistantQuestionId, type AgentRuntimeCapability, type Assistant, type ProviderBrand } from "../../shared/protocol";
import { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import type { AgentRuntime } from "./agent-runtimes/agent-runtime";
import { AssistantManager } from "./assistant-manager";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import { WorkspaceRepository } from "./workspace-repository";

function createTempDir() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const dbPath = path.join(createTempDir(), `assistant-manager-${crypto.randomUUID()}.sqlite`);
  return new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
}

function createAssistant(repository: WorkspaceRepository, overrides: Partial<Assistant> = {}) {
  const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  const project = repository.addProject(projectRoot);
  const now = new Date().toISOString();
  return repository.saveAssistant({
    id: createAssistantId(),
    name: "Bootstrap tester",
    scope: "project",
    projectId: project.id,
    description: "Test assistant",
    personalityPrompt: "Be concise.",
    jobPrompt: "Test bootstrap.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "pending",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  });
}

class DeferredAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];
  readonly resolvers: Array<(result: PiAgentPromptResult) => void> = [];

  runPrompt(request: PiAgentPromptRequest) {
    this.calls.push(request);
    return new Promise<PiAgentPromptResult>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  async startExecution(): Promise<PiAgentExecutionController> {
    throw new Error("not used");
  }

  setApiKey() {}

  hasApiKey() {
    return true;
  }
}

class FakeRuntime implements AgentRuntime {
  readonly id = "pi" as const;
  readonly label = "Pi";

  constructor(private readonly adapter: PiAgentAdapter) {}

  getAdapter() {
    return this.adapter;
  }

  getCapability(): AgentRuntimeCapability {
    return {
      agentId: "pi",
      label: "Pi",
      runtimeKind: "sdk",
      installed: true,
      authenticated: true,
      supportsProgrammatic: true,
      supportsInteractive: false,
      interactivePipeCompatible: false,
      supportsPlanning: true,
      supportsReview: true,
      supportsReasoningStrengthControl: false,
      supportsFastModeControl: true,
      discoveredModels: ["openai/gpt-5.4"],
      modelDiscoveryConfidence: "exact"
    };
  }

  async refreshCapability() {
    return this.getCapability();
  }

  getDefaultPlanningModelId(_providerBrand: ProviderBrand) {
    return "openai/gpt-5.4";
  }

  getDefaultExecutionModelId(_providerBrand: ProviderBrand) {
    return "openai/gpt-5.4";
  }

  getDefaultSubagentModelId(_providerBrand: ProviderBrand) {
    return "openai/gpt-5.4";
  }
}

function createManager(
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  callbacks: Partial<ConstructorParameters<typeof AssistantManager>[2]> = {}
) {
  return new AssistantManager(repository, new AgentRuntimeRegistry([new FakeRuntime(adapter)]), {
    onAssistantsUpdated() {},
    onAssistantChatDelta() {},
    onAssistantChatMessageAppended() {},
    onAssistantChatComplete() {},
    onAssistantLogAppended() {},
    onAssistantCreatedCard() {},
    ...callbacks
  });
}

function bootstrapResult(title: string) {
  return {
    text: JSON.stringify({
      researchSummary: title,
      initialTodos: [{ title }]
    })
  };
}

async function waitForCalls(adapter: DeferredAdapter, count: number) {
  for (let index = 0; index < 100; index += 1) {
    if (adapter.calls.length >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("assistant manager bootstrap", () => {
  test("joins duplicate bootstrap attempts while one is running", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);

    const first = manager.bootstrapAssistant(assistant.id);
    const second = manager.bootstrapAssistant(assistant.id);
    expect(first).toBe(second);
    await waitForCalls(adapter, 1);
    expect(adapter.calls).toHaveLength(1);

    adapter.resolvers[0]?.(bootstrapResult("Initial todo"));
    await first;

    expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.title)).toEqual(["Initial todo"]);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("completed");
  });

  test("ignores stale bootstrap completion after force retry starts newer attempt", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);

    const stale = manager.bootstrapAssistant(assistant.id);
    const current = manager.bootstrapAssistant(assistant.id, { force: true });
    await waitForCalls(adapter, 2);
    expect(adapter.calls).toHaveLength(2);

    adapter.resolvers[0]?.(bootstrapResult("Old todo"));
    await stale;
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("running");

    adapter.resolvers[1]?.(bootstrapResult("New todo"));
    await current;
    expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.title)).toEqual(["New todo"]);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("completed");
  });

  test("recovers stale persisted running bootstrap as retryable failure", () => {
    const repository = createRepository();
    const oldStartedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const assistant = createAssistant(repository, {
      bootstrapState: "running",
      bootstrapAttemptId: "attempt-old",
      bootstrapStartedAt: oldStartedAt
    });
    const manager = createManager(repository, new DeferredAdapter());

    manager.recoverStaleBootstrapRuns(30 * 60 * 1000);

    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("failed");
    expect(repository.getAssistantQuestions(assistant.id)[0]?.prompt).toContain("interrupted or stalled");
  });
});

describe("assistant manager chat", () => {
  test("emits persisted user message before assistant response events", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = new DeferredAdapter();
    const events: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantChatMessageAppended(input) {
        events.push(`appended:${input.message.role}:${input.message.content}`);
      },
      onAssistantChatDelta(input) {
        events.push(`delta:${input.delta}`);
      },
      onAssistantChatComplete(input) {
        events.push(`complete:${input.assistantMessage.content}`);
      }
    });

    const sent = manager.sendAssistantChat(assistant.id, "Need status");
    await waitForCalls(adapter, 1);
    adapter.calls[0]?.onTextDelta?.("Working");
    adapter.resolvers[0]?.({ text: "Ready" });
    await sent;

    expect(events).toEqual(["appended:user:Need status", "delta:Working", "complete:Ready"]);
  });
});

describe("assistant manager background jobs", () => {
  test("reprioritizes with writable access for implement assistants", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed",
      modeId: "implement"
    });
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Built next catalog entry."
    });
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.readOnly).toBe(false);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
  });

  test("keeps reprioritize read-only for read-only assistant modes", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed",
      modeId: "plan"
    });
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Reviewed queue."
    });
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.readOnly).toBe(true);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue inspected." }) });
  });

  test("records answered questions as durable learnings", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, new DeferredAdapter());
    const question = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "Which game should this patrol inspect?",
      status: "pending",
      askedAt: new Date().toISOString()
    });

    await manager.answerQuestion(assistant.id, question.id, "Pick a random one unless told otherwise.");

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings[0]?.summary).toContain("Pick a random one");
    expect(learnings[0]?.source).toBe(`question:${question.id}`);
  });

  test("turns soft question-like job failures into durable notes without tripping failures", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, new DeferredAdapter());

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "failed",
      failureMessage:
        "What should I calibrate against while I patrol: which current game or mechanic are you tuning, and what currently feels most good, bad, confusing, sticky, or exciting about it?"
    });

    const questions = repository.getAssistantQuestions(assistant.id);
    const updatedAssistant = repository.getAssistant(assistant.id);
    expect(questions).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id)[0]?.summary).toContain("Make a reasonable assumption");
    expect(updatedAssistant?.failureStreakCount).toBe(0);
    expect(updatedAssistant?.circuitBreakerState).toBe("closed");
  });

  test("duplicate awaiting input job outcomes do not create repeated questions", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, new DeferredAdapter());

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "awaiting-user-input",
      summary: "Which project should this assistant inspect first?"
    });
    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "awaiting-user-input",
      summary: "Which project should this assistant inspect first?"
    });

    expect(repository.getAssistantQuestions(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id).length).toBeGreaterThan(0);
    expect(repository.getAssistant(assistant.id)?.failureStreakCount).toBe(0);
  });

  test("answer reprioritize suppresses equivalent future questions", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed"
    });
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);
    const question = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "Which game folder should I evaluate?",
      status: "pending",
      askedAt: new Date().toISOString()
    });

    await manager.answerQuestion(assistant.id, question.id, "Pick a random browser-playable game unless told otherwise.");
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({
      text: JSON.stringify({
        summary: "Question considered.",
        questions: [{ prompt: "Which game folder or mechanic should I evaluate first?" }]
      })
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const questions = repository.getAssistantQuestions(assistant.id);
    expect(questions.filter((entry) => entry.status === "pending")).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id).some((entry) => entry.summary.includes("Auto-answered"))).toBe(true);
  });

  test("startup cleanup dismisses stale duplicate pending questions", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, new DeferredAdapter());
    repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "What do you usually like or dislike in launcher games?",
      status: "answered",
      answerText: "Tight gameplay loop is key. Do not ask again.",
      askedAt: new Date().toISOString(),
      answeredAt: new Date().toISOString()
    });
    const stale = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "What makes launcher game feel good or bad to you?",
      status: "pending",
      askedAt: new Date().toISOString()
    });

    expect(manager.cleanupStaleAssistantQuestions()).toBe(1);

    expect(repository.getAssistantQuestions(assistant.id).find((entry) => entry.id === stale.id)?.status).toBe("dismissed");
  });
});
