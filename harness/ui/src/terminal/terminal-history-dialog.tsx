import { For, Show } from "solid-js";
import { Clock3, ExternalLink, Terminal } from "lucide-solid";
import type { TerminalHistoryScope, TerminalSession } from "../../../shared/protocol";
import { formatShortTimestamp } from "../lib/time-format";
import { ActionButton } from "../components/action-button";
import { Dialog } from "../components/primitives/dialog";
import { terminalStore } from "./terminal-store";

export function TerminalHistoryDialog(props: {
  open: boolean;
  title: string;
  scope: TerminalHistoryScope | undefined;
  onClose: () => void;
}) {
  const sessions = () => terminalStore.state.history.sessions;

  return (
    <Dialog open={props.open} title={props.title} description="Terminal sessions linked to this context." onClose={props.onClose}>
      <div class="grid gap-2" data-test-terminal-history-dialog="">
        <Show
          when={sessions().length > 0}
          fallback={<div class="rounded-lg border border-dashed border-(--border) p-4 text-sm text-(--muted)">No terminal history.</div>}
        >
          <For each={sessions()}>
            {(session) => <TerminalHistoryRow session={session} />}
          </For>
        </Show>
      </div>
    </Dialog>
  );
}

function TerminalHistoryRow(props: { session: TerminalSession }) {
  const source = () => props.session.source ?? { kind: "user" as const };
  const sourceLabel = () => source().kind === "agent" ? source().label : "User terminal";
  const endedAt = () => props.session.closedAt ?? props.session.exitedAt;

  return (
    <article class="grid gap-2 rounded-lg border border-(--border) bg-(--panel) p-3 text-xs">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-2 font-semibold text-(--foreground)">
            <Terminal class="h-3.5 w-3.5 shrink-0 text-(--muted)" />
            <span class="truncate">{props.session.name}</span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-[0.65rem] text-(--muted)">
            <span>{sourceLabel()}</span>
            <span>{props.session.status}</span>
            <span>{props.session.cols}x{props.session.rows}</span>
          </div>
        </div>
        <Show when={!props.session.closedAt}>
          <ActionButton
            tooltip="Focus this terminal"
            ariaLabel={`Focus ${props.session.name}`}
            icon={<ExternalLink class="h-3.5 w-3.5" />}
            size="sm"
            variant="secondary"
            onClick={() => {
              terminalStore.focusSession(props.session.id);
              terminalStore.setOpen(true);
            }}
          >
            Open
          </ActionButton>
        </Show>
      </div>
      <div class="min-w-0 break-all font-mono text-[0.65rem] text-(--muted)">{props.session.cwd}</div>
      <div class="flex flex-wrap items-center gap-3 text-[0.65rem] text-(--muted)">
        <span class="inline-flex items-center gap-1">
          <Clock3 class="h-3 w-3" />
          Started {formatShortTimestamp(props.session.startedAt)}
        </span>
        <Show when={endedAt()}>
          {(value) => <span>Ended {formatShortTimestamp(value())}</span>}
        </Show>
      </div>
    </article>
  );
}
