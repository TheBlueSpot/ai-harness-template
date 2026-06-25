import { For, Match, Show, Switch, createEffect, createMemo, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from "solid-js";
import {
  createRequestId,
  type AssistantActionMessageMetadata,
  type AgentRunState,
  type AgentRunSummary,
  type ChatAttachment,
  type ChatMessage,
  type ProviderBrand,
  type SetupAction
} from "../../../shared/protocol";
import {
  detectSupportedChatAttachment,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_COUNT
} from "../../../shared/chat-attachments";
import {
  canSelectProviderBrand,
  COMPOSER_REASONING_STRENGTHS,
  getEffectiveProviderBrandForAgent,
  getActiveMode,
  getCapabilityTags,
  getBlockingSetupCheck,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getFallbackExecutionModelIdForAgent,
  getModelCapability,
  getResolvedModes,
  harnessStore,
  hasUsableApiKeyForProvider,
  persistMergedLocalPreferences,
  resolveUsablePiProviderBrand,
  shouldShowSetupChecklist,
  type ChatPaneTab,
  type ViewProjectState
} from "../harness-store";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { findChatFileReferenceAtPosition, findChatFileReferences, resolveChatFileTarget, type ChatFileLinkContext, type ChatFileTarget } from "../lib/chat-file-links";
import { tooltipWithPrimaryHotkey } from "../lib/hotkey-hints";
import { openIdeWindow } from "../lib/ide-window";
import { uploadFiles } from "../lib/uploadthing";
import { buildChatTimelineRows, type ChatTimelineRow, type TimelineLiveMessage } from "../lib/chat-timeline-model";
import { formatShortTimestamp, resolveBrowserTimezone } from "../lib/time-format";
import { formatProviderModelName } from "../lib/utils";
import { pushToast } from "../toast-store";
import { openBackgroundRunInJobsPane } from "../background-run-navigation";
import { ActionButton } from "./action-button";
import { CliSessionPanel } from "./cli-session-panel";
import { MarkdownContent } from "./markdown-content";
import { ModeEditorPanel } from "./mode-editor-panel";
import { SetupChecklistCard } from "./setup-checklist-card";
import { StreamedToolBlock } from "./streamed-tool-block";
import { ChatComposer } from "./primitives/chat-composer";
import { Dialog } from "./primitives/dialog";
import { CopyTextButton } from "./primitives/copy-text-button";
import { DropdownControl } from "./primitives/dropdown";
import { getAgentDropdownIcon, getModeDropdownIcon } from "./primitives/dropdown-option-icons";
import { Input } from "./primitives/input";
import { Popover } from "./primitives/popover";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";
import { Button, buttonVariants } from "./primitives/button";
import {
  Activity,
  AlertTriangle,
  Brain,
  Bot,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Clipboard,
  Cpu,
  Edit3,
  FolderOpen,
  Folder,
  Gauge,
  LoaderCircle,
  MessageSquareMore,
  Orbit,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  ArrowDown,
  ArrowUp,
  Check,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  SendHorizontal,
  Settings,
  WandSparkles,
  X,
  Split
} from "lucide-solid";
import { cn } from "../lib/utils";

function getReasoningStrengthDescription(strength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
  switch (strength) {
    case "low":
      return "Fastest pass with minimal internal deliberation.";
    case "medium":
      return "Balanced depth for routine implementation and review.";
    case "high":
      return "Default stronger reasoning for most coding work.";
    case "extra-high":
      return "Heaviest reasoning budget for hard debugging and planning.";
  }
}

function getFastModeDescription(enabled: boolean) {
  return enabled
    ? "Prefer lower-latency responses when current runtime and model support it."
    : "Use standard response path with default latency and reasoning behavior.";
}

function isHarnessTranscriptMessage(message: ChatMessage) {
  return message.role === "assistant" || message.role === "system";
}

function getTranscriptRoleLabel(role: ChatMessage["role"]) {
  return role === "user" ? "user" : "harness";
}

function getCopyAriaLabel(message: ChatMessage) {
  return `Copy ${isHarnessTranscriptMessage(message) ? "harness" : message.role} message`;
}

function getPlanFromMessage(message: ChatMessage) {
  return message.metadata?.type === "plan-summary" ? message.metadata.plan : undefined;
}

function getProviderBrandLabel(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "Gemini";
  }
  if (providerBrand === "claude") {
    return "Claude";
  }
  return "GPT";
}

function getProviderBrandDescription(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "Google-hosted model family.";
  }
  if (providerBrand === "claude") {
    return "Anthropic-hosted model family.";
  }
  return "OpenAI-hosted model family.";
}

function renderMessageActionRow(timestamp: string | number | Date | undefined, copyButton: JSX.Element) {
  return (
    <div class="mt-3 flex items-center justify-between gap-3">
      <div class="min-w-0 text-[0.575rem] uppercase tracking-[0.12em] text-(--muted)">
        {formatShortTimestamp(timestamp)}
      </div>
      {copyButton}
    </div>
  );
}

function reactiveArraySnapshot<T>(items: readonly T[] | undefined) {
  if (!items) {
    return [];
  }
  const snapshot: T[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item !== undefined) {
      snapshot.push(item);
    }
  }
  return snapshot;
}

const COMPOSER_LOOKUP_SELECTED_CLASSES = ["bg-white/70", "ring-1", "ring-(--ring)"] as const;

type ComposerReferenceBadge = {
  key: string;
  kind: "skill" | "file";
  label: string;
  target: ChatFileTarget;
};

export function ChatPanel() {
  let messageViewport: HTMLDivElement | undefined;
  let attachmentInput: HTMLInputElement | undefined;
  let composerTextarea: HTMLTextAreaElement | undefined;
  let composerLookupMenu: HTMLDivElement | undefined;
  let countdownTimer: number | undefined;
  let waitingTimer: number | undefined;
  const owner = getOwner();
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProjectIndex = createMemo(() =>
    state.workspace.projects.findIndex((project) => project.id === state.workspace.activeProjectId)
  );
  const activeProject = () => {
    const index = activeProjectIndex();
    return index >= 0 ? state.workspace.projects[index] : undefined;
  };
  const project = () => activeProject()!;
  const chatFileLinkContext = (): ChatFileLinkContext => ({
    rootPath: activeProject()?.rootPath,
    filePaths: activeProject()?.filePaths ?? []
  });
  const chatFileLinks = () => ({
    ...chatFileLinkContext(),
    onOpenFile: handleOpenChatFile
  });
  const [stickToBottom, setStickToBottom] = createSignal(true);
  const [editingThreadTitle, setEditingThreadTitle] = createSignal(false);
  const [threadTitleDraft, setThreadTitleDraft] = createSignal("");
  const [countdownRunId, setCountdownRunId] = createSignal<string>();
  const [countdownRemainingMs, setCountdownRemainingMs] = createSignal(0);
  const [countdownPaused, setCountdownPaused] = createSignal(false);
  const [countdownFrozenByExecutionPause, setCountdownFrozenByExecutionPause] = createSignal(false);
  const [elapsedNowMs, setElapsedNowMs] = createSignal(Date.now());
  const [autoExecutedRunId, setAutoExecutedRunId] = createSignal<string>();
  const currentTab = createMemo(() => state.chatPaneTab);
  const [experimentDialogOpen, setExperimentDialogOpen] = createSignal(false);
  const [selectedExperimentFilePath, setSelectedExperimentFilePath] = createSignal<string>();
  const [projectRulesDraft, setProjectRulesDraft] = createSignal("");
  const [threadMemoryDraft, setThreadMemoryDraft] = createSignal("");
  const [deleteArmedMemoryId, setDeleteArmedMemoryId] = createSignal<string>();
  const [draftAttachments, setDraftAttachments] = createSignal<ChatAttachment[]>(readPersistedDraftAttachments(undefined));
  const [uploadingAttachments, setUploadingAttachments] = createSignal(false);
  const [draggingAttachments, setDraggingAttachments] = createSignal(false);
  const [attachmentDraftHydrated, setAttachmentDraftHydrated] = createSignal(false);
  const [composerSettingsOpen, setComposerSettingsOpen] = createSignal(false);
  const [desktopReasoningMenuOpen, setDesktopReasoningMenuOpen] = createSignal(false);
  const [mobileReasoningMenuOpen, setMobileReasoningMenuOpen] = createSignal(false);
  const [composerLookupIndex, setComposerLookupIndex] = createSignal(0);
  const [composerLookupForcedClosed, setComposerLookupForcedClosed] = createSignal(false);
  const [composerCaret, setComposerCaret] = createSignal<number | undefined>();
  const [dismissedComposerLookupKey, setDismissedComposerLookupKey] = createSignal<string | undefined>();
  const pendingQuestion = () => activeProject()?.activeRun?.questions.find((question) => question.status === "pending");
  const resumableRun = () => (activeProject()?.activeRun?.resumable ? activeProject()?.activeRun : undefined);
  const retryableRun = () => (activeProject()?.lastRun?.retryable ? activeProject()?.lastRun : undefined);
  const readyRun = () => (activeProject()?.activeRun?.status === "ready" ? activeProject()?.activeRun : undefined);
  const workingRun = () => {
    const project = activeProject();
    return project?.session.isStreaming && project.activeRun && isBlockingRunStatus(project.activeRun.status)
      ? project.activeRun
      : undefined;
  };
  const activeThreadIsStreaming = () => Boolean(workingRun());
  const attachmentDraftKey = () => {
    const project = activeProject();
    return project ? `ai-harness:chat-draft:v2:${project.id}:${project.activeThreadId}` : undefined;
  };
  const activeThread = () => activeProject()?.threads.find((thread) => thread.id === activeProject()?.activeThreadId);
  const currentExecutionPlan = () => activeProject()?.latestPlan?.executionPlan ?? readyRun()?.plan;
  const resolvedModes = () => getResolvedModes(state, activeProject());
  const activeMode = () => getActiveMode(state, activeProject());
  const isAutoModeSelected = () => harnessStore.state.hasGlobalSelectedModeId && harnessStore.state.selectedModeId === "auto";
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
  const composerTimerState = () => {
    const run = workingRun();
    if (run) {
      const startedAtMs = Date.parse(run.createdAt);
      return {
        kind: "working" as const,
        label: Number.isNaN(startedAtMs) ? "Working" : `Working for ${formatElapsedDuration(elapsedNowMs() - startedAtMs)}`
      };
    }

    const lastRun = activeProject()?.lastRun;
    const finishedAt = lastRun?.completedAt ?? lastRun?.updatedAt;
    if (!lastRun || !finishedAt) {
      return undefined;
    }

    const startedAtMs = Date.parse(lastRun.createdAt);
    const finishedAtMs = Date.parse(finishedAt);
    if (Number.isNaN(startedAtMs) || Number.isNaN(finishedAtMs)) {
      return undefined;
    }

    return {
      kind: "complete" as const,
      label: `${formatResponseTime(finishedAtMs)} • ${formatElapsedDuration(finishedAtMs - startedAtMs)}`
    };
  };
  const modeDropdownOptions = () =>
    [
      {
        value: "auto",
        label: "Auto",
        description: "Interpret each prompt and choose the best implementation mode.",
        icon: getModeDropdownIcon("auto")
      },
      ...resolvedModes().map((mode) => ({
        value: mode.id,
        label: mode.label,
        description: mode.description,
        icon: getModeDropdownIcon(mode.id)
      }))
    ];
  const agentDropdownOptions = () =>
    state.availableAgents.map((agent) => ({
      value: agent.id,
      label: agent.label,
      description: agent.description,
      icon: getAgentDropdownIcon(agent.id)
    }));
  const providerDropdownOptions = () => {
    if (selectedAgentId() === "pi") {
      return [
        { value: "gpt", label: "GPT", description: "OpenAI-hosted model family." },
        { value: "gemini", label: "Gemini", description: "Google-hosted model family." },
        { value: "claude", label: "Claude", description: "Anthropic-hosted model family." }
      ];
    }

    const providerBrand = selectedProviderBrand();
    return providerBrand
      ? [
          {
            value: providerBrand,
            label: getProviderBrandLabel(providerBrand),
            description: getProviderBrandDescription(providerBrand)
          }
        ]
      : [];
  };
  const modelDropdownOptions = () =>
    availableExecutionModels().map((model) => ({
      value: model.modelId,
      label: formatProviderModelName(model.modelId),
      description: getModelCapability(state, model.modelId)?.summary ?? model.modelId
    }));
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
      { id: "chat", label: "Chat", icon: <MessageSquareMore class="h-3.5 w-3.5" />, tooltip: "Open transcript and plan cards" },
      { id: "plan", label: "Plan", icon: <ClipboardList class="h-3.5 w-3.5" />, tooltip: "Open planning context and saved plan tools" },
      { id: "run", label: "Run", icon: <Play class="h-3.5 w-3.5" />, tooltip: "Open run status, subtasks, and experiment actions" },
      { id: "memory", label: "Memory", icon: <Brain class="h-3.5 w-3.5" />, tooltip: "Open shared memory entries" },
      { id: "events", label: "Events", icon: <Activity class="h-3.5 w-3.5" />, tooltip: "Open execution event history" }
    ] satisfies Array<{ id: ChatPaneTab; label: string; icon: JSX.Element; tooltip: string }>;
  const experimentRun = () => activeProject()?.activeRun?.experiment ?? activeProject()?.lastRun?.experiment;
  const liveHarnessMessages = () => {
    const project = activeProject();
    return project ? getStreamingLiveMessages(project) : [];
  };
  const projectTraces = createMemo(() => reactiveArraySnapshot(activeProject()?.traces));
  const hasBranchfsSizeWarning = createMemo(() => projectTraces().some((trace) => trace.stage === "branchfs-size-warning"));
  const projectMemoryEntries = createMemo(() => reactiveArraySnapshot(activeProject()?.memoryEntries));
  const transcriptRows = createMemo<ChatTimelineRow[]>(() => {
    const project = activeProject();
    return buildChatTimelineRows({
      messages: reactiveArraySnapshot(project?.session.messages),
      liveMessages: liveHarnessMessages(),
      toolActivities: reactiveArraySnapshot(project?.activeRun?.toolActivities ?? project?.lastRun?.toolActivities),
      activeRunId: project?.activeRun?.id ?? project?.lastRun?.id
    });
  });
  const liveHarnessMessageTimestamp = () => activeProject()?.activeRun?.updatedAt ?? activeProject()?.activeRun?.createdAt;
  const runSubtasks = createMemo(() => reactiveArraySnapshot(activeProject()?.activeRun?.subtasks ?? activeProject()?.lastRun?.subtasks));
  const currentBackgroundRun = createMemo(() => {
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    return run ? state.backgroundJobs.runs.find((entry) => entry.linkedAgentRunId === run.id) : undefined;
  });
  const liveHarnessMessageKey = () =>
    liveHarnessMessages()
      .map((message) => `${message.id}:${message.locked ? "locked" : "live"}:${message.content}`)
      .join("\n---\n");
  const failedSubtaskCount = () =>
    activeProject()?.activeRun?.subtasks.filter((task) => task.status === "failed").length ?? 0;
  const contextUsage = () => activeProject()?.contextUsage;
  const attachmentButtonDisabled = () => !state.attachmentsEnabled || activeThreadIsStreaming() || uploadingAttachments();
  const attachmentButtonReason = () =>
    !state.attachmentsEnabled
      ? "Set UPLOADTHING_TOKEN on the server to enable attachments"
      : activeThreadIsStreaming()
        ? "Project is streaming"
        : uploadingAttachments()
          ? "Attachment upload in progress"
          : undefined;
  const composerLookup = () => {
    const currentProject = activeProject();
    if (!currentProject) {
      return undefined;
    }
    const storedCaret = composerCaret();
    const rawCaret = storedCaret ?? currentProject.draft.length;
    const caret = Math.max(0, Math.min(rawCaret, currentProject.draft.length));
    return getComposerLookup(currentProject.draft, caret);
  };
  const composerLookupKey = () => {
    const lookup = composerLookup();
    return lookup ? `${lookup.kind}:${lookup.start}:${lookup.end}:${lookup.query}` : undefined;
  };
  const skillOptions = createMemo(() =>
    state.availableSkillPaths.map((skillPath) => ({
      label: getSkillName(skillPath),
      detail: skillPath,
      insertText: `/${getSkillName(skillPath)} `
    }))
  );
  const fileOptions = createMemo(() =>
    (activeProject()?.filePaths ?? []).map((filePath) => ({
      label: getFileName(filePath),
      detail: getDirectoryName(filePath),
      insertText: `@${filePath} `
    }))
  );
  const composerLookupOptions = () => {
    const lookup = composerLookup();
    if (!lookup) {
      return [];
    }
    const query = lookup.query.toLowerCase();
    const source = lookup.kind === "skill" ? skillOptions() : fileOptions();
    return source
      .filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(query))
      .slice(0, 10);
  };
  const composerLookupOpen = () => {
    if (composerLookupForcedClosed()) {
      return false;
    }
    const key = composerLookupKey();
    return Boolean(key && dismissedComposerLookupKey() !== key && composerLookupOptions().length > 0);
  };
  const composerLookupRenderedOptions = () =>
    composerLookupOptions().map((option, index) => ({
      ...option,
      index,
      selected: index === composerLookupIndex()
    }));
  const composerLookupActiveOptionId = () =>
    composerLookupOpen() ? getComposerLookupOptionId(composerLookupIndex()) : undefined;
  const composerReferenceBadges = () =>
    getComposerReferenceBadges(activeProject()?.draft ?? "", chatFileLinkContext(), state.availableSkillPaths);
  const dropState = () => {
    if (!state.attachmentsEnabled) {
      return { label: "Attachments unavailable", detail: "Set UPLOADTHING_TOKEN on the server to enable uploads." };
    }
    if (uploadingAttachments()) {
      return { label: "Uploading attachments", detail: "Wait for the current upload to finish." };
    }
    if (attachmentButtonDisabled()) {
      return { label: "Drop unavailable", detail: attachmentButtonReason() ?? "Drop is unavailable right now." };
    }
    return { label: "Drop files to attach", detail: "Images, text, PDFs, and office documents are supported." };
  };
  const requiresFreshTopLevelSend = () =>
    !pendingQuestion() && activeProject()?.activeRun?.status !== "ready" && !resumableRun();
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = () => "Global execution pause is active";
  const setupBlockedReason = () =>
    requiresFreshTopLevelSend() && blockingSetupCheck() ? blockingSetupCheck()!.summary : undefined;
  const composerSubmitState = createMemo(() => {
    const project = activeProject();
    const content = project?.draft.trim() ?? "";
    const hasAttachments = draftAttachments().length > 0;
    const question = pendingQuestion();
    const readyRunActive = project?.activeRun?.status === "ready";
    const tooltip = question
      ? "Send planner answer"
      : readyRunActive
        ? "Refine plan before execution"
        : `Send task to ${selectedAgentLabel()}`;

    if (!project) {
      return { disabled: true, disabledReason: "Open project first", tooltip };
    }

    if (executionPaused()) {
      return { disabled: true, disabledReason: executionPauseReason(), tooltip };
    }

    if (activeThreadIsStreaming()) {
      return { disabled: true, disabledReason: "Project is streaming", tooltip };
    }

    if (uploadingAttachments()) {
      return { disabled: true, disabledReason: "Attachment upload in progress", tooltip };
    }

    if ((question || readyRunActive) && hasAttachments) {
      return {
        disabled: true,
        disabledReason: "Attachments are only supported on new top-level tasks right now.",
        tooltip
      };
    }

    if (hasImageDraftAttachments() && !hasVisionCapability()) {
      return {
        disabled: true,
        disabledReason: "Current model lacks vision support for image attachments",
        tooltip
      };
    }

    if (question) {
      return content
        ? { disabled: false, disabledReason: undefined, tooltip }
        : { disabled: true, disabledReason: "Enter answer text", tooltip };
    }

    if (readyRunActive) {
      return content
        ? { disabled: false, disabledReason: undefined, tooltip }
        : { disabled: true, disabledReason: "Enter plan changes", tooltip };
    }

    if (resumableRun()) {
      return {
        disabled: true,
        disabledReason: "Use resume failed agents to continue this run",
        tooltip
      };
    }

    if (setupBlockedReason()) {
      return { disabled: true, disabledReason: setupBlockedReason(), tooltip };
    }

    if (!content) {
      return {
        disabled: true,
        disabledReason: hasAttachments ? "Describe what to do with attached files" : "Enter task text",
        tooltip
      };
    }

    if (selectedAgentId() === "pi" && !resolveUsablePiProviderBrand(state)) {
      return {
        disabled: true,
        disabledReason: "Add an OpenAI or Google API key to use Pi, or switch agents",
        tooltip
      };
    }

    const unavailableAgentReason = getSelectedAgentUnavailableReason();
    if (unavailableAgentReason) {
      return { disabled: true, disabledReason: unavailableAgentReason, tooltip };
    }

    return { disabled: false, disabledReason: undefined, tooltip };
  });
  const renderModeControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select mode"
      icon={<Split class="h-3.5 w-3.5" />}
      size={size}
      class={className}
      value={isAutoModeSelected() ? "auto" : activeMode()?.id ?? "implement"}
      options={modeDropdownOptions()}
      hideWhenSingleOption
      onChange={handleModeSelect}
      dataAttributes={{ "data-test-mode-select": "" }}
    />
  );
  const renderAgentControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select agent"
      icon={<Bot class="h-3.5 w-3.5" />}
      size={size}
      class={className}
      value={selectedAgentId()}
      options={agentDropdownOptions()}
      hideWhenSingleOption
      onChange={(value) => handleSelectAgent(value as "pi" | "copilot-cli" | "codex-cli")}
      dataAttributes={{ "data-test-agent-select": "", "data-tour-id": "agent-select" }}
    />
  );
  const renderProviderControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select provider"
      icon={<Orbit class="h-3.5 w-3.5" />}
      size={size}
      class={className}
      value={selectedProviderBrand() ?? "gpt"}
      options={providerDropdownOptions()}
      disabled={selectedAgentId() === "codex-cli"}
      hideWhenSingleOption
      onChange={(value) => handleProviderBrandSelect(value as ProviderBrand)}
      dataAttributes={{ "data-test-provider-select": "" }}
    />
  );
  const renderModelControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select model"
      icon={<Cpu class="h-3.5 w-3.5" />}
      size={size}
      class={className}
      value={getEffectiveExecutionModelId()}
      options={modelDropdownOptions()}
      hideWhenSingleOption
      onChange={handleExecutionModelSelect}
      dataAttributes={{ "data-test-model-select": "" }}
    />
  );
  const renderEffortControl = (
    onToggle: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>,
    className?: string
  ) => (
    <Tooltip content={`${getReasoningStrengthDescription(selectedReasoningStrength())}${selectedFastMode() ? "\nFast mode on for lower latency." : "\nFast mode off for default response pacing."}`}>
      <DropdownControl
        kind="trigger"
        ariaLabel="Open effort options"
        icon={<Gauge class="h-3.5 w-3.5" />}
        class={className}
        label={composerSettingsLabel()}
        onClick={onToggle}
        dataAttributes={{ "data-test-effort-trigger": "" }}
      />
    </Tooltip>
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
    waitingTimer = window.setInterval(() => setElapsedNowMs(Date.now()), 1000);
  });

  onCleanup(() => {
    clearCountdown();
    if (waitingTimer !== undefined) {
      window.clearInterval(waitingTimer);
      waitingTimer = undefined;
    }
  });

  createEffect(() => {
    activeProject()?.activeThreadId;
    scrollToBottom(true);
  });

  createEffect(() => {
    activeProject()?.session.messages.length;
    liveHarnessMessageKey();
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
    const optionCount = composerLookupOptions().length;
    if (optionCount === 0) {
      setComposerLookupActiveIndex(0);
      return;
    }
    if (composerLookupIndex() >= optionCount) {
      setComposerLookupActiveIndex(optionCount - 1);
    }
  });

  createEffect(() => {
    const open = composerLookupOpen();
    queueMicrotask(() => {
      if (open && composerLookupOpen()) {
        syncComposerLookupDomVisibility({ focusMenu: true });
      } else {
        setComposerLookupMenuHidden(true);
      }
    });
  });

  onMount(() => {
    const closeOnOutsidePointer = (event: MouseEvent | PointerEvent) => {
      if (!composerLookupOpen()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (composerLookupMenu?.contains(target) || composerTextarea?.contains(target)) {
        return;
      }
      dismissComposerLookup();
    };
    const handleLookupWindowKeyDown = (event: KeyboardEvent) => {
      if (!composerLookupOpen()) {
        return;
      }
      if (event.key === "Escape") {
        runWithChatPanelOwner(() => handleComposerLookupKeyDown(event));
        return;
      }
      const target = event.target;
      if (target instanceof Node && (composerLookupMenu?.contains(target) || composerTextarea?.contains(target))) {
        runWithChatPanelOwner(() => handleComposerLookupKeyDown(event));
      }
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("mousedown", closeOnOutsidePointer);
    window.addEventListener("click", closeOnOutsidePointer);
    window.addEventListener("keydown", handleLookupWindowKeyDown);
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("mousedown", closeOnOutsidePointer, true);
    document.addEventListener("click", closeOnOutsidePointer, true);
    document.addEventListener("keydown", handleLookupWindowKeyDown, true);
    document.body.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.body.addEventListener("mousedown", closeOnOutsidePointer, true);
    document.body.addEventListener("click", closeOnOutsidePointer, true);
    onCleanup(() => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("mousedown", closeOnOutsidePointer);
      window.removeEventListener("click", closeOnOutsidePointer);
      window.removeEventListener("keydown", handleLookupWindowKeyDown);
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("mousedown", closeOnOutsidePointer, true);
      document.removeEventListener("click", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", handleLookupWindowKeyDown, true);
      document.body.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.body.removeEventListener("mousedown", closeOnOutsidePointer, true);
      document.body.removeEventListener("click", closeOnOutsidePointer, true);
    });
  });

  createEffect(() => {
    if (currentTab() === "memory" && activeProject() && state.connectionState === "connected") {
      handleLoadMemoryEntries();
    }
  });

  createEffect(() => {
    activeProject()?.id;
    currentTab();
    setDeleteArmedMemoryId(undefined);
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
      case "init-git-baseline":
        handleInitGitBaseline();
        return;
      case "disable-dirty-git-check":
        handleDisableDirtyGitCheck();
        return;
    }
  }

  function handleInitGitBaseline() {
    const project = activeProject();
    if (!project) {
      return;
    }

    harnessStore.prepareNonGitPreflightRepair("git-init");
    sendCommand({
      type: "project.git.initBaseline",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleDisableDirtyGitCheck() {
    harnessStore.prepareNonGitPreflightRepair("disable-check");
    harnessStore.setBlockChatOnDirtyGitDefault(false);
    savePreferences({ blockChatOnDirtyGitDefault: false });
  }

  function handleCancelNonGitPreflight() {
    harnessStore.clearBlockingNonGitPreflight();
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

    const sent = sendCommand({
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

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
    }
  }

  let lastAttachmentDraftKey: string | undefined;
  onMount(() => {
    const key = attachmentDraftKey();
    lastAttachmentDraftKey = key;
    setDraftAttachments(readPersistedDraftAttachments(key, activeProject()?.activeThreadId));
    setAttachmentDraftHydrated(true);
  });

  createEffect(() => {
    const key = attachmentDraftKey();
    if (key === lastAttachmentDraftKey) {
      return;
    }
    setAttachmentDraftHydrated(false);
    lastAttachmentDraftKey = key;
    setDraftAttachments(readPersistedDraftAttachments(key, activeProject()?.activeThreadId));
    setAttachmentDraftHydrated(true);
  });

  createEffect(() => {
    const key = attachmentDraftKey();
    if (!key || !attachmentDraftHydrated()) {
      return;
    }
    persistDraftAttachments(key, draftAttachments());
  });

  async function uploadAttachmentFiles(files: File[]) {
    const project = activeProject();
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
      if (validation.kind === "image" && !hasVisionCapability()) {
        pushToast("Image blocked", "Current model lacks vision support for image attachments.", "error");
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

  async function handleSelectAttachments(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files ? [...input.files] : [];
    input.value = "";

    await uploadAttachmentFiles(files);
  }

  function handleRemoveAttachment(attachmentId: string) {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function syncComposerCaret() {
    if (composerTextarea) {
      setComposerCaret(composerTextarea.selectionStart);
    }
  }

  function runWithChatPanelOwner(callback: () => void) {
    if (owner) {
      runWithOwner(owner, callback);
      return;
    }
    callback();
  }

  function dismissComposerLookup(options: { focusComposer?: boolean } = {}) {
    setDismissedComposerLookupKey(composerLookupKey());
    setComposerLookupForcedClosed(true);
    setComposerLookupActiveIndex(0);
    setComposerLookupMenuHidden(true);
    queueMicrotask(() => syncComposerLookupDomVisibility());
    if (options.focusComposer) {
      queueMicrotask(() => composerTextarea?.focus());
    }
  }

  function updateComposerLookupDomSelection(activeIndex: number) {
    composerLookupMenu?.querySelectorAll<HTMLElement>("[data-composer-lookup-option]").forEach((element) => {
      const selected = element.dataset.composerLookupIndex === String(activeIndex);
      element.setAttribute("aria-selected", selected ? "true" : "false");
      for (const className of COMPOSER_LOOKUP_SELECTED_CLASSES) {
        element.classList.toggle(className, selected);
      }
    });
  }

  function syncComposerLookupDomVisibility(options: { focusMenu?: boolean } = {}) {
    if (!composerLookupMenu) {
      return;
    }
    const open = composerLookupOpen();
    setComposerLookupMenuHidden(!open);
    if (open) {
      updateComposerLookupDomSelection(composerLookupIndex());
      if (options.focusMenu) {
        composerLookupMenu.focus();
      }
    }
  }

  function setComposerLookupMenuHidden(hidden: boolean) {
    if (!composerLookupMenu) {
      return;
    }
    composerLookupMenu.hidden = hidden;
    composerLookupMenu.setAttribute("aria-hidden", hidden ? "true" : "false");
    if (hidden) {
      composerLookupMenu.removeAttribute("role");
      composerLookupMenu.removeAttribute("aria-label");
    } else {
      composerLookupMenu.setAttribute("role", "listbox");
      composerLookupMenu.setAttribute("aria-label", "Composer lookup");
    }
    composerLookupMenu.querySelectorAll<HTMLElement>("[data-composer-lookup-option]").forEach((element) => {
      if (hidden) {
        element.removeAttribute("role");
      } else {
        element.setAttribute("role", "option");
      }
    });
    composerLookupMenu.style.display = hidden ? "none" : "";
  }

  function setComposerLookupActiveIndex(index: number) {
    setComposerLookupIndex(index);
    updateComposerLookupDomSelection(index);
  }

  function applyComposerLookupOption(index = composerLookupIndex()) {
    const lookup = composerLookup();
    const option = composerLookupOptions()[index];
    if (!lookup || !option) {
      return;
    }
    const draft = project().draft;
    const nextDraft = `${draft.slice(0, lookup.start)}${option.insertText}${draft.slice(lookup.end)}`;
    const nextCaret = lookup.start + option.insertText.length;
    setComposerCaret(nextCaret);
    setDismissedComposerLookupKey(composerLookupKey());
    setComposerLookupForcedClosed(true);
    setComposerLookupActiveIndex(0);
    setComposerLookupMenuHidden(true);
    queueMicrotask(() => syncComposerLookupDomVisibility());
    harnessStore.setProjectDraft(project().id, nextDraft);
    queueMicrotask(() => {
      composerTextarea?.setSelectionRange(nextCaret, nextCaret);
      composerTextarea?.focus();
      setComposerCaret(nextCaret);
      resizeComposer();
    });
  }

  function handleComposerLookupKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      if (!composerLookupOpen()) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      setComposerLookupActiveIndex((composerLookupIndex() + 1) % composerLookupOptions().length);
      return true;
    }
    if (event.key === "ArrowUp") {
      if (!composerLookupOpen()) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      setComposerLookupActiveIndex((composerLookupIndex() + composerLookupOptions().length - 1) % composerLookupOptions().length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (!composerLookupOpen()) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      applyComposerLookupOption();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissComposerLookup({ focusComposer: true });
      return true;
    }
    return false;
  }

  function handleComposerKeyDown(event: KeyboardEvent) {
    if (handleComposerLookupKeyDown(event)) {
      return;
    }
    queueMicrotask(syncComposerCaret);
  }

  function handleComposerClick(event: MouseEvent & { currentTarget: HTMLTextAreaElement }) {
    syncComposerCaret();
    if (!event.ctrlKey && !event.metaKey) {
      if (composerLookupOpen()) {
        dismissComposerLookup({ focusComposer: true });
      } else {
        setComposerLookupForcedClosed(false);
        setDismissedComposerLookupKey(undefined);
      }
      return;
    }
    const reference = findChatFileReferenceAtPosition(event.currentTarget.value, event.currentTarget.selectionStart, chatFileLinkContext());
    if (!reference) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handleOpenChatFile(reference.target);
  }

  function handleOpenChatFile(target: ChatFileTarget) {
    const currentProject = activeProject();
    if (!currentProject) {
      return;
    }
    openIdeWindow({ projectId: currentProject.id, threadId: currentProject.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  function handleComposerBadgeClick(event: MouseEvent, badge: ComposerReferenceBadge) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    handleOpenChatFile(badge.target);
  }

  function handleAttachmentDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    setDraggingAttachments(true);
  }

  function handleAttachmentDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDraggingAttachments(false);
  }

  async function handleAttachmentDrop(event: DragEvent) {
    if (!event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    setDraggingAttachments(false);
    await uploadAttachmentFiles([...event.dataTransfer.files]);
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const submitState = composerSubmitState();
    if (submitState.disabled) {
      if (submitState.disabledReason) {
        pushToast("Cannot send yet", submitState.disabledReason, "error");
      }
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
      const sent = sendCommand({
        type: "planning.answer",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          questionId: question.id,
          content,
          attachments: draftAttachments(),
          ...getComposerControlPayload()
        }
      });

      if (sent) {
        harnessStore.setProjectDraft(project.id, "");
        setDraftAttachments([]);
      }
      return;
    }

    if (project.activeRun?.status === "ready") {
      const sent = sendCommand({
        type: "planning.refine",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          content,
          attachments: draftAttachments(),
          ...getComposerControlPayload()
        }
      });

      if (sent) {
        harnessStore.setProjectDraft(project.id, "");
        setDraftAttachments([]);
        clearCountdown();
      }
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
      const fallbackProviderBrand = resolveUsablePiProviderBrand(state);
      if (fallbackProviderBrand) {
        harnessStore.setProviderBrand(fallbackProviderBrand);
        persistProviderPreferences(fallbackProviderBrand);
      } else {
        pushToast(
          `${getProviderBrandLabel(state.providerBrand)} API key required`,
          "Open preferences and add an OpenAI, Google, or Anthropic key before sending chat.",
          "error"
        );
        harnessStore.openPreferencesModal();
        return;
      }
    }

    if (selectedAgentId() !== "pi") {
      const unavailableAgentReason = getSelectedAgentUnavailableReason();
      if (unavailableAgentReason) {
        pushToast("CLI runtime unavailable", unavailableAgentReason, "error");
        return;
      }
    }

    const executionModelId = getEffectiveExecutionModelId();
    const selectedModeId = isAutoModeSelected() ? "auto" : activeMode()?.id;

    const sent = sendCommand({
      type: "chat.send",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        agentId: selectedAgentId(),
        content,
        attachments: draftAttachments(),
        modeId: selectedModeId,
        modeLocked: state.hasGlobalSelectedModeId && selectedModeId !== "auto",
        executionModelId,
        ...getComposerControlPayload(),
        debug: state.debugEnabled
      }
    });

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
      setDraftAttachments([]);
    }
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
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxHeight = Math.max(lineHeight * 6, Math.floor(viewportHeight * 0.5));
    composerTextarea.style.height = "auto";
    composerTextarea.style.maxHeight = `${maxHeight}px`;
    const nextHeight = Math.max(minHeight, Math.min(composerTextarea.scrollHeight, maxHeight));
    composerTextarea.style.height = `${nextHeight}px`;
  }

  function getSelectedAgentUnavailableReason() {
    if (selectedAgentId() === "pi") {
      return undefined;
    }

    const runtime = selectedAgentRuntime();
    if (!runtime) {
      return "Refresh runtime health before using selected runtime";
    }

    if (!runtime.installed || !runtime.authenticated) {
      return runtime.healthMessage ?? `Install and authenticate ${runtime.label} before sending.`;
    }

    if (!runtime.supportsProgrammatic) {
      return runtime.healthMessage ?? `${runtime.label} cannot send tasks from harness yet.`;
    }

    return undefined;
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

  function handleResumeRun(runId: string) {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    if (!project) {
      return;
    }

    const sent = sendCommand({
      type: "run.resume",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId,
        guidanceText: project.draft.trim() || undefined,
        ...getComposerControlPayload()
      }
    });

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
    }
  }

  function handleRetryRun(runId: string) {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId,
        ...getComposerControlPayload()
      }
    });
  }

  function resolvePlanRun(runId?: string) {
    const project = activeProject();
    if (!project) {
      return;
    }

    return [project.activeRun, project.lastRun].find((entry) => entry?.id === runId) ?? (runId ? undefined : project.activeRun ?? project.lastRun);
  }

  function getPlanRunState(runId: string): AgentRunState | AgentRunSummary | undefined {
    const project = activeProject();
    return [project?.activeRun, project?.lastRun].find((entry) => entry?.id === runId) ?? project?.runSummaries.find((run) => run.id === runId);
  }

  function getPlanRunAction(runId: string) {
    const run = getPlanRunState(runId);
    if (!run) {
      return {
        kind: "unavailable" as const,
        label: "Unavailable",
        tooltip: "This persisted run is not available",
        disabled: true,
        disabledReason: "This run is not available"
      };
    }

    if (["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"].includes(run.status)) {
      return {
        kind: "in-progress" as const,
        label: "In progress",
        tooltip: "This plan is already in progress",
        disabled: true,
        disabledReason: "This plan is already in progress"
      };
    }

    if (run.status === "completed") {
      return {
        kind: "completed" as const,
        label: "Completed",
        tooltip: "This plan has completed",
        disabled: true,
        disabledReason: "This plan has completed"
      };
    }

    if (run.status === "ready") {
      return {
        kind: "execute" as const,
        label: "Build now",
        tooltip: "Build this persisted plan now",
        disabled: executionPaused(),
        disabledReason: executionPauseReason()
      };
    }

    if ((run.status === "partial-complete" || run.status === "stopped") && run.resumable) {
      return {
        kind: "resume" as const,
        label: "Resume",
        tooltip: "Resume this persisted run",
        disabled: executionPaused(),
        disabledReason: executionPauseReason()
      };
    }

    if ((run.status === "failed" || run.status === "partial-complete" || run.status === "stopped") && run.retryable) {
      return {
        kind: "retry" as const,
        label: "Retry",
        tooltip: "Retry this persisted run",
        disabled: executionPaused(),
        disabledReason: executionPauseReason()
      };
    }

    return {
      kind: "unavailable" as const,
      label: "Unavailable",
      tooltip: "This plan cannot be run from its current state",
      disabled: true,
      disabledReason: "This plan cannot be run from its current state"
    };
  }

  function handlePlanRunAction(runId: string) {
    const action = getPlanRunAction(runId);
    if (action.disabled) {
      return;
    }

    if (action.kind === "execute") {
      handleExecuteRun(runId);
      return;
    }

    if (action.kind === "resume") {
      handleResumeRun(runId);
      return;
    }

    if (action.kind === "retry") {
      handleRetryRun(runId);
    }
  }

  function renderPlanRunAction(runId: string) {
    const action = () => getPlanRunAction(runId);
    return (
      <ActionButton
        tooltip={action().tooltip}
        disabledReason={action().disabledReason}
        disabled={action().disabled}
        icon={action().kind === "completed" ? <Check class="h-3.5 w-3.5" /> : action().kind === "retry" ? <RefreshCcw class="h-3.5 w-3.5" /> : <Play class="h-3.5 w-3.5" />}
        size="sm"
        dataTourId={action().kind === "execute" ? "plan-start" : undefined}
        onClick={() => handlePlanRunAction(runId)}
      >
        {action().label}
      </ActionButton>
    );
  }

  function renderTranscriptRow(row: ChatTimelineRow, index: number, project: ViewProjectState) {
    if (row.kind === "tool-block") {
      return <StreamedToolBlock block={row.block} fileLinks={chatFileLinks()} />;
    }

    if (row.kind === "live") {
      return (
        <article
          class="flex flex-col gap-2 rounded-3xl border border-(--border) p-3 shadow-sm"
          classList={{ "bg-white/70": row.message.kind === "status", "bg-teal-950/5": row.message.kind !== "status" }}
        >
          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--accent-strong)">harness</div>
          <MarkdownContent content={() => row.message.content} size="compact" live={!row.message.locked && row.liveIndex === liveHarnessMessages().length - 1} fileLinks={chatFileLinks()} />
          {renderMessageActionRow(
            liveHarnessMessageTimestamp(),
            <CopyTextButton
              value={row.message.content}
              tooltip="Copy harness message"
              copiedTitle="Message copied"
              copiedDescription="Message copied to clipboard."
              size="sm"
              variant="ghost"
              ariaLabel="Copy harness message"
            >
              Copy
            </CopyTextButton>
          )}
        </article>
      );
    }

    const message = row.message;
    if (shouldHidePersistedStreamingAssistantMessage(project, message)) {
      return null;
    }

    return (
      <Show
        when={message.kind === "plan-summary" && message.metadata?.type === "plan-summary"}
        fallback={
          <article
            class="rounded-3xl border border-(--border) p-3 shadow-sm"
            classList={{
              "bg-teal-950/10": isHarnessTranscriptMessage(message) && message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open",
              "ring-1": isHarnessTranscriptMessage(message) && message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open",
              "ring-teal-700/20": isHarnessTranscriptMessage(message) && message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open",
              "bg-teal-950/5": isHarnessTranscriptMessage(message) && !(message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open"),
              "bg-white/60": !isHarnessTranscriptMessage(message)
            }}
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <div
                  class="text-[0.585rem] font-semibold uppercase tracking-[0.2em]"
                  classList={{ "text-(--accent-strong)": isHarnessTranscriptMessage(message), "text-(--muted)": !isHarnessTranscriptMessage(message) }}
                >
                  {getTranscriptRoleLabel(message.role)}
                </div>
                <Show when={message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open"}>
                  <span class="rounded-full border border-teal-700/25 bg-white/70 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-(--accent-strong)">
                    In progress
                  </span>
                </Show>
              </div>
              <MarkdownContent content={() => message.content} size="compact" fileLinks={chatFileLinks()} />
              <Show when={message.metadata?.type === "assistant-action"}>
                {renderAssistantActionCard(message.metadata as AssistantActionMessageMetadata)}
              </Show>
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
              {renderMessageActionRow(
                message.createdAt,
                <CopyTextButton
                  value={getCopyableMessageText(message)}
                  tooltip="Copy message"
                  copiedTitle="Message copied"
                  copiedDescription="Message copied to clipboard."
                  size="sm"
                  variant="ghost"
                  ariaLabel={getCopyAriaLabel(message)}
                >
                  Copy
                </CopyTextButton>
              )}
            </div>
          </article>
        }
      >
        <article class="theme-selected-surface flex flex-col gap-3 rounded-3xl border border-(--border) p-4 shadow-sm">
          <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--accent-strong)">
            <Clipboard class="h-3.5 w-3.5" />
            Plan summary
          </div>
          <MarkdownContent content={() => getPlanFromMessage(message)?.summary ?? ""} fileLinks={chatFileLinks()} />
          <div class="grid gap-2 text-[0.675rem] text-(--muted) md:grid-cols-2">
            <div>Route: {getPlanFromMessage(message)?.route}</div>
            <div>Difficulty: {getPlanFromMessage(message)?.difficultyScore}%</div>
            <div>Parallel slots: {getPlanFromMessage(message)?.actualSubagentCount}</div>
            <div>Prereqs: {getPlanFromMessage(message)?.prerequisites.length}</div>
            <div>Contracts: {getPlanFromMessage(message)?.contracts.length}</div>
            <div>Isolation: {getPlanFromMessage(message)?.subagentWorktreeStrategy}</div>
            <div>Correctness: {getPlanFromMessage(message)?.correctnessPolicy}</div>
          </div>
          <Show when={hasBranchfsSizeWarning()}>
            <div class="inline-flex w-fit items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[0.625rem] font-medium text-amber-800">
              <AlertTriangle class="h-3 w-3" />
              BranchFS large
            </div>
          </Show>
          <div class="mt-3 flex items-center justify-between gap-3">
            <div class="min-w-0 text-[0.575rem] uppercase tracking-[0.12em] text-(--muted)">
              {formatShortTimestamp(message.createdAt)}
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <ActionButton
                tooltip="Open full execution plan"
                icon={<Clipboard class="h-3.5 w-3.5" />}
                size="sm"
                variant="secondary"
                onClick={() => {
                  const plan = getPlanFromMessage(message);
                  if (plan) {
                    harnessStore.openExecutionPlanDialog(plan);
                  }
                }}
              >
                Open plan
              </ActionButton>
              <ActionButton
                tooltip="Promote this run into scheduled task"
                icon={<CalendarClock class="h-3.5 w-3.5" />}
                size="sm"
                variant="secondary"
                onClick={() => handlePromoteScheduledRun((message.metadata as { runId: string }).runId)}
              >
                Schedule
              </ActionButton>
              {renderPlanRunAction((message.metadata as { runId: string }).runId)}
              <Show when={getPlanFromMessage(message)?.gating.mode === "approve"}>
                <ActionButton
                  tooltip="Run this plan in isolated virtual branch"
                  disabledReason={
                    getPlanRunAction((message.metadata as { runId: string }).runId).kind === "execute"
                      ? executionPauseReason()
                      : "This plan is not ready to build"
                  }
                  disabled={getPlanRunAction((message.metadata as { runId: string }).runId).kind !== "execute" || executionPaused()}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExecuteRunTarget((message.metadata as { runId: string }).runId, "ephemeral-experiment")}
                >
                  Try experiment
                </ActionButton>
              </Show>
              <Show when={getPlanFromMessage(message)?.gating.mode === "countdown" && readyRun()?.id === (message.metadata as { runId: string }).runId}>
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
          </div>
        </article>
      </Show>
    );
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

  function handleSelectPaneTab(tab: ChatPaneTab) {
    harnessStore.setChatPaneTab(tab);
    if (tab === "memory" && state.connectionState === "connected") {
      queueMicrotask(handleLoadMemoryEntries);
    }
  }

  function handleUpdateMemory(entryId: string, patch: { pinned?: boolean; status?: "active" | "archived" }) {
    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.update",
      requestId: createRequestId(),
      payload: {
        memoryEntryId: entryId,
        ...patch
      }
    });
  }

  function handleReorderMemory(entryId: string, direction: "up" | "down") {
    const project = activeProject();
    if (!project) {
      return;
    }

    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.reorder",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        memoryEntryId: entryId,
        direction
      }
    });
  }

  function handleDeleteMemory(entryId: string) {
    if (deleteArmedMemoryId() !== entryId) {
      setDeleteArmedMemoryId(entryId);
      return;
    }

    setDeleteArmedMemoryId(undefined);
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

    const sent = sendCommand({
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

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
    }
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
    if (!project?.activeRun) {
      return;
    }
    sendCommand({
      type: "chat.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: project.activeRun.id
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
    const cacheHitPercent = getCacheHitPercent(usage);
    const cacheLine =
      cacheHitPercent === undefined
        ? undefined
        : `Cache hit: ${cacheHitPercent}% (${formatTokenCount(usage.cachedInputTokens)} tokens)`;
    const totalProcessedLine =
      usage.totalProcessedTokens === undefined ? undefined : `Total processed: ${formatTokenCount(usage.totalProcessedTokens)} tokens`;
    return [summary, cacheLine, totalProcessedLine, "Automatically compacts its context when needed."].filter(Boolean).join("\n");
  }

  function getCacheHitPercent(usage: { tokens?: number; cachedInputTokens?: number }) {
    const cachedInputTokens = usage.cachedInputTokens ?? 0;
    const totalInputTokens = (usage.tokens ?? 0) + cachedInputTokens;
    if (cachedInputTokens <= 0 || totalInputTokens <= 0) {
      return undefined;
    }

    return Math.round((cachedInputTokens / totalInputTokens) * 100);
  }

  function handleProviderBrandSelect(providerBrand: ProviderBrand) {
    if (!canSelectProviderBrand(state, providerBrand)) {
      pushToast("Provider key required", `Saved ${getProviderBrandLabel(providerBrand)} key required.`, "error");
      return;
    }

    harnessStore.setProviderBrand(providerBrand);
    persistProviderPreferences(providerBrand);
  }

  function persistProviderPreferences(providerBrand: ProviderBrand) {
    savePreferences({ providerBrand });
  }

  function savePreferences(overrides: { providerBrand?: ProviderBrand; blockChatOnDirtyGitDefault?: boolean } = {}) {
    const providerBrand = overrides.providerBrand ?? state.providerBrand;
    const blockChatOnDirtyGitDefault = overrides.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault;
    persistMergedLocalPreferences({
      openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
      googleApiKey: state.googleApiKeyDraft.trim() || undefined,
      anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
      providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault
    });

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
        providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: state.checkCliUpdatesDefault
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
      <div class="flex flex-col gap-2">
        <div class="flex flex-col gap-0.5">
          <span class="px-1 text-[0.375rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">Effort</span>
          <For each={COMPOSER_REASONING_STRENGTHS}>
            {(strength) => {
              const enabled = composerControlState().availableStrengths.includes(strength);
              const selected = selectedReasoningStrength() === strength;
              return (
                <Tooltip content={getReasoningStrengthDescription(strength)} triggerClass="block" side="right">
                  <button
                    type="button"
                    disabled={!enabled}
                    class="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left text-[0.525rem] text-(--foreground) transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      if (!enabled) {
                        return;
                      }
                      handleReasoningStrengthSelect(strength);
                    }}
                  >
                    <span>{formatReasoningOptionLabel(strength)}</span>
                    <Show when={selected}>
                      <Check class="h-3 w-3" />
                    </Show>
                  </button>
                </Tooltip>
              );
            }}
          </For>
        </div>
        <div class="h-px bg-black/10" />
        <div class="flex flex-col gap-0.5">
          <span class="px-1 text-[0.375rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">Fast mode</span>
          <For each={[false, true] as const}>
            {(enabled) => {
              const supported = !enabled || composerControlState().supportsFastMode;
              const selected = selectedFastMode() === enabled;
              return (
                <Tooltip content={getFastModeDescription(enabled)} triggerClass="block" side="right">
                  <button
                    type="button"
                    disabled={!supported}
                    class="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left text-[0.525rem] text-(--foreground) transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      if (!supported) {
                        return;
                      }
                      handleFastModeSelect(enabled);
                    }}
                  >
                    <span>{enabled ? "On" : "Off"}</span>
                    <Show when={selected}>
                      <Check class="h-3 w-3" />
                    </Show>
                  </button>
                </Tooltip>
              );
            }}
          </For>
        </div>
        <Show when={disabledHint}>
          <div class="px-1 text-[0.45rem] text-(--muted)">{disabledHint}</div>
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

    const run = resolvePlanRun(runId);
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
      timezone: resolveBrowserTimezone(),
      aiPrompt: run.latestUserPrompt,
      aiModeId: activeMode()?.id,
      aiExecutionModelId: run.executionModelId ?? getEffectiveExecutionModelId(),
      aiReasoningStrength: selectedReasoningStrength(),
      aiFastMode: selectedFastMode(),
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

  function handleOpenCurrentRunJob() {
    const backgroundRun = currentBackgroundRun();
    if (!backgroundRun) {
      return;
    }

    openBackgroundRunInJobsPane(state, backgroundRun.id, backgroundRun.jobId);
  }

  function handleAssistantActionCardAction(metadata: AssistantActionMessageMetadata, actionKind: AssistantActionMessageMetadata["actions"][number]["kind"]) {
    const project = activeProject();
    if (actionKind === "open-assistant") {
      harnessStore.setSelectedAssistantId(metadata.assistantId);
      harnessStore.setActiveSurface("assistants");
      return;
    }
    if (actionKind === "open-jobs") {
      harnessStore.setActiveSurface("background-jobs");
      return;
    }
    if (actionKind === "schedule-job") {
      harnessStore.setSelectedAssistantId(metadata.assistantId);
      harnessStore.setActiveSurface("background-jobs");
      return;
    }
    if (actionKind === "retry-bootstrap") {
      sendCommand({
        type: "assistant.bootstrap.retry",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId
        }
      });
      return;
    }
    if (actionKind === "pause" || actionKind === "resume") {
      sendCommand({
        type: actionKind === "pause" ? "assistant.pause" : "assistant.resume",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId
        }
      });
      return;
    }
    if (actionKind === "recover") {
      sendCommand({
        type: "assistant.circuit-breaker.retry",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId
        }
      });
      return;
    }
    if (actionKind === "run-job" && project && metadata.jobId) {
      sendCommand({
        type: "background-job.run-now",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          jobId: metadata.jobId
        }
      });
      return;
    }
    if (actionKind === "answer-question" && metadata.questionId) {
      sendCommand({
        type: "assistant.question.answer",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId,
          questionId: metadata.questionId,
          content: "Acknowledged from project chat."
        }
      });
    }
  }

  function renderAssistantActionCard(metadata: AssistantActionMessageMetadata) {
    return (
      <div data-test-assistant-action-card="" class="flex flex-col gap-3 rounded-2xl border border-teal-700/20 bg-white/75 p-3">
        <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--accent-strong)">
          <Bot class="h-3.5 w-3.5" />
          Assistant action
        </div>
        <div class="grid gap-2 text-[0.675rem] text-(--muted) md:grid-cols-2">
          <For each={metadata.summaryRows}>
            {(row) => (
              <div class="min-w-0">
                <span class="font-semibold text-(--foreground)">{row.label}: </span>
                <span class="wrap-break-words">{row.value}</span>
              </div>
            )}
          </For>
        </div>
        <div class="flex flex-wrap gap-2">
          <For each={metadata.actions}>
            {(action) => (
              <ActionButton
                tooltip={action.disabled ? action.disabledReason ?? action.label : action.label}
                disabled={action.disabled}
                disabledReason={action.disabledReason}
                icon={
                  action.kind === "open-jobs" || action.kind === "run-job" ? (
                    <Briefcase class="h-3.5 w-3.5" />
                  ) : action.kind === "schedule-job" ? (
                    <CalendarClock class="h-3.5 w-3.5" />
                  ) : action.kind === "pause" ? (
                    <Pause class="h-3.5 w-3.5" />
                  ) : action.kind === "resume" ? (
                    <Play class="h-3.5 w-3.5" />
                  ) : action.kind === "recover" || action.kind === "retry-bootstrap" ? (
                    <RefreshCcw class="h-3.5 w-3.5" />
                  ) : (
                    <Bot class="h-3.5 w-3.5" />
                  )
                }
                size="sm"
                variant="secondary"
                onClick={() => handleAssistantActionCardAction(metadata, action.kind)}
              >
                {action.label}
              </ActionButton>
            )}
          </For>
        </div>
      </div>
    );
  }

  return (
    <section data-test-chat-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-3 rounded-2xl border-t-0 p-[0.8rem]">
      <Dialog
        open={Boolean(state.blockingNonGitPreflight)}
        title="Git setup required"
        eyebrow="Preflight"
        description="Dirty-git protection cannot verify this folder because it is not a git repository."
        onClose={handleCancelNonGitPreflight}
        footer={
          <>
            <ActionButton tooltip="Initialize git and commit the current folder baseline" type="button" onClick={handleInitGitBaseline}>
              Init Git
            </ActionButton>
            <ActionButton tooltip="Disable dirty-git protection and retry this run" type="button" variant="secondary" onClick={handleDisableDirtyGitCheck}>
              Disable check and continue
            </ActionButton>
            <ActionButton tooltip="Cancel this run" type="button" variant="ghost" onClick={handleCancelNonGitPreflight}>
              Cancel
            </ActionButton>
          </>
        }
      >
        <div class="space-y-2 text-xs leading-6 text-(--muted)">
          <p>{state.blockingNonGitPreflight?.preflight.repairSummary}</p>
          <p>{state.blockingNonGitPreflight?.preflight.repairDetail}</p>
        </div>
      </Dialog>
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
          <>
          <div class="flex min-w-0 flex-col gap-3 border-b border-(--border) pb-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <div class="flex min-w-0 items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                  <Folder class="h-3.5 w-3.5 shrink-0 text-(--accent)" />
                  <Tooltip content={project().rootPath} triggerClass="min-w-0">
                    <span class="block min-w-0 truncate">{project().name}</span>
                  </Tooltip>
                </div>
                <div class="min-w-0">
                  <div class="inline-flex min-w-0 max-w-full items-center gap-1.5">
                    <Show
                      when={editingThreadTitle()}
                      fallback={
                        <Tooltip content={activeThread()?.title ?? "Thread"} triggerClass="block min-w-0 max-w-full">
                          <h3 class="max-w-full truncate font-display text-[1.35rem] text-(--foreground) md:text-[1.65rem]">
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
                    <span>{activeThread()?.messageCount ?? 0} msgs</span>
                    <span class="h-1 w-1 rounded-full bg-(--border)" />
                    <span>thread</span>
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

              <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                <ActionButton
                  tooltip={tooltipWithPrimaryHotkey(
                    "Create a new thread in this project",
                    normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).createProjectChat[0]
                  )}
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
                  disabled={!activeThreadIsStreaming()}
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
                        disabled={activeThreadIsStreaming()}
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
                <div class="flex h-full min-h-0 flex-col">
                  <div data-test-chat-pane-nav="" role="tablist" aria-label="Project panes" class="surface-tab-strip px-0">
                    <div class="flex flex-wrap items-center gap-1">
                      <For each={visibleTabs()}>
                        {(tab) => {
                          const pressed = selectedTab === tab.id;

                          return (
                            <Tooltip content={tab.tooltip}>
                              <button
                                type="button"
                                role="tab"
                                class={cn(buttonVariants({ variant: "ghost" }), "surface-tab")}
                                aria-label={tab.label}
                                attr:aria-selected={pressed ? "true" : "false"}
                                tabIndex={pressed ? 0 : -1}
                                data-test-chat-pane-tab={tab.id}
                                onClick={() => handleSelectPaneTab(tab.id)}
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
                  <Show when={resumableRun()}>
                    {(run) => (
                      <div class="my-3 flex flex-col gap-3 rounded-lg border border-rose-300/70 bg-rose-50/80 p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-rose-800">
                            <AlertTriangle class="h-3.5 w-3.5" />
                            Resumable run
                          </div>
                          <div class="mt-1 text-[0.75rem] leading-5 text-rose-950">
                            Status: {run().status}. Failed subtasks: {failedSubtaskCount()}.
                          </div>
                          <div class="mt-1 text-[0.65rem] leading-5 text-rose-900/75">
                            Resume reruns failed or pending subtasks only. Composer text becomes extra guidance.
                          </div>
                        </div>
                        <ActionButton
                          tooltip="Resume failed or pending subagents"
                          disabledReason={
                            executionPaused()
                              ? executionPauseReason()
                              : activeThreadIsStreaming()
                                ? "Project is streaming"
                                : "No resumable run"
                          }
                          disabled={executionPaused() || !resumableRun() || activeThreadIsStreaming()}
                          icon={<RefreshCcw class="h-4 w-4" />}
                          type="button"
                          onClick={handleResume}
                        >
                          Resume failed agents
                        </ActionButton>
                      </div>
                    )}
                  </Show>

                  <Switch>
                    <Match when={selectedTab === "chat"}>
                      <div class="relative flex min-h-0 flex-1 flex-col">
                        <VirtualList
                          viewportRef={(element) => {
                            messageViewport = element;
                          }}
                          class="flex-1 min-h-0 pr-2"
                          contentClass="w-full"
                          itemClass="pb-3"
                          dataTest="project-chat-transcript"
                          items={transcriptRows()}
                          getKey={(row, index) => row.kind === "persisted" ? row.message.id : row.kind === "tool-block" ? row.block.id : `live-${row.message.id}-${index}`}
                          estimateSize={estimateTranscriptRowSize}
                          pagination={{ kind: "reverse", initialCount: CHAT_TRANSCRIPT_LIMIT, batchSize: CHAT_TRANSCRIPT_LIMIT, thresholdPx: 1000 }}
                          overscan={20}
                          stickToEnd
                          onScroll={updateScrollLock}
                          empty={
                            <div class="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-(--border) bg-white/38 p-6 text-center text-[0.675rem] text-(--muted)">
                              No messages in this thread yet. Send a task from the composer.
                            </div>
                          }
                        >
                          {(row, index) => renderTranscriptRow(row, index, project())}
                        </VirtualList>
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
                          <DropdownControl
                            kind="select"
                            ariaLabel="Select active mode"
                            icon={<Split class="h-3.5 w-3.5" />}
                            size="md"
                            class="w-full"
                            value={isAutoModeSelected() ? "auto" : activeMode()?.id ?? "implement"}
                            options={modeDropdownOptions()}
                            onChange={handleModeSelect}
                          />
                        </label>
                        <div class="rounded-2xl border border-(--border) bg-white/70 p-3 text-[0.675rem] leading-5 text-(--muted)">
                          {isAutoModeSelected()
                            ? "Interpret each prompt and choose the best implementation mode."
                            : activeMode()?.description ?? "Default implementation mode."}
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
                          <MarkdownContent content={() => plan().summary} size="compact" fileLinks={chatFileLinks()} />
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
                          <Show when={currentBackgroundRun()}>
                            <ActionButton
                              tooltip="Open background job for this run"
                              icon={<Briefcase class="h-3.5 w-3.5" />}
                              size="sm"
                              variant="secondary"
                              onClick={handleOpenCurrentRunJob}
                            >
                              Job
                            </ActionButton>
                          </Show>
                          <ActionButton
                            tooltip="Promote latest run into scheduled task"
                            icon={<CalendarClock class="h-3.5 w-3.5" />}
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePromoteScheduledRun()}
                          >
                            Schedule
                          </ActionButton>
                          <Show when={currentExecutionPlan()}>
                            {(plan) => renderPlanRunAction(plan().runId)}
                          </Show>
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
                        <RunLedgerCompact run={project().activeRun ?? project().lastRun} />
                        <RunProofBundleCompact run={project().activeRun ?? project().lastRun} />
                        <Tooltip
                          content={project().activeRun?.latestUserPrompt ?? project().lastRun?.latestUserPrompt ?? undefined}
                          triggerClass="block min-w-0"
                        >
                          <div class="truncate">
                            Prompt: {project().activeRun?.latestUserPrompt ?? project().lastRun?.latestUserPrompt ?? "n/a"}
                          </div>
                        </Tooltip>
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
                    <VirtualList
                      class="min-h-80 pr-2"
                      contentClass="w-full"
                      itemClass="pb-3"
                      items={runSubtasks()}
                      getKey={(task, index) => `${task.id ?? task.title}-${index}`}
                      estimateSize={150}
                      pagination={{ kind: "reverse", initialCount: CHAT_RUN_SUBTASK_LIMIT, batchSize: CHAT_RUN_SUBTASK_LIMIT }}
                      empty={<div class="rounded-[1.2rem] border border-dashed border-(--border) bg-white/55 p-4 text-[0.675rem] text-(--muted)">No subtasks yet.</div>}
                    >
                      {(task) => (
                        <div class="rounded-[1.2rem] border border-(--border) bg-white/60 p-4 text-[0.675rem] leading-6 text-(--foreground)">
                          <div class="font-semibold">{task.title}</div>
                          <div class="text-(--muted)">Status: {task.status} | Attempts: {task.attemptCount}</div>
                          <Show when={task.output}>
                            <div class="pt-2">
                              <MarkdownContent content={() => task.output ?? ""} size="compact" fileLinks={chatFileLinks()} />
                            </div>
                          </Show>
                          <Show when={task.errorMessage}>
                            <div class="pt-2">
                              <MarkdownContent content={() => task.errorMessage ?? ""} size="compact" tone="danger" fileLinks={chatFileLinks()} />
                            </div>
                          </Show>
                        </div>
                      )}
                    </VirtualList>
                  </div>
                </ScrollArea>
                    </Match>
                    <Match when={selectedTab === "events"}>
                <VirtualList
                  class="flex-1 min-h-0 pr-2"
                  contentClass="w-full"
                  itemClass="pb-3"
                  items={projectTraces()}
                  getKey={(trace, index) => `${trace.stage}-${index}`}
                  estimateSize={145}
                  pagination={{ kind: "reverse", initialCount: CHAT_EVENT_LIMIT, batchSize: CHAT_EVENT_LIMIT }}
                  empty={
                    <div class="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-(--border) bg-white/40 p-8 text-center text-[0.675rem] text-(--muted)">
                      No execution events yet.
                    </div>
                  }
                >
                  {(trace) => (
                    <article class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
                      <div class="flex items-center justify-between gap-3 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">
                        <span>{trace.stage}</span>
                        <span>{trace.modelId ?? "n/a"}</span>
                      </div>
                      <MarkdownContent content={() => trace.message} size="compact" fileLinks={chatFileLinks()} />
                      <Show when={trace.detail}>
                        <div class="pt-2">
                          <MarkdownContent content={() => trace.detail ?? ""} size="compact" tone="muted" fileLinks={chatFileLinks()} />
                        </div>
                      </Show>
                    </article>
                  )}
                </VirtualList>
                    </Match>
                    <Match when={selectedTab === "memory"}>
                <VirtualList
                  class="flex-1 min-h-0 pr-2"
                  contentClass="w-full"
                  itemClass="pb-3"
                  items={projectMemoryEntries()}
                  getKey={(entry) => entry.id}
                  estimateSize={190}
                  pagination={{ kind: "reverse", initialCount: CHAT_MEMORY_LIMIT, batchSize: CHAT_MEMORY_LIMIT }}
                  empty={
                    <div class="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-(--border) bg-white/40 p-8 text-center text-[0.675rem] text-(--muted)">
                      No shared memory yet.
                    </div>
                  }
                >
                  {(entry, index) => (
                    <article class="rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--accent-strong)">{entry.kind}</div>
                          <div class="font-semibold">{entry.title}</div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                          <ActionButton
                            tooltip="Move memory earlier in retrieval priority"
                            disabled={index === 0}
                            disabledReason="Already highest priority memory"
                            icon={<ArrowUp class="h-3.5 w-3.5" />}
                            size="icon"
                            variant="secondary"
                            ariaLabel="Move memory up"
                            onClick={() => handleReorderMemory(entry.id, "up")}
                          />
                          <ActionButton
                            tooltip="Move memory later in retrieval priority"
                            disabled={index === projectMemoryEntries().length - 1}
                            disabledReason="Already lowest priority memory"
                            icon={<ArrowDown class="h-3.5 w-3.5" />}
                            size="icon"
                            variant="secondary"
                            ariaLabel="Move memory down"
                            onClick={() => handleReorderMemory(entry.id, "down")}
                          />
                          <ActionButton tooltip={entry.pinned ? "Unpin memory entry" : "Pin memory entry"} size="sm" variant="secondary" onClick={() => handleUpdateMemory(entry.id, { pinned: !entry.pinned })}>
                            {entry.pinned ? "Unpin" : "Pin"}
                          </ActionButton>
                          <ActionButton
                            tooltip={entry.status === "active" ? "Archive memory entry" : "Restore memory entry"}
                            size="sm"
                            variant="secondary"
                            onClick={() => handleUpdateMemory(entry.id, { status: entry.status === "active" ? "archived" : "active" })}
                          >
                            {entry.status === "active" ? "Archive" : "Restore"}
                          </ActionButton>
                          <ActionButton tooltip="Permanently delete this memory entry" size="sm" variant="secondary" onClick={() => handleDeleteMemory(entry.id)}>
                            {deleteArmedMemoryId() === entry.id ? "Confirm delete" : "Delete"}
                          </ActionButton>
                        </div>
                      </div>
                      <div class="pt-2 text-(--muted)">priority {entry.priority} | {entry.confidence} | {entry.freshness} | hits {entry.hitCount}</div>
                      <div class="pt-2">
                        <MarkdownContent content={() => entry.summary} size="compact" fileLinks={chatFileLinks()} />
                      </div>
                      <Show when={entry.evidence}>
                        <div class="pt-2">
                          <MarkdownContent content={() => entry.evidence ?? ""} size="compact" tone="muted" fileLinks={chatFileLinks()} />
                        </div>
                      </Show>
                    </article>
                  )}
                </VirtualList>
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

            <form
              data-test-chat-composer=""
              class="relative shrink-0 space-y-3"
              onSubmit={handleSubmit}
              onDragOver={handleAttachmentDragOver}
              onDragLeave={handleAttachmentDragLeave}
              onDrop={handleAttachmentDrop}
            >
              <Show when={draggingAttachments()}>
                <div class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border border-dashed border-(--accent) bg-white/85 p-4 text-center shadow-lg">
                  <div>
                    <div class="text-[0.75rem] font-semibold text-(--foreground)">{dropState().label}</div>
                    <div class="mt-1 text-[0.675rem] text-(--muted)">{dropState().detail}</div>
                  </div>
                </div>
              </Show>
              <Show when={pendingQuestion()}>
                {(question) => (
                  <div class="flex flex-col gap-3 rounded-3xl border border-amber-300/70 bg-amber-50/80 p-4 shadow-sm">
                    <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-amber-800">
                      <MessageSquareMore class="h-3.5 w-3.5" />
                      {question().intent?.type === "assistant-create-intent" && question().responseKind === "freeform" ? "Assistant setup" : "Planner question"}
                    </div>
                    <div class="text-[0.7875rem] leading-6 text-amber-950">{question().prompt}</div>
                    <Show when={question().placeholder}>
                      <div class="text-[0.675rem] text-amber-900/70">Example reply: {question().placeholder}</div>
                    </Show>
                    <Show when={question().responseKind !== "freeform"}>
                      <div class="grid gap-2 md:grid-cols-3">
                        <For each={question().choices ?? []}>
                          {(choice) => (
                            <Tooltip content={executionPaused() ? executionPauseReason() : choice.description}>
                              <span class="inline-flex">
                                <button
                                  class="cursor-pointer rounded-[1.1rem] border px-3 py-2 text-left text-[0.675rem] transition disabled:cursor-not-allowed"
                                  classList={{
                                    "border-amber-500": choice.recommended,
                                    "bg-white": choice.recommended,
                                    "text-amber-950": choice.recommended,
                                    "border-amber-200/80": !choice.recommended,
                                    "bg-white/70": !choice.recommended,
                                    "text-amber-900": !choice.recommended
                                  }}
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
                    </Show>
                    <Show when={executionPaused()}>
                      <div class="text-[0.625rem] text-amber-900/75">
                        Global pause active. Send answer after resume.
                      </div>
                    </Show>
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

              <Show when={composerTimerState()}>
                {(timer) => (
                  <div
                    aria-live="polite"
                    data-test-waiting-timer=""
                    role="status"
                    class="flex items-center gap-2 px-1 text-[0.675rem] font-medium text-(--muted)"
                  >
                    <Show when={timer().kind === "working"}>
                      <span aria-hidden="true" class="agent-waiting-dots">
                        <span class="agent-waiting-dot" />
                        <span class="agent-waiting-dot agent-waiting-dot-2" />
                        <span class="agent-waiting-dot agent-waiting-dot-3" />
                      </span>
                    </Show>
                    <span>{timer().label}</span>
                  </div>
                )}
              </Show>

              <ChatComposer
                dataTourId="chat-composer"
                textareaRef={(element) => {
                  composerTextarea = element;
                }}
                rows="2"
                value={project().draft}
                placeholder={getComposerPlaceholder()}
                disabled={executionPaused()}
                disabledReason={executionPauseReason()}
                onSubmit={() => composerTextarea?.form?.requestSubmit()}
                onKeyDown={handleComposerKeyDown}
                onKeyUp={syncComposerCaret}
                onClick={handleComposerClick}
                onSelect={syncComposerCaret}
                onFocus={() => queueMicrotask(syncComposerCaret)}
                ariaControls={composerLookupOpen() ? "chat-composer-lookup" : undefined}
                ariaExpanded={composerLookupOpen()}
                ariaActiveDescendant={composerLookupActiveOptionId()}
                onInput={(value) => {
                  syncComposerCaret();
                  harnessStore.setProjectDraft(project().id, value);
                  setComposerLookupForcedClosed(false);
                  setDismissedComposerLookupKey(undefined);
                  setComposerLookupActiveIndex(0);
                  queueMicrotask(() => syncComposerLookupDomVisibility({ focusMenu: composerLookupOpen() }));
                  resizeComposer();
                }}
                rightActions={
                  <>
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
                      tooltip={composerSubmitState().tooltip}
                      disabledReason={composerSubmitState().disabledReason}
                      disabled={composerSubmitState().disabled}
                      icon={<SendHorizontal class="h-4 w-4" />}
                      type="submit"
                      variant="ghost"
                      size="icon"
                      class="pointer-events-auto h-8 w-8 rounded-lg"
                      dataTourId="chat-send"
                    />
                  </>
                }
                leftControls={
                  <>
                    <div data-test-composer-control-row="" class="hidden flex-wrap items-center gap-1 lg:flex">
                      {renderModeControl()}
                      {renderAgentControl()}
                      {renderProviderControl()}
                      {renderModelControl()}
                      <Popover
                        open={desktopReasoningMenuOpen()}
                        onClose={() => setDesktopReasoningMenuOpen(false)}
                        align="start"
                        side="top"
                        contentClass="p-1.5"
                        content={renderComposerControlMenu()}
                      >
                        {renderEffortControl(() => setDesktopReasoningMenuOpen((current) => !current))}
                      </Popover>
                    </div>
                    <div class="flex items-center gap-2">
                      <Popover
                        open={mobileReasoningMenuOpen()}
                        onClose={() => setMobileReasoningMenuOpen(false)}
                        align="start"
                        side="top"
                        contentClass="p-1.5"
                        content={renderComposerControlMenu()}
                      >
                        {renderEffortControl(() => setMobileReasoningMenuOpen((current) => !current), "lg:hidden")}
                      </Popover>
                      <div class="lg:hidden">
                        <Popover
                          open={composerSettingsOpen()}
                          onClose={() => setComposerSettingsOpen(false)}
                          align="start"
                          side="top"
                          contentClass="w-[min(18rem,calc(100vw-1.5rem))] p-2"
                          content={
                            <div class="flex flex-col gap-2">
                              {renderModeControl("md", "w-full")}
                              {renderAgentControl("md", "w-full")}
                              {renderProviderControl("md", "w-full")}
                              {renderModelControl("md", "w-full")}
                            </div>
                          }
                        >
                          <ActionButton
                            tooltip="Open composer settings"
                            icon={<Settings class="h-4 w-4" />}
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-7 w-7 rounded-lg"
                            onClick={() => setComposerSettingsOpen((current) => !current)}
                          />
                        </Popover>
                      </div>
                    </div>
                  </>
                }
              />
              <div
                ref={(element) => {
                  composerLookupMenu = element;
                  queueMicrotask(() => {
                    if (composerLookupOpen() && composerLookupMenu === element) {
                      syncComposerLookupDomVisibility({ focusMenu: true });
                    } else {
                      setComposerLookupMenuHidden(true);
                    }
                  });
                }}
                id="chat-composer-lookup"
                data-test-composer-lookup=""
                hidden={!composerLookupOpen()}
                role={composerLookupOpen() ? "listbox" : undefined}
                aria-label={composerLookupOpen() ? "Composer lookup" : undefined}
                aria-hidden={composerLookupOpen() ? "false" : "true"}
                tabIndex={-1}
                class="absolute bottom-[7.75rem] left-8 right-8 z-20 max-h-64 overflow-auto rounded-xl border border-(--border) bg-(--panel) p-1 shadow-xl"
                onKeyDown={(event) => runWithChatPanelOwner(() => handleComposerLookupKeyDown(event))}
              >
                <For each={composerLookupRenderedOptions()}>
                  {(option) => (
                    <button
                      id={getComposerLookupOptionId(option.index)}
                      data-composer-lookup-option=""
                      data-composer-lookup-index={option.index}
                      type="button"
                      role={composerLookupOpen() ? "option" : undefined}
                      aria-selected={option.selected}
                      class={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[0.65625rem]",
                        option.selected ? "bg-white/70 ring-1 ring-(--ring)" : ""
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setComposerLookupActiveIndex(option.index);
                        applyComposerLookupOption(option.index);
                      }}
                      onMouseEnter={() => {
                        setComposerLookupActiveIndex(option.index);
                      }}
                    >
                      <Show when={composerLookup()?.kind === "skill"} fallback={getFileTypeIcon(option.insertText.slice(1).trim(), "h-3.5 w-3.5")}>
                        <WandSparkles class="h-3.5 w-3.5 text-(--muted)" />
                      </Show>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-semibold text-(--foreground)">{option.label}</span>
                        <span class="block truncate text-[0.5625rem] text-(--muted)">{option.detail}</span>
                      </span>
                    </button>
                  )}
                </For>
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
              <Show when={composerReferenceBadges().length > 0}>
                <div class="flex flex-wrap gap-2">
                  <For each={composerReferenceBadges()}>
                    {(badge) => (
                      <Button
                        data-test-composer-reference-badge=""
                        tooltip={`Ctrl/Meta-click to open ${badge.label} in the IDE`}
                        aria-label={`Open ${badge.label} in IDE`}
                        variant="secondary"
                        size="sm"
                        class="h-7 max-w-full rounded-full px-2.5 py-1 text-[0.5625rem] font-semibold"
                        onClick={(event) => handleComposerBadgeClick(event, badge)}
                      >
                        <Show when={badge.kind === "skill"} fallback={getFileTypeIcon(badge.target.path, "h-3 w-3")}>
                          <WandSparkles class="h-3 w-3 text-(--muted)" />
                        </Show>
                        <span class="min-w-0 truncate">{badge.label}</span>
                      </Button>
                    )}
                  </For>
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
                          <Show when={getCacheHitPercent(usage())}>
                            {(cacheHitPercent) => (
                              <span class="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                ⚡ Cache Hit {cacheHitPercent()}%
                              </span>
                            )}
                          </Show>
                        </span>
                      </Tooltip>
                    )}
                  </Show>
                </div>
                <div class="flex flex-wrap gap-2">
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
                  {(inspection) => {
                    const files = () => inspection().files ?? [];
                    const selectedFile = () => files().find((file) => file.path === selectedExperimentFilePath()) ?? files()[0];
                    return (
                      <Show when={files().length > 0} fallback={<MarkdownContent content={() => `\`\`\`diff\n${inspection().diffText}\n\`\`\``} size="compact" />}>
                        <div class="grid min-h-0 gap-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
                          <div class="min-h-0 rounded-2xl border border-(--border) bg-white/65 p-2">
                            <div class="px-2 pb-2 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                              {files().length} changed paths
                            </div>
                            <div class="grid max-h-72 gap-1 overflow-auto">
                              <For each={files()}>
                                {(file) => (
                                  <button
                                    type="button"
                                    class="min-w-0 rounded-xl px-2 py-2 text-left transition"
                                    classList={{
                                      "bg-(--accent) text-(--accent-foreground)": selectedFile()?.path === file.path,
                                      "bg-white/70 text-(--foreground) hover:bg-(--panel-strong)": selectedFile()?.path !== file.path
                                    }}
                                    onClick={() => setSelectedExperimentFilePath(file.path)}
                                  >
                                    <div class="truncate text-[0.7rem] font-semibold">{file.path}</div>
                                    <div class="text-[0.6rem] opacity-75">+{file.additions} / -{file.deletions}</div>
                                  </button>
                                )}
                              </For>
                            </div>
                          </div>
                          <div class="min-w-0 rounded-2xl border border-(--border) bg-white/65 p-3">
                            <Show when={inspection().staleReason}>
                              {(reason) => <div class="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[0.675rem] text-amber-900">{reason()}</div>}
                            </Show>
                            <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-[0.675rem] text-(--muted)">
                              <span class="font-semibold text-(--foreground)">{selectedFile()?.path}</span>
                              <span>+{selectedFile()?.additions ?? 0} / -{selectedFile()?.deletions ?? 0}</span>
                            </div>
                            <MarkdownContent content={() => `\`\`\`diff\n${selectedFile()?.hunksPreview || inspection().diffText}\n\`\`\``} size="compact" />
                          </div>
                        </div>
                      </Show>
                    );
                  }}
                </Show>
              </div>
            </Dialog>
          </>
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

function RunLedgerCompact(props: { run?: AgentRunState }) {
  const ledger = () => props.run?.ledger;
  return (
    <Show when={ledger()}>
      {(entry) => (
        <div class="mt-2 rounded-xl border border-(--border) bg-white/60 p-3">
          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">Run ledger</div>
          <div class="mt-1 grid gap-1">
            <Show when={entry().currentPhase}>{(value) => <div>Phase: {value()}</div>}</Show>
            <Show when={entry().nextStep}>{(value) => <div>Next: {value()}</div>}</Show>
            <Show when={entry().waitingOn}>{(value) => <div>Waiting: {value()}</div>}</Show>
            <Show when={entry().failureClass}>{(value) => <div>Failure: {value()}</div>}</Show>
            <Show when={entry().lastVerifiedAt}>{(value) => <div>Verified: {formatShortTimestamp(value())}</div>}</Show>
          </div>
        </div>
      )}
    </Show>
  );
}

function RunProofBundleCompact(props: { run?: AgentRunState }) {
  const bundle = () => props.run?.proofBundle;
  const evidenceCount = () => (bundle()?.commands?.length ?? 0) + (bundle()?.browserEvidenceRefs?.length ?? 0) + (bundle()?.approvals?.length ?? 0);
  return (
    <Show when={bundle()}>
      {(proof) => (
        <div class="mt-2 rounded-xl border border-(--border) bg-white/60 p-3">
          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">Proof bundle</div>
          <div class="mt-1 grid gap-1">
            <Show when={proof().diffSummary}>{(value) => <div>Diff: {value()}</div>}</Show>
            <div>Evidence refs: {evidenceCount()}</div>
            <Show when={proof().finalReviewNotes}>{(value) => <div>Review: {value()}</div>}</Show>
          </div>
        </div>
      )}
    </Show>
  );
}

function estimateTranscriptRowSize(row: ChatTimelineRow) {
  switch (row.kind) {
    case "tool-block":
      return 180;
    case "live":
      return row.message.kind === "status" ? 120 : 180;
    case "persisted":
      switch (row.message.metadata?.type ?? row.message.kind ?? "plain") {
        case "plan-summary":
          return 260;
        case "run-milestones":
          return 140;
        default:
          return row.message.attachments && row.message.attachments.length > 0 ? 220 : 180;
      }
  }
}

function readPersistedDraftAttachments(key: string | undefined, threadId?: string): ChatAttachment[] {
  const effectiveKey = key ?? findAttachmentDraftKeyForThread(threadId);
  if (!effectiveKey) {
    return [];
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(effectiveKey) ?? "{}") as { attachments?: ChatAttachment[] };
    return Array.isArray(parsed.attachments)
      ? parsed.attachments.filter((attachment) => attachment && typeof attachment.id === "string" && typeof attachment.url === "string")
      : [];
  } catch {
    return [];
  }
}

function findAttachmentDraftKeyForThread(threadId?: string) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("ai-harness:chat-draft:v2:") && (!threadId || key.endsWith(`:${threadId}`))) {
      return key;
    }
  }
  return undefined;
}

function persistDraftAttachments(key: string, attachments: ChatAttachment[]) {
  try {
    const existing = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(
      key,
      JSON.stringify({
        ...existing,
        version: 2,
        attachments,
        cleanupNeeded: attachments.length === 0 ? existing.cleanupNeeded : undefined,
        updatedAt: new Date().toISOString()
      })
    );
  } catch {
    // Best-effort browser draft persistence.
  }
}

const CHAT_TRANSCRIPT_LIMIT = 120;
const CHAT_RUN_SUBTASK_LIMIT = 24;
const CHAT_EVENT_LIMIT = 80;
const CHAT_MEMORY_LIMIT = 80;

function getStreamingLiveMessages(project: ViewProjectState): TimelineLiveMessage[] {
  const messages: TimelineLiveMessage[] = [];

  if (project.streamingHeartbeatMessages.length > 0) {
    messages.push(
      ...project.streamingHeartbeatMessages.map((message) => ({
          id: message.id,
          content: message.content,
          locked: message.locked,
          kind: "status" as const,
          updatedAt: message.updatedAt
        }))
    );
  } else {
    messages.push(
      ...project.streamingTailSegments
        .filter((segment) => segment.kind === "status")
        .map((segment) => ({
          id: segment.id,
          content: segment.content,
          locked: true,
          kind: "status" as const,
          updatedAt: segment.updatedAt
        }))
    );
  }

  const assistantFallback = [...project.streamingTailSegments].reverse().find((segment) => segment.kind === "assistant")?.content ?? "";
  const assistantContent = removePersistedAssistantPrefix(project, project.streamingAssistantText.trim() || assistantFallback.trim());
  if (assistantContent) {
    messages.push({
      id: "streaming-assistant-fallback",
      content: assistantContent,
      locked: false,
      kind: "assistant",
      updatedAt: project.activeRun?.updatedAt ?? project.activeRun?.createdAt
    });
  }

  return messages;
}

function removePersistedAssistantPrefix(project: ViewProjectState, content: string) {
  let remaining = content.trim();
  if (!remaining) {
    return "";
  }

  let lastUserIndex = -1;
  for (let index = project.session.messages.length - 1; index >= 0; index -= 1) {
    if (project.session.messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  for (const message of project.session.messages.slice(lastUserIndex + 1)) {
    if (message.role !== "assistant" || message.kind === "run-milestones") {
      continue;
    }
    const messageContent = message.content.trim();
    if (remaining.startsWith(messageContent)) {
      remaining = remaining.slice(messageContent.length).trim();
    }
  }
  return remaining;
}

function shouldHidePersistedStreamingAssistantMessage(
  project: ViewProjectState,
  message: ViewProjectState["session"]["messages"][number]
) {
  if (!isProjectRunStreaming(project) || message.role !== "assistant" || message.kind === "run-milestones") {
    return false;
  }

  const lastMessage = project.session.messages.at(-1);
  if (message.id !== lastMessage?.id) {
    return false;
  }

  return getStreamingLiveMessages(project).some((entry) => entry.kind === "assistant");
}

function isProjectRunStreaming(project: ViewProjectState) {
  return Boolean(project.session.isStreaming && project.activeRun && isBlockingRunStatus(project.activeRun.status));
}

function isBlockingRunStatus(status: AgentRunState["status"]) {
  return status === "planning" || status === "running-main" || status === "running-subagents" || status === "aggregating";
}

function getComposerLookupOptionId(index: number) {
  return `chat-composer-lookup-option-${index}`;
}

function getComposerLookup(draft: string, caret: number) {
  const tokenStart = Math.max(draft.lastIndexOf(" ", caret - 1), draft.lastIndexOf("\n", caret - 1), draft.lastIndexOf("\t", caret - 1)) + 1;
  const token = draft.slice(tokenStart, caret);
  if (token.length < 1 || token.includes(" ")) {
    return undefined;
  }
  if (token.startsWith("/") && token.length >= 1) {
    return { kind: "skill" as const, query: token.slice(1), start: tokenStart, end: caret };
  }
  if (token.startsWith("@") && token.length >= 1) {
    return { kind: "file" as const, query: token.slice(1), start: tokenStart, end: caret };
  }
  return undefined;
}

function getSkillName(skillPath: string) {
  const parts = skillPath.replace(/\\/g, "/").split("/");
  const skillMdIndex = parts.lastIndexOf("SKILL.md");
  return skillMdIndex > 0 ? parts[skillMdIndex - 1]! : parts.at(-1) ?? skillPath;
}

function getFileName(filePath: string) {
  return filePath.replace(/\\/g, "/").split("/").at(-1) ?? filePath;
}

function getDirectoryName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : ".";
}

function getComposerReferenceBadges(
  draft: string,
  fileContext: ChatFileLinkContext,
  skillPaths: readonly string[]
): ComposerReferenceBadge[] {
  const badges = new Map<string, ComposerReferenceBadge & { index: number }>();

  for (const badge of getComposerSkillBadges(draft, fileContext, skillPaths)) {
    badges.set(badge.key, badge);
  }

  for (const badge of getComposerFileBadges(draft, fileContext)) {
    if (!badges.has(badge.key)) {
      badges.set(badge.key, badge);
    }
  }

  return [...badges.values()]
    .sort((left, right) => left.index - right.index)
    .map((badge) => ({
      key: badge.key,
      kind: badge.kind,
      label: badge.label,
      target: badge.target
    }));
}

function getComposerSkillBadges(
  draft: string,
  fileContext: ChatFileLinkContext,
  skillPaths: readonly string[]
): Array<ComposerReferenceBadge & { index: number }> {
  const skillPathByName = new Map<string, string>();
  for (const skillPath of skillPaths) {
    skillPathByName.set(getSkillName(skillPath).toLowerCase(), skillPath);
  }

  const badges: Array<ComposerReferenceBadge & { index: number }> = [];
  for (const match of draft.matchAll(/(?:^|\s)\/([A-Za-z0-9_.-]+)/g)) {
    const skillName = match[1];
    if (!skillName) {
      continue;
    }
    const skillPath = skillPathByName.get(skillName.toLowerCase());
    if (!skillPath) {
      continue;
    }
    const target = resolveChatFileTarget(skillPath, fileContext) ?? { path: skillPath.replace(/\\/g, "/") };
    badges.push({
      key: `skill:${target.path}`,
      kind: "skill",
      label: `/${skillName}`,
      target,
      index: (match.index ?? 0) + match[0].indexOf("/")
    });
  }
  return badges;
}

function getComposerFileBadges(
  draft: string,
  fileContext: ChatFileLinkContext
): Array<ComposerReferenceBadge & { index: number }> {
  return findChatFileReferences(draft, fileContext)
    .filter((reference) => reference.text.startsWith("@"))
    .map((reference) => ({
      key: `file:${reference.target.path}:${reference.target.line ?? ""}:${reference.target.column ?? ""}`,
      kind: "file" as const,
      label: `@${formatChatFileTarget(reference.target)}`,
      target: reference.target,
      index: reference.index
    }));
}

function formatChatFileTarget(target: ChatFileTarget) {
  const line = target.line ? `:${target.line}` : "";
  const column = target.column ? `:${target.column}` : "";
  return `${target.path}${line}${column}`;
}

function getFileTypeIcon(filePath: string, className: string) {
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  if (!extension || extension === filePath.toLowerCase()) {
    return <File class={`${className} text-(--muted)`} />;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico"].includes(extension)) {
    return <Image class={`${className} text-(--muted)`} />;
  }
  if (["json", "jsonc"].includes(extension)) {
    return <FileJson class={`${className} text-(--muted)`} />;
  }
  if (["md", "markdown", "txt", "log", "csv"].includes(extension)) {
    return <FileText class={`${className} text-(--muted)`} />;
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "css",
      "html",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "kt",
      "swift",
      "sql",
      "sh",
      "bash",
      "zsh"
    ].includes(extension)
  ) {
    return <FileCode class={`${className} text-(--muted)`} />;
  }
  return <File class={`${className} text-(--muted)`} />;
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

function formatElapsedDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${seconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${seconds}s`;
}

function formatResponseTime(timestampMs: number) {
  return formatShortTimestamp(timestampMs);
}

