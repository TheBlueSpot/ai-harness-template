import path from "node:path";
import { resolveModeById } from "../../shared/modes";
import {
  createChatMessage,
  type AgentTrace,
  type BackgroundJob,
  type BackgroundJobRun,
  type PlannerReadyTurn,
  type ProjectContextUsage,
  type ProviderBrand,
  type WorkspaceRuleSource,
  type MemorySummary
} from "../../shared/protocol";
import { executeReadyRun, runPlannerTurn } from "./pi-orchestrator";
import { getDefaultExecutionModelId, getDefaultPlanningModelId } from "./pi-planner";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import { WorkspaceRepository } from "./workspace-repository";

type BackgroundJobExecutorOptions = {
  repository: WorkspaceRepository;
  adapter: PiAgentAdapter;
  job: BackgroundJob;
  run: BackgroundJobRun;
  providerBrand: ProviderBrand;
  debugEnabled: boolean;
  abortSignal?: AbortSignal;
};

export async function executeBackgroundJobRun(options: BackgroundJobExecutorOptions) {
  return options.job.kind === "shell" ? executeShellJob(options) : executeAiRoutineJob(options);
}

async function executeAiRoutineJob({
  repository,
  adapter,
  job,
  run,
  providerBrand,
  debugEnabled,
  abortSignal
}: BackgroundJobExecutorOptions) {
  if (job.definition.kind !== "ai-routine") {
    throw new Error(`Expected ai-routine definition for ${job.id}`);
  }

  const definition = job.definition;
  const project = repository.getProject(job.projectId);
  const threadId = job.automationThreadId;
  const mode = resolveModeById(definition.modeId ?? project.selectedModeId, project.projectModes);
  const executionModelId =
    definition.executionModelId ??
    project.session.executionModelId ??
    getDefaultExecutionModelId(providerBrand);
  const ruleSources = [project.projectRuleSource].filter((value): value is WorkspaceRuleSource => Boolean(value));
  const memorySummaries = [repository.getThreadMemorySummary(job.projectId, threadId)].filter(
    (value): value is MemorySummary => Boolean(value)
  );
  const prompt = definition.prompt;

  repository.setBackgroundJobRunStatus(run.id, "running");
  repository.appendBackgroundJobRunEvent(run.id, "planned", `Starting AI routine ${job.name}`);
  repository.appendMessage(job.projectId, "system", `Scheduled job ${job.name} started.`, {
    threadId
  });
  repository.appendMessage(job.projectId, "user", prompt, {
    threadId
  });
  repository.createAgentRun(job.projectId, prompt, getDefaultPlanningModelId(providerBrand), threadId);
  const activeRun = repository.getLatestThreadRun(job.projectId, threadId);
  if (!activeRun) {
    throw new Error(`Background AI run was not created for ${job.name}`);
  }

  repository.setBackgroundJobRunStatus(run.id, "running", { linkedAgentRunId: activeRun.id });

  const plannerTurn = await runPlannerTurn(adapter, {
    cwd: project.rootPath,
    sessionId: threadId,
    messages: repository.getThreadMessages(job.projectId, threadId),
    latestUserPrompt: prompt,
    runId: activeRun.id,
    providerBrand,
    executionModelId,
    subagentWorktreeStrategy: definition.subagentWorktreeStrategy ?? repository.getSubagentWorktreeStrategyDefault(),
    planExecutionMode: definition.planExecutionMode ?? repository.getPlanExecutionModeDefault(),
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode: repository.getCorrectnessIterationModeDefault(),
    mode,
    ruleSources,
    memorySummaries,
    priorQuestions: activeRun.questions,
    abortSignal,
    callbacks: createBackgroundExecutionCallbacks(repository, job.projectId, run.id, activeRun.id)
  });

  if (plannerTurn.plannerResult.type === "question") {
    repository.appendBackgroundJobRunEvent(
      run.id,
      "failed",
      "Planner required clarification",
      plannerTurn.plannerResult.question.prompt
    );
    repository.setAgentRunStatus(job.projectId, activeRun.id, "failed", "Scheduled jobs cannot answer planner questions");
    repository.setBackgroundJobRunStatus(run.id, "failed", {
      failureMessage: "Planner required clarification that scheduled jobs cannot provide."
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
  repository.appendBackgroundJobRunEvent(run.id, "planned", plannerTurn.plannerResult.summary);

  const outcome = await executeReadyRun(adapter, {
    cwd: project.rootPath,
    runId: activeRun.id,
    sessionId: threadId,
    messages: repository.getThreadMessages(job.projectId, threadId),
    providerBrand,
    readyPlan: plannerTurn.plannerResult as PlannerReadyTurn,
    debugEnabled,
    abortSignal,
    callbacks: createBackgroundExecutionCallbacks(repository, job.projectId, run.id, activeRun.id),
    executionPlan: plannerTurn.executionPlan
  });

  repository.appendMessage(job.projectId, "assistant", outcome.assistantMessage.content, {
    threadId
  });
  repository.setAgentRunStatus(
    job.projectId,
    activeRun.id,
    outcome.partial ? "partial-complete" : "completed",
    outcome.partial ? "Background run partial complete" : undefined
  );
  repository.appendBackgroundJobRunEvent(
    run.id,
    outcome.partial ? "failed" : "done",
    outcome.partial ? "Background AI run completed with failures." : "Background AI run completed.",
    outcome.assistantMessage.content.slice(0, 2000)
  );
  repository.setBackgroundJobRunStatus(run.id, outcome.partial ? "failed" : "succeeded", {
    summary: summarizeBackgroundAssistantMessage(outcome.assistantMessage),
    failureMessage: outcome.partial ? "Some subagent work failed." : undefined
  });
  repository.updateBackgroundJobSchedule(job.id, {
    lastRunAt: new Date().toISOString()
  });
  return repository.getBackgroundJobRun(run.id)!;
}

async function executeShellJob({ repository, job, run, abortSignal }: BackgroundJobExecutorOptions) {
  if (job.definition.kind !== "shell") {
    throw new Error(`Expected shell definition for ${job.id}`);
  }

  const definition = job.definition;
  const cwd = definition.cwd ? path.resolve(definition.cwd) : repository.getProject(job.projectId).rootPath;
  repository.setBackgroundJobRunStatus(run.id, "running");
  repository.appendBackgroundJobRunEvent(run.id, "spawned", `Running ${definition.executable}`);

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
  }, definition.timeoutSeconds * 1000);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]).finally(() => clearTimeout(timeoutId));

  if (stdout.trim()) {
    repository.appendBackgroundJobRunEvent(run.id, "stdout", "Stdout", stdout.slice(0, 4000));
  }
  if (stderr.trim()) {
    repository.appendBackgroundJobRunEvent(run.id, "stderr", "Stderr", stderr.slice(0, 4000));
  }

  if (exitCode === 0) {
    repository.appendBackgroundJobRunEvent(run.id, "exit", "Shell job completed", `Exit code ${exitCode}`);
    repository.setBackgroundJobRunStatus(run.id, "succeeded", {
      summary: summarizeShellOutput(stdout, stderr)
    });
  } else {
    repository.appendBackgroundJobRunEvent(run.id, "failed", "Shell job failed", `Exit code ${exitCode}`);
    repository.setBackgroundJobRunStatus(run.id, "failed", {
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
  repository: WorkspaceRepository,
  projectId: string,
  backgroundRunId: string,
  agentRunId: string
) {
  return {
    onTrace(trace: AgentTrace) {
      repository.appendBackgroundJobRunEvent(backgroundRunId, trace.stage, trace.message, trace.detail);
    },
    onContextUsage(contextUsage: ProjectContextUsage) {
      repository.appendBackgroundJobRunEvent(
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

function summarizeBackgroundAssistantMessage(message: ReturnType<typeof createChatMessage>) {
  return message.content.replace(/\s+/g, " ").trim().slice(0, 240);
}

function summarizeShellOutput(stdout: string, stderr: string) {
  const primary = stdout.trim() || stderr.trim() || "No output";
  return primary.replace(/\s+/g, " ").trim().slice(0, 240);
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
