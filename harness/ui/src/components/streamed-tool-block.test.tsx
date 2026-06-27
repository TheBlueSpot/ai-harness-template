/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import type { ExecutionToolActivity } from "../../../shared/protocol";
import type { TimelineToolBlock } from "../lib/chat-timeline-model";
import { formatShortTimestamp } from "../lib/time-format";
import { formatToolActivityCopyText, formatToolMetadata } from "../lib/tool-activity-format";
import { createUiTest } from "../utils/tests/test-harness";
import { StreamedToolBlock } from "./streamed-tool-block";

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
    expect(screen.getByText(/Run local shell command/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy tool calls" })).not.toBeNull();
  });

  it("explains arcane shell pipelines in compact rows", () => {
    const command = "ps -eo pid,ppid,user,%cpu,%mem,comm --sort=-%cpu | head -n 20 | awk '$4 > 0.5 {print $1}'";
    render(() => <StreamedToolBlock block={block([activity("tool-1", command)])} />);

    expect(screen.getByText(/List processes by CPU/)).not.toBeNull();
    expect(screen.getByText(/keep first 20 rows/)).not.toBeNull();
    expect(screen.getByText(/filter rows where CPU column > 0.5/)).not.toBeNull();
  });

  it("copies command text from the detail dialog", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied.push(value);
        }
      }
    });
    render(() => <StreamedToolBlock block={block([activity("tool-1", "echo runnable")])} selectedActivityId="tool-1" />);

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
    await Promise.resolve();

    expect(copied).toContain("echo runnable");
  });

  it("shows full stdout from sanitized raw result when available", async () => {
    const toolActivity = activity("tool-1", "echo output");
    toolActivity.stdoutPreview = "short preview";
    toolActivity.rawResultJson = JSON.stringify({
      stdout: "full stdout line 1\nfull stdout line 2",
      exitCode: 0
    });
    render(() => <StreamedToolBlock block={block([toolActivity])} selectedActivityId="tool-1" />);

    await screen.findByRole("dialog");

    expect(
      screen.getAllByText((_, element) => element?.textContent === "full stdout line 1\nfull stdout line 2").length
    ).toBeGreaterThan(0);
  });

  it("formats file references and opens them on modifier click", () => {
    const opened: unknown[] = [];
    render(() => (
      <StreamedToolBlock
        block={block([activity("tool-1", "cat harness/ui/src/app.tsx:12")])}
        fileLinks={{
          rootPath: "C:\\repo",
          filePaths: ["harness/ui/src/app.tsx"],
          onOpenFile: (target) => opened.push(target)
        }}
      />
    ));

    const fileLink = screen.getByRole("button", { name: "harness/ui/src/app.tsx:12" });
    expect(fileLink.className).toContain("markdown-file-link");

    fireEvent.click(fileLink);
    expect(opened).toEqual([]);

    fireEvent.click(fileLink, { metaKey: true });
    expect(opened).toEqual([{ path: "harness/ui/src/app.tsx", line: 12, column: undefined }]);
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
