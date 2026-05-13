import path from "node:path";
import { resolveModeById } from "../../shared/modes";
import {
  createAssistantLogEntryId,
  createChatMessage,
  type AgentRunState,
  type AgentTrace,
  type BackgroundJob,
  type BackgroundJobRun,
  type AgentId,
  type PlanningQuestionBatchNotification,
  type PlanningQuestion,
  type PlannerQuestionTurn,
  type PlanningQuestionNotification,
  type PlannerReadyTurn,
  type ProjectContextUsage,
  type ProviderBrand,
  type WorkspaceRuleSource,
  type MemorySummary,
  type ModeDefinition,
  type ComposerReasoningStrength
} from "../../shared/protocol";
import { executeReadyRun, runPlannerTurn } from "./pi-orchestrator";
import { BoundedOutputBuffer, formatOutputCapExceeded } from "./bounded-output-buffer";
import { terminateProcessTree } from "./agent-runtimes/cli-process-manager";
import { createStableBoundedId } from "./notification-ids";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import { WorkspaceRepository } from "./workspace-repository";
import {
  renderAssistantPromptContext,
  renderAssistantPromptMemoryBlock,
  selectAssistantPromptLearnings,
  selectAssistantPromptQuestions
} from "./assistant-manager";
import { getPostRunScheduleAdvance } from "./background-job-schedule";
import { evaluateAssistantQuestionPolicy } from "./assistant-question-policy";
import { buildWorkspaceConfigHash, type PromptCacheIdentity } from "./prompt-cache";
import { prepareGeminiCachedAttachmentContext, type GeminiCachedAttachmentContext } from "./gemini-cached-contents";

type BackgroundJobExecutorOptions = {
  repository: WorkspaceRepository;
  adapter: PiAgentAdapter;
  agentId: AgentId;
  job: BackgroundJob;
  run: BackgroundJobRun;
  providerBrand: ProviderBrand;
  planningModelId: string;
  executionModelId: string;
  reasoningStrength?: ComposerReasoningStrength;
  debugEnabled: boolean;
  abortSignal?: AbortSignal;
  onRunUpdated?: (run: BackgroundJobRun) => void | Promise<void>;
};

// Defense-in-depth bounds for shell job timeouts. The WS boundary schema in
// `harness/shared/protocol.ts` already enforces 1..86400; these guards protect
// against stale DB rows or migration drift that could otherwise schedule a
// zero/negative/NaN timeout and instantly kill a proc (or never time out).
export const MIN_SHELL_TIMEOUT_SECONDS = 1;
export const MAX_SHELL_TIMEOUT_SECONDS = 24 * 60 * 60;
export const DEFAULT_SHELL_TIMEOUT_SECONDS = 60;
export const SHELL_OUTPUT_CAP_BYTES = 2 * 1024 * 1024;
export const MAX_BACKGROUND_AUTO_QUESTION_ROUNDS = 1;
export const DEFAULT_BACKGROUND_RUN_LIVENESS_HEARTBEAT_MS = 60_000;

export function resolveShellTimeoutMs(input: unknown) {
  const numeric = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_SHELL_TIMEOUT_SECONDS * 1000;
  }
  const clamped = Math.min(MAX_SHELL_TIMEOUT_SECONDS, Math.max(MIN_SHELL_TIMEOUT_SECONDS, Math.floor(numeric)));
  return clamped * 1000;
}

export async function executeBackgroundJobRun(options: BackgroundJobExecutorOptions) {
  return options.job.kind === "shell" ? executeShellJob(options) : executeAiRoutineJob(options);
}

async function executeAiRoutineJob(options: BackgroundJobExecutorOptions) {
  const { repository, adapter, job, run, providerBrand, debugEnabled, abortSignal } = options;
  if (job.definition.kind !== "ai-routine") {
    throw new Error(`Expected ai-routine definition for ${job.id}`);
  }

  const definition = job.definition;
  const project = repository.getProject(job.projectId);
  const threadId = job.automationThreadId;
  const mode = resolveModeById(definition.modeId ?? project.selectedModeId, project.projectModes);
  const executionModelId = options.executionModelId;
  const ruleSources = [project.projectRuleSource].filter((value): value is WorkspaceRuleSource => Boolean(value));
  const memorySummaries = [repository.getThreadMemorySummary(job.projectId, threadId)].filter(
    (value): value is MemorySummary => Boolean(value)
  );
  const assistantOwned = Boolean(job.assistantId);
  const existingThreadMessages = repository.getThreadMessages(job.projectId, threadId);
  const prompt = job.assistantId
    ? buildAssistantRoutinePrompt(definition.prompt, repository, job.assistantId)
    : definition.prompt;
  const plannerMessages = [
    ...existingThreadMessages,
    createChatMessage("system", `Scheduled job ${job.name} started.`),
    createChatMessage("user", prompt)
  ];
  const promptCacheIdentity = buildBackgroundPromptCacheIdentity(options, {
    projectRootPath: project.rootPath,
    mode,
    ruleSources,
    memorySummaries
  });
  const geminiCachedAttachmentContext = await prepareGeminiCachedAttachmentContext({
    repository,
    projectId: job.projectId,
    modelId: options.planningModelId,
    messages: plannerMessages,
    googleApiKey: repository.getStoredGoogleApiKey()
  });
  const resumableRun =
    run.linkedAgentRunId
      ? repository.getRun(job.projectId, run.linkedAgentRunId)
      : undefined;

  setBackgroundJobRunStatus(options, run.id, "running");
  appendBackgroundJobRunEvent(options, run.id, "planned", `Starting AI routine ${job.name}`);
  appendBackgroundJobRunEvent(options, run.id, "input", "Background AI prompt", summarize(prompt, 4000));
  if (!assistantOwned) {
    repository.appendMessage(job.projectId, "system", `Scheduled job ${job.name} started.`, {
      threadId
    });
  }
  const activeRun =
    resumableRun && resumableRun.status === "ready" && resumableRun.plan
      ? resumableRun
      : (() => {
        repository.createAgentRun(job.projectId, prompt, options.planningModelId, threadId);
        return repository.getLatestThreadRun(job.projectId, threadId);
      })();
  if (!activeRun) {
    throw new Error(`Background AI run was not created for ${job.name}`);
  }

  setBackgroundJobRunStatus(options, run.id, "running", {
    linkedAgentRunId: activeRun.id,
    resumeAttemptCount: resumableRun?.id === activeRun.id ? (run.resumeAttemptCount ?? 0) : undefined
  });

  if (resumableRun?.id === activeRun.id && activeRun.plan) {
    repository.setBackgroundJobRunPromptStats(run.id, activeRun.promptStats ?? createFallbackPromptStats(prompt, plannerMessages));
    repository.setAgentRunStatus(
      job.projectId,
      activeRun.id,
      activeRun.subtasks.length > 0 ? "running-subagents" : "running-main"
    );
    appendBackgroundJobRunEvent(options, run.id, "planned", "Resuming linked ready run", activeRun.plan.summary);
    return finalizeBackgroundAiRun(
      options,
      job,
      activeRun,
      plannerMessages,
      buildPlannerReadyTurnFromRun(activeRun),
      activeRun.plan,
      assistantOwned,
      definition.reasoningStrength,
      definition.fastMode
    );
  }

  let plannerTurn = await runBackgroundPlannerTurn(options, {
    projectRoot: project.rootPath,
    threadId,
    prompt,
    backgroundRunId: run.id,
    runId: activeRun.id,
    providerBrand,
    executionModelId,
    messages: plannerMessages,
    mode,
    ruleSources,
    memorySummaries,
    priorQuestions: activeRun.questions,
    promptCacheIdentity,
    geminiCachedAttachmentContext
  });
  repository.setAgentRunPromptStats(job.projectId, activeRun.id, plannerTurn.promptStats);
  repository.setBackgroundJobRunPromptStats(run.id, plannerTurn.promptStats);
  let autoQuestionRounds = 0;
  while (assistantOwned && plannerTurn.plannerResult.type === "question") {
    const autoResolved = tryAutoResolveAssistantPlanningQuestions(options, job, activeRun.id, plannerTurn.plannerResult.questions);
    if (!autoResolved) {
      break;
    }
    autoQuestionRounds += 1;
    appendBackgroundJobRunEvent(
      options,
      run.id,
      "question-auto-resolved",
      "Planning question auto-resolved",
      autoResolved.summary
    );
    if (autoQuestionRounds > MAX_BACKGROUND_AUTO_QUESTION_ROUNDS) {
      appendBackgroundJobRunEvent(
        options,
        run.id,
        "skipped",
        "Planner kept asking nonblocking question after auto-resolution",
        autoResolved.summary
      );
      setBackgroundJobRunStatus(options, run.id, "skipped", {
        summary: "Planner kept asking nonblocking question after auto-resolution"
      });
      updateJobCompletionSchedule(repository, job.id);
      return repository.getBackgroundJobRun(run.id)!;
    }
    const refreshedRun = repository.getRun(job.projectId, activeRun.id) ?? activeRun;
    plannerTurn = await runBackgroundPlannerTurn(options, {
      projectRoot: project.rootPath,
      threadId,
      prompt,
      backgroundRunId: run.id,
      runId: activeRun.id,
      providerBrand,
      executionModelId,
      messages: plannerMessages,
      mode,
      ruleSources,
      memorySummaries,
      priorQuestions: refreshedRun.questions,
      promptCacheIdentity,
      geminiCachedAttachmentContext
    });
    repository.setAgentRunPromptStats(job.projectId, activeRun.id, plannerTurn.promptStats);
    repository.setBackgroundJobRunPromptStats(run.id, plannerTurn.promptStats);
  }

  if (plannerTurn.plannerResult.type === "question") {
    repository.appendPlanningQuestions(
      job.projectId,
      activeRun.id,
      plannerTurn.plannerResult.questions,
      "deferred",
      createStableBoundedId(["planner-turn", activeRun.id, plannerTurn.promptStats.promptHash])
    );
    const questionRun = repository.getRun(job.projectId, activeRun.id);
    const deferredQuestions = questionRun?.questions.filter((question) => question.status === "deferred") ?? [];
    const deferredQuestion = deferredQuestions[0];
    if (!deferredQuestion) {
      throw new Error("Deferred planning question was not persisted for background run");
    }

    if (deferredQuestions.length > 1) {
      repository.saveNotification(createPlanningQuestionBatchNotification(job, activeRun.id, deferredQuestions));
      for (const question of deferredQuestions) {
        repository.archiveNotification(createNotificationId("planning-question", activeRun.id, question.id));
      }
    } else {
      for (const question of deferredQuestions) {
        repository.saveNotification(createPlanningQuestionNotification(job, activeRun.id, question));
      }
    }
    appendBackgroundJobRunEvent(
      options,
      run.id,
      "awaiting-user-input",
      "Waiting for user input",
      deferredQuestions.map((question) => question.prompt).join("\n\n")
    );
    setBackgroundJobRunStatus(options, run.id, "awaiting-user-input", {
      summary: deferredQuestion.prompt
    });
    updateJobCompletionSchedule(repository, job.id);
    return repository.getBackgroundJobRun(run.id)!;
  }

  repository.setAgentRunReady(
    job.projectId,
    activeRun.id,
    plannerTurn.plannerResult,
    plannerTurn.executionPlan,
    plannerTurn.plannerResult.subtasks,
    plannerTurn.planningModelId
  );
  appendBackgroundJobRunEvent(options, run.id, "planned", plannerTurn.plannerResult.summary);
  repository.setAgentRunStatus(
    job.projectId,
    activeRun.id,
    plannerTurn.plannerResult.usesSubagents ? "running-subagents" : "running-main"
  );
  return finalizeBackgroundAiRun(
    options,
    job,
    activeRun,
    plannerMessages,
    plannerTurn.plannerResult as PlannerReadyTurn,
    plannerTurn.executionPlan,
    assistantOwned,
    definition.reasoningStrength,
    definition.fastMode
  );
}

async function finalizeBackgroundAiRun(
  options: BackgroundJobExecutorOptions,
  job: BackgroundJob,
  activeRun: AgentRunState,
  plannerMessages: ReturnType<WorkspaceRepository["getThreadMessages"]>,
  readyPlan: PlannerReadyTurn,
  executionPlan: AgentRunState["plan"],
  assistantOwned: boolean,
  reasoningStrength: ComposerReasoningStrength | undefined,
  fastMode: boolean | undefined
) {
  const { repository, adapter, providerBrand, debugEnabled, abortSignal } = options;
  const project = repository.getProject(job.projectId);
  const threadId = job.automationThreadId;
  const plan = executionPlan ?? activeRun.plan;
  const promptCacheIdentity = buildBackgroundPromptCacheIdentity(options, {
    projectRootPath: project.rootPath,
    mode: plan?.mode,
    ruleSources: plan?.ruleSources,
    memorySummaries: plan?.memorySummaries
  });
  const geminiCachedAttachmentContext = await prepareGeminiCachedAttachmentContext({
    repository,
    projectId: job.projectId,
    modelId: readyPlan.executionModelId,
    messages: plannerMessages,
    googleApiKey: repository.getStoredGoogleApiKey()
  });
  const stopLivenessHeartbeat = startBackgroundRunLivenessHeartbeat(options, options.run.id);
  let outcome: Awaited<ReturnType<typeof executeReadyRun>>;
  try {
    outcome = await executeReadyRun(adapter, {
      cwd: project.rootPath,
      runId: activeRun.id,
      sessionId: threadId,
      messages: plannerMessages,
      agentId: options.agentId,
      providerBrand,
      readyPlan,
      debugEnabled,
      reasoningStrength,
      fastMode,
      abortSignal,
      callbacks: createBackgroundExecutionCallbacks(options, job.projectId, options.run.id, activeRun.id),
      executionPlan: executionPlan ?? undefined,
      promptCacheIdentity,
      geminiCachedAttachmentContext
    });
  } finally {
    stopLivenessHeartbeat();
  }

  if (!assistantOwned) {
    repository.appendMessage(job.projectId, "assistant", outcome.assistantMessage.content, {
      threadId
    });
  }
  repository.setAgentRunStatus(
    job.projectId,
    activeRun.id,
    outcome.partial ? "partial-complete" : "completed",
    outcome.partial ? "Background run partial complete" : undefined
  );
  appendBackgroundJobRunEvent(
    options,
    options.run.id,
    outcome.partial ? "failed" : "done",
    outcome.partial ? "Background AI run completed with failures." : "Background AI run completed.",
    outcome.assistantMessage.content.slice(0, 2000)
  );
  if (job.assistantId) {
    repository.appendAssistantLogEntry({
      id: createAssistantLogEntryId(),
      assistantId: job.assistantId,
      level: outcome.partial ? "warning" : "info",
      summary: outcome.partial ? "Assistant job completed with failures" : "Assistant job output captured",
      detail: summarize(outcome.assistantMessage.content, 4000),
      detailsJson: {
        backgroundRunId: options.run.id,
        jobId: job.id,
        linkedAgentRunId: activeRun.id
      },
      createdAt: new Date().toISOString()
    });
  }
  setBackgroundJobRunStatus(options, options.run.id, outcome.partial ? "failed" : "succeeded", {
    summary: summarizeBackgroundAssistantMessage(outcome.assistantMessage),
    failureMessage: outcome.partial ? "Some subagent work failed." : undefined
  });
  updateJobCompletionSchedule(repository, job.id);
  return repository.getBackgroundJobRun(options.run.id)!;
}

async function executeShellJob(options: BackgroundJobExecutorOptions) {
  const { repository, job, run, abortSignal } = options;
  if (job.definition.kind !== "shell") {
    throw new Error(`Expected shell definition for ${job.id}`);
  }

  const definition = job.definition;
  const cwd = definition.cwd ? path.resolve(definition.cwd) : repository.getProject(job.projectId).rootPath;
  setBackgroundJobRunStatus(options, run.id, "running");
  appendBackgroundJobRunEvent(options, run.id, "spawned", `Running ${definition.executable}`);

  const proc = Bun.spawn({
    cmd: [definition.executable, ...definition.args],
    cwd,
    env: resolveEnvironmentRefs(definition.envRefs),
    stdout: "pipe",
    stderr: "pipe"
  });

  const abortHandler = () => {
    void terminateProcessTree(proc);
  };
  abortSignal?.addEventListener("abort", abortHandler, { once: true });
  const timeoutId = setTimeout(() => {
    void terminateProcessTree(proc);
  }, resolveShellTimeoutMs(definition.timeoutSeconds));

  let outputLimitMessage: string | undefined;
  const [stdoutSnapshot, stderrSnapshot, exitCode] = await Promise.all([
    consumeBoundedStream(proc.stdout, "stdout", (message) => {
      outputLimitMessage ??= message;
      void terminateProcessTree(proc);
    }, () => {
      repository.touchBackgroundJobRun(run.id, { stage: "stdout", detail: "Shell stdout received" });
    }),
    consumeBoundedStream(proc.stderr, "stderr", (message) => {
      outputLimitMessage ??= message;
      void terminateProcessTree(proc);
    }, () => {
      repository.touchBackgroundJobRun(run.id, { stage: "stderr", detail: "Shell stderr received" });
    }),
    proc.exited
  ]).finally(() => {
    clearTimeout(timeoutId);
    abortSignal?.removeEventListener("abort", abortHandler);
  });
  const stdout = stdoutSnapshot.text;
  const stderr = stderrSnapshot.text;

  if (stdout.trim()) {
    appendBackgroundJobRunEvent(options, run.id, "stdout", "Stdout", stdout.slice(0, 4000));
  }
  if (stderr.trim()) {
    appendBackgroundJobRunEvent(options, run.id, "stderr", "Stderr", stderr.slice(0, 4000));
  }

  if (outputLimitMessage) {
    appendBackgroundJobRunEvent(options, run.id, "failed", "Shell output exceeded cap", outputLimitMessage);
    setBackgroundJobRunStatus(options, run.id, "failed", {
      summary: summarizeShellOutput(stdout, stderr),
      failureMessage: outputLimitMessage
    });
  } else if (exitCode === 0) {
    appendBackgroundJobRunEvent(options, run.id, "exit", "Shell job completed", `Exit code ${exitCode}`);
    setBackgroundJobRunStatus(options, run.id, "succeeded", {
      summary: summarizeShellOutput(stdout, stderr)
    });
  } else {
    appendBackgroundJobRunEvent(options, run.id, "failed", "Shell job failed", `Exit code ${exitCode}`);
    setBackgroundJobRunStatus(options, run.id, "failed", {
      summary: summarizeShellOutput(stdout, stderr),
      failureMessage: `Exit code ${exitCode}`
    });
  }

  updateJobCompletionSchedule(repository, job.id);
  return repository.getBackgroundJobRun(run.id)!;
}

function createBackgroundExecutionCallbacks(
  options: Pick<BackgroundJobExecutorOptions, "repository" | "onRunUpdated">,
  projectId: string,
  backgroundRunId: string,
  agentRunId: string
) {
  const { repository } = options;
  return {
    onTrace(trace: AgentTrace) {
      appendBackgroundJobRunEvent(options, backgroundRunId, trace.stage, trace.message, trace.detail);
    },
    onContextUsage(contextUsage: ProjectContextUsage) {
      appendBackgroundJobRunEvent(
        options,
        backgroundRunId,
        "context",
        `Context ${contextUsage.sourceLabel}`,
        JSON.stringify(contextUsage)
      );
    },
    onSubagentStart(task: PlannerReadyTurn["subtasks"][number]) {
      const currentTask = repository.getRun(projectId, agentRunId)?.subtasks.find((entry) => entry.id === task.id);
      repository.markSubtaskStarted(projectId, agentRunId, task.id, (currentTask?.attemptCount ?? 0) + 1);
    },
    onSubagentResult(result: {
      id: string;
      status: "completed" | "failed";
      output?: string;
      errorMessage?: string;
      attemptCount: number;
      commitSha?: string;
      worktreePath?: string;
    }) {
      if (result.status === "completed") {
        repository.markSubtaskCompleted(
          projectId,
          agentRunId,
          result.id,
          result.output ?? "",
          result.attemptCount,
          result.commitSha,
          result.worktreePath
        );
        return;
      }

      repository.markSubtaskFailed(
        projectId,
        agentRunId,
        result.id,
        result.errorMessage ?? "Unknown background subagent failure",
        result.attemptCount,
        result.worktreePath
      );
    }
  };
}

export function startBackgroundRunLivenessHeartbeat(
  options: Pick<BackgroundJobExecutorOptions, "repository" | "onRunUpdated">,
  runId: string,
  intervalMs = DEFAULT_BACKGROUND_RUN_LIVENESS_HEARTBEAT_MS
) {
  const touch = () => {
    const run = options.repository.touchBackgroundJobRun(runId, {
      stage: "execution-running",
      detail: "Main Codex CLI execution still running"
    });
    if (run) {
      void options.onRunUpdated?.(run);
    }
  };
  touch();
  const timer = setInterval(touch, intervalMs);
  return () => {
    clearInterval(timer);
  };
}

function updateJobCompletionSchedule(repository: WorkspaceRepository, jobId: string) {
  const completedAt = new Date();
  const job = repository.getBackgroundJob(jobId);
  const advance = job ? getPostRunScheduleAdvance(job.schedule, completedAt) : undefined;
  repository.updateBackgroundJobSchedule(
    jobId,
    advance
      ? {
          schedule: advance.schedule,
          nextRunAt: advance.nextRunAt,
          lastRunAt: completedAt.toISOString()
        }
      : {
          lastRunAt: completedAt.toISOString()
        }
  );
}

function runBackgroundPlannerTurn(
  options: BackgroundJobExecutorOptions,
  input: {
    projectRoot: string;
    threadId: string;
    prompt: string;
    backgroundRunId: string;
    runId: string;
    providerBrand: ProviderBrand;
    executionModelId: string;
    messages: ReturnType<WorkspaceRepository["getThreadMessages"]>;
    mode: ModeDefinition;
    ruleSources: WorkspaceRuleSource[];
    memorySummaries: MemorySummary[];
    priorQuestions: PlanningQuestion[];
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
  }
) {
  const { repository, adapter, job, abortSignal } = options;
  if (job.definition.kind !== "ai-routine") {
    throw new Error(`Expected ai-routine definition for ${job.id}`);
  }
  return runPlannerTurn(adapter, {
    cwd: input.projectRoot,
    sessionId: input.threadId,
    messages: input.messages,
    latestUserPrompt: input.prompt,
    runId: input.runId,
    agentId: options.agentId,
    providerBrand: input.providerBrand,
    planningModelId: options.planningModelId,
    executionModelId: input.executionModelId,
    subagentWorktreeStrategy: job.definition.subagentWorktreeStrategy ?? repository.getSubagentWorktreeStrategyDefault(),
    planExecutionMode: job.definition.planExecutionMode ?? repository.getPlanExecutionModeDefault(),
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode: repository.getCorrectnessIterationModeDefault(),
    mode: input.mode,
    ruleSources: input.ruleSources,
    memorySummaries: input.memorySummaries,
    priorQuestions: input.priorQuestions,
    promptCacheIdentity: input.promptCacheIdentity,
    geminiCachedAttachmentContext: input.geminiCachedAttachmentContext,
    reasoningStrength: job.definition.reasoningStrength ?? options.reasoningStrength,
    fastMode: job.definition.fastMode,
    abortSignal,
    callbacks: createBackgroundExecutionCallbacks(options, job.projectId, input.backgroundRunId, input.runId)
  });
}

function buildBackgroundPromptCacheIdentity(
  options: BackgroundJobExecutorOptions,
  input: {
    projectRootPath: string;
    mode?: ModeDefinition;
    ruleSources?: WorkspaceRuleSource[];
    memorySummaries?: MemorySummary[];
  }
): PromptCacheIdentity {
  return {
    projectId: options.job.projectId,
    workspaceConfigHash: buildWorkspaceConfigHash({
      projectId: options.job.projectId,
      projectRootPath: input.projectRootPath,
      providerBrand: options.providerBrand,
      selectedModeId: input.mode?.id,
      mode: input.mode,
      ruleSources: input.ruleSources,
      memorySummaries: input.memorySummaries,
      memoryBankEnabledDefault: options.repository.getMemoryBankEnabledDefault()
    })
  };
}

function tryAutoResolveAssistantPlanningQuestions(
  options: BackgroundJobExecutorOptions,
  job: BackgroundJob,
  agentRunId: string,
  questions: PlannerQuestionTurn["questions"]
) {
  if (!job.assistantId || questions.length === 0) {
    return undefined;
  }
  const assistantQuestions = options.repository.getAssistantQuestions(job.assistantId);
  const learnings = options.repository.getAssistantLearnings(job.assistantId);
  const decisions = questions.map((question) => ({
    question,
    decision: evaluateAssistantQuestionPolicy({
      prompt: question.prompt,
      questions: assistantQuestions,
      learnings
    })
  }));
  if (decisions.some((entry) => entry.decision.kind === "ask")) {
    return undefined;
  }

  const prompts: string[] = [];
  const plannerTurnId = crypto.randomUUID();
  options.repository.appendPlanningQuestions(
    job.projectId,
    agentRunId,
    decisions.map(({ question }) => question),
    "deferred",
    plannerTurnId
  );
  const persistedRun = options.repository.getRun(job.projectId, agentRunId);
  for (const { question, decision } of decisions) {
    const savedQuestion = [...(persistedRun?.questions ?? [])]
      .reverse()
      .find(
        (entry) =>
          entry.status === "deferred" &&
          entry.prompt === question.prompt &&
          (entry.logicalQuestionId ?? entry.id) === question.id
      );
    if (!savedQuestion) {
      throw new Error("Deferred planning question was not persisted for auto-resolution");
    }
    options.repository.answerPlanningQuestion(job.projectId, agentRunId, savedQuestion.id, resolveAssistantPolicyAnswer(decision));
    prompts.push(question.prompt);
  }
  return {
    summary: prompts.join("\n\n")
  };
}

function resolveAssistantPolicyAnswer(decision: ReturnType<typeof evaluateAssistantQuestionPolicy>) {
  switch (decision.kind) {
    case "auto-answer":
      return decision.answerText;
    case "suppress":
      return decision.note;
    case "note":
      return decision.note;
    case "ask":
      return decision.reason;
  }
}

function appendBackgroundJobRunEvent(
  options: Pick<BackgroundJobExecutorOptions, "repository" | "onRunUpdated">,
  runId: string,
  stage: string,
  message: string,
  detail?: string
) {
  const run = options.repository.appendBackgroundJobRunEvent(runId, stage, message, detail);
  void options.onRunUpdated?.(run);
  return run;
}

function setBackgroundJobRunStatus(
  options: Pick<BackgroundJobExecutorOptions, "repository" | "onRunUpdated">,
  runId: string,
  status: Parameters<WorkspaceRepository["setBackgroundJobRunStatus"]>[1],
  input?: Parameters<WorkspaceRepository["setBackgroundJobRunStatus"]>[2]
) {
  const run = options.repository.setBackgroundJobRunStatus(runId, status, input);
  void options.onRunUpdated?.(run);
  return run;
}

function summarizeBackgroundAssistantMessage(message: ReturnType<typeof createChatMessage>) {
  return message.content.replace(/\s+/g, " ").trim().slice(0, 240);
}

function buildPlannerReadyTurnFromRun(run: AgentRunState): PlannerReadyTurn {
  if (!run.plan || !run.finalExecutionBrief) {
    throw new Error(`Agent run ${run.id} is missing execution plan data for resume`);
  }

  return {
    type: "ready",
    difficultyScore: run.plan.difficultyScore,
    summary: run.plan.summary,
    executionModelId: run.plan.executionModelId,
    usesSubagents: run.plan.actualSubagentCount > 0,
    subtasks: run.subtasks.map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction
    })),
    finalExecutionBrief: run.finalExecutionBrief,
    prerequisites: run.plan.prerequisites,
    contracts: run.plan.contracts
  };
}

function createFallbackPromptStats(
  prompt: string,
  messages: ReturnType<WorkspaceRepository["getThreadMessages"]>
) {
  const transcriptChars = messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n").length;
  return {
    promptChars: prompt.length,
    promptHash: Bun.hash(prompt).toString(16),
    transcriptChars,
    latestTaskChars: prompt.length
  };
}

function summarize(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function summarizeShellOutput(stdout: string, stderr: string) {
  const primary = stdout.trim() || stderr.trim() || "No output";
  return primary.replace(/\s+/g, " ").trim().slice(0, 240);
}

function buildAssistantRoutinePrompt(
  basePrompt: string,
  repository: WorkspaceRepository,
  assistantId: string
) {
  const assistant = repository.getAssistant(assistantId);
  if (!assistant) {
    return basePrompt;
  }

  const answeredQuestions = selectAssistantPromptQuestions(repository.getAssistantQuestions(assistantId));
  const learnings = selectAssistantPromptLearnings(repository.getAssistantLearnings(assistantId));

  return [
    renderAssistantPromptContext(assistant, basePrompt),
    renderAssistantPromptMemoryBlock(answeredQuestions, learnings)
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function consumeBoundedStream(
  stream: ReadableStream<Uint8Array>,
  label: "stdout" | "stderr",
  onExceeded: (message: string) => void,
  onChunk?: () => void
) {
  const buffer = new BoundedOutputBuffer(SHELL_OUTPUT_CAP_BYTES);
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        return buffer.snapshot();
      }
      onChunk?.();
      const snapshot = buffer.append(next.value);
      if (snapshot.exceeded) {
        onExceeded(formatOutputCapExceeded(label, snapshot));
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function createPlanningQuestionNotification(
  job: BackgroundJob,
  linkedAgentRunId: string,
  question: PlanningQuestion
): PlanningQuestionNotification {
  return {
    id: createNotificationId("planning-question", linkedAgentRunId, question.id),
    kind: "planning-question",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId: job.projectId,
    threadId: job.automationThreadId,
    runId: linkedAgentRunId,
    questionId: question.id,
    prompt: question.prompt,
    placeholder: question.placeholder,
    choices: question.choices
  };
}

function createPlanningQuestionBatchNotification(
  job: BackgroundJob,
  linkedAgentRunId: string,
  questions: PlanningQuestion[]
): PlanningQuestionBatchNotification {
  return {
    id: createStableBoundedId(["planning-question-batch", linkedAgentRunId, ...questions.map((question) => question.id)]),
    kind: "planning-question-batch",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId: job.projectId,
    threadId: job.automationThreadId,
    runId: linkedAgentRunId,
    questions: questions.slice(0, 5).map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      placeholder: question.placeholder,
      responseKind: question.responseKind,
      choices: question.choices
    }))
  };
}

function createNotificationId(kind: string, primaryId: string, secondaryId: string) {
  return createStableBoundedId([kind, primaryId, secondaryId]);
}

function resolveEnvironmentRefs(envRefs: string[] | undefined) {
  if (!envRefs || envRefs.length === 0) {
    return undefined;
  }

  const resolved: Record<string, string> = {};
  for (const ref of envRefs) {
    const value = Bun.env[ref];
    if (value) {
      resolved[ref] = value;
    }
  }
  return resolved;
}
