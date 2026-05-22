import { expect, test } from "bun:test";
import type { BackgroundJob, BackgroundJobRun } from "../../shared/protocol";
import { createBackgroundRunStatusNotification } from "./server";

const now = "2026-05-20T12:00:00.000Z";

function createJob(): BackgroundJob {
  return {
    id: "job-1",
    projectId: "project-1",
    automationThreadId: "thread-1",
    kind: "ai-routine",
    name: "Risky review",
    status: "enabled",
    riskLevel: "unsafe",
    definition: {
      kind: "ai-routine",
      prompt: "Review risky change"
    },
    schedule: { type: "one-off", runAt: now, sourceText: "manual" },
    scheduleInput: "manual",
    createdAt: now,
    updatedAt: now
  };
}

function createRun(overrides: Partial<BackgroundJobRun> = {}): BackgroundJobRun {
  return {
    id: "run-1",
    jobId: "job-1",
    projectId: "project-1",
    automationThreadId: "thread-1",
    triggerSource: "schedule",
    status: "awaiting-approval",
    riskLevel: "unsafe",
    approvalStatus: "pending",
    skippedOccurrenceCount: 0,
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
    events: [],
    ...overrides
  };
}

test("creates warning inbox notification for background runs awaiting approval", () => {
  const notification = createBackgroundRunStatusNotification(createJob(), createRun());

  expect(notification).toMatchObject({
    kind: "background-run-status",
    interactive: false,
    backgroundRunId: "run-1",
    jobId: "job-1",
    projectId: "project-1",
    threadId: "thread-1",
    title: "Background task needs approval",
    summary: "Risky review needs approval",
    severity: "warning"
  });
});
