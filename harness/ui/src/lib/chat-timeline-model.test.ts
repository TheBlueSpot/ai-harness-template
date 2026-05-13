import { expect, test } from "bun:test";
import type { ChatMessage, ExecutionToolActivity } from "../../../shared/protocol";
import { buildChatTimelineRows } from "./chat-timeline-model";

const message = (id: string, role: ChatMessage["role"], content: string, createdAt: string): ChatMessage => ({
  id,
  role,
  content,
  createdAt
});

const activity = (id: string, startedAt: string, status: ExecutionToolActivity["status"] = "completed"): ExecutionToolActivity => ({
  id,
  runId: "run-1",
  owner: "main",
  toolCallId: id,
  toolName: "shell",
  category: "shell",
  command: `echo ${id}`,
  status,
  startedAt,
  updatedAt: startedAt
});

test("interleaves tool blocks between adjacent assistant chunks", () => {
  const rows = buildChatTimelineRows({
    messages: [
      message("user-1", "user", "Do it", "2026-04-23T12:00:00.000Z"),
      message("assistant-1", "assistant", "First.", "2026-04-23T12:00:05.000Z"),
      message("assistant-2", "assistant", "Second.", "2026-04-23T12:00:10.000Z")
    ],
    toolActivities: [
      activity("tool-1", "2026-04-23T12:00:06.000Z"),
      activity("tool-2", "2026-04-23T12:00:07.000Z")
    ],
    activeRunId: "run-1"
  });

  expect(rows.map((row) => row.kind)).toEqual(["persisted", "persisted", "tool-block", "persisted"]);
  expect(rows[2]?.kind === "tool-block" ? rows[2].block.activities.map((entry) => entry.id) : []).toEqual(["tool-1", "tool-2"]);
});

test("keeps running tools in latest interval", () => {
  const rows = buildChatTimelineRows({
    messages: [message("assistant-1", "assistant", "First.", "2026-04-23T12:00:05.000Z")],
    liveMessages: [{ id: "live-1", kind: "assistant", content: "Live.", locked: false, updatedAt: "2026-04-23T12:00:12.000Z" }],
    toolActivities: [activity("tool-1", "2026-04-23T12:00:13.000Z", "running")],
    activeRunId: "run-1"
  });

  const lastRow = rows[rows.length - 1];
  expect(lastRow?.kind).toBe("tool-block");
  expect(lastRow?.kind === "tool-block" ? lastRow.block.activities[0]?.status : undefined).toBe("running");
});

test("handles no tool calls", () => {
  const rows = buildChatTimelineRows({
    messages: [message("assistant-1", "assistant", "First.", "2026-04-23T12:00:05.000Z")]
  });

  expect(rows).toHaveLength(1);
  expect(rows[0]?.kind).toBe("persisted");
});
