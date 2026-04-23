import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js";
import {
  Bot,
  CirclePause,
  CircleHelp,
  CirclePlay,
  ClipboardList,
  CopyPlus,
  FlaskConical,
  Folder,
  Globe,
  ListChecks,
  Logs,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  SquarePen,
  Trash2
} from "lucide-solid";
import {
  createAssistantTodoId,
  createRequestId,
  type Assistant,
  type AssistantQuestion,
  type AssistantTodo
} from "../../../shared/protocol";
import {
  type AssistantEditorDraft,
  type BackgroundJobEditorDraft,
  getSelectedAssistant,
  getVisibleAssistants,
  harnessStore
} from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { MarkdownContent } from "./markdown-content";
import { buttonVariants } from "./primitives/button";
import { CopyTextButton } from "./primitives/copy-text-button";
import { DropdownControl } from "./primitives/dropdown";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import { cn } from "../lib/utils";

type AssistantTab = "chat" | "todos" | "questions" | "jobs" | "log" | "config" | "learnings";

const assistantTodoStateOptions = [
  { value: "pending", label: "pending", description: "Queued but not started yet." },
  { value: "in-progress", label: "in-progress", description: "Actively being worked right now." },
  { value: "blocked", label: "blocked", description: "Paused by dependency, approval, or external blocker." },
  { value: "completed", label: "completed", description: "Finished successfully." },
  { value: "failed", label: "failed", description: "Attempt finished with failure." },
  { value: "cancelled", label: "cancelled", description: "Work was intentionally stopped." }
] satisfies Array<{ value: AssistantTodo["state"]; label: string; description: string }>;

export function AssistantsPanel() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [activeTab, setActiveTab] = createSignal<AssistantTab>("chat");
  const [chatDraft, setChatDraft] = createSignal("");
  const [newTodoTitle, setNewTodoTitle] = createSignal("");
  const [expandedLogId, setExpandedLogId] = createSignal<string>();
  const [questionAnswers, setQuestionAnswers] = createSignal<Record<string, string>>({});
  const visibleAssistants = createMemo(() => getVisibleAssistants(state));
  const selectedAssistant = createMemo(() => getSelectedAssistant(state));
  const selectedThread = createMemo(() =>
    state.assistants.threads.find((thread) => thread.assistantId === selectedAssistant()?.id)
  );
  const selectedTodos = createMemo(() =>
    [...state.assistants.todos]
      .filter((todo) => todo.assistantId === selectedAssistant()?.id)
      .sort((left, right) => left.sortOrder - right.sortOrder || right.updatedAt.localeCompare(left.updatedAt))
  );
  const selectedQuestions = createMemo(() =>
    [...state.assistants.questions]
      .filter((question) => question.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.askedAt.localeCompare(left.askedAt))
  );
  const selectedLearnings = createMemo(() =>
    [...state.assistants.learnings]
      .filter((learning) => learning.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  );
  const selectedLogs = createMemo(() =>
    [...state.assistants.logs]
      .filter((entry) => entry.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  );
  const selectedAssetRefs = createMemo(() =>
    state.assistants.assetRefs.filter((assetRef) => assetRef.assistantId === selectedAssistant()?.id)
  );
  const selectedJobs = createMemo(() =>
    [...state.backgroundJobs.jobs]
      .filter((job) => job.assistantId === selectedAssistant()?.id)
      .sort((left, right) => (right.nextRunAt ?? right.updatedAt).localeCompare(left.nextRunAt ?? left.updatedAt))
  );
  const selectedRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => run.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );
  const streamingText = createMemo(() => state.assistants.streamingByAssistantId[selectedAssistant()?.id ?? ""] ?? "");
  const executionPaused = createMemo(() => state.executionControl.isPaused);
  const executionPauseReason = "Global execution pause is active";

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
      agentId: state.availableAgents[0]?.id ?? "pi",
      modeId: "",
      executionModelId: "",
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
      modeId: assistant.modeId,
      executionModelId: assistant.executionModelId,
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
        content: trimmed
      }
    });
    setChatDraft("");
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

  function answerQuestion(question: AssistantQuestion) {
    if (executionPaused()) {
      return;
    }
    const answer = questionAnswers()[question.id]?.trim();
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
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      aiPrompt: assistant.jobPrompt,
      aiModeId: assistant.modeId,
      aiExecutionModelId: assistant.executionModelId,
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

  return (
    <section data-test-assistants-panel="" class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0 p-4">
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

      <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
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
          <section class="flex min-h-0 flex-1 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-3">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Roster</div>
            <span class="text-[0.625rem] text-(--muted)">{visibleAssistants().length} total</span>
          </div>
          <ScrollArea class="min-h-0 flex-1 pr-2">
            <Show
              when={visibleAssistants().length > 0}
              fallback={
                <div class="rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-4 text-[0.675rem] leading-5 text-(--muted)">
                  No assistants in this scope yet.
                </div>
              }
            >
              <div class="space-y-3">
                <For each={visibleAssistants()}>
                  {(assistant) => (
                    <button
                      class={`w-full rounded-[1.2rem] border p-3 text-left transition ${
                        selectedAssistant()?.id === assistant.id
                          ? "border-(--accent) bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(255,255,255,0.92))]"
                          : "border-(--border) bg-white/70"
                      }`}
                      type="button"
                      onClick={() => harnessStore.setSelectedAssistantId(assistant.id)}
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <div class="text-[0.775rem] font-semibold text-(--foreground)">{assistant.name}</div>
                          <div class="mt-1 text-[0.575rem] uppercase tracking-[0.16em] text-(--muted)">
                            {assistant.scope} | {assistant.runState} | {assistant.bootstrapState}
                          </div>
                        </div>
                        <Show when={assistant.unreadQuestionCount > 0}>
                          <span class="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-amber-900">
                            {assistant.unreadQuestionCount} q
                          </span>
                        </Show>
                      </div>
                      <div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">
                        <div>{assistant.description ?? summarizePrompt(assistant.jobPrompt)}</div>
                        <div class="mt-1">{assistant.circuitBreakerState === "tripped" ? "Circuit breaker tripped" : `Updated ${assistant.updatedAt}`}</div>
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
                <div class="rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
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
                  <TabButton icon={<MessageSquare class="h-4 w-4" />} label="Chat" active={activeTab() === "chat"} onClick={() => setActiveTab("chat")} />
                  <TabButton icon={<ListChecks class="h-4 w-4" />} label="Todos" active={activeTab() === "todos"} onClick={() => setActiveTab("todos")} />
                  <TabButton icon={<ClipboardList class="h-4 w-4" />} label="Questions" active={activeTab() === "questions"} onClick={() => setActiveTab("questions")} />
                  <TabButton icon={<Bot class="h-4 w-4" />} label="Jobs" active={activeTab() === "jobs"} onClick={() => setActiveTab("jobs")} />
                  <TabButton icon={<Logs class="h-4 w-4" />} label="Log" active={activeTab() === "log"} onClick={() => setActiveTab("log")} />
                  <TabButton icon={<SquarePen class="h-4 w-4" />} label="Config" active={activeTab() === "config"} onClick={() => setActiveTab("config")} />
                  <TabButton icon={<FlaskConical class="h-4 w-4" />} label="Learnings" active={activeTab() === "learnings"} onClick={() => setActiveTab("learnings")} />
                </div>

                <Show when={activeTab() === "chat"}>
                  <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <section class="flex min-h-0 flex-col rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant chat</div>
                      <ScrollArea class="min-h-0 flex-1 pr-2">
                        <div class="space-y-3">
                          <For each={selectedThread()?.messages ?? []}>
                            {(message) => (
                              <article class={`rounded-2xl border p-3 ${message.role === "user" ? "border-(--border) bg-white/75" : "border-teal-200 bg-teal-50/65"}`}>
                                <div class="mb-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{message.role}</div>
                                <MarkdownContent content={message.content} />
                                <div class="mt-3 flex justify-end">
                                  <CopyTextButton
                                    value={message.content}
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
                              </article>
                            )}
                          </For>
                          <Show when={streamingText()}>
                            <article class="rounded-2xl border border-teal-200 bg-teal-50/65 p-3">
                              <div class="mb-2 text-[0.575rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">assistant</div>
                              <MarkdownContent content={streamingText()} />
                              <div class="mt-3 flex justify-end">
                                <CopyTextButton
                                  value={streamingText()}
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
                      </ScrollArea>
                      <div class="mt-4 flex gap-2">
                        <Textarea rows="3" disabled={executionPaused()} value={chatDraft()} onInput={(event) => setChatDraft(event.currentTarget.value)} placeholder={`Ask ${assistant().name} something.`} />
                        <ActionButton tooltip="Send message to assistant" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<MessageSquare class="h-4 w-4" />} onClick={handleSendChat}>Send</ActionButton>
                      </div>
                    </section>

                    <section class="rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                      <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Working memory</div>
                      <div class="mt-3 space-y-4 text-[0.675rem] leading-5 text-(--muted)">
                        <div>
                          <div class="font-semibold text-(--foreground)">Summary</div>
                          <div class="mt-1 whitespace-pre-wrap">{selectedThread()?.memorySummary?.content ?? "No rolled summary yet."}</div>
                        </div>
                        <div>
                          <div class="font-semibold text-(--foreground)">Active todos</div>
                          <ul class="mt-1 space-y-1">
                            <For each={selectedTodos().filter((todo) => isActiveTodo(todo.state)).slice(0, 8)}>
                              {(todo) => <li>{todo.state} | {todo.title}</li>}
                            </For>
                          </ul>
                        </div>
                      </div>
                    </section>
                  </div>
                </Show>

                <Show when={activeTab() === "todos"}>
                  <section class="flex min-h-0 flex-1 flex-col rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                    <div class="mb-4 flex gap-2">
                      <Textarea rows="2" value={newTodoTitle()} onInput={(event) => setNewTodoTitle(event.currentTarget.value)} placeholder="Add manual todo." />
                      <ActionButton tooltip="Add todo to assistant list" icon={<Plus class="h-4 w-4" />} onClick={handleAddTodo}>Add</ActionButton>
                    </div>
                    <ScrollArea class="min-h-0 flex-1 pr-2">
                      <div class="space-y-3">
                        <For each={selectedTodos()}>
                          {(todo) => (
                            <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                              <div class="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div class="text-[0.75rem] font-semibold text-(--foreground)">{todo.title}</div>
                                  <Show when={todo.description}><div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">{todo.description}</div></Show>
                                  <Show when={todo.blockerReason}><div class="mt-1 text-[0.625rem] text-amber-900">Blocker: {todo.blockerReason}</div></Show>
                                </div>
                                <DropdownControl
                                  kind="select"
                                  ariaLabel={`Select ${todo.title} state`}
                                  icon={<ClipboardList class="h-3.5 w-3.5" />}
                                  size="md"
                                  class="w-40"
                                  value={todo.state}
                                  options={assistantTodoStateOptions}
                                  onChange={(value) => updateTodo(todo, { state: value as AssistantTodo["state"] })}
                                />
                              </div>
                              <div class="mt-2 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{todo.source ?? "assistant"} | sort {todo.sortOrder}</div>
                            </article>
                          )}
                        </For>
                      </div>
                    </ScrollArea>
                  </section>
                </Show>

                <Show when={activeTab() === "questions"}>
                  <section class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
                    <QuestionColumn
                      title="Pending questions"
                      questions={selectedQuestions().filter((question) => question.status === "pending")}
                      disabled={executionPaused()}
                      disabledReason={executionPauseReason}
                      questionAnswers={questionAnswers()}
                      onAnswerInput={(questionId, value) => setQuestionAnswers((current) => ({ ...current, [questionId]: value }))}
                      onAnswer={answerQuestion}
                    />
                    <QuestionColumn
                      title="Resolved questions"
                      questions={selectedQuestions().filter((question) => question.status === "answered")}
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
                    <div class="rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                      <div class="mb-3 flex items-center justify-between gap-3">
                        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Assistant jobs</div>
                        <ActionButton tooltip="Create background job for this assistant" icon={<Plus class="h-4 w-4" />} onClick={openAssistantJobEditor}>New job</ActionButton>
                      </div>
                      <div class="space-y-3">
                        <For each={selectedJobs()}>
                          {(job) => (
                            <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                              <div class="text-[0.75rem] font-semibold text-(--foreground)">{job.name}</div>
                              <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{job.status} | {job.kind}</div>
                              <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">{job.description ?? job.scheduleInput}</div>
                            </article>
                          )}
                        </For>
                        <Show when={selectedJobs().length === 0}>
                          <div class="rounded-2xl border border-dashed border-(--border) bg-white/55 p-3 text-[0.675rem] text-(--muted)">No assistant-owned background jobs.</div>
                        </Show>
                      </div>
                    </div>
                    <div class="rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Recent runs</div>
                      <ScrollArea class="h-120 pr-2 lg:h-full">
                        <div class="space-y-3">
                          <For each={selectedRuns()}>
                            {(run) => (
                              <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                                <div class="flex items-center justify-between gap-3">
                                  <div class="text-[0.75rem] font-semibold text-(--foreground)">{run.summary ?? run.id}</div>
                                  <div class="text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{run.status}</div>
                                </div>
                                <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">
                                  <div>{run.failureMessage ?? `Triggered by ${run.triggerSource}`}</div>
                                  <div class="mt-1">Updated {run.updatedAt}</div>
                                </div>
                              </article>
                            )}
                          </For>
                        </div>
                      </ScrollArea>
                    </div>
                  </section>
                </Show>

                <Show when={activeTab() === "log"}>
                  <section class="flex min-h-0 flex-1 flex-col rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution log</div>
                    <ScrollArea class="min-h-0 flex-1 pr-2">
                      <div class="space-y-3">
                        <For each={selectedLogs()}>
                          {(entry) => (
                            <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div class="text-[0.75rem] font-semibold text-(--foreground)">{entry.summary}</div>
                                  <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{entry.level} | {entry.createdAt}</div>
                                </div>
                                <ActionButton tooltip={expandedLogId() === entry.id ? "Hide raw log payload" : "Show raw log payload"} icon={<Logs class="h-4 w-4" />} variant="secondary" onClick={() => setExpandedLogId(expandedLogId() === entry.id ? undefined : entry.id)}>
                                  {expandedLogId() === entry.id ? "Hide details" : "Show details"}
                                </ActionButton>
                              </div>
                              <Show when={entry.detail}><div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">{entry.detail}</div></Show>
                              <Show when={expandedLogId() === entry.id && entry.detailsJson !== undefined}>
                                <pre class="mt-3 overflow-auto rounded-[0.9rem] bg-slate-950/95 p-3 text-[0.625rem] leading-5 text-slate-100">{JSON.stringify(entry.detailsJson, null, 2)}</pre>
                              </Show>
                            </article>
                          )}
                        </For>
                      </div>
                    </ScrollArea>
                  </section>
                </Show>

                <Show when={activeTab() === "config"}>
                  <section class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
                    <ConfigCard title="Role">{assistant().description ?? "No description."}</ConfigCard>
                    <ConfigCard title="Routing">
                      <div>Agent: {assistant().agentId}</div>
                      <div>Mode: {assistant().modeId ?? "default"}</div>
                      <div>Execution model: {assistant().executionModelId ?? "default"}</div>
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
                  <section class="flex min-h-0 flex-1 flex-col rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
                    <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Learnings</div>
                    <ScrollArea class="min-h-0 flex-1 pr-2">
                      <div class="space-y-3">
                        <For each={selectedLearnings()}>
                          {(learning) => (
                            <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                              <div class="flex items-center justify-between gap-3">
                                <div class="text-[0.75rem] font-semibold text-(--foreground)">{learning.summary}</div>
                                <div class="text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{learning.confidence}</div>
                              </div>
                              <div class="mt-2 text-[0.675rem] leading-5 text-(--muted)">
                                <div>Source: {learning.source}</div>
                                <div>{learning.createdAt}</div>
                              </div>
                            </article>
                          )}
                        </For>
                      </div>
                    </ScrollArea>
                  </section>
                </Show>
              </div>
            )}
          </Show>
        </section>
      </div>
    </section>
  );
}

function TabButton(props: { icon: JSX.Element; label: string; active: boolean; onClick: () => void }) {
  return (
    <ActionButton tooltip={`Open ${props.label.toLowerCase()} tab`} icon={props.icon} variant={props.active ? "default" : "secondary"} onClick={props.onClick}>
      {props.label}
    </ActionButton>
  );
}

function StatusPill(props: { label: string; tone?: "default" | "error" }) {
  return (
    <span class={`rounded-full border px-2 py-1 ${props.tone === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-(--border) bg-white/80 text-(--foreground)"}`}>
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
  onAnswer: (question: AssistantQuestion) => void;
}) {
  return (
    <section class="flex min-h-0 flex-col rounded-[1.2rem] border border-(--border) bg-white/70 p-4">
      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
      <ScrollArea class="min-h-0 flex-1 pr-2">
        <div class="space-y-3">
          <For each={props.questions}>
            {(question) => (
              <article class="rounded-2xl border border-(--border) bg-white/75 p-3">
                <div class="text-[0.75rem] font-semibold text-(--foreground)">{question.prompt}</div>
                <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">{question.status} | {question.askedAt}</div>
                <Show when={question.status === "pending"}>
                  <div class="mt-3 flex flex-col gap-2">
                    <Textarea rows="3" disabled={props.disabled} value={props.questionAnswers[question.id] ?? ""} onInput={(event) => props.onAnswerInput(question.id, event.currentTarget.value)} placeholder="Answer this question." />
                    <ActionButton tooltip="Send answer to assistant" disabled={props.disabled} disabledReason={props.disabledReason} icon={<Save class="h-4 w-4" />} onClick={() => props.onAnswer(question)}>Answer</ActionButton>
                  </div>
                </Show>
                <Show when={question.answerText}><div class="mt-3 text-[0.675rem] leading-5 text-(--muted)">{question.answerText}</div></Show>
              </article>
            )}
          </For>
          <Show when={props.questions.length === 0}>
            <div class="rounded-2xl border border-dashed border-(--border) bg-white/55 p-3 text-[0.675rem] text-(--muted)">No questions here.</div>
          </Show>
        </div>
      </ScrollArea>
    </section>
  );
}

function ConfigCard(props: { title: string; children: JSX.Element }) {
  return (
    <section class="rounded-[1.2rem] border border-(--border) bg-white/70 p-4 text-[0.675rem] leading-6 text-(--muted)">
      <div class="mb-3 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
      {props.children}
    </section>
  );
}

function summarizePrompt(prompt: string, maxLength: number = 120) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isActiveTodo(state: AssistantTodo["state"]) {
  return state === "pending" || state === "in-progress" || state === "blocked";
}

