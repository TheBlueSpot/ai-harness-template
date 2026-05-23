import { Show, createMemo, createSignal } from "solid-js";
import { Logs } from "lucide-solid";
import { formatShortTimestamp } from "../../lib/time-format";
import { cn } from "../../lib/utils";
import { MarkdownContent } from "../markdown-content";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { VirtualList } from "./virtual-list";

const defaultSummaryLength = 250;

export type ExecutionLogEntry = {
  id: string;
  message: string;
  rowSummary?: string;
  level: string;
  createdAt: string | number | Date | undefined;
  detail?: string;
  detailsJson?: unknown;
  detailsJsonSummary?: string;
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
        <VirtualList
          class="min-h-0 flex-1 pr-2"
          contentClass="w-full"
          itemClass="pb-3"
          items={props.entries}
          getKey={(entry) => entry.id}
          estimateSize={118}
          pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
        >
          {(entry) => {
            const rowSummary = () => entry.rowSummary ?? entry.message;
            return (
              <article class="rounded-[0.9rem] border border-(--border) bg-white/70 p-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="break-words text-[0.675rem] text-(--foreground)">
                      {truncateLogText(rowSummary(), summaryLength())}
                    </div>
                    <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
                      {entry.level} | {formatShortTimestamp(entry.createdAt)}
                    </div>
                  </div>
                  <Button tooltip="Show execution log details" variant="secondary" aria-label={`Show details for ${entry.message}`} onClick={() => openEntryDetails(entry.id)}>
                    <Logs class="h-4 w-4" />
                    Show details
                  </Button>
                </div>
              </article>
            );
          }}
        </VirtualList>
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
              <MarkdownContent content={entry().message} size="compact" />
              <Show when={entry().detail}>
                {(detail) => <MarkdownContent content={detail()} tone="muted" size="compact" />}
              </Show>
              <Show when={entry().detailsJson !== undefined}>
                <pre class="overflow-auto rounded-[0.9rem] bg-slate-950/95 p-3 text-[0.625rem] leading-5 text-slate-100">
                  {JSON.stringify(entry().detailsJson, null, 2)}
                </pre>
              </Show>
              <Show when={entry().detailsJsonSummary}>
                {(summary) => <div class="rounded-[0.9rem] border border-amber-200 bg-amber-50 p-3 text-[0.675rem] text-amber-900">{summary()}</div>}
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
