/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../utils/tests/test-harness";
import { ExecutionLog, truncateLogText } from "./execution-log";

createUiTest("ExecutionLog", () => {
  const createdAt = "2026-04-28T12:00:00.000Z";
  const longMessage = `${"a".repeat(260)} tail`;
  const entries = [
    {
      id: "entry-1",
      message: longMessage,
      level: "info",
      createdAt,
      detail: "Full detail body",
      detailsJson: { file: "README.md" }
    }
  ];

  it("truncates long messages in the list", () => {
    render(() => <ExecutionLog entries={entries} />);

    expect(screen.getByText(truncateLogText(longMessage))).not.toBeNull();
    expect(screen.queryByText(longMessage)).toBeNull();
    expect(screen.getByText(/info \|/)).not.toBeNull();
    expect(screen.getByRole("button", { name: /Show details/ })).not.toBeNull();
  });

  it("truncates row summaries without changing dialog details", () => {
    const rowSummary = `Assistant job succeeded ${longMessage}`;

    render(() => <ExecutionLog entries={[{ ...entries[0]!, rowSummary }]} selectedEntryId="entry-1" />);

    expect(screen.getByText(truncateLogText(rowSummary))).not.toBeNull();
    expect(screen.queryByText(rowSummary)).toBeNull();
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText(longMessage)).not.toBeNull();
  });

  it("renders selected entry details in a dialog", () => {
    render(() => <ExecutionLog entries={entries} selectedEntryId="entry-1" />);

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText(longMessage)).not.toBeNull();
    expect(screen.getByText("Full detail body")).not.toBeNull();
    expect(screen.getByText(/README.md/)).not.toBeNull();
  });

  it("renders plain details without markdown truncation and copies full detail text", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied.push(value);
        }
      }
    });
    render(() => (
      <ExecutionLog
        entries={[
          {
            id: "entry-tool",
            message: "shell completed",
            level: "shell",
            createdAt,
            detail: "# not a heading\nfull output body",
            detailKind: "plain",
            copyText: "copy full output body"
          }
        ]}
        selectedEntryId="entry-tool"
      />
    ));

    expect(screen.queryByRole("heading", { name: "not a heading" })).toBeNull();
    expect(screen.getByText(/# not a heading/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy execution log details" }));
    await Promise.resolve();

    expect(copied).toEqual(["copy full output body"]);
  });

  it("routes row clicks to source without hijacking details button", () => {
    const opened: string[] = [];
    const [selectedEntryId, setSelectedEntryId] = createSignal<string>();

    render(() => (
      <ExecutionLog
        entries={entries}
        selectedEntryId={selectedEntryId()}
        onSelectedEntryIdChange={setSelectedEntryId}
        onEntrySourceClick={(entry) => opened.push(entry.id)}
      />
    ));

    fireEvent.click(document.querySelector("article")!);
    expect(opened).toEqual(["entry-1"]);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show details/ }));
    expect(opened).toEqual(["entry-1"]);
    expect(selectedEntryId()).toBe("entry-1");
  });

  it("formats file references and opens them on modifier click", () => {
    const opened: unknown[] = [];
    render(() => (
      <ExecutionLog
        entries={[
          {
            id: "entry-file",
            message: "Changed harness/ui/src/app.tsx:7",
            level: "info",
            createdAt
          }
        ]}
        fileLinks={{
          rootPath: "C:\\repo",
          filePaths: ["harness/ui/src/app.tsx"],
          onOpenFile: (target) => opened.push(target)
        }}
      />
    ));

    const fileLink = screen.getByRole("button", { name: "harness/ui/src/app.tsx:7" });
    expect(fileLink.className).toContain("markdown-file-link");

    fireEvent.click(fileLink);
    expect(opened).toEqual([]);

    fireEvent.click(fileLink, { ctrlKey: true });
    expect(opened).toEqual([{ path: "harness/ui/src/app.tsx", line: 7, column: undefined }]);
  });

  it("formats selected entry details as markdown", () => {
    render(() => (
      <ExecutionLog
        entries={[
          {
            id: "entry-markdown",
            message: "Prompt **summary**",
            level: "info",
            createdAt,
            detail: "- first\n- second"
          }
        ]}
        selectedEntryId="entry-markdown"
      />
    ));

    const emphasized = screen.getByText("summary");
    expect(emphasized.tagName.toLowerCase()).toBe("strong");
    expect(screen.getByRole("list")).not.toBeNull();
    expect(screen.getByText("first")).not.toBeNull();
    expect(screen.getByText("second")).not.toBeNull();
  });
});
