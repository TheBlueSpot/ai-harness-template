import { createStore } from "solid-js/store";
import { defaultAgentCatalog } from "../../shared/agent-catalog";
import {
  createEmptySession,
  createProjectId,
  type ProviderBrand,
  type AgentOption,
  type ConnectionState,
  type PreferencesState,
  type RunPreflight,
  type ServerEvent,
  type WorkspaceProjectState,
  type WorkspaceState
} from "../../shared/protocol";

export const OPENAI_API_KEY_STORAGE_KEY = "openai_api_key";
export const GOOGLE_API_KEY_STORAGE_KEY = "google_api_key";
export const PROVIDER_BRAND_STORAGE_KEY = "provider_brand";
export const DEBUG_ENABLED_STORAGE_KEY = "debug_enabled";
export const TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY = "trace_panel_default_open";

export type HarnessViewState = {
  connectionState: ConnectionState;
  connectionError?: string;
  availableAgents: AgentOption[];
  workspace: WorkspaceState;
  projectInput: string;
  pendingExecutionModelIds: Record<string, string | undefined>;
  debugEnabled: boolean;
  tracePanelOpen: boolean;
  tracePanelDefaultOpen: boolean;
  preferencesModalOpen: boolean;
  hasUsableApiKey: boolean;
  hasStoredApiKey: boolean;
  hasUsableOpenAiApiKey: boolean;
  hasStoredOpenAiApiKey: boolean;
  hasUsableGoogleApiKey: boolean;
  hasStoredGoogleApiKey: boolean;
  providerBrand: ProviderBrand;
  openAiApiKeyDraft: string;
  googleApiKeyDraft: string;
  apiKeyDirty: boolean;
  hasLocalOpenAiApiKey: boolean;
  hasLocalGoogleApiKey: boolean;
  hasLocalProviderBrandPreference: boolean;
  hasLocalDebugPreference: boolean;
  hasLocalTracePreference: boolean;
  projectPreflights: Record<string, { requestId: string; preflight: RunPreflight } | undefined>;
};

export type LocalPreferencesState = {
  openAiApiKey?: string;
  googleApiKey?: string;
  providerBrand?: ProviderBrand;
  debugEnabled?: boolean;
  tracePanelDefaultOpen?: boolean;
};

export function createInitialWorkspaceState(): WorkspaceState {
  const initialProjectId = createProjectId();
  return {
    activeProjectId: initialProjectId,
    projects: [
      {
        id: initialProjectId,
        name: "Loading workspace",
        rootPath: "C:\\loading",
        activeThreadId: crypto.randomUUID(),
        session: createEmptySession(),
        latestPlan: undefined,
        activeRun: undefined,
        lastRun: undefined,
        contextUsage: undefined,
        traces: [],
        streamingAssistantText: "",
        draft: "",
        lastError: undefined
      }
    ]
  };
}

export function createInitialViewState(): HarnessViewState {
  return {
    connectionState: "disconnected",
    connectionError: undefined,
    availableAgents: [...defaultAgentCatalog],
    workspace: createInitialWorkspaceState(),
    projectInput: "",
    pendingExecutionModelIds: {},
    debugEnabled: false,
    tracePanelOpen: true,
    tracePanelDefaultOpen: true,
    preferencesModalOpen: false,
    hasUsableApiKey: false,
    hasStoredApiKey: false,
    hasUsableOpenAiApiKey: false,
    hasStoredOpenAiApiKey: false,
    hasUsableGoogleApiKey: false,
    hasStoredGoogleApiKey: false,
    providerBrand: "gpt",
    openAiApiKeyDraft: "",
    googleApiKeyDraft: "",
    apiKeyDirty: false,
    hasLocalOpenAiApiKey: false,
    hasLocalGoogleApiKey: false,
    hasLocalProviderBrandPreference: false,
    hasLocalDebugPreference: false,
    hasLocalTracePreference: false,
    projectPreflights: {}
  };
}

export function getActiveProject(state: HarnessViewState) {
  return (
    state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId) ??
    state.workspace.projects[0]
  );
}

export function reduceServerEvent(state: HarnessViewState, event: ServerEvent): HarnessViewState {
  switch (event.type) {
    case "connection.ready":
      return {
        ...state,
        availableAgents: [...event.payload.agents],
        workspace: event.payload.workspace,
        projectPreflights: {},
        ...applyReadyPreferencesState(state, event.payload.preferences)
      };
    case "agent.list":
      return {
        ...state,
        availableAgents: [...event.payload.agents]
      };
    case "project.added":
      return {
        ...state,
        projectInput: "",
        workspace: {
          activeProjectId: event.payload.activeProjectId,
          projects: upsertProject(state.workspace.projects, event.payload.project)
        }
      };
    case "project.removed":
      return {
        ...state,
        workspace: {
          activeProjectId: event.payload.activeProjectId,
          projects: state.workspace.projects.filter((project) => project.id !== event.payload.projectId)
        }
      };
    case "project.activated":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          activeProjectId: event.payload.projectId
        }
      };
    case "agent.plan":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        latestPlan: event.payload.plan
      }));
    case "agent.trace":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        traces: [...project.traces, event.payload.trace]
      }));
    case "chat.delta":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        streamingAssistantText: `${project.streamingAssistantText}${event.payload.delta}`,
        session: {
          ...project.session,
          isStreaming: true
        }
      }));
    case "chat.complete":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        activeThreadId: event.payload.activeThreadId,
        streamingAssistantText: "",
        lastError: undefined,
        session: {
          ...event.payload.state,
          isStreaming: false,
          lastError: undefined
        }
      }));
    case "chat.message-appended":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        activeThreadId: event.payload.activeThreadId,
        lastError: undefined,
        session: {
          ...event.payload.state,
          isStreaming: project.session.isStreaming,
          lastError: undefined
        }
      }));
    case "chat.error":
      if (!event.payload.projectId) {
        return state;
      }

      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        streamingAssistantText: "",
        lastError: event.payload.detail ?? event.payload.message,
        session: {
          ...project.session,
          isStreaming: false,
          lastError: event.payload.detail ?? event.payload.message
        }
      }));
    case "session.reset":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        activeThreadId: event.payload.activeThreadId,
        latestPlan: undefined,
        activeRun: undefined,
        lastRun: undefined,
        contextUsage: undefined,
        traces: [],
        streamingAssistantText: "",
        lastError: undefined,
        session: {
          ...event.payload.state,
          isStreaming: false,
          lastError: undefined
        }
      }));
    case "run.updated":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) => ({
          ...project,
          activeRun: event.payload.run.status === "completed" ? undefined : event.payload.run,
          lastRun: event.payload.run
        })),
        projectPreflights: {
          ...state.projectPreflights,
          [event.payload.projectId]:
            state.projectPreflights[event.payload.projectId]?.requestId === event.requestId
              ? state.projectPreflights[event.payload.projectId]
              : undefined
        }
      };
    case "run.preflight":
      return {
        ...state,
        projectPreflights: {
          ...state.projectPreflights,
          [event.payload.projectId]: {
            requestId: event.requestId,
            preflight: event.payload.preflight
          }
        }
      };
    case "run.cleared":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        activeRun: project.activeRun?.id === event.payload.runId ? undefined : project.activeRun
      }));
    case "project.context":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        contextUsage: event.payload.contextUsage
      }));
    case "command.rejected":
    case "connection.pong":
      return state;
    case "preferences.saved":
    case "preferences.apiKeyCleared":
      return {
        ...state,
        ...applyReadyPreferencesState(state, event.payload)
      };
    default:
      return state;
  }
}

export function createHarnessStore() {
  const [state, setState] = createStore(createInitialViewState());

  return {
    state,
    setConnectionState(connectionState: ConnectionState, connectionError?: string) {
      setState({
        connectionState,
        connectionError
      });
    },
    setProjectInput(projectInput: string) {
      setState({ projectInput });
    },
    setProjectDraft(projectId: string, draft: string) {
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "draft",
        draft
      );
    },
    setPendingExecutionModelId(projectId: string, modelId?: string) {
      setState("pendingExecutionModelIds", {
        ...state.pendingExecutionModelIds,
        [projectId]: modelId?.trim() ? modelId.trim() : undefined
      });
    },
    clearPendingExecutionModelId(projectId: string) {
      setState("pendingExecutionModelIds", {
        ...state.pendingExecutionModelIds,
        [projectId]: undefined
      });
    },
    setDebugEnabled(debugEnabled: boolean) {
      setState({ debugEnabled });
    },
    setTracePanelOpen(tracePanelOpen: boolean) {
      setState({ tracePanelOpen });
    },
    toggleTracePanel() {
      setState("tracePanelOpen", (value) => !value);
    },
    setTracePanelDefaultOpen(tracePanelDefaultOpen: boolean) {
      setState({
        tracePanelDefaultOpen,
        tracePanelOpen: tracePanelDefaultOpen
      });
    },
    openPreferencesModal() {
      setState({ preferencesModalOpen: true });
    },
    closePreferencesModal() {
      setState({ preferencesModalOpen: false });
    },
    setOpenAiApiKeyDraft(openAiApiKeyDraft: string) {
      setState({
        openAiApiKeyDraft,
        apiKeyDirty: true
      });
    },
    setGoogleApiKeyDraft(googleApiKeyDraft: string) {
      setState({
        googleApiKeyDraft,
        apiKeyDirty: true
      });
    },
    setProviderBrand(providerBrand: ProviderBrand) {
      setState({
        providerBrand,
        apiKeyDirty: true
      });
    },
    commitLocalPreferences(localPreferences: LocalPreferencesState) {
      setState({
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalProviderBrandPreference: localPreferences.providerBrand !== undefined,
        hasLocalDebugPreference: localPreferences.debugEnabled !== undefined,
        hasLocalTracePreference: localPreferences.tracePanelDefaultOpen !== undefined
      });
    },
    setHasUsableApiKey(hasUsableApiKey: boolean) {
      setState({ hasUsableApiKey });
    },
    hydrateLocalPreferences() {
      const localPreferences = readLocalPreferences();
      setState({
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelOpen,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalProviderBrandPreference: localPreferences.providerBrand !== undefined,
        hasLocalDebugPreference: localPreferences.debugEnabled !== undefined,
        hasLocalTracePreference: localPreferences.tracePanelDefaultOpen !== undefined
      });
      return localPreferences;
    },
    applyServerEvent(event: ServerEvent) {
      setState(reduceServerEvent(state, event));
    }
  };
}

export const harnessStore = createHarnessStore();

function updateProjectState(
  state: HarnessViewState,
  projectId: string,
  updater: (project: WorkspaceProjectState) => WorkspaceProjectState
): HarnessViewState {
  return {
    ...state,
    workspace: {
      ...state.workspace,
      projects: state.workspace.projects.map((project) => (project.id === projectId ? updater(project) : project))
    }
  };
}

function upsertProject(projects: WorkspaceProjectState[], nextProject: WorkspaceProjectState) {
  if (projects.some((project) => project.id === nextProject.id)) {
    return projects.map((project) => (project.id === nextProject.id ? nextProject : project));
  }

  return [nextProject, ...projects];
}

function applyReadyPreferencesState(state: HarnessViewState, preferences: PreferencesState) {
  const providerBrand = resolveProviderBrand(state, preferences);

  return {
    hasUsableApiKey: preferences.hasUsableApiKey,
    hasStoredApiKey: preferences.hasStoredApiKey,
    hasUsableOpenAiApiKey: preferences.hasUsableOpenAiApiKey,
    hasStoredOpenAiApiKey: preferences.hasStoredOpenAiApiKey,
    hasUsableGoogleApiKey: preferences.hasUsableGoogleApiKey,
    hasStoredGoogleApiKey: preferences.hasStoredGoogleApiKey,
    providerBrand,
    debugEnabled: state.hasLocalDebugPreference ? state.debugEnabled : preferences.debugEnabledDefault,
    tracePanelDefaultOpen: state.hasLocalTracePreference
      ? state.tracePanelDefaultOpen
      : preferences.tracePanelDefaultOpen,
    tracePanelOpen: state.hasLocalTracePreference ? state.tracePanelOpen : preferences.tracePanelDefaultOpen
  };
}

export function readLocalPreferences(): LocalPreferencesState {
  if (typeof window === "undefined") {
    return {};
  }

  const openAiApiKey = window.localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)?.trim() || undefined;
  const googleApiKey = window.localStorage.getItem(GOOGLE_API_KEY_STORAGE_KEY)?.trim() || undefined;
  const providerBrand = parseProviderBrandStorageValue(window.localStorage.getItem(PROVIDER_BRAND_STORAGE_KEY));
  const debugEnabled = parseBooleanStorageValue(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY));
  const tracePanelDefaultOpen = parseBooleanStorageValue(
    window.localStorage.getItem(TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY)
  );

  return {
    openAiApiKey,
    googleApiKey,
    providerBrand,
    debugEnabled,
    tracePanelDefaultOpen
  };
}

export function persistLocalPreferences(input: LocalPreferencesState) {
  if (typeof window === "undefined") {
    return;
  }

  persistStorageValue(OPENAI_API_KEY_STORAGE_KEY, input.openAiApiKey);
  persistStorageValue(GOOGLE_API_KEY_STORAGE_KEY, input.googleApiKey);
  persistProviderBrandStorageValue(PROVIDER_BRAND_STORAGE_KEY, input.providerBrand);
  persistBooleanStorageValue(DEBUG_ENABLED_STORAGE_KEY, input.debugEnabled);
  persistBooleanStorageValue(TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY, input.tracePanelDefaultOpen);
}

function parseBooleanStorageValue(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function parseProviderBrandStorageValue(value: string | null): ProviderBrand | undefined {
  return value === "gpt" || value === "gemini" ? value : undefined;
}

function persistStorageValue(key: string, value: string | undefined) {
  if (value?.trim()) {
    window.localStorage.setItem(key, value.trim());
    return;
  }

  window.localStorage.removeItem(key);
}

function persistBooleanStorageValue(key: string, value: boolean | undefined) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, String(value));
}

function persistProviderBrandStorageValue(key: string, value: ProviderBrand | undefined) {
  if (!value) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function resolveProviderBrand(state: HarnessViewState, preferences: PreferencesState): ProviderBrand {
  const preferredBrand = state.hasLocalProviderBrandPreference ? state.providerBrand : preferences.providerBrand;
  if (isProviderBrandSelectable(state, preferences, preferredBrand)) {
    return preferredBrand;
  }

  if (isProviderBrandSelectable(state, preferences, "gpt")) {
    return "gpt";
  }

  if (isProviderBrandSelectable(state, preferences, "gemini")) {
    return "gemini";
  }

  return preferredBrand;
}

function isProviderBrandSelectable(
  state: Pick<
    HarnessViewState,
    "openAiApiKeyDraft" | "googleApiKeyDraft" | "hasLocalOpenAiApiKey" | "hasLocalGoogleApiKey"
  >,
  preferences: Pick<
    PreferencesState,
    "hasUsableOpenAiApiKey" | "hasStoredOpenAiApiKey" | "hasUsableGoogleApiKey" | "hasStoredGoogleApiKey"
  >,
  providerBrand: ProviderBrand
) {
  if (providerBrand === "gpt") {
    return Boolean(
      preferences.hasUsableOpenAiApiKey ||
        preferences.hasStoredOpenAiApiKey ||
        state.hasLocalOpenAiApiKey ||
        state.openAiApiKeyDraft.trim()
    );
  }

  return Boolean(
    preferences.hasUsableGoogleApiKey ||
      preferences.hasStoredGoogleApiKey ||
      state.hasLocalGoogleApiKey ||
      state.googleApiKeyDraft.trim()
  );
}

export function hasUsableApiKeyForProvider(state: HarnessViewState, providerBrand: ProviderBrand) {
  return providerBrand === "gemini" ? state.hasUsableGoogleApiKey : state.hasUsableOpenAiApiKey;
}

export function canSelectProviderBrand(state: HarnessViewState, providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return Boolean(
      state.hasUsableGoogleApiKey ||
        state.hasStoredGoogleApiKey ||
        state.hasLocalGoogleApiKey ||
        state.googleApiKeyDraft.trim()
    );
  }

  return Boolean(
    state.hasUsableOpenAiApiKey ||
      state.hasStoredOpenAiApiKey ||
      state.hasLocalOpenAiApiKey ||
      state.openAiApiKeyDraft.trim()
  );
}

export function getDefaultExecutionModelIdForProvider(providerBrand: ProviderBrand) {
  return providerBrand === "gemini" ? "google/gemini-2.5-flash" : "openai/gpt-5.4";
}

export function isModelIdForProvider(modelId: string | undefined, providerBrand: ProviderBrand) {
  if (!modelId) {
    return false;
  }

  return providerBrand === "gemini" ? modelId.startsWith("google/") : modelId.startsWith("openai/");
}
