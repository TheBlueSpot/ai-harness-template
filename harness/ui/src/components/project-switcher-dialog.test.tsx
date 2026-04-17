/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import {
  ProjectSwitcherDialog,
  getProjectSwitcherAutocompleteSuffix,
  shouldSearchProjects
} from "./project-switcher-dialog";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";

createUiTest("ProjectSwitcherDialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("shows recent projects on empty query", async () => {
    const activeProject = createViewProjectFixture({
      id: "project-1",
      name: "repo-one",
      rootPath: "C:\\repo-one"
    });
    const otherProject = createViewProjectFixture({
      id: "project-2",
      name: "repo-two",
      rootPath: "C:\\repo-two"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSwitcherOpen: true,
        workspace: {
          activeProjectId: activeProject.id,
          projects: [activeProject, otherProject]
        }
      })
    );

    render(() => <ProjectSwitcherDialog />);

    expect(await screen.findByRole("dialog", { name: "Open or switch project" })).not.toBeNull();
    expect(screen.getByText("repo-one")).not.toBeNull();
    expect(screen.getByText("repo-two")).not.toBeNull();
  });

  it("searches only for absolute paths or queries with at least two characters", async () => {
    expect(shouldSearchProjects("")).toBe(false);
    expect(shouldSearchProjects("r")).toBe(false);
    expect(shouldSearchProjects("re")).toBe(true);
    expect(shouldSearchProjects("C:\\re")).toBe(true);
  });

  it("moves selection with arrows and opens workspace results with Enter", async () => {
    const commands: unknown[] = [];
    const activeProject = createViewProjectFixture({
      id: "project-1",
      name: "repo-one",
      rootPath: "C:\\repo-one"
    });
    const otherProject = createViewProjectFixture({
      id: "project-2",
      name: "repo-two",
      rootPath: "C:\\repo-two"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSwitcherOpen: true,
        workspace: {
          activeProjectId: activeProject.id,
          projects: [activeProject, otherProject]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ProjectSwitcherDialog />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("project.activate");
    expect((commands[0] as { payload: { projectId: string } }).payload.projectId).toBe(otherProject.id);
  });

  it("computes prefix autocomplete suffix only for strict path-prefix matches", async () => {
    expect(getProjectSwitcherAutocompleteSuffix("C:\\re", "C:\\repo-one", "filesystem")).toBe("po-one");
    expect(getProjectSwitcherAutocompleteSuffix("C:\\repo-one", "C:\\repo-one", "filesystem")).toBeUndefined();
    expect(getProjectSwitcherAutocompleteSuffix("repo", "C:\\repo-one", "filesystem")).toBeUndefined();
  });

  it("opens filesystem results with Enter", async () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSwitcherOpen: true,
        projectSearchQuery: "repo",
        projectSearchFilesystemResults: [
          {
            id: "C:\\repo-three",
            name: "repo-three",
            rootPath: "C:\\repo-three",
            repoKind: "git-repo",
            matchKind: "name-prefix"
          }
        ]
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ProjectSwitcherDialog />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("project.add");
    expect((commands[0] as { payload: { rootPath: string } }).payload.rootPath).toBe("C:\\repo-three");
  });

  it("activates exact already-open paths instead of adding again", async () => {
    const commands: unknown[] = [];
    const activeProject = createViewProjectFixture({
      id: "project-1",
      name: "repo-one",
      rootPath: "C:\\repo-one"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSwitcherOpen: true,
        projectSearchQuery: "C:\\repo-one",
        workspace: {
          activeProjectId: "project-other",
          projects: [activeProject]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ProjectSwitcherDialog />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("project.activate");
    expect((commands[0] as { payload: { projectId: string } }).payload.projectId).toBe(activeProject.id);
  });

  it("keeps browse folder wired through typed command", async () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        projectSwitcherOpen: true
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <ProjectSwitcherDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Browse for project folder" }));

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("project.browse");
  });
});
