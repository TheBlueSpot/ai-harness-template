import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Bot,
  Calendar,
  Check,
  CircleAlert,
  CirclePause,
  CircleHelp,
  CirclePlay,
  ClipboardList,
  CopyPlus,
  Cpu,
  FlaskConical,
  Folder,
  Gauge,
  Globe,
  ListFilter,
  ListChecks,
  Logs,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  Split,
  SquarePen,
  Trash2
} from "lucide-solid";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import {
  createAssistantTodoId,
  type BackgroundJob,
  type BackgroundJobRun,
  createRequestId,
  type Assistant,
  type AssistantLearning,
  type AssistantQuestion,
  type AssistantTodo,
  type ComposerReasoningStrength
} from "../../../shared/protocol";
import { resolveModeCatalog } from "../../../shared/modes";
import { getAssistantQuestionDefaultChoices } from "../assistant-question-defaults";
import { formatShortTimestamp, resolveBrowserTimezone } from "../lib/time-format";
import { toProperCase } from "../lib/utils";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { findChatFileReferenceAtPosition, type ChatFileLinkContext, type ChatFileTarget } from "../lib/chat-file-links";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { openIdeWindow } from "../lib/ide-window";
import { openBackgroundJobInJobsPane, openBackgroundRunInJobsPane } from "../background-run-navigation";
import { openAssistantLogEntrySource } from "../source-navigation";
import { submitOnEnter } from "../textarea-submit";
import {
  type AssistantEditorDraft,
  type AssistantDetailTab,
  type BackgroundJobEditorDraft,
  COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH,
  type AssistantRosterSort,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getSelectedAssistant,
  getVisibleAssistants,
  harnessStore
} from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { MarkdownContent } from "./markdown-content";
import { Button } from "./primitives/button";
import { ChatComposer } from "./primitives/chat-composer";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";
import { ExecutionLog, type ExecutionLogEntry } from "./primitives/execution-log";
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
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { StatusChip, type StatusChipTone } from "./primitives/status-chip";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { VirtualList } from "./primitives/virtual-list";
import { rightAlignedNumbersEnabled } from "../lib/visual-flags";

const assistantTodoStateOptions = [
  { value: "pending", label: "pending", description: "Queued but not started yet." },
  { value: "in-progress", label: "in-progress", description: "Actively being worked right now." },
  { value: "blocked", label: "blocked", description: "Paused by dependency, approval, or external blocker." },
  { value: "completed", label: "completed", description: "Finished successfully." },
  { value: "failed", label: "failed", description: "Attempt finished with failure." },
  { value: "cancelled", label: "cancelled", description: "Work was intentionally stopped." }
] satisfies Array<{ value: AssistantTodo["state"]; label: string; description: string }>;

const assistantTodoWorkKindOptions = [
  { value: "app-code", label: "app-code", description: "Product, UI, backend, API, database, or test implementation." },
  { value: "automation-code", label: "automation-code", description: "Scripts, skills, checks, generators, or workflow automation." },
  { value: "documentation", label: "documentation", description: "Docs-only update." },
  { value: "research", label: "research", description: "Investigation before implementation." },
  { value: "blocked", label: "blocked", description: "Known work that cannot start yet." },
  { value: "unspecified", label: "unspecified", description: "No work category set." }
] satisfies Array<{ value: AssistantTodo["workKind"]; label: string; description: string }>;

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

function compareAssistantLearnings(left: AssistantLearning, right: AssistantLearning) {
  if (left.sortOrder !== undefined || right.sortOrder !== undefined) {
    if (left.sortOrder === undefined) {
      return 1;
    }
    if (right.sortOrder === undefined) {
      return -1;
    }
    return left.sortOrder - right.sortOrder;
  }
  const leftSummary = (left.kind ?? "fact") === "summary" ? 1 : 0;
  const rightSummary = (right.kind ?? "fact") === "summary" ? 1 : 0;
  return rightSummary - leftSummary || right.createdAt.localeCompare(left.createdAt);
}

function formatFailureCategory(value: string) {
  return value.replace(/-/g, " ");
}

function formatFailureTracking(job: BackgroundJob) {
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

function formatPromptStats(promptStats: BackgroundJobRun["promptStats"] | undefined) {
  if (!promptStats) {
    return undefined;
  }
  return `${promptStats.promptChars} chars, hash ${promptStats.promptHash}`;
}

function splitAssistantStreamingText(input: string) {
  const text = input.trim();
  if (!text) {
    return [];
  }
  const chunks: string[] = [];
  let buffer = "";
  for (const part of text.split(/(?<=[.!?])\s+|\n\n+/)) {
    const next = buffer ? `${buffer} ${part}` : part;
    if (next.length < 700) {
      buffer = next;
      continue;
    }
    if (buffer) {
      chunks.push(buffer);
    }
    buffer = part;
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks.length ? chunks : [text];
}

function getReasoningStrengthDescription(strength: ComposerReasoningStrength) {
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

function formatReasoningStrengthLabel(strength: ComposerReasoningStrength) {
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

function formatReasoningOptionLabel(strength: ComposerReasoningStrength) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === DEFAULT_COMPOSER_REASONING_STRENGTH ? `${label} (default)` : label;
}

type AssistantsPanelProps = {
  initialCircuitBreakerAssistantId?: string;
  variant?: "full" | "roster" | "detail";
};

export function AssistantsPanel(props: AssistantsPanelProps = {}) {
  let assistantChatTextarea: HTMLTextAreaElement | undefined;
  let assistantMessageViewport: HTMLDivElement | undefined;
  let lastRequestedDetailAssistantId: string | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeTab = createMemo(() => state.assistants.selectedTab);
  const [chatDraft, setChatDraft] = createSignal("");
  const [assistantChatModeId, setAssistantChatModeId] = createSignal("");
  const [assistantChatExecutionModelId, setAssistantChatExecutionModelId] = createSignal("");
  const [assistantChatReasoningStrength, setAssistantChatReasoningStrength] = createSignal<ComposerReasoningStrength>(
    DEFAULT_COMPOSER_REASONING_STRENGTH
  );
  const [assistantChatFastMode, setAssistantChatFastMode] = createSignal(false);
  const [assistantStickToBottom, setAssistantStickToBottom] = createSignal(true);
  const [assistantStreamingStartedAtByAssistantId, setAssistantStreamingStartedAtByAssistantId] = createSignal<Record<string, string>>({});
  const [newTodoTitle, setNewTodoTitle] = createSignal("");
  const [selectedCircuitBreakerAssistantId, setSelectedCircuitBreakerAssistantId] = createSignal<string | undefined>(
    props.initialCircuitBreakerAssistantId
  );
  const [questionAnswers, setQuestionAnswers] = createSignal<Record<string, string>>({});
  const visibleAssistants = createMemo(() =>
    getVisibleAssistants(state)
      .filter((assistant) => matchesAssistantFilters(assistant, state))
      .filter((assistant) => fuzzyMatches(assistantSearchHaystack(assistant, state), state.assistants.rosterSearch))
      .sort((left, right) => compareAssistants(left, right, state.assistants.rosterSort))
  );
  const selectedAssistant = createMemo(() => getSelectedAssistant(state));
  createEffect(() => {
    const assistantId = selectedAssistant()?.id;
    if (!assistantId || lastRequestedDetailAssistantId === assistantId) {
      return;
    }
    const hasDetail =
      state.assistants.threads.some((thread) => thread.assistantId === assistantId) ||
      state.assistants.todos.some((todo) => todo.assistantId === assistantId) ||
      state.assistants.questions.some((question) => question.assistantId === assistantId) ||
      state.assistants.learnings.some((learning) => learning.assistantId === assistantId) ||
      state.assistants.logs.some((entry) => entry.assistantId === assistantId) ||
      state.assistants.assetRefs.some((assetRef) => assetRef.assistantId === assistantId);
    if (hasDetail) {
      return;
    }
    lastRequestedDetailAssistantId = assistantId;
    sendCommand({
      type: "assistant.detail.get",
      requestId: createRequestId(),
      payload: { assistantId }
    });
  });
  const assistantFileProject = createMemo(() =>
    state.workspace.projects.find((project) => project.id === selectedAssistant()?.projectId) ??
    state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId) ??
    state.workspace.projects[0]
  );
  const assistantChatFileLinkContext = (): ChatFileLinkContext => ({
    rootPath: assistantFileProject()?.rootPath,
    filePaths: assistantFileProject()?.filePaths ?? []
  });
  const assistantChatFileLinks = () => ({
    ...assistantChatFileLinkContext(),
    onOpenFile: handleOpenAssistantChatFile
  });
  createEffect(() => {
    const assistant = selectedAssistant();
    if (!assistant) {
      return;
    }
    setAssistantChatModeId(assistant.modeId ?? "");
    setAssistantChatExecutionModelId(assistant.executionModelId ?? "");
    setAssistantChatReasoningStrength(assistant.reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH);
    setAssistantChatFastMode(Boolean(assistant.fastMode));
  });
  const assistantChatModeOptions = createMemo(() => {
    const assistant = selectedAssistant();
    const project = state.workspace.projects.find((entry) => entry.id === assistant?.projectId);
    return [
      { value: "", label: "Default", description: "Use assistant or project default mode.", icon: <Split class="h-3 w-3" /> },
      ...resolveModeCatalog(state.workspace.workspaceModes, project?.projectModes ?? []).map((mode) => ({
        value: mode.id,
        label: mode.label,
        description: mode.description,
        icon: <Split class="h-3 w-3" />
      }))
    ];
  });
  const assistantChatModelOptions = createMemo(() => {
    const assistant = selectedAssistant();
    const currentModel = assistantChatExecutionModelId().trim();
    const knownOptions = assistant
      ? getExecutionModelOptionsForAgent(state, assistant.agentId, assistant.providerBrand ?? state.providerBrand).map((model) => ({
          value: model.modelId,
          label: model.label,
          description: model.modelId,
          icon: <Cpu class="h-3 w-3" />
        }))
      : [];
    return [
      { value: "", label: "Default", description: "Use assistant or runtime default model.", icon: <Cpu class="h-3 w-3" /> },
      ...(currentModel && !knownOptions.some((option) => option.value === currentModel)
        ? [{ value: currentModel, label: currentModel, description: "Saved custom model.", icon: <Cpu class="h-3 w-3" /> }]
        : []),
      ...knownOptions
    ];
  });
  const assistantChatControlState = createMemo(() => {
    const assistant = selectedAssistant();
    return getComposerControlState(
      state,
      assistant?.agentId ?? state.selectedAgentId,
      assistantChatExecutionModelId().trim() || assistant?.executionModelId
    );
  });
  const assistantChatReasoningOptions = createMemo(() =>
    COMPOSER_REASONING_STRENGTHS.map((strength) => ({
      value: strength,
      label: formatReasoningOptionLabel(strength),
      description: getReasoningStrengthDescription(strength),
      disabled: !assistantChatControlState().availableStrengths.includes(strength),
      icon: <Brain class="h-3 w-3" />
    }))
  );
  const assistantChatFastModeOptions = createMemo(() => [
    { value: "false", label: "Off", description: "Use standard response path.", icon: <Gauge class="h-3 w-3" /> },
    {
      value: "true",
      label: "On",
      description: "Prefer lower-latency responses when supported.",
      disabled: !assistantChatControlState().supportsFastMode,
      icon: <Gauge class="h-3 w-3" />
    }
  ]);
  const selectedThread = createMemo(() =>
    state.assistants.threads.find((thread) => thread.assistantId === selectedAssistant()?.id)
  );
  const visibleAssistantMessages = createMemo(() =>
    (selectedThread()?.messages ?? []).filter((message) => fuzzyMatches([message.role, message.content].join(" "), state.assistants.detailSearch))
  );
  const selectedTodos = createMemo(() =>
    [...state.assistants.todos]
      .filter((todo) => todo.assistantId === selectedAssistant()?.id)
      .sort((left, right) => left.sortOrder - right.sortOrder || right.updatedAt.localeCompare(left.updatedAt))
  );
  const visibleTodos = createMemo(() => selectedTodos().filter((todo) => fuzzyMatches([todo.title, todo.description, todo.state, todo.blockerReason, todo.workKind, todo.workTarget].filter(Boolean).join(" "), state.assistants.detailSearch)));
  const selectedQuestions = createMemo(() =>
    [...state.assistants.questions]
      .filter((question) => question.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.askedAt.localeCompare(left.askedAt))
  );
  const visibleQuestions = createMemo(() => selectedQuestions().filter((question) => fuzzyMatches([question.prompt, question.answerText, question.status].filter(Boolean).join(" "), state.assistants.detailSearch)));
  const selectedLearnings = createMemo(() =>
    [...state.assistants.learnings]
      .filter((learning) => learning.assistantId === selectedAssistant()?.id)
      .sort(compareAssistantLearnings)
  );
  const filteredLearnings = createMemo(() => selectedLearnings().filter((learning) => fuzzyMatches([learning.summary, learning.source, learning.confidence, learning.kind].filter(Boolean).join(" "), state.assistants.detailSearch)));
  const selectedLogs = createMemo(() =>
    [...state.assistants.logs]
      .filter((entry) => entry.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  );
  const visibleLogs = createMemo(() => selectedLogs().filter((entry) => fuzzyMatches([entry.summary, entry.detail, entry.level, entry.detailsJson].filter(Boolean).join(" "), state.assistants.detailSearch)));
  const selectedExecutionLogs = createMemo(() =>
    visibleLogs().slice(0, 500).map((entry) => ({
      id: entry.id,
      message: entry.summary,
      rowSummary: [entry.summary, entry.detail].filter(Boolean).join(" "),
      level: entry.level,
      createdAt: entry.createdAt,
      detail: entry.detail,
      detailsJson: entry.detailsJson,
      detailsJsonSummary: entry.detailsJsonSummary
    }))
  );
  const selectedAssetRefs = createMemo(() =>
    state.assistants.assetRefs.filter((assetRef) => assetRef.assistantId === selectedAssistant()?.id)
  );
  const selectedJobs = createMemo(() =>
    [...state.backgroundJobs.jobs]
      .filter((job) => job.assistantId === selectedAssistant()?.id)
      .sort((left, right) => (right.nextRunAt ?? right.updatedAt).localeCompare(left.nextRunAt ?? left.updatedAt))
  );
  const visibleJobs = createMemo(() => selectedJobs().filter((job) => fuzzyMatches([job.name, job.description, job.status, job.kind, job.scheduleInput].filter(Boolean).join(" "), state.assistants.detailSearch)));
  const selectedRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => run.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );
  const visibleRuns = createMemo(() => selectedRuns().filter((run) => fuzzyMatches([run.summary, run.status, run.failureMessage, run.failureCategory, run.triggerSource].filter(Boolean).join(" "), state.assistants.detailSearch)));
  const circuitBreakerAssistant = createMemo(() =>
    state.assistants.assistants.find((assistant) => assistant.id === selectedCircuitBreakerAssistantId())
  );
  const circuitBreakerFileProject = createMemo(() =>
    state.workspace.projects.find((project) => project.id === circuitBreakerAssistant()?.projectId) ?? assistantFileProject()
  );
  const circuitBreakerFileLinks = () => getAssistantProjectFileLinks(circuitBreakerFileProject());
  const circuitBreakerLogs = createMemo(() =>
    [...state.assistants.logs]
      .filter((entry) => entry.assistantId === selectedCircuitBreakerAssistantId())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5)
  );
  const circuitBreakerRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => run.assistantId === selectedCircuitBreakerAssistantId())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
  );
  const circuitBreakerQuestions = createMemo(() =>
    [...state.assistants.questions]
      .filter((question) => question.assistantId === selectedCircuitBreakerAssistantId() && question.status === "pending")
      .sort((left, right) => right.askedAt.localeCompare(left.askedAt))
      .slice(0, 5)
  );
  const streamingText = createMemo(() => state.assistants.streamingByAssistantId[selectedAssistant()?.id ?? ""] ?? "");
  const assistantChatRows = createMemo(() => [
    ...visibleAssistantMessages().map((message) => ({ kind: "message" as const, message })),
    ...splitAssistantStreamingText(streamingText()).map((content, index) => ({
      kind: "streaming" as const,
      content,
      createdAt: assistantStreamingStartedAtByAssistantId()[selectedAssistant()?.id ?? ""],
      index
    }))
  ]);
  const executionPaused = createMemo(() => state.executionControl.isPaused);
  const executionPauseReason = "Global execution pause is active";
  const variant = () => props.variant ?? "full";

  createEffect(() => {
    const assistantId = selectedAssistant()?.id;
    if (!assistantId) {
      return;
    }
    const streaming = streamingText().trim().length > 0;
    if (streaming) {
      setAssistantStreamingStartedAtByAssistantId((current) =>
        current[assistantId] ? current : { ...current, [assistantId]: new Date().toISOString() }
      );
      return;
    }
    setAssistantStreamingStartedAtByAssistantId((current) => {
      if (!current[assistantId]) {
        return current;
      }
      const next = { ...current };
      delete next[assistantId];
      return next;
    });
  });

  const scrollAssistantChatToBottom = (force: boolean = false) => {
    if (!assistantMessageViewport || (!force && !assistantStickToBottom())) {
      return;
    }

    queueMicrotask(() => {
      if (!assistantMessageViewport) {
        return;
      }

      assistantMessageViewport.scrollTop = assistantMessageViewport.scrollHeight;
    });
  };

  const updateAssistantScrollLock = () => {
    if (!assistantMessageViewport) {
      setAssistantStickToBottom(true);
      return;
    }

    const distanceFromBottom =
      assistantMessageViewport.scrollHeight - assistantMessageViewport.scrollTop - assistantMessageViewport.clientHeight;
    setAssistantStickToBottom(distanceFromBottom <= 32);
  };

  createEffect(() => {
    selectedAssistant()?.id;
    activeTab();
    scrollAssistantChatToBottom(true);
  });

  createEffect(() => {
    selectedThread()?.messages.length;
    streamingText();
    scrollAssistantChatToBottom();
  });
  const showRoster = () => variant() !== "detail";
  const showDetail = () => variant() !== "roster";
  const createScope = () => (state.assistants.scopeFilter === "global" ? "global" : "project");
  const createLabel = () => (state.assistants.scopeFilter === "global" ? "Create global assistant" : "Create project assistant");

  createEffect(() => {
    if (!showRoster()) {
      return;
    }
    const unregister = registerCurrentTabItemSelector("assistants", (index) => {
      const assistant = visibleAssistants()[index];
      if (!assistant) {
        return false;
      }
      harnessStore.setSelectedAssistantId(assistant.id);
      return true;
    });
    onCleanup(unregister);
  });

  createEffect(() => {
    const assistant = selectedAssistant();
    if (!assistant) {
      harnessStore.setSelectedAssistantId(undefined);
      return;
    }
    if (state.assistants.selectedAssistantId !== assistant.id) {
      harnessStore.setSelectedAssistantId(assistant.id);
    }
  });

  function openCreateAssistant(scope: Assistant["scope"]) {
    const draft: AssistantEditorDraft = {
      source: "create",
      name: "",
      scope,
      projectId: scope === "project" ? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id : undefined,
      description: "",
      personalityPrompt: "",
      jobPrompt: "",
      agentId: state.selectedAgentId,
      providerBrand: state.providerBrand,
      modeId: "",
      executionModelId: state.selectedExecutionModelId,
      reasoningStrength: state.selectedReasoningStrength,
      fastMode: state.selectedFastMode,
      runState: "active",
      bootstrapState: "pending",
      assetRefsText: ""
    };
    harnessStore.openAssistantEditor(draft);
  }

  function openEditAssistant(assistant: Assistant) {
    const assetRefsText = state.assistants.assetRefs
      .filter((assetRef) => assetRef.assistantId === assistant.id)
      .map((assetRef) => `${assetRef.kind} | ${assetRef.label} | ${assetRef.value}`)
      .join("\n");
    harnessStore.openAssistantEditor({
      source: "edit",
      assistantId: assistant.id,
      name: assistant.name,
      scope: assistant.scope,
      projectId: assistant.projectId,
      description: assistant.description ?? "",
      personalityPrompt: assistant.personalityPrompt,
      jobPrompt: assistant.jobPrompt,
      agentId: assistant.agentId,
      providerBrand: assistant.providerBrand,
      modeId: assistant.modeId,
      executionModelId: assistant.executionModelId,
      reasoningStrength: assistant.reasoningStrength,
      fastMode: assistant.fastMode,
      runState: assistant.runState,
      bootstrapState: assistant.bootstrapState,
      assetRefsText
    });
  }

  function handleSendChat() {
    if (executionPaused()) {
      return;
    }
    const assistant = selectedAssistant();
    const trimmed = chatDraft().trim();
    if (!assistant || !trimmed) {
      return;
    }
    const sent = sendCommand({
      type: "assistant.chat.send",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
        content: trimmed,
        modeId: assistantChatModeId().trim() || undefined,
        executionModelId: assistantChatExecutionModelId().trim() || undefined,
        reasoningStrength: assistantChatReasoningStrength(),
        fastMode: assistantChatFastMode()
      }
    });
    if (sent) {
      setChatDraft("");
      if (assistantChatTextarea) {
        assistantChatTextarea.value = "";
      }
    }
  }

  function handleAddTodo() {
    const assistant = selectedAssistant();
    const trimmedTitle = newTodoTitle().trim();
    if (!assistant || !trimmedTitle) {
      return;
    }
    sendCommand({
      type: "assistant.todo.update",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
        todoId: createAssistantTodoId(),
        patch: {
          title: trimmedTitle,
          state: "pending",
          workKind: "app-code"
        }
      }
    });
    setNewTodoTitle("");
  }

  function updateTodo(todo: AssistantTodo, patch: Partial<AssistantTodo>) {
    sendCommand({
      type: "assistant.todo.update",
      requestId: createRequestId(),
      payload: {
        assistantId: todo.assistantId,
        todoId: todo.id,
        patch: {
          title: patch.title,
          description: patch.description,
          state: patch.state,
          blockerReason: patch.blockerReason,
          workKind: patch.workKind,
          workTarget: patch.workTarget
        }
      }
    });
  }

  function deleteTodo(todo: AssistantTodo) {
    const confirmed = window.confirm(`Delete todo "${todo.title}"?`);
    if (!confirmed) {
      return;
    }
    sendCommand({
      type: "assistant.todo.delete",
      requestId: createRequestId(),
      payload: {
        assistantId: todo.assistantId,
        todoId: todo.id
      }
    });
  }

  function reorderTodo(todo: AssistantTodo, direction: -1 | 1) {
    const orderedTodos = selectedTodos();
    const currentIndex = orderedTodos.findIndex((entry) => entry.id === todo.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedTodos.length) {
      return;
    }
    const nextTodos = [...orderedTodos];
    [nextTodos[currentIndex], nextTodos[nextIndex]] = [nextTodos[nextIndex]!, nextTodos[currentIndex]!];
    sendCommand({
      type: "assistant.todo.reorder",
      requestId: createRequestId(),
      payload: {
        assistantId: todo.assistantId,
        todoIds: nextTodos.map((entry) => entry.id)
      }
    });
  }

  function deleteLearning(learning: AssistantLearning) {
    const confirmed = window.confirm("Delete this assistant learning?");
    if (!confirmed) {
      return;
    }
    sendCommand({
      type: "assistant.learning.delete",
      requestId: createRequestId(),
      payload: {
        assistantId: learning.assistantId,
        learningId: learning.id
      }
    });
  }

  function reorderLearning(learning: AssistantLearning, direction: -1 | 1) {
    const orderedLearnings = selectedLearnings();
    const currentIndex = orderedLearnings.findIndex((entry) => entry.id === learning.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedLearnings.length) {
      return;
    }
    const nextLearnings = [...orderedLearnings];
    [nextLearnings[currentIndex], nextLearnings[nextIndex]] = [nextLearnings[nextIndex]!, nextLearnings[currentIndex]!];
    sendCommand({
      type: "assistant.learning.reorder",
      requestId: createRequestId(),
      payload: {
        assistantId: learning.assistantId,
        learningIds: nextLearnings.map((entry) => entry.id)
      }
    });
  }

  function answerQuestion(question: AssistantQuestion, answerText?: string) {
    if (executionPaused()) {
      return;
    }
    const answer = (answerText ?? questionAnswers()[question.id])?.trim();
    if (!answer) {
      pushToast("Answer required", "Write answer before sending.", "error");
      return;
    }
    sendCommand({
      type: "assistant.question.answer",
      requestId: createRequestId(),
      payload: {
        assistantId: question.assistantId,
        questionId: question.id,
        content: answer
      }
    });
    setQuestionAnswers((current) => ({ ...current, [question.id]: "" }));
  }

  function handleAssistantComposerClick(event: MouseEvent & { currentTarget: HTMLTextAreaElement }) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    const reference = findChatFileReferenceAtPosition(event.currentTarget.value, event.currentTarget.selectionStart, assistantChatFileLinkContext());
    if (!reference) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handleOpenAssistantChatFile(reference.target);
  }

  function handleOpenAssistantChatFile(target: ChatFileTarget) {
    handleOpenAssistantProjectFile(assistantFileProject(), target);
  }

  function handleOpenAssistantProjectFile(project: typeof state.workspace.projects[number] | undefined, target: ChatFileTarget) {
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  function getAssistantProjectFileLinks(project: typeof state.workspace.projects[number] | undefined): FileLinkConfig {
    return {
      rootPath: project?.rootPath,
      filePaths: project?.filePaths ?? [],
      onOpenFile: (target) => handleOpenAssistantProjectFile(project, target)
    };
  }

  function getAssistantFileLinks(assistant: Assistant | undefined): FileLinkConfig {
    const project = state.workspace.projects.find((entry) => entry.id === assistant?.projectId) ?? assistantFileProject();
    return getAssistantProjectFileLinks(project);
  }

  function handleAssistantRosterKeyDown(event: KeyboardEvent, assistantId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    harnessStore.setSelectedAssistantId(assistantId);
  }

  function openAssistantJobEditor() {
    const assistant = selectedAssistant();
    if (!assistant) {
      return;
    }
    const resolvedProjectId = assistant.projectId ?? state.workspace.activeProjectId;
    if (!resolvedProjectId) {
      pushToast("Project required", "Clone global assistant to project before scheduling project work.", "error");
      return;
    }

    const draft: BackgroundJobEditorDraft = {
      source: "create",
      projectId: resolvedProjectId,
      assistantId: assistant.id,
      kind: "ai-routine",
      name: `${assistant.name} routine`,
      description: "",
      scheduleInput: "",
      timezone: resolveBrowserTimezone(),
      aiPrompt: assistant.jobPrompt,
      aiModeId: assistant.modeId,
      aiExecutionModelId: assistant.executionModelId,
      aiReasoningStrength: assistant.reasoningStrength,
      aiFastMode: assistant.fastMode,
      aiPlanExecutionMode: state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy: state.subagentWorktreeStrategyDefault,
      shellExecutable: "",
      shellArgsText: "",
      shellCwd: "",
      shellEnvRefsText: "",
      shellTimeoutSeconds: 600,
      shellNetworkAccess: false
    };
    harnessStore.openBackgroundJobEditor(draft);
  }

  function bootstrapAssistantJobs() {
    const assistant = selectedAssistant();
    if (!assistant) {
      return;
    }
    const projectId = assistant.projectId ?? state.workspace.activeProjectId;
    if (!projectId) {
      pushToast("Project required", "Open a project before bootstrapping jobs for a global assistant.", "error");
      return;
    }
    sendCommand({
      type: "assistant.jobs.bootstrap",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
        projectId
      }
    });
  }

  function handleDeleteAssistant(assistant: Assistant) {
    const confirmed = window.confirm(
      `Delete assistant "${assistant.name}"?\n\nPending or active assistant jobs will be cancelled and purged.`
    );
    if (!confirmed) {
      return;
    }
    sendCommand({
      type: "assistant.delete",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id
      }
    });
  }

  function retryCircuitBreaker(assistant: Assistant) {
    if (executionPaused()) {
      return;
    }
    sendCommand({
      type: "assistant.circuit-breaker.retry",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id
      }
    });
    setSelectedCircuitBreakerAssistantId(undefined);
  }

  function openCircuitBreakerJobs() {
    setSelectedCircuitBreakerAssistantId(undefined);
    harnessStore.setActiveSurface("background-jobs");
  }

  function openAssistantBackgroundJob(jobId: string) {
    openBackgroundJobInJobsPane(state, jobId);
  }

  function openAssistantBackgroundRun(run: BackgroundJobRun) {
    openBackgroundRunInJobsPane(state, run.id, run.jobId);
  }

  function openAssistantLogSource(entry: ExecutionLogEntry) {
    const log = visibleLogs().find((candidate) => candidate.id === entry.id);
    if (log) {
      openAssistantLogEntrySource(state, log);
    }
  }

  function handleSourceCardKeyDown(event: KeyboardEvent, open: () => void) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    open();
  }

  return (
    <LeftPaneShell data-test-assistants-panel="" kind="assistants" padding="comfortable">
      <Show when={selectedCircuitBreakerAssistantId()}>
        <Dialog
          open
          title="Circuit breaker"
          eyebrow="Assistant recovery"
          description="Inspect latest failure context, then retry recovery when ready."
          onClose={() => setSelectedCircuitBreakerAssistantId(undefined)}
          footer={
            <Show when={circuitBreakerAssistant()}>
              {(assistant) => (
                <>
                  <ActionButton
                    tooltip="Keep assistant paused and close this dialog"
                    variant="secondary"
                    onClick={() => setSelectedCircuitBreakerAssistantId(undefined)}
                  >
                    Keep paused
                  </ActionButton>
                  <ActionButton tooltip="Open assistant-owned background jobs" variant="secondary" onClick={openCircuitBreakerJobs}>
                    Open jobs
                  </ActionButton>
                  <ActionButton
                    tooltip="Focus this assistant in the Assistants surface"
                    variant="secondary"
                    onClick={() => {
                      harnessStore.setSelectedAssistantId(assistant().id);
                      setSelectedCircuitBreakerAssistantId(undefined);
                    }}
                  >
                    Open assistant
                  </ActionButton>
                  <ActionButton
                    tooltip={executionPaused() ? executionPauseReason : "Clear circuit breaker, resume assistant, and retry recovery"}
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason}
                    icon={<RefreshCcw class="h-4 w-4" />}
                    ariaLabel="Retry"
                    onClick={() => retryCircuitBreaker(assistant())}
                  >
                    Retry
                  </ActionButton>
                </>
              )}
            </Show>
          }
        >
          <Show when={circuitBreakerAssistant()}>
            {(assistant) => (
              <div class="flex flex-col gap-4">
              <div class="grid gap-2 text-[0.675rem] text-(--muted) md:grid-cols-2">
                <div><span class="font-semibold text-(--foreground)">Assistant:</span> {assistant().name}</div>
                <div><span class="font-semibold text-(--foreground)">Scope:</span> {assistant().scope}</div>
                <div><span class="font-semibold text-(--foreground)">Run state:</span> {assistant().runState}</div>
                <div><span class="font-semibold text-(--foreground)">Bootstrap:</span> {assistant().bootstrapState}</div>
                <div><span class="font-semibold text-(--foreground)">Failure streak:</span> {assistant().failureStreakCount}</div>
                <div><span class="font-semibold text-(--foreground)">Breaker:</span> {assistant().circuitBreakerState}</div>
              </div>
              <section class="rounded-2xl border border-(--border) bg-white/70 p-3">
                <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Reason</div>
                <div class="text-[0.75rem] leading-5 text-(--foreground)">
                  <FileLinkedText text={assistant().circuitBreakerReason ?? "No failure reason recorded."} fileLinks={circuitBreakerFileLinks()} />
                </div>
              </section>
              <section class="rounded-2xl border border-(--border) bg-white/70 p-3">
                <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Latest logs</div>
                <Show when={circuitBreakerLogs().length > 0} fallback={<div class="text-[0.675rem] text-(--muted)">No recent logs.</div>}>
                  <div class="space-y-2">
                    <For each={circuitBreakerLogs()}>
                      {(entry) => (
                        <div class="rounded-xl border border-(--border) bg-white/70 p-2 text-[0.675rem] leading-5">
                          <div class="font-semibold text-(--foreground)">
                            <FileLinkedText text={`${entry.level} | ${entry.summary}`} fileLinks={circuitBreakerFileLinks()} />
                          </div>
                          <div class="text-(--muted)">
                            <FileLinkedText text={entry.detail ?? "No detail."} fileLinks={circuitBreakerFileLinks()} />
                          </div>
                          <div class="mt-1 text-[0.575rem] uppercase tracking-[0.12em] text-(--muted)">{formatShortTimestamp(entry.createdAt)}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </section>
              <section class="rounded-2xl border border-(--border) bg-white/70 p-3">
                <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Latest runs</div>
                <Show when={circuitBreakerRuns().length > 0} fallback={<div class="text-[0.675rem] text-(--muted)">No assistant-owned job runs.</div>}>
                  <div class="space-y-2">
                    <For each={circuitBreakerRuns()}>
                      {(run) => (
                        <div class="rounded-xl border border-(--border) bg-white/70 p-2 text-[0.675rem] leading-5">
                          <div class="font-semibold text-(--foreground)">{run.status}</div>
                          <div class="text-(--muted)">
                            <FileLinkedText text={run.failureMessage ?? run.summary ?? run.id} fileLinks={circuitBreakerFileLinks()} />
                          </div>
                          <Show when={run.failureCategory}>
                            {(category) => <div class="text-(--muted)">Category: {formatFailureCategory(category())}</div>}
                          </Show>
                          <div class="mt-1 text-[0.575rem] uppercase tracking-[0.12em] text-(--muted)">{formatShortTimestamp(run.updatedAt)}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </section>
              <section class="rounded-2xl border border-(--border) bg-white/70 p-3">
                <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Pending questions</div>
                <Show when={circuitBreakerQuestions().length > 0} fallback={<div class="text-[0.675rem] text-(--muted)">No pending questions.</div>}>
                  <div class="space-y-2">
                    <For each={circuitBreakerQuestions()}>
                      {(question) => (
                        <div class="rounded-xl border border-(--border) bg-white/70 p-2 text-[0.675rem] leading-5 text-(--foreground)">
                          <FileLinkedText text={question.prompt} fileLinks={circuitBreakerFileLinks()} />
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </section>
              </div>
            )}
          </Show>
        </Dialog>
      </Show>
      <Show when={showRoster()}>
        <LeftPaneHeader
          title="Assistants"
          help="Named operators with chat, todo list, questions inbox, learnings, jobs, and deep logs."
          actions={
            <ActionButton
              tooltip={tooltipWithPrimaryHotkey(
                createLabel(),
                normalizeAppHotkeyPreferences(state.appHotkeyPreferences).createAssistant[0]
              )}
              icon={<Plus class="h-4 w-4" />}
              size="icon"
              variant="ghost"
              ariaLabel={createLabel()}
              onClick={() => openCreateAssistant(createScope())}
            />
          }
        />
      </Show>

      <div
        class="grid min-h-0 min-w-0 max-w-full flex-1 gap-4"
        classList={{ "xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]": showRoster() && showDetail() }}
      >
        <Show when={showRoster()}>
        <div class="flex min-h-0 min-w-0 max-w-full flex-col gap-1">
          <LeftPaneFilterBlock>
            <LeftPaneSearchInput
              value={state.assistants.rosterSearch}
              aria-label="Search assistants"
              placeholder="Search assistants..."
              menu={
                <LeftPaneSearchMenu
                  ariaLabel="Filter and sort assistants"
                  tooltip="Filter and sort assistants"
                  activeFilterCount={activeAssistantRosterFilterCount(state)}
                  items={assistantRosterMenuItems(state)}
                />
              }
              onInput={(event) => harnessStore.setAssistantPaneFilters({ rosterSearch: (event.target as HTMLInputElement).value })}
            />
          </LeftPaneFilterBlock>
          <LeftPaneListSection title="Roster" count={`${visibleAssistants().length} total`} class="border-0 bg-transparent p-0">
          <VirtualList
            class="min-h-0 flex-1 pr-2"
            contentClass="w-full"
            itemClass="pb-3"
            items={visibleAssistants()}
            getKey={(assistant) => assistant.id}
            estimateSize={140}
            pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
            empty={
              <LeftPaneEmptyState>
                <div class="grid gap-3">
                  <div>No assistants match current search or filters.</div>
                  <div class="flex flex-wrap gap-2">
                    <ActionButton
                      tooltip={tooltipWithPrimaryHotkey("Create assistant", normalizeAppHotkeyPreferences(state.appHotkeyPreferences).createAssistant[0])}
                      ariaLabel="New assistant"
                      size="sm"
                      icon={<Plus class="h-3.5 w-3.5" />}
                      onClick={() => openCreateAssistant(createScope())}
                    >
                      New assistant
                    </ActionButton>
                    <ActionButton
                      tooltip={state.workspace.activeProjectId ? "Create from current thread" : "Open a project first"}
                      ariaLabel="Create from current thread"
                      size="sm"
                      variant="secondary"
                      disabled={!state.workspace.activeProjectId}
                      disabledReason={!state.workspace.activeProjectId ? "Open a project first" : undefined}
                      icon={<MessageSquare class="h-3.5 w-3.5" />}
                      onClick={() => openCreateAssistant("project")}
                    >
                      Create from current thread
                    </ActionButton>
                  </div>
                </div>
              </LeftPaneEmptyState>
            }
          >
            {(assistant) => (
              <div
                class="dense-action-parent dense-card w-full cursor-pointer border-l-4 p-3 text-left transition hover:border-(--accent-strong)"
                classList={{
                  "dense-card-selected": selectedAssistant()?.id === assistant.id,
                  [assistantRunStateBorderClass(assistant.runState)]: selectedAssistant()?.id !== assistant.id,
                }}
                role="button"
                tabIndex={0}
                onClick={() => harnessStore.setSelectedAssistantId(assistant.id)}
                onKeyDown={(event) => handleAssistantRosterKeyDown(event, assistant.id)}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="text-[0.775rem] font-semibold text-(--foreground)">{assistant.name}</div>
                    <div class="mt-1 flex flex-wrap gap-1">
                      <StatusChip tone={assistant.scope === "global" ? "info" : "accent"}>{assistant.scope}</StatusChip>
                      <StatusChip tone={assistantBootstrapTone(assistant.bootstrapState)}>{assistant.bootstrapState}</StatusChip>
                    </div>
                  </div>
                  <div class="flex shrink-0 flex-wrap justify-end gap-1">
                    <StatusChip tone={assistantRunStateTone(assistant.runState)}>
                      {assistant.runState}
                    </StatusChip>
                    <Show when={assistant.unreadQuestionCount > 0}>
                      <StatusChip tone="warning" classList={{ "dense-numeric-flagged": rightAlignedNumbersEnabled() }}>
                        {assistant.unreadQuestionCount} q
                      </StatusChip>
                    </Show>
                  </div>
                </div>
                <div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">
                  <div>
                    <FileLinkedText text={assistant.description ?? summarizePrompt(assistant.jobPrompt)} fileLinks={getAssistantFileLinks(assistant)} />
                  </div>
                  <div class="mt-1">{assistant.circuitBreakerState === "tripped" ? "Circuit breaker tripped" : `Updated ${formatShortTimestamp(assistant.updatedAt)}`}</div>
                </div>
              </div>
            )}
          </VirtualList>
          </LeftPaneListSection>
        </div>
        </Show>

        <Show when={showDetail()}>
        <section class="flex min-h-0 min-w-0 max-w-full flex-1 flex-col p-4">
          <Show
            when={selectedAssistant()}
            fallback={
              <DetailEmptyState>
                Select assistant to inspect config, chat, todos, and logs.
              </DetailEmptyState>
            }
          >
            {(assistant) => (
              <div class="flex h-full min-h-0 flex-col gap-4">
                <div class="border-b border-(--border) pb-4">
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Inspector</div>
                        <StatusChip tone={assistantRunStateTone(assistant().runState)}>
                          {assistant().runState}
                        </StatusChip>
                        <Show when={assistant().circuitBreakerState === "tripped"}>
                          <StatusChip tone="danger">circuit breaker</StatusChip>
                        </Show>
                      </div>
                      <h2 class="mt-1 break-words text-[1.2rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">{assistant().name}</h2>
                      <div class="mt-3 grid gap-x-5 gap-y-1 border-l-2 border-(--border) pl-4 text-[0.675rem] leading-5 text-(--muted) sm:grid-cols-2 xl:grid-cols-3">
                        <AssistantFact label="Scope">{assistant().scope}</AssistantFact>
                        <AssistantFact label="Bootstrap">{assistant().bootstrapState}</AssistantFact>
                        <AssistantFact label="Questions">
                          <span classList={{ "dense-numeric-flagged": rightAlignedNumbersEnabled() }}>{String(assistant().unreadQuestionCount)}</span>
                        </AssistantFact>
                      </div>
                      <Show when={assistant().description}>
                        {(description) => (
                          <div class="mt-3 max-w-3xl border-l-2 border-(--border) pl-4 text-[0.675rem] leading-5 text-(--muted)">
                            <FileLinkedText text={description()} fileLinks={assistantChatFileLinks()} />
                          </div>
                        )}
                      </Show>
                    </div>

                    <div class="flex w-full max-w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                      <Show when={assistant().circuitBreakerState === "tripped"}>
                        <ActionButton
                          tooltip="Inspect circuit breaker failure and retry"
                          ariaLabel="Inspect failure"
                          icon={<CircleAlert class="h-4 w-4" />}
                          variant="secondary"
                          class="border-amber-300 text-amber-900 hover:bg-amber-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCircuitBreakerAssistantId(assistant().id);
                          }}
                        >
                          Inspect failure
                        </ActionButton>
                      </Show>
                      <ActionButton tooltip="Edit assistant config" icon={<SquarePen class="h-4 w-4" />} variant="secondary" onClick={() => openEditAssistant(assistant())}>Edit</ActionButton>
                      <ActionButton
                        tooltip={assistant().runState === "paused" ? "Resume assistant background work" : "Pause assistant background work"}
                        icon={assistant().runState === "paused" ? <CirclePlay class="h-4 w-4" /> : <CirclePause class="h-4 w-4" />}
                        variant="secondary"
                        class={assistant().runState === "paused" ? "border-(--accent) text-(--accent-strong) hover:bg-(--panel)" : "border-amber-300 text-amber-900 hover:bg-amber-50"}
                        onClick={() =>
                          sendCommand({
                            type: assistant().runState === "paused" ? "assistant.resume" : "assistant.pause",
                            requestId: createRequestId(),
                            payload: { assistantId: assistant().id }
                          })
                        }
                      >
                        {assistant().runState === "paused" ? "Resume" : "Pause"}
                      </ActionButton>
                      <ActionButton
                        tooltip="Retry assistant bootstrap research"
                        disabled={executionPaused()}
                        disabledReason={executionPauseReason}
                        icon={<RefreshCcw class="h-4 w-4" />}
                        variant="secondary"
                        onClick={() => sendCommand({ type: "assistant.bootstrap.retry", requestId: createRequestId(), payload: { assistantId: assistant().id } })}
                      >
                        Retry bootstrap
                      </ActionButton>
                      <Show when={assistant().scope === "global"}>
                        <ActionButton
                          tooltip={state.workspace.activeProjectId ? "Clone global assistant into current project" : "Open a project before cloning"}
                          disabled={!state.workspace.activeProjectId}
                          disabledReason="Open project first"
                          icon={<CopyPlus class="h-4 w-4" />}
                          variant="secondary"
                          onClick={() =>
                            state.workspace.activeProjectId &&
                            sendCommand({
                              type: "assistant.clone-to-project",
                              requestId: createRequestId(),
                              payload: {
                                assistantId: assistant().id,
                                projectId: state.workspace.activeProjectId
                              }
                            })
                          }
                        >
                          Clone to project
                        </ActionButton>
                      </Show>
                      <ActionButton tooltip="Delete assistant" icon={<Trash2 class="h-4 w-4" />} variant="secondary" class="border-(--danger) text-(--danger) hover:bg-(--panel)" onClick={() => handleDeleteAssistant(assistant())}>Delete</ActionButton>
                    </div>
                  </div>
                </div>

                <div role="tablist" aria-label="Assistant detail sections" class="flex gap-1 overflow-x-auto border-b border-(--border)">
                  <TabButton icon={<MessageSquare class="h-4 w-4" />} label="Chat" active={activeTab() === "chat"} onClick={() => harnessStore.setAssistantDetailTab("chat")} />
                  <TabButton icon={<ListChecks class="h-4 w-4" />} label="Todos" active={activeTab() === "todos"} onClick={() => harnessStore.setAssistantDetailTab("todos")} />
                  <TabButton icon={<ClipboardList class="h-4 w-4" />} label="Questions" active={activeTab() === "questions"} onClick={() => harnessStore.setAssistantDetailTab("questions")} />
                  <TabButton icon={<Bot class="h-4 w-4" />} label="Jobs" active={activeTab() === "jobs"} onClick={() => harnessStore.setAssistantDetailTab("jobs")} />
                  <TabButton icon={<Logs class="h-4 w-4" />} label="Log" active={activeTab() === "log"} onClick={() => harnessStore.setAssistantDetailTab("log")} />
                  <TabButton icon={<SquarePen class="h-4 w-4" />} label="Config" active={activeTab() === "config"} onClick={() => harnessStore.setAssistantDetailTab("config")} />
                  <TabButton icon={<FlaskConical class="h-4 w-4" />} label="Learnings" active={activeTab() === "learnings"} onClick={() => harnessStore.setAssistantDetailTab("learnings")} />
                </div>
                <Show when={activeTab() !== "config"}>
                  <div class="flex flex-col gap-2">
                    <Input
                      value={state.assistants.detailSearch}
                      placeholder={`Search assistant ${activeTab()}`}
                      onInput={(event) => harnessStore.setAssistantPaneFilters({ detailSearch: (event.target as HTMLInputElement).value })}
                    />
                    <Show when={state.assistants.detailSearch}>
                      <ActionButton tooltip="Clear assistant detail search" size="sm" variant="ghost" onClick={() => harnessStore.setAssistantPaneFilters({ detailSearch: "" })}>Clear search</ActionButton>
                    </Show>
                  </div>
                </Show>

                <Show when={activeTab() === "chat"}>
                  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
                    <section class="flex min-h-0 flex-1 flex-col">
                      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant chat</div>
                      <div class="relative flex min-h-72 flex-1 flex-col">
                        <VirtualList
                          viewportRef={(element) => {
                            assistantMessageViewport = element;
                            scrollAssistantChatToBottom(true);
                          }}
                          class="min-h-0 flex-1 pr-2"
                          contentClass="w-full"
                          itemClass="pb-3"
                          data-test-assistant-chat-scroll=""
                          dataTest="assistant-chat-transcript"
                          items={assistantChatRows()}
                          getKey={(row, index) => row.kind === "message" ? row.message.id : `streaming-${row.index ?? index}`}
                          estimateSize={150}
                          pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
                          overscan={6}
                          stickToEnd
                          onScroll={updateAssistantScrollLock}
                        >
                          {(row) => row.kind === "message" ? (
                            <article
                              class="rounded-2xl border p-3"
                              classList={{
                                "border-(--border)": row.message.role === "user",
                                "bg-white/75": row.message.role === "user",
                                "border-(--accent)": row.message.role !== "user",
                                "bg-(--panel)": row.message.role !== "user"
                              }}
                            >
                              <div class="mb-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{row.message.role}</div>
                              <MarkdownContent content={row.message.content} fileLinks={assistantChatFileLinks()} />
                              {renderMessageActionRow(
                                row.message.createdAt,
                                <CopyTextButton value={row.message.content} tooltip="Copy message" copiedTitle="Message copied" copiedDescription="Message copied to clipboard." size="sm" variant="ghost" ariaLabel={`Copy ${row.message.role} message`}>
                                  Copy
                                </CopyTextButton>
                              )}
                            </article>
                          ) : (
                            <article class="rounded-2xl border border-(--accent) bg-(--panel) p-3">
                              <div class="mb-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">assistant</div>
                              <MarkdownContent content={row.content} fileLinks={assistantChatFileLinks()} />
                              {renderMessageActionRow(
                                row.createdAt,
                                <CopyTextButton value={row.content} tooltip="Copy streaming assistant message" copiedTitle="Message copied" copiedDescription="Message copied to clipboard." size="sm" variant="ghost" ariaLabel="Copy streaming assistant message">
                                  Copy
                                </CopyTextButton>
                              )}
                            </article>
                          )}
                        </VirtualList>
                        <Show when={!assistantStickToBottom()}>
                          <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                            <div class="pointer-events-auto">
                              <ActionButton tooltip="Scroll to latest message" icon={<ArrowDown class="h-4 w-4" />} variant="secondary" onClick={() => scrollAssistantChatToBottom(true)}>
                                Scroll to latest
                              </ActionButton>
                            </div>
                          </div>
                        </Show>
                      </div>
                      <ChatComposer
                        class="mt-4"
                        textareaRef={(element) => {
                          assistantChatTextarea = element;
                        }}
                        rows="3"
                        value={chatDraft()}
                        placeholder={`Ask ${assistant().name} something.`}
                        textareaClass="pb-20 lg:pb-12"
                        disabled={executionPaused()}
                        disabledReason={executionPauseReason}
                        onInput={setChatDraft}
                        onSubmit={handleSendChat}
                        onClick={handleAssistantComposerClick}
                        leftControls={
                          <div class="pointer-events-auto flex flex-wrap items-center gap-1">
                            <DropdownControl
                              kind="select"
                              ariaLabel="Select assistant chat mode"
                              icon={<Split class="h-3.5 w-3.5" />}
                              value={assistantChatModeId()}
                              options={assistantChatModeOptions()}
                              onChange={setAssistantChatModeId}
                            />
                            <DropdownControl
                              kind="select"
                              ariaLabel="Select assistant chat model"
                              icon={<Cpu class="h-3.5 w-3.5" />}
                              value={assistantChatExecutionModelId()}
                              options={assistantChatModelOptions()}
                              onChange={setAssistantChatExecutionModelId}
                            />
                            <DropdownControl
                              kind="select"
                              ariaLabel="Select assistant chat reasoning effort"
                              icon={<Brain class="h-3.5 w-3.5" />}
                              value={assistantChatReasoningStrength()}
                              options={assistantChatReasoningOptions()}
                              onChange={(value) => setAssistantChatReasoningStrength(value as ComposerReasoningStrength)}
                            />
                            <DropdownControl
                              kind="select"
                              ariaLabel="Select assistant chat fast mode"
                              icon={<Gauge class="h-3.5 w-3.5" />}
                              value={assistantChatFastMode() ? "true" : "false"}
                              options={assistantChatFastModeOptions()}
                              onChange={(value) => setAssistantChatFastMode(value === "true")}
                            />
                          </div>
                        }
                        rightActions={
                          <ActionButton tooltip="Send message to assistant" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<MessageSquare class="h-4 w-4" />} variant="ghost" size="icon" class="pointer-events-auto h-8 w-8 rounded-lg" ariaLabel="Send message to assistant" onClick={handleSendChat} />
                        }
                      />
                    </section>

                    <section class="shrink-0">
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Working memory</div>
                      <div class="mt-3 grid max-h-32 gap-4 overflow-auto border-l-2 border-(--border) py-2 pl-4 text-[0.675rem] leading-5 text-(--muted) lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]">
                        <div class="min-w-0">
                          <div class="font-semibold text-(--foreground)">Summary</div>
                          <div class="mt-1 whitespace-pre-wrap">
                            <FileLinkedText text={selectedThread()?.memorySummary?.content ?? "No rolled summary yet."} fileLinks={assistantChatFileLinks()} />
                          </div>
                        </div>
                        <div class="min-w-0">
                          <div class="font-semibold text-(--foreground)">Active todos</div>
                          <ul class="mt-1 space-y-1">
                            <For each={visibleTodos().filter((todo) => isActiveTodo(todo.state)).slice(0, 8)}>
                              {(todo) => <li><FileLinkedText text={`${todo.state} | ${todo.title}`} fileLinks={assistantChatFileLinks()} /></li>}
                            </For>
                          </ul>
                        </div>
                      </div>
                    </section>
                  </div>
                </Show>

                <Show when={activeTab() === "todos"}>
                  <section class="flex min-h-0 flex-1 flex-col">
                    <div class="mb-4 flex gap-2">
                      <Textarea rows="2" value={newTodoTitle()} onInput={(event) => setNewTodoTitle(event.currentTarget.value)} placeholder="Add manual todo." />
                      <ActionButton tooltip="Add todo to assistant list" icon={<Plus class="h-4 w-4" />} onClick={handleAddTodo}>Add</ActionButton>
                    </div>
                    <VirtualList class="min-h-0 flex-1 pr-2" contentClass="w-full" itemClass="pb-3" items={visibleTodos()} getKey={(todo) => todo.id} estimateSize={128} pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}>
                      {(todo) => (
                        <article class={`dense-action-parent border-l-2 py-3 pl-4 pr-2 ${todoStateBorderClass(todo.state)}`}>
                          <div class="flex flex-wrap items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="text-[0.75rem] font-semibold text-(--foreground)">
                                <FileLinkedText text={todo.title} fileLinks={assistantChatFileLinks()} />
                              </div>
                              <Show when={todo.description}>
                                {(description) => (
                                  <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">
                                    <FileLinkedText text={description()} fileLinks={assistantChatFileLinks()} />
                                  </div>
                                )}
                              </Show>
                              <Show when={todo.blockerReason}>
                                {(reason) => (
                                  <div class="mt-1 text-[0.625rem] text-amber-900">
                                    <FileLinkedText text={`Blocker: ${reason()}`} fileLinks={assistantChatFileLinks()} />
                                  </div>
                                )}
                              </Show>
                              <Show when={todo.workTarget}>
                                {(target) => (
                                  <div class="mt-1 text-[0.625rem] text-(--muted)">
                                    <FileLinkedText text={`Target: ${target()}`} fileLinks={assistantChatFileLinks()} />
                                  </div>
                                )}
                              </Show>
                            </div>
                            <div class="dense-secondary-actions flex shrink-0 items-center gap-2">
                              <ActionButton tooltip="Move assistant todo up" ariaLabel={`Move ${todo.title} up`} icon={<ArrowUp class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedTodos()[0]?.id === todo.id} disabledReason="Todo is already first" onClick={() => reorderTodo(todo, -1)} />
                              <ActionButton tooltip="Move assistant todo down" ariaLabel={`Move ${todo.title} down`} icon={<ArrowDown class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedTodos()[selectedTodos().length - 1]?.id === todo.id} disabledReason="Todo is already last" onClick={() => reorderTodo(todo, 1)} />
                              <DropdownControl kind="select" ariaLabel={`Select ${todo.title} state`} icon={<ClipboardList class="h-3.5 w-3.5" />} size="md" class="w-40" value={todo.state} options={assistantTodoStateOptions} onChange={(value) => updateTodo(todo, { state: value as AssistantTodo["state"] })} />
                              <ActionButton tooltip="Delete assistant todo" ariaLabel={`Delete ${todo.title}`} icon={<Trash2 class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8 text-(--danger) hover:bg-(--panel)" onClick={() => deleteTodo(todo)} />
                            </div>
                          </div>
                          <div class="mt-2 grid gap-2 md:grid-cols-[12rem_1fr]">
                            <DropdownControl kind="select" ariaLabel={`Select ${todo.title} work kind`} icon={<ClipboardList class="h-3.5 w-3.5" />} size="md" value={todo.workKind} options={assistantTodoWorkKindOptions} onChange={(value) => updateTodo(todo, { workKind: value as AssistantTodo["workKind"] })} />
                            <Input value={todo.workTarget ?? ""} placeholder="Work target" onChange={(event) => updateTodo(todo, { workTarget: event.currentTarget.value.trim() || undefined })} />
                          </div>
                          <div class="mt-2 flex flex-wrap items-center gap-2 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
                            <StatusChip tone={todoStateTone(todo.state)}>{todo.state}</StatusChip>
                            <StatusChip tone={todoWorkKindTone(todo.workKind)}>{todo.workKind}</StatusChip>
                            <span>
                              {todo.source ?? "assistant"} | sort{" "}
                              <span classList={{ "dense-numeric-flagged": rightAlignedNumbersEnabled() }}>{todo.sortOrder}</span>
                            </span>
                          </div>
                        </article>
                      )}
                    </VirtualList>
                  </section>
                </Show>

                <Show when={activeTab() === "questions"}>
                  <section class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
                    <QuestionColumn
                      title="Pending questions"
                      questions={visibleQuestions().filter((question) => question.status === "pending")}
                      disabled={executionPaused()}
                      disabledReason={executionPauseReason}
                      questionAnswers={questionAnswers()}
                      onAnswerInput={(questionId, value) => setQuestionAnswers((current) => ({ ...current, [questionId]: value }))}
                      onAnswer={answerQuestion}
                      fileLinks={assistantChatFileLinks()}
                    />
                    <QuestionColumn
                      title="Resolved questions"
                      questions={visibleQuestions().filter((question) => question.status === "answered")}
                      disabled={false}
                      disabledReason={undefined}
                      questionAnswers={questionAnswers()}
                      onAnswerInput={() => undefined}
                      onAnswer={() => undefined}
                      fileLinks={assistantChatFileLinks()}
                    />
                  </section>
                </Show>

                <Show when={activeTab() === "jobs"}>
                  <section class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
                    <div class="min-w-0">
                      <div class="mb-3 flex items-center justify-between gap-3">
                        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant jobs</div>
                        <ActionButton tooltip="Create background job for this assistant" icon={<Plus class="h-4 w-4" />} onClick={openAssistantJobEditor}>New job</ActionButton>
                      </div>
                      <VirtualList
                        class="h-120 pr-2 lg:h-full"
                        contentClass="w-full"
                        itemClass="pb-3"
                        items={visibleJobs()}
                        getKey={(job) => job.id}
                        estimateSize={120}
                        pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
                        empty={
                          <div class="border-l-2 border-dashed border-(--border) py-3 pl-4">
                            <div class="text-[0.675rem] text-(--muted)">No assistant-owned background jobs.</div>
                            <ActionButton tooltip="Create default research, todo maintenance, and implementation jobs" icon={<Plus class="h-3.5 w-3.5" />} size="sm" variant="secondary" class="mt-3" onClick={bootstrapAssistantJobs}>Bootstrap jobs</ActionButton>
                          </div>
                        }
                      >
                        {(job) => (
                          <article
                            class={`cursor-pointer overflow-hidden border-l-2 py-3 pl-4 pr-2 transition hover:border-(--accent-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) ${backgroundJobStatusBorderClass(job.status)}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openAssistantBackgroundJob(job.id)}
                            onKeyDown={(event) => handleSourceCardKeyDown(event, () => openAssistantBackgroundJob(job.id))}
                          >
                            <div class="flex items-start justify-between gap-3">
                              <div class="break-words text-[0.75rem] font-semibold text-(--foreground)">{job.name}</div>
                              <StatusChip tone={backgroundJobStatusTone(job.status)} class="shrink-0">{job.status}</StatusChip>
                            </div>
                            <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{job.kind}</div>
                            <div class="mt-2 break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">
                              <div>
                                <FileLinkedText text={job.description ?? job.scheduleInput} fileLinks={assistantChatFileLinks()} />
                              </div>
                              <Show when={formatFailureTracking(job)}>
                                {(line) => <div class="mt-1"><FileLinkedText text={line()} fileLinks={assistantChatFileLinks()} /></div>}
                              </Show>
                            </div>
                          </article>
                        )}
                      </VirtualList>
                    </div>
                    <div class="min-w-0">
                      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Recent runs</div>
                      <VirtualList class="h-120 pr-2 lg:h-full" contentClass="w-full" itemClass="pb-3" items={visibleRuns()} getKey={(run) => run.id} estimateSize={145} pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}>
                        {(run) => (
                          <article
                            class={`cursor-pointer overflow-hidden border-l-2 py-3 pl-4 pr-2 transition hover:border-(--accent-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) ${backgroundRunStatusBorderClass(run.status)}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openAssistantBackgroundRun(run)}
                            onKeyDown={(event) => handleSourceCardKeyDown(event, () => openAssistantBackgroundRun(run))}
                          >
                            <div class="flex items-center justify-between gap-3">
                              <div class="min-w-0 break-words text-[0.75rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">
                                <FileLinkedText text={run.summary ?? run.id} fileLinks={assistantChatFileLinks()} />
                              </div>
                              <StatusChip tone={backgroundRunStatusTone(run.status)} class="shrink-0">{run.status}</StatusChip>
                            </div>
                            <div class="mt-2 break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">
                              <div>
                                <FileLinkedText text={run.failureMessage ?? `Triggered by ${run.triggerSource}`} fileLinks={assistantChatFileLinks()} />
                              </div>
                              <Show when={run.failureCategory}>{(category) => <div class="mt-1">Failure category: {formatFailureCategory(category())}</div>}</Show>
                              <Show when={formatPromptStats(run.promptStats)}>{(stats) => <div class="mt-1">Prompt: {stats()}</div>}</Show>
                              <div class="mt-1">Updated {formatShortTimestamp(run.updatedAt)}</div>
                            </div>
                          </article>
                        )}
                      </VirtualList>
                    </div>
                  </section>
                </Show>

                <Show when={activeTab() === "log"}>
                  <section class="flex min-h-0 flex-1 flex-col">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
                    <ExecutionLog
                      entries={selectedExecutionLogs()}
                      emptyMessage="No execution log yet."
                      detailEyebrow="Assistant log details"
                      selectedEntryId={state.assistants.selectedLogDetailsId}
                      onSelectedEntryIdChange={harnessStore.setAssistantLogDetailsId}
                      rowVariant="flat"
                      fileLinks={assistantChatFileLinks()}
                      onEntrySourceClick={openAssistantLogSource}
                    />
                  </section>
                </Show>

                <Show when={activeTab() === "config"}>
                  <section class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
                    <ConfigCard title="Role"><FileLinkedText text={assistant().description ?? "No description."} fileLinks={assistantChatFileLinks()} /></ConfigCard>
                    <ConfigCard title="Routing">
                      <div>Agent: {assistant().agentId}</div>
                      <div>Provider: {assistant().providerBrand ?? "current"}</div>
                      <div>Mode: {assistant().modeId ?? "default"}</div>
                      <div>Execution model: {assistant().executionModelId ?? "default"}</div>
                      <div>Effort: {formatReasoningStrengthLabel(assistant().reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH)}</div>
                      <div>Fast mode: {assistant().fastMode ? "on" : "off"}</div>
                      <div>Scope: {assistant().scope}</div>
                    </ConfigCard>
                    <ConfigCard title="Personality prompt">
                      <div class="whitespace-pre-wrap">
                        <FileLinkedText text={assistant().personalityPrompt} fileLinks={assistantChatFileLinks()} />
                      </div>
                    </ConfigCard>
                    <ConfigCard title="Job prompt">
                      <div class="whitespace-pre-wrap">
                        <FileLinkedText text={assistant().jobPrompt} fileLinks={assistantChatFileLinks()} />
                      </div>
                    </ConfigCard>
                    <ConfigCard title="Linked assets">
                      <Show when={selectedAssetRefs().length > 0} fallback={<div>No asset refs.</div>}>
                        <div class="space-y-2">
                          <For each={selectedAssetRefs()}>
                            {(assetRef) => (
                              <div class="border-l-2 border-(--border) py-2 pl-3">
                                <div class="text-[0.625rem] uppercase tracking-[0.14em] text-(--muted)">{assetRef.kind}</div>
                                <div class="font-semibold text-(--foreground)">{assetRef.label}</div>
                                <div class="break-all text-[0.675rem] text-(--muted)">
                                  <FileLinkedText text={assetRef.value} fileLinks={assistantChatFileLinks()} />
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </ConfigCard>
                  </section>
                </Show>

                <Show when={activeTab() === "learnings"}>
                  <section class="flex min-h-0 flex-1 flex-col">
                    <VirtualList
                      class="min-h-0 flex-1 pr-2"
                      contentClass="w-full"
                      itemClass="pb-3"
                      items={filteredLearnings()}
                      getKey={(learning) => learning.id}
                      estimateSize={115}
                      pagination={{ kind: "forward", initialCount: 50, batchSize: 50 }}
                      empty={<div class="border-l-2 border-dashed border-(--border) py-3 pl-4 text-[0.75rem] text-(--muted)">No learnings yet.</div>}
                    >
                      {(learning) => (
                        <article class="dense-action-parent border-l-2 border-(--border) py-3 pl-4 pr-2">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <div class="text-[0.75rem] font-semibold leading-5 text-(--foreground)">
                                <FileLinkedText text={learning.summary} fileLinks={assistantChatFileLinks()} />
                              </div>
                            </div>
                            <div class="dense-secondary-actions flex shrink-0 items-center gap-2">
                              <StatusChip tone={learning.confidence === "high" ? "success" : learning.confidence === "low" ? "neutral" : "info"}>{learning.confidence}</StatusChip>
                              <ActionButton tooltip="Move assistant learning up" ariaLabel={`Move learning ${learning.summary} up`} icon={<ArrowUp class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedLearnings()[0]?.id === learning.id} disabledReason="Learning is already first" onClick={() => reorderLearning(learning, -1)} />
                              <ActionButton tooltip="Move assistant learning down" ariaLabel={`Move learning ${learning.summary} down`} icon={<ArrowDown class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedLearnings()[selectedLearnings().length - 1]?.id === learning.id} disabledReason="Learning is already last" onClick={() => reorderLearning(learning, 1)} />
                              <ActionButton tooltip="Delete assistant learning" ariaLabel={`Delete learning ${learning.summary}`} icon={<Trash2 class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8 text-(--danger) hover:bg-(--panel)" onClick={() => deleteLearning(learning)} />
                            </div>
                          </div>
                          <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">
                            <div>
                              <FileLinkedText text={`Source: ${learning.source}`} fileLinks={assistantChatFileLinks()} />
                            </div>
                            <div>{formatShortTimestamp(learning.createdAt)}</div>
                          </div>
                        </article>
                      )}
                    </VirtualList>
                  </section>
                </Show>
              </div>
            )}
          </Show>
        </section>
        </Show>
      </div>
    </LeftPaneShell>
  );
}

function TabButton(props: { icon: JSX.Element; label: Capitalize<AssistantDetailTab>; active: boolean; onClick: () => void }) {
  return (
    <Button
      tooltip={`Open ${props.label.toLowerCase()} tab`}
      role="tab"
      aria-selected={props.active}
      tabIndex={props.active ? 0 : -1}
      variant="ghost"
      size="sm"
      class={`h-9 shrink-0 rounded-none border-b-2 px-2.5 hover:text-(--foreground) ${
        props.active
          ? "border-(--accent) bg-transparent text-(--accent-strong) hover:bg-transparent hover:text-(--accent-strong)"
          : "border-transparent text-(--muted) hover:bg-(--panel-strong)"
      }`}
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </Button>
  );
}

function AssistantFact(props: { label: string; children: JSX.Element }) {
  return (
    <div class="min-w-0 break-words [overflow-wrap:anywhere]">
      <span class="font-semibold text-(--foreground)">{props.label}: </span>
      <span>{props.children}</span>
    </div>
  );
}

function assistantRunStateTone(runState: Assistant["runState"]): StatusChipTone {
  return runState === "active" ? "success" : "warning";
}

function assistantBootstrapTone(state: Assistant["bootstrapState"]): StatusChipTone {
  if (state === "completed") {
    return "success";
  }
  if (state === "failed") {
    return "danger";
  }
  if (state === "running") {
    return "info";
  }
  return "warning";
}

function assistantRunStateBorderClass(runState: Assistant["runState"]) {
  return runState === "active" ? "border-l-emerald-500" : "border-l-amber-400";
}

function todoStateTone(state: AssistantTodo["state"]): StatusChipTone {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "blocked":
      return "warning";
    case "in-progress":
      return "info";
    case "pending":
      return "neutral";
  }
}

function todoStateBorderClass(state: AssistantTodo["state"]) {
  switch (state) {
    case "completed":
      return "border-emerald-500";
    case "failed":
    case "cancelled":
      return "border-rose-400";
    case "blocked":
      return "border-amber-400";
    case "in-progress":
      return "border-sky-400";
    case "pending":
      return "border-(--border)";
  }
}

function todoWorkKindTone(workKind: AssistantTodo["workKind"]): StatusChipTone {
  switch (workKind) {
    case "app-code":
      return "success";
    case "automation-code":
      return "info";
    case "documentation":
      return "accent";
    case "research":
      return "info";
    case "blocked":
      return "warning";
    case "unspecified":
      return "neutral";
  }
}

function questionStatusTone(status: AssistantQuestion["status"]): StatusChipTone {
  switch (status) {
    case "answered":
      return "success";
    case "pending":
      return "warning";
    case "deferred":
      return "info";
    case "dismissed":
      return "neutral";
  }
}

function questionStatusBorderClass(status: AssistantQuestion["status"]) {
  switch (status) {
    case "answered":
      return "border-emerald-500";
    case "pending":
      return "border-amber-400";
    case "deferred":
      return "border-sky-400";
    case "dismissed":
      return "border-slate-300";
  }
}

function backgroundJobStatusTone(status: BackgroundJob["status"]): StatusChipTone {
  return status === "enabled" ? "success" : "neutral";
}

function backgroundJobStatusBorderClass(status: BackgroundJob["status"]) {
  return status === "enabled" ? "border-emerald-500" : "border-slate-300";
}

function backgroundRunStatusTone(status: BackgroundJobRun["status"]): StatusChipTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "partial-complete":
      return "warning";
    case "failed":
    case "cancelled":
      return "danger";
    case "awaiting-approval":
    case "awaiting-user-input":
      return "warning";
    case "running":
      return "info";
    case "queued":
      return "neutral";
    case "skipped":
      return "neutral";
  }
}

function backgroundRunStatusBorderClass(status: BackgroundJobRun["status"]) {
  switch (status) {
    case "succeeded":
      return "border-emerald-500";
    case "failed":
    case "cancelled":
      return "border-rose-400";
    case "awaiting-approval":
    case "awaiting-user-input":
      return "border-amber-400";
    case "running":
      return "border-sky-400";
    case "queued":
      return "border-slate-300";
    case "skipped":
      return "border-stone-300";
  }
}

function QuestionColumn(props: {
  title: string;
  questions: AssistantQuestion[];
  disabled: boolean;
  disabledReason?: string;
  questionAnswers: Record<string, string>;
  onAnswerInput: (questionId: string, value: string) => void;
  onAnswer: (question: AssistantQuestion, answerText?: string) => void;
  fileLinks?: FileLinkConfig;
}) {
  return (
    <section class="flex min-h-0 flex-col">
      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
      <VirtualList
        class="min-h-0 flex-1 pr-2"
        contentClass="w-full"
        itemClass="pb-3"
        items={props.questions}
        getKey={(question) => question.id}
        estimateSize={220}
        pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
        empty={<div class="border-l-2 border-dashed border-(--border) py-3 pl-4 text-[0.675rem] text-(--muted)">No questions here.</div>}
      >
        {(question) => (
          <article class={`border-l-2 py-3 pl-4 pr-2 ${questionStatusBorderClass(question.status)}`}>
            <div class="text-[0.75rem] font-semibold text-(--foreground)">
              <FileLinkedText text={question.prompt} fileLinks={props.fileLinks} />
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
              <StatusChip tone={questionStatusTone(question.status)}>{question.status}</StatusChip>
              <span>{formatShortTimestamp(question.askedAt)}</span>
            </div>
            <Show when={question.status === "pending"}>
              <div class="mt-3 flex flex-col gap-2">
                <div class="grid gap-2">
                  <For each={getAssistantQuestionDefaultChoices()}>
                    {(choice) => (
                      <ActionButton tooltip={choice.description} disabled={props.disabled} disabledReason={props.disabledReason} icon={choice.recommended ? <Check class="h-4 w-4" /> : undefined} variant={choice.recommended ? "default" : "secondary"} class="justify-start" onClick={() => props.onAnswer(question, choice.answerText)}>
                        {choice.label}
                      </ActionButton>
                    )}
                  </For>
                </div>
                <Textarea rows="3" disabled={props.disabled} value={props.questionAnswers[question.id] ?? ""} onKeyDown={submitOnEnter(() => props.onAnswer(question))} onInput={(event) => props.onAnswerInput(question.id, event.currentTarget.value)} placeholder="Answer this question." />
                <ActionButton tooltip="Send answer to assistant" disabled={props.disabled} disabledReason={props.disabledReason} icon={<Save class="h-4 w-4" />} onClick={() => props.onAnswer(question)}>Answer</ActionButton>
              </div>
            </Show>
            <Show when={question.answerText}>
              {(answer) => (
                <div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">
                  <FileLinkedText text={answer()} fileLinks={props.fileLinks} />
                </div>
              )}
            </Show>
          </article>
        )}
      </VirtualList>
    </section>
  );
}
function ConfigCard(props: { title: string; children: JSX.Element }) {
  return (
    <section class="text-[0.675rem] leading-6 text-(--muted)">
      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
      {props.children}
    </section>
  );
}

function summarizePrompt(prompt: string, maxLength: number = 120) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function matchesAssistantFilters(assistant: Assistant, state: typeof harnessStore.state) {
  const filters = state.assistants;
  if (filters.runStateFilter && assistant.runState !== filters.runStateFilter) {
    return false;
  }
  if (filters.bootstrapStateFilter && assistant.bootstrapState !== filters.bootstrapStateFilter) {
    return false;
  }
  if (filters.providerBrandFilter && assistant.providerBrand !== filters.providerBrandFilter) {
    return false;
  }
  if (filters.projectIdFilter && assistant.projectId !== filters.projectIdFilter) {
    return false;
  }
  return true;
}

function compareAssistants(left: Assistant, right: Assistant, sort: AssistantRosterSort) {
  if (sort === "name") {
    return left.name.localeCompare(right.name) || right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "created") {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if (sort === "run-state") {
    return left.runState.localeCompare(right.runState) || right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "bootstrap-state") {
    return left.bootstrapState.localeCompare(right.bootstrapState) || right.updatedAt.localeCompare(left.updatedAt);
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

function assistantRosterMenuItems(state: typeof harnessStore.state): LeftPaneSearchMenuItem[] {
  const setFilters = harnessStore.setAssistantPaneFilters;
  const sortOption = (label: string, value: AssistantRosterSort, icon: JSX.Element): LeftPaneSearchMenuItem => ({
    kind: "option",
    label,
    icon,
    selected: state.assistants.rosterSort === value,
    onSelect: () => setFilters({ rosterSort: value })
  });

  return [
    {
      kind: "submenu",
      label: "Scope",
      value: formatAssistantScopeFilterLabel(state.assistants.scopeFilter),
      icon: state.assistants.scopeFilter === "global" ? <Globe class="h-3.5 w-3.5" /> : <Folder class="h-3.5 w-3.5" />,
      items: [
        {
          kind: "option",
          label: "All",
          icon: <ListFilter class="h-3.5 w-3.5" />,
          selected: state.assistants.scopeFilter === "all",
          onSelect: () => harnessStore.setAssistantScopeFilter("all")
        },
        {
          kind: "option",
          label: "Current project",
          icon: <Folder class="h-3.5 w-3.5" />,
          selected: state.assistants.scopeFilter === "project",
          onSelect: () => harnessStore.setAssistantScopeFilter("project")
        },
        {
          kind: "option",
          label: "Global",
          icon: <Globe class="h-3.5 w-3.5" />,
          selected: state.assistants.scopeFilter === "global",
          onSelect: () => harnessStore.setAssistantScopeFilter("global")
        }
      ]
    },
    {
      kind: "submenu",
      label: "Sort assistants",
      value: formatAssistantRosterSortLabel(state.assistants.rosterSort),
      icon: <ListFilter class="h-3.5 w-3.5" />,
      items: [
        sortOption("Updated", "updated", <ArrowDown class="h-3.5 w-3.5" />),
        sortOption("Created", "created", <Calendar class="h-3.5 w-3.5" />),
        sortOption("Name", "name", <ListFilter class="h-3.5 w-3.5" />),
        sortOption("Run state", "run-state", <CirclePlay class="h-3.5 w-3.5" />),
        sortOption("Bootstrap state", "bootstrap-state", <ListChecks class="h-3.5 w-3.5" />)
      ] as Array<Extract<LeftPaneSearchMenuItem, { kind: "option" }>>
    },
    {
      kind: "submenu",
      label: "Run state",
      value: state.assistants.runStateFilter ?? "All",
      icon: <CirclePlay class="h-3.5 w-3.5" />,
      active: Boolean(state.assistants.runStateFilter),
      items: [
        {
          kind: "option",
          label: "All run states",
          icon: <ListFilter class="h-3.5 w-3.5" />,
          selected: !state.assistants.runStateFilter,
          onSelect: () => setFilters({ runStateFilter: undefined })
        },
        {
          kind: "option",
          label: "Active",
          icon: <CirclePlay class="h-3.5 w-3.5" />,
          selected: state.assistants.runStateFilter === "active",
          active: state.assistants.runStateFilter === "active",
          onSelect: () => setFilters({ runStateFilter: "active" })
        },
        {
          kind: "option",
          label: "Paused",
          icon: <CirclePause class="h-3.5 w-3.5" />,
          selected: state.assistants.runStateFilter === "paused",
          active: state.assistants.runStateFilter === "paused",
          onSelect: () => setFilters({ runStateFilter: "paused" })
        }
      ]
    },
    {
      kind: "submenu",
      label: "Bootstrap",
      value: state.assistants.bootstrapStateFilter ? toProperCase(state.assistants.bootstrapStateFilter) : "All",
      icon: <ListChecks class="h-3.5 w-3.5" />,
      active: Boolean(state.assistants.bootstrapStateFilter),
      items: [
        {
          kind: "option",
          label: "All bootstrap",
          icon: <ListFilter class="h-3.5 w-3.5" />,
          selected: !state.assistants.bootstrapStateFilter,
          onSelect: () => setFilters({ bootstrapStateFilter: undefined })
        },
        ...(["pending", "running", "completed", "failed"] as const).map((value) => ({
          kind: "option" as const,
          label: toProperCase(value),
          icon: <ListChecks class="h-3.5 w-3.5" />,
          selected: state.assistants.bootstrapStateFilter === value,
          active: state.assistants.bootstrapStateFilter === value,
          onSelect: () => setFilters({ bootstrapStateFilter: value })
        }))
      ]
    },
    {
      kind: "submenu",
      label: "Provider",
      value: state.assistants.providerBrandFilter ? toProperCase(state.assistants.providerBrandFilter) : "All",
      icon: <Bot class="h-3.5 w-3.5" />,
      active: Boolean(state.assistants.providerBrandFilter),
      items: [
        {
          kind: "option",
          label: "All providers",
          icon: <Bot class="h-3.5 w-3.5" />,
          selected: !state.assistants.providerBrandFilter,
          onSelect: () => setFilters({ providerBrandFilter: undefined })
        },
        ...(["gpt", "gemini", "claude"] as const).map((value) => ({
          kind: "option" as const,
          label: toProperCase(value),
          icon: <Bot class="h-3.5 w-3.5" />,
          selected: state.assistants.providerBrandFilter === value,
          active: state.assistants.providerBrandFilter === value,
          onSelect: () => setFilters({ providerBrandFilter: value })
        }))
      ]
    },
    {
      kind: "submenu",
      label: "Project",
      value: state.workspace.projects.find((project) => project.id === state.assistants.projectIdFilter)?.name ?? "All",
      icon: <Folder class="h-3.5 w-3.5" />,
      active: Boolean(state.assistants.projectIdFilter),
      items: [
        {
          kind: "option",
          label: "All projects",
          icon: <Folder class="h-3.5 w-3.5" />,
          selected: !state.assistants.projectIdFilter,
          onSelect: () => setFilters({ projectIdFilter: undefined })
        },
        ...state.workspace.projects.map((project) => ({
          kind: "option" as const,
          label: project.name,
          icon: <Folder class="h-3.5 w-3.5" />,
          selected: state.assistants.projectIdFilter === project.id,
          active: state.assistants.projectIdFilter === project.id,
          onSelect: () => setFilters({ projectIdFilter: project.id })
        }))
      ]
    },
    { kind: "separator" },
    {
      kind: "option",
      label: "Clear search and filters",
      icon: <Trash2 class="h-3.5 w-3.5" />,
      onSelect: () =>
        setFilters({
          rosterSearch: "",
          runStateFilter: undefined,
          bootstrapStateFilter: undefined,
          providerBrandFilter: undefined,
          projectIdFilter: undefined
        })
    }
  ];
}

function activeAssistantRosterFilterCount(state: typeof harnessStore.state) {
  return [
    state.assistants.runStateFilter,
    state.assistants.bootstrapStateFilter,
    state.assistants.providerBrandFilter,
    state.assistants.projectIdFilter
  ].filter(Boolean).length;
}

function formatAssistantScopeFilterLabel(scopeFilter: typeof harnessStore.state.assistants.scopeFilter) {
  if (scopeFilter === "all") {
    return "All";
  }
  if (scopeFilter === "global") {
    return "Global";
  }
  return "Current";
}

function formatAssistantRosterSortLabel(sort: AssistantRosterSort) {
  if (sort === "created") {
    return "Created";
  }
  if (sort === "name") {
    return "Name";
  }
  if (sort === "run-state") {
    return "Run state";
  }
  if (sort === "bootstrap-state") {
    return "Bootstrap";
  }
  return "Updated";
}

function assistantSearchHaystack(assistant: Assistant, state: typeof harnessStore.state) {
  const project = state.workspace.projects.find((entry) => entry.id === assistant.projectId);
  return [
    assistant.name,
    assistant.description,
    assistant.personalityPrompt,
    assistant.jobPrompt,
    assistant.scope,
    assistant.runState,
    assistant.bootstrapState,
    assistant.providerBrand,
    project?.name,
    project?.rootPath
  ]
    .filter(Boolean)
    .join(" ");
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
  return tokens.every((token) => normalized.includes(token));
}

function isActiveTodo(state: AssistantTodo["state"]) {
  return state === "pending" || state === "in-progress" || state === "blocked";
}

