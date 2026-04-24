/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { render, screen } from "@solidjs/testing-library";
import { ProjectSidebar } from "./project-sidebar";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";

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
});
