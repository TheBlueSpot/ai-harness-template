import { For, Show, type JSX } from "solid-js";
import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import {
  getActiveProject,
  getDefaultExecutionModelIdForProvider,
  harnessStore,
  hasUsableApiKeyForProvider,
  isModelIdForProvider
} from "../harness-store";
import { formatContextUsage, getProjectStatusCards } from "../lib/run-status";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import { LoaderCircle, MessageSquareMore, Pause, RefreshCcw, RotateCcw, SendHorizontal } from "lucide-solid";

type ChatPanelProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  const state = harnessStore.state;
  const activeProject = () => getActiveProject(state);
  const pendingQuestion = () => activeProject().activeRun?.questions.find((question) => question.status === "pending");
  const resumableRun = () => (activeProject().activeRun?.resumable ? activeProject().activeRun : undefined);
  const retryableRun = () => (activeProject().lastRun?.retryable ? activeProject().lastRun : undefined);
  const failedSubtaskCount = () =>
    activeProject().activeRun?.subtasks.filter((task) => task.status === "failed").length ?? 0;
  const statusCards = () => getProjectStatusCards(activeProject(), state.projectPreflights[activeProject().id]);
  const composerContextText = () => {
    const contextUsage = activeProject().contextUsage;
    if (!contextUsage) {
      return "Ctx ? / ?";
    }

    return `${formatContextUsage(contextUsage.tokens, contextUsage.contextWindow, contextUsage.usagePercent)} | ${
      contextUsage.sourceLabel
    }`;
  };

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const project = activeProject();
    const content = project.draft.trim();
    if (!content) {
      return;
    }

    const question = pendingQuestion();
    if (question && project.activeRun) {
      props.sendCommand({
        type: "planning.answer",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          runId: project.activeRun.id,
          questionId: question.id,
          content
        }
      });

      harnessStore.setProjectDraft(project.id, "");
      return;
    }

    if (resumableRun()) {
      pushToast(
        "Resume required",
        "Use the resume action to rerun failed or pending subagents. Draft text is optional guidance for resume.",
        "error"
      );
      return;
    }

    if (!project.session.selectedAgentId) {
      return;
    }

    if (!hasUsableApiKeyForProvider(state, state.providerBrand)) {
      pushToast(
        `${state.providerBrand === "gemini" ? "Gemini" : "GPT"} API key required`,
        "Open preferences and add matching provider key before sending chat.",
        "error"
      );
      harnessStore.openPreferencesModal();
      return;
    }

    const executionModelId = getEffectiveExecutionModelId();

    props.sendCommand({
      type: "chat.send",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        agentId: project.session.selectedAgentId,
        content,
        executionModelId,
        debug: state.debugEnabled
      }
    });

    harnessStore.setProjectDraft(project.id, "");
    harnessStore.clearPendingExecutionModelId(project.id);
  }

  function handleResume() {
    const project = activeProject();
    const run = resumableRun();
    if (!run) {
      return;
    }

    props.sendCommand({
      type: "run.resume",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id,
        guidanceText: project.draft.trim() || undefined
      }
    });

    harnessStore.setProjectDraft(project.id, "");
  }

  function handleReset() {
    const project = activeProject();
    props.sendCommand({
      type: "session.reset",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleStop() {
    const project = activeProject();
    props.sendCommand({
      type: "chat.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleRetry() {
    const project = activeProject();
    const run = retryableRun();
    if (!run) {
      return;
    }

    props.sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function getEffectiveExecutionModelId() {
    const project = activeProject();
    const pendingModelId = state.pendingExecutionModelIds[project.id];
    if (pendingModelId) {
      return pendingModelId;
    }

    if (isModelIdForProvider(project.session.executionModelId, state.providerBrand)) {
      return project.session.executionModelId;
    }

    return getDefaultExecutionModelIdForProvider(state.providerBrand);
  }

  function getComposerPlaceholder() {
    if (pendingQuestion()) {
      return "Answer planner question...";
    }

    if (resumableRun()) {
      return "Optional guidance for resume...";
    }

    return `Ask pi to work inside ${activeProject().rootPath}...`;
  }

  return (
    <section class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-[2rem] p-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Active project
            <span class="text-[color:var(--foreground)]">{activeProject().name}</span>
          </div>
          <div>
            <h1 class="font-display text-[1.6875rem] tracking-[-0.06em] text-[color:var(--foreground)] md:text-[2.025rem]">
              Pi Harness Workspace
            </h1>
            <p class="mt-2 max-w-3xl text-[0.675rem] leading-5 text-[color:var(--muted)] md:text-[0.7875rem]">
              SQLite-backed project chats, GPT or Gemini orchestration, and project-local traces without mixing execution context.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <ActionButton
            tooltip="Archive current thread and start a fresh one"
            disabledReason="Project is streaming"
            disabled={activeProject().session.isStreaming}
            icon={<RotateCcw class="h-4 w-4" />}
            variant="secondary"
            onClick={handleReset}
          >
            Reset thread
          </ActionButton>
          <ActionButton
            tooltip="Stop active run"
            disabledReason="No running task"
            disabled={!activeProject().session.isStreaming}
            icon={<Pause class="h-4 w-4" />}
            variant="secondary"
            onClick={handleStop}
          >
            Stop
          </ActionButton>
          <Show when={retryableRun()}>
            <ActionButton
              tooltip="Retry last pi run"
              disabledReason="Project is streaming"
              disabled={activeProject().session.isStreaming}
              icon={<RefreshCcw class="h-4 w-4" />}
              variant="secondary"
              onClick={handleRetry}
            >
              Retry last run
            </ActionButton>
          </Show>
        </div>
      </div>

      <ScrollArea class="flex-1 min-h-0 space-y-3 pr-2">
        <Show
          when={activeProject().session.messages.length > 0 || activeProject().streamingAssistantText || statusCards().length > 0}
          fallback={
            <div class="flex min-h-56 items-center justify-center rounded-[1.5rem] border border-dashed border-[color:var(--border)] bg-white/40 p-8 text-center text-[0.675rem] text-[color:var(--muted)]">
              Choose project, then send task. Each project keeps its own persisted thread history.
            </div>
          }
        >
          <div class="space-y-3">
            <For each={statusCards()}>
              {(card) => (
                <article
                  class={`rounded-[1.5rem] border p-3 shadow-sm ${
                    card.tone === "warning"
                      ? "border-amber-300/70 bg-amber-50/80"
                      : card.tone === "error"
                      ? "border-rose-300/70 bg-rose-50/85"
                      : "border-[color:var(--border)] bg-teal-950/5"
                  }`}
                >
                  <div class="mb-2 flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">
                    <Show when={card.spinning}>
                      <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                    </Show>
                    {card.label}
                  </div>
                  <div class="whitespace-pre-wrap text-[0.675rem] leading-6 text-[color:var(--foreground)]">{card.body}</div>
                </article>
              )}
            </For>
            <For each={activeProject().session.messages}>
              {(message) => (
                <article
                  class={`rounded-[1.5rem] border border-[color:var(--border)] p-3 shadow-sm ${
                    message.role === "assistant" ? "bg-teal-950/5" : "bg-white/60"
                  }`}
                >
                  <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">
                    {message.role}
                  </div>
                  <div class="whitespace-pre-wrap text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                    {message.content}
                  </div>
                </article>
              )}
            </For>

            <Show when={activeProject().streamingAssistantText}>
              <article class="rounded-[1.5rem] border border-[color:var(--border)] bg-teal-950/5 p-3 shadow-sm">
                <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">
                  assistant (streaming)
                </div>
                <div class="whitespace-pre-wrap text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                  {activeProject().streamingAssistantText}
                </div>
              </article>
            </Show>
          </div>
        </Show>
      </ScrollArea>

      <form class="space-y-3" onSubmit={handleSubmit}>
        <Show when={pendingQuestion()}>
          {(question) => (
            <div class="rounded-[1.5rem] border border-amber-300/70 bg-amber-50/80 p-4 shadow-sm">
              <div class="mb-2 flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-amber-800">
                <MessageSquareMore class="h-3.5 w-3.5" />
                Planner question
              </div>
              <div class="text-[0.7875rem] leading-6 text-amber-950">{question().prompt}</div>
              <Show when={question().placeholder}>
                <div class="mt-2 text-[0.675rem] text-amber-900/70">Example reply: {question().placeholder}</div>
              </Show>
            </div>
          )}
        </Show>

        <Show when={resumableRun()}>
          {(run) => (
            <div class="rounded-[1.5rem] border border-rose-300/70 bg-rose-50/80 p-4 shadow-sm">
              <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-rose-800">
                Resumable run
              </div>
              <div class="text-[0.7875rem] leading-6 text-rose-950">
                Status: {run().status}. Failed subtasks: {failedSubtaskCount()}.
              </div>
              <div class="mt-2 text-[0.675rem] leading-5 text-rose-900/75">
                Use resume to rerun failed or pending subtasks only. Draft text below will be sent as extra guidance.
              </div>
            </div>
          )}
        </Show>

        <Textarea
          rows="6"
          value={activeProject().draft}
          placeholder={getComposerPlaceholder()}
          onInput={(event: InputEvent & { currentTarget: HTMLTextAreaElement; target: Element }) =>
            harnessStore.setProjectDraft(activeProject().id, event.currentTarget.value)
          }
        />

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="space-y-1 text-[0.675rem] text-[color:var(--muted)]">
            Agent: {activeProject().session.selectedAgentId ?? "pi"} | Effective model:{" "}
            {getEffectiveExecutionModelId()}
            <div>{composerContextText()}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Show when={resumableRun()}>
              <ActionButton
                tooltip="Resume failed or pending subagents"
                disabledReason={activeProject().session.isStreaming ? "Project is streaming" : "No resumable run"}
                disabled={!resumableRun() || activeProject().session.isStreaming}
                icon={<RefreshCcw class="h-4 w-4" />}
                type="button"
                onClick={handleResume}
              >
                Resume failed agents
              </ActionButton>
            </Show>
            <ActionButton
              tooltip={pendingQuestion() ? "Send planner answer" : "Send task to pi"}
              disabledReason={
                activeProject().session.isStreaming
                  ? "Project is streaming"
                  : resumableRun()
                  ? "Use resume failed agents to continue this run"
                  : "Enter task text"
              }
              disabled={!activeProject().draft.trim() || Boolean(resumableRun()) || activeProject().session.isStreaming}
              icon={<SendHorizontal class="h-4 w-4" />}
              type="submit"
            >
              {pendingQuestion() ? "Answer question" : "Send task"}
            </ActionButton>
          </div>
        </div>
      </form>
    </section>
  );
}
