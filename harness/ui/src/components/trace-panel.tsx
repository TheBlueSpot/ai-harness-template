import { For, Show } from "solid-js";
import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { getLatestTaskStatusText, getRunRefreshState, isRunWorking } from "../lib/run-status";
import { ActionButton } from "./action-button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { ClipboardList, LoaderCircle, RefreshCcw } from "lucide-solid";

type TracePanelProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function TracePanel(props: TracePanelProps) {
  const state = harnessStore.state;
  const activeProject = () => getActiveProject(state);
  const runToShow = () => activeProject()?.activeRun ?? activeProject()?.lastRun;
  const canRetryRun = () => Boolean(activeProject()?.lastRun?.retryable);
  const refreshState = () => {
    const project = activeProject();
    return project ? getRunRefreshState(project, runToShow()) : { disabled: true, disabledReason: "No run available", refreshing: false };
  };
  const planRun = () => runToShow();
  const hasPlanDetails = () => Boolean(activeProject()?.latestPlan?.executionPlan);

  function handleRetryRun() {
    const project = activeProject();
    if (!project) {
      return;
    }
    const run = project.lastRun;
    if (!run) {
      return;
    }

    props.sendCommand({
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

    props.sendCommand({
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

    props.sendCommand({
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

    props.sendCommand({
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

  return (
    <aside class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-[2rem] p-[0.8rem]">
      <div>
        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Developer trace
        </div>
        <h2 class="mt-2 text-[1.125rem] font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
          Planner + routing
        </h2>
        <p class="mt-2 text-[0.675rem] leading-5 text-[color:var(--muted)]">
          Project-scoped plan and trace events stay here, separate from user-visible chat history.
        </p>
      </div>

      <Show
        when={activeProject()}
        fallback={
          <div class="flex flex-1 items-center">
            <div class="w-full rounded-[1.5rem] border border-dashed border-[color:var(--border)] bg-white/40 p-5 text-[0.675rem] leading-5 text-[color:var(--muted)]">
              Open project root to inspect plans, retries, model overrides, and trace events.
            </div>
          </div>
        }
      >
        {(project) => (
          <>
            <label class="space-y-2">
              <span class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Next execution model override
              </span>
              <Input
                value={state.pendingExecutionModelIds[project().id] ?? ""}
                placeholder={project().session.executionModelId ?? "openai/gpt-5.4"}
                onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
                  harnessStore.setPendingExecutionModelId(project().id, event.currentTarget.value)
                }
              />
            </label>

            <Show when={project().latestPlan}>
              <div class="rounded-[1.5rem] border border-[color:var(--border)] bg-white/55 p-3">
                <div class="mb-3 flex items-center justify-between gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
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
                <div class="grid grid-cols-2 gap-2 text-[0.675rem] text-[color:var(--muted)]">
                  <div>Difficulty: {project().latestPlan?.difficultyScore}%</div>
                  <div>Route: {project().latestPlan?.usesSubagents ? "pi-subagents" : "main pi"}</div>
                  <div>Planner: {project().latestPlan?.planningModelId}</div>
                  <div>Executor: {project().latestPlan?.executionModelId}</div>
                  <div>Subtasks: {project().latestPlan?.subtaskCount}</div>
                  <div>Agent: {project().latestPlan?.agentId}</div>
                </div>
              </div>
            </Show>

            <Show when={runToShow()}>
              <div class="rounded-[1.5rem] border border-[color:var(--border)] bg-white/55 p-3">
                <div class="mb-3 flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  <div class="flex items-center gap-2">
                    <Show when={runToShow() && isRunWorking(runToShow()!.status)}>
                      <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                    </Show>
                    Run
                  </div>
                  <div class="flex items-center gap-2">
                    <ActionButton
                      tooltip="Refresh the active run"
                      disabledReason={refreshState().disabledReason}
                      disabled={refreshState().disabled}
                      icon={<RefreshCcw class="h-3.5 w-3.5" />}
                      size="sm"
                      variant="secondary"
                      onClick={handleRefreshRun}
                    >
                      {refreshState().refreshing ? "Refreshing" : "Refresh"}
                    </ActionButton>
                    <Show when={canRetryRun()}>
                      <ActionButton
                        tooltip="Retry last pi run"
                        disabledReason="Project is streaming"
                        disabled={project().session.isStreaming}
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
                <div class="space-y-2 text-[0.675rem] text-[color:var(--muted)]">
                  <div>Status: {runToShow()?.status}</div>
                  <div>Retryable: {runToShow()?.retryable ? "yes" : "no"}</div>
                  <div>Resumable: {runToShow()?.resumable ? "yes" : "no"}</div>
                  <div>Prompt: {runToShow()?.latestUserPrompt}</div>
                  <Show when={runToShow()?.failureMessage}>
                    <div>Failure: {runToShow()?.failureMessage}</div>
                  </Show>
                </div>

                <Show when={runToShow()?.subtasks.length}>
                  <div class="mt-4 space-y-2">
                    <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                      Subtasks
                    </div>
                    <div class="space-y-2">
                      <For each={runToShow()?.subtasks}>
                        {(task) => (
                          <div class="rounded-2xl border border-[color:var(--border)] bg-white/70 p-3 text-[0.675rem]">
                            <div class="flex items-center justify-between gap-3 text-[color:var(--foreground)]">
                              <span class="flex items-center gap-2 font-semibold">
                                <Show when={task.status === "running"}>
                                  <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                                </Show>
                                {task.title}
                              </span>
                              <span class="uppercase tracking-[0.14em] text-[color:var(--accent-strong)]">{task.status}</span>
                            </div>
                            <div class="mt-1 text-[color:var(--muted)]">Attempts: {task.attemptCount}</div>
                            <div class="mt-1 text-[color:var(--muted)]">Latest status: {getLatestTaskStatusText(project(), task)}</div>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <ActionButton
                                tooltip="Refresh this active subagent"
                                disabledReason={getRunRefreshState(project(), project().activeRun, task.id).disabledReason}
                                disabled={getRunRefreshState(project(), project().activeRun, task.id).disabled}
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
                                  disabledReason="Project is streaming"
                                  disabled={project().session.isStreaming}
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
                              <div class="mt-1 whitespace-pre-wrap text-rose-900/80">{task.errorMessage}</div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            <ScrollArea class="flex-1 min-h-0 space-y-3 pr-2">
              <Show
                when={project().traces.length > 0}
                fallback={
                  <div class="rounded-[1.5rem] border border-dashed border-[color:var(--border)] bg-white/40 p-5 text-[0.675rem] text-[color:var(--muted)]">
                    No trace events yet.
                  </div>
                }
              >
                <div class="space-y-3">
                  <For each={project().traces}>
                    {(trace) => (
                      <article class="rounded-[1.5rem] border border-[color:var(--border)] bg-white/55 p-3">
                        <div class="mb-2 flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-strong)]">
                          <span>{trace.stage}</span>
                          <span>{trace.modelId ?? "n/a"}</span>
                        </div>
                        <div class="whitespace-pre-wrap text-[0.675rem] leading-5 text-[color:var(--foreground)]">
                          {trace.message}
                        </div>
                        <Show when={trace.detail}>
                          <div class="mt-2 whitespace-pre-wrap text-[0.675rem] leading-5 text-[color:var(--muted)]">
                            {trace.detail}
                          </div>
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
