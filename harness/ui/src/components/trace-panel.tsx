import { createMemo, createSignal, For, Show } from "solid-js";
import { createRequestId, type ExecutionToolActivity } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { getLatestTaskStatusText, getRunRefreshState, getVisibleProjectTraces, isRunWorking } from "../lib/run-status";
import { ActionButton } from "./action-button";
import { CopyTextButton } from "./primitives/copy-text-button";
import { MarkdownContent } from "./markdown-content";
import { ScrollArea } from "./primitives/scroll-area";
import { Tooltip } from "./primitives/tooltip";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleHelp,
  ClipboardList,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Terminal
} from "lucide-solid";

export function TracePanel() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = "Global execution pause is active";
  const runToShow = () => activeProject()?.activeRun ?? activeProject()?.lastRun;
  const deferredBrowserApprovalCount = () => state.executionControl.deferredBrowserApprovalCount;
  const canRetryRun = () => Boolean(activeProject()?.lastRun?.retryable);
  const visibleTraces = () => getVisibleProjectTraces(activeProject()?.traces ?? []);
  const refreshState = () => {
    const project = activeProject();
    return project ? getRunRefreshState(project, runToShow()) : { disabled: true, disabledReason: "No run available", refreshing: false };
  };
  const [expandedToolActivityId, setExpandedToolActivityId] = createSignal<string>();
  const [showAllSubtasks, setShowAllSubtasks] = createSignal(false);
  const [showAllToolActivities, setShowAllToolActivities] = createSignal(false);
  const [showAllBrowserSessions, setShowAllBrowserSessions] = createSignal(false);
  const [showAllTraces, setShowAllTraces] = createSignal(false);
  const planRun = () => runToShow();
  const hasPlanDetails = () => Boolean(activeProject()?.latestPlan?.executionPlan);
  const visibleSubtasks = createMemo(() => capLatest(runToShow()?.subtasks ?? [], TRACE_SUBTASK_LIMIT, showAllSubtasks()));
  const visibleToolActivities = createMemo(() => capLatest(runToShow()?.toolActivities ?? [], TRACE_TOOL_ACTIVITY_LIMIT, showAllToolActivities()));
  const visibleBrowserSessions = createMemo(() => capLatest(runToShow()?.browserSessions ?? [], TRACE_BROWSER_SESSION_LIMIT, showAllBrowserSessions()));
  const visibleTraceRows = createMemo(() => capLatest(visibleTraces(), TRACE_EVENT_LIMIT, showAllTraces()));

  function handleRetryRun() {
    const project = activeProject();
    if (!project) {
      return;
    }
    const run = project.lastRun;
    if (!run) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id
      }
    });
  }

  function handleRetrySubagent(subagentId: string) {
    const project = activeProject();
    if (!project) {
      return;
    }
    const run = project.lastRun;
    if (!run) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        subagentId
      }
    });
  }

  function handleRefreshRun() {
    const project = activeProject();
    const run = project?.activeRun;
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.refresh",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id
      }
    });
  }

  function handleRefreshSubagent(subagentId: string) {
    const project = activeProject();
    const run = project?.activeRun;
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.refresh",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        subagentId
      }
    });
  }

  function handleShowAllSubtasks() {
    setShowAllSubtasks(true);
  }

  function handleShowAllToolActivities() {
    setShowAllToolActivities(true);
  }

  function handleShowAllBrowserSessions() {
    setShowAllBrowserSessions(true);
  }

  function handleShowAllTraces() {
    setShowAllTraces(true);
  }

  function handleResolveBrowserApproval(sessionId: string, toolCallId: string, approved: boolean) {
    const project = activeProject();
    const run = project?.activeRun ?? project?.lastRun;
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "browser.approval.resolve",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        sessionId,
        toolCallId,
        approved
      }
    });
  }

  return (
    <aside data-test-trace-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0 p-[0.8rem]">
      <div>
        <div class="flex items-center gap-2 text-[0.585rem] font-semibold tracking-[0.2em] text-(--muted)">
          <span>Developer trace</span>
          <Tooltip content="Project-scoped plan and trace events stay here, separate from user-visible chat history.">
            <span class="inline-flex">
              <CircleHelp class="h-3.5 w-3.5 text-(--muted)" aria-label="Projects trace help" />
            </span>
          </Tooltip>
        </div>
      </div>

      <Show
        when={activeProject()}
        fallback={
          <div class="flex">
            <div class="w-full rounded-3xl border border-dashed border-(--border) bg-white/40 p-5 text-[0.675rem] leading-5 text-(--muted)">
              Open project root to inspect plans, retries, and trace events.
            </div>
          </div>
        }
      >
        {(project) => (
          <>
            <Show when={project().latestPlan}>
              <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                <div class="mb-3 flex items-center justify-between gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  <span>Latest plan</span>
                  <Show when={hasPlanDetails()}>
                    <ActionButton
                      tooltip="Open the full execution plan"
                      icon={<ClipboardList class="h-3.5 w-3.5" />}
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const executionPlan = project().latestPlan?.executionPlan;
                        if (executionPlan) {
                          harnessStore.openExecutionPlanDialog(executionPlan);
                        }
                      }}
                    >
                      Open plan
                    </ActionButton>
                  </Show>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[0.675rem] text-(--muted)">
                  <div>Difficulty: {project().latestPlan?.difficultyScore}%</div>
                  <div>Route: {project().latestPlan?.executionPlan?.route ?? (project().latestPlan?.usesSubagents ? "subagents" : "main")}</div>
                  <div>Planner: {project().latestPlan?.planningModelId}</div>
                  <div>Executor: {project().latestPlan?.executionModelId}</div>
                  <div>Subtasks: {project().latestPlan?.subtaskCount}</div>
                  <div>Agent: {project().latestPlan?.agentId}</div>
                </div>
              </div>
            </Show>

            <Show when={runToShow()}>
              <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                <div class="mb-3 flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  <div class="flex items-center gap-2">
                    <Show when={runToShow() && isRunWorking(runToShow()!.status)}>
                      <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                    </Show>
                    Run
                  </div>
                  <div class="flex items-center gap-2">
                    <ActionButton
                      tooltip="Refresh the active run"
                      disabledReason={executionPaused() ? executionPauseReason : refreshState().disabledReason}
                      disabled={executionPaused() || refreshState().disabled}
                      icon={<RefreshCcw class="h-3.5 w-3.5" />}
                      size="sm"
                      variant="secondary"
                      onClick={handleRefreshRun}
                    >
                      {refreshState().refreshing ? "Refreshing" : "Refresh"}
                    </ActionButton>
                    <Show when={canRetryRun()}>
                      <ActionButton
                        tooltip="Retry last run"
                        disabledReason={executionPaused() ? executionPauseReason : "Project is streaming"}
                        disabled={executionPaused() || project().session.isStreaming}
                        icon={<RefreshCcw class="h-3.5 w-3.5" />}
                        size="sm"
                        variant="secondary"
                        onClick={handleRetryRun}
                      >
                        Retry
                      </ActionButton>
                    </Show>
                  </div>
                </div>
                <div class="min-w-0 space-y-2 text-[0.675rem] text-(--muted)">
                  <div>Status: {runToShow()?.status}</div>
                  <div>Retryable: {runToShow()?.retryable ? "yes" : "no"}</div>
                  <div>Resumable: {runToShow()?.resumable ? "yes" : "no"}</div>
                  <Tooltip content={runToShow()?.latestUserPrompt} triggerClass="block min-w-0">
                    <div class="truncate">Prompt: {runToShow()?.latestUserPrompt}</div>
                  </Tooltip>
                  <Show when={runToShow()?.failureMessage}>
                    <div class="wrap-anywhere">Failure: {runToShow()?.failureMessage}</div>
                  </Show>
                </div>

                <Show when={runToShow()?.subtasks.length}>
                  <div class="mt-4 space-y-2">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                        Subtasks
                      </div>
                      <Show when={(runToShow()?.subtasks.length ?? 0) > TRACE_SUBTASK_LIMIT && !showAllSubtasks()}>
                        <ActionButton tooltip="Show every subtask row" size="sm" variant="ghost" onClick={handleShowAllSubtasks}>
                          Show all {runToShow()?.subtasks.length}
                        </ActionButton>
                      </Show>
                    </div>
                    <div class="space-y-2">
                      <For each={visibleSubtasks()}>
                        {(task) => (
                          <div class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem]">
                            <div class="flex min-w-0 items-center justify-between gap-3 text-(--foreground)">
                              <span class="flex min-w-0 flex-1 items-center gap-2 font-semibold">
                                <TaskStatusIcon status={task.status} />
                                <Tooltip content={task.title} triggerClass="min-w-0 flex-1">
                                  <span class="block truncate">{task.title}</span>
                                </Tooltip>
                              </span>
                              <span class="shrink-0 uppercase tracking-[0.14em] text-(--accent-strong)">{task.status}</span>
                            </div>
                            <div class="mt-1 text-(--muted)">Attempts: {task.attemptCount}</div>
                            <div class="mt-1 text-(--muted)">Latest status: {getLatestTaskStatusText(project(), task)}</div>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <ActionButton
                                tooltip="Refresh this active subagent"
                                disabledReason={
                                  executionPaused()
                                    ? executionPauseReason
                                    : getRunRefreshState(project(), project().activeRun, task.id).disabledReason
                                }
                                disabled={executionPaused() || getRunRefreshState(project(), project().activeRun, task.id).disabled}
                                icon={<RefreshCcw class="h-3.5 w-3.5" />}
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRefreshSubagent(task.id)}
                              >
                                {getRunRefreshState(project(), project().activeRun, task.id).refreshing ? "Refreshing" : "Refresh"}
                              </ActionButton>
                              <Show when={project().lastRun?.retryable}>
                                <ActionButton
                                  tooltip="Retry this subagent"
                                  disabledReason={executionPaused() ? executionPauseReason : "Project is streaming"}
                                  disabled={executionPaused() || project().session.isStreaming}
                                  icon={<RefreshCcw class="h-3.5 w-3.5" />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleRetrySubagent(task.id)}
                                >
                                  Retry
                                </ActionButton>
                              </Show>
                            </div>
                            <Show when={task.errorMessage}>
                              <MarkdownContent content={() => task.errorMessage ?? ""} class="mt-1" size="compact" tone="danger" />
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            <Show when={runToShow()?.toolActivities?.length}>
              <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                    <Terminal class="h-3.5 w-3.5" />
                    Tool activity
                  </div>
                  <Show when={(runToShow()?.toolActivities?.length ?? 0) > TRACE_TOOL_ACTIVITY_LIMIT && !showAllToolActivities()}>
                    <ActionButton tooltip="Show every tool activity row" size="sm" variant="ghost" onClick={handleShowAllToolActivities}>
                      Show all {runToShow()?.toolActivities?.length}
                    </ActionButton>
                  </Show>
                </div>
                <div class="space-y-2">
                  <For each={visibleToolActivities()}>
                    {(activity) => (
                      <article class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem]">
                        <div class="flex min-w-0 items-center justify-between gap-3 text-(--foreground)">
                          <div class="flex min-w-0 items-center gap-2 font-semibold">
                            <ToolActivityStatusIcon status={activity.status} />
                            <span class="truncate">{formatToolOwner(activity)}</span>
                            <span class="shrink-0 text-(--muted)">|</span>
                            <span class="shrink-0">{activity.toolName}</span>
                          </div>
                          <span class="shrink-0 uppercase tracking-[0.14em] text-(--accent-strong)">
                            {activity.exitCode === undefined ? activity.status : `${activity.status} ${activity.exitCode}`}
                          </span>
                        </div>
                        <Show when={activity.command}>
                          <div class="mt-2 truncate rounded-xl bg-slate-950/5 px-2 py-1 font-mono text-[0.62rem] text-(--foreground)">
                            {activity.command}
                          </div>
                        </Show>
                        <Show when={activity.outputPreview}>
                          <MarkdownContent content={() => activity.outputPreview ?? ""} class="mt-2" size="compact" tone={activity.status === "failed" ? "danger" : "muted"} />
                        </Show>
                        <Show when={expandedToolActivityId() === activity.id}>
                          <div class="mt-2 space-y-2 rounded-xl border border-(--border) bg-white/80 p-2">
                            <Show when={activity.argsSummary}>
                              <MarkdownContent content={() => `Args: ${activity.argsSummary}`} size="compact" tone="muted" />
                            </Show>
                            <Show when={activity.stdoutPreview}>
                              <MarkdownContent content={() => `Stdout: ${activity.stdoutPreview}`} size="compact" />
                            </Show>
                            <Show when={activity.stderrPreview}>
                              <MarkdownContent content={() => `Stderr: ${activity.stderrPreview}`} size="compact" tone="danger" />
                            </Show>
                          </div>
                        </Show>
                        <div class="mt-2 flex flex-wrap justify-end gap-2">
                          <ActionButton
                            tooltip="Toggle tool details"
                            icon={expandedToolActivityId() === activity.id ? <ChevronDown class="h-3.5 w-3.5" /> : <ChevronRight class="h-3.5 w-3.5" />}
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedToolActivityId(expandedToolActivityId() === activity.id ? undefined : activity.id)}
                          >
                            Details
                          </ActionButton>
                          <CopyTextButton
                            value={formatToolActivityCopyText(activity)}
                            tooltip="Copy tool output"
                            copiedTitle="Tool output copied"
                            copiedDescription="Tool output copied to clipboard."
                            size="sm"
                            variant="ghost"
                            ariaLabel="Copy tool output"
                          >
                            Copy
                          </CopyTextButton>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={runToShow()?.browserSessions?.length}>
              <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  Browser sessions
                </div>
                <Show when={executionPaused() && deferredBrowserApprovalCount() > 0}>
                  <div class="mb-3 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-[0.675rem] text-amber-900">
                    {deferredBrowserApprovalCount()} browser approvals queued until resume.
                  </div>
                </Show>
                <div class="mb-3 flex justify-end">
                  <Show when={(runToShow()?.browserSessions?.length ?? 0) > TRACE_BROWSER_SESSION_LIMIT && !showAllBrowserSessions()}>
                    <ActionButton tooltip="Show every browser session row" size="sm" variant="ghost" onClick={handleShowAllBrowserSessions}>
                      Show all {runToShow()?.browserSessions?.length}
                    </ActionButton>
                  </Show>
                </div>
                <div class="space-y-3">
                  <For each={visibleBrowserSessions()}>
                    {(session) => (
                      <article class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem]">
                        <div class="flex items-center justify-between gap-3 text-(--foreground)">
                          <div class="font-semibold">
                            {session.owner === "subagent" ? `Subagent ${session.subagentId}` : session.owner}
                          </div>
                          <div class="uppercase tracking-[0.14em] text-(--accent-strong)">{session.status}</div>
                        </div>
                        <Show when={session.pendingApproval}>
                          {(approval) => (
                            <div class="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3">
                              <div class="font-semibold text-amber-900">Approval needed</div>
                              <div class="mt-1 text-amber-900/80">{approval().label}</div>
                              <Show when={approval().inputSummary}>
                                <div class="mt-1 whitespace-pre-wrap text-amber-900/70">{approval().inputSummary}</div>
                              </Show>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <ActionButton
                                  tooltip="Approve this browser step"
                                  disabled={executionPaused()}
                                  disabledReason={executionPauseReason}
                                  icon={<ShieldCheck class="h-3.5 w-3.5" />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleResolveBrowserApproval(session.id, approval().toolCallId, true)}
                                >
                                  Approve
                                </ActionButton>
                                <ActionButton
                                  tooltip="Reject this browser step"
                                  icon={<ShieldX class="h-3.5 w-3.5" />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleResolveBrowserApproval(session.id, approval().toolCallId, false)}
                                >
                                  Reject
                                </ActionButton>
                              </div>
                            </div>
                          )}
                        </Show>

                        <div class="mt-3 space-y-2">
                          <For each={capLatest(session.activities, TRACE_BROWSER_ACTIVITY_LIMIT, showAllBrowserSessions())}>
                            {(activity) => (
                              <Show when={activity.approval?.status !== "deferred"}>
                                <div class="rounded-xl border border-(--border) bg-white/80 p-3">
                                  <div class="flex items-center justify-between gap-3 text-(--foreground)">
                                    <span class="font-semibold">{activity.label}</span>
                                    <span class="uppercase tracking-[0.14em] text-(--muted)">{activity.status}</span>
                                  </div>
                                  <div class="mt-1 text-(--muted)">
                                    {activity.toolName} | {activity.kind}
                                  </div>
                                  <Show when={activity.outputSummary}>
                                    <MarkdownContent content={() => activity.outputSummary ?? ""} class="mt-2" size="compact" />
                                  </Show>
                                  <Show when={activity.replay.length > 0}>
                                    <div class="mt-2 space-y-1 text-(--muted)">
                                      <For each={activity.replay.slice(-3)}>
                                        {(entry) => <div>{entry.summary}</div>}
                                      </For>
                                    </div>
                                  </Show>
                                  <Show when={activity.verification.length > 0}>
                                    <div class="mt-2 text-emerald-800/80">
                                      {formatVerificationSummary(activity.verification)}
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            )}
                          </For>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <ScrollArea class="flex-1 min-h-0 space-y-3 pr-2">
              <Show
                when={visibleTraces().length > 0}
                fallback={
                  <div class="rounded-3xl border border-dashed border-(--border) bg-white/40 p-5 text-[0.675rem] text-(--muted)">
                    No trace events yet.
                  </div>
                }
              >
                <div class="space-y-3">
                  <Show when={visibleTraces().length > TRACE_EVENT_LIMIT && !showAllTraces()}>
                    <div class="flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-white/55 p-3 text-[0.675rem] text-(--muted)">
                      <span>Showing latest {TRACE_EVENT_LIMIT} of {visibleTraces().length} trace events.</span>
                      <ActionButton tooltip="Show every trace event" size="sm" variant="ghost" onClick={handleShowAllTraces}>
                        Show all
                      </ActionButton>
                    </div>
                  </Show>
                  <For each={visibleTraceRows()}>
                    {(trace) => (
                      <article class="rounded-3xl border border-(--border) bg-white/55 p-3">
                        <div class="mb-2 flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">
                          <span>{trace.stage}</span>
                          <span>{trace.modelId ?? "n/a"}</span>
                        </div>
                        <MarkdownContent content={() => trace.message} size="compact" />
                        <Show when={trace.detail}>
                          <MarkdownContent content={() => trace.detail ?? ""} class="mt-2" size="compact" tone="muted" />
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </ScrollArea>
          </>
        )}
      </Show>

    </aside>
  );
}

const TRACE_SUBTASK_LIMIT = 24;
const TRACE_TOOL_ACTIVITY_LIMIT = 50;
const TRACE_BROWSER_SESSION_LIMIT = 10;
const TRACE_BROWSER_ACTIVITY_LIMIT = 25;
const TRACE_EVENT_LIMIT = 80;

function capLatest<T>(items: readonly T[], limit: number, showAll: boolean) {
  return showAll || items.length <= limit ? items : items.slice(-limit);
}

function TaskStatusIcon(props: { status: "pending" | "running" | "completed" | "failed" }) {
  switch (props.status) {
    case "running":
      return <LoaderCircle class="h-3.5 w-3.5 animate-spin" aria-label="Subtask running" />;
    case "completed":
      return <CheckCircle2 class="h-3.5 w-3.5 text-emerald-600" aria-label="Subtask completed" />;
    case "failed":
      return <CircleAlert class="h-3.5 w-3.5 text-rose-600" aria-label="Subtask failed" />;
    default:
      return <Circle class="h-3.5 w-3.5 text-(--muted)" aria-label="Subtask pending" />;
  }
}

function ToolActivityStatusIcon(props: { status: ExecutionToolActivity["status"] }) {
  switch (props.status) {
    case "running":
      return <LoaderCircle class="h-3.5 w-3.5 animate-spin" aria-label="Tool running" />;
    case "completed":
      return <CheckCircle2 class="h-3.5 w-3.5 text-emerald-600" aria-label="Tool completed" />;
    case "failed":
    case "timed-out":
      return <CircleAlert class="h-3.5 w-3.5 text-rose-600" aria-label="Tool failed" />;
  }
}

function formatToolOwner(activity: ExecutionToolActivity) {
  if (activity.owner === "subagent") {
    return activity.subagentId ? `Subagent ${activity.subagentId}` : "Subagent";
  }
  return activity.owner === "aggregator" ? "Aggregator" : "Main";
}

function formatToolActivityCopyText(activity: ExecutionToolActivity) {
  return [
    `${formatToolOwner(activity)} ${activity.toolName} ${activity.status}`,
    activity.exitCode === undefined ? "" : `Exit: ${activity.exitCode}`,
    activity.command ? `Command:\n${activity.command}` : "",
    activity.argsSummary ? `Args:\n${activity.argsSummary}` : "",
    activity.outputPreview ? `Output:\n${activity.outputPreview}` : "",
    activity.stdoutPreview ? `Stdout:\n${activity.stdoutPreview}` : "",
    activity.stderrPreview ? `Stderr:\n${activity.stderrPreview}` : ""
  ].filter(Boolean).join("\n\n");
}

function formatVerificationSummary(verification: Array<{ status: "passed" | "failed" | "unknown" }>) {
  const passed = verification.filter((entry) => entry.status === "passed").length;
  const failed = verification.filter((entry) => entry.status === "failed").length;
  const unknown = verification.filter((entry) => entry.status === "unknown").length;
  return `Verification: ${passed} pass, ${failed} fail, ${unknown} unknown`;
}

