import { createUiAssetManager } from "./ui-build";
import { defaultAgentCatalog } from "../../shared/agent-catalog";
import { defaultProviderCapabilities } from "../../shared/capabilities";
import { resolveModeById, resolveModeCatalog } from "../../shared/modes";
import { detectAutoMode, isDirectWorkspaceImplementTask } from "../../shared/mode-intent";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRouteHandler } from "uploadthing/server";
import {
  createAssistantAssetRefId,
  createAssistantId,
  createChatMessage,
  createRequestId,
  createAssistantTodoId,
  type AgentPlan,
  type AgentTrace,
  type Assistant,
  type AssistantTodo,
  type BackgroundJob,
  type BackgroundJobRun,
  type BackgroundJobRunStatus,
  type BackgroundJobSchedule,
  type BackgroundJobsState,
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
  type AssistantQuestionNotification,
  type BackgroundRunStatusNotification,
  type BrowserApprovalNotification,
  type ClientCommand,
  type PlanningQuestion,
  type PlanningQuestionNotification,
  type PlannerReadyTurn,
  type PreferencesState,
  type ProjectContextUsage,
  type ProjectId,
  type ServerEvent,
  type SetupLaunchMode,
  type SetupState,
  type WorkspaceRuleSource,
  type WorkspaceProjectState
} from "../../shared/protocol";
import { AssistantManager } from "./assistant-manager";
import { executeBackgroundJobRun } from "./background-job-executor";
import { previewBackgroundJobSchedule } from "./background-job-schedule";
import { BackgroundJobScheduler } from "./background-job-scheduler";
import { BranchfsManager, type BranchfsExperimentLease } from "./branchfs-manager";
import { pickProjectFolder } from "./folder-picker";
import {
  type ManagedExecutionState,
  type ManagedRefreshAction
} from "./execution-runtime";
import { runGitPreflight } from "./git-preflight";
import { debugLog } from "./logging";
import { extractRunMemories, retrieveMemorySummaries } from "./memory-bank";
import { runManagedAgentExecution } from "./managed-agent-execution";
import { PiSdkAgentAdapter, type PiAgentAdapter, type PiAgentExecutionEvent } from "./pi-agent-adapter";
import { searchProjectFolders } from "./project-search-service";
import type { AgentRuntime } from "./agent-runtimes/agent-runtime";
import { CliSessionManager } from "./agent-runtimes/cli-session-manager";
import { CopilotCliRuntime } from "./agent-runtimes/copilot-cli-runtime";
import { CodexCliRuntime } from "./agent-runtimes/codex-cli-runtime";
import { PiRuntime } from "./agent-runtimes/pi-runtime";
import { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import {
  aggregateSubagentResults,
  buildExecutionPlan,
  executeReadyRun,
  executionPlanToTasks,
  resolveExecutionPlanGateMode,
  runPlannerTurn
} from "./pi-orchestrator";
import { getDefaultExecutionModelId, getDefaultPlanningModelId, getDefaultSubagentModelId } from "./pi-planner";
import type { SubagentResult } from "./pi-subagents";
import { WorkspaceRepository } from "./workspace-repository";
import { WorkspaceRuntimeStore } from "./workspace-runtime-store";
import { harnessUploadRouter } from "./uploadthing-router";
import { buildSetupState, detectSetupLaunchMode } from "./setup-health";
import {
  findPendingBrowserApproval,
  recordBrowserToolEnd,
  recordBrowserToolStart,
  recordBrowserToolUpdate,
  requestBrowserApproval as requestBrowserApprovalState,
  resolveBrowserApproval
} from "./browser-session-state";
import { type StartupPhaseId, type StartupTelemetrySink } from "./startup-telemetry";

type HarnessConnection = {
  clientId: string;
  kind: "control" | "pty";
  sessionId?: string;
};

type HarnessServerOptions = {
  port: number;
  adapter?: PiAgentAdapter;
  repository?: WorkspaceRepository;
  pickFolder?: typeof pickProjectFolder;
  serverOnly?: boolean;
  openBrowser?: boolean;
  launchMode?: SetupLaunchMode;
  startupTelemetry?: StartupTelemetrySink;
  uiAssetManagerFactory?: typeof createUiAssetManager;
};

type ProjectLike = Pick<WorkspaceProjectState, "id" | "rootPath" | "activeThreadId" | "session" | "activeRun" | "lastRun">;

type PendingBrowserApproval = {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
};

type BackgroundRunControl = {
  abortController: AbortController;
};

const LOG_COMMAND_ERRORS = process.env.NODE_ENV !== "production";

export async function startHarnessServer({
  port,
  adapter = new PiSdkAgentAdapter(),
  repository: providedRepository,
  pickFolder = pickProjectFolder,
  serverOnly = false,
  openBrowser = false,
  launchMode = detectSetupLaunchMode(),
  startupTelemetry,
  uiAssetManagerFactory = createUiAssetManager
}: HarnessServerOptions) {
  const pendingBrowserApprovals = new Map<string, PendingBrowserApproval>();
  const backgroundRunControllers = new Map<string, BackgroundRunControl>();
  const connections = new Set<Bun.ServerWebSocket<HarnessConnection>>();
  const uploadthingHandler = createRouteHandler({
    router: harnessUploadRouter
  });
  const { runtimeRegistry, uiAssets } = await runStartupPhase(
    startupTelemetry,
    "bootstrap",
    "initializing startup services",
    "startup services ready",
    async () => ({
      runtimeRegistry: new AgentRuntimeRegistry([new PiRuntime(adapter), new CopilotCliRuntime(), new CodexCliRuntime()]),
      uiAssets: serverOnly ? undefined : uiAssetManagerFactory()
    })
  );
  const { repository, runtime } = await runStartupPhase(
    startupTelemetry,
    "workspace",
    "loading workspace state",
    "workspace state ready",
    async () => {
      const repository = providedRepository ?? new WorkspaceRepository(Bun.env.HARNESS_DB_PATH);
      const runtime = new WorkspaceRuntimeStore(repository.loadWorkspace());
      const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
      const storedGoogleApiKey = repository.getStoredGoogleApiKey();

      if (storedOpenAiApiKey) {
        adapter.setApiKey("openai", storedOpenAiApiKey);
      }

      if (storedGoogleApiKey) {
        adapter.setApiKey("google", storedGoogleApiKey);
      }
      applyAdapterAutoCompactionThreshold(adapter, repository.getAutoCompactContextThresholdPercentDefault());

      return {
        repository,
        runtime
      };
    }
  );
  await runStartupPhase(
    startupTelemetry,
    "runtimes",
    "refreshing runtime capabilities",
    "runtime capabilities ready",
    async () => runtimeRegistry.refreshAll()
  );
  const getCurrentPreferencesState = () => getPreferencesState(repository, adapter, runtimeRegistry);
  const buildCurrentSetupState = () =>
    buildSetupState({
      workspace: runtime.getWorkspace(),
      preferences: getCurrentPreferencesState(),
      launchMode
    });
  let currentSetupState: SetupState;
  const { assistantManager, cliSessionManager, scheduler } = await runStartupPhase(
    startupTelemetry,
    "setup",
    "building setup state and startup managers",
    "startup managers ready",
    async () => {
      currentSetupState = await buildCurrentSetupState();
      const assistantManager = new AssistantManager(repository, runtimeRegistry, {
        onAssistantsUpdated() {
          syncAssistantQuestionNotifications(repository);
          emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
          emitNotificationsUpdatedToAll(connections, `assistant:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
          emitExecutionControlUpdatedToAll(connections, `assistant:auto:${crypto.randomUUID()}`, repository.getExecutionControlState());
        },
        onAssistantChatDelta(input) {
          emitAssistantChatDeltaToAll(connections, input);
        },
        onAssistantChatComplete(input) {
          emitAssistantChatCompleteToAll(connections, input);
        },
        onAssistantLogAppended(entry) {
          emitAssistantLogAppendedToAll(connections, entry);
        },
        onAssistantCreatedCard(assistant) {
          emitAssistantCreatedCardToAll(connections, assistant);
        }
      });
      syncAssistantQuestionNotifications(repository);
      syncBrowserApprovalNotifications(repository);
      for (const run of repository.loadBackgroundJobsState().runs) {
        saveBackgroundRunStatusNotification(repository, run);
      }

      const cliSessionManager = new CliSessionManager({
        runtimeStore: runtime,
        onSessionStarted({ requestId, projectId, threadId, session }) {
          emitCliSessionStartedToAll(connections, {
            requestId,
            projectId,
            threadId,
            session
          });
        },
        onSessionUpdated({ requestId, projectId, threadId, session }) {
          emitCliSessionUpdatedToAll(connections, {
            requestId,
            projectId,
            threadId,
            session
          });
        },
        onSessionExited({ requestId, projectId, threadId, session }) {
          emitCliSessionExitedToAll(connections, {
            requestId,
            projectId,
            threadId,
            session
          });
        },
        onAttachReady({ requestId, projectId, threadId, sessionId, attachToken }) {
          emitCliSessionAttachReadyToAll(connections, {
            requestId,
            projectId,
            threadId,
            sessionId,
            attachToken
          });
        }
      });

      const scheduler = new BackgroundJobScheduler({
        repository,
        onRunQueued(run, job) {
          emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
          void emitBackgroundJobRunUpdatedToAll(connections, run);
          if (run.status === "queued") {
            return launchBackgroundJobRun(connections, repository, adapter, runtime, backgroundRunControllers, assistantManager, run.id);
          }
        }
      });

      return {
        assistantManager,
        cliSessionManager,
        scheduler
      };
    }
  );

  if (uiAssets) {
    await runStartupPhase(
      startupTelemetry,
      "ui-assets",
      "building and watching ui assets",
      "ui assets ready",
      async () => {
        await uiAssets.ensureBuilt();
        uiAssets.startWatching();
      }
    );
  }

  startupTelemetry?.phaseStart("serve", "starting Bun server listeners");
  const server = Bun.serve<HarnessConnection>({
    port,
    fetch(request, serverInstance) {
      const url = new URL(request.url);

      if (url.pathname === "/api/uploadthing") {
        return uploadthingHandler(request);
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

        const attachRecord = cliSessionManager.consumeAttachToken(token, clientId);
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

      if (serverOnly) {
        return new Response("Harness CLI websocket endpoint", { status: 200 });
      }

      const assetPath = uiAssets?.resolveAsset(url.pathname);
      if (assetPath) {
        return new Response(Bun.file(assetPath));
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        connections.add(ws);
        if (ws.data.kind === "pty" && ws.data.sessionId) {
          cliSessionManager.attachSocket({
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
            workspace: runtime.getWorkspace(),
            executionControl: repository.getExecutionControlState(),
            preferences: getCurrentPreferencesState(),
            setup: currentSetupState,
            backgroundJobs: repository.loadBackgroundJobsState(),
            assistants: repository.loadAssistantsState(),
            notifications: repository.loadNotificationInboxState()
          }
        });
      },
      close(ws) {
        connections.delete(ws);
        if (ws.data.kind === "pty" && ws.data.sessionId) {
          cliSessionManager.detachSocket(ws.data.sessionId);
        }
      },
      message(ws, message) {
        if (ws.data.kind === "pty") {
          if (typeof message === "string" || !ws.data.sessionId) {
            return;
          }

          void cliSessionManager.writeToSession(
            ws.data.sessionId,
            message instanceof Uint8Array ? message : new Uint8Array(message)
          );
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
          runtime,
          repository,
          adapter,
          runtimeRegistry,
          assistantManager,
          cliSessionManager,
          pickFolder,
          getCurrentPreferencesState,
          async (requestId) => {
            currentSetupState = await buildCurrentSetupState();
            emitSetupUpdatedToAll(connections, requestId, currentSetupState);
            return currentSetupState;
          },
          pendingBrowserApprovals,
          connections,
          backgroundRunControllers,
          scheduler
        ).catch((error) => {
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
  });

  const stop = server.stop.bind(server);
  server.stop = ((closeActiveConnections?: boolean) => {
    uiAssets?.dispose();
    scheduler.stop();
    return stop(closeActiveConnections);
  }) as typeof server.stop;

  scheduler.start();
  const serverUrl = `http://localhost:${server.port}`;
  console.log(`Harness server listening on ${serverUrl}`);
  startupTelemetry?.phaseComplete("server listeners ready", {
    port: server.port,
    serverUrl
  });
  startupTelemetry?.complete(`Harness server listening on ${serverUrl}`, {
    port: server.port,
    serverUrl
  });
  if (openBrowser && !serverOnly) {
    void openHarnessBrowser(serverUrl);
  }
  return server;
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
  scheduler: BackgroundJobScheduler
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
      if (project.session.isStreaming) {
        throw new Error("Project is streaming");
      }

      const { activeProjectId } = repository.removeProject(command.payload.projectId);
      runtime.removeProject(command.payload.projectId, activeProjectId);
      sendEvent(ws, {
        type: "project.removed",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          activeProjectId
        }
      });
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
      sendEvent(ws, {
        type: "project.search.results",
        requestId: command.requestId,
        payload: {
          query: command.payload.query,
          results: searchProjectFolders({
            query: command.payload.query,
            workspaceProjectPaths: runtime.getWorkspace().projects.map((project) => project.rootPath)
          })
        }
      });
      return;
    }
    case "thread.create": {
      const project = runtime.getProject(command.payload.projectId);
      if (project.session.isStreaming) {
        throw new Error("Project is streaming");
      }

      const nextProject = repository.createThread(command.payload.projectId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId);
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
      const project = runtime.getProject(command.payload.projectId);
      if (project.session.isStreaming) {
        throw new Error("Project is streaming");
      }

      const nextProject = repository.activateThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId);
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
      const project = runtime.getProject(command.payload.projectId);
      if (project.session.isStreaming) {
        throw new Error("Project is streaming");
      }

      const nextProject = repository.forkThread(command.payload.projectId, command.payload.sourceThreadId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId);
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
      const project = runtime.getProject(command.payload.projectId);
      if (project.session.isStreaming) {
        throw new Error("Project is streaming");
      }

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
    case "session.reset": {
      const activeProject = runtime.getProject(command.payload.projectId);
      if (activeProject.session.isStreaming) {
        throw new Error("Project is streaming");
      }

      const project = repository.resetProject(command.payload.projectId);
      runtime.upsertPersistedProject(project);
      runtime.clearProjectTransients(command.payload.projectId);

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
      const project = runtime.getProject(command.payload.projectId);
      assertActiveThread(project, command.payload.threadId);
      const activeRun = project.activeRun;
      runtime.getAbortController(command.payload.projectId)?.abort();
      runtime.setProjectStreaming(command.payload.projectId, false);
      runtime.clearStreaming(command.payload.projectId);
      runtime.setProjectError(command.payload.projectId, "Chat request stopped by user");

      if (activeRun) {
        rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, command.payload.projectId, activeRun.id, "Run stopped");
        const stoppedProject = repository.setAgentRunStatus(command.payload.projectId, activeRun.id, "stopped");
        runtime.upsertPersistedProject(stoppedProject);
        emitRunUpdated(ws, command.requestId, runtime.getProject(command.payload.projectId));
      }

      sendEvent(ws, {
        type: "chat.error",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: project.activeThreadId,
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
      assertProjectCanStartRun(project);
      assertRuntimeAvailable(agentRuntime, agentCapability);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);
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
      runtime.clearProjectTransients(projectId);
      runtime.setProjectSelectedAgentId(projectId, command.payload.agentId);

      const resolvedModes = resolveModeCatalog(runtime.getWorkspace().workspaceModes, project.projectModes);
      const detectedMode = detectAutoMode(command.payload.content, resolvedModes);
      const effectiveModeId = detectedMode?.modeId ?? command.payload.modeId ?? project.selectedModeId;
      const effectiveMode = resolveModeById(effectiveModeId, runtime.getWorkspace().workspaceModes, project.projectModes);

      if (effectiveModeId && effectiveModeId !== project.selectedModeId) {
        const modeProject = repository.setProjectSelectedMode(projectId, effectiveModeId);
        runtime.upsertPersistedProject(modeProject);
        emitProjectUpdated(ws, command.requestId, projectId, modeProject);
      }

      const userMessageProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments: command.payload.attachments
      });
      runtime.upsertPersistedProject(userMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, projectId);

      const runProject = repository.createAgentRun(
        projectId,
        command.payload.content,
        agentRuntime.getDefaultPlanningModelId(providerBrand),
        command.payload.threadId
      );
      runtime.upsertPersistedProject(runProject);
      emitRunUpdated(ws, command.requestId, runProject);

      runtime.setProjectExecutionModel(projectId, effectiveExecutionModelId);
      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);
      const quickTaskBypassEligible =
        (command.payload.attachments?.length ?? 0) === 0 &&
        effectiveMode?.toolPolicy === "full-access" &&
        isDirectWorkspaceImplementTask(command.payload.content);
      if (resolvedExecutionModel.requestedModelRejected) {
        appendSystemStatus(
          ws,
          command.requestId,
          runtime,
          repository,
          projectId,
          `${agentRuntime.label} does not support ${resolvedExecutionModel.requestedModelRejected} here. Using ${effectiveExecutionModelId}.`
        );
      }

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        if (quickTaskBypassEligible) {
          await continueQuickTaskLifecycle(ws, command.requestId, runtime, repository, projectId, {
            agentId: agentRuntime.id,
            providerBrand,
            runId: runProject.activeRun?.id,
            executionModelId: effectiveExecutionModelId,
            latestUserPrompt: command.payload.content,
            mode: effectiveMode,
            threadId: command.payload.threadId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode
          });
          return;
        }

        await continueRunLifecycle(ws, command.requestId, runtime, repository, agentRuntime.getAdapter(), pendingBrowserApprovals, connections, {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled,
          executionModelId: effectiveExecutionModelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, pendingBrowserApprovals, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
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
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);
      const providerBrand = repository.getProviderBrand();
      const executionModelId = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentRuntime.getCapability(),
        providerBrand,
        requestedModelId: activeRun.executionModelId
      }).modelId;
      const debugEnabled = repository.getDebugEnabledDefault();

      const refinedMessageProject = repository.appendMessage(projectId, "user", command.payload.content, command.payload.threadId);
      runtime.upsertPersistedProject(refinedMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, projectId);

      repository.setAgentRunStatus(projectId, activeRun.id, "stopped", "Plan refined before execution");
      runtime.clearProjectTransients(projectId);

      const runProject = repository.createAgentRun(
        projectId,
        command.payload.content,
        agentRuntime.getDefaultPlanningModelId(providerBrand),
        command.payload.threadId
      );
      runtime.upsertPersistedProject(runProject);
      emitRunUpdated(ws, command.requestId, runProject);
      runtime.setProjectExecutionModel(projectId, executionModelId);
      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, agentRuntime.getAdapter(), pendingBrowserApprovals, connections, {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled,
          executionModelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, pendingBrowserApprovals, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "planning.answer": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      const activeRun = requireActiveRun(project, command.payload.runId);
      const pendingQuestion = activeRun.questions.find(
        (question) =>
          question.id === command.payload.questionId &&
          (question.status === "pending" || question.status === "deferred")
      );
      if (!pendingQuestion) {
        throw new Error("Planning question is not answerable");
      }

      const providerBrand = repository.getProviderBrand();
      const answerProject = repository.appendMessage(projectId, "user", command.payload.content, command.payload.threadId);
      runtime.upsertPersistedProject(answerProject);
      emitMessageAppended(ws, command.requestId, runtime, projectId);

      const answeredProject = repository.answerPlanningQuestion(
        projectId,
        activeRun.id,
        command.payload.questionId,
        command.payload.content
      );
      runtime.upsertPersistedProject(answeredProject);
      emitRunUpdated(ws, command.requestId, answeredProject);
      repository.archiveNotification(createPlanningQuestionNotificationId(activeRun.id, command.payload.questionId));
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());

      const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(activeRun.id);
      if (linkedBackgroundRun?.status === "awaiting-user-input") {
        const resumedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "running", {
          summary: "Resuming after user input"
        });
        saveBackgroundRunStatusNotification(repository, resumedBackgroundRun);
        await emitBackgroundJobRunUpdatedToAll(connections, resumedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
        emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      }

      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, agentRuntime.getAdapter(), pendingBrowserApprovals, connections, {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          executionModelId: resolveExecutionModelIdForRuntime({
            runtime: agentRuntime,
            capability: agentRuntime.getCapability(),
            providerBrand,
            requestedModelId: project.session.executionModelId
          }).modelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, pendingBrowserApprovals, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.execute": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      const activeRun = requireActiveRun(project, command.payload.runId);
      if (activeRun.status !== "ready") {
        throw new Error(`Run status ${activeRun.status} is not executable`);
      }
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);

      const providerBrand = repository.getProviderBrand();
      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        await executeRunLifecycle(ws, command.requestId, runtime, repository, agentRuntime.getAdapter(), pendingBrowserApprovals, connections, {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          runId: activeRun.id,
          readyPlan: buildReadyPlanFromRun(activeRun),
          executionPlan: activeRun.plan,
          executionTarget: command.payload.target ?? activeRun.executionTarget ?? "current-project",
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, pendingBrowserApprovals, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "experiment.inspect": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      const manager = new BranchfsManager({ rootPath: project.rootPath, runId: run.id });
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
      const manager = new BranchfsManager({ rootPath: project.rootPath, runId: run.id });
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
      const manager = new BranchfsManager({ rootPath: project.rootPath, runId: run.id });
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
    case "run.resume": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      const activeRun = requireActiveRun(project, command.payload.runId);
      if (!activeRun.resumable) {
        throw new Error("Run is not resumable");
      }
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);

      const providerBrand = repository.getProviderBrand();
      if (command.payload.guidanceText?.trim()) {
        const guidanceProject = repository.appendMessage(projectId, "user", command.payload.guidanceText, command.payload.threadId);
        runtime.upsertPersistedProject(guidanceProject);
        emitMessageAppended(ws, command.requestId, runtime, projectId);
      }

      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        await resumeRunLifecycle(
          ws,
          command.requestId,
          runtime,
          repository,
          agentRuntime.getAdapter(),
          pendingBrowserApprovals,
          connections,
          {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          runId: activeRun.id,
          abortSignal: abortController.signal,
          guidanceText: command.payload.guidanceText,
          subagentIds: command.payload.subagentIds,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode
          }
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, pendingBrowserApprovals, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.retry": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRetry(project, command.payload.runId);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);

      const retryRun = requireRetryableRun(project, command.payload.runId);
      const providerBrand = repository.getProviderBrand();
      const executionModelId = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentRuntime.getCapability(),
        providerBrand,
        requestedModelId: retryRun.executionModelId
      }).modelId;
      const debugEnabled = repository.getDebugEnabledDefault();

      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        if (!command.payload.subagentId) {
          const runProject = repository.createAgentRun(
            projectId,
            retryRun.latestUserPrompt,
            retryRun.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand),
            command.payload.threadId
          );
          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);

          await continueRunLifecycle(ws, command.requestId, runtime, repository, agentRuntime.getAdapter(), pendingBrowserApprovals, connections, {
            projectId,
            agentId: agentRuntime.id,
            providerBrand,
            debugEnabled,
            executionModelId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode,
            abortSignal: abortController.signal
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
            command.payload.threadId
          );
          const nextRunId = runProject.activeRun?.id;
          if (!nextRunId) {
            throw new Error("Retry run was not created");
          }

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
            agentRuntime.getAdapter(),
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
              abortSignal: abortController.signal
            }
          );
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, pendingBrowserApprovals, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.refresh": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      const targetRun = [project.activeRun, project.lastRun].find((run) => run?.id === command.payload.runId);
      if (!targetRun) {
        throw new Error(`Run ${command.payload.runId} is not available`);
      }
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
          project.activeThreadId,
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
      const job = repository.getBackgroundJob(command.payload.jobId);
      if (!job) {
        throw new Error(`Unknown background job: ${command.payload.jobId}`);
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
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      await emitBackgroundJobRunUpdatedToAll(connections, queuedRun);
      await launchBackgroundJobRun(
        connections,
        repository,
        adapter,
        runtime,
        backgroundRunControllers,
        assistantManager,
        queuedRun.id
      );
      return;
    }
    case "background-job.stop-run": {
      const control = backgroundRunControllers.get(command.payload.runId);
      control?.abortController.abort();
      const updatedRun = repository.setBackgroundJobRunStatus(command.payload.runId, "cancelled", {
        failureMessage: "Stopped by user"
      });
      saveBackgroundRunStatusNotification(repository, updatedRun);
      backgroundRunControllers.delete(command.payload.runId);
      await emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
    case "background-job.retry-run": {
      assertGlobalExecutionNotPaused(repository);
      const existingRun = repository.getBackgroundJobRun(command.payload.runId);
      if (!existingRun) {
        throw new Error(`Unknown background run: ${command.payload.runId}`);
      }
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
      await emitBackgroundJobRunUpdatedToAll(connections, queuedRun);
      if (queuedRun.status === "queued") {
        await launchBackgroundJobRun(
          connections,
          repository,
          adapter,
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
      const updatedRun = repository.setBackgroundJobRunStatus(command.payload.runId, "queued", {
        approvalStatus: "approved"
      });
      repository.archiveNotification(createBackgroundRunStatusNotificationId(updatedRun.id));
      await emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      await launchBackgroundJobRun(
        connections,
        repository,
        adapter,
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
      const updatedRun = repository.setBackgroundJobRunStatus(command.payload.runId, "cancelled", {
        approvalStatus: "rejected",
        failureMessage: "Rejected before execution"
      });
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
      const savedAssistant = repository.saveAssistant(command.payload.assistant, command.payload.assetRefs ?? []);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      emitAssistantCreatedCardToAll(connections, savedAssistant);
      void assistantManager.bootstrapAssistant(savedAssistant.id);
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
          control.abortController.abort();
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
      void assistantManager.retryBootstrap(command.payload.assistantId);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      return;
    }
    case "assistant.chat.send": {
      assertGlobalExecutionNotPaused(repository);
      await assistantManager.sendAssistantChat(command.payload.assistantId, command.payload.content);
      return;
    }
    case "assistant.question.answer": {
      assertGlobalExecutionNotPaused(repository);
      await assistantManager.answerQuestion(command.payload.assistantId, command.payload.questionId, command.payload.content);
      repository.archiveNotification(createAssistantQuestionNotificationId(command.payload.assistantId, command.payload.questionId));
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
    case "assistant.todo.reorder": {
      repository.reorderAssistantTodos(command.payload.assistantId, command.payload.todoIds);
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantsState());
      assistantManager.scheduleReprioritize(command.payload.assistantId, "manual-todo-reorder");
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
      repository.archiveNotification(
        createBrowserApprovalNotificationId(
          command.payload.projectId,
          command.payload.runId,
          command.payload.sessionId,
          command.payload.toolCallId
        )
      );
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
      adapter.setApiKey("openai", undefined);
      adapter.setApiKey("google", undefined);
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
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: "gpt" | "gemini";
    debugEnabled: boolean;
    executionModelId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal: AbortSignal;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = requireActiveRun(project);
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
          threadId: activeRun.threadId,
          runId: activeRun.id,
          owner: "planner",
          queryText: activeRun.latestUserPrompt
        })
      : { memorySummaries: [] as MemorySummary[] };
  const plannerTurn = await runPlannerTurn(adapter, {
    cwd: project.rootPath,
    sessionId: project.session.sessionId,
    messages: project.session.messages,
    latestUserPrompt: activeRun.latestUserPrompt,
    runId: activeRun.id,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.executionModelId,
    subagentWorktreeStrategy,
    planExecutionMode,
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode,
    mode,
    ruleSources,
    memorySummaries: [...memorySummaries, ...memoryBank.memorySummaries],
    priorQuestions: activeRun.questions,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    callbacks: createExecutionCallbacks(
      ws,
      requestId,
      runtime,
      repository,
      options.projectId,
      activeRun.id,
      pendingBrowserApprovals,
      options.abortSignal,
      connections
    )
  });

  if (plannerTurn.plannerResult.type === "question") {
    const questionStatus = repository.getGlobalExecutionPaused() ? "deferred" : "pending";
    const questionProject = repository.appendPlanningQuestion(
      options.projectId,
      activeRun.id,
      plannerTurn.plannerResult.question,
      questionStatus
    );
    runtime.upsertPersistedProject(questionProject);
    emitRunUpdated(ws, requestId, questionProject);

    runtime.setProjectStreaming(options.projectId, false);
    runtime.clearStreaming(options.projectId);
    if (questionStatus === "pending") {
      const promptProject = repository.appendMessage(
        options.projectId,
        "assistant",
        plannerTurn.plannerResult.question.prompt
      );
      runtime.upsertPersistedProject(promptProject);
      emitMessageAppended(ws, requestId, runtime, options.projectId);
    } else {
      const deferredQuestion =
        questionProject.activeRun?.questions.find((question) => question.status === "deferred") ??
        questionProject.lastRun?.questions.find((question) => question.status === "deferred");
      if (deferredQuestion) {
        repository.saveNotification(
          createPlanningQuestionNotification(options.projectId, activeRun.threadId, activeRun.id, deferredQuestion)
        );
        emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
      }
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
  emitRunUpdated(ws, requestId, readyProject);

  if (plannerTurn.plan) {
    runtime.setProjectPlan(options.projectId, plannerTurn.plan);
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

  runtime.setProjectStreaming(options.projectId, false);
  runtime.clearStreaming(options.projectId);
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
    emitMessageAppended(ws, requestId, runtime, options.projectId);
  }
  emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
    sessionId: project.session.sessionId,
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
    providerBrand: "gpt" | "gemini";
    runId?: string;
    executionModelId: string;
    latestUserPrompt: string;
    mode?: ModeDefinition;
    threadId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
  }
) {
  const project = runtime.getProject(projectId);
  const activeRun = requireActiveRun(project, options.runId);
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
  const plannerReadyTurn: PlannerReadyTurn = {
    type: "ready",
    difficultyScore: 10,
    summary: "Low-complexity direct workspace task",
    executionModelId: options.executionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: options.latestUserPrompt,
    prerequisites: [],
    contracts: []
  };
  const executionPlan = buildExecutionPlan({
    runId: activeRun.id,
    planningModelId: getDefaultPlanningModelId(options.providerBrand),
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
  emitRunUpdated(ws, requestId, readyProject);
  runtime.setProjectStreaming(projectId, false);
  runtime.clearStreaming(projectId);
  emitProjectTrace(ws, requestId, runtime, projectId, activeRun.threadId, {
    sessionId: project.session.sessionId,
    stage: "plan-presented",
    message: "Skipped planner for low-complexity direct task",
    detail: options.latestUserPrompt,
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
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: "gpt" | "gemini";
    debugEnabled: boolean;
    runId: string;
    abortSignal: AbortSignal;
    guidanceText?: string;
    subagentIds?: string[];
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = requireActiveRun(project, options.runId);
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

  await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, {
    projectId: options.projectId,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    debugEnabled: options.debugEnabled,
    runId: options.runId,
    readyPlan,
    executionPlan: activeRun.plan,
    executionTarget: activeRun.executionTarget,
    existingSubagentResults: existingResults,
    tasksToRun,
    resumeNote: options.guidanceText,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    abortSignal: options.abortSignal
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
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: "gpt" | "gemini";
    debugEnabled: boolean;
    runId: string;
    readyPlan: PlannerReadyTurn;
    executionPlan?: ExecutionPlan;
    executionTarget?: "current-project" | "ephemeral-experiment";
    existingSubagentResults?: Parameters<typeof executeReadyRun>[1]["existingSubagentResults"];
    tasksToRun?: Parameters<typeof executeReadyRun>[1]["tasksToRun"];
    resumeNote?: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal?: AbortSignal;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = requireActiveRun(project, options.runId);
  const executionTarget = options.executionTarget ?? activeRun.executionTarget ?? "current-project";
  let effectiveProject = project;
  let experimentLease: BranchfsExperimentLease | undefined;
  if (executionTarget === "ephemeral-experiment") {
    const manager = new BranchfsManager({ rootPath: project.rootPath, runId: options.runId }, {
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

  const baseExecutionPlan =
    options.executionPlan ?? buildExecutionPlanFromRun(requireActiveRun(effectiveProject, options.runId), options.runId);
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
  const executionPlan = await completeExecutionPlanPrerequisites(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    effectiveProject.session.sessionId,
    baseExecutionPlan,
    requireActiveRun(effectiveProject, options.runId).planningModelId
  );
  const executionPlanWithMemory = {
    ...executionPlan,
    memorySummaries: [...(executionPlan.memorySummaries ?? []), ...retrievedMemory.memorySummaries]
  };
  const status = options.readyPlan.usesSubagents ? "running-subagents" : "running-main";
  const startedProject = repository.setAgentRunStatus(options.projectId, options.runId, status);
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdated(ws, requestId, startedProject);

  const outcome = await executeReadyRun(adapter, {
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
    executionPlan: executionPlanWithMemory,
    callbacks: createExecutionCallbacks(
      ws,
      requestId,
      runtime,
      repository,
      options.projectId,
      options.runId,
      pendingBrowserApprovals,
      options.abortSignal,
      connections
    )
  });

  runtime.clearStreaming(options.projectId);
  runtime.setProjectStreaming(options.projectId, false);
  runtime.setProjectError(options.projectId, undefined);

  const reviewCwd = experimentLease?.projectMountPath ?? project.rootPath;
  const correctnessReview = await runCorrectnessReview(reviewCwd, executionPlanWithMemory, outcome, options.readyPlan);
  const reviewedProject = repository.setAgentRunCorrectnessReview(options.projectId, options.runId, correctnessReview);
  runtime.upsertPersistedProject(reviewedProject);
  emitRunUpdated(ws, requestId, reviewedProject);

  if (correctnessReview.status === "needs-iteration" && correctnessReview.recommendedPlan) {
    emitProjectTrace(ws, requestId, runtime, options.projectId, project.activeThreadId, {
      sessionId: project.session.sessionId,
      stage: "correctness-gap",
      message: correctnessReview.summary,
      detail: correctnessReview.gaps.map((gap) => gap.description).join("\n")
    });
    await presentCorrectivePlan(ws, requestId, runtime, repository, options.projectId, {
      sessionId: project.session.sessionId,
      agentId: options.agentId,
      planningModelId: requireActiveRun(runtime.getProject(options.projectId), options.runId).planningModelId ?? getDefaultPlanningModelId(options.providerBrand),
      executionPlan: correctnessReview.recommendedPlan
    });

    if (
      correctnessReview.recommendedPlan.correctnessPolicy === "auto-once" &&
      correctnessReview.recommendedPlan.iteration <= 2
    ) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, {
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
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, {
        ...options,
        readyPlan: buildReadyPlanFromExecutionPlan(correctnessReview.recommendedPlan),
        executionPlan: correctnessReview.recommendedPlan,
        executionTarget
      });
      return;
    }

    return;
  }

  const messageProject = repository.appendMessage(options.projectId, "assistant", outcome.assistantMessage.content);
  runtime.upsertPersistedProject(messageProject);

  const finalStatus = outcome.partial ? "partial-complete" : "completed";
  const statusProject = repository.setAgentRunStatus(options.projectId, options.runId, finalStatus, outcome.partialReason);
  runtime.upsertPersistedProject(statusProject);
  const finalRunState = requireRunById(runtime.getProject(options.projectId), options.runId);
  if (experimentLease) {
    const experimentManager = new BranchfsManager({ rootPath: project.rootPath, runId: options.runId });
    const inspection = await experimentManager.readInspection(experimentLease);
    const experimentProject = repository.saveExperimentRun(options.projectId, options.runId, {
      ...inspection.experiment,
      status: finalStatus === "completed" ? "completed" : "partial-complete",
      updatedAt: new Date().toISOString()
    });
    runtime.upsertPersistedProject(experimentProject);
  }
  extractRunMemories(repository, {
    projectId: options.projectId,
    threadId: activeRun.threadId,
    run: finalRunState,
    finalAssistantMessage: outcome.assistantMessage.content,
    correctnessReview,
    cwd: reviewCwd
  });
  emitRunUpdated(ws, requestId, statusProject);
  if (outcome.partial) {
    appendSystemStatus(
      ws,
      requestId,
      runtime,
      repository,
      options.projectId,
      `Run partial complete. ${outcome.partialReason ?? "Some subagents failed."}`
    );
  }

  const nextProject = runtime.getProject(options.projectId);
  const assistantMessage = findLatestAssistantMessage(nextProject);
  if (!assistantMessage || assistantMessage.role !== "assistant") {
    throw new Error("Assistant message was not persisted");
  }

  sendEvent(ws, {
    type: "chat.complete",
    requestId,
    payload: {
      projectId: options.projectId,
      threadId: nextProject.activeThreadId,
      sessionId: nextProject.session.sessionId,
      assistantMessage,
      state: nextProject.session
    }
  });
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
    providerBrand: "gpt" | "gemini";
    runId: string;
    sourceRun: AgentRunState;
    targetTask: PlannerReadyTurn["subtasks"][number];
    readyPlan: PlannerReadyTurn;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal: AbortSignal;
  }
) {
  const project = runtime.getProject(options.projectId);
  const startedProject = repository.setAgentRunStatus(options.projectId, options.runId, "running-subagents");
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdated(ws, requestId, startedProject);

  const callbacks = createExecutionCallbacks(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    options.runId,
    pendingBrowserApprovals,
    options.abortSignal,
    connections
  );
  const sessionId = project.session.sessionId;
  const subagentModelId = getDefaultSubagentModelId(options.providerBrand);
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
  callbacks.onSubagentStart?.(options.targetTask);

  const retriedResult = await runInlineSubagentRetry(adapter, {
    runId: options.runId,
    cwd: project.rootPath,
    providerBrand: options.providerBrand,
    task: options.targetTask,
    brief: options.readyPlan.finalExecutionBrief,
    priorAttemptCount: options.sourceRun.subtasks.find((task) => task.id === options.targetTask.id)?.attemptCount ?? 0,
    reasoningStrength: options.reasoningStrength,
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

  const messageProject = repository.appendMessage(options.projectId, "assistant", assistantMessage.content);
  runtime.upsertPersistedProject(messageProject);
  runtime.clearStreaming(options.projectId);
  runtime.setProjectStreaming(options.projectId, false);
  runtime.setProjectError(options.projectId, undefined);

  const partial = mergedResults.some((result) => result.status === "failed");
  const statusProject = repository.setAgentRunStatus(
    options.projectId,
    options.runId,
    partial ? "partial-complete" : "completed"
  );
  runtime.upsertPersistedProject(statusProject);
  emitRunUpdated(ws, requestId, statusProject);
  if (partial) {
    appendSystemStatus(
      ws,
      requestId,
      runtime,
      repository,
      options.projectId,
      "Run partial complete. Some retried subagents still failed."
    );
  }

  const nextProject = runtime.getProject(options.projectId);
  const persistedAssistantMessage = findLatestAssistantMessage(nextProject);
  if (!persistedAssistantMessage || persistedAssistantMessage.role !== "assistant") {
    throw new Error("Assistant message was not persisted");
  }

  sendEvent(ws, {
    type: "chat.complete",
    requestId,
    payload: {
      projectId: options.projectId,
      threadId: nextProject.activeThreadId,
      sessionId: nextProject.session.sessionId,
      assistantMessage: persistedAssistantMessage,
      state: nextProject.session
    }
  });
}

function createExecutionCallbacks(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  abortSignal?: AbortSignal,
  connections?: Set<Bun.ServerWebSocket<HarnessConnection>>
) {
  return {
    onTrace(trace: AgentTrace) {
      runtime.appendTrace(projectId, trace);
      sendEvent(ws, {
        type: "agent.trace",
        requestId,
        payload: {
          projectId,
          threadId: runtime.getProject(projectId).activeThreadId,
          trace
        }
      });
      const statusMessage = statusMessageFromTrace(trace);
      if (statusMessage) {
        appendSystemStatus(ws, requestId, runtime, repository, projectId, statusMessage);
      }
    },
    onDelta(delta: string) {
      const project = runtime.getProject(projectId);
      runtime.appendStreamingDelta(projectId, delta);
      sendEvent(ws, {
        type: "chat.delta",
        requestId,
        payload: {
          projectId,
          threadId: project.activeThreadId,
          sessionId: project.session.sessionId,
          delta
        }
      });
    },
    onContextUsage(contextUsage: ProjectContextUsage) {
      runtime.setProjectContextUsage(projectId, contextUsage);
      sendEvent(ws, {
        type: "project.context",
        requestId,
        payload: {
          projectId,
          threadId: runtime.getProject(projectId).activeThreadId,
          contextUsage
        }
      });
    },
    onSubagentStart(task: PlannerReadyTurn["subtasks"][number]) {
      const currentTask =
        runtime.getProject(projectId).activeRun?.subtasks.find((entry) => entry.id === task.id);
      const nextProject = repository.markSubtaskStarted(projectId, runId, task.id, (currentTask?.attemptCount ?? 0) + 1);
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdated(ws, requestId, nextProject);
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
      emitRunUpdated(ws, requestId, nextProject);
      const nextRun = runtime.getProject(projectId).activeRun ?? runtime.getProject(projectId).lastRun;
      if (nextRun) {
        appendSystemStatus(ws, requestId, runtime, repository, projectId, formatSubagentProgressStatus(nextRun));
      }
    },
    setExecutionState(state: ManagedExecutionState) {
      runtime.setExecutionState(projectId, state);
    },
    getExecutionState(input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) {
      return runtime.getExecutionState(projectId, input);
    },
    clearExecutionState(input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) {
      runtime.clearExecutionState(projectId, input);
    },
    onExecutionEvent(input: { owner: "main" | "subagent" | "aggregator"; subagentId?: string; event: PiAgentExecutionEvent }) {
      const project = runtime.getProject(projectId);
      const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId);
      if (!run) {
        return;
      }

      let nextSessions = structuredClone(run.browserSessions ?? []);
      switch (input.event.type) {
        case "tool-start":
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
          nextSessions = recordBrowserToolEnd(nextSessions, {
            runId,
            owner: input.owner,
            subagentId: input.subagentId,
            toolCallId: input.event.toolCallId,
            toolName: input.event.toolName,
            result: input.event.result,
            isError: input.event.isError
          });
          break;
        default:
          return;
      }

      if (JSON.stringify(run.browserSessions ?? []) === JSON.stringify(nextSessions)) {
        return;
      }

      const nextProject = repository.setAgentRunBrowserSessions(projectId, runId, nextSessions);
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdated(ws, requestId, nextProject);
    },
    requestBrowserApproval(input: {
      owner: "main" | "subagent" | "aggregator";
      subagentId?: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }) {
      const project = runtime.getProject(projectId);
      const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId);
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
      emitRunUpdated(ws, requestId, nextProject);
      const refreshedRun =
        nextProject.activeRun?.id === runId ? nextProject.activeRun : nextProject.lastRun?.id === runId ? nextProject.lastRun : undefined;
      const refreshedSession = refreshedRun?.browserSessions?.find((entry) => entry.id === session.id);
      const approval = refreshedSession?.activities.find((entry) => entry.toolCallId === input.toolCallId)?.approval;
      if (approval) {
        repository.saveNotification(
          createBrowserApprovalNotification(
            projectId,
            refreshedRun?.threadId ?? project.activeThreadId,
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
  assistantManager: AssistantManager,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  scheduler: BackgroundJobScheduler
) {
  for (const entry of repository.promoteDeferredPlanningQuestions()) {
    let project = repository.getProject(entry.projectId);
    runtime.upsertPersistedProject(project);
    const run =
      project.activeRun?.id === entry.runId
        ? project.activeRun
        : project.lastRun?.id === entry.runId
          ? project.lastRun
          : undefined;
    const pendingQuestion = run?.questions.find((question) => question.status === "pending");
    if (pendingQuestion) {
      project = repository.appendMessage(entry.projectId, "assistant", pendingQuestion.prompt, {
        threadId: entry.threadId
      });
      runtime.upsertPersistedProject(project);
    }

    for (const connection of connections) {
      emitRunUpdated(connection, requestId, project);
      if (pendingQuestion) {
        emitMessageAppended(connection, requestId, runtime, entry.projectId);
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

  for (const queuedRun of repository.getQueuedBackgroundJobRuns()) {
    await launchBackgroundJobRun(
      connections,
      repository,
      adapter,
      runtime,
      backgroundRunControllers,
      assistantManager,
      queuedRun.id
    );
  }

  await scheduler.tick(false);
  emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
}

async function runInlineSubagentRetry(
  adapter: PiAgentAdapter,
  options: {
    runId: string;
    cwd: string;
    providerBrand: "gpt" | "gemini";
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
  const subagentModelId = getDefaultSubagentModelId(options.providerBrand);
  let attempt = 0;

  while (true) {
    attempt += 1;
    const startedAt = Date.now();
    try {
      const basePrompt = [
        "You are a focused coding subagent.",
        "Complete only the assigned instruction.",
        "Return concise, implementation-focused output.",
        "",
        `Shared brief: ${options.brief}`,
        `Subtask title: ${options.task.title}`,
        `Subtask instruction: ${options.task.instruction}`
      ].join("\n");
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: options.task.id,
        originalRequest: {
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: basePrompt,
          reasoningStrength: options.reasoningStrength,
          fastMode: options.fastMode,
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
          reasoningStrength: options.reasoningStrength,
          fastMode: options.fastMode,
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
      if (response.contextUsage) {
        options.callbacks.onContextUsage?.({
          sourceKind: "subagent",
          sourceLabel: options.task.id,
          modelId: subagentModelId,
          tokens: response.contextUsage.tokens,
          contextWindow: response.contextUsage.contextWindow,
          usagePercent: response.contextUsage.usagePercent,
          updatedAt: new Date().toISOString()
        });
      }

      options.callbacks.onTrace?.({
        sessionId: options.sessionId,
        stage: "subagent-complete",
        message: `Completed ${options.task.title}`,
        detail: response.text.slice(0, 240),
        subagentId: options.task.id,
        modelId: subagentModelId,
        durationMs: Date.now() - startedAt
      });

      return {
        id: options.task.id,
        title: options.task.title,
        instruction: options.task.instruction,
        status: "completed",
        output: response.text.trim(),
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
        options.callbacks.onTrace?.({
          sessionId: options.sessionId,
          stage: "subagent-retry",
          message: `Retrying ${options.task.title}`,
          detail: `Attempt ${attempt + 1}: ${typedError.message}`,
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
  projectId: ProjectId,
  message: string
) {
  const project = runtime.getProject(projectId);
  if (project.activeRun) {
    rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, projectId, project.activeRun.id, "Run failed");
    const failedProject = repository.setAgentRunStatus(projectId, project.activeRun.id, "failed", message);
    if (project.activeRun.experiment) {
      repository.saveExperimentRun(projectId, project.activeRun.id, {
        ...project.activeRun.experiment,
        status: "failed",
        updatedAt: new Date().toISOString()
      });
    }
    runtime.upsertPersistedProject(failedProject);
    emitRunUpdated(ws, requestId, failedProject);
    extractRunMemories(repository, {
      projectId,
      threadId: project.activeRun.threadId,
      run: requireRunById(repository.getProject(projectId), project.activeRun.id),
      finalAssistantMessage: project.session.messages.at(-1)?.content,
      correctnessReview: project.activeRun.correctnessReview,
      cwd: project.activeRun.experiment?.projectMountPath ?? project.rootPath
    });
  }

  runtime.setProjectError(projectId, message);
  runtime.setProjectStreaming(projectId, false);
  runtime.clearStreaming(projectId);
  appendSystemStatus(ws, requestId, runtime, repository, projectId, `Run failed. ${message}`);

  sendEvent(ws, {
    type: "chat.error",
    requestId,
    payload: {
      projectId,
      threadId: project.activeThreadId,
      message: "Agent execution failed",
      detail: message
    }
  });

  debugLog("chat.error", {
    projectId,
    detail: message
  });
}

function createBrowserApprovalKey(projectId: ProjectId, runId: string, sessionId: string, toolCallId: string) {
  return [projectId, runId, sessionId, toolCallId].join(":");
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
  content: string
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return;
  }

  const project = runtime.getProject(projectId);
  const lastMessage = project.session.messages.at(-1);
  if (lastMessage?.role === "system" && lastMessage.content === normalizedContent) {
    return;
  }

  const nextProject = repository.appendMessage(projectId, "system", normalizedContent, project.activeThreadId);
  runtime.upsertPersistedProject(nextProject);
  emitMessageAppended(ws, requestId, runtime, projectId);
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
    case "aggregation-start":
    case "aggregation-complete":
      return trace.message;
    case "refresh-requested":
    case "refresh-deferred":
      return trace.message;
    default:
      return undefined;
  }
}

function formatSubagentProgressStatus(run: AgentRunState) {
  const completedCount = run.subtasks.filter((task) => task.status === "completed").length;
  const failedCount = run.subtasks.filter((task) => task.status === "failed").length;
  if (failedCount > 0) {
    return `Subagent progress: ${completedCount}/${run.subtasks.length} done, ${failedCount} failed.`;
  }

  return `Subagent progress: ${completedCount}/${run.subtasks.length} done.`;
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
    appendSystemStatus(ws, requestId, runtime, repository, projectId, `Refreshing ${executionLabel} after current stream completes.`);
    emitProjectTrace(ws, requestId, runtime, projectId, threadId, {
      sessionId: runtime.getProject(projectId).session.sessionId,
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
    refreshAction === "restart"
      ? `Refreshing ${executionLabel} by restarting original prompt.`
      : `Refreshing ${executionLabel} with continue.`
  );
  emitProjectTrace(ws, requestId, runtime, projectId, threadId, {
    sessionId: runtime.getProject(projectId).session.sessionId,
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
  runtime.appendTrace(projectId, trace);
  sendEvent(ws, {
    type: "agent.trace",
    requestId,
    payload: {
      projectId,
      threadId,
      trace
    }
  });
}

function emitMessageAppended(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  projectId: ProjectId
) {
  const project = runtime.getProject(projectId);
  const message = project.session.messages.at(-1);
  if (!message) {
    throw new Error("Expected appended message");
  }

  sendEvent(ws, {
    type: "chat.message-appended",
    requestId,
    payload: {
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: project.session.sessionId,
      message,
      state: project.session
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

async function completeExecutionPlanPrerequisites(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  sessionId: string,
  executionPlan: ExecutionPlan,
  planningModelId?: string
) {
  if (executionPlan.prerequisites.every((prerequisite) => prerequisite.status === "completed")) {
    return executionPlan;
  }

  for (const prerequisite of executionPlan.prerequisites) {
    emitProjectTrace(ws, requestId, runtime, projectId, runtime.getProject(projectId).activeThreadId, {
      sessionId,
      stage: "prerequisite-start",
      message: `Running prerequisite: ${prerequisite.title}`,
      detail: prerequisite.instruction
    });
    prerequisite.status = "completed";
    emitProjectTrace(ws, requestId, runtime, projectId, runtime.getProject(projectId).activeThreadId, {
      sessionId,
      stage: "prerequisite-complete",
      message: `Completed prerequisite: ${prerequisite.title}`
    });
  }

  const updatedProject = repository.setAgentRunExecutionPlan(projectId, executionPlan.runId, executionPlan);
  runtime.upsertPersistedProject(updatedProject);
  emitRunUpdated(ws, requestId, updatedProject);
  runtime.setProjectPlan(
    projectId,
    createAgentPlanFromExecutionPlan(
      sessionId,
      runtime.getProject(projectId).session.selectedAgentId ?? "pi",
      planningModelId ?? executionPlan.planningModelId,
      executionPlan
    )
  );
  return executionPlan;
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
  const proc = Bun.spawn({
    cmd: ["powershell", "-NoProfile", "-Command", "Get-ChildItem -Recurse -File | Select-Object -ExpandProperty FullName"],
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
    .filter((value) => /(?:^|\/)(?:copy|old|backup|tmp|temp)[^/]*\.(?:ts|tsx|js|jsx)$/.test(value))
    .slice(0, 8);
}

function buildCorrectiveExecutionPlan(
  basePlan: ExecutionPlan,
  gaps: CorrectnessGap[],
  readyPlan: PlannerReadyTurn
): ExecutionPlan {
  const usesParallelCorrectiveWork = gaps.some((gap) => gap.canParallelize) && gaps.length > 1;
  const actualSubagentCount = usesParallelCorrectiveWork ? Math.min(10, gaps.length) : 0;
  const targetSubagentCount = gaps.some((gap) => gap.canParallelize) ? Math.min(10, Math.max(2, gaps.length)) : 0;
  return {
    ...basePlan,
    origin: "correctness-followup",
    iteration: basePlan.iteration + 1,
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
  emitRunUpdated(ws, requestId, readyProject);

  const agentPlan = createAgentPlanFromExecutionPlan(input.sessionId, input.agentId, input.planningModelId, input.executionPlan);
  runtime.setProjectPlan(projectId, agentPlan);
  sendEvent(ws, {
    type: "agent.plan",
    requestId,
    payload: {
      projectId,
      threadId: runtime.getProject(projectId).activeThreadId,
      plan: agentPlan
    }
  });

  if (shouldAppendPlanSummaryMessage(input.executionPlan)) {
    const planMessageProject = repository.appendMessage(projectId, "assistant", input.executionPlan.summary, {
      kind: "plan-summary",
      metadata: {
        type: "plan-summary",
        runId: input.executionPlan.runId,
        plan: input.executionPlan
      }
    });
    runtime.upsertPersistedProject(planMessageProject);
    emitMessageAppended(ws, requestId, runtime, projectId);
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

function assertProjectCanStartRun(project: ProjectLike) {
  const blockingStatuses = new Set(["planning", "awaiting-user-input", "ready", "running-main", "running-subagents", "aggregating", "partial-complete"]);
  if (project.activeRun && blockingStatuses.has(project.activeRun.status)) {
    throw new Error(`Project has active run in status ${project.activeRun.status}`);
  }
}

function assertActiveThread(project: ProjectLike, threadId: string) {
  if (project.activeThreadId !== threadId) {
    throw new Error(`Thread ${threadId} is not active for project ${project.id}`);
  }
}

function assertProjectCanStartRetry(project: ProjectLike, runId: string) {
  const blockingStatuses = new Set(["planning", "awaiting-user-input", "ready", "running-main", "running-subagents", "aggregating"]);
  if (project.activeRun && project.activeRun.id !== runId && blockingStatuses.has(project.activeRun.status)) {
    throw new Error(`Project has active run in status ${project.activeRun.status}`);
  }
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

function requireRetryableRun(project: ProjectLike, runId: string) {
  const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId);
  if (!run) {
    throw new Error(`Run ${runId} is not available`);
  }

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
  project: ProjectLike
) {
  const maxDirtyFileCount = repository.getDirtyGitChangeLimitDefault();
  const result = await runGitPreflight(project.rootPath, {
    enabled: repository.getBlockChatOnDirtyGitDefault(),
    maxDirtyFileCount
  });
  if (result.status === "warning") {
    appendSystemStatus(ws, requestId, runtime, repository, project.id, result.preflight.message);
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
    throw new Error(`Git dirty: ${result.changedFileCount} changed files. Refusing run above ${maxDirtyFileCount} files.`);
  }
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
  ws.send(JSON.stringify(event));
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

  return {
    hasUsableApiKey: hasUsableOpenAiApiKey || hasUsableGoogleApiKey,
    hasStoredApiKey: hasStoredOpenAiApiKey || hasStoredGoogleApiKey,
    hasUsableOpenAiApiKey,
    hasStoredOpenAiApiKey,
    hasUsableGoogleApiKey,
    hasStoredGoogleApiKey,
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
    memoryBankEnabledDefault: repository.getMemoryBankEnabledDefault(),
    attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
    capabilities: defaultProviderCapabilities,
    agentRuntimes: runtimeRegistry.listCapabilities()
  };
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
  const toolPolicy = mode?.toolPolicy ?? "full-access";
  const worktreeStrategy = job.definition.subagentWorktreeStrategy ?? repositoryLikeWorktreeStrategy(project, runtime);
  if ((toolPolicy === "read-heavy" || toolPolicy === "review-only") && worktreeStrategy !== "same-worktree") {
    return "safe";
  }

  return worktreeStrategy === "same-worktree" ? "unsafe" : "slightly-unsafe";
}

function repositoryLikeWorktreeStrategy(project: WorkspaceProjectState, runtime: WorkspaceRuntimeStore) {
  return resolveModeById(project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes)
    ?.subagentWorktreeStrategyDefault ?? "same-worktree";
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
  for (const connection of connections) {
    sendEvent(connection, {
      type: "assistant.chat.delta",
      requestId: `assistant:auto:${crypto.randomUUID()}`,
      payload: input
    });
  }
}

function emitAssistantChatCompleteToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  input: { assistantId: string; sessionId: string; assistantMessage: ChatMessage; thread: ReturnType<WorkspaceRepository["getAssistantThread"]> }
) {
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
  for (const question of assistants.questions) {
    if (question.status !== "pending" && question.status !== "deferred") {
      continue;
    }

    const notification = createAssistantQuestionNotification(question);
    activeIds.add(notification.id);
    repository.saveNotification(notification);
  }

  for (const item of repository.loadNotificationInboxState().items) {
    if (item.kind !== "assistant-question") {
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
    choices: question.choices
  };
}

function createPlanningQuestionNotificationId(runId: string, questionId: string) {
  return `planning-question:${runId}:${questionId}`.slice(0, 128);
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

function createAssistantQuestionNotificationId(assistantId: string, questionId: string) {
  return `assistant-question:${assistantId}:${questionId}`.slice(0, 128);
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
  return `browser-approval:${projectId}:${runId}:${sessionId}:${toolCallId}`.slice(0, 128);
}

function createBackgroundRunStatusNotification(job: BackgroundJob, run: BackgroundJobRun): BackgroundRunStatusNotification | undefined {
  const statusMeta = backgroundRunNotificationMeta(run.status);
  if (!statusMeta) {
    return undefined;
  }

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
    summary: run.summary ?? run.failureMessage ?? `${job.name} ${statusMeta.fallbackVerb}`,
    severity: statusMeta.severity
  };
}

function createBackgroundRunStatusNotificationId(runId: string) {
  return `background-run-status:${runId}`.slice(0, 128);
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
  adapter: PiAgentAdapter,
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
      failureMessage: "Background job definition no longer exists."
    });
    saveBackgroundRunStatusNotification(repository, failedRun);
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    await emitBackgroundJobRunUpdatedToAll(connections, failedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    return;
  }

  if (job.assistantId) {
    const assistant = repository.getAssistant(job.assistantId);
    if (!assistant || assistant.runState === "paused" || assistant.deletedAt) {
      const cancelledRun = repository.setBackgroundJobRunStatus(backgroundRunId, "cancelled", {
        failureMessage: "Assistant is paused or deleted"
      });
      saveBackgroundRunStatusNotification(repository, cancelledRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      await emitBackgroundJobRunUpdatedToAll(connections, cancelledRun);
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
      return;
    }
  }

  const abortController = new AbortController();
  backgroundRunControllers.set(backgroundRunId, { abortController });
  try {
    const startedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "running");
    saveBackgroundRunStatusNotification(repository, startedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    const nextRun = await executeBackgroundJobRun({
      repository,
      adapter,
      job,
      run,
      providerBrand: repository.getProviderBrand(),
      debugEnabled: repository.getDebugEnabledDefault(),
      abortSignal: abortController.signal
    });
    if (job.assistantId) {
      await assistantManager.handleBackgroundJobRunOutcome({
        assistantId: job.assistantId,
        status: nextRun.status === "succeeded" ? "succeeded" : "failed",
        summary: nextRun.summary,
        failureMessage: nextRun.failureMessage
      });
    }
    saveBackgroundRunStatusNotification(repository, nextRun);
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    await emitBackgroundJobRunUpdatedToAll(connections, nextRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "Unknown background job failure";
    const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
      failureMessage
    });
    repository.appendBackgroundJobRunEvent(backgroundRunId, "failed", "Background run failed", failureMessage);
    saveBackgroundRunStatusNotification(repository, failedRun);
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
    backgroundRunControllers.delete(backgroundRunId);
  }
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
  providerBrand: "gpt" | "gemini"
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
  providerBrand: "gpt" | "gemini";
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
