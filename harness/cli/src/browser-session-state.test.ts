import { expect, test } from "bun:test";
import {
  findPendingBrowserApproval,
  recordBrowserToolEnd,
  recordBrowserToolStart,
  requestBrowserApproval,
  resolveBrowserApproval
} from "./browser-session-state";

test("tracks browser approval and execution lifecycle in one session", () => {
  const requested = requestBrowserApproval([], {
    runId: "run-1",
    owner: "main",
    toolCallId: "call-1",
    toolName: "playwright-browser",
    args: { url: "https://example.com" },
    requestedAt: "2026-04-15T12:00:00.000Z"
  });

  expect(requested).toHaveLength(1);
  expect(requested[0]?.status).toBe("awaiting-approval");
  expect(findPendingBrowserApproval(requested, { runId: "run-1", sessionId: requested[0]!.id, toolCallId: "call-1" })?.label).toContain(
    "https://example.com"
  );
  expect(findPendingBrowserApproval(requested, { runId: "other-run", sessionId: requested[0]!.id, toolCallId: "call-1" })).toBeUndefined();

  const approved = resolveBrowserApproval(requested, {
    runId: "run-1",
    owner: "main",
    sessionId: requested[0]!.id,
    toolCallId: "call-1",
    approved: true,
    resolvedAt: "2026-04-15T12:00:01.000Z"
  });
  expect(approved[0]?.status).toBe("running");
  expect(approved[0]?.pendingApproval).toBeUndefined();

  const started = recordBrowserToolStart(approved, {
    runId: "run-1",
    owner: "main",
    toolCallId: "call-1",
    toolName: "playwright-browser",
    args: { url: "https://example.com" },
    occurredAt: "2026-04-15T12:00:02.000Z"
  });
  expect(started[0]?.activities[0]?.status).toBe("running");

  const completed = recordBrowserToolEnd(started, {
    runId: "run-1",
    owner: "main",
    toolCallId: "call-1",
    toolName: "playwright-browser",
    result: { ok: true, pageTitle: "Example Domain" },
    isError: false,
    occurredAt: "2026-04-15T12:00:03.000Z"
  });
  expect(completed[0]?.status).toBe("completed");
  expect(completed[0]?.activities[0]?.status).toBe("completed");
  expect(completed[0]?.activities[0]?.outputSummary).toContain("Example Domain");
});
