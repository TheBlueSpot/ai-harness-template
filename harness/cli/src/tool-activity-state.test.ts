import { describe, expect, test } from "bun:test";
import type { ExecutionToolActivity } from "../../shared/protocol";
import { recordToolEnd, recordToolStart, recordToolUpdate } from "./tool-activity-state";

describe("tool activity raw details", () => {
  test("stores bounded raw args and keeps previews", () => {
    const activities = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-start",
        toolCallId: "tool-1",
        toolName: "shell",
        args: { command: "echo hi", z: 1, a: 2 }
      },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });

    expect(activities[0]?.command).toBe("echo hi");
    expect(activities[0]?.rawArgsJson).toBe('{"a":2,"command":"echo hi","z":1}');
    expect(activities[0]?.rawArgsTruncated).toBe(false);
    expect(activities[0]?.rawArgsRedacted).toBe(false);
  });

  test("stores partial and final raw result", () => {
    const started = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: { type: "tool-start", toolCallId: "tool-1", toolName: "shell", args: { command: "echo hi" } },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });
    const updated = recordToolUpdate(started, {
      runId: "run-1",
      owner: "main",
      event: { type: "tool-update", toolCallId: "tool-1", toolName: "shell", args: undefined, partialResult: { stdout: "partial" } },
      occurredAt: "2026-04-23T12:00:01.000Z"
    });
    const ended = recordToolEnd(updated, {
      runId: "run-1",
      owner: "main",
      event: { type: "tool-end", toolCallId: "tool-1", toolName: "shell", result: { stdout: "final", exitCode: 0 }, isError: false },
      occurredAt: "2026-04-23T12:00:02.000Z"
    });

    expect(updated[0]?.rawResultJson).toBe('{"stdout":"partial"}');
    expect(updated[0]?.rawResultStatus).toBe("partial");
    expect(ended[0]?.rawResultJson).toBe('{"exitCode":0,"stdout":"final"}');
    expect(ended[0]?.rawResultStatus).toBe("final");
    expect(ended[0]?.stdoutPreview).toBe("final");
  });

  test("redacts sensitive raw args and results before persistence", () => {
    const started = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-start",
        toolCallId: "tool-1",
        toolName: "web.fetch",
        args: {
          url: "https://example.test",
          headers: {
            authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
            "x-api-key": "sk_test_abcdefghijklmnopqrstuvwxyz"
          }
        }
      },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });
    const ended = recordToolEnd(started, {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-end",
        toolCallId: "tool-1",
        toolName: "web.fetch",
        result: { stdout: "token ghp_abcdefghijklmnopqrstuvwxyz1234567890" },
        isError: false
      },
      occurredAt: "2026-04-23T12:00:01.000Z"
    });

    expect(started[0]?.rawArgsJson).toContain('"authorization":"[redacted]"');
    expect(started[0]?.rawArgsJson).toContain('"x-api-key":"[redacted]"');
    expect(started[0]?.rawArgsRedacted).toBe(true);
    expect(ended[0]?.rawResultJson).toContain("[redacted-token]");
    expect(ended[0]?.rawResultRedacted).toBe(true);
  });

  test("marks oversized raw values as truncated", () => {
    const activities = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-start",
        toolCallId: "tool-1",
        toolName: "shell",
        args: { command: "x".repeat(70_000) }
      },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });

    expect(activities[0]?.rawArgsJson?.length).toBe(65_536);
    expect(activities[0]?.rawArgsTruncated).toBe(true);
    expect(activities[0]?.argsSummary?.length).toBe(4000);
  });

  test("omits raw values after the per-run raw artifact budget is exhausted", () => {
    let activities: ExecutionToolActivity[] = [];
    for (let index = 0; index < 17; index += 1) {
      activities = recordToolStart(activities, {
        runId: "run-1",
        owner: "main",
        event: {
          type: "tool-start",
          toolCallId: `tool-${index}`,
          toolName: "shell",
          args: { command: "x".repeat(70_000), index }
        },
        occurredAt: "2026-04-23T12:00:00.000Z"
      });
    }

    expect(activities[15]?.rawArgsJson?.length).toBe(65_536);
    expect(activities[16]?.rawArgsJson).toBeUndefined();
    expect(activities[16]?.rawArgsOmittedReason).toBe("run-budget-exceeded");
  });
});
