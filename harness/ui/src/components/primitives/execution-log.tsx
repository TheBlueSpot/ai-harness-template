import { For, Show, createMemo, createSignal } from "solid-js";
import { Logs } from "lucide-solid";
import { formatShortTimestamp } from "../../lib/time-format";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { ScrollArea } from "./scroll-area";
import { Tooltip } from "./tooltip";

const defaultSummaryLength = 250;

export type ExecutionLogEntry = {
  id: string;
  message: string;
  level: string;
  createdAt: string | number | Date | undefined;
  detail?: string;
  detailsJson?: unknown;
};

type ExecutionLogProps = {
  entries: ExecutionLogEntry[];
  emptyMessage?: string;
  summaryLength?: number;
  detailEyebrow?: string;
  selectedEntryId?: string;
  onSelectedEntryIdChange?: (entryId?: string) => void;
  class?: string;
};

export function ExecutionLog(props: ExecutionLogProps) {
  const [internalSelectedEntryId, setInternalSelectedEntryId] = createSignal<string>();
  const summaryLength = () => props.summaryLength ?? defaultSummaryLength;
  const selectedEntryId = () => props.selectedEntryId ?? internalSelectedEntryId();
  const selectedEntry = createMemo(() => {
    const entryId = selectedEntryId();
    return entryId ? props.entries.find((entry) => entry.id === entryId) : undefined;
  });

  function setSelectedEntryId(entryId?: string) {
    if (props.onSelectedEntryIdChange) {
      props.onSelectedEntryIdChange(entryId);
      return;
    }
    setInternalSelectedEntryId(entryId);
  }

  function openEntryDetails(entryId: string) {
    setSelectedEntryId(entryId);
  }

  return (
    <div data-test-execution-log="" class={cn("flex min-h-0 flex-1 flex-col", props.class)}>
      <Show
        when={props.entries.length > 0}
        fallback={<div class="rounded-[0.9rem] border border-dashed border-(--border) bg-white/45 p-3 text-[0.675rem] text-(--muted)">{props.emptyMessage ?? "No execution log yet."}</div>}
      >
        <ScrollArea class="min-h-0 flex-1 pr-2">
          <div class="space-y-3">
            <For each={props.entries}>
              {(entry) => (
                <article class="rounded-[0.9rem] border border-(--border) bg-white/70 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="break-words text-[0.75rem] font-semibold text-(--foreground)">
                        {truncateLogText(entry.message, summaryLength())}
                      </div>
                      <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
                        {entry.level} | {formatShortTimestamp(entry.createdAt)}
                      </div>
                    </div>
                    <Tooltip content="Show execution log details">
                      <span class="inline-flex">
                        <Button variant="secondary" aria-label={`Show details for ${entry.message}`} onClick={() => openEntryDetails(entry.id)}>
                          <Logs class="h-4 w-4" />
                          Show details
                        </Button>
                      </span>
                    </Tooltip>
                  </div>
                </article>
              )}
            </For>
          </div>
        </ScrollArea>
      </Show>

      <Show when={selectedEntry()}>
        {(entry) => (
          <Dialog
            open
            title={truncateLogText(entry().message, 96)}
            eyebrow={props.detailEyebrow ?? "Execution log details"}
            description={`${entry().level} | ${formatShortTimestamp(entry().createdAt)}`}
            class="max-w-3xl"
            contentClass="max-h-[80vh]"
            onClose={() => setSelectedEntryId(undefined)}
          >
            <div class="flex flex-col gap-3">
              <div class="whitespace-pre-wrap break-words text-[0.75rem] leading-5 text-(--foreground)">{entry().message}</div>
              <Show when={entry().detail}>
                {(detail) => <div class="whitespace-pre-wrap break-words text-[0.75rem] leading-5 text-(--muted)">{detail()}</div>}
              </Show>
              <Show when={entry().detailsJson !== undefined}>
                <pre class="overflow-auto rounded-[0.9rem] bg-slate-950/95 p-3 text-[0.625rem] leading-5 text-slate-100">
                  {JSON.stringify(entry().detailsJson, null, 2)}
                </pre>
              </Show>
            </div>
          </Dialog>
        )}
      </Show>
    </div>
  );
}

export function truncateLogText(value: string, maxLength = defaultSummaryLength) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}
