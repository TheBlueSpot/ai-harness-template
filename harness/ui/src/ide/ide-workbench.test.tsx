/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { harnessStore } from "../harness-store";
import { createWorkspaceProjectState } from "../../../shared/protocol";

const createHotkeysMock = mock(() => undefined);
const createHotkeySequencesMock = mock(() => undefined);

mock.module("@tanstack/solid-hotkeys", () => ({
  createHotkeys: createHotkeysMock,
  createHotkeySequences: createHotkeySequencesMock,
  formatForDisplay: (hotkey: string) => hotkey
}));

import { IdeWorkbench, isIdeProjectSwitcherModKHotkey } from "./ide-workbench";
import { DEFAULT_IDE_EDITOR_SETTINGS, ideStore } from "./ide-store";

function getIdeHotkeyDefinitions() {
  const calls = createHotkeysMock.mock.calls as unknown as Array<
    [
      Array<{ hotkey: string; callback: () => void }> | (() => Array<{ hotkey: string; callback: () => void }>),
      () => { enabled: boolean; preventDefault: boolean; stopPropagation: boolean; ignoreInputs: boolean }
    ]
  >;
  const call = calls.find(([hotkeys]) => {
    const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
    return definitions.some((definition) => definition.hotkey === "Mod+Shift+P");
  });
  if (!call) {
    throw new Error("Expected IDE hotkey registration");
  }
  const [hotkeys, options] = call;
  return [typeof hotkeys === "function" ? hotkeys() : hotkeys, options] as [
    Array<{ hotkey: string; callback: () => void }>,
    () => { enabled: boolean; preventDefault: boolean; stopPropagation: boolean; ignoreInputs: boolean }
  ];
}

createUiTest("IdeWorkbench", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    const project = createWorkspaceProjectState({
      id: "project-1",
      name: "Harness",
      rootPath: "C:\\repo"
    });
    harnessStore.applyServerEvent({
      type: "workspace.updated",
      requestId: "req-workspace",
      payload: {
        workspace: {
          workspaceModes: [],
          projects: [project],
          activeProjectId: project.id
        }
      }
    });
    harnessStore.setActiveSurface("ide");
    ideStore.resetForTests();
    createHotkeysMock.mockClear();
    createHotkeySequencesMock.mockClear();
  });

  it("renders skeleton loaders before workbench data resolves", () => {
    ideStore.resetForTests({ treeLoading: true });
    render(() => <IdeWorkbench />);

    expect(document.querySelector("[data-test-ide-sidebar-skeleton]")).not.toBeNull();
    expect(document.querySelector("[data-test-ide-editor-skeleton]")).not.toBeNull();
  });

  it("registers IDE shortcuts with browser default interception", () => {
    render(() => <IdeWorkbench />);

    const [definitions, options] = getIdeHotkeyDefinitions();

    expect(definitions.map((definition) => definition.hotkey)).toEqual([
      "Mod+Shift+P",
      "Mod+P",
      "Mod+F",
      "Mod+Shift+F",
      "Mod+`",
      "Mod+Shift+E",
      "Mod+Shift+G",
      "Mod+S",
      "Mod+W",
      "Alt+W",
      "Mod+B",
      "Alt+Z"
    ]);
    expect(options()).toEqual({
      enabled: true,
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    });
    expect(createHotkeySequencesMock.mock.calls.length).toBe(1);
    const [sequences, sequenceOptions] = createHotkeySequencesMock.mock.calls[0] as unknown as [
      () => Array<{ sequence: string[]; callback: () => void }>,
      () => { enabled: boolean; preventDefault: boolean; stopPropagation: boolean; ignoreInputs: boolean }
    ];
    expect(sequences().map((definition) => definition.sequence)).toEqual([["Mod+Shift+W"], ["Alt+Shift+W"]]);
    expect(sequences().every((definition) => typeof definition.callback === "function")).toBe(true);
    expect(sequenceOptions()).toEqual({
      enabled: true,
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    });
  });

  it("switches IDE activity views from default shortcuts", () => {
    render(() => <IdeWorkbench />);

    const [definitions] = getIdeHotkeyDefinitions();
    definitions.find((definition) => definition.hotkey === "Mod+Shift+G")?.callback();
    expect(ideStore.state.activityView).toBe("source-control");
    expect(ideStore.state.sidebarOpen).toBe(true);

    definitions.find((definition) => definition.hotkey === "Mod+Shift+E")?.callback();
    expect(ideStore.state.activityView).toBe("explorer");
  });

  it("collapses the sidebar when the active IDE activity hotkey is pressed again", () => {
    render(() => <IdeWorkbench />);

    const [definitions] = getIdeHotkeyDefinitions();
    definitions.find((definition) => definition.hotkey === "Mod+Shift+E")?.callback();

    expect(ideStore.state.sidebarOpen).toBe(false);
  });

  it("collapses the sidebar when the active IDE activity button is clicked again", () => {
    render(() => <IdeWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Explorer" }));

    expect(ideStore.state.sidebarOpen).toBe(false);
  });

  it("marks the selected IDE activity tab active when the sidebar is open", () => {
    ideStore.resetForTests({ sidebarOpen: true, activityView: "source-control" });
    render(() => <IdeWorkbench />);

    const sourceControl = screen.getByRole("button", { name: "Source Control" });

    expect(sourceControl.classList.contains("ide-activity-button-active")).toBe(true);
    expect(sourceControl.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not mark an IDE activity tab active while the sidebar is hidden", () => {
    ideStore.resetForTests({ sidebarOpen: false, activityView: "source-control" });
    render(() => <IdeWorkbench />);

    const sourceControl = screen.getByRole("button", { name: "Source Control" });

    expect(sourceControl.classList.contains("ide-activity-button-active")).toBe(false);
    expect(sourceControl.getAttribute("aria-pressed")).toBe("false");
  });

  it("removes the active IDE activity styling when the sidebar is collapsed", async () => {
    ideStore.resetForTests({ sidebarOpen: true, activityView: "source-control" });
    render(() => <IdeWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Hide IDE sidebar" }));

    const sourceControl = screen.getByRole("button", { name: "Source Control" });
    expect(ideStore.state.sidebarOpen).toBe(false);
    await waitFor(() => {
      expect(sourceControl.classList.contains("ide-activity-button-active")).toBe(false);
      expect(document.querySelector(".ide-activity-bar")?.getAttribute("data-sidebar-open")).toBe("false");
    });
  });

  it("recognizes the project switcher Mod+K chord for IDE interception", () => {
    expect(isIdeProjectSwitcherModKHotkey("Mod+K")).toBe(true);
    expect(isIdeProjectSwitcherModKHotkey(" mod + k ")).toBe(true);
    expect(isIdeProjectSwitcherModKHotkey("Mod+Shift+K")).toBe(false);
  });

  it("renders IDE chrome for editor work", async () => {
    ideStore.resetForTests({
      treeEntries: [
        { path: "harness", name: "harness", kind: "directory", depth: 0 },
        { path: "harness/ui/src/ide/ide-workbench.tsx", name: "ide-workbench.tsx", kind: "file", depth: 1, parentPath: "harness" }
      ],
      openPaths: ["harness/ui/src/ide/ide-workbench.tsx"],
      activePath: "harness/ui/src/ide/ide-workbench.tsx",
      filesByPath: {
        "harness/ui/src/ide/ide-workbench.tsx": {
          projectId: "project-1",
          path: "harness/ui/src/ide/ide-workbench.tsx",
          name: "ide-workbench.tsx",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 32,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const value = true;",
          contentLines: ["export const value = true;"]
        }
      },
      gitBranch: "main",
      gitIsRepository: true
    });
    render(() => <IdeWorkbench />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    ideStore.applyServerEvent({
      type: "ide.fileTree.listed",
      requestId: "req-tree",
      payload: {
        projectId: "project-1",
        rootPath: "C:\\repo",
        truncated: false,
        entries: [
          { path: "harness", name: "harness", kind: "directory", depth: 0 },
          { path: "harness/ui/src/ide/ide-workbench.tsx", name: "ide-workbench.tsx", kind: "file", depth: 1, parentPath: "harness" }
        ]
      }
    });

    expect(screen.getByRole("button", { name: "Explorer" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Source Control" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Open ide-workbench.tsx" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Open command palette" })).not.toBeNull();
    expect(document.querySelectorAll("[data-test-ide-sash]").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ln 5, Col 12")).not.toBeNull();
  });

  it("applies nested git status color classes to folders and files", () => {
    ideStore.resetForTests({
      treeEntries: [
        { path: "src", name: "src", kind: "directory", depth: 0 },
        { path: "src/App.TSX", name: "App.TSX", kind: "file", depth: 1, parentPath: "src" }
      ],
      expandedFolderPaths: ["src"],
      gitIsRepository: true,
      gitChanges: [{ path: "src\\app.tsx", status: "modified", shortStatus: "M" }]
    });

    render(() => <IdeWorkbench />);

    expect(screen.getByRole("button", { name: "Collapse src" }).className).toContain("ide-tree-row-git-modified");
    expect(screen.getByRole("button", { name: "Open App.TSX" }).className).toContain("ide-tree-row-git-modified");
  });

  it("aggregates git status on folders without inheriting it to files", () => {
    ideStore.resetForTests({
      treeEntries: [
        { path: "docs", name: "docs", kind: "directory", depth: 0 },
        { path: "docs/research", name: "research", kind: "directory", depth: 1, parentPath: "docs" },
        { path: "docs/research/note.md", name: "note.md", kind: "file", depth: 2, parentPath: "docs/research" }
      ],
      expandedFolderPaths: ["docs", "docs/research"],
      gitIsRepository: true,
      gitChanges: [{ path: "docs/research/other.md", status: "modified", shortStatus: "M" }]
    });

    render(() => <IdeWorkbench />);

    expect(screen.getByRole("button", { name: "Collapse docs" }).className).toContain("ide-tree-row-git-modified");
    expect(screen.getByRole("button", { name: "Collapse research" }).className).toContain("ide-tree-row-git-modified");
    expect(screen.getByRole("button", { name: "Open note.md" }).className).not.toContain("ide-tree-row-git-modified");
  });

  it("uses orange over green when folder children include modified and untracked files", () => {
    ideStore.resetForTests({
      treeEntries: [
        { path: "docs", name: "docs", kind: "directory", depth: 0 },
        { path: "docs/modified.md", name: "modified.md", kind: "file", depth: 1, parentPath: "docs" },
        { path: "docs/new.md", name: "new.md", kind: "file", depth: 1, parentPath: "docs" }
      ],
      expandedFolderPaths: ["docs"],
      gitIsRepository: true,
      gitChanges: [
        { path: "docs/new.md", status: "untracked", shortStatus: "??" },
        { path: "docs/modified.md", status: "modified", shortStatus: "M" }
      ]
    });

    render(() => <IdeWorkbench />);

    expect(screen.getByRole("button", { name: "Collapse docs" }).className).toContain("ide-tree-row-git-modified");
    expect(screen.getByRole("button", { name: "Collapse docs" }).className).not.toContain("ide-tree-row-git-added");
    expect(screen.getByRole("button", { name: "Open modified.md" }).className).toContain("ide-tree-row-git-modified");
    expect(screen.getByRole("button", { name: "Open new.md" }).className).toContain("ide-tree-row-git-added");
  });

  it("requests real file tree, git status, and file reads", async () => {
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    ideStore.resetForTests();

    render(() => <IdeWorkbench />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    ideStore.loadProject("project-1");
    ideStore.applyServerEvent({
      type: "ide.fileTree.listed",
      requestId: "req-tree",
      payload: {
        projectId: "project-1",
        rootPath: "C:\\repo",
        truncated: false,
        entries: [{ path: "src/app.ts", name: "app.ts", kind: "file", depth: 0 }]
      }
    });
    ideStore.openFile("src/app.ts");

    expect(commands).toContainEqual({
      type: "ide.fileTree.list",
      requestId: expect.any(String),
      payload: { projectId: "project-1" }
    });
    expect(commands).toContainEqual({
      type: "ide.git.status",
      requestId: expect.any(String),
      payload: { projectId: "project-1" }
    });
    expect(commands).toContainEqual({
      type: "ide.file.read",
      requestId: expect.any(String),
      payload: { projectId: "project-1", path: "src/app.ts" }
    });
  });

  it("defers restored editor reads until an active project is available", async () => {
    const commands: unknown[] = [];
    const project = createWorkspaceProjectState({
      id: "project-restore",
      name: "Harness",
      rootPath: "C:\\repo"
    });
    harnessStore.resetForTests();
    harnessStore.setActiveSurface("ide");
    captureDispatchedCommands(commands);
    ideStore.resetForTests({
      openPaths: ["engine/browser/engine.js"],
      activePath: "engine/browser/engine.js"
    });

    const rendered = render(() => <IdeWorkbench />);
    await Promise.resolve();

    expect(commands.some((command) => (command as { type?: string }).type === "ide.file.read")).toBe(false);
    rendered.unmount();

    harnessStore.applyServerEvent({
      type: "workspace.updated",
      requestId: "req-workspace-restore",
      payload: {
        workspace: {
          workspaceModes: [],
          projects: [project],
          activeProjectId: project.id
        }
      }
    });
    commands.length = 0;
    ideStore.loadProject(project.id);

    expect(commands).toContainEqual({
      type: "ide.file.read",
      requestId: expect.any(String),
      payload: { projectId: "project-restore", path: "engine/browser/engine.js" }
    });
  });

  it("edits and saves active files through IDE write command", async () => {
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    ideStore.resetForTests({
      openPaths: ["src/app.ts"],
      activePath: "src/app.ts",
      filesByPath: {
        "src/app.ts": {
          projectId: "project-1",
          path: "src/app.ts",
          name: "app.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 23,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const ok = true;\n",
          contentLines: ["export const ok = true;"]
        }
      }
    });
    render(() => <IdeWorkbench />);

    const editor = screen.getByLabelText("Edit app.ts") as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "export const ok = false;\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save active file" }));

    expect(ideStore.state.dirtyPaths).toContain("src/app.ts");
    expect(commands).toContainEqual({
      type: "ide.file.write",
      requestId: expect.any(String),
      payload: { projectId: "project-1", path: "src/app.ts", content: "export const ok = false;\n" }
    });
  });

  it("updates the editor model when typing text", () => {
    ideStore.resetForTests({
      openPaths: ["src/app.ts"],
      activePath: "src/app.ts",
      filesByPath: {
        "src/app.ts": {
          projectId: "project-1",
          path: "src/app.ts",
          name: "app.ts",
          language: "Plain Text",
          encoding: "UTF-8",
          sizeBytes: 4,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "word",
          contentLines: ["word"]
        }
      }
    });
    render(() => <IdeWorkbench />);

    const editor = screen.getByLabelText("Edit app.ts") as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "words", selectionStart: 5, selectionEnd: 5 } });
    expect(ideStore.state.filesByPath["src/app.ts"]?.content).toBe("words");
    expect(editor.value).toBe("words");
  });

  it("applies word wrap to both the visible code layer and editor input", () => {
    ideStore.resetForTests({
      openPaths: ["src/app.ts"],
      activePath: "src/app.ts",
      editorSettings: { ...DEFAULT_IDE_EDITOR_SETTINGS, wordWrap: "on" },
      filesByPath: {
        "src/app.ts": {
          projectId: "project-1",
          path: "src/app.ts",
          name: "app.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 160,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const longValue = \"this line is intentionally long enough to require visual wrapping in the IDE editor\";",
          contentLines: ["export const longValue = \"this line is intentionally long enough to require visual wrapping in the IDE editor\";"]
        }
      }
    });

    render(() => <IdeWorkbench />);

    expect(document.querySelector('[data-test-ide-code-line="1"]')?.className).toContain("ide-code-line-wrap");
    expect(screen.getByLabelText("Edit app.ts").className).toContain("ide-code-input-wrap");
  });

  it("keeps overflowing editor tabs scrollable without a visible tab strip scrollbar", () => {
    ideStore.resetForTests({
      openPaths: ["src/one.ts", "src/two.ts"],
      activePath: "src/one.ts",
      filesByPath: {
        "src/one.ts": {
          projectId: "project-1",
          path: "src/one.ts",
          name: "one.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 18,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const one = 1;",
          contentLines: ["export const one = 1;"]
        },
        "src/two.ts": {
          projectId: "project-1",
          path: "src/two.ts",
          name: "two.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 18,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const two = 2;",
          contentLines: ["export const two = 2;"]
        }
      }
    });

    render(() => <IdeWorkbench />);

    const tabs = document.querySelector(".ide-editor-tabs");
    expect(tabs?.className).toContain("overflow-x-auto");
    expect(tabs?.className).toContain("overflow-y-hidden");
  });

  it("prevents browser default when closing a focused editor tab with Mod+W", async () => {
    ideStore.resetForTests({
      openPaths: ["src/app.ts"],
      activePath: "src/app.ts",
      filesByPath: {
        "src/app.ts": {
          projectId: "project-1",
          path: "src/app.ts",
          name: "app.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 23,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const ok = true;\n",
          contentLines: ["export const ok = true;"]
        }
      }
    });
    render(() => <IdeWorkbench />);
    await Promise.resolve();

    const editor = screen.getByLabelText("Edit app.ts");
    fireEvent.keyDown(editor, { key: "w", ctrlKey: true });

    expect(ideStore.state.openPaths).toEqual([]);
  });

  it("closes a focused editor tab with Alt+W", async () => {
    ideStore.resetForTests({
      openPaths: ["src/app.ts"],
      activePath: "src/app.ts",
      filesByPath: {
        "src/app.ts": {
          projectId: "project-1",
          path: "src/app.ts",
          name: "app.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 23,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const ok = true;\n",
          contentLines: ["export const ok = true;"]
        }
      }
    });
    render(() => <IdeWorkbench />);
    await Promise.resolve();

    const editor = screen.getByLabelText("Edit app.ts");
    fireEvent.keyDown(editor, { key: "w", altKey: true });

    expect(ideStore.state.openPaths).toEqual([]);
  });

  it("closes all editor tabs with Alt+Shift+W", async () => {
    ideStore.resetForTests({
      openPaths: ["src/app.ts", "src/two.ts"],
      activePath: "src/app.ts",
      filesByPath: {
        "src/app.ts": {
          projectId: "project-1",
          path: "src/app.ts",
          name: "app.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 23,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const ok = true;\n",
          contentLines: ["export const ok = true;"]
        },
        "src/two.ts": {
          projectId: "project-1",
          path: "src/two.ts",
          name: "two.ts",
          language: "TypeScript",
          encoding: "UTF-8",
          sizeBytes: 18,
          lineCount: 1,
          isBinary: false,
          tooLarge: false,
          content: "export const two = 2;",
          contentLines: ["export const two = 2;"]
        }
      }
    });
    render(() => <IdeWorkbench />);
    await Promise.resolve();

    const sequenceCall = createHotkeySequencesMock.mock.calls.at(-1) as unknown as [() => Array<{ sequence: string[]; callback: () => void }>];
    const altShiftCloseAll = sequenceCall[0]().find((definition) => definition.sequence.join(" ") === "Alt+Shift+W");
    altShiftCloseAll?.callback();

    expect(ideStore.state.openPaths).toEqual([]);
  });

  it("requests the parent window close when all editor tabs close", async () => {
    const close = mock(() => undefined);
    render(() => <IdeWorkbench onRequestClose={close} />);

    const sequenceCall = createHotkeySequencesMock.mock.calls.at(-1) as unknown as [() => Array<{ sequence: string[]; callback: () => void }>];
    sequenceCall[0]()[1]?.callback();
    await Promise.resolve();

    expect(close).toHaveBeenCalled();
  });
});
