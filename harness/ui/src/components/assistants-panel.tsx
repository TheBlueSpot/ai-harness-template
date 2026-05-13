import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Bot,
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
import { cn } from "../lib/utils";
import { submitOnEnter } from "../textarea-submit";
import {
  type AssistantEditorDraft,
  type AssistantDetailTab,
  type BackgroundJobEditorDraft,
  COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getSelectedAssistant,
  getVisibleAssistants,
  harnessStore
} from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { MarkdownContent } from "./markdown-content";
import { buttonVariants } from "./primitives/button";
import { ChatComposer } from "./primitives/chat-composer";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";
import { ExecutionLog } from "./primitives/execution-log";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";

const assistantTodoStateOptions = [
  { value: "pending", label: "pending", description: "Queued but not started yet." },
  { value: "in-progress", label: "in-progress", description: "Actively being worked right now." },
  { value: "blocked", label: "blocked", description: "Paused by dependency, approval, or external blocker." },
  { value: "completed", label: "completed", description: "Finished successfully." },
  { value: "failed", label: "failed", description: "Attempt finished with failure." },
  { value: "cancelled", label: "cancelled", description: "Work was intentionally stopped." }
] satisfies Array<{ value: AssistantTodo["state"]; label: string; description: string }>;

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
  );
  const selectedAssistant = createMemo(() => getSelectedAssistant(state));
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
  const visibleTodos = createMemo(() => selectedTodos().filter((todo) => fuzzyMatches([todo.title, todo.description, todo.state, todo.blockerReason].filter(Boolean).join(" "), state.assistants.detailSearch)));
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
    visibleLogs().map((entry) => ({
      id: entry.id,
      message: entry.summary,
      rowSummary: [entry.summary, entry.detail].filter(Boolean).join(" "),
      level: entry.level,
      createdAt: entry.createdAt,
      detail: entry.detail,
      detailsJson: entry.detailsJson
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
    sendCommand({
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
    setChatDraft("");
    if (assistantChatTextarea) {
      assistantChatTextarea.value = "";
    }
  }

  function handleAddTodo() {
    const assistant = selectedAssistant();
    const trimmedTitle = newTodoTitle().trim();
    if (!assistant || !trimmedTitle) {
      return;
    }
    const sortOrder = selectedTodos().length === 0 ? 0 : Math.max(...selectedTodos().map((todo) => todo.sortOrder)) + 1;
    sendCommand({
      type: "assistant.todo.update",
      requestId: createRequestId(),
      payload: {
        todo: {
          id: createAssistantTodoId(),
          assistantId: assistant.id,
          title: trimmedTitle,
          description: undefined,
          state: "pending",
          sortOrder,
          source: "user",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });
    setNewTodoTitle("");
  }

  function updateTodo(todo: AssistantTodo, patch: Partial<AssistantTodo>) {
    const nextState = patch.state ?? todo.state;
    sendCommand({
      type: "assistant.todo.update",
      requestId: createRequestId(),
      payload: {
        todo: {
          ...todo,
          ...patch,
          updatedAt: new Date().toISOString(),
          completedAt: nextState === "completed" ? new Date().toISOString() : undefined,
          cancelledAt: nextState === "cancelled" ? new Date().toISOString() : undefined
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

  return (
    <section data-test-assistants-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0 p-4">
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
                <div class="text-[0.75rem] leading-5 text-(--foreground)">{assistant().circuitBreakerReason ?? "No failure reason recorded."}</div>
              </section>
              <section class="rounded-2xl border border-(--border) bg-white/70 p-3">
                <div class="mb-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Latest logs</div>
                <Show when={circuitBreakerLogs().length > 0} fallback={<div class="text-[0.675rem] text-(--muted)">No recent logs.</div>}>
                  <div class="space-y-2">
                    <For each={circuitBreakerLogs()}>
                      {(entry) => (
                        <div class="rounded-xl border border-(--border) bg-white/70 p-2 text-[0.675rem] leading-5">
                          <div class="font-semibold text-(--foreground)">{entry.level} | {entry.summary}</div>
                          <div class="text-(--muted)">{entry.detail ?? "No detail."}</div>
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
                          <div class="text-(--muted)">{run.failureMessage ?? run.summary ?? run.id}</div>
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
                          {question.prompt}
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
      <div class="px-1 py-1">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-center gap-2 text-[0.585rem] font-semibold tracking-[0.2em] text-(--muted)">
            <span>Assistants</span>
            <Tooltip content="Named operators with chat, todo list, questions inbox, learnings, jobs, and deep logs.">
              <span class="inline-flex">
                <CircleHelp class="h-3.5 w-3.5 text-(--muted)" aria-label="Assistants help" />
              </span>
            </Tooltip>
          </div>
          <div class="flex items-center gap-2">
            <ActionButton
              tooltip={state.assistants.scopeFilter === "project" ? "Create project assistant" : "Create global assistant"}
              icon={<Plus class="h-4 w-4" />}
              size="icon"
              variant="ghost"
              ariaLabel={state.assistants.scopeFilter === "project" ? "Create project assistant" : "Create global assistant"}
              onClick={() => openCreateAssistant(state.assistants.scopeFilter === "project" ? "project" : "global")}
            />
          </div>
        </div>
      </div>
      </Show>

      <div
        class="grid min-h-0 flex-1 gap-4"
        classList={{ "xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]": showRoster() && showDetail() }}
      >
        <Show when={showRoster()}>
        <div class="flex min-h-0 flex-col gap-1">
          <nav class="surface-tab-strip" data-test-assistant-scope-nav="">
            <Tooltip content="Show global assistants">
              <button
                type="button"
                class={cn(buttonVariants({ variant: "ghost" }), "surface-tab")}
                aria-label="Show global assistants"
                attr:aria-pressed={state.assistants.scopeFilter === "global" ? "true" : "false"}
                onClick={() => harnessStore.setAssistantScopeFilter("global")}
              >
                <Globe class="h-4 w-4" />
                Global
              </button>
            </Tooltip>
            <Tooltip content="Show assistants for current project">
              <button
                type="button"
                class={cn(buttonVariants({ variant: "ghost" }), "surface-tab")}
                aria-label="Show assistants for current project"
                attr:aria-pressed={state.assistants.scopeFilter === "project" ? "true" : "false"}
                onClick={() => harnessStore.setAssistantScopeFilter("project")}
              >
                <Folder class="h-4 w-4" />
                Current project
              </button>
            </Tooltip>
          </nav>
          <div class="grid gap-2">
            <Input
              value={state.assistants.rosterSearch}
              placeholder="Search assistants"
              onInput={(event) => harnessStore.setAssistantPaneFilters({ rosterSearch: (event.target as HTMLInputElement).value })}
            />
            <div class="grid gap-2 text-[0.675rem] sm:grid-cols-2">
              <select class="rounded-lg border border-(--border) bg-white/75 px-2 py-2" value={state.assistants.runStateFilter ?? ""} onChange={(event) => harnessStore.setAssistantPaneFilters({ runStateFilter: event.currentTarget.value ? event.currentTarget.value as Assistant["runState"] : undefined })}>
                <option value="">All run states</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
              <select class="rounded-lg border border-(--border) bg-white/75 px-2 py-2" value={state.assistants.bootstrapStateFilter ?? ""} onChange={(event) => harnessStore.setAssistantPaneFilters({ bootstrapStateFilter: event.currentTarget.value ? event.currentTarget.value as Assistant["bootstrapState"] : undefined })}>
                <option value="">All bootstrap</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <select class="rounded-lg border border-(--border) bg-white/75 px-2 py-2" value={state.assistants.providerBrandFilter ?? ""} onChange={(event) => harnessStore.setAssistantPaneFilters({ providerBrandFilter: event.currentTarget.value ? event.currentTarget.value as Assistant["providerBrand"] : undefined })}>
                <option value="">All providers</option>
                <option value="gpt">GPT</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </select>
              <select class="rounded-lg border border-(--border) bg-white/75 px-2 py-2" value={state.assistants.projectIdFilter ?? ""} onChange={(event) => harnessStore.setAssistantPaneFilters({ projectIdFilter: event.currentTarget.value || undefined })}>
                <option value="">All projects</option>
                <For each={state.workspace.projects}>{(project) => <option value={project.id}>{project.name}</option>}</For>
              </select>
            </div>
            <Show when={hasAssistantRosterFilters(state)}>
              <ActionButton tooltip="Clear assistant roster search and filters" size="sm" variant="ghost" onClick={() => harnessStore.setAssistantPaneFilters({ rosterSearch: "", runStateFilter: undefined, bootstrapStateFilter: undefined, providerBrandFilter: undefined, projectIdFilter: undefined })}>Clear filters</ActionButton>
            </Show>
          </div>
          <section class="flex min-h-0 flex-1 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-3">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Roster</div>
            <span class="text-[0.625rem] text-(--muted)">{visibleAssistants().length} total</span>
          </div>
          <VirtualList
            class="min-h-0 flex-1 pr-2"
            contentClass="w-full"
            itemClass="pb-3"
            items={visibleAssistants()}
            getKey={(assistant) => assistant.id}
            estimateSize={140}
            pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
            empty={<div class="rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-4 text-[0.675rem] leading-5 text-(--muted)">No assistants match current search or filters.</div>}
          >
            {(assistant) => (
              <button
                class="w-full rounded-[1.2rem] border p-3 text-left transition"
                classList={{
                  "border-(--accent)": selectedAssistant()?.id === assistant.id,
                  "bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(255,255,255,0.92))]": selectedAssistant()?.id === assistant.id,
                  "border-(--border)": selectedAssistant()?.id !== assistant.id,
                  "bg-white/70": selectedAssistant()?.id !== assistant.id
                }}
                type="button"
                onClick={() => harnessStore.setSelectedAssistantId(assistant.id)}
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-[0.775rem] font-semibold text-(--foreground)">{assistant.name}</div>
                    <div class="mt-1 text-[0.575rem] uppercase tracking-[0.16em] text-(--muted)">{assistant.scope} | {assistant.runState} | {assistant.bootstrapState}</div>
                  </div>
                  <Show when={assistant.unreadQuestionCount > 0}>
                    <span class="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-amber-900">{assistant.unreadQuestionCount} q</span>
                  </Show>
                </div>
                <div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">
                  <div>{assistant.description ?? summarizePrompt(assistant.jobPrompt)}</div>
                  <div class="mt-1">{assistant.circuitBreakerState === "tripped" ? "Circuit breaker tripped" : `Updated ${formatShortTimestamp(assistant.updatedAt)}`}</div>
                </div>
              </button>
            )}
          </VirtualList>
          </section>
        </div>
        </Show>

        <Show when={showDetail()}>
        <section class="flex min-h-0 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
          <Show
            when={selectedAssistant()}
            fallback={
              <div class="flex h-full min-h-80 items-center justify-center rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-6 text-center text-[0.675rem] text-(--muted)">
                Select assistant to inspect config, chat, todos, and logs.
              </div>
            }
          >
            {(assistant) => (
              <div class="flex h-full min-h-0 flex-col gap-4">
                <div>
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Inspector</div>
                      <h2 class="mt-1 text-[1.2rem] font-semibold tracking-[-0.04em] text-(--foreground)">{assistant().name}</h2>
                      <div class="mt-2 flex flex-wrap gap-2 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
                        <StatusPill label={assistant().scope} />
                        <StatusPill label={assistant().runState} />
                        <StatusPill label={assistant().bootstrapState} />
                        <Show when={assistant().circuitBreakerState === "tripped"}>
                          <StatusPill label="circuit breaker" tone="error" />
                        </Show>
                      </div>
                      <Show when={assistant().description}>
                        <div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">{assistant().description}</div>
                      </Show>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <Show when={assistant().circuitBreakerState === "tripped"}>
                        <Tooltip content="Inspect circuit breaker failure and retry">
                          <button
                            type="button"
                            class={buttonVariants({ variant: "warning" })}
                            aria-label="Inspect failure"
                            on:click={(event) => {
                              event.stopPropagation();
                              setSelectedCircuitBreakerAssistantId(assistant().id);
                            }}
                          >
                            <CircleAlert class="h-4 w-4" />
                            Inspect failure
                          </button>
                        </Tooltip>
                      </Show>
                      <ActionButton tooltip="Edit assistant config" icon={<SquarePen class="h-4 w-4" />} variant="secondary" onClick={() => openEditAssistant(assistant())}>Edit</ActionButton>
                      <ActionButton
                        tooltip={assistant().runState === "paused" ? "Resume assistant background work" : "Pause assistant background work"}
                        icon={assistant().runState === "paused" ? <CirclePlay class="h-4 w-4" /> : <CirclePause class="h-4 w-4" />}
                        variant={assistant().runState === "paused" ? "default" : "warning"}
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
                      <ActionButton tooltip="Delete assistant" icon={<Trash2 class="h-4 w-4" />} variant="danger" onClick={() => handleDeleteAssistant(assistant())}>Delete</ActionButton>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
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
                  <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <section class="flex min-h-0 flex-col">
                      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant chat</div>
                      <div class="relative flex min-h-0 flex-1 flex-col">
                        <VirtualList
                          viewportRef={(element) => {
                            assistantMessageViewport = element;
                            scrollAssistantChatToBottom(true);
                          }}
                          class="min-h-0 flex-1 pr-2"
                          contentClass="w-full"
                          itemClass="pb-3"
                          data-test-assistant-chat-scroll=""
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
                                "border-teal-200": row.message.role !== "user",
                                "bg-teal-50/65": row.message.role !== "user"
                              }}
                            >
                              <div class="mb-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{row.message.role}</div>
                              <MarkdownContent content={row.message.content} />
                              {renderMessageActionRow(
                                row.message.createdAt,
                                <CopyTextButton value={row.message.content} tooltip="Copy message" copiedTitle="Message copied" copiedDescription="Message copied to clipboard." size="sm" variant="ghost" ariaLabel={`Copy ${row.message.role} message`}>
                                  Copy
                                </CopyTextButton>
                              )}
                            </article>
                          ) : (
                            <article class="rounded-2xl border border-teal-200 bg-teal-50/65 p-3">
                              <div class="mb-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">assistant</div>
                              <MarkdownContent content={row.content} />
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

                    <section>
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Working memory</div>
                      <div class="mt-3 space-y-4 text-[0.675rem] leading-5 text-(--muted)">
                        <div>
                          <div class="font-semibold text-(--foreground)">Summary</div>
                          <div class="mt-1 whitespace-pre-wrap">{selectedThread()?.memorySummary?.content ?? "No rolled summary yet."}</div>
                        </div>
                        <div>
                          <div class="font-semibold text-(--foreground)">Active todos</div>
                          <ul class="mt-1 space-y-1">
                            <For each={visibleTodos().filter((todo) => isActiveTodo(todo.state)).slice(0, 8)}>
                              {(todo) => <li>{todo.state} | {todo.title}</li>}
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
                        <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                          <div class="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div class="text-[0.75rem] font-semibold text-(--foreground)">{todo.title}</div>
                              <Show when={todo.description}><div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">{todo.description}</div></Show>
                              <Show when={todo.blockerReason}><div class="mt-1 text-[0.625rem] text-amber-900">Blocker: {todo.blockerReason}</div></Show>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                              <ActionButton tooltip="Move assistant todo up" ariaLabel={`Move ${todo.title} up`} icon={<ArrowUp class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedTodos()[0]?.id === todo.id} disabledReason="Todo is already first" onClick={() => reorderTodo(todo, -1)} />
                              <ActionButton tooltip="Move assistant todo down" ariaLabel={`Move ${todo.title} down`} icon={<ArrowDown class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedTodos()[selectedTodos().length - 1]?.id === todo.id} disabledReason="Todo is already last" onClick={() => reorderTodo(todo, 1)} />
                              <DropdownControl kind="select" ariaLabel={`Select ${todo.title} state`} icon={<ClipboardList class="h-3.5 w-3.5" />} size="md" class="w-40" value={todo.state} options={assistantTodoStateOptions} onChange={(value) => updateTodo(todo, { state: value as AssistantTodo["state"] })} />
                              <ActionButton tooltip="Delete assistant todo" ariaLabel={`Delete ${todo.title}`} icon={<Trash2 class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8 text-rose-700 hover:bg-rose-50" onClick={() => deleteTodo(todo)} />
                            </div>
                          </div>
                          <div class="mt-2 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{todo.source ?? "assistant"} | sort {todo.sortOrder}</div>
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
                    />
                    <QuestionColumn
                      title="Resolved questions"
                      questions={visibleQuestions().filter((question) => question.status === "answered")}
                      disabled={false}
                      disabledReason={undefined}
                      questionAnswers={questionAnswers()}
                      onAnswerInput={() => undefined}
                      onAnswer={() => undefined}
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
                        empty={<div class="rounded-2xl border border-dashed border-(--border) bg-white/55 p-3 text-[0.675rem] text-(--muted)">No assistant-owned background jobs.</div>}
                      >
                        {(job) => (
                          <article class="overflow-hidden rounded-2xl border border-(--border) bg-white/75 p-3">
                            <div class="break-words text-[0.75rem] font-semibold text-(--foreground)">{job.name}</div>
                            <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{job.status} | {job.kind}</div>
                            <div class="mt-2 break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">
                              <div>{job.description ?? job.scheduleInput}</div>
                              <Show when={formatFailureTracking(job)}>{(line) => <div class="mt-1">{line()}</div>}</Show>
                            </div>
                          </article>
                        )}
                      </VirtualList>
                    </div>
                    <div class="min-w-0">
                      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Recent runs</div>
                      <VirtualList class="h-120 pr-2 lg:h-full" contentClass="w-full" itemClass="pb-3" items={visibleRuns()} getKey={(run) => run.id} estimateSize={145} pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}>
                        {(run) => (
                          <article class="overflow-hidden rounded-2xl border border-(--border) bg-white/75 p-3">
                            <div class="flex items-center justify-between gap-3">
                              <div class="min-w-0 break-words text-[0.75rem] font-semibold text-(--foreground) [overflow-wrap:anywhere]">{run.summary ?? run.id}</div>
                              <div class="shrink-0 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{run.status}</div>
                            </div>
                            <div class="mt-2 break-words text-[0.675rem] leading-5 text-(--muted) [overflow-wrap:anywhere]">
                              <div>{run.failureMessage ?? `Triggered by ${run.triggerSource}`}</div>
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
                    />
                  </section>
                </Show>

                <Show when={activeTab() === "config"}>
                  <section class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
                    <ConfigCard title="Role">{assistant().description ?? "No description."}</ConfigCard>
                    <ConfigCard title="Routing">
                      <div>Agent: {assistant().agentId}</div>
                      <div>Provider: {assistant().providerBrand ?? "current"}</div>
                      <div>Mode: {assistant().modeId ?? "default"}</div>
                      <div>Execution model: {assistant().executionModelId ?? "default"}</div>
                      <div>Effort: {formatReasoningStrengthLabel(assistant().reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH)}</div>
                      <div>Fast mode: {assistant().fastMode ? "on" : "off"}</div>
                      <div>Scope: {assistant().scope}</div>
                    </ConfigCard>
                    <ConfigCard title="Personality prompt"><div class="whitespace-pre-wrap">{assistant().personalityPrompt}</div></ConfigCard>
                    <ConfigCard title="Job prompt"><div class="whitespace-pre-wrap">{assistant().jobPrompt}</div></ConfigCard>
                    <ConfigCard title="Linked assets">
                      <Show when={selectedAssetRefs().length > 0} fallback={<div>No asset refs.</div>}>
                        <div class="space-y-2">
                          <For each={selectedAssetRefs()}>
                            {(assetRef) => (
                              <div class="rounded-[0.9rem] border border-(--border) bg-white/75 p-2">
                                <div class="text-[0.625rem] uppercase tracking-[0.14em] text-(--muted)">{assetRef.kind}</div>
                                <div class="font-semibold text-(--foreground)">{assetRef.label}</div>
                                <div class="break-all text-[0.675rem] text-(--muted)">{assetRef.value}</div>
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
                      empty={<div class="rounded-lg border border-dashed border-(--border) bg-white/60 p-4 text-[0.75rem] text-(--muted)">No learnings yet.</div>}
                    >
                      {(learning) => (
                        <article class="rounded-lg border border-(--border) bg-white/75 p-3">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <div class="text-[0.75rem] font-semibold leading-5 text-(--foreground)">{learning.summary}</div>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                              <div class="text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{learning.confidence}</div>
                              <ActionButton tooltip="Move assistant learning up" ariaLabel={`Move learning ${learning.summary} up`} icon={<ArrowUp class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedLearnings()[0]?.id === learning.id} disabledReason="Learning is already first" onClick={() => reorderLearning(learning, -1)} />
                              <ActionButton tooltip="Move assistant learning down" ariaLabel={`Move learning ${learning.summary} down`} icon={<ArrowDown class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8" disabled={selectedLearnings()[selectedLearnings().length - 1]?.id === learning.id} disabledReason="Learning is already last" onClick={() => reorderLearning(learning, 1)} />
                              <ActionButton tooltip="Delete assistant learning" ariaLabel={`Delete learning ${learning.summary}`} icon={<Trash2 class="h-4 w-4" />} size="icon" variant="ghost" class="h-8 w-8 text-rose-700 hover:bg-rose-50" onClick={() => deleteLearning(learning)} />
                            </div>
                          </div>
                          <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">
                            <div>Source: {learning.source}</div>
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
    </section>
  );
}

function TabButton(props: { icon: JSX.Element; label: Capitalize<AssistantDetailTab>; active: boolean; onClick: () => void }) {
  return (
    <ActionButton tooltip={`Open ${props.label.toLowerCase()} tab`} icon={props.icon} variant={props.active ? "default" : "secondary"} onClick={props.onClick}>
      {props.label}
    </ActionButton>
  );
}

function StatusPill(props: { label: string; tone?: "default" | "error" }) {
  return (
    <span
      class="rounded-full border px-2 py-1"
      classList={{
        "border-rose-300": props.tone === "error",
        "bg-rose-50": props.tone === "error",
        "text-rose-900": props.tone === "error",
        "border-(--border)": props.tone !== "error",
        "bg-white/80": props.tone !== "error",
        "text-(--foreground)": props.tone !== "error"
      }}
    >
      {props.label}
    </span>
  );
}

function QuestionColumn(props: {
  title: string;
  questions: AssistantQuestion[];
  disabled: boolean;
  disabledReason?: string;
  questionAnswers: Record<string, string>;
  onAnswerInput: (questionId: string, value: string) => void;
  onAnswer: (question: AssistantQuestion, answerText?: string) => void;
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
        empty={<div class="rounded-2xl border border-dashed border-(--border) bg-white/55 p-3 text-[0.675rem] text-(--muted)">No questions here.</div>}
      >
        {(question) => (
          <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
            <div class="text-[0.75rem] font-semibold text-(--foreground)">{question.prompt}</div>
            <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{question.status} | {formatShortTimestamp(question.askedAt)}</div>
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
            <Show when={question.answerText}><div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">{question.answerText}</div></Show>
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

function hasAssistantRosterFilters(state: typeof harnessStore.state) {
  return Boolean(
    state.assistants.rosterSearch ||
      state.assistants.runStateFilter ||
      state.assistants.bootstrapStateFilter ||
      state.assistants.providerBrandFilter ||
      state.assistants.projectIdFilter
  );
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

