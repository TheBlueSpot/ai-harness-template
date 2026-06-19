import { createStore, reconcile } from "solid-js/store";
import { createRequestId, type ClientCommand, type IdeFileRead, type IdeFileTreeEntry, type IdeGitChange, type IdeSearchResult, type ServerEvent } from "../../../shared/protocol";
import { harnessStore } from "../harness-store";
import { pushToast } from "../toast-store";

export type IdeActivityView = "explorer" | "search" | "source-control";
export type IdeAutoSaveMode = "off" | "afterDelay" | "onFocusChange";
export type IdeWordWrapMode = "off" | "on";
export type IdeIndentStyle = "spaces" | "tabs";
export type IdeTabSize = 2 | 4;

export type IdeEditorSettings = {
  autoSave: IdeAutoSaveMode;
  wordWrap: IdeWordWrapMode;
  insertSpaces: IdeIndentStyle;
  tabSize: IdeTabSize;
  formatOnSave: boolean;
  breadcrumbsEnabled: boolean;
  bracketPairColorization: boolean;
};

export type IdeEditorFile = IdeFileRead & {
  contentLines: string[];
  cursorLine?: number;
  cursorColumn?: number;
};

export type IdeUiState = {
  activityView: IdeActivityView;
  sidebarOpen: boolean;
  sidebarWidth: number;
  primaryEditorWidth: number;
  commandPaletteOpen: boolean;
  commandQuery: string;
  documentFindOpen: boolean;
  documentFindQuery: string;
  treeLoading: boolean;
  treeError?: string;
  treeRootPath?: string;
  treeEntries: IdeFileTreeEntry[];
  treeTruncated: boolean;
  expandedFolderPaths: string[];
  loadingFolderPaths: string[];
  openPaths: string[];
  activePath?: string;
  filesByPath: Record<string, IdeEditorFile>;
  dirtyPaths: string[];
  savingPaths: string[];
  pendingReadPath?: string;
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchPendingRequestId?: string;
  searchResults: IdeSearchResult[];
  searchTruncated: boolean;
  gitLoading: boolean;
  gitBranch?: string;
  gitIsRepository: boolean;
  gitChanges: IdeGitChange[];
  editorSettings: IdeEditorSettings;
};

const IDE_STATE_STORAGE_KEY = "pi-harness:ide-ui-state:v1";
export const DEFAULT_IDE_EDITOR_SETTINGS: IdeEditorSettings = {
  autoSave: "off",
  wordWrap: "off",
  insertSpaces: "spaces",
  tabSize: 2,
  formatOnSave: true,
  breadcrumbsEnabled: true,
  bracketPairColorization: true
};

const initialState: IdeUiState = {
  activityView: "explorer",
  sidebarOpen: true,
  sidebarWidth: 280,
  primaryEditorWidth: 58,
  commandPaletteOpen: false,
  commandQuery: "",
  documentFindOpen: false,
  documentFindQuery: "",
  treeLoading: false,
  treeEntries: [],
  treeTruncated: false,
  expandedFolderPaths: [],
  loadingFolderPaths: [],
  openPaths: [],
  filesByPath: {},
  dirtyPaths: [],
  savingPaths: [],
  searchQuery: "",
  replaceQuery: "",
  regexSearch: false,
  caseSensitiveSearch: false,
  wholeWordSearch: false,
  searchLoading: false,
  searchResults: [],
  searchTruncated: false,
  gitLoading: false,
  gitIsRepository: false,
  gitChanges: [],
  editorSettings: { ...DEFAULT_IDE_EDITOR_SETTINGS }
};

function createIdeStore() {
  const [state, setState] = createStore<IdeUiState>({ ...initialState, ...readPersistedIdeState() });

  const activeProjectId = () => harnessStore.state.workspace.activeProjectId ?? harnessStore.state.workspace.projects[0]?.id;

  function send(command: ClientCommand) {
    return harnessStore.actions.sendCommand(command);
  }

  function loadProject(projectId = activeProjectId()) {
    if (!projectId) {
      setState({
        treeLoading: false,
        treeEntries: [],
        treeError: "Open a project to browse files.",
        gitLoading: false,
        gitChanges: [],
        gitBranch: undefined,
        gitIsRepository: false
      });
      return;
    }
    setState({ treeLoading: true, treeError: undefined, gitLoading: true });
    send({ type: "ide.fileTree.list", requestId: createRequestId(), payload: { projectId } });
    send({ type: "ide.git.status", requestId: createRequestId(), payload: { projectId } });
    const activePath = state.activePath;
    if (activePath && !state.filesByPath[activePath] && state.pendingReadPath !== activePath) {
      setState({ pendingReadPath: activePath });
      send({ type: "ide.file.read", requestId: createRequestId(), payload: { projectId, path: activePath } });
    }
  }

  function loadFolder(path: string, projectId = activeProjectId()) {
    if (!projectId || state.loadingFolderPaths.includes(path)) {
      return;
    }
    setState({ loadingFolderPaths: [...state.loadingFolderPaths, path] });
    send({ type: "ide.fileTree.list", requestId: createRequestId(), payload: { projectId, rootPath: path } });
  }

  function openFile(path: string, line?: number, column?: number) {
    const projectId = activeProjectId();
    if (!projectId) {
      pushToast("No active project", "Open a project before opening files.", "error");
      return;
    }
    const normalizedPath = path.replace(/\\/g, "/");
    setState({
      pendingReadPath: normalizedPath,
      activePath: normalizedPath,
      openPaths: state.openPaths.includes(normalizedPath) ? state.openPaths : [...state.openPaths, normalizedPath]
    });
    if (line) {
      setCursor(line, column ?? 1);
    }
    persistIdeStateSoon(state);
    send({ type: "ide.file.read", requestId: createRequestId(), payload: { projectId, path: normalizedPath } });
  }

  function runSearch() {
    const projectId = activeProjectId();
    const query = state.searchQuery.trim();
    if (!projectId || !query) {
      setState({ searchLoading: false, searchPendingRequestId: undefined, searchResults: [], searchTruncated: false });
      return;
    }
    if (state.searchPendingRequestId) {
      send({
        type: "ide.search.cancel",
        requestId: createRequestId(),
        payload: { projectId, searchRequestId: state.searchPendingRequestId }
      });
    }
    const requestId = createRequestId();
    setState({ searchLoading: true, searchPendingRequestId: requestId });
    send({
      type: "ide.search.run",
      requestId,
      payload: {
        projectId,
        query,
        regex: state.regexSearch,
        caseSensitive: state.caseSensitiveSearch,
        wholeWord: state.wholeWordSearch
      }
    });
  }

  function saveFile(path = state.activePath) {
    const projectId = activeProjectId();
    if (!projectId || !path) {
      pushToast("No active file", "Open a file before saving.", "error");
      return;
    }
    const file = state.filesByPath[path];
    if (!file || file.isBinary || file.tooLarge || typeof file.content !== "string") {
      pushToast("File cannot be saved", "Binary and oversized files are not editable.", "error");
      return;
    }
    setState({ savingPaths: state.savingPaths.includes(path) ? state.savingPaths : [...state.savingPaths, path] });
    send({ type: "ide.file.write", requestId: createRequestId(), payload: { projectId, path, content: file.content } });
  }

  function setCursor(line: number, column: number) {
    if (!state.activePath) {
      return;
    }
    setState("filesByPath", state.activePath, (file) => file ? { ...file, cursorLine: line, cursorColumn: column } : file);
  }

  return {
    state,
    loadProject,
    openFile,
    runSearch,
    saveFile,
    setActivityView(activityView: IdeActivityView) {
      setState({ activityView });
      persistIdeStateSoon(state);
    },
    setSidebarOpen(sidebarOpen: boolean) {
      setState({ sidebarOpen });
      persistIdeStateSoon(state);
    },
    setSidebarWidth(sidebarWidth: number) {
      setState({ sidebarWidth });
      persistIdeStateSoon(state);
    },
    setPrimaryEditorWidth(primaryEditorWidth: number) {
      setState({ primaryEditorWidth });
      persistIdeStateSoon(state);
    },
    setCommandPalette(open: boolean, query = state.commandQuery) {
      setState({ commandPaletteOpen: open, commandQuery: query });
    },
    setCommandQuery(commandQuery: string) {
      setState({ commandQuery });
    },
    setDocumentFindOpen(documentFindOpen: boolean) {
      setState({ documentFindOpen });
    },
    setDocumentFindQuery(documentFindQuery: string) {
      setState({ documentFindQuery });
    },
    setSearchQuery(searchQuery: string) {
      setState({ searchQuery });
    },
    setReplaceQuery(replaceQuery: string) {
      setState({ replaceQuery });
    },
    setRegexSearch(regexSearch: boolean) {
      setState({ regexSearch });
    },
    setCaseSensitiveSearch(caseSensitiveSearch: boolean) {
      setState({ caseSensitiveSearch });
    },
    setWholeWordSearch(wholeWordSearch: boolean) {
      setState({ wholeWordSearch });
    },
    updateFileContent(path: string, content: string) {
      const file = state.filesByPath[path];
      if (!file) {
        return;
      }
      setState("filesByPath", path, {
        ...file,
        content,
        contentLines: content.split(/\r\n|\r|\n/),
        lineCount: content.split(/\r\n|\r|\n/).length
      });
      setState({ dirtyPaths: state.dirtyPaths.includes(path) ? state.dirtyPaths : [...state.dirtyPaths, path] });
    },
    setEditorSetting<K extends keyof IdeEditorSettings>(key: K, value: IdeEditorSettings[K]) {
      setState("editorSettings", key, value);
      persistIdeStateSoon(state);
    },
    setActivePath(activePath: string | undefined) {
      setState({ activePath });
      persistIdeStateSoon(state);
    },
    loadFolder,
    toggleFolder(path: string) {
      if (state.expandedFolderPaths.includes(path)) {
        const descendants = state.treeEntries.filter((entry) => entry.path.startsWith(`${path}/`)).map((entry) => entry.path);
        setState({
          expandedFolderPaths: state.expandedFolderPaths.filter((entryPath) => entryPath !== path && !descendants.includes(entryPath))
        });
        persistIdeStateSoon(state);
        return;
      }
      setState({ expandedFolderPaths: [...state.expandedFolderPaths, path] });
      persistIdeStateSoon(state);
      loadFolder(path);
    },
    collapseAllFolders() {
      setState({ expandedFolderPaths: [] });
      persistIdeStateSoon(state);
    },
    loadExpandedFolders(projectId = activeProjectId()) {
      for (const folderPath of state.expandedFolderPaths) {
        if (!state.treeEntries.some((entry) => entry.parentPath === folderPath)) {
          loadFolder(folderPath, projectId);
        }
      }
    },
    closeTab(path: string) {
      const next = state.openPaths.filter((candidate) => candidate !== path);
      setState({ openPaths: next, activePath: state.activePath === path ? next[0] : state.activePath });
      persistIdeStateSoon(state);
      return next;
    },
    closeAllTabs() {
      setState({ openPaths: [], activePath: undefined });
      persistIdeStateSoon(state);
      return [];
    },
    closeOtherTabs(path: string) {
      setState({ openPaths: [path], activePath: path });
      persistIdeStateSoon(state);
    },
    setCursor,
    applyServerEvent(event: ServerEvent) {
      switch (event.type) {
        case "ide.fileTree.listed":
          if (event.payload.requestedPath) {
            const requestedPath = event.payload.requestedPath;
            setState({
              treeEntries: [
                ...state.treeEntries.filter((entry) => entry.parentPath !== requestedPath),
                ...event.payload.entries
              ],
              loadingFolderPaths: state.loadingFolderPaths.filter((path) => path !== requestedPath),
              treeTruncated: state.treeTruncated || event.payload.truncated,
              treeError: undefined
            });
            return;
          }
          setState({
            treeLoading: false,
            treeRootPath: event.payload.rootPath,
            treeEntries: [
              ...state.treeEntries.filter((entry) => entry.parentPath),
              ...event.payload.entries
            ],
            treeTruncated: event.payload.truncated,
            treeError: undefined
          });
          queueMicrotask(() => ideStore.loadExpandedFolders(event.payload.projectId));
          return;
        case "ide.file.read": {
          const file = {
            ...event.payload,
            contentLines: event.payload.content?.split(/\r\n|\r|\n/) ?? [
              event.payload.isBinary ? "Binary file preview is unavailable." : "File is too large for read-only preview."
            ]
          };
          setState("filesByPath", event.payload.path, file);
          setState({
            pendingReadPath: state.pendingReadPath === event.payload.path ? undefined : state.pendingReadPath,
            activePath: event.payload.path,
            openPaths: state.openPaths.includes(event.payload.path) ? state.openPaths : [...state.openPaths, event.payload.path]
          });
          persistIdeStateSoon(state);
          return;
        }
        case "ide.file.written": {
          const file = {
            ...event.payload,
            contentLines: event.payload.content?.split(/\r\n|\r|\n/) ?? [
              event.payload.isBinary ? "Binary file preview is unavailable." : "File is too large for editable preview."
            ]
          };
          setState("filesByPath", event.payload.path, file);
          setState({
            dirtyPaths: state.dirtyPaths.filter((path) => path !== event.payload.path),
            savingPaths: state.savingPaths.filter((path) => path !== event.payload.path)
          });
          pushToast("File saved", event.payload.path);
          return;
        }
        case "ide.search.results":
          if (state.searchPendingRequestId && event.requestId !== state.searchPendingRequestId) {
            return;
          }
          setState({
            searchLoading: false,
            searchPendingRequestId: undefined,
            searchResults: event.payload.results,
            searchTruncated: event.payload.truncated
          });
          return;
        case "ide.search.cancelled":
          if (state.searchPendingRequestId === event.payload.searchRequestId) {
            setState({ searchLoading: false, searchPendingRequestId: undefined });
          }
          return;
        case "ide.git.status":
          setState({
            gitLoading: false,
            gitBranch: event.payload.branch,
            gitIsRepository: event.payload.isRepository,
            gitChanges: event.payload.changes
          });
          return;
        case "command.rejected":
          if (event.payload.message.startsWith("IDE ")) {
            setState({ treeLoading: false, searchLoading: false, gitLoading: false, pendingReadPath: undefined, savingPaths: [] });
          }
          return;
      }
    },
    resetForTests(overrides: Partial<IdeUiState> = {}) {
      setState(reconcile({ ...initialState, ...overrides }));
    }
  };
}

export const ideStore = createIdeStore();

function readPersistedIdeState(): Partial<IdeUiState> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IDE_STATE_STORAGE_KEY) ?? "{}");
    return {
      activityView: isIdeActivityView(parsed.activityView) ? parsed.activityView : initialState.activityView,
      sidebarOpen: typeof parsed.sidebarOpen === "boolean" ? parsed.sidebarOpen : initialState.sidebarOpen,
      sidebarWidth: clampNumber(parsed.sidebarWidth, 220, 420, initialState.sidebarWidth),
      primaryEditorWidth: clampNumber(parsed.primaryEditorWidth, 42, 72, initialState.primaryEditorWidth),
      expandedFolderPaths: stringArray(parsed.expandedFolderPaths),
      openPaths: stringArray(parsed.openPaths),
      activePath: typeof parsed.activePath === "string" ? parsed.activePath : undefined,
      editorSettings: parseIdeEditorSettings(parsed.editorSettings)
    };
  } catch {
    return {};
  }
}

function persistIdeStateSoon(state: IdeUiState) {
  if (typeof window === "undefined") {
    return;
  }
  queueMicrotask(() => {
    window.localStorage.setItem(IDE_STATE_STORAGE_KEY, JSON.stringify({
      activityView: state.activityView,
      sidebarOpen: state.sidebarOpen,
      sidebarWidth: state.sidebarWidth,
      primaryEditorWidth: state.primaryEditorWidth,
      expandedFolderPaths: state.expandedFolderPaths,
      openPaths: state.openPaths,
      activePath: state.activePath,
      editorSettings: state.editorSettings
    }));
  });
}

function parseIdeEditorSettings(value: unknown): IdeEditorSettings {
  const parsed = value && typeof value === "object" ? value as Partial<IdeEditorSettings> : {};
  return {
    autoSave: parsed.autoSave === "afterDelay" || parsed.autoSave === "onFocusChange" ? parsed.autoSave : "off",
    wordWrap: parsed.wordWrap === "on" ? "on" : "off",
    insertSpaces: parsed.insertSpaces === "tabs" ? "tabs" : "spaces",
    tabSize: parsed.tabSize === 4 ? 4 : 2,
    formatOnSave: typeof parsed.formatOnSave === "boolean" ? parsed.formatOnSave : true,
    breadcrumbsEnabled: typeof parsed.breadcrumbsEnabled === "boolean" ? parsed.breadcrumbsEnabled : true,
    bracketPairColorization: typeof parsed.bracketPairColorization === "boolean" ? parsed.bracketPairColorization : true
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isIdeActivityView(value: unknown): value is IdeActivityView {
  return value === "explorer" || value === "search" || value === "source-control";
}
