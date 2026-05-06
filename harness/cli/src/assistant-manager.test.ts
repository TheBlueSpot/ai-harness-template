import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import {
  createAssistantId,
  createAssistantLearningId,
  createAssistantQuestionId,
  type AgentRuntimeCapability,
  type Assistant,
  type AssistantLearning,
  type ProviderBrand
} from "../../shared/protocol";
import { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import type { AgentRuntime } from "./agent-runtimes/agent-runtime";
import { AssistantManager, renderAssistantPromptMemoryBlock, selectAssistantPromptLearnings, selectAssistantPromptQuestions } from "./assistant-manager";
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
  }, {
    reprioritizeDebounceMs: 0
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

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) {
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

  test("assistant chat prompt renders cleaned profile context", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed",
      description: "Tracks release risk.",
      personalityPrompt: "Be direct.",
      jobPrompt: "Watch release blockers."
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Prioritize smoke-test failures before polish.",
      source: "test",
      confidence: "high",
      createdAt: new Date().toISOString()
    });
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);

    const sent = manager.sendAssistantChat(assistant.id, "Need status");
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.prompt).toContain("# IDENTITY: Bootstrap tester");
    expect(adapter.calls[0]?.prompt).toContain("Personality: Be direct.");
    expect(adapter.calls[0]?.prompt).toContain("Description: Tracks release risk.");
    expect(adapter.calls[0]?.prompt).toContain("# OPERATIONAL LOGIC (The Job)\nWatch release blockers.");
    expect(adapter.calls[0]?.prompt).toContain("# ACTIVE MISSION (The Request)\nNeed status");
    expect(adapter.calls[0]?.prompt).not.toContain("Role:");
    expect(adapter.calls[0]?.prompt).not.toContain("First assistant message requirement:");
    expect(adapter.calls[0]?.prompt).not.toContain("Concise learnings report:");
    expect(adapter.calls[0]?.prompt).toContain("Prioritize smoke-test failures before polish.");

    adapter.resolvers[0]?.({ text: "Ready" });
    await sent;
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
    expect(adapter.calls[0]?.prompt).toContain("Recent assistant logs:");
    expect(adapter.calls[0]?.prompt).toContain("Built next catalog entry.");
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

  test("dedupes bootstrap learnings before appending", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);

    const bootstrapped = manager.retryBootstrap(assistant.id);
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({
      text: JSON.stringify({
        researchSummary: "Preserve durable user guidance.",
        learnings: [
          {
            summary: "Preserve durable user guidance.",
            source: "bootstrap",
            confidence: "medium"
          }
        ]
      })
    });
    await bootstrapped;

    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(1);
  });

  test("compacts assistant learnings once thresholds are crossed", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Low-value repeated patrol note ${index}`,
        source: "test",
        confidence: "low",
        createdAt: now
      });
    }

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Trigger reprioritize."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
    await waitForCalls(adapter, 2);
    expect(adapter.calls[1]?.prompt).toContain("Merge assistant learnings into compact durable guidance.");
    expect(adapter.calls[1]?.prompt).not.toContain('"summary": "merged durable assistant guidance"');
    expect(adapter.calls[1]?.prompt).toContain("Never return placeholder labels");
    adapter.resolvers[1]?.({
      text: JSON.stringify({
        summary: "Keep patrol guidance compact.",
        retainedFacts: []
      })
    });
    await outcome;
    await waitForCondition(() => repository.getAssistantLearnings(assistant.id).length === 1);

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]?.kind).toBe("summary");
    expect(learnings[0]?.summary).toBe("Keep patrol guidance compact.");
  });

  test("keeps facts when AI compaction payload cannot be repaired", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = new DeferredAdapter();
    const logSummaries: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantLogAppended(entry) {
        logSummaries.push(entry.summary);
      }
    });
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Compaction fallback note ${index}`,
        source: "test",
        confidence: "low",
        createdAt: now
      });
    }

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Trigger reprioritize."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: "not json" });
    await waitForCalls(adapter, 3);
    adapter.resolvers[2]?.({ text: JSON.stringify({ retainedFacts: [] }) });
    await outcome;
    await waitForCondition(() => logSummaries.includes("Assistant learning compaction skipped"));

    expect(repository.getAssistantLearningStats(assistant.id).activeFactLearningCount).toBe(41);
    expect(logSummaries).toContain("Assistant learning compaction skipped");
  });

  test("rejects garbage compaction output and keeps facts when repair is garbage", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = new DeferredAdapter();
    const logSummaries: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantLogAppended(entry) {
        logSummaries.push(entry.summary);
      }
    });
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Garbage compaction guard note ${index}`,
        source: "test",
        confidence: "low",
        createdAt: now
      });
    }

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Trigger reprioritize."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: JSON.stringify({ summary: "merged durable assistant guidance", retainedFacts: [] }) });
    await waitForCalls(adapter, 3);
    adapter.resolvers[2]?.({ text: JSON.stringify({ summary: "Compacted summary", retainedFacts: [] }) });
    await outcome;
    await waitForCondition(() => logSummaries.includes("Assistant learning compaction skipped"));

    expect(repository.getAssistantLearningStats(assistant.id).activeFactLearningCount).toBe(41);
    expect(repository.getAssistantLearnings(assistant.id).some((learning) => learning.kind === "summary")).toBe(false);
  });

  test("prompt learning context prefers summary and high-confidence guidance", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = new DeferredAdapter();
    const manager = createManager(repository, adapter);
    const now = new Date().toISOString();
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Compacted release guidance comes first.",
      source: "compaction:test",
      confidence: "high",
      createdAt: now,
      kind: "summary",
      compactedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "merged durable assistant guidance",
      source: "compaction:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 1).toISOString(),
      kind: "summary",
      compactedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "User wants blocker questions avoided.",
      source: "question:test",
      confidence: "high",
      createdAt: now
    });
    for (let index = 0; index < 20; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Recent fact ${index}`,
        source: "test",
        confidence: "medium",
        createdAt: new Date(Date.now() + index).toISOString()
      });
    }

    const sent = manager.sendAssistantChat(assistant.id, "Need status");
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.prompt).toContain("Compacted release guidance comes first.");
    expect(adapter.calls[0]?.prompt).not.toContain("merged durable assistant guidance");
    expect(adapter.calls[0]?.prompt).toContain("User wants blocker questions avoided.");
    expect(adapter.calls[0]?.prompt).not.toContain("Recent fact 0");

    adapter.resolvers[0]?.({ text: "Ready" });
    await sent;
  });

  test("turns soft question-like job failures into durable notes without tripping failures", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, new DeferredAdapter());

    const outcome = await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "failed",
      failureMessage:
        "What should I calibrate against while I patrol: which current game or mechanic are you tuning, and what currently feels most good, bad, confusing, sticky, or exciting about it?"
    });

    const questions = repository.getAssistantQuestions(assistant.id);
    const updatedAssistant = repository.getAssistant(assistant.id);
    expect(questions).toHaveLength(0);
    expect(outcome?.blocked).toBe(false);
    expect(repository.getAssistantLearnings(assistant.id)[0]?.summary).toContain("Make a reasonable assumption");
    expect(updatedAssistant?.failureStreakCount).toBe(0);
    expect(updatedAssistant?.circuitBreakerState).toBe("closed");
  });

  test("duplicate awaiting input job outcomes do not create repeated questions", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, new DeferredAdapter());

    const firstOutcome = await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "awaiting-user-input",
      summary: "Which project should this assistant inspect first?"
    });
    const secondOutcome = await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "awaiting-user-input",
      summary: "Which project should this assistant inspect first?"
    });

    expect(repository.getAssistantQuestions(assistant.id)).toHaveLength(0);
    expect(firstOutcome?.blocked).toBe(false);
    expect(secondOutcome?.blocked).toBe(false);
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

  test("selectAssistantPromptQuestions keeps only durable non-operational answers", () => {
    const assistantId = createAssistantId();
    const now = new Date().toISOString();
    const selected = selectAssistantPromptQuestions([
      {
        id: createAssistantQuestionId(),
        assistantId,
        prompt: "Which background job should I run now?",
        status: "answered",
        answerText: "Use the hourly job.",
        askedAt: now,
        answeredAt: now
      },
      {
        id: createAssistantQuestionId(),
        assistantId,
        prompt: "Which release area should this patrol inspect?",
        status: "answered",
        answerText: "Inspect release blockers first.",
        askedAt: now,
        answeredAt: now
      },
      {
        id: createAssistantQuestionId(),
        assistantId,
        prompt: "Which release area should this patrol inspect?",
        status: "answered",
        answerText: "Inspect release blockers first.",
        askedAt: now,
        answeredAt: now
      }
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.answerText).toBe("Inspect release blockers first.");
  });

  test("assistant prompt memory block dedupes learnings and caps output", () => {
    const assistantId = createAssistantId();
    const learnings: AssistantLearning[] = Array.from({ length: 12 }, (_, index) => ({
      id: createAssistantLearningId(),
      assistantId,
      summary: index < 2 ? "Prioritize smoke tests first." : `Learning ${index}`,
      source: index < 2 ? "question:test" : "test",
      confidence: index < 2 ? "high" : "medium",
      createdAt: new Date(Date.now() + index).toISOString()
    }));

    const selectedLearnings = selectAssistantPromptLearnings(learnings);
    const block = renderAssistantPromptMemoryBlock(
      [
        {
          id: createAssistantQuestionId(),
          assistantId,
          prompt: "Which release area should this patrol inspect?",
          status: "answered",
          answerText: "Inspect release blockers first.",
          askedAt: new Date().toISOString(),
          answeredAt: new Date().toISOString()
        }
      ],
      selectedLearnings
    );

    expect(selectedLearnings).toHaveLength(6);
    expect(selectedLearnings.filter((learning) => learning.summary === "Prioritize smoke tests first.")).toHaveLength(1);
    expect(block).toContain("# Durable Guidance");
    expect(block).toContain("Recent durable answers:");
    expect(block).toContain("Relevant learnings:");
  });
});
