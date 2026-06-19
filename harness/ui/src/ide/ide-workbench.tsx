import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, untrack } from "solid-js";
import { createHotkeys, createHotkeySequences, formatForDisplay } from "@tanstack/solid-hotkeys";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import {
  Braces,
  CaseSensitive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  FileCode2,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitPullRequest,
  PanelLeftClose,
  PanelLeftOpen,
  Regex,
  Replace,
  Save,
  Search,
  Settings,
  X
} from "lucide-solid";
import { ActionButton } from "../components/action-button";
import { ContextMenu, type ContextMenuAction } from "../components/primitives/context-menu";
import { Input } from "../components/primitives/input";
import { Tooltip } from "../components/primitives/tooltip";
import { harnessStore } from "../harness-store";
import { normalizeAppHotkeyPreferences, type AppHotkeyId } from "../lib/app-hotkeys";
import { cn } from "../lib/utils";
import { terminalStore } from "../terminal/terminal-store";
import { pushToast } from "../toast-store";
import { ideStore, type IdeActivityView, type IdeEditorFile } from "./ide-store";

type IdeFile = Pick<IdeEditorFile, "path" | "name" | "language" | "encoding" | "content" | "contentLines" | "cursorLine" | "cursorColumn" | "isBinary" | "tooLarge"> & {
  path: string;
  name: string;
  language: string;
  encoding: string;
  symbols: string[];
};

type IdeToast = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "warning" | "error";
};

type IdeContextMenu = {
  kind: "tab" | "editor" | "tree";
  x: number;
  y: number;
  filePath?: string;
};

type CompletionState = {
  x: number;
  y: number;
  path: string;
  position: number;
  prefix: string;
  items: string[];
};

type SymbolHoverState = {
  x: number;
  y: number;
  symbol: string;
  detail: string;
};

type EditorDraft = {
  path?: string;
  text: string;
  sourceText: string;
};

export type IdeWorkbenchProps = {
  onRequestClose?: () => void;
  onToggleWindowMode?: () => void;
  windowMode?: "docked" | "popped-out";
};

export function IdeWorkbench(props: IdeWorkbenchProps = {}) {
  const [handledOpenRequestId, setHandledOpenRequestId] = createSignal("");
  const [restoredActiveFileKey, setRestoredActiveFileKey] = createSignal("");
  const [cursorLine, setCursorLine] = createSignal(5);
  const [cursorColumn, setCursorColumn] = createSignal(12);
  const [contextMenu, setContextMenu] = createSignal<IdeContextMenu>();
  const [completionState, setCompletionState] = createSignal<CompletionState>();
  const [toasts, setToasts] = createSignal<IdeToast[]>([]);
  const [sidebarOpen, setSidebarOpenSignal] = createSignal(ideStore.state.sidebarOpen);
  const [activityView, setActivityViewSignal] = createSignal<IdeActivityView>(ideStore.state.activityView);
  let workbenchRef: HTMLElement | undefined;
  let documentFindInputRef: HTMLInputElement | undefined;
  let globalSearchInputRef: HTMLInputElement | undefined;

  const activeProject = createMemo(() => {
    const project = harnessStore.state.workspace.projects.find((candidate) => candidate.id === harnessStore.state.workspace.activeProjectId);
    return project ?? harnessStore.state.workspace.projects[0];
  });
  const fileForPath = (filePath: string): IdeFile => {
    const file = ideStore.state.filesByPath[filePath];
    if (file) {
      return { ...file, symbols: [] };
    }
    const name = filePath.split("/").at(-1) ?? filePath;
    return {
      path: filePath,
      name,
      language: inferLanguage(name),
      encoding: "UTF-8",
      symbols: [],
      isBinary: false,
      tooLarge: false,
      content: undefined,
      contentLines: [ideStore.state.pendingReadPath === filePath ? "Loading file..." : "Read-only preview unavailable."]
    };
  };
  const activeFile = createMemo(() => ideStore.state.activePath ? fileForPath(ideStore.state.activePath) : undefined);
  const openFiles = createMemo(() => ideStore.state.openPaths.map(fileForPath));
  const dirtyPaths = () => ideStore.state.dirtyPaths ?? [];
  const dirtyCount = createMemo(() => dirtyPaths().length);
  const hotkeyPreferences = () => normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
  const primaryHotkey = (id: AppHotkeyId) => hotkeyPreferences()[id][0];
  const hotkeyHint = (id: AppHotkeyId) => formatHotkeyDisplay(primaryHotkey(id));
  const commandPaletteCommands = createMemo(() => {
    const commands = [
      { id: "save", label: "File: Save", detail: hotkeyHint("ideSave"), run: () => ideStore.saveFile() },
      { id: "close-all", label: "View: Close All Editors", detail: "Close all open editor tabs", run: () => closeAllTabs() },
      { id: "toggle-sidebar", label: "View: Toggle Sidebar", detail: "Collapse or restore file explorer", run: () => toggleSidebar() },
      { id: "find", label: "Search: Find in File", detail: hotkeyHint("ideFindInFile"), run: () => openDocumentFind() },
      { id: "search", label: "Search: Find in Files", detail: hotkeyHint("ideFindInFiles"), run: () => openGlobalSearch() },
      { id: "window-mode", label: props.windowMode === "popped-out" ? "Window: Pop In" : "Window: Pop Out", detail: "Move IDE between main workspace and a separate window", run: () => props.onToggleWindowMode?.() }
    ];
    const query = ideStore.state.commandQuery.trim().toLowerCase();
    return query ? commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(query)) : commands;
  });

  const ideHotkeys = createMemo<CreateHotkeyDefinition[]>(() => [
    ...hotkeyPreferences().ideCommandPalette.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => ideStore.setCommandPalette(true),
        options: {
          meta: {
            name: "Command palette",
            description: "Open editor commands"
          }
        }
      })),
    ...hotkeyPreferences().ideQuickOpen.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => ideStore.setCommandPalette(true),
        options: {
          meta: {
            name: "Quick open",
            description: "Open quick commands"
          }
        }
      })),
    ...hotkeyPreferences().ideFindInFile.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => openDocumentFind(),
        options: {
          meta: {
            name: "Find in file",
            description: "Search current document"
          }
        }
      })),
    ...hotkeyPreferences().ideFindInFiles.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => openGlobalSearch(),
        options: {
          meta: {
            name: "Find in files",
            description: "Open global search panel"
          }
        }
      })),
    ...hotkeyPreferences().ideToggleTerminal.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => terminalStore.toggleOpen(),
        options: {
          meta: {
            name: "Integrated terminal",
            description: "Toggle the bottom terminal drawer"
          }
        }
      })),
    ...hotkeyPreferences().ideExplorer.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => {
          toggleActivityView("explorer");
        },
        options: {
          meta: {
            name: "Explorer",
            description: "Open file explorer"
          }
        }
      })),
    ...hotkeyPreferences().ideSourceControl.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => {
          toggleActivityView("source-control");
        },
        options: {
          meta: {
            name: "Source control",
            description: "Open source control"
          }
        }
      })),
    ...hotkeyPreferences().ideSave.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => ideStore.saveFile(),
        options: {
          meta: {
            name: "Save",
            description: "Save current editor"
          }
        }
      })),
    ...hotkeyPreferences().ideCloseEditor.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => closeCurrentTab(),
        options: {
          meta: {
            name: "Close tab",
            description: "Close current tab"
          }
        }
      })),
    ...hotkeyPreferences().ideToggleSidebar.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => toggleSidebar(),
        options: {
          meta: {
            name: "Toggle sidebar",
            description: "Collapse or restore the IDE sidebar"
          }
        }
      })),
    ...hotkeyPreferences().ideToggleWordWrap.map((hotkey) => (
      {
        hotkey: hotkey as never,
        callback: () => ideStore.setEditorSetting("wordWrap", ideStore.state.editorSettings.wordWrap === "on" ? "off" : "on"),
        options: {
          meta: {
            name: "Word wrap",
            description: "Toggle editor word wrap"
          }
        }
      }))
    ]);
  createHotkeys(
    ideHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );
  createHotkeySequences(
    () => hotkeyPreferences().ideCloseAllEditors.map((hotkey) => ({
      sequence: closeAllEditorSequence(hotkey) as never,
      callback: () => closeAllTabs()
    })),
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );

  createEffect(() => {
    const request = harnessStore.state.ideFileOpenRequest;
    if (!request || request.id === handledOpenRequestId()) {
      return;
    }
    setHandledOpenRequestId(request.id);
    openFileByPath(request.path, request.line, request.column);
  });

  createEffect(() => {
    const projectId = activeProject()?.id;
    if (projectId) {
      ideStore.loadProject(projectId);
    }
  });

  createEffect(() => {
    const projectId = activeProject()?.id;
    const activePath = ideStore.state.activePath;
    const restoreKey = projectId && activePath ? `${projectId}:${activePath}` : "";
    if (
      projectId &&
      activePath &&
      restoreKey !== restoredActiveFileKey() &&
      !ideStore.state.filesByPath[activePath] &&
      ideStore.state.pendingReadPath !== activePath
    ) {
      setRestoredActiveFileKey(restoreKey);
      ideStore.openFile(activePath);
    }
  });

  createEffect(() => {
    const query = ideStore.state.searchQuery;
    const regex = ideStore.state.regexSearch;
    const caseSensitive = ideStore.state.caseSensitiveSearch;
    const wholeWord = ideStore.state.wholeWordSearch;
    const timeout = window.setTimeout(() => {
      void query;
      void regex;
      void caseSensitive;
      void wholeWord;
      ideStore.runSearch();
    }, 220);
    onCleanup(() => window.clearTimeout(timeout));
  });

  onMount(() => {
    let closeAllChordUntil = 0;
    let closeAllChordTails: string[][] = [];
    const interceptBrowserShortcuts = (event: KeyboardEvent) => {
      const targetNode = event.target instanceof Node ? event.target : undefined;
      const eventInsideWorkbench = Boolean(targetNode && workbenchRef?.contains(targetNode));
      if (harnessStore.state.activeSurface !== "ide" && props.windowMode !== "popped-out" && !eventInsideWorkbench) {
        return;
      }
      const closeEditorHotkeys = hotkeyPreferences().ideCloseEditor;
      if (eventMatchesHotkeys(event, closeEditorHotkeys)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeCurrentTab();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideToggleSidebar)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleSidebar();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideFindInFiles)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openGlobalSearch();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideFindInFile)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openDocumentFind();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideExplorer)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleActivityView("explorer");
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideSourceControl)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleActivityView("source-control");
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideToggleTerminal)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        terminalStore.toggleOpen();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideSave)) {
        ideStore.saveFile();
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideCommandPalette) || eventMatchesHotkeys(event, hotkeyPreferences().ideQuickOpen)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        ideStore.setCommandPalette(true);
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideToggleWordWrap)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        ideStore.setEditorSetting("wordWrap", ideStore.state.editorSettings.wordWrap === "on" ? "off" : "on");
        return;
      }
      const closeAllSequences = hotkeyPreferences().ideCloseAllEditors.map(closeAllEditorSequence);
      if (closeAllSequences.some((sequence) => sequence.length === 1 && eventMatchesHotkeys(event, sequence))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeAllTabs();
        return;
      }
      const matchedCloseAllPrefixes = closeAllSequences.filter((sequence) => sequence.length > 1 && eventMatchesHotkeys(event, sequence.slice(0, 1)));
      if (matchedCloseAllPrefixes.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (matchedCloseAllPrefixes.some((sequence) => isIdeProjectSwitcherModKHotkey(sequence[0] ?? "")) && hotkeyPreferences().openProjectSwitcher.some(isIdeProjectSwitcherModKHotkey)) {
          harnessStore.openProjectSwitcher();
          return;
        }
        closeAllChordUntil = Date.now() + 1200;
        closeAllChordTails = matchedCloseAllPrefixes.map((sequence) => sequence.slice(1));
        return;
      }
      if (closeAllChordUntil > Date.now() && closeAllChordTails.some((sequence) => eventMatchesHotkeys(event, sequence))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeAllTabs();
        closeAllChordUntil = 0;
        closeAllChordTails = [];
        return;
      }
      closeAllChordUntil = 0;
      closeAllChordTails = [];
    };
    window.addEventListener("keydown", interceptBrowserShortcuts, { capture: true });
    document.addEventListener("keydown", interceptBrowserShortcuts, { capture: true });
    onCleanup(() => {
      window.removeEventListener("keydown", interceptBrowserShortcuts, { capture: true });
      document.removeEventListener("keydown", interceptBrowserShortcuts, { capture: true });
    });
  });

  function notify(title: string, detail: string, tone: IdeToast["tone"] = "info") {
    const id = `ide-toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { id, title, detail, tone }]);
    if (tone === "error") {
      pushToast(title, detail, "error");
    }
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  function openFileByPath(path: string, line?: number, column?: number) {
    const normalizedPath = path.replace(/\\/g, "/");
    ideStore.openFile(normalizedPath, line, column);
    if (line) {
      setCursorLine(line);
    }
    if (column) {
      setCursorColumn(column);
    }
  }

  function closeTab(path: string) {
    const next = ideStore.closeTab(path);
    closeIdeWindowIfEmpty(next);
  }

  function closeCurrentTab() {
    const currentPath = ideStore.state.activePath;
    if (currentPath) {
      closeTab(currentPath);
    }
  }

  function closeAllTabs() {
    ideStore.closeAllTabs();
    closeIdeWindowIfEmpty([]);
  }

  function closeOtherTabs(path: string) {
    ideStore.closeOtherTabs(path);
  }

  function openDocumentFind() {
    ideStore.setDocumentFindOpen(true);
    queueMicrotask(() => {
      documentFindInputRef?.focus();
      documentFindInputRef?.select();
    });
  }

  function openGlobalSearch() {
    openActivityView("search");
    queueMicrotask(() => {
      globalSearchInputRef?.focus();
      globalSearchInputRef?.select();
    });
  }

  function openActivityView(view: IdeActivityView) {
    setSidebarOpen(true);
    setActivityViewSignal(view);
    ideStore.setActivityView(view);
    syncActivityBarChrome(true, view);
  }

  function toggleActivityView(view: IdeActivityView) {
    if (sidebarOpen() && activityView() === view) {
      setSidebarOpen(false);
      return;
    }
    openActivityView(view);
  }

  function setSidebarOpen(open: boolean) {
    setSidebarOpenSignal(open);
    ideStore.setSidebarOpen(open);
    syncActivityBarChrome(open, activityView());
  }

  function toggleSidebar() {
    setSidebarOpen(!sidebarOpen());
  }

  function syncActivityBarChrome(open: boolean, view: IdeActivityView) {
    const activityBar = document.querySelector<HTMLElement>(".ide-activity-bar");
    if (!activityBar) {
      return;
    }
    activityBar.dataset.sidebarOpen = open ? "true" : "false";
    activityBar.querySelectorAll<HTMLButtonElement>(".ide-activity-button[data-activity-view]").forEach((button) => {
      const active = open && button.dataset.activityView === view;
      button.classList.toggle("ide-activity-button-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function startHorizontalResize(kind: "sidebar" | "editor", event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startSidebarWidth = ideStore.state.sidebarWidth;
    const startEditorWidth = ideStore.state.primaryEditorWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (kind === "sidebar") {
        ideStore.setSidebarWidth(Math.max(220, Math.min(420, startSidebarWidth + delta)));
        return;
      }
      ideStore.setPrimaryEditorWidth(Math.max(42, Math.min(72, startEditorWidth + delta / 12)));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function openContextMenu(kind: IdeContextMenu["kind"], event: MouseEvent, filePath?: string) {
    event.preventDefault();
    setContextMenu({ kind, x: event.clientX, y: event.clientY, filePath });
  }

  function closeIdeWindowIfEmpty(paths: string[]) {
    if (paths.length > 0) {
      return;
    }
    queueMicrotask(() => props.onRequestClose?.());
  }

  const contextMenuActions = createMemo<ContextMenuAction[]>(() => {
    const menu = contextMenu();
    if (!menu) {
      return [];
    }
    if (menu.kind === "tab") {
      const filePath = menu.filePath ?? ideStore.state.activePath ?? "";
      return [
        { id: "close-tab", label: "Close", shortcut: formatForDisplay("Mod+W"), onSelect: () => closeTab(filePath) },
        { id: "close-others", label: "Close Others", onSelect: () => closeOtherTabs(filePath) },
        { id: "close-all", label: "Close All", onSelect: closeAllTabs }
      ];
    }
    if (menu.kind === "tree") {
      return [
        { id: "open", label: "Open", onSelect: () => menu.filePath && openFileByPath(menu.filePath) },
        { id: "copy-path", label: "Copy Path", onSelect: () => notify("Path copied", menu.filePath ?? "Project path copied.") },
        { id: "refresh", label: "Refresh Explorer", onSelect: () => activeProject()?.id && ideStore.loadProject(activeProject()?.id) },
        { id: "reveal", label: "Reveal in Explorer", onSelect: () => openActivityView("explorer") }
      ];
    }
    return [
      { id: "format", label: "Format Document", shortcut: formatForDisplay("Shift+Alt+F"), onSelect: () => notify("Formatted", "Document formatting queued.") },
      { id: "symbol", label: "Go to Symbol", shortcut: formatForDisplay("Mod+Shift+O"), onSelect: () => ideStore.setCommandPalette(true) },
      { id: "definition", label: "Go to Definition", shortcut: "F12", onSelect: () => activeFile() && goToDefinition(activeFile()!, activeFile()!.cursorLine ?? cursorLine(), activeFile()!.cursorColumn ?? cursorColumn()) },
      { id: "run-selection", label: "Send Selection to Agent", onSelect: () => notify("Selection attached", "Selection ready for active harness thread.") }
    ];
  });

  function goToDefinition(file: IdeFile, line: number, column: number) {
    const symbol = getWordAtPosition(file.contentLines[line - 1] ?? "", column);
    const targetLine = findDefinitionLine(file.contentLines, symbol);
    if (!symbol || !targetLine) {
      notify("Definition not found", "No matching symbol definition in the active file.", "warning");
      return;
    }
    setCursorLine(targetLine);
    setCursorColumn(1);
    ideStore.setCursor(targetLine, 1);
    document.querySelector(`[data-test-ide-code-line="${targetLine}"]`)?.scrollIntoView({ block: "center" });
  }

  return (
    <section
      ref={workbenchRef}
      data-test-ide-workbench=""
      class="panel-shell ide-shell flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0"
    >
      <div class="flex min-h-0 flex-1">
        <Show when={sidebarOpen()} fallback={<ActivityBar active={undefined} sidebarOpen={false} onSelect={toggleActivityView} />}>
          <ActivityBar active={activityView()} sidebarOpen={true} onSelect={toggleActivityView} />
        </Show>

        <Show when={sidebarOpen()}>
          <aside class="ide-sidebar flex min-h-0 shrink-0 flex-col" style={{ width: `${ideStore.state.sidebarWidth}px` }}>
            <SidebarHeader
              active={activityView()}
              projectName={activeProject()?.name ?? "Workspace"}
              onCollapse={() => setSidebarOpen(false)}
              onCollapseAll={ideStore.collapseAllFolders}
            />
            <Show when={!ideStore.state.treeLoading} fallback={<SidebarSkeleton />}>
              <SwitchSidebar
                active={activityView()}
                searchQuery={ideStore.state.searchQuery}
                replaceQuery={ideStore.state.replaceQuery}
                regexSearch={ideStore.state.regexSearch}
                caseSensitiveSearch={ideStore.state.caseSensitiveSearch}
                wholeWordSearch={ideStore.state.wholeWordSearch}
                searchLoading={ideStore.state.searchLoading}
                searchResults={ideStore.state.searchResults}
                searchTruncated={ideStore.state.searchTruncated}
                searchInputRef={(element) => {
                  globalSearchInputRef = element;
                }}
                treeEntries={ideStore.state.treeEntries}
                treeError={ideStore.state.treeError}
                treeTruncated={ideStore.state.treeTruncated}
                gitBranch={ideStore.state.gitBranch}
                gitIsRepository={ideStore.state.gitIsRepository}
                gitChanges={ideStore.state.gitChanges}
                gitLoading={ideStore.state.gitLoading}
                onSearchQuery={ideStore.setSearchQuery}
                onReplaceQuery={ideStore.setReplaceQuery}
                onRegexSearch={ideStore.setRegexSearch}
                onCaseSensitiveSearch={ideStore.setCaseSensitiveSearch}
                onWholeWordSearch={ideStore.setWholeWordSearch}
                onOpenPath={openFileByPath}
                onContextMenu={openContextMenu}
              />
            </Show>
          </aside>
          <Sash label="Resize IDE sidebar" orientation="vertical" onPointerDown={(event) => startHorizontalResize("sidebar", event)} />
        </Show>

        <div class="ide-main flex min-w-0 flex-1 flex-col">
        <div class="ide-toolbar flex h-10 shrink-0 items-center justify-between gap-2 px-2">
          <div class="flex min-w-0 items-center gap-1.5">
            <ActionButton
              tooltip={`Save active file (${hotkeyHint("ideSave")})`}
              ariaLabel="Save active file"
              icon={<Save class="h-4 w-4" />}
              variant={dirtyPaths().includes(ideStore.state.activePath ?? "") ? "secondary" : "ghost"}
              size="icon"
              class="h-8 w-8 rounded-lg"
              onClick={() => ideStore.saveFile()}
            />
            <ActionButton
              tooltip={`${sidebarOpen() ? "Hide" : "Show"} IDE sidebar (${hotkeyHint("ideToggleSidebar")})`}
              ariaLabel={sidebarOpen() ? "Hide IDE sidebar" : "Show IDE sidebar"}
              icon={sidebarOpen() ? <PanelLeftClose class="h-4 w-4" /> : <PanelLeftOpen class="h-4 w-4" />}
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-lg"
              onClick={() => toggleSidebar()}
            />
            <ActionButton
              tooltip={`Open command palette (${hotkeyHint("ideCommandPalette")})`}
              ariaLabel="Open command palette"
              icon={<Code2 class="h-4 w-4" />}
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-lg"
              onClick={() => ideStore.setCommandPalette(true)}
            />
            <ActionButton
              tooltip={props.windowMode === "popped-out" ? "Pop IDE into main window" : "Pop IDE out to new window"}
              ariaLabel={props.windowMode === "popped-out" ? "Pop IDE into main window" : "Pop IDE out to new window"}
              icon={<ExternalLink class="h-4 w-4" />}
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-lg"
              onClick={props.onToggleWindowMode}
            />
            <Show when={ideStore.state.editorSettings.breadcrumbsEnabled}>
              <Breadcrumbs file={activeFile()} />
            </Show>
          </div>
        </div>

        <div class="ide-editor-tabs flex h-10 shrink-0 items-end overflow-x-auto overflow-y-hidden" data-open-count={openFiles().length}>
          <Show when={openFiles().length > 0} fallback={<div class="px-3 pb-2 text-xs text-(--muted)">No editors open</div>}>
            <For each={openFiles()}>
              {(file) => (
                <button
                  type="button"
                  data-test-ide-editor-tab=""
                  class={cn("ide-editor-tab group", ideStore.state.activePath === file.path ? "ide-editor-tab-active" : "")}
                  aria-label={`Open ${file.name}`}
                  onClick={() => ideStore.state.filesByPath[file.path] ? ideStore.setActivePath(file.path) : ideStore.openFile(file.path)}
                  onContextMenu={(event) => openContextMenu("tab", event, file.path)}
                >
                  <FileCode2 class="h-3.5 w-3.5" />
                  <span class="truncate">{dirtyPaths().includes(file.path) ? `${file.name} *` : file.name}</span>
                  <X class="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-70" onClick={(event) => { event.stopPropagation(); closeTab(file.path); }} />
                </button>
              )}
            </For>
          </Show>
        </div>

        <Show when={!ideStore.state.treeLoading} fallback={<EditorSkeleton />}>
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="flex min-h-0 flex-1">
              <EditorSurface
                file={activeFile()}
                widthPercent={ideStore.state.primaryEditorWidth}
                documentFindOpen={ideStore.state.documentFindOpen}
                documentFindQuery={ideStore.state.documentFindQuery}
                findInputRef={(element) => {
                  documentFindInputRef = element;
                }}
                onDocumentFindQuery={ideStore.setDocumentFindQuery}
                onDocumentFindClose={() => ideStore.setDocumentFindOpen(false)}
                wordWrap={ideStore.state.editorSettings.wordWrap}
                tabSize={ideStore.state.editorSettings.tabSize}
                bracketPairColorization={ideStore.state.editorSettings.bracketPairColorization}
                dirty={dirtyPaths().includes(activeFile()?.path ?? "")}
                completionState={completionState()}
                onCompletionClose={() => setCompletionState(undefined)}
                onCompletionSelect={(value) => {
                  const completion = completionState();
                  const file = activeFile();
                  if (!file || !completion) {
                    return;
                  }
                  ideStore.updateFileContent(file.path, applyCompletionAt(file.content ?? file.contentLines.join("\n"), completion.position, completion.prefix, value));
                  setCompletionState(undefined);
                }}
                onContentChange={(path, content) => ideStore.updateFileContent(path, content)}
                onSave={() => ideStore.saveFile()}
                onCloseTab={closeCurrentTab}
                onGoToDefinition={goToDefinition}
                onCompletionRequest={(x, y, path, position, prefix, items) => setCompletionState({ x, y, path, position, prefix, items })}
                onCursor={(line, column) => {
                  setCursorLine(line);
                  setCursorColumn(column);
                  ideStore.setCursor(line, column);
                }}
                onContextMenu={(event) => openContextMenu("editor", event)}
              />
            </div>
          </div>
        </Show>

        <StatusBar
          branch={ideStore.state.gitBranch ?? (ideStore.state.gitIsRepository ? "detached" : "no git")}
          dirtyCount={dirtyCount()}
          line={cursorLine()}
          column={cursorColumn()}
          encoding={activeFile()?.encoding ?? "UTF-8"}
          language={activeFile()?.language ?? "Plain Text"}
        />
        </div>
      </div>

      <CommandPalette
        open={ideStore.state.commandPaletteOpen}
        query={ideStore.state.commandQuery}
        commands={commandPaletteCommands()}
        onQuery={ideStore.setCommandQuery}
        onClose={() => {
          ideStore.setCommandPalette(false, "");
        }}
      />
      <ContextMenu
        open={Boolean(contextMenu())}
        x={contextMenu()?.x ?? 0}
        y={contextMenu()?.y ?? 0}
        ariaLabel="IDE context menu"
        actions={contextMenuActions()}
        onClose={() => setContextMenu(undefined)}
      />
      <IdeToasts toasts={toasts()} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </section>
  );
}

function ActivityBar(props: { active: IdeActivityView | undefined; sidebarOpen: boolean; onSelect: (view: IdeActivityView) => void }) {
  const views = [
    { id: "explorer" as const, label: "Explorer", hotkeyId: "ideExplorer" as const, icon: Files },
    { id: "search" as const, label: "Search", hotkeyId: "ideFindInFiles" as const, icon: Search },
    { id: "source-control" as const, label: "Source Control", hotkeyId: "ideSourceControl" as const, icon: GitBranch }
  ];
  const hotkeys = () => normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
  const tooltip = (label: string, hotkeyId: AppHotkeyId) => {
    const hotkey = hotkeys()[hotkeyId][0];
    return hotkey ? `${label} (${formatHotkeyDisplay(hotkey)})` : label;
  };

  return (
    <nav
      class="ide-activity-bar flex w-12 shrink-0 flex-col items-center gap-1 py-2"
      aria-label="IDE activity bar"
      data-sidebar-open={props.sidebarOpen ? "true" : "false"}
    >
      <For each={views}>
        {(view) => {
          const Icon = view.icon;
          const active = () => props.sidebarOpen && props.active === view.id;
          return (
            <Tooltip content={tooltip(view.label, view.hotkeyId)} side="right">
              <button
                type="button"
                class={cn("ide-activity-button", active() ? "ide-activity-button-active" : "")}
                aria-label={view.label}
                aria-pressed={active()}
                data-activity-view={view.id}
                onClick={() => props.onSelect(view.id)}
              >
                <Icon class="h-5 w-5" />
              </button>
            </Tooltip>
          );
        }}
      </For>
      <div class="min-h-0 flex-1" />
      <Tooltip content="Manage IDE settings" side="right">
        <button
          type="button"
          class="ide-activity-button"
          aria-label="Manage IDE settings"
          onClick={() => {
            harnessStore.openPreferencesModal();
            harnessStore.setPreferencesActiveSectionId("ide-settings");
          }}
        >
          <Settings class="h-5 w-5" />
        </button>
      </Tooltip>
    </nav>
  );
}

function SidebarHeader(props: { active: IdeActivityView; projectName: string; onCollapse: () => void; onCollapseAll: () => void }) {
  const title = () => props.active === "source-control" ? "Source Control" : props.active === "search" ? "Search" : "Explorer";
  return (
    <div class="ide-sidebar-header flex h-12 shrink-0 items-center justify-between gap-2 px-3">
      <div class="min-w-0">
        <div class="text-[0.62rem] font-semibold uppercase text-(--ide-muted)">{title()}</div>
        <button type="button" class="ide-sidebar-project-select" aria-label="Select project" onClick={() => harnessStore.openProjectSwitcher()}>
          <span class="truncate">{props.projectName}</span>
          <ChevronDown class="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>
      <div class="flex items-center gap-1">
        <ActionButton
          tooltip="Collapse all folders"
          ariaLabel="Collapse all folders"
          icon={<Files class="h-4 w-4" />}
          variant="ghost"
          size="icon"
          class="h-8 w-8 rounded-lg"
          onClick={props.onCollapseAll}
        />
        <ActionButton
          tooltip={`Collapse IDE sidebar (${formatHotkeyDisplay(normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).ideToggleSidebar[0])})`}
          ariaLabel="Collapse IDE sidebar"
          icon={<PanelLeftClose class="h-4 w-4" />}
          variant="ghost"
          size="icon"
          class="h-8 w-8 rounded-lg"
          onClick={props.onCollapse}
        />
      </div>
    </div>
  );
}

function SwitchSidebar(props: {
  active: IdeActivityView;
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchResults: import("../../../shared/protocol").IdeSearchResult[];
  searchTruncated: boolean;
  searchInputRef: (element: HTMLInputElement | undefined) => void;
  treeEntries: import("../../../shared/protocol").IdeFileTreeEntry[];
  treeError?: string;
  treeTruncated: boolean;
  gitBranch?: string;
  gitIsRepository: boolean;
  gitChanges: import("../../../shared/protocol").IdeGitChange[];
  gitLoading: boolean;
  onSearchQuery: (value: string) => void;
  onReplaceQuery: (value: string) => void;
  onRegexSearch: (value: boolean) => void;
  onCaseSensitiveSearch: (value: boolean) => void;
  onWholeWordSearch: (value: boolean) => void;
  onOpenPath: (path: string, line?: number, column?: number) => void;
  onContextMenu: (kind: IdeContextMenu["kind"], event: MouseEvent, filePath?: string) => void;
}) {
  const active = createMemo(() => props.active);
  return (
    <Switch fallback={<ExplorerView entries={props.treeEntries} error={props.treeError} truncated={props.treeTruncated} gitChanges={props.gitChanges} onOpenPath={props.onOpenPath} onContextMenu={props.onContextMenu} />}>
      <Match when={active() === "search"}>
        <GlobalSearchView {...props} />
      </Match>
      <Match when={active() === "source-control"}>
        <SourceControlView branch={props.gitBranch} isRepository={props.gitIsRepository} changes={props.gitChanges} loading={props.gitLoading} onOpenPath={props.onOpenPath} />
      </Match>
    </Switch>
  );
}

function ExplorerView(props: {
  entries: import("../../../shared/protocol").IdeFileTreeEntry[];
  error?: string;
  truncated: boolean;
  gitChanges: import("../../../shared/protocol").IdeGitChange[];
  onOpenPath: (path: string) => void;
  onContextMenu: (kind: IdeContextMenu["kind"], event: MouseEvent, filePath?: string) => void;
}) {
  const visibleEntries = createMemo(() => flattenVisibleTree(props.entries, ideStore.state.expandedFolderPaths));
  const expanded = createMemo(() => new Set(ideStore.state.expandedFolderPaths));
  const loading = createMemo(() => new Set(ideStore.state.loadingFolderPaths));
  const gitStatusByPath = createMemo(() => createGitStatusByPath(props.gitChanges));
  return (
    <div class="min-h-0 flex-1 overflow-auto px-2 py-2 text-xs">
      <Show when={!props.error} fallback={<div class="rounded-lg border border-dashed border-(--ide-border) p-3 text-xs text-(--ide-muted)">{props.error}</div>}>
        <Show when={props.entries.length > 0} fallback={<div class="rounded-lg border border-dashed border-(--ide-border) p-3 text-xs text-(--ide-muted)">No files found.</div>}>
          <For each={visibleEntries()}>
            {(entry) => (
              <FileRow
                entry={entry}
                expanded={expanded().has(entry.path)}
                loading={loading().has(entry.path)}
                gitStatus={findGitStatusForTreeEntry(gitStatusByPath(), entry)}
                onOpen={() => entry.kind === "file" ? props.onOpenPath(entry.path) : ideStore.toggleFolder(entry.path)}
                onContextMenu={(event) => props.onContextMenu("tree", event, entry.path)}
              />
            )}
          </For>
          <Show when={props.truncated}>
            <div class="px-2 py-2 text-[0.68rem] text-(--ide-muted)">File tree truncated.</div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function FileRow(props: { entry: import("../../../shared/protocol").IdeFileTreeEntry; expanded: boolean; loading: boolean; gitStatus?: GitStatusBadge; onOpen: () => void; onContextMenu: (event: MouseEvent) => void }) {
  return (
    <button
      type="button"
      class="ide-tree-row"
      classList={{
        "ide-tree-row-git": Boolean(props.gitStatus),
        [`ide-tree-row-git-${props.gitStatus?.tone}`]: Boolean(props.gitStatus)
      }}
      style={{ "padding-left": `${0.5 + props.entry.depth * 0.85}rem` }}
      aria-label={props.entry.kind === "file" ? `Open ${props.entry.name}` : `${props.expanded ? "Collapse" : "Expand"} ${props.entry.name}`}
      aria-expanded={props.entry.kind === "directory" ? props.expanded : undefined}
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
    >
      <Show when={props.entry.kind === "directory"} fallback={<FileCode2 class="h-3.5 w-3.5" />}>
        <Show when={props.entry.hasChildren !== false} fallback={<Folder class="h-3.5 w-3.5" />}>
          <span class="inline-flex items-center gap-0.5">
            {props.expanded ? <ChevronDown class="h-3.5 w-3.5" /> : <ChevronRight class="h-3.5 w-3.5" />}
            {props.expanded ? <FolderOpen class="h-3.5 w-3.5" /> : <Folder class="h-3.5 w-3.5" />}
          </span>
        </Show>
      </Show>
      <span class="truncate">{props.entry.name}{props.loading ? "..." : ""}</span>
      <Show when={props.gitStatus}>
        {(status) => <span class={`ide-git-badge ide-git-badge-${status().tone}`}>{status().label}</span>}
      </Show>
    </button>
  );
}

type GitStatusBadge = {
  label: string;
  tone: "modified" | "added";
  source: "file" | "folder";
};

function createGitStatusByPath(changes: import("../../../shared/protocol").IdeGitChange[]) {
  const statuses = new Map<string, GitStatusBadge>();
  for (const change of changes) {
    const fileStatus = toGitStatusBadge(change);
    if (!fileStatus) {
      continue;
    }
    const normalizedPath = normalizeGitStatusPath(change.path);
    statuses.set(normalizedPath, fileStatus);
    const parts = normalizedPath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const directoryPath = parts.slice(0, index).join("/");
      const current = statuses.get(directoryPath);
      if (!current || (current.source === "folder" && current.tone !== "modified" && fileStatus.tone === "modified")) {
        statuses.set(directoryPath, createFolderGitStatus(fileStatus.tone));
      }
    }
  }
  return statuses;
}

function findGitStatusForTreeEntry(statuses: Map<string, GitStatusBadge>, entry: import("../../../shared/protocol").IdeFileTreeEntry) {
  const exact = statuses.get(normalizeGitStatusPath(entry.path));
  if (!exact) {
    return undefined;
  }
  if (entry.kind === "file" && exact.source === "file") {
    return exact;
  }
  if (entry.kind === "directory") {
    return exact.source === "file" ? createFolderGitStatus(exact.tone) : exact;
  }
  return undefined;
}

function createFolderGitStatus(tone: GitStatusBadge["tone"]): GitStatusBadge {
  return { label: "*", tone, source: "folder" };
}

function normalizeGitStatusPath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function toGitStatusBadge(change: import("../../../shared/protocol").IdeGitChange): GitStatusBadge | undefined {
  if (change.status === "untracked" || change.status === "added") {
    return { label: change.shortStatus, tone: "added", source: "file" };
  }
  if (change.status === "modified") {
    return { label: change.shortStatus, tone: "modified", source: "file" };
  }
  return undefined;
}

function flattenVisibleTree(entries: import("../../../shared/protocol").IdeFileTreeEntry[], expandedFolderPaths: string[]) {
  const expanded = new Set(expandedFolderPaths);
  const byParent = new Map<string, import("../../../shared/protocol").IdeFileTreeEntry[]>();
  for (const entry of entries) {
    const parent = entry.parentPath ?? "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), entry]);
  }
  const sortEntries = (items: import("../../../shared/protocol").IdeFileTreeEntry[]) =>
    [...items].sort((left, right) => Number(right.kind === "directory") - Number(left.kind === "directory") || left.name.localeCompare(right.name));
  const output: import("../../../shared/protocol").IdeFileTreeEntry[] = [];
  const visit = (parentPath: string, depth: number) => {
    for (const entry of sortEntries(byParent.get(parentPath) ?? [])) {
      output.push({ ...entry, depth });
      if (entry.kind === "directory" && expanded.has(entry.path)) {
        visit(entry.path, depth + 1);
      }
    }
  };
  visit("", 0);
  return output;
}

function GlobalSearchView(props: {
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchResults: import("../../../shared/protocol").IdeSearchResult[];
  searchTruncated: boolean;
  searchInputRef: (element: HTMLInputElement | undefined) => void;
  onOpenPath: (path: string, line?: number, column?: number) => void;
  onSearchQuery: (value: string) => void;
  onReplaceQuery: (value: string) => void;
  onRegexSearch: (value: boolean) => void;
  onCaseSensitiveSearch: (value: boolean) => void;
  onWholeWordSearch: (value: boolean) => void;
}) {
  const resultCount = createMemo(() => props.searchResults.reduce((sum, result) => sum + result.matches.length, 0));
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <div class="flex flex-col gap-2">
        <Input ref={props.searchInputRef} aria-label="Find in files" placeholder="Find" value={props.searchQuery} onInput={(event) => props.onSearchQuery(event.currentTarget.value)} class="ide-input" />
        <Input aria-label="Replace in files" placeholder="Replace" value={props.replaceQuery} onInput={(event) => props.onReplaceQuery(event.currentTarget.value)} class="ide-input" />
        <div class="flex items-center gap-1">
          <ActionButton
            tooltip="Use regular expression search"
            ariaLabel="Use regular expression search"
            icon={<Regex class="h-3.5 w-3.5" />}
            variant={props.regexSearch ? "secondary" : "ghost"}
            size="icon"
            class="h-8 w-8 rounded-lg"
            onClick={() => props.onRegexSearch(!props.regexSearch)}
          />
          <ActionButton
            tooltip="Match case"
            ariaLabel="Match case"
            icon={<CaseSensitive class="h-3.5 w-3.5" />}
            variant={props.caseSensitiveSearch ? "secondary" : "ghost"}
            size="icon"
            class="h-8 w-8 rounded-lg"
            onClick={() => props.onCaseSensitiveSearch(!props.caseSensitiveSearch)}
          />
          <ActionButton
            tooltip="Match whole word"
            ariaLabel="Match whole word"
            icon={<Braces class="h-3.5 w-3.5" />}
            variant={props.wholeWordSearch ? "secondary" : "ghost"}
            size="icon"
            class="h-8 w-8 rounded-lg"
            onClick={() => props.onWholeWordSearch(!props.wholeWordSearch)}
          />
          <ActionButton tooltip="Replace is planned for the editing pass" icon={<Replace class="h-3.5 w-3.5" />} variant="secondary" size="sm">
            Replace
          </ActionButton>
        </div>
      </div>
      <div class="text-[0.65rem] font-semibold uppercase text-(--ide-muted)">
        {props.searchLoading ? "Searching..." : `${resultCount()} results${props.searchTruncated ? " (truncated)" : ""}`}
      </div>
      <Show when={resultCount() > 0} fallback={<div class="rounded-lg border border-dashed border-(--ide-border) p-3 text-xs text-(--ide-muted)">Type to search files.</div>}>
        <For each={props.searchResults}>
          {(result) => (
            <div class="rounded-lg border border-(--ide-border) bg-(--ide-row) p-2">
              <button type="button" class="block w-full truncate text-left text-xs font-semibold text-(--ide-text)" onClick={() => props.onOpenPath(result.path)}>
                {result.path}
              </button>
              <For each={result.matches}>
                {(match) => (
                  <button
                    type="button"
                    class="mt-1 block w-full truncate text-left font-mono text-[0.7rem] text-(--ide-muted)"
                    onClick={() => props.onOpenPath(result.path, match.line, match.column)}
                  >
                    {match.line}:{match.column} {match.preview}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function SourceControlView(props: {
  branch?: string;
  isRepository: boolean;
  changes: import("../../../shared/protocol").IdeGitChange[];
  loading: boolean;
  onOpenPath: (path: string) => void;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
      <div class="rounded-lg border border-(--ide-border) bg-(--ide-row) p-2">
        <div class="flex items-center gap-2 font-semibold text-(--ide-text)">
          <GitBranch class="h-3.5 w-3.5" />
          {props.branch ?? (props.isRepository ? "detached" : "No git repository")}
        </div>
        <div class="mt-1 text-(--ide-muted)">{props.loading ? "Loading..." : `${props.changes.length} pending changes`}</div>
      </div>
      <For each={props.changes}>
        {(item) => (
          <button type="button" class="ide-scm-row" onClick={() => props.onOpenPath(item.path)}>
            <span class="ide-scm-badge">{item.shortStatus}</span>
            <span class="truncate">{item.path}</span>
          </button>
        )}
      </For>
    </div>
  );
}

function Breadcrumbs(props: { file?: IdeFile }) {
  const parts = createMemo(() => props.file ? [...props.file.path.split("/"), ...props.file.symbols.slice(0, 1)] : ["No editor"]);
  return (
    <nav class="flex min-w-0 items-center gap-1 text-xs text-(--ide-muted)" aria-label="Editor breadcrumbs">
      <For each={parts()}>
        {(part, index) => (
          <>
            <span class={cn("truncate", index() === parts().length - 1 ? "font-semibold text-(--ide-text)" : "")}>{part}</span>
            <Show when={index() < parts().length - 1}>
              <ChevronRight class="h-3 w-3 shrink-0" />
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}

function EditorSurface(props: {
  file?: IdeFile;
  widthPercent: number;
  documentFindOpen: boolean;
  documentFindQuery: string;
  wordWrap: "off" | "on";
  tabSize: 2 | 4;
  bracketPairColorization: boolean;
  dirty: boolean;
  completionState?: CompletionState;
  findInputRef: (element: HTMLInputElement | undefined) => void;
  onDocumentFindQuery: (query: string) => void;
  onDocumentFindClose: () => void;
  onContentChange: (path: string, content: string) => void;
  onSave: () => void;
  onCloseTab: () => void;
  onGoToDefinition: (file: IdeFile, line: number, column: number) => void;
  onCompletionRequest: (x: number, y: number, path: string, position: number, prefix: string, items: string[]) => void;
  onCompletionSelect: (value: string) => void;
  onCompletionClose: () => void;
  onCursor: (line: number, column: number) => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  const [scrollPosition, setScrollPosition] = createSignal({ left: 0, top: 0 });
  const [symbolHover, setSymbolHover] = createSignal<SymbolHoverState>();
  const [draft, setDraft] = createSignal<EditorDraft>({ text: "", sourceText: "" });
  let textareaRef: HTMLTextAreaElement | undefined;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  const editorText = createMemo(() => {
    const file = props.file;
    if (!file) {
      return "";
    }
    const currentFile = ideStore.state.filesByPath[file.path];
    return currentFile?.content ?? currentFile?.contentLines.join("\n") ?? file.content ?? file.contentLines.join("\n") ?? "";
  });
  const displayedText = () => props.file?.path === draft().path ? draft().text : editorText();
  const displayedLines = () => displayedText().split(/\r\n|\r|\n/);
  const matchCount = createMemo(() => countDocumentMatches(displayedLines(), props.documentFindQuery));

  createEffect(() => {
    const file = props.file;
    const sourceText = editorText();
    const current = untrack(draft);
    setDraft(() => {
      if (current.path !== file?.path || current.sourceText !== sourceText) {
        if (current.path === file?.path && current.text !== current.sourceText && sourceText === current.sourceText) {
          return current;
        }
        if (current.path === file?.path && current.text === sourceText) {
          return { ...current, sourceText };
        }
        return { path: file?.path, text: sourceText, sourceText };
      }
      return current;
    });
  });

  onCleanup(() => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }
  });

  function updateCursor() {
    const textarea = textareaRef;
    if (!textarea) {
      return;
    }
    updateCursorFromTextarea(textarea);
  }

  function updateCursorFromTextarea(textarea: HTMLTextAreaElement) {
    if (!props.file) {
      return;
    }
    const before = textarea.value.slice(0, textarea.selectionStart).split("\n");
    props.onCursor(before.length, (before.at(-1)?.length ?? 0) + 1);
  }

  function handleInput(textarea: HTMLTextAreaElement) {
    const file = props.file;
    if (!file) {
      return;
    }
    const currentDraft = draft();
    setDraft({
      path: file.path,
      text: textarea.value,
      sourceText: currentDraft.path === file.path ? currentDraft.sourceText : editorText()
    });
    setScrollPosition({ left: textarea.scrollLeft, top: textarea.scrollTop });
    props.onContentChange(file.path, textarea.value);
    updateCursorFromTextarea(textarea);
  }

  function handleDefinition(event: MouseEvent | KeyboardEvent) {
    const file = props.file;
    if (!file) {
      return;
    }
    if (event instanceof MouseEvent && !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    const position = getTextPosition(textareaRef?.value ?? "", textareaRef?.selectionStart ?? 0);
    props.onCursor(position.line, position.column);
    props.onGoToDefinition(file, position.line, position.column);
  }

  function showCompletions() {
    const file = props.file;
    const textarea = textareaRef;
    if (!file || !textarea) {
      return;
    }
    const prefix = getCompletionPrefix(textarea.value, textarea.selectionStart);
    const items = buildCompletionItems(file, prefix);
    if (items.length > 0) {
      props.onCompletionRequest(64, 44, file.path, textarea.selectionStart, prefix, items);
    }
  }

  function clearSymbolHover() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
    setSymbolHover(undefined);
  }

  function scheduleSymbolHover(event: MouseEvent) {
    const file = props.file;
    const textarea = textareaRef;
    if (!file || !textarea) {
      clearSymbolHover();
      return;
    }

    const hoverTarget = getHoverTextPosition(textarea, event);
    const lineText = displayedLines()[hoverTarget.line - 1] ?? "";
    const symbol = getWordAtPosition(lineText, hoverTarget.column);
    if (!symbol) {
      clearSymbolHover();
      return;
    }

    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }
    const x = event.clientX;
    const y = event.clientY;
    hoverTimer = setTimeout(() => {
      const detail = describeSymbolHover(file, symbol);
      if (detail) {
        setSymbolHover({ x, y, symbol, detail });
      }
    }, 200);
  }

  return (
    <div class="ide-editor-surface relative min-w-0 flex-1 overflow-hidden" style={{ width: `${props.widthPercent}%` }} onContextMenu={props.onContextMenu}>
      <Show when={props.documentFindOpen}>
        <div class="ide-document-find absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-(--ide-border) bg-(--ide-surface) p-1 shadow-xl">
          <Search class="h-3.5 w-3.5 text-(--ide-muted)" />
          <input
            ref={props.findInputRef}
            class="h-7 w-44 bg-transparent px-1 text-xs text-(--ide-text) outline-none"
            aria-label="Find in current document"
            value={props.documentFindQuery}
            placeholder="Find"
            onInput={(event) => props.onDocumentFindQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                props.onDocumentFindClose();
              }
            }}
          />
          <span class="min-w-10 text-right text-[0.65rem] text-(--ide-muted)">{matchCount()}</span>
          <ActionButton
            tooltip="Close document search"
            ariaLabel="Close document search"
            icon={<X class="h-3.5 w-3.5" />}
            variant="ghost"
            size="icon"
            class="h-7 w-7 rounded-md"
            onClick={props.onDocumentFindClose}
          />
        </div>
      </Show>
      <Show when={props.file} fallback={<div class="flex h-full items-center justify-center text-xs text-(--ide-muted)">Open a file from Explorer.</div>}>
        {(file) => (
          <div class="relative h-full min-w-0 overflow-hidden font-mono text-[0.78rem] leading-6" style={{ "tab-size": String(props.tabSize) }}>
            <Show when={!file().isBinary && !file().tooLarge} fallback={<div class="p-3 text-xs text-(--ide-muted)">Binary or oversized file preview is unavailable.</div>}>
              <div
                class="pointer-events-none absolute inset-0 min-h-full p-3 pr-6"
                style={{ transform: `translate(${-scrollPosition().left}px, ${-scrollPosition().top}px)` }}
              >
                <For each={displayedLines()}>
                  {(line, index) => (
                    <div
                      data-test-ide-code-line={String(index() + 1)}
                      class="ide-code-line ide-code-line-preview grid grid-cols-[3rem_minmax(0,1fr)]"
                      classList={{ "ide-code-line-wrap": props.wordWrap === "on" }}
                    >
                      <span class="select-none pr-3 text-right text-(--ide-muted)">{index() + 1}</span>
                      <span data-test-ide-code-text={String(index() + 1)} class="ide-code-cell whitespace-pre" classList={{ "ide-code-line-colorized": props.bracketPairColorization }}>
                        <For each={syntaxHighlightLine(line, file().language)}>{(token) => <span class={`ide-token ide-token-${token.kind}`}>{token.text}</span>}</For>
                      </span>
                    </div>
                  )}
                </For>
              </div>
              <textarea
                ref={textareaRef}
                aria-label={`Edit ${file().name}`}
                spellcheck={false}
                class="ide-code-input absolute inset-0 h-full w-full resize-none p-3 pr-6 font-mono text-[0.78rem] leading-6 outline-none"
                classList={{ "ide-code-input-wrap": props.wordWrap === "on" }}
                value={displayedText()}
                onInput={(event) => handleInput(event.currentTarget)}
                onScroll={(event) => {
                  setScrollPosition({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop });
                  clearSymbolHover();
                }}
                onMouseMove={scheduleSymbolHover}
                onMouseLeave={clearSymbolHover}
                onClick={(event) => {
                  clearSymbolHover();
                  updateCursor();
                  handleDefinition(event);
                }}
                onKeyUp={updateCursor}
                onSelect={updateCursor}
                onKeyDown={(event) => {
                  clearSymbolHover();
                  if (eventMatchesHotkeys(event, normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).ideCloseEditor)) {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onCloseTab();
                    return;
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    props.onSave();
                    return;
                  }
                  if (event.key === "F12") {
                    handleDefinition(event);
                    return;
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key === " ") {
                    event.preventDefault();
                    showCompletions();
                    return;
                  }
                  props.onCompletionClose();
                }}
              />
              <Show when={props.completionState}>
                {(completion) => (
                  <div class="ide-completion absolute z-20 w-56 overflow-hidden rounded-lg border border-(--ide-border) bg-(--ide-surface) shadow-xl" style={{ left: `${completion().x}px`, top: `${completion().y}px` }}>
                    <For each={completion().items}>
                      {(item) => (
                        <button type="button" class="ide-completion-row" onMouseDown={(event) => event.preventDefault()} onClick={() => props.onCompletionSelect(item)}>
                          {item}
                        </button>
                      )}
                    </For>
                  </div>
                )}
              </Show>
              <Show when={symbolHover()}>
                {(hover) => (
                  <div
                    data-test-ide-symbol-tooltip=""
                    class="ide-symbol-tooltip fixed z-30 max-w-sm overflow-hidden rounded-lg border border-(--ide-border) bg-(--ide-surface) p-3 text-xs shadow-xl"
                    style={{ left: `${hover().x - 48}px`, top: `${hover().y - 88}px` }}
                  >
                    <div class="font-mono text-[0.72rem] font-semibold text-(--ide-text)">{hover().symbol}</div>
                    <div class="mt-1 whitespace-pre-wrap text-[0.68rem] leading-5 text-(--ide-muted)">{hover().detail}</div>
                  </div>
                )}
              </Show>
            </Show>
            <Show when={props.dirty}>
              <div class="absolute bottom-3 right-3 rounded-md border border-(--ide-border) bg-(--ide-surface) px-2 py-1 text-[0.65rem] font-semibold text-(--ide-muted)">Unsaved</div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

function countDocumentMatches(lines: string[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return "0/0";
  }
  const count = lines.reduce((sum, line) => {
    const value = line.toLowerCase();
    let index = value.indexOf(needle);
    let matches = 0;
    while (index >= 0) {
      matches += 1;
      index = value.indexOf(needle, index + Math.max(needle.length, 1));
    }
    return sum + matches;
  }, 0);
  return count ? `1/${count}` : "0/0";
}

type SyntaxToken = {
  text: string;
  kind: "plain" | "keyword" | "string" | "number" | "comment" | "property" | "punctuation";
};

const languageKeywords = new Map<string, Set<string>>([
  ["TypeScript", new Set(["async", "await", "break", "case", "catch", "class", "const", "continue", "default", "else", "export", "extends", "false", "for", "from", "function", "if", "import", "interface", "let", "new", "null", "return", "true", "try", "type", "undefined", "while"])],
  ["JavaScript", new Set(["async", "await", "break", "case", "catch", "class", "const", "continue", "default", "else", "export", "extends", "false", "for", "from", "function", "if", "import", "let", "new", "null", "return", "true", "try", "undefined", "while"])],
  ["Python", new Set(["and", "as", "async", "await", "class", "def", "elif", "else", "except", "False", "for", "from", "if", "import", "in", "is", "None", "not", "or", "pass", "return", "True", "try", "while", "with"])],
  ["Rust", new Set(["async", "await", "const", "crate", "else", "enum", "false", "fn", "for", "if", "impl", "let", "match", "mod", "mut", "pub", "return", "self", "struct", "true", "use", "where", "while"])],
  ["CSS", new Set(["display", "flex", "grid", "color", "background", "border", "padding", "margin", "width", "height", "position"])],
  ["HTML", new Set(["html", "head", "body", "script", "style", "div", "span", "button", "input", "section", "main"])],
  ["Markdown", new Set(["TODO", "NOTE", "FIXME"])],
  ["JSON", new Set(["true", "false", "null"])]
]);

function syntaxHighlightLine(line: string, language: string): SyntaxToken[] {
  const commentIndex = language === "Python" ? line.indexOf("#") : line.indexOf("//");
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const keywords = languageKeywords.get(language) ?? new Set<string>();
  const tokens: SyntaxToken[] = [];
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$-]*\b|[{}()[\].,:;=+\-*/<>!&|?]+)/g;
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ text: code.slice(cursor, index), kind: "plain" });
    }
    const text = match[0];
    const next = code.slice(index + text.length).trimStart();
    tokens.push({
      text,
      kind: /^["'`]/.test(text) ? "string" : /^\d/.test(text) ? "number" : keywords.has(text) ? "keyword" : next.startsWith(":") ? "property" : /^[{}()[\].,:;=+\-*/<>!&|?]+$/.test(text) ? "punctuation" : "plain"
    });
    cursor = index + text.length;
  }
  if (cursor < code.length) {
    tokens.push({ text: code.slice(cursor), kind: "plain" });
  }
  if (comment) {
    tokens.push({ text: comment, kind: "comment" });
  }
  return tokens.length > 0 ? tokens : [{ text: "", kind: "plain" }];
}

function getWordAtPosition(line: string, column: number) {
  const position = Math.max(0, column - 1);
  const left = line.slice(0, position).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? "";
  const right = line.slice(position).match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "";
  return `${left}${right}`;
}

function findDefinitionLine(lines: string[], symbol: string) {
  if (!symbol) {
    return undefined;
  }
  const escaped = escapeRegExp(symbol);
  const patterns = [
    new RegExp(`\\b(function|class|interface|type|const|let|var)\\s+${escaped}\\b`),
    new RegExp(`\\b${escaped}\\s*[:=]\\s*(async\\s*)?(function|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)`),
    new RegExp(`\\bdef\\s+${escaped}\\b`),
    new RegExp(`\\bfn\\s+${escaped}\\b`)
  ];
  const index = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
  return index >= 0 ? index + 1 : undefined;
}

function getCompletionPrefix(text: string, position: number) {
  return text.slice(0, position).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? "";
}

function buildCompletionItems(file: IdeFile, prefix: string) {
  const words = new Set<string>(languageKeywords.get(file.language) ?? []);
  for (const match of (file.content ?? file.contentLines.join("\n")).matchAll(/\b[A-Za-z_$][\w$]{2,}\b/g)) {
    words.add(match[0]);
  }
  return [...words]
    .filter((word) => word !== prefix && (!prefix || word.toLowerCase().startsWith(prefix.toLowerCase())))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);
}

function getHoverTextPosition(textarea: HTMLTextAreaElement, event: MouseEvent) {
  const rect = textarea.getBoundingClientRect();
  const computed = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const charWidth = getMonospaceCharacterWidth(textarea);
  const x = Math.max(0, event.clientX - rect.left + textarea.scrollLeft - paddingLeft);
  const y = Math.max(0, event.clientY - rect.top + textarea.scrollTop - paddingTop);
  return {
    line: Math.floor(y / lineHeight) + 1,
    column: Math.floor(x / charWidth) + 1
  };
}

function getMonospaceCharacterWidth(element: HTMLElement) {
  const computed = window.getComputedStyle(element);
  const probe = document.createElement("span");
  probe.textContent = "0000000000";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.fontFamily = computed.fontFamily;
  probe.style.fontSize = computed.fontSize;
  probe.style.fontWeight = computed.fontWeight;
  probe.style.letterSpacing = computed.letterSpacing;
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return width || 8;
}

function describeSymbolHover(file: IdeFile, symbol: string) {
  const definitionLine = findDefinitionLine(file.contentLines, symbol);
  const declaration = definitionLine ? file.contentLines[definitionLine - 1]?.trim() : undefined;
  const keyword = languageKeywords.get(file.language)?.has(symbol) ? `${symbol}: ${file.language} keyword` : undefined;
  if (declaration) {
    return `${declaration}\n\nDefined in ${file.name}:${definitionLine}`;
  }
  return keyword ?? `${symbol}: symbol\n\nNo local definition found.`;
}

function getTextPosition(text: string, position: number) {
  const before = text.slice(0, position).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

function applyCompletionAt(text: string, position: number, prefix: string, completion: string) {
  return `${text.slice(0, Math.max(0, position - prefix.length))}${completion}${text.slice(position)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferLanguage(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension === "tsx" || extension === "ts") {
    return "TypeScript";
  }
  if (extension === "jsx" || extension === "js") {
    return "JavaScript";
  }
  if (extension === "md") {
    return "Markdown";
  }
  if (extension === "json") {
    return "JSON";
  }
  return "Plain Text";
}

function StatusBar(props: { branch: string; dirtyCount: number; line: number; column: number; encoding: string; language: string }) {
  return (
    <footer class="ide-status-bar flex h-7 shrink-0 items-center justify-between gap-3 px-3 text-[0.68rem] font-medium">
      <div class="flex min-w-0 items-center gap-3">
        <span class="inline-flex items-center gap-1"><GitBranch class="h-3.5 w-3.5" />{props.branch}</span>
        <span class="inline-flex items-center gap-1"><GitCommit class="h-3.5 w-3.5" />{props.dirtyCount} dirty</span>
        <span class="inline-flex items-center gap-1"><GitPullRequest class="h-3.5 w-3.5" />0 PR</span>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <span>Ln {props.line}, Col {props.column}</span>
        <span>{props.encoding}</span>
        <span>{props.language}</span>
      </div>
    </footer>
  );
}

function CommandPalette(props: {
  open: boolean;
  query: string;
  commands: Array<{ id: string; label: string; detail: string; run: () => void }>;
  onQuery: (query: string) => void;
  onClose: () => void;
}) {
  const isOpen = createMemo(() => props.open);
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (isOpen()) {
      queueMicrotask(() => inputRef?.focus());
    }
  });

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 z-[90] bg-black/35 px-3 pt-[12vh]" onPointerDown={props.onClose}>
        <section class="ide-command-palette mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-(--ide-border) bg-(--ide-surface) shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
          <div class="flex items-center gap-2 border-b border-(--ide-border) px-3 py-2">
            <Code2 class="h-4 w-4 text-(--ide-muted)" />
            <input
              ref={inputRef}
              data-test-ide-command-input=""
              class="h-9 min-w-0 flex-1 bg-transparent text-sm text-(--ide-text) outline-none"
              aria-label="IDE command palette"
              value={props.query}
              placeholder="Type a command"
              onInput={(event) => props.onQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  props.onClose();
                }
                if (event.key === "Enter") {
                  props.commands[0]?.run();
                  props.onClose();
                }
              }}
            />
          </div>
          <div class="max-h-80 overflow-auto p-1.5">
            <For each={props.commands}>
              {(command) => (
                <button
                  type="button"
                  class="ide-command-row"
                  onClick={() => {
                    command.run();
                    props.onClose();
                  }}
                >
                  <span class="font-semibold text-(--ide-text)">{command.label}</span>
                  <span class="truncate text-(--ide-muted)">{command.detail}</span>
                </button>
              )}
            </For>
          </div>
        </section>
      </div>
    </Show>
  );
}

export function isIdeProjectSwitcherModKHotkey(hotkey: string) {
  return hotkey.toLowerCase().replace(/\s+/g, "") === "mod+k";
}

function formatHotkeyDisplay(hotkey: string | undefined) {
  if (!hotkey) {
    return "";
  }
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function closeAllEditorSequence(hotkey: string | undefined) {
  const normalized = hotkey?.replace(/\s+/g, "") || "Mod+K+W";
  const parts = normalized.split("+").filter(Boolean);
  if (parts.length >= 3 && parts.at(-2)?.toLowerCase() === "k") {
    return [`${parts.slice(0, -1).join("+")}`, parts.at(-1) ?? "W"];
  }
  return [normalized];
}

function eventMatchesHotkeys(event: KeyboardEvent, hotkeys: string[]) {
  return hotkeys.some((hotkey) => eventMatchesHotkey(event, hotkey));
}

function eventMatchesHotkey(event: KeyboardEvent, hotkey: string | undefined) {
  if (!hotkey) {
    return false;
  }
  const actual = normalizeKeyboardEventChord(event);
  const expected = normalizeHotkeyChord(hotkey);
  return actual.key === expected.key && actual.modifiers.size === expected.modifiers.size && [...actual.modifiers].every((modifier) => expected.modifiers.has(modifier));
}

function normalizeKeyboardEventChord(event: KeyboardEvent) {
  const modifiers = new Set<string>();
  if (event.metaKey || event.ctrlKey) {
    modifiers.add("mod");
  }
  if (event.altKey) {
    modifiers.add("alt");
  }
  if (event.shiftKey) {
    modifiers.add("shift");
  }
  return {
    modifiers,
    key: normalizeHotkeyKey(event.key === " " ? "space" : event.key)
  };
}

function normalizeHotkeyChord(hotkey: string) {
  const parts = hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  for (const part of parts.slice(0, -1)) {
    const normalized = part.toLowerCase();
    if (["mod", "meta", "cmd", "command", "ctrl", "control"].includes(normalized)) {
      modifiers.add("mod");
    } else if (normalized === "alt" || normalized === "option") {
      modifiers.add("alt");
    } else if (normalized === "shift") {
      modifiers.add("shift");
    }
  }
  return {
    modifiers,
    key: normalizeHotkeyKey(parts.at(-1) ?? "")
  };
}

function normalizeHotkeyKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase().replace(/^arrow/, "");
}

function Sash(props: { label: string; orientation: "vertical" | "horizontal"; onPointerDown: (event: PointerEvent) => void }) {
  return (
    <Tooltip content={props.label}>
      <button
        type="button"
        data-test-ide-sash=""
        class={props.orientation === "vertical" ? "ide-sash ide-sash-vertical" : "ide-sash ide-sash-horizontal"}
        aria-label={props.label}
        onPointerDown={props.onPointerDown}
      />
    </Tooltip>
  );
}

function SidebarSkeleton() {
  return (
    <div data-test-ide-sidebar-skeleton="" class="flex flex-col gap-2 p-3">
      <For each={[1, 2, 3, 4, 5, 6]}>
        {() => <div class="ide-skeleton h-7 rounded-lg" />}
      </For>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div data-test-ide-editor-skeleton="" class="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <div class="ide-skeleton h-7 w-2/5 rounded-lg" />
      <For each={[1, 2, 3, 4, 5, 6, 7]}>
        {(index) => <div class="ide-skeleton h-5 rounded-md" style={{ width: `${80 - index * 6}%` }} />}
      </For>
    </div>
  );
}

function IdeToasts(props: { toasts: IdeToast[]; onDismiss: (id: string) => void }) {
  return (
    <div class="pointer-events-none absolute bottom-10 right-4 z-[60] flex w-[min(22rem,calc(100%-2rem))] flex-col gap-2">
      <For each={props.toasts}>
        {(toast) => (
          <div
            class={cn(
              "pointer-events-auto rounded-xl border bg-(--ide-surface) p-3 text-xs shadow-2xl",
              toast.tone === "error" ? "border-red-400" : toast.tone === "warning" ? "border-amber-400" : "border-(--ide-border)"
            )}
          >
            <div class="flex items-start gap-2">
              <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-(--ide-accent)" />
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-(--ide-text)">{toast.title}</div>
                <div class="mt-1 text-(--ide-muted)">{toast.detail}</div>
              </div>
              <button type="button" class="text-(--ide-muted)" aria-label={`Dismiss ${toast.title}`} onClick={() => props.onDismiss(toast.id)}>
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
