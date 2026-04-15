import type { AgentTrace, RunPreflight, SubagentTaskState, WorkspaceProjectState } from "../../../shared/protocol";

export type ChatStatusCard = {
  id: string;
  label: string;
  body: string;
  tone: "info" | "warning" | "error";
  spinning?: boolean;
};

export function getProjectStatusCards(
  project: WorkspaceProjectState,
  preflightEntry?: { requestId: string; preflight: RunPreflight }
) {
  const run = project.activeRun ?? project.lastRun;
  const cards: ChatStatusCard[] = [];

  if (preflightEntry) {
    cards.push({
      id: "preflight",
      label: "git warn",
      body: preflightEntry.preflight.message.toLowerCase(),
      tone: "warning"
    });
  }

  if (run?.status === "planning") {
    cards.push({
      id: "planning",
      label: "planner",
      body: "plan task.",
      tone: "info",
      spinning: true
    });
  }

  if (project.latestPlan) {
    cards.push({
      id: "routing",
      label: "route",
      body: project.latestPlan.usesSubagents
        ? `split task. ${project.latestPlan.subtaskCount} agents work.`
        : "main pi work.",
      tone: "info"
    });
  }

  if (run?.subtasks.length) {
    const completedCount = run.subtasks.filter((task) => task.status === "completed").length;
    const failedCount = run.subtasks.filter((task) => task.status === "failed").length;
    cards.push({
      id: "progress",
      label: "progress",
      body:
        failedCount > 0
          ? `${completedCount}/${run.subtasks.length} done. ${failedCount} fail.`
          : `${completedCount}/${run.subtasks.length} done.`,
      tone: failedCount > 0 ? "error" : "info",
      spinning: isRunWorking(run.status)
    });
  }

  pushTraceCard(cards, project.traces, ["subagent-retry"], "retry", "retry", "warning");
  pushTraceCard(cards, project.traces, ["subagent-error"], "fail", "fail", "error");
  pushTraceCard(cards, project.traces, ["merge-start", "merge-conflict", "merge-complete"], "merge", "merge", "info");
  pushTraceCard(
    cards,
    project.traces,
    ["verification-start", "verification-complete"],
    "verify",
    "verify",
    "info"
  );
  pushTraceCard(
    cards,
    project.traces,
    ["aggregation-start", "aggregation-complete"],
    "aggregate",
    "aggregate",
    "info"
  );

  return cards;
}

export function getLatestTaskStatusText(project: WorkspaceProjectState, task: SubagentTaskState) {
  const trace = getLatestTraceForSubagent(project.traces, task.id);
  if (trace) {
    return toCavemanTrace(trace);
  }

  switch (task.status) {
    case "running":
      return "work now.";
    case "completed":
      return "done.";
    case "failed":
      return task.errorMessage ? `fail. ${task.errorMessage}` : "fail.";
    default:
      return "wait.";
  }
}

export function getLatestTraceForSubagent(traces: AgentTrace[], subagentId: string) {
  for (let index = traces.length - 1; index >= 0; index -= 1) {
    const trace = traces[index];
    if (trace?.subagentId === subagentId) {
      return trace;
    }
  }

  return undefined;
}

export function formatContextUsage(tokens: number | undefined, contextWindow: number, usagePercent: number | undefined) {
  return `Ctx ${tokens === undefined ? "?" : formatCompactNumber(tokens)} / ${formatCompactNumber(contextWindow)} (${
    usagePercent === undefined ? "?" : `${Math.round(usagePercent)}%`
  })`;
}

function pushTraceCard(
  cards: ChatStatusCard[],
  traces: AgentTrace[],
  stages: AgentTrace["stage"][],
  id: string,
  label: string,
  tone: ChatStatusCard["tone"]
) {
  const trace = getLatestTraceByStages(traces, stages);
  if (!trace) {
    return;
  }

  cards.push({
    id,
    label,
    body: toCavemanTrace(trace),
    tone,
    spinning: trace.stage.endsWith("start")
  });
}

function getLatestTraceByStages(traces: AgentTrace[], stages: AgentTrace["stage"][]) {
  const set = new Set(stages);
  for (let index = traces.length - 1; index >= 0; index -= 1) {
    const trace = traces[index];
    if (trace && set.has(trace.stage)) {
      return trace;
    }
  }

  return undefined;
}

function toCavemanTrace(trace: AgentTrace) {
  switch (trace.stage) {
    case "subagent-retry":
      return `${trace.subagentId ?? "agent"} retry.`;
    case "subagent-error":
      return `${trace.subagentId ?? "agent"} fail.`;
    case "merge-start":
      return "merge start.";
    case "merge-conflict":
      return "merge fight. fix now.";
    case "merge-complete":
      return "merge done.";
    case "verification-start":
      return "check build.";
    case "verification-complete":
      return "check done.";
    case "aggregation-start":
      return "join agent work.";
    case "aggregation-complete":
      return "join done.";
    default:
      return trace.message.toLowerCase();
  }
}

function formatCompactNumber(value: number) {
  if (value < 1_000) {
    return String(value);
  }

  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return `${Math.round(value / 1_000)}k`;
}

function isRunWorking(status: string) {
  return status === "planning" || status === "running-main" || status === "running-subagents" || status === "aggregating";
}
