import { createUiAssetManager } from "./ui-build";
import { defaultAgentCatalog } from "../../shared/agent-catalog";
import { defaultProviderCapabilities } from "../../shared/capabilities";
import { resolveModeById } from "../../shared/modes";
import path from "node:path";
import { createRouteHandler } from "uploadthing/server";
import {
  createChatMessage,
  createRequestId,
  type AgentPlan,
  type AgentTrace,
  type CorrectnessGap,
  type CorrectnessReview,
  type ExecutionPlan,
  type MemorySummary,
  type ModeDefinition,
  parseClientCommand,
  type AgentRunState,
  type ClientCommand,
  type PlannerReadyTurn,
  type PreferencesState,
  type ProjectContextUsage,
  type ProjectId,
  type ServerEvent,
  type WorkspaceRuleSource,
  type WorkspaceProjectState
} from "../../shared/protocol";
import { pickProjectFolder } from "./folder-picker";
import {
  type ManagedExecutionState,
  type ManagedRefreshAction
} from "./execution-runtime";
import { runGitPreflight } from "./git-preflight";
import { debugLog } from "./logging";
import { runManagedAgentExecution } from "./managed-agent-execution";
import { PiSdkAgentAdapter, type PiAgentAdapter } from "./pi-agent-adapter";
import { aggregateSubagentResults, executeReadyRun, executionPlanToTasks, runPlannerTurn } from "./pi-orchestrator";
import { getDefaultExecutionModelId, getDefaultPlanningModelId, getDefaultSubagentModelId } from "./pi-planner";
import type { SubagentResult } from "./pi-subagents";
import { WorkspaceRepository } from "./workspace-repository";
import { WorkspaceRuntimeStore } from "./workspace-runtime-store";
import { harnessUploadRouter } from "./uploadthing-router";

type HarnessConnection = {
  clientId: string;
};

type HarnessServerOptions = {
  port: number;
  adapter?: PiAgentAdapter;
  repository?: WorkspaceRepository;
  pickFolder?: typeof pickProjectFolder;
  serverOnly?: boolean;
};

type ProjectLike = Pick<WorkspaceProjectState, "id" | "rootPath" | "activeThreadId" | "session" | "activeRun" | "lastRun">;

export async function startHarnessServer({
  port,
  adapter = new PiSdkAgentAdapter(),
  repository = new WorkspaceRepository(Bun.env.HARNESS_DB_PATH),
  pickFolder = pickProjectFolder,
  serverOnly = false
}: HarnessServerOptions) {
  const runtime = new WorkspaceRuntimeStore(repository.loadWorkspace());
  const uiAssets = serverOnly ? undefined : createUiAssetManager();
  const uploadthingHandler = createRouteHandler({
    router: harnessUploadRouter
  });
  const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
  const storedGoogleApiKey = repository.getStoredGoogleApiKey();

  if (storedOpenAiApiKey) {
    adapter.setApiKey("openai", storedOpenAiApiKey);
  }

  if (storedGoogleApiKey) {
    adapter.setApiKey("google", storedGoogleApiKey);
  }

  if (uiAssets) {
    await uiAssets.ensureBuilt();
    uiAssets.startWatching();
  }

  const server = Bun.serve<HarnessConnection>({
    port,
    fetch(request, serverInstance) {
      const url = new URL(request.url);

      if (url.pathname === "/api/uploadthing") {
        return uploadthingHandler(request);
      }

      if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const upgraded = serverInstance.upgrade(request, {
          data: { clientId: crypto.randomUUID() }
        });

        if (!upgraded) {
          return new Response("Websocket upgrade failed", { status: 400 });
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
        sendEvent(ws, {
          type: "connection.ready",
          payload: {
            agents: [...defaultAgentCatalog],
            workspace: runtime.getWorkspace(),
            preferences: getPreferencesState(repository, adapter)
          }
        });
      },
      message(ws, message) {
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

        void handleCommand(ws, command, runtime, repository, adapter, pickFolder).catch((error) => {
          if (Bun.env.NODE_ENV !== "production") {
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
    return stop(closeActiveConnections);
  }) as typeof server.stop;

  console.log(`Harness server listening on http://localhost:${server.port}`);
  return server;
}

async function handleCommand(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  command: ClientCommand,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pickFolder: typeof pickProjectFolder
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
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRun(project);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);
      const providerBrand = repository.getProviderBrand();
      const debugEnabled = command.payload.debug ?? repository.getDebugEnabledDefault();
      const persistedExecutionModelId = isModelIdForProvider(project.session.executionModelId, providerBrand)
        ? project.session.executionModelId
        : undefined;
      const effectiveExecutionModelId =
        command.payload.executionModelId ?? persistedExecutionModelId ?? getDefaultExecutionModelId(providerBrand);

      repository.activateProject(projectId);
      runtime.setActiveProject(projectId);
      runtime.clearProjectTransients(projectId);

      if (command.payload.modeId && command.payload.modeId !== project.selectedModeId) {
        const modeProject = repository.setProjectSelectedMode(projectId, command.payload.modeId);
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
        getDefaultPlanningModelId(providerBrand),
        command.payload.threadId
      );
      runtime.upsertPersistedProject(runProject);
      emitRunUpdated(ws, command.requestId, runProject);

      runtime.setProjectExecutionModel(projectId, effectiveExecutionModelId);
      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, adapter, {
          projectId,
          providerBrand,
          debugEnabled,
          executionModelId: effectiveExecutionModelId,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown pi agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "planning.refine": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      const activeRun = requireActiveRun(project, command.payload.runId);
      if (activeRun.status !== "ready") {
        throw new Error("Only ready runs can be refined");
      }

      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);
      const providerBrand = repository.getProviderBrand();
      const executionModelId =
        activeRun.executionModelId && isModelIdForProvider(activeRun.executionModelId, providerBrand)
          ? activeRun.executionModelId
          : getDefaultExecutionModelId(providerBrand);
      const debugEnabled = repository.getDebugEnabledDefault();

      const refinedMessageProject = repository.appendMessage(projectId, "user", command.payload.content, command.payload.threadId);
      runtime.upsertPersistedProject(refinedMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, projectId);

      repository.setAgentRunStatus(projectId, activeRun.id, "stopped", "Plan refined before execution");
      runtime.clearProjectTransients(projectId);

      const runProject = repository.createAgentRun(
        projectId,
        command.payload.content,
        getDefaultPlanningModelId(providerBrand),
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
        await continueRunLifecycle(ws, command.requestId, runtime, repository, adapter, {
          projectId,
          providerBrand,
          debugEnabled,
          executionModelId,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown pi agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "planning.answer": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      const activeRun = requireActiveRun(project, command.payload.runId);
      const pendingQuestion = activeRun.questions.find(
        (question) => question.id === command.payload.questionId && question.status === "pending"
      );
      if (!pendingQuestion) {
        throw new Error("Planning question is not pending");
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

      runtime.setProjectError(projectId, undefined);
      runtime.setProjectStreaming(projectId, true);
      runtime.clearStreaming(projectId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, adapter, {
          projectId,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          executionModelId:
            project.session.executionModelId && isModelIdForProvider(project.session.executionModelId, providerBrand)
              ? project.session.executionModelId
              : getDefaultExecutionModelId(providerBrand),
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown pi agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.execute": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
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
        await executeRunLifecycle(ws, command.requestId, runtime, repository, adapter, {
          projectId,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          runId: activeRun.id,
          readyPlan: buildReadyPlanFromRun(activeRun),
          executionPlan: activeRun.plan,
          abortSignal: abortController.signal
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown pi agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.resume": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
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
        await resumeRunLifecycle(ws, command.requestId, runtime, repository, adapter, {
          projectId,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          runId: activeRun.id,
          abortSignal: abortController.signal,
          guidanceText: command.payload.guidanceText,
          subagentIds: command.payload.subagentIds
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown pi agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.retry": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRetry(project, command.payload.runId);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project);

      const retryRun = requireRetryableRun(project, command.payload.runId);
      const providerBrand = repository.getProviderBrand();
      const executionModelId =
        retryRun.executionModelId && isModelIdForProvider(retryRun.executionModelId, providerBrand)
          ? retryRun.executionModelId
          : getDefaultExecutionModelId(providerBrand);
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
            retryRun.planningModelId ?? getDefaultPlanningModelId(providerBrand),
            command.payload.threadId
          );
          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);

          await continueRunLifecycle(ws, command.requestId, runtime, repository, adapter, {
            projectId,
            providerBrand,
            debugEnabled,
            executionModelId,
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
            retryRun.planningModelId ?? getDefaultPlanningModelId(providerBrand),
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
                task.worktreePath
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
                task.worktreePath
              );
            }
          }

          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);
          await executeInlineSubagentRetryLifecycle(ws, command.requestId, runtime, repository, adapter, {
            projectId,
            providerBrand,
            runId: nextRunId,
            sourceRun: retryRun,
            targetTask,
            readyPlan,
            abortSignal: abortController.signal
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown pi agent error";
        await handleRunFailure(ws, command.requestId, runtime, repository, projectId, message);
      } finally {
        runtime.setProjectStreaming(projectId, false);
        runtime.setAbortController(projectId, undefined);
      }

      return;
    }
    case "run.refresh": {
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
      repository.setPlanExecutionModeDefault(command.payload.planExecutionModeDefault);
      repository.setPlanExecutionDelaySecondsDefault(command.payload.planExecutionDelaySecondsDefault);
      repository.setCorrectnessIterationModeDefault(command.payload.correctnessIterationModeDefault);
      repository.setUiModeDefault(command.payload.uiModeDefault);

      sendEvent(ws, {
        type: "preferences.saved",
        requestId: command.requestId,
        payload: getPreferencesState(repository, adapter)
      });
      return;
    }
    case "preferences.clearApiKey": {
      repository.clearStoredOpenAiApiKey();
      repository.clearStoredGoogleApiKey();
      adapter.setApiKey("openai", undefined);
      adapter.setApiKey("google", undefined);

      sendEvent(ws, {
        type: "preferences.apiKeyCleared",
        requestId: command.requestId,
        payload: getPreferencesState(repository, adapter)
      });
      return;
    }
  }
}

async function continueRunLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  options: {
    projectId: ProjectId;
    providerBrand: "gpt" | "gemini";
    debugEnabled: boolean;
    executionModelId: string;
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
  const plannerTurn = await runPlannerTurn(adapter, {
    cwd: project.rootPath,
    sessionId: project.session.sessionId,
    messages: project.session.messages,
    latestUserPrompt: activeRun.latestUserPrompt,
    runId: activeRun.id,
    providerBrand: options.providerBrand,
    executionModelId: options.executionModelId,
    subagentWorktreeStrategy,
    planExecutionMode,
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode,
    mode,
    ruleSources,
    memorySummaries,
    priorQuestions: activeRun.questions,
    abortSignal: options.abortSignal,
    callbacks: createExecutionCallbacks(ws, requestId, runtime, repository, options.projectId, activeRun.id)
  });

  if (plannerTurn.plannerResult.type === "question") {
    const questionProject = repository.appendPlanningQuestion(options.projectId, activeRun.id, plannerTurn.plannerResult.question);
    runtime.upsertPersistedProject(questionProject);
    emitRunUpdated(ws, requestId, questionProject);

    runtime.setProjectStreaming(options.projectId, false);
    runtime.clearStreaming(options.projectId);
    const promptProject = repository.appendMessage(
      options.projectId,
      "assistant",
      plannerTurn.plannerResult.question.prompt
    );
    runtime.upsertPersistedProject(promptProject);
    emitMessageAppended(ws, requestId, runtime, options.projectId);
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
  emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
    sessionId: project.session.sessionId,
    stage: "plan-presented",
    message: "Presented execution plan to user",
    detail: plannerTurn.executionPlan.summary,
    modelId: plannerTurn.executionPlan.executionModelId
  });
}

async function resumeRunLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  options: {
    projectId: ProjectId;
    providerBrand: "gpt" | "gemini";
    debugEnabled: boolean;
    runId: string;
    abortSignal: AbortSignal;
    guidanceText?: string;
    subagentIds?: string[];
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

  await executeRunLifecycle(ws, requestId, runtime, repository, adapter, {
    projectId: options.projectId,
    providerBrand: options.providerBrand,
    debugEnabled: options.debugEnabled,
    runId: options.runId,
    readyPlan,
    executionPlan: activeRun.plan,
    existingSubagentResults: existingResults,
    tasksToRun,
    resumeNote: options.guidanceText,
    abortSignal: options.abortSignal
  });
}

async function executeRunLifecycle(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  options: {
    projectId: ProjectId;
    providerBrand: "gpt" | "gemini";
    debugEnabled: boolean;
    runId: string;
    readyPlan: PlannerReadyTurn;
    executionPlan?: ExecutionPlan;
    existingSubagentResults?: Parameters<typeof executeReadyRun>[1]["existingSubagentResults"];
    tasksToRun?: Parameters<typeof executeReadyRun>[1]["tasksToRun"];
    resumeNote?: string;
    abortSignal?: AbortSignal;
  }
) {
  const project = runtime.getProject(options.projectId);
  const baseExecutionPlan = options.executionPlan ?? buildExecutionPlanFromRun(requireActiveRun(project, options.runId), options.runId);
  const executionPlan = await completeExecutionPlanPrerequisites(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    project.session.sessionId,
    baseExecutionPlan,
    requireActiveRun(project, options.runId).planningModelId
  );
  const status = options.readyPlan.usesSubagents ? "running-subagents" : "running-main";
  const startedProject = repository.setAgentRunStatus(options.projectId, options.runId, status);
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdated(ws, requestId, startedProject);

  const outcome = await executeReadyRun(adapter, {
    cwd: project.rootPath,
    runId: options.runId,
    sessionId: project.session.sessionId,
    messages: project.session.messages,
    providerBrand: options.providerBrand,
    readyPlan: options.readyPlan,
    debugEnabled: options.debugEnabled,
    abortSignal: options.abortSignal,
    existingSubagentResults: options.existingSubagentResults,
    tasksToRun: options.tasksToRun,
    resumeNote: options.resumeNote,
    executionPlan,
    callbacks: createExecutionCallbacks(ws, requestId, runtime, repository, options.projectId, options.runId)
  });

  runtime.clearStreaming(options.projectId);
  runtime.setProjectStreaming(options.projectId, false);
  runtime.setProjectError(options.projectId, undefined);

  const correctnessReview = await runCorrectnessReview(project.rootPath, executionPlan, outcome, options.readyPlan);
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
      planningModelId: requireActiveRun(runtime.getProject(options.projectId), options.runId).planningModelId ?? getDefaultPlanningModelId(options.providerBrand),
      executionPlan: correctnessReview.recommendedPlan
    });

    if (
      correctnessReview.recommendedPlan.correctnessPolicy === "auto-once" &&
      correctnessReview.recommendedPlan.iteration <= 2
    ) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, {
        ...options,
        readyPlan: buildReadyPlanFromExecutionPlan(correctnessReview.recommendedPlan),
        executionPlan: correctnessReview.recommendedPlan
      });
      return;
    }

    if (
      correctnessReview.recommendedPlan.correctnessPolicy === "auto-until-clean" &&
      correctnessReview.recommendedPlan.iteration < 5
    ) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, {
        ...options,
        readyPlan: buildReadyPlanFromExecutionPlan(correctnessReview.recommendedPlan),
        executionPlan: correctnessReview.recommendedPlan
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
  options: {
    projectId: ProjectId;
    providerBrand: "gpt" | "gemini";
    runId: string;
    sourceRun: AgentRunState;
    targetTask: PlannerReadyTurn["subtasks"][number];
    readyPlan: PlannerReadyTurn;
    abortSignal: AbortSignal;
  }
) {
  const project = runtime.getProject(options.projectId);
  const startedProject = repository.setAgentRunStatus(options.projectId, options.runId, "running-subagents");
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdated(ws, requestId, startedProject);

  const callbacks = createExecutionCallbacks(ws, requestId, runtime, repository, options.projectId, options.runId);
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
  runId: string
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
              result.worktreePath
            )
          : repository.markSubtaskFailed(
              projectId,
              runId,
              result.id,
              result.errorMessage ?? "Unknown subagent failure",
              result.attemptCount,
              result.worktreePath
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
    }
  };
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
          prompt: basePrompt
        },
        continuationRequest: {
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: ["continue", "", basePrompt].join("\n")
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
  projectId: ProjectId,
  message: string
) {
  const project = runtime.getProject(projectId);
  if (project.activeRun) {
    const failedProject = repository.setAgentRunStatus(projectId, project.activeRun.id, "failed", message);
    runtime.upsertPersistedProject(failedProject);
    emitRunUpdated(ws, requestId, failedProject);
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
      message: "Pi agent execution failed",
      detail: message
    }
  });

  debugLog("chat.error", {
    projectId,
    detail: message
  });
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
  runtime.setProjectPlan(projectId, createAgentPlanFromExecutionPlan(sessionId, planningModelId ?? executionPlan.planningModelId, executionPlan));
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
  return {
    ...basePlan,
    origin: "correctness-followup",
    iteration: basePlan.iteration + 1,
    summary: gaps.map((gap) => gap.description).join(" "),
    finalExecutionBrief: [
      "Fix correctness gaps from prior implementation.",
      ...gaps.map((gap) => `${gap.category}: ${gap.suggestedFix}`)
    ].join("\n"),
    route: gaps.some((gap) => gap.canParallelize) && gaps.length > 1 ? "pi-subagents" : "main",
    targetSubagentCount: gaps.some((gap) => gap.canParallelize) ? Math.min(10, Math.max(2, gaps.length)) : 0,
    actualSubagentCount: gaps.some((gap) => gap.canParallelize) && gaps.length > 1 ? Math.min(10, gaps.length) : 0,
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

  const agentPlan = createAgentPlanFromExecutionPlan(input.sessionId, input.planningModelId, input.executionPlan);
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

function createAgentPlanFromExecutionPlan(sessionId: string, planningModelId: string, executionPlan: ExecutionPlan): AgentPlan {
  return {
    sessionId,
    agentId: "pi",
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

function getPreferencesState(repository: WorkspaceRepository, adapter: PiAgentAdapter): PreferencesState {
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
    planExecutionModeDefault: repository.getPlanExecutionModeDefault(),
    planExecutionDelaySecondsDefault: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationModeDefault: repository.getCorrectnessIterationModeDefault(),
    uiModeDefault: repository.getUiModeDefault(),
    attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
    capabilities: defaultProviderCapabilities
  };
}

function isModelIdForProvider(modelId: string | undefined, providerBrand: "gpt" | "gemini") {
  if (!modelId) {
    return false;
  }

  return providerBrand === "gemini" ? modelId.startsWith("google/") : modelId.startsWith("openai/");
}
