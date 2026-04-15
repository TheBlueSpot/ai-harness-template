import { createRequestId, parseServerEvent, type ClientCommand } from "../../shared/protocol";
import {
  canSelectProviderBrand,
  harnessStore,
  persistLocalPreferences,
  readLocalPreferences
} from "./harness-store";
import { pushToast, reportUiError } from "./toast-store";

type HarnessSocket = {
  sendCommand: (command: ClientCommand) => void;
  dispose: () => void;
};

export function connectHarnessWebSocket(endpoint: string = getDefaultEndpoint()): HarnessSocket {
  harnessStore.setConnectionState("connecting");
  const socket = new WebSocket(endpoint);

  socket.addEventListener("open", () => {
    harnessStore.setConnectionState("connected");
    socket.send(
      JSON.stringify({
        type: "agent.list",
        requestId: createRequestId()
      } satisfies ClientCommand)
    );
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = parseServerEvent(JSON.parse(event.data));
      const previousRun =
        parsed.type === "run.updated" || parsed.type === "chat.error" || parsed.type === "chat.message-appended"
          ? harnessStore.state.workspace.projects.find((project) => project.id === parsed.payload.projectId)?.activeRun
          : undefined;
      harnessStore.applyServerEvent(parsed);

      if (parsed.type === "connection.ready") {
        const localPreferences = readLocalPreferences();
        const needsProviderSync =
          (localPreferences.openAiApiKey && !parsed.payload.preferences.hasStoredOpenAiApiKey) ||
          (localPreferences.googleApiKey && !parsed.payload.preferences.hasStoredGoogleApiKey);

        if (needsProviderSync) {
          socket.send(
            JSON.stringify({
              type: "preferences.save",
              requestId: createRequestId(),
              payload: {
                openAiApiKey: localPreferences.openAiApiKey,
                googleApiKey: localPreferences.googleApiKey,
                providerBrand: harnessStore.state.providerBrand,
                debugEnabled: harnessStore.state.debugEnabled,
                tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
                subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
                blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
                dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
                planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
                planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
                correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
                uiModeDefault: harnessStore.state.uiMode
              }
            } satisfies ClientCommand)
          );
        } else if (!canSelectProviderBrand(harnessStore.state, harnessStore.state.providerBrand)) {
          const fallbackProviderBrand = canSelectProviderBrand(harnessStore.state, "gpt") ? "gpt" : "gemini";
          harnessStore.setProviderBrand(fallbackProviderBrand);
          persistLocalPreferences({
            openAiApiKey: harnessStore.state.openAiApiKeyDraft.trim() || undefined,
            googleApiKey: harnessStore.state.googleApiKeyDraft.trim() || undefined,
            providerBrand: fallbackProviderBrand,
            debugEnabled: harnessStore.state.debugEnabled,
            tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
            subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
            blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
            dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
            planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
            planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
            correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
            uiMode: harnessStore.state.uiMode
          });
        }
      }

      if (parsed.type === "preferences.saved" || parsed.type === "preferences.apiKeyCleared") {
        persistLocalPreferences({
          openAiApiKey:
            parsed.type === "preferences.apiKeyCleared" ? undefined : harnessStore.state.openAiApiKeyDraft.trim() || undefined,
          googleApiKey:
            parsed.type === "preferences.apiKeyCleared" ? undefined : harnessStore.state.googleApiKeyDraft.trim() || undefined,
          providerBrand: harnessStore.state.providerBrand,
          debugEnabled: harnessStore.state.debugEnabled,
          tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
          subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
          blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
          dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
          planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
          planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
          correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
          uiMode: harnessStore.state.uiMode
        });
      }

      if (parsed.type === "chat.error") {
        reportUiError(parsed.payload.detail ?? parsed.payload.message, parsed.payload.message, {
          projectId: parsed.payload.projectId
        });
      }

      if (parsed.type === "run.preflight") {
        pushToast("Git dirty warning", parsed.payload.preflight.message);
      }

      if (parsed.type === "command.rejected") {
        reportUiError(parsed.payload.detail ?? parsed.payload.message, parsed.payload.message, {
          rethrow: "dev-only"
        });
      }

      if (parsed.type === "run.updated" && previousRun?.status !== parsed.payload.run.status) {
        if (parsed.payload.run.status === "awaiting-user-input") {
          pushToast("Planner needs input", "Answer the planning question in the chat composer.");
        }

        if (parsed.payload.run.status === "partial-complete") {
          pushToast("Partial result ready", "Some subagents failed. Review output, then resume failed agents.", "error");
        }

        if (parsed.payload.run.status === "failed" && parsed.payload.run.resumable) {
          pushToast("Run failed", "Completed work was saved. Resume failed agents when ready.", "error");
        }
      }
    } catch (error) {
      harnessStore.setConnectionState(
        "error",
        error instanceof Error ? error.message : "Invalid server event"
      );
      reportUiError(error, "Invalid server event", { rethrow: "dev-only" });
    }
  });

  socket.addEventListener("close", () => {
    harnessStore.setConnectionState("disconnected");
  });

  socket.addEventListener("error", () => {
    harnessStore.setConnectionState("error", "Websocket connection failed");
    reportUiError("Websocket connection failed", "Connection error");
  });

  return {
    sendCommand(command) {
      if (socket.readyState !== WebSocket.OPEN) {
        const error = new Error("Websocket is not connected");
        reportUiError(error, "Command send failed", { rethrow: "dev-only" });
        throw error;
      }

      socket.send(JSON.stringify(command));
    },
    dispose() {
      socket.close();
    }
  };
}

function getDefaultEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}
