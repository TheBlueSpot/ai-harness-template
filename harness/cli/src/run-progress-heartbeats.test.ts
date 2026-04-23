import { describe, expect, test } from "bun:test";
import { formatRunProgressHeartbeat, shouldDelayDerivedProgressHeartbeat } from "./run-progress-heartbeats";

describe("run progress heartbeats", () => {
  test("cycles planning heartbeat copy so slow planner turns stay visibly alive", () => {
    const run = { status: "planning" as const, subtasks: [] };

    expect(formatRunProgressHeartbeat(run, 1)).toBe("Planner still working. Scoping execution plan.");
    expect(formatRunProgressHeartbeat(run, 2)).toBe("Planner still working. Checking route and task breakdown.");
    expect(formatRunProgressHeartbeat(run, 3)).toBe("Planner still working. Finalizing execution plan.");
    expect(formatRunProgressHeartbeat(run, 4)).toBe("Planner still working. Scoping execution plan.");
  });

  test("keeps planning on first heartbeat while later run phases stay quieter", () => {
    expect(shouldDelayDerivedProgressHeartbeat("planning")).toBe(false);
    expect(shouldDelayDerivedProgressHeartbeat("running-main")).toBe(true);
    expect(shouldDelayDerivedProgressHeartbeat("running-subagents")).toBe(true);
  });

  test("summarizes running subagent progress", () => {
    const run = {
      status: "running-subagents" as const,
      subtasks: [
        createSubtask("task-1", "Inspect files", "completed"),
        createSubtask("task-2", "Patch code", "running"),
        createSubtask("task-3", "Verify", "failed")
      ]
    };

    expect(formatRunProgressHeartbeat(run, 2)).toBe("Subagents still running: 1/3 complete, 1 failed; active Patch code.");
  });
});

function createSubtask(
  id: string,
  title: string,
  status: "pending" | "running" | "completed" | "failed"
) {
  return {
    id,
    title,
    instruction: `Handle ${title}`,
    status,
    attemptCount: 1,
    updatedAt: new Date().toISOString()
  };
}
