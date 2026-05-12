import { createUiAssetManager } from "./ui-build";
import { clearDevHarnessServerSingleton, getDevHarnessServerSingleton, setDevHarnessServerSingleton } from "./dev-server-singleton";
import { withTraceTimestamp } from "./trace-timestamps";
import { defaultAgentCatalog } from "../../shared/agent-catalog";
import { defaultProviderCapabilities } from "../../shared/capabilities";
import { modeUsesReadOnlyExecution, resolveModeById, resolveModeCatalog } from "../../shared/modes";
import {
  PLANNER_DIFFICULTY_THRESHOLD,
  detectAutoMode,
  estimateTaskDifficulty,
  isDirectWorkspaceImplementTask
} from "../../shared/mode-intent";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRouteHandler } from "uploadthing/server";
import {
  createAssistantAssetRefId,
  createAssistantId,
  createBackgroundJobId,
  createChatMessage,
  createEmptySession,
  createRequestId,
  createAssistantTodoId,
  createThreadId,
  type AgentId,
  type AgentPlan,
  type AgentTrace,
  type Assistant,
  type AssistantActionMessageMetadata,
  type AssistantActionPlanningIntent,
  type AssistantThread,
  type AssistantTodo,
  type BackgroundJob,
  type BackgroundJobRun,
  type BackgroundJobRunStatus,
  type BackgroundJobSchedule,
  type BackgroundJobsState,
  type ChatAttachment,
  type ChatMessage,
  type CliAttachToken,
  type CliSession,
  type ComposerReasoningStrength,
  type CorrectnessGap,
  type CorrectnessReview,
  type ExecutionPlan,
  type MemorySummary,
  type ModeDefinition,
  type NotificationSeverity,
  parseClientCommand,
  type AgentRunState,
  type AssistantQuestion,
  type AssistantQuestionBatchNotification,
  type AssistantQuestionNotification,
  type BackgroundRunStatusNotification,
  type BrowserApprovalNotification,
  type ClientCommand,
  type PlanningQuestion,
  type PlanningQuestionBatchNotification,
  type PlanningQuestionNotification,
  type PlannerReadyTurn,
  type PreferencesState,
  type ProjectContextUsage,
  type ProjectId,
  type ProviderBrand,
  type QuestionId,
  type ServerEvent,
  type SetupLaunchMode,
  type SetupState,
  type ThreadId,
  type WorkspaceRuleSource,
  type WorkspaceProjectState
} from "../../shared/protocol";
import { AssistantManager } from "./assistant-manager";
import { executeBackgroundJobRun } from "./background-job-executor";
import {
  assertBackgroundRunTransition,
  requireBackgroundJobForProject,
  requireBackgroundRunForProject
} from "./background-job-command-guards";
import { previewBackgroundJobSchedule } from "./background-job-schedule";
import { isBackgroundRunPastLeaseGrace } from "./background-run-leases";
import { BackgroundJobScheduler } from "./background-job-scheduler";
import { BranchfsManager, type BranchfsExperimentLease } from "./branchfs-manager";
import { pickProjectFolder } from "./folder-picker";
import {
  type ManagedExecutionState,
  type ManagedRefreshAction
} from "./execution-runtime";
import { runGitPreflight } from "./git-preflight";
import { ensureProjectDirectory, initializeGitBaseline } from "./git-project";
import { debugLog } from "./logging";
import { extractRunMemories, retrieveMemorySummaries } from "./memory-bank";
import { runManagedAgentExecution } from "./managed-agent-execution";
import { createLegacyTruncatedId, createStableBoundedId } from "./notification-ids";
import { PiSdkAgentAdapter, type PiAgentAdapter, type PiAgentExecutionEvent } from "./pi-agent-adapter";
import { searchProjectFolders } from "./project-search-service";
import type { AgentRuntime } from "./agent-runtimes/agent-runtime";
import { CliSessionManager, STREAM_HEARTBEAT } from "./agent-runtimes/cli-session-manager";
import { CopilotCliRuntime } from "./agent-runtimes/copilot-cli-runtime";
import { CodexCliRuntime } from "./agent-runtimes/codex-cli-runtime";
import { PiRuntime } from "./agent-runtimes/pi-runtime";
import { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { applyHarnessToolchainToProcessEnv } from "./agent-runtimes/toolchain";
import {
  aggregateSubagentResults,
  buildExecutionPlan,
  executePlanPrerequisites,
  executeReadyRun,
  executionPlanToTasks,
  resolveExecutionPlanGateMode,
  runPlannerTurn
} from "./pi-orchestrator";
import { getDefaultExecutionModelId, getDefaultPlanningModelId } from "./pi-planner";
import { formatRunProgressHeartbeat, shouldDelayDerivedProgressHeartbeat } from "./run-progress-heartbeats";
import { buildRunDiagnosticsReport } from "./run-diagnostics";
import { classifyRunFailure, isBackoffEligibleFailureCategory } from "./run-failure-classification";
import { RunBudgetAgentAdapter } from "./run-budget-agent-adapter";
import { resolveSubagentModelId, resolveSubagentReasoningStrength } from "./subagent-defaults";
import {
  createMilestoneDeltaParser,
  extractMilestoneLines,
  type RunMilestonePhase,
  RunTranscriptDraft,
  stripMilestoneLines
} from "./run-milestone-windows";
import { normalizeWorkspaceRelativePaths } from "./workspace-path-intent";
import type { SubagentResult } from "./pi-subagents";
import { WorkspaceRepository } from "./workspace-repository";
import { WorkspaceRuntimeStore } from "./workspace-runtime-store";
import { buildWorkspaceConfigHash, type PromptCacheIdentity } from "./prompt-cache";
import { prepareGeminiCachedAttachmentContext, type GeminiCachedAttachmentContext } from "./gemini-cached-contents";
import { createHarnessUploadRouter } from "./uploadthing-router";
import { buildSetupState, detectSetupLaunchMode } from "./setup-health";
import { StreamPump } from "./stream-pump";
import { guardedWebsocketSend } from "./websocket-send-guard";
import {
  findPendingBrowserApproval,
  recordBrowserToolEnd,
  recordBrowserToolStart,
  recordBrowserToolUpdate,
  requestBrowserApproval as requestBrowserApprovalState,
  resolveBrowserApproval
} from "./browser-session-state";
import { detectAssistantChatIntent } from "./assistant-intent";
import { resolveAssistantChatAction, type AssistantActionIntentDraft, type AssistantChatActionResolution } from "./assistant-chat-actions";
import { assertAssistantRunnableForLaunch } from "./assistant-launch-gate";
import { evaluateAssistantQuestionPolicy } from "./assistant-question-policy";
import { type StartupPhaseId, type StartupTelemetrySink } from "./startup-telemetry";
import { HARNESS_APP_VERSION } from "../../shared/app-version";
import {
  isSubagentBlockedVerificationCommand,
  recordToolEnd,
  recordToolStart,
  recordToolUpdate
} from "./tool-activity-state";
import {
  buildSubagentEnvironmentBrief,
  discoverRepoSkillPaths,
  resolveRepoRoot,
  SUBAGENT_MILESTONE_INSTRUCTION
} from "./subagent-environment";

type HarnessConnection = {
  clientId: string;
  kind: "control" | "pty";
  sessionId?: string;
};

const DERIVED_PROGRESS_HEARTBEAT_MS = 10_000;
const DEV_HMR_DEBOUNCE_MS = 30_000;
const DEV_UI_LIVE_RELOAD_ENDPOINT = "/__dev/ui-reload-state";
const STREAM_DELTA_FLUSH_MS = 50;
const STREAM_DELTA_MAX_BUFFERED_BYTES = 8 * 1024;
const STREAM_PERSIST_INTERVAL_MS = 1000;
const BACKGROUND_RUN_CONTROLLER_LEASE_MS = 15 * 60 * 1000;
const BACKGROUND_RUN_CONTROLLER_RENEW_MS = 60 * 1000;
const BACKGROUND_RUN_STARTUP_GRACE_MS = 2 * 60 * 1000;

type TimerApi = {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

export type HarnessBranchfsManager = Pick<
  BranchfsManager,
  "prepareExperimentLease" | "readInspection" | "flushExperiment" | "discardExperiment" | "unmountExperiment"
>;

export type HarnessServerOsAdapters = {
  searchProjectFolders: typeof searchProjectFolders;
  runGitPreflight: typeof runGitPreflight;
  runCorrectnessReview: typeof runCorrectnessReview;
  branchfsManagerFactory: (
    context: ConstructorParameters<typeof BranchfsManager>[0],
    callbacks?: ConstructorParameters<typeof BranchfsManager>[1]
  ) => HarnessBranchfsManager;
};

type HarnessServerOptions = {
  port: number;
  hostname?: string;
  adapter?: PiAgentAdapter;
  repository?: WorkspaceRepository;
  runtimeRegistry?: AgentRuntimeRegistry;
  osAdapters?: Partial<HarnessServerOsAdapters>;
  pickFolder?: typeof pickProjectFolder;
  serverOnly?: boolean;
  openBrowser?: boolean;
  launchMode?: SetupLaunchMode;
  startupTelemetry?: StartupTelemetrySink;
  uiAssetManagerFactory?: typeof createUiAssetManager;
  browserLauncher?: typeof openHarnessBrowser;
  devHotMode?: boolean;
  hotSingletonVersion?: number;
  hotReloadDebounceMs?: number;
  timerApi?: TimerApi;
  derivedProgressHeartbeatMs?: number;
};

type ProjectLike = Pick<WorkspaceProjectState, "id" | "rootPath" | "activeThreadId" | "session" | "activeRun" | "lastRun">;

type PendingBrowserApproval = {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
};

type BackgroundRunControl = {
  abortController: AbortController;
  controllerInstanceId: string;
  controllerLeaseId: string;
  renewTimer?: ReturnType<typeof setInterval>;
};

type BunServeOptions = Parameters<typeof Bun.serve<HarnessConnection>>[0];
type HarnessRoutes = NonNullable<BunServeOptions["routes"]>;
type HarnessFetchHandler = NonNullable<BunServeOptions["fetch"]>;
type HarnessWebSocketOptions = NonNullable<BunServeOptions["websocket"]>;
type HarnessWebSocketOpenHandler = NonNullable<HarnessWebSocketOptions["open"]>;
type HarnessWebSocketCloseHandler = NonNullable<HarnessWebSocketOptions["close"]>;
type HarnessWebSocketMessageHandler = NonNullable<HarnessWebSocketOptions["message"]>;

type UiServingState =
  | {
    mode: "server-only";
  }
  | {
    mode: "static-dist";
    uiAssets: ReturnType<typeof createUiAssetManager>;
    liveReload: "disabled" | "debounced-poll";
  };

type UiLiveReloadMode = Extract<UiServingState, { mode: "static-dist" }>["liveReload"];

type HarnessServerState = {
  adapter: PiAgentAdapter;
  runtimeRegistry: AgentRuntimeRegistry;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  pickFolder: typeof pickProjectFolder;
  serverOnly: boolean;
  launchMode: SetupLaunchMode;
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  projectSearchControllers: Map<string, { requestId: string; abortController: AbortController }>;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  uploadthingHandler: ReturnType<typeof createRouteHandler>;
  ui: UiServingState;
  currentSetupState: SetupState;
  assistantManager: AssistantManager;
  cliSessionManager: CliSessionManager;
  scheduler: BackgroundJobScheduler;
  osAdapters: HarnessServerOsAdapters;
};

type HarnessHandlerRefs = {
  routes?: HarnessRoutes;
  fetch: HarnessFetchHandler;
  websocket: {
    open: HarnessWebSocketOpenHandler;
    close: HarnessWebSocketCloseHandler;
    message: HarnessWebSocketMessageHandler;
  };
};

const LOG_COMMAND_ERRORS = process.env.NODE_ENV !== "production";

function resolveHarnessServerOsAdapters(overrides: Partial<HarnessServerOsAdapters> | undefined): HarnessServerOsAdapters {
  return {
    searchProjectFolders,
    runGitPreflight,
    runCorrectnessReview,
    branchfsManagerFactory(context, callbacks) {
      return new BranchfsManager(context, callbacks);
    },
    ...overrides
  };
}

export async function startHarnessServer({
  port,
  hostname,
  adapter = new PiSdkAgentAdapter(),
  repository: providedRepository,
  runtimeRegistry: providedRuntimeRegistry,
  osAdapters,
  pickFolder = pickProjectFolder,
  serverOnly = false,
  openBrowser = false,
  launchMode = detectSetupLaunchMode(),
  startupTelemetry,
  uiAssetManagerFactory = createUiAssetManager,
  browserLauncher = openHarnessBrowser,
  devHotMode,
  hotSingletonVersion = 1,
  hotReloadDebounceMs = DEV_HMR_DEBOUNCE_MS,
  derivedProgressHeartbeatMs = DERIVED_PROGRESS_HEARTBEAT_MS,
  timerApi = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  }
}: HarnessServerOptions) {
  applyHarnessToolchainToProcessEnv();
  const hotDevelopmentMode = resolveHotDevelopmentMode(devHotMode);
  if (hotDevelopmentMode) {
    return startHotReloadableHarnessServer({
      port,
      hostname,
      adapter,
      repository: providedRepository,
      runtimeRegistry: providedRuntimeRegistry,
      osAdapters,
      pickFolder,
      serverOnly,
      openBrowser,
      launchMode,
      startupTelemetry,
      uiAssetManagerFactory,
      browserLauncher,
      hotSingletonVersion,
      hotReloadDebounceMs,
      derivedProgressHeartbeatMs,
      timerApi
    });
  }

  const state = await initializeHarnessServerState({
    adapter,
    repository: providedRepository,
    runtimeRegistry: providedRuntimeRegistry,
    osAdapters,
    pickFolder,
    serverOnly,
    launchMode,
    startupTelemetry,
    uiAssetManagerFactory,
    hotDevelopmentMode,
    hotReloadDebounceMs
  });
  const handlerRefs = createHarnessHandlerRefs(state, { derivedProgressHeartbeatMs });
  startupTelemetry?.phaseStart("serve", "starting Bun server listeners");
  const server = createHarnessBunServer({
    port,
    hostname,
    handlerRefs
  });

  decorateHarnessServerStop(server, () => state);
  return finalizeHarnessServerStartup({
    server,
    state,
    startupTelemetry,
    openBrowser,
    browserLauncher,
    browserOpenState: {
      browserOpenedOnce: false
    }
  });
}

function resolveHotDevelopmentMode(forcedMode: boolean | undefined) {
  return forcedMode ?? (process.execArgv.includes("--hot") && process.env.NODE_ENV !== "production");
}

async function startHotReloadableHarnessServer(
  options: Required<
    Pick<
      HarnessServerOptions,
      | "port"
      | "serverOnly"
      | "openBrowser"
      | "launchMode"
      | "uiAssetManagerFactory"
      | "browserLauncher"
      | "hotSingletonVersion"
      | "hotReloadDebounceMs"
      | "derivedProgressHeartbeatMs"
      | "timerApi"
    >
  > &
    Pick<
      HarnessServerOptions,
      "hostname" | "adapter" | "repository" | "runtimeRegistry" | "osAdapters" | "pickFolder" | "startupTelemetry"
    >
) {
  let singleton = getDevHarnessServerSingleton<
    HarnessServerState,
    HarnessHandlerRefs,
    Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
    HarnessWebSocketOptions
  >();

  if (singleton && singleton.version !== options.hotSingletonVersion) {
    clearPendingHotReloadUpdate(singleton, options.timerApi);
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[dev] hot singleton schema changed (${singleton.version} -> ${options.hotSingletonVersion}); restarting server state`
      );
    }
    await singleton.server.stop(true);
    clearDevHarnessServerSingleton();
    singleton = undefined;
  }

  const state = await initializeHarnessServerState({
    adapter: singleton?.state.adapter ?? options.adapter ?? new PiSdkAgentAdapter(),
    repository: options.repository,
    runtimeRegistry: options.runtimeRegistry,
    osAdapters: options.osAdapters,
    pickFolder: options.pickFolder ?? pickProjectFolder,
    serverOnly: options.serverOnly,
    launchMode: options.launchMode,
    startupTelemetry: options.startupTelemetry,
    uiAssetManagerFactory: options.uiAssetManagerFactory,
    hotDevelopmentMode: true,
    hotReloadDebounceMs: options.hotReloadDebounceMs,
    existingState: singleton?.state
  });
  const handlerRefs = createHarnessHandlerRefs(state, { derivedProgressHeartbeatMs: options.derivedProgressHeartbeatMs });

  if (singleton) {
    options.startupTelemetry?.phaseStart(
      "serve",
      options.hotReloadDebounceMs > 0
        ? `queueing dev hot reload apply after ${options.hotReloadDebounceMs}ms quiet window`
        : "reloading Bun server handlers"
    );
    queueHotReloadUpdate({
      singleton,
      state,
      handlerRefs,
      debounceMs: options.hotReloadDebounceMs,
      timerApi: options.timerApi
    });
    return finalizeHarnessServerStartup({
      server: singleton.server,
      state: singleton.state,
      startupTelemetry: options.startupTelemetry,
      openBrowser: options.openBrowser,
      browserLauncher: options.browserLauncher,
      browserOpenState: singleton
    });
  }

  const websocketShell: HarnessWebSocketOptions = {
    open(ws) {
      singleton?.handlerRefs.websocket.open(ws);
    },
    close(ws, code, reason) {
      singleton?.handlerRefs.websocket.close(ws, code, reason);
    },
    message(ws, message) {
      singleton?.handlerRefs.websocket.message(ws, message);
    }
  };

  options.startupTelemetry?.phaseStart("serve", "starting Bun server listeners");
  const server = createHarnessBunServer({
    port: options.port,
    hostname: options.hostname,
    handlerRefs,
    websocket: websocketShell
  });

  singleton = setDevHarnessServerSingleton({
    version: options.hotSingletonVersion,
    state,
    handlerRefs,
    server,
    browserOpenedOnce: false,
    websocketShell,
    pendingState: undefined,
    pendingHandlerRefs: undefined,
    pendingApplyTimer: undefined
  });
  decorateHarnessServerStop(server, () => {
    const currentSingleton = getDevHarnessServerSingleton<
      HarnessServerState,
      HarnessHandlerRefs,
      Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
      HarnessWebSocketOptions
    >();
    return currentSingleton?.state ?? state;
  }, () => {
    const currentSingleton = getDevHarnessServerSingleton<
      HarnessServerState,
      HarnessHandlerRefs,
      Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
      HarnessWebSocketOptions
    >();
    if (currentSingleton?.server === server) {
      clearPendingHotReloadUpdate(currentSingleton, options.timerApi);
      clearDevHarnessServerSingleton();
    }
  });

  return finalizeHarnessServerStartup({
    server,
    state,
    startupTelemetry: options.startupTelemetry,
    openBrowser: options.openBrowser,
    browserLauncher: options.browserLauncher,
    browserOpenState: singleton
  });
}

async function initializeHarnessServerState(input: {
  adapter: PiAgentAdapter;
  repository?: WorkspaceRepository;
  runtimeRegistry?: AgentRuntimeRegistry;
  osAdapters?: Partial<HarnessServerOsAdapters>;
  pickFolder: typeof pickProjectFolder;
  serverOnly: boolean;
  launchMode: SetupLaunchMode;
  startupTelemetry?: StartupTelemetrySink;
  uiAssetManagerFactory: typeof createUiAssetManager;
  hotDevelopmentMode: boolean;
  hotReloadDebounceMs: number;
  existingState?: HarnessServerState;
}) {
  const osAdapters = resolveHarnessServerOsAdapters(input.osAdapters);
  const initialRepository = input.existingState?.repository ?? input.repository ?? new WorkspaceRepository(Bun.env.HARNESS_DB_PATH);
  const baseServices = await runStartupPhase(
    input.startupTelemetry,
    "bootstrap",
    input.existingState ? "reusing startup services from hot singleton" : "initializing startup services",
    "startup services ready",
    async () => ({
      adapter: input.existingState?.adapter ?? input.adapter,
      runtimeRegistry:
        input.existingState?.runtimeRegistry ??
        input.runtimeRegistry ??
        new AgentRuntimeRegistry([new PiRuntime(input.adapter), new CopilotCliRuntime(), new CodexCliRuntime()]),
      osAdapters: input.existingState?.osAdapters ?? osAdapters,
      pendingBrowserApprovals: input.existingState?.pendingBrowserApprovals ?? new Map<string, PendingBrowserApproval>(),
      backgroundRunControllers: input.existingState?.backgroundRunControllers ?? new Map<string, BackgroundRunControl>(),
      projectSearchControllers: input.existingState?.projectSearchControllers ?? new Map<string, { requestId: string; abortController: AbortController }>(),
      connections: input.existingState?.connections ?? new Set<Bun.ServerWebSocket<HarnessConnection>>(),
      uploadthingHandler:
        input.existingState?.uploadthingHandler ??
        createRouteHandler({
          router: createHarnessUploadRouter(initialRepository)
        }),
      ui: resolveUiServingState({
        serverOnly: input.serverOnly,
        hotDevelopmentMode: input.hotDevelopmentMode,
        uiAssetManagerFactory: input.uiAssetManagerFactory,
        hotReloadDebounceMs: input.hotReloadDebounceMs,
        existingUi: input.existingState?.ui
      })
    })
  );
  const { repository, runtime } = await runStartupPhase(
    input.startupTelemetry,
    "workspace",
    input.existingState ? "reusing workspace state from hot singleton" : "loading workspace state",
    "workspace state ready",
    async () => {
      if (input.existingState) {
        hydrateAdapterFromRepository(baseServices.adapter, input.existingState.repository);
        return {
          repository: input.existingState.repository,
          runtime: input.existingState.runtime
        };
      }

      const repository = initialRepository;
      const runtime = new WorkspaceRuntimeStore(repository.loadWorkspace());
      hydrateAdapterFromRepository(baseServices.adapter, repository);

      return {
        repository,
        runtime
      };
    }
  );

  await runStartupPhase(
    input.startupTelemetry,
    "runtimes",
    "refreshing runtime capabilities",
    "runtime capabilities ready",
    async () => baseServices.runtimeRegistry.refreshAll()
  );

  const setupResult = await runStartupPhase(
    input.startupTelemetry,
    "setup",
    input.existingState ? "refreshing setup state from hot singleton" : "building setup state and startup managers",
    input.existingState ? "setup state refreshed" : "startup managers ready",
    async () => {
      if (input.existingState) {
        const currentSetupState = await refreshHarnessSetupState({
          adapter: baseServices.adapter,
          repository,
          runtimeRegistry: baseServices.runtimeRegistry,
          runtime,
          launchMode: input.launchMode
        });
        input.existingState.assistantManager.cleanupStaleAssistantQuestions();
        syncAssistantQuestionNotifications(repository);
        syncBrowserApprovalNotifications(repository);
        input.existingState.assistantManager.recoverStaleBootstrapRuns();
        for (const run of repository.loadBackgroundJobsState().runs) {
          saveBackgroundRunStatusNotification(repository, run);
        }
        const assistantManager = input.existingState.assistantManager;
        const scheduler = createBackgroundJobScheduler({
          repository,
          runtime,
          runtimeRegistry: baseServices.runtimeRegistry,
          assistantManager,
          connections: baseServices.connections,
          backgroundRunControllers: baseServices.backgroundRunControllers
        });
        return {
          currentSetupState,
          assistantManager,
          cliSessionManager: input.existingState.cliSessionManager,
          scheduler
        };
      }

      const currentSetupState = await refreshHarnessSetupState({
        adapter: baseServices.adapter,
        repository,
        runtimeRegistry: baseServices.runtimeRegistry,
        runtime,
        launchMode: input.launchMode
      });
      const assistantManager = new AssistantManager(repository, baseServices.runtimeRegistry, {
        onAssistantsUpdated() {
          syncAssistantQuestionNotifications(repository);
          emitAssistantsUpdatedToAll(baseServices.connections, repository.loadAssistantsState());
          emitNotificationsUpdatedToAll(
            baseServices.connections,
            `assistant:auto:${crypto.randomUUID()}`,
            repository.loadNotificationInboxState()
          );
          emitExecutionControlUpdatedToAll(
            baseServices.connections,
            `assistant:auto:${crypto.randomUUID()}`,
            repository.getExecutionControlState()
          );
        },
        onAssistantChatDelta(nextInput) {
          emitAssistantChatDeltaToAll(baseServices.connections, nextInput);
        },
        onAssistantChatMessageAppended(nextInput) {
          emitAssistantChatMessageAppendedToAll(baseServices.connections, nextInput);
        },
        onAssistantChatComplete(nextInput) {
          emitAssistantChatCompleteToAll(baseServices.connections, nextInput);
        },
        onAssistantLogAppended(entry) {
          emitAssistantLogAppendedToAll(baseServices.connections, entry);
        },
        onAssistantCreatedCard(assistant) {
          emitAssistantCreatedCardToAll(baseServices.connections, assistant);
        }
      });
      assistantManager.cleanupStaleAssistantQuestions();
      syncAssistantQuestionNotifications(repository);
      syncBrowserApprovalNotifications(repository);
      assistantManager.recoverStaleBootstrapRuns();
      for (const run of repository.loadBackgroundJobsState().runs) {
        saveBackgroundRunStatusNotification(repository, run);
      }

      const cliSessionManager = new CliSessionManager({
        runtimeStore: runtime,
        onSessionStarted({ requestId, projectId, threadId, session }) {
          emitCliSessionStartedToAll(baseServices.connections, {
            requestId,
            projectId,
            threadId,
            session
          });
        },
        onSessionUpdated({ requestId, projectId, threadId, session }) {
          emitCliSessionUpdatedToAll(baseServices.connections, {
            requestId,
            projectId,
            threadId,
            session
          });
        },
        onSessionExited({ requestId, projectId, threadId, session }) {
          emitCliSessionExitedToAll(baseServices.connections, {
            requestId,
            projectId,
            threadId,
            session
          });
        },
        onAttachReady({ requestId, projectId, threadId, sessionId, attachToken }) {
          emitCliSessionAttachReadyToAll(baseServices.connections, {
            requestId,
            projectId,
            threadId,
            sessionId,
            attachToken
          });
        }
      });

      const scheduler = createBackgroundJobScheduler({
        repository,
        runtime,
        runtimeRegistry: baseServices.runtimeRegistry,
        assistantManager,
        connections: baseServices.connections,
        backgroundRunControllers: baseServices.backgroundRunControllers
      });

      return {
        currentSetupState,
        assistantManager,
        cliSessionManager,
        scheduler
      };
    }
  );

  await runUiStartupPhase(input.startupTelemetry, baseServices.ui);

  return {
    adapter: baseServices.adapter,
    runtimeRegistry: baseServices.runtimeRegistry,
    repository,
    runtime,
    pickFolder: input.pickFolder,
    serverOnly: input.serverOnly,
    launchMode: input.launchMode,
    pendingBrowserApprovals: baseServices.pendingBrowserApprovals,
    backgroundRunControllers: baseServices.backgroundRunControllers,
    projectSearchControllers: baseServices.projectSearchControllers,
    connections: baseServices.connections,
    uploadthingHandler: baseServices.uploadthingHandler,
    ui: baseServices.ui,
    osAdapters: baseServices.osAdapters,
    currentSetupState: setupResult.currentSetupState,
    assistantManager: setupResult.assistantManager,
    cliSessionManager: setupResult.cliSessionManager,
    scheduler: setupResult.scheduler
  } satisfies HarnessServerState;
}

async function runUiStartupPhase(startupTelemetry: StartupTelemetrySink | undefined, ui: UiServingState) {
  if (ui.mode === "server-only") {
    return;
  }

  await runStartupPhase(
    startupTelemetry,
    "ui-assets",
    ui.liveReload === "debounced-poll" ? "building and watching debounced dev ui assets" : "building and watching ui assets",
    "ui assets ready",
    async () => {
      await ui.uiAssets.ensureBuilt();
      ui.uiAssets.startWatching();
    }
  );
}

function createBackgroundJobScheduler(input: {
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  runtimeRegistry: AgentRuntimeRegistry;
  assistantManager: AssistantManager;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
}) {
  const { repository, runtime, runtimeRegistry, assistantManager, connections, backgroundRunControllers } = input;
  return new BackgroundJobScheduler({
    repository,
    isRunLive(run) {
      return isBackgroundRunLive(backgroundRunControllers, runtime, run);
    },
    onRunsTimingOut(runs) {
      for (const run of runs) {
        backgroundRunControllers.get(run.id)?.abortController.abort();
      }
    },
    repairActiveRuns(now) {
      return resumeAndRepairBackgroundJobRuns(
        repository,
        connections,
        runtimeRegistry,
        runtime,
        backgroundRunControllers,
        assistantManager,
        now
      );
    },
    async onRunsRepaired(runs) {
      for (const run of runs) {
        syncBackgroundJobFailureTracking(repository, run);
        saveBackgroundRunStatusNotification(repository, run);
        await emitBackgroundJobRunUpdatedToAll(connections, run);
      }
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    },
    onRunQueued(run, job) {
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      void emitBackgroundJobRunUpdatedToAll(connections, run);
      if (run.status === "queued") {
        return launchBackgroundJobRun(
          connections,
          repository,
          runtimeRegistry,
          runtime,
          backgroundRunControllers,
          assistantManager,
          run.id
        );
      }
    },
    onTickFailed(error) {
      const failureMessage = error instanceof Error ? error.message : "Unknown background scheduler failure";
      if (process.env.NODE_ENV !== "production") {
        console.error(error);
      }
      const now = new Date().toISOString();
      for (const job of repository.loadBackgroundJobsState().jobs.filter((entry) => entry.status === "enabled")) {
        repository.updateBackgroundJobSchedulerState(job.id, {
          schedulerStatus: "stale",
          schedulerDetail: failureMessage,
          blockedReason: failureMessage,
          lastSchedulerCheckAt: now
        });
      }
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    }
  });
}

function createHarnessHandlerRefs(
  state: HarnessServerState,
  options: {
    derivedProgressHeartbeatMs: number;
  }
): HarnessHandlerRefs {
  const getCurrentPreferencesState = () => getPreferencesState(state.repository, state.adapter, state.runtimeRegistry);

  return {
    routes: undefined,
    fetch(request, serverInstance) {
      const url = new URL(request.url);

      if (url.pathname === "/api/uploadthing") {
        return state.uploadthingHandler(request);
      }

      if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const upgraded = serverInstance.upgrade(request, {
          data: { clientId: crypto.randomUUID(), kind: "control" as const }
        });

        if (!upgraded) {
          return new Response("Websocket upgrade failed", { status: 400 });
        }

        return undefined;
      }

      if (url.pathname === "/ws/pty" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const clientId = url.searchParams.get("clientId");
        const token = url.searchParams.get("token");
        if (!clientId || !token) {
          return new Response("Missing PTY attach parameters", { status: 400 });
        }

        const attachRecord = state.cliSessionManager.consumeAttachToken(token, clientId);
        if (!attachRecord) {
          return new Response("Invalid or expired PTY token", { status: 401 });
        }

        const upgraded = serverInstance.upgrade(request, {
          data: {
            clientId,
            kind: "pty" as const,
            sessionId: attachRecord.sessionId
          }
        });
        if (!upgraded) {
          return new Response("PTY websocket upgrade failed", { status: 400 });
        }

        return undefined;
      }

      if (state.serverOnly) {
        return new Response("Harness CLI websocket endpoint", { status: 200 });
      }

      if (state.ui.mode === "static-dist") {
        if (state.ui.liveReload === "debounced-poll" && url.pathname === DEV_UI_LIVE_RELOAD_ENDPOINT) {
          return new Response(JSON.stringify(state.ui.uiAssets.getLiveReloadState()), {
            headers: {
              "cache-control": "no-store",
              "content-type": "application/json; charset=utf-8"
            }
          });
        }

        const assetPath = state.ui.uiAssets.resolveAsset(url.pathname);
        if (assetPath) {
          return createUiAssetResponse(assetPath, state.ui.liveReload);
        }
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        state.connections.add(ws);
        if (ws.data.kind === "pty" && ws.data.sessionId) {
          state.cliSessionManager.attachSocket({
            sessionId: ws.data.sessionId,
            clientId: ws.data.clientId,
            socket: ws
          });
          return;
        }

        sendEvent(ws, {
          type: "connection.ready",
          payload: {
            agents: [...defaultAgentCatalog],
            workspace: state.runtime.getWorkspace(),
            executionControl: state.repository.getExecutionControlState(),
            preferences: getCurrentPreferencesState(),
            setup: state.currentSetupState,
            backgroundJobs: state.repository.loadBackgroundJobsState(),
            assistants: state.repository.loadAssistantsState(),
            notifications: state.repository.loadNotificationInboxState()
          }
        });
      },
      close(ws) {
        state.connections.delete(ws);
        const searchController = state.projectSearchControllers.get(ws.data.clientId);
        searchController?.abortController.abort();
        state.projectSearchControllers.delete(ws.data.clientId);
        if (ws.data.kind === "pty" && ws.data.sessionId) {
          state.cliSessionManager.detachSocket(ws.data.sessionId);
        } else {
          state.cliSessionManager.detachClient(ws.data.clientId);
        }
      },
      message(ws, message) {
        if (ws.data.kind === "pty") {
          if (typeof message === "string" || !ws.data.sessionId) {
            return;
          }

          const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
          if (bytes[0] === STREAM_HEARTBEAT) {
            state.cliSessionManager.recordPtyPong(ws.data.sessionId, ws.data.clientId);
            return;
          }

          void state.cliSessionManager.writeToSession(ws.data.sessionId, bytes).catch(() => {
            // CliSessionManager owns durable session state for failed writes.
          });
          return;
        }

        const text = typeof message === "string" ? message : new TextDecoder().decode(message);

        let command: ClientCommand;
        try {
          command = parseClientCommand(JSON.parse(text));
        } catch (error) {
          sendCommandRejected(
            ws,
            "Invalid websocket command",
            error instanceof Error ? error.message : "Unknown parse error"
          );
          return;
        }

        void handleCommand(
          ws,
          command,
          state.runtime,
          state.repository,
          state.adapter,
          state.runtimeRegistry,
          state.assistantManager,
          state.cliSessionManager,
          state.pickFolder,
          getCurrentPreferencesState,
          async (requestId) => {
            state.currentSetupState = await refreshHarnessSetupState({
              adapter: state.adapter,
              repository: state.repository,
              runtimeRegistry: state.runtimeRegistry,
              runtime: state.runtime,
              launchMode: state.launchMode
            });
            emitSetupUpdatedToAll(state.connections, requestId, state.currentSetupState);
            return state.currentSetupState;
          },
          state.pendingBrowserApprovals,
          state.connections,
          state.backgroundRunControllers,
          state.projectSearchControllers,
          state.scheduler,
          state.osAdapters,
          options.derivedProgressHeartbeatMs
        ).catch((error) => {
          if (error instanceof PreflightDecisionRequiredError) {
            return;
          }
          if (LOG_COMMAND_ERRORS) {
            console.error(error);
          }
          sendCommandRejected(
            ws,
            "Harness command failed",
            error instanceof Error ? error.message : "Unknown command error",
            command.requestId
          );
        });
      }
    }
  };
}

function createHarnessBunServer(input: {
  port: number;
  hostname?: string;
  handlerRefs: HarnessHandlerRefs;
  websocket?: HarnessWebSocketOptions;
}) {
  return Bun.serve<HarnessConnection>({
    port: input.port,
    hostname: input.hostname,
    routes: input.handlerRefs.routes,
    fetch: input.handlerRefs.fetch,
    websocket: input.websocket ?? input.handlerRefs.websocket
  });
}

function decorateHarnessServerStop(
  server: Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
  getState: () => HarnessServerState,
  onStopped?: () => void
) {
  const stop = server.stop.bind(server);
  server.stop = ((closeActiveConnections?: boolean) => {
    const state = getState();
    failLiveBackgroundRunsOnShutdown(state.repository, state.backgroundRunControllers);
    if (state.ui.mode === "static-dist") {
      state.ui.uiAssets.dispose();
    }
    state.scheduler.stop();
    onStopped?.();
    return stop(closeActiveConnections);
  }) as typeof server.stop;
}

function finalizeHarnessServerStartup(input: {
  server: Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>;
  state: HarnessServerState;
  startupTelemetry?: StartupTelemetrySink;
  openBrowser: boolean;
  browserLauncher: typeof openHarnessBrowser;
  browserOpenState: {
    browserOpenedOnce: boolean;
  };
}) {
  input.state.scheduler.stop();
  input.state.scheduler.start();
  const serverUrl = `http://${input.server.hostname ?? "localhost"}:${input.server.port}`;
  if (process.env.NODE_ENV !== "test") {
    console.log(`Harness ${HARNESS_APP_VERSION} server listening on ${serverUrl}`);
  }
  input.startupTelemetry?.phaseComplete("server listeners ready", {
    port: input.server.port,
    serverUrl
  });
  input.startupTelemetry?.complete(`Harness ${HARNESS_APP_VERSION} server listening on ${serverUrl}`, {
    port: input.server.port,
    serverUrl
  });
  if (input.openBrowser && !input.state.serverOnly && !input.browserOpenState.browserOpenedOnce) {
    input.browserOpenState.browserOpenedOnce = true;
    void input.browserLauncher(serverUrl);
  }
  return input.server;
}

function resolveUiServingState(input: {
  serverOnly: boolean;
  hotDevelopmentMode: boolean;
  uiAssetManagerFactory: typeof createUiAssetManager;
  hotReloadDebounceMs: number;
  existingUi?: UiServingState;
}): UiServingState {
  if (input.serverOnly) {
    return {
      mode: "server-only"
    };
  }

  if (input.existingUi?.mode === "static-dist") {
    return {
      ...input.existingUi,
      liveReload: input.hotDevelopmentMode ? "debounced-poll" : "disabled"
    };
  }

  return {
    mode: "static-dist",
    uiAssets: input.uiAssetManagerFactory({
      debounceMs: input.hotDevelopmentMode ? input.hotReloadDebounceMs : 0
    }),
    liveReload: input.hotDevelopmentMode ? "debounced-poll" : "disabled"
  };
}

function queueHotReloadUpdate(input: {
  singleton: NonNullable<
    ReturnType<
      typeof getDevHarnessServerSingleton<
        HarnessServerState,
        HarnessHandlerRefs,
        Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
        HarnessWebSocketOptions
      >
    >
  >;
  state: HarnessServerState;
  handlerRefs: HarnessHandlerRefs;
  debounceMs: number;
  timerApi: TimerApi;
}) {
  input.singleton.pendingState = input.state;
  input.singleton.pendingHandlerRefs = input.handlerRefs;
  clearPendingHotReloadUpdate(input.singleton, input.timerApi);

  if (input.debounceMs <= 0) {
    applyHotReloadUpdate(input.singleton);
    return;
  }

  input.singleton.pendingApplyTimer = input.timerApi.setTimeout(() => {
    input.singleton.pendingApplyTimer = undefined;
    applyHotReloadUpdate(input.singleton);
  }, input.debounceMs);
  setDevHarnessServerSingleton(input.singleton);
}

function applyHotReloadUpdate(
  singleton: NonNullable<
    ReturnType<
      typeof getDevHarnessServerSingleton<
        HarnessServerState,
        HarnessHandlerRefs,
        Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
        HarnessWebSocketOptions
      >
    >
  >
) {
  if (!singleton.pendingState || !singleton.pendingHandlerRefs) {
    return;
  }

  const previousState = singleton.state;
  singleton.state = singleton.pendingState;
  singleton.handlerRefs = singleton.pendingHandlerRefs;
  singleton.pendingState = undefined;
  singleton.pendingHandlerRefs = undefined;
  singleton.server.reload({
    fetch: singleton.handlerRefs.fetch,
    routes: singleton.handlerRefs.routes,
    websocket: singleton.websocketShell
  });
  setDevHarnessServerSingleton(singleton);
  if (previousState.scheduler !== singleton.state.scheduler) {
    previousState.scheduler.stop();
  }
  singleton.state.scheduler.stop();
  singleton.state.scheduler.start();
}

function clearPendingHotReloadUpdate(
  singleton: {
    pendingApplyTimer?: ReturnType<typeof setTimeout>;
  },
  timerApi: TimerApi
) {
  if (!singleton.pendingApplyTimer) {
    return;
  }

  timerApi.clearTimeout(singleton.pendingApplyTimer);
  singleton.pendingApplyTimer = undefined;
}

async function createUiAssetResponse(assetPath: string, liveReload: UiLiveReloadMode) {
  const asset = Bun.file(assetPath);
  const headers = new Headers(liveReload === "debounced-poll" ? { "cache-control": "no-store" } : undefined);

  if (assetPath.endsWith(".js.map")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  if (liveReload === "debounced-poll" && path.basename(assetPath) === "index.html") {
    const html = await asset.text();
    headers.set("content-type", "text/html; charset=utf-8");

    return new Response(injectDevLiveReloadScript(html), {
      headers
    });
  }

  return new Response(asset, {
    headers
  });
}

function failLiveBackgroundRunsOnShutdown(
  repository: WorkspaceRepository,
  backgroundRunControllers: Map<string, BackgroundRunControl>
) {
  for (const [runId, control] of backgroundRunControllers.entries()) {
    const run = repository.getBackgroundJobRun(runId);
    if (run?.status === "running") {
      repository.setBackgroundJobRunStatus(run.id, "failed", {
        failureMessage: "Local harness process shut down before completion",
        failureCategory: "shutdown-interrupt"
      });
      repository.appendBackgroundJobRunEvent(
        run.id,
        "failed",
        "Background run interrupted by shutdown",
        "The local harness process shut down before completion."
      );
    }
    abortBackgroundRunControl(control);
  }
  backgroundRunControllers.clear();
}

function disposeBackgroundRunControl(control: BackgroundRunControl | undefined) {
  if (!control) {
    return;
  }
  if (control.renewTimer) {
    clearInterval(control.renewTimer);
    control.renewTimer = undefined;
  }
}

function abortBackgroundRunControl(control: BackgroundRunControl | undefined) {
  if (!control) {
    return;
  }
  disposeBackgroundRunControl(control);
  control.abortController.abort();
}

function injectDevLiveReloadScript(html: string) {
  const script = `<script>
(() => {
  let revision = null;
  const poll = async () => {
    try {
      const response = await fetch("${DEV_UI_LIVE_RELOAD_ENDPOINT}", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const state = await response.json();
      if (revision === null) {
        revision = state.revision;
        return;
      }
      if (state.building || state.pending || state.revision === revision) {
        return;
      }
      revision = state.revision;
      window.location.reload();
    } catch {}
  };
  void poll();
  window.setInterval(() => {
    void poll();
  }, 1000);
})();
</script>`;

  return html.includes("</body>") ? html.replace("</body>", `${script}\n</body>`) : `${html}\n${script}`;
}

function hydrateAdapterFromRepository(adapter: PiAgentAdapter, repository: WorkspaceRepository) {
  const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
  const storedGoogleApiKey = repository.getStoredGoogleApiKey();
  const storedAnthropicApiKey = repository.getStoredAnthropicApiKey();

  if (storedOpenAiApiKey) {
    adapter.setApiKey("openai", storedOpenAiApiKey);
  }

  if (storedGoogleApiKey) {
    adapter.setApiKey("google", storedGoogleApiKey);
  }

  if (storedAnthropicApiKey) {
    adapter.setApiKey("anthropic", storedAnthropicApiKey);
  }

  applyAdapterAutoCompactionThreshold(adapter, repository.getAutoCompactContextThresholdPercentDefault());
}

async function refreshHarnessSetupState(input: {
  adapter: PiAgentAdapter;
  repository: WorkspaceRepository;
  runtimeRegistry: AgentRuntimeRegistry;
  runtime: WorkspaceRuntimeStore;
  launchMode: SetupLaunchMode;
}) {
  return buildSetupState({
    workspace: input.runtime.getWorkspace(),
    preferences: getPreferencesState(input.repository, input.adapter, input.runtimeRegistry),
    launchMode: input.launchMode
  });
}

async function runStartupPhase<T>(
  startupTelemetry: StartupTelemetrySink | undefined,
  phaseId: StartupPhaseId,
  startMessage: string,
  completeMessage: string,
  task: () => Promise<T>
) {
  startupTelemetry?.phaseStart(phaseId, startMessage);
  const result = await task();
  startupTelemetry?.phaseComplete(completeMessage);
  return result;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

async function handleCommand(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  command: ClientCommand,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  runtimeRegistry: AgentRuntimeRegistry,
  assistantManager: AssistantManager,
  cliSessionManager: CliSessionManager,
  pickFolder: typeof pickProjectFolder,
  getCurrentPreferencesState: () => PreferencesState,
  emitSetupRefresh: (requestId: string) => Promise<SetupState>,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  projectSearchControllers: Map<string, { requestId: string; abortController: AbortController }>,
  scheduler: BackgroundJobScheduler,
  osAdapters: HarnessServerOsAdapters,
  derivedProgressHeartbeatMs: number
) {
  switch (command.type) {
    case "connection.ping": {
      sendEvent(ws, {
        type: "connection.pong",
        requestId: command.requestId,
        payload: command.payload
      });
      return;
    }
    case "notification.mark-read": {
      repository.markNotificationRead(command.payload.notificationId);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "notifications.mark-all-read": {
      repository.markAllPassiveNotificationsRead();
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "execution.pause-all": {
      // Websocket commands are handled concurrently. Yield once so an immediately
      // preceding start command can create its run before the global pause flips.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      repository.setGlobalExecutionPaused(true);
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      return;
    }
    case "execution.resume-all": {
      repository.setGlobalExecutionPaused(false);
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      await releaseDeferredExecutionState(
        command.requestId,
        runtime,
        repository,
        adapter,
        runtimeRegistry,
        assistantManager,
        connections,
        backgroundRunControllers,
        scheduler
      );
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      return;
    }
    case "agent.list": {
      sendEvent(ws, {
        type: "agent.list",
        requestId: command.requestId,
        payload: {
          agents: [...defaultAgentCatalog]
        }
      });
      return;
    }
    case "agent.runtime.refresh": {
      const agentRuntimes = await runtimeRegistry.refreshAll();
      emitAgentRuntimeUpdatedToAll(connections, command.requestId, agentRuntimes);
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "setup.refresh": {
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "cli-session.start": {
      assertGlobalExecutionNotPaused(repository);
      const project = runtime.getProject(command.payload.projectId);
      assertActiveThread(project, command.payload.threadId);
      const agentRuntime = runtimeRegistry.get(command.payload.agentId);
      const capability = agentRuntime.getCapability() ?? (await agentRuntime.refreshCapability());
      if (!capability.installed) {
        throw new Error(capability.healthMessage ?? `${agentRuntime.label} is not installed`);
      }
      if (!capability.authenticated) {
        throw new Error(capability.healthMessage ?? `${agentRuntime.label} is not authenticated`);
      }
      if (!capability.interactivePipeCompatible || !capability.supportsInteractive) {
        throw new Error(capability.healthMessage ?? `${agentRuntime.label} does not support interactive pipe sessions`);
      }

      runtime.setProjectSelectedAgentId(project.id, agentRuntime.id);
      await cliSessionManager.startSession({
        requestId: command.requestId,
        projectId: project.id,
        threadId: project.activeThreadId,
        agentRuntime,
        cwd: project.rootPath,
        cols: command.payload.cols,
        rows: command.payload.rows,
        prompt: command.payload.prompt,
        runId: command.payload.runId,
        clientId: ws.data.clientId
      });
      return;
    }
    case "cli-session.stop": {
      await cliSessionManager.stopSession(command.payload);
      return;
    }
    case "cli-session.resize": {
      cliSessionManager.resizeSession({
        requestId: command.requestId,
        ...command.payload
      });
      return;
    }
    case "cli-session.attach": {
      cliSessionManager.attachSession({
        requestId: command.requestId,
        ...command.payload,
        clientId: ws.data.clientId
      });
      return;
    }
    case "cli-session.capture-visible-buffer": {
      cliSessionManager.captureVisibleBuffer(command.payload);
      return;
    }
    case "project.add": {
      const result = repository.openProject(command.payload.rootPath);
      runtime.upsertPersistedProject(result.project);
      runtime.setActiveProject(result.project.id);
      sendEvent(ws, {
        type: "project.opened",
        requestId: command.requestId,
        payload: {
          project: runtime.getProject(result.project.id),
          activeProjectId: runtime.getWorkspace().activeProjectId!,
          resolution: result.resolution
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "project.create": {
      const rootPath = await ensureProjectDirectory(command.payload.rootPath);
      const result = repository.openProject(rootPath);
      runtime.upsertPersistedProject(result.project);
      runtime.setActiveProject(result.project.id);
      sendEvent(ws, {
        type: "project.opened",
        requestId: command.requestId,
        payload: {
          project: runtime.getProject(result.project.id),
          activeProjectId: runtime.getWorkspace().activeProjectId!,
          resolution: result.resolution
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "project.git.initBaseline": {
      const project = runtime.getProject(command.payload.projectId);
      const result = await initializeGitBaseline(project.rootPath);
      sendEvent(ws, {
        type: "project.git.initialized",
        requestId: command.requestId,
        payload: {
          projectId: project.id,
          rootPath: project.rootPath,
          initialized: result.initialized,
          baselineCommitCreated: result.baselineCommitCreated
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "project.browse": {
      const selectedPath = await pickFolder();
      if (!selectedPath) {
        return;
      }

      const result = repository.openProject(selectedPath);
      runtime.upsertPersistedProject(result.project);
      runtime.setActiveProject(result.project.id);
      sendEvent(ws, {
        type: "project.opened",
        requestId: command.requestId,
        payload: {
          project: runtime.getProject(result.project.id),
          activeProjectId: runtime.getWorkspace().activeProjectId!,
          resolution: result.resolution
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "project.remove": {
      const project = runtime.getProject(command.payload.projectId);
      if (runtime.hasAnyStreamingThread(command.payload.projectId)) {
        throw new Error("Project is streaming");
      }

      const { activeProjectId } = repository.removeProject(command.payload.projectId);
      runtime.removeProject(command.payload.projectId, activeProjectId);
      for (const connection of connections) {
        sendEvent(connection, {
          type: "project.removed",
          requestId: command.requestId,
          payload: {
            projectId: command.payload.projectId,
            activeProjectId
          }
        });
      }
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "project.activate": {
      repository.activateProject(command.payload.projectId);
      runtime.setActiveProject(command.payload.projectId);
      sendEvent(ws, {
        type: "project.activated",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "project.search": {
      projectSearchControllers.get(ws.data.clientId)?.abortController.abort();
      const abortController = new AbortController();
      projectSearchControllers.set(ws.data.clientId, {
        requestId: command.requestId,
        abortController
      });
      try {
        const results = await osAdapters.searchProjectFolders({
          query: command.payload.query,
          workspaceProjectPaths: runtime.getWorkspace().projects.map((project) => project.rootPath),
          signal: abortController.signal
        });
        const latestSearch = projectSearchControllers.get(ws.data.clientId);
        if (latestSearch?.requestId !== command.requestId || abortController.signal.aborted) {
          return;
        }
        sendEvent(ws, {
          type: "project.search.results",
          requestId: command.requestId,
          payload: {
            query: command.payload.query,
            results
          }
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        sendCommandRejected(
          ws,
          "Project search failed",
          error instanceof Error ? error.message : "Unknown project search error"
        );
      } finally {
        const latestSearch = projectSearchControllers.get(ws.data.clientId);
        if (latestSearch?.requestId === command.requestId) {
          projectSearchControllers.delete(ws.data.clientId);
        }
      }
      return;
    }
    case "thread.create": {
      const nextProject = repository.createThread(command.payload.projectId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId, nextProject.activeThreadId);
      sendEvent(ws, {
        type: "thread.created",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          project: runtime.getProject(command.payload.projectId)
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "thread.activate": {
      const nextProject = repository.activateThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(nextProject);
      sendEvent(ws, {
        type: "thread.activated",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          project: runtime.getProject(command.payload.projectId)
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
    case "thread.fork": {
      const nextProject = repository.forkThread(command.payload.projectId, command.payload.sourceThreadId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId, nextProject.activeThreadId);
      sendEvent(ws, {
        type: "thread.created",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          project: runtime.getProject(command.payload.projectId)
        }
      });
      return;
    }
    case "thread.rename": {
      const nextProject = repository.renameThread(command.payload.projectId, command.payload.threadId, command.payload.title);
      runtime.upsertPersistedProject(nextProject);
      const thread = nextProject.threads.find((entry) => entry.id === command.payload.threadId);
      if (!thread) {
        throw new Error(`Unknown thread: ${command.payload.threadId}`);
      }

      sendEvent(ws, {
        type: "thread.renamed",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          thread
        }
      });
      return;
    }
    case "thread.archive": {
      const archivedProject = repository.archiveThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(archivedProject);
      await stopThreadActivityBeforeArchive({
        ws,
        requestId: command.requestId,
        repository,
        runtime,
        cliSessionManager,
        pendingBrowserApprovals,
        projectId: command.payload.projectId,
        threadId: command.payload.threadId
      });
      const nextProject = repository.getProject(command.payload.projectId);
      runtime.upsertPersistedProject(nextProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, nextProject);
      return;
    }
    case "thread.cleanupArchive": {
      const result = repository.cleanupArchiveThreads({
        projectIds: command.payload.projectIds?.length ? command.payload.projectIds : undefined,
        cutoffIso: new Date(Date.now() - command.payload.olderThanMs).toISOString()
      });
      for (const project of result.projects) {
        runtime.upsertPersistedProject(project.project);
      }
      sendEvent(ws, {
        type: "thread.cleanupArchived",
        requestId: command.requestId,
        payload: result
      });
      return;
    }
    case "thread.restore": {
      const nextProject = repository.restoreThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(nextProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, nextProject);
      return;
    }
    case "session.reset": {
      const activeProject = runtime.getProject(command.payload.projectId);
      if (activeProject.session.isStreaming) {
        throw new Error("Project is streaming");
      }

      const project = repository.resetProject(command.payload.projectId);
      runtime.upsertPersistedProject(project);
      runtime.clearProjectTransients(command.payload.projectId, project.activeThreadId);

      const nextProject = runtime.getProject(command.payload.projectId);
      sendEvent(ws, {
        type: "session.reset",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: nextProject.activeThreadId,
          sessionId: nextProject.session.sessionId,
          state: nextProject.session
        }
      });
      return;
    }
    case "chat.stop": {
      requirePersistedThreadRun(
        repository,
        command.payload.projectId,
        command.payload.threadId,
        command.payload.runId
      );
      runtime.getAbortController(command.payload.projectId, command.payload.runId)?.abort();
      runtime.setProjectStreaming(command.payload.projectId, false, command.payload.threadId);
      runtime.clearStreaming(command.payload.projectId, command.payload.threadId);
      runtime.setProjectError(command.payload.projectId, "Chat request stopped by user", command.payload.threadId);

      rejectPendingBrowserApprovalsForRun(
        pendingBrowserApprovals,
        command.payload.projectId,
        command.payload.runId,
        "Run stopped"
      );
      const stoppedProject = repository.setAgentRunStatus(command.payload.projectId, command.payload.runId, "stopped");
      runtime.upsertPersistedProject(stoppedProject);
      emitRunUpdatedById(ws, command.requestId, repository, command.payload.projectId, command.payload.runId);

      sendEvent(ws, {
        type: "chat.error",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: command.payload.threadId,
          message: "Chat request stopped by user"
        }
      });

      debugLog("chat.stop", {
        projectId: command.payload.projectId
      });
      return;
    }
    case "chat.send": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = runtimeRegistry.get(command.payload.agentId);
      const agentCapability = agentRuntime.getCapability() ?? (await agentRuntime.refreshCapability());
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRun(repository, runtime, projectId, command.payload.threadId);
      assertRuntimeAvailable(agentRuntime, agentCapability);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const promptContent = appendCapturedCliContext(command.payload.content, capturedCliContext);
      const providerBrand = repository.getProviderBrand();
      const debugEnabled = command.payload.debug ?? repository.getDebugEnabledDefault();
      const resolvedExecutionModel = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentCapability,
        providerBrand,
        requestedModelId: command.payload.executionModelId,
        persistedModelId: project.session.executionModelId
      });
      const effectiveExecutionModelId = resolvedExecutionModel.modelId;

      repository.activateProject(projectId);
      runtime.setActiveProject(projectId);
      runtime.clearProjectTransients(projectId, command.payload.threadId);
      runtime.setProjectSelectedAgentId(projectId, command.payload.agentId);

      const resolvedModes = resolveModeCatalog(runtime.getWorkspace().workspaceModes, project.projectModes);
      const modeIntentContext = {
        stickyModeId: project.selectedModeId,
        recentMessages: project.session.messages.slice(-6).map((message) => ({
          role: message.role,
          content: message.content
        }))
      };
      const detectedMode = detectAutoMode(command.payload.content, resolvedModes, modeIntentContext);
      const autoModeRequested = command.payload.modeId === "auto";
      const effectiveModeId =
        command.payload.modeLocked && command.payload.modeId && !autoModeRequested
          ? command.payload.modeId
          : detectedMode?.modeId ?? (autoModeRequested ? undefined : command.payload.modeId) ?? project.selectedModeId;
      const effectiveMode = resolveModeById(effectiveModeId, runtime.getWorkspace().workspaceModes, project.projectModes);

      if (!autoModeRequested && effectiveModeId && effectiveModeId !== project.selectedModeId) {
        const modeProject = repository.setProjectSelectedMode(projectId, effectiveModeId);
        runtime.upsertPersistedProject(modeProject);
        emitProjectUpdated(ws, command.requestId, projectId, modeProject);
      }

      const userMessageProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(userMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      const assistantIntent = detectAssistantChatIntent(command.payload.content);
      if (assistantIntent.kind === "create-ready") {
        const result = createAssistantFromThreadIntent({
          repository,
          runtime,
          projectId,
          threadId: command.payload.threadId,
          sourcePrompt: assistantIntent.sourcePrompt,
          name: assistantIntent.name,
          scope: assistantIntent.scope,
          purpose: assistantIntent.purpose,
          agentId: agentRuntime.id,
          providerBrand,
          modeId: effectiveModeId,
          executionModelId: effectiveExecutionModelId,
          fastMode: command.payload.fastMode
        });
        emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
        emitAssistantCreatedCardToAll(connections, result.assistant);
        appendAssistantCreationMessage(ws, command.requestId, runtime, repository, projectId, command.payload.threadId, result);
        if (result.created && result.assistant.bootstrapState === "pending") {
          void assistantManager.bootstrapAssistant(result.assistant.id);
        }
        return;
      }
      if (assistantIntent.kind === "create-needs-purpose") {
        const existing = findExistingAssistantForThreadIntent(repository, projectId, assistantIntent.name, assistantIntent.scope);
        if (existing) {
          appendAssistantCreationMessage(ws, command.requestId, runtime, repository, projectId, command.payload.threadId, {
            assistant: existing,
            created: false
          });
          emitAssistantCreatedCardToAll(connections, existing);
          return;
        }

        const runProject = repository.createAgentRun(
          projectId,
          promptContent,
          agentRuntime.getDefaultPlanningModelId(providerBrand),
          command.payload.threadId,
          command.payload.runtimeBudget?.maxTurns
        );
        const createdRun = runProject.activeRun ?? repository.getLatestThreadRun(projectId, command.payload.threadId);
        if (!createdRun) {
          throw new Error("Run was not created");
        }
        runtime.upsertPersistedProject(runProject);
        emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
        const questionProject = repository.appendPlanningQuestion(
          projectId,
          createdRun.id,
          createAssistantPurposeQuestion({
            projectId,
            threadId: command.payload.threadId,
            sourcePrompt: assistantIntent.sourcePrompt,
            suggestedName: assistantIntent.name,
            defaultScope: assistantIntent.scope
          })
        );
        runtime.upsertPersistedProject(questionProject);
        emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.clearStreaming(projectId, command.payload.threadId);
        const promptProject = repository.appendMessage(
          projectId,
          "assistant",
          `What should ${assistantIntent.name} do for this project?`,
          command.payload.threadId
        );
        runtime.upsertPersistedProject(promptProject);
        emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
        return;
      }

      const assistantAction = resolveAssistantChatAction({
        content: command.payload.content,
        projectId,
        assistants: repository.loadAssistantsState().assistants,
        jobs: repository.loadBackgroundJobsState().jobs,
        questions: repository.loadAssistantsState().questions,
        todos: repository.loadAssistantsState().todos
      });
      if (assistantAction.kind === "execute") {
        await executeAssistantChatAction({
          ws,
          requestId: command.requestId,
          connections,
          repository,
          runtime,
          adapter,
          runtimeRegistry,
          backgroundRunControllers,
          assistantManager,
          projectId,
          threadId: command.payload.threadId,
          action: assistantAction.action
        });
        return;
      }

      const runProject = repository.createAgentRun(
        projectId,
        promptContent,
        agentRuntime.getDefaultPlanningModelId(providerBrand),
        command.payload.threadId,
        command.payload.runtimeBudget?.maxTurns
      );
      const createdRun = runProject.activeRun ?? repository.getLatestThreadRun(projectId, command.payload.threadId);
      if (!createdRun) {
        throw new Error("Run was not created");
      }
      runtime.upsertPersistedProject(runProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);

      if (assistantIntent.kind === "ambiguous") {
        const questionProject = repository.appendPlanningQuestion(projectId, createdRun.id, createAssistantIntentQuestion({
          projectId,
          threadId: command.payload.threadId,
          sourcePrompt: assistantIntent.sourcePrompt,
          suggestedName: assistantIntent.suggestedName
        }));
        runtime.upsertPersistedProject(questionProject);
        emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.clearStreaming(projectId, command.payload.threadId);
        const promptProject = repository.appendMessage(
          projectId,
          "assistant",
          questionProject.activeRun?.questions.find((question) => question.intent?.type === "assistant-create-intent")?.prompt ??
          `Do you want to create a project assistant named "${assistantIntent.suggestedName}", or run this once in project chat?`,
          command.payload.threadId
        );
        runtime.upsertPersistedProject(promptProject);
        emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
        return;
      }

      if (assistantAction.kind === "clarify") {
        const questionProject = repository.appendPlanningQuestion(projectId, createdRun.id, createAssistantActionIntentQuestion(assistantAction));
        runtime.upsertPersistedProject(questionProject);
        emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.clearStreaming(projectId, command.payload.threadId);
        const promptProject = repository.appendMessage(projectId, "assistant", assistantAction.prompt, command.payload.threadId);
        runtime.upsertPersistedProject(promptProject);
        emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
        return;
      }

      runtime.setProjectExecutionModel(projectId, effectiveExecutionModelId);
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      const estimatedDifficulty = estimateTaskDifficulty(command.payload.content, modeIntentContext);
      const quickTaskBypassEligible =
        effectiveMode?.id !== "plan" &&
        (estimatedDifficulty <= PLANNER_DIFFICULTY_THRESHOLD ||
          isDirectWorkspaceImplementTask(command.payload.content, modeIntentContext));
      if (resolvedExecutionModel.requestedModelRejected) {
        appendSystemStatus(
          ws,
          command.requestId,
          runtime,
          repository,
          projectId,
          command.payload.threadId,
          `${agentRuntime.label} does not support ${resolvedExecutionModel.requestedModelRejected} here. Using ${effectiveExecutionModelId}.`
        );
      }

      const abortController = new AbortController();
      runtime.setAbortController(projectId, createdRun.id, abortController);

      try {
        if (quickTaskBypassEligible) {
          await continueQuickTaskLifecycle(ws, command.requestId, runtime, repository, projectId, {
            agentId: agentRuntime.id,
            providerBrand,
            runId: createdRun.id,
            executionModelId: effectiveExecutionModelId,
            latestUserPrompt: promptContent,
            mode: effectiveMode,
            difficultyScore: estimatedDifficulty,
            threadId: command.payload.threadId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode
          });
          return;
        }

        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, createdRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: createdRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled,
          executionModelId: effectiveExecutionModelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          enableGeminiAttachmentCaching: true,
          abortSignal: abortController.signal,
          derivedProgressHeartbeatMs
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          createdRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, createdRun.id, undefined);
      }

      return;
    }
    case "planning.refine": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      const activeRun = requireActiveRun(project, command.payload.runId);
      if (activeRun.status !== "ready") {
        throw new Error("Only ready runs can be refined");
      }

      assertRuntimeAvailable(agentRuntime);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const promptContent = appendCapturedCliContext(command.payload.content, capturedCliContext);
      const providerBrand = repository.getProviderBrand();
      const executionModelId = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentRuntime.getCapability(),
        providerBrand,
        requestedModelId: activeRun.executionModelId
      }).modelId;
      const debugEnabled = repository.getDebugEnabledDefault();

      const refinedMessageProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(refinedMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      repository.setAgentRunStatus(projectId, activeRun.id, "stopped", "Plan refined before execution");
      runtime.clearProjectTransients(projectId, command.payload.threadId);

      const runProject = repository.createAgentRun(
        projectId,
        promptContent,
        agentRuntime.getDefaultPlanningModelId(providerBrand),
        command.payload.threadId,
        command.payload.runtimeBudget?.maxTurns
      );
      const createdRun = runProject.activeRun ?? repository.getLatestThreadRun(projectId, command.payload.threadId);
      if (!createdRun) {
        throw new Error("Run was not created");
      }
      runtime.upsertPersistedProject(runProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
      runtime.setProjectExecutionModel(projectId, executionModelId);
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, activeRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, createdRun.id, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, createdRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: createdRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled,
          executionModelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal,
          derivedProgressHeartbeatMs
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          createdRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, createdRun.id, undefined);
      }

      return;
    }
    case "planning.answer-batch": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      const answersById = new Map(command.payload.answers.map((answer) => [answer.questionId, answer.content]));
      if (answersById.size !== command.payload.answers.length) {
        throw new Error("Duplicate planning question answers are not allowed");
      }
      const pendingQuestions = command.payload.answers.map((answer) => {
        const question = targetRun.questions.find(
          (entry) => entry.id === answer.questionId && (entry.status === "pending" || entry.status === "deferred")
        );
        if (!question) {
          throw new Error("Planning question is not answerable");
        }
        return question;
      });

      const providerBrand = repository.getProviderBrand();
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const combinedContent = pendingQuestions
        .map((question) => `Q: ${question.prompt}\nA: ${answersById.get(question.id) ?? ""}`)
        .join("\n\n");
      const promptContent = appendCapturedCliContext(combinedContent, capturedCliContext);
      const answerProject = repository.appendMessage(projectId, "user", combinedContent, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(answerProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      let answeredProject = answerProject;
      for (const question of pendingQuestions) {
        answeredProject = repository.answerPlanningQuestion(projectId, targetRun.id, question.id, answersById.get(question.id) ?? "");
        archiveNotificationWithLegacyId(repository, ["planning-question", targetRun.id, question.id]);
      }
      repository.archiveNotification(createPlanningQuestionBatchNotificationId(targetRun.id, pendingQuestions.map((question) => question.id)));
      runtime.upsertPersistedProject(answeredProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());

      const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(targetRun.id);
      if (linkedBackgroundRun?.status === "awaiting-user-input") {
        const resumedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "running", {
          summary: "Resuming after user input"
        });
        saveBackgroundRunStatusNotification(repository, resumedBackgroundRun);
        await emitBackgroundJobRunUpdatedToAll(connections, resumedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      }

      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, targetRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, targetRun.id, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, targetRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: targetRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          executionModelId: resolveExecutionModelIdForRuntime({
            runtime: agentRuntime,
            capability: agentRuntime.getCapability(),
            providerBrand,
            requestedModelId: targetRun.executionModelId ?? project.session.executionModelId
          }).modelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal,
          derivedProgressHeartbeatMs
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          targetRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, targetRun.id, undefined);
      }

      void promptContent;
      return;
    }
    case "planning.answer": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      const pendingQuestion = targetRun.questions.find(
        (question) =>
          question.id === command.payload.questionId &&
          (question.status === "pending" || question.status === "deferred")
      );
      if (!pendingQuestion) {
        throw new Error("Planning question is not answerable");
      }

      const providerBrand = repository.getProviderBrand();
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const promptContent = appendCapturedCliContext(command.payload.content, capturedCliContext);
      const answerProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(answerProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      const answeredProject = repository.answerPlanningQuestion(
        projectId,
        targetRun.id,
        command.payload.questionId,
        promptContent
      );
      runtime.upsertPersistedProject(answeredProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
      archiveNotificationWithLegacyId(repository, ["planning-question", targetRun.id, command.payload.questionId]);
      repository.archiveNotification(
        createPlanningQuestionBatchNotificationId(
          targetRun.id,
          targetRun.questions
            .filter((question) => question.status === "pending" || question.status === "deferred")
            .map((question) => question.id)
        )
      );
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());

      if (pendingQuestion.intent?.type === "assistant-create-intent") {
        const assistantAnswer =
          pendingQuestion.responseKind === "freeform"
            ? classifyAssistantPurposeAnswer(command.payload.content)
            : classifyAssistantIntentAnswer(pendingQuestion, command.payload.content);
        if (assistantAnswer === "create") {
          const result = createAssistantFromThreadIntent({
            repository,
            runtime,
            projectId,
            threadId: command.payload.threadId,
            sourcePrompt: pendingQuestion.intent.sourcePrompt,
            name: pendingQuestion.intent.suggestedName,
            scope: pendingQuestion.intent.defaultScope,
            purpose: pendingQuestion.intent.purpose ?? (pendingQuestion.responseKind === "freeform" ? command.payload.content.trim() : undefined),
            agentId: agentRuntime.id,
            providerBrand,
            modeId: project.selectedModeId,
            executionModelId: targetRun.executionModelId ?? project.session.executionModelId,
            fastMode: command.payload.fastMode
          });
          const completedProject = repository.setAgentRunStatus(projectId, targetRun.id, "completed");
          runtime.upsertPersistedProject(completedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
          emitAssistantCreatedCardToAll(connections, result.assistant);
          appendAssistantCreationMessage(ws, command.requestId, runtime, repository, projectId, command.payload.threadId, result);
          if (result.created && result.assistant.bootstrapState === "pending") {
            void assistantManager.bootstrapAssistant(result.assistant.id);
          }
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }

        if (assistantAnswer === "cancel") {
          const stoppedProject = repository.setAgentRunStatus(projectId, targetRun.id, "stopped", "Assistant creation cancelled.");
          runtime.upsertPersistedProject(stoppedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          const cancelProject = repository.appendMessage(projectId, "assistant", "Cancelled.", command.payload.threadId);
          runtime.upsertPersistedProject(cancelProject);
          emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
      }

      if (pendingQuestion.intent?.type === "assistant-action-intent") {
        if (/^(cancel|never mind|stop)$/i.test(command.payload.content.trim())) {
          const stoppedProject = repository.setAgentRunStatus(projectId, targetRun.id, "stopped", "Assistant action cancelled.");
          runtime.upsertPersistedProject(stoppedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          const cancelProject = repository.appendMessage(projectId, "assistant", "Cancelled.", command.payload.threadId);
          runtime.upsertPersistedProject(cancelProject);
          emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
        const assistantAction = resolveAssistantChatAction({
          content: command.payload.content,
          projectId,
          assistants: repository.loadAssistantsState().assistants,
          jobs: repository.loadBackgroundJobsState().jobs,
          questions: repository.loadAssistantsState().questions,
          todos: repository.loadAssistantsState().todos,
          priorIntent: pendingQuestion.intent
        });
        if (assistantAction.kind === "execute") {
          await executeAssistantChatAction({
            ws,
            requestId: command.requestId,
            connections,
            repository,
            runtime,
            adapter,
            runtimeRegistry,
            backgroundRunControllers,
            assistantManager,
            projectId,
            threadId: command.payload.threadId,
            action: assistantAction.action
          });
          const completedProject = repository.setAgentRunStatus(projectId, targetRun.id, "completed");
          runtime.upsertPersistedProject(completedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
        if (assistantAction.kind === "clarify") {
          const questionProject = repository.appendPlanningQuestion(projectId, targetRun.id, createAssistantActionIntentQuestion(assistantAction));
          runtime.upsertPersistedProject(questionProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          const promptProject = repository.appendMessage(projectId, "assistant", assistantAction.prompt, command.payload.threadId);
          runtime.upsertPersistedProject(promptProject);
          emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
      }

      const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(targetRun.id);
      if (linkedBackgroundRun?.status === "awaiting-user-input") {
        archiveNotificationWithLegacyId(repository, ["planning-question", linkedBackgroundRun.id, command.payload.questionId]);
        const resumedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "running", {
          summary: "Resuming after user input"
        });
        saveBackgroundRunStatusNotification(repository, resumedBackgroundRun);
        await emitBackgroundJobRunUpdatedToAll(connections, resumedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
        emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      }

      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, targetRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, targetRun.id, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, targetRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: targetRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          executionModelId: resolveExecutionModelIdForRuntime({
            runtime: agentRuntime,
            capability: agentRuntime.getCapability(),
            providerBrand,
            requestedModelId: targetRun.executionModelId ?? project.session.executionModelId
          }).modelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal,
          derivedProgressHeartbeatMs
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          targetRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, targetRun.id, undefined);
      }

      return;
    }
    case "run.execute": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertNoOtherWorkingRun(repository, runtime, projectId, command.payload.threadId, command.payload.runId);
      const activeRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      if (activeRun.status !== "ready") {
        throw new Error(`Run status ${activeRun.status} is not executable`);
      }
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);

      const providerBrand = repository.getProviderBrand();
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, activeRun.id, abortController);

      try {
        await executeRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, activeRun.id), pendingBrowserApprovals, connections, osAdapters, {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          runId: activeRun.id,
          sourceRun: activeRun,
          readyPlan: buildReadyPlanFromRun(activeRun),
          executionPlan: activeRun.plan,
          executionTarget: command.payload.target ?? activeRun.executionTarget ?? "current-project",
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal,
          derivedProgressHeartbeatMs
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          activeRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, activeRun.id, undefined);
      }

      return;
    }
    case "run.complete": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      await completeRunWithAssistantMessage(ws, command.requestId, runtime, repository, connections, {
        projectId,
        threadId: command.payload.threadId,
        runId: command.payload.runId,
        assistantMessageContent: command.payload.assistantMessageContent,
        partialReason: command.payload.partialReason
      });
      return;
    }
    case "experiment.inspect": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: run.id });
      const inspection = await manager.readInspection(createExperimentLease(project.rootPath, run.experiment));
      const updatedProject = repository.saveExperimentRun(command.payload.projectId, run.id, inspection.experiment);
      runtime.upsertPersistedProject(updatedProject);
      emitRunUpdated(ws, command.requestId, updatedProject);
      sendEvent(ws, {
        type: "experiment.inspected",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: run.threadId,
          inspection
        }
      });
      return;
    }
    case "experiment.promote": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      await assertExperimentPromotionPreconditions(project.rootPath, run.experiment);
      const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: run.id });
      const lease = createExperimentLease(project.rootPath, run.experiment);
      const inspection = await manager.flushExperiment(lease);
      await createExperimentCommit(project.rootPath, run.id);
      const now = new Date().toISOString();
      const updatedProject = repository.saveExperimentRun(command.payload.projectId, run.id, {
        ...inspection.experiment,
        status: "promoted",
        headCommitSha: await resolveGitHead(project.rootPath),
        promotedAt: now,
        updatedAt: now
      });
      runtime.upsertPersistedProject(updatedProject);
      emitRunUpdated(ws, command.requestId, updatedProject);
      await manager.unmountExperiment(lease);
      return;
    }
    case "experiment.discard": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      const now = new Date().toISOString();
      const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: run.id });
      await manager.discardExperiment(createExperimentLease(project.rootPath, run.experiment));
      const updatedProject = repository.saveExperimentRun(command.payload.projectId, run.id, {
        ...run.experiment,
        status: "discarded",
        discardedAt: now,
        updatedAt: now
      });
      runtime.upsertPersistedProject(updatedProject);
      emitRunUpdated(ws, command.requestId, updatedProject);
      return;
    }
    case "memory.list": {
      sendEvent(ws, {
        type: "memory.listed",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          entries: repository.listMemoryEntries(command.payload.projectId, {
            query: command.payload.search,
            kind: command.payload.kind,
            status: command.payload.status
          })
        }
      });
      return;
    }
    case "memory.inspect": {
      const entry = repository.getMemoryEntry(command.payload.memoryEntryId);
      if (!entry) {
        throw new Error("Memory entry not found");
      }

      sendEvent(ws, {
        type: "memory.inspected",
        requestId: command.requestId,
        payload: {
          entry
        }
      });
      return;
    }
    case "memory.update": {
      const existing = repository.getMemoryEntry(command.payload.memoryEntryId);
      if (!existing) {
        throw new Error("Memory entry not found");
      }

      const entry = repository.saveMemoryEntry({
        ...existing,
        pinned: command.payload.pinned ?? existing.pinned,
        status: command.payload.status ?? existing.status,
        updatedAt: new Date().toISOString()
      });
      sendEvent(ws, {
        type: "memory.updated",
        requestId: command.requestId,
        payload: {
          entry: entry!
        }
      });
      return;
    }
    case "memory.delete": {
      repository.deleteMemoryEntry(command.payload.memoryEntryId);
      sendEvent(ws, {
        type: "memory.deleted",
        requestId: command.requestId,
        payload: {
          memoryEntryId: command.payload.memoryEntryId
        }
      });
      return;
    }
    case "run-diagnostics.inspect": {
      sendEvent(ws, {
        type: "run-diagnostics.inspected",
        requestId: command.requestId,
        payload: {
          report: buildRunDiagnosticsReport(repository, command.payload?.windowDays ?? 7)
        }
      });
      return;
    }
    case "run.resume": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertNoOtherWorkingRun(repository, runtime, projectId, command.payload.threadId, command.payload.runId);
      const activeRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      if (!activeRun.resumable) {
        throw new Error("Run is not resumable");
      }
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);

      const providerBrand = repository.getProviderBrand();
      if (command.payload.guidanceText?.trim()) {
        const guidanceProject = repository.appendMessage(projectId, "user", command.payload.guidanceText, command.payload.threadId);
        runtime.upsertPersistedProject(guidanceProject);
        emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
      }

      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, activeRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, activeRun.id, abortController);

      try {
        await resumeRunLifecycle(
          ws,
          command.requestId,
          runtime,
          repository,
          createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, activeRun.id),
          pendingBrowserApprovals,
          connections,
          osAdapters,
          {
            projectId,
            agentId: agentRuntime.id,
            providerBrand,
            debugEnabled: repository.getDebugEnabledDefault(),
            runId: activeRun.id,
            sourceRun: activeRun,
            abortSignal: abortController.signal,
            guidanceText: command.payload.guidanceText,
            subagentIds: command.payload.subagentIds,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode,
            derivedProgressHeartbeatMs
          }
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          activeRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, activeRun.id, undefined);
      }

      return;
    }
    case "run.retry": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRetry(repository, runtime, projectId, command.payload.threadId, command.payload.runId);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);

      const retryRun = requireRetryablePersistedRun(repository, projectId, command.payload.threadId, command.payload.runId);
      const providerBrand = repository.getProviderBrand();
      const executionModelId = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentRuntime.getCapability(),
        providerBrand,
        requestedModelId: retryRun.executionModelId
      }).modelId;
      const debugEnabled = repository.getDebugEnabledDefault();

      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);

      const abortController = new AbortController();
      let executionRunId: string | undefined;

      try {
        if (!command.payload.subagentId) {
          const runProject = repository.createAgentRun(
            projectId,
            retryRun.latestUserPrompt,
            retryRun.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand),
            command.payload.threadId,
            command.payload.runtimeBudget?.maxTurns ?? retryRun.runtimeBudget?.maxTurns
          );
          const nextRunId = runProject.activeRun?.id;
          if (!nextRunId) {
            throw new Error("Retry run was not created");
          }
          executionRunId = nextRunId;
          runtime.setAbortController(projectId, nextRunId, abortController);
          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);

          await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, nextRunId), pendingBrowserApprovals, connections, {
            projectId,
            threadId: command.payload.threadId,
            runId: nextRunId,
            agentId: agentRuntime.id,
            providerBrand,
            debugEnabled,
            executionModelId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode,
            abortSignal: abortController.signal,
            derivedProgressHeartbeatMs
          });
        } else {
          const readyPlan = buildReadyPlanFromRun(retryRun);
          const targetTask = readyPlan.subtasks.find((task) => task.id === command.payload.subagentId);
          if (!targetTask) {
            throw new Error(`Unknown subagent: ${command.payload.subagentId}`);
          }

          let runProject = repository.createAgentRun(
            projectId,
            retryRun.latestUserPrompt,
            retryRun.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand),
            command.payload.threadId,
            command.payload.runtimeBudget?.maxTurns ?? retryRun.runtimeBudget?.maxTurns
          );
          const nextRunId = runProject.activeRun?.id;
          if (!nextRunId) {
            throw new Error("Retry run was not created");
          }
          executionRunId = nextRunId;
          runtime.setAbortController(projectId, nextRunId, abortController);

          const retryExecutionPlan = buildExecutionPlanFromRun(retryRun, nextRunId);
          runProject = repository.setAgentRunReady(
            projectId,
            nextRunId,
            readyPlan,
            retryExecutionPlan,
            readyPlan.subtasks,
            retryRun.planningModelId
          );
          for (const task of retryRun.subtasks) {
            if (task.id === command.payload.subagentId) {
              continue;
            }

            if (task.status === "completed") {
              runProject = repository.markSubtaskCompleted(
                projectId,
                nextRunId,
                task.id,
                task.output ?? "",
                task.attemptCount,
                task.commitSha,
                task.worktreePath,
                task.mountPath
              );
              continue;
            }

            if (task.status === "failed") {
              runProject = repository.markSubtaskFailed(
                projectId,
                nextRunId,
                task.id,
                task.errorMessage ?? "Unknown subagent failure",
                task.attemptCount,
                task.worktreePath,
                task.mountPath
              );
            }
          }

          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);
          await executeInlineSubagentRetryLifecycle(
            ws,
            command.requestId,
            runtime,
            repository,
            createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, nextRunId),
            pendingBrowserApprovals,
            connections,
            {
              projectId,
              agentId: agentRuntime.id,
              providerBrand,
              runId: nextRunId,
              sourceRun: retryRun,
              targetTask,
              readyPlan,
              reasoningStrength: command.payload.reasoningStrength,
              fastMode: command.payload.fastMode,
              abortSignal: abortController.signal,
              derivedProgressHeartbeatMs
            }
          );
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          executionRunId ?? retryRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        if (executionRunId) {
          runtime.setAbortController(projectId, executionRunId, undefined);
        }
      }

      return;
    }
    case "run.refresh": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      assertRunCanRefresh(targetRun);

      const executionStates = runtime
        .getRunExecutionStates(projectId, targetRun.id)
        .filter((state) => command.payload.subagentId === undefined || state.subagentId === command.payload.subagentId);

      if (executionStates.length === 0) {
        throw new Error("No refreshable execution is active for this run");
      }

      for (const executionState of executionStates) {
        await requestExecutionRefresh(
          ws,
          command.requestId,
          runtime,
          repository,
          projectId,
          executionState.threadId,
          executionState
        );
      }

      return;
    }
    case "background-job.save": {
      const project = runtime.getProject(command.payload.job.projectId);
      const riskLevel = computeBackgroundJobRiskLevel(command.payload.job, project, runtime);
      const savedState = repository.saveBackgroundJob({
        ...command.payload.job,
        riskLevel,
        nextRunAt: resolveBackgroundJobNextRunAt(command.payload.job.schedule),
        updatedAt: new Date().toISOString()
      });
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
    case "background-job.delete": {
      const savedState = repository.deleteBackgroundJob(command.payload.projectId, command.payload.jobId);
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
    case "background-job.pause": {
      const savedState = repository.setBackgroundJobStatus(command.payload.projectId, command.payload.jobId, "paused");
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
    case "background-job.resume": {
      const savedState = repository.setBackgroundJobStatus(command.payload.projectId, command.payload.jobId, "enabled");
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
    case "background-job.run-now": {
      assertGlobalExecutionNotPaused(repository);
      const loadedJob = requireBackgroundJobForProject(repository, command.payload.projectId, command.payload.jobId);
      const job = repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
      if (job.status === "disabled") {
        throw new Error(`Background job ${job.id} is disabled`);
      }
      if (job.assistantId) {
        assertAssistantRunnableForLaunch(repository, job.assistantId);
      }
      await repairBackgroundJobRunsForJob(
        repository,
        connections,
        command.payload.jobId,
        (run) => isBackgroundRunLive(backgroundRunControllers, runtime, run)
      );
      const activeRun = repository.getActiveBackgroundJobRuns(command.payload.jobId)[0];
      if (activeRun) {
        throw new Error(formatActiveBackgroundRunError(activeRun));
      }
      const queuedRun = repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: job.assistantId,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "queued",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      });
      repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Background run queued manually");
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      await emitBackgroundJobRunUpdatedToAll(connections, queuedRun);
      await launchBackgroundJobRun(
        connections,
        repository,
        runtimeRegistry,
        runtime,
        backgroundRunControllers,
        assistantManager,
        queuedRun.id
      );
      return;
    }
    case "background-job.stop-run": {
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "stop");
      const control = backgroundRunControllers.get(existingRun.id);
      const updatedRun = repository.setBackgroundJobRunStatus(existingRun.id, "cancelled", {
        failureMessage: "Stopped by user",
        failureCategory: "manual-abort"
      });
      if (existingRun.linkedAgentRunId) {
        const stoppedProject = repository.setAgentRunStatus(
          existingRun.projectId,
          existingRun.linkedAgentRunId,
          "stopped",
          "Background run stopped by user"
        );
        runtime.upsertPersistedProject(stoppedProject);
        emitRunUpdatedById(ws, command.requestId, repository, existingRun.projectId, existingRun.linkedAgentRunId, connections);
      }
      repository.appendBackgroundJobRunEvent(existingRun.id, "cancelled", "Background run cancelled", "Stopped by user");
      saveBackgroundRunStatusNotification(repository, updatedRun);
      abortBackgroundRunControl(control);
      backgroundRunControllers.delete(existingRun.id);
      await emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "background-job.retry-run": {
      assertGlobalExecutionNotPaused(repository);
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "retry");
      const queuedRun = repository.createBackgroundJobRun({
        jobId: existingRun.jobId,
        projectId: existingRun.projectId,
        assistantId: existingRun.assistantId,
        automationThreadId: existingRun.automationThreadId,
        triggerSource: "retry",
        status: "queued",
        riskLevel: existingRun.riskLevel,
        approvalStatus: existingRun.approvalStatus === "pending" ? "pending" : "approved"
      });
      repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Background run queued by retry");
      await emitBackgroundJobRunUpdatedToAll(connections, queuedRun);
      if (queuedRun.status === "queued") {
        await launchBackgroundJobRun(
          connections,
          repository,
          runtimeRegistry,
          runtime,
          backgroundRunControllers,
          assistantManager,
          queuedRun.id
        );
      }
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      return;
    }
    case "background-job.approve-run": {
      assertGlobalExecutionNotPaused(repository);
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "approve");
      const updatedRun = repository.setBackgroundJobRunStatus(existingRun.id, "queued", {
        approvalStatus: "approved"
      });
      repository.appendBackgroundJobRunEvent(existingRun.id, "queued", "Background run approved");
      archiveNotificationWithLegacyId(repository, ["background-run-status", updatedRun.id]);
      await emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      await launchBackgroundJobRun(
        connections,
        repository,
        runtimeRegistry,
        runtime,
        backgroundRunControllers,
        assistantManager,
        updatedRun.id
      );
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "background-job.reject-run": {
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "reject");
      const updatedRun = repository.setBackgroundJobRunStatus(existingRun.id, "cancelled", {
        approvalStatus: "rejected",
        failureMessage: "Rejected before execution",
        failureCategory: "manual-abort"
      });
      repository.appendBackgroundJobRunEvent(existingRun.id, "cancelled", "Background run rejected");
      saveBackgroundRunStatusNotification(repository, updatedRun);
      await emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "background-job.schedule.preview": {
      sendEvent(ws, {
        type: "background-job-schedule.preview",
        requestId: command.requestId,
        payload: previewBackgroundJobSchedule(command.payload.input, command.payload.timezone)
      });
      return;
    }
    case "assistant.create": {
      const savedAssistant = repository.saveAssistant(
        {
          ...command.payload.assistant,
          providerBrand: command.payload.assistant.providerBrand ?? repository.getProviderBrand(),
          fastMode: command.payload.assistant.fastMode ?? false
        },
        command.payload.assetRefs ?? []
      );
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitAssistantCreatedCardToAll(connections, savedAssistant);
      void assistantManager.bootstrapAssistant(savedAssistant.id);
      return;
    }
    case "assistant.create-from-thread": {
      const project = runtime.getProject(command.payload.projectId);
      assertActiveThread(project, command.payload.threadId);
      const result = createAssistantFromThreadIntent({
        repository,
        runtime,
        projectId: command.payload.projectId,
        threadId: command.payload.threadId,
        sourcePrompt: command.payload.sourcePrompt,
        name: command.payload.name ?? inferAssistantNameFromPrompt(command.payload.sourcePrompt),
        scope: command.payload.scope ?? "project",
        agentId: command.payload.agentId,
        providerBrand: repository.getProviderBrand(),
        modeId: command.payload.modeId ?? project.selectedModeId,
        executionModelId: command.payload.executionModelId ?? project.session.executionModelId,
        fastMode: command.payload.fastMode
      });
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitAssistantCreatedCardToAll(connections, result.assistant);
      if (result.created && result.assistant.bootstrapState === "pending") {
        void assistantManager.bootstrapAssistant(result.assistant.id);
      }
      return;
    }
    case "assistant.update": {
      repository.saveAssistant(command.payload.assistant, command.payload.assetRefs ?? []);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      return;
    }
    case "assistant.delete": {
      for (const [runId, control] of backgroundRunControllers.entries()) {
        const run = repository.getBackgroundJobRun(runId);
        if (run?.assistantId === command.payload.assistantId) {
          abortBackgroundRunControl(control);
          backgroundRunControllers.delete(runId);
        }
      }
      repository.deleteAssistant(command.payload.assistantId);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      return;
    }
    case "assistant.pause": {
      repository.setAssistantRunState(command.payload.assistantId, "paused");
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      return;
    }
    case "assistant.resume": {
      repository.setAssistantRunState(command.payload.assistantId, "active");
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      assistantManager.scheduleReprioritize(command.payload.assistantId, "manual-resume");
      return;
    }
    case "assistant.clone-to-project": {
      const source = repository.getAssistant(command.payload.assistantId);
      if (!source) {
        throw new Error(`Unknown assistant: ${command.payload.assistantId}`);
      }
      const clonedAssistant: Assistant = {
        ...source,
        id: createAssistantId(),
        scope: "project",
        projectId: command.payload.projectId,
        clonedFromAssistantId: source.id,
        circuitBreakerState: "closed",
        circuitBreakerReason: undefined,
        failureStreakCount: 0,
        unreadQuestionCount: 0,
        latestActivityAt: new Date().toISOString(),
        deletedAt: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const clonedAssetRefs = repository.getAssistantAssetRefs(source.id).map((assetRef) => ({
        ...assetRef,
        id: createAssistantAssetRefId(),
        assistantId: clonedAssistant.id,
        createdAt: new Date().toISOString()
      }));
      const savedAssistant = repository.cloneAssistantToProject(source.id, command.payload.projectId, clonedAssistant, clonedAssetRefs);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitAssistantCreatedCardToAll(connections, savedAssistant);
      return;
    }
    case "assistant.inspect": {
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      return;
    }
    case "assistant.bootstrap.retry": {
      assertGlobalExecutionNotPaused(repository);
      assertAssistantRunnableForLaunch(repository, command.payload.assistantId);
      void assistantManager.retryBootstrap(command.payload.assistantId);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      return;
    }
    case "assistant.circuit-breaker.retry": {
      assertGlobalExecutionNotPaused(repository);
      await assistantManager.recoverAssistant(command.payload.assistantId);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "assistant.chat.send": {
      assertGlobalExecutionNotPaused(repository);
      assertAssistantRunnableForLaunch(repository, command.payload.assistantId);
      await assistantManager.sendAssistantChat(command.payload.assistantId, command.payload.content);
      return;
    }
    case "assistant.question.answer": {
      assertGlobalExecutionNotPaused(repository);
      await assistantManager.answerQuestion(command.payload.assistantId, command.payload.questionId, command.payload.content);
      archiveNotificationWithLegacyId(repository, [
        "assistant-question",
        command.payload.assistantId,
        command.payload.questionId
      ]);
      repository.archiveNotification(
        createAssistantQuestionBatchNotificationId(
          command.payload.assistantId,
          repository
            .getAssistantQuestions(command.payload.assistantId)
            .filter((question) => question.status === "pending" || question.status === "deferred" || question.id === command.payload.questionId)
            .map((question) => question.id)
        )
      );
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "assistant.question.answer-batch": {
      assertGlobalExecutionNotPaused(repository);
      const answersById = new Map(command.payload.answers.map((answer) => [answer.questionId, answer.content]));
      if (answersById.size !== command.payload.answers.length) {
        throw new Error("Duplicate assistant question answers are not allowed");
      }
      const questions = repository.getAssistantQuestions(command.payload.assistantId);
      for (const answer of command.payload.answers) {
        const question = questions.find(
          (entry) => entry.id === answer.questionId && (entry.status === "pending" || entry.status === "deferred")
        );
        if (!question) {
          throw new Error("Assistant question is not answerable");
        }
      }
      for (const answer of command.payload.answers) {
        await assistantManager.answerQuestion(command.payload.assistantId, answer.questionId, answer.content);
        archiveNotificationWithLegacyId(repository, [
          "assistant-question",
          command.payload.assistantId,
          answer.questionId
        ]);
      }
      repository.archiveNotification(
        createAssistantQuestionBatchNotificationId(command.payload.assistantId, command.payload.answers.map((answer) => answer.questionId))
      );
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "assistant.todo.update": {
      repository.saveAssistantTodo(command.payload.todo);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      assistantManager.scheduleReprioritize(command.payload.todo.assistantId, "manual-todo-update");
      return;
    }
    case "assistant.todo.delete": {
      repository.deleteAssistantTodo(command.payload.assistantId, command.payload.todoId);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      assistantManager.scheduleReprioritize(command.payload.assistantId, "manual-todo-delete");
      return;
    }
    case "assistant.todo.reorder": {
      repository.reorderAssistantTodos(command.payload.assistantId, command.payload.todoIds);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      assistantManager.scheduleReprioritize(command.payload.assistantId, "manual-todo-reorder");
      return;
    }
    case "assistant.learning.delete": {
      repository.deleteAssistantLearning(command.payload.assistantId, command.payload.learningId);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      assistantManager.scheduleReprioritize(command.payload.assistantId, "manual-learning-delete");
      return;
    }
    case "browser.approval.resolve": {
      if (command.payload.approved) {
        assertGlobalExecutionNotPaused(repository);
      }
      const project = runtime.getProject(command.payload.projectId);
      const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === command.payload.runId);
      if (!run) {
        throw new Error(`Run ${command.payload.runId} is not available`);
      }

      const pendingActivity = findPendingBrowserApproval(run.browserSessions ?? [], {
        sessionId: command.payload.sessionId,
        toolCallId: command.payload.toolCallId
      });
      if (!pendingActivity?.approval) {
        throw new Error("Browser approval is not pending");
      }

      const nextProject = repository.setAgentRunBrowserSessions(
        command.payload.projectId,
        command.payload.runId,
        resolveBrowserApproval(structuredClone(run.browserSessions ?? []), {
          runId: command.payload.runId,
          owner: "main",
          sessionId: command.payload.sessionId,
          toolCallId: command.payload.toolCallId,
          approved: command.payload.approved
        })
      );
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdated(ws, command.requestId, nextProject);

      const approvalKey = createBrowserApprovalKey(
        command.payload.projectId,
        command.payload.runId,
        command.payload.sessionId,
        command.payload.toolCallId
      );
      const pendingApproval = pendingBrowserApprovals.get(approvalKey);
      pendingBrowserApprovals.delete(approvalKey);
      pendingApproval?.resolve(command.payload.approved);
      archiveNotificationWithLegacyId(repository, [
        "browser-approval",
        command.payload.projectId,
        command.payload.runId,
        command.payload.sessionId,
        command.payload.toolCallId
      ]);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "project.mode.select": {
      const updatedProject = repository.setProjectSelectedMode(command.payload.projectId, command.payload.modeId);
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, updatedProject);
      return;
    }
    case "mode.save": {
      if (command.payload.scope === "workspace") {
        const workspace = repository.saveMode("workspace", command.payload.mode) as ReturnType<WorkspaceRepository["loadWorkspace"]>;
        runtime.replaceWorkspaceState(workspace);
        emitWorkspaceUpdated(ws, command.requestId, runtime);
        return;
      }

      const updatedProject = repository.saveMode("project", command.payload.mode, command.payload.projectId) as WorkspaceProjectState;
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId!, updatedProject);
      return;
    }
    case "mode.delete": {
      if (command.payload.scope === "workspace") {
        const workspace = repository.deleteMode("workspace", command.payload.modeId) as ReturnType<WorkspaceRepository["loadWorkspace"]>;
        runtime.replaceWorkspaceState(workspace);
        emitWorkspaceUpdated(ws, command.requestId, runtime);
        return;
      }

      const updatedProject = repository.deleteMode("project", command.payload.modeId, command.payload.projectId) as WorkspaceProjectState;
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId!, updatedProject);
      return;
    }
    case "workspace.context.save": {
      const workspace = repository.saveWorkspaceContext({
        rulesContent: command.payload.rulesContent,
        memorySummaryContent: command.payload.memorySummaryContent
      });
      runtime.replaceWorkspaceState(workspace);
      emitWorkspaceUpdated(ws, command.requestId, runtime);
      return;
    }
    case "project.context.save": {
      const updatedProject = repository.saveProjectContext(command.payload.projectId, {
        rulesContent: command.payload.rulesContent,
        threadMemorySummaryContent: command.payload.threadMemorySummaryContent
      });
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, updatedProject);
      return;
    }
    case "preferences.save": {
      if (command.payload.openAiApiKey) {
        repository.setStoredOpenAiApiKey(command.payload.openAiApiKey);
        adapter.setApiKey("openai", command.payload.openAiApiKey);
      }

      if (command.payload.googleApiKey) {
        repository.setStoredGoogleApiKey(command.payload.googleApiKey);
        adapter.setApiKey("google", command.payload.googleApiKey);
      }

      if (command.payload.anthropicApiKey) {
        repository.setStoredAnthropicApiKey(command.payload.anthropicApiKey);
        adapter.setApiKey("anthropic", command.payload.anthropicApiKey);
      }

      repository.setProviderBrand(command.payload.providerBrand);
      repository.setDebugEnabledDefault(command.payload.debugEnabled);
      repository.setTracePanelDefaultOpen(command.payload.tracePanelDefaultOpen);
      repository.setSubagentWorktreeStrategyDefault(command.payload.subagentWorktreeStrategyDefault);
      repository.setBlockChatOnDirtyGitDefault(command.payload.blockChatOnDirtyGitDefault);
      repository.setDirtyGitChangeLimitDefault(command.payload.dirtyGitChangeLimitDefault);
      repository.setAutoCompactContextThresholdPercentDefault(command.payload.autoCompactContextThresholdPercentDefault);
      repository.setPlanExecutionModeDefault(command.payload.planExecutionModeDefault);
      repository.setPlanExecutionDelaySecondsDefault(command.payload.planExecutionDelaySecondsDefault);
      repository.setCorrectnessIterationModeDefault(command.payload.correctnessIterationModeDefault);
      repository.setBackgroundJobApprovalPolicyDefault(command.payload.backgroundJobApprovalPolicyDefault);
      setRepositoryAutoArchiveCompletedThreadsDefault(repository, command.payload.autoArchiveCompletedThreadsDefault ?? false);
      repository.setMemoryBankEnabledDefault(
        command.payload.memoryBankEnabledDefault ?? repository.getMemoryBankEnabledDefault()
      );
      applyAdapterAutoCompactionThreshold(adapter, command.payload.autoCompactContextThresholdPercentDefault);
      await runtimeRegistry.refreshAll();
      const preferences = getCurrentPreferencesState();
      const setup = await emitSetupRefresh(command.requestId);

      sendEvent(ws, {
        type: "preferences.saved",
        requestId: command.requestId,
        payload: {
          ...preferences,
          setup
        }
      });
      return;
    }
    case "preferences.clearApiKey": {
      repository.clearStoredOpenAiApiKey();
      repository.clearStoredGoogleApiKey();
      repository.clearStoredAnthropicApiKey();
      adapter.setApiKey("openai", undefined);
      adapter.setApiKey("google", undefined);
      adapter.setApiKey("anthropic", undefined);
      await runtimeRegistry.refreshAll();
      const preferences = getCurrentPreferencesState();
      const setup = await emitSetupRefresh(command.requestId);

      sendEvent(ws, {
        type: "preferences.apiKeyCleared",
        requestId: command.requestId,
        payload: {
          ...preferences,
          setup
        }
      });
      return;
    }
  }
}

async function openHarnessBrowser(url: string) {
  const command =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];

  try {
    const browserProcess = Bun.spawn({
      cmd: command,
      stdout: "ignore",
      stderr: "ignore"
    });
    const exitCode = await browserProcess.exited;
    if (exitCode !== 0) {
      console.warn(`Failed to open browser automatically. Open ${url} manually.`);
    }
  } catch {
    console.warn(`Failed to open browser automatically. Open ${url} manually.`);
  }
}

async function continueRunLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  options: {
    projectId: ProjectId;
    threadId: ThreadId;
    runId: string;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    debugEnabled: boolean;
    executionModelId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    enableGeminiAttachmentCaching?: boolean;
    abortSignal: AbortSignal;
    derivedProgressHeartbeatMs: number;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = requirePersistedThreadRun(repository, options.projectId, options.threadId, options.runId);
  const threadSession = getThreadSessionState(runtime, repository, options.projectId, options.threadId);
  appendComposerControlStatus(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    activeRun.threadId,
    options.fastMode
  );
  const mode = resolveModeById(project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes);
  const planExecutionMode = mode?.planExecutionModeDefault ?? repository.getPlanExecutionModeDefault();
  const subagentWorktreeStrategy =
    mode?.subagentWorktreeStrategyDefault ?? repository.getSubagentWorktreeStrategyDefault();
  const correctnessIterationMode =
    mode?.correctnessIterationModeDefault ?? repository.getCorrectnessIterationModeDefault();
  const ruleSources = [runtime.getWorkspace().workspaceRuleSource, project.projectRuleSource].filter(
    (value): value is WorkspaceRuleSource => Boolean(value)
  );
  const memorySummaries = [runtime.getWorkspace().workspaceMemorySummary, project.threadMemorySummary].filter(
    (value): value is MemorySummary => Boolean(value)
  );
  const memoryBank =
    repository.getMemoryBankEnabledDefault()
      ? retrieveMemorySummaries(repository, {
        projectId: options.projectId,
        threadId: options.threadId,
        runId: activeRun.id,
        owner: "planner",
        queryText: activeRun.latestUserPrompt
      })
      : { memorySummaries: [] as MemorySummary[] };
  const plannerMemorySummaries = [...memorySummaries, ...memoryBank.memorySummaries];
  const promptCacheIdentity = buildProjectPromptCacheIdentity({
    repository,
    projectId: options.projectId,
    projectRootPath: project.rootPath,
    providerBrand: options.providerBrand,
    selectedModeId: project.selectedModeId,
    mode,
    ruleSources,
    memorySummaries: plannerMemorySummaries
  });
  const geminiCachedAttachmentContext = await prepareRunGeminiAttachmentCache({
    repository,
    projectId: options.projectId,
    modelId: activeRun.planningModelId ?? getDefaultPlanningModelId(options.providerBrand),
    messages: threadSession.messages,
    enabled: options.enableGeminiAttachmentCaching && options.providerBrand === "gemini"
  });
  const plannerTurn = await runPlannerTurn(adapter, {
    cwd: project.rootPath,
    sessionId: threadSession.sessionId,
    messages: threadSession.messages,
    latestUserPrompt: activeRun.latestUserPrompt,
    runId: activeRun.id,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    planningModelId: activeRun.planningModelId,
    executionModelId: options.executionModelId,
    subagentWorktreeStrategy,
    planExecutionMode,
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode,
    mode,
    ruleSources,
    memorySummaries: plannerMemorySummaries,
    priorQuestions: activeRun.questions,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    promptCacheIdentity,
    geminiCachedAttachmentContext,
    abortSignal: options.abortSignal,
    callbacks: createExecutionCallbacks(
      ws,
      requestId,
      runtime,
      repository,
      options.projectId,
      activeRun.threadId,
      threadSession.sessionId,
      activeRun.id,
      pendingBrowserApprovals,
      options.abortSignal,
      connections,
      options.derivedProgressHeartbeatMs
    )
  });
  const promptProject = repository.setAgentRunPromptStats(options.projectId, activeRun.id, plannerTurn.promptStats);
  runtime.upsertPersistedProject(promptProject);

  if (plannerTurn.plannerResult.type === "question") {
    const questionStatus = repository.getGlobalExecutionPaused() ? "deferred" : "pending";
    const questionProject = repository.appendPlanningQuestions(
      options.projectId,
      activeRun.id,
      plannerTurn.plannerResult.questions,
      questionStatus,
      createStableBoundedId(["planner-turn", activeRun.id, plannerTurn.promptStats.promptHash])
    );
    runtime.upsertPersistedProject(questionProject);
    emitRunUpdatedById(ws, requestId, repository, options.projectId, activeRun.id);

    runtime.setProjectStreaming(options.projectId, false, activeRun.threadId);
    runtime.clearStreaming(options.projectId, activeRun.threadId);
    if (questionStatus === "pending") {
      const promptProject = repository.appendMessage(
        options.projectId,
        "assistant",
        plannerTurn.plannerResult.questions.map((question) => question.prompt).join("\n\n"),
        activeRun.threadId
      );
      runtime.upsertPersistedProject(promptProject);
      emitThreadMessageAppended(ws, requestId, runtime, repository, options.projectId, activeRun.threadId);
    } else {
      const deferredQuestions = [...new Map([
        ...(questionProject.activeRun?.questions.filter((question) => question.status === "deferred") ?? []),
        ...(questionProject.lastRun?.questions.filter((question) => question.status === "deferred") ?? [])
      ].map((question) => [question.id, question])).values()];
      if (deferredQuestions.length > 1) {
        repository.saveNotification(
          createPlanningQuestionBatchNotification(options.projectId, activeRun.threadId, activeRun.id, deferredQuestions)
        );
      } else {
        for (const deferredQuestion of deferredQuestions) {
          repository.saveNotification(
            createPlanningQuestionNotification(options.projectId, activeRun.threadId, activeRun.id, deferredQuestion)
          );
        }
      }
      emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
      emitExecutionControlUpdatedToAll(connections, requestId, repository.getExecutionControlState());
    }
    return;
  }

  if (!plannerTurn.executionPlan) {
    throw new Error("Planner did not return an execution plan");
  }

  const readyProject = repository.setAgentRunReady(
    options.projectId,
    activeRun.id,
    plannerTurn.plannerResult,
    plannerTurn.executionPlan,
    plannerTurn.plannerResult.subtasks,
    plannerTurn.planningModelId
  );
  runtime.upsertPersistedProject(readyProject);
  emitRunUpdatedById(ws, requestId, repository, options.projectId, activeRun.id);

  if (plannerTurn.plan) {
    runtime.setProjectPlan(options.projectId, plannerTurn.plan, activeRun.threadId);
    sendEvent(ws, {
      type: "agent.plan",
      requestId,
      payload: {
        projectId: options.projectId,
        threadId: activeRun.threadId,
        plan: plannerTurn.plan
      }
    });
  }

  runtime.setProjectStreaming(options.projectId, false, activeRun.threadId);
  runtime.clearStreaming(options.projectId, activeRun.threadId);
  if (shouldAppendPlanSummaryMessage(plannerTurn.executionPlan)) {
    const planSummaryProject = repository.appendMessage(options.projectId, "assistant", plannerTurn.executionPlan.summary, {
      threadId: activeRun.threadId,
      kind: "plan-summary",
      metadata: {
        type: "plan-summary",
        runId: activeRun.id,
        plan: plannerTurn.executionPlan
      }
    });
    runtime.upsertPersistedProject(planSummaryProject);
    emitThreadMessageAppended(ws, requestId, runtime, repository, options.projectId, activeRun.threadId);
  }
  emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
    sessionId: threadSession.sessionId,
    stage: "plan-presented",
    message: "Presented execution plan to user",
    detail: plannerTurn.executionPlan.summary,
    modelId: plannerTurn.executionPlan.executionModelId
  });
}

async function continueQuickTaskLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  options: {
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    runId?: string;
    executionModelId: string;
    latestUserPrompt: string;
    mode?: ModeDefinition;
    difficultyScore?: number;
    threadId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
  }
) {
  const project = runtime.getProject(projectId);
  const activeRun = requireActiveRun(project, options.runId);
  appendComposerControlStatus(ws, requestId, runtime, repository, projectId, activeRun.threadId, options.fastMode);
  const planExecutionMode = options.mode?.planExecutionModeDefault ?? repository.getPlanExecutionModeDefault();
  const subagentWorktreeStrategy =
    options.mode?.subagentWorktreeStrategyDefault ?? repository.getSubagentWorktreeStrategyDefault();
  const correctnessIterationMode =
    options.mode?.correctnessIterationModeDefault ?? repository.getCorrectnessIterationModeDefault();
  const ruleSources = [runtime.getWorkspace().workspaceRuleSource, project.projectRuleSource].filter(
    (value): value is WorkspaceRuleSource => Boolean(value)
  );
  const memorySummaries = [runtime.getWorkspace().workspaceMemorySummary, project.threadMemorySummary].filter(
    (value): value is MemorySummary => Boolean(value)
  );
  const memoryBank =
    repository.getMemoryBankEnabledDefault()
      ? retrieveMemorySummaries(repository, {
        projectId,
        threadId: options.threadId,
        runId: activeRun.id,
        owner: "planner",
        queryText: options.latestUserPrompt
      })
      : { memorySummaries: [] as MemorySummary[] };
  const normalizedLatestUserPrompt = normalizeWorkspaceRelativePaths(options.latestUserPrompt, project.rootPath);
  const plannerReadyTurn: PlannerReadyTurn = {
    type: "ready",
    difficultyScore: options.difficultyScore ?? 10,
    summary: "Low-complexity direct workspace task",
    executionModelId: options.executionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: normalizedLatestUserPrompt,
    prerequisites: [],
    contracts: []
  };
  const executionPlan = buildExecutionPlan({
    runId: activeRun.id,
    planningModelId: activeRun.planningModelId ?? getDefaultPlanningModelId(options.providerBrand),
    plannerResult: plannerReadyTurn,
    subagentWorktreeStrategy,
    planExecutionMode,
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode,
    mode: options.mode,
    ruleSources,
    memorySummaries: [...memorySummaries, ...memoryBank.memorySummaries],
    iteration: 1,
    origin: "quick-task"
  });

  const readyProject = repository.setAgentRunReady(
    projectId,
    activeRun.id,
    plannerReadyTurn,
    executionPlan,
    plannerReadyTurn.subtasks,
    executionPlan.planningModelId
  );
  runtime.upsertPersistedProject(readyProject);
  emitRunUpdatedById(ws, requestId, repository, projectId, activeRun.id);
  runtime.setProjectStreaming(projectId, false, activeRun.threadId);
  runtime.clearStreaming(projectId, activeRun.threadId);
  emitProjectTrace(ws, requestId, runtime, projectId, activeRun.threadId, {
    sessionId: project.session.sessionId,
    stage: "plan-presented",
    message: "Skipped planner for low-complexity direct task",
    detail: normalizedLatestUserPrompt,
    modelId: options.executionModelId
  });
}

async function resumeRunLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  osAdapters: HarnessServerOsAdapters,
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    debugEnabled: boolean;
    runId: string;
    sourceRun: AgentRunState;
    abortSignal: AbortSignal;
    guidanceText?: string;
    subagentIds?: string[];
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    derivedProgressHeartbeatMs: number;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = options.sourceRun;
  const readyPlan = buildReadyPlanFromRun(activeRun);
  const existingResults = activeRun.subtasks
    .filter((task) => task.status === "completed")
    .map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction,
      status: "completed" as const,
      output: task.output,
      commitSha: task.commitSha,
      mountPath: task.mountPath,
      worktreePath: task.worktreePath,
      attemptCount: task.attemptCount,
      durationMs: 0
    }));
  const taskFilter = new Set(options.subagentIds ?? []);
  const tasksToRun = readyPlan.subtasks.filter((task) => {
    const existingTask = activeRun.subtasks.find((entry) => entry.id === task.id);
    if (!existingTask) {
      return true;
    }

    if (taskFilter.size > 0 && !taskFilter.has(task.id)) {
      return false;
    }

    return existingTask.status !== "completed";
  });

  const resumingProject = repository.setAgentRunStatus(
    options.projectId,
    options.runId,
    readyPlan.usesSubagents ? "running-subagents" : "running-main"
  );
  runtime.upsertPersistedProject(resumingProject);
  emitRunUpdated(ws, requestId, resumingProject);

  await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters, {
    projectId: options.projectId,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    debugEnabled: options.debugEnabled,
    runId: options.runId,
    sourceRun: activeRun,
    readyPlan,
    executionPlan: activeRun.plan,
    executionTarget: activeRun.executionTarget,
    existingSubagentResults: existingResults,
    tasksToRun,
    resumeNote: options.guidanceText,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    derivedProgressHeartbeatMs: options.derivedProgressHeartbeatMs
  });
}

async function executeRunLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  osAdapters: HarnessServerOsAdapters,
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    debugEnabled: boolean;
    runId: string;
    sourceRun: AgentRunState;
    readyPlan: PlannerReadyTurn;
    executionPlan?: ExecutionPlan;
    executionTarget?: "current-project" | "ephemeral-experiment";
    existingSubagentResults?: Parameters<typeof executeReadyRun>[1]["existingSubagentResults"];
    tasksToRun?: Parameters<typeof executeReadyRun>[1]["tasksToRun"];
    resumeNote?: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal?: AbortSignal;
    derivedProgressHeartbeatMs: number;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = options.sourceRun;
  appendComposerControlStatus(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    activeRun.threadId,
    options.fastMode
  );
  const executionTarget = options.executionTarget ?? activeRun.executionTarget ?? "current-project";
  let effectiveProject = project;
  let experimentLease: BranchfsExperimentLease | undefined;
  if (executionTarget === "ephemeral-experiment") {
    const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: options.runId }, {
      onTrace(trace) {
        emitProjectTrace(ws, requestId, runtime, options.projectId, project.activeThreadId, {
          sessionId: project.session.sessionId,
          ...trace
        });
      }
    });
    experimentLease = await manager.prepareExperimentLease();
    const experimentProject = repository.setAgentRunExecutionTarget(options.projectId, options.runId, "ephemeral-experiment");
    runtime.upsertPersistedProject(experimentProject);
    const preparedProject = repository.saveExperimentRun(options.projectId, options.runId, {
      ...experimentLease.experiment,
      status: "running",
      updatedAt: new Date().toISOString()
    });
    runtime.upsertPersistedProject(preparedProject);
    emitRunUpdated(ws, requestId, preparedProject);
    effectiveProject = runtime.getProject(options.projectId);
  }

  const currentRun = repository.getAgentRun(options.projectId, activeRun.threadId, options.runId) ?? activeRun;
  const baseExecutionPlan = options.executionPlan ?? buildExecutionPlanFromRun(currentRun, options.runId);
  const retrievedMemory =
    repository.getMemoryBankEnabledDefault()
      ? retrieveMemorySummaries(repository, {
        projectId: options.projectId,
        threadId: activeRun.threadId,
        runId: options.runId,
        owner: "main",
        queryText: [baseExecutionPlan.summary, baseExecutionPlan.finalExecutionBrief].filter(Boolean).join("\n")
      })
      : { memorySummaries: [] as MemorySummary[] };
  const status = options.readyPlan.usesSubagents ? "running-subagents" : "running-main";
  const hasPendingPrerequisites = baseExecutionPlan.prerequisites.some((prerequisite) => prerequisite.status !== "completed");
  const promptCacheIdentity = buildProjectPromptCacheIdentity({
    repository,
    projectId: options.projectId,
    projectRootPath: project.rootPath,
    providerBrand: options.providerBrand,
    selectedModeId: project.selectedModeId,
    mode: baseExecutionPlan.mode,
    ruleSources: baseExecutionPlan.ruleSources,
    memorySummaries: baseExecutionPlan.memorySummaries
  });
  const geminiCachedAttachmentContext = undefined;
  const startedProject = repository.setAgentRunStatus(
    options.projectId,
    options.runId,
    hasPendingPrerequisites ? "running-main" : status
  );
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdated(ws, requestId, startedProject);
  const executionCallbacks = createExecutionCallbacks(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    activeRun.threadId,
    effectiveProject.session.sessionId,
    options.runId,
    pendingBrowserApprovals,
    options.abortSignal,
    connections,
    options.derivedProgressHeartbeatMs
  );
  let executionPlan = baseExecutionPlan;
  if (hasPendingPrerequisites) {
    executionCallbacks.onRunMilestone("Planning done. Running prerequisites.");
    try {
      executionPlan = await executePlanPrerequisites(adapter, {
        cwd: experimentLease?.projectMountPath ?? project.rootPath,
        runId: options.runId,
        sessionId: effectiveProject.session.sessionId,
        messages: effectiveProject.session.messages,
        agentId: options.agentId,
        executionPlan,
        executionModelId: options.readyPlan.executionModelId,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        promptCacheIdentity,
        geminiCachedAttachmentContext,
        abortSignal: options.abortSignal,
        callbacks: executionCallbacks,
        async onPrerequisiteComplete(nextExecutionPlan) {
          const updatedProject = repository.setAgentRunExecutionPlan(options.projectId, options.runId, nextExecutionPlan);
          runtime.upsertPersistedProject(updatedProject);
          emitRunUpdatedById(ws, requestId, repository, options.projectId, options.runId, connections);
        }
      });
    } catch (error) {
      executionCallbacks.closeRunMilestones();
      throw error;
    }
    if (status !== "running-main") {
      const subagentStartedProject = repository.setAgentRunStatus(options.projectId, options.runId, status);
      runtime.upsertPersistedProject(subagentStartedProject);
      emitRunUpdated(ws, requestId, subagentStartedProject);
    }
  }
  const executionPlanWithMemory = {
    ...executionPlan,
    memorySummaries: [...(executionPlan.memorySummaries ?? []), ...retrievedMemory.memorySummaries]
  };
  const executionPromptCacheIdentity = buildProjectPromptCacheIdentity({
    repository,
    projectId: options.projectId,
    projectRootPath: project.rootPath,
    providerBrand: options.providerBrand,
    selectedModeId: project.selectedModeId,
    mode: executionPlanWithMemory.mode,
    ruleSources: executionPlanWithMemory.ruleSources,
    memorySummaries: executionPlanWithMemory.memorySummaries
  });
  const executionGeminiCachedAttachmentContext = await prepareRunGeminiAttachmentCache({
    repository,
    projectId: options.projectId,
    modelId: options.readyPlan.executionModelId,
    messages: effectiveProject.session.messages,
    enabled: false
  });
  executionCallbacks.onRunMilestone(
    options.readyPlan.usesSubagents
      ? `Planning done. Spawning ${options.readyPlan.subtasks.length} subagents. Parallel slots: ${Math.min(4, Math.max(1, executionPlan.actualSubagentCount || options.readyPlan.subtasks.length))}.`
      : "Planning done. Starting main execution."
  );

  let outcome: Awaited<ReturnType<typeof executeReadyRun>>;
  try {
    outcome = await executeReadyRun(adapter, {
      cwd: experimentLease?.projectMountPath ?? project.rootPath,
      runId: options.runId,
      sessionId: effectiveProject.session.sessionId,
      messages: effectiveProject.session.messages,
      agentId: options.agentId,
      providerBrand: options.providerBrand,
      readyPlan: options.readyPlan,
      debugEnabled: options.debugEnabled,
      abortSignal: options.abortSignal,
      existingSubagentResults: options.existingSubagentResults,
      tasksToRun: options.tasksToRun,
      resumeNote: options.resumeNote,
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      promptCacheIdentity: executionPromptCacheIdentity,
      geminiCachedAttachmentContext: executionGeminiCachedAttachmentContext,
      executionPlan: executionPlanWithMemory,
      callbacks: executionCallbacks
    });
  } catch (error) {
    executionCallbacks.closeRunMilestones();
    throw error;
  }

  const reviewCwd = experimentLease?.projectMountPath ?? project.rootPath;
  executionCallbacks.onRunMilestone("Checking correctness.");
  const correctnessReview = await osAdapters.runCorrectnessReview(reviewCwd, executionPlanWithMemory, outcome, options.readyPlan);
  executionCallbacks.onRunMilestone(
    correctnessReview.status === "pass" ? "Correctness review passed." : `Correctness review needs iteration. ${correctnessReview.summary}`
  );
  const reviewedProject = repository.setAgentRunCorrectnessReview(options.projectId, options.runId, correctnessReview);
  runtime.upsertPersistedProject(reviewedProject);
  emitRunUpdatedById(ws, requestId, repository, options.projectId, options.runId, connections);

  if (correctnessReview.status === "needs-iteration" && correctnessReview.recommendedPlan) {
    if (
      correctnessReview.recommendedPlan.difficultyScore < PLANNER_DIFFICULTY_THRESHOLD &&
      correctnessReview.recommendedPlan.iteration < 5
    ) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters, {
        ...options,
        readyPlan: buildReadyPlanFromExecutionPlan(correctnessReview.recommendedPlan),
        executionPlan: correctnessReview.recommendedPlan,
        executionTarget
      });
      return;
    }

    emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
      sessionId: effectiveProject.session.sessionId,
      stage: "correctness-gap",
      message: correctnessReview.summary,
      detail: correctnessReview.gaps.map((gap) => gap.description).join("\n")
    });
    executionCallbacks.closeRunMilestones();
    runtime.clearStreaming(options.projectId, activeRun.threadId);
    runtime.setProjectStreaming(options.projectId, false, activeRun.threadId);
    runtime.setProjectError(options.projectId, undefined, activeRun.threadId);
    await presentCorrectivePlan(ws, requestId, runtime, repository, options.projectId, {
      sessionId: effectiveProject.session.sessionId,
      agentId: options.agentId,
      planningModelId: (repository.getRun(options.projectId, options.runId)?.planningModelId ?? activeRun.planningModelId) ?? getDefaultPlanningModelId(options.providerBrand),
      executionPlan: correctnessReview.recommendedPlan
    });

    if (
      correctnessReview.recommendedPlan.correctnessPolicy === "auto-once" &&
      correctnessReview.recommendedPlan.iteration <= 2
    ) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters, {
        ...options,
        readyPlan: buildReadyPlanFromExecutionPlan(correctnessReview.recommendedPlan),
        executionPlan: correctnessReview.recommendedPlan,
        executionTarget
      });
      return;
    }

    if (
      correctnessReview.recommendedPlan.correctnessPolicy === "auto-until-clean" &&
      correctnessReview.recommendedPlan.iteration < 5
    ) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters, {
        ...options,
        readyPlan: buildReadyPlanFromExecutionPlan(correctnessReview.recommendedPlan),
        executionPlan: correctnessReview.recommendedPlan,
        executionTarget
      });
      return;
    }

    return;
  }

  const finalStatus = outcome.partial ? "partial-complete" : "completed";
  if (experimentLease) {
    const experimentManager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: options.runId });
    const inspection = await experimentManager.readInspection(experimentLease);
    const experimentProject = repository.saveExperimentRun(options.projectId, options.runId, {
      ...inspection.experiment,
      status: finalStatus === "completed" ? "completed" : "partial-complete",
      updatedAt: new Date().toISOString()
    });
    runtime.upsertPersistedProject(experimentProject);
  }
  if (outcome.partial) {
    executionCallbacks.onRunMilestone(`Run partial complete. ${outcome.partialReason ?? "Some subagents failed."}`);
  } else {
    executionCallbacks.onRunMilestone("Run completed.");
  }
  executionCallbacks.closeRunMilestones();

  const completed = await completeRunWithAssistantMessage(ws, requestId, runtime, repository, connections, {
    projectId: options.projectId,
    threadId: activeRun.threadId,
    runId: options.runId,
    assistantMessageContent: outcome.assistantMessage.content,
    partialReason: outcome.partial ? outcome.partialReason ?? "Some subagents failed." : undefined
  });
  const finalRunState = completed.run;
  if (finalRunState) {
    extractRunMemories(repository, {
      projectId: options.projectId,
      threadId: activeRun.threadId,
      run: finalRunState,
      finalAssistantMessage: outcome.assistantMessage.content,
      correctnessReview,
      cwd: reviewCwd
    });
  }
}

async function executeInlineSubagentRetryLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    runId: string;
    sourceRun: AgentRunState;
    targetTask: PlannerReadyTurn["subtasks"][number];
    readyPlan: PlannerReadyTurn;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal: AbortSignal;
    derivedProgressHeartbeatMs: number;
  }
) {
  const project = runtime.getProject(options.projectId);
  const startedProject = repository.setAgentRunStatus(options.projectId, options.runId, "running-subagents");
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdatedById(ws, requestId, repository, options.projectId, options.runId);
  const sessionId = project.session.sessionId;

  const callbacks = createExecutionCallbacks(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    options.sourceRun.threadId,
    sessionId,
    options.runId,
    pendingBrowserApprovals,
    options.abortSignal,
    connections,
    options.derivedProgressHeartbeatMs
  );
  const subagentModelId = resolveSubagentModelId({
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.readyPlan.executionModelId
  });
  const existingResults = options.sourceRun.subtasks
    .filter((task) => task.id !== options.targetTask.id)
    .filter(
      (task): task is typeof task & { status: "completed" | "failed" } =>
        task.status === "completed" || task.status === "failed"
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction,
      status: task.status,
      output: task.output,
      errorMessage: task.errorMessage,
      attemptCount: task.attemptCount,
      durationMs: 0,
      commitSha: task.commitSha,
      mountPath: task.mountPath,
      worktreePath: task.worktreePath
    }));

  callbacks.onTrace?.({
    sessionId,
    stage: "subagent-start",
    message: `Starting ${options.targetTask.title}`,
    subagentId: options.targetTask.id,
    modelId: subagentModelId
  });
  callbacks.onSubagentStart?.(
    options.targetTask,
    (options.sourceRun.subtasks.find((task) => task.id === options.targetTask.id)?.attemptCount ?? 0) + 1
  );

  const retriedResult = await runInlineSubagentRetry(adapter, {
    runId: options.runId,
    cwd: project.rootPath,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.readyPlan.executionModelId,
    task: options.targetTask,
    brief: options.readyPlan.finalExecutionBrief,
    priorAttemptCount: options.sourceRun.subtasks.find((task) => task.id === options.targetTask.id)?.attemptCount ?? 0,
    reasoningStrength: resolveSubagentReasoningStrength(options.reasoningStrength),
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    callbacks,
    sessionId
  });

  callbacks.onSubagentResult?.(retriedResult);

  const mergedResults = [...existingResults.filter((result) => result.id !== retriedResult.id), retriedResult].sort(
    (left, right) =>
      options.readyPlan.subtasks.findIndex((task) => task.id === left.id) -
      options.readyPlan.subtasks.findIndex((task) => task.id === right.id)
  );

  const assistantMessage = await aggregateSubagentResults(
    adapter,
    {
      cwd: project.rootPath,
      runId: options.runId,
      sessionId,
      messages: project.session.messages,
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      abortSignal: options.abortSignal,
      callbacks
    },
    options.readyPlan.executionModelId,
    options.readyPlan.finalExecutionBrief,
    options.readyPlan.subtasks,
    mergedResults,
    `Retry only ${options.targetTask.title}.`
  );

  const partial = mergedResults.some((result) => result.status === "failed");
  if (partial) {
    callbacks.onRunMilestone?.("Run partial complete. Some retried subagents still failed.");
  } else {
    callbacks.onRunMilestone?.("Run completed.");
  }
  callbacks.closeRunMilestones?.();

  await completeRunWithAssistantMessage(ws, requestId, runtime, repository, connections, {
    projectId: options.projectId,
    threadId: options.sourceRun.threadId,
    runId: options.runId,
    assistantMessageContent: assistantMessage.content,
    partialReason: partial ? "Some retried subagents still failed." : undefined
  });
}

function createExecutionCallbacks(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  sessionId: string,
  runId: string,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  abortSignal?: AbortSignal,
  connections?: Set<Bun.ServerWebSocket<HarnessConnection>>,
  derivedProgressHeartbeatMs: number = DERIVED_PROGRESS_HEARTBEAT_MS
) {
  const transcriptDraft = new RunTranscriptDraft({ runId });
  let currentPhase: RunMilestonePhase = "planning";
  let tailFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let finalized = false;
  let lastDerivedDigest = "";
  let staleBeatCount = 0;
  let persistedAssistantMessageId: string | undefined;
  let persistedAssistantContent = "";
  let lastStreamingPersistAt = 0;

  const persistStreamingAssistantMessage = (force = false) => {
    const segments = transcriptDraft.getSegments();
    let assistantContent: string | undefined;
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      if (segment?.kind === "assistant") {
        assistantContent = segment.content;
        break;
      }
    }
    const nowMs = Date.now();
    if (!assistantContent || assistantContent === persistedAssistantContent) {
      return;
    }
    if (!force && nowMs - lastStreamingPersistAt < STREAM_PERSIST_INTERVAL_MS) {
      return;
    }

    if (persistedAssistantMessageId) {
      const nextProject = repository.updateThreadMessage(projectId, threadId as ThreadId, persistedAssistantMessageId, {
        content: assistantContent
      });
      runtime.upsertPersistedProject(nextProject);
      persistedAssistantContent = assistantContent;
      lastStreamingPersistAt = nowMs;
      return;
    }

    const nextProject = repository.appendMessage(projectId, "assistant", assistantContent, threadId as ThreadId);
    runtime.upsertPersistedProject(nextProject);
    const threadMessages = repository.getThreadMessages(projectId, threadId as ThreadId);
    let persistedAssistantMessage: ChatMessage | undefined;
    for (let index = threadMessages.length - 1; index >= 0; index -= 1) {
      const message = threadMessages[index];
      if (message?.role === "assistant" && message.kind !== "run-milestones") {
        persistedAssistantMessage = message;
        break;
      }
    }
    if (!persistedAssistantMessage) {
      throw new Error("Expected persisted streaming assistant message");
    }

    persistedAssistantMessageId = persistedAssistantMessage.id;
    persistedAssistantContent = assistantContent;
    lastStreamingPersistAt = nowMs;
  };
  const assistantDeltaPump = new StreamPump({
    flushIntervalMs: STREAM_DELTA_FLUSH_MS,
    maxBufferedBytes: STREAM_DELTA_MAX_BUFFERED_BYTES,
    onFlush(delta) {
      runtime.appendStreamingDelta(projectId, delta, threadId);
      transcriptDraft.appendAssistantDelta(delta);
      persistStreamingAssistantMessage();
      scheduleTailFlush();
      emitControlEvent(connections, {
        type: "chat.delta",
        requestId,
        payload: {
          projectId,
          threadId,
          sessionId,
          delta
        }
      });
    }
  });

  const emitStreamingTail = () => {
    tailFlushTimer = undefined;
    if (!runtime.hasProject(projectId)) {
      return;
    }
    const segments = transcriptDraft.getSegments();
    persistStreamingAssistantMessage();
    runtime.setStreamingTail(projectId, segments, threadId);
    emitControlEvent(connections, {
      type: "chat.streaming-tail-updated",
      requestId,
      payload: {
        projectId,
        threadId,
        sessionId,
        runId,
        segments
      }
    });
  };
  const scheduleTailFlush = () => {
    if (tailFlushTimer) {
      return;
    }
    tailFlushTimer = setTimeout(emitStreamingTail, 100);
  };
  const recordRunMilestone = (line: string, phase = inferMilestonePhase(line, currentPhase)) => {
    currentPhase = phase;
    if (transcriptDraft.recordMilestone(line, phase)) {
      staleBeatCount = 0;
      scheduleTailFlush();
    }
  };
  const derivedHeartbeat = setInterval(() => {
    let run: ReturnType<WorkspaceRepository["getRun"]>;
    try {
      run = repository.getRun(projectId, runId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown agent run:")) {
        return;
      }
      throw error;
    }
    if (!run || Date.now() - transcriptDraft.getLastAcceptedAt() < derivedProgressHeartbeatMs) {
      return;
    }

    staleBeatCount += 1;
    if (shouldDelayDerivedProgressHeartbeat(run.status) && staleBeatCount < 2) {
      return;
    }

    const digest = formatRunProgressHeartbeat(run, staleBeatCount);
    if (digest && digest !== lastDerivedDigest) {
      lastDerivedDigest = digest;
      if (transcriptDraft.recordDerivedMilestone(digest, inferRunPhase(run.status))) {
        scheduleTailFlush();
      }
      return;
    }

    if (transcriptDraft.emitHeldFallback(currentPhase)) {
      scheduleTailFlush();
    }
  }, derivedProgressHeartbeatMs);

  const finalizeRunMilestones = () => {
    if (finalized) {
      return;
    }
    void assistantDeltaPump.flush();
    finalized = true;
    clearInterval(derivedHeartbeat);
    if (tailFlushTimer) {
      clearTimeout(tailFlushTimer);
      tailFlushTimer = undefined;
    }

    for (const message of transcriptDraft.finalizeMilestoneMessages()) {
      const nextProject = repository.appendMessage(projectId, "assistant", message.content, {
        threadId,
        kind: "run-milestones",
        metadata: message.metadata
      });
      runtime.upsertPersistedProject(nextProject);
    }
  };

  const persistFinalAssistantMessage = (content: string) => {
    void assistantDeltaPump.flush();
    if (persistedAssistantMessageId) {
      persistedAssistantContent = content;
      return repository.updateThreadMessage(projectId, threadId as ThreadId, persistedAssistantMessageId, {
        content,
        createdAt: new Date().toISOString()
      });
    }

    return repository.appendMessage(projectId, "assistant", content, threadId as ThreadId);
  };

  return {
    onTrace(trace: AgentTrace) {
      const stampedTrace = withTraceTimestamp(trace);
      runtime.appendTrace(projectId, stampedTrace, threadId);
      emitControlEvent(connections, {
        type: "agent.trace",
        requestId,
        payload: {
          projectId,
          threadId,
          trace: stampedTrace
        }
      });
      const statusMessage = statusMessageFromTrace(stampedTrace);
      if (statusMessage) {
        recordRunMilestone(statusMessage, inferTracePhase(stampedTrace, currentPhase));
      }
    },
    onRunMilestone(line: string) {
      recordRunMilestone(line);
    },
    closeRunMilestones() {
      finalizeRunMilestones();
    },
    persistFinalAssistantMessage(content: string) {
      return persistFinalAssistantMessage(content);
    },
    onDelta(delta: string) {
      assistantDeltaPump.push(delta);
    },
    onContextUsage(contextUsage: ProjectContextUsage) {
      runtime.setProjectContextUsage(projectId, contextUsage, threadId);
      emitControlEvent(connections, {
        type: "project.context",
        requestId,
        payload: {
          projectId,
          threadId,
          contextUsage
        }
      });
    },
    onSubagentStart(task: PlannerReadyTurn["subtasks"][number], attempt: number = 1) {
      currentPhase = "subagents";
      const nextProject = repository.markSubtaskStarted(projectId, runId, task.id, attempt);
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
      if (attempt === 1) {
        recordRunMilestone(`Subagent ${task.title}: started.`);
      }
    },
    onSubagentRetry(task: PlannerReadyTurn["subtasks"][number], attempt: number, _error: Error) {
      recordRunMilestone(`Subagent ${task.title}: retrying attempt ${attempt}.`);
    },
    onSubagentResult(result: SubagentResult) {
      const nextProject =
        result.status === "completed"
          ? repository.markSubtaskCompleted(
            projectId,
            runId,
            result.id,
            result.output ?? "",
            result.attemptCount,
            result.commitSha,
            result.worktreePath,
            result.mountPath
          )
          : repository.markSubtaskFailed(
            projectId,
            runId,
            result.id,
            result.errorMessage ?? "Unknown subagent failure",
            result.attemptCount,
            result.worktreePath,
            result.mountPath
          );
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
      const nextRun = repository.getRun(projectId, runId);
      if (nextRun) {
        recordRunMilestone(
          result.status === "completed"
            ? formatSubagentDoneStatus(result.title, nextRun)
            : formatSubagentFailedStatus(result.title, result.errorMessage, nextRun)
        );
      }
    },
    onAggregationStart() {
      currentPhase = "aggregation";
      const nextProject = repository.setAgentRunStatus(projectId, runId, "aggregating");
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
    },
    setExecutionState(state: ManagedExecutionState) {
      runtime.setExecutionState(projectId, {
        ...state,
        threadId
      });
    },
    getExecutionState(input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) {
      return runtime.getExecutionState(projectId, input);
    },
    clearExecutionState(input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) {
      runtime.clearExecutionState(projectId, input);
    },
    onExecutionEvent(input: { owner: "main" | "subagent" | "aggregator"; subagentId?: string; event: PiAgentExecutionEvent }) {
      const persistedRun = repository.getRun(projectId, runId);
      if (!persistedRun) {
        return;
      }
      if (input.event.type === "session-created" || input.event.type === "activity") {
        return;
      }

      let nextToolActivities = structuredClone(persistedRun.toolActivities ?? []);
      let nextSessions = structuredClone(persistedRun.browserSessions ?? []);
      let latestToolCallId: string | undefined;
      switch (input.event.type) {
        case "tool-start":
          latestToolCallId = input.event.toolCallId;
          nextToolActivities = recordToolStart(nextToolActivities, {
            runId,
            owner: input.owner,
            subagentId: input.subagentId,
            event: input.event
          });
          nextSessions = recordBrowserToolStart(nextSessions, {
            runId,
            owner: input.owner,
            subagentId: input.subagentId,
            toolCallId: input.event.toolCallId,
            toolName: input.event.toolName,
            args: input.event.args
          });
          break;
        case "tool-update":
          latestToolCallId = input.event.toolCallId;
          nextToolActivities = recordToolUpdate(nextToolActivities, {
            runId,
            owner: input.owner,
            subagentId: input.subagentId,
            event: input.event
          });
          nextSessions = recordBrowserToolUpdate(nextSessions, {
            runId,
            owner: input.owner,
            subagentId: input.subagentId,
            toolCallId: input.event.toolCallId,
            toolName: input.event.toolName,
            args: input.event.args,
            partialResult: input.event.partialResult
          });
          break;
        case "tool-end":
          {
            const event = input.event;
            latestToolCallId = event.toolCallId;
            nextToolActivities = recordToolEnd(nextToolActivities, {
              runId,
              owner: input.owner,
              subagentId: input.subagentId,
              event
            });
            nextSessions = recordBrowserToolEnd(nextSessions, {
              runId,
              owner: input.owner,
              subagentId: input.subagentId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              result: event.result,
              isError: event.isError
            });
            if (event.isError) {
              logToolFailure(runId, input.owner, input.subagentId, event);
            }
            break;
          }
        default:
          return;
      }

      const latestActivity =
        latestToolCallId === undefined ? undefined : nextToolActivities.find((entry) => entry.toolCallId === latestToolCallId);
      if (latestActivity && isSubagentBlockedVerificationCommand(latestActivity)) {
        recordRunMilestone(`${formatExecutionOwner(input.owner, input.subagentId, persistedRun)}: visible verification command detected.`);
      }

      const sessionsChanged = JSON.stringify(persistedRun.browserSessions ?? []) !== JSON.stringify(nextSessions);
      const activitiesChanged = JSON.stringify(persistedRun.toolActivities ?? []) !== JSON.stringify(nextToolActivities);
      if (!sessionsChanged && !activitiesChanged) {
        return;
      }

      let nextProject = sessionsChanged
        ? repository.setAgentRunBrowserSessions(projectId, runId, nextSessions)
        : runtime.getProject(projectId);
      if (activitiesChanged) {
        nextProject = repository.setAgentRunToolActivities(projectId, runId, nextToolActivities);
      }
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
    },
    requestBrowserApproval(input: {
      owner: "main" | "subagent" | "aggregator";
      subagentId?: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }) {
      const project = runtime.getProject(projectId);
      const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId) ?? repository.getRun(projectId, runId);
      if (!run) {
        return Promise.resolve({ approved: false });
      }

      const nextSessions = requestBrowserApprovalState(structuredClone(run.browserSessions ?? []), {
        runId,
        owner: input.owner,
        subagentId: input.subagentId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        args: input.args
      });
      const session = nextSessions.find(
        (entry) =>
          entry.runId === runId && entry.owner === input.owner && (entry.subagentId ?? undefined) === input.subagentId
      );
      const pendingActivity = session?.activities.find((entry) => entry.toolCallId === input.toolCallId);
      if (!session || !pendingActivity) {
        return Promise.resolve({ approved: true });
      }

      const effectiveSessions: typeof nextSessions = repository.getGlobalExecutionPaused()
        ? nextSessions.map((sessionEntry) => {
          if (sessionEntry.id !== session.id) {
            return sessionEntry;
          }

          const nextActivities = sessionEntry.activities.map((activity) =>
            activity.toolCallId === input.toolCallId && activity.approval
              ? {
                ...activity,
                approval: {
                  ...activity.approval,
                  status: "deferred" as const
                }
              }
              : activity
          );
          return {
            ...sessionEntry,
            activities: nextActivities,
            pendingApproval: undefined,
            status: "running" as const
          };
        })
        : nextSessions;
      const nextProject = repository.setAgentRunBrowserSessions(projectId, runId, effectiveSessions);
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
      const refreshedRun = repository.getRun(projectId, runId);
      const refreshedSession = refreshedRun?.browserSessions?.find((entry) => entry.id === session.id);
      const approval = refreshedSession?.activities.find((entry) => entry.toolCallId === input.toolCallId)?.approval;
      if (approval) {
        repository.saveNotification(
          createBrowserApprovalNotification(
            projectId,
            refreshedRun?.threadId ?? threadId,
            runId,
            refreshedSession!.id,
            input.toolCallId,
            approval.label,
            approval.inputSummary
          )
        );
      }
      if (repository.getGlobalExecutionPaused() && connections) {
        emitExecutionControlUpdatedToAll(connections, requestId, repository.getExecutionControlState());
      }
      if (connections) {
        emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
      }

      const approvalKey = createBrowserApprovalKey(projectId, runId, session.id, input.toolCallId);
      return new Promise<{ approved: boolean }>((resolve, reject) => {
        pendingBrowserApprovals.set(approvalKey, {
          resolve(approved) {
            resolve({ approved });
          },
          reject
        });

        abortSignal?.addEventListener(
          "abort",
          () => {
            if (!pendingBrowserApprovals.has(approvalKey)) {
              return;
            }

            pendingBrowserApprovals.delete(approvalKey);
            reject(new Error("Browser approval aborted"));
          },
          { once: true }
        );
      });
    }
  };
}

function assertGlobalExecutionNotPaused(repository: WorkspaceRepository) {
  if (!repository.getGlobalExecutionPaused()) {
    return;
  }

  throw new Error("Global execution is paused. Resume all executions to continue.");
}

function emitExecutionControlUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  requestId: string,
  executionControl: ReturnType<WorkspaceRepository["getExecutionControlState"]>
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "execution-control.updated",
      requestId,
      payload: {
        executionControl
      }
    });
  }
}

async function releaseDeferredExecutionState(
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  runtimeRegistry: AgentRuntimeRegistry,
  assistantManager: AssistantManager,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  scheduler: BackgroundJobScheduler
) {
  for (const entry of repository.promoteDeferredPlanningQuestions()) {
    let project = repository.getProject(entry.projectId);
    runtime.upsertPersistedProject(project);
    const run = repository.getRun(entry.projectId, entry.runId);
    const pendingQuestion = run?.questions.find((question) => question.status === "pending");
    if (pendingQuestion) {
      project = repository.appendMessage(entry.projectId, "assistant", pendingQuestion.prompt, {
        threadId: entry.threadId
      });
      runtime.upsertPersistedProject(project);
    }

    for (const connection of connections) {
      emitRunUpdatedById(connection, requestId, repository, entry.projectId, entry.runId);
      if (pendingQuestion) {
        emitThreadMessageAppended(connection, requestId, runtime, repository, entry.projectId, entry.threadId);
      }
    }
  }

  const promotedAssistantQuestions = repository.promoteDeferredAssistantQuestions();
  if (promotedAssistantQuestions.length > 0) {
    syncAssistantQuestionNotifications(repository);
    for (const question of promotedAssistantQuestions) {
      for (const connection of connections) {
        sendEvent(connection, {
          type: "assistant.question.updated",
          requestId,
          payload: {
            question
          }
        });
      }
    }
    emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
  }

  for (const entry of repository.promoteDeferredBrowserApprovals()) {
    const project = repository.getProject(entry.projectId);
    runtime.upsertPersistedProject(project);
    syncBrowserApprovalNotifications(repository, project);
    for (const connection of connections) {
      emitRunUpdated(connection, requestId, project);
    }
  }

  for (const assistant of repository.getAssistantsAwaitingBootstrap()) {
    void assistantManager.bootstrapAssistant(assistant.id);
  }

  await assistantManager.drainPendingReprioritizes();

  await Promise.all(
    repository.getQueuedBackgroundJobRuns().map((queuedRun) =>
      launchBackgroundJobRun(
        connections,
        repository,
        runtimeRegistry,
        runtime,
        backgroundRunControllers,
        assistantManager,
        queuedRun.id
      )
    )
  );

  await scheduler.tick(false);
  emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
}

async function runInlineSubagentRetry(
  adapter: PiAgentAdapter,
  options: {
    runId: string;
    cwd: string;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    executionModelId: string;
    task: PlannerReadyTurn["subtasks"][number];
    brief: string;
    priorAttemptCount: number;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal: AbortSignal;
    callbacks: ReturnType<typeof createExecutionCallbacks>;
    sessionId: string;
  }
): Promise<SubagentResult> {
  const subagentModelId = resolveSubagentModelId({
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.executionModelId
  });
  const subagentReasoningStrength = resolveSubagentReasoningStrength(options.reasoningStrength);
  const repoRoot = resolveRepoRoot(options.cwd);
  const subagentEnvironmentBrief = buildSubagentEnvironmentBrief({
    projectRoot: options.cwd,
    repoRoot,
    availableSkillPaths: discoverRepoSkillPaths(repoRoot)
  });
  let attempt = 0;

  while (true) {
    attempt += 1;
    const startedAt = Date.now();
    try {
      const basePrompt = [
        "You are a focused coding subagent.",
        "Complete only the assigned instruction.",
        "Return concise, implementation-focused output.",
        SUBAGENT_MILESTONE_INSTRUCTION,
        subagentEnvironmentBrief,
        "",
        `Shared brief: ${options.brief}`,
        `Subtask title: ${options.task.title}`,
        `Subtask instruction: ${options.task.instruction}`
      ].join("\n");
      const milestoneParser = createMilestoneDeltaParser((line) =>
        options.callbacks.onRunMilestone?.(`Subagent ${options.task.title}: ${line}`)
      );
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: options.task.id,
        originalRequest: {
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: basePrompt,
          reasoningStrength: subagentReasoningStrength,
          fastMode: options.fastMode,
          onTextDelta(delta: string) {
            milestoneParser.push(delta);
          },
          onExecutionEvent(event: PiAgentExecutionEvent) {
            void options.callbacks.onExecutionEvent?.({
              owner: "subagent",
              subagentId: options.task.id,
              event
            });
          },
          requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
            return options.callbacks.requestBrowserApproval?.({
              owner: "subagent",
              subagentId: options.task.id,
              ...input
            }) ?? Promise.resolve({ approved: true });
          }
        },
        continuationRequest: {
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: ["continue", "", basePrompt].join("\n"),
          reasoningStrength: subagentReasoningStrength,
          fastMode: options.fastMode,
          onTextDelta(delta: string) {
            milestoneParser.push(delta);
          },
          onExecutionEvent(event: PiAgentExecutionEvent) {
            void options.callbacks.onExecutionEvent?.({
              owner: "subagent",
              subagentId: options.task.id,
              event
            });
          },
          requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
            return options.callbacks.requestBrowserApproval?.({
              owner: "subagent",
              subagentId: options.task.id,
              ...input
            }) ?? Promise.resolve({ approved: true });
          }
        },
        abortSignal: options.abortSignal,
        store: {
          getState: () =>
            options.callbacks.getExecutionState?.({
              runId: options.runId,
              kind: "subagent",
              subagentId: options.task.id
            }),
          setState: (state) => options.callbacks.setExecutionState?.(state),
          clearState: () =>
            options.callbacks.clearExecutionState?.({
              runId: options.runId,
              kind: "subagent",
              subagentId: options.task.id
            })
        },
        onRefreshComplete(mode) {
          options.callbacks.onTrace?.({
            sessionId: options.sessionId,
            stage: "refresh-complete",
            message: `Refresh complete for ${options.task.title} (${mode})`,
            subagentId: options.task.id,
            modelId: subagentModelId
          });
        }
      });
      milestoneParser.flush();
      if (!milestoneParser.hasEmitted()) {
        for (const line of extractMilestoneLines(response.text)) {
          options.callbacks.onRunMilestone?.(`Subagent ${options.task.title}: ${line}`);
        }
      }
      const output = stripMilestoneLines(response.text);
      if (response.contextUsage) {
        options.callbacks.onContextUsage?.({
          sourceKind: "subagent",
          sourceLabel: options.task.id,
          modelId: subagentModelId,
          tokens: response.contextUsage.tokens,
          contextWindow: response.contextUsage.contextWindow,
          usagePercent: response.contextUsage.usagePercent,
          totalProcessedTokens: response.contextUsage.sessionStats.tokens.total,
          cachedInputTokens: response.contextUsage.cachedInputTokens,
          updatedAt: new Date().toISOString()
        });
      }

      options.callbacks.onTrace?.({
        sessionId: options.sessionId,
        stage: "subagent-complete",
        message: `Completed ${options.task.title}`,
        detail: output.slice(0, 240),
        subagentId: options.task.id,
        modelId: subagentModelId,
        durationMs: Date.now() - startedAt
      });

      return {
        id: options.task.id,
        title: options.task.title,
        instruction: options.task.instruction,
        status: "completed",
        output,
        mountPath: options.cwd,
        attemptCount: options.priorAttemptCount + attempt,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error("Unknown subagent failure");
      if (options.abortSignal.aborted) {
        throw typedError;
      }

      if (attempt === 1 && isTransientSubagentError(typedError)) {
        options.callbacks.onSubagentRetry?.(options.task, options.priorAttemptCount + attempt + 1, typedError);
        options.callbacks.onTrace?.({
          sessionId: options.sessionId,
          stage: "subagent-retry",
          message: `Retrying ${options.task.title}`,
          detail: `Attempt ${options.priorAttemptCount + attempt + 1}: ${typedError.message}`,
          subagentId: options.task.id,
          modelId: subagentModelId
        });
        continue;
      }

      options.callbacks.onTrace?.({
        sessionId: options.sessionId,
        stage: "subagent-error",
        message: `Failed ${options.task.title}`,
        detail: typedError.message,
        subagentId: options.task.id,
        modelId: subagentModelId
      });

      return {
        id: options.task.id,
        title: options.task.title,
        instruction: options.task.instruction,
        status: "failed",
        errorMessage: typedError.message,
        mountPath: options.cwd,
        attemptCount: options.priorAttemptCount + attempt,
        durationMs: Date.now() - startedAt
      };
    }
  }
}

async function handleRunFailure(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>> | undefined,
  projectId: ProjectId,
  message: string,
  runId?: string
) {
  const project = runtime.getProject(projectId);
  const failedRun = (runId ? repository.getRun(projectId, runId) : undefined) ?? project.activeRun;
  const failureCategory = classifyRunFailure({ message });
  if (failedRun) {
    rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, projectId, failedRun.id, "Run failed");
    const failedProject = repository.setAgentRunStatus(projectId, failedRun.id, "failed", message, failureCategory);
    const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(failedRun.id);
    if (linkedBackgroundRun && ["queued", "awaiting-approval", "awaiting-user-input", "running"].includes(linkedBackgroundRun.status)) {
      const failedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "failed", {
        failureMessage: message,
        failureCategory,
        summary: failedRun.summary
      });
      repository.appendBackgroundJobRunEvent(linkedBackgroundRun.id, "failed", "Linked agent run failed", message);
      const refreshedBackgroundRun = repository.getBackgroundJobRun(failedBackgroundRun.id) ?? failedBackgroundRun;
      syncBackgroundJobFailureTracking(repository, refreshedBackgroundRun);
      saveBackgroundRunStatusNotification(repository, refreshedBackgroundRun);
      if (connections) {
        await emitBackgroundJobRunUpdatedToAll(connections, refreshedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      }
    }
    if (failedRun.experiment) {
      repository.saveExperimentRun(projectId, failedRun.id, {
        ...failedRun.experiment,
        status: "failed",
        updatedAt: new Date().toISOString()
      });
    }
    runtime.upsertPersistedProject(failedProject);
    emitRunUpdatedById(ws, requestId, repository, projectId, failedRun.id, connections);
    extractRunMemories(repository, {
      projectId,
      threadId: failedRun.threadId,
      run: repository.getRun(projectId, failedRun.id) ?? failedRun,
      finalAssistantMessage: getThreadSessionState(runtime, repository, projectId, failedRun.threadId).messages.at(-1)?.content,
      correctnessReview: failedRun.correctnessReview,
      cwd: failedRun.experiment?.projectMountPath ?? project.rootPath
    });
  }

  runtime.setProjectError(projectId, message, failedRun?.threadId ?? project.activeThreadId);
  runtime.setProjectStreaming(projectId, false, failedRun?.threadId ?? project.activeThreadId);
  runtime.clearStreaming(projectId, failedRun?.threadId ?? project.activeThreadId);
  appendSystemStatus(
    ws,
    requestId,
    runtime,
    repository,
    projectId,
    failedRun?.threadId ?? project.activeThreadId,
    `Run failed. ${message}`
  );

  emitControlEvent(connections, {
    type: "chat.error",
    requestId,
    payload: {
      projectId,
      threadId: failedRun?.threadId ?? project.activeThreadId,
      message: "Agent execution failed",
      detail: message
    }
  });

  debugLog("chat.error", {
    projectId,
    detail: message
  });
}

async function completeRunWithAssistantMessage(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>> | undefined,
  input: {
    projectId: ProjectId;
    threadId: ThreadId;
    runId: string;
    assistantMessageContent: string;
    partialReason?: string;
  }
) {
  const run = repository.getAgentRun(input.projectId, input.threadId, input.runId);
  if (!run) {
    throw new Error(`Unknown agent run: ${input.runId}`);
  }
  if (isTerminalRunStatus(run.status)) {
    throw new Error(`Run ${input.runId} is already terminal`);
  }

  const messageProject = repository.appendMessage(input.projectId, "assistant", input.assistantMessageContent, input.threadId);
  runtime.upsertPersistedProject(messageProject);
  const finalStatus = input.partialReason ? "partial-complete" : "completed";
  const statusProject = repository.setAgentRunStatus(input.projectId, input.runId, finalStatus, input.partialReason);
  runtime.upsertPersistedProject(statusProject);
  emitRunUpdatedById(ws, requestId, repository, input.projectId, input.runId, connections);
  runtime.clearStreaming(input.projectId, input.threadId);
  runtime.setProjectStreaming(input.projectId, false, input.threadId);
  runtime.setProjectError(input.projectId, undefined, input.threadId);
  runtime.setAbortController(input.projectId, input.runId, undefined);

  const project = runtime.getProject(input.projectId);
  const threadSession = getThreadSessionState(runtime, repository, input.projectId, input.threadId);
  const finalRun = repository.getRun(input.projectId, input.runId);
  const assistantMessage = findLatestAssistantMessage({
    id: input.projectId,
    rootPath: project.rootPath,
    activeThreadId: input.threadId,
    session: threadSession,
    activeRun: undefined,
    lastRun: finalRun
  });
  if (!assistantMessage || assistantMessage.role !== "assistant") {
    throw new Error("Assistant message was not persisted");
  }

  emitControlEvent(connections, {
    type: "chat.complete",
    requestId,
    payload: {
      projectId: input.projectId,
      threadId: input.threadId,
      sessionId: threadSession.sessionId,
      assistantMessage,
      state: threadSession
    }
  });

  return {
    run: finalRun,
    assistantMessage
  };
}

function isTerminalRunStatus(status: AgentRunState["status"]) {
  return status === "completed" || status === "partial-complete" || status === "stopped" || status === "failed";
}

function createBrowserApprovalKey(projectId: ProjectId, runId: string, sessionId: string, toolCallId: string) {
  return [projectId, runId, sessionId, toolCallId].join(":");
}

function createRunBudgetAdapter(
  adapter: PiAgentAdapter,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string
) {
  return new RunBudgetAgentAdapter(adapter, repository, projectId, runId);
}

function buildProjectPromptCacheIdentity(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  projectRootPath: string;
  providerBrand: ProviderBrand;
  selectedModeId?: string;
  mode?: ModeDefinition;
  ruleSources?: WorkspaceRuleSource[];
  memorySummaries?: MemorySummary[];
}): PromptCacheIdentity {
  return {
    projectId: input.projectId,
    workspaceConfigHash: buildWorkspaceConfigHash({
      projectId: input.projectId,
      projectRootPath: input.projectRootPath,
      providerBrand: input.providerBrand,
      selectedModeId: input.selectedModeId,
      mode: input.mode,
      ruleSources: input.ruleSources,
      memorySummaries: input.memorySummaries,
      memoryBankEnabledDefault: input.repository.getMemoryBankEnabledDefault()
    })
  };
}

async function prepareRunGeminiAttachmentCache(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  modelId: string;
  messages: ChatMessage[];
  enabled?: boolean;
}): Promise<GeminiCachedAttachmentContext | undefined> {
  if (!input.enabled) {
    return undefined;
  }

  return prepareGeminiCachedAttachmentContext({
    repository: input.repository,
    projectId: input.projectId,
    modelId: input.modelId,
    messages: input.messages,
    googleApiKey: input.repository.getStoredGoogleApiKey()
  });
}

function rejectPendingBrowserApprovalsForRun(
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  projectId: ProjectId,
  runId: string,
  reason: string
) {
  for (const [key, approval] of pendingBrowserApprovals.entries()) {
    if (!key.startsWith(`${projectId}:${runId}:`)) {
      continue;
    }

    pendingBrowserApprovals.delete(key);
    approval.reject(new Error(reason));
  }
}

function appendSystemStatus(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  content: string
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return;
  }

  const session = getThreadSessionState(runtime, repository, projectId, threadId);
  const lastMessage = session.messages.at(-1);
  if (lastMessage?.role === "system" && lastMessage.content === normalizedContent) {
    return;
  }

  const nextProject = repository.appendMessage(projectId, "system", normalizedContent, threadId);
  runtime.upsertPersistedProject(nextProject);
  emitThreadMessageAppended(ws, requestId, runtime, repository, projectId, threadId);
}

function appendComposerControlStatus(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  fastMode?: boolean
) {
  if (!fastMode) {
    return;
  }

  appendSystemStatus(ws, requestId, runtime, repository, projectId, threadId, "Fast mode enabled.");
}

function statusMessageFromTrace(trace: AgentTrace) {
  switch (trace.stage) {
    case "planning":
      return "Planning task.";
    case "routing":
      return trace.message;
    case "merge-start":
    case "merge-conflict":
    case "merge-complete":
    case "verification-start":
    case "verification-complete":
      return trace.message;
    case "refresh-requested":
    case "refresh-deferred":
      return trace.message;
    default:
      return undefined;
  }
}

function inferTracePhase(trace: AgentTrace, fallback: RunMilestonePhase): RunMilestonePhase {
  if (trace.stage.startsWith("subagent") || trace.stage.startsWith("merge") || trace.stage.startsWith("branchfs")) {
    return "subagents";
  }
  if (trace.stage.startsWith("aggregation")) {
    return "aggregation";
  }
  if (trace.stage.startsWith("correctness") || trace.stage.startsWith("verification")) {
    return "correctness";
  }
  if (trace.stage.startsWith("planning") || trace.stage === "routing" || trace.stage === "plan-presented") {
    return "planning";
  }
  return fallback;
}

function inferMilestonePhase(line: string, fallback: RunMilestonePhase): RunMilestonePhase {
  if (/correctness|verification|run (?:partial )?complete/i.test(line)) {
    return "correctness";
  }
  if (/aggregat|combining/i.test(line)) {
    return "aggregation";
  }
  if (/subagent|spawning/i.test(line)) {
    return "subagents";
  }
  if (/planning|routing/i.test(line)) {
    return "planning";
  }
  return fallback;
}

function inferRunPhase(status: AgentRunState["status"]): RunMilestonePhase {
  if (status === "running-subagents") {
    return "subagents";
  }
  if (status === "aggregating") {
    return "aggregation";
  }
  if (status === "running-main" || status === "completed" || status === "partial-complete") {
    return "correctness";
  }
  return "planning";
}

function formatSubagentDoneStatus(title: string, run: AgentRunState) {
  const completedCount = run.subtasks.filter((task) => task.status === "completed").length;
  return `Subagent done: ${title}. Progress ${completedCount}/${run.subtasks.length}.`;
}

function formatSubagentFailedStatus(title: string, errorMessage: string | undefined, run: AgentRunState) {
  const completedCount = run.subtasks.filter((task) => task.status === "completed").length;
  const failedCount = run.subtasks.filter((task) => task.status === "failed").length;
  return `Subagent fail: ${title}. ${summarizeSubagentError(errorMessage)}. Progress ${completedCount}/${run.subtasks.length}, ${failedCount} failed.`;
}

function summarizeSubagentError(errorMessage: string | undefined) {
  const summary = (errorMessage ?? "Unknown subagent failure")
    .split(/\r?\n/, 1)[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/, "");
  return summary || "Unknown subagent failure";
}

function formatExecutionOwner(owner: "main" | "subagent" | "aggregator", subagentId: string | undefined, run?: AgentRunState) {
  if (owner === "subagent") {
    const title = subagentId ? run?.subtasks.find((task) => task.id === subagentId)?.title : undefined;
    return title ? `Subagent ${title}` : subagentId ? `Subagent ${subagentId}` : "Subagent";
  }

  return owner === "aggregator" ? "Aggregator" : "Main execution";
}

function logToolFailure(
  runId: string,
  owner: "main" | "subagent" | "aggregator",
  subagentId: string | undefined,
  event: Extract<PiAgentExecutionEvent, { type: "tool-end" }>
) {
  const result = parseToolFailureResult(event.result);
  debugLog("agent.tool.failed", {
    runId,
    owner,
    subagentId,
    toolName: event.toolName,
    command: result.command,
    exitCode: result.exitCode,
    status: result.status,
    outputPreview: result.outputPreview
  });
}

function parseToolFailureResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return {
      command: undefined,
      exitCode: undefined,
      status: undefined,
      outputPreview: summarizeToolOutput(result)
    };
  }

  const record = result as Record<string, unknown>;
  return {
    command: typeof record.command === "string" ? record.command.slice(0, 500) : undefined,
    exitCode: typeof record.exitCode === "number" ? record.exitCode : typeof record.exit_code === "number" ? record.exit_code : undefined,
    status: typeof record.status === "string" ? record.status.slice(0, 80) : undefined,
    outputPreview: summarizeToolOutput(record.output ?? record.aggregated_output ?? record.stderr ?? record.error)
  };
}

function summarizeToolOutput(value: unknown) {
  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim().slice(0, 500) || undefined;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.stringify(value).replace(/\s+/g, " ").trim().slice(0, 500);
}

async function requestExecutionRefresh(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  executionState: ManagedExecutionState
) {
  if (executionState.phase === "waiting-input") {
    throw new Error("Execution is waiting for user input");
  }

  const executionLabel = executionState.subagentId ? `subagent ${executionState.subagentId}` : executionState.kind;
  if (isExecutionBusy(executionState)) {
    runtime.updateExecutionState(projectId, executionState, (state) => ({
      ...state,
      refreshRequested: true,
      refreshDeferred: true,
      lastProgressAt: Date.now()
    }));
    appendSystemStatus(ws, requestId, runtime, repository, projectId, threadId, `Refreshing ${executionLabel} after current stream completes.`);
    emitProjectTrace(ws, requestId, runtime, projectId, threadId, {
      sessionId: getThreadSessionState(runtime, repository, projectId, threadId).sessionId,
      stage: "refresh-deferred",
      message: `Refreshing ${executionLabel} after current stream completes.`
    });
    return;
  }

  const refreshAction: ManagedRefreshAction = executionState.hasReceivedActivity ? "continue" : "restart";
  runtime.updateExecutionState(projectId, executionState, (state) => ({
    ...state,
    refreshRequested: true,
    refreshDeferred: false,
    pendingRefreshAction: refreshAction,
    lastProgressAt: Date.now()
  }));
  appendSystemStatus(
    ws,
    requestId,
    runtime,
    repository,
    projectId,
    threadId,
    refreshAction === "restart"
      ? `Refreshing ${executionLabel} by restarting original prompt.`
      : `Refreshing ${executionLabel} with continue.`
  );
  emitProjectTrace(ws, requestId, runtime, projectId, threadId, {
    sessionId: getThreadSessionState(runtime, repository, projectId, threadId).sessionId,
    stage: "refresh-requested",
    message:
      refreshAction === "restart"
        ? `Refreshing ${executionLabel} by restarting original prompt.`
        : `Refreshing ${executionLabel} with continue.`
  });

  await executionState.controller?.abort();
}

function emitProjectTrace(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  projectId: ProjectId,
  threadId: string,
  trace: AgentTrace
) {
  const stampedTrace = withTraceTimestamp(trace);
  runtime.appendTrace(projectId, stampedTrace, threadId);
  sendEvent(ws, {
    type: "agent.trace",
    requestId,
    payload: {
      projectId,
      threadId,
      trace: stampedTrace
    }
  });
}

function emitMessageAppended(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId?: string
) {
  const project = runtime.getProject(projectId);
  const resolvedThreadId = threadId ?? project.activeThreadId;
  const state = getThreadSessionState(runtime, repository, projectId, resolvedThreadId);
  const message = state.messages.at(-1);
  if (!message) {
    throw new Error("Expected appended message");
  }
  const thread = repository.getProject(projectId).threads.find((entry) => entry.id === resolvedThreadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${resolvedThreadId}`);
  }

  sendEvent(ws, {
    type: "chat.message-appended",
    requestId,
    payload: {
      projectId: project.id,
      threadId: resolvedThreadId,
      sessionId: state.sessionId,
      message,
      thread,
      state
    }
  });
}

function getThreadSessionState(
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string
) {
  const project = runtime.getProject(projectId);
  if (project.activeThreadId === threadId) {
    return project.session;
  }

  const threadRuntime = runtime.getThreadRuntime(projectId, threadId);
  return {
    ...createEmptySession(threadId),
    sessionId: threadRuntime?.sessionId ?? threadId,
    isStreaming: threadRuntime?.isStreaming ?? false,
    lastError: threadRuntime?.lastError,
    messages: repository.getThreadMessages(projectId, threadId)
  };
}

function emitThreadMessageAppended(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string
) {
  const state = getThreadSessionState(runtime, repository, projectId, threadId);
  const message = state.messages.at(-1);
  if (!message) {
    throw new Error("Expected appended message");
  }
  const thread = repository.getProject(projectId).threads.find((entry) => entry.id === threadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${threadId}`);
  }

  sendEvent(ws, {
    type: "thread.message-appended",
    requestId,
    payload: {
      projectId,
      threadId,
      sessionId: state.sessionId,
      message,
      thread,
      state
    }
  });
}

function findLatestAssistantMessage(project: ProjectLike) {
  for (let index = project.session.messages.length - 1; index >= 0; index -= 1) {
    const message = project.session.messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }

  return undefined;
}

function emitRunUpdated(ws: Bun.ServerWebSocket<HarnessConnection>, requestId: string, project: ProjectLike) {
  const run = project.activeRun ?? project.lastRun;
  if (!run) {
    return;
  }

  sendEvent(ws, {
    type: "run.updated",
    requestId,
    payload: {
      projectId: project.id,
      threadId: run.threadId,
      run
    }
  });
}

function emitRunUpdatedById(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string,
  connections?: Set<Bun.ServerWebSocket<HarnessConnection>>
) {
  const run = repository.getRun(projectId, runId);
  if (!run) {
    return;
  }

  const event = {
    type: "run.updated",
    requestId,
    payload: {
      projectId,
      threadId: run.threadId,
      run
    }
  } satisfies ServerEvent;

  if (connections) {
    emitControlEvent(connections, event);
    return;
  }

  sendEvent(ws, event);
}

function emitWorkspaceUpdated(ws: Bun.ServerWebSocket<HarnessConnection>, requestId: string, runtime: WorkspaceRuntimeStore) {
  sendEvent(ws, {
    type: "workspace.updated",
    requestId,
    payload: {
      workspace: runtime.getWorkspace()
    }
  });
}

function emitProjectUpdated(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  projectId: ProjectId,
  project: WorkspaceProjectState
) {
  sendEvent(ws, {
    type: "project.updated",
    requestId,
    payload: {
      projectId,
      project
    }
  });
}

async function runCorrectnessReview(
  rootPath: string,
  executionPlan: ExecutionPlan,
  outcome: Awaited<ReturnType<typeof executeReadyRun>>,
  readyPlan: PlannerReadyTurn
): Promise<CorrectnessReview> {
  const gaps: CorrectnessGap[] = [];
  const indexHtmlPath = path.join(rootPath, "index.html");
  const indexHtmlText = await Bun.file(indexHtmlPath).text().catch(() => "");

  if (outcome.partial) {
    gaps.push({
      id: "partial-subagents",
      category: "plan-gap",
      severity: "high",
      description: outcome.partialReason ?? "Some subagent work did not complete cleanly.",
      suggestedFix: "Resolve failed subagent work and finish missing integration.",
      canParallelize: false,
      ownedPaths: []
    });
  }

  if (/src\s*=\s*["'][^"']+\.(ts|tsx)["']/.test(indexHtmlText)) {
    gaps.push({
      id: "raw-ts-entrypoint",
      category: "runnable-gap",
      severity: "high",
      description: "HTML entrypoint imports TypeScript modules directly, which will not run natively in the browser.",
      suggestedFix: "Add Bun-compatible build/dev wiring or switch entrypoint to runnable browser JavaScript output.",
      canParallelize: false,
      ownedPaths: ["index.html", "package.json"]
    });
  }

  const suspiciousFiles = await findSuspiciousQualityFiles(rootPath);
  if (suspiciousFiles.length > 0) {
    gaps.push({
      id: "suspicious-quality-files",
      category: "quality-gap",
      severity: "medium",
      description: `Suspicious leftover files suggest dead-code hoarding or abandoned iterations: ${suspiciousFiles.join(", ")}`,
      suggestedFix: "Remove abandoned duplicate files or fold them into one coherent implementation.",
      canParallelize: true,
      ownedPaths: suspiciousFiles
    });
  }

  if (gaps.length === 0) {
    return {
      status: "pass",
      summary: "Correctness review passed. Plan commitments and runnable output checks look good.",
      gaps: []
    };
  }

  return {
    status: "needs-iteration",
    summary: `Correctness review found ${gaps.length} gap${gaps.length === 1 ? "" : "s"}.`,
    gaps,
    recommendedPlan: buildCorrectiveExecutionPlan(executionPlan, gaps, readyPlan)
  };
}

async function findSuspiciousQualityFiles(rootPath: string) {
  const changedFiles = await findChangedWorkspaceFiles(rootPath);
  if (changedFiles) {
    return changedFiles.filter(isSuspiciousQualityFile).slice(0, 8);
  }

  const proc = Bun.spawn({
    cmd: [
      "powershell",
      "-NoProfile",
      "-Command",
      "Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\\\(node_modules|dist|\\.git|\\.bun|vendor|coverage)\\\\' } | Select-Object -ExpandProperty FullName"
    ],
    cwd: rootPath,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.relative(rootPath, value).replace(/\\/g, "/"))
    .filter(isWorkspaceReviewPath)
    .filter(isSuspiciousQualityFile)
    .slice(0, 8);
}

async function findChangedWorkspaceFiles(rootPath: string) {
  const proc = Bun.spawn({
    cmd: ["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", "."],
    cwd: rootPath,
    stdout: "pipe",
    stderr: "ignore"
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    return undefined;
  }
  return stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => parseGitStatusPath(entry))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\\/g, "/"))
    .filter(isWorkspaceReviewPath);
}

function parseGitStatusPath(entry: string) {
  const value = entry.length >= 4 ? entry.slice(3).trim() : entry.trim();
  const renameSeparator = " -> ";
  return value.includes(renameSeparator) ? value.slice(value.lastIndexOf(renameSeparator) + renameSeparator.length) : value;
}

function isWorkspaceReviewPath(value: string) {
  return !/^(?:node_modules|dist|\.git|\.bun|vendor|coverage)(?:\/|$)/.test(value);
}

function isSuspiciousQualityFile(value: string) {
  return /(?:^|\/)(?:copy|old|backup|tmp|temp)[^/]*\.(?:ts|tsx|js|jsx)$/.test(value);
}

function buildCorrectiveExecutionPlan(
  basePlan: ExecutionPlan,
  gaps: CorrectnessGap[],
  readyPlan: PlannerReadyTurn
): ExecutionPlan {
  const usesParallelCorrectiveWork = gaps.some((gap) => gap.canParallelize) && gaps.length > 1;
  const actualSubagentCount = usesParallelCorrectiveWork ? Math.min(10, gaps.length) : 0;
  const targetSubagentCount = gaps.some((gap) => gap.canParallelize) ? Math.min(10, Math.max(2, gaps.length)) : 0;
  const difficultyScore = estimateCorrectiveDifficulty(gaps, actualSubagentCount);
  return {
    ...basePlan,
    origin: "correctness-followup",
    iteration: basePlan.iteration + 1,
    difficultyScore,
    summary: gaps.map((gap) => gap.description).join(" "),
    finalExecutionBrief: [
      "Fix correctness gaps from prior implementation.",
      ...gaps.map((gap) => `${gap.category}: ${gap.suggestedFix}`)
    ].join("\n"),
    route: usesParallelCorrectiveWork ? "pi-subagents" : "main",
    targetSubagentCount,
    actualSubagentCount,
    gating: {
      ...basePlan.gating,
      mode: resolveExecutionPlanGateMode(basePlan.mode, basePlan.gating.mode, actualSubagentCount)
    },
    prerequisites: [],
    contracts: gaps.map((gap, index) => ({
      taskId: `correctness-${index + 1}`,
      title: gap.category === "runnable-gap" ? "Restore runnable output" : `Resolve ${gap.category}`,
      instruction: gap.suggestedFix,
      effortPoints: gap.severity === "high" ? 4 : gap.severity === "medium" ? 3 : 2,
      ownedPaths: gap.ownedPaths.length > 0 ? gap.ownedPaths : readyPlan.subtasks.flatMap((task) => task.id.split("+")).slice(0, 2),
      dependsOnPrerequisiteIds: [],
      deliverables: [gap.description],
      integrationPoints: [],
      verificationScope: basePlan.subagentWorktreeStrategy === "same-worktree" ? "owned-files-only" : "worktree-full",
      verificationCommands:
        basePlan.subagentWorktreeStrategy === "same-worktree"
          ? ["bunx tsc --noEmit"]
          : ["bun run typecheck", "bun run test"],
      mergeNotes: `Resolve correctness gap: ${gap.description}`
    }))
  };
}

function estimateCorrectiveDifficulty(gaps: CorrectnessGap[], actualSubagentCount: number) {
  const severityScore = gaps.reduce((score, gap) => score + (gap.severity === "high" ? 42 : gap.severity === "medium" ? 18 : 8), 0);
  const parallelScore = actualSubagentCount > 0 ? 18 : 0;
  return Math.max(1, Math.min(100, severityScore + parallelScore));
}

async function presentCorrectivePlan(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  input: {
    sessionId: string;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    planningModelId: string;
    executionPlan: ExecutionPlan;
  }
) {
  const correctiveRun = repository.getRun(projectId, input.executionPlan.runId);
  if (!correctiveRun) {
    throw new Error(`Unknown run: ${input.executionPlan.runId}`);
  }
  const readyPlan = buildReadyPlanFromExecutionPlan(input.executionPlan);
  const readyProject = repository.setAgentRunReady(
    projectId,
    input.executionPlan.runId,
    readyPlan,
    input.executionPlan,
    executionPlanToTasks(input.executionPlan),
    input.planningModelId
  );
  runtime.upsertPersistedProject(readyProject);
  emitRunUpdatedById(ws, requestId, repository, projectId, input.executionPlan.runId);

  const agentPlan = createAgentPlanFromExecutionPlan(input.sessionId, input.agentId, input.planningModelId, input.executionPlan);
  runtime.setProjectPlan(projectId, agentPlan, correctiveRun.threadId);
  sendEvent(ws, {
    type: "agent.plan",
    requestId,
    payload: {
      projectId,
      threadId: correctiveRun.threadId,
      plan: agentPlan
    }
  });

  if (shouldAppendPlanSummaryMessage(input.executionPlan)) {
    const planMessageProject = repository.appendMessage(projectId, "assistant", input.executionPlan.summary, {
      threadId: correctiveRun.threadId,
      kind: "plan-summary",
      metadata: {
        type: "plan-summary",
        runId: input.executionPlan.runId,
        plan: input.executionPlan
      }
    });
    runtime.upsertPersistedProject(planMessageProject);
    emitThreadMessageAppended(ws, requestId, runtime, repository, projectId, correctiveRun.threadId);
  }
}

function shouldAppendPlanSummaryMessage(executionPlan: ExecutionPlan) {
  return executionPlan.origin !== "quick-task" && !(executionPlan.mode?.id === "ask" && executionPlan.gating.mode === "immediate");
}

function buildReadyPlanFromExecutionPlan(executionPlan: ExecutionPlan): PlannerReadyTurn {
  const subtasks = executionPlanToTasks(executionPlan);
  return {
    type: "ready",
    difficultyScore: executionPlan.difficultyScore,
    summary: executionPlan.summary,
    executionModelId: executionPlan.executionModelId,
    usesSubagents: subtasks.length > 0,
    subtasks,
    finalExecutionBrief: executionPlan.finalExecutionBrief,
    prerequisites: executionPlan.prerequisites,
    contracts: executionPlan.contracts
  };
}

function createAgentPlanFromExecutionPlan(
  sessionId: string,
  agentId: "pi" | "copilot-cli" | "codex-cli",
  planningModelId: string,
  executionPlan: ExecutionPlan
): AgentPlan {
  return {
    sessionId,
    agentId,
    planningModelId,
    difficultyScore: executionPlan.difficultyScore,
    usesSubagents: executionPlan.actualSubagentCount > 1,
    executionModelId: executionPlan.executionModelId,
    subtaskCount: executionPlanToTasks(executionPlan).length,
    executionPlan
  };
}

function buildReadyPlanFromRun(run: AgentRunState): PlannerReadyTurn {
  if (
    run.executionModelId === undefined ||
    run.difficultyScore === undefined ||
    run.summary === undefined ||
    run.finalExecutionBrief === undefined
  ) {
    throw new Error("Run does not have a resumable execution plan");
  }

  return {
    type: "ready",
    difficultyScore: run.difficultyScore,
    summary: run.summary,
    executionModelId: run.executionModelId,
    usesSubagents: run.subtasks.length > 0,
    subtasks: run.subtasks.map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction
    })),
    finalExecutionBrief: run.finalExecutionBrief,
    prerequisites: run.plan?.prerequisites,
    contracts: run.plan?.contracts
  };
}

function buildExecutionPlanFromRun(run: AgentRunState, runId: string): ExecutionPlan {
  if (run.plan) {
    return {
      ...run.plan,
      runId
    };
  }

  if (
    run.executionModelId === undefined ||
    run.difficultyScore === undefined ||
    run.summary === undefined ||
    run.finalExecutionBrief === undefined
  ) {
    throw new Error("Run does not have a resumable execution plan");
  }

  return {
    runId,
    origin: "initial",
    iteration: 1,
    summary: run.summary,
    finalExecutionBrief: run.finalExecutionBrief,
    difficultyScore: run.difficultyScore,
    planningModelId: run.planningModelId ?? getDefaultPlanningModelId("gpt"),
    executionModelId: run.executionModelId,
    route: run.subtasks.length > 0 ? "pi-subagents" : "main",
    subagentWorktreeStrategy: "same-worktree",
    targetSubagentCount: run.subtasks.length,
    actualSubagentCount: run.subtasks.length,
    gating: {
      mode: "countdown",
      delaySeconds: 10
    },
    prerequisites: [],
    contracts: run.subtasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      instruction: task.instruction,
      effortPoints: 2,
      ownedPaths: ["(planner-unspecified)"],
      dependsOnPrerequisiteIds: [],
      deliverables: [task.title],
      integrationPoints: [],
      verificationScope: "owned-files-only",
      verificationCommands: ["bunx tsc --noEmit"],
      mergeNotes: `Merge ${task.title} into final solution.`
    })),
    correctnessPolicy: "ask-before-iterate"
  };
}

function assertRunCanRefresh(run: AgentRunState) {
  if (run.status === "awaiting-user-input") {
    throw new Error("Run is waiting for planner input");
  }

  if (!["running-main", "running-subagents", "aggregating"].includes(run.status)) {
    throw new Error(`Run status ${run.status} is not refreshable`);
  }
}

function assertProjectCanStartRun(
  repository: WorkspaceRepository,
  runtime: WorkspaceRuntimeStore,
  projectId: ProjectId,
  threadId: ThreadId
) {
  if (isActiveThreadStreaming(runtime, projectId, threadId)) {
    throw new Error("Thread has active run in status running-main");
  }
  const blockingStatuses = new Set(["planning", "awaiting-user-input", "ready", "running-main", "running-subagents", "aggregating", "partial-complete"]);
  const blockingRun = findProjectRunWithStatuses(repository, projectId, blockingStatuses);
  if (blockingRun) {
    throw new Error(`Thread has active run in status ${blockingRun.status}`);
  }
}

function assertActiveThread(project: ProjectLike, threadId: string) {
  if (project.activeThreadId !== threadId) {
    throw new Error(`Thread ${threadId} is not active for project ${project.id}`);
  }
}

function assertProjectCanStartRetry(
  repository: WorkspaceRepository,
  runtime: WorkspaceRuntimeStore,
  projectId: ProjectId,
  threadId: ThreadId,
  runId: string
) {
  if (isActiveThreadStreaming(runtime, projectId, threadId)) {
    throw new Error("Thread has active run in status running-main");
  }
  const blockingStatuses = new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"]);
  const blockingRun = findProjectRunWithStatuses(repository, projectId, blockingStatuses, runId);
  if (blockingRun) {
    throw new Error(`Thread has active run in status ${blockingRun.status}`);
  }
}

function assertNoOtherWorkingRun(
  repository: WorkspaceRepository,
  runtime: WorkspaceRuntimeStore,
  projectId: ProjectId,
  threadId: ThreadId,
  runId: string
) {
  const activeExecution = runtime
    .getRunExecutionStates(projectId, runId)
    .some((state) => ["queued", "provisioning", "api-starting", "active", "finishing", "waiting-input"].includes(state.phase));
  if (isActiveThreadStreaming(runtime, projectId, threadId) && !activeExecution) {
    throw new Error("Thread has active run in status running-main");
  }
  const workingStatuses = new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"]);
  const workingRun = findProjectRunWithStatuses(repository, projectId, workingStatuses, runId);
  if (workingRun) {
    throw new Error(`Thread has active run in status ${workingRun.status}`);
  }
}

function findProjectRunWithStatuses(
  repository: WorkspaceRepository,
  projectId: ProjectId,
  statuses: Set<string>,
  excludedRunId?: string
) {
  const project = repository.getProject(projectId);
  const seenRunIds = new Set<string>();
  for (const run of [project.activeRun, project.lastRun, ...project.runSummaries]) {
    if (!run || seenRunIds.has(run.id)) {
      continue;
    }
    seenRunIds.add(run.id);
    if (run.id !== excludedRunId && statuses.has(run.status)) {
      return run;
    }
  }

  return undefined;
}

function isActiveThreadStreaming(runtime: WorkspaceRuntimeStore, projectId: ProjectId, threadId: ThreadId) {
  const project = runtime.getProject(projectId);
  return project.activeThreadId === threadId && project.session.isStreaming;
}

async function stopThreadActivityBeforeArchive(input: {
  ws: Bun.ServerWebSocket<HarnessConnection>;
  requestId: string;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  cliSessionManager: CliSessionManager;
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>;
  projectId: ProjectId;
  threadId: ThreadId;
}) {
  const { ws, requestId, repository, runtime, cliSessionManager, pendingBrowserApprovals, projectId, threadId } = input;
  const project = runtime.getProject(projectId);
  const activeSessions = (project.cliSessions ?? []).filter(
    (session) => session.threadId === threadId && !["stopped", "exited", "failed"].includes(session.status)
  );
  for (const session of activeSessions) {
    await cliSessionManager.stopSession({
      projectId,
      threadId,
      sessionId: session.id
    });
  }

  const run = repository.getLatestThreadRun(projectId, threadId);
  if (run && !isTerminalThreadArchiveRunStatus(run.status)) {
    runtime.getAbortController(projectId, run.id)?.abort();
    runtime.setProjectStreaming(projectId, false, threadId);
    runtime.clearStreaming(projectId, threadId);
    runtime.setProjectError(projectId, "Thread deleted; active agents stopped", threadId);
    rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, projectId, run.id, "Thread deleted");
    const stoppedProject = repository.setAgentRunStatus(projectId, run.id, "stopped", "Thread deleted; active agents stopped");
    runtime.upsertPersistedProject(stoppedProject);
    emitRunUpdatedById(ws, requestId, repository, projectId, run.id);
  }

  runtime.clearProjectTransients(projectId, threadId);
}

function isTerminalThreadArchiveRunStatus(status: AgentRunState["status"]) {
  return status === "completed" || status === "partial-complete" || status === "stopped" || status === "failed";
}

function requirePersistedThreadRun(repository: WorkspaceRepository, projectId: ProjectId, threadId: ThreadId, runId: string) {
  const run = repository.getAgentRun(projectId, threadId, runId);
  if (!run) {
    throw new Error(`Run ${runId} is not available in this thread`);
  }

  return run;
}

function requireActiveRun(project: ProjectLike, runId?: string) {
  if (!project.activeRun) {
    throw new Error("Project has no active run");
  }

  if (runId && project.activeRun.id !== runId) {
    throw new Error(`Run ${runId} is not active`);
  }

  return project.activeRun;
}

function requireRetryablePersistedRun(repository: WorkspaceRepository, projectId: ProjectId, threadId: ThreadId, runId: string) {
  const run = requirePersistedThreadRun(repository, projectId, threadId, runId);
  if (!run.retryable) {
    throw new Error(`Run ${runId} is not retryable`);
  }

  return run;
}

function requireRunById(project: ProjectLike, runId: string) {
  const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId);
  if (!run) {
    throw new Error(`Run ${runId} is not available`);
  }
  return run;
}

function createExperimentLease(projectRoot: string, experiment: NonNullable<AgentRunState["experiment"]>): BranchfsExperimentLease {
  const projectRelativePath = path.relative(experiment.repoMountPath, experiment.projectMountPath);
  const depth = projectRelativePath ? projectRelativePath.split(/[\\/]+/).filter(Boolean).map(() => "..") : [];
  const repoRoot = depth.length > 0 ? path.resolve(projectRoot, ...depth) : projectRoot;
  return {
    experiment,
    repoRoot,
    projectRelativePath,
    repoMountPath: experiment.repoMountPath,
    projectMountPath: experiment.projectMountPath,
    baseProjectPath: path.join(
      path.dirname(experiment.repoMountPath),
      "base",
      projectRelativePath
    ),
    manifestPath: path.join(path.dirname(experiment.repoMountPath), "meta", "manifest.json"),
    dirtySeedPath: path.join(path.dirname(experiment.repoMountPath), "dirty-seed"),
    upperPath: path.join(path.dirname(experiment.repoMountPath), "upper")
  };
}

async function resolveGitHead(cwd: string) {
  const proc = Bun.spawn({
    cmd: ["git", "rev-parse", "--verify", "HEAD"],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return exitCode === 0 ? stdout.trim() : undefined;
}

async function computeDirtyFingerprint(cwd: string) {
  const proc = Bun.spawn({
    cmd: ["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", "."],
    cwd,
    stdout: "pipe",
    stderr: "ignore"
  });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  const hash = createHash("sha256");
  for (const part of stdout.split("\0").filter(Boolean).sort()) {
    const filePath = part.length >= 4 ? part.slice(3).trim() : part.trim();
    hash.update(part.slice(0, 2));
    hash.update(filePath);
    const absolutePath = path.join(cwd, filePath);
    const bytes = await Bun.file(absolutePath).bytes().catch(() => undefined);
    hash.update(bytes ?? Buffer.from("<deleted>"));
  }
  return hash.digest("hex");
}

async function assertExperimentPromotionPreconditions(
  projectRoot: string,
  experiment: NonNullable<AgentRunState["experiment"]>
) {
  const currentHead = await resolveGitHead(projectRoot);
  if (experiment.baseCommitSha && currentHead !== experiment.baseCommitSha) {
    throw new Error("Base HEAD changed since experiment mount");
  }

  const currentDirtyFingerprint = await computeDirtyFingerprint(projectRoot);
  if (currentDirtyFingerprint !== experiment.baseDirtyFingerprint) {
    throw new Error("Base dirty state changed since experiment mount");
  }
}

async function createExperimentCommit(projectRoot: string, runId: string) {
  const addProc = Bun.spawn({
    cmd: ["git", "add", "-A", "--", "."],
    cwd: projectRoot,
    stdout: "ignore",
    stderr: "pipe"
  });
  const addExit = await addProc.exited;
  if (addExit !== 0) {
    const detail = await new Response(addProc.stderr).text();
    throw new Error(detail.trim() || "git add failed");
  }

  const commitProc = Bun.spawn({
    cmd: ["git", "-c", "user.name=Pi Harness", "-c", "user.email=pi-harness@local", "commit", "-m", `chore: experiment ${runId}`],
    cwd: projectRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(commitProc.stdout).text(),
    new Response(commitProc.stderr).text(),
    commitProc.exited
  ]);
  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim();
    if (!detail.includes("nothing to commit")) {
      throw new Error(detail || "git commit failed");
    }
  }
}

function isExecutionBusy(state: ManagedExecutionState) {
  return state.phase === "active" || state.phase === "finishing";
}

async function enforceExecutionPreflight(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  project: ProjectLike,
  osAdapters: HarnessServerOsAdapters
) {
  const maxDirtyFileCount = repository.getDirtyGitChangeLimitDefault();
  const result = await osAdapters.runGitPreflight(project.rootPath, {
    enabled: repository.getBlockChatOnDirtyGitDefault(),
    maxDirtyFileCount
  });
  if (result.status === "warning") {
    appendSystemStatus(ws, requestId, runtime, repository, project.id, project.activeThreadId, result.preflight.message);
    sendEvent(ws, {
      type: "run.preflight",
      requestId,
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        preflight: result.preflight
      }
    });
    return;
  }

  if (result.status === "blocked") {
    if (result.preflight.kind === "git-not-repo") {
      appendSystemStatus(ws, requestId, runtime, repository, project.id, project.activeThreadId, result.preflight.message);
      sendEvent(ws, {
        type: "run.preflight",
        requestId,
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          preflight: result.preflight
        }
      });
      throw new PreflightDecisionRequiredError(result.preflight.message);
    }
    throw new Error(`Git dirty: ${result.changedFileCount} changed files. Refusing run above ${maxDirtyFileCount} files.`);
  }
}

class PreflightDecisionRequiredError extends Error { }

function validatePromptAttachments(
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  attachments?: ChatAttachment[]
) {
  if (!attachments?.length) {
    return undefined;
  }

  return attachments.map((attachment) => {
    const upload = repository.getChatAttachmentUpload(attachment.key);
    if (!upload) {
      throw new Error(`Attachment is not available from a trusted upload: ${attachment.name}`);
    }
    if (upload.projectId && upload.projectId !== projectId) {
      throw new Error(`Attachment ${attachment.name} belongs to another project`);
    }
    if (upload.threadId && upload.threadId !== threadId) {
      throw new Error(`Attachment ${attachment.name} belongs to another thread`);
    }
    const trusted = upload.attachment;
    if (
      trusted.url !== attachment.url ||
      trusted.kind !== attachment.kind ||
      trusted.name !== attachment.name ||
      trusted.mimeType !== attachment.mimeType ||
      trusted.sizeBytes !== attachment.sizeBytes
    ) {
      throw new Error(`Attachment metadata changed after upload: ${attachment.name}`);
    }
    if (trusted.documentType !== attachment.documentType) {
      throw new Error(`Attachment document metadata changed after upload: ${attachment.name}`);
    }

    return trusted;
  });
}

function appendCapturedCliContext(
  content: string,
  context: ReturnType<WorkspaceRuntimeStore["consumeThreadCapturedCliContext"]>
) {
  if (!context) {
    return content;
  }

  return [
    content,
    "",
    "[Captured CLI session context]",
    `Session: ${context.sessionId}`,
    `Captured at: ${context.capturedAt}`,
    context.visibleBuffer ? ["Visible stdout:", context.visibleBuffer].join("\n") : undefined,
    context.stderrTail ? ["Stderr tail:", context.stderrTail].join("\n") : undefined
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function sendCommandRejected(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  message: string,
  detail: string,
  requestId: string = createRequestId()
) {
  sendEvent(ws, {
    type: "command.rejected",
    requestId,
    payload: {
      message,
      detail
    }
  });
}

function isTransientSubagentError(error: Error) {
  const value = error.message.toLowerCase();
  return ["timeout", "temporar", "429", "rate limit", "overload", "network", "socket", "econn", "reset"].some(
    (token) => value.includes(token)
  );
}

function sendEvent(ws: Bun.ServerWebSocket<HarnessConnection>, event: ServerEvent) {
  guardedWebsocketSend(ws, JSON.stringify(event), {
    maxQueuedBytes: 256 * 1024,
    slowCloseReason: "Control websocket client is too slow"
  });
}

function emitControlEvent(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>> | undefined,
  event: ServerEvent
) {
  if (!connections || connections.size === 0) {
    return;
  }

  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, event);
  }
}

function emitAgentRuntimeUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  requestId: string,
  agentRuntimes: PreferencesState["agentRuntimes"]
) {
  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, {
      type: "agent.runtime.updated",
      requestId,
      payload: {
        agentRuntimes
      }
    });
  }
}

function emitSetupUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  requestId: string,
  setup: SetupState
) {
  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, {
      type: "setup.updated",
      requestId,
      payload: {
        setup
      }
    });
  }
}

function emitCliSessionStartedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { requestId: string; projectId: ProjectId; threadId: string; session: CliSession }
) {
  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, {
      type: "cli-session.started",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        session: input.session
      }
    });
  }
}

function emitCliSessionUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { requestId: string; projectId: ProjectId; threadId: string; session: CliSession }
) {
  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, {
      type: "cli-session.updated",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        session: input.session
      }
    });
  }
}

function emitCliSessionAttachReadyToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: {
    requestId: string;
    projectId: ProjectId;
    threadId: string;
    sessionId: string;
    attachToken: CliAttachToken;
  }
) {
  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, {
      type: "cli-session.attach-ready",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        sessionId: input.sessionId,
        attachToken: input.attachToken
      }
    });
  }
}

function emitCliSessionExitedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { requestId: string; projectId: ProjectId; threadId: string; session: CliSession }
) {
  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, {
      type: "cli-session.exited",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        session: input.session
      }
    });
  }
}

function resolveProjectAgentRuntime(runtimeRegistry: AgentRuntimeRegistry, project: WorkspaceProjectState) {
  return runtimeRegistry.get(project.session.selectedAgentId ?? "pi");
}

function assertRuntimeAvailable(runtime: AgentRuntime, capability = runtime.getCapability()) {
  if (!capability) {
    return;
  }

  if (!capability.installed) {
    throw new Error(capability.healthMessage ?? `${runtime.label} is not installed`);
  }

  if (runtime.id !== "pi" && !capability.authenticated) {
    throw new Error(capability.healthMessage ?? `${runtime.label} is not authenticated`);
  }
}

function getPreferencesState(
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  runtimeRegistry: AgentRuntimeRegistry
): PreferencesState {
  const hasUsableOpenAiApiKey = adapter.hasApiKey("openai");
  const hasStoredOpenAiApiKey = Boolean(repository.getStoredOpenAiApiKey());
  const hasUsableGoogleApiKey = adapter.hasApiKey("google");
  const hasStoredGoogleApiKey = Boolean(repository.getStoredGoogleApiKey());
  const hasUsableAnthropicApiKey = adapter.hasApiKey("anthropic");
  const hasStoredAnthropicApiKey = Boolean(repository.getStoredAnthropicApiKey());

  return {
    hasUsableApiKey: hasUsableOpenAiApiKey || hasUsableGoogleApiKey || hasUsableAnthropicApiKey,
    hasStoredApiKey: hasStoredOpenAiApiKey || hasStoredGoogleApiKey || hasStoredAnthropicApiKey,
    hasUsableOpenAiApiKey,
    hasStoredOpenAiApiKey,
    hasUsableGoogleApiKey,
    hasStoredGoogleApiKey,
    hasUsableAnthropicApiKey,
    hasStoredAnthropicApiKey,
    providerBrand: repository.getProviderBrand(),
    debugEnabledDefault: repository.getDebugEnabledDefault(),
    tracePanelDefaultOpen: repository.getTracePanelDefaultOpen(),
    subagentWorktreeStrategyDefault: repository.getSubagentWorktreeStrategyDefault(),
    blockChatOnDirtyGitDefault: repository.getBlockChatOnDirtyGitDefault(),
    dirtyGitChangeLimitDefault: repository.getDirtyGitChangeLimitDefault(),
    autoCompactContextThresholdPercentDefault: repository.getAutoCompactContextThresholdPercentDefault(),
    planExecutionModeDefault: repository.getPlanExecutionModeDefault(),
    planExecutionDelaySecondsDefault: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationModeDefault: repository.getCorrectnessIterationModeDefault(),
    backgroundJobApprovalPolicyDefault: repository.getBackgroundJobApprovalPolicyDefault(),
    autoArchiveCompletedThreadsDefault: getRepositoryAutoArchiveCompletedThreadsDefault(repository),
    memoryBankEnabledDefault: repository.getMemoryBankEnabledDefault(),
    attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
    capabilities: defaultProviderCapabilities,
    agentRuntimes: runtimeRegistry.listCapabilities()
  };
}

function getRepositoryAutoArchiveCompletedThreadsDefault(repository: WorkspaceRepository) {
  if (
    "getAutoArchiveCompletedThreadsDefault" in repository &&
    typeof repository.getAutoArchiveCompletedThreadsDefault === "function"
  ) {
    return repository.getAutoArchiveCompletedThreadsDefault();
  }

  return false;
}

function setRepositoryAutoArchiveCompletedThreadsDefault(repository: WorkspaceRepository, value: boolean) {
  if (
    "setAutoArchiveCompletedThreadsDefault" in repository &&
    typeof repository.setAutoArchiveCompletedThreadsDefault === "function"
  ) {
    repository.setAutoArchiveCompletedThreadsDefault(value);
  }
}

function applyAdapterAutoCompactionThreshold(adapter: PiAgentAdapter, thresholdPercent: number) {
  if ("setAutoCompactContextThresholdPercent" in adapter && typeof adapter.setAutoCompactContextThresholdPercent === "function") {
    adapter.setAutoCompactContextThresholdPercent(thresholdPercent);
  }
}

function resolveBackgroundJobNextRunAt(schedule: BackgroundJobSchedule) {
  switch (schedule.type) {
    case "one-off":
      return schedule.runAt;
    case "interval":
    case "cron":
      return schedule.nextRunAt;
  }
}

function computeBackgroundJobRiskLevel(
  job: BackgroundJob,
  project: WorkspaceProjectState,
  runtime: WorkspaceRuntimeStore
): BackgroundJob["riskLevel"] {
  if (job.kind === "shell") {
    if (job.definition.kind !== "shell") {
      throw new Error(`Expected shell definition for ${job.id}`);
    }

    return job.definition.networkAccess || (job.definition.envRefs?.length ?? 0) > 0 ? "unsafe" : "slightly-unsafe";
  }

  if (job.definition.kind !== "ai-routine") {
    throw new Error(`Expected ai-routine definition for ${job.id}`);
  }

  const mode = resolveModeById(job.definition.modeId ?? project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes);
  const worktreeStrategy = job.definition.subagentWorktreeStrategy ?? repositoryLikeWorktreeStrategy(project, runtime);
  if (modeUsesReadOnlyExecution(mode) && worktreeStrategy !== "same-worktree") {
    return "safe";
  }

  return worktreeStrategy === "same-worktree" ? "unsafe" : "slightly-unsafe";
}

function repositoryLikeWorktreeStrategy(project: WorkspaceProjectState, runtime: WorkspaceRuntimeStore) {
  return resolveModeById(project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes)
    ?.subagentWorktreeStrategyDefault ?? "same-worktree";
}

type AssistantCreationResult = {
  assistant: Assistant;
  created: boolean;
};

function findExistingAssistantForThreadIntent(
  repository: WorkspaceRepository,
  projectId: ProjectId,
  name: string,
  scope: "project" | "global"
) {
  return repository.loadAssistantsState().assistants.find(
    (assistant) =>
      assistant.deletedAt === undefined &&
      assistant.scope === scope &&
      assistant.name.toLowerCase() === name.toLowerCase() &&
      (scope === "global" || assistant.projectId === projectId)
  );
}

function createAssistantFromThreadIntent(input: {
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  projectId: ProjectId;
  threadId: ThreadId;
  sourcePrompt: string;
  name: string;
  scope: "project" | "global";
  purpose?: string;
  agentId?: AgentId;
  providerBrand?: ProviderBrand;
  modeId?: string;
  executionModelId?: string;
  fastMode?: boolean;
}): AssistantCreationResult {
  const project = input.runtime.getProject(input.projectId);
  if (project.activeThreadId !== input.threadId && !project.threads.some((thread) => thread.id === input.threadId)) {
    throw new Error(`Unknown thread: ${input.threadId}`);
  }

  const existing = findExistingAssistantForThreadIntent(input.repository, input.projectId, input.name, input.scope);
  if (existing) {
    return { assistant: existing, created: false };
  }

  const now = new Date().toISOString();
  const projectScope = input.scope === "project";
  const assistant: Assistant = {
    id: createAssistantId(),
    name: input.name,
    scope: input.scope,
    projectId: projectScope ? input.projectId : undefined,
    description: projectScope
      ? "Project assistant created from thread prompt."
      : "Global assistant created from thread prompt.",
    personalityPrompt:
      "You are a focused assistant operator. Be direct, pragmatic, and careful with existing project conventions. Keep the user informed with concise status and ask when intent is ambiguous.",
    jobPrompt: [
      `Original thread prompt: ${input.sourcePrompt}`,
      input.purpose ? `Assistant purpose: ${input.purpose}` : undefined,
      `Project root: ${project.rootPath}`,
      "Maintain assistant-owned todos, questions, learnings, and logs for ongoing work.",
      "Do not pollute normal project chat with assistant-owned routine output unless the user explicitly asks to promote it."
    ].filter(Boolean).join("\n"),
    agentId: input.agentId ?? "pi",
    providerBrand: input.providerBrand,
    modeId: input.modeId,
    executionModelId: input.executionModelId,
    fastMode: input.fastMode,
    runState: "active",
    bootstrapState: "pending",
    bootstrapAttemptId: undefined,
    bootstrapStartedAt: undefined,
    bootstrapFinishedAt: undefined,
    clonedFromAssistantId: undefined,
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    circuitBreakerReason: undefined,
    deletedAt: undefined,
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now
  };

  return {
    assistant: input.repository.saveAssistant(assistant),
    created: true
  };
}

function appendAssistantCreationMessage(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  result: AssistantCreationResult
) {
  const scopeLabel = result.assistant.scope === "global" ? "global assistant" : "project assistant";
  const content = result.created
    ? `Created ${scopeLabel} "${result.assistant.name}".`
    : `Assistant "${result.assistant.name}" already exists. Opened it in Assistants.`;
  const messageProject = repository.appendMessage(projectId, "assistant", content, {
    threadId,
    metadata: {
      type: "assistant-action",
      assistantId: result.assistant.id,
      assistantName: result.assistant.name,
      actionKind: "create",
      summaryRows: [
        { label: "Assistant", value: result.assistant.name },
        { label: "Action", value: result.created ? "created" : "already existed" },
        { label: "Scope", value: scopeLabel }
      ],
      actions: buildAssistantCreationCardActions(repository, result.assistant)
    }
  });
  runtime.upsertPersistedProject(messageProject);
  emitThreadMessageAppended(ws, requestId, runtime, repository, projectId, threadId);
}

async function executeAssistantChatAction(input: {
  ws: Bun.ServerWebSocket<HarnessConnection>;
  requestId: string;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  adapter: PiAgentAdapter;
  runtimeRegistry: AgentRuntimeRegistry;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  assistantManager: AssistantManager;
  projectId: ProjectId;
  threadId: ThreadId;
  action: AssistantActionIntentDraft & { assistant: Assistant };
}) {
  const { repository, action } = input;
  let assistant = action.assistant;
  let content = "";
  let metadata: AssistantActionMessageMetadata;
  const rows: AssistantActionMessageMetadata["summaryRows"] = [
    { label: "Assistant", value: assistant.name },
    { label: "Action", value: action.actionKind }
  ];
  let jobId: string | undefined;
  let runId: string | undefined;
  let questionId = action.questionId;

  switch (action.actionKind) {
    case "chat": {
      assistant = ensureAssistantActiveForProjectChat(repository, assistant.id, input.connections);
      assertAssistantRunnableForLaunch(repository, assistant.id);
      await input.assistantManager.sendAssistantChat(assistant.id, action.answerText ?? action.sourcePrompt);
      content = `Sent message to ${assistant.name}.`;
      break;
    }
    case "inspect": {
      const todos = repository.getAssistantTodos(assistant.id);
      const questions = repository.getAssistantQuestions(assistant.id);
      const jobs = repository.loadBackgroundJobsState().jobs.filter((job) => job.assistantId === assistant.id);
      rows.push(
        { label: "Todos", value: String(todos.filter((todo) => todo.state !== "completed").length) },
        { label: "Questions", value: String(questions.filter((question) => question.status === "pending").length) },
        { label: "Jobs", value: String(jobs.length) }
      );
      content = `${assistant.name} has ${jobs.length} job(s), ${todos.filter((todo) => todo.state !== "completed").length} open todo(s), and ${questions.filter((question) => question.status === "pending").length} pending question(s).`;
      break;
    }
    case "list-jobs": {
      const jobs = repository.loadBackgroundJobsState().jobs.filter((job) => job.assistantId === assistant.id);
      rows.push(...jobs.slice(0, 6).map((job) => ({ label: job.status, value: job.name })));
      content = jobs.length > 0 ? `${assistant.name} has ${jobs.length} assistant-owned job(s).` : `${assistant.name} has no assistant-owned jobs.`;
      break;
    }
    case "create-job": {
      assistant = ensureAssistantActiveForProjectChat(repository, assistant.id, input.connections);
      assertAssistantRunnableForLaunch(repository, assistant.id);
      const scheduleText = action.scheduleText?.trim();
      if (!scheduleText) {
        throw new Error("Schedule input is required.");
      }
      const preview = previewBackgroundJobSchedule(scheduleText);
      if (!preview.schedule) {
        throw new Error(preview.error ?? "Invalid schedule.");
      }
      const now = new Date().toISOString();
      const project = input.runtime.getProject(input.projectId);
      const job: BackgroundJob = {
        id: createBackgroundJobId(),
        projectId: input.projectId,
        assistantId: assistant.id,
        automationThreadId: createThreadId(),
        kind: "ai-routine",
        name: `${assistant.name}: ${summarizeAssistantActionText(action.jobPrompt ?? action.sourcePrompt, 80)}`,
        description: `Assistant-owned job created from project chat.`,
        status: "enabled",
        riskLevel: "unsafe",
        definition: {
          kind: "ai-routine",
          prompt: action.jobPrompt ?? action.sourcePrompt,
          modeId: assistant.modeId ?? project.selectedModeId,
          executionModelId: assistant.executionModelId ?? project.session.executionModelId,
          fastMode: assistant.fastMode
        },
        schedule: preview.schedule,
        scheduleInput: scheduleText,
        timezone: preview.timezone,
        nextRunAt: resolveBackgroundJobNextRunAt(preview.schedule),
        createdAt: now,
        updatedAt: now
      };
      repository.saveBackgroundJob({
        ...job,
        riskLevel: computeBackgroundJobRiskLevel(job, project, input.runtime)
      });
      emitBackgroundJobsUpdatedToAll(input.connections, repository.loadBackgroundJobsState());
      jobId = job.id;
      rows.push({ label: "Job", value: job.name }, { label: "Schedule", value: scheduleText });
      content = `Created assistant-owned job "${job.name}" for ${assistant.name}.`;
      break;
    }
    case "run-job": {
      assistant = ensureAssistantActiveForProjectChat(repository, assistant.id, input.connections);
      assertAssistantRunnableForLaunch(repository, assistant.id);
      if (!action.jobId) {
        throw new Error("Background job is required.");
      }
      const loadedJob = requireBackgroundJobForProject(repository, input.projectId, action.jobId);
      const job = repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
      if (job.assistantId !== assistant.id) {
        throw new Error("Background job does not belong to assistant.");
      }
      await repairBackgroundJobRunsForJob(
        repository,
        input.connections,
        action.jobId,
        (run) => isBackgroundRunLive(input.backgroundRunControllers, input.runtime, run)
      );
      const activeRun = repository.getActiveBackgroundJobRuns(action.jobId)[0];
      if (activeRun) {
        throw new Error(formatActiveBackgroundRunError(activeRun));
      }
      const queuedRun = repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: job.assistantId,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "queued",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      });
      repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Assistant job queued from project chat");
      emitBackgroundJobsUpdatedToAll(input.connections, repository.loadBackgroundJobsState());
      await emitBackgroundJobRunUpdatedToAll(input.connections, queuedRun);
      await launchBackgroundJobRun(
        input.connections,
        repository,
        input.runtimeRegistry,
        input.runtime,
        input.backgroundRunControllers,
        input.assistantManager,
        queuedRun.id
      );
      jobId = job.id;
      runId = queuedRun.id;
      rows.push({ label: "Job", value: job.name }, { label: "Run", value: queuedRun.id });
      content = `Queued ${assistant.name} job "${job.name}".`;
      break;
    }
    case "pause": {
      repository.setAssistantRunState(assistant.id, "paused");
      emitAssistantsUpdatedToAll(input.connections, repository.loadAssistantsState());
      content = `Paused ${assistant.name}.`;
      break;
    }
    case "resume": {
      repository.setAssistantRunState(assistant.id, "active");
      emitAssistantsUpdatedToAll(input.connections, repository.loadAssistantsState());
      input.assistantManager.scheduleReprioritize(assistant.id, "project-chat-resume");
      content = `Resumed ${assistant.name}.`;
      break;
    }
    case "clone": {
      const clonedAssistant = cloneAssistantForProject(repository, assistant, input.projectId);
      emitAssistantsUpdatedToAll(input.connections, repository.loadAssistantsState());
      emitAssistantCreatedCardToAll(input.connections, clonedAssistant);
      rows.push({ label: "Clone", value: clonedAssistant.name });
      content = `Cloned ${assistant.name} to this project.`;
      break;
    }
    case "answer-question": {
      assistant = ensureAssistantActiveForProjectChat(repository, assistant.id, input.connections);
      if (!questionId) {
        throw new Error("Assistant question is required.");
      }
      await input.assistantManager.answerQuestion(assistant.id, questionId, action.answerText ?? action.sourcePrompt);
      archiveNotificationWithLegacyId(repository, ["assistant-question", assistant.id, questionId]);
      emitAssistantsUpdatedToAll(input.connections, repository.loadAssistantsState());
      emitNotificationsUpdatedToAll(input.connections, input.requestId, repository.loadNotificationInboxState());
      content = `Answered ${assistant.name}'s question.`;
      break;
    }
    case "update-todo": {
      assistant = ensureAssistantActiveForProjectChat(repository, assistant.id, input.connections);
      if (!action.todoId) {
        throw new Error("Assistant todo is required.");
      }
      const todo = repository.getAssistantTodos(assistant.id).find((entry) => entry.id === action.todoId);
      if (!todo) {
        throw new Error("Unknown assistant todo for assistant");
      }
      const now = new Date().toISOString();
      repository.saveAssistantTodo({ ...todo, state: "completed", completedAt: now, updatedAt: now });
      emitAssistantsUpdatedToAll(input.connections, repository.loadAssistantsState());
      input.assistantManager.scheduleReprioritize(assistant.id, "project-chat-todo-update");
      rows.push({ label: "Todo", value: todo.title });
      content = `Marked ${assistant.name} todo complete.`;
      break;
    }
    case "recover": {
      await input.assistantManager.recoverAssistant(assistant.id);
      emitAssistantsUpdatedToAll(input.connections, repository.loadAssistantsState());
      content = `Recovery started for ${assistant.name}.`;
      break;
    }
    case "create":
      throw new Error("Assistant creation is handled before assistant action execution.");
  }

  metadata = {
    type: "assistant-action",
    assistantId: assistant.id,
    assistantName: assistant.name,
    actionKind: action.actionKind,
    jobId,
    runId,
    questionId,
    summaryRows: rows,
    actions: buildAssistantActionCardActions(repository, assistant, { jobId, questionId })
  };

  const messageProject = repository.appendMessage(input.projectId, "assistant", content, {
    threadId: input.threadId,
    metadata
  });
  input.runtime.upsertPersistedProject(messageProject);
  emitThreadMessageAppended(input.ws, input.requestId, input.runtime, repository, input.projectId, input.threadId);
}

function cloneAssistantForProject(repository: WorkspaceRepository, source: Assistant, projectId: ProjectId) {
  const now = new Date().toISOString();
  const clonedAssistant: Assistant = {
    ...source,
    id: createAssistantId(),
    scope: "project",
    projectId,
    clonedFromAssistantId: source.id,
    circuitBreakerState: "closed",
    circuitBreakerReason: undefined,
    failureStreakCount: 0,
    unreadQuestionCount: 0,
    latestActivityAt: now,
    deletedAt: undefined,
    createdAt: now,
    updatedAt: now
  };
  const clonedAssetRefs = repository.getAssistantAssetRefs(source.id).map((assetRef) => ({
    ...assetRef,
    id: createAssistantAssetRefId(),
    assistantId: clonedAssistant.id,
    createdAt: now
  }));
  return repository.cloneAssistantToProject(source.id, projectId, clonedAssistant, clonedAssetRefs);
}

function ensureAssistantActiveForProjectChat(
  repository: WorkspaceRepository,
  assistantId: string,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>
) {
  const assistant = repository.getAssistant(assistantId, true);
  if (!assistant) {
    throw new Error(`Unknown assistant: ${assistantId}`);
  }
  if (assistant.deletedAt) {
    throw new Error(`Assistant ${assistant.name} is deleted`);
  }
  if (assistant.runState !== "paused") {
    return assistant;
  }
  const resumed = repository.setAssistantRunState(assistantId, "active");
  emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
  return resumed;
}

function buildAssistantActionCardActions(
  repository: WorkspaceRepository,
  assistant: Assistant,
  input: { jobId?: string; questionId?: string }
): AssistantActionMessageMetadata["actions"] {
  const disabledReason =
    repository.getGlobalExecutionPaused()
      ? "Global execution is paused"
      : assistant.circuitBreakerState === "tripped"
        ? "Recover assistant first"
        : assistant.runState === "paused"
          ? "Assistant is paused"
          : undefined;
  const recoverDisabledReason = repository.getGlobalExecutionPaused() ? "Global execution is paused" : undefined;
  return [
    { kind: "open-assistant", label: "Open assistant" },
    { kind: "open-jobs", label: "Open jobs" },
    { kind: "run-job", label: "Run job", disabled: Boolean(disabledReason || !input.jobId), disabledReason: disabledReason ?? "No job selected" },
    { kind: assistant.runState === "paused" ? "resume" : "pause", label: assistant.runState === "paused" ? "Resume" : "Pause" },
    { kind: "answer-question", label: "Answer question", disabled: !input.questionId, disabledReason: "No question selected" },
    { kind: "recover", label: "Recover", disabled: Boolean(recoverDisabledReason), disabledReason: recoverDisabledReason }
  ];
}

function buildAssistantCreationCardActions(repository: WorkspaceRepository, assistant: Assistant): AssistantActionMessageMetadata["actions"] {
  const retryDisabledReason =
    repository.getGlobalExecutionPaused()
      ? "Global execution is paused"
      : assistant.circuitBreakerState === "tripped"
        ? "Recover assistant first"
        : undefined;
  return [
    { kind: "open-assistant", label: "Open assistant" },
    { kind: "retry-bootstrap", label: "Retry bootstrap", disabled: Boolean(retryDisabledReason), disabledReason: retryDisabledReason },
    { kind: "schedule-job", label: "Schedule job" }
  ];
}

function summarizeAssistantActionText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized || "Assistant job";
}

function inferAssistantNameFromPrompt(sourcePrompt: string) {
  const intent = detectAssistantChatIntent(sourcePrompt);
  if (intent.kind === "create-ready" || intent.kind === "create-needs-purpose") {
    return intent.name;
  }
  if (intent.kind === "ambiguous") {
    return intent.suggestedName;
  }
  return "Thread assistant";
}

function createAssistantIntentQuestion(input: {
  projectId: ProjectId;
  threadId: ThreadId;
  sourcePrompt: string;
  suggestedName: string;
  defaultScope?: "project" | "global";
}): Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "responseKind" | "choices" | "required" | "intent"> {
  return {
    id: "assistant-create-intent" as QuestionId,
    prompt: `Do you want to create a project assistant named "${input.suggestedName}", or run this once in project chat?`,
    placeholder: "Choose assistant creation or one-off project execution.",
    responseKind: "choice",
    choices: [
      {
        id: "assistant-create-intent:create",
        label: "Create project assistant",
        description: "Create a project-scoped assistant and open it in Assistants.",
        answerText: `Create a project assistant named "${input.suggestedName}" from this prompt.`,
        recommended: true
      },
      {
        id: "assistant-create-intent:run-once",
        label: "Run once",
        description: "Handle this prompt once in normal project chat.",
        answerText: `${input.sourcePrompt}\n\nRun this once in project chat; do not create an assistant.`,
        recommended: false
      },
      {
        id: "assistant-create-intent:cancel",
        label: "Cancel",
        description: "Stop this request without creating an assistant or running project work.",
        answerText: "Cancel this request.",
        recommended: false
      }
    ],
    required: true,
    intent: {
      type: "assistant-create-intent",
      projectId: input.projectId,
      threadId: input.threadId,
      sourcePrompt: input.sourcePrompt,
      suggestedName: input.suggestedName,
      defaultScope: input.defaultScope ?? "project"
    }
  };
}

function createAssistantPurposeQuestion(input: {
  projectId: ProjectId;
  threadId: ThreadId;
  sourcePrompt: string;
  suggestedName: string;
  defaultScope: "project" | "global";
}): Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "responseKind" | "required" | "intent"> {
  return {
    id: "assistant-create-purpose" as QuestionId,
    prompt: `What should ${input.suggestedName} do for this project?`,
    placeholder: "Use Kojima to triage failed tests, maintain docs, and keep project todos current.",
    responseKind: "freeform",
    required: true,
    intent: {
      type: "assistant-create-intent",
      projectId: input.projectId,
      threadId: input.threadId,
      sourcePrompt: input.sourcePrompt,
      suggestedName: input.suggestedName,
      defaultScope: input.defaultScope,
      requiresPurpose: true
    }
  };
}

function createAssistantActionIntentQuestion(input: Extract<AssistantChatActionResolution, { kind: "clarify" }>): Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "responseKind" | "choices" | "required" | "intent"> {
  const intent: AssistantActionPlanningIntent = {
    type: "assistant-action-intent",
    actionKind: input.intent.actionKind,
    sourcePrompt: input.intent.sourcePrompt,
    assistantSelector: input.intent.assistantSelector,
    candidateAssistantIds: input.intent.candidateAssistantIds,
    scheduleText: input.intent.scheduleText,
    jobPrompt: input.intent.jobPrompt,
    jobId: input.intent.jobId,
    questionId: input.intent.questionId,
    todoId: input.intent.todoId,
    answerText: input.intent.answerText
  };
  const choices = input.choices.map((choice, index) => ({
    id: choice.id,
    label: choice.label,
    description: choice.description,
    answerText: choice.answerText || choice.label,
    recommended: choice.recommended || index === 0
  }));
  while (choices.length < 3) {
    choices.push({
      id: `assistant-action:fallback:${choices.length}`,
      label: choices.length === 1 ? "Cancel" : "Run once",
      description: choices.length === 1 ? "Do not run an assistant action." : "Use normal project chat instead.",
      answerText: choices.length === 1 ? "cancel" : "run once",
      recommended: false
    });
  }
  return {
    id: "assistant-action-intent" as QuestionId,
    prompt: input.prompt,
    placeholder: "Answer with assistant, schedule, job, question, or todo details.",
    responseKind: "choice",
    choices: choices.slice(0, 3) as PlanningQuestion["choices"],
    required: true,
    intent
  };
}

function classifyAssistantIntentAnswer(question: PlanningQuestion, answerText: string) {
  const trimmed = answerText.trim();
  if (trimmed === question.choices?.[0]?.answerText || /^create a project assistant\b/i.test(trimmed)) {
    return "create";
  }
  if (trimmed === question.choices?.[2]?.answerText || /^cancel\b/i.test(trimmed)) {
    return "cancel";
  }
  return "run-once";
}

function classifyAssistantPurposeAnswer(answerText: string) {
  return /^cancel\b/i.test(answerText.trim()) ? "cancel" : "create";
}

function emitAssistantsUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  assistants: ReturnType<WorkspaceRepository["loadAssistantsState"]>
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistants.updated",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: {
        assistants
      }
    });
  }
}

function emitAssistantChatDeltaToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { assistantId: string; sessionId: string; delta: string }
) {
  const pump = getAssistantChatPump(connections, input.assistantId, input.sessionId);
  pump.push(input.delta);
}

const assistantChatPumps = new Map<string, StreamPump>();

function getAssistantChatPump(connections: Set<Bun.ServerWebSocket<HarnessConnection>>, assistantId: string, sessionId: string) {
  const key = `${assistantId}:${sessionId}`;
  const existing = assistantChatPumps.get(key);
  if (existing) {
    return existing;
  }
  const pump = new StreamPump({
    flushIntervalMs: STREAM_DELTA_FLUSH_MS,
    maxBufferedBytes: STREAM_DELTA_MAX_BUFFERED_BYTES,
    onFlush(delta) {
      emitAssistantChatDeltaFrameToAll(connections, { assistantId, sessionId, delta });
    }
  });
  assistantChatPumps.set(key, pump);
  return pump;
}

function emitAssistantChatDeltaFrameToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { assistantId: string; sessionId: string; delta: string }
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistant.chat.delta",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: input
    });
  }
}

function emitAssistantChatMessageAppendedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { assistantId: string; sessionId: string; message: ChatMessage; thread: AssistantThread }
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistant.chat.message-appended",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: input
    });
  }
}

function emitAssistantChatCompleteToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { assistantId: string; sessionId: string; assistantMessage: ChatMessage; thread: ReturnType<WorkspaceRepository["getAssistantThread"]> }
) {
  const key = `${input.assistantId}:${input.sessionId}`;
  const pump = assistantChatPumps.get(key);
  if (pump) {
    void pump.flush();
    pump.close();
    assistantChatPumps.delete(key);
  }
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistant.chat.complete",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: input
    });
  }
}

function emitAssistantLogAppendedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  entry: ReturnType<WorkspaceRepository["appendAssistantLogEntry"]>
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistant.log.appended",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: {
        entry
      }
    });
  }
}

function emitAssistantCreatedCardToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  assistant: Assistant
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistant.created-card",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: {
        assistant
      }
    });
  }
}

function emitBackgroundJobsUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  backgroundJobs: BackgroundJobsState
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "background-jobs.updated",
      requestId: `bg:auto:${crypto.randomUUID()}`,
      payload: {
        backgroundJobs
      }
    });
  }
}

async function emitBackgroundJobRunUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  run: BackgroundJobRun
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "background-job-run.updated",
      requestId: `bg:auto:${crypto.randomUUID()}`,
      payload: {
        run
      }
    });
  }
}

async function repairBackgroundJobRunsForJob(
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  jobId: string,
  isRunLive: (run: BackgroundJobRun) => boolean
) {
  const repairedRuns = reconcileBackgroundJobRunBlockers(repository, isRunLive, { jobId });
  if (repairedRuns.length === 0) {
    return;
  }
  for (const run of repairedRuns) {
    syncBackgroundJobFailureTracking(repository, run);
    saveBackgroundRunStatusNotification(repository, run);
    await emitBackgroundJobRunUpdatedToAll(connections, run);
  }
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
}

function isBackgroundRunLive(
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  runtime: WorkspaceRuntimeStore,
  run: BackgroundJobRun
) {
  return (
    backgroundRunControllers.has(run.id) ||
    Boolean(run.linkedAgentRunId && runtime.getAbortController(run.projectId, run.linkedAgentRunId))
  );
}

async function resumeAndRepairBackgroundJobRuns(
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  runtimeRegistry: AgentRuntimeRegistry,
  runtime: WorkspaceRuntimeStore,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  assistantManager: AssistantManager,
  now: Date
) {
  for (const run of repository.getActiveBackgroundJobRuns()) {
    if (backgroundRunControllers.has(run.id) || run.status !== "running" || !run.linkedAgentRunId) {
      continue;
    }
    if ((run.resumeAttemptCount ?? 0) >= 1) {
      continue;
    }
    if (!isBackgroundRunPastLeaseGrace(run, now, BACKGROUND_RUN_STARTUP_GRACE_MS)) {
      continue;
    }
    const linkedRun = repository.getRun(run.projectId, run.linkedAgentRunId);
    if (linkedRun?.status !== "ready" || !linkedRun.plan) {
      continue;
    }

    repository.appendBackgroundJobRunEvent(run.id, "queued", "Retrying orphaned ready run", "Restarting background execution once.");
    const resumedRun = repository.setBackgroundJobRunStatus(run.id, "queued", {
      summary: linkedRun.summary,
      linkedAgentRunId: linkedRun.id,
      resumeAttemptCount: (run.resumeAttemptCount ?? 0) + 1
    });
    await emitBackgroundJobRunUpdatedToAll(connections, resumedRun);
    await launchBackgroundJobRun(
      connections,
      repository,
      runtimeRegistry,
      runtime,
      backgroundRunControllers,
      assistantManager,
      resumedRun.id
    );
  }

  return reconcileBackgroundJobRunBlockers(
    repository,
    (run) => backgroundRunControllers.has(run.id),
    { now }
  );
}

function reconcileBackgroundJobRunBlockers(
  repository: WorkspaceRepository,
  isRunLive: (run: BackgroundJobRun) => boolean,
  options: { jobId?: string; runId?: string; now?: Date } = {}
) {
  const repairedRuns = repository.repairInterruptedBackgroundJobRuns({
    jobId: options.jobId,
    isRunLive,
    now: options.now
  });
  const repairedIds = new Set(repairedRuns.map((run) => run.id));
  const activeRuns = options.runId
    ? repository.getActiveBackgroundJobRuns(options.jobId).filter((run) => run.id === options.runId)
    : repository.getActiveBackgroundJobRuns(options.jobId);

  for (const run of activeRuns) {
    if (repairedIds.has(run.id) || run.status !== "awaiting-user-input" || !run.assistantId || !run.linkedAgentRunId) {
      continue;
    }
    const linkedRun = repository.getRun(run.projectId, run.linkedAgentRunId);
    const pendingQuestions = linkedRun?.questions.filter((question) => question.status === "pending" || question.status === "deferred") ?? [];
    if (!linkedRun || pendingQuestions.length === 0) {
      continue;
    }

    const assistantQuestions = repository.getAssistantQuestions(run.assistantId);
    const learnings = repository.getAssistantLearnings(run.assistantId);
    const decisions = pendingQuestions.map((question) => ({
      question,
      decision: evaluateAssistantQuestionPolicy({
        prompt: question.prompt,
        questions: assistantQuestions,
        learnings
      })
    }));
    if (decisions.some((entry) => entry.decision.kind === "ask")) {
      continue;
    }

    for (const { question, decision } of decisions) {
      repository.answerPlanningQuestion(
        run.projectId,
        linkedRun.id,
        question.id,
        resolveAssistantPolicyAnswer(decision)
      );
    }
    repository.appendBackgroundJobRunEvent(
      run.id,
      "question-auto-resolved",
      "Planning question auto-resolved",
      pendingQuestions.map((question) => question.prompt).join("\n\n")
    );
    const skippedRun = repository.setBackgroundJobRunStatus(run.id, "skipped", {
      summary: "Planning question auto-resolved; run will retry on next cadence"
    });
    repository.appendBackgroundJobRunEvent(
      run.id,
      "skipped",
      "Background run skipped after question auto-resolution",
      "Scheduler will retry this job on the next due cadence."
    );
    repairedRuns.push(repository.getBackgroundJobRun(skippedRun.id) ?? skippedRun);
  }

  return repairedRuns;
}

function syncBackgroundJobFailureTracking(repository: WorkspaceRepository, run: BackgroundJobRun) {
  if (run.status === "succeeded" || run.status === "skipped") {
    repository.clearBackgroundJobFailureTracking(run.jobId);
    return;
  }
  if (run.status !== "failed") {
    return;
  }
  const failureCategory = classifyRunFailure({
    explicitCategory: run.failureCategory,
    message: run.failureMessage
  });
  if (!isBackoffEligibleFailureCategory(failureCategory)) {
    repository.clearBackgroundJobFailureTracking(run.jobId);
    return;
  }
  repository.recordBackgroundJobFailure(run.jobId, failureCategory);
}

function resolveAssistantPolicyAnswer(decision: ReturnType<typeof evaluateAssistantQuestionPolicy>) {
  switch (decision.kind) {
    case "auto-answer":
      return decision.answerText;
    case "suppress":
      return decision.note;
    case "note":
      return decision.note;
    case "ask":
      return decision.reason;
  }
}

function formatActiveBackgroundRunError(run: BackgroundJobRun) {
  const detail = run.summary ?? run.failureMessage;
  return `Background job already has active run ${run.id} in status ${run.status}${detail ? `: ${detail}` : ""}`;
}

async function finalizeAutoResolvedAssistantQuestionRun(
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  run: BackgroundJobRun
) {
  const resolvedRun = repository.setBackgroundJobRunStatus(run.id, "succeeded", {
    summary: "Assistant question auto-resolved from durable guidance"
  });
  repository.appendBackgroundJobRunEvent(
    run.id,
    "done",
    "Assistant question auto-resolved",
    run.summary ?? run.failureMessage ?? undefined
  );
  saveBackgroundRunStatusNotification(repository, resolvedRun);
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  await emitBackgroundJobRunUpdatedToAll(connections, resolvedRun);
  emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
}

function emitNotificationsUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  requestId: string,
  notifications: ReturnType<WorkspaceRepository["loadNotificationInboxState"]>
) {
  for (const connection of connections) {
    sendEvent(connection, {
      type: "notifications.updated",
      requestId,
      payload: {
        notifications
      }
    });
  }
}

function syncAssistantQuestionNotifications(repository: WorkspaceRepository) {
  const assistants = repository.loadAssistantsState();
  const activeIds = new Set<string>();
  const questionsByAssistant = new Map<string, AssistantQuestion[]>();
  for (const question of assistants.questions.filter((entry) => entry.status === "pending" || entry.status === "deferred")) {
    questionsByAssistant.set(question.assistantId, [...(questionsByAssistant.get(question.assistantId) ?? []), question]);
  }

  for (const questions of questionsByAssistant.values()) {
    if (questions.length > 1) {
      const notification = createAssistantQuestionBatchNotification(questions);
      activeIds.add(notification.id);
      repository.saveNotification(notification);
      for (const question of questions) {
        repository.archiveNotification(createAssistantQuestionNotificationId(question.assistantId, question.id));
      }
      continue;
    }

    const question = questions[0]!;
    const notification = createAssistantQuestionNotification(question);
    activeIds.add(notification.id);
    repository.saveNotification(notification);
  }

  for (const item of repository.loadNotificationInboxState().items) {
    if (item.kind !== "assistant-question" && item.kind !== "assistant-question-batch") {
      continue;
    }

    if (!activeIds.has(item.id)) {
      repository.archiveNotification(item.id);
    }
  }
}

function syncBrowserApprovalNotifications(repository: WorkspaceRepository, project?: WorkspaceProjectState) {
  const projects = project ? [project] : repository.loadWorkspace().projects;
  const activeIds = new Set<string>();
  for (const currentProject of projects) {
    for (const run of [currentProject.activeRun, currentProject.lastRun]) {
      if (!run) {
        continue;
      }

      for (const session of run.browserSessions ?? []) {
        for (const activity of session.activities) {
          const approval = activity.approval;
          if (!approval || (approval.status !== "pending" && approval.status !== "deferred")) {
            continue;
          }

          const notification = createBrowserApprovalNotification(
            currentProject.id,
            run.threadId,
            run.id,
            session.id,
            activity.toolCallId,
            approval.label,
            approval.inputSummary
          );
          activeIds.add(notification.id);
          repository.saveNotification(notification);
        }
      }
    }
  }

  if (!project) {
    for (const item of repository.loadNotificationInboxState().items) {
      if (item.kind !== "browser-approval") {
        continue;
      }

      if (!activeIds.has(item.id)) {
        repository.archiveNotification(item.id);
      }
    }
  }
}

function saveBackgroundRunStatusNotification(repository: WorkspaceRepository, run: BackgroundJobRun) {
  const job = repository.getBackgroundJob(run.jobId);
  if (!job) {
    return;
  }

  const notification = createBackgroundRunStatusNotification(job, run);
  if (!notification) {
    return;
  }

  repository.saveNotification(notification);
}

function archiveNotificationWithLegacyId(repository: WorkspaceRepository, parts: readonly string[]) {
  const id = createStableBoundedId(parts);
  const legacyId = createLegacyTruncatedId(parts);
  repository.archiveNotification(id);
  if (legacyId !== id) {
    repository.archiveNotification(legacyId);
  }
}

function createPlanningQuestionNotification(
  projectId: string,
  threadId: string,
  runId: string,
  question: PlanningQuestion
): PlanningQuestionNotification {
  return {
    id: createPlanningQuestionNotificationId(runId, question.id),
    kind: "planning-question",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId,
    threadId,
    runId,
    questionId: question.id,
    prompt: question.prompt,
    placeholder: question.placeholder,
    responseKind: question.responseKind,
    choices: question.choices
  };
}

function createPlanningQuestionBatchNotification(
  projectId: string,
  threadId: string,
  runId: string,
  questions: PlanningQuestion[]
): PlanningQuestionBatchNotification {
  return {
    id: createPlanningQuestionBatchNotificationId(runId, questions.map((question) => question.id)),
    kind: "planning-question-batch",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId,
    threadId,
    runId,
    questions: questions.slice(0, 5).map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      placeholder: question.placeholder,
      responseKind: question.responseKind,
      choices: question.choices
    }))
  };
}

function createPlanningQuestionNotificationId(runId: string, questionId: string) {
  return createStableBoundedId(["planning-question", runId, questionId]);
}

function createPlanningQuestionBatchNotificationId(runId: string, questionIds: string[]) {
  return createStableBoundedId(["planning-question-batch", runId, ...questionIds]);
}

function createAssistantQuestionNotification(question: AssistantQuestion): AssistantQuestionNotification {
  return {
    id: createAssistantQuestionNotificationId(question.assistantId, question.id),
    kind: "assistant-question",
    interactive: true,
    createdAt: question.askedAt,
    assistantId: question.assistantId,
    questionId: question.id,
    prompt: question.prompt,
    answerText: question.answerText
  };
}

function createAssistantQuestionBatchNotification(questions: AssistantQuestion[]): AssistantQuestionBatchNotification {
  const assistantId = questions[0]!.assistantId;
  return {
    id: createAssistantQuestionBatchNotificationId(assistantId, questions.map((question) => question.id)),
    kind: "assistant-question-batch",
    interactive: true,
    createdAt: questions[0]!.askedAt,
    assistantId,
    questions: questions.slice(0, 5).map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      answerText: question.answerText
    }))
  };
}

function createAssistantQuestionNotificationId(assistantId: string, questionId: string) {
  return createStableBoundedId(["assistant-question", assistantId, questionId]);
}

function createAssistantQuestionBatchNotificationId(assistantId: string, questionIds: string[]) {
  return createStableBoundedId(["assistant-question-batch", assistantId, ...questionIds]);
}

function createBrowserApprovalNotification(
  projectId: string,
  threadId: string,
  runId: string,
  sessionId: string,
  toolCallId: string,
  label: string,
  inputSummary?: string
): BrowserApprovalNotification {
  return {
    id: createBrowserApprovalNotificationId(projectId, runId, sessionId, toolCallId),
    kind: "browser-approval",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId,
    threadId,
    runId,
    sessionId,
    toolCallId,
    label,
    inputSummary
  };
}

function createBrowserApprovalNotificationId(projectId: string, runId: string, sessionId: string, toolCallId: string) {
  return createStableBoundedId(["browser-approval", projectId, runId, sessionId, toolCallId]);
}

function createBackgroundRunStatusNotification(job: BackgroundJob, run: BackgroundJobRun): BackgroundRunStatusNotification | undefined {
  const statusMeta = backgroundRunNotificationMeta(run.status);
  if (!statusMeta) {
    return undefined;
  }
  const summary =
    sanitizeBackgroundNotificationSummary(run.summary) ??
    sanitizeBackgroundNotificationSummary(run.failureMessage) ??
    `${job.name} ${statusMeta.fallbackVerb}`;

  return {
    id: createBackgroundRunStatusNotificationId(run.id),
    kind: "background-run-status",
    interactive: false,
    createdAt: run.updatedAt,
    backgroundRunId: run.id,
    jobId: run.jobId,
    projectId: run.projectId,
    threadId: run.automationThreadId,
    title: statusMeta.title,
    summary,
    severity: statusMeta.severity
  };
}

function createBackgroundRunStatusNotificationId(runId: string) {
  return createStableBoundedId(["background-run-status", runId]);
}

function sanitizeBackgroundNotificationSummary(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }
  if (/# IDENTITY:|# OPERATIONAL LOGIC \(The Job\)|# ACTIVE MISSION \(The Request\)/i.test(value)) {
    return undefined;
  }
  const sanitized = value.replace(/\/caveman\s+ultra/gi, "").replace(/\s+/g, " ").trim();
  return sanitized || undefined;
}

function backgroundRunNotificationMeta(
  status: BackgroundJobRun["status"]
): { title: string; severity: NotificationSeverity; fallbackVerb: string } | undefined {
  switch (status) {
    case "running":
      return { title: "Background task started", severity: "info", fallbackVerb: "started" };
    case "awaiting-user-input":
      return { title: "Background task needs input", severity: "warning", fallbackVerb: "needs input" };
    case "succeeded":
      return { title: "Background task done", severity: "info", fallbackVerb: "finished" };
    case "failed":
      return { title: "Background task failed", severity: "error", fallbackVerb: "failed" };
    case "cancelled":
      return { title: "Background task cancelled", severity: "warning", fallbackVerb: "cancelled" };
    default:
      return undefined;
  }
}

async function launchBackgroundJobRun(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  repository: WorkspaceRepository,
  runtimeRegistry: AgentRuntimeRegistry,
  runtime: WorkspaceRuntimeStore,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  assistantManager: AssistantManager,
  backgroundRunId: string
) {
  if (backgroundRunControllers.has(backgroundRunId)) {
    return;
  }

  if (repository.getGlobalExecutionPaused()) {
    return;
  }

  const run = repository.getBackgroundJobRun(backgroundRunId);
  if (!run || run.status !== "queued") {
    return;
  }

  const job = repository.getBackgroundJob(run.jobId);
  if (!job) {
    const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
      failureMessage: "Background job definition no longer exists.",
      failureCategory: "launch-failure"
    });
    syncBackgroundJobFailureTracking(repository, failedRun);
    saveBackgroundRunStatusNotification(repository, failedRun);
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    await emitBackgroundJobRunUpdatedToAll(connections, failedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    return;
  }

  if (job.assistantId) {
    try {
      assertAssistantRunnableForLaunch(repository, job.assistantId);
    } catch (error) {
      const cancelledRun = repository.setBackgroundJobRunStatus(backgroundRunId, "cancelled", {
        failureMessage: error instanceof Error ? error.message : "Assistant is not runnable",
        failureCategory: "launch-failure"
      });
      repository.updateBackgroundJobSchedulerState(job.id, {
        schedulerStatus: "blocked",
        schedulerDetail: cancelledRun.failureMessage,
        blockedReason: cancelledRun.failureMessage,
        lastSchedulerCheckAt: new Date().toISOString()
      });
      saveBackgroundRunStatusNotification(repository, cancelledRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      await emitBackgroundJobRunUpdatedToAll(connections, cancelledRun);
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
      return;
    }
  }

  const abortController = new AbortController();
  const controllerInstanceId = crypto.randomUUID();
  const controllerLeaseId = crypto.randomUUID();
  const controllerLeaseExpiresAt = new Date(Date.now() + BACKGROUND_RUN_CONTROLLER_LEASE_MS).toISOString();
  const control: BackgroundRunControl = { abortController, controllerInstanceId, controllerLeaseId };
  backgroundRunControllers.set(backgroundRunId, control);
  try {
    const startedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "running", {
      controllerInstanceId,
      controllerLeaseId,
      controllerLeaseExpiresAt
    });
    control.renewTimer = setInterval(() => {
      const persistedRun = repository.renewBackgroundJobRunLease(
        backgroundRunId,
        controllerLeaseId,
        new Date(Date.now() + BACKGROUND_RUN_CONTROLLER_LEASE_MS).toISOString()
      );
      if (!persistedRun || persistedRun.status !== "running") {
        disposeBackgroundRunControl(control);
        backgroundRunControllers.delete(backgroundRunId);
      }
    }, BACKGROUND_RUN_CONTROLLER_RENEW_MS);
    saveBackgroundRunStatusNotification(repository, startedRun);
    await emitBackgroundJobRunUpdatedToAll(connections, startedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    const assistant = job.assistantId ? repository.getAssistant(job.assistantId) : undefined;
    const agentRuntime = assistant
      ? runtimeRegistry.get(assistant.agentId)
      : resolveProjectAgentRuntime(runtimeRegistry, repository.getProject(job.projectId));
    const agentCapability = agentRuntime.getCapability() ?? (await agentRuntime.refreshCapability());
    assertRuntimeAvailable(agentRuntime, agentCapability);
    const providerBrand = assistant?.providerBrand ?? repository.getProviderBrand();
    const project = repository.getProject(job.projectId);
    const requestedModelId =
      job.definition.kind === "ai-routine" ? job.definition.executionModelId ?? assistant?.executionModelId : undefined;
    const resolvedExecutionModelId =
      job.definition.kind === "ai-routine"
        ? resolveExecutionModelIdForRuntime({
          runtime: agentRuntime,
          capability: agentCapability,
          providerBrand,
          requestedModelId,
          persistedModelId: project.session.executionModelId
        }).modelId
        : agentRuntime.getDefaultExecutionModelId(providerBrand);
    const nextRun = await executeBackgroundJobRun({
      repository,
      adapter: agentRuntime.getAdapter(),
      agentId: agentRuntime.id,
      job,
      run,
      providerBrand,
      planningModelId: agentRuntime.getDefaultPlanningModelId(providerBrand),
      executionModelId: resolvedExecutionModelId,
      debugEnabled: repository.getDebugEnabledDefault(),
      abortSignal: abortController.signal,
      onRunUpdated(updatedRun) {
        void emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      }
    });
    if (job.assistantId) {
      const assistantOutcome = await assistantManager.handleBackgroundJobRunOutcome({
        assistantId: job.assistantId,
        status:
          nextRun.status === "succeeded"
            ? "succeeded"
            : nextRun.status === "awaiting-user-input"
              ? "awaiting-user-input"
              : "failed",
        summary: nextRun.summary,
        failureMessage: nextRun.failureMessage
      });
      if (nextRun.status === "awaiting-user-input" && assistantOutcome?.blocked === false) {
        await finalizeAutoResolvedAssistantQuestionRun(repository, connections, nextRun);
        return;
      }
    }
    saveBackgroundRunStatusNotification(repository, nextRun);
    syncBackgroundJobFailureTracking(repository, nextRun);
    repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: nextRun.status === "succeeded" || nextRun.status === "skipped" ? "idle" : "blocked",
      schedulerDetail: nextRun.summary ?? nextRun.failureMessage ?? `${job.name} ${nextRun.status}`,
      blockedReason:
        nextRun.status === "succeeded" || nextRun.status === "skipped"
          ? undefined
          : nextRun.failureMessage ?? nextRun.summary ?? `${job.name} ${nextRun.status}`,
      consecutiveFailureCount:
        nextRun.status === "succeeded" || nextRun.status === "skipped"
          ? 0
          : repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
      backoffUntil: repository.getBackgroundJob(job.id)?.backoffUntil,
      lastFailureCategory: repository.getBackgroundJob(job.id)?.lastFailureCategory,
      lastSchedulerCheckAt: new Date().toISOString()
    });
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    await emitBackgroundJobRunUpdatedToAll(connections, nextRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
  } catch (error) {
    const currentRun = repository.getBackgroundJobRun(backgroundRunId);
    if (!currentRun || !["queued", "awaiting-approval", "awaiting-user-input", "running"].includes(currentRun.status)) {
      return;
    }
    const failureMessage = error instanceof Error ? error.message : "Unknown background job failure";
    if (job.assistantId) {
      const waitingRun = tryMarkAssistantQuestionRunWaiting(repository, backgroundRunId, failureMessage);
      if (waitingRun) {
        const assistantOutcome = await assistantManager.handleBackgroundJobRunOutcome({
          assistantId: job.assistantId,
          status: "awaiting-user-input",
          summary: failureMessage
        });
        if (assistantOutcome?.blocked === false) {
          await finalizeAutoResolvedAssistantQuestionRun(repository, connections, waitingRun);
          return;
        }
        saveBackgroundRunStatusNotification(repository, waitingRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
        await emitBackgroundJobRunUpdatedToAll(connections, waitingRun);
        emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
        return;
      }
    }

    const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
      failureMessage,
      failureCategory: classifyRunFailure({ message: failureMessage })
    });
    repository.appendBackgroundJobRunEvent(backgroundRunId, "failed", "Background run failed", failureMessage);
    syncBackgroundJobFailureTracking(repository, failedRun);
    saveBackgroundRunStatusNotification(repository, failedRun);
    repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: failureMessage,
      blockedReason: failureMessage,
      consecutiveFailureCount: repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
      backoffUntil: repository.getBackgroundJob(job.id)?.backoffUntil,
      lastFailureCategory: repository.getBackgroundJob(job.id)?.lastFailureCategory,
      lastSchedulerCheckAt: new Date().toISOString()
    });
    if (job.assistantId) {
      await assistantManager.handleBackgroundJobRunOutcome({
        assistantId: job.assistantId,
        status: "failed",
        failureMessage
      });
    }
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    await emitBackgroundJobRunUpdatedToAll(connections, failedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
  } finally {
    disposeBackgroundRunControl(control);
    backgroundRunControllers.delete(backgroundRunId);
  }
}

function tryMarkAssistantQuestionRunWaiting(repository: WorkspaceRepository, backgroundRunId: string, message: string) {
  const prompt = extractAssistantQuestionPrompt(message);
  if (!prompt) {
    return undefined;
  }

  repository.appendBackgroundJobRunEvent(backgroundRunId, "awaiting-user-input", "Waiting for user input", prompt);
  return repository.setBackgroundJobRunStatus(backgroundRunId, "awaiting-user-input", {
    summary: prompt
  });
}

function extractAssistantQuestionPrompt(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 1200 || !normalized.includes("?")) {
    return undefined;
  }

  const directQuestion = normalized.match(
    /\b(?:what|which|who|when|where|why|how|should|could|would|can|do|does|did|is|are|was|were)\b[^?]*\?/i
  )?.[0];
  return directQuestion?.trim();
}

function isExecutionModelIdAvailableForRuntime(
  agentId: "pi" | "copilot-cli" | "codex-cli",
  capability:
    | {
      discoveredModels: string[];
      activeModel?: string;
    }
    | undefined,
  modelId: string | undefined,
  providerBrand: ProviderBrand
) {
  if (!modelId) {
    return false;
  }

  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    return capability?.activeModel === modelId || capability?.discoveredModels.includes(modelId) || false;
  }

  const effectiveProviderBrand = agentId === "pi" ? providerBrand : "gpt";
  return effectiveProviderBrand === "gemini" ? modelId.startsWith("google/") : modelId.startsWith("openai/");
}

function resolveExecutionModelIdForRuntime(input: {
  runtime: AgentRuntime;
  capability?:
  | {
    discoveredModels: string[];
    activeModel?: string;
  }
  | undefined;
  providerBrand: ProviderBrand;
  requestedModelId?: string;
  persistedModelId?: string;
}) {
  const capability = input.capability ?? input.runtime.getCapability();
  const requestedModelId = isExecutionModelIdAvailableForRuntime(
    input.runtime.id,
    capability,
    input.requestedModelId,
    input.providerBrand
  )
    ? input.requestedModelId
    : undefined;
  const persistedModelId = isExecutionModelIdAvailableForRuntime(
    input.runtime.id,
    capability,
    input.persistedModelId,
    input.providerBrand
  )
    ? input.persistedModelId
    : undefined;

  return {
    modelId: requestedModelId ?? persistedModelId ?? input.runtime.getDefaultExecutionModelId(input.providerBrand),
    requestedModelRejected:
      input.requestedModelId && requestedModelId !== input.requestedModelId ? input.requestedModelId : undefined
  };
}
