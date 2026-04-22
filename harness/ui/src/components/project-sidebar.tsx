import { For, Show, createSignal } from "solid-js";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import { createRequestId } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { truncateMiddle } from "../lib/utils";
import { ActionButton } from "./action-button";
import { Input } from "./primitives/input";
import { ScrollArea } from "./primitives/scroll-area";
import { Tooltip } from "./primitives/tooltip";
import { CircleHelp, Edit3, Folder, GitFork, Plus, Trash2 } from "lucide-solid";

type ProjectSidebarProps = {
  compact?: boolean;
  onNavigate?: () => void;
};

export function ProjectSidebar(props: ProjectSidebarProps) {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const [editingThreadId, setEditingThreadId] = createSignal<string>();
  const [threadTitleDraft, setThreadTitleDraft] = createSignal("");

  function handleActivateProject(projectId: string) {
    if (projectId === state.workspace.activeProjectId) {
      return;
    }

    sendCommand({
      type: "project.activate",
      requestId: createRequestId(),
      payload: { projectId }
    });
    props.onNavigate?.();
  }

  function handleActivateThread(projectId: string, threadId: string) {
    sendCommand({
      type: "thread.activate",
      requestId: createRequestId(),
      payload: { projectId, threadId }
    });
    props.onNavigate?.();
  }

  function handleCreateThread(projectId: string) {
    sendCommand({
      type: "thread.create",
      requestId: createRequestId(),
      payload: { projectId }
    });
  }

  function handleForkThread(projectId: string, sourceThreadId: string) {
    sendCommand({
      type: "thread.fork",
      requestId: createRequestId(),
      payload: { projectId, sourceThreadId }
    });
  }

  function handleRemoveProject(projectId: string) {
    sendCommand({
      type: "project.remove",
      requestId: createRequestId(),
      payload: { projectId }
    });
  }

  function startRename(threadId: string, title: string) {
    setEditingThreadId(threadId);
    setThreadTitleDraft(title);
  }

  function commitRename(projectId: string, threadId: string) {
    const title = threadTitleDraft().trim();
    if (!title) {
      setEditingThreadId(undefined);
      return;
    }

    sendCommand({
      type: "thread.rename",
      requestId: createRequestId(),
      payload: { projectId, threadId, title }
    });
    setEditingThreadId(undefined);
  }

  return (
    <div data-test-project-sidebar="" class="panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0 p-[0.8rem]">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-[0.585rem] font-semibold tracking-[0.2em] text-(--muted)">
          <span>Projects</span>
          <Tooltip content="Each project root keeps its own selectable threads, local chat history, and project-scoped execution context.">
            <span class="inline-flex">
              <CircleHelp class="h-3.5 w-3.5 text-(--muted)" aria-label="Projects help" />
            </span>
          </Tooltip>
          <div class="ml-auto flex items-center">
            <ActionButton
              tooltip={`Open project switcher (${formatForDisplay("Mod+Space")} or ${formatForDisplay("Mod+K")})`}
              icon={<Plus class="h-3.5 w-3.5" />}
              variant="ghost"
              size="icon"
              ariaLabel="Open project switcher"
              onClick={() => harnessStore.openProjectSwitcher()}
            />
          </div>
        </div>
      </div>

      <ScrollArea class="flex-1 min-h-0 pr-1">
        <Show
          when={state.workspace.projects.length > 0}
          fallback={
            <div class="rounded-3xl border border-dashed border-(--border) bg-white/40 p-5 text-[0.675rem] leading-5 text-(--muted)">
              No workspace roots yet. Open project switcher or browse folder to start isolated project threads.
            </div>
          }
        >
          <div class="space-y-3">
            <For each={state.workspace.projects}>
              {(project) => {
                const visibleThreads = () => project.threads.filter((thread) => thread.kind === "user");
                const isActiveProject = () => project.id === state.workspace.activeProjectId;
                const removeDisabledReason = () =>
                  project.session.isStreaming
                    ? "Project is streaming"
                    : project.activeCliSession
                      ? "Live CLI session attached"
                      : undefined;

                return (
                  <section
                    class={`rounded-[1.4rem] border p-3 transition ${isActiveProject()
                      ? "border-(--accent) bg-[linear-gradient(135deg,rgba(15,118,110,0.18),rgba(255,255,255,0.9))] shadow-md"
                      : "border-(--border) bg-white/55"
                      }`}
                  >
                    <div class="flex min-w-0 items-start gap-1.5">
                      <ActionButton
                        tooltip={isActiveProject() ? `${project.name} is active` : `Switch to ${project.name}`}
                        disabledReason="Project already active"
                        disabled={isActiveProject()}
                        icon={<Folder class="h-3.5 w-3.5 shrink-0" />}
                        variant={isActiveProject() ? "secondary" : "ghost"}
                        class="flex min-h-8 w-full min-w-0 justify-start rounded-xl px-2 py-1.5 gap-0"
                        wrapperClass="flex min-w-0 flex-1"
                        onClick={() => handleActivateProject(project.id)}
                      >
                        <div class="min-w-0 flex-1 text-left">
                          <div class="truncate text-[0.675rem] font-semibold text-(--foreground)">{project.name}</div>
                          <div class="truncate text-[0.585rem] text-(--muted)">
                            {truncateMiddle(project.rootPath, props.compact ? 24 : 30)}
                          </div>
                          <div class="flex flex-wrap text-[0.585rem] text-(--muted) gap-0.5">
                            <span>{visibleThreads().length} threads</span>
                            {project.session.isStreaming ? <span>streaming</span> : null}
                            {isActiveProject() ? <span>active</span> : null}
                          </div>
                        </div>
                      </ActionButton>

                      <ActionButton
                        tooltip="Create a new thread in this project"
                        icon={<Plus class="h-3 w-3" />}
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 rounded-lg"
                        ariaLabel={`Create a new thread in ${project.name}`}
                        onClick={() => handleCreateThread(project.id)}
                      />

                      <ActionButton
                        tooltip={`Remove ${project.name}`}
                        disabledReason={removeDisabledReason()}
                        disabled={Boolean(removeDisabledReason())}
                        icon={<Trash2 class="h-3 w-3" />}
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 rounded-lg"
                        ariaLabel={`Remove ${project.name}`}
                        onClick={() => handleRemoveProject(project.id)}
                      />
                    </div>

                    <div class="mt-2 space-y-1.5">
                      <For each={visibleThreads()}>
                        {(thread) => {
                          const isActiveThread = () => project.activeThreadId === thread.id;
                          const isEditing = () => editingThreadId() === thread.id;
                          const badgeStyle = badgeClass(thread.badgeState);
                          return (
                            <div class={`rounded-2xl border px-3 py-2 ${isActiveThread() ? "border-teal-500/50 bg-white/80" : "border-(--border) bg-white/60"}`}>
                              <div class="flex min-w-0 items-start justify-between gap-1.5">
                                <button
                                  class="flex min-w-0 flex-1 cursor-pointer flex-col text-left disabled:cursor-not-allowed"
                                  disabled={isActiveThread()}
                                  onClick={() => handleActivateThread(project.id, thread.id)}
                                >
                                  <Show
                                    when={isEditing()}
                                    fallback={
                                      <Tooltip content={thread.title} triggerClass="block min-w-0 w-full">
                                        <div class="truncate text-[0.675rem] font-semibold text-(--foreground)">
                                          {thread.title}
                                        </div>
                                      </Tooltip>
                                    }
                                  >
                                    <Input
                                      value={threadTitleDraft()}
                                      onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
                                        setThreadTitleDraft(event.currentTarget.value)
                                      }
                                      onBlur={() => commitRename(project.id, thread.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          commitRename(project.id, thread.id);
                                        }
                                        if (event.key === "Escape") {
                                          setEditingThreadId(undefined);
                                        }
                                      }}
                                    />
                                  </Show>
                                  <div class="mt-1 flex w-full min-w-0 items-center justify-between gap-2 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
                                    <Show when={thread.lastMessagePreview}>
                                      <Tooltip content={thread.lastMessagePreview} triggerClass="flex min-w-0 flex-1">
                                        <span class="min-w-0 flex-1 truncate normal-case text-[0.625rem] tracking-normal">
                                          {thread.lastMessagePreview}
                                        </span>
                                      </Tooltip>
                                    </Show>
                                    <div class="flex shrink-0 items-center gap-2">
                                      <Show when={thread.badgeState !== "idle"}>
                                        <span class={`rounded-full px-2 py-0.5 text-[0.46rem] normal-case tracking-normal ${badgeStyle}`}>
                                          {badgeLabel(thread.badgeState)}
                                        </span>
                                      </Show>
                                      <span>{thread.messageCount} msgs</span>
                                    </div>
                                  </div>
                                </button>

                                <div class="flex shrink-0 gap-0.5">
                                  <ActionButton
                                    tooltip="Fork this thread"
                                    icon={<GitFork class="h-3 w-3" />}
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 rounded-lg"
                                    ariaLabel={`Fork ${thread.title}`}
                                    onClick={() => handleForkThread(project.id, thread.id)}
                                  />
                                  <ActionButton
                                    tooltip="Rename this thread"
                                    icon={<Edit3 class="h-3 w-3" />}
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 rounded-lg"
                                    ariaLabel={`Rename ${thread.title}`}
                                    onClick={() => startRename(thread.id, thread.title)}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </section>
                );
              }}
            </For>
          </div>
        </Show>
      </ScrollArea>

      <Show when={activeProject()}>
        {(project) => (
          <div class="rounded-[1.35rem] border border-(--border) bg-white/45 px-4 py-3 text-[0.585rem] uppercase tracking-[0.16em] text-(--muted)">
            Active root
            <Tooltip content={project().rootPath} triggerClass="mt-2 block min-w-0 w-full">
              <div class="truncate font-mono text-[0.675rem] normal-case tracking-normal text-(--foreground)">
                {project().rootPath}
              </div>
            </Tooltip>
          </div>
        )}
      </Show>
    </div>
  );
}

function badgeLabel(value: string) {
  switch (value) {
    case "needs-input":
      return "User input";
    case "planning":
      return "Planning";
    case "executing":
      return "Executing";
    case "error":
      return "Error";
    case "done":
      return "Done";
    default:
      return "Idle";
  }
}

function badgeClass(value: string) {
  switch (value) {
    case "needs-input":
      return "bg-violet-600 text-white";
    case "planning":
      return "bg-orange-500 text-white";
    case "executing":
      return "bg-yellow-400 text-slate-900";
    case "error":
      return "bg-rose-600 text-white";
    case "done":
      return "bg-emerald-600 text-white";
    default:
      return "bg-slate-200 text-slate-800";
  }
}

