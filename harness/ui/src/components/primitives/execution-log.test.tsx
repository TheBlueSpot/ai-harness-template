/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
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

  it("renders selected entry details in a dialog", () => {
    render(() => <ExecutionLog entries={entries} selectedEntryId="entry-1" />);

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText(longMessage)).not.toBeNull();
    expect(screen.getByText("Full detail body")).not.toBeNull();
    expect(screen.getByText(/README.md/)).not.toBeNull();
  });
});
