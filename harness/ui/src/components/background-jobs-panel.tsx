import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js";
import { createRequestId, type AgentRunState, type BackgroundJob, type BackgroundJobRun, type RunDiagnosticsWindowDays } from "../../../shared/protocol";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import {
  type BackgroundJobEditorDraft,
  type JobsJobStateFilter,
  type JobsPaneJobSort,
  type JobsPaneRunSort,
  type JobsRunFilter,
  type RunDiagnosticsViewState,
  harnessStore,
  persistMergedLocalPreferences
} from "../harness-store";
import { formatShortTimestamp, resolveBrowserTimezone } from "../lib/time-format";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { toProperCase } from "../lib/utils";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { CopyTextButton } from "./primitives/copy-text-button";
import { ExecutionLog } from "./primitives/execution-log";
import { Dialog } from "./primitives/dialog";
import {
  DetailEmptyState,
  LeftPaneEmptyState,
  LeftPaneFilterBlock,
  LeftPaneHeader,
  LeftPaneListSection,
  LeftPaneSearchInput,
  LeftPaneSearchMenu,
  LeftPaneShell,
  type LeftPaneSearchMenuItem
} from "./primitives/left-pane";
import { ScrollArea } from "./primitives/scroll-area";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";
import {
  Bell,
  BellOff,
  Bot,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  Clock3,
  CircleX,
  ListFilter,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Terminal,
  Trash2
} from "lucide-solid";

type BackgroundJobsPanelProps = {
  variant?: "full" | "left" | "detail";
  segment?: "jobs" | "runs" | "health";
  healthRefreshThrottleMs?: number;
};

type ProjectChatRunEntry = {
  project: typeof harnessStore.state.workspace.projects[number];
  thread: typeof harnessStore.state.workspace.projects[number]["threads"][number] | undefined;
  run: AgentRunState;
};

type RunListItem =
  | {
      kind: "background";
      run: BackgroundJobRun;
    }
  | {
      kind: "project-chat";
      entry: ProjectChatRunEntry;
    };

function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function tooltipWithPrimaryHotkey(label: string, hotkey: string | undefined) {
  return hotkey ? `${label} (${formatHotkeyHint(hotkey)})` : label;
}

export function BackgroundJobsPanel(props: BackgroundJobsPanelProps = {}) {
  let runDetailViewport: HTMLDivElement | undefined;
  let pendingHealthRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHealthRefreshAt = 0;
  let lastObservedDiagnosticsRefreshVersion: number | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = "Global execution pause is active";
  const runFilter = () => state.jobsRunFilter;
  const variant = () => props.variant ?? "full";
  const healthRefreshThrottleMs = () => props.healthRefreshThrottleMs ?? 5000;
  const showLeft = () => variant() !== "detail";
  const showDetail = () => variant() !== "left";
  const jobsPane = () => state.jobsPanePreferences;
  const activeSegment = () =>
    props.segment === "jobs" ? "jobs" : props.segment === "runs" ? "inbox" : props.segment === "health" ? "health" : jobsPane().segment;
  const activeSearch = () => (activeSegment() === "jobs" ? jobsPane().jobSearch ?? "" : jobsPane().runSearch ?? "");
  const [healthWindowDays, setHealthWindowDays] = createSignal<RunDiagnosticsWindowDays>(state.runDiagnostics.windowDays);
  const headerTitle = () => (activeSegment() === "jobs" ? "Scheduled jobs" : activeSegment() === "health" ? "Health" : "Runs");
  const headerHelp = () =>
    activeSegment() === "jobs"
      ? "Durable scheduler. Jobs catch up on startup, run in hidden automation threads, summarize here."
      : activeSegment() === "health"
        ? "Read-only reliability diagnostics for recent runs, backoff, failure classes, and prompt compaction pressure."
      : "Background run history. Approvals, active runs, failures, and completed milestones stay out of project chat.";
  const selectedRunId = () => jobsPane().selectedRunId;
  const selectedJobId = () => jobsPane().selectedJobId;
  const detailsRunId = () => state.backgroundJobDetailsRunId;
  const diagnostics = () => state.runDiagnostics;
  const diagnosticsRefreshVersion = () => state.diagnosticsRefreshVersion;

  const jobs = createMemo(() =>
    [...state.backgroundJobs.jobs]
      .filter((job) => matchesJobFilters(job, state))
      .filter((job) => fuzzyMatches(jobSearchHaystack(job, state), jobsPane().jobSearch ?? ""))
      .sort((left, right) => compareJobs(left, right, jobsPane().jobSort))
  );
  const filteredRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => matchesRunFilter(run, runFilter()))
      .filter((run) => fuzzyMatches(runSearchHaystack(run, state), jobsPane().runSearch ?? ""))
      .sort((left, right) => compareRuns(left, right, jobsPane().runSort ?? "urgency"))
  );
  const activeProjectChatRuns = createMemo(() =>
    state.workspace.projects
      .flatMap((project) => {
        const activeRuns = collectActiveProjectRuns(project);
        return activeRuns.map((run) => ({
          project,
          thread: project.threads.find((entry) => entry.id === run.threadId),
          run
        }));
      })
      .filter((entry) => matchesProjectChatRunFilter(entry.run, runFilter()))
      .filter((entry) => fuzzyMatches(projectChatRunSearchHaystack(entry), jobsPane().runSearch ?? ""))
  );
  const runListItems = createMemo<RunListItem[]>(() =>
    [
      ...activeProjectChatRuns().map((entry) => ({ kind: "project-chat" as const, entry })),
      ...filteredRuns().map((run) => ({ kind: "background" as const, run }))
    ].sort((left, right) => compareRunListItems(left, right, jobsPane().runSort ?? "urgency"))
  );
  const selectedRun = createMemo(() => {
    const explicitRunId = selectedRunId();
    if (explicitRunId) {
      return filteredRuns().find((run) => run.id === explicitRunId);
    }
    return activeSegment() === "inbox" ? filteredRuns()[0] : undefined;
  });
  const selectedRunScrollKey = createMemo(() => {
    const run = selectedRun();
    const lastEventId = run?.events.at(-1)?.id ?? "";
    return `${run?.id ?? ""}:${run?.events.length ?? 0}:${lastEventId}`;
  });
  const selectedJob = createMemo(
    () =>
      jobs().find((job) => job.id === selectedRun()?.jobId) ??
      jobs().find((job) => job.id === selectedJobId()) ??
      jobs()[0]
  );
  const selectedJobRuns = createMemo(() => {
    const jobId = selectedJob()?.id;
    if (!jobId) {
      return [];
    }
    return [...state.backgroundJobs.runs].filter((run) => run.jobId === jobId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
  const detailsRun = createMemo(() => {
    const runId = detailsRunId();
    return runId ? state.backgroundJobs.runs.find((run) => run.id === runId) : undefined;
  });
  const detailsJob = createMemo(() => {
    const run = detailsRun();
    return run ? state.backgroundJobs.jobs.find((job) => job.id === run.jobId) : undefined;
  });
  const detailsLogEntries = createMemo(() =>
    (detailsRun()?.events ?? []).map((event) => ({
      id: event.id,
      message: event.message,
      level: event.stage,
      createdAt: event.createdAt,
      detail: event.detail
    }))
  );

  createEffect(() => {
    if (!showLeft()) {
      return;
    }
    if (activeSegment() === "jobs") {
      const unregister = registerCurrentTabItemSelector("jobs", (index) => {
        const job = jobs()[index];
        if (!job) {
          return false;
        }
        openJobDetails(job);
        return true;
      });
      onCleanup(unregister);
      return;
    }
    if (activeSegment() === "inbox") {
      const unregister = registerCurrentTabItemSelector("runs", (index) => {
        const item = runListItems()[index];
        if (!item) {
          return false;
        }
        if (item.kind === "project-chat") {
          openProjectChatRun(item.entry.project.id, item.entry.run.threadId);
        } else {
          openRunDetails(item.run);
        }
        return true;
      });
      onCleanup(unregister);
    }
  });

  function scrollRunDetailToBottom() {
    if (runDetailViewport) {
      runDetailViewport.scrollTop = runDetailViewport.scrollHeight;
    }
  }

  function requestDiagnostics(windowDays: RunDiagnosticsWindowDays = healthWindowDays()) {
    harnessStore.actions.startRunDiagnosticsRequest(windowDays);
    sendCommand({
      type: "run-diagnostics.inspect",
      requestId: createRequestId(),
      payload: {
        windowDays
      }
    });
    lastHealthRefreshAt = Date.now();
  }

  function scheduleHealthRefresh() {
    if (pendingHealthRefreshTimer) {
      return;
    }
    const elapsedMs = Date.now() - lastHealthRefreshAt;
    const delayMs = Math.max(0, healthRefreshThrottleMs() - elapsedMs);
    pendingHealthRefreshTimer = setTimeout(() => {
      pendingHealthRefreshTimer = undefined;
      requestDiagnostics();
    }, delayMs);
  }

  createEffect(() => {
    const currentRun = selectedRun();
    if (activeSegment() === "jobs" || activeSegment() === "health") {
      return;
    }

    if (!currentRun) {
      harnessStore.setJobsPanePreferences({ selectedRunId: undefined, selectedNotificationId: undefined });
      return;
    }

    if (selectedRunId() !== currentRun.id) {
      harnessStore.setJobsPanePreferences({ selectedRunId: currentRun.id });
    }
  });

  createEffect(() => {
    selectedRunScrollKey();
    if (activeSegment() === "jobs" || activeSegment() === "health" || !runDetailViewport) {
      return;
    }

    queueMicrotask(scrollRunDetailToBottom);
    requestAnimationFrame(scrollRunDetailToBottom);
  });

  createEffect(() => {
    const segment = activeSegment();
    const windowDays = healthWindowDays();
    const reportWindowDays = state.runDiagnostics.report?.windowDays;
    const loading = state.runDiagnostics.loading;
    if (segment !== "health") {
      return;
    }
    if (!loading && reportWindowDays !== windowDays) {
      requestDiagnostics(windowDays);
    }
  });

  createEffect(() => {
    const refreshVersion = diagnosticsRefreshVersion();
    const previousRefreshVersion = lastObservedDiagnosticsRefreshVersion;
    lastObservedDiagnosticsRefreshVersion = refreshVersion;
    if (
      previousRefreshVersion === undefined ||
      refreshVersion === previousRefreshVersion ||
      activeSegment() !== "health" ||
      state.runDiagnostics.loading ||
      !state.runDiagnostics.report
    ) {
      return;
    }
    scheduleHealthRefresh();
  });

  createEffect(() => {
    if (activeSegment() === "health" || !pendingHealthRefreshTimer) {
      return;
    }
    clearTimeout(pendingHealthRefreshTimer);
    pendingHealthRefreshTimer = undefined;
  });

  onCleanup(() => {
    if (pendingHealthRefreshTimer) {
      clearTimeout(pendingHealthRefreshTimer);
    }
  });

  function handleCreateJob(kind: BackgroundJob["kind"]) {
    const template =
      kind === "ai-routine" ? state.backgroundJobs.templates.find((entry) => entry.id === "scheduled-task") : undefined;
    const draft: BackgroundJobEditorDraft = {
      source: "create",
      projectId: state.workspace.activeProjectId ?? state.workspace.projects[0]?.id,
      templateId: template?.id,
      kind,
      name: "",
      description: "",
      scheduleInput: "",
      timezone: resolveBrowserTimezone(),
      aiPrompt: template?.definition.kind === "ai-routine" ? template.definition.prompt : "",
      aiModeId: template?.definition.kind === "ai-routine" ? template.definition.modeId : undefined,
      aiExecutionModelId: template?.definition.kind === "ai-routine" ? template.definition.executionModelId : undefined,
      aiReasoningStrength: template?.definition.kind === "ai-routine" ? template.definition.reasoningStrength : undefined,
      aiFastMode: template?.definition.kind === "ai-routine" ? template.definition.fastMode : undefined,
      aiPlanExecutionMode:
        template?.definition.kind === "ai-routine"
          ? template.definition.planExecutionMode ?? state.planExecutionModeDefault
          : state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy:
        template?.definition.kind === "ai-routine"
          ? template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
          : state.subagentWorktreeStrategyDefault,
      lane: "exclusive",
      shellExecutable: "",
      shellArgsText: "",
      shellCwd: "",
      shellEnvRefsText: "",
      shellTimeoutSeconds: 600,
      shellNetworkAccess: false
    };
    harnessStore.openBackgroundJobEditor(draft);
  }

  function handleEditJob(job: BackgroundJob) {
    const draft: BackgroundJobEditorDraft = {
      source: "edit",
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lastRunAt: job.lastRunAt,
      lastEnqueuedAt: job.lastEnqueuedAt,
      createdFromRunId: job.createdFromRunId,
      templateId: job.templateId,
      status: job.status,
      lane: job.lane ?? "exclusive",
      kind: job.kind,
      name: job.name,
      description: job.description ?? "",
      scheduleInput: job.scheduleInput,
      timezone: job.timezone ?? resolveBrowserTimezone(),
      aiPrompt: job.definition.kind === "ai-routine" ? job.definition.prompt : "",
      aiModeId: job.definition.kind === "ai-routine" ? job.definition.modeId : undefined,
      aiExecutionModelId: job.definition.kind === "ai-routine" ? job.definition.executionModelId : undefined,
      aiReasoningStrength: job.definition.kind === "ai-routine" ? job.definition.reasoningStrength : undefined,
      aiFastMode: job.definition.kind === "ai-routine" ? job.definition.fastMode : undefined,
      aiPlanExecutionMode:
        job.definition.kind === "ai-routine" ? job.definition.planExecutionMode ?? state.planExecutionModeDefault : undefined,
      aiSubagentWorktreeStrategy:
        job.definition.kind === "ai-routine"
          ? job.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
          : undefined,
      shellExecutable: job.definition.kind === "shell" ? job.definition.executable : "",
      shellArgsText: job.definition.kind === "shell" ? job.definition.args.join("\n") : "",
      shellCwd: job.definition.kind === "shell" ? job.definition.cwd ?? "" : "",
      shellEnvRefsText: job.definition.kind === "shell" ? (job.definition.envRefs ?? []).join("\n") : "",
      shellTimeoutSeconds: job.definition.kind === "shell" ? job.definition.timeoutSeconds : 600,
      shellNetworkAccess: job.definition.kind === "shell" ? Boolean(job.definition.networkAccess) : false
    };
    harnessStore.openBackgroundJobEditor(draft);
  }

  function openJobDetails(job: BackgroundJob) {
    harnessStore.closeBackgroundJobDetailsDialog();
    harnessStore.setJobsPanePreferences({ segment: "jobs", selectedJobId: job.id, selectedRunId: undefined, selectedNotificationId: undefined });
  }

  function openRunDetails(run: BackgroundJobRun) {
    harnessStore.closeBackgroundJobDetailsDialog();
    harnessStore.setJobsPanePreferences({ segment: "inbox", selectedRunId: run.id, selectedJobId: run.jobId, selectedNotificationId: undefined });
  }

  function openAssistantDetails(assistantId: string) {
    const assistant = state.assistants.assistants.find((entry) => entry.id === assistantId);
    if (assistant) {
      harnessStore.setAssistantScopeFilter(assistant.scope === "global" ? "global" : "project");
    }
    harnessStore.setSelectedAssistantId(assistantId);
    harnessStore.setActiveSurface("assistants");
  }

  function openProjectChatRun(projectId: string, threadId: string) {
    if (state.workspace.activeProjectId !== projectId) {
      sendCommand({
        type: "project.activate",
        requestId: createRequestId(),
        payload: { projectId }
      });
    }

    const project = state.workspace.projects.find((entry) => entry.id === projectId);
    if (state.workspace.activeProjectId !== projectId || project?.activeThreadId !== threadId) {
      sendCommand({
        type: "thread.activate",
        requestId: createRequestId(),
        payload: { projectId, threadId }
      });
    }

  }

  async function handleToggleNotifications() {
    if (typeof Notification === "undefined") {
      pushToast("Notifications unavailable", "Browser does not support desktop notifications.", "error");
      return;
    }

    if (state.backgroundJobNotificationsEnabled) {
      harnessStore.setBackgroundJobNotificationsEnabled(false);
      persistCurrentLocalPreferences(false);
      return;
    }

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      pushToast("Notifications blocked", "Browser denied notification permission. Falling back to in-app toasts.", "error");
      harnessStore.setBackgroundJobNotificationsEnabled(false);
      persistCurrentLocalPreferences(false);
      return;
    }

    harnessStore.setBackgroundJobNotificationsEnabled(true);
    persistCurrentLocalPreferences(true);
  }

  function persistCurrentLocalPreferences(backgroundJobNotificationsEnabled: boolean) {
    persistMergedLocalPreferences({
      openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
      googleApiKey: state.googleApiKeyDraft.trim() || undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      backgroundJobNotificationsEnabled
    });
  }

  return (
    <LeftPaneShell data-test-background-jobs-panel="" kind={activeSegment() === "jobs" ? "jobs" : activeSegment() === "inbox" ? "runs" : "health"} padding="comfortable">
      <Show when={showLeft()}>
        <>
          <LeftPaneHeader
            title={headerTitle()}
            help={headerHelp()}
            actions={
              <Show when={activeSegment() === "jobs"}>
                <>
                <ActionButton
                  tooltip={tooltipWithPrimaryHotkey(
                    "Create scheduled AI routine",
                    normalizeAppHotkeyPreferences(state.appHotkeyPreferences).createBackgroundJob[0]
                  )}
                  icon={<Bot class="h-4 w-4" />}
                  size="icon"
                  variant="ghost"
                  ariaLabel="Create scheduled AI routine"
                  onClick={() => handleCreateJob("ai-routine")}
                />
                <ActionButton
                  tooltip="Create scheduled shell task"
                  icon={<Terminal class="h-4 w-4" />}
                  size="icon"
                  variant="ghost"
                  ariaLabel="Create scheduled shell task"
                  onClick={() => handleCreateJob("shell")}
                />
                <ActionButton
                  tooltip={state.backgroundJobNotificationsEnabled ? "Disable desktop notifications" : "Enable desktop notifications"}
                  icon={state.backgroundJobNotificationsEnabled ? <Bell class="h-4 w-4" /> : <BellOff class="h-4 w-4" />}
                  size="icon"
                  variant="ghost"
                  ariaLabel={state.backgroundJobNotificationsEnabled ? "Disable desktop notifications" : "Enable desktop notifications"}
                  onClick={handleToggleNotifications}
                />
                </>
              </Show>
            }
          />
          <Show when={formatSchedulerHeartbeatWarning(state.backgroundJobs.schedulerHeartbeatAt)}>
            {(warning) => (
              <div class="mt-3 rounded-[0.9rem] border border-amber-300/70 bg-amber-50 px-3 py-2 text-[0.675rem] leading-5 text-amber-900">
                {warning()}
              </div>
            )}
          </Show>
        </>
      </Show>

      <Show when={showLeft()}>
        <Show when={activeSegment() !== "health"}>
          <LeftPaneFilterBlock>
            <LeftPaneSearchInput
              value={activeSearch()}
              aria-label={activeSegment() === "jobs" ? "Search jobs" : "Search runs"}
              placeholder={activeSegment() === "jobs" ? "Search jobs..." : "Search runs..."}
              menu={
                <LeftPaneSearchMenu
                  ariaLabel={activeSegment() === "jobs" ? "Filter and sort jobs" : "Filter and sort runs"}
                  tooltip={activeSegment() === "jobs" ? "Filter and sort jobs" : "Filter and sort runs"}
                  activeFilterCount={activeJobsPaneFilterCount(state, activeSegment())}
                  items={jobsPaneMenuItems(state, activeSegment(), !props.segment)}
                />
              }
              onInput={(event) =>
                harnessStore.setJobsPanePreferences(
                  activeSegment() === "jobs"
                    ? { jobSearch: (event.target as HTMLInputElement).value }
                    : { runSearch: (event.target as HTMLInputElement).value }
                )
              }
            />
          </LeftPaneFilterBlock>
        </Show>
      </Show>

      <div
        class="grid min-h-0 min-w-0 flex-1 gap-4"
        classList={{ "2xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]": showLeft() && showDetail() && activeSegment() !== "health" }}
      >
        <Show when={showLeft()}>
          <div class="grid min-h-0 min-w-0 gap-4">
            <Show when={activeSegment() === "health"}>
              <HealthView
                diagnostics={diagnostics}
                healthWindowDays={healthWindowDays()}
                onSelectWindow={(windowDays) => {
                  setHealthWindowDays(windowDays);
                  requestDiagnostics(windowDays);
                }}
                onRefresh={() => requestDiagnostics()}
              />
            </Show>
            <Show when={activeSegment() === "jobs"}>
              <LeftPaneListSection title="Jobs" count={`${jobs().length} total`} class="min-w-0 border-0 bg-transparent p-0">
                <CapacityBar jobs={jobs()} />
                <VirtualList
                  class="min-h-0 flex-1 pr-2"
                  contentClass="w-full"
                  itemClass="pb-3"
                  items={jobs()}
                  getKey={(job) => job.id}
                  estimateSize={210}
                  pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
                      empty={
                    <EmptyFilteredState
                      message="No scheduled tasks match current search or filters."
                      onClear={() => harnessStore.setJobsPanePreferences({ jobSearch: "", kind: undefined, status: undefined, jobState: "all", risk: undefined })}
                      actions={
                        <>
                          <ActionButton
                            tooltip={tooltipWithPrimaryHotkey(
                              "Schedule AI job",
                              normalizeAppHotkeyPreferences(state.appHotkeyPreferences).createBackgroundJob[0]
                            )}
                            ariaLabel="Schedule job"
                            size="sm"
                            icon={<Bot class="h-3.5 w-3.5" />}
                            onClick={() => handleCreateJob("ai-routine")}
                          >
                            Schedule job
                          </ActionButton>
                          <ActionButton tooltip="Run shell job" size="sm" variant="secondary" icon={<Terminal class="h-3.5 w-3.5" />} onClick={() => handleCreateJob("shell")}>
                            Run shell job
                          </ActionButton>
                        </>
                      }
                    />
                  }
                >
                  {(job) => (
                    <article
                      class="min-w-0 cursor-pointer rounded-[0.8rem] border border-l-4 p-3 shadow-sm transition hover:border-(--accent-strong)"
                      classList={{
                        "border-(--accent)": selectedJob()?.id === job.id,
                        "border-l-(--accent-strong)": selectedJob()?.id === job.id,
                        "bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(255,255,255,0.92))]": selectedJob()?.id === job.id,
                        "border-(--border)": selectedJob()?.id !== job.id,
                        "border-l-emerald-500": selectedJob()?.id !== job.id && job.status === "enabled",
                        "border-l-slate-300": selectedJob()?.id !== job.id && job.status !== "enabled",
                        "bg-white/70": selectedJob()?.id !== job.id
                      }}
                      onClick={() => openJobDetails(job)}
                    >
                      <div class="flex items-start justify-between gap-3">
                        <button type="button" class="min-w-0 flex-1 text-left cursor-pointer" aria-label={`Select ${job.name}`} onClick={() => openJobDetails(job)}>
                          <span class="break-words text-[0.75rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">{job.name}</span>
                        </button>
                        <span class={`shrink-0 rounded-full px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] ${jobStatusBadgeClass(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <div class="flex gap-0.25">
                        <Show when={job.assistantId}>
                          {(assistantId) => (
                            <ActionButton
                              tooltip="Open owning assistant"
                              icon={<Bot class="h-3 w-3" />}
                              size="icon"
                              variant="ghost"
                              ariaLabel={`Open assistant for ${job.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openAssistantDetails(assistantId());
                              }}
                            />
                          )}
                        </Show>
                        <ActionButton tooltip="Run task now" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<Play class="h-3 w-3" />} size="icon" variant="ghost" ariaLabel={`Run ${job.name} now`} onClick={(event) => { event.stopPropagation(); sendCommand({ type: "background-job.run-now", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } }); }} />
                        <ActionButton tooltip={job.status === "enabled" ? "Pause task" : "Resume task"} icon={job.status === "enabled" ? <Pause class="h-3 w-3" /> : <Play class="h-3 w-3" />} size="icon" variant="ghost" ariaLabel={job.status === "enabled" ? `Pause ${job.name}` : `Resume ${job.name}`} onClick={(event) => { event.stopPropagation(); sendCommand({ type: job.status === "enabled" ? "background-job.pause" : "background-job.resume", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } }); }} />
                        <ActionButton tooltip="Edit task" icon={<RefreshCcw class="h-3 w-3" />} size="icon" variant="ghost" ariaLabel={`Edit ${job.name}`} onClick={(event) => { event.stopPropagation(); handleEditJob(job); }} />
                        <ActionButton tooltip="Delete task" icon={<Trash2 class="h-3 w-3" />} size="icon" variant="ghost" ariaLabel={`Delete ${job.name}`} onClick={(event) => { event.stopPropagation(); sendCommand({ type: "background-job.delete", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } }); }} />
                      </div>
                      <div class="mt-3 break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">
                        <div class="mt-1 text-[0.625rem] uppercase tracking-[0.14em] text-(--muted)">{job.kind} | {job.riskLevel} | {job.lane ?? "exclusive"}</div>
                        <div>{job.description ?? job.scheduleInput}</div>
                        <div class="mt-1">Next: {formatJobNextRun(job, state.backgroundJobs.runs, state.backgroundJobs.schedulerHeartbeatAt)}</div>
                        <Show when={formatFailureTrackingLine(job)}>{(line) => <div>{line()}</div>}</Show>
                        <For each={formatJobSchedulerLines(job, state.backgroundJobs.runs, state.backgroundJobs.schedulerHeartbeatAt)}>{(line) => <div>{line}</div>}</For>
                        <div>Project: {state.workspace.projects.find((project) => project.id === job.projectId)?.name ?? job.projectId}</div>
                        <div>Owner: {formatJobOwner(job, state)}</div>
                      </div>
                    </article>
                  )}
                </VirtualList>
              </LeftPaneListSection>
            </Show>

            <Show when={activeSegment() === "inbox"}>
              <LeftPaneListSection title="Runs" count={`${runListItems().length} total`} class="min-w-0 border-0 bg-transparent p-0">
                <VirtualList
                  class="min-h-0 flex-1 pr-2"
                  contentClass="w-full"
                  itemClass="pb-3"
                  items={runListItems()}
                  getKey={(item) => (item.kind === "project-chat" ? `project-chat:${item.entry.project.id}:${item.entry.run.id}` : `background:${item.run.id}`)}
                  estimateSize={135}
                  pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
                  empty={<EmptyFilteredState message="Run history appears after first task. No runs match current search or filter." onClear={() => { harnessStore.setJobsPanePreferences({ runSearch: "" }); harnessStore.setJobsRunFilter("all"); }} />}
                >
                  {(item) => <RunListButton item={item} selectedRunId={selectedRun()?.id} onOpenRun={openRunDetails} onOpenProjectChatRun={openProjectChatRun} />}
                </VirtualList>
              </LeftPaneListSection>
            </Show>
          </div>
        </Show>

        <Show when={showDetail() && activeSegment() !== "health"}>
          <section class="flex min-h-0 min-w-0 flex-col p-4">
            <Show when={activeSegment() === "jobs" && !selectedRun()}>
              <JobDetail
                job={selectedJob()}
                runs={selectedJobRuns()}
                executionPaused={executionPaused()}
                executionPauseReason={executionPauseReason}
                onRunNow={(job) => sendCommand({ type: "background-job.run-now", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } })}
                onStopRun={(run) => sendCommand({ type: "background-job.stop-run", requestId: createRequestId(), payload: { projectId: run.projectId, runId: run.id } })}
                onEdit={handleEditJob}
                onOpenAssistant={openAssistantDetails}
                schedulerHeartbeatAt={state.backgroundJobs.schedulerHeartbeatAt}
              />
            </Show>
            <Show when={activeSegment() !== "jobs" || selectedRun()} fallback={null}>
              <Show when={selectedRun()} fallback={<DetailEmptyState>Select background run or job to inspect details.</DetailEmptyState>}>
                {(run) => (
                  <div class="flex h-full min-h-0 min-w-0 flex-col gap-4">
                    <div class="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-(--border) pb-4">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Run detail</div>
                          <span class={`rounded-full px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] ${runStatusBadgeClass(run().status)}`}>
                            {run().status}
                          </span>
                        </div>
                        <h2 class="mt-1 break-words text-[1.2rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">{selectedJob()?.name}</h2>
                        <div class="mt-3 grid gap-x-5 gap-y-1 border-l-2 border-(--border) pl-4 text-[0.675rem] leading-5 text-(--muted) sm:grid-cols-2 xl:grid-cols-3">
                          <RunFact label="Run">
                            <span class="min-w-0 break-all">{run().id}</span>
                            <CopyTextButton
                              value={run().id}
                              tooltip="Copy run id"
                              copiedDescription="Run id copied to clipboard."
                              ariaLabel="Copy run id"
                              size="sm"
                              variant="ghost"
                            />
                          </RunFact>
                          <RunFact label="Trigger">{run().triggerSource}</RunFact>
                          <RunFact label="Approval">{run().approvalStatus}</RunFact>
                          <Show when={formatRunProgress(run())}>
                            {(progress) => <RunFact label="Progress">{progress()}</RunFact>}
                          </Show>
                          <RunFact label="Summary">{run().summary ?? "n/a"}</RunFact>
                          <Show when={run().failureCategory}>
                            {(category) => <RunFact label="Failure category">{formatFailureCategory(category())}</RunFact>}
                          </Show>
                          <Show when={formatPromptStats(run().promptStats)}>
                            {(stats) => <RunFact label="Prompt">{stats()}</RunFact>}
                          </Show>
                          <Show when={run().failureMessage}><RunFact label="Failure">{run().failureMessage}</RunFact></Show>
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Show when={run().status === "awaiting-approval"}>
                          <ActionButton tooltip="Approve this background run" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<Play class="h-4 w-4" />} onClick={() => sendCommand({ type: "background-job.approve-run", requestId: createRequestId(), payload: { projectId: run().projectId, runId: run().id } })}>Approve</ActionButton>
                          <ActionButton tooltip="Reject this background run" variant="secondary" onClick={() => sendCommand({ type: "background-job.reject-run", requestId: createRequestId(), payload: { projectId: run().projectId, runId: run().id } })}>Reject</ActionButton>
                        </Show>
                        <Show when={run().status === "running"}>
                          <ActionButton tooltip="Stop this background run" variant="secondary" icon={<Pause class="h-4 w-4" />} onClick={() => sendCommand({ type: "background-job.stop-run", requestId: createRequestId(), payload: { projectId: run().projectId, runId: run().id } })}>Stop</ActionButton>
                        </Show>
                        <Show when={run().status === "failed" || run().status === "cancelled"}>
                          <ActionButton tooltip="Retry this background run" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<RefreshCcw class="h-4 w-4" />} onClick={() => sendCommand({ type: "background-job.retry-run", requestId: createRequestId(), payload: { projectId: run().projectId, runId: run().id } })}>Retry</ActionButton>
                        </Show>
                      </div>
                    </div>
                    <VirtualList
                      viewportRef={(element) => {
                        runDetailViewport = element;
                        scrollRunDetailToBottom();
                      }}
                      class="flex-1 min-h-0 pr-2"
                      contentClass="w-full"
                      itemClass="pb-3"
                      items={run().events}
                      getKey={(event) => event.id}
                      estimateSize={135}
                      pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
                      stickToEnd
                    >
                      {(event) => (
                        <article class={`min-w-0 border-l-2 py-3 pl-4 pr-2 ${runEventStageBorderClass(event.stage)}`}>
                          <div class="flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                            <span>{event.stage}</span>
                            <span>{formatShortTimestamp(event.createdAt)}</span>
                          </div>
                          <div class="mt-2 break-words text-[0.75rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">{event.message}</div>
                          <Show when={event.detail}><div class="mt-2 whitespace-pre-wrap break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">{event.detail}</div></Show>
                        </article>
                      )}
                    </VirtualList>
                  </div>
                )}
              </Show>
            </Show>
          </section>
        </Show>
      </div>
      <Show when={detailsRunId() && detailsRun()}>
          <Dialog
            open
            title={detailsJob()?.name ?? detailsRun()?.jobId ?? "Background run"}
            eyebrow="Execution details"
            description={detailsRun() ? `${detailsRun()!.status} | ${formatShortTimestamp(detailsRun()!.updatedAt)}` : undefined}
            class="max-w-3xl"
            contentClass="max-h-[80vh]"
            onClose={() => harnessStore.closeBackgroundJobDetailsDialog()}
          >
            <div class="flex min-h-0 flex-col gap-4">
              <div class="grid gap-1 text-[0.675rem] leading-5 text-(--muted)">
                <div class="flex flex-wrap items-center gap-2">
                  <span>Run: {detailsRun()?.id}</span>
                  <Show when={detailsRun()?.id}>
                    {(runId) => (
                      <CopyTextButton
                        value={runId()}
                        tooltip="Copy run id"
                        copiedDescription="Run id copied to clipboard."
                        ariaLabel="Copy run id"
                        size="sm"
                        variant="ghost"
                      />
                    )}
                  </Show>
                </div>
                <div>Trigger: {detailsRun()?.triggerSource}</div>
                <div>Approval: {detailsRun()?.approvalStatus}</div>
                <Show when={detailsRun()?.summary}><div>Summary: {detailsRun()?.summary}</div></Show>
                <Show when={detailsRun()?.failureCategory}>
                  {(category) => <div>Failure category: {formatFailureCategory(category())}</div>}
                </Show>
                <Show when={formatPromptStats(detailsRun()?.promptStats)}>
                  {(stats) => <div>Prompt: {stats()}</div>}
                </Show>
                <Show when={detailsRun()?.failureMessage}><div>Failure: {detailsRun()?.failureMessage}</div></Show>
              </div>
              <ExecutionLog entries={detailsLogEntries()} emptyMessage="No execution log yet." />
            </div>
          </Dialog>
      </Show>
    </LeftPaneShell>
  );
}

function RunFact(props: { label: string; children: JSX.Element }) {
  return (
    <div class="min-w-0 break-words [overflow-wrap:anywhere]">
      <span class="font-semibold text-(--foreground)">{props.label}: </span>
      <span>{props.children}</span>
    </div>
  );
}

function RunListButton(props: {
  item: RunListItem;
  selectedRunId?: string;
  onOpenRun: (run: BackgroundJobRun) => void;
  onOpenProjectChatRun: (projectId: string, threadId: string) => void;
}) {
  const selected = createMemo(() => props.item.kind === "background" && props.selectedRunId === props.item.run.id);
  return (
    <button
      class="min-w-0 w-full rounded-[0.8rem] border border-l-4 p-3 text-left shadow-sm transition hover:border-(--accent-strong)"
      classList={{
        "border-(--accent)": selected(),
        "border-l-(--accent-strong)": selected(),
        "bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(255,255,255,0.92))]": selected(),
        "border-(--border)": !selected(),
        [runListItemBorderClass(props.item)]: !selected(),
        "bg-white/70": !selected()
      }}
      type="button"
      onClick={() =>
        props.item.kind === "project-chat"
          ? props.onOpenProjectChatRun(props.item.entry.project.id, props.item.entry.run.threadId)
          : props.onOpenRun(props.item.run)
      }
    >
      <div class="flex min-w-0 items-center justify-between gap-3">
        <div class="min-w-0 truncate text-[0.725rem] font-semibold text-(--foreground)">{formatRunListItemTitle(props.item)}</div>
        <div class={`shrink-0 rounded-full px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] ${runListItemBadgeClass(props.item)}`}>
          {runListItemStatus(props.item)}
        </div>
      </div>
      <div class="mt-2 break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">
        <div class="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">{formatRunListItemSummary(props.item)}</div>
        <Show when={props.item.kind === "background" && formatRunProgress((props.item as { kind: "background"; run: BackgroundJobRun }).run)}>
          {(progress) => <div class="truncate">{progress()}</div>}
        </Show>
        <div class="mt-1 truncate">{formatRunListItemTime(props.item)}</div>
      </div>
    </button>
  );
}

function HealthView(props: {
  diagnostics: () => RunDiagnosticsViewState;
  healthWindowDays: RunDiagnosticsWindowDays;
  onSelectWindow: (windowDays: RunDiagnosticsWindowDays) => void;
  onRefresh: () => void;
}) {
  const assistantLabel = (assistantId?: string) => {
    if (!assistantId) {
      return "Unowned";
    }
    return harnessStore.state.assistants.assistants.find((assistant) => assistant.id === assistantId)?.name ?? assistantId;
  };

  return (
    <section class="flex min-h-0 flex-col gap-4 rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <For each={[1, 7, 30] as const}>
            {(windowDays) => (
              <Tooltip content={`Inspect the last ${windowDays === 1 ? "24 hours" : `${windowDays} days`}`}>
                <button
                  type="button"
                  class="rounded-full px-3 py-1.5 text-[0.675rem] font-semibold"
                  classList={{
                    "bg-(--accent)": props.healthWindowDays === windowDays,
                    "text-white": props.healthWindowDays === windowDays,
                    "border": props.healthWindowDays !== windowDays,
                    "border-(--border)": props.healthWindowDays !== windowDays,
                    "bg-white/70": props.healthWindowDays !== windowDays,
                    "text-(--foreground)": props.healthWindowDays !== windowDays
                  }}
                  onClick={() => props.onSelectWindow(windowDays)}
                >
                  {windowDays === 1 ? "24h" : `${windowDays}d`}
                </button>
              </Tooltip>
            )}
          </For>
        </div>
        <ActionButton
          tooltip={props.diagnostics().loading ? "Refreshing diagnostics" : "Refresh diagnostics"}
          disabled={props.diagnostics().loading}
          disabledReason={props.diagnostics().loading ? "Diagnostics request already in flight" : undefined}
          icon={<RefreshCcw class="h-4 w-4" />}
          variant="secondary"
          onClick={props.onRefresh}
        >
          Refresh
        </ActionButton>
      </div>

      <Show
        when={props.diagnostics().report}
        fallback={
          <div class="rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-4 text-[0.675rem] leading-5 text-(--muted)">
            {props.diagnostics().loading ? "Loading diagnostics..." : "Open Health to inspect recent reliability."}
          </div>
        }
      >
        {(report) => (
          <ScrollArea class="min-h-0 flex-1 pr-2">
            <div class="space-y-6">
              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <For each={buildHealthSummaryRows(report())}>
                  {(row) => (
                    <div class="rounded-[1.05rem] border border-(--border) bg-white/70 p-3">
                      <div class="text-[0.575rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{row.label}</div>
                      <div class="mt-2 text-[1.1rem] font-semibold tracking-[-0.04em] text-(--foreground)">{row.value}</div>
                    </div>
                  )}
                </For>
              </div>

              <HealthTable
                title="Backoff"
                emptyMessage="No enabled jobs are currently backoff-blocked."
                headers={["Job", "Assistant", "Streak", "Backoff until", "Last failure"]}
                rows={report().activeBackoffJobRows.map((row) => [
                  row.jobName,
                  assistantLabel(row.assistantId),
                  String(row.consecutiveFailureCount),
                  formatShortTimestamp(row.backoffUntil),
                  row.lastFailureCategory ? formatFailureCategory(row.lastFailureCategory) : "n/a"
                ])}
              />

              <HealthTable
                title="Failure Breakdown"
                emptyMessage="No classified failures in this window."
                headers={["Source", "Category", "Count", "Share", "Owner"]}
                rows={report().failureBreakdown.map((row) => [
                  row.sourceType,
                  formatFailureCategory(row.failureCategory),
                  String(row.count),
                  formatShare(row.share),
                  row.jobId ?? row.assistantId ?? "n/a"
                ])}
              />

              <div class="grid gap-4 xl:grid-cols-2">
                <HealthTable
                  title="Repeated Prompt Hashes"
                  emptyMessage="No repeated prompt hashes in this window."
                  headers={["Source", "Hash", "Runs", "Avg chars", "Owner", "Latest"]}
                  rows={report().topPromptHashes.map((row) => [
                    row.sourceType,
                    row.promptHash,
                    String(row.runCount),
                    String(row.averagePromptChars),
                    row.jobId ?? row.assistantId ?? "n/a",
                    formatShortTimestamp(row.latestSeenAt)
                  ])}
                />
                <HealthTable
                  title="Prompt Size By Owner"
                  emptyMessage="No prompt-size owner rows in this window."
                  headers={["Owner", "Runs", "Avg chars", "Latest"]}
                  rows={report().promptSizeByOwner.map((row) => [
                    row.jobId ?? row.assistantId ?? "n/a",
                    String(row.runCount),
                    String(row.averagePromptChars),
                    formatShortTimestamp(row.latestSeenAt)
                  ])}
                />
              </div>

              <HealthTable
                title="Daily Failure Series"
                emptyMessage="No daily failure rows in this window."
                headers={["Day", "Source", "Category", "Count", "Job"]}
                rows={report().dailyFailureSeries.map((row) => [
                  row.day,
                  row.sourceType,
                  formatFailureCategory(row.failureCategory),
                  String(row.count),
                  row.jobId ?? "n/a"
                ])}
              />
            </div>
          </ScrollArea>
        )}
      </Show>
    </section>
  );
}

function HealthTable(props: {
  title: string;
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  return (
    <section>
      <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
      <Show
        when={props.rows.length > 0}
        fallback={<div class="rounded-[1rem] border border-dashed border-(--border) bg-white/45 p-3 text-[0.675rem] text-(--muted)">{props.emptyMessage}</div>}
      >
        <div class="overflow-hidden rounded-[1rem] border border-(--border) bg-white/70">
          <div class={`grid gap-2 border-b border-(--border) px-3 py-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted) ${healthTableColumns(props.headers.length)}`}>
            <For each={props.headers}>{(header) => <div>{header}</div>}</For>
          </div>
          <div class="divide-y divide-(--border)">
            <For each={props.rows}>
              {(row) => (
                <div class={`grid gap-2 px-3 py-2 text-[0.675rem] leading-5 text-(--foreground) ${healthTableColumns(row.length)}`}>
                  <For each={row}>{(cell) => <div class="truncate">{cell}</div>}</For>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </section>
  );
}

function jobsPaneMenuItems(
  state: typeof harnessStore.state,
  segment: "jobs" | "inbox" | "health",
  allowSegmentSwitch: boolean
): LeftPaneSearchMenuItem[] {
  const preferences = state.jobsPanePreferences;
  const setPreferences = harnessStore.setJobsPanePreferences;
  const jobSortOption = (label: string, value: JobsPaneJobSort, icon: JSX.Element): LeftPaneSearchMenuItem => ({
    kind: "option",
    label,
    icon,
    selected: preferences.jobSort === value,
    onSelect: () => setPreferences({ jobSort: value })
  });
  const runSortOption = (label: string, value: JobsPaneRunSort, icon: JSX.Element): LeftPaneSearchMenuItem => ({
    kind: "option",
    label,
    icon,
    selected: (preferences.runSort ?? "urgency") === value,
    onSelect: () => setPreferences({ runSort: value })
  });
  const segmentItems: LeftPaneSearchMenuItem[] = allowSegmentSwitch
    ? [
        {
          kind: "submenu",
          label: "View",
          value: segment === "jobs" ? "Jobs" : segment === "inbox" ? "Runs" : "Health",
          icon: <BriefcaseBusiness class="h-3.5 w-3.5" />,
          items: [
            {
              kind: "option",
              label: "Jobs",
              icon: <BriefcaseBusiness class="h-3.5 w-3.5" />,
              selected: segment === "jobs",
              onSelect: () => setPreferences({ segment: "jobs" })
            },
            {
              kind: "option",
              label: "Runs",
              icon: <Clock3 class="h-3.5 w-3.5" />,
              selected: segment === "inbox",
              onSelect: () => setPreferences({ segment: "inbox" })
            },
            {
              kind: "option",
              label: "Health",
              icon: <ShieldCheck class="h-3.5 w-3.5" />,
              selected: segment === "health",
              onSelect: () => setPreferences({ segment: "health" })
            }
          ]
        }
      ]
    : [];

  if (segment === "jobs") {
    return [
      ...segmentItems,
      {
        kind: "submenu",
        label: "Sort jobs",
        value: formatJobSortLabel(preferences.jobSort),
        icon: <Clock3 class="h-3.5 w-3.5" />,
        items: [
          jobSortOption("Next run", "next-run", <Clock3 class="h-3.5 w-3.5" />),
          jobSortOption("Updated", "updated", <Calendar class="h-3.5 w-3.5" />),
          jobSortOption("Created", "created", <Calendar class="h-3.5 w-3.5" />),
          jobSortOption("Status", "status", <ListFilter class="h-3.5 w-3.5" />),
          jobSortOption("Risk", "risk", <ShieldCheck class="h-3.5 w-3.5" />)
        ] as Array<Extract<LeftPaneSearchMenuItem, { kind: "option" }>>
      },
      {
        kind: "submenu",
        label: "Kind",
        value: preferences.kind === "ai-routine" ? "AI" : preferences.kind === "shell" ? "Shell" : "All",
        icon: <ListFilter class="h-3.5 w-3.5" />,
        active: Boolean(preferences.kind),
        items: [
          {
            kind: "option",
            label: "All kinds",
            icon: <ListFilter class="h-3.5 w-3.5" />,
            selected: !preferences.kind,
            onSelect: () => setPreferences({ kind: undefined })
          },
          {
            kind: "option",
            label: "AI routine",
            icon: <Bot class="h-3.5 w-3.5" />,
            selected: preferences.kind === "ai-routine",
            active: preferences.kind === "ai-routine",
            onSelect: () => setPreferences({ kind: "ai-routine" })
          },
          {
            kind: "option",
            label: "Shell",
            icon: <Terminal class="h-3.5 w-3.5" />,
            selected: preferences.kind === "shell",
            active: preferences.kind === "shell",
            onSelect: () => setPreferences({ kind: "shell" })
          }
        ]
      },
      {
        kind: "submenu",
        label: "Status",
        value: preferences.status ? toProperCase(preferences.status) : "All",
        icon: <Pause class="h-3.5 w-3.5" />,
        active: Boolean(preferences.status),
        items: [
          {
            kind: "option",
            label: "All statuses",
            icon: <ListFilter class="h-3.5 w-3.5" />,
            selected: !preferences.status,
            onSelect: () => setPreferences({ status: undefined })
          },
          ...(["enabled", "paused", "disabled"] as const).map((status) => ({
            kind: "option" as const,
            label: toProperCase(status),
            icon: <Pause class="h-3.5 w-3.5" />,
            selected: preferences.status === status,
            active: preferences.status === status,
            onSelect: () => setPreferences({ status })
          }))
        ]
      },
      {
        kind: "submenu",
        label: "Job state",
        value: jobStateFilterLabel(preferences.jobState ?? "all"),
        icon: <ShieldCheck class="h-3.5 w-3.5" />,
        active: (preferences.jobState ?? "all") !== "all",
        items: (["all", "idle", "due", "queued", "blocked", "running", "stale", "backoff"] satisfies JobsJobStateFilter[]).map((jobState) => ({
          kind: "option" as const,
          label: jobStateFilterLabel(jobState),
          icon: jobStateFilterIcon(jobState),
          selected: (preferences.jobState ?? "all") === jobState,
          active: jobState !== "all" && (preferences.jobState ?? "all") === jobState,
          onSelect: () => setPreferences({ jobState })
        }))
      },
      {
        kind: "submenu",
        label: "Risk",
        value: preferences.risk ? toProperCase(preferences.risk) : "All",
        icon: <ShieldCheck class="h-3.5 w-3.5" />,
        active: Boolean(preferences.risk),
        items: [
          {
            kind: "option",
            label: "All risk",
            icon: <ListFilter class="h-3.5 w-3.5" />,
            selected: !preferences.risk,
            onSelect: () => setPreferences({ risk: undefined })
          },
          ...(["safe", "slightly-unsafe", "unsafe"] as const).map((risk) => ({
            kind: "option" as const,
            label: toProperCase(risk),
            icon: <ShieldCheck class="h-3.5 w-3.5" />,
            selected: preferences.risk === risk,
            active: preferences.risk === risk,
            onSelect: () => setPreferences({ risk })
          }))
        ]
      },
      { kind: "separator" },
      {
        kind: "option",
        label: "Clear search and filters",
        icon: <Trash2 class="h-3.5 w-3.5" />,
        onSelect: () => setPreferences({ jobSearch: "", kind: undefined, status: undefined, jobState: "all", risk: undefined })
      }
    ];
  }

  return [
    ...segmentItems,
    {
      kind: "submenu",
      label: "Sort runs",
      value: formatRunSortLabel(preferences.runSort ?? "urgency"),
      icon: <Clock3 class="h-3.5 w-3.5" />,
      items: [
        runSortOption("Urgency", "urgency", <ShieldCheck class="h-3.5 w-3.5" />),
        runSortOption("Updated", "updated", <Calendar class="h-3.5 w-3.5" />),
        runSortOption("Queued", "queued", <Clock3 class="h-3.5 w-3.5" />),
        runSortOption("Status", "status", <ListFilter class="h-3.5 w-3.5" />)
      ] as Array<Extract<LeftPaneSearchMenuItem, { kind: "option" }>>
    },
    {
      kind: "submenu",
      label: "Run state",
      value: runFilterLabel(state.jobsRunFilter),
      icon: <ShieldCheck class="h-3.5 w-3.5" />,
      active: state.jobsRunFilter !== "all",
      items: (["all", "approval", "queued", "running", "failed", "done"] satisfies JobsRunFilter[]).map((filter) => ({
        kind: "option" as const,
        label: runFilterLabel(filter),
        icon: runFilterIcon(filter),
        selected: state.jobsRunFilter === filter,
        active: filter !== "all" && state.jobsRunFilter === filter,
        onSelect: () => harnessStore.setJobsRunFilter(filter)
      }))
    },
    { kind: "separator" },
    {
      kind: "option",
      label: "Clear search and filters",
      icon: <Trash2 class="h-3.5 w-3.5" />,
      onSelect: () => {
        setPreferences({ runSearch: "" });
        harnessStore.setJobsRunFilter("all");
      }
    }
  ];
}

function activeJobsPaneFilterCount(state: typeof harnessStore.state, segment: "jobs" | "inbox" | "health") {
  if (segment === "jobs") {
    return [
      state.jobsPanePreferences.kind,
      state.jobsPanePreferences.status,
      state.jobsPanePreferences.jobState && state.jobsPanePreferences.jobState !== "all" ? state.jobsPanePreferences.jobState : undefined,
      state.jobsPanePreferences.risk
    ].filter(Boolean).length;
  }
  if (segment === "inbox") {
    return state.jobsRunFilter === "all" ? 0 : 1;
  }
  return 0;
}

function formatJobSortLabel(sort: JobsPaneJobSort) {
  if (sort === "next-run") {
    return "Next run";
  }
  if (sort === "created") {
    return "Created";
  }
  if (sort === "status") {
    return "Status";
  }
  if (sort === "risk") {
    return "Risk";
  }
  return "Updated";
}

function formatRunSortLabel(sort: JobsPaneRunSort) {
  if (sort === "queued") {
    return "Queued";
  }
  if (sort === "updated") {
    return "Updated";
  }
  if (sort === "status") {
    return "Status";
  }
  return "Urgency";
}

function EmptyFilteredState(props: { message: string; onClear: () => void; actions?: JSX.Element }) {
  return (
    <LeftPaneEmptyState>
      <div>{props.message}</div>
      <Show when={props.actions}>
        <div class="mt-3 flex flex-wrap gap-2">{props.actions}</div>
      </Show>
      <div class="mt-3">
        <ActionButton tooltip="Clear search and filters" size="sm" variant="ghost" onClick={props.onClear}>
          Clear
        </ActionButton>
      </div>
    </LeftPaneEmptyState>
  );
}

function buildHealthSummaryRows(report: NonNullable<RunDiagnosticsViewState["report"]>) {
  return [
    { label: "Active backoff jobs", value: String(report.summary.activeBackoffJobs) },
    { label: "Background failures", value: String(report.summary.backgroundFailureCount) },
    { label: "Lifecycle-failure share", value: formatShare(report.summary.lifecycleFailureShare) },
    { label: "Agent empty responses", value: String(report.summary.agentEmptyResponseCount) },
    { label: "Question conflicts", value: String(report.summary.questionPersistConflictCount) },
    {
      label: "Dominant background failure",
      value: report.summary.dominantBackgroundFailureCategory ? formatFailureCategory(report.summary.dominantBackgroundFailureCategory) : "n/a"
    }
  ];
}

function healthTableColumns(columnCount: number) {
  switch (columnCount) {
    case 3:
      return "md:grid-cols-3";
    case 4:
      return "md:grid-cols-4";
    case 5:
      return "md:grid-cols-5";
    case 6:
      return "md:grid-cols-6";
    default:
      return "md:grid-cols-3";
  }
}

function formatShare(value: number) {
  return `${Math.round(value * 100)}%`;
}

function matchesRunFilter(run: BackgroundJobRun, filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return true;
    case "approval":
      return run.status === "awaiting-approval" || run.status === "awaiting-user-input" || run.approvalStatus === "pending";
    case "queued":
      return run.status === "queued";
    case "running":
      return run.status === "running";
    case "failed":
      return run.status === "failed" || run.status === "cancelled";
    case "done":
      return run.status === "succeeded" || run.status === "partial-complete" || run.status === "skipped";
  }
}

function matchesProjectChatRunFilter(run: AgentRunState, filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return true;
    case "approval":
      return run.status === "awaiting-user-input";
    case "queued":
      return run.status === "planning" || run.status === "ready";
    case "running":
      return isRunningProjectChatRunStatus(run.status);
    case "failed":
      return run.status === "failed" || run.status === "stopped";
    case "done":
      return run.status === "completed" || run.status === "partial-complete";
  }
}

function matchesJobFilters(job: BackgroundJob, state: typeof harnessStore.state) {
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
  if (preferences.jobState && preferences.jobState !== "all" && !matchesJobStateFilter(job, preferences.jobState)) {
    return false;
  }
  if (preferences.risk && job.riskLevel !== preferences.risk) {
    return false;
  }
  return true;
}

function matchesJobStateFilter(job: BackgroundJob, filter: Exclude<JobsJobStateFilter, "all">) {
  if (filter === "backoff") {
    return Boolean(job.backoffUntil);
  }
  return job.schedulerStatus === filter;
}

function compareJobs(left: BackgroundJob, right: BackgroundJob, sort: JobsPaneJobSort) {
  if (sort === "updated") {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "created") {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if (sort === "status") {
    return left.status.localeCompare(right.status) || right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "risk") {
    return riskRank(right.riskLevel) - riskRank(left.riskLevel) || right.updatedAt.localeCompare(left.updatedAt);
  }
  return compareOptionalIsoAsc(resolveJobNextRunAt(left), resolveJobNextRunAt(right)) || right.updatedAt.localeCompare(left.updatedAt);
}

function compareRuns(left: BackgroundJobRun, right: BackgroundJobRun, sort: JobsPaneRunSort) {
  if (sort === "updated") {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "queued") {
    return right.queuedAt.localeCompare(left.queuedAt);
  }
  if (sort === "status") {
    return left.status.localeCompare(right.status) || right.updatedAt.localeCompare(left.updatedAt);
  }
  return compareRunsByUrgency(left, right);
}

function compareRunListItems(left: RunListItem, right: RunListItem, sort: JobsPaneRunSort) {
  if (sort === "updated") {
    return runListItemUpdatedAt(right).localeCompare(runListItemUpdatedAt(left));
  }
  if (sort === "queued") {
    return runListItemQueuedAt(right).localeCompare(runListItemQueuedAt(left));
  }
  if (sort === "status") {
    return runListItemStatus(left).localeCompare(runListItemStatus(right)) || runListItemUpdatedAt(right).localeCompare(runListItemUpdatedAt(left));
  }
  return compareRunListItemsByUrgency(left, right);
}

function compareRunsByUrgency(left: BackgroundJobRun, right: BackgroundJobRun) {
  return runUrgencyRank(left) - runUrgencyRank(right) || right.updatedAt.localeCompare(left.updatedAt);
}

function compareRunListItemsByUrgency(left: RunListItem, right: RunListItem) {
  return runListItemUrgencyRank(left) - runListItemUrgencyRank(right) || runListItemUpdatedAt(right).localeCompare(runListItemUpdatedAt(left));
}

function runUrgencyRank(run: BackgroundJobRun) {
  if (run.status === "awaiting-user-input" || run.status === "awaiting-approval" || run.approvalStatus === "pending") {
    return 0;
  }
  if (run.status === "running") {
    return 1;
  }
  if (run.status === "failed" || run.status === "cancelled") {
    return 2;
  }
  if (run.status === "partial-complete") {
    return 3;
  }
  if (run.status === "queued") {
    return 4;
  }
  return 5;
}

function runListItemUrgencyRank(item: RunListItem) {
  if (item.kind === "background") {
    return runUrgencyRank(item.run);
  }
  if (item.entry.run.status === "awaiting-user-input") {
    return 0;
  }
  if (isRunningProjectChatRunStatus(item.entry.run.status)) {
    return 1;
  }
  if (item.entry.run.status === "failed" || item.entry.run.status === "stopped" || item.entry.run.status === "partial-complete") {
    return 2;
  }
  if (item.entry.run.status === "planning" || item.entry.run.status === "ready") {
    return 3;
  }
  return 4;
}

function isRunningProjectChatRunStatus(status: AgentRunState["status"]) {
  return status === "running-main" || status === "running-subagents" || status === "aggregating";
}

function runListItemStatus(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.status : item.run.status;
}

function runListItemUpdatedAt(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.updatedAt : item.run.updatedAt;
}

function runListItemQueuedAt(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.createdAt : item.run.queuedAt;
}

function riskRank(risk: BackgroundJob["riskLevel"]) {
  switch (risk) {
    case "unsafe":
      return 3;
    case "slightly-unsafe":
      return 2;
    case "safe":
      return 1;
  }
}

function compareOptionalIsoAsc(left?: string, right?: string) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function resolveJobNextRunAt(job: BackgroundJob) {
  if (job.nextRunAt) {
    return job.nextRunAt;
  }
  if (job.schedule.type === "interval" || job.schedule.type === "cron") {
    return job.schedule.nextRunAt;
  }
  return job.schedule.consumedAt ? undefined : job.schedule.runAt;
}

function CapacityBar(props: { jobs: BackgroundJob[] }) {
  const ratio = createMemo(() => Math.max(0, ...props.jobs.map((job) => job.schedulerCongestionRatio ?? 0)));
  const percent = createMemo(() => Math.round(ratio() * 100));
  const status = createMemo(() => {
    if (ratio() > 1) {
      return `Congested (${percent()}%) - Skipping runs`;
    }
    if (ratio() >= 0.8) {
      return `Tight (${percent()}%)`;
    }
    return `Healthy (${percent()}%)`;
  });
  const barClass = createMemo(() => {
    if (ratio() > 1) {
      return "bg-rose-500";
    }
    if (ratio() >= 0.8) {
      return "bg-amber-500";
    }
    return "bg-emerald-500";
  });
  return (
    <Tooltip content="Recurring tasks are taking longer than their frequency. Some runs will be skipped to prevent state corruption.">
      <div class="mb-3 border-l-2 border-(--border) px-3 py-2">
        <div class="flex items-center justify-between gap-3 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-(--muted)">
          <span>Capacity</span>
          <span>{status()}</span>
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-(--muted)/15">
          <div class={`h-full rounded-full ${barClass()}`} style={{ width: `${Math.min(100, percent())}%` }} />
        </div>
      </div>
    </Tooltip>
  );
}

function formatJobNextRun(job: BackgroundJob, runs: BackgroundJobRun[], schedulerHeartbeatAt?: string) {
  const activeRun = findActiveJobRun(job, runs);
  if (activeRun) {
    return `Blocked by active run: ${activeRun.status}`;
  }
  if (job.backoffUntil) {
    return `Backoff until ${formatShortTimestamp(job.backoffUntil)}`;
  }
  if (job.schedulerStatus === "blocked") {
    const queue = job.schedulerQueuePosition ? `Queue #${job.schedulerQueuePosition}: ` : "";
    return `${queue}Blocked: ${job.blockedReason ?? job.schedulerDetail ?? "scheduler is waiting"}`;
  }
  if (job.schedulerStatus === "due") {
    return "Due now";
  }
  if (job.schedulerStatus === "stale" || isJobStale(job, schedulerHeartbeatAt)) {
    const lastCheck = job.lastSchedulerCheckAt ? formatShortTimestamp(job.lastSchedulerCheckAt) : "unknown";
    return `Stale: scheduler has not checked since ${lastCheck}`;
  }
  if (job.schedulerStatus === "queued") {
    return job.schedulerDetail ?? "Queued";
  }
  if (job.schedulerStatus === "running") {
    return job.schedulerDetail ?? "Running";
  }
  return formatShortTimestamp(resolveJobNextRunAt(job));
}

function formatJobSchedulerLines(job: BackgroundJob, runs: BackgroundJobRun[], schedulerHeartbeatAt?: string) {
  const lines: string[] = [];
  const congested = job.schedulerCongested ?? job.schedulerOverloaded;
  if (congested) {
    lines.push(`Congested (${Math.round((job.schedulerCongestionRatio ?? 0) * 100)}%): scheduled work overlaps recent exclusive-lane runtime`);
  }
  if (job.schedulerQueueReason) {
    lines.push(job.schedulerQueueReason);
  }
  if (job.schedulerActiveRunId) {
    const run = runs.find((entry) => entry.id === job.schedulerActiveRunId);
    const startedAt = job.schedulerActiveRunStartedAt ?? run?.startedAt;
    const lastProgressAt = job.schedulerLastProgressAt ?? run?.lastHeartbeatAt ?? run?.updatedAt;
    lines.push(`Active run: ${job.schedulerActiveRunId}`);
    if (startedAt) {
      lines.push(`Active since: ${formatShortTimestamp(startedAt)}`);
    }
    if (lastProgressAt) {
      lines.push(`Last progress: ${formatShortTimestamp(lastProgressAt)}`);
    }
  } else if (job.schedulerLastProgressAt) {
    lines.push(`Last progress: ${formatShortTimestamp(job.schedulerLastProgressAt)}`);
  }
  if (job.schedulerStatus === "stale" || isJobStale(job, schedulerHeartbeatAt)) {
    const lastCheck = job.lastSchedulerCheckAt ? formatShortTimestamp(job.lastSchedulerCheckAt) : "unknown";
    lines.push(`Stale: scheduler has not checked since ${lastCheck}`);
  }
  if (job.schedulerBlockedSinceAt) {
    lines.push(`Blocked since: ${formatShortTimestamp(job.schedulerBlockedSinceAt)}`);
  }
  return lines;
}

function formatSchedulerHeartbeatWarning(schedulerHeartbeatAt?: string) {
  if (!isSchedulerHeartbeatStale(schedulerHeartbeatAt)) {
    return undefined;
  }
  return `Stale: scheduler has not checked since ${schedulerHeartbeatAt ? formatShortTimestamp(schedulerHeartbeatAt) : "unknown"}`;
}

function isJobStale(job: BackgroundJob, schedulerHeartbeatAt?: string) {
  return isSchedulerHeartbeatStale(schedulerHeartbeatAt) && Boolean(job.lastSchedulerCheckAt) && isJobDueByClock(job);
}

function isSchedulerHeartbeatStale(schedulerHeartbeatAt?: string) {
  if (!schedulerHeartbeatAt) {
    return false;
  }
  const timestamp = Date.parse(schedulerHeartbeatAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp > 60_000;
}

function isJobDueByClock(job: BackgroundJob) {
  const nextRunAt = resolveJobNextRunAt(job);
  if (!nextRunAt || job.status !== "enabled") {
    return false;
  }
  const timestamp = Date.parse(nextRunAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function findActiveJobRun(job: BackgroundJob, runs: BackgroundJobRun[]) {
  return runs.find((run) => run.jobId === job.id && isActiveBackgroundRunStatus(run.status));
}

function isActiveBackgroundRunStatus(status: BackgroundJobRun["status"]) {
  return status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running";
}

function collectActiveProjectRuns(project: typeof harnessStore.state.workspace.projects[number]) {
  const runsById = new Map<string, AgentRunState>();
  for (const run of [project.activeRun, ...Object.values(project.threadLiveTranscriptById).map((entry) => entry.activeRun)]) {
    if (run && isActiveProjectRunStatus(run.status)) {
      runsById.set(run.id, run);
    }
  }
  return [...runsById.values()];
}

function isActiveProjectRunStatus(status: AgentRunState["status"]) {
  return status !== "completed";
}

function fuzzyMatches(haystack: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const normalized = haystack.toLowerCase();
  return tokens.every((token) => normalized.includes(token) || fuzzyTokenMatch(normalized, token));
}

function fuzzyTokenMatch(haystack: string, token: string) {
  let cursor = 0;
  for (const char of token) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor < 0) {
      return false;
    }
    cursor += 1;
  }
  return true;
}

function jobSearchHaystack(job: BackgroundJob, state: typeof harnessStore.state) {
  const project = state.workspace.projects.find((entry) => entry.id === job.projectId);
  const assistant = state.assistants.assistants.find((entry) => entry.id === job.assistantId);
  const prompt = job.definition.kind === "ai-routine" ? job.definition.prompt : [job.definition.executable, ...job.definition.args].join(" ");
  return [
    job.name,
    job.description,
    job.scheduleInput,
    job.status,
    job.kind,
    job.riskLevel,
    prompt,
    project?.name,
    project?.rootPath,
    assistant?.name
  ]
    .filter(Boolean)
    .join(" ");
}

function formatJobOwner(job: BackgroundJob, state: typeof harnessStore.state) {
  if (!job.assistantId) {
    return "Unowned";
  }
  return state.assistants.assistants.find((assistant) => assistant.id === job.assistantId)?.name ?? job.assistantId;
}

function runSearchHaystack(run: BackgroundJobRun, state: typeof harnessStore.state) {
  const job = state.backgroundJobs.jobs.find((entry) => entry.id === run.jobId);
  return [
    job?.name,
    run.status,
    run.failureCategory,
    run.approvalStatus,
    run.triggerSource,
    run.summary,
    run.failureMessage,
    ...run.events.flatMap((event) => [event.stage, event.message, event.detail])
  ]
    .filter(Boolean)
    .join(" ");
}

function projectChatRunSearchHaystack(entry: {
  project: typeof harnessStore.state.workspace.projects[number];
  thread: typeof harnessStore.state.workspace.projects[number]["threads"][number] | undefined;
  run: AgentRunState;
}) {
  return [entry.project.name, entry.project.rootPath, entry.thread?.title, entry.run.status, entry.run.latestUserPrompt, entry.run.summary]
    .filter(Boolean)
    .join(" ");
}

function formatRunListItemTitle(item: RunListItem) {
  if (item.kind === "project-chat") {
    return `${item.entry.project.name} / ${item.entry.thread?.title ?? item.entry.run.threadId}`;
  }
  return harnessStore.state.backgroundJobs.jobs.find((job) => job.id === item.run.jobId)?.name ?? item.run.jobId;
}

function formatRunListItemSummary(item: RunListItem) {
  if (item.kind === "project-chat") {
    return item.entry.run.failureMessage ?? item.entry.run.latestUserPrompt ?? item.entry.run.summary;
  }
  return formatRunSummary(item.run);
}

function formatRunListItemTime(item: RunListItem) {
  if (item.kind === "project-chat") {
    return `Updated: ${formatShortTimestamp(item.entry.run.updatedAt)}`;
  }
  return `Queued: ${formatShortTimestamp(item.run.queuedAt)}`;
}

function formatRunSummary(run: BackgroundJobRun) {
  return run.failureMessage ?? run.summary ?? latestRunEventDetail(run) ?? `${run.triggerSource} run`;
}

function formatRunProgress(run: BackgroundJobRun) {
  if (run.timedOutAt) {
    return `Timed out: ${formatShortTimestamp(run.timedOutAt)}`;
  }
  if (run.lastHeartbeatAt) {
    return `Last progress: ${formatShortTimestamp(run.lastHeartbeatAt)}${run.heartbeatStage ? ` (${run.heartbeatStage})` : ""}`;
  }
  return undefined;
}

function formatFailureCategory(value: string) {
  return value.replace(/-/g, " ");
}

function jobStatusBadgeClass(status: BackgroundJob["status"]) {
  if (status === "enabled") {
    return "bg-emerald-100 text-emerald-800";
  }
  return "bg-slate-200 text-slate-700";
}

function runStatusBadgeClass(status: BackgroundJobRun["status"]) {
  switch (status) {
    case "succeeded":
      return "bg-emerald-100 text-emerald-800";
    case "partial-complete":
      return "bg-amber-100 text-amber-900";
    case "failed":
    case "cancelled":
      return "bg-rose-100 text-rose-800";
    case "awaiting-approval":
    case "awaiting-user-input":
      return "bg-amber-100 text-amber-900";
    case "running":
      return "bg-sky-100 text-sky-800";
    case "queued":
      return "bg-slate-200 text-slate-700";
    case "skipped":
      return "bg-stone-200 text-stone-700";
  }
}

function runListItemBadgeClass(item: RunListItem) {
  if (item.kind === "background") {
    return runStatusBadgeClass(item.run.status);
  }
  switch (item.entry.run.status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800";
    case "partial-complete":
      return "bg-amber-100 text-amber-900";
    case "failed":
    case "stopped":
      return "bg-rose-100 text-rose-800";
    case "awaiting-user-input":
      return "bg-amber-100 text-amber-900";
    case "running-main":
    case "running-subagents":
    case "aggregating":
      return "bg-sky-100 text-sky-800";
    case "planning":
    case "ready":
      return "bg-slate-200 text-slate-700";
  }
}

function runStatusBorderClass(status: BackgroundJobRun["status"]) {
  switch (status) {
    case "succeeded":
      return "border-l-emerald-500";
    case "partial-complete":
      return "border-l-amber-400";
    case "failed":
    case "cancelled":
      return "border-l-rose-400";
    case "awaiting-approval":
    case "awaiting-user-input":
      return "border-l-amber-400";
    case "running":
      return "border-l-sky-400";
    case "queued":
      return "border-l-slate-300";
    case "skipped":
      return "border-l-stone-300";
  }
}

function runListItemBorderClass(item: RunListItem) {
  if (item.kind === "background") {
    return runStatusBorderClass(item.run.status);
  }
  switch (item.entry.run.status) {
    case "completed":
      return "border-l-emerald-500";
    case "partial-complete":
      return "border-l-amber-400";
    case "failed":
    case "stopped":
      return "border-l-rose-400";
    case "awaiting-user-input":
      return "border-l-amber-400";
    case "running-main":
    case "running-subagents":
    case "aggregating":
      return "border-l-sky-400";
    case "planning":
    case "ready":
      return "border-l-slate-300";
  }
}

function runEventStageBorderClass(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("cancel")) {
    return "border-rose-400";
  }
  if (normalized.includes("approval") || normalized.includes("input") || normalized.includes("warn")) {
    return "border-amber-400";
  }
  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("success")) {
    return "border-emerald-500";
  }
  if (normalized.includes("exec") || normalized.includes("run")) {
    return "border-sky-400";
  }
  return "border-(--border)";
}

function formatPromptStats(promptStats: BackgroundJobRun["promptStats"] | undefined) {
  if (!promptStats) {
    return undefined;
  }
  const transcript = promptStats.transcriptChars ? `, transcript ${promptStats.transcriptChars}c` : "";
  const latestTask = promptStats.latestTaskChars ? `, latest task ${promptStats.latestTaskChars}c` : "";
  return `${promptStats.promptChars} chars, hash ${promptStats.promptHash}${transcript}${latestTask}`;
}

function formatFailureTrackingLine(job: BackgroundJob) {
  const streak = job.consecutiveFailureCount ?? 0;
  const lastCategory = job.lastFailureCategory ? formatFailureCategory(job.lastFailureCategory) : undefined;
  const backoffUntil = job.backoffUntil ? formatShortTimestamp(job.backoffUntil) : undefined;
  if (streak <= 0 && !lastCategory && !backoffUntil) {
    return undefined;
  }
  return [
    streak > 0 ? `Failure streak ${streak}` : undefined,
    lastCategory ? `last ${lastCategory}` : undefined,
    backoffUntil ? `backoff until ${backoffUntil}` : undefined
  ]
    .filter(Boolean)
    .join(" | ");
}

function latestRunEventDetail(run: BackgroundJobRun) {
  return [...run.events].reverse().find((event) => event.detail || event.message)?.detail ?? [...run.events].reverse().find((event) => event.message)?.message;
}

function JobDetail(props: {
  job?: BackgroundJob;
  runs: BackgroundJobRun[];
  executionPaused: boolean;
  executionPauseReason: string;
  onRunNow: (job: BackgroundJob) => void;
  onStopRun: (run: BackgroundJobRun) => void;
  onEdit: (job: BackgroundJob) => void;
  onOpenAssistant: (assistantId: string) => void;
  schedulerHeartbeatAt?: string;
}) {
  const latestRun = createMemo(() => props.runs[0]);
  const activeRun = createMemo(() => (props.job ? findActiveJobRun(props.job, props.runs) : undefined));
  const latestRunEvents = createMemo(() =>
    (latestRun()?.events ?? []).map((event) => ({
      id: event.id,
      message: event.message,
      level: event.stage,
      createdAt: event.createdAt,
      detail: event.detail
    }))
  );

  return (
    <Show
      when={props.job}
      fallback={
        <div class="flex h-full min-h-80 items-center justify-center border border-dashed border-(--border) p-6 text-center text-[0.675rem] text-(--muted)">
          Select background job to inspect schedule and actions.
        </div>
      }
    >
      {(job) => (
        <div class="flex h-full min-h-0 flex-col gap-4">
          <div class="border-b border-(--border) pb-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Job detail</div>
                  <span class={`rounded-full px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] ${jobStatusBadgeClass(job().status)}`}>
                    {job().status}
                  </span>
                </div>
                <h2 class="mt-1 break-words text-[1.2rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">{job().name}</h2>
                <div class="mt-3 grid gap-x-5 gap-y-1 border-l-2 border-(--border) pl-4 text-[0.675rem] leading-5 text-(--muted) sm:grid-cols-2 xl:grid-cols-3">
                  <RunFact label="Kind">{job().kind}</RunFact>
                  <RunFact label="Risk">{job().riskLevel}</RunFact>
                  <RunFact label="Lane">{job().lane ?? "exclusive"}</RunFact>
                  <RunFact label="Owner">{formatJobOwner(job(), harnessStore.state)}</RunFact>
                  <RunFact label="Schedule">{job().scheduleInput}</RunFact>
                  <RunFact label="Next">{formatJobNextRun(job(), props.runs, props.schedulerHeartbeatAt)}</RunFact>
                  <Show when={job().schedulerStatus}>
                    {(status) => <RunFact label="Scheduler">{status()}{job().schedulerDetail ? ` - ${job().schedulerDetail}` : ""}</RunFact>}
                  </Show>
                  <Show when={formatFailureTrackingLine(job())}>
                    {(line) => <RunFact label="Failure">{line()}</RunFact>}
                  </Show>
                  <For each={formatJobSchedulerLines(job(), props.runs, props.schedulerHeartbeatAt)}>
                    {(line) => <RunFact label="Scheduler">{line}</RunFact>}
                  </For>
                  <Show when={activeRun()}>
                    {(run) => <div class="min-w-0 break-words [overflow-wrap:anywhere]">Blocked by: {run().status} run {run().id}</div>}
                  </Show>
                  <Show when={job().description}>
                    <RunFact label="Description">{job().description}</RunFact>
                  </Show>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <Show when={job().assistantId}>
                  {(assistantId) => (
                    <ActionButton tooltip="Open owning assistant" variant="secondary" icon={<Bot class="h-4 w-4" />} onClick={() => props.onOpenAssistant(assistantId())}>
                      Assistant
                    </ActionButton>
                  )}
                </Show>
                <ActionButton
                  tooltip="Run task now"
                  disabled={props.executionPaused || Boolean(activeRun())}
                  disabledReason={props.executionPaused ? props.executionPauseReason : activeRun() ? "Stop the active run before starting another" : undefined}
                  icon={<Play class="h-4 w-4" />}
                  onClick={() => props.onRunNow(job())}
                >
                  Run now
                </ActionButton>
                <Show when={activeRun()}>
                  {(run) => (
                    <ActionButton tooltip="Stop active background run" variant="secondary" icon={<Pause class="h-4 w-4" />} onClick={() => props.onStopRun(run())}>
                      Stop run
                    </ActionButton>
                  )}
                </Show>
                <ActionButton tooltip="Edit task" variant="secondary" icon={<RefreshCcw class="h-4 w-4" />} onClick={() => props.onEdit(job())}>
                  Edit
                </ActionButton>
              </div>
            </div>
          </div>
          <section class="flex min-h-0 flex-1 flex-col">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
              <Show when={latestRun()}>
                {(run) => <div class="text-[0.625rem] text-(--muted)">{run().status}</div>}
              </Show>
            </div>
            <Show
              when={latestRun()?.events.length}
              fallback={<div class="border-l-2 border-dashed border-(--border) py-3 pl-4 text-[0.675rem] text-(--muted)">No execution log yet.</div>}
            >
              <ExecutionLog entries={latestRunEvents()} emptyMessage="No execution log yet." rowVariant="flat" />
            </Show>
          </section>
        </div>
      )}
    </Show>
  );
}

function runFilterLabel(filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return "All";
    case "approval":
      return "Approval";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "done":
      return "Done";
  }
}

function jobStateFilterLabel(filter: JobsJobStateFilter) {
  switch (filter) {
    case "all":
      return "All";
    case "backoff":
      return "Backoff";
    default:
      return toProperCase(filter);
  }
}

function jobStateFilterIcon(filter: JobsJobStateFilter) {
  switch (filter) {
    case "all":
      return <ListFilter class="h-3.5 w-3.5" />;
    case "due":
    case "queued":
      return <Clock3 class="h-3.5 w-3.5" />;
    case "blocked":
    case "backoff":
      return <CircleX class="h-3.5 w-3.5" />;
    case "running":
      return <LoaderCircle class="h-3.5 w-3.5" />;
    case "stale":
      return <RefreshCcw class="h-3.5 w-3.5" />;
    case "idle":
      return <CheckCircle2 class="h-3.5 w-3.5" />;
  }
}

function runFilterIcon(filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return <ListFilter class="h-3.5 w-3.5" />;
    case "approval":
      return <ShieldCheck class="h-3.5 w-3.5" />;
    case "queued":
      return <Plus class="h-3.5 w-3.5" />;
    case "running":
      return <LoaderCircle class="h-3.5 w-3.5" />;
    case "failed":
      return <CircleX class="h-3.5 w-3.5" />;
    case "done":
      return <CheckCircle2 class="h-3.5 w-3.5" />;
  }
}
