import { createMemo, createSignal, For, Show } from "solid-js";
import { createRequestId, type AgentRunState, type BackgroundJob, type BackgroundJobRun, type ExecutionToolActivity } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import type { ChatFileTarget } from "../lib/chat-file-links";
import { openIdeWindow } from "../lib/ide-window";
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
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
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
  Eye,
  LoaderCircle,
  PanelRightOpen,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Terminal,
  X
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
  const fileLinkProject = createMemo(() => {
    const project = threadProject();
    if (project) {
      return project;
    }
    const projectId = assistantSnapshot()?.assistant.projectId ?? jobSnapshot()?.job.projectId;
    return projectId ? state.workspace.projects.find((entry) => entry.id === projectId) : undefined;
  });
  const traceFileLinks = (): FileLinkConfig | undefined => {
    const project = fileLinkProject();
    return project
      ? {
          rootPath: project.rootPath,
          filePaths: project.filePaths ?? [],
          onOpenFile: handleOpenTraceFile
        }
      : undefined;
  };
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

  function handleOpenTraceFile(target: ChatFileTarget) {
    const project = fileLinkProject();
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
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

      <TraceContextSummary
        title={traceTitle()}
        runningCounts={runningCounts()}
        run={runToShow()}
        assistant={assistantSnapshot()?.assistant}
        assistantJobsCount={assistantSnapshot()?.jobs.length}
        assistantRunsCount={assistantSnapshot()?.runs.length}
        job={jobSnapshot()?.job}
        jobRun={jobSnapshot()?.run}
        jobRunCount={jobSnapshot()?.runs.length}
        fileLinks={traceFileLinks()}
      />

      <Show
        when={threadProject()}
        fallback={
          <>
            <Show when={assistantSnapshot()}>
              {(snapshot) => (
                <div class="flex min-h-0 flex-1 flex-col gap-4">
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
                              class="cursor-pointer rounded-2xl border bg-white/70 p-3 text-[0.675rem]"
                              classList={{
                                "border-amber-300": statusView().state === "running",
                                "border-emerald-300": statusView().state === "successful",
                                "border-rose-300": statusView().state === "error",
                                "border-(--border)": statusView().state === "idle"
                              }}
                              role="button"
                              tabIndex={0}
                              onClick={() => openAssistantJob(job.id)}
                              onKeyDown={(event) => handleAssistantJobKeyDown(event, job.id)}
                            >
                              <div
                                class="flex min-w-0 items-center gap-2 font-semibold"
                                classList={{
                                  "text-amber-700": statusView().state === "running",
                                  "text-emerald-700": statusView().state === "successful",
                                  "text-rose-700": statusView().state === "error",
                                  "text-(--foreground)": statusView().state === "idle"
                                }}
                              >
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
                    <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." fileLinks={traceFileLinks()} />
                  </section>
                </div>
              )}
            </Show>
            <Show when={jobSnapshot()}>
              {(snapshot) => (
                <div class="flex min-h-0 flex-1 flex-col gap-4">
                  <section class="flex min-h-0 flex-1 flex-col rounded-3xl border border-(--border) bg-white/55 p-3">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
                    <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." fileLinks={traceFileLinks()} />
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
                    <div class="truncate">
                      <FileLinkedText text={() => `Prompt: ${runToShow()?.latestUserPrompt ?? ""}`} fileLinks={traceFileLinks()} />
                    </div>
                  </Tooltip>
                  <Show when={runToShow()?.failureMessage}>
                    {(failure) => (
                      <div class="wrap-anywhere">
                        <FileLinkedText text={`Failure: ${failure()}`} fileLinks={traceFileLinks()} />
                      </div>
                    )}
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
                                  <FileLinkedText class="block truncate" text={task.title} fileLinks={traceFileLinks()} />
                                </Tooltip>
                              </span>
                              <span class="shrink-0 uppercase tracking-[0.14em] text-(--accent-strong)">{task.status}</span>
                            </div>
                            <div class="mt-1 text-(--muted)">Attempts: {task.attemptCount}</div>
                            <div class="mt-1 text-(--muted)">
                              <FileLinkedText text={() => `Latest status: ${getLatestTaskStatusText(project(), task)}`} fileLinks={traceFileLinks()} />
                            </div>
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
                              <MarkdownContent content={() => task.errorMessage ?? ""} class="mt-1" size="compact" tone="danger" fileLinks={traceFileLinks()} />
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
                            <FileLinkedText text={activity.command ?? ""} fileLinks={traceFileLinks()} />
                          </div>
                        </Show>
                        <Show when={activity.outputPreview}>
                          <MarkdownContent content={() => activity.outputPreview ?? ""} class="mt-2" size="compact" tone={activity.status === "failed" ? "danger" : "muted"} fileLinks={traceFileLinks()} />
                        </Show>
                        <Show when={expandedToolActivityId() === activity.id}>
                          <div class="mt-2 space-y-2 rounded-xl border border-(--border) bg-white/80 p-2">
                            <Show when={activity.argsSummary}>
                              <MarkdownContent content={() => `Args: ${activity.argsSummary}`} size="compact" tone="muted" fileLinks={traceFileLinks()} />
                            </Show>
                            <Show when={activity.stdoutPreview}>
                              <MarkdownContent content={() => `Stdout: ${activity.stdoutPreview}`} size="compact" fileLinks={traceFileLinks()} />
                            </Show>
                            <Show when={activity.stderrPreview}>
                              <MarkdownContent content={() => `Stderr: ${activity.stderrPreview}`} size="compact" tone="danger" fileLinks={traceFileLinks()} />
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
                              <div class="mt-1 text-amber-900/80">
                                <FileLinkedText text={approval().label} fileLinks={traceFileLinks()} />
                              </div>
                              <Show when={approval().inputSummary}>
                                {(summary) => (
                                  <div class="mt-1 whitespace-pre-wrap text-amber-900/70">
                                    <FileLinkedText text={summary()} fileLinks={traceFileLinks()} />
                                  </div>
                                )}
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
                                    <span class="font-semibold">
                                      <FileLinkedText text={activity.label} fileLinks={traceFileLinks()} />
                                    </span>
                                    <span class="uppercase tracking-[0.14em] text-(--muted)">{activity.status}</span>
                                  </div>
                                  <div class="mt-1 text-(--muted)">
                                    {activity.toolName} | {activity.kind}
                                  </div>
                                  <Show when={activity.outputSummary}>
                                    <MarkdownContent content={() => activity.outputSummary ?? ""} class="mt-2" size="compact" fileLinks={traceFileLinks()} />
                                  </Show>
                                  <Show when={activity.replay.length > 0}>
                                    <div class="mt-2 space-y-1 text-(--muted)">
                                      <For each={activity.replay.slice(-3)}>
                                        {(entry) => (
                                          <div>
                                            <FileLinkedText text={entry.summary} fileLinks={traceFileLinks()} />
                                          </div>
                                        )}
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
              <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." fileLinks={traceFileLinks()} />
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
                  <MarkdownContent content={() => trace.message} size="compact" fileLinks={traceFileLinks()} />
                  <Show when={trace.detail}>
                    <MarkdownContent content={() => trace.detail ?? ""} class="mt-2" size="compact" tone="muted" fileLinks={traceFileLinks()} />
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

function TraceContextSummary(props: {
  title: { eyebrow: string; title: string; source: string };
  runningCounts: { current: number; total: number };
  run?: AgentRunState;
  assistant?: { runState: string; bootstrapState: string };
  assistantJobsCount?: number;
  assistantRunsCount?: number;
  job?: BackgroundJob;
  jobRun?: BackgroundJobRun;
  jobRunCount?: number;
  fileLinks?: FileLinkConfig;
}) {
  return (
    <section data-test-trace-context-summary="" class="trace-context-summary">
      <div class="trace-context-summary-header">
        <div class="min-w-0">
          <div class="trace-context-eyebrow">{props.title.eyebrow}</div>
          <div class="trace-context-title">{props.title.title}</div>
          <div class="trace-context-source">
            <FileLinkedText text={`Source: ${props.title.source}`} fileLinks={props.fileLinks} />
          </div>
        </div>
        <div
          class="trace-context-agent-pill"
          classList={{
            "trace-context-agent-pill-active": props.runningCounts.current > 0
          }}
        >
          <span class="trace-context-pill-dot" />
          <span>{props.runningCounts.current}</span>
          <span class="text-(--muted)">/ {props.runningCounts.total}</span>
        </div>
      </div>

      <div class="trace-context-metrics">
        <Show when={props.assistant}>
          {(assistant) => (
            <>
              <TraceContextMetric label="State" value={assistant().runState} tone={toneForStatus(assistant().runState)} />
              <TraceContextMetric label="Bootstrap" value={assistant().bootstrapState} tone={toneForStatus(assistant().bootstrapState)} />
              <TraceContextMetric label="Jobs" value={String(props.assistantJobsCount ?? 0)} tone="info" />
              <TraceContextMetric label="Runs" value={String(props.assistantRunsCount ?? 0)} tone="neutral" />
            </>
          )}
        </Show>
        <Show when={props.job}>
          {(job) => (
            <>
              <TraceContextMetric label="Kind" value={job().kind} tone="info" />
              <TraceContextMetric label="Status" value={job().status} tone={toneForStatus(job().status)} />
              <TraceContextMetric label="Risk" value={job().riskLevel} tone={toneForRisk(job().riskLevel)} />
              <TraceContextMetric label="Runs" value={String(props.jobRunCount ?? 0)} tone="neutral" />
            </>
          )}
        </Show>
        <Show when={!props.assistant && !props.job && props.run}>
          {(run) => (
            <>
              <TraceContextMetric label="Run" value={run().status} tone={toneForStatus(run().status)} />
              <TraceContextMetric label="Retry" value={run().retryable ? "yes" : "no"} tone={run().retryable ? "info" : "neutral"} />
              <TraceContextMetric label="Resume" value={run().resumable ? "yes" : "no"} tone={run().resumable ? "info" : "neutral"} />
            </>
          )}
        </Show>
      </div>

      <Show when={props.job}>
        <TraceJobRunSummary run={props.jobRun} fileLinks={props.fileLinks} />
      </Show>

      <Show when={!props.job && props.run}>
        {(run) => (
          <div class="trace-context-runline">
            <Tooltip content={run().latestUserPrompt} triggerClass="block min-w-0">
              <div class="truncate">
                <FileLinkedText text={`Prompt: ${run().latestUserPrompt}`} fileLinks={props.fileLinks} />
              </div>
            </Tooltip>
            <Show when={run().failureMessage}>
              {(failure) => (
                <div class="wrap-anywhere text-rose-800">
                  <FileLinkedText text={`Failure: ${failure()}`} fileLinks={props.fileLinks} />
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}

function TraceContextMetric(props: { label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return (
    <div
      class="trace-context-metric"
      classList={{
        "trace-context-metric-success": props.tone === "success",
        "trace-context-metric-warning": props.tone === "warning",
        "trace-context-metric-danger": props.tone === "danger",
        "trace-context-metric-info": props.tone === "info"
      }}
    >
      <div class="trace-context-metric-label">{props.label}</div>
      <div class="trace-context-metric-value">{props.value}</div>
    </div>
  );
}

function TraceJobRunSummary(props: { run?: BackgroundJobRun; fileLinks?: FileLinkConfig }) {
  return (
    <Show
      when={props.run}
      fallback={<div class="trace-context-runline trace-context-runline-empty">No run yet.</div>}
    >
      {(run) => (
        <div
          class="trace-context-run-summary"
          classList={{
            "trace-context-run-summary-danger": toneForStatus(run().status) === "danger",
            "trace-context-run-summary-warning": toneForStatus(run().status) === "warning",
            "trace-context-run-summary-success": toneForStatus(run().status) === "success"
          }}
        >
          <div class="trace-context-run-status">
            <span class="trace-context-run-dot" />
            <span>{run().status}</span>
          </div>
          <div class="trace-context-run-facts">
            <span>Trigger: {run().triggerSource}</span>
            <span>Approval: {run().approvalStatus}</span>
          </div>
          <div class="trace-context-run-copy">
            <FileLinkedText text={`Summary: ${run().summary ?? "n/a"}`} fileLinks={props.fileLinks} />
          </div>
          <Show when={run().failureMessage}>
            {(failure) => (
              <div class="trace-context-run-copy text-rose-900">
                <FileLinkedText text={`Failure: ${failure()}`} fileLinks={props.fileLinks} />
              </div>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
}

function toneForRisk(risk: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (risk === "unsafe") {
    return "danger";
  }
  if (risk === "slightly-unsafe") {
    return "warning";
  }
  return "success";
}

function toneForStatus(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status.includes("failed") || status.includes("cancelled") || status.includes("error") || status.includes("open")) {
    return "danger";
  }
  if (status.includes("partial-complete")) {
    return "warning";
  }
  if (status.includes("running") || status.includes("queued") || status.includes("awaiting") || status.includes("pending") || status.includes("due")) {
    return "warning";
  }
  if (status.includes("succeeded") || status.includes("completed") || status.includes("enabled") || status.includes("active") || status.includes("closed")) {
    return "success";
  }
  if (status.includes("paused") || status.includes("idle")) {
    return "info";
  }
  return "neutral";
}

export function TracePeekRail() {
  const state = harnessStore.state;
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
  const runningCounts = createMemo(() => getTracePanelRunningCounts(state, traceEntity()));
  const runStatus = createMemo(() => threadSnapshot()?.runToShow?.status ?? jobSnapshot()?.run?.status);
  const failureText = createMemo(() => threadSnapshot()?.runToShow?.failureMessage ?? jobSnapshot()?.run?.failureMessage);
  const fileLinkProject = createMemo(() => {
    const threadProject = threadSnapshot()?.project;
    if (threadProject) {
      return threadProject;
    }
    const projectId = assistantSnapshot()?.assistant.projectId ?? jobSnapshot()?.job.projectId;
    return projectId ? state.workspace.projects.find((project) => project.id === projectId) : undefined;
  });
  const traceFileLinks = (): FileLinkConfig | undefined => {
    const project = fileLinkProject();
    return project
      ? {
          rootPath: project.rootPath,
          filePaths: project.filePaths ?? [],
          onOpenFile: handleOpenTracePeekFile
        }
      : undefined;
  };
  const assistantState = createMemo(() => {
    const assistant = assistantSnapshot()?.assistant;
    return assistant ? `${assistant.runState} / ${assistant.bootstrapState}` : undefined;
  });

  function handleOpenTracePeekFile(target: ChatFileTarget) {
    const project = fileLinkProject();
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  return (
    <aside data-test-trace-peek-rail="" class="trace-peek-rail panel-shell flex h-full min-h-0 flex-col gap-3 rounded-xl border-t-0 p-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
          <Eye class="h-3.5 w-3.5" />
          <span class="truncate">Trace peek</span>
        </div>
        <div class="flex gap-1">
          <ActionButton
            tooltip="Open full trace inspector"
            ariaLabel="Open full trace inspector"
            icon={<PanelRightOpen class="h-3.5 w-3.5" />}
            size="icon"
            variant="ghost"
            onClick={() => harnessStore.setTracePanelMode("open")}
          />
          <ActionButton
            tooltip="Close trace panel"
            ariaLabel="Close trace panel"
            icon={<X class="h-3.5 w-3.5" />}
            size="icon"
            variant="ghost"
            onClick={() => harnessStore.setTracePanelMode("closed")}
          />
        </div>
      </div>

      <div class="trace-summary-card">
        <div class="trace-summary-eyebrow">{traceTitle().eyebrow}</div>
        <div class="truncate text-[0.76rem] font-semibold text-(--foreground)">{traceTitle().title}</div>
        <div class="mt-1 truncate text-[0.62rem] text-(--muted)">
          <FileLinkedText text={traceTitle().source} fileLinks={traceFileLinks()} />
        </div>
      </div>

      <div class="grid gap-2">
        <TracePeekMetric label="Agents" value={`${runningCounts().current}/${runningCounts().total}`} tone={runningCounts().current > 0 ? "info" : "neutral"} />
        <Show when={runStatus()}>
          {(status) => <TracePeekMetric label="Run" value={status()} tone={isAttentionStatus(status()) ? "warning" : "success"} />}
        </Show>
        <Show when={assistantState()}>
          {(status) => <TracePeekMetric label="Assistant" value={status()} tone="info" />}
        </Show>
      </div>

      <Show
        when={failureText()}
        fallback={<div class="trace-summary-card text-[0.65rem] leading-5 text-(--muted)">No active failure surfaced for this context.</div>}
      >
        {(failure) => (
          <div class="trace-summary-card border-rose-300 bg-rose-50/85 text-[0.65rem] leading-5 text-rose-950">
            <div class="mb-1 font-semibold">Failure digest</div>
            <div class="line-clamp-6 wrap-anywhere">
              <FileLinkedText text={failure()} fileLinks={traceFileLinks()} />
            </div>
          </div>
        )}
      </Show>
    </aside>
  );
}

function TracePeekMetric(props: { label: string; value: string; tone: "neutral" | "success" | "warning" | "info" }) {
  return (
    <div
      class="trace-peek-metric"
      classList={{
        "trace-peek-metric-success": props.tone === "success",
        "trace-peek-metric-warning": props.tone === "warning",
        "trace-peek-metric-info": props.tone === "info"
      }}
    >
      <div class="text-[0.55rem] font-semibold uppercase tracking-[0.14em] opacity-75">{props.label}</div>
      <div class="mt-1 truncate text-[0.72rem] font-semibold">{props.value}</div>
    </div>
  );
}

function isAttentionStatus(status: string) {
  return status.includes("failed") || status.includes("cancelled") || status.includes("approval") || status.includes("running") || status.includes("queued");
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

