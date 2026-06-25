import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ArrowDown, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Terminal } from "lucide-solid";
import type { ExecutionToolActivity } from "../../../shared/protocol";
import type { TimelineToolBlock } from "../lib/chat-timeline-model";
import { formatShortTimestamp } from "../lib/time-format";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";
import { Tooltip } from "./primitives/tooltip";

type StreamedToolBlockProps = {
  block: TimelineToolBlock;
  fileLinks?: FileLinkConfig;
};

export function StreamedToolBlock(props: StreamedToolBlockProps) {
  let scroller: HTMLDivElement | undefined;
  const [expanded, setExpanded] = createSignal(false);
  const [atBottom, setAtBottom] = createSignal(true);
  const [selected, setSelected] = createSignal<ExecutionToolActivity>();
  const activityKey = createMemo(() => props.block.activities.map((activity) => `${activity.id}:${activity.updatedAt}:${activity.status}`).join("|"));

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

  function handleActivityRowKeyDown(event: KeyboardEvent, activity: ExecutionToolActivity) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    setSelected(activity);
  }

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
            <Tooltip content={formatToolActivityTooltip(activity)} triggerClass="block min-w-0">
              <div
                role="button"
                tabIndex={0}
                class="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.65rem] text-(--foreground) hover:bg-white/80"
                onClick={() => setSelected(activity)}
                onKeyDown={(event) => handleActivityRowKeyDown(event, activity)}
              >
                <ToolActivityStatusIcon status={activity.status} />
                <span class="min-w-0 truncate">
                  <span class="font-semibold">{formatToolOwner(activity)}</span>
                  <span class="text-(--muted)"> | {activity.toolName} | </span>
                  <FileLinkedText class="font-mono" text={activity.command ?? activity.argsSummary ?? activity.outputPreview ?? "tool call"} fileLinks={props.fileLinks} />
                </span>
                <span class="shrink-0 uppercase tracking-[0.12em] text-(--accent-strong)">
                  {activity.exitCode === undefined ? activity.status : `${activity.status} ${activity.exitCode}`}
                </span>
              </div>
            </Tooltip>
          )}
        </For>
      </div>
      <div class="mt-2 flex items-center justify-between gap-3 text-[0.575rem] uppercase tracking-[0.12em] text-(--muted)">
        <span>{formatShortTimestamp(props.block.updatedAt)}</span>
        <CopyTextButton value={props.block.activities.map(formatToolActivityCopyText).join("\n\n---\n\n")} tooltip="Copy tool calls" copiedTitle="Tool calls copied" copiedDescription="Tool call details copied to clipboard." size="sm" variant="ghost" ariaLabel="Copy tool calls">
          Copy
        </CopyTextButton>
      </div>
      <Dialog
        open={Boolean(selected())}
        title={selected() ? `${selected()!.toolName} ${selected()!.status}` : "Tool call"}
        eyebrow="Tool call"
        class="max-w-3xl"
        contentClass="max-h-[70vh]"
        onClose={() => setSelected(undefined)}
      >
        <Show when={selected()}>
          {(activity) => (
            <div class="space-y-3 text-xs">
              <DetailBlock title="Metadata" value={formatToolMetadata(activity())} fileLinks={props.fileLinks} />
              <Show when={activity().command}>
                <DetailBlock title="Command" value={activity().command ?? ""} mono fileLinks={props.fileLinks} />
              </Show>
              <Show when={activity().rawArgsJson ?? activity().argsSummary}>
                <DetailBlock title={formatRawArgsTitle(activity())} value={activity().rawArgsJson ?? activity().argsSummary ?? ""} mono fileLinks={props.fileLinks} />
              </Show>
              <Show when={activity().rawArgsOmittedReason}>
                <DetailBlock title="Args omitted" value={formatRawOmission(activity().rawArgsOmittedReason)} />
              </Show>
              <Show when={activity().rawResultJson ?? activity().outputPreview}>
                <DetailBlock title={formatRawResultTitle(activity())} value={activity().rawResultJson ?? activity().outputPreview ?? ""} mono fileLinks={props.fileLinks} />
              </Show>
              <Show when={activity().rawResultOmittedReason}>
                <DetailBlock title="Result omitted" value={formatRawOmission(activity().rawResultOmittedReason)} />
              </Show>
              <Show when={activity().stdoutPreview}>
                <DetailBlock title="Stdout" value={activity().stdoutPreview ?? ""} mono fileLinks={props.fileLinks} />
              </Show>
              <Show when={activity().stderrPreview}>
                <DetailBlock title="Stderr" value={activity().stderrPreview ?? ""} mono tone="danger" fileLinks={props.fileLinks} />
              </Show>
            </div>
          )}
        </Show>
      </Dialog>
    </article>
  );
}

function DetailBlock(props: { title: string; value: string; mono?: boolean; tone?: "danger"; fileLinks?: FileLinkConfig }) {
  return (
    <section class="rounded-xl border border-(--border) bg-white/70 p-3">
      <div class="mb-2 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{props.title}</div>
      <pre
        class="max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word text-[0.7rem] leading-5"
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

function formatToolOwner(activity: ExecutionToolActivity) {
  if (activity.owner === "subagent") {
    return activity.subagentId ? `Subagent ${activity.subagentId}` : "Subagent";
  }
  return activity.owner === "aggregator" ? "Aggregator" : "Main";
}

export function formatToolMetadata(activity: ExecutionToolActivity) {
  return [
    `Owner: ${formatToolOwner(activity)}`,
    `Run: ${activity.runId}`,
    `Tool call: ${activity.toolCallId}`,
    `Category: ${activity.category}`,
    `Status: ${activity.status}`,
    activity.exitCode === undefined ? undefined : `Exit: ${activity.exitCode}`,
    `Started: ${formatShortTimestamp(activity.startedAt)}`,
    `Updated: ${formatShortTimestamp(activity.updatedAt)}`,
    activity.completedAt ? `Completed: ${formatShortTimestamp(activity.completedAt)}` : undefined,
    activity.rawArgsRedacted || activity.rawResultRedacted ? "Sensitive fields redacted before persistence." : undefined,
    activity.rawArgsDebugArtifactPath ? `Debug args artifact: ${activity.rawArgsDebugArtifactPath}` : undefined,
    activity.rawResultDebugArtifactPath ? `Debug result artifact: ${activity.rawResultDebugArtifactPath}` : undefined
  ].filter(Boolean).join("\n");
}

function formatToolActivityTooltip(activity: ExecutionToolActivity) {
  return [
    `${formatToolOwner(activity)} | ${activity.toolName} | ${activity.status}`,
    activity.command,
    activity.argsSummary ? `Args: ${activity.argsSummary}` : undefined,
    activity.outputPreview ? `Result: ${activity.outputPreview}` : undefined
  ].filter(Boolean).join("\n");
}

export function formatToolActivityCopyText(activity: ExecutionToolActivity) {
  return [
    formatToolMetadata(activity),
    activity.command ? `Command:\n${activity.command}` : "",
    activity.rawArgsJson ? `${formatRawArgsTitle(activity)}:\n${activity.rawArgsJson}` : activity.rawArgsOmittedReason ? `Args omitted:\n${formatRawOmission(activity.rawArgsOmittedReason)}` : activity.argsSummary ? `Args summary:\n${activity.argsSummary}` : "",
    activity.rawResultJson ? `${formatRawResultTitle(activity)}:\n${activity.rawResultJson}` : activity.rawResultOmittedReason ? `Result omitted:\n${formatRawOmission(activity.rawResultOmittedReason)}` : activity.outputPreview ? `Result summary:\n${activity.outputPreview}` : "",
    activity.stdoutPreview ? `Stdout:\n${activity.stdoutPreview}` : "",
    activity.stderrPreview ? `Stderr:\n${activity.stderrPreview}` : ""
  ].filter(Boolean).join("\n\n");
}

function formatRawArgsTitle(activity: ExecutionToolActivity) {
  return formatRawTitle("Sanitized args", activity.rawArgsTruncated, activity.rawArgsRedacted);
}

function formatRawResultTitle(activity: ExecutionToolActivity) {
  const status = activity.rawResultStatus ? ` (${activity.rawResultStatus})` : "";
  return `${formatRawTitle("Sanitized result", activity.rawResultTruncated, activity.rawResultRedacted)}${status}`;
}

function formatRawTitle(base: string, truncated: boolean | undefined, redacted: boolean | undefined) {
  const notes = [redacted ? "redacted" : undefined, truncated ? "truncated" : undefined].filter(Boolean);
  return notes.length ? `${base} (${notes.join(", ")})` : base;
}

function formatRawOmission(reason: ExecutionToolActivity["rawArgsOmittedReason"] | ExecutionToolActivity["rawResultOmittedReason"]) {
  if (reason === "run-budget-exceeded") {
    return "Sanitized raw payload omitted because this run reached the raw artifact budget.";
  }
  return "Sanitized raw payload could not be serialized.";
}
