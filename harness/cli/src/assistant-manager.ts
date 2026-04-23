import { modeUsesReadOnlyExecution, resolveModeById } from "../../shared/modes";
import {
  createAssistantLearningId,
  createAssistantLogEntryId,
  createAssistantQuestionId,
  createAssistantTodoId,
  type Assistant,
  type AssistantLearning,
  type AssistantLogEntry,
  type AssistantQuestion,
  type AssistantTodo,
  type AssistantThread,
  type ChatMessage,
  type ModeDefinition,
  type WorkspaceProjectState
} from "../../shared/protocol";
import { getDefaultExecutionModelId } from "./pi-planner";
import { type AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { type PiAgentAdapter } from "./pi-agent-adapter";
import { WorkspaceRepository } from "./workspace-repository";

const DEBUG_TELEMETRY_ENABLED = process.env.NODE_ENV !== "production";

type AssistantManagerCallbacks = {
  onAssistantsUpdated: () => void;
  onAssistantChatDelta: (input: { assistantId: string; sessionId: string; delta: string }) => void;
  onAssistantChatComplete: (input: { assistantId: string; sessionId: string; assistantMessage: ChatMessage; thread: AssistantThread }) => void;
  onAssistantLogAppended: (entry: AssistantLogEntry) => void;
  onAssistantCreatedCard: (assistant: Assistant) => void;
};

type ReprioritizeProposal = {
  summary?: string;
  todoOrder?: string[];
  todoUpdates?: Array<{
    id: string;
    state?: AssistantTodo["state"];
    blockerReason?: string;
  }>;
  newTodos?: Array<{
    title: string;
    description?: string;
  }>;
  newLearnings?: Array<{
    summary: string;
    source?: string;
    confidence?: AssistantLearning["confidence"];
  }>;
  question?: {
    prompt: string;
    linkedTodoIds?: string[];
  };
};

type BootstrapProposal = {
  researchSummary?: string;
  learnings?: Array<{
    summary: string;
    source?: string;
    confidence?: AssistantLearning["confidence"];
  }>;
  initialTodos?: Array<{
    title: string;
    description?: string;
  }>;
  remainIdle?: boolean;
};

type ReprioritizeState = {
  timer?: ReturnType<typeof setTimeout>;
  running: boolean;
  dirty: boolean;
  lastReason?: string;
};

export class AssistantManager {
  private readonly reprioritizeStates = new Map<string, ReprioritizeState>();

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly runtimeRegistry: AgentRuntimeRegistry,
    private readonly callbacks: AssistantManagerCallbacks
  ) {}

  async bootstrapAssistant(assistantId: string) {
    const assistant = this.repository.getAssistant(assistantId);
    if (!assistant || assistant.runState === "paused" || this.repository.getGlobalExecutionPaused()) {
      return;
    }

    this.repository.setAssistantBootstrapState(assistantId, "running");
    this.appendLog({
      assistantId,
      level: "info",
      summary: "Bootstrap started",
      detail: "Researching assistant role and initial operating state."
    });
    this.callbacks.onAssistantsUpdated();

    try {
      const runtime = await this.resolveRuntime(assistant);
      const proposal = await this.runJsonPrompt<BootstrapProposal>(runtime.adapter, {
        assistant,
        prompt: buildBootstrapPrompt(assistant),
        readOnly: true
      });

      if (proposal?.researchSummary) {
        this.repository.saveAssistantLearning({
          id: createAssistantLearningId(),
          assistantId,
          summary: proposal.researchSummary,
          source: "bootstrap-research",
          confidence: "high",
          createdAt: new Date().toISOString()
        });
      }

      for (const learning of proposal?.learnings ?? []) {
        this.repository.saveAssistantLearning({
          id: createAssistantLearningId(),
          assistantId,
          summary: learning.summary.trim(),
          source: learning.source?.trim() || "bootstrap",
          confidence: learning.confidence ?? "medium",
          createdAt: new Date().toISOString()
        });
      }

      const todos = (proposal?.initialTodos ?? []).filter((todo) => todo.title.trim().length > 0).slice(0, 8);
      todos.forEach((todo, index) => {
        this.repository.saveAssistantTodo({
          id: createAssistantTodoId(),
          assistantId,
          title: todo.title.trim(),
          description: todo.description?.trim() || undefined,
          state: "pending",
          sortOrder: index,
          source: "bootstrap",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      this.repository.setAssistantBootstrapState(assistantId, "completed");
      this.appendLog({
        assistantId,
        level: "info",
        summary: "Bootstrap completed",
        detail: todos.length > 0 ? `Created ${todos.length} initial todos.` : "Assistant remains reactive until prompted."
      });
      this.callbacks.onAssistantsUpdated();

      if (!proposal?.remainIdle && todos.length > 0) {
        this.scheduleReprioritize(assistantId, "bootstrap");
      }
    } catch (error) {
      const message = normalizeErrorMessage(error);
      this.repository.setAssistantBootstrapState(assistantId, "failed");
      this.appendLog({
        assistantId,
        level: "error",
        summary: "Bootstrap failed",
        detail: message,
        detailsJson: serializeError(error)
      });
      await this.recordFailure(assistantId, message, true);
      this.callbacks.onAssistantsUpdated();
    }
  }

  async sendAssistantChat(assistantId: string, content: string) {
    const assistant = this.repository.getAssistant(assistantId);
    if (!assistant) {
      throw new Error(`Unknown assistant: ${assistantId}`);
    }

    const thread = this.repository.appendAssistantMessage(assistantId, "user", content.trim());
    const runtime = await this.resolveRuntime(assistant);
    const prompt = await this.buildAssistantChatPrompt(assistant);
    let deltaBuffer = "";

    try {
      const result = await runtime.adapter.runPrompt({
        kind: "executor",
        cwd: runtime.cwd,
        modelId: runtime.modelId,
        prompt: `${prompt}\n\nLatest user message:\n${content.trim()}`,
        readOnly: runtime.readOnly,
        onTextDelta: (delta) => {
          deltaBuffer += delta;
          this.callbacks.onAssistantChatDelta({
            assistantId,
            sessionId: thread.sessionId,
            delta
          });
        }
      });

      const nextThread = this.repository.appendAssistantMessage(assistantId, "assistant", result.text.trim());
      const assistantMessage = nextThread.messages[nextThread.messages.length - 1];
      if (!assistantMessage) {
        throw new Error("Assistant response was not persisted");
      }

      await this.maybeSummarizeThread(assistant, nextThread, result.contextUsage?.usagePercent);
      this.appendLog({
        assistantId,
        level: "info",
        summary: "Chat response completed",
        detail: summarize(result.text),
        detailsJson: {
          usagePercent: result.contextUsage?.usagePercent,
          tokens: result.contextUsage?.tokens
        }
      });
      this.callbacks.onAssistantChatComplete({
        assistantId,
        sessionId: nextThread.sessionId,
        assistantMessage,
        thread: this.repository.getAssistantThread(assistantId)
      });
      this.callbacks.onAssistantsUpdated();
      this.scheduleReprioritize(assistantId, "chat");
    } catch (error) {
      const message = normalizeErrorMessage(error);
      this.appendLog({
        assistantId,
        level: "error",
        summary: "Chat response failed",
        detail: message,
        detailsJson: {
          error: serializeError(error),
          partialDelta: deltaBuffer
        }
      });
      await this.recordFailure(assistantId, message, true);
      throw error;
    }
  }

  async answerQuestion(assistantId: string, questionId: string, content: string) {
    const question = this.repository.answerAssistantQuestion(assistantId, questionId, content.trim());
    for (const todoId of question.linkedTodoIds ?? []) {
      const todo = this.repository.getAssistantTodos(assistantId).find((entry) => entry.id === todoId);
      if (!todo || todo.state !== "blocked") {
        continue;
      }
      this.repository.saveAssistantTodo({
        ...todo,
        state: "pending",
        blockerReason: undefined,
        updatedAt: new Date().toISOString()
      });
    }
    this.appendLog({
      assistantId,
      level: "info",
      summary: "Question answered",
      detail: summarize(content)
    });
    this.callbacks.onAssistantsUpdated();
    this.scheduleReprioritize(assistantId, "question-answer");
    return question;
  }

  async retryBootstrap(assistantId: string) {
    await this.bootstrapAssistant(assistantId);
  }

  async handleBackgroundJobRunOutcome(input: {
    assistantId: string;
    status: "succeeded" | "failed" | "cancelled";
    summary?: string;
    failureMessage?: string;
  }) {
    const assistant = this.repository.getAssistant(input.assistantId);
    if (!assistant || assistant.deletedAt) {
      return;
    }

    if (input.status === "succeeded") {
      this.repository.updateAssistantFailureState(input.assistantId, {
        failureStreakCount: 0,
        circuitBreakerState: "closed",
        circuitBreakerReason: undefined
      });
      this.appendLog({
        assistantId: input.assistantId,
        level: "info",
        summary: "Assistant job succeeded",
        detail: input.summary
      });
      this.callbacks.onAssistantsUpdated();
      this.scheduleReprioritize(input.assistantId, "job-succeeded");
      return;
    }

    const message = input.failureMessage ?? input.summary ?? "Assistant job failed";
    this.appendLog({
      assistantId: input.assistantId,
      level: input.status === "cancelled" ? "warning" : "error",
      summary: input.status === "cancelled" ? "Assistant job cancelled" : "Assistant job failed",
      detail: message
    });
    await this.recordFailure(input.assistantId, message, true);
    this.callbacks.onAssistantsUpdated();
  }

  scheduleReprioritize(assistantId: string, reason: string) {
    const assistant = this.repository.getAssistant(assistantId);
    if (!assistant || assistant.runState === "paused" || assistant.deletedAt) {
      return;
    }

    if (this.repository.getGlobalExecutionPaused()) {
      this.repository.markAssistantPendingReprioritize(assistantId, reason);
      this.callbacks.onAssistantsUpdated();
      return;
    }

    const state = this.reprioritizeStates.get(assistantId) ?? {
      running: false,
      dirty: false
    };
    state.lastReason = reason;
    if (state.running) {
      state.dirty = true;
      this.reprioritizeStates.set(assistantId, state);
      return;
    }

    if (state.timer) {
      clearTimeout(state.timer);
    }

    state.timer = setTimeout(() => {
      state.timer = undefined;
      void this.runReprioritize(assistantId, state.lastReason ?? "unknown");
    }, 800);
    this.reprioritizeStates.set(assistantId, state);
  }

  drainPendingReprioritizes() {
    for (const pending of this.repository.consumeAssistantsPendingReprioritize()) {
      this.scheduleReprioritize(pending.assistantId, pending.reason);
    }
  }

  private async runReprioritize(assistantId: string, reason: string) {
    const state = this.reprioritizeStates.get(assistantId) ?? {
      running: false,
      dirty: false
    };
    state.running = true;
    state.dirty = false;
    this.reprioritizeStates.set(assistantId, state);

    try {
      const assistant = this.repository.getAssistant(assistantId);
      if (!assistant || assistant.runState === "paused" || assistant.deletedAt) {
        return;
      }

      const runtime = await this.resolveRuntime(assistant);
      const proposal = await this.runJsonPrompt<ReprioritizeProposal>(runtime.adapter, {
        assistant,
        prompt: await this.buildReprioritizePrompt(assistant, reason),
        readOnly: true
      });

      const todos = this.repository.getAssistantTodos(assistantId);
      for (const update of proposal?.todoUpdates ?? []) {
        const todo = todos.find((entry) => entry.id === update.id);
        if (!todo) {
          continue;
        }
        this.repository.saveAssistantTodo({
          ...todo,
          state: update.state ?? todo.state,
          blockerReason: update.blockerReason ?? todo.blockerReason,
          updatedAt: new Date().toISOString(),
          completedAt:
            (update.state ?? todo.state) === "completed" ? new Date().toISOString() : todo.completedAt,
          cancelledAt:
            (update.state ?? todo.state) === "cancelled" ? new Date().toISOString() : todo.cancelledAt
        });
      }

      for (const newTodo of proposal?.newTodos ?? []) {
        if (!newTodo.title.trim()) {
          continue;
        }
        this.repository.saveAssistantTodo({
          id: createAssistantTodoId(),
          assistantId,
          title: newTodo.title.trim(),
          description: newTodo.description?.trim() || undefined,
          state: "pending",
          sortOrder: todos.length + 100,
          source: "assistant",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      if (proposal?.todoOrder?.length) {
        const order = proposal.todoOrder.filter((todoId) => todos.some((todo) => todo.id === todoId));
        if (order.length > 0) {
          this.repository.reorderAssistantTodos(assistantId, [
            ...order,
            ...this.repository
              .getAssistantTodos(assistantId)
              .map((todo) => todo.id)
              .filter((todoId) => !order.includes(todoId))
          ]);
        }
      }

      for (const learning of proposal?.newLearnings ?? []) {
        if (!learning.summary.trim()) {
          continue;
        }
        this.repository.saveAssistantLearning({
          id: createAssistantLearningId(),
          assistantId,
          summary: learning.summary.trim(),
          source: learning.source?.trim() || `reprioritize:${reason}`,
          confidence: learning.confidence ?? "medium",
          createdAt: new Date().toISOString()
        });
      }

      if (proposal?.question?.prompt?.trim()) {
        const pendingQuestion = this.repository
          .getAssistantQuestions(assistantId)
          .find((entry) => entry.status === "pending" || entry.status === "deferred");
        if (!pendingQuestion) {
          const questionStatus = this.repository.getGlobalExecutionPaused() ? "deferred" : "pending";
          this.repository.saveAssistantQuestion({
            id: createAssistantQuestionId(),
            assistantId,
            prompt: proposal.question.prompt.trim(),
            status: questionStatus,
            linkedTodoIds: proposal.question.linkedTodoIds ?? [],
            askedAt: new Date().toISOString()
          });
        }
      }

      this.repository.updateAssistantFailureState(assistantId, {
        failureStreakCount: 0,
        circuitBreakerState: "closed",
        circuitBreakerReason: undefined
      });
      this.appendLog({
        assistantId,
        level: "info",
        summary: "Reprioritized assistant state",
        detail: proposal?.summary ?? `Trigger: ${reason}`,
        detailsJson: proposal
      });
      this.callbacks.onAssistantsUpdated();
    } catch (error) {
      const message = normalizeErrorMessage(error);
      this.appendLog({
        assistantId,
        level: "error",
        summary: "Reprioritization failed",
        detail: message,
        detailsJson: serializeError(error)
      });
      await this.recordFailure(assistantId, message, false);
      this.callbacks.onAssistantsUpdated();
    } finally {
      const latestState = this.reprioritizeStates.get(assistantId);
      if (!latestState) {
        return;
      }
      latestState.running = false;
      const shouldRerun = latestState.dirty;
      latestState.dirty = false;
      this.reprioritizeStates.set(assistantId, latestState);
      if (shouldRerun) {
        this.scheduleReprioritize(assistantId, "coalesced");
      }
    }
  }

  private async maybeSummarizeThread(assistant: Assistant, thread: AssistantThread, usagePercent?: number) {
    const shouldSummarize = thread.messages.length > 120 || (usagePercent ?? 0) >= 70;
    if (!shouldSummarize) {
      return;
    }

    const runtime = await this.resolveRuntime(assistant);
    const result = await runtime.adapter.runPrompt({
      kind: "planner",
      cwd: runtime.cwd,
      modelId: runtime.modelId,
      prompt: buildThreadSummaryPrompt(assistant, thread),
      readOnly: true
    });
    this.repository.setAssistantThreadMemorySummary(assistant.id, result.text.trim());
    this.appendLog({
      assistantId: assistant.id,
      level: "info",
      summary: "Rolled assistant context",
      detail: "Updated assistant thread memory summary."
    });
    this.callbacks.onAssistantsUpdated();
  }

  private async buildAssistantChatPrompt(assistant: Assistant) {
    const state = this.getAssistantOperatingState(assistant.id);
    return [
      `Assistant name: ${assistant.name}`,
      `Personality prompt:\n${assistant.personalityPrompt}`,
      `Job prompt:\n${assistant.jobPrompt}`,
      state.summary ? `Thread summary:\n${state.summary}` : undefined,
      state.assetRefs.length > 0 ? `Linked assets:\n${state.assetRefs.map((asset) => `- [${asset.kind}] ${asset.label}: ${asset.value}`).join("\n")}` : undefined,
      state.activeTodos.length > 0
        ? `Active todos:\n${state.activeTodos.map((todo) => `- (${todo.id}) ${todo.state}: ${todo.title}${todo.blockerReason ? ` | blocker: ${todo.blockerReason}` : ""}`).join("\n")}`
        : "Active todos: none",
      state.pendingQuestions.length > 0
        ? `Pending questions:\n${state.pendingQuestions.map((question) => `- (${question.id}) ${question.prompt}`).join("\n")}`
        : "Pending questions: none",
      state.learnings.length > 0
        ? `Relevant learnings:\n${state.learnings.map((learning) => `- ${learning.summary}`).join("\n")}`
        : "Relevant learnings: none",
      `Recent transcript:\n${renderMessages(state.recentMessages)}`,
      "Reply directly to the user. Keep answer grounded in the assistant role and current priorities."
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async buildReprioritizePrompt(assistant: Assistant, reason: string) {
    const state = this.getAssistantOperatingState(assistant.id);
    return [
      "Return only JSON.",
      `Assistant name: ${assistant.name}`,
      `Reason: ${reason}`,
      `Personality prompt:\n${assistant.personalityPrompt}`,
      `Job prompt:\n${assistant.jobPrompt}`,
      state.summary ? `Thread summary:\n${state.summary}` : undefined,
      state.activeTodos.length > 0
        ? `Current active todos:\n${state.activeTodos.map((todo) => `- id=${todo.id} state=${todo.state} title=${todo.title}${todo.blockerReason ? ` blocker=${todo.blockerReason}` : ""}`).join("\n")}`
        : "Current active todos: none",
      state.pendingQuestions.length > 0
        ? `Pending questions:\n${state.pendingQuestions.map((question) => `- id=${question.id} prompt=${question.prompt}`).join("\n")}`
        : undefined,
      state.learnings.length > 0
        ? `Relevant learnings:\n${state.learnings.map((learning) => `- ${learning.summary}`).join("\n")}`
        : undefined,
      `Recent transcript:\n${renderMessages(state.recentMessages.slice(-8))}`,
      `Respond with JSON object:
{
  "summary": "short summary",
  "todoOrder": ["todo-id"],
  "todoUpdates": [{"id":"todo-id","state":"pending|in-progress|blocked|completed|failed|cancelled","blockerReason":"optional"}],
  "newTodos": [{"title":"todo title","description":"optional"}],
  "newLearnings": [{"summary":"learning","source":"optional","confidence":"low|medium|high"}],
  "question": {"prompt":"optional blocking question","linkedTodoIds":["todo-id"]}
}`,
      "Do not include completed, failed, or cancelled todos unless you are explicitly changing a currently active todo into one of those states."
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private getAssistantOperatingState(assistantId: string) {
    const thread = this.repository.getAssistantThread(assistantId);
    const todos = this.repository
      .getAssistantTodos(assistantId)
      .filter((todo) => ["pending", "in-progress", "blocked"].includes(todo.state));
    const questions = this.repository.getAssistantQuestions(assistantId).filter((question) => question.status === "pending");
    const learnings = this.repository.getAssistantLearnings(assistantId).slice(0, 12);
    const assetRefs = this.repository.getAssistantAssetRefs(assistantId);

    return {
      summary: thread.memorySummary?.content,
      activeTodos: todos,
      pendingQuestions: questions,
      learnings,
      assetRefs,
      recentMessages: thread.messages.slice(-16)
    };
  }

  private async runJsonPrompt<T>(
    adapter: PiAgentAdapter,
    input: {
      assistant: Assistant;
      prompt: string;
      readOnly: boolean;
    }
  ) {
    const runtime = await this.resolveRuntime(input.assistant);
    const result = await adapter.runPrompt({
      kind: "planner",
      cwd: runtime.cwd,
      modelId: runtime.modelId,
      prompt: input.prompt,
      readOnly: input.readOnly
    });
    return extractJsonPayload<T>(result.text);
  }

  private async resolveRuntime(assistant: Assistant) {
    const providerBrand = this.repository.getProviderBrand();
    const runtime = this.runtimeRegistry.get(assistant.agentId);
    const capability = runtime.getCapability() ?? (await runtime.refreshCapability());
    if (!capability.installed) {
      throw new Error(capability.healthMessage ?? `${runtime.label} is not installed`);
    }
    if (assistant.agentId !== "pi" && !capability.authenticated) {
      throw new Error(capability.healthMessage ?? `${runtime.label} is not authenticated`);
    }

    const cwd = assistant.projectId ? this.repository.getProject(assistant.projectId).rootPath : process.cwd();
    const project = assistant.projectId ? this.repository.getProject(assistant.projectId) : undefined;
    const modelId =
      assistant.executionModelId ??
      runtime.getDefaultExecutionModelId(providerBrand) ??
      getDefaultExecutionModelId(providerBrand);
    const mode = resolveAssistantMode(assistant.modeId, this.repository.loadWorkspace().workspaceModes ?? [], project);
    const readOnly = modeUsesReadOnlyExecution(mode) || !assistant.projectId;
    if (DEBUG_TELEMETRY_ENABLED) {
      // #region agent log
      fetch('http://127.0.0.1:7467/ingest/8f3f8e64-2064-4541-a606-af61e33e104f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'26847a'},body:JSON.stringify({sessionId:'26847a',runId:'initial-003',hypothesisId:'H6',location:'assistant-manager.ts:629',message:'assistant runtime resolved',data:{assistantId:assistant.id,assistantModeId:assistant.modeId ?? null,projectId:assistant.projectId ?? null,toolPolicy:mode?.toolPolicy ?? null,readOnly,cwd,modelId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    return {
      adapter: runtime.getAdapter(),
      cwd,
      modelId,
      readOnly
    };
  }

  private async recordFailure(assistantId: string, message: string, createQuestion: boolean) {
    const assistant = this.repository.getAssistant(assistantId);
    if (!assistant) {
      return;
    }
    const nextFailureCount = assistant.failureStreakCount + 1;
    const shouldTrip = nextFailureCount >= 3 || (assistant.circuitBreakerReason ?? "") === message;
    if (shouldTrip) {
      this.repository.updateAssistantFailureState(assistantId, {
        failureStreakCount: nextFailureCount,
        circuitBreakerState: "tripped",
        circuitBreakerReason: message,
        runState: "paused"
      });
      const criticalEntry = this.appendLog({
        assistantId,
        level: "critical",
        summary: "Circuit breaker tripped",
        detail: message,
        detailsJson: {
          failureStreakCount: nextFailureCount
        }
      });
      if (createQuestion) {
        const pendingQuestion = this.repository
          .getAssistantQuestions(assistantId)
          .find((entry) => entry.status === "pending" || entry.status === "deferred");
        if (!pendingQuestion) {
          const questionStatus = this.repository.getGlobalExecutionPaused() ? "deferred" : "pending";
          this.repository.saveAssistantQuestion({
            id: createAssistantQuestionId(),
            assistantId,
            prompt: `Assistant paused itself after repeated failures. How should it proceed? Latest error: ${message}`,
            status: questionStatus,
            askedAt: new Date().toISOString()
          });
        }
      }
      this.callbacks.onAssistantLogAppended(criticalEntry);
      return;
    }

    this.repository.updateAssistantFailureState(assistantId, {
      failureStreakCount: nextFailureCount,
      circuitBreakerReason: message
    });
  }

  private appendLog(input: Omit<AssistantLogEntry, "id" | "createdAt"> & Partial<Pick<AssistantLogEntry, "id" | "createdAt">>) {
    const entry = this.repository.appendAssistantLogEntry({
      id: input.id ?? createAssistantLogEntryId(),
      assistantId: input.assistantId,
      level: input.level,
      summary: input.summary,
      detail: input.detail,
      detailsJson: input.detailsJson,
      createdAt: input.createdAt ?? new Date().toISOString()
    });
    this.callbacks.onAssistantLogAppended(entry);
    return entry;
  }
}

function buildBootstrapPrompt(assistant: Assistant) {
  return [
    "Return only JSON.",
    `Assistant name: ${assistant.name}`,
    `Personality prompt:\n${assistant.personalityPrompt}`,
    `Job prompt:\n${assistant.jobPrompt}`,
    `Respond with JSON object:
{
  "researchSummary": "what role success looks like",
  "learnings": [{"summary":"learning","source":"optional","confidence":"low|medium|high"}],
  "initialTodos": [{"title":"todo title","description":"optional"}],
  "remainIdle": true
}`,
    "Only create initialTodos when the job prompt implies proactive work, backlog maintenance, implementation, or recurring execution."
  ].join("\n\n");
}

function buildThreadSummaryPrompt(assistant: Assistant, thread: AssistantThread) {
  return [
    `Summarize the assistant memory for ${assistant.name}.`,
    "Preserve user commitments, unresolved blockers, active priorities, and open loops.",
    renderMessages(thread.messages.slice(-80))
  ].join("\n\n");
}

function resolveAssistantMode(modeId: string | undefined, workspaceModes: ModeDefinition[], project?: WorkspaceProjectState) {
  return resolveModeById(modeId ?? project?.selectedModeId, workspaceModes, project?.projectModes ?? []);
}

function renderMessages(messages: ChatMessage[]) {
  if (messages.length === 0) {
    return "(no recent transcript)";
  }

  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
}

function extractJsonPayload<T>(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]+?)```/i);
  const source = fencedMatch?.[1] ?? text;
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Assistant JSON payload missing");
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1)) as T;
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown assistant error";
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }
  return { value: error };
}

function summarize(value: string, maxLength: number = 240) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
