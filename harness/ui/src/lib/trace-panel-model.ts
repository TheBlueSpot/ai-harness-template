import type {
  AgentRunState,
  Assistant,
  BackgroundJob,
  BackgroundJobRun
} from "../../../shared/protocol";
import type { ExecutionLogEntry } from "../components/primitives/execution-log";
import {
  getSelectedAssistant,
  type HarnessViewState,
  type ThreadLiveTranscriptState,
  type ViewProjectState
} from "../harness-store";
import { getVisibleProjectTraces, isRunWorking } from "./run-status";
import { formatShortTimestamp } from "./time-format";
import {
  formatToolActivityCopyText,
  formatToolActivityDetailText,
  formatToolActivityOwner,
  formatToolInvocationDescription
} from "./tool-activity-format";

export type TracePanelEntity =
  | { type: "thread"; projectId: string; threadId: string }
  | { type: "assistant"; assistantId: string }
  | { type: "job"; jobId: string; runId?: string };

export type TracePanelExecutionEntry = ExecutionLogEntry;

export type TracePanelRunningCounts = {
  current: number;
  total: number;
};

export type TracePanelTitle = {
  eyebrow: string;
  title: string;
  source: string;
};

export type ThreadTracePanelSnapshot = {
  project: ViewProjectState;
  thread: ViewProjectState["threads"][number] | undefined;
  liveTranscript: ThreadLiveTranscriptState;
  runToShow?: AgentRunState;
  visibleTraces: ReturnType<typeof getVisibleProjectTraces>;
};

export type AssistantTracePanelSnapshot = {
  assistant: Assistant;
  jobs: BackgroundJob[];
  runs: BackgroundJobRun[];
};

export type JobTracePanelSnapshot = {
  job: BackgroundJob;
  run?: BackgroundJobRun;
  runs: BackgroundJobRun[];
};

export function resolveTracePanelEntity(state: HarnessViewState): TracePanelEntity | undefined {
  if (state.activeLeftTab === "assistants") {
    const assistant = getSelectedAssistant(state);
    return assistant ? { type: "assistant", assistantId: assistant.id } : undefined;
  }

  if (state.activeLeftTab === "jobs") {
    const selectedRun = state.jobsPanePreferences.selectedRunId
      ? state.backgroundJobs.runs.find((run) => run.id === state.jobsPanePreferences.selectedRunId)
      : undefined;
    if (selectedRun) {
      return { type: "job", jobId: selectedRun.jobId, runId: selectedRun.id };
    }

    const selectedJob = state.jobsPanePreferences.selectedJobId
      ? state.backgroundJobs.jobs.find((job) => job.id === state.jobsPanePreferences.selectedJobId)
      : undefined;
    const fallbackJob = selectedJob ?? getVisibleJobs(state)[0];
    return fallbackJob ? { type: "job", jobId: fallbackJob.id } : undefined;
  }

  const activeProject = state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId);
  return activeProject ? { type: "thread", projectId: activeProject.id, threadId: activeProject.activeThreadId } : undefined;
}

export function getTracePanelTitle(state: HarnessViewState, entity: TracePanelEntity | undefined): TracePanelTitle {
  if (!entity) {
    return {
      eyebrow: "No entity",
      title: "Nothing selected",
      source: "Open a project, assistant, or job"
    };
  }

  if (entity.type === "assistant") {
    const snapshot = getAssistantTracePanelSnapshot(state, entity);
    return {
      eyebrow: "Assistant",
      title: snapshot?.assistant.name ?? entity.assistantId,
      source: "Assistants"
    };
  }

  if (entity.type === "job") {
    const snapshot = getJobTracePanelSnapshot(state, entity);
    return {
      eyebrow: "Job",
      title: snapshot?.job.name ?? entity.jobId,
      source: entity.runId ? "Jobs run" : "Jobs"
    };
  }

  const snapshot = getThreadTracePanelSnapshot(state, entity);
  return {
    eyebrow: "Thread",
    title: snapshot?.thread?.title ?? entity.threadId,
    source: snapshot?.project.name ?? "Projects"
  };
}

export function getTracePanelExecutionLogEntries(
  state: HarnessViewState,
  entity: TracePanelEntity | undefined
): TracePanelExecutionEntry[] {
  if (!entity) {
    return [];
  }

  if (entity.type === "assistant") {
    return getAssistantExecutionLogEntries(state, entity);
  }

  if (entity.type === "job") {
    return getJobExecutionLogEntries(state, entity);
  }

  return getThreadExecutionLogEntries(state, entity);
}

export function getTracePanelRunningCounts(
  state: HarnessViewState,
  entity: TracePanelEntity | undefined
): TracePanelRunningCounts {
  return {
    current: getCurrentRunningAgentCount(state, entity),
    total: getTotalRunningAgentCount(state)
  };
}

export function getThreadTracePanelSnapshot(
  state: HarnessViewState,
  entity: Extract<TracePanelEntity, { type: "thread" }>
): ThreadTracePanelSnapshot | undefined {
  const project = state.workspace.projects.find((entry) => entry.id === entity.projectId);
  if (!project) {
    return undefined;
  }

  const liveTranscript = getThreadLiveTranscript(project, entity.threadId);
  return {
    project,
    thread: project.threads.find((thread) => thread.id === entity.threadId),
    liveTranscript,
    runToShow: liveTranscript.activeRun ?? liveTranscript.lastRun,
    visibleTraces: getVisibleProjectTraces(liveTranscript.traces)
  };
}

export function getAssistantTracePanelSnapshot(
  state: HarnessViewState,
  entity: Extract<TracePanelEntity, { type: "assistant" }>
): AssistantTracePanelSnapshot | undefined {
  const assistant = state.assistants.assistants.find((entry) => entry.id === entity.assistantId);
  if (!assistant) {
    return undefined;
  }

  const jobs = state.backgroundJobs.jobs
    .filter((job) => job.assistantId === assistant.id)
    .sort((left, right) => (right.nextRunAt ?? right.updatedAt).localeCompare(left.nextRunAt ?? left.updatedAt));
  const jobIds = new Set(jobs.map((job) => job.id));
  const runs = state.backgroundJobs.runs
    .filter((run) => run.assistantId === assistant.id || jobIds.has(run.jobId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return { assistant, jobs, runs };
}

export function getJobTracePanelSnapshot(
  state: HarnessViewState,
  entity: Extract<TracePanelEntity, { type: "job" }>
): JobTracePanelSnapshot | undefined {
  const job = state.backgroundJobs.jobs.find((entry) => entry.id === entity.jobId);
  if (!job) {
    return undefined;
  }

  const runs = state.backgroundJobs.runs
    .filter((run) => run.jobId === job.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const run = entity.runId ? runs.find((entry) => entry.id === entity.runId) : runs[0];

  return { job, run, runs };
}

function getThreadExecutionLogEntries(
  state: HarnessViewState,
  entity: Extract<TracePanelEntity, { type: "thread" }>
) {
  const snapshot = getThreadTracePanelSnapshot(state, entity);
  if (!snapshot) {
    return [];
  }

  const entries: TracePanelExecutionEntry[] = [];
  const run = snapshot.runToShow;

  if (run) {
    entries.push({
      id: `thread-run-${run.id}`,
      message: `Run ${run.status}`,
      rowSummary: [run.status, run.summary, run.failureMessage].filter(Boolean).join(" | "),
      level: "run",
      createdAt: run.updatedAt,
      detail: run.latestUserPrompt
    });
  }

  if (snapshot.liveTranscript.latestPlan) {
    const plan = snapshot.liveTranscript.latestPlan;
    entries.push({
      id: `thread-plan-${plan.sessionId}`,
      message: `Plan ready: ${plan.usesSubagents ? "subagents" : "main"}`,
      rowSummary: `Plan ${plan.difficultyScore}% | ${plan.subtaskCount} subtasks | ${plan.executionModelId}`,
      level: "plan",
      createdAt: run?.createdAt,
      detail: plan.executionPlan?.summary
    });
  }

  for (const task of run?.subtasks ?? []) {
    entries.push({
      id: `thread-subtask-${run?.id}-${task.id}`,
      message: `${task.title} ${task.status}`,
      rowSummary: `${task.status} | ${task.title}`,
      level: "subtask",
      createdAt: resolveSubtaskActivityTime(task),
      detail: formatSubtaskDetail(task)
    });
  }

  for (const activity of run?.toolActivities ?? []) {
    entries.push({
      id: `thread-tool-${activity.id}`,
      message: `${activity.toolName} ${activity.status}`,
      rowSummary: [
        formatToolActivityOwner(activity),
        activity.toolName,
        activity.status,
        formatToolInvocationDescription(activity)
      ].join(" | "),
      level: activity.category,
      createdAt: activity.updatedAt,
      detail: formatToolActivityDetailText(activity),
      detailKind: "plain",
      copyText: formatToolActivityCopyText(activity)
    });
  }

  for (const session of run?.browserSessions ?? []) {
    entries.push({
      id: `thread-browser-session-${session.id}`,
      message: session.lastActivityLabel ?? `Browser session ${session.status}`,
      rowSummary: `browser | ${session.owner} | ${session.status}`,
      level: "browser",
      createdAt: session.updatedAt,
      detail: session.pendingApproval?.inputSummary
    });

    for (const activity of session.activities) {
      entries.push({
        id: `thread-browser-activity-${activity.id}`,
        message: activity.label,
        rowSummary: `browser ${activity.kind} | ${activity.status} | ${activity.label}`,
        level: "browser",
        createdAt: activity.updatedAt,
        detail: activity.outputSummary ?? activity.errorMessage
      });
    }
  }

  snapshot.visibleTraces.forEach((trace, index) => {
    entries.push({
      id: `thread-trace-${index}-${trace.stage}`,
      message: trace.message,
      rowSummary: `${trace.stage} | ${trace.message}`,
      level: trace.stage,
      createdAt: trace.createdAt,
      detail: trace.detail
    });
  });

  return sortEntriesNewestFirst(entries);
}

function getAssistantExecutionLogEntries(
  state: HarnessViewState,
  entity: Extract<TracePanelEntity, { type: "assistant" }>
) {
  const snapshot = getAssistantTracePanelSnapshot(state, entity);
  if (!snapshot) {
    return [];
  }

  const entries: TracePanelExecutionEntry[] = state.assistants.streamingByAssistantId[snapshot.assistant.id]?.trim()
    ? [{
        id: `assistant-streaming-${snapshot.assistant.id}`,
        message: "Assistant response streaming",
        level: "running",
        createdAt: snapshot.assistant.updatedAt
      }]
    : [];

  for (const entry of state.assistants.logs.filter((log) => log.assistantId === snapshot.assistant.id)) {
    entries.push({
      id: `assistant-log-${entry.id}`,
      message: entry.summary,
      rowSummary: [entry.summary, entry.detail].filter(Boolean).join(" "),
      level: entry.level,
      createdAt: entry.createdAt,
      detail: entry.detail,
      detailsJson: entry.detailsJson
    });
  }

  for (const run of snapshot.runs) {
    entries.push(...backgroundRunToExecutionLogEntries(run, "assistant-job"));
  }

  return sortEntriesNewestFirst(entries);
}

function getJobExecutionLogEntries(
  state: HarnessViewState,
  entity: Extract<TracePanelEntity, { type: "job" }>
) {
  const snapshot = getJobTracePanelSnapshot(state, entity);
  if (!snapshot?.run) {
    return [];
  }

  return backgroundRunToExecutionLogEntries(snapshot.run, "job");
}

function backgroundRunToExecutionLogEntries(run: BackgroundJobRun, prefix: string): TracePanelExecutionEntry[] {
  if (run.events.length === 0) {
    return [
      {
        id: `${prefix}-run-${run.id}`,
        message: `Run ${run.status}`,
        rowSummary: [run.status, run.summary, run.failureMessage, run.triggerSource].filter(Boolean).join(" | "),
        level: "run",
        createdAt: run.updatedAt,
        detail: run.failureMessage ?? run.summary
      }
    ];
  }

  return run.events.map((event) => ({
    id: `${prefix}-event-${run.id}-${event.id}`,
    message: event.message,
    rowSummary: [event.stage, event.message].join(" | "),
    level: event.stage,
    createdAt: event.createdAt,
    detail: event.detail
  }));
}

function getCurrentRunningAgentCount(state: HarnessViewState, entity: TracePanelEntity | undefined) {
  if (!entity) {
    return 0;
  }

  if (entity.type === "thread") {
    return countThreadRunningAgents(getThreadTracePanelSnapshot(state, entity)?.runToShow);
  }

  if (entity.type === "assistant") {
    const snapshot = getAssistantTracePanelSnapshot(state, entity);
    if (!snapshot) {
      return 0;
    }

    const streamingCount = (state.assistants.streamingByAssistantId[snapshot.assistant.id] ?? "").trim() ? 1 : 0;
    const aiJobCount = snapshot.runs.filter((run) => {
      const job = snapshot.jobs.find((entry) => entry.id === run.jobId);
      return run.status === "running" && job?.definition.kind === "ai-routine";
    }).length;
    return streamingCount + aiJobCount;
  }

  const snapshot = getJobTracePanelSnapshot(state, entity);
  return snapshot?.run?.status === "running" && snapshot.job.definition.kind === "ai-routine" ? 1 : 0;
}

function getTotalRunningAgentCount(state: HarnessViewState) {
  const countedRunIds = new Set<string>();
  let total = 0;

  for (const project of state.workspace.projects) {
    const transcripts = Object.values(project.threadLiveTranscriptById);
    for (const transcript of transcripts) {
      const run = transcript.activeRun ?? transcript.lastRun;
      if (!run || countedRunIds.has(run.id) || !isRunWorking(run.status)) {
        continue;
      }
      countedRunIds.add(run.id);
      total += countThreadRunningAgents(run);
    }
  }

  for (const assistantId of Object.keys(state.assistants.streamingByAssistantId)) {
    if (state.assistants.streamingByAssistantId[assistantId]?.trim()) {
      total += 1;
    }
  }

  for (const run of state.backgroundJobs.runs) {
    const job = state.backgroundJobs.jobs.find((entry) => entry.id === run.jobId);
    if (run.status !== "running" || job?.definition.kind !== "ai-routine") {
      continue;
    }
    if (run.linkedAgentRunId && countedRunIds.has(run.linkedAgentRunId)) {
      continue;
    }
    total += 1;
  }

  return total;
}

function countThreadRunningAgents(run: AgentRunState | undefined) {
  if (!run || !isRunWorking(run.status)) {
    return 0;
  }

  const mainCount = run.status === "planning" || run.status === "running-main" || run.status === "aggregating" ? 1 : 0;
  const subtaskCount = run.subtasks.filter((task) => task.status === "running").length;
  return mainCount + subtaskCount;
}

function getThreadLiveTranscript(project: ViewProjectState, threadId: string): ThreadLiveTranscriptState {
  const known = project.threadLiveTranscriptById[threadId];
  if (known) {
    return known;
  }

  return {
    isStreaming: project.activeThreadId === threadId ? project.session.isStreaming : false,
    streamingAssistantText: project.activeThreadId === threadId ? project.streamingAssistantText : "",
    streamingTailSegments: project.activeThreadId === threadId ? project.streamingTailSegments : [],
    streamingHeartbeatMessages: project.activeThreadId === threadId ? project.streamingHeartbeatMessages : [],
    latestPlan: project.activeThreadId === threadId ? project.latestPlan : undefined,
    contextUsage: project.activeThreadId === threadId ? project.contextUsage : undefined,
    traces: project.activeThreadId === threadId ? project.traces : [],
    activeRun: project.activeThreadId === threadId ? project.activeRun : undefined,
    lastRun: project.activeThreadId === threadId ? project.lastRun : undefined,
    runSummaries: project.activeThreadId === threadId ? project.runSummaries : [],
    lastError: project.activeThreadId === threadId ? project.lastError : undefined
  };
}

function getVisibleJobs(state: HarnessViewState) {
  return state.backgroundJobs.jobs.filter((job) => {
    const preferences = state.jobsPanePreferences;
    if (preferences.projectId && job.projectId !== preferences.projectId) {
      return false;
    }
    if (preferences.assistantId && job.assistantId !== preferences.assistantId) {
      return false;
    }
    if (preferences.kind && job.kind !== preferences.kind) {
      return false;
    }
    if (preferences.status && job.status !== preferences.status) {
      return false;
    }
    if (preferences.risk && job.riskLevel !== preferences.risk) {
      return false;
    }
    if (!preferences.search.trim()) {
      return true;
    }
    return [job.name, job.description, job.scheduleInput, job.kind, job.status, job.riskLevel]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(preferences.search.trim().toLowerCase());
  });
}

function formatSubtaskDetail(task: AgentRunState["subtasks"][number]) {
  const timestamps = [
    task.startedAt ? `Started: ${formatShortTimestamp(task.startedAt)}` : undefined,
    task.completedAt ? `Completed: ${formatShortTimestamp(task.completedAt)}` : undefined
  ].filter(Boolean);
  const body = task.errorMessage ?? task.output;
  return [...timestamps, body].filter(Boolean).join("\n\n") || undefined;
}

function resolveSubtaskActivityTime(task: AgentRunState["subtasks"][number]) {
  return task.completedAt ?? task.startedAt ?? task.updatedAt;
}

function sortEntriesNewestFirst(entries: TracePanelExecutionEntry[]) {
  return [...entries].sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt));
}

function timestampValue(value: TracePanelExecutionEntry["createdAt"]) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
