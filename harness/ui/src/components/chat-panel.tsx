import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { createRequestId, type ChatAttachment, type ClientCommand } from "../../../shared/protocol";
import { detectChatAttachmentKind, isSupportedChatAttachment, MAX_CHAT_ATTACHMENT_COUNT } from "../../../shared/chat-attachments";
import {
  getActiveProject,
  getActiveMode,
  getCapabilityTags,
  getDefaultExecutionModelIdForProvider,
  getResolvedModes,
  harnessStore,
  hasUsableApiKeyForProvider,
  isModelIdForProvider
} from "../harness-store";
import { isAbsolutePath } from "../lib/utils";
import { formatContextUsage } from "../lib/run-status";
import { uploadFiles } from "../lib/uploadthing";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { ModeEditorPanel } from "./mode-editor-panel";
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
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  SendHorizontal,
  X
} from "lucide-solid";

type ChatPanelProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  let messageViewport: HTMLDivElement | undefined;
  let attachmentInput: HTMLInputElement | undefined;
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
  const [activeTab, setActiveTab] = createSignal<"chat" | "plan" | "run" | "events">("chat");
  const [projectRulesDraft, setProjectRulesDraft] = createSignal("");
  const [threadMemoryDraft, setThreadMemoryDraft] = createSignal("");
  const [draftAttachments, setDraftAttachments] = createSignal<ChatAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = createSignal(false);
  const pendingQuestion = () => activeProject()?.activeRun?.questions.find((question) => question.status === "pending");
  const resumableRun = () => (activeProject()?.activeRun?.resumable ? activeProject()?.activeRun : undefined);
  const retryableRun = () => (activeProject()?.lastRun?.retryable ? activeProject()?.lastRun : undefined);
  const readyRun = () => (activeProject()?.activeRun?.status === "ready" ? activeProject()?.activeRun : undefined);
  const activeThread = () => activeProject()?.threads.find((thread) => thread.id === activeProject()?.activeThreadId);
  const currentExecutionPlan = () => activeProject()?.latestPlan?.executionPlan ?? readyRun()?.plan;
  const resolvedModes = () => getResolvedModes(state, activeProject());
  const activeMode = () => getActiveMode(state, activeProject());
  const capabilityTags = () => getCapabilityTags(state, getEffectiveExecutionModelId());
  const hasVisionCapability = () => capabilityTags().includes("vision");
  const hasImageDraftAttachments = () => draftAttachments().some((attachment) => attachment.kind === "image");
  const visibleTabs = () =>
    (state.uiMode === "advanced" ? ["chat", "plan", "run", "events"] : ["chat", "plan", "run"]) as Array<
      "chat" | "plan" | "run" | "events"
    >;
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
  const attachmentButtonDisabled = () => !state.attachmentsEnabled || activeProject()?.session.isStreaming || uploadingAttachments();
  const attachmentButtonReason = () =>
    !state.attachmentsEnabled
      ? "Set UPLOADTHING_TOKEN on the server to enable attachments"
      : activeProject()?.session.isStreaming
      ? "Project is streaming"
      : uploadingAttachments()
      ? "Attachment upload in progress"
      : undefined;

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
    setProjectRulesDraft(activeProject()?.projectRuleSource?.content ?? "");
    setThreadMemoryDraft(activeProject()?.threadMemorySummary?.content ?? "");
    setDraftAttachments([]);
    setUploadingAttachments(false);
  });

  createEffect(() => {
    if (state.uiMode === "simple" && activeTab() === "events") {
      setActiveTab("chat");
    }
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

  async function handleSelectAttachments(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const project = activeProject();
    const files = input.files ? [...input.files] : [];
    input.value = "";

    if (!project || files.length === 0) {
      return;
    }

    if (!state.attachmentsEnabled) {
      pushToast("Attachments unavailable", "Set UPLOADTHING_TOKEN on the server to enable uploads.", "error");
      return;
    }

    if (draftAttachments().length + files.length > MAX_CHAT_ATTACHMENT_COUNT) {
      pushToast("Too many attachments", `Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`, "error");
      return;
    }

    for (const file of files) {
      const validation = isSupportedChatAttachment({
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      });
      if (!validation.ok) {
        pushToast("Attachment rejected", `${file.name}: ${validation.reason}`, "error");
        return;
      }
    }

    setUploadingAttachments(true);
    try {
      const uploadedFiles = await uploadFiles("chatAttachment", {
        files,
        input: {
          projectId: project.id,
          threadId: project.activeThreadId
        }
      });

      const nextAttachments = uploadedFiles.flatMap((file) => {
        const kind = detectChatAttachmentKind({ name: file.name, mimeType: file.type });
        if (!kind) {
          return [];
        }

        return [
          {
            id: `${file.key}-${file.lastModified ?? Date.now()}`,
            kind,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            url: file.serverData?.url ?? file.ufsUrl ?? file.url,
            key: file.serverData?.key ?? file.key,
            uploadedAt: file.serverData?.uploadedAt ?? new Date().toISOString()
          } satisfies ChatAttachment
        ];
      });

      setDraftAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      pushToast(
        "Attachment upload failed",
        error instanceof Error ? error.message : "UploadThing could not upload the selected files.",
        "error"
      );
    } finally {
      setUploadingAttachments(false);
    }
  }

  function handleRemoveAttachment(attachmentId: string) {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const project = activeProject();
    if (!project) {
      return;
    }
    const content = project.draft.trim();
    if (!content && draftAttachments().length === 0) {
      return;
    }
    if (!content && draftAttachments().length > 0) {
      pushToast("Task text required", "Describe what pi should do with the attached files.", "error");
      return;
    }

    if (uploadingAttachments()) {
      pushToast("Upload in progress", "Wait for attachments to finish uploading before sending.", "error");
      return;
    }

    if (hasImageDraftAttachments() && !hasVisionCapability()) {
      pushToast(
        "Vision model required",
        "Current model cannot inspect attached images. Switch to a vision-capable model before sending.",
        "error"
      );
      return;
    }

    const question = pendingQuestion();
    if (question && project.activeRun) {
      if (draftAttachments().length > 0) {
        pushToast("Attachments not supported here", "Attachments are only supported on new top-level tasks right now.", "error");
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
          content
        }
      });

      harnessStore.setProjectDraft(project.id, "");
      return;
    }

    if (project.activeRun?.status === "ready") {
      if (draftAttachments().length > 0) {
        pushToast("Attachments not supported here", "Attachments are only supported on new top-level tasks right now.", "error");
        return;
      }

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
        attachments: draftAttachments(),
        modeId: activeMode()?.id,
        executionModelId,
        debug: state.debugEnabled
      }
    });

    harnessStore.setProjectDraft(project.id, "");
    setDraftAttachments([]);
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

  function handleModeSelect(modeId: string) {
    const project = activeProject();
    if (!project) {
      return;
    }

    props.sendCommand({
      type: "project.mode.select",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        modeId
      }
    });
  }

  function handleSaveProjectContext() {
    const project = activeProject();
    if (!project) {
      return;
    }

    props.sendCommand({
      type: "project.context.save",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        rulesContent: projectRulesDraft().trim() || undefined,
        threadMemorySummaryContent: threadMemoryDraft().trim() || undefined
      }
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
                First run
              </div>
              <h1 class="mt-4 font-display text-[1.75rem] tracking-[-0.06em] text-[color:var(--foreground)] md:text-[2.1rem]">
                Start with repo, import, or pasted spec
              </h1>
              <p class="mt-3 max-w-2xl text-[0.75rem] leading-6 text-[color:var(--muted)]">
                Task-first flow: open codebase, optionally import local defaults, then ask for plan or implementation. No API-key wall.
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
                  <ActionButton
                    tooltip="Open import and workspace setup"
                    icon={<Edit3 class="h-4 w-4" />}
                    variant="secondary"
                    onClick={() => harnessStore.openPreferencesModal()}
                  >
                    Import config
                  </ActionButton>
                </div>
                <div class="rounded-[1rem] border border-[color:var(--border)] bg-white/70 p-3 text-[0.675rem] leading-6 text-[color:var(--muted)]">
                  Sample task: “Inspect recent auth changes, plan fix for flaky login, then implement with tests.”
                </div>
                <div class="rounded-[1rem] border border-[color:var(--border)] bg-white/70 p-3 text-[0.675rem] leading-6 text-[color:var(--muted)]">
                  Open repo, attach screenshots or text-like specs, then ask for a plan. Images route to vision-capable models; text-like files get folded into prompt context.
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

            <div class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/65 p-4 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Task cockpit
                  </div>
                  <div class="text-[0.75rem] text-[color:var(--foreground)]">
                    Status: {project().activeRun?.status ?? project().lastRun?.status ?? "idle"} | Mode: {activeMode()?.label ?? "Implement"} |
                    Model: {getEffectiveExecutionModelId()}
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <For each={capabilityTags()}>
                      {(tag) => (
                        <span class="rounded-full border border-[color:var(--border)] bg-white/75 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <For each={visibleTabs()}>
                    {(tab) => (
                      <button
                        class={`rounded-full border px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] transition ${
                          activeTab() === tab
                            ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                            : "border-[color:var(--border)] bg-white/70 text-[color:var(--foreground)]"
                        }`}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                      >
                        {tab}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </div>

            <Switch>
              <Match when={activeTab() === "chat"}>
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
                            <Show when={message.attachments?.length}>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <For each={message.attachments}>
                                  {(attachment) => (
                                    <a
                                      class="rounded-full border border-[color:var(--border)] bg-white/75 px-2.5 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                                      href={attachment.url}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {attachment.kind} | {attachment.name}
                                    </a>
                                  )}
                                </For>
                              </div>
                            </Show>
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
              </Match>
              <Match when={activeTab() === "plan"}>
                <ScrollArea class="flex-1 min-h-0 space-y-4 pr-2">
                  <div class="space-y-4">
                    <div class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/55 p-4">
                      <div class="grid gap-3 md:grid-cols-2">
                        <label class="space-y-2">
                          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Active mode</span>
                          <select
                            class="flex h-10 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                            value={activeMode()?.id ?? "implement"}
                            onInput={(event) => handleModeSelect(event.currentTarget.value)}
                          >
                            <For each={resolvedModes()}>
                              {(mode) => <option value={mode.id}>{mode.label}</option>}
                            </For>
                          </select>
                        </label>
                        <div class="rounded-[1rem] border border-[color:var(--border)] bg-white/70 p-3 text-[0.675rem] leading-5 text-[color:var(--muted)]">
                          {activeMode()?.description ?? "Default implementation mode."}
                        </div>
                      </div>
                    </div>

                    <div class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/55 p-4">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Project context</div>
                          <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">
                            Rules and working memory flow into planner and execution prompts.
                          </div>
                        </div>
                        <ActionButton tooltip="Save project rules and thread memory" size="sm" onClick={handleSaveProjectContext}>
                          Save context
                        </ActionButton>
                      </div>
                      <div class="mt-4 grid gap-3 md:grid-cols-2">
                        <label class="space-y-2">
                          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Project rules</span>
                          <Textarea rows="8" value={projectRulesDraft()} onInput={(event) => setProjectRulesDraft(event.currentTarget.value)} />
                        </label>
                        <label class="space-y-2">
                          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Thread memory</span>
                          <Textarea rows="8" value={threadMemoryDraft()} onInput={(event) => setThreadMemoryDraft(event.currentTarget.value)} />
                        </label>
                      </div>
                    </div>

                    <ModeEditorPanel
                      title="Project custom modes"
                      scope="project"
                      modes={project().projectModes ?? []}
                      onSave={(mode) =>
                        props.sendCommand({
                          type: "mode.save",
                          requestId: createRequestId(),
                          payload: {
                            scope: "project",
                            projectId: project().id,
                            mode
                          }
                        })
                      }
                      onDelete={(modeId) =>
                        props.sendCommand({
                          type: "mode.delete",
                          requestId: createRequestId(),
                          payload: {
                            scope: "project",
                            projectId: project().id,
                            modeId
                          }
                        })
                      }
                    />

                    <Show when={currentExecutionPlan()}>
                      {(plan) => (
                        <div class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/55 p-4 text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                          <div class="flex items-center justify-between gap-3">
                            <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Current plan snapshot</div>
                            <ActionButton tooltip="Open full execution plan" size="sm" variant="secondary" onClick={() => harnessStore.openExecutionPlanDialog(plan())}>
                              Open plan
                            </ActionButton>
                          </div>
                          <div class="mt-3">{plan().summary}</div>
                        </div>
                      )}
                    </Show>
                  </div>
                </ScrollArea>
              </Match>
              <Match when={activeTab() === "run"}>
                <ScrollArea class="flex-1 min-h-0 space-y-4 pr-2">
                  <div class="space-y-4">
                    <div class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/55 p-4 text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Run summary</div>
                      <div class="mt-2">Status: {project().activeRun?.status ?? project().lastRun?.status ?? "idle"}</div>
                      <div>Retryable: {project().lastRun?.retryable ? "yes" : "no"}</div>
                      <div>Resumable: {project().activeRun?.resumable ? "yes" : "no"}</div>
                      <div>Prompt: {project().activeRun?.latestUserPrompt ?? project().lastRun?.latestUserPrompt ?? "n/a"}</div>
                    </div>
                    <For each={project().activeRun?.subtasks ?? project().lastRun?.subtasks ?? []}>
                      {(task) => (
                        <div class="rounded-[1.2rem] border border-[color:var(--border)] bg-white/60 p-4 text-[0.675rem] leading-6 text-[color:var(--foreground)]">
                          <div class="font-semibold">{task.title}</div>
                          <div class="text-[color:var(--muted)]">Status: {task.status} | Attempts: {task.attemptCount}</div>
                          <Show when={task.output}>
                            <div class="mt-2 whitespace-pre-wrap">{task.output}</div>
                          </Show>
                          <Show when={task.errorMessage}>
                            <div class="mt-2 whitespace-pre-wrap text-rose-900/80">{task.errorMessage}</div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </ScrollArea>
              </Match>
              <Match when={activeTab() === "events"}>
                <ScrollArea class="flex-1 min-h-0 space-y-4 pr-2">
                  <Show
                    when={project().traces.length > 0}
                    fallback={
                      <div class="flex min-h-56 items-center justify-center rounded-[1.5rem] border border-dashed border-[color:var(--border)] bg-white/40 p-8 text-center text-[0.675rem] text-[color:var(--muted)]">
                        No execution events yet.
                      </div>
                    }
                  >
                    <div class="space-y-3">
                      <For each={project().traces}>
                        {(trace) => (
                          <article class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/55 p-4">
                            <div class="mb-2 flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-strong)]">
                              <span>{trace.stage}</span>
                              <span>{trace.modelId ?? "n/a"}</span>
                            </div>
                            <div class="whitespace-pre-wrap text-[0.675rem] leading-5 text-[color:var(--foreground)]">{trace.message}</div>
                            <Show when={trace.detail}>
                              <div class="mt-2 whitespace-pre-wrap text-[0.675rem] leading-5 text-[color:var(--muted)]">{trace.detail}</div>
                            </Show>
                          </article>
                        )}
                      </For>
                    </div>
                  </Show>
                </ScrollArea>
              </Match>
            </Switch>

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
              <input
                ref={attachmentInput}
                class="hidden"
                type="file"
                multiple
                accept="image/*,.txt,.md,.markdown,.json,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.sql,.sh,.bash,.zsh,.ini,.toml,.env,.csv,.log"
                onChange={handleSelectAttachments}
              />

              <Show when={draftAttachments().length > 0 || uploadingAttachments()}>
                <div class="flex flex-wrap gap-2">
                  <For each={draftAttachments()}>
                    {(attachment) => (
                      <span class="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/75 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                        <span>{attachment.kind}</span>
                        <span class="max-w-56 truncate normal-case tracking-normal">{attachment.name}</span>
                        <ActionButton
                          tooltip="Remove attachment"
                          icon={<X class="h-3 w-3" />}
                          size="icon"
                          variant="ghost"
                          ariaLabel={`Remove ${attachment.name}`}
                          onClick={() => handleRemoveAttachment(attachment.id)}
                        />
                      </span>
                    )}
                  </For>
                  <Show when={uploadingAttachments()}>
                    <span class="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/75 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      <LoaderCircle class="h-3 w-3 animate-spin" />
                      Uploading attachments
                    </span>
                  </Show>
                </div>
              </Show>

              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="space-y-2 text-[0.675rem] text-[color:var(--muted)]">
                  <div class="flex flex-wrap items-center gap-2">
                    <span>Mode</span>
                    <select
                      class="h-9 rounded-xl border border-[color:var(--border)] bg-white/70 px-3 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                      value={activeMode()?.id ?? "implement"}
                      onInput={(event) => handleModeSelect(event.currentTarget.value)}
                    >
                      <For each={resolvedModes()}>
                        {(mode) => <option value={mode.id}>{mode.label}</option>}
                      </For>
                    </select>
                    <span>Agent: {project().session.selectedAgentId ?? "pi"}</span>
                    <span>Model: {getEffectiveExecutionModelId()}</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <For each={capabilityTags()}>
                      {(tag) => (
                        <span class="rounded-full border border-[color:var(--border)] bg-white/70 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                  <div>{composerContextText()}</div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <ActionButton
                    tooltip="Attach screenshots or text-like files"
                    disabledReason={attachmentButtonReason()}
                    disabled={attachmentButtonDisabled()}
                    icon={<Paperclip class="h-4 w-4" />}
                    type="button"
                    variant="secondary"
                    onClick={() => attachmentInput?.click()}
                  >
                    Attach files
                  </ActionButton>
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
                      uploadingAttachments()
                        ? "Attachment upload in progress"
                        : hasImageDraftAttachments() && !hasVisionCapability()
                        ? "Current model lacks vision support for image attachments"
                        : project().session.isStreaming
                        ? "Project is streaming"
                        : resumableRun()
                        ? "Use resume failed agents to continue this run"
                        : "Enter task text"
                    }
                    disabled={
                      !project().draft.trim() ||
                      Boolean(resumableRun()) ||
                      project().session.isStreaming ||
                      uploadingAttachments() ||
                      (hasImageDraftAttachments() && !hasVisionCapability())
                    }
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
