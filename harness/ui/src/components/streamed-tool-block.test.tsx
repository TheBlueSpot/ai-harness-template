/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import type { ExecutionToolActivity } from "../../../shared/protocol";
import type { TimelineToolBlock } from "../lib/chat-timeline-model";
import { formatShortTimestamp } from "../lib/time-format";
import { createUiTest } from "../utils/tests/test-harness";
import { StreamedToolBlock, formatToolActivityCopyText, formatToolMetadata } from "./streamed-tool-block";

createUiTest("StreamedToolBlock", () => {
  const activity = (id: string, command = `echo ${id}`): ExecutionToolActivity => ({
    id,
    runId: "run-1",
    owner: "main",
    toolCallId: id,
    toolName: "shell",
    category: "shell",
    command,
    argsSummary: command,
    outputPreview: `output ${id}`,
    stdoutPreview: `stdout ${id}`,
    stderrPreview: `stderr ${id}`,
    rawArgsJson: `{"command":"${command}"}`,
    rawResultJson: `{"stdout":"stdout ${id}"}`,
    rawResultStatus: "final",
    status: "completed",
    startedAt: "2026-04-23T12:00:00.000Z",
    updatedAt: "2026-04-23T12:00:01.000Z",
    completedAt: "2026-04-23T12:00:01.000Z"
  });

  const block = (activities: ExecutionToolActivity[]): TimelineToolBlock => ({
    id: "block-1",
    runId: "run-1",
    intervalId: "1",
    activities,
    startedAt: "2026-04-23T12:00:00.000Z",
    updatedAt: "2026-04-23T12:00:01.000Z",
    live: true
  });

  it("renders compact rows and toggles all rows", () => {
    render(() => <StreamedToolBlock block={block(Array.from({ length: 6 }, (_, index) => activity(`tool-${index}`)))} />);

    expect(screen.getByText("Tool calls (6)")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Show all tool calls" })).not.toBeNull();
  });

  it("renders rows with full accessible labels for modal entry points", () => {
    render(() => <StreamedToolBlock block={block([activity("tool-1", "echo long command")])} />);

    expect(screen.getByRole("button", { name: /echo long command/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy tool calls" })).not.toBeNull();
  });

  it("labels copied raw details as sanitized and redacted", () => {
    const redacted = activity("tool-1", "curl https://example.test");
    redacted.rawArgsJson = '{"authorization":"[redacted]"}';
    redacted.rawArgsRedacted = true;
    redacted.rawResultJson = undefined;
    redacted.rawResultOmittedReason = "run-budget-exceeded";
    const copyText = formatToolActivityCopyText(redacted);

    expect(copyText).toContain("Sanitized args (redacted):");
    expect(copyText).toContain("Result omitted:");
    expect(copyText).toContain("raw artifact budget");
  });

  it("formats timestamps in metadata instead of showing raw ISO strings", () => {
    const toolActivity = activity("tool-1", "echo time");
    const metadata = formatToolMetadata(toolActivity);
    const copyText = formatToolActivityCopyText(toolActivity);

    const formattedStartedAt = formatShortTimestamp(toolActivity.startedAt);
    expect(metadata).toContain(`Started: ${formattedStartedAt}`);
    expect(metadata).not.toContain("Started: 2026-04-23T12:00:00.000Z");
    expect(copyText).toContain(`Completed: ${formatShortTimestamp(toolActivity.completedAt)}`);
    expect(copyText).not.toContain("Completed: 2026-04-23T12:00:01.000Z");
  });
});
