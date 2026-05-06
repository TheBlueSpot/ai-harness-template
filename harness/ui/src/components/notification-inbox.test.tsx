/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { render } from "@solidjs/testing-library";
import type {
  Assistant,
  BackgroundJob,
  BackgroundJobRun,
  BackgroundRunStatusNotification,
  ClientCommand,
  PlanningQuestionNotification
} from "../../../shared/protocol";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { createEmptyAssistantsState, createEmptyBackgroundJobsState, harnessStore, type JobsRunFilter } from "../harness-store";
import { getAssistantQuestionDefaultChoices } from "../assistant-question-defaults";
import {
  NotificationInbox,
  activateProjectThreadFromInbox,
  openAssistantJobNotificationFromInbox,
  openBackgroundRunNotificationFromInbox
} from "./notification-inbox";

function isoNow() {
  return new Date().toISOString();
}

function planningQuestionNotification(
  overrides: Partial<PlanningQuestionNotification> = {}
): PlanningQuestionNotification {
  return {
    id: "planning-question:run-1:q-1",
    kind: "planning-question",
    interactive: true,
    createdAt: isoNow(),
    projectId: "project-1",
    threadId: "thread-1",
    runId: "run-1",
    questionId: "question-1",
    prompt: "Which approach do you want?",
    placeholder: "Type custom answer",
    choices: [
      {
        id: "choice-a",
        label: "Option A",
        description: "Fast path",
        answerText: "Go with option A",
        recommended: false
      }
    ],
    ...overrides
  };
}

function backgroundRunStatusNotification(
  overrides: Partial<BackgroundRunStatusNotification> = {}
): BackgroundRunStatusNotification {
  return {
    id: "background-run-status:bg-run-1",
    kind: "background-run-status",
    interactive: false,
    createdAt: isoNow(),
    backgroundRunId: "bg-run-1",
    jobId: "bg-job-1",
    projectId: "project-1",
    threadId: "thread-1",
    title: "Nightly build succeeded",
    summary: "Exit code 0",
    severity: "info",
    ...overrides
  };
}

function seedInbox(
  items: (PlanningQuestionNotification | BackgroundRunStatusNotification)[],
  unreadCount?: number
) {
  const interactiveUnread = items.filter((item) => item.interactive && !item.readAt).length;
  const passiveUnread = items.filter((item) => !item.interactive && !item.readAt).length;
  seedHarnessStoreForTests(
    createHarnessStateFixture({
      workspace: {
        activeProjectId: "project-1",
        projects: [
          createViewProjectFixture({
            id: "project-1",
            name: "repo-1",
            activeThreadId: "thread-1"
          })
        ]
      },
      notifications: {
        items,
        unreadCount: unreadCount ?? interactiveUnread + passiveUnread,
        interactiveUnreadCount: interactiveUnread,
        passiveUnreadCount: passiveUnread
      }
    })
  );
}

function createBackgroundRun(overrides: Partial<BackgroundJobRun> = {}): BackgroundJobRun {
  const now = isoNow();
  return {
    id: "bg-run-1",
    jobId: "bg-job-1",
    projectId: "project-1",
    automationThreadId: "thread-1",
    triggerSource: "manual",
    status: "succeeded",
    riskLevel: "safe",
    approvalStatus: "not-needed",
    skippedOccurrenceCount: 0,
    summary: "Done",
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
    events: [],
    ...overrides
  };
}

createUiTest("NotificationInbox", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders unread badge when items are unread", () => {
    seedInbox([planningQuestionNotification()]);
    expect(harnessStore.state.notifications.unreadCount).toBe(1);
    render(() => <NotificationInbox />);
    expect(document.querySelector(".bg-rose-600")).not.toBeNull();
  });

  it("hides the unread badge when no notifications are unread", () => {
    seedInbox([backgroundRunStatusNotification({ readAt: isoNow() })]);
    expect(harnessStore.state.notifications.unreadCount).toBe(0);
    render(() => <NotificationInbox />);
    expect(document.querySelector(".bg-rose-600")).toBeNull();
  });

  it("defines three assistant question default answers with one recommendation", () => {
    const choices = getAssistantQuestionDefaultChoices();

    expect(choices).toHaveLength(3);
    expect(choices.filter((choice) => choice.recommended)).toHaveLength(1);
    expect(choices.map((choice) => choice.label)).toEqual(["Use judgment", "Do other work", "Wait"]);
    expect(choices.every((choice) => choice.answerText.trim().length > 0)).toBe(true);
  });
});

createUiTest("activateProjectThreadFromInbox", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("dispatches project.activate before thread.activate when switching projects", () => {
    // Regression: previously the client skipped thread.activate when the target
    // project's cached activeThreadId matched threadId, relying on stale local
    // state. The server now receives an authoritative (project, thread) pair
    // every time we cross a project boundary.
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: "project-current",
          projects: [
            createViewProjectFixture({ id: "project-current", activeThreadId: "thread-current" }),
            createViewProjectFixture({ id: "project-target", activeThreadId: "thread-target" })
          ]
        }
      })
    );

    const commands: ClientCommand[] = [];
    activateProjectThreadFromInbox(
      harnessStore.state,
      "project-target",
      "thread-target",
      (command) => commands.push(command)
    );

    expect(commands.length).toBe(2);
    expect(commands[0]).toMatchObject({
      type: "project.activate",
      payload: { projectId: "project-target" }
    });
    expect(commands[1]).toMatchObject({
      type: "thread.activate",
      payload: { projectId: "project-target", threadId: "thread-target" }
    });
  });

  it("still issues thread.activate when the cached activeThreadId matches the target", () => {
    // Regression for the exact skip-thread-activate bug: same threadId on both
    // projects must NOT cause us to drop the thread.activate command.
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: "project-current",
          projects: [
            createViewProjectFixture({ id: "project-current", activeThreadId: "thread-shared" }),
            createViewProjectFixture({ id: "project-target", activeThreadId: "thread-shared" })
          ]
        }
      })
    );

    const commands: ClientCommand[] = [];
    activateProjectThreadFromInbox(
      harnessStore.state,
      "project-target",
      "thread-shared",
      (command) => commands.push(command)
    );

    expect(commands.map((command) => command.type)).toEqual([
      "project.activate",
      "thread.activate"
    ]);
  });

  it("skips both commands when project and thread are already active", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: "project-current",
          projects: [createViewProjectFixture({ id: "project-current", activeThreadId: "thread-current" })]
        }
      })
    );

    const commands: ClientCommand[] = [];
    activateProjectThreadFromInbox(
      harnessStore.state,
      "project-current",
      "thread-current",
      (command) => commands.push(command)
    );

    expect(commands.length).toBe(0);
  });

  it("issues only thread.activate when project is active but thread differs", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: "project-current",
          projects: [createViewProjectFixture({ id: "project-current", activeThreadId: "thread-a" })]
        }
      })
    );

    const commands: ClientCommand[] = [];
    activateProjectThreadFromInbox(
      harnessStore.state,
      "project-current",
      "thread-b",
      (command) => commands.push(command)
    );

    expect(commands.length).toBe(1);
    expect(commands[0]).toMatchObject({
      type: "thread.activate",
      payload: { projectId: "project-current", threadId: "thread-b" }
    });
  });
});

createUiTest("openAssistantJobNotificationFromInbox", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("opens assistant log tab for assistant-owned background notifications", () => {
    const now = isoNow();
    const assistant: Assistant = {
      id: "assistant-1",
      name: "Release watcher",
      scope: "project",
      projectId: "project-1",
      description: "Watch releases",
      personalityPrompt: "Be concise.",
      jobPrompt: "Scan releases.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      latestActivityAt: now,
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const job: BackgroundJob = {
      id: "bg-job-1",
      projectId: "project-1",
      assistantId: "assistant-1",
      automationThreadId: "thread-1",
      kind: "ai-routine",
      name: "Release scan",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Scan releases",
        planExecutionMode: "immediate",
        subagentWorktreeStrategy: "same-worktree"
      },
      schedule: { type: "one-off", runAt: now, sourceText: "manual" },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "bg-run-1",
      jobId: "bg-job-1",
      projectId: "project-1",
      assistantId: "assistant-1",
      automationThreadId: "thread-1",
      triggerSource: "manual",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      summary: "Done",
      queuedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };
    const notification = backgroundRunStatusNotification();

    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: "project-1",
          projects: [createViewProjectFixture({ id: "project-1", activeThreadId: "thread-1" })]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          assistants: [assistant]
        },
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          jobs: [job],
          runs: [run]
        }
      })
    );

    expect(openAssistantJobNotificationFromInbox(harnessStore.state, notification)).toBe(true);
    expect(harnessStore.state.activeSurface).toBe("assistants");
    expect(harnessStore.state.assistants.selectedAssistantId).toBe("assistant-1");
    expect(harnessStore.state.assistants.selectedTab).toBe("log");
    expect(harnessStore.state.assistants.scopeFilter).toBe("project");
  });

  it("leaves generic background notifications on the jobs path", () => {
    seedHarnessStoreForTests(createHarnessStateFixture());

    expect(openAssistantJobNotificationFromInbox(harnessStore.state, backgroundRunStatusNotification())).toBe(false);
    expect(harnessStore.state.activeSurface).toBe("chat");
    expect(harnessStore.state.assistants.selectedTab).toBe("chat");
  });
});

createUiTest("openBackgroundRunNotificationFromInbox", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("opens generic background run notifications on selected runs details", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          runs: [createBackgroundRun({ status: "running", summary: "Running" })]
        }
      })
    );

    openBackgroundRunNotificationFromInbox(harnessStore.state, backgroundRunStatusNotification());

    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.jobsRunFilter).toBe("running");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "inbox",
      selectedRunId: "bg-run-1",
      selectedJobId: "bg-job-1",
      selectedNotificationId: undefined
    });
    expect(harnessStore.state.backgroundJobDetailsRunId).toBeUndefined();
  });

  it("switches run notification clicks to the selected run status filter", () => {
    const cases: Array<[BackgroundJobRun["status"], BackgroundJobRun["approvalStatus"], JobsRunFilter]> = [
      ["awaiting-approval", "pending", "approval"],
      ["awaiting-user-input", "not-needed", "approval"],
      ["queued", "not-needed", "queued"],
      ["running", "not-needed", "running"],
      ["failed", "not-needed", "failed"],
      ["cancelled", "not-needed", "failed"],
      ["succeeded", "not-needed", "done"],
      ["skipped", "not-needed", "done"]
    ];

    for (const [status, approvalStatus, expectedFilter] of cases) {
      seedHarnessStoreForTests(
        createHarnessStateFixture({
          backgroundJobs: {
            ...createEmptyBackgroundJobsState(),
            runs: [createBackgroundRun({ status, approvalStatus })]
          },
          jobsRunFilter: expectedFilter === "failed" ? "running" : "failed"
        })
      );

      openBackgroundRunNotificationFromInbox(harnessStore.state, backgroundRunStatusNotification());

      expect(harnessStore.state.jobsRunFilter).toBe(expectedFilter);
      expect(harnessStore.state.jobsPanePreferences.selectedRunId).toBe("bg-run-1");
    }
  });

  it("opens assistant-owned background run notifications in runs details", () => {
    const now = isoNow();
    const assistant: Assistant = {
      id: "assistant-1",
      name: "Release watcher",
      scope: "project",
      projectId: "project-1",
      description: "Watch releases",
      personalityPrompt: "Be concise.",
      jobPrompt: "Scan releases.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      latestActivityAt: now,
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const job: BackgroundJob = {
      id: "bg-job-1",
      projectId: "project-1",
      assistantId: "assistant-1",
      automationThreadId: "thread-1",
      kind: "ai-routine",
      name: "Release scan",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Scan releases",
        planExecutionMode: "immediate",
        subagentWorktreeStrategy: "same-worktree"
      },
      schedule: { type: "one-off", runAt: now, sourceText: "manual" },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "bg-run-1",
      jobId: "bg-job-1",
      projectId: "project-1",
      assistantId: "assistant-1",
      automationThreadId: "thread-1",
      triggerSource: "manual",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      summary: "Done",
      queuedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };

    seedHarnessStoreForTests(
      createHarnessStateFixture({
        assistants: {
          ...createEmptyAssistantsState(),
          assistants: [assistant]
        },
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          jobs: [job],
          runs: [run]
        }
      })
    );

    openBackgroundRunNotificationFromInbox(harnessStore.state, backgroundRunStatusNotification());

    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "inbox",
      selectedRunId: "bg-run-1",
      selectedJobId: "bg-job-1"
    });
    expect(harnessStore.state.assistants.selectedAssistantId).toBeUndefined();
  });
});
