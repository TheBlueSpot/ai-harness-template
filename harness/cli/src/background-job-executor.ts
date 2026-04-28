import path from "node:path";
import { resolveModeById } from "../../shared/modes";
import {
  createAssistantLogEntryId,
  createChatMessage,
  type AgentTrace,
  type BackgroundJob,
  type BackgroundJobRun,
  type AgentId,
  type PlanningQuestionBatchNotification,
  type PlanningQuestion,
  type PlanningQuestionNotification,
  type PlannerReadyTurn,
  type ProjectContextUsage,
  type ProviderBrand,
  type WorkspaceRuleSource,
  type MemorySummary
} from "../../shared/protocol";
import { executeReadyRun, runPlannerTurn } from "./pi-orchestrator";
import { BoundedOutputBuffer, formatOutputCapExceeded } from "./bounded-output-buffer";
import { createStableBoundedId } from "./notification-ids";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import { WorkspaceRepository } from "./workspace-repository";

type BackgroundJobExecutorOptions = {
  repository: WorkspaceRepository;
  adapter: PiAgentAdapter;
  agentId: AgentId;
  job: BackgroundJob;
  run: BackgroundJobRun;
  providerBrand: ProviderBrand;
  planningModelId: string;
  executionModelId: string;
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
  const prompt = job.assistantId
    ? buildAssistantRoutinePrompt(definition.prompt, repository, job.assistantId)
    : definition.prompt;
  const assistantOwned = Boolean(job.assistantId);
  const syntheticMessages = assistantOwned
    ? [
        ...repository.getThreadMessages(job.projectId, threadId),
        createChatMessage("system", `Scheduled job ${job.name} started.`),
        createChatMessage("user", prompt)
      ]
    : undefined;

  setBackgroundJobRunStatus(options, run.id, "running");
  appendBackgroundJobRunEvent(options, run.id, "planned", `Starting AI routine ${job.name}`);
  appendBackgroundJobRunEvent(options, run.id, "input", "Background AI prompt", summarize(prompt, 4000));
  if (!assistantOwned) {
    repository.appendMessage(job.projectId, "system", `Scheduled job ${job.name} started.`, {
      threadId
    });
    repository.appendMessage(job.projectId, "user", prompt, {
      threadId
    });
  }
  repository.createAgentRun(job.projectId, prompt, options.planningModelId, threadId);
  const activeRun = repository.getLatestThreadRun(job.projectId, threadId);
  if (!activeRun) {
    throw new Error(`Background AI run was not created for ${job.name}`);
  }

  setBackgroundJobRunStatus(options, run.id, "running", { linkedAgentRunId: activeRun.id });

  const plannerTurn = await runPlannerTurn(adapter, {
    cwd: project.rootPath,
    sessionId: threadId,
    messages: syntheticMessages ?? repository.getThreadMessages(job.projectId, threadId),
    latestUserPrompt: prompt,
    runId: activeRun.id,
    agentId: options.agentId,
    providerBrand,
    planningModelId: activeRun.planningModelId,
    executionModelId,
    subagentWorktreeStrategy: definition.subagentWorktreeStrategy ?? repository.getSubagentWorktreeStrategyDefault(),
    planExecutionMode: definition.planExecutionMode ?? repository.getPlanExecutionModeDefault(),
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode: repository.getCorrectnessIterationModeDefault(),
    mode,
    ruleSources,
    memorySummaries,
    priorQuestions: activeRun.questions,
    fastMode: definition.fastMode,
    abortSignal,
    callbacks: createBackgroundExecutionCallbacks(options, job.projectId, run.id, activeRun.id)
  });

  if (plannerTurn.plannerResult.type === "question") {
    for (const question of plannerTurn.plannerResult.questions) {
      repository.appendPlanningQuestion(job.projectId, activeRun.id, question, "deferred");
    }
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
    repository.updateBackgroundJobSchedule(job.id, { lastRunAt: new Date().toISOString() });
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

  const outcome = await executeReadyRun(adapter, {
    cwd: project.rootPath,
    runId: activeRun.id,
    sessionId: threadId,
    messages: syntheticMessages ?? repository.getThreadMessages(job.projectId, threadId),
    agentId: options.agentId,
    providerBrand,
    readyPlan: plannerTurn.plannerResult as PlannerReadyTurn,
    debugEnabled,
    fastMode: definition.fastMode,
    abortSignal,
    callbacks: createBackgroundExecutionCallbacks(options, job.projectId, run.id, activeRun.id),
    executionPlan: plannerTurn.executionPlan
  });

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
    run.id,
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
        backgroundRunId: run.id,
        jobId: job.id,
        linkedAgentRunId: activeRun.id
      },
      createdAt: new Date().toISOString()
    });
  }
  setBackgroundJobRunStatus(options, run.id, outcome.partial ? "failed" : "succeeded", {
    summary: summarizeBackgroundAssistantMessage(outcome.assistantMessage),
    failureMessage: outcome.partial ? "Some subagent work failed." : undefined
  });
  repository.updateBackgroundJobSchedule(job.id, {
    lastRunAt: new Date().toISOString()
  });
  return repository.getBackgroundJobRun(run.id)!;
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
    stderr: "pipe",
    signal: abortSignal
  });

  const timeoutId = setTimeout(() => {
    proc.kill();
  }, resolveShellTimeoutMs(definition.timeoutSeconds));

  let outputLimitMessage: string | undefined;
  const [stdoutSnapshot, stderrSnapshot, exitCode] = await Promise.all([
    consumeBoundedStream(proc.stdout, "stdout", (message) => {
      outputLimitMessage ??= message;
      proc.kill();
    }),
    consumeBoundedStream(proc.stderr, "stderr", (message) => {
      outputLimitMessage ??= message;
      proc.kill();
    }),
    proc.exited
  ]).finally(() => clearTimeout(timeoutId));
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

  repository.updateBackgroundJobSchedule(job.id, {
    lastRunAt: new Date().toISOString()
  });
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

function summarize(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function summarizeShellOutput(stdout: string, stderr: string) {
  const primary = stdout.trim() || stderr.trim() || "No output";
  return primary.replace(/\s+/g, " ").trim().slice(0, 240);
}

function buildAssistantRoutinePrompt(basePrompt: string, repository: WorkspaceRepository, assistantId: string) {
  const assistant = repository.getAssistant(assistantId);
  if (!assistant) {
    return basePrompt;
  }

  const answeredQuestions = repository
    .getAssistantQuestions(assistantId)
    .filter((question) => question.status === "answered")
    .slice(0, 8);
  const learnings = repository.getAssistantLearnings(assistantId).slice(0, 12);

  return [
    basePrompt,
    `Assistant role: ${assistant.name}`,
    `Personality prompt:\n${assistant.personalityPrompt}`,
    `Job prompt:\n${assistant.jobPrompt}`,
    answeredQuestions.length > 0
      ? `Recent answered questions. Treat these as durable user guidance and do not ask equivalent questions again unless the user changes context:\n${answeredQuestions.map((question) => `- Q: ${question.prompt}\n  A: ${question.answerText ?? ""}`).join("\n")}`
      : undefined,
    learnings.length > 0
      ? `Relevant learnings:\n${learnings.map((learning) => `- ${learning.summary}`).join("\n")}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function consumeBoundedStream(
  stream: ReadableStream<Uint8Array>,
  label: "stdout" | "stderr",
  onExceeded: (message: string) => void
) {
  const buffer = new BoundedOutputBuffer(SHELL_OUTPUT_CAP_BYTES);
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        return buffer.snapshot();
      }
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
