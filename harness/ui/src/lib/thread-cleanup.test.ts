import { describe, expect, test } from "bun:test";
import { createProjectThreadSummary, createWorkspaceProjectState } from "../../../shared/protocol";
import { getThreadCleanupActivityAt, getThreadCleanupCandidates, parseThreadCleanupDuration } from "./thread-cleanup";

describe("thread cleanup helpers", () => {
  test("parses supported duration inputs", () => {
    expect(parseThreadCleanupDuration("30d")).toEqual({ ok: true, ms: 30 * 24 * 60 * 60 * 1000 });
    expect(parseThreadCleanupDuration("2w")).toEqual({ ok: true, ms: 2 * 7 * 24 * 60 * 60 * 1000 });
    expect(parseThreadCleanupDuration("12h")).toEqual({ ok: true, ms: 12 * 60 * 60 * 1000 });
    expect(parseThreadCleanupDuration("90m")).toEqual({ ok: true, ms: 90 * 60 * 1000 });
  });

  test("rejects invalid duration inputs", () => {
    for (const input of ["", "0d", "-1d", "1y", "abc"]) {
      expect(parseThreadCleanupDuration(input).ok).toBe(false);
    }
  });

  test("uses last user message before update and created timestamps", () => {
    const thread = createProjectThreadSummary({
      id: "thread-old-user-message",
      title: "Old user message",
      titleSource: "generated",
      updatedAt: "2026-05-01T00:00:00.000Z",
      createdAt: "2026-04-01T00:00:00.000Z",
      lastUserMessageAt: "2026-03-01T00:00:00.000Z"
    });

    expect(getThreadCleanupActivityAt(thread)).toBe("2026-03-01T00:00:00.000Z");
  });

  test("excludes active and final remaining threads from candidates", () => {
    const project = createWorkspaceProjectState({
      id: "project-cleanup",
      name: "Cleanup",
      rootPath: "C:\\repo\\cleanup",
      activeThreadId: "thread-active",
      threads: [
        createProjectThreadSummary({
          id: "thread-active",
          title: "Active",
          titleSource: "generated",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastUserMessageAt: "2026-01-01T00:00:00.000Z"
        }),
        createProjectThreadSummary({
          id: "thread-old",
          title: "Old",
          titleSource: "generated",
          updatedAt: "2026-01-02T00:00:00.000Z",
          lastUserMessageAt: "2026-01-02T00:00:00.000Z"
        })
      ]
    });

    expect(getThreadCleanupCandidates([project], undefined, 7 * 24 * 60 * 60 * 1000, new Date("2026-02-01T00:00:00.000Z"))).toEqual([
      { projectId: "project-cleanup", threadId: "thread-old" }
    ]);
  });
});
