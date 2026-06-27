/** @jsxImportSource solid-js */
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ArrowDown, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Logs, Terminal } from "lucide-solid";
import type { ExecutionToolActivity } from "../../../shared/protocol";
import type { TimelineToolBlock } from "../lib/chat-timeline-model";
import { formatShortTimestamp } from "../lib/time-format";
import {
  formatToolActivityCopyText,
  formatToolActivityOwner,
  formatToolActivitySnippet,
  formatToolActivityTooltip,
  formatToolInvocationDescription,
  formatToolMetadata,
  getToolActivityDetailSections
} from "../lib/tool-activity-format";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";

type StreamedToolBlockProps = {
  block: TimelineToolBlock;
  fileLinks?: FileLinkConfig;
  selectedActivityId?: string;
  onSelectedActivityIdChange?: (activityId?: string) => void;
};

export function StreamedToolBlock(props: StreamedToolBlockProps) {
  let scroller: HTMLDivElement | undefined;
  const [expanded, setExpanded] = createSignal(false);
  const [atBottom, setAtBottom] = createSignal(true);
  const [internalSelectedActivityId, setInternalSelectedActivityId] = createSignal<string>();
  const activityKey = createMemo(() => props.block.activities.map((activity) => `${activity.id}:${activity.updatedAt}:${activity.status}`).join("|"));
  const selectedActivityId = () => (props.selectedActivityId !== undefined ? props.selectedActivityId : internalSelectedActivityId());

  function setSelectedActivityId(activityId?: string) {
    if (props.onSelectedActivityIdChange) {
      props.onSelectedActivityIdChange(activityId);
      return;
    }
    setInternalSelectedActivityId(activityId);
  }

  function openActivityDetails(activityId: string) {
    setSelectedActivityId(activityId);
  }

  const updateAtBottom = () => {
    if (!scroller) {
      setAtBottom(true);
      return;
    }
    setAtBottom(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4);
  };

  const scrollToBottom = () => {
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      setAtBottom(true);
    }
  };

  createEffect(() => {
    activityKey();
    if (atBottom()) {
      queueMicrotask(scrollToBottom);
    }
  });

  return (
    <article class="rounded-2xl border border-(--border) bg-white/55 p-3" data-test-streamed-tool-block="">
      <div class="mb-2 flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
          <Terminal class="h-3.5 w-3.5" />
          <span class="truncate">Tool calls ({props.block.activities.length})</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Show when={!atBottom()}>
            <ActionButton tooltip="Scroll tool calls to latest" icon={<ArrowDown class="h-3.5 w-3.5" />} size="icon" variant="ghost" ariaLabel="Scroll tool calls to latest" onClick={scrollToBottom} />
          </Show>
          <ActionButton
            tooltip={expanded() ? "Collapse tool call block" : "Show all tool calls"}
            icon={expanded() ? <ChevronUp class="h-3.5 w-3.5" /> : <ChevronDown class="h-3.5 w-3.5" />}
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? "Less" : "Show all"}
          </ActionButton>
        </div>
      </div>
      <div
        ref={scroller}
        class="space-y-1"
        classList={{ "overflow-y-visible": expanded(), "max-h-40": !expanded(), "overflow-y-auto": !expanded(), "pr-1": !expanded() }}
        onScroll={updateAtBottom}
      >
        <For each={props.block.activities}>
          {(activity) => (
            <article
              class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[0.65rem] text-(--foreground) hover:bg-white/80"
              title={formatToolActivityTooltip(activity)}
              onClick={(event) => {
                if (shouldIgnoreActivityRowClick(event.target)) {
                  return;
                }
                openActivityDetails(activity.id);
              }}
            >
              <ToolActivityStatusIcon status={activity.status} />
              <div
                class="min-w-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
                role="button"
                tabIndex={0}
                aria-label={`Show details for ${formatToolActivitySnippet(activity, 96)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openActivityDetails(activity.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  openActivityDetails(activity.id);
                }}
              >
                <span class="flex min-w-0 items-center gap-1">
                  <span class="truncate font-semibold">{formatToolActivityOwner(activity)}</span>
                  <span class="text-(--muted)">|</span>
                  <span class="truncate text-(--muted)">{activity.toolName}</span>
                </span>
                <span class="block truncate text-[0.62rem] leading-4 text-(--muted)">
                  {formatToolInvocationDescription(activity)}
                </span>
                <span class="tool-call-snippet mt-1 block">
                  <FileLinkedText text={formatToolActivitySnippet(activity)} fileLinks={props.fileLinks} />
                </span>
              </div>
              <span class="shrink-0 uppercase tracking-[0.12em] text-(--accent-strong)">
                {activity.exitCode === undefined ? activity.status : `${activity.status} ${activity.exitCode}`}
              </span>
              <button
                type="button"
                class="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-(--border) bg-(--panel-strong) text-(--foreground) transition hover:bg-(--panel) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
                aria-label={`Show details for ${activity.toolName} ${activity.toolCallId}`}
                title="Show tool call details"
                onClick={(event) => {
                  event.stopPropagation();
                  openActivityDetails(activity.id);
                }}
              >
                <Logs class="h-3.5 w-3.5" />
              </button>
            </article>
          )}
        </For>
      </div>
      <div class="mt-2 flex items-center justify-between gap-3 text-[0.575rem] uppercase tracking-[0.12em] text-(--muted)">
        <span>{formatShortTimestamp(props.block.updatedAt)}</span>
        <CopyTextButton value={props.block.activities.map(formatToolActivityCopyText).join("\n\n---\n\n")} tooltip="Copy tool calls" copiedTitle="Tool calls copied" copiedDescription="Tool call details copied to clipboard." size="sm" variant="ghost" ariaLabel="Copy tool calls">
          Copy
        </CopyTextButton>
      </div>
      <Show when={selectedActivityId()}>
        {(activityId) => {
          const activity = () => props.block.activities.find((candidate) => candidate.id === activityId());
          return (
            <Show when={activity()}>
              {(selectedActivity) => (
                <Dialog
                  open
                  title={`${selectedActivity().toolName} ${selectedActivity().status}`}
                  eyebrow="Tool call"
                  class="max-w-5xl"
                  contentClass="max-h-[85vh]"
                  onClose={() => setSelectedActivityId(undefined)}
                >
                  <div class="space-y-3 text-xs">
                    <div class="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-(--border) bg-white/70 p-3">
                      <div class="min-w-0 flex-1 leading-5 text-(--muted)">
                        {formatToolInvocationDescription(selectedActivity())}
                      </div>
                      <CopyTextButton
                        value={formatToolActivityCopyText(selectedActivity())}
                        tooltip="Copy tool call details"
                        copiedTitle="Tool call copied"
                        copiedDescription="Tool call details copied to clipboard."
                        size="sm"
                        variant="secondary"
                        ariaLabel="Copy tool call details"
                      >
                        Copy details
                      </CopyTextButton>
                    </div>
                    <DetailBlock title="Metadata" value={formatToolMetadata(selectedActivity())} fileLinks={props.fileLinks} />
                    <For each={getToolActivityDetailSections(selectedActivity())}>
                      {(section) => (
                        <DetailBlock
                          title={section.title}
                          value={section.value}
                          mono={section.mono}
                          tone={section.tone}
                          copyTooltip={section.copyTooltip}
                          fileLinks={props.fileLinks}
                        />
                      )}
                    </For>
                  </div>
                </Dialog>
              )}
            </Show>
          );
        }}
      </Show>
    </article>
  );
}

function shouldIgnoreActivityRowClick(target: EventTarget | null) {
  return Boolean(target instanceof HTMLElement && target.closest("button, a, input, textarea, select"));
}

function DetailBlock(props: { title: string; value: string; mono?: boolean; tone?: "danger"; copyTooltip?: string; fileLinks?: FileLinkConfig }) {
  return (
    <section class="rounded-xl border border-(--border) bg-white/70 p-3">
      <div class="mb-2 flex items-center justify-between gap-3">
        <div class="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{props.title}</div>
        <Show when={props.copyTooltip}>
          {(tooltip) => (
            <CopyTextButton
              value={props.value}
              tooltip={tooltip()}
              copiedTitle={`${props.title} copied`}
              copiedDescription={`${props.title} copied to clipboard.`}
              size="sm"
              variant="ghost"
              ariaLabel={tooltip()}
            >
              Copy
            </CopyTextButton>
          )}
        </Show>
      </div>
      <pre
        class="overflow-visible whitespace-pre-wrap wrap-break-word text-[0.7rem] leading-5"
        classList={{
          "font-mono": Boolean(props.mono),
          "text-rose-700": props.tone === "danger",
          "text-(--foreground)": props.tone !== "danger"
        }}
      >
        <FileLinkedText text={props.value} fileLinks={props.fileLinks} />
      </pre>
    </section>
  );
}

function ToolActivityStatusIcon(props: { status: ExecutionToolActivity["status"] }) {
  switch (props.status) {
    case "running":
      return <LoaderCircle class="h-3.5 w-3.5 animate-spin" aria-label="Tool running" />;
    case "completed":
      return <CheckCircle2 class="h-3.5 w-3.5 text-emerald-600" aria-label="Tool completed" />;
    case "failed":
    case "timed-out":
      return <CircleAlert class="h-3.5 w-3.5 text-rose-600" aria-label="Tool failed" />;
  }
}
