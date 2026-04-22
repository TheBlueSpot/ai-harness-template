/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { render } from "@solidjs/testing-library";
import type {
  BackgroundRunStatusNotification,
  ClientCommand,
  PlanningQuestionNotification
} from "../../../shared/protocol";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { harnessStore } from "../harness-store";
import { NotificationInbox, activateProjectThreadFromInbox } from "./notification-inbox";

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
