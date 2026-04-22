import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { createRequestId, type BackgroundJob, type BackgroundJobRun } from "../../../shared/protocol";
import { type BackgroundJobEditorDraft, harnessStore, persistLocalPreferences } from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { ScrollArea } from "./primitives/scroll-area";
import { Tooltip } from "./primitives/tooltip";
import {
  Bell,
  BellOff,
  Bot,
  CheckCircle2,
  CircleHelp,
  CircleX,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Terminal,
  Trash2
} from "lucide-solid";

type RunFilter = "approval" | "queued" | "running" | "failed" | "done";

export function BackgroundJobsPanel() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = "Global execution pause is active";
  const [runFilter, setRunFilter] = createSignal<RunFilter>("approval");
  const [selectedRunId, setSelectedRunId] = createSignal<string>();

  const jobs = createMemo(() =>
    [...state.backgroundJobs.jobs].sort((left, right) => {
      const leftKey = left.nextRunAt ?? left.updatedAt;
      const rightKey = right.nextRunAt ?? right.updatedAt;
      return rightKey.localeCompare(leftKey);
    })
  );
  const filteredRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => matchesRunFilter(run, runFilter()))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );
  const selectedRun = createMemo(() => filteredRuns().find((run) => run.id === selectedRunId()) ?? filteredRuns()[0]);
  const selectedJob = createMemo(() => jobs().find((job) => job.id === selectedRun()?.jobId));

  createEffect(() => {
    const currentRun = selectedRun();
    if (!currentRun) {
      setSelectedRunId(undefined);
      return;
    }

    if (selectedRunId() !== currentRun.id) {
      setSelectedRunId(currentRun.id);
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
      aiPlanExecutionMode:
        template?.definition.kind === "ai-routine"
          ? template.definition.planExecutionMode ?? state.planExecutionModeDefault
          : state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy:
        template?.definition.kind === "ai-routine"
          ? template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
          : state.subagentWorktreeStrategyDefault,
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
      kind: job.kind,
      name: job.name,
      description: job.description ?? "",
      scheduleInput: job.scheduleInput,
      timezone: job.timezone ?? resolveBrowserTimezone(),
      aiPrompt: job.definition.kind === "ai-routine" ? job.definition.prompt : "",
      aiModeId: job.definition.kind === "ai-routine" ? job.definition.modeId : undefined,
      aiExecutionModelId: job.definition.kind === "ai-routine" ? job.definition.executionModelId : undefined,
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
    persistLocalPreferences({
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
      backgroundJobNotificationsEnabled
    });
  }

  return (
    <section data-test-background-jobs-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0 p-4">
      <div class="px-1 py-1">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-center gap-2 text-[0.585rem] font-semibold tracking-[0.2em] text-(--muted)">
            <span>Background jobs</span>
            <Tooltip content="Durable scheduler. Jobs catch up on startup, run in hidden automation threads, summarize here.">
              <span class="inline-flex">
                <CircleHelp class="h-3.5 w-3.5 text-(--muted)" aria-label="Background jobs help" />
              </span>
            </Tooltip>
          </div>
          <div class="flex items-center gap-2">
            <ActionButton
              tooltip="Create scheduled AI routine"
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
          </div>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
        <div class="grid min-h-0 gap-4 xl:grid-rows-[minmax(16rem,1fr)_minmax(18rem,1.2fr)]">
          <section class="flex min-h-0 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Jobs</div>
              <span class="text-[0.625rem] text-(--muted)">{jobs().length} total</span>
            </div>
            <ScrollArea class="min-h-0 flex-1 pr-2">
              <Show
                when={jobs().length > 0}
                fallback={<div class="rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-4 text-[0.675rem] leading-5 text-(--muted)">No scheduled tasks yet. Promote finished AI work or create one from scratch.</div>}
              >
                <div class="space-y-3">
                  <For each={jobs()}>
                    {(job) => (
                      <article class="rounded-[1.2rem] border border-(--border) bg-white/70 p-3">
                        <div class="flex items-start justify-between gap-3">
                          <div>
                            <div class="text-[0.75rem] font-semibold text-(--foreground)">{job.name}</div>
                            <div class="mt-1 text-[0.625rem] uppercase tracking-[0.14em] text-(--muted)">
                              {job.kind} | {job.status} | {job.riskLevel}
                            </div>
                          </div>
                          <div class="flex gap-1">
                            <ActionButton tooltip="Run task now" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<Play class="h-3.5 w-3.5" />} size="icon" variant="ghost" ariaLabel={`Run ${job.name} now`} onClick={() => sendCommand({ type: "background-job.run-now", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } })} />
                            <ActionButton
                              tooltip={job.status === "enabled" ? "Pause task" : "Resume task"}
                              icon={job.status === "enabled" ? <Pause class="h-3.5 w-3.5" /> : <Play class="h-3.5 w-3.5" />}
                              size="icon"
                              variant="ghost"
                              ariaLabel={job.status === "enabled" ? `Pause ${job.name}` : `Resume ${job.name}`}
                              onClick={() => sendCommand({
                                type: job.status === "enabled" ? "background-job.pause" : "background-job.resume",
                                requestId: createRequestId(),
                                payload: {
                                  projectId: job.projectId,
                                  jobId: job.id
                                }
                              })}
                            />
                            <ActionButton tooltip="Edit task" icon={<RefreshCcw class="h-3.5 w-3.5" />} size="icon" variant="ghost" ariaLabel={`Edit ${job.name}`} onClick={() => handleEditJob(job)} />
                            <ActionButton tooltip="Delete task" icon={<Trash2 class="h-3.5 w-3.5" />} size="icon" variant="ghost" ariaLabel={`Delete ${job.name}`} onClick={() => sendCommand({ type: "background-job.delete", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } })} />
                          </div>
                        </div>
                        <div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">
                          <div>{job.description ?? job.scheduleInput}</div>
                          <div class="mt-1">Next: {job.nextRunAt ?? "n/a"}</div>
                          <div>Project: {state.workspace.projects.find((project) => project.id === job.projectId)?.name ?? job.projectId}</div>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </ScrollArea>
          </section>

          <section class="flex min-h-0 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div class="text-[0.585rem] font-semibold tracking-[0.04em] text-(--muted)">Inbox</div>
              <div class="flex flex-wrap gap-2">
                <For each={["approval", "queued", "running", "failed", "done"] satisfies RunFilter[]}>
                  {(filter) => (
                    <Tooltip content={runFilterLabel(filter)}>
                      <button
                        class={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                          runFilter() === filter
                            ? "border-(--accent) bg-(--accent) text-white"
                            : "border-(--border) bg-white/70 text-(--foreground)"
                        }`}
                        type="button"
                        aria-label={runFilterLabel(filter)}
                        onClick={() => setRunFilter(filter)}
                      >
                        {runFilterIcon(filter)}
                      </button>
                    </Tooltip>
                  )}
                </For>
              </div>
            </div>
            <ScrollArea class="min-h-0 flex-1 pr-2">
              <Show when={filteredRuns().length > 0} fallback={<div class="rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-4 text-[0.675rem] leading-5 text-(--muted)">No runs match current filter.</div>}>
                <div class="space-y-3">
                  <For each={filteredRuns()}>
                    {(run) => (
                      <button
                        class={`w-full rounded-[1.2rem] border p-3 text-left transition ${
                          selectedRun()?.id === run.id
                            ? "border-(--accent) bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(255,255,255,0.92))]"
                            : "border-(--border) bg-white/70"
                        }`}
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <div class="flex items-center justify-between gap-3">
                          <div class="text-[0.725rem] font-semibold text-(--foreground)">
                            {state.backgroundJobs.jobs.find((job) => job.id === run.jobId)?.name ?? run.jobId}
                          </div>
                          <div class="text-[0.575rem] uppercase tracking-[0.16em] text-(--muted)">{run.status}</div>
                        </div>
                        <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">
                          <div>{run.summary ?? run.failureMessage ?? `${run.triggerSource} run`}</div>
                          <div class="mt-1">Queued: {run.queuedAt}</div>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </ScrollArea>
          </section>
        </div>

        <section class="flex min-h-0 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
          <Show when={selectedRun()} fallback={<div class="flex h-full min-h-80 items-center justify-center rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-6 text-center text-[0.675rem] text-(--muted)">Select background run to inspect milestones and actions.</div>}>
            {(run) => (
              <div class="flex h-full min-h-0 flex-col gap-4">
                <div class="rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Run detail</div>
                      <h2 class="mt-1 text-[1.2rem] font-semibold tracking-[-0.04em] text-(--foreground)">{selectedJob()?.name}</h2>
                      <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">
                        <div>Status: {run().status}</div>
                        <div>Trigger: {run().triggerSource}</div>
                        <div>Approval: {run().approvalStatus}</div>
                        <div>Summary: {run().summary ?? "n/a"}</div>
                        <Show when={run().failureMessage}><div>Failure: {run().failureMessage}</div></Show>
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
                </div>

                <ScrollArea class="flex-1 min-h-0 pr-2">
                  <div class="space-y-3">
                    <For each={run().events}>
                      {(event) => (
                        <article class="rounded-[1.1rem] border border-(--border) bg-white/70 p-4">
                          <div class="flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">
                            <span>{event.stage}</span>
                            <span>{event.createdAt}</span>
                          </div>
                          <div class="mt-2 text-[0.75rem] font-semibold text-(--foreground)">{event.message}</div>
                          <Show when={event.detail}><div class="mt-2 whitespace-pre-wrap text-[0.675rem] leading-5 text-(--muted)">{event.detail}</div></Show>
                        </article>
                      )}
                    </For>
                  </div>
                </ScrollArea>
              </div>
            )}
          </Show>
        </section>
      </div>
    </section>
  );
}

function matchesRunFilter(run: BackgroundJobRun, filter: RunFilter) {
  switch (filter) {
    case "approval":
      return run.status === "awaiting-approval" || run.approvalStatus === "pending";
    case "queued":
      return run.status === "queued";
    case "running":
      return run.status === "running";
    case "failed":
      return run.status === "failed" || run.status === "cancelled";
    case "done":
      return run.status === "succeeded" || run.status === "skipped";
  }
}

function runFilterLabel(filter: RunFilter) {
  switch (filter) {
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

function runFilterIcon(filter: RunFilter) {
  switch (filter) {
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

function resolveBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

