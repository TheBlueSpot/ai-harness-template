import { For, Show, createSignal } from "solid-js";
import { Plus, X } from "lucide-solid";
import { cn } from "../lib/utils";
import { ActionButton } from "../components/action-button";
import { Input } from "../components/primitives/input";

export type TerminalTabItem = {
  id: string;
  name: string;
  status: string;
  renamable?: boolean;
};

export function TerminalTabs(props: {
  sessions: TerminalTabItem[];
  activeSessionId?: string;
  onCreate: () => void;
  onSelect: (sessionId: string) => void;
  onRename: (sessionId: string, name: string) => void;
  onClose: (sessionId: string) => void;
}) {
  const [editingId, setEditingId] = createSignal<string>();
  const [draft, setDraft] = createSignal("");

  const commit = (session: TerminalTabItem) => {
    const name = draft().trim();
    if (session.renamable !== false && name && name !== session.name) {
      props.onRename(session.id, name);
    }
    setEditingId(undefined);
  };

  return (
    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <For each={props.sessions}>
        {(session) => (
          <button
            type="button"
            class={cn(
              "group flex h-8 min-w-32 max-w-56 cursor-pointer items-center gap-2 rounded-lg border px-2 text-left text-[0.72rem] transition",
              props.activeSessionId === session.id
                ? "border-(--accent-strong) bg-(--panel-strong) text-(--foreground)"
                : "border-transparent text-(--muted) hover:bg-(--panel)"
            )}
            onClick={() => props.onSelect(session.id)}
            onDblClick={() => {
              if (session.renamable === false) {
                return;
              }
              setEditingId(session.id);
              setDraft(session.name);
            }}
          >
            <Show
              when={editingId() === session.id}
              fallback={<span class="min-w-0 flex-1 truncate">{session.name}</span>}
            >
              <Input
                aria-label="Rename terminal"
                class="h-6 min-w-0 rounded-md px-1 py-0 text-[0.72rem]"
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
            </Show>
            <span class="shrink-0 text-[0.6rem] uppercase">{session.status}</span>
            <span
              role="button"
              tabIndex={0}
              class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md opacity-60 transition hover:bg-black/10 group-hover:opacity-100"
              aria-label={`Close ${session.name}`}
              onClick={(event) => {
                event.stopPropagation();
                props.onClose(session.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                props.onClose(session.id);
              }}
            >
              <X class="h-3 w-3" />
            </span>
          </button>
        )}
      </For>
      <ActionButton tooltip="New terminal" ariaLabel="New terminal" variant="ghost" size="icon" class="h-8 w-8 rounded-lg" icon={<Plus class="h-4 w-4" />} onClick={props.onCreate} />
    </div>
  );
}
