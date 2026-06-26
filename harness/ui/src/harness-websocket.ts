import { createRequestId, parseServerEventFrame, type ClientCommand, type PreferencesState } from "../../shared/protocol";
import {
  canSelectProviderBrand,
  getBrowserUiSessionRestoreCommands,
  harnessStore,
  type LocalPreferencesState,
  persistMergedLocalPreferences,
  readBrowserUiSession,
  readLocalPreferences
} from "./harness-store";
import { openBackgroundRunInJobsPane } from "./background-run-navigation";
import { recordUiTelemetry } from "./lib/ui-telemetry";
import { openAgentRunSource, openAssistantSource, openPreferencesSectionSource, openProjectThreadSource } from "./source-navigation";
import { terminalStore } from "./terminal/terminal-store";
import { ideStore } from "./ide/ide-store";
import { closeAllTerminalSockets, openTerminalSocket } from "./terminal/terminal-transport";
import { pushToast, reportUiError } from "./toast-store";

type HarnessSocket = {
  sendCommand: (command: ClientCommand) => void;
  dispose: () => void;
};

type PreferencesSaveCommand = Extract<ClientCommand, { type: "preferences.save" }>;

const ptySockets = new Map<string, WebSocket>();
const notifiedBackgroundRunStatuses = new Map<string, string>();
const CONTROL_HEARTBEAT_INTERVAL_MS = 15_000;
const CLI_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CONTROL_MISSED_PONG_LIMIT = 2;
const PTY_HEARTBEAT = 0x00;
const MAX_PENDING_CONTROL_COMMANDS = 100;
const CONTROL_RECONNECT_DELAY_MS = 1_000;

export function connectHarnessWebSocket(endpoint: string = getDefaultEndpoint()): HarnessSocket {
  harnessStore.setConnectionState("connecting");
  let socket: WebSocket | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let cliUpdateTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let missedPongs = 0;
  let disposed = false;
  const pendingCommands: ClientCommand[] = [];

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  };
  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!socket || socket.readyState !== globalThis.WebSocket.OPEN) {
        return;
      }
      if (missedPongs === 1) {
        harnessStore.setConnectionState("stale", "Waiting for server heartbeat");
      }
      if (missedPongs >= CONTROL_MISSED_PONG_LIMIT) {
        socket.close();
        return;
      }
      socket.send(
        JSON.stringify({
          type: "connection.ping",
          requestId: createRequestId(),
          payload: {
            timestamp: Date.now()
          }
        } satisfies ClientCommand)
      );
      missedPongs += 1;
    }, CONTROL_HEARTBEAT_INTERVAL_MS);
  };
  const stopCliUpdateChecks = () => {
    if (cliUpdateTimer) {
      clearInterval(cliUpdateTimer);
      cliUpdateTimer = undefined;
    }
  };
  const requestCliUpdateCheck = () => {
    if (!harnessStore.state.checkCliUpdatesDefault || !socket || socket.readyState !== globalThis.WebSocket.OPEN) {
      return;
    }
    sendRaw({
      type: "cli-updates.check",
      requestId: createRequestId()
    } satisfies ClientCommand);
  };
  const startCliUpdateChecks = () => {
    stopCliUpdateChecks();
    requestCliUpdateCheck();
    cliUpdateTimer = setInterval(requestCliUpdateCheck, CLI_UPDATE_CHECK_INTERVAL_MS);
  };

  const stopReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) {
      return;
    }
    harnessStore.setConnectionState("connecting", "Reconnecting to workspace");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      openControlSocket();
    }, CONTROL_RECONNECT_DELAY_MS);
  };

  const sendRaw = (command: ClientCommand) => {
    if (!socket || socket.readyState !== globalThis.WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(command));
    return true;
  };

  const flushPendingCommands = () => {
    while (pendingCommands.length > 0 && socket?.readyState === globalThis.WebSocket.OPEN) {
      const command = pendingCommands.shift();
      if (command) {
        sendRaw(command);
      }
    }
  };

  const queueCommand = (command: ClientCommand) => {
    pendingCommands.push(command);
    if (pendingCommands.length > MAX_PENDING_CONTROL_COMMANDS) {
      pendingCommands.splice(0, pendingCommands.length - MAX_PENDING_CONTROL_COMMANDS);
    }
    if (!socket || socket.readyState === globalThis.WebSocket.CLOSED || socket.readyState === globalThis.WebSocket.CLOSING) {
      scheduleReconnect();
    }
  };

  const openControlSocket = () => {
    stopHeartbeat();
    stopCliUpdateChecks();
    stopReconnect();
    if (disposed) {
      return;
    }
    harnessStore.setConnectionState("connecting");
    socket = new globalThis.WebSocket(endpoint);

    socket.addEventListener("open", () => {
      stopReconnect();
      harnessStore.setConnectionState("connected");
      missedPongs = 0;
      startHeartbeat();
      sendRaw({
        type: "agent.list",
        requestId: createRequestId()
      } satisfies ClientCommand);
      flushPendingCommands();
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsedEvents = parseServerEventFrame(JSON.parse(event.data));
        for (const parsed of parsedEvents) {
          const browserUiSession = readBrowserUiSession();
          recordUiTelemetry("websocket.event", {
            type: parsed.type,
            requestId: readTelemetryField(parsed, "requestId"),
            projectId: readTelemetryPayloadField(parsed, "projectId"),
            threadId: readTelemetryPayloadField(parsed, "threadId")
          });
          if (parsed.type === "connection.pong") {
            missedPongs = 0;
            harnessStore.setConnectionState("connected");
          }
          const wasExecutionPaused = harnessStore.state.executionControl.isPaused;
          const previousRun =
            parsed.type === "run.updated" ||
            parsed.type === "chat.error" ||
            parsed.type === "chat.message-appended" ||
            parsed.type === "thread.message-appended"
              ? harnessStore.state.workspace.projects.find((project) => project.id === parsed.payload.projectId)?.activeRun
              : undefined;
          harnessStore.applyServerEvent(parsed);
          terminalStore.applyServerEvent(parsed);
          ideStore.applyServerEvent(parsed);

          if (parsed.type === "connection.ready") {
        const localPreferences = readLocalPreferences();
        const needsProviderSync =
          (localPreferences.openAiApiKey && !parsed.payload.preferences.hasStoredOpenAiApiKey) ||
          (localPreferences.googleApiKey && !parsed.payload.preferences.hasStoredGoogleApiKey) ||
          (localPreferences.anthropicApiKey && !parsed.payload.preferences.hasStoredAnthropicApiKey);
        const needsPreferenceSync = hasLocalServerPreferenceOverride(localPreferences, parsed.payload.preferences);
        const restoreCommands = getBrowserUiSessionRestoreCommands(harnessStore.state, browserUiSession);
        let providerFallbackApplied = false;

        if (!needsProviderSync && !canSelectProviderBrand(harnessStore.state, harnessStore.state.providerBrand)) {
          const fallbackProviderBrand = canSelectProviderBrand(harnessStore.state, "gpt")
            ? "gpt"
            : canSelectProviderBrand(harnessStore.state, "gemini")
              ? "gemini"
              : "claude";
          harnessStore.setProviderBrand(fallbackProviderBrand);
          persistMergedLocalPreferences({
            openAiApiKey: harnessStore.state.openAiApiKeyDraft.trim() || undefined,
            googleApiKey: harnessStore.state.googleApiKeyDraft.trim() || undefined,
            anthropicApiKey: harnessStore.state.anthropicApiKeyDraft.trim() || undefined,
            providerBrand: fallbackProviderBrand,
            debugEnabled: harnessStore.state.debugEnabled,
            tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
            subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
            blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
            dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
            autoCompactContextThresholdPercentDefault: harnessStore.state.autoCompactContextThresholdPercentDefault,
            planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
            planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
            singleAgentModelPreferenceDefault: harnessStore.state.singleAgentModelPreferenceDefault,
            subagentModelPreferenceDefault: harnessStore.state.subagentModelPreferenceDefault,
            correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
            backgroundJobApprovalPolicyDefault: harnessStore.state.backgroundJobApprovalPolicyDefault,
            assistantAutoApproveNonBlockingQuestionsDefault:
              harnessStore.state.assistantAutoApproveNonBlockingQuestionsDefault,
            assistantCongestionControlEnabledDefault: harnessStore.state.assistantCongestionControlEnabledDefault,
            assistantMaxCongestionDefault: harnessStore.state.assistantMaxCongestionDefault,
            autoArchiveCompletedThreadsDefault: harnessStore.state.autoArchiveCompletedThreadsDefault,
            memoryBankEnabledDefault: harnessStore.state.memoryBankEnabledDefault,
            memoryBankRecordRunsDefault: harnessStore.state.memoryBankRecordRunsDefault,
            checkCliUpdatesDefault: harnessStore.state.checkCliUpdatesDefault,
            backgroundJobNotificationsEnabled: harnessStore.state.backgroundJobNotificationsEnabled
          });
          providerFallbackApplied = true;
        }

        if (needsProviderSync || needsPreferenceSync || providerFallbackApplied) {
          sendRaw(createPreferencesSaveCommand(createRequestId(), localPreferences, Boolean(needsProviderSync)));
        }

        for (const restoreCommand of restoreCommands) {
          sendRaw(restoreCommand);
        }
        flushPendingCommands();
        startCliUpdateChecks();
      }

          if (parsed.type === "preferences.saved" || parsed.type === "preferences.apiKeyCleared") {
        persistMergedLocalPreferences({
          openAiApiKey:
            parsed.type === "preferences.apiKeyCleared" ? undefined : harnessStore.state.openAiApiKeyDraft.trim() || undefined,
          googleApiKey:
            parsed.type === "preferences.apiKeyCleared" ? undefined : harnessStore.state.googleApiKeyDraft.trim() || undefined,
          anthropicApiKey:
            parsed.type === "preferences.apiKeyCleared" ? undefined : harnessStore.state.anthropicApiKeyDraft.trim() || undefined,
          providerBrand: harnessStore.state.providerBrand,
          debugEnabled: harnessStore.state.debugEnabled,
          tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
          subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
          blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
          dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
          autoCompactContextThresholdPercentDefault: harnessStore.state.autoCompactContextThresholdPercentDefault,
          planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
          planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
          singleAgentModelPreferenceDefault: harnessStore.state.singleAgentModelPreferenceDefault,
          subagentModelPreferenceDefault: harnessStore.state.subagentModelPreferenceDefault,
          correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
          backgroundJobApprovalPolicyDefault: harnessStore.state.backgroundJobApprovalPolicyDefault,
          assistantAutoApproveNonBlockingQuestionsDefault:
            harnessStore.state.assistantAutoApproveNonBlockingQuestionsDefault,
          assistantCongestionControlEnabledDefault: harnessStore.state.assistantCongestionControlEnabledDefault,
          assistantMaxCongestionDefault: harnessStore.state.assistantMaxCongestionDefault,
          autoArchiveCompletedThreadsDefault: harnessStore.state.autoArchiveCompletedThreadsDefault,
          memoryBankEnabledDefault: harnessStore.state.memoryBankEnabledDefault,
          memoryBankRecordRunsDefault: harnessStore.state.memoryBankRecordRunsDefault,
          checkCliUpdatesDefault: harnessStore.state.checkCliUpdatesDefault,
          backgroundJobNotificationsEnabled: harnessStore.state.backgroundJobNotificationsEnabled
        });
        if (parsed.type === "preferences.saved") {
          requestCliUpdateCheck();
        }
      }

      if (parsed.type === "chat.error") {
        const errorProjectId = parsed.payload.projectId;
        const errorThreadId = parsed.payload.threadId;
        reportUiError(parsed.payload.detail ?? parsed.payload.message, parsed.payload.message, {
          projectId: errorProjectId,
          onClick:
            errorProjectId && errorThreadId
              ? () => openProjectThreadSource(harnessStore.state, errorProjectId, errorThreadId, "chat")
              : undefined
        });
      }

      if (parsed.type === "run.preflight") {
        pushToast("Git dirty warning", parsed.payload.preflight.message, "info", () =>
          openProjectThreadSource(harnessStore.state, parsed.payload.projectId, parsed.payload.threadId, "chat")
        );
      }

      if (parsed.type === "cli-updates.checked") {
        for (const update of parsed.payload.updates) {
          pushToast(
            `${update.label} update available`,
            `${update.currentVersion} -> ${update.latestVersion}`,
            "info",
            () => {
              openPreferencesSectionSource("developer-advanced");
              sendRaw({
                  type: "cli-updates.install",
                  requestId: createRequestId(),
                  payload: {
                    agentId: update.agentId
                  }
                } satisfies ClientCommand);
            }
          );
        }
      }

      if (parsed.type === "cli-updates.installed") {
        pushToast(`${parsed.payload.label} updated`, parsed.payload.output || "Update complete.", "info", () =>
          openPreferencesSectionSource("developer-advanced")
        );
      }

      if (parsed.type === "command.rejected") {
        reportUiError(parsed.payload.detail ?? parsed.payload.message, parsed.payload.message, {
          rethrow: "dev-only"
        });
      }

      if (parsed.type === "cli-session.started") {
        harnessStore.resetCliTerminalOutput(parsed.payload.session.id);
      }

      if (parsed.type === "cli-session.attach-ready") {
        openCliSessionSocket(
          endpoint,
          parsed.payload.sessionId,
          parsed.payload.attachToken.clientId,
          parsed.payload.attachToken.token
        );
      }

      if (parsed.type === "terminal.session.attach-ready") {
        openTerminalSocket(
          endpoint,
          parsed.payload.sessionId,
          parsed.payload.attachToken.clientId,
          parsed.payload.attachToken.token
        );
      }

      if (parsed.type === "cli-session.exited") {
        closeCliSessionSocket(parsed.payload.session.id);
      }

      if (parsed.type === "background-job-run.updated") {
        notifyBackgroundRun(parsed.payload.run.id);
      }

      if (
        parsed.type === "assistant.question.updated" &&
        parsed.payload.question.status === "pending" &&
        !harnessStore.state.executionControl.isPaused
      ) {
        const assistant = harnessStore.state.assistants.assistants.find((entry) => entry.id === parsed.payload.question.assistantId);
        pushToast("Assistant needs input", `${assistant?.name ?? "Assistant"} | ${parsed.payload.question.prompt}`, "info", () =>
          openAssistantSource(harnessStore.state, parsed.payload.question.assistantId, "questions")
        );
      }

      if (parsed.type === "assistant.log.appended" && parsed.payload.entry.level === "critical") {
        const assistant = harnessStore.state.assistants.assistants.find((entry) => entry.id === parsed.payload.entry.assistantId);
        pushToast(
          "Assistant paused",
          `${assistant?.name ?? "Assistant"} | ${parsed.payload.entry.detail ?? parsed.payload.entry.summary}`,
          "error",
          () => {
            openAssistantSource(harnessStore.state, parsed.payload.entry.assistantId, "log");
            harnessStore.setAssistantLogDetailsId(parsed.payload.entry.id);
          }
        );
      }

      if (parsed.type === "assistant.created-card") {
        pushToast("Assistant ready", `${parsed.payload.assistant.name} opened in assistants surface.`, "info", () =>
          openAssistantSource(harnessStore.state, parsed.payload.assistant.id, "chat")
        );
      }

      if (parsed.type === "execution-control.updated" && wasExecutionPaused !== parsed.payload.executionControl.isPaused) {
        pushToast(
          parsed.payload.executionControl.isPaused ? "Executions paused" : "Executions resumed",
          parsed.payload.executionControl.isPaused
            ? "Running work continues. New follow-up prompts wait for resume."
            : "Queued prompts and approvals are available again.",
          "info",
          () => openPreferencesSectionSource("safety-guardrails")
        );
      }

      if (parsed.type === "run.updated" && previousRun?.status !== parsed.payload.run.status) {
        const nextProject = harnessStore.state.workspace.projects.find((project) => project.id === parsed.payload.projectId);
        const hasPendingPlanningQuestion = nextProject?.activeRun?.questions.some((question) => question.status === "pending");
        if (parsed.payload.run.status === "awaiting-user-input" && hasPendingPlanningQuestion && !harnessStore.state.executionControl.isPaused) {
          pushToast("Planner needs input", "Answer the planning question in the chat composer.", "info", () =>
            openAgentRunSource(harnessStore.state, parsed.payload.projectId, parsed.payload.run, "chat")
          );
        }

        if (parsed.payload.run.status === "partial-complete") {
          pushToast("Partial result ready", "Some subagents failed. Review output, then resume failed agents.", "error", () =>
            openAgentRunSource(harnessStore.state, parsed.payload.projectId, parsed.payload.run, "run")
          );
        }

        if (parsed.payload.run.status === "failed" && parsed.payload.run.resumable) {
          pushToast("Run failed", "Completed work was saved. Resume failed agents when ready.", "error", () =>
            openAgentRunSource(harnessStore.state, parsed.payload.projectId, parsed.payload.run, "run")
          );
        }
      }
      }
      } catch (error) {
        harnessStore.setConnectionState(
          "error",
          error instanceof Error ? error.message : "Invalid server event"
        );
        reportUiError(error, "Invalid server event", { rethrow: "never" });
      }
    });

    socket.addEventListener("close", () => {
      stopHeartbeat();
      stopCliUpdateChecks();
      if (disposed) {
        harnessStore.setConnectionState("disconnected");
        return;
      }
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      harnessStore.setConnectionState("error", "Websocket connection failed");
      reportUiError("Websocket connection failed", "Connection error");
    });
  };

  openControlSocket();

  return {
    sendCommand(command) {
      if (!socket || socket.readyState !== globalThis.WebSocket.OPEN) {
        if (!disposed) {
          queueCommand(command);
          return;
        }
        const error = new Error("Websocket is not connected");
        reportUiError(error, "Command send failed", { rethrow: "dev-only" });
        throw error;
      }

      sendRaw(command);
    },
    dispose() {
      disposed = true;
      stopHeartbeat();
      stopCliUpdateChecks();
      stopReconnect();
      pendingCommands.length = 0;
      socket?.close();
      for (const ptySocket of ptySockets.values()) {
        ptySocket.close();
      }
      ptySockets.clear();
      closeAllTerminalSockets();
    }
  };
}

function readTelemetryField(input: unknown, key: string) {
  return isTelemetryRecord(input) && typeof input[key] === "string" ? input[key] : undefined;
}

function readTelemetryPayloadField(input: unknown, key: string) {
  if (!isTelemetryRecord(input) || !isTelemetryRecord(input.payload)) {
    return undefined;
  }
  return typeof input.payload[key] === "string" ? input.payload[key] : undefined;
}

function isTelemetryRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

export function sendCliSessionInput(sessionId: string, input: string | Uint8Array) {
  const socket = ptySockets.get(sessionId);
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(toWebSocketBuffer(input));
  return true;
}

function toWebSocketBuffer(input: string | Uint8Array): ArrayBuffer {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return new Uint8Array(bytes).buffer;
}

export function closeCliSessionSocket(sessionId: string) {
  const socket = ptySockets.get(sessionId);
  if (!socket) {
    return;
  }

  socket.close();
  ptySockets.delete(sessionId);
  harnessStore.setCliTerminalConnected(sessionId, false);
}

export function notifyBackgroundRun(runId: string) {
  const state = harnessStore.state;
  const run = state.backgroundJobs.runs.find((entry) => entry.id === runId);
  if (!run) {
    return;
  }

  if (run.status !== "succeeded" && run.status !== "partial-complete" && run.status !== "failed" && run.status !== "awaiting-approval") {
    notifiedBackgroundRunStatuses.delete(run.id);
    return;
  }

  const previousNotifiedStatus = notifiedBackgroundRunStatuses.get(run.id);
  if (previousNotifiedStatus === run.status) {
    return;
  }
  notifiedBackgroundRunStatuses.set(run.id, run.status);

  const jobName = state.backgroundJobs.jobs.find((job) => job.id === run.jobId)?.name ?? run.jobId;
  const title =
    run.status === "succeeded"
      ? "Background task done"
      : run.status === "partial-complete"
      ? "Background task partially done"
      : run.status === "failed"
      ? "Background task failed"
      : "Background task needs approval";
  const body = run.summary ?? run.failureMessage ?? jobName;
  const openRun = () => openBackgroundRunInJobsPane(harnessStore.state, run.id, run.jobId);

  pushToast(
    title,
    `${jobName} | ${body}`,
    run.status === "failed" ? "error" : run.status === "partial-complete" ? "warning" : "info",
    openRun
  );
  if (!state.backgroundJobNotificationsEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification(title, {
    body: `${jobName} | ${body}`
  });
  notification.onclick = () => {
    window.focus();
    openRun();
    notification.close();
  };
}

export function hasLocalServerPreferenceOverride(
  localPreferences: LocalPreferencesState,
  serverPreferences: PreferencesState
) {
  return [
    differs(localPreferences.providerBrand, serverPreferences.providerBrand),
    differs(localPreferences.debugEnabled, serverPreferences.debugEnabledDefault),
    differs(localPreferences.tracePanelDefaultOpen, serverPreferences.tracePanelDefaultOpen),
    differs(localPreferences.subagentWorktreeStrategyDefault, serverPreferences.subagentWorktreeStrategyDefault),
    differs(localPreferences.blockChatOnDirtyGitDefault, serverPreferences.blockChatOnDirtyGitDefault),
    differs(localPreferences.dirtyGitChangeLimitDefault, serverPreferences.dirtyGitChangeLimitDefault),
    differs(localPreferences.autoCompactContextThresholdPercentDefault, serverPreferences.autoCompactContextThresholdPercentDefault),
    differs(localPreferences.planExecutionModeDefault, serverPreferences.planExecutionModeDefault),
    differs(localPreferences.planExecutionDelaySecondsDefault, serverPreferences.planExecutionDelaySecondsDefault),
    differs(localPreferences.singleAgentModelPreferenceDefault, serverPreferences.singleAgentModelPreferenceDefault),
    differs(localPreferences.subagentModelPreferenceDefault, serverPreferences.subagentModelPreferenceDefault),
    differs(localPreferences.correctnessIterationModeDefault, serverPreferences.correctnessIterationModeDefault),
    differs(localPreferences.backgroundJobApprovalPolicyDefault, serverPreferences.backgroundJobApprovalPolicyDefault),
    differs(
      localPreferences.assistantAutoApproveNonBlockingQuestionsDefault,
      serverPreferences.assistantAutoApproveNonBlockingQuestionsDefault
    ),
    differs(localPreferences.assistantCongestionControlEnabledDefault, serverPreferences.assistantCongestionControlEnabledDefault),
    differs(localPreferences.assistantMaxCongestionDefault, serverPreferences.assistantMaxCongestionDefault),
    differs(localPreferences.autoArchiveCompletedThreadsDefault, serverPreferences.autoArchiveCompletedThreadsDefault),
    differs(localPreferences.memoryBankEnabledDefault, serverPreferences.memoryBankEnabledDefault),
    differs(localPreferences.memoryBankRecordRunsDefault, serverPreferences.memoryBankRecordRunsDefault),
    differs(localPreferences.checkCliUpdatesDefault, serverPreferences.checkCliUpdatesDefault)
  ].some(Boolean);
}

function differs<T>(localValue: T | undefined, serverValue: T | undefined) {
  return localValue !== undefined && localValue !== serverValue;
}

function createPreferencesSaveCommand(
  requestId: string,
  localPreferences: LocalPreferencesState,
  includeApiKeys: boolean
): PreferencesSaveCommand {
  return {
    type: "preferences.save",
    requestId,
    payload: {
      openAiApiKey: includeApiKeys ? localPreferences.openAiApiKey : undefined,
      googleApiKey: includeApiKeys ? localPreferences.googleApiKey : undefined,
      anthropicApiKey: includeApiKeys ? localPreferences.anthropicApiKey : undefined,
      providerBrand: harnessStore.state.providerBrand,
      debugEnabled: harnessStore.state.debugEnabled,
      tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: harnessStore.state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: harnessStore.state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: harnessStore.state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: harnessStore.state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault:
        harnessStore.state.assistantAutoApproveNonBlockingQuestionsDefault,
      assistantCongestionControlEnabledDefault: harnessStore.state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: harnessStore.state.assistantMaxCongestionDefault,
      autoArchiveCompletedThreadsDefault: harnessStore.state.autoArchiveCompletedThreadsDefault,
      memoryBankEnabledDefault: harnessStore.state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: harnessStore.state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: harnessStore.state.checkCliUpdatesDefault
    }
  };
}

function getDefaultEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

function openCliSessionSocket(controlEndpoint: string, sessionId: string, clientId: string, token: string) {
  closeCliSessionSocket(sessionId);
  const url = new URL(controlEndpoint);
  url.pathname = "/ws/pty";
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("token", token);

  const socket = new globalThis.WebSocket(url);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => {
    harnessStore.setCliTerminalConnected(sessionId, true);
  });
  socket.addEventListener("message", (event) => {
    if (!(event.data instanceof ArrayBuffer)) {
      return;
    }

    const frame = new Uint8Array(event.data);
    const streamId = frame[0];
    if (streamId === PTY_HEARTBEAT) {
      socket.send(new Uint8Array([PTY_HEARTBEAT]));
      return;
    }
    const text = new TextDecoder().decode(frame.slice(1));
    harnessStore.appendCliTerminalOutput(sessionId, streamId === 0x02 ? "stderr" : "stdout", text);
  });
  socket.addEventListener("close", () => {
    ptySockets.delete(sessionId);
    harnessStore.setCliTerminalConnected(sessionId, false);
  });
  ptySockets.set(sessionId, socket);
}
