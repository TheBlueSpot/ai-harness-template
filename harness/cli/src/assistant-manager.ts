import { modeUsesReadOnlyExecution, resolveModeById } from "../../shared/modes";
import { z } from "zod";
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
  type ComposerReasoningStrength,
  type ModeDefinition,
  type ProviderBrand,
  type ProjectId,
  type WorkspaceProjectState
} from "../../shared/protocol";
import { getDefaultExecutionModelId } from "./pi-planner";
import { type AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { type PiAgentAdapter } from "./pi-agent-adapter";
import { normalizeAssistantLearningSource, WorkspaceRepository } from "./workspace-repository";
import { debugLog } from "./logging";
import { assembleDeterministicPrompt } from "./deterministic-prompt";
import { buildWorkspaceConfigHash, type PromptCacheIdentity } from "./prompt-cache";
import { assertAssistantRunnableForLaunch } from "./assistant-launch-gate";
import {
  classifyAssistantQuestion,
  evaluateAssistantQuestionPolicy,
  normalizeQuestionText,
  type AssistantQuestionDecision
} from "./assistant-question-policy";

type AssistantManagerCallbacks = {
  onAssistantsUpdated: () => void;
  onAssistantChatDelta: (input: { assistantId: string; sessionId: string; delta: string }) => void;
  onAssistantChatMessageAppended: (input: {
    assistantId: string;
    sessionId: string;
    message: ChatMessage;
    thread: AssistantThread;
  }) => void;
  onAssistantChatComplete: (input: { assistantId: string; sessionId: string; assistantMessage: ChatMessage; thread: AssistantThread }) => void;
  onAssistantLogAppended: (entry: AssistantLogEntry) => void;
  onAssistantCreatedCard: (assistant: Assistant) => void;
};

type AssistantManagerOptions = {
  reprioritizeDebounceMs?: number;
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
  questions?: Array<{
    prompt: string;
    linkedTodoIds?: string[];
  }>;
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

const ASSISTANT_LEARNING_COMPACTION_FACT_THRESHOLD = 40;
const ASSISTANT_LEARNING_COMPACTION_CHAR_THRESHOLD = 24000;
const MAX_PROMPT_ANSWERED_QUESTIONS = 3;
const MAX_PROMPT_LEARNINGS = 6;
const ASSISTANT_ACTIONS_SKILL_PROMPT =
  "For every assistant-chat or project-chat request addressed to this assistant, invoke the assistant-actions skill before acting when the user's prompt does not already include it.";
const OPERATIONAL_PROMPT_QUESTION_CATEGORIES = new Set([
  "schedule-or-job-selection",
  "todo-or-question-selection",
  "recovery-or-safety",
  "access-environment"
]);

const assistantLearningCompactionSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .refine((summary) => !isGarbageAssistantCompactionSummary(summary), "summary must be real durable guidance"),
  retainedFacts: z
    .array(
      z.object({
        summary: z.string().trim().min(1).max(4000),
        source: z.string().trim().min(1).max(256).optional(),
        confidence: z.enum(["low", "medium", "high"]).optional()
      })
    )
    .max(40)
    .optional()
});

type ReprioritizeState = {
  timer?: ReturnType<typeof setTimeout>;
  running: boolean;
  dirty: boolean;
  lastReason?: string;
};

export class AssistantManager {
  private readonly reprioritizeStates = new Map<string, ReprioritizeState>();
  private readonly bootstrapFlights = new Map<string, Promise<void>>();
  private readonly reprioritizeDebounceMs: number;

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly runtimeRegistry: AgentRuntimeRegistry,
    private readonly callbacks: AssistantManagerCallbacks,
    options: AssistantManagerOptions = {}
  ) {
    this.reprioritizeDebounceMs = Math.max(0, options.reprioritizeDebounceMs ?? 800);
  }

  bootstrapAssistant(assistantId: string, options: { force?: boolean } = {}) {
    const existingFlight = this.bootstrapFlights.get(assistantId);
    if (existingFlight && !options.force) {
      return existingFlight;
    }

    const attemptId = crypto.randomUUID();
    const flight = this.runBootstrapAssistant(assistantId, attemptId).finally(() => {
      if (this.bootstrapFlights.get(assistantId) === flight) {
        this.bootstrapFlights.delete(assistantId);
      }
    });
    this.bootstrapFlights.set(assistantId, flight);
    return flight;
  }

  recoverStaleBootstrapRuns(maxAgeMs: number = 30 * 60 * 1000) {
    const now = Date.now();
    for (const assistant of this.repository.loadAssistantsState().assistants) {
      if (assistant.bootstrapState !== "running") {
        continue;
      }
      const startedAt = assistant.bootstrapStartedAt ? Date.parse(assistant.bootstrapStartedAt) : Number.NaN;
      if (Number.isFinite(startedAt) && now - startedAt < maxAgeMs) {
        continue;
      }
      const finishedAt = new Date().toISOString();
      this.repository.setAssistantBootstrapState(assistant.id, "failed", {
        attemptId: assistant.bootstrapAttemptId,
        finishedAt
      });
      this.appendLog({
        assistantId: assistant.id,
        level: "error",
        summary: "Bootstrap stale",
        detail: "Bootstrap was still running after reconnect and can be retried."
      });
      const pendingQuestion = this.repository
        .getAssistantQuestions(assistant.id)
        .find((entry) => entry.status === "pending" || entry.status === "deferred");
      if (!pendingQuestion) {
        this.repository.saveAssistantQuestion({
          id: createAssistantQuestionId(),
          assistantId: assistant.id,
          prompt: "Assistant bootstrap was interrupted or stalled. Retry bootstrap when ready?",
          status: this.repository.getGlobalExecutionPaused() ? "deferred" : "pending",
          askedAt: finishedAt
        });
      }
    }
    this.callbacks.onAssistantsUpdated();
  }

  private async runBootstrapAssistant(assistantId: string, attemptId: string) {
    let assistant: Assistant;
    try {
      assistant = assertAssistantRunnableForLaunch(this.repository, assistantId, { allowGlobalPauseDeferral: true });
    } catch {
      return;
    }
    if (this.repository.getGlobalExecutionPaused()) {
      return;
    }

    this.repository.setAssistantBootstrapState(assistantId, "running", {
      attemptId,
      startedAt: new Date().toISOString(),
      finishedAt: null
    });
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

      if (this.repository.getAssistant(assistantId)?.bootstrapAttemptId !== attemptId) {
        return;
      }

      if (proposal?.researchSummary) {
        this.repository.saveAssistantLearningDeduped({
          id: createAssistantLearningId(),
          assistantId,
          summary: proposal.researchSummary,
          source: "bootstrap-research",
          confidence: "high",
          createdAt: new Date().toISOString()
        });
      }

      for (const learning of proposal?.learnings ?? []) {
        this.repository.saveAssistantLearningDeduped({
          id: createAssistantLearningId(),
          assistantId,
          summary: learning.summary.trim(),
          source: learning.source?.trim() || "bootstrap",
          confidence: learning.confidence ?? "medium",
          createdAt: new Date().toISOString()
        });
      }
      await this.maybeCompactAssistantLearnings(assistantId, "bootstrap");

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

      this.repository.setAssistantBootstrapState(assistantId, "completed", {
        attemptId,
        finishedAt: new Date().toISOString()
      });
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
      if (this.repository.getAssistant(assistantId)?.bootstrapAttemptId !== attemptId) {
        return;
      }
      this.repository.setAssistantBootstrapState(assistantId, "failed", {
        attemptId,
        finishedAt: new Date().toISOString()
      });
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

  async sendAssistantChat(
    assistantId: string,
    content: string,
    controls: {
      modeId?: string;
      executionModelId?: string;
      reasoningStrength?: ComposerReasoningStrength;
      fastMode?: boolean;
    } = {}
  ) {
    const assistant = assertAssistantRunnableForLaunch(this.repository, assistantId);

    const thread = this.repository.appendAssistantMessage(assistantId, "user", content.trim());
    const userMessage = thread.messages[thread.messages.length - 1];
    if (!userMessage) {
      throw new Error("Assistant user message was not persisted");
    }
    this.callbacks.onAssistantChatMessageAppended({
      assistantId,
      sessionId: thread.sessionId,
      message: userMessage,
      thread
    });
    const runtime = await this.resolveRuntime(assistant, controls);
    const prompt = await this.buildAssistantChatPrompt(assistant, content.trim());
    let deltaBuffer = "";

    try {
      const result = await runtime.adapter.runPrompt({
        kind: "executor",
        cwd: runtime.cwd,
        modelId: runtime.modelId,
        prompt,
        readOnly: runtime.readOnly,
        reasoningStrength: runtime.reasoningStrength,
        fastMode: runtime.fastMode,
        promptCacheIdentity: runtime.promptCacheIdentity,
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
    this.repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId,
      summary: `User answered assistant question "${summarize(question.prompt, 120)}" with "${summarize(content, 120)}"; treat this as durable guidance and do not ask the same thing again unless context changes.`,
      source: `question:${question.id}`,
      confidence: "high",
      createdAt: new Date().toISOString()
    });
    await this.maybeCompactAssistantLearnings(assistantId, "question-answer");
    this.callbacks.onAssistantsUpdated();
    this.scheduleReprioritize(assistantId, "question-answer");
    return question;
  }

  async retryBootstrap(assistantId: string) {
    const assistant = this.repository.getAssistant(assistantId);
    await this.bootstrapAssistant(assistantId, { force: assistant?.bootstrapState !== "running" });
  }

  async recoverAssistant(assistantId: string) {
    const assistant = this.repository.recoverAssistantCircuitBreaker(assistantId);
    this.appendLog({
      assistantId,
      level: "info",
      summary: "Circuit breaker reset",
      detail: "Recovery retry requested by user."
    });
    this.callbacks.onAssistantsUpdated();

    if (assistant.bootstrapState === "failed" || assistant.bootstrapState === "pending") {
      await this.retryBootstrap(assistantId);
      return;
    }

    this.scheduleReprioritize(assistantId, "circuit-breaker-recovery");
  }

  async handleBackgroundJobRunOutcome(input: {
    assistantId: string;
    status: "succeeded" | "failed" | "cancelled" | "awaiting-user-input";
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
      return { blocked: false };
    }

    const message = input.failureMessage ?? input.summary ?? "Assistant job failed";
    const questionPrompt = extractQuestionPrompt(message);
    if (input.status === "awaiting-user-input" || questionPrompt) {
      const savedQuestion = this.saveBlockingQuestion(input.assistantId, questionPrompt ?? message);
      if (!savedQuestion) {
        this.appendLog({
          assistantId: input.assistantId,
          level: "info",
          summary: "Assistant job input auto-resolved",
          detail: questionPrompt ?? message
        });
        this.callbacks.onAssistantsUpdated();
        this.scheduleReprioritize(input.assistantId, "job-question-auto-resolved");
        return { blocked: false };
      }
      this.appendLog({
        assistantId: input.assistantId,
        level: "warning",
        summary: "Assistant job waiting for input",
        detail: questionPrompt ?? message
      });
      this.callbacks.onAssistantsUpdated();
      this.scheduleReprioritize(input.assistantId, "job-question");
      return { blocked: true };
    }

    this.appendLog({
      assistantId: input.assistantId,
      level: input.status === "cancelled" ? "warning" : "error",
      summary: input.status === "cancelled" ? "Assistant job cancelled" : "Assistant job failed",
      detail: message
    });
    await this.recordFailure(input.assistantId, message, true);
    this.callbacks.onAssistantsUpdated();
    this.scheduleReprioritize(input.assistantId, `job-${input.status}`);
    return { blocked: false };
  }

  scheduleReprioritize(assistantId: string, reason: string) {
    try {
      assertAssistantRunnableForLaunch(this.repository, assistantId, { allowGlobalPauseDeferral: true });
    } catch {
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

    if (this.reprioritizeDebounceMs === 0) {
      state.timer = undefined;
      this.reprioritizeStates.set(assistantId, state);
      void this.runReprioritize(assistantId, state.lastReason ?? "unknown");
      return;
    }

    state.timer = setTimeout(() => {
      state.timer = undefined;
      void this.runReprioritize(assistantId, state.lastReason ?? "unknown");
    }, this.reprioritizeDebounceMs);
    this.reprioritizeStates.set(assistantId, state);
  }

  drainPendingReprioritizes() {
    for (const pending of this.repository.consumeAssistantsPendingReprioritize()) {
      this.scheduleReprioritize(pending.assistantId, pending.reason);
    }
  }

  cleanupStaleAssistantQuestions() {
    let cleanedCount = 0;
    for (const assistant of this.repository.loadAssistantsState().assistants) {
      for (const question of this.repository
        .getAssistantQuestions(assistant.id)
        .filter((entry) => entry.status === "pending" || entry.status === "deferred")) {
        const decision = evaluateAssistantQuestionPolicy({
          prompt: question.prompt,
          questions: this.repository.getAssistantQuestions(assistant.id).filter((entry) => entry.id !== question.id),
          learnings: this.repository.getAssistantLearnings(assistant.id),
          runtimeReadOnly: undefined
        });
        if (decision.kind === "ask") {
          continue;
        }
        if (decision.kind === "auto-answer") {
          this.repository.answerAssistantQuestion(assistant.id, question.id, decision.answerText);
        } else {
          this.repository.dismissAssistantQuestion(assistant.id, question.id);
        }
        this.applyQuestionPolicyDecision(assistant.id, question.prompt, decision);
        cleanedCount += 1;
      }
    }
    if (cleanedCount > 0) {
      this.callbacks.onAssistantsUpdated();
    }
    return cleanedCount;
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
      if (!assistant) {
        return;
      }
      try {
        assertAssistantRunnableForLaunch(this.repository, assistantId);
      } catch {
        return;
      }

      const runtime = await this.resolveRuntime(assistant);
      const proposal = await this.runJsonPrompt<ReprioritizeProposal>(runtime.adapter, {
        assistant,
        prompt: await this.buildReprioritizePrompt(assistant, reason),
        readOnly: runtime.readOnly
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
        const learningSource = normalizeAssistantLearningSource(learning.source?.trim() || `reprioritize:${reason}`);
        this.repository.saveAssistantLearningDeduped({
          id: createAssistantLearningId(),
          assistantId,
          summary: learning.summary.trim(),
          source: learningSource,
          confidence: learning.confidence ?? "medium",
          createdAt: new Date().toISOString()
        });
      }
      await this.maybeCompactAssistantLearnings(assistantId, `reprioritize:${reason}`);

      const proposedQuestions = [
        ...(proposal?.questions ?? []),
        ...(proposal?.question ? [proposal.question] : [])
      ].filter((question) => question.prompt.trim());
      if (proposedQuestions.length > 0) {
        const pendingQuestion = this.repository
          .getAssistantQuestions(assistantId)
          .find((entry) => entry.status === "pending" || entry.status === "deferred");
        if (!pendingQuestion) {
          const questionStatus = this.repository.getGlobalExecutionPaused() ? "deferred" : "pending";
          let askedCount = 0;
          for (const question of proposedQuestions) {
            const decision = evaluateAssistantQuestionPolicy({
              prompt: question.prompt,
              questions: this.repository.getAssistantQuestions(assistantId),
              learnings: this.repository.getAssistantLearnings(assistantId),
              runtimeReadOnly: runtime.readOnly
            });
            if (decision.kind !== "ask") {
              this.applyQuestionPolicyDecision(assistantId, question.prompt, decision);
              continue;
            }
            if (askedCount >= 3) {
              this.applyQuestionPolicyDecision(assistantId, question.prompt, {
                kind: "note",
                category: decision.category,
                reason: "Assistant question batch already reached the maximum size.",
                note: `Keep working without asking extra question: ${question.prompt.trim()}`
              });
              continue;
            }
            this.repository.saveAssistantQuestion({
              id: createAssistantQuestionId(),
              assistantId,
              prompt: question.prompt.trim(),
              status: questionStatus,
              linkedTodoIds: question.linkedTodoIds ?? [],
              askedAt: new Date().toISOString()
            });
            askedCount += 1;
          }
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
      readOnly: true,
      fastMode: runtime.fastMode,
      reasoningStrength: runtime.reasoningStrength,
      promptCacheIdentity: runtime.promptCacheIdentity
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

  private async buildAssistantChatPrompt(assistant: Assistant, activeMission: string) {
    const state = this.getAssistantOperatingState(assistant.id);
    return assembleDeterministicPrompt([
      {
        kind: "system",
        content: [
          renderAssistantPromptContext(assistant, activeMission),
          ASSISTANT_ACTIONS_SKILL_PROMPT,
          "Reply directly to the user. Keep answer grounded in the assistant role and current priorities.",
          "Ask questions only when missing information blocks useful progress. If multiple questions are necessary, batch them in one response."
        ]
      },
      {
        kind: "workspace",
        content: [
          state.summary ? `Thread summary:\n${state.summary}` : undefined,
          state.assetRefs.length > 0
            ? `Linked assets:\n${state.assetRefs.map((asset) => `- [${asset.kind}] ${asset.label}: ${asset.canonicalValue ?? asset.value}`).join("\n")}`
            : undefined,
          state.activeTodos.length > 0
            ? `Active todos:\n${state.activeTodos.map((todo) => `- (${todo.id}) ${todo.state}: ${todo.title}${todo.blockerReason ? ` | blocker: ${todo.blockerReason}` : ""}`).join("\n")}`
            : "Active todos: none",
          state.pendingQuestions.length > 0
            ? `Pending questions:\n${state.pendingQuestions.map((question) => `- (${question.id}) ${question.prompt}`).join("\n")}`
            : "Pending questions: none",
          renderAssistantPromptMemoryBlock(state.answeredQuestions, state.learnings)
        ]
      },
      {
        kind: "dynamic",
        content: `Recent transcript:\n${renderMessages(state.recentMessages)}`
      }
    ]);
  }

  private async buildReprioritizePrompt(assistant: Assistant, reason: string) {
    const state = this.getAssistantOperatingState(assistant.id);
    return assembleDeterministicPrompt([
      {
        kind: "system",
        content: [
          "Return only JSON.",
          `Reason: ${reason}`,
          renderAssistantPromptContext(assistant, `Reprioritize assistant operating state because: ${reason}`),
          `Respond with JSON object:
{
  "summary": "short summary",
  "todoOrder": ["todo-id"],
  "todoUpdates": [{"id":"todo-id","state":"pending|in-progress|blocked|completed|failed|cancelled","blockerReason":"optional"}],
  "newTodos": [{"title":"todo title","description":"optional"}],
  "newLearnings": [{"summary":"learning","source":"optional","confidence":"low|medium|high"}],
  "questions": [{"prompt":"optional blocking question","linkedTodoIds":["todo-id"]}]
}`,
          "Ask questions only when missing information blocks useful progress. If multiple questions are necessary, batch them in questions. Prefer no questions when a reasonable default exists.",
          "Do not include completed, failed, or cancelled todos unless you are explicitly changing a currently active todo into one of those states."
        ]
      },
      {
        kind: "workspace",
        content: [
          state.summary ? `Thread summary:\n${state.summary}` : undefined,
          state.activeTodos.length > 0
            ? `Current active todos:\n${state.activeTodos.map((todo) => `- id=${todo.id} state=${todo.state} title=${todo.title}${todo.blockerReason ? ` blocker=${todo.blockerReason}` : ""}`).join("\n")}`
            : "Current active todos: none",
          state.pendingQuestions.length > 0
            ? `Pending questions:\n${state.pendingQuestions.map((question) => `- id=${question.id} prompt=${question.prompt}`).join("\n")}`
            : undefined,
          renderAssistantPromptMemoryBlock(state.answeredQuestions, state.learnings),
          state.recentLogs.length > 0
            ? `Recent assistant logs:\n${state.recentLogs
                .map((log) => `- ${log.createdAt} ${log.summary}${log.detail ? `: ${summarize(log.detail, 300)}` : ""}`)
                .join("\n")}`
            : undefined
        ]
      },
      {
        kind: "dynamic",
        content: `Recent transcript:\n${renderMessages(state.recentMessages.slice(-8))}`
      }
    ]);
  }

  private getAssistantOperatingState(assistantId: string) {
    const thread = this.repository.getAssistantThread(assistantId);
    const todos = this.repository
      .getAssistantTodos(assistantId)
      .filter((todo) => ["pending", "in-progress", "blocked"].includes(todo.state));
    const allQuestions = this.repository.getAssistantQuestions(assistantId);
    const questions = allQuestions.filter((question) => question.status === "pending");
    const answeredQuestions = selectAssistantPromptQuestions(allQuestions);
    const learnings = selectAssistantPromptLearnings(this.repository.getAssistantLearnings(assistantId));
    const recentLogs = this.repository.getAssistantLogEntries(assistantId).slice(0, 8);
    const assetRefs = this.repository.getAssistantAssetRefs(assistantId).filter((assetRef) => assetRef.resolutionStatus === "resolved");

    return {
      summary: thread.memorySummary?.content,
      activeTodos: todos,
      pendingQuestions: questions,
      answeredQuestions,
      learnings,
      recentLogs,
      assetRefs,
      recentMessages: thread.messages.slice(-16)
    };
  }

  private async maybeCompactAssistantLearnings(assistantId: string, reason: string) {
    const stats = this.repository.getAssistantLearningStats(assistantId);
    if (
      stats.activeFactLearningCount <= ASSISTANT_LEARNING_COMPACTION_FACT_THRESHOLD &&
      stats.activeSummaryCharCount <= ASSISTANT_LEARNING_COMPACTION_CHAR_THRESHOLD
    ) {
      return;
    }

    const assistant = this.repository.getAssistant(assistantId);
    if (!assistant) {
      return;
    }

    try {
      const runtime = await this.resolveRuntime(assistant);
      const learnings = this.repository.getAssistantLearnings(assistantId);
      const compaction = await this.runAssistantLearningCompaction(runtime.adapter, {
        assistant,
        prompt: buildAssistantLearningCompactionPrompt(assistant, reason, learnings),
        readOnly: runtime.readOnly
      });
      const now = new Date().toISOString();
      const retainedKeys = new Set((compaction.retainedFacts ?? []).map((learning) => normalizeLearningKey(learning.summary)));
      const supersededIds = learnings
        .filter((learning) => (learning.kind ?? "fact") === "fact")
        .filter((learning) => {
          if (learning.confidence !== "high") {
            return true;
          }
          const source = learning.source.toLowerCase();
          const isUserGuidance = source.startsWith("question:") || source.startsWith("question-policy:") || source.startsWith("user");
          return !isUserGuidance || retainedKeys.has(normalizeLearningKey(learning.summary));
        })
        .map((learning) => learning.id);

      this.repository.compactAssistantLearnings(
        assistantId,
        {
          id: createAssistantLearningId(),
          assistantId,
          summary: compaction.summary,
          source: normalizeAssistantLearningSource(`compaction:${reason}`),
          confidence: "high",
          createdAt: now,
          kind: "summary",
          supersedesLearningIds: supersededIds,
          compactedAt: now
        },
        supersededIds
      );

      for (const learning of compaction.retainedFacts ?? []) {
        this.repository.saveAssistantLearningDeduped({
          id: createAssistantLearningId(),
          assistantId,
          summary: learning.summary,
          source: normalizeAssistantLearningSource(learning.source ?? `compaction:${reason}:retained`),
          confidence: learning.confidence ?? "medium",
          createdAt: now,
          kind: "fact"
        });
      }
      this.appendLog({
        assistantId,
        level: "info",
        summary: "Compacted assistant learnings",
        detail: `Merged ${supersededIds.length} learning rows.`
      });
    } catch (error) {
      this.appendLog({
        assistantId,
        level: "warning",
        summary: "Assistant learning compaction skipped",
        detail: normalizeErrorMessage(error),
        detailsJson: serializeError(error)
      });
    }
  }

  private async runAssistantLearningCompaction(
    adapter: PiAgentAdapter,
    input: { assistant: Assistant; prompt: string; readOnly: boolean }
  ) {
    const firstPayload = await this.runCompactionAttempt(adapter, input);
    const first = assistantLearningCompactionSchema.safeParse(firstPayload);
    if (first.success) {
      return first.data;
    }

    const repairedPayload = await this.runCompactionAttempt(adapter, {
      ...input,
      prompt: `${input.prompt}\n\nPrevious response failed schema validation. Return only valid JSON with summary and retainedFacts.`
    });
    const repaired = assistantLearningCompactionSchema.safeParse(repairedPayload);
    if (repaired.success) {
      return repaired.data;
    }
    throw new Error("Assistant learning compaction payload invalid");
  }

  private async runCompactionAttempt(
    adapter: PiAgentAdapter,
    input: { assistant: Assistant; prompt: string; readOnly: boolean }
  ) {
    try {
      return await this.runJsonPrompt<unknown>(adapter, input);
    } catch {
      return undefined;
    }
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
      readOnly: input.readOnly,
      reasoningStrength: runtime.reasoningStrength,
      fastMode: runtime.fastMode,
      promptCacheIdentity: runtime.promptCacheIdentity
    });
    return extractJsonPayload<T>(result.text);
  }

  private async resolveRuntime(
    assistant: Assistant,
    controls: {
      modeId?: string;
      executionModelId?: string;
      reasoningStrength?: ComposerReasoningStrength;
      fastMode?: boolean;
    } = {}
  ) {
    this.repository.assertAssistantAssetRefsResolved(assistant.id);
    const providerBrand = assistant.providerBrand ?? this.repository.getProviderBrand();
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
      controls.executionModelId ??
      assistant.executionModelId ??
      runtime.getDefaultExecutionModelId(providerBrand) ??
      getDefaultExecutionModelId(providerBrand);
    const mode = resolveAssistantMode(controls.modeId ?? assistant.modeId, this.repository.loadWorkspace().workspaceModes ?? [], project);
    const readOnly = modeUsesReadOnlyExecution(mode) || !assistant.projectId;
    debugLog("assistant.runtime.resolved", {
      assistantId: assistant.id,
      projectId: assistant.projectId,
      readOnly
    });
    return {
      adapter: runtime.getAdapter(),
      cwd,
      modelId,
      readOnly,
      reasoningStrength: controls.reasoningStrength ?? assistant.reasoningStrength,
      fastMode: controls.fastMode ?? assistant.fastMode,
      promptCacheIdentity: project
        ? buildAssistantPromptCacheIdentity({
            repository: this.repository,
            projectId: project.id,
            projectRootPath: project.rootPath,
            providerBrand,
            mode
          })
        : undefined
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
          this.saveBlockingQuestion(assistantId, `Assistant paused itself after repeated failures. How should it proceed? Latest error: ${message}`, {
            forceBlocking: true
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

  private saveBlockingQuestion(assistantId: string, prompt: string, options: { forceBlocking?: boolean; runtimeReadOnly?: boolean } = {}) {
    const pendingQuestion = this.repository
      .getAssistantQuestions(assistantId)
      .find((entry) => entry.status === "pending" || entry.status === "deferred");
    if (pendingQuestion) {
      return pendingQuestion;
    }

    const decision = evaluateAssistantQuestionPolicy({
      prompt,
      questions: this.repository.getAssistantQuestions(assistantId),
      learnings: this.repository.getAssistantLearnings(assistantId),
      runtimeReadOnly: options.runtimeReadOnly,
      forceBlocking: options.forceBlocking
    });
    if (decision.kind !== "ask") {
      this.applyQuestionPolicyDecision(assistantId, prompt, decision);
      return undefined;
    }

    return this.repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId,
      prompt: prompt.trim(),
      status: this.repository.getGlobalExecutionPaused() ? "deferred" : "pending",
      askedAt: new Date().toISOString()
    });
  }

  private applyQuestionPolicyDecision(assistantId: string, prompt: string, decision: AssistantQuestionDecision) {
    if (decision.kind === "ask") {
      return;
    }
    const source = `question-policy:${decision.category}`;
    const summary =
      decision.kind === "auto-answer"
        ? `Auto-answered assistant question: ${summarize(prompt, 120)}`
        : `Did not ask assistant question: ${summarize(prompt, 120)}`;
    const detail = decision.kind === "auto-answer" ? decision.answerText : decision.note;
    this.repository.saveAssistantLearningDeduped({
      id: createAssistantLearningId(),
      assistantId,
      summary: `${summary}. ${detail}`,
      source,
      confidence: "high",
      createdAt: new Date().toISOString()
    });
    void this.maybeCompactAssistantLearnings(assistantId, `question-policy:${decision.category}`);
    this.appendLog({
      assistantId,
      level: "info",
      summary: decision.kind === "auto-answer" ? "Question auto-answered" : "Question suppressed",
      detail: decision.reason,
      detailsJson: {
        prompt,
        decision
      }
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

function extractQuestionPrompt(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 1200 || !normalized.includes("?")) {
    return undefined;
  }

  const directQuestion = normalized.match(
    /\b(?:what|which|who|when|where|why|how|should|could|would|can|do|does|did|is|are|was|were)\b[^?]*\?/i
  )?.[0];
  if (!directQuestion) {
    return undefined;
  }

  return directQuestion.trim();
}

function normalizeLearningKey(summary: string) {
  return summary.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function isOperationalPromptQuestion(question: AssistantQuestion) {
  return OPERATIONAL_PROMPT_QUESTION_CATEGORIES.has(classifyAssistantQuestion(question.prompt));
}

export function selectAssistantPromptQuestions(questions: AssistantQuestion[]) {
  const selected: AssistantQuestion[] = [];
  const seenKeys = new Set<string>();
  for (const question of questions.filter((entry) => entry.status === "answered").sort((left, right) => {
    const leftAt = left.answeredAt ?? left.askedAt;
    const rightAt = right.answeredAt ?? right.askedAt;
    return rightAt.localeCompare(leftAt);
  })) {
    if (!question.answerText || isOperationalPromptQuestion(question)) {
      continue;
    }
    const key = `${classifyAssistantQuestion(question.prompt)}:${normalizeQuestionText(question.prompt)}:${normalizeQuestionText(question.answerText)}`;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    selected.push(question);
    if (selected.length >= MAX_PROMPT_ANSWERED_QUESTIONS) {
      break;
    }
  }
  return selected;
}

export function selectAssistantPromptLearnings(learnings: AssistantLearning[]) {
  const summaryLearnings = learnings
    .filter((learning) => (learning.kind ?? "fact") === "summary")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const durableGuidance = learnings
    .filter((learning) => (learning.kind ?? "fact") === "fact")
    .filter((learning) => {
      const source = learning.source.toLowerCase();
      return (
        learning.confidence === "high" &&
        (source.startsWith("question:") || source.startsWith("question-policy:") || source.startsWith("user"))
      );
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const recentFacts = learnings
    .filter((learning) => (learning.kind ?? "fact") === "fact")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const selected: AssistantLearning[] = [];
  const seenKeys = new Set<string>();
  for (const learning of [...summaryLearnings, ...durableGuidance, ...recentFacts]) {
    const key = normalizeLearningKey(learning.summary);
    if (seenKeys.has(key) || selected.some((entry) => entry.id === learning.id)) {
      continue;
    }
    seenKeys.add(key);
    selected.push(learning);
    if (selected.length >= MAX_PROMPT_LEARNINGS) {
      break;
    }
  }
  return selected;
}

export function renderAssistantPromptMemoryBlock(answeredQuestions: AssistantQuestion[], learnings: AssistantLearning[]) {
  const lines = [
    answeredQuestions.length > 0
      ? `Recent durable answers:\n${answeredQuestions.map((question) => `- ${summarize(question.prompt, 120)} => ${summarize(question.answerText ?? "", 120)}`).join("\n")}`
      : undefined,
    learnings.length > 0 ? `Relevant learnings:\n${learnings.map((learning) => `- ${learning.summary}`).join("\n")}` : undefined
  ].filter(Boolean);
  if (lines.length === 0) {
    return "# Durable Guidance\nnone";
  }
  return ["# Durable Guidance", ...lines].join("\n");
}

export function renderAssistantPromptContext(
  assistant: Pick<Assistant, "name" | "description" | "personalityPrompt" | "jobPrompt">,
  activeMission?: string
) {
  return [
    `# IDENTITY: ${assistant.name}`,
    `Personality: ${assistant.personalityPrompt.trim() || "No personality provided."}`,
    `Description: ${assistant.description?.trim() || "No description provided."}`,
    "",
    "# OPERATIONAL LOGIC (The Job)",
    assistant.jobPrompt.trim() || "No job prompt provided.",
    activeMission?.trim() ? ["", "# ACTIVE MISSION (The Request)", activeMission.trim()].join("\n") : undefined
  ]
    .filter((part) => part !== undefined)
    .join("\n");
}

function buildBootstrapPrompt(assistant: Assistant) {
  return [
    "Return only JSON.",
    renderAssistantPromptContext(assistant, "Bootstrap assistant operating state and propose initial durable guidance."),
    `Respond with JSON object:
{
  "researchSummary": "what role success looks like",
  "learnings": [{"summary":"learning","source":"optional","confidence":"low|medium|high"}],
  "initialTodos": [{"title":"todo title","description":"optional"}],
  "remainIdle": true
}`,
    "Only create initialTodos when the job prompt implies proactive work, backlog maintenance, implementation, or recurring execution.",
    "Do not ask questions during bootstrap unless role setup cannot proceed without user input; prefer durable assumptions and learnings."
  ].join("\n\n");
}

function buildAssistantLearningCompactionPrompt(assistant: Assistant, reason: string, learnings: AssistantLearning[]) {
  const summaryLearning = learnings.find((learning) => (learning.kind ?? "fact") === "summary");
  const highConfidenceGuidance = learnings.filter((learning) => {
    const source = learning.source.toLowerCase();
    return (
      learning.confidence === "high" &&
      (source.startsWith("question:") || source.startsWith("question-policy:") || source.startsWith("user"))
    );
  });
  const recentLearnings = learnings
    .filter((learning) => (learning.kind ?? "fact") === "fact")
    .slice(0, 40);
  const compactInput = [...(summaryLearning ? [summaryLearning] : []), ...highConfidenceGuidance, ...recentLearnings]
    .filter((learning, index, source) => source.findIndex((entry) => entry.id === learning.id) === index)
    .slice(0, 80);

  return [
    "Return only JSON.",
    `Compaction reason: ${reason}`,
    renderAssistantPromptContext(assistant, `Compact assistant learnings because: ${reason}`),
    "Merge assistant learnings into compact durable guidance. Remove duplicates and stale phrasing. Preserve user/question guidance unless contradicted.",
    "Never return placeholder labels such as merged durable assistant guidance or compacted summary; summary must contain the actual durable guidance.",
    `Current learnings:\n${compactInput.map((learning) => `- id=${learning.id} kind=${learning.kind ?? "fact"} confidence=${learning.confidence} source=${learning.source}: ${learning.summary}`).join("\n")}`,
    `Respond with JSON object:
{
  "summary": "Prefer concise durable guidance and preserve user constraints.",
  "retainedFacts": [{"summary":"important fact","source":"source","confidence":"low|medium|high"}]
}`
  ].join("\n\n");
}

function buildThreadSummaryPrompt(assistant: Assistant, thread: AssistantThread) {
  return assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        `Summarize the assistant memory for ${assistant.name}.`,
        "Preserve user commitments, unresolved blockers, active priorities, and open loops."
      ]
    },
    {
      kind: "dynamic",
      content: renderMessages(thread.messages.slice(-80))
    }
  ]);
}

function isGarbageAssistantCompactionSummary(summary: string) {
  return ASSISTANT_COMPACTION_GARBAGE_SUMMARIES.has(normalizeLearningKey(summary));
}

const ASSISTANT_COMPACTION_GARBAGE_SUMMARIES = new Set([
  "merged durable assistant guidance",
  "compacted summary",
  "compacted summary merged durable assistant guidance"
]);

function buildAssistantPromptCacheIdentity(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  projectRootPath: string;
  providerBrand: ProviderBrand;
  mode?: ModeDefinition;
}): PromptCacheIdentity {
  return {
    projectId: input.projectId,
    workspaceConfigHash: buildWorkspaceConfigHash({
      projectId: input.projectId,
      projectRootPath: input.projectRootPath,
      providerBrand: input.providerBrand,
      selectedModeId: input.mode?.id,
      mode: input.mode,
      memoryBankEnabledDefault: input.repository.getMemoryBankEnabledDefault()
    })
  };
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
      message: error.message
    };
  }
  return { value: error };
}

function summarize(value: string, maxLength: number = 240) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
