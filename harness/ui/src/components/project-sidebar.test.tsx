/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ProjectSidebar } from "./project-sidebar";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { createProjectThreadSummary } from "../../../shared/protocol";
import { readProjectSidebarPreferences } from "../harness-store";

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
          status: "active",
          badgeState: "executing",
          messageCount: 3,
          updatedAt: new Date().toISOString()
        },
        {
          id: "thread-2",
          kind: "user",
          title: "Thread 2",
          titleSource: "generated",
          status: "active",
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
          status: "active",
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
          status: "active",
          badgeState: "executing",
          messageCount: 3,
          updatedAt: new Date().toISOString()
        },
        {
          id: "thread-2",
          kind: "user",
          title: "Thread 2",
          titleSource: "generated",
          status: "active",
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
          status: "active",
          badgeState: "idle",
          messageCount: 1,
          updatedAt: new Date().toISOString()
        },
        {
          id: "thread-auto-1",
          kind: "automation",
          title: "Hidden automation thread",
          titleSource: "generated",
          status: "active",
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

  it("hides archived threads from sidebar thread list", () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-archived",
      threads: [
        createProjectThreadSummary({
          id: "thread-active",
          title: "Visible thread",
          titleSource: "generated",
          status: "active",
          updatedAt: now
        }),
        createProjectThreadSummary({
          id: "thread-archived",
          title: "Archived thread",
          titleSource: "generated",
          status: "archived",
          updatedAt: now
        })
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
    expect(screen.queryByText("Archived thread")).toBeNull();
    expect(screen.getByText("Visible thread")).not.toBeNull();
  });

  it("requires a second delete click before archiving a thread", async () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-delete-thread",
      activeThreadId: "thread-1",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Active thread",
          titleSource: "generated",
          status: "active",
          updatedAt: now
        }),
        createProjectThreadSummary({
          id: "thread-2",
          title: "Thread to delete",
          titleSource: "generated",
          status: "active",
          updatedAt: now
        })
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
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);

    render(() => <ProjectSidebar />);

    const deleteButton = screen.getByRole("button", { name: "Delete Thread to delete" });
    fireEvent.click(deleteButton);
    await Promise.resolve();

    expect(commands).toEqual([]);
    expect(deleteButton.className).toContain("text-rose-600");

    fireEvent.click(deleteButton);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "thread.archive",
      payload: {
        projectId: "project-delete-thread",
        threadId: "thread-2"
      }
    });
  });

  it("renders cleanup button in the project toolbar", () => {
    const activeThreadAt = "2026-04-25T00:00:00.000Z";
    const oldThreadAt = "2026-01-01T00:00:00.000Z";
    const project = createViewProjectFixture({
      id: "project-cleanup",
      activeThreadId: "thread-active",
      threads: [
        createProjectThreadSummary({
          id: "thread-active",
          title: "Active thread",
          titleSource: "generated",
          updatedAt: activeThreadAt,
          lastUserMessageAt: activeThreadAt
        }),
        createProjectThreadSummary({
          id: "thread-old",
          title: "Old thread",
          titleSource: "generated",
          updatedAt: oldThreadAt,
          lastUserMessageAt: oldThreadAt
        })
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

    expect(screen.getByRole("button", { name: "Clean up old threads" })).not.toBeNull();
  });

  it("resets the pending delete state after two seconds", async () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-delete-reset",
      activeThreadId: "thread-1",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Active thread",
          titleSource: "generated",
          status: "active",
          updatedAt: now
        }),
        createProjectThreadSummary({
          id: "thread-2",
          title: "Thread to reset",
          titleSource: "generated",
          status: "active",
          updatedAt: now
        })
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
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);

    render(() => <ProjectSidebar />);

    const deleteButton = screen.getByRole("button", { name: "Delete Thread to reset" });
    fireEvent.click(deleteButton);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 2050));
    fireEvent.click(deleteButton);

    expect(commands).toEqual([]);
    expect(deleteButton.className).toContain("text-rose-600");
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
          manualProjectOrder: [],
          collapsedProjectIds: []
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
          manualProjectOrder: [],
          collapsedProjectIds: []
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
          manualProjectOrder: ["project-1", "project-2"],
          collapsedProjectIds: []
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

  it("unmounts non-manual project lists without dnd cleanup warnings", () => {
    const project = createViewProjectFixture({ id: "project-cleanup", name: "repo-cleanup" });
    const warn = mock(() => undefined);
    const originalWarn = console.warn;
    console.warn = warn;
    try {
      seedHarnessStoreForTests(
        createHarnessStateFixture({
          projectSidebarPreferences: {
            projectSort: "last-user-message",
            threadSort: "last-user-message",
            grouping: "separate",
            manualProjectOrder: [],
            collapsedProjectIds: []
          },
          workspace: {
            activeProjectId: project.id,
            projects: [project]
          }
        })
      );

      render(() => <ProjectSidebar />);
      cleanup();

      expect(warn.mock.calls).toEqual([]);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("toggles thread visibility per project and persists collapsed preferences", async () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-collapse",
      threads: [
        createProjectThreadSummary({
          id: "thread-1",
          title: "Visible thread",
          titleSource: "generated",
          updatedAt: now
        }),
        createProjectThreadSummary({
          id: "thread-2",
          title: "Second thread",
          titleSource: "generated",
          updatedAt: now
        })
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

    const collapseButton = screen.getByRole("button", { name: `Collapse threads in ${project.name}` });
    expect(screen.getByRole("button", { name: "Rename Visible thread" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Rename Second thread" })).not.toBeNull();

    fireEvent.click(collapseButton);
    await Promise.resolve();

    expect(screen.queryByRole("button", { name: "Rename Visible thread" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename Second thread" })).toBeNull();
    expect(readProjectSidebarPreferences().collapsedProjectIds).toEqual([project.id]);

    fireEvent.click(screen.getByRole("button", { name: `Expand threads in ${project.name}` }));
    await Promise.resolve();

    expect(screen.getByRole("button", { name: "Rename Visible thread" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Rename Second thread" })).not.toBeNull();
    expect(readProjectSidebarPreferences().collapsedProjectIds).toEqual([]);
  });
});
