import { beforeEach, expect, it } from "bun:test";
import type { BackgroundJob, BackgroundJobRun } from "../../shared/protocol";
import { createEmptyBackgroundJobsState, harnessStore } from "./harness-store";
import { notifyBackgroundRun } from "./harness-websocket";
import { toastStore } from "./toast-store";
import { createHarnessStateFixture } from "./utils/tests/test-fixtures";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "./utils/tests/store-test-utils";

function isoNow() {
  return new Date().toISOString();
}

function createBackgroundJob(): BackgroundJob {
  const now = isoNow();
  return {
    id: "bg-job-toast",
    projectId: "project-1",
    automationThreadId: "thread-1",
    kind: "ai-routine",
    name: "Nightly scan",
    status: "enabled",
    riskLevel: "safe",
    definition: {
      kind: "ai-routine",
      prompt: "Scan project",
      planExecutionMode: "immediate",
      subagentWorktreeStrategy: "same-worktree"
    },
    schedule: { type: "one-off", runAt: now, sourceText: "manual" },
    scheduleInput: "manual",
    createdAt: now,
    updatedAt: now
  };
}

function createBackgroundRun(): BackgroundJobRun {
  const now = isoNow();
  return {
    id: "bg-run-toast",
    jobId: "bg-job-toast",
    projectId: "project-1",
    automationThreadId: "thread-1",
    triggerSource: "manual",
    status: "failed",
    riskLevel: "safe",
    approvalStatus: "not-needed",
    skippedOccurrenceCount: 0,
    failureMessage: "Exit code 1",
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
    events: []
  };
}

createUiTest("notifyBackgroundRun", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("routes status toast clicks to the selected background run", () => {
    const job = createBackgroundJob();
    const run = createBackgroundRun();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeSurface: "chat",
        activeLeftTab: "projects",
        jobsRunFilter: "done",
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          jobs: [job],
          runs: [run]
        }
      })
    );

    notifyBackgroundRun(run.id);

    expect(toastStore.toasts[0]).toMatchObject({
      title: "Background task failed",
      description: "Nightly scan | Exit code 1",
      tone: "error"
    });

    toastStore.toasts[0]?.onClick?.();

    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.jobsRunFilter).toBe("failed");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "inbox",
      selectedJobId: job.id,
      selectedRunId: run.id,
      selectedNotificationId: undefined
    });
  });
});
