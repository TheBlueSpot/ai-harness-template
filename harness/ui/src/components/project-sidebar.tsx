import { For, Show, createMemo, createSignal } from "solid-js";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  createSortable,
  transformStyle,
  type DragEventHandler
} from "@thisbeyond/solid-dnd";
import { createRequestId } from "../../../shared/protocol";
import {
  getActiveProject,
  harnessStore,
  type ProjectSidebarGrouping,
  type ProjectSidebarProjectSort,
  type ProjectSidebarThreadSort
} from "../harness-store";
import { truncateMiddle } from "../lib/utils";
import { useHarnessStore } from "../store-providers";
import { ActionButton } from "./action-button";
import { Input } from "./primitives/input";
import { Button } from "./primitives/button";
import { Popover } from "./primitives/popover";
import { ScrollArea } from "./primitives/scroll-area";
import { Separator } from "./primitives/separator";
import { Tooltip } from "./primitives/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, CircleHelp, Edit3, Folder, GripVertical, GitFork, Plus, Trash2 } from "lucide-solid";

type ProjectSidebarProps = {
  compact?: boolean;
  onNavigate?: () => void;
};

export function ProjectSidebar(props: ProjectSidebarProps) {
  const store = useHarnessStore();
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const [sortMenuOpen, setSortMenuOpen] = createSignal(false);
  const projectCards = createMemo(() => {
    const preferences = state.projectSidebarPreferences;
    const manualOrder = new Map(preferences.manualProjectOrder.map((projectId, index) => [projectId, index]));
    const cards = state.workspace.projects.map((project, workspaceIndex) => ({
      id: project.id,
      name: project.name,
      rootPath: project.rootPath,
      workspaceIndex,
      isStreaming: project.session.isStreaming,
      hasWorkingThread: project.threads.some((thread) => thread.badgeState === "planning" || thread.badgeState === "executing"),
      hasCliSession: Boolean(project.activeCliSession),
      isActive: project.id === state.workspace.activeProjectId,
      activeThreadId: project.activeThreadId,
      threadCount: project.threads.filter((thread) => thread.kind === "user").length,
      updatedAt: project.threads.reduce((latest, thread) => maxIso(latest, thread.updatedAt), project.session.messages.at(-1)?.createdAt),
      createdAt: getEarliestIso(project.threads.map((thread) => thread.createdAt ?? thread.updatedAt)),
      lastUserMessageAt: getLatestIso(project.threads.map((thread) => thread.lastUserMessageAt)),
      threads: sortThreads(
        project.threads
          .filter((thread) => thread.kind === "user")
          .map((thread) => ({
            id: thread.id,
            title: thread.title,
            lastMessagePreview: thread.lastMessagePreview,
            badgeState: thread.badgeState,
            messageCount: thread.messageCount,
            createdAt: thread.createdAt ?? thread.updatedAt,
            updatedAt: thread.updatedAt,
            lastUserMessageAt: thread.lastUserMessageAt
          })),
        preferences.threadSort
      )
    }));
    return [...cards].sort((left, right) => compareProjects(left, right, preferences.projectSort, manualOrder));
  });
  const projectGroups = createMemo(() => groupProjectCards(projectCards(), state.projectSidebarPreferences.grouping));
  const visibleProjectIds = createMemo(() => projectCards().map((project) => project.id));
  const manualSortActive = () => state.projectSidebarPreferences.projectSort === "manual";
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

  function setProjectSort(projectSort: ProjectSidebarProjectSort) {
    store.setProjectSidebarPreferences({ projectSort });
    setSortMenuOpen(false);
  }

  function setThreadSort(threadSort: ProjectSidebarThreadSort) {
    store.setProjectSidebarPreferences({ threadSort });
    setSortMenuOpen(false);
  }

  function setGrouping(grouping: ProjectSidebarGrouping) {
    store.setProjectSidebarPreferences({ grouping });
    setSortMenuOpen(false);
  }

  function persistManualOrder(nextVisibleOrder: string[]) {
    const visible = new Set(nextVisibleOrder);
    store.setProjectSidebarPreferences({
      manualProjectOrder: [
        ...nextVisibleOrder,
        ...state.projectSidebarPreferences.manualProjectOrder.filter((projectId) => !visible.has(projectId))
      ]
    });
  }

  const handleProjectDragEnd: DragEventHandler = ({ draggable, droppable }) => {
    if (!manualSortActive() || !droppable || draggable.id === droppable.id) {
      return;
    }

    const ids = visibleProjectIds();
    const fromIndex = ids.indexOf(String(draggable.id));
    const toIndex = ids.indexOf(String(droppable.id));
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    persistManualOrder(moveId(ids, fromIndex, toIndex));
  };

  function moveProject(projectId: string, direction: -1 | 1) {
    const ids = visibleProjectIds();
    const fromIndex = ids.indexOf(projectId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) {
      return;
    }

    persistManualOrder(moveId(ids, fromIndex, toIndex));
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
            <Popover
              open={sortMenuOpen()}
              onClose={() => setSortMenuOpen(false)}
              align="end"
              side="bottom"
              contentClass="w-60 rounded-[1rem] p-2"
              content={
                <SortMenu
                  projectSort={state.projectSidebarPreferences.projectSort}
                  threadSort={state.projectSidebarPreferences.threadSort}
                  grouping={state.projectSidebarPreferences.grouping}
                  onProjectSort={setProjectSort}
                  onThreadSort={setThreadSort}
                  onGrouping={setGrouping}
                />
              }
            >
              <Tooltip content="Sort and group projects">
                <Button
                  aria-label="Sort projects"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setSortMenuOpen((current) => !current);
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) {
                      setSortMenuOpen((current) => !current);
                    }
                  }}
                >
                  <ArrowUpDown class="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            </Popover>
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
          <DragDropProvider onDragEnd={handleProjectDragEnd}>
            <DragDropSensors />
            <SortableProvider ids={visibleProjectIds()}>
              <div class="space-y-3">
                <For each={projectGroups()}>
                  {(group) => (
                    <div class="space-y-2">
                      <Show when={group.label}>
                        {(label) => (
                          <div class="px-1 text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                            {label()}
                          </div>
                        )}
                      </Show>
                      <For each={group.projects}>
                        {(project) => {
                          const isActiveProject = () => project.isActive;
                          const removeDisabledReason = () =>
                            project.hasWorkingThread
                              ? "Project is streaming"
                              : project.hasCliSession
                                ? "Live CLI session attached"
                                : undefined;

                          return (
                            <SortableProjectCard projectId={project.id} enabled={manualSortActive()}>
                              {(sortable) => (
                                <section
                                  class={`rounded-[1.4rem] border p-3 transition ${sortable.isDragging ? "opacity-80 shadow-lg" : ""} ${isActiveProject()
                                    ? "border-(--accent) bg-[linear-gradient(135deg,rgba(15,118,110,0.18),rgba(255,255,255,0.9))] shadow-md"
                                    : "border-(--border) bg-white/55"
                                    }`}
                                  ref={sortable.ref}
                                  style={sortable.style}
                                >
                                  <div class="flex min-w-0 items-start gap-1.5">
                                    <Show when={manualSortActive()}>
                                      <button
                                        type="button"
                                        class="inline-flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-lg text-(--muted) transition hover:bg-black/5 active:cursor-grabbing"
                                        aria-label={`Drag ${project.name}`}
                                        {...sortable.dragActivators}
                                      >
                                        <GripVertical class="h-3.5 w-3.5" />
                                      </button>
                                    </Show>
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
                                        <div class="flex flex-wrap gap-0.5 text-[0.585rem] text-(--muted)">
                                          <span>{project.threadCount} threads</span>
                                          {project.isStreaming ? <span>streaming</span> : null}
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
                                    <Show when={manualSortActive()}>
                                      <ActionButton
                                        tooltip={`Move ${project.name} up`}
                                        disabledReason="Already first project"
                                        disabled={visibleProjectIds().indexOf(project.id) === 0}
                                        icon={<ArrowUp class="h-3 w-3" />}
                                        variant="ghost"
                                        size="icon"
                                        class="h-6 w-6 rounded-lg"
                                        ariaLabel={`Move ${project.name} up`}
                                        onClick={() => moveProject(project.id, -1)}
                                      />
                                      <ActionButton
                                        tooltip={`Move ${project.name} down`}
                                        disabledReason="Already last project"
                                        disabled={visibleProjectIds().indexOf(project.id) === visibleProjectIds().length - 1}
                                        icon={<ArrowDown class="h-3 w-3" />}
                                        variant="ghost"
                                        size="icon"
                                        class="h-6 w-6 rounded-lg"
                                        ariaLabel={`Move ${project.name} down`}
                                        onClick={() => moveProject(project.id, 1)}
                                      />
                                    </Show>
                                  </div>

                                  <div class="mt-2 space-y-1.5">
                                    <For each={project.threads}>
                                      {(thread) => {
                                        const isActiveThread = () => project.activeThreadId === thread.id;
                                        const isEditing = () => editingThreadId() === thread.id;

                                        return (
                                          <div
                                            class={`rounded-2xl border px-3 py-2 ${isActiveThread() ? "border-teal-500/50 bg-white/80" : "border-(--border) bg-white/60"}`}
                                          >
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
                                                      <span
                                                        class={`rounded-full px-2 py-0.5 text-[0.46rem] normal-case tracking-normal ${badgeClass(thread.badgeState)}`}
                                                      >
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
                              )}
                            </SortableProjectCard>
                          );
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </SortableProvider>
          </DragDropProvider>
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

type ProjectCard = {
  id: string;
  name: string;
  rootPath: string;
  workspaceIndex: number;
  isStreaming: boolean;
  hasWorkingThread: boolean;
  hasCliSession: boolean;
  isActive: boolean;
  activeThreadId: string;
  threadCount: number;
  updatedAt?: string;
  createdAt?: string;
  lastUserMessageAt?: string;
  threads: Array<{
    id: string;
    title: string;
    lastMessagePreview?: string;
    badgeState: string;
    messageCount: number;
    createdAt?: string;
    updatedAt?: string;
    lastUserMessageAt?: string;
  }>;
};

function SortMenu(props: {
  projectSort: ProjectSidebarProjectSort;
  threadSort: ProjectSidebarThreadSort;
  grouping: ProjectSidebarGrouping;
  onProjectSort: (value: ProjectSidebarProjectSort) => void;
  onThreadSort: (value: ProjectSidebarThreadSort) => void;
  onGrouping: (value: ProjectSidebarGrouping) => void;
}) {
  return (
    <div class="flex flex-col gap-1 text-[0.675rem]">
      <MenuSection label="Sort projects" />
      <MenuOption
        selected={props.projectSort === "last-user-message"}
        label="Last user message"
        onClick={() => props.onProjectSort("last-user-message")}
      />
      <MenuOption selected={props.projectSort === "created-at"} label="Created at" onClick={() => props.onProjectSort("created-at")} />
      <MenuOption selected={props.projectSort === "manual"} label="Manual" onClick={() => props.onProjectSort("manual")} />
      <MenuSection label="Sort threads" class="mt-3" />
      <MenuOption
        selected={props.threadSort === "last-user-message"}
        label="Last user message"
        onClick={() => props.onThreadSort("last-user-message")}
      />
      <MenuOption selected={props.threadSort === "created-at"} label="Created at" onClick={() => props.onThreadSort("created-at")} />
      <Separator class="my-2" />
      <MenuSection label="Group projects" />
      <MenuOption
        selected={props.grouping === "repository"}
        label="Group by repository"
        onClick={() => props.onGrouping("repository")}
      />
      <MenuOption
        selected={props.grouping === "repository-path"}
        label="Group by repository path"
        onClick={() => props.onGrouping("repository-path")}
      />
      <MenuOption selected={props.grouping === "separate"} label="Keep separate" onClick={() => props.onGrouping("separate")} />
    </div>
  );
}

function MenuSection(props: { label: string; class?: string }) {
  return <div class={`px-2 py-1 text-[0.625rem] font-semibold text-(--muted) ${props.class ?? ""}`}>{props.label}</div>;
}

function MenuOption(props: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-left font-semibold text-(--foreground) transition hover:bg-black/5"
      onClick={props.onClick}
    >
      <span class="flex h-4 w-4 items-center justify-center">
        <Show when={props.selected}>
          <Check class="h-3.5 w-3.5" />
        </Show>
      </span>
      <span>{props.label}</span>
    </button>
  );
}

function SortableProjectCard(props: {
  projectId: string;
  enabled: boolean;
  children: (sortable: {
    ref: (element: HTMLElement | null) => void;
    style: ReturnType<typeof transformStyle>;
    dragActivators: ReturnType<typeof createSortable>["dragActivators"];
    isDragging: boolean;
  }) => any;
}) {
  const sortable = createSortable(props.projectId);
  return props.children({
    ref: sortable.ref,
    style: props.enabled ? transformStyle(sortable.transform) : {},
    dragActivators: sortable.dragActivators,
    isDragging: sortable.isActiveDraggable
  });
}

function sortThreads<T extends { title: string; createdAt?: string; updatedAt?: string; lastUserMessageAt?: string }>(
  threads: T[],
  sort: ProjectSidebarThreadSort
) {
  return [...threads].sort((left, right) => {
    if (sort === "created-at") {
      return compareIsoAsc(left.createdAt ?? left.updatedAt, right.createdAt ?? right.updatedAt) || left.title.localeCompare(right.title);
    }

    return (
      compareIsoDesc(left.lastUserMessageAt ?? left.updatedAt, right.lastUserMessageAt ?? right.updatedAt) ||
      left.title.localeCompare(right.title)
    );
  });
}

function compareProjects(
  left: ProjectCard,
  right: ProjectCard,
  sort: ProjectSidebarProjectSort,
  manualOrder: Map<string, number>
) {
  if (sort === "manual") {
    return (
      (manualOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (manualOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
      left.workspaceIndex - right.workspaceIndex
    );
  }

  if (sort === "created-at") {
    return (
      compareIsoAsc(left.createdAt ?? left.updatedAt, right.createdAt ?? right.updatedAt) ||
      left.name.localeCompare(right.name) ||
      left.rootPath.localeCompare(right.rootPath)
    );
  }

  return (
    compareIsoDesc(left.lastUserMessageAt ?? left.updatedAt, right.lastUserMessageAt ?? right.updatedAt) ||
    left.name.localeCompare(right.name) ||
    left.rootPath.localeCompare(right.rootPath)
  );
}

function groupProjectCards(projects: ProjectCard[], grouping: ProjectSidebarGrouping) {
  if (grouping === "separate") {
    return [{ key: "all", label: undefined, projects }];
  }

  const groups: Array<{ key: string; label: string; projects: ProjectCard[] }> = [];
  for (const project of projects) {
    const key = grouping === "repository" ? getPathBasename(project.rootPath) : getParentPath(project.rootPath);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.projects.push(project);
    } else {
      groups.push({
        key,
        label: key || "Workspace root",
        projects: [project]
      });
    }
  }

  return groups;
}

function getLatestIso(values: Array<string | undefined>) {
  return values.reduce<string | undefined>((latest, value) => maxIso(latest, value), undefined);
}

function getEarliestIso(values: Array<string | undefined>) {
  return values.reduce<string | undefined>((earliest, value) => {
    if (!value) {
      return earliest;
    }
    if (!earliest) {
      return value;
    }
    return value.localeCompare(earliest) < 0 ? value : earliest;
  }, undefined);
}

function maxIso(left?: string, right?: string) {
  if (!right) {
    return left;
  }
  if (!left) {
    return right;
  }
  return right.localeCompare(left) > 0 ? right : left;
}

function compareIsoAsc(left?: string, right?: string) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function compareIsoDesc(left?: string, right?: string) {
  return compareIsoAsc(right, left);
}

function getPathBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function getParentPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) {
    return path;
  }

  const prefix = /^[A-Za-z]:/.test(parts[0] ?? "") ? `${parts[0]}\\` : path.startsWith("\\\\") ? "\\\\" : "";
  const parentParts = /^[A-Za-z]:/.test(parts[0] ?? "") ? parts.slice(1, -1) : parts.slice(0, -1);
  return parentParts.length > 0 ? `${prefix}${parentParts.join("\\")}` : prefix || parts[0] || path;
}

function moveId(ids: string[], fromIndex: number, toIndex: number) {
  const nextIds = [...ids];
  const [moved] = nextIds.splice(fromIndex, 1);
  if (!moved) {
    return ids;
  }
  nextIds.splice(toIndex, 0, moved);
  return nextIds;
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
