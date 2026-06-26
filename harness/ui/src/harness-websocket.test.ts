import { beforeEach, expect, it } from "bun:test";
import type { BackgroundJob, BackgroundJobRun, ClientCommand } from "../../shared/protocol";
import { createEmptyBackgroundJobsState, harnessStore } from "./harness-store";
import { hasLocalServerPreferenceOverride, notifyBackgroundRun } from "./harness-websocket";
import { openAgentRunSource } from "./source-navigation";
import { toastStore } from "./toast-store";
import { createHarnessStateFixture, createRunFixture, createViewProjectFixture, defaultPreferencesFixture } from "./utils/tests/test-fixtures";
import { createUiTest } from "./utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "./utils/tests/store-test-utils";

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

function createBackgroundRun(overrides: Partial<BackgroundJobRun> = {}): BackgroundJobRun {
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
    events: [],
    ...overrides
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

  it("routes linked agent run source clicks to the background run without activating automation chat", () => {
    const job = createBackgroundJob();
    const run = createBackgroundRun({
      linkedAgentRunId: "agent-run-1",
      automationThreadId: "thread-auto"
    });
    const commands: ClientCommand[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeSurface: "chat",
        activeLeftTab: "projects",
        workspace: {
          activeProjectId: "project-1",
          projects: [
            createViewProjectFixture({
              id: "project-1",
              activeThreadId: "thread-user",
              threads: [
                {
                  id: "thread-user",
                  kind: "user",
                  status: "active",
                  pinned: false,
                  title: "User thread",
                  titleSource: "generated",
                  badgeState: "idle",
                  messageCount: 0,
                  updatedAt: isoNow()
                },
                {
                  id: "thread-auto",
                  kind: "automation",
                  status: "active",
                  pinned: false,
                  title: "Nightly scan",
                  titleSource: "custom",
                  badgeState: "idle",
                  messageCount: 0,
                  updatedAt: isoNow()
                }
              ]
            })
          ]
        },
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          jobs: [job],
          runs: [run]
        }
      })
    );
    captureDispatchedCommands(commands);

    openAgentRunSource(harnessStore.state, "project-1", createRunFixture({ id: "agent-run-1", threadId: "thread-auto" }), "run");

    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.workspace.projects[0]?.activeThreadId).toBe("thread-user");
    expect(commands.map((command) => command.type)).not.toContain("thread.activate");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "inbox",
      selectedJobId: job.id,
      selectedRunId: run.id
    });
  });
});

createUiTest("hasLocalServerPreferenceOverride", () => {
  it("syncs browser-local background approval defaults back to the server", () => {
    expect(
      hasLocalServerPreferenceOverride(
        { backgroundJobApprovalPolicyDefault: "allow-all" },
        { ...defaultPreferencesFixture, backgroundJobApprovalPolicyDefault: "ask-risky" }
      )
    ).toBe(true);

    expect(
      hasLocalServerPreferenceOverride(
        { backgroundJobApprovalPolicyDefault: "allow-all" },
        { ...defaultPreferencesFixture, backgroundJobApprovalPolicyDefault: "allow-all" }
      )
    ).toBe(false);

    expect(
      hasLocalServerPreferenceOverride(
        { assistantAutoApproveNonBlockingQuestionsDefault: false },
        { ...defaultPreferencesFixture, assistantAutoApproveNonBlockingQuestionsDefault: true }
      )
    ).toBe(true);

    expect(
      hasLocalServerPreferenceOverride(
        { assistantAutoApproveNonBlockingQuestionsDefault: false },
        { ...defaultPreferencesFixture, assistantAutoApproveNonBlockingQuestionsDefault: false }
      )
    ).toBe(false);
  });
});
