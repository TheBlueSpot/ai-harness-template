import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import {
  Bell,
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Download,
  SendHorizontal
} from "lucide-solid";
import { createRequestId, type ClientCommand, type NotificationInboxItem } from "../../../shared/protocol";
import { getAssistantQuestionDefaultChoices } from "../assistant-question-defaults";
import { openBackgroundRunInJobsPane } from "../background-run-navigation";
import { harnessStore, type HarnessViewState } from "../harness-store";
import { activateProjectThread } from "../project-thread-navigation";
import { submitOnEnter } from "../textarea-submit";
import { ActionButton } from "./action-button";
import { Popover } from "./primitives/popover";
import { Textarea } from "./primitives/textarea";

const ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX = "assistant-job-bootstrap:";

/**
 * Pure helper that activates a (project, thread) pair from the notification
 * inbox. Exported for unit testing because the inbox's popover is not
 * exercisable via fireEvent.click in the current Bun/happy-dom/solid setup.
 *
 * Always issues both commands when the client's active project differs, so
 * the server has an authoritative (projectId, threadId) pair regardless of a
 * stale local `activeThreadId` cache. `thread.activate` is idempotent on the
 * server and carries its own projectId, so ordering against an in-flight
 * `project.activate` is safe over the ordered websocket.
 */
export function activateProjectThreadFromInbox(
  state: HarnessViewState,
  projectId: string,
  threadId: string,
  sendCommand: (command: ClientCommand) => void
) {
  activateProjectThread(state, projectId, threadId, sendCommand);
}

export function openAssistantJobNotificationFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "background-run-status" }>
) {
  const run = state.backgroundJobs.runs.find((entry) => entry.id === notification.backgroundRunId);
  const job = state.backgroundJobs.jobs.find((entry) => entry.id === notification.jobId);
  const assistantId = run?.assistantId ?? job?.assistantId;
  if (!assistantId) {
    return false;
  }

  const assistant = state.assistants.assistants.find((entry) => entry.id === assistantId);
  if (assistant) {
    harnessStore.setAssistantScopeFilter(assistant.scope === "global" ? "global" : "project");
  }
  harnessStore.setActiveSurface("assistants");
  harnessStore.setSelectedAssistantId(assistantId);
  harnessStore.setAssistantDetailTab("log");
  return true;
}

export function createAssistantJobBootstrapCommandFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "assistant-question" }>
): ClientCommand | undefined {
  const assistant = state.assistants.assistants.find((entry) => entry.id === notification.assistantId);
  const projectId = assistant?.projectId ?? state.workspace.activeProjectId;
  if (!projectId) {
    return undefined;
  }
  return {
    type: "assistant.jobs.bootstrap",
    requestId: createRequestId(),
    payload: {
      assistantId: notification.assistantId,
      projectId
    }
  };
}

export function openBackgroundRunNotificationFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "background-run-status" }>
) {
  openBackgroundRunInJobsPane(state, notification.backgroundRunId, notification.jobId);
}

export function NotificationInbox() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [open, setOpen] = createSignal(false);
  const [expandedId, setExpandedId] = createSignal<string>();
  const [draftById, setDraftById] = createSignal<Record<string, string>>({});
  const unreadCount = createMemo(() => state.notifications.unreadCount);
  const items = createMemo(() => state.notifications.items.slice(0, 24));

  function markRead(notificationId: string) {
    sendCommand({
      type: "notification.mark-read",
      requestId: createRequestId(),
      payload: {
        notificationId
      }
    });
  }

  function openItem(notification: NotificationInboxItem) {
    if (!notification.readAt) {
      markRead(notification.id);
    }

    switch (notification.kind) {
      case "background-run-status":
        openBackgroundRunNotificationFromInbox(state, notification);
        activateProjectThread(notification.projectId, notification.threadId);
        setOpen(false);
        return;
      case "cli-update":
        sendCommand({
          type: "cli-updates.install",
          requestId: createRequestId(),
          payload: {
            agentId: notification.agentId
          }
        });
        setOpen(false);
        return;
      case "planning-question":
        harnessStore.setActiveSurface("chat");
        activateProjectThread(notification.projectId, notification.threadId);
        break;
      case "planning-question-batch":
        harnessStore.setActiveSurface("chat");
        activateProjectThread(notification.projectId, notification.threadId);
        break;
      case "browser-approval":
        harnessStore.setActiveSurface("chat");
        activateProjectThread(notification.projectId, notification.threadId);
        break;
      case "assistant-question":
        harnessStore.setActiveSurface("assistants");
        harnessStore.setSelectedAssistantId(notification.assistantId);
        break;
      case "assistant-question-batch":
        harnessStore.setActiveSurface("assistants");
        harnessStore.setSelectedAssistantId(notification.assistantId);
        break;
    }

    setExpandedId((current) => (current === notification.id ? undefined : notification.id));
  }

  function activateProjectThread(projectId: string, threadId: string) {
    activateProjectThreadFromInbox(state, projectId, threadId, sendCommand);
  }

  function handlePlanningChoice(notification: Extract<NotificationInboxItem, { kind: "planning-question" }>, content: string) {
    if (!content.trim()) {
      return;
    }

    sendCommand({
      type: "planning.answer",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        questionId: notification.questionId,
        content: content.trim()
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handlePlanningBatch(notification: Extract<NotificationInboxItem, { kind: "planning-question-batch" }>) {
    const answers = notification.questions.map((question) => ({
      questionId: question.questionId,
      content: (draftById()[batchDraftKey(notification.id, question.questionId)] ?? "").trim()
    }));
    if (answers.some((answer) => !answer.content)) {
      return;
    }

    sendCommand({
      type: "planning.answer-batch",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        answers
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleAssistantAnswer(notification: Extract<NotificationInboxItem, { kind: "assistant-question" }>, answerText?: string) {
    const content = (answerText ?? draftById()[notification.id])?.trim();
    if (!content) {
      return;
    }

    sendCommand({
      type: "assistant.question.answer",
      requestId: createRequestId(),
      payload: {
        assistantId: notification.assistantId,
        questionId: notification.questionId,
        content
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleAssistantJobBootstrap(notification: Extract<NotificationInboxItem, { kind: "assistant-question" }>, accepted: boolean) {
    if (!accepted) {
      handleAssistantAnswer(notification, "Not now.");
      return;
    }
    const command = createAssistantJobBootstrapCommandFromInbox(harnessStore.state, notification);
    if (!command) {
      return;
    }
    sendCommand(command);
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleAssistantBatch(notification: Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>) {
    const answers = notification.questions.map((question) => ({
      questionId: question.questionId,
      content: (draftById()[batchDraftKey(notification.id, question.questionId)] ?? "").trim()
    }));
    if (answers.some((answer) => !answer.content)) {
      return;
    }

    sendCommand({
      type: "assistant.question.answer-batch",
      requestId: createRequestId(),
      payload: {
        assistantId: notification.assistantId,
        answers
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleBrowserApproval(
    notification: Extract<NotificationInboxItem, { kind: "browser-approval" }>,
    approved: boolean
  ) {
    sendCommand({
      type: "browser.approval.resolve",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        sessionId: notification.sessionId,
        toolCallId: notification.toolCallId,
        approved
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  return (
    <Popover
      open={open()}
      onClose={() => {
        setOpen(false);
        setExpandedId(undefined);
      }}
      contentClass="w-[min(32rem,calc(100vw-2rem))] p-0"
      content={
        <div class="flex max-h-[28rem] flex-col">
          <div class="flex items-center justify-between gap-2 border-b border-(--border) px-3 py-3">
            <div class="text-[0.675rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">Notifications</div>
            <ActionButton
              tooltip="Mark all passive notifications as read"
              icon={<CheckCheck class="h-4 w-4" />}
              size="icon"
              variant="ghost"
              ariaLabel="Mark all passive notifications as read"
              onClick={() =>
                sendCommand({
                  type: "notifications.mark-all-read",
                  requestId: createRequestId()
                })
              }
            />
          </div>
          <div class="flex min-h-0 flex-col gap-2 overflow-y-auto px-3 py-3">
            <Show
              when={items().length > 0}
              fallback={<div class="rounded-2xl border border-dashed border-(--border) px-4 py-6 text-[0.675rem] text-(--muted)">Inbox empty.</div>}
            >
              <For each={items()}>
                {(notification) => (
                  <div
                    class="rounded-[1.1rem] border border-(--border) bg-white/70 p-3"
                    onClick={(event) => {
                      if (notification.kind === "background-run-status" && event.target === event.currentTarget) {
                        openItem(notification);
                      }
                    }}
                  >
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                      onClick={() => openItem(notification)}
                    >
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                          <NotificationKindIcon notification={notification} />
                          <span>{notification.kind.replaceAll("-", " ")}</span>
                          <Show when={!notification.readAt}>
                            <span class="rounded-full bg-rose-600 px-2 py-0.5 text-[0.52rem] text-white">Unread</span>
                          </Show>
                        </div>
                        <div class="text-[0.75rem] text-(--foreground)">{notificationTitle(notification)}</div>
                        <Show when={notificationSummary(notification)}>
                          {(summary) => <div class="text-[0.675rem] leading-5 text-(--muted)">{summary()}</div>}
                        </Show>
                      </div>
                    </button>
                    <Show when={expandedId() === notification.id && notification.interactive}>
                      <div class="mt-3 flex flex-col gap-3 border-t border-(--border) pt-3">
                        <Switch>
                          <Match when={notification.kind === "planning-question"}>
                            <div class="grid gap-2">
                              <For each={(notification as Extract<NotificationInboxItem, { kind: "planning-question" }>).choices}>
                                {(choice) => (
                                  <ActionButton
                                    tooltip={choice.description}
                                    icon={choice.recommended ? <Check class="h-3.5 w-3.5" /> : undefined}
                                    variant={choice.recommended ? "default" : "secondary"}
                                    class="justify-start"
                                    onClick={() =>
                                      handlePlanningChoice(
                                        notification as Extract<NotificationInboxItem, { kind: "planning-question" }>,
                                        choice.answerText
                                      )
                                    }
                                  >
                                    {choice.label}
                                  </ActionButton>
                                )}
                              </For>
                              <Textarea
                                rows="3"
                                value={draftById()[notification.id] ?? ""}
                                placeholder={(notification as Extract<NotificationInboxItem, { kind: "planning-question" }>).placeholder ?? "Type answer"}
                                onKeyDown={submitOnEnter(() =>
                                  handlePlanningChoice(
                                    notification as Extract<NotificationInboxItem, { kind: "planning-question" }>,
                                    draftById()[notification.id]?.trim() ?? ""
                                  )
                                )}
                                onInput={(event) =>
                                  setDraftById((current) => ({ ...current, [notification.id]: event.currentTarget.value }))
                                }
                              />
                              <ActionButton
                                tooltip="Send custom planning answer"
                                icon={<SendHorizontal class="h-4 w-4" />}
                                onClick={() =>
                                  handlePlanningChoice(
                                    notification as Extract<NotificationInboxItem, { kind: "planning-question" }>,
                                    draftById()[notification.id]!.trim()
                                  )
                                }
                              >
                                Send answer
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "planning-question-batch"}>
                            <div class="grid gap-3">
                              <For each={(notification as Extract<NotificationInboxItem, { kind: "planning-question-batch" }>).questions}>
                                {(question) => (
                                  <div class="rounded-xl border border-(--border) bg-white/70 p-3">
                                    <div class="mb-2 text-[0.75rem] font-semibold text-(--foreground)">{question.prompt}</div>
                                    <Textarea
                                      rows="3"
                                      value={draftById()[batchDraftKey(notification.id, question.questionId)] ?? ""}
                                      placeholder={question.placeholder ?? "Answer this question"}
                                      onInput={(event) =>
                                        setDraftById((current) => ({
                                          ...current,
                                          [batchDraftKey(notification.id, question.questionId)]: event.currentTarget.value
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                              </For>
                              <ActionButton
                                tooltip="Send all planning answers"
                                icon={<SendHorizontal class="h-4 w-4" />}
                                onClick={() =>
                                  handlePlanningBatch(notification as Extract<NotificationInboxItem, { kind: "planning-question-batch" }>)
                                }
                              >
                                Send all answers
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "assistant-question"}>
                            <div class="flex flex-col gap-3">
                              <Show
                                when={(notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>).questionId.startsWith(ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX)}
                                fallback={
                                  <div class="grid gap-2">
                                    <For each={getAssistantQuestionDefaultChoices()}>
                                      {(choice) => (
                                        <ActionButton
                                          tooltip={choice.description}
                                          icon={choice.recommended ? <Check class="h-3.5 w-3.5" /> : undefined}
                                          variant={choice.recommended ? "default" : "secondary"}
                                          class="justify-start"
                                          onClick={() =>
                                            handleAssistantAnswer(
                                              notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>,
                                              choice.answerText
                                            )
                                          }
                                        >
                                          {choice.label}
                                        </ActionButton>
                                      )}
                                    </For>
                                  </div>
                                }
                              >
                                <div class="grid gap-2">
                                  <ActionButton
                                    tooltip="Create research, todo maintenance, and implementation jobs"
                                    icon={<Check class="h-3.5 w-3.5" />}
                                    class="justify-start"
                                    disabled={!harnessStore.state.assistants.assistants.find((entry) => entry.id === (notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>).assistantId)?.projectId && !harnessStore.state.workspace.activeProjectId}
                                    disabledReason="Open a project first"
                                    onClick={() => handleAssistantJobBootstrap(notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>, true)}
                                  >
                                    Yes, create jobs
                                  </ActionButton>
                                  <ActionButton
                                    tooltip="Do not create default assistant jobs now"
                                    icon={<CircleX class="h-3.5 w-3.5" />}
                                    variant="secondary"
                                    class="justify-start"
                                    onClick={() => handleAssistantJobBootstrap(notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>, false)}
                                  >
                                    Not now
                                  </ActionButton>
                                </div>
                              </Show>
                              <Textarea
                                rows="3"
                                value={draftById()[notification.id] ?? ""}
                                placeholder="Answer this question"
                                onKeyDown={submitOnEnter(() =>
                                  handleAssistantAnswer(
                                    notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>
                                  )
                                )}
                                onInput={(event) =>
                                  setDraftById((current) => ({ ...current, [notification.id]: event.currentTarget.value }))
                                }
                              />
                              <ActionButton
                                tooltip="Send answer to assistant"
                                icon={<SendHorizontal class="h-4 w-4" />}
                                onClick={() =>
                                  handleAssistantAnswer(
                                    notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>
                                  )
                                }
                              >
                                Send answer
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "assistant-question-batch"}>
                            <div class="grid gap-3">
                              <For each={(notification as Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>).questions}>
                                {(question) => (
                                  <div class="rounded-xl border border-(--border) bg-white/70 p-3">
                                    <div class="mb-2 text-[0.75rem] font-semibold text-(--foreground)">{question.prompt}</div>
                                    <Textarea
                                      rows="3"
                                      value={draftById()[batchDraftKey(notification.id, question.questionId)] ?? ""}
                                      placeholder="Answer this question"
                                      onInput={(event) =>
                                        setDraftById((current) => ({
                                          ...current,
                                          [batchDraftKey(notification.id, question.questionId)]: event.currentTarget.value
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                              </For>
                              <ActionButton
                                tooltip="Send all assistant answers"
                                icon={<SendHorizontal class="h-4 w-4" />}
                                onClick={() =>
                                  handleAssistantBatch(notification as Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>)
                                }
                              >
                                Send all answers
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "browser-approval"}>
                            <div class="flex flex-wrap gap-2">
                              <ActionButton
                                tooltip="Approve this browser action"
                                icon={<Check class="h-4 w-4" />}
                                onClick={() =>
                                  handleBrowserApproval(
                                    notification as Extract<NotificationInboxItem, { kind: "browser-approval" }>,
                                    true
                                  )
                                }
                              >
                                Approve
                              </ActionButton>
                              <ActionButton
                                tooltip="Reject this browser action"
                                icon={<CircleX class="h-4 w-4" />}
                                variant="secondary"
                                onClick={() =>
                                  handleBrowserApproval(
                                    notification as Extract<NotificationInboxItem, { kind: "browser-approval" }>,
                                    false
                                  )
                                }
                              >
                                Reject
                              </ActionButton>
                            </div>
                          </Match>
                        </Switch>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      }
    >
      <ActionButton
        tooltip="Open notification inbox"
        icon={<Bell class="h-4 w-4" />}
        variant="secondary"
        size="icon"
        ariaLabel="Open notification inbox"
        onClick={() => setOpen((value) => !value)}
      />
      <Show when={unreadCount() > 0}>
        <div class="pointer-events-none absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[0.6rem] font-semibold text-white">
          {unreadCount() > 99 ? "99+" : unreadCount()}
        </div>
      </Show>
    </Popover>
  );
}

function notificationTitle(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status":
      return notification.title;
    case "planning-question":
      return notification.prompt;
    case "planning-question-batch":
      return `${notification.questions.length} planning questions`;
    case "assistant-question":
      return notification.prompt;
    case "assistant-question-batch":
      return `${notification.questions.length} assistant questions`;
    case "browser-approval":
      return notification.label;
    case "cli-update":
      return `${notification.label} update available`;
  }
}

function notificationSummary(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status":
      return notification.summary;
    case "planning-question":
      return notification.placeholder;
    case "planning-question-batch":
      return notification.questions.map((question) => question.prompt).join(" ");
    case "assistant-question":
      return notification.answerText;
    case "assistant-question-batch":
      return notification.questions.map((question) => question.prompt).join(" ");
    case "browser-approval":
      return notification.inputSummary;
    case "cli-update":
      return `${notification.currentVersion} -> ${notification.latestVersion}. Click to update.`;
  }
}

function batchDraftKey(notificationId: string, questionId: string) {
  return `${notificationId}:${questionId}`;
}

function NotificationKindIcon(props: { notification: NotificationInboxItem }) {
  return (
    <Switch>
      <Match when={props.notification.kind === "assistant-question" || props.notification.kind === "assistant-question-batch"}>
        <Bot class="h-3.5 w-3.5" />
      </Match>
      <Match when={props.notification.kind === "background-run-status"}>
        <LoaderCircle class="h-3.5 w-3.5" />
      </Match>
      <Match when={props.notification.kind === "cli-update"}>
        <Download class="h-3.5 w-3.5" />
      </Match>
      <Match when={props.notification.kind === "browser-approval"}>
        <CircleAlert class="h-3.5 w-3.5" />
      </Match>
      <Match when={props.notification.kind === "planning-question" || props.notification.kind === "planning-question-batch"}>
        <SendHorizontal class="h-3.5 w-3.5" />
      </Match>
    </Switch>
  );
}
