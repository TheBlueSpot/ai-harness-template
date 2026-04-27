/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { ProjectSidebar } from "./project-sidebar";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { createProjectThreadSummary } from "../../../shared/protocol";

createUiTest("ProjectSidebar", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("shows streaming badge and only blocks destructive remove while streaming", () => {
    const project = createViewProjectFixture({
      id: "project-streaming",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      },
      threads: [
        {
          id: "thread-1",
          kind: "user",
          title: "Thread 1",
          titleSource: "generated",
          badgeState: "executing",
          messageCount: 3,
          updatedAt: new Date().toISOString()
        },
        {
          id: "thread-2",
          kind: "user",
          title: "Thread 2",
          titleSource: "generated",
          badgeState: "planning",
          messageCount: 1,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ProjectSidebar />);

    expect(screen.getByText("streaming")).not.toBeNull();
    expect((screen.getByRole("button", { name: `Create a new thread in ${project.name}` }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: `Remove ${project.name}` }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Thread 2").closest("button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Planning")).not.toBeNull();
  });

  it("renders thread badge labels and keeps remove enabled when not streaming", () => {
    const project = createViewProjectFixture({
      id: "project-idle",
      threads: [
        {
          id: "thread-1",
          kind: "user",
          title: "Thread 1",
          titleSource: "generated",
          badgeState: "done",
          messageCount: 4,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ProjectSidebar />);

    const doneBadge = screen.getByText("Done");
    expect(doneBadge.className).toContain("bg-emerald-600");
    expect((screen.getByRole("button", { name: `Remove ${project.name}` }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks remove when another thread is executing in the background", () => {
    const project = createViewProjectFixture({
      id: "project-background-stream",
      activeThreadId: "thread-2",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: false,
        messages: []
      },
      threads: [
        {
          id: "thread-1",
          kind: "user",
          title: "Thread 1",
          titleSource: "generated",
          badgeState: "executing",
          messageCount: 3,
          updatedAt: new Date().toISOString()
        },
        {
          id: "thread-2",
          kind: "user",
          title: "Thread 2",
          titleSource: "generated",
          badgeState: "idle",
          messageCount: 1,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ProjectSidebar />);

    expect((screen.getByRole("button", { name: `Remove ${project.name}` }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Thread 1").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides automation threads from sidebar thread list", () => {
    const project = createViewProjectFixture({
      id: "project-automation",
      threads: [
        {
          id: "thread-1",
          kind: "user",
          title: "Visible thread",
          titleSource: "generated",
          badgeState: "idle",
          messageCount: 1,
          updatedAt: new Date().toISOString()
        },
        {
          id: "thread-auto-1",
          kind: "automation",
          title: "Hidden automation thread",
          titleSource: "generated",
          badgeState: "idle",
          messageCount: 2,
          updatedAt: new Date().toISOString()
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ProjectSidebar />);

    expect(screen.getByText("1 threads")).not.toBeNull();
    expect(screen.queryByText("Hidden automation thread")).toBeNull();
    expect(screen.getByText("Visible thread")).not.toBeNull();
  });

  it("renders sort control and applies project sorting", () => {
    const older = "2026-01-01T00:00:00.000Z";
    const newer = "2026-01-02T00:00:00.000Z";
    const firstProject = createViewProjectFixture({
      id: "project-1",
      name: "repo-one",
      rootPath: "C:\\repos\\repo-one",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Older thread",
          titleSource: "generated",
          updatedAt: older,
          createdAt: older,
          lastUserMessageAt: older
        })
      ]
    });
    const secondProject = createViewProjectFixture({
      id: "project-2",
      name: "repo-two",
      rootPath: "C:\\repos\\repo-two",
      threads: [
        createProjectThreadSummary({
          id: "thread-2",
          title: "Newer thread",
          titleSource: "generated",
          updatedAt: newer,
          createdAt: newer,
          lastUserMessageAt: newer
        })
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSidebarPreferences: {
          projectSort: "last-user-message",
          threadSort: "last-user-message",
          grouping: "separate",
          manualProjectOrder: []
        },
        workspace: {
          activeProjectId: firstProject.id,
          projects: [firstProject, secondProject]
        }
      })
    );

    render(() => <ProjectSidebar />);

    expect(screen.getByRole("button", { name: "Sort projects" })).not.toBeNull();

    expect(
      screen.getByRole("button", { name: "Switch to repo-two" }).compareDocumentPosition(
        screen.getByRole("button", { name: "repo-one is active" })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    cleanup();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSidebarPreferences: {
          projectSort: "created-at",
          threadSort: "last-user-message",
          grouping: "separate",
          manualProjectOrder: []
        },
        workspace: {
          activeProjectId: firstProject.id,
          projects: [firstProject, secondProject]
        }
      })
    );
    render(() => <ProjectSidebar />);

    expect(
      screen.getByRole("button", { name: "repo-one is active" }).compareDocumentPosition(
        screen.getByRole("button", { name: "Switch to repo-two" })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("groups by parent path and supports manual keyboard reorder", () => {
    const projectOne = createViewProjectFixture({
      id: "project-1",
      name: "repo-one",
      rootPath: "C:\\repos\\alpha\\repo-one"
    });
    const projectTwo = createViewProjectFixture({
      id: "project-2",
      name: "repo-two",
      rootPath: "C:\\repos\\alpha\\repo-two"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSidebarPreferences: {
          projectSort: "manual",
          threadSort: "last-user-message",
          grouping: "repository-path",
          manualProjectOrder: ["project-1", "project-2"]
        },
        workspace: {
          activeProjectId: projectOne.id,
          projects: [projectOne, projectTwo]
        }
      })
    );

    render(() => <ProjectSidebar />);

    expect(screen.getByText("C:\\repos\\alpha")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Drag repo-one" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Move repo-two up" })).not.toBeNull();
  });
});
