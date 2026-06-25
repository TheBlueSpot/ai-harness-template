/** @jsxImportSource solid-js */
import { Show, createMemo, createSignal } from "solid-js";
import { Logs } from "lucide-solid";
import { formatShortTimestamp } from "../../lib/time-format";
import { cn } from "../../lib/utils";
import { FileLinkedText, type FileLinkConfig } from "../file-linked-text";
import { MarkdownContent } from "../markdown-content";
import { buttonVariants } from "./button";
import { Dialog } from "./dialog";
import { Tooltip } from "./tooltip";
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
  onEntrySourceClick?: (entry: ExecutionLogEntry) => void;
  rowVariant?: "card" | "flat";
  fileLinks?: FileLinkConfig;
  class?: string;
};

export function ExecutionLog(props: ExecutionLogProps) {
  const [internalSelectedEntryId, setInternalSelectedEntryId] = createSignal<string>();
  const summaryLength = () => props.summaryLength ?? defaultSummaryLength;
  const selectedEntryId = () => {
    const controlledEntryId = props.selectedEntryId;
    return controlledEntryId !== undefined ? controlledEntryId : internalSelectedEntryId();
  };
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

  function openEntrySource(entry: ExecutionLogEntry) {
    props.onEntrySourceClick?.(entry);
  }

  function shouldIgnoreRowSourceClick(target: EventTarget | null) {
    return Boolean(
      target instanceof HTMLElement &&
        target.closest("button, a, input, textarea, select, [data-execution-log-source-action]")
    );
  }

  return (
    <div data-test-execution-log="" class={cn("flex min-h-0 flex-1 flex-col", props.class)}>
      <Show
        when={props.entries.length > 0}
        fallback={
          <div
            class={cn(
              "text-[0.675rem] text-(--muted)",
              props.rowVariant === "flat"
                ? "border-l-2 border-dashed border-(--border) py-3 pl-4"
                : "rounded-[0.9rem] border border-dashed border-(--border) bg-white/45 p-3"
            )}
          >
            {props.emptyMessage ?? "No execution log yet."}
          </div>
        }
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
              <>
                <article
                  class={cn(
                    props.rowVariant === "flat"
                      ? "border-l-2 py-3 pl-4 pr-2"
                      : "rounded-[0.9rem] border border-(--border) bg-white/70 p-3",
                    executionLogLevelBorderClass(entry.level),
                    props.onEntrySourceClick ? "cursor-pointer transition hover:border-(--accent-strong) hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)" : undefined
                  )}
                  onClick={(event) => {
                    if (!props.onEntrySourceClick || shouldIgnoreRowSourceClick(event.target)) {
                      return;
                    }
                    openEntrySource(entry);
                  }}
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div
                      class={cn(
                        "min-w-0 flex-1",
                        props.onEntrySourceClick ? "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)" : undefined
                      )}
                      data-execution-log-source-action={props.onEntrySourceClick ? "" : undefined}
                      role={props.onEntrySourceClick ? "button" : undefined}
                      aria-label={props.onEntrySourceClick ? `Open source for ${entry.message}` : undefined}
                      tabIndex={props.onEntrySourceClick ? 0 : undefined}
                      onClick={(event) => {
                        if (!props.onEntrySourceClick) {
                          return;
                        }
                        event.stopPropagation();
                        openEntrySource(entry);
                      }}
                      onKeyDown={(event) => {
                        if (!props.onEntrySourceClick || (event.key !== "Enter" && event.key !== " ")) {
                          return;
                        }
                        event.preventDefault();
                        openEntrySource(entry);
                      }}
                    >
                      <div class="break-words text-[0.675rem] text-(--foreground)">
                        <FileLinkedText text={() => truncateLogText(rowSummary(), summaryLength())} fileLinks={props.fileLinks} />
                      </div>
                      <div class="mt-1 text-[0.575rem] uppercase tracking-[0.14em] text-(--muted)">
                        {entry.level} | {formatShortTimestamp(entry.createdAt)}
                      </div>
                    </div>
                    <Tooltip content="Show execution log details">
                      <button
                        class={buttonVariants({ variant: "secondary" })}
                        type="button"
                        aria-label={`Show details for ${entry.message}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEntryDetails(entry.id);
                        }}
                      >
                        <Logs class="h-4 w-4" />
                        Show details
                      </button>
                    </Tooltip>
                  </div>
                </article>
              </>
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
              <MarkdownContent content={entry().message} size="compact" fileLinks={props.fileLinks} />
              <Show when={entry().detail}>
                {(detail) => <MarkdownContent content={detail()} tone="muted" size="compact" fileLinks={props.fileLinks} />}
              </Show>
              <Show when={entry().detailsJson !== undefined}>
                <pre class="overflow-auto rounded-[0.9rem] bg-slate-950/95 p-3 text-[0.625rem] leading-5 text-slate-100">
                  <FileLinkedText text={() => JSON.stringify(entry().detailsJson, null, 2)} fileLinks={props.fileLinks} />
                </pre>
              </Show>
              <Show when={entry().detailsJsonSummary}>
                {(summary) => (
                  <div class="rounded-[0.9rem] border border-amber-200 bg-amber-50 p-3 text-[0.675rem] text-amber-900">
                    <FileLinkedText text={summary()} fileLinks={props.fileLinks} />
                  </div>
                )}
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

function executionLogLevelBorderClass(level: string) {
  const normalized = level.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("cancel")) {
    return "border-rose-400";
  }
  if (normalized.includes("warn") || normalized.includes("approval") || normalized.includes("input")) {
    return "border-amber-400";
  }
  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("success")) {
    return "border-emerald-500";
  }
  if (normalized.includes("run") || normalized.includes("exec")) {
    return "border-sky-400";
  }
  return "border-(--border)";
}
