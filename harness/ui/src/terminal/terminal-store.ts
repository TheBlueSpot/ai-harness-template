import { createStore, reconcile } from "solid-js/store";
import type {
  ServerEvent,
  TerminalPaneLayout,
  TerminalPreferences,
  TerminalSession,
  TerminalShell
} from "../../../shared/protocol";

export const TERMINAL_DRAWER_STORAGE_KEY = "pi-harness:terminal-drawer:v1";

export type TerminalUiState = {
  open: boolean;
  height: number;
  shells: TerminalShell[];
  sessions: TerminalSession[];
  outputBySessionId: Record<string, string>;
  outputDeltaBySessionId: Record<string, string>;
  outputVersionBySessionId: Record<string, number>;
  outputResetVersionBySessionId: Record<string, number>;
  connectedBySessionId: Record<string, boolean>;
  preferences: TerminalPreferences;
  layout?: TerminalPaneLayout;
  focusedSessionId?: string;
  searchOpen: boolean;
  searchQuery: string;
};

const defaultPreferences: TerminalPreferences = {
  scrollbackLimit: 10000,
  copyOnSelect: false,
  ctrlCMode: "auto",
  rendererMode: "xterm-webgl"
};

function createInitialTerminalState(): TerminalUiState {
  const persisted = readDrawerState();
  return {
    open: persisted.open,
    height: persisted.height,
    shells: [],
    sessions: [],
    outputBySessionId: {},
    outputDeltaBySessionId: {},
    outputVersionBySessionId: {},
    outputResetVersionBySessionId: {},
    connectedBySessionId: {},
    preferences: defaultPreferences,
    focusedSessionId: undefined,
    searchOpen: false,
    searchQuery: ""
  };
}

function createTerminalStore() {
  const [state, setState] = createStore(createInitialTerminalState());

  return {
    state,
    toggleOpen() {
      const open = !state.open;
      setState({ open });
      persistDrawerState(state.height, open);
    },
    setOpen(open: boolean) {
      setState({ open });
      persistDrawerState(state.height, open);
    },
    setHeight(height: number) {
      const nextHeight = Math.max(180, Math.min(Math.round(window.innerHeight * 0.7), Math.round(height)));
      setState({ height: nextHeight });
      persistDrawerState(nextHeight, state.open);
    },
    focusSession(sessionId: string | undefined) {
      setState({ focusedSessionId: sessionId });
    },
    appendOutput(sessionId: string, text: string) {
      const limit = Math.max(100_000, state.preferences.scrollbackLimit * 160);
      const combined = `${state.outputBySessionId[sessionId] ?? ""}${text}`;
      const nextOutput = combined.slice(-limit);
      setState("outputBySessionId", sessionId, nextOutput);
      setState("outputDeltaBySessionId", sessionId, text);
      setState("outputVersionBySessionId", sessionId, (state.outputVersionBySessionId[sessionId] ?? 0) + 1);
    },
    replaceOutput(sessionId: string, text: string) {
      setState("outputBySessionId", sessionId, text);
      setState("outputDeltaBySessionId", sessionId, "");
      setState("outputVersionBySessionId", sessionId, (state.outputVersionBySessionId[sessionId] ?? 0) + 1);
      setState("outputResetVersionBySessionId", sessionId, (state.outputResetVersionBySessionId[sessionId] ?? 0) + 1);
    },
    setConnected(sessionId: string, connected: boolean) {
      setState("connectedBySessionId", sessionId, connected);
    },
    setSearch(open: boolean, query: string = state.searchQuery) {
      setState({ searchOpen: open, searchQuery: query });
    },
    applyServerEvent(event: ServerEvent) {
      switch (event.type) {
        case "terminal.shells.updated":
          setState({ shells: event.payload.shells });
          return;
        case "terminal.sessions.updated":
          setState({
            sessions: event.payload.sessions,
            preferences: event.payload.preferences,
            layout: event.payload.layout
          });
          if (!state.focusedSessionId && event.payload.sessions[0]) {
            setState({ focusedSessionId: event.payload.sessions[0].id });
          }
          return;
        case "terminal.session.created":
        case "terminal.session.updated":
        case "terminal.session.exited": {
          const session = event.payload.session;
          const sessions = [...state.sessions.filter((entry) => entry.id !== session.id), session].sort((left, right) =>
            left.startedAt.localeCompare(right.startedAt)
          );
          setState({ sessions, focusedSessionId: state.focusedSessionId ?? session.id });
          return;
        }
        case "terminal.preferences.saved":
          setState({ preferences: event.payload.preferences, layout: event.payload.layout });
          return;
        case "terminal.session.attach-ready":
          setState("outputBySessionId", event.payload.sessionId, event.payload.snapshot);
          return;
      }
    },
    resetForTests(overrides: Partial<TerminalUiState> = {}) {
      setState(reconcile({ ...createInitialTerminalState(), ...overrides }));
    }
  };
}

function readDrawerState() {
  if (typeof window === "undefined") {
    return { open: false, height: 320 };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TERMINAL_DRAWER_STORAGE_KEY) ?? "{}") as Partial<{
      open: boolean;
      height: number;
    }>;
    return {
      open: parsed.open === true,
      height: typeof parsed.height === "number" ? Math.max(180, Math.min(900, parsed.height)) : Math.round(window.innerHeight * 0.32)
    };
  } catch {
    return { open: false, height: Math.round(window.innerHeight * 0.32) };
  }
}

function persistDrawerState(height: number, open: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TERMINAL_DRAWER_STORAGE_KEY, JSON.stringify({ height, open }));
}

export const terminalStore = createTerminalStore();
