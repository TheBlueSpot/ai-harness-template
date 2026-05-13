import { createMemo, createSignal, For, Show } from "solid-js";
import { createRequestId, type ExecutionToolActivity } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { getLatestTaskStatusText, getRunRefreshState, getVisibleProjectTraces, isRunWorking } from "../lib/run-status";
import { formatShortTimestamp } from "../lib/time-format";
import {
  getAssistantTracePanelSnapshot,
  getJobTracePanelSnapshot,
  getThreadTracePanelSnapshot,
  getTracePanelExecutionLogEntries,
  getTracePanelRunningCounts,
  getTracePanelTitle,
  resolveTracePanelEntity
} from "../lib/trace-panel-model";
import { ActionButton } from "./action-button";
import { CopyTextButton } from "./primitives/copy-text-button";
import { ExecutionLog } from "./primitives/execution-log";
import { MarkdownContent } from "./markdown-content";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";
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
  const traceEntity = createMemo(() => resolveTracePanelEntity(state));
  const traceTitle = createMemo(() => getTracePanelTitle(state, traceEntity()));
  const threadSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "thread" ? getThreadTracePanelSnapshot(state, entity) : undefined;
  });
  const assistantSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "assistant" ? getAssistantTracePanelSnapshot(state, entity) : undefined;
  });
  const jobSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "job" ? getJobTracePanelSnapshot(state, entity) : undefined;
  });
  const executionLogEntries = createMemo(() => getTracePanelExecutionLogEntries(state, traceEntity()));
  const runningCounts = createMemo(() => getTracePanelRunningCounts(state, traceEntity()));
  const activeProject = () => threadSnapshot()?.project ?? getActiveProject(state);
  const threadProject = () => threadSnapshot()?.project;
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = "Global execution pause is active";
  const runToShow = () => threadSnapshot()?.runToShow;
  const deferredBrowserApprovalCount = () => state.executionControl.deferredBrowserApprovalCount;
  const canRetryRun = () => Boolean(activeProject()?.lastRun?.retryable);
  const visibleTraces = () => threadSnapshot()?.visibleTraces ?? getVisibleProjectTraces(activeProject()?.traces ?? []);
  const refreshState = () => {
    const project = activeProject();
    return project ? getRunRefreshState(project, runToShow()) : { disabled: true, disabledReason: "No run available", refreshing: false };
  };
  const [expandedToolActivityId, setExpandedToolActivityId] = createSignal<string>();
  const planRun = () => runToShow();
  const hasPlanDetails = () => Boolean(activeProject()?.latestPlan?.executionPlan);
  const visibleSubtasks = createMemo(() => runToShow()?.subtasks ?? []);
  const visibleToolActivities = createMemo(() => runToShow()?.toolActivities ?? []);
  const visibleBrowserSessions = createMemo(() => runToShow()?.browserSessions ?? []);
  const visibleTraceRows = createMemo(() => visibleTraces());

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

  function openAssistantJob(jobId: string) {
    harnessStore.setActiveLeftTab("jobs");
    harnessStore.setJobsPanePreferences({
      segment: "jobs",
      selectedJobId: jobId,
      selectedRunId: undefined,
      selectedNotificationId: undefined,
      jobSearch: "",
      kind: undefined,
      status: undefined,
      risk: undefined
    });
  }

  function handleAssistantJobKeyDown(event: KeyboardEvent, jobId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openAssistantJob(jobId);
  }

  return (
    <aside data-test-trace-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0 p-[0.8rem]">
      <div>
        <div class="flex items-center gap-2 text-[0.585rem] font-semibold tracking-[0.2em] text-(--muted)">
          <span>Developer trace</span>
          <Tooltip content="Selected thread, assistant, or job traces stay here, separate from user-visible chat history.">
            <span class="inline-flex">
              <CircleHelp class="h-3.5 w-3.5 text-(--muted)" aria-label="Projects trace help" />
            </span>
          </Tooltip>
        </div>
      </div>

      <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{traceTitle().eyebrow}</div>
        <div class="mt-1 truncate text-[0.8rem] font-semibold text-(--foreground)">{traceTitle().title}</div>
        <div class="mt-1 text-[0.625rem] text-(--muted)">Source: {traceTitle().source}</div>
      </div>

      <Show
        when={threadProject()}
        fallback={
          <>
            <Show when={assistantSnapshot()}>
              {(snapshot) => (
                <div class="flex min-h-0 flex-1 flex-col gap-4">
                  <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant status</div>
                    <div class="space-y-1 text-[0.675rem] text-(--muted)">
                      <div>Name: {snapshot().assistant.name}</div>
                      <div>State: {snapshot().assistant.runState}</div>
                      <div>Bootstrap: {snapshot().assistant.bootstrapState}</div>
                      <div>Jobs: {snapshot().jobs.length}</div>
                      <div>Runs: {snapshot().runs.length}</div>
                    </div>
                  </div>
                  <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant jobs</div>
                    <Show
                      when={snapshot().jobs.length > 0}
                      fallback={<div class="rounded-2xl border border-dashed border-(--border) bg-white/45 p-3 text-[0.675rem] text-(--muted)">No assistant-owned jobs.</div>}
                    >
                      <div class="space-y-2">
                        <For each={snapshot().jobs.slice(0, 6)}>
                          {(job) => {
                            const statusView = () => getAssistantJobStatusView(job.id, snapshot().runs);
                            return (
                            <div
                              class={`cursor-pointer rounded-2xl border bg-white/70 p-3 text-[0.675rem] ${statusView().borderClass}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => openAssistantJob(job.id)}
                              onKeyDown={(event) => handleAssistantJobKeyDown(event, job.id)}
                            >
                              <div class={`flex min-w-0 items-center gap-2 font-semibold ${statusView().textClass}`}>
                                <AssistantJobStatusIcon state={statusView().state} />
                                <span class="truncate">{job.name}</span>
                              </div>
                              <div class="mt-1 text-(--muted)">{getAssistantJobStatusText(job, statusView().state)}</div>
                            </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                  <section class="flex min-h-0 flex-1 flex-col rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
                    <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." />
                  </section>
                </div>
              )}
            </Show>
            <Show when={jobSnapshot()}>
              {(snapshot) => (
                <div class="flex min-h-0 flex-1 flex-col gap-4">
                  <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Job status</div>
                    <div class="space-y-1 text-[0.675rem] text-(--muted)">
                      <div>Name: {snapshot().job.name}</div>
                      <div>Kind: {snapshot().job.kind}</div>
                      <div>Status: {snapshot().job.status}</div>
                      <div>Risk: {snapshot().job.riskLevel}</div>
                      <div>Runs: {snapshot().runs.length}</div>
                    </div>
                  </div>
                  <div class="rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Run</div>
                    <Show
                      when={snapshot().run}
                      fallback={<div class="rounded-2xl border border-dashed border-(--border) bg-white/45 p-3 text-[0.675rem] text-(--muted)">No run yet.</div>}
                    >
                      {(run) => (
                        <div class="space-y-1 text-[0.675rem] text-(--muted)">
                          <div>Status: {run().status}</div>
                          <div>Trigger: {run().triggerSource}</div>
                          <div>Approval: {run().approvalStatus}</div>
                          <div>Summary: {run().summary ?? "n/a"}</div>
                          <Show when={run().failureMessage}>
                            <div>Failure: {run().failureMessage}</div>
                          </Show>
                        </div>
                      )}
                    </Show>
                  </div>
                  <section class="flex min-h-0 flex-1 flex-col rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
                    <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." />
                  </section>
                </div>
              )}
            </Show>
            <Show when={!assistantSnapshot() && !jobSnapshot()}>
              <div class="flex">
                <div class="w-full rounded-3xl border border-dashed border-(--border) bg-white/40 p-5 text-[0.675rem] leading-5 text-(--muted)">
                  Open project root, assistant, or job to inspect execution.
                </div>
              </div>
            </Show>
          </>
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
                    </div>
                    <VirtualList
                      class="max-h-80 pr-2"
                      contentClass="w-full"
                      itemClass="pb-2"
                      items={visibleSubtasks()}
                      getKey={(task) => task.id}
                      estimateSize={132}
                      pagination={{ kind: "forward", initialCount: TRACE_SUBTASK_LIMIT, batchSize: TRACE_SUBTASK_LIMIT }}
                    >
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
                            <Show when={task.startedAt}>
                              <div class="mt-1 text-(--muted)">Started: {formatShortTimestamp(task.startedAt)}</div>
                            </Show>
                            <Show when={task.completedAt}>
                              <div class="mt-1 text-(--muted)">Completed: {formatShortTimestamp(task.completedAt)}</div>
                            </Show>
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
                    </VirtualList>
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
                </div>
                <VirtualList
                  class="max-h-96 pr-2"
                  contentClass="w-full"
                  itemClass="pb-2"
                  items={visibleToolActivities()}
                  getKey={(activity) => activity.id}
                  estimateSize={150}
                  pagination={{ kind: "forward", initialCount: TRACE_TOOL_ACTIVITY_LIMIT, batchSize: TRACE_TOOL_ACTIVITY_LIMIT }}
                >
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
                </VirtualList>
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
                <VirtualList
                  class="max-h-96 pr-2"
                  contentClass="w-full"
                  itemClass="pb-3"
                  items={visibleBrowserSessions()}
                  getKey={(session) => session.id}
                  estimateSize={240}
                  pagination={{ kind: "forward", initialCount: TRACE_BROWSER_SESSION_LIMIT, batchSize: TRACE_BROWSER_SESSION_LIMIT }}
                >
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
                          <For each={session.activities.slice(-TRACE_BROWSER_ACTIVITY_LIMIT)}>
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
                </VirtualList>
              </div>
            </Show>

            <section class="flex min-h-0 max-h-72 flex-col rounded-3xl border border-(--border) bg-white/55 p-3">
              <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
              <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." />
            </section>

            <VirtualList
              class="flex-1 min-h-0 pr-2"
              contentClass="w-full"
              itemClass="pb-3"
              items={visibleTraceRows()}
              getKey={(trace, index) => `${trace.stage}-${index}`}
              estimateSize={140}
              pagination={{ kind: "reverse", initialCount: TRACE_EVENT_LIMIT, batchSize: TRACE_EVENT_LIMIT }}
              empty={<div class="rounded-3xl border border-dashed border-(--border) bg-white/40 p-5 text-[0.675rem] text-(--muted)">No trace events yet.</div>}
            >
              {(trace) => (
                <article class="rounded-3xl border border-(--border) bg-white/55 p-3">
                  <div class="mb-2 flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">
                    <div class="min-w-0">
                      <div class="truncate">{trace.stage}</div>
                      <div class="mt-1 text-[0.53rem] font-medium normal-case tracking-normal text-(--muted)">
                        {formatShortTimestamp(trace.createdAt)}
                      </div>
                    </div>
                    <span>{trace.modelId ?? "n/a"}</span>
                  </div>
                  <MarkdownContent content={() => trace.message} size="compact" />
                  <Show when={trace.detail}>
                    <MarkdownContent content={() => trace.detail ?? ""} class="mt-2" size="compact" tone="muted" />
                  </Show>
                </article>
              )}
            </VirtualList>
          </>
        )}
      </Show>

      <div class="shrink-0 rounded-2xl border border-(--border) bg-white/75 px-3 py-2 text-[0.625rem] font-semibold text-(--foreground)">
        Running agents: {runningCounts().current} current / {runningCounts().total} total
      </div>
    </aside>
  );
}

const TRACE_SUBTASK_LIMIT = 24;
const TRACE_TOOL_ACTIVITY_LIMIT = 50;
const TRACE_BROWSER_SESSION_LIMIT = 10;
const TRACE_BROWSER_ACTIVITY_LIMIT = 25;
const TRACE_EVENT_LIMIT = 80;

type AssistantJobStatusState = "running" | "successful" | "error" | "idle";

function getAssistantJobStatusView(jobId: string, runs: { jobId: string; status: string; updatedAt: string }[]) {
  const run = runs.filter((entry) => entry.jobId === jobId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const state = getAssistantJobStatusState(run?.status);
  const classes: Record<AssistantJobStatusState, { borderClass: string; textClass: string }> = {
    running: { borderClass: "border-amber-300", textClass: "text-amber-700" },
    successful: { borderClass: "border-emerald-300", textClass: "text-emerald-700" },
    error: { borderClass: "border-rose-300", textClass: "text-rose-700" },
    idle: { borderClass: "border-(--border)", textClass: "text-(--foreground)" }
  };
  return { state, ...classes[state] };
}

function getAssistantJobStatusState(status: string | undefined): AssistantJobStatusState {
  if (status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running") {
    return "running";
  }
  if (status === "succeeded") {
    return "successful";
  }
  if (status === "failed" || status === "cancelled") {
    return "error";
  }
  return "idle";
}

function getAssistantJobStatusText(job: { kind: string; status: string; riskLevel: string; nextRunAt?: string }, statusState: AssistantJobStatusState) {
  return [job.kind, job.status, job.riskLevel, job.nextRunAt && statusState !== "running" ? `next ${formatShortTimestamp(job.nextRunAt)}` : undefined]
    .filter(Boolean)
    .join(" | ");
}

function AssistantJobStatusIcon(props: { state: AssistantJobStatusState }) {
  switch (props.state) {
    case "running":
      return <LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" aria-label="Assistant job running" />;
    case "successful":
      return <CheckCircle2 class="h-3.5 w-3.5 shrink-0" aria-label="Assistant job successful" />;
    case "error":
      return <CircleAlert class="h-3.5 w-3.5 shrink-0" aria-label="Assistant job error" />;
    default:
      return <Circle class="h-3.5 w-3.5 shrink-0" aria-label="Assistant job idle" />;
  }
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

