import { For, Show, createMemo, createSignal } from "solid-js";
import { Bolt, ChevronDown, ChevronRight, Square, TerminalSquare, X } from "lucide-solid";
import { cn } from "../lib/utils";
import { ActionButton } from "../components/action-button";
import { Input } from "../components/primitives/input";

export type TerminalTabItem = {
  id: string;
  name: string;
  status: string;
  renamable?: boolean;
  category?: "terminal" | "spawned";
};

export function TerminalTabs(props: {
  sessions: TerminalTabItem[];
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
  onRename: (sessionId: string, name: string) => void;
  onClose: (sessionId: string) => void;
}) {
  const [editingId, setEditingId] = createSignal<string>();
  const [draft, setDraft] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<"terminal" | "spawned", boolean>>({
    terminal: false,
    spawned: false
  });
  const groups = createMemo(() => [
    {
      id: "terminal" as const,
      title: "Terminals",
      subtitle: "user-created",
      sessions: props.sessions.filter((session) => (session.category ?? "terminal") === "terminal")
    },
    {
      id: "spawned" as const,
      title: "Spawned",
      subtitle: "agent/CLI-created",
      sessions: props.sessions.filter((session) => session.category === "spawned")
    }
  ]);

  const commit = (session: TerminalTabItem) => {
    const name = draft().trim();
    if (session.renamable !== false && name && name !== session.name) {
      props.onRename(session.id, name);
    }
    setEditingId(undefined);
  };

  const toggleGroup = (groupId: "terminal" | "spawned") => {
    setCollapsed((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <nav class="flex min-h-0 flex-1 flex-col gap-3" aria-label="Terminal sessions">
      <For each={groups()}>
        {(group) => (
          <section class="grid gap-1">
            <button
              type="button"
              class="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-(--terminal-hover)"
              aria-expanded={!collapsed()[group.id]}
              aria-label={`${collapsed()[group.id] ? "Expand" : "Collapse"} ${group.title} (${group.subtitle})`}
              onClick={() => toggleGroup(group.id)}
            >
              <Show when={collapsed()[group.id]} fallback={<ChevronDown class="h-3.5 w-3.5 text-(--terminal-muted)" />}>
                <ChevronRight class="h-3.5 w-3.5 text-(--terminal-muted)" />
              </Show>
              <span class="min-w-0">
                <span class="block truncate text-[0.78rem] font-semibold leading-4 text-(--terminal-foreground)">{group.title}</span>
                <span class="block truncate text-[0.64rem] leading-3 text-(--terminal-muted)">{group.subtitle}</span>
              </span>
            </button>
            <Show when={!collapsed()[group.id]}>
              <div class="grid gap-1 pl-5">
                <Show
                  when={group.sessions.length > 0}
                  fallback={<div class="rounded-md px-2 py-1.5 text-[0.68rem] text-(--terminal-muted)">No sessions</div>}
                >
                  <For each={group.sessions}>
                    {(session) => (
                      <div
                        class={cn(
                          "group flex min-h-9 min-w-0 items-center gap-1 rounded-md border border-transparent text-[0.74rem] transition",
                          props.activeSessionId === session.id
                            ? "bg-(--terminal-selection) text-(--terminal-foreground)"
                            : "text-(--terminal-muted) hover:bg-(--terminal-hover)"
                        )}
                      >
                        <Show
                          when={editingId() === session.id}
                          fallback={
                            <button
                              type="button"
                              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent px-2 py-1.5 text-left"
                              onClick={() => props.onSelect(session.id)}
                              onDblClick={() => {
                                if (session.renamable === false) {
                                  return;
                                }
                                setEditingId(session.id);
                                setDraft(session.name);
                              }}
                            >
                              <ActivityIcon category={session.category ?? "terminal"} status={session.status} />
                              <span class="min-w-0 flex-1">
                                <span class="block truncate font-medium text-(--terminal-foreground)">{session.name}</span>
                                <span class="block truncate text-[0.58rem] uppercase leading-3 tracking-[0.08em] text-(--terminal-muted)">{session.status}</span>
                              </span>
                              <TerminalStatusDot status={session.status} />
                            </button>
                          }
                        >
                          <div class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                            <ActivityIcon category={session.category ?? "terminal"} status={session.status} />
                            <Input
                              aria-label="Rename terminal"
                              class="h-6 min-w-0 flex-1 rounded-md border-(--terminal-border) bg-(--terminal-shell) px-1 py-0 text-[0.72rem] text-(--terminal-foreground)"
                              value={draft()}
                              onInput={(event) => setDraft(event.currentTarget.value)}
                              onBlur={() => commit(session)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  commit(session);
                                }
                                if (event.key === "Escape") {
                                  setEditingId(undefined);
                                }
                              }}
                            />
                          </div>
                        </Show>
                        <ActionButton
                          tooltip={`Close ${session.name}`}
                          ariaLabel={`Close ${session.name}`}
                          variant="ghost"
                          size="icon"
                          class="mr-1 h-6 w-6 shrink-0 rounded-md text-(--terminal-muted) opacity-0 hover:bg-(--terminal-hover) hover:text-(--terminal-foreground) group-hover:opacity-100"
                          icon={<X class="h-3 w-3" />}
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onClose(session.id);
                          }}
                        />
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </section>
        )}
      </For>
    </nav>
  );
}

function ActivityIcon(props: { category: "terminal" | "spawned"; status: string }) {
  const normalized = () => props.status.toLowerCase();
  const iconClass = () => {
    if (normalized() === "failed" || normalized() === "cancelled") {
      return "text-(--danger-strong)";
    }
    if (props.category === "spawned" && (normalized() === "running" || normalized() === "starting" || normalized() === "queued")) {
      return "text-(--warning-strong)";
    }
    if (props.category === "terminal" && normalized() === "running") {
      return "text-(--success-strong)";
    }
    return "text-(--terminal-muted)";
  };

  return (
    <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <Show when={props.category === "spawned"} fallback={<TerminalSquare class={cn("h-3.5 w-3.5", iconClass())} />}>
        <Show when={normalized() === "failed" || normalized() === "cancelled"} fallback={<Bolt class={cn("h-3.5 w-3.5", iconClass())} />}>
          <Square class={cn("h-3.5 w-3.5 fill-current", iconClass())} />
        </Show>
      </Show>
    </span>
  );
}

function TerminalStatusDot(props: { status: string }) {
  const normalized = () => props.status.toLowerCase();
  const dotClass = () => {
    if (normalized() === "running" || normalized() === "succeeded") {
      return "bg-(--success-strong)";
    }
    if (normalized() === "starting" || normalized() === "queued") {
      return "bg-(--warning-strong)";
    }
    if (normalized() === "failed" || normalized() === "cancelled") {
      return "bg-(--danger-strong)";
    }
    return "bg-(--terminal-muted)";
  };

  return <span class={cn("h-2 w-2 shrink-0 rounded-full", dotClass())} aria-label={`Status ${props.status}`} />;
}
