import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createHotkeys } from "@tanstack/solid-hotkeys";
import { createRequestId, type ChatAttachment, type ChatMessage, type SetupAction } from "../../../shared/protocol";
import {
  detectSupportedChatAttachment,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_COUNT
} from "../../../shared/chat-attachments";
import {
  canSelectProviderBrand,
  COMPOSER_REASONING_STRENGTHS,
  getEffectiveProviderBrandForAgent,
  getActiveProject,
  getActiveMode,
  getCapabilityTags,
  getBlockingSetupCheck,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getFallbackExecutionModelIdForAgent,
  getResolvedModes,
  harnessStore,
  hasUsableApiKeyForProvider,
  persistLocalPreferences,
  shouldShowSetupChecklist
} from "../harness-store";
import { uploadFiles } from "../lib/uploadthing";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { CliSessionPanel } from "./cli-session-panel";
import { MarkdownContent } from "./markdown-content";
import { ModeEditorPanel } from "./mode-editor-panel";
import { SetupChecklistCard } from "./setup-checklist-card";
import { Dialog } from "./primitives/dialog";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Input } from "./primitives/input";
import { Popover } from "./primitives/popover";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import { buttonVariants } from "./primitives/button";
import {
  Activity,
  Brain,
  ClipboardList,
  Clipboard,
  Edit3,
  FolderOpen,
  Folder,
  LoaderCircle,
  MessageSquareMore,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  ArrowDown,
  Check,
  SendHorizontal,
  Settings2,
  X,
  Split
} from "lucide-solid";
import { cn } from "../lib/utils";

export function ChatPanel() {
  let messageViewport: HTMLDivElement | undefined;
  let attachmentInput: HTMLInputElement | undefined;
  let composerTextarea: HTMLTextAreaElement | undefined;
  let countdownTimer: number | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const [stickToBottom, setStickToBottom] = createSignal(true);
  const [editingThreadTitle, setEditingThreadTitle] = createSignal(false);
  const [threadTitleDraft, setThreadTitleDraft] = createSignal("");
  const [countdownRunId, setCountdownRunId] = createSignal<string>();
  const [countdownRemainingMs, setCountdownRemainingMs] = createSignal(0);
  const [countdownPaused, setCountdownPaused] = createSignal(false);
  const [countdownFrozenByExecutionPause, setCountdownFrozenByExecutionPause] = createSignal(false);
  const [autoExecutedRunId, setAutoExecutedRunId] = createSignal<string>();
  const [activeTab, setActiveTab] = createSignal<"chat" | "plan" | "run" | "events" | "memory">("chat");
  const currentTab = createMemo(activeTab);
  const [experimentDialogOpen, setExperimentDialogOpen] = createSignal(false);
  const [projectRulesDraft, setProjectRulesDraft] = createSignal("");
  const [threadMemoryDraft, setThreadMemoryDraft] = createSignal("");
  const [draftAttachments, setDraftAttachments] = createSignal<ChatAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = createSignal(false);
  const [composerSettingsOpen, setComposerSettingsOpen] = createSignal(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = createSignal(false);
  const pendingQuestion = () => activeProject()?.activeRun?.questions.find((question) => question.status === "pending");
  const resumableRun = () => (activeProject()?.activeRun?.resumable ? activeProject()?.activeRun : undefined);
  const retryableRun = () => (activeProject()?.lastRun?.retryable ? activeProject()?.lastRun : undefined);
  const readyRun = () => (activeProject()?.activeRun?.status === "ready" ? activeProject()?.activeRun : undefined);
  const activeThread = () => activeProject()?.threads.find((thread) => thread.id === activeProject()?.activeThreadId);
  const currentExecutionPlan = () => activeProject()?.latestPlan?.executionPlan ?? readyRun()?.plan;
  const resolvedModes = () => getResolvedModes(state, activeProject());
  const activeMode = () => getActiveMode(state, activeProject());
  const capabilityTags = () => getCapabilityTags(state, getEffectiveExecutionModelId());
  const selectedAgentId = () => state.selectedAgentId;
  const selectedProviderBrand = () => getEffectiveProviderBrandForAgent(selectedAgentId(), state.providerBrand);
  const availableExecutionModels = () => getExecutionModelOptionsForAgent(state, selectedAgentId(), state.providerBrand);
  const selectedAgentRuntime = () => state.agentRuntimes.find((runtime) => runtime.agentId === selectedAgentId());
  const composerControlState = () => getComposerControlState(state, selectedAgentId(), getEffectiveExecutionModelId());
  const selectedReasoningStrength = () => composerControlState().selectedReasoningStrength;
  const selectedFastMode = () => composerControlState().selectedFastMode;
  const composerReasoningLabel = () => formatReasoningStrengthLabel(selectedReasoningStrength());
  const composerSettingsLabel = () => (selectedFastMode() ? `${composerReasoningLabel()} · Fast` : composerReasoningLabel());
  const selectedAgentLabel = () => state.availableAgents.find((agent) => agent.id === selectedAgentId())?.label ?? "selected agent";
  const selectedAgentHealthMessage = () => {
    const runtime = selectedAgentRuntime();
    if (!runtime || runtime.agentId === "pi") {
      return undefined;
    }

    if (!runtime.installed || !runtime.authenticated) {
      return runtime.healthMessage ?? `${runtime.label} unavailable`;
    }

    return runtime.healthMessage;
  };
  const hasVisionCapability = () => capabilityTags().includes("vision");
  const hasImageDraftAttachments = () => draftAttachments().some((attachment) => attachment.kind === "image");
  const blockingSetupCheck = () => getBlockingSetupCheck(state);
  const visibleTabs = () =>
    [
      { id: "chat" as const, label: "Chat", icon: <MessageSquareMore class="h-3.5 w-3.5" />, tooltip: "Open transcript and plan cards" },
      { id: "plan" as const, label: "Plan", icon: <ClipboardList class="h-3.5 w-3.5" />, tooltip: "Open planning context and saved plan tools" },
      { id: "run" as const, label: "Run", icon: <Play class="h-3.5 w-3.5" />, tooltip: "Open run status, subtasks, and experiment actions" },
      { id: "memory" as const, label: "Memory", icon: <Brain class="h-3.5 w-3.5" />, tooltip: "Open shared memory entries" },
      { id: "events" as const, label: "Events", icon: <Activity class="h-3.5 w-3.5" />, tooltip: "Open execution event history" }
    ] as const;
  const experimentRun = () => activeProject()?.activeRun?.experiment ?? activeProject()?.lastRun?.experiment;
  const failedSubtaskCount = () =>
    activeProject()?.activeRun?.subtasks.filter((task) => task.status === "failed").length ?? 0;
  const contextUsage = () => activeProject()?.contextUsage;
  const attachmentButtonDisabled = () => !state.attachmentsEnabled || activeProject()?.session.isStreaming || uploadingAttachments();
  const attachmentButtonReason = () =>
    !state.attachmentsEnabled
      ? "Set UPLOADTHING_TOKEN on the server to enable attachments"
      : activeProject()?.session.isStreaming
        ? "Project is streaming"
        : uploadingAttachments()
          ? "Attachment upload in progress"
          : undefined;
  const requiresFreshTopLevelSend = () =>
    !pendingQuestion() && activeProject()?.activeRun?.status !== "ready" && !resumableRun();
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = () => "Global execution pause is active";
  const setupBlockedReason = () =>
    requiresFreshTopLevelSend() && blockingSetupCheck() ? blockingSetupCheck()!.summary : undefined;
  const isComposerFocused = () => document.activeElement === composerTextarea;

  createHotkeys(
    [
      {
        hotkey: "Enter",
        callback: () => {
          if (!isComposerFocused() || executionPaused()) {
            return;
          }

          composerTextarea?.form?.requestSubmit();
        },
        options: {
          preventDefault: true,
          meta: {
            name: "Send message",
            description: "Submit the focused chat composer with Enter"
          }
        }
      }
    ],
    () => ({
      enabled: isComposerFocused(),
      ignoreInputs: false
    })
  );

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
    activeProject()?.draft;
    queueMicrotask(() => {
      resizeComposer();
    });
  });

  createEffect(() => {
    if (currentTab() === "memory" && activeProject()) {
      handleLoadMemoryEntries();
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
      if (!executionPaused() && autoExecutedRunId() !== run.id) {
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
      if (!executionPaused() && countdownTimer === undefined && !countdownPaused() && countdownRemainingMs() > 0) {
        startCountdown(run.id);
      }
      return;
    }

    clearCountdown();
    setCountdownRunId(run.id);
    setCountdownPaused(false);
    setCountdownFrozenByExecutionPause(false);
    setCountdownRemainingMs(executionPlan.gating.delaySeconds * 1000);
    if (!executionPaused()) {
      startCountdown(run.id);
    }
  });

  createEffect(() => {
    const run = readyRun();
    if (!run || countdownRunId() !== run.id) {
      setCountdownFrozenByExecutionPause(false);
      return;
    }

    if (executionPaused()) {
      if (countdownTimer !== undefined) {
        window.clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
      setCountdownFrozenByExecutionPause(true);
      return;
    }

    if (countdownFrozenByExecutionPause() && countdownTimer === undefined && !countdownPaused() && countdownRemainingMs() > 0) {
      setCountdownFrozenByExecutionPause(false);
      startCountdown(run.id);
    }
  });

  function startCountdown(runId: string) {
    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
    }

    countdownTimer = window.setInterval(() => {
      setCountdownRemainingMs((value) => {
        const next = Math.max(0, value - 100);
        if (next === 0 && readyRun()?.id === runId && autoExecutedRunId() !== runId && !executionPaused()) {
          clearCountdown();
          handleExecuteRun(runId);
          setAutoExecutedRunId(runId);
        }
        return next;
      });
    }, 100);
  }

  async function handleSetupAction(action: SetupAction) {
    switch (action.kind) {
      case "open-project-switcher":
        harnessStore.openProjectSwitcher();
        return;
      case "open-preferences":
        harnessStore.openPreferencesModal();
        return;
      case "refresh-runtime-health":
        sendCommand({
          type: "agent.runtime.refresh",
          requestId: createRequestId()
        });
        return;
      case "copy-command":
        if (!action.value) {
          return;
        }

        try {
          await navigator.clipboard.writeText(action.value);
          pushToast("Command copied", action.value);
        } catch {
          pushToast("Clipboard blocked", action.value, "error");
        }
        return;
      case "open-url":
        if (action.value) {
          window.open(action.value, "_blank", "noopener,noreferrer");
        }
        return;
      case "start-tutorial":
        if (action.value) {
          harnessStore.startTutorial(action.value);
        }
        return;
    }
  }

  function clearCountdown() {
    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
    setCountdownRunId(undefined);
    setCountdownRemainingMs(0);
    setCountdownPaused(false);
    setCountdownFrozenByExecutionPause(false);
  }

  function handleQuestionChoice(answerText: string) {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const question = pendingQuestion();
    if (!project || !question || !project.activeRun) {
      return;
    }

    sendCommand({
      type: "planning.answer",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: project.activeRun.id,
        questionId: question.id,
        content: answerText,
        ...getComposerControlPayload()
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
        const detectedAttachment = detectSupportedChatAttachment({ name: file.name, mimeType: file.type });
        if (!detectedAttachment) {
          return [];
        }

        return [
          {
            id: `${file.key}-${file.lastModified ?? Date.now()}`,
            kind: detectedAttachment.kind,
            documentType: detectedAttachment.kind === "document" ? detectedAttachment.documentType : undefined,
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

    if (executionPaused()) {
      return;
    }

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

      sendCommand({
        type: "planning.answer",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          questionId: question.id,
          content,
          ...getComposerControlPayload()
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

      sendCommand({
        type: "planning.refine",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          content,
          ...getComposerControlPayload()
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

    if (selectedAgentId() === "pi" && !hasUsableApiKeyForProvider(state, state.providerBrand)) {
      pushToast(
        `${state.providerBrand === "gemini" ? "Gemini" : "GPT"} API key required`,
        "Open preferences and add matching provider key before sending chat.",
        "error"
      );
      harnessStore.openPreferencesModal();
      return;
    }

    if (selectedAgentId() !== "pi") {
      const runtime = selectedAgentRuntime();
      if (!runtime?.installed || !runtime.authenticated) {
        pushToast("CLI runtime unavailable", runtime?.healthMessage ?? "Install and authenticate selected runtime first.", "error");
        return;
      }
    }

    const executionModelId = getEffectiveExecutionModelId();

    sendCommand({
      type: "chat.send",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        agentId: selectedAgentId(),
        content,
        attachments: draftAttachments(),
        modeId: activeMode()?.id,
        executionModelId,
        ...getComposerControlPayload(),
        debug: state.debugEnabled
      }
    });

    harnessStore.setProjectDraft(project.id, "");
    setDraftAttachments([]);
  }

  function handleSelectAgent(agentId: "pi" | "copilot-cli" | "codex-cli") {
    harnessStore.setSelectedAgentId(agentId);
  }

  function resizeComposer() {
    if (!composerTextarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(composerTextarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 18;
    const minHeight = lineHeight * 2;
    const maxHeight = lineHeight * 8;
    composerTextarea.style.height = "auto";
    const nextHeight = Math.max(minHeight, Math.min(composerTextarea.scrollHeight, maxHeight));
    composerTextarea.style.height = `${nextHeight}px`;
  }

  function handleStartLiveSession() {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const runtime = selectedAgentRuntime();
    if (!project || !runtime || runtime.agentId === "pi") {
      return;
    }

    sendCommand({
      type: "cli-session.start",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        agentId: runtime.agentId,
        cols: 120,
        rows: 32,
        prompt: project.draft.trim() || undefined,
        runId: project.activeRun?.id
      }
    });
  }

  function handleExecuteRun(runId: string) {
    handleExecuteRunTarget(runId, "current-project");
  }

  function handleExecuteRunTarget(runId: string, target: "current-project" | "ephemeral-experiment") {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "run.execute",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId,
        target,
        ...getComposerControlPayload()
      }
    });
  }

  function handleInspectExperiment() {
    const project = activeProject();
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    if (!project || !run?.experiment) {
      return;
    }

    setExperimentDialogOpen(true);
    sendCommand({
      type: "experiment.inspect",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function handlePromoteExperiment() {
    const project = activeProject();
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    if (!project || !run?.experiment) {
      return;
    }

    sendCommand({
      type: "experiment.promote",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function handleDiscardExperiment() {
    const project = activeProject();
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    if (!project || !run?.experiment) {
      return;
    }

    sendCommand({
      type: "experiment.discard",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function handleLoadMemoryEntries() {
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "memory.list",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleUpdateMemory(entryId: string, patch: { pinned?: boolean; status?: "active" | "archived" }) {
    sendCommand({
      type: "memory.update",
      requestId: createRequestId(),
      payload: {
        memoryEntryId: entryId,
        ...patch
      }
    });
  }

  function handleDeleteMemory(entryId: string) {
    sendCommand({
      type: "memory.delete",
      requestId: createRequestId(),
      payload: {
        memoryEntryId: entryId
      }
    });
  }

  function handleResume() {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const run = resumableRun();
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.resume",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        guidanceText: project.draft.trim() || undefined,
        ...getComposerControlPayload()
      }
    });

    harnessStore.setProjectDraft(project.id, "");
  }

  function handleReset() {
    const project = activeProject();
    if (!project) {
      return;
    }
    sendCommand({
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
    sendCommand({
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
    sendCommand({
      type: "chat.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId
      }
    });
  }

  function handleRetry() {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const run = retryableRun();
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        ...getComposerControlPayload()
      }
    });
  }

  function handlePauseAutoRun() {
    if (countdownRunId() === undefined || executionPaused()) {
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
    if (!runId || !run || run.id !== runId || countdownRemainingMs() <= 0 || executionPaused()) {
      return;
    }

    setCountdownPaused(false);
    startCountdown(run.id);
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

    sendCommand({
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

  function getCopyableMessageText(message: ChatMessage) {
    if (message.kind !== "plan-summary" || message.metadata?.type !== "plan-summary") {
      return message.content;
    }

    const { plan } = message.metadata;
    return [
      "Plan summary",
      plan.summary,
      `Route: ${plan.route}`,
      `Difficulty: ${plan.difficultyScore}%`,
      `Prereqs: ${plan.prerequisites.length}`,
      `Contracts: ${plan.contracts.length}`,
      `Isolation: ${plan.subagentWorktreeStrategy}`,
      `Correctness: ${plan.correctnessPolicy}`
    ].join("\n");
  }

  function getEffectiveExecutionModelId() {
    return state.selectedExecutionModelId ?? getFallbackExecutionModelIdForAgent(state, selectedAgentId(), state.providerBrand);
  }

  function getContextUsageTooltip() {
    const usage = contextUsage();
    if (!usage) {
      return undefined;
    }

    const summary = `${Math.round(usage.usagePercent ?? 0)}% · ${formatTokenCount(usage.tokens)} / ${formatTokenCount(usage.contextWindow)} context used`;
    const totalProcessedLine =
      usage.totalProcessedTokens === undefined ? undefined : `Total processed: ${formatTokenCount(usage.totalProcessedTokens)} tokens`;
    return [summary, totalProcessedLine, "Automatically compacts its context when needed."].filter(Boolean).join("\n");
  }

  function handleProviderBrandSelect(providerBrand: "gpt" | "gemini") {
    if (!canSelectProviderBrand(state, providerBrand)) {
      pushToast("Provider key required", `Saved ${providerBrand === "gemini" ? "Gemini" : "GPT"} key required.`, "error");
      return;
    }

    harnessStore.setProviderBrand(providerBrand);
    persistProviderPreferences(providerBrand);
  }

  function persistProviderPreferences(providerBrand: "gpt" | "gemini") {
    persistLocalPreferences({
      openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
      googleApiKey: state.googleApiKeyDraft.trim() || undefined,
      providerBrand,
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
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault
    });

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        providerBrand,
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
        memoryBankEnabledDefault: state.memoryBankEnabledDefault
      }
    });
  }

  function handleExecutionModelSelect(modelId: string) {
    harnessStore.setSelectedExecutionModelId(modelId);
  }

  function handleReasoningStrengthSelect(reasoningStrength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
    harnessStore.setSelectedReasoningStrength(reasoningStrength);
  }

  function handleFastModeSelect(enabled: boolean) {
    harnessStore.setSelectedFastMode(enabled);
  }

  function getComposerControlPayload() {
    return {
      reasoningStrength: selectedReasoningStrength(),
      fastMode: selectedFastMode()
    };
  }

  function renderComposerControlMenu() {
    const disabledHint =
      COMPOSER_REASONING_STRENGTHS.some((strength) => !composerControlState().availableStrengths.includes(strength)) ||
      !composerControlState().supportsFastMode
        ? "Unavailable for current runtime/model."
        : undefined;

    return (
      <div class="flex min-w-56 flex-col gap-3">
        <div class="flex flex-col gap-1">
          <span class="px-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-(--muted)">Effort</span>
          <For each={COMPOSER_REASONING_STRENGTHS}>
            {(strength) => {
              const enabled = composerControlState().availableStrengths.includes(strength);
              const selected = selectedReasoningStrength() === strength;
              return (
                <button
                  type="button"
                  disabled={!enabled}
                  class="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-(--foreground) transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    if (!enabled) {
                      return;
                    }
                    handleReasoningStrengthSelect(strength);
                  }}
                >
                  <span>{formatReasoningOptionLabel(strength)}</span>
                  <Show when={selected}>
                    <Check class="h-3.5 w-3.5" />
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
        <div class="h-px bg-black/10" />
        <div class="flex flex-col gap-1">
          <span class="px-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-(--muted)">Fast Mode</span>
          <For each={[false, true] as const}>
            {(enabled) => {
              const supported = !enabled || composerControlState().supportsFastMode;
              const selected = selectedFastMode() === enabled;
              return (
                <button
                  type="button"
                  disabled={!supported}
                  class="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-(--foreground) transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    if (!supported) {
                      return;
                    }
                    handleFastModeSelect(enabled);
                  }}
                >
                  <span>{enabled ? "On" : "Off"}</span>
                  <Show when={selected}>
                    <Check class="h-3.5 w-3.5" />
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={disabledHint}>
          <div class="px-1 text-[0.625rem] text-(--muted)">{disabledHint}</div>
        </Show>
      </div>
    );
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

    return `Ask ${selectedAgentId()} to work inside ${project.rootPath}...`;
  }

  function handleBrowseProject() {
    sendCommand({
      type: "project.browse",
      requestId: createRequestId()
    });
  }

  function handleModeSelect(modeId: string) {
    harnessStore.setSelectedModeId(modeId);
  }

  function handleSaveProjectContext() {
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "project.context.save",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        rulesContent: projectRulesDraft().trim() || undefined,
        threadMemorySummaryContent: threadMemoryDraft().trim() || undefined
      }
    });
  }

  function handlePromoteScheduledRun(runId?: string) {
    const project = activeProject();
    if (!project) {
      return;
    }

    const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId) ?? project.activeRun ?? project.lastRun;
    if (!run) {
      pushToast("Run required", "No AI run available to promote.", "error");
      return;
    }

    const suggestedName =
      run.summary?.split(".")[0]?.trim() ||
      run.latestUserPrompt.replace(/\s+/g, " ").trim().slice(0, 64) ||
      "Scheduled task";

    harnessStore.openBackgroundJobEditor({
      source: "promote",
      projectId: project.id,
      createdFromRunId: run.id,
      kind: "ai-routine",
      name: suggestedName,
      description: "",
      scheduleInput: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      aiPrompt: run.latestUserPrompt,
      aiModeId: activeMode()?.id,
      aiExecutionModelId: run.executionModelId ?? getEffectiveExecutionModelId(),
      aiPlanExecutionMode: run.plan?.gating.mode ?? state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy: run.plan?.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault,
      shellExecutable: "",
      shellArgsText: "",
      shellCwd: "",
      shellEnvRefsText: "",
      shellTimeoutSeconds: 600,
      shellNetworkAccess: false
    });
  }

  return (
    <section data-test-chat-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-1 rounded-2xl border-t-0 p-4">
      <Show when={shouldShowSetupChecklist(state)}>
        <SetupChecklistCard
          checks={state.setup.checks}
          readyRequiredCount={state.setup.readyRequiredCount}
          totalRequiredCount={state.setup.totalRequiredCount}
          onAction={handleSetupAction}
          onOpenHelp={() => harnessStore.openHelpDialog()}
          onDismiss={() => harnessStore.closeSetupChecklist()}
        />
      </Show>
      <Show
        when={activeProject()}
        fallback={
          <div class="flex flex-1 items-center justify-center">
            <div class="flex w-full max-w-2xl flex-col gap-4 rounded-[1.75rem] border border-dashed border-(--border) bg-white/45 p-6 shadow-sm md:p-8">
              <div class="inline-flex items-center gap-2 rounded-full bg-white/65 px-3 py-1 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                First run
              </div>
              <h1 class="font-display text-[1.75rem] tracking-[-0.06em] text-(--foreground) md:text-[2.1rem]">
                Start with repo, import, or pasted spec
              </h1>
              <p class="max-w-2xl text-[0.75rem] leading-6 text-(--muted)">
                Task-first flow: open codebase, optionally import local defaults, then ask for plan or implementation. No API-key wall.
              </p>
              <div class="flex flex-col gap-3 rounded-[1.35rem] border border-(--border) bg-white/60 p-4">
                <div class="flex flex-wrap gap-2">
                  <ActionButton
                    tooltip="Open project switcher"
                    icon={<Folder class="h-4 w-4" />}
                    dataTourId="open-project"
                    onClick={() => harnessStore.openProjectSwitcher()}
                  >
                    Open project
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
                    dataTourId="help-preferences"
                    onClick={() => harnessStore.openPreferencesModal()}
                  >
                    Import config
                  </ActionButton>
                </div>
                <div class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem] leading-6 text-(--muted)">
                  Sample task: “Inspect recent auth changes, plan fix for flaky login, then implement with tests.”
                </div>
                <div class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem] leading-6 text-(--muted)">
                  Open repo, attach screenshots, PDFs, or office docs, then ask for a plan. Images route to vision-capable models; text and document files get folded into prompt context.
                </div>
              </div>
            </div>
          </div>
        }
      >
        {(project) => (
          <>
          <div class="flex min-w-0 flex-col lg:gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <div class="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  Active project
                  <span class="min-w-0 truncate text-(--foreground)">{project().name}</span>
                </div>
                <div class="min-w-0">
                  <div class="inline-flex min-w-0 max-w-full items-center gap-1.5">
                    <Show
                      when={editingThreadTitle()}
                      fallback={
                        <Tooltip content={activeThread()?.title ?? "Thread"} triggerClass="block min-w-0 max-w-full">
                          <h3 class="max-w-full truncate font-display text-[1.6875rem] tracking-[-0.06em] text-(--foreground) md:text-[2.025rem]">
                            {activeThread()?.title ?? "Thread"}
                          </h3>
                        </Tooltip>
                      }
                    >
                      <Input
                        class="max-w-2xl"
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
                      icon={<Edit3 class="h-3.5 w-3.5" />}
                      size="icon"
                      variant="ghost"
                      ariaLabel="Rename this thread"
                      onClick={handleStartRenameThread}
                    />
                  </div>
                  <div class="flex min-w-0 flex-wrap items-center gap-2 text-[0.625rem] text-(--muted)">
                    <span>thread-id</span>
                    <span class="min-w-0 max-w-full break-all font-mono text-[0.6rem]">{activeThread()?.id}</span>
                    <CopyTextButton
                      value={activeThread()?.id ?? ""}
                      tooltip="Copy thread id"
                      copiedTitle="Thread id copied"
                      copiedDescription={activeThread()?.id}
                      size="icon"
                      variant="ghost"
                      ariaLabel="Copy thread id"
                    />
                  </div>
                </div>
              </div>

              <div class="flex shrink-0 flex-wrap gap-2">
                <ActionButton
                  tooltip="Create a new thread in this project"
                  icon={<Plus class="h-4 w-4" />}
                  variant="secondary"
                  onClick={handleReset}
                />
                <ActionButton
                  tooltip="Fork current thread into a new thread"
                  icon={<Split class="h-4 w-4" />}
                  variant="secondary"
                  onClick={handleForkThread}
                />
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
                        tooltip="Retry last run"
                        disabledReason="Project is streaming"
                        disabled={project().session.isStreaming}
                        icon={<RefreshCcw class="h-4 w-4" />}
                        variant="secondary"
                        onClick={handleRetry}
                  />
                </Show>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-hidden">
            <Show when={currentTab()} keyed>
              {(selectedTab) => (
                <div class="flex h-full min-h-0 flex-col gap-2">
                  <div data-test-chat-pane-nav="" class="surface-tab-strip px-0">
                    <div class="flex flex-wrap items-center gap-1">
                      <For each={visibleTabs()}>
                        {(tab) => {
                          const pressed = selectedTab === tab.id;

                          return (
                            <Tooltip content={tab.tooltip}>
                              <button
                                type="button"
                                class={cn(buttonVariants({ variant: "ghost" }), "surface-tab")}
                                aria-label={`Open ${tab.label.toLowerCase()} pane`}
                                attr:aria-pressed={pressed ? "true" : "false"}
                                data-test-chat-pane-tab={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                              >
                                {tab.icon}
                                <span>{tab.label}</span>
                              </button>
                            </Tooltip>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <Switch>
                    <Match when={selectedTab === "chat"}>
                      <div class="relative flex min-h-0 flex-1 flex-col">
                        <ScrollArea ref={messageViewport} class="flex-1 min-h-0 pr-2" onScroll={updateScrollLock}>
                          <Show
                            when={project().session.messages.length > 0 || project().streamingAssistantText}
                            fallback={
                              <div class="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-(--border) bg-white/40 p-8 text-center text-[0.675rem] text-(--muted)">
                                Choose project, then send task. Each project keeps its own persisted thread history.
                              </div>
                            }
                          >
                            <div class="flex flex-col gap-3">
                      <For each={project().session.messages}>
                        {(message) => (
                          <Show
                            when={message.kind === "plan-summary" && message.metadata?.type === "plan-summary"}
                            fallback={
                              <article
                                class={`border border-(--border) p-3 shadow-sm ${message.role === "system"
                                  ? "rounded-[1.15rem] bg-slate-100/85"
                                  : message.role === "assistant"
                                    ? "rounded-3xl bg-teal-950/5"
                                    : "rounded-3xl bg-white/60"
                                  }`}
                              >
                                <div class="flex flex-col gap-3">
                                <div
                                  class={`text-[0.585rem] font-semibold uppercase tracking-[0.2em] ${message.role === "system"
                                    ? "text-(--muted)"
                                    : "text-(--accent-strong)"
                                    }`}
                                >
                                  {message.role === "system" ? "status" : message.role}
                                </div>
                                <MarkdownContent content={() => message.content} size="compact" />
                                <Show when={message.attachments?.length}>
                                  <div class="flex flex-wrap gap-2">
                                    <For each={message.attachments}>
                                      {(attachment) => (
                                        <a
                                          class="rounded-full border border-(--border) bg-white/75 px-2.5 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-(--muted) hover:text-(--foreground)"
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
                                <div class="flex justify-end">
                                  <CopyTextButton
                                    value={getCopyableMessageText(message)}
                                    tooltip="Copy message"
                                    copiedTitle="Message copied"
                                    copiedDescription="Message copied to clipboard."
                                    size="sm"
                                    variant="ghost"
                                    ariaLabel={`Copy ${message.role} message`}
                                  >
                                    Copy
                                  </CopyTextButton>
                                </div>
                                </div>
                              </article>
                            }
                          >
                            <article class="flex flex-col gap-3 rounded-3xl border border-(--border) bg-[linear-gradient(135deg,rgba(15,118,110,0.12),rgba(255,255,255,0.92))] p-4 shadow-sm">
                              <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--accent-strong)">
                                <Clipboard class="h-3.5 w-3.5" />
                                Plan summary
                              </div>
                              <MarkdownContent content={() => message.metadata?.plan.summary ?? ""} />
                              <div class="grid gap-2 text-[0.675rem] text-(--muted) md:grid-cols-2">
                                <div>Route: {message.metadata?.plan.route}</div>
                                <div>Difficulty: {message.metadata?.plan.difficultyScore}%</div>
                                <div>Prereqs: {message.metadata?.plan.prerequisites.length}</div>
                                <div>Contracts: {message.metadata?.plan.contracts.length}</div>
                                <div>Isolation: {message.metadata?.plan.subagentWorktreeStrategy}</div>
                                <div>Correctness: {message.metadata?.plan.correctnessPolicy}</div>
                              </div>
                              <div class="flex flex-wrap gap-2">
                                <ActionButton
                                  tooltip="Open full execution plan"
                                  icon={<Clipboard class="h-3.5 w-3.5" />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => message.metadata?.plan && harnessStore.openExecutionPlanDialog(message.metadata.plan)}
                                >
                                  Open plan
                                </ActionButton>
                                <ActionButton tooltip="Promote this run into scheduled task" size="sm" variant="secondary" onClick={() => handlePromoteScheduledRun(message.metadata?.runId)}>
                                  Schedule
                                </ActionButton>
                                <Show when={message.metadata?.plan.gating.mode === "approve"}>
                                  <ActionButton
                                    tooltip="Start execution with this plan"
                                    disabledReason={executionPaused() ? executionPauseReason() : "This plan is no longer active"}
                                    disabled={executionPaused() || !isReadyPlanMessage(message.metadata!.runId)}
                                    icon={<Play class="h-3.5 w-3.5" />}
                                    size="sm"
                                    dataTourId="plan-start"
                                    onClick={() => handleExecuteRun(message.metadata!.runId)}
                                  >
                                    Start now
                                  </ActionButton>
                                  <ActionButton
                                    tooltip="Run this plan in isolated virtual branch"
                                    disabledReason={executionPaused() ? executionPauseReason() : "This plan is no longer active"}
                                    disabled={executionPaused() || !isReadyPlanMessage(message.metadata!.runId)}
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleExecuteRunTarget(message.metadata!.runId, "ephemeral-experiment")}
                                  >
                                    Try experiment
                                  </ActionButton>
                                </Show>
                                <Show when={message.metadata?.plan.gating.mode === "countdown" && isReadyPlanMessage(message.metadata!.runId)}>
                                  <ActionButton
                                    tooltip={
                                      executionPaused()
                                        ? "Global pause freezes automatic execution countdown"
                                        : countdownPaused()
                                          ? "Resume automatic execution countdown"
                                          : "Pause automatic execution countdown"
                                    }
                                    disabled={executionPaused()}
                                    disabledReason={executionPauseReason()}
                                    icon={countdownPaused() ? <Play class="h-3.5 w-3.5" /> : <Pause class="h-3.5 w-3.5" />}
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                                  >
                                    {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                                  </ActionButton>
                                </Show>
                                <CopyTextButton
                                  value={getCopyableMessageText(message)}
                                  tooltip="Copy plan summary"
                                  copiedTitle="Plan summary copied"
                                  copiedDescription="Plan summary copied to clipboard."
                                  size="sm"
                                  variant="secondary"
                                  ariaLabel="Copy plan summary"
                                >
                                  Copy
                                </CopyTextButton>
                              </div>
                            </article>
                          </Show>
                        )}
                      </For>

                      <Show when={project().streamingAssistantText}>
                        <article class="flex flex-col gap-2 rounded-3xl border border-(--border) bg-teal-950/5 p-3 shadow-sm">
                          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--accent-strong)">
                            assistant (streaming)
                          </div>
                          <MarkdownContent content={() => project().streamingAssistantText} size="compact" live />
                          <div class="flex justify-end">
                            <CopyTextButton
                              value={project().streamingAssistantText}
                              tooltip="Copy streaming assistant message"
                              copiedTitle="Message copied"
                              copiedDescription="Message copied to clipboard."
                              size="sm"
                              variant="ghost"
                              ariaLabel="Copy streaming assistant message"
                            >
                              Copy
                            </CopyTextButton>
                          </div>
                        </article>
                      </Show>
                            </div>
                          </Show>
                        </ScrollArea>
                        <Show when={!stickToBottom()}>
                          <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                            <div class="pointer-events-auto">
                              <ActionButton
                                tooltip="Scroll to latest message"
                                icon={<ArrowDown class="h-4 w-4" />}
                                variant="secondary"
                                onClick={() => scrollToBottom(true)}
                              >
                                Scroll to latest
                              </ActionButton>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Match>
                    <Match when={selectedTab === "plan"}>
                <ScrollArea class="flex-1 min-h-0 pr-2">
                  <div class="flex flex-col gap-4">
                    <div class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
                      <div class="grid gap-3 md:grid-cols-2">
                        <label class="flex flex-col gap-2">
                          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Active mode</span>
                          <select
                            class="flex h-10 w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-[0.675rem] text-(--foreground) shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
                            value={activeMode()?.id ?? "implement"}
                            onInput={(event) => handleModeSelect(event.currentTarget.value)}
                          >
                            <For each={resolvedModes()}>
                              {(mode) => <option value={mode.id}>{mode.label}</option>}
                            </For>
                          </select>
                        </label>
                        <div class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem] leading-5 text-(--muted)">
                          {activeMode()?.description ?? "Default implementation mode."}
                        </div>
                      </div>
                    </div>

                    <div class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex flex-col gap-1">
                          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Project context</div>
                          <div class="text-[0.675rem] leading-5 text-(--muted)">
                            Rules and working memory flow into planner and execution prompts.
                          </div>
                        </div>
                        <ActionButton tooltip="Save project rules and thread memory" size="sm" onClick={handleSaveProjectContext}>
                          Save context
                        </ActionButton>
                      </div>
                      <div class="grid gap-3 pt-4 md:grid-cols-2">
                        <label class="flex flex-col gap-2">
                          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Project rules</span>
                          <Textarea rows="8" value={projectRulesDraft()} onInput={(event) => setProjectRulesDraft(event.currentTarget.value)} />
                        </label>
                        <label class="flex flex-col gap-2">
                          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Thread memory</span>
                          <Textarea rows="8" value={threadMemoryDraft()} onInput={(event) => setThreadMemoryDraft(event.currentTarget.value)} />
                        </label>
                      </div>
                    </div>

                    <ModeEditorPanel
                      title="Project custom modes"
                      scope="project"
                      modes={project().projectModes ?? []}
                      onSave={(mode) =>
                        sendCommand({
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
                        sendCommand({
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
                        <div class="flex flex-col gap-3 rounded-[1.35rem] border border-(--border) bg-white/55 p-4 text-[0.675rem] leading-6 text-(--foreground)">
                          <div class="flex items-center justify-between gap-3">
                            <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Current plan snapshot</div>
                            <ActionButton tooltip="Open full execution plan" size="sm" variant="secondary" onClick={() => harnessStore.openExecutionPlanDialog(plan())}>
                              Open plan
                            </ActionButton>
                          </div>
                          <MarkdownContent content={() => plan().summary} size="compact" />
                        </div>
                      )}
                    </Show>
                  </div>
                </ScrollArea>
                    </Match>
                    <Match when={selectedTab === "run"}>
                <ScrollArea class="flex-1 min-h-0 pr-2">
                  <div class="flex flex-col gap-4">
                    <CliSessionPanel />
                    <div class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4 text-[0.675rem] leading-6 text-(--foreground)">
                      <div class="flex items-center justify-between gap-3">
                        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Run summary</div>
                        <div class="flex flex-wrap items-center gap-2">
                          <ActionButton tooltip="Promote latest run into scheduled task" size="sm" variant="secondary" onClick={() => handlePromoteScheduledRun()}>
                            Schedule
                          </ActionButton>
                          <Show when={experimentRun()}>
                            <ActionButton tooltip="Review virtual branch diff" size="sm" variant="secondary" onClick={handleInspectExperiment}>
                              Review experiment
                            </ActionButton>
                            <ActionButton tooltip="Flush experiment changes into project and commit" size="sm" onClick={handlePromoteExperiment}>
                              Promote
                            </ActionButton>
                            <ActionButton tooltip="Discard virtual branch changes" size="sm" variant="secondary" onClick={handleDiscardExperiment}>
                              Discard
                            </ActionButton>
                          </Show>
                        </div>
                      </div>
                      <div class="flex min-w-0 flex-col gap-1 pt-2">
                        <div>Status: {project().activeRun?.status ?? project().lastRun?.status ?? "idle"}</div>
                        <div>Retryable: {project().lastRun?.retryable ? "yes" : "no"}</div>
                        <div>Resumable: {project().activeRun?.resumable ? "yes" : "no"}</div>
                        <div
                          class="truncate"
                          title={project().activeRun?.latestUserPrompt ?? project().lastRun?.latestUserPrompt ?? undefined}
                        >
                          Prompt: {project().activeRun?.latestUserPrompt ?? project().lastRun?.latestUserPrompt ?? "n/a"}
                        </div>
                      </div>
                      <Show when={experimentRun()}>
                        <div class="flex min-w-0 flex-col gap-1 pt-2">
                          <div>Virtual branch: {experimentRun()!.virtualBranchName}</div>
                          <div class="min-w-0 break-all">Mount: {experimentRun()!.projectMountPath}</div>
                          <div>
                            Diff: {experimentRun()!.filesChanged} files, +{experimentRun()!.insertions} / -{experimentRun()!.deletions}
                          </div>
                        </div>
                      </Show>
                    </div>
                    <For each={project().activeRun?.subtasks ?? project().lastRun?.subtasks ?? []}>
                      {(task) => (
                        <div class="rounded-[1.2rem] border border-(--border) bg-white/60 p-4 text-[0.675rem] leading-6 text-(--foreground)">
                          <div class="font-semibold">{task.title}</div>
                          <div class="text-(--muted)">Status: {task.status} | Attempts: {task.attemptCount}</div>
                          <Show when={task.output}>
                            <div class="pt-2">
                              <MarkdownContent content={() => task.output ?? ""} size="compact" />
                            </div>
                          </Show>
                          <Show when={task.errorMessage}>
                            <div class="pt-2">
                              <MarkdownContent content={() => task.errorMessage ?? ""} size="compact" tone="danger" />
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </ScrollArea>
                    </Match>
                    <Match when={selectedTab === "events"}>
                <ScrollArea class="flex-1 min-h-0 pr-2">
                  <Show
                    when={project().traces.length > 0}
                    fallback={
                      <div class="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-(--border) bg-white/40 p-8 text-center text-[0.675rem] text-(--muted)">
                        No execution events yet.
                      </div>
                    }
                  >
                    <div class="flex flex-col gap-3">
                      <For each={project().traces}>
                        {(trace) => (
                          <article class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
                            <div class="flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">
                              <span>{trace.stage}</span>
                              <span>{trace.modelId ?? "n/a"}</span>
                            </div>
                            <MarkdownContent content={() => trace.message} size="compact" />
                            <Show when={trace.detail}>
                              <div class="pt-2">
                                <MarkdownContent content={() => trace.detail ?? ""} size="compact" tone="muted" />
                              </div>
                            </Show>
                          </article>
                        )}
                      </For>
                    </div>
                  </Show>
                </ScrollArea>
                    </Match>
                    <Match when={selectedTab === "memory"}>
                <ScrollArea class="flex-1 min-h-0 pr-2">
                  <Show
                    when={project().memoryEntries.length > 0}
                    fallback={
                      <div class="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-(--border) bg-white/40 p-8 text-center text-[0.675rem] text-(--muted)">
                        No shared memory yet.
                      </div>
                    }
                  >
                    <div class="flex flex-col gap-3">
                      <For each={project().memoryEntries}>
                        {(entry) => (
                          <article class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
                            <div class="flex items-center justify-between gap-3">
                              <div>
                                <div class="text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">
                                  {entry.kind}
                                </div>
                                <div class="font-semibold">{entry.title}</div>
                              </div>
                              <div class="flex flex-wrap items-center gap-2">
                                <ActionButton
                                  tooltip={entry.pinned ? "Unpin memory entry" : "Pin memory entry"}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleUpdateMemory(entry.id, { pinned: !entry.pinned })}
                                >
                                  {entry.pinned ? "Unpin" : "Pin"}
                                </ActionButton>
                                <ActionButton
                                  tooltip={entry.status === "active" ? "Archive memory entry" : "Restore memory entry"}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    handleUpdateMemory(entry.id, {
                                      status: entry.status === "active" ? "archived" : "active"
                                    })
                                  }
                                >
                                  {entry.status === "active" ? "Archive" : "Restore"}
                                </ActionButton>
                                <ActionButton tooltip="Delete memory entry" size="sm" variant="secondary" onClick={() => handleDeleteMemory(entry.id)}>
                                  Delete
                                </ActionButton>
                              </div>
                            </div>
                            <div class="pt-2 text-(--muted)">
                              {entry.confidence} | {entry.freshness} | hits {entry.hitCount}
                            </div>
                            <div class="pt-2">
                              <MarkdownContent content={() => entry.summary} size="compact" />
                            </div>
                            <Show when={entry.evidence}>
                              <div class="pt-2">
                                <MarkdownContent content={() => entry.evidence ?? ""} size="compact" tone="muted" />
                              </div>
                            </Show>
                          </article>
                        )}
                      </For>
                    </div>
                  </Show>
                </ScrollArea>
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
            </div>

            <Show when={readyRun() && currentExecutionPlan()?.gating.mode === "countdown" && countdownRunId() === readyRun()!.id}>
              <div class="flex flex-col gap-3 rounded-[1.25rem] border border-(--border) bg-white/65 p-3">
                <div class="flex flex-wrap items-center justify-between gap-3 text-[0.675rem] text-(--muted)">
                  <span>
                    Auto-run {countdownPaused() ? "paused" : "in progress"} for {currentExecutionPlan()?.gating.delaySeconds}s gate.
                  </span>
                  <ActionButton
                    tooltip={
                      executionPaused()
                        ? "Global pause freezes automatic execution countdown"
                        : countdownPaused()
                          ? "Resume automatic execution countdown"
                          : "Pause automatic execution countdown"
                    }
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason()}
                    icon={countdownPaused() ? <Play class="h-3.5 w-3.5" /> : <Pause class="h-3.5 w-3.5" />}
                    size="sm"
                    variant="secondary"
                    onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                  >
                    {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                  </ActionButton>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-(--border)">
                  <div
                    class="h-full rounded-full bg-(--accent) transition-[width]"
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

            <form data-test-chat-composer="" class="shrink-0 space-y-3" onSubmit={handleSubmit}>
              <Show when={pendingQuestion()}>
                {(question) => (
                  <div class="flex flex-col gap-3 rounded-3xl border border-amber-300/70 bg-amber-50/80 p-4 shadow-sm">
                    <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-amber-800">
                      <MessageSquareMore class="h-3.5 w-3.5" />
                      Planner question
                    </div>
                    <div class="text-[0.7875rem] leading-6 text-amber-950">{question().prompt}</div>
                    <Show when={question().placeholder}>
                      <div class="text-[0.675rem] text-amber-900/70">Example reply: {question().placeholder}</div>
                    </Show>
                    <div class="grid gap-2 md:grid-cols-3">
                      <For each={question().choices}>
                        {(choice) => (
                          <Tooltip content={executionPaused() ? executionPauseReason() : choice.description}>
                            <span class="inline-flex">
                              <button
                                class={`cursor-pointer rounded-[1.1rem] border px-3 py-2 text-left text-[0.675rem] transition disabled:cursor-not-allowed ${choice.recommended
                                  ? "border-amber-500 bg-white text-amber-950"
                                  : "border-amber-200/80 bg-white/70 text-amber-900"
                                  }`}
                                type="button"
                                disabled={executionPaused()}
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
                                <div class="text-[0.625rem] leading-5">{choice.description}</div>
                              </button>
                            </span>
                          </Tooltip>
                        )}
                      </For>
                    </div>
                    <Show when={executionPaused()}>
                      <div class="text-[0.625rem] text-amber-900/75">
                        Global pause active. Send answer after resume.
                      </div>
                    </Show>
                  </div>
                )}
              </Show>

              <Show when={resumableRun()}>
                {(run) => (
                  <div class="flex flex-col gap-2 rounded-3xl border border-rose-300/70 bg-rose-50/80 p-4 shadow-sm">
                    <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-rose-800">
                      Resumable run
                    </div>
                    <div class="text-[0.7875rem] leading-6 text-rose-950">
                      Status: {run().status}. Failed subtasks: {failedSubtaskCount()}.
                    </div>
                    <div class="text-[0.675rem] leading-5 text-rose-900/75">
                      Use resume to rerun failed or pending subtasks only. Draft text below will be sent as extra guidance.
                    </div>
                  </div>
                )}
              </Show>

              <Show when={selectedAgentHealthMessage()}>
                {(message) => (
                  <div class="rounded-[1.2rem] border border-sky-200 bg-sky-50/80 p-3 text-[0.675rem] leading-6 text-sky-950">
                    {message()}
                  </div>
                )}
              </Show>

              <div class="relative" data-tour-id="chat-composer">
                <Textarea
                  ref={composerTextarea}
                  rows="2"
                  value={project().draft}
                  placeholder={getComposerPlaceholder()}
                  disabled={executionPaused()}
                  class="w-full resize-none rounded-xl pb-12 pr-14"
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) {
                      return;
                    }

                    event.preventDefault();
                    composerTextarea?.form?.requestSubmit();
                  }}
                  onInput={(event: InputEvent & { currentTarget: HTMLTextAreaElement; target: Element }) => {
                    harnessStore.setProjectDraft(project().id, event.currentTarget.value);
                    resizeComposer();
                  }}
                />
                <div class="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5">
                  <ActionButton
                    tooltip="Attach screenshots, PDFs, or office docs"
                    disabledReason={executionPaused() ? executionPauseReason() : attachmentButtonReason()}
                    disabled={executionPaused() || attachmentButtonDisabled()}
                    icon={<Paperclip class="h-4 w-4" />}
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="pointer-events-auto h-8 w-8 rounded-lg"
                    onClick={() => attachmentInput?.click()}
                  />
                  <ActionButton
                    tooltip={
                      pendingQuestion()
                        ? "Send planner answer"
                        : project().activeRun?.status === "ready"
                          ? "Refine plan before execution"
                          : `Send task to ${selectedAgentLabel()}`
                    }
                    disabledReason={
                      uploadingAttachments()
                        ? "Attachment upload in progress"
                        : executionPaused()
                          ? executionPauseReason()
                          : hasImageDraftAttachments() && !hasVisionCapability()
                            ? "Current model lacks vision support for image attachments"
                            : setupBlockedReason()
                              ? setupBlockedReason()
                              : project().session.isStreaming
                                ? "Project is streaming"
                                : resumableRun()
                                  ? "Use resume failed agents to continue this run"
                                  : "Enter task text"
                    }
                    disabled={
                      !project().draft.trim() ||
                      executionPaused() ||
                      Boolean(resumableRun()) ||
                      project().session.isStreaming ||
                      uploadingAttachments() ||
                      Boolean(setupBlockedReason()) ||
                      (hasImageDraftAttachments() && !hasVisionCapability())
                    }
                    icon={<SendHorizontal class="h-4 w-4" />}
                    type="submit"
                    variant="ghost"
                    size="icon"
                    class="pointer-events-auto h-8 w-8 rounded-lg"
                    dataTourId="chat-send"
                  />
                </div>
                <div class="absolute bottom-2 left-2">
                  <div class="hidden flex-wrap items-center gap-2 lg:flex">
                    <span class="text-[0.625rem] text-(--muted)">Mode</span>
                    <select
                      data-test-mode-select=""
                      class="h-7 rounded-lg border border-(--border) bg-white/65 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
                      value={activeMode()?.id ?? "implement"}
                      onInput={(event) => handleModeSelect(event.currentTarget.value)}
                    >
                      <For each={resolvedModes()}>
                        {(mode) => <option value={mode.id}>{mode.label}</option>}
                      </For>
                    </select>
                    <span class="text-[0.625rem] text-(--muted)">Agent</span>
                    <select
                      data-test-agent-select=""
                      data-tour-id="agent-select"
                      class="h-7 rounded-lg border border-(--border) bg-white/65 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
                      value={selectedAgentId()}
                      onInput={(event) => handleSelectAgent(event.currentTarget.value as "pi" | "copilot-cli" | "codex-cli")}
                    >
                      <For each={state.availableAgents}>
                        {(agent) => <option value={agent.id}>{agent.label}</option>}
                      </For>
                    </select>
                    <Show when={selectedProviderBrand()}>
                      {(providerBrand) => (
                        <>
                          <span class="text-[0.625rem] text-(--muted)">Provider</span>
                          <select
                            data-test-provider-select=""
                            class="h-7 rounded-lg border border-(--border) bg-white/65 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60"
                            value={providerBrand()}
                            disabled={selectedAgentId() === "codex-cli"}
                            onInput={(event) => handleProviderBrandSelect(event.currentTarget.value as "gpt" | "gemini")}
                          >
                            <option value="gpt">GPT</option>
                            <Show when={selectedAgentId() === "pi"}>
                              <option value="gemini">Gemini</option>
                            </Show>
                          </select>
                        </>
                      )}
                    </Show>
                    <span class="text-[0.625rem] text-(--muted)">Model</span>
                    <Tooltip content={availableExecutionModels().length === 0 ? "No available models discovered for the selected runtime yet." : undefined}>
                      <span class="inline-flex">
                        <select
                          data-test-model-select=""
                          class="h-7 rounded-lg border border-(--border) bg-white/65 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60"
                          value={getEffectiveExecutionModelId()}
                          disabled={availableExecutionModels().length === 0}
                          onInput={(event) => handleExecutionModelSelect(event.currentTarget.value)}
                        >
                          <For each={availableExecutionModels()}>
                            {(model) => <option value={model.modelId}>{model.label}</option>}
                          </For>
                        </select>
                      </span>
                    </Tooltip>
                  </div>
                  <div class="flex items-center gap-2">
                    <Popover
                      open={reasoningMenuOpen()}
                      onClose={() => setReasoningMenuOpen(false)}
                      align="start"
                      contentClass="w-[min(20rem,calc(100vw-1.5rem))] lg:w-64"
                      content={renderComposerControlMenu()}
                    >
                      <button
                        type="button"
                        data-test-effort-trigger=""
                        class="inline-flex h-7 items-center rounded-lg border border-(--border) bg-white/70 px-2 text-[0.625rem] text-(--foreground) outline-none transition hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-(--ring)"
                        onClick={() => setReasoningMenuOpen((current) => !current)}
                      >
                        {composerSettingsLabel()}
                      </button>
                    </Popover>
                    <div class="lg:hidden">
                      <Popover
                        open={composerSettingsOpen()}
                        onClose={() => setComposerSettingsOpen(false)}
                        align="start"
                        contentClass="w-[min(24rem,calc(100vw-1.5rem))]"
                        content={
                          <div class="flex flex-col gap-2">
                            <label class="flex flex-col gap-1 text-[0.625rem] text-(--muted)">
                              <span>Mode</span>
                              <select
                                data-test-mode-select=""
                                class="h-8 rounded-lg border border-(--border) bg-white/70 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
                                value={activeMode()?.id ?? "implement"}
                                onInput={(event) => handleModeSelect(event.currentTarget.value)}
                              >
                                <For each={resolvedModes()}>
                                  {(mode) => <option value={mode.id}>{mode.label}</option>}
                                </For>
                              </select>
                            </label>
                            <label class="flex flex-col gap-1 text-[0.625rem] text-(--muted)">
                              <span>Agent</span>
                              <select
                                data-test-agent-select=""
                                data-tour-id="agent-select"
                                class="h-8 rounded-lg border border-(--border) bg-white/70 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
                                value={selectedAgentId()}
                                onInput={(event) => handleSelectAgent(event.currentTarget.value as "pi" | "copilot-cli" | "codex-cli")}
                              >
                                <For each={state.availableAgents}>
                                  {(agent) => <option value={agent.id}>{agent.label}</option>}
                                </For>
                              </select>
                            </label>
                            <Show when={selectedProviderBrand()}>
                              {(providerBrand) => (
                                <label class="flex flex-col gap-1 text-[0.625rem] text-(--muted)">
                                  <span>Provider</span>
                                  <select
                                    data-test-provider-select=""
                                    class="h-8 rounded-lg border border-(--border) bg-white/70 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60"
                                    value={providerBrand()}
                                    disabled={selectedAgentId() === "codex-cli"}
                                    onInput={(event) => handleProviderBrandSelect(event.currentTarget.value as "gpt" | "gemini")}
                                  >
                                    <option value="gpt">GPT</option>
                                    <Show when={selectedAgentId() === "pi"}>
                                      <option value="gemini">Gemini</option>
                                    </Show>
                                  </select>
                                </label>
                              )}
                            </Show>
                            <label class="flex flex-col gap-1 text-[0.625rem] text-(--muted)">
                              <span>Model</span>
                              <select
                                data-test-model-select=""
                                class="h-8 rounded-lg border border-(--border) bg-white/70 px-2 text-[0.625rem] text-(--foreground) outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60"
                                value={getEffectiveExecutionModelId()}
                                disabled={availableExecutionModels().length === 0}
                                onInput={(event) => handleExecutionModelSelect(event.currentTarget.value)}
                              >
                                <For each={availableExecutionModels()}>
                                  {(model) => <option value={model.modelId}>{model.label}</option>}
                                </For>
                              </select>
                            </label>
                          </div>
                        }
                      >
                        <ActionButton
                          tooltip="Open composer settings"
                          icon={<Settings2 class="h-4 w-4" />}
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-7 w-7 rounded-lg"
                          onClick={() => setComposerSettingsOpen((current) => !current)}
                        />
                      </Popover>
                    </div>
                  </div>
                </div>
              </div>
              <input
                ref={attachmentInput}
                class="hidden"
                type="file"
                multiple
                accept="image/*,.pdf,.docx,.xlsx,.pptx,.odt,.txt,.md,.markdown,.json,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.sql,.sh,.bash,.zsh,.ini,.toml,.env,.csv,.log"
                onChange={handleSelectAttachments}
              />

              <Show when={draftAttachments().length > 0 || uploadingAttachments()}>
                <div class="flex flex-wrap gap-2">
                  <For each={draftAttachments()}>
                    {(attachment) => (
                      <span class="inline-flex items-center gap-2 rounded-full border border-(--border) bg-white/75 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-(--muted)">
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
                    <span class="inline-flex items-center gap-2 rounded-full border border-(--border) bg-white/75 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-(--muted)">
                      <LoaderCircle class="h-3 w-3 animate-spin" />
                      Uploading attachments
                    </span>
                  </Show>
                </div>
              </Show>

              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="flex flex-col gap-2 text-[0.675rem] text-(--muted)">
                  <div class="flex flex-wrap gap-2">
                    <For each={capabilityTags()}>
                      {(tag) => (
                        <span class="rounded-full border border-(--border) bg-white/70 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-(--muted)">
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={contextUsage()}>
                    {(usage) => (
                      <Tooltip content={getContextUsageTooltip()}>
                        <span class="inline-flex items-center gap-3 rounded-full border border-(--border) bg-white/75 px-2.5 py-1.5 text-[0.675rem] text-(--foreground)">
                          <span
                            class="relative flex h-9 w-9 items-center justify-center rounded-full"
                            style={{
                              background: `conic-gradient(var(--accent) ${Math.max(
                                0,
                                Math.min(100, Math.round(usage().usagePercent ?? 0))
                              )}%, rgba(38, 22, 15, 0.12) 0%)`
                            }}
                          >
                            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-(--panel) text-[0.5rem] font-semibold text-(--foreground)">
                              {Math.round(usage().usagePercent ?? 0)}%
                            </span>
                          </span>
                          <span>{`${Math.round(usage().usagePercent ?? 0)}% · ${formatTokenCount(usage().tokens)}/${formatTokenCount(
                            usage().contextWindow
                          )} context used`}</span>
                        </span>
                      </Tooltip>
                    )}
                  </Show>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Show when={resumableRun()}>
                    <ActionButton
                      tooltip="Resume failed or pending subagents"
                      disabledReason={
                        executionPaused()
                          ? executionPauseReason()
                          : project().session.isStreaming
                            ? "Project is streaming"
                            : "No resumable run"
                      }
                      disabled={executionPaused() || !resumableRun() || project().session.isStreaming}
                      icon={<RefreshCcw class="h-4 w-4" />}
                      type="button"
                      onClick={handleResume}
                    >
                      Resume failed agents
                    </ActionButton>
                  </Show>
                  {/*
                    Open live session is intentionally hidden for MVP.
                    This is unneeded at the moment, but can be reintroduced post-MVP.
                  */}
                  {/* <Show when={selectedAgentRuntime()?.agentId !== "pi"}>
                    <ActionButton
                      tooltip="Open live pipe-based CLI session"
                      disabledReason={
                        executionPaused()
                          ? executionPauseReason()
                          : !selectedAgentRuntime()?.installed
                            ? selectedAgentRuntime()?.healthMessage ?? "Runtime not installed"
                            : !selectedAgentRuntime()?.authenticated
                              ? selectedAgentRuntime()?.healthMessage ?? "Runtime not authenticated"
                              : !selectedAgentRuntime()?.interactivePipeCompatible
                                ? selectedAgentRuntime()?.healthMessage ?? "Interactive mode unavailable"
                                : undefined
                      }
                      disabled={
                        executionPaused() ||
                        !selectedAgentRuntime()?.installed ||
                        !selectedAgentRuntime()?.authenticated ||
                        !selectedAgentRuntime()?.interactivePipeCompatible
                      }
                      type="button"
                      variant="secondary"
                      onClick={handleStartLiveSession}
                    >
                      Open live session
                    </ActionButton>
                  </Show> */}
                </div>
              </div>
            </form>
            <Dialog open={experimentDialogOpen()} onClose={() => setExperimentDialogOpen(false)} title="Experiment review">
              <div class="flex flex-col gap-3 text-[0.7rem] leading-6 text-(--foreground)">
                <Show when={experimentRun()}>
                  <div>
                    <div class="font-semibold">{experimentRun()!.virtualBranchName}</div>
                    <div class="text-(--muted)">
                      {experimentRun()!.filesChanged} files | +{experimentRun()!.insertions} / -{experimentRun()!.deletions}
                    </div>
                  </div>
                </Show>
                <Show
                  when={activeProject()?.experimentInspection}
                  fallback={<div class="text-(--muted)">Loading experiment diff...</div>}
                >
                  {(inspection) => <MarkdownContent content={() => `\`\`\`diff\n${inspection().diffText}\n\`\`\``} size="compact" />}
                </Show>
              </div>
            </Dialog>
          </>
        )}
      </Show>
    </section>
  );
}

function formatReasoningStrengthLabel(strength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
  switch (strength) {
    case "extra-high":
      return "Extra High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "high":
    default:
      return "High";
  }
}

function formatReasoningOptionLabel(strength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === "high" ? `${label} (default)` : label;
}

function formatTokenCount(value: number | undefined) {
  if (value === undefined) {
    return "?";
  }

  if (value < 1_000) {
    return String(value);
  }

  if (value < 1_000_000) {
    const scaled = value / 1_000;
    return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}k`;
  }

  const scaled = value / 1_000_000;
  return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}m`;
}
