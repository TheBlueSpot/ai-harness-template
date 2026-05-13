import { describe, expect, test } from "bun:test";
import { withTraceTimestamp } from "./trace-timestamps";

describe("withTraceTimestamp", () => {
  test("adds createdAt when missing", () => {
    const stamped = withTraceTimestamp({
      sessionId: "session-1",
      stage: "subagent-start",
      message: "Starting Patch code"
    }, "2026-04-28T12:00:00.000Z");

    expect(stamped.createdAt).toBe("2026-04-28T12:00:00.000Z");
  });

  test("preserves existing createdAt", () => {
    const stamped = withTraceTimestamp({
      sessionId: "session-1",
      stage: "subagent-start",
      message: "Starting Patch code",
      createdAt: "2026-04-28T12:05:00.000Z"
    }, "2026-04-28T12:00:00.000Z");

    expect(stamped.createdAt).toBe("2026-04-28T12:05:00.000Z");
  });
});
