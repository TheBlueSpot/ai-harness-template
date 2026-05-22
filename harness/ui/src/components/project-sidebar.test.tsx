/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { ProjectSidebar } from "./project-sidebar";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { createChatMessage, createEmptySession, createProjectThreadSummary } from "../../../shared/protocol";
import { harnessStore, readProjectSidebarPreferences } from "../harness-store";

createUiTest("ProjectSidebar", () => {
  beforeEach(() => {
    cleanup();
    clearBrowserStateForTests();
  });

  it("uses shared left pane shell and empty-state presentation", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: undefined,
          projects: []
        }
      })
    );

    render(() => <ProjectSidebar />);

    expect(document.querySelector("[data-test-left-pane-shell][data-left-pane-kind='projects']")).not.toBeNull();
    expect(screen.getByText(/No workspace roots yet/i).closest("[data-test-left-pane-empty-state]")).not.toBeNull();
  });

  it("searches projects from the left panel above the project list", () => {
    const commands: unknown[] = [];
    const now = new Date().toISOString();
    const projectAlpha = createViewProjectFixture({
      id: "project-alpha-search",
      name: "Alpha dashboard",
      activeThreadId: "thread-alpha",
      session: {
        ...createEmptySession("thread-alpha"),
        messages: [createChatMessage("user", "Find billing regression")]
      },
      threads: [
        createProjectThreadSummary({
          id: "thread-alpha",
          title: "Alpha thread",
          titleSource: "custom",
          updatedAt: now,
          messageCount: 1,
          lastMessagePreview: "Find billing regression"
        })
      ]
    });
    const projectBilling = createViewProjectFixture({
      id: "project-billing-search",
      name: "Billing api",
      activeThreadId: "thread-billing",
      session: createEmptySession("thread-billing")
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: projectAlpha.id,
          projects: [projectAlpha, projectBilling]
        }
      })
    );
    captureDispatchedCommands(commands);

    render(() => <ProjectSidebar />);
    const search = screen.getByPlaceholderText("Search projects...");
    expect(search.compareDocumentPosition(screen.getByRole("button", { name: "Switch to Billing api" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.input(search, { target: { value: "billing" } });
    fireEvent.click(screen.getAllByText("Billing api")[0]!);

    expect(commands.at(-1)).toMatchObject({
      type: "project.activate",
      payload: { projectId: projectBilling.id }
    });
    expect(harnessStore.state.chatPaneTab).toBe("chat");
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

  it("activates the project before activating a thread in another project", () => {
    const currentProject = createViewProjectFixture({
      id: "project-current",
      name: "current-repo",
      activeThreadId: "thread-current",
      threads: [
        createProjectThreadSummary({
          id: "thread-current",
          title: "Current thread",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ]
    });
    const targetProject = createViewProjectFixture({
      id: "project-target",
      name: "target-repo",
      activeThreadId: "thread-target",
      threads: [
        createProjectThreadSummary({
          id: "thread-target",
          title: "Target thread",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: currentProject.id,
          projects: [currentProject, targetProject]
        }
      })
    );
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);

    render(() => <ProjectSidebar />);
    fireEvent.click(screen.getByText("Target thread").closest("button") as HTMLButtonElement);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      type: "project.activate",
      payload: { projectId: "project-target" }
    });
    expect(commands[1]).toMatchObject({
      type: "thread.activate",
      payload: { projectId: "project-target", threadId: "thread-target" }
    });
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

    const deleteButton = screen.getAllByRole("button", { name: "Delete" })[1] as HTMLButtonElement;
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

  it("pins threads above unpinned sort results and blocks pinned delete", () => {
    const older = "2026-01-01T00:00:00.000Z";
    const newer = "2026-01-02T00:00:00.000Z";
    const project = createViewProjectFixture({
      id: "project-pin-thread",
      activeThreadId: "thread-new",
      threads: [
        createProjectThreadSummary({
          id: "thread-new",
          title: "New unpinned",
          titleSource: "generated",
          updatedAt: newer,
          lastUserMessageAt: newer
        }),
        createProjectThreadSummary({
          id: "thread-old-pinned",
          title: "Old pinned",
          titleSource: "generated",
          pinned: true,
          updatedAt: older,
          lastUserMessageAt: older
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
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);

    render(() => <ProjectSidebar />);

    expect(
      screen.getByText("Old pinned").compareDocumentPosition(screen.getByText("New unpinned")) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect((screen.getAllByRole("button", { name: "Delete" })[0] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "thread.pin",
      payload: {
        projectId: "project-pin-thread",
        threadId: "thread-old-pinned",
        pinned: false
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
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timerCallbacks = new Map<number, () => void>();
    let nextTimerId = 0;
    globalThis.setTimeout = ((callback: TimerHandler, _delay?: number, ...args: unknown[]) => {
      const timerId = ++nextTimerId;
      timerCallbacks.set(timerId, () => {
        if (typeof callback === "function") {
          callback(...args);
        }
      });
      return timerId as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((timerId?: Parameters<typeof clearTimeout>[0]) => {
      timerCallbacks.delete(Number(timerId));
    }) as typeof clearTimeout;
    try {
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

      const deleteButton = screen.getAllByRole("button", { name: "Delete" })[1] as HTMLButtonElement;
      fireEvent.click(deleteButton);
      await Promise.resolve();
      for (const callback of [...timerCallbacks.values()]) {
        callback();
      }
      await Promise.resolve();
      fireEvent.click(deleteButton);

      expect(commands).toEqual([]);
      expect(deleteButton.className).toContain("text-rose-600");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
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

    expect(screen.getByRole("button", { name: "Sort and group projects" })).not.toBeNull();

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
      name: "collapse-project",
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
    expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(2);

    fireEvent.click(collapseButton);

    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: "Rename" })).toHaveLength(0);
    });
    expect(readProjectSidebarPreferences().collapsedProjectIds).toEqual([project.id]);

    fireEvent.click(screen.getByRole("button", { name: `Expand threads in ${project.name}` }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(2);
    });
    expect(readProjectSidebarPreferences().collapsedProjectIds).toEqual([]);
  });
});
