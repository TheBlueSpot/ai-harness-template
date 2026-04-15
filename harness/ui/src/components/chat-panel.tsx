import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import {
  getActiveProject,
  getDefaultExecutionModelIdForProvider,
  harnessStore,
  hasUsableApiKeyForProvider,
  isModelIdForProvider
} from "../harness-store";
import { isAbsolutePath } from "../lib/utils";
import { formatContextUsage } from "../lib/run-status";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import {
  Clipboard,
  Copy,
  Edit3,
  FolderOpen,
  FolderPlus,
  GitFork,
  LoaderCircle,
  MessageSquareMore,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  SendHorizontal
} from "lucide-solid";

type ChatPanelProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  let messageViewport: HTMLDivElement | undefined;
  let countdownTimer: number | undefined;
  const state = harnessStore.state;
  const activeProject = () => getActiveProject(state);
  const [stickToBottom, setStickToBottom] = createSignal(true);
  const [editingThreadTitle, setEditingThreadTitle] = createSignal(false);
  const [threadTitleDraft, setThreadTitleDraft] = createSignal("");
  const [countdownRunId, setCountdownRunId] = createSignal<string>();
  const [countdownRemainingMs, setCountdownRemainingMs] = createSignal(0);
  const [countdownPaused, setCountdownPaused] = createSignal(false);
  const [autoExecutedRunId, setAutoExecutedRunId] = createSignal<string>();
  const pendingQuestion = () => activeProject()?.activeRun?.questions.find((question) => question.status === "pending");
  const resumableRun = () => (activeProject()?.activeRun?.resumable ? activeProject()?.activeRun : undefined);
  const retryableRun = () => (activeProject()?.lastRun?.retryable ? activeProject()?.lastRun : undefined);
  const readyRun = () => (activeProject()?.activeRun?.status === "ready" ? activeProject()?.activeRun : undefined);
  const activeThread = () => activeProject()?.threads.find((thread) => thread.id === activeProject()?.activeThreadId);
  const currentExecutionPlan = () => activeProject()?.latestPlan?.executionPlan ?? readyRun()?.plan;
  const failedSubtaskCount = () =>
    activeProject()?.activeRun?.subtasks.filter((task) => task.status === "failed").length ?? 0;
  const composerContextText = () => {
    const contextUsage = activeProject()?.contextUsage;
    if (!contextUsage) {
      return "Ctx ? / ?";
    }

    return `${formatContextUsage(contextUsage.tokens, contextUsage.contextWindow, contextUsage.usagePercent)} | ${
      contextUsage.sourceLabel
    }`;
  };

  const scrollToBottom = (force: boolean = false) => {
    if (!messageViewport || (!force && !stickToBottom())) {
      return;
    }

    queueMicrotask(() => {
      if (!messageViewport) {
        return;
      }

      messageViewport.scrollTop = messageViewport.scrollHeight;
    });
  };

  const updateScrollLock = () => {
    if (!messageViewport) {
      setStickToBottom(true);
      return;
    }

    const distanceFromBottom =
      messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
    setStickToBottom(distanceFromBottom <= 32);
  };

  onMount(() => {
    scrollToBottom(true);
  });

  onCleanup(() => {
    clearCountdown();
  });

  createEffect(() => {
    activeProject()?.activeThreadId;
    scrollToBottom(true);
  });

  createEffect(() => {
    activeProject()?.session.messages.length;
    activeProject()?.streamingAssistantText;
    scrollToBottom();
  });

  createEffect(() => {
    const thread = activeThread();
    setThreadTitleDraft(thread?.title ?? "");
    setEditingThreadTitle(false);
  });

  createEffect(() => {
    const run = readyRun();
    const executionPlan = currentExecutionPlan();
    if (!run || !executionPlan) {
      clearCountdown();
      return;
    }

    if (executionPlan.gating.mode === "immediate") {
      clearCountdown();
      if (autoExecutedRunId() !== run.id) {
        handleExecuteRun(run.id);
        setAutoExecutedRunId(run.id);
      }
      return;
    }

    if (executionPlan.gating.mode !== "countdown") {
      clearCountdown();
      return;
    }

    if (countdownRunId() === run.id) {
      return;
    }

    clearCountdown();
    setCountdownRunId(run.id);
    setCountdownPaused(false);
    setCountdownRemainingMs(executionPlan.gating.delaySeconds * 1000);
    countdownTimer = window.setInterval(() => {
      setCountdownRemainingMs((value) => {
        const next = Math.max(0, value - 100);
        if (next === 0 && readyRun()?.id === run.id && autoExecutedRunId() !== run.id) {
          clearCountdown();
          handleExecuteRun(run.id);
          setAutoExecutedRunId(run.id);
        }
        return next;
      });
    }, 100);
  });

  function clearCountdown() {
    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
    setCountdownRunId(undefined);
    setCountdownRemainingMs(0);
    setCountdownPaused(false);
  }

  function handleQuestionChoice(answerText: string) {
    const project = activeProject();
    const question = pendingQuestion();
    if (!project || !question || !project.activeRun) {
      return;
    }

    props.sendCommand({
      type: "planning.answer",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: project.activeRun.id,
        questionId: question.id,
        content: answerText
      }
    });

    harnessStore.setProjectDraft(project.id, "");
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const project = activeProject();
    if (!project) {
      return;
    }
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
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          questionId: question.id,
          content
        }
      });

      harnessStore.setProjectDraft(project.id, "");
      return;
    }

    if (project.activeRun?.status === "ready") {
      props.sendCommand({
        type: "planning.refine",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          content
        }
      });

      harnessStore.setProjectDraft(project.id, "");
      clearCountdown();
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
        threadId: project.activeThreadId,
        agentId: project.session.selectedAgentId,
        content,
        executionModelId,
        debug: state.debugEnabled
      }
    });

    harnessStore.setProjectDraft(project.id, "");
    harnessStore.clearPendingExecutionModelId(project.id);
  }

  function handleExecuteRun(runId: string) {
    const project = activeProject();
    if (!project) {
      return;
    }

    props.sendCommand({
      type: "run.execute",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId
      }
    });
  }

  function handleResume() {
    const project = activeProject();
    const run = resumableRun();
    if (!project || !run) {
      return;
    }

    props.sendCommand({
      type: "run.resume",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        guidanceText: project.draft.trim() || undefined
      }
    });

    harnessStore.setProjectDraft(project.id, "");
  }

  function handleReset() {
    const project = activeProject();
    if (!project) {
      return;
    }
    props.sendCommand({
      type: "thread.create",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleForkThread() {
    const project = activeProject();
    if (!project) {
      return;
    }
    props.sendCommand({
      type: "thread.fork",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        sourceThreadId: project.activeThreadId
      }
    });
  }

  function handleStop() {
    const project = activeProject();
    if (!project) {
      return;
    }
    props.sendCommand({
      type: "chat.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId
      }
    });
  }

  function handleRetry() {
    const project = activeProject();
    const run = retryableRun();
    if (!project || !run) {
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

  function handlePauseAutoRun() {
    if (countdownRunId() === undefined) {
      return;
    }

    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
    setCountdownPaused(true);
  }

  function handleResumeAutoRun() {
    const runId = countdownRunId();
    const run = readyRun();
    if (!runId || !run || run.id !== runId || countdownRemainingMs() <= 0) {
      return;
    }

    setCountdownPaused(false);
    countdownTimer = window.setInterval(() => {
      setCountdownRemainingMs((value) => {
        const next = Math.max(0, value - 100);
        if (next === 0 && readyRun()?.id === run.id && autoExecutedRunId() !== run.id) {
          clearCountdown();
          handleExecuteRun(run.id);
          setAutoExecutedRunId(run.id);
        }
        return next;
      });
    }, 100);
  }

  function handleCopyThreadId() {
    const thread = activeThread();
    if (!thread) {
      return;
    }

    void navigator.clipboard
      .writeText(thread.id)
      .then(() => pushToast("Thread id copied", thread.id))
      .catch(() => pushToast("Copy failed", "Clipboard permission denied.", "error"));
  }

  function handleStartRenameThread() {
    const thread = activeThread();
    if (!thread) {
      return;
    }

    setThreadTitleDraft(thread.title);
    setEditingThreadTitle(true);
  }

  function handleCommitRenameThread() {
    const project = activeProject();
    const thread = activeThread();
    const title = threadTitleDraft().trim();
    if (!project || !thread || !title) {
      setEditingThreadTitle(false);
      return;
    }

    props.sendCommand({
      type: "thread.rename",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: thread.id,
        title
      }
    });
    setEditingThreadTitle(false);
  }

  function isReadyPlanMessage(runId: string) {
    return readyRun()?.id === runId;
  }

  function getEffectiveExecutionModelId() {
    const project = activeProject();
    if (!project) {
      return getDefaultExecutionModelIdForProvider(state.providerBrand);
    }
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
    const project = activeProject();
    if (!project) {
      return "Add project path or browse for folder to start.";
    }

    if (pendingQuestion()) {
      return "Answer planner question...";
    }

    if (resumableRun()) {
      return "Optional guidance for resume...";
    }

    if (project.activeRun?.status === "ready") {
      return "Refine plan before execution...";
    }

    return `Ask pi to work inside ${project.rootPath}...`;
  }

  function handleOpenProject() {
    const rootPath = state.projectInput.trim();
    if (!isAbsolutePath(rootPath)) {
      return;
    }

    props.sendCommand({
      type: "project.add",
      requestId: createRequestId(),
      payload: {
        rootPath
      }
    });
  }

  function handleBrowseProject() {
    props.sendCommand({
      type: "project.browse",
      requestId: createRequestId()
    });
  }

  return (
    <section class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-[2rem] p-4">
      <Show
        when={activeProject()}
        fallback={
          <div class="flex flex-1 items-center justify-center">
            <div class="w-full max-w-2xl rounded-[1.75rem] border border-dashed border-[color:var(--border)] bg-white/45 p-6 shadow-sm md:p-8">
              <div class="inline-flex items-center gap-2 rounded-full bg-white/65 px-3 py-1 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Empty workspace
              </div>
              <h1 class="mt-4 font-display text-[1.75rem] tracking-[-0.06em] text-[color:var(--foreground)] md:text-[2.1rem]">
                Open project root to start local threads
              </h1>
              <p class="mt-3 max-w-2xl text-[0.75rem] leading-6 text-[color:var(--muted)]">
                Each project keeps isolated thread history, run state, and project-scoped execution context in local SQLite.
              </p>
              <div class="mt-5 space-y-3 rounded-[1.35rem] border border-[color:var(--border)] bg-white/60 p-4">
                <Input
                  value={state.projectInput}
                  placeholder="C:\\repo\\project"
                  onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
                    harnessStore.setProjectInput(event.currentTarget.value)
                  }
                />
                <div class="flex flex-wrap gap-2">
                  <ActionButton
                    tooltip="Open project from typed absolute path"
                    disabledReason={state.projectInput.trim() ? "Project path must be absolute" : "Enter absolute folder path"}
                    disabled={!isAbsolutePath(state.projectInput.trim())}
                    icon={<FolderPlus class="h-4 w-4" />}
                    onClick={handleOpenProject}
                  >
                    Add path
                  </ActionButton>
                  <ActionButton
                    tooltip="Browse for project folder"
                    icon={<FolderOpen class="h-4 w-4" />}
                    variant="secondary"
                    onClick={handleBrowseProject}
                  >
                    Browse folder
                  </ActionButton>
                </div>
              </div>
            </div>
          </div>
        }
      >
        {(project) => (
          <>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-2">
                <div class="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Active project
                  <span class="text-[color:var(--foreground)]">{project().name}</span>
                </div>
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <Show
                      when={editingThreadTitle()}
                      fallback={
                        <h1 class="font-display text-[1.6875rem] tracking-[-0.06em] text-[color:var(--foreground)] md:text-[2.025rem]">
                          {activeThread()?.title ?? "Thread"}
                        </h1>
                      }
                    >
                      <Input
                        value={threadTitleDraft()}
                        onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
                          setThreadTitleDraft(event.currentTarget.value)
                        }
                        onBlur={handleCommitRenameThread}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitRenameThread();
                          }
                          if (event.key === "Escape") {
                            setEditingThreadTitle(false);
                          }
                        }}
                      />
                    </Show>
                    <ActionButton
                      tooltip="Rename this thread"
                      disabledReason="Project is streaming"
                      disabled={project().session.isStreaming}
                      icon={<Edit3 class="h-3.5 w-3.5" />}
                      size="icon"
                      variant="ghost"
                      ariaLabel="Rename this thread"
                      onClick={handleStartRenameThread}
                    />
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-[0.625rem] text-[color:var(--muted)]">
                    <span>thread-id</span>
                    <span class="font-mono text-[0.6rem]">{activeThread()?.id}</span>
                    <ActionButton
                      tooltip="Copy thread id"
                      icon={<Copy class="h-3.5 w-3.5" />}
                      size="icon"
                      variant="ghost"
                      ariaLabel="Copy thread id"
                      onClick={handleCopyThreadId}
                    />
                  </div>
                  <p class="mt-2 max-w-3xl text-[0.675rem] leading-5 text-[color:var(--muted)] md:text-[0.7875rem]">
                    SQLite-backed project chats, GPT or Gemini orchestration, and project-local traces without mixing execution context.
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <ActionButton
                  tooltip="Create a new thread in this project"
                  disabledReason="Project is streaming"
                  disabled={project().session.isStreaming}
                  icon={<Plus class="h-4 w-4" />}
                  variant="secondary"
                  onClick={handleReset}
                >
                  New thread
                </ActionButton>
                <ActionButton
                  tooltip="Fork current thread into a new thread"
                  disabledReason="Project is streaming"
                  disabled={project().session.isStreaming}
                  icon={<GitFork class="h-4 w-4" />}
                  variant="secondary"
                  onClick={handleForkThread}
                >
                  Pi fork
                </ActionButton>
                <ActionButton
                  tooltip="Stop active run"
                  disabledReason="No running task"
                  disabled={!project().session.isStreaming}
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
                    disabled={project().session.isStreaming}
                    icon={<RefreshCcw class="h-4 w-4" />}
                    variant="secondary"
                    onClick={handleRetry}
                  >
                    Retry last run
                  </ActionButton>
                </Show>
              </div>
            </div>

            <ScrollArea
              ref={messageViewport}
              class="flex-1 min-h-0 space-y-3 pr-2"
              onScroll={updateScrollLock}
            >
              <Show
                when={project().session.messages.length > 0 || project().streamingAssistantText}
                fallback={
                  <div class="flex min-h-56 items-center justify-center rounded-[1.5rem] border border-dashed border-[color:var(--border)] bg-white/40 p-8 text-center text-[0.675rem] text-[color:var(--muted)]">
                    Choose project, then send task. Each project keeps its own persisted thread history.
                  </div>
                }
              >
                <div class="space-y-3">
                  <For each={project().session.messages}>
                    {(message) => (
                      <Show
                        when={message.kind === "plan-summary" && message.metadata?.type === "plan-summary"}
                        fallback={
                          <article
                            class={`border border-[color:var(--border)] p-3 shadow-sm ${
                              message.role === "system"
                                ? "rounded-[1.15rem] bg-slate-100/85"
                                : message.role === "assistant"
                                ? "rounded-[1.5rem] bg-teal-950/5"
                                : "rounded-[1.5rem] bg-white/60"
                            }`}
                          >
                            <div
                              class={`mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] ${
                                message.role === "system"
                                  ? "text-[color:var(--muted)]"
                                  : "text-[color:var(--accent-strong)]"
                              }`}
                            >
                              {message.role === "system" ? "status" : message.role}
                            </div>
                            <div class="whitespace-pre-wrap text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                              {message.content}
                            </div>
                          </article>
                        }
                      >
                        <article class="rounded-[1.5rem] border border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(15,118,110,0.12),rgba(255,255,255,0.92))] p-4 shadow-sm">
                          <div class="mb-2 flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">
                            <Clipboard class="h-3.5 w-3.5" />
                            Plan summary
                          </div>
                          <div class="text-[0.75rem] leading-6 text-[color:var(--foreground)]">
                            {message.metadata?.plan.summary}
                          </div>
                          <div class="mt-3 grid gap-2 text-[0.675rem] text-[color:var(--muted)] md:grid-cols-2">
                            <div>Route: {message.metadata?.plan.route}</div>
                            <div>Difficulty: {message.metadata?.plan.difficultyScore}%</div>
                            <div>Prereqs: {message.metadata?.plan.prerequisites.length}</div>
                            <div>Contracts: {message.metadata?.plan.contracts.length}</div>
                            <div>Worktree: {message.metadata?.plan.subagentWorktreeStrategy}</div>
                            <div>Correctness: {message.metadata?.plan.correctnessPolicy}</div>
                          </div>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <ActionButton
                              tooltip="Open full execution plan"
                              icon={<Clipboard class="h-3.5 w-3.5" />}
                              size="sm"
                              variant="secondary"
                              onClick={() => message.metadata?.plan && harnessStore.openExecutionPlanDialog(message.metadata.plan)}
                            >
                              Open plan
                            </ActionButton>
                            <Show when={message.metadata?.plan.gating.mode === "approve"}>
                              <ActionButton
                                tooltip="Start execution with this plan"
                                disabledReason="This plan is no longer active"
                                disabled={!isReadyPlanMessage(message.metadata!.runId)}
                                icon={<Play class="h-3.5 w-3.5" />}
                                size="sm"
                                onClick={() => handleExecuteRun(message.metadata!.runId)}
                              >
                                Start now
                              </ActionButton>
                            </Show>
                            <Show when={message.metadata?.plan.gating.mode === "countdown" && isReadyPlanMessage(message.metadata!.runId)}>
                              <ActionButton
                                tooltip={countdownPaused() ? "Resume automatic execution countdown" : "Pause automatic execution countdown"}
                                icon={countdownPaused() ? <Play class="h-3.5 w-3.5" /> : <Pause class="h-3.5 w-3.5" />}
                                size="sm"
                                variant="secondary"
                                onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                              >
                                {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                              </ActionButton>
                            </Show>
                          </div>
                        </article>
                      </Show>
                    )}
                  </For>

                  <Show when={project().streamingAssistantText}>
                    <article class="rounded-[1.5rem] border border-[color:var(--border)] bg-teal-950/5 p-3 shadow-sm">
                      <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">
                        assistant (streaming)
                      </div>
                      <div class="whitespace-pre-wrap text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                        {project().streamingAssistantText}
                      </div>
                    </article>
                  </Show>
                </div>
              </Show>
            </ScrollArea>

            <Show when={readyRun() && currentExecutionPlan()?.gating.mode === "countdown" && countdownRunId() === readyRun()!.id}>
              <div class="rounded-[1.25rem] border border-[color:var(--border)] bg-white/65 p-3">
                <div class="flex flex-wrap items-center justify-between gap-3 text-[0.675rem] text-[color:var(--muted)]">
                  <span>
                    Auto-run {countdownPaused() ? "paused" : "in progress"} for {currentExecutionPlan()?.gating.delaySeconds}s gate.
                  </span>
                  <ActionButton
                    tooltip={countdownPaused() ? "Resume automatic execution countdown" : "Pause automatic execution countdown"}
                    icon={countdownPaused() ? <Play class="h-3.5 w-3.5" /> : <Pause class="h-3.5 w-3.5" />}
                    size="sm"
                    variant="secondary"
                    onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                  >
                    {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                  </ActionButton>
                </div>
                <div class="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--border)]">
                  <div
                    class="h-full rounded-full bg-[color:var(--accent)] transition-[width]"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          100 -
                            (countdownRemainingMs() /
                              Math.max(1, (currentExecutionPlan()?.gating.delaySeconds ?? 1) * 1000)) *
                              100
                        )
                      )}%`
                    }}
                  />
                </div>
              </div>
            </Show>

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
                    <div class="mt-3 grid gap-2 md:grid-cols-3">
                      <For each={question().choices}>
                        {(choice) => (
                          <button
                            class={`cursor-pointer rounded-[1.1rem] border px-3 py-2 text-left text-[0.675rem] transition disabled:cursor-not-allowed ${
                              choice.recommended
                                ? "border-amber-500 bg-white text-amber-950"
                                : "border-amber-200/80 bg-white/70 text-amber-900"
                            }`}
                            type="button"
                            onClick={() => handleQuestionChoice(choice.answerText)}
                          >
                            <div class="flex items-center justify-between gap-2 font-semibold">
                              <span>{choice.label}</span>
                              <Show when={choice.recommended}>
                                <span class="rounded-full bg-amber-200 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em]">
                                  Recommended
                                </span>
                              </Show>
                            </div>
                            <div class="mt-1 text-[0.625rem] leading-5">{choice.description}</div>
                          </button>
                        )}
                      </For>
                    </div>
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
                rows="4"
                value={project().draft}
                placeholder={getComposerPlaceholder()}
                onInput={(event: InputEvent & { currentTarget: HTMLTextAreaElement; target: Element }) =>
                  harnessStore.setProjectDraft(project().id, event.currentTarget.value)
                }
              />

              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="space-y-1 text-[0.675rem] text-[color:var(--muted)]">
                  Agent: {project().session.selectedAgentId ?? "pi"} | Effective model: {getEffectiveExecutionModelId()}
                  <div>{composerContextText()}</div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Show when={resumableRun()}>
                    <ActionButton
                      tooltip="Resume failed or pending subagents"
                      disabledReason={project().session.isStreaming ? "Project is streaming" : "No resumable run"}
                      disabled={!resumableRun() || project().session.isStreaming}
                      icon={<RefreshCcw class="h-4 w-4" />}
                      type="button"
                      onClick={handleResume}
                    >
                      Resume failed agents
                    </ActionButton>
                  </Show>
                  <ActionButton
                    tooltip={
                      pendingQuestion()
                        ? "Send planner answer"
                        : project().activeRun?.status === "ready"
                        ? "Refine plan before execution"
                        : "Send task to pi"
                    }
                    disabledReason={
                      project().session.isStreaming
                        ? "Project is streaming"
                        : resumableRun()
                        ? "Use resume failed agents to continue this run"
                        : "Enter task text"
                    }
                    disabled={!project().draft.trim() || Boolean(resumableRun()) || project().session.isStreaming}
                    icon={<SendHorizontal class="h-4 w-4" />}
                    type="submit"
                  >
                    {pendingQuestion()
                      ? "Answer question"
                      : project().activeRun?.status === "ready"
                      ? "Refine plan"
                      : "Send task"}
                  </ActionButton>
                </div>
              </div>
            </form>
          </>
        )}
      </Show>
    </section>
  );
}
