import { expect, it } from "bun:test";
import type { ExecutionToolActivity } from "../../../shared/protocol";
import {
  formatApprovalInvocationDescription,
  formatToolInvocationDescription,
  normalizeToolSnippet
} from "./tool-activity-format";

const baseActivity: ExecutionToolActivity = {
  id: "tool-1",
  runId: "run-1",
  owner: "main",
  toolCallId: "call-1",
  toolName: "shell",
  category: "shell",
  status: "completed",
  startedAt: "2026-04-28T12:00:00.000Z",
  updatedAt: "2026-04-28T12:00:01.000Z"
};

it("normalizes markdown-like snippets and truncates long values", () => {
  const value = normalizeToolSnippet("# Big title\n\nBody    text " + "x".repeat(80), 32);

  expect(value.startsWith("Big title Body text x")).toBe(true);
  expect(value.endsWith("...")).toBe(true);
  expect(value).toHaveLength(32);
});

it("describes process-filtering shell pipelines in plain language", () => {
  const description = formatToolInvocationDescription({
    ...baseActivity,
    command: "ps -eo pid,ppid,user,%cpu,%mem,comm --sort=-%cpu | head -n 20 | awk '$4 > 0.5 {print $1}'"
  });

  expect(description).toContain("List processes by CPU");
  expect(description).toContain("keep first 20 rows");
  expect(description).toContain("filter rows where CPU column > 0.5");
});

it("describes browser approvals from raw summaries", () => {
  expect(formatApprovalInvocationDescription("Open page", "{\"url\":\"https://example.test\"}")).toBe(
    "Open or inspect https://example.test."
  );
  expect(formatApprovalInvocationDescription("Run script", "{\"command\":\"bun test\"}")).toContain("Run Bun tests");
});
