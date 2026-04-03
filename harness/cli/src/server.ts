import {
  createChatMessage,
  createRequestId,
  createSessionId,
  parseClientCommand,
  type ClientCommand,
  type ServerEvent,
  type SessionId
} from "../../shared/protocol";
import { listOpenAiModels, createAssistantFallbackMessage, runOpenAiCliConversation } from "./openai-cli-adapter";
import { SessionStore } from "./session-store";

type HarnessConnection = {
  sessionId: SessionId;
};

type HarnessServerOptions = {
  port: number;
};

export function startHarnessServer({ port }: HarnessServerOptions) {
  const sessions = new SessionStore();

  const server = Bun.serve<HarnessConnection>({
    port,
    fetch(request, serverInstance) {
      const upgradeHeader = request.headers.get("upgrade");

      if (upgradeHeader?.toLowerCase() !== "websocket") {
        return new Response("Harness CLI websocket endpoint", { status: 200 });
      }

      const sessionId = createSessionId();
      const upgraded = serverInstance.upgrade(request, {
        data: { sessionId }
      });

      if (!upgraded) {
        return new Response("Websocket upgrade failed", { status: 400 });
      }

      return undefined;
    },
    websocket: {
      open(ws) {
        const state = sessions.getOrCreate(ws.data.sessionId);
        const event: ServerEvent = {
          type: "connection.ready",
          payload: {
            sessionId: ws.data.sessionId,
            models: listOpenAiModels(),
            state
          }
        };

        ws.send(JSON.stringify(event));
      },
      message(ws, message) {
        const text = typeof message === "string" ? message : new TextDecoder().decode(message);

        let command: ClientCommand;

        try {
          command = parseClientCommand(JSON.parse(text));
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: "command.rejected",
              requestId: createRequestId(),
              payload: {
                message: "Invalid websocket command",
                detail: error instanceof Error ? error.message : "Unknown parse error"
              }
            } satisfies ServerEvent)
          );
          return;
        }

        void handleCommand(ws, command, sessions);
      },
      close(ws) {
        sessions.getAbortController(ws.data.sessionId)?.abort();
      }
    }
  });

  console.log(`Harness CLI server listening on ws://localhost:${server.port}`);
  return server;
}

async function handleCommand(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  command: ClientCommand,
  sessions: SessionStore
) {
  switch (command.type) {
    case "connection.ping": {
      ws.send(
        JSON.stringify({
          type: "connection.pong",
          requestId: command.requestId,
          payload: command.payload
        } satisfies ServerEvent)
      );
      return;
    }
    case "model.list": {
      ws.send(
        JSON.stringify({
          type: "model.list",
          requestId: command.requestId,
          payload: {
            models: listOpenAiModels()
          }
        } satisfies ServerEvent)
      );
      return;
    }
    case "session.reset": {
      const state = sessions.reset(command.payload.sessionId);
      ws.send(
        JSON.stringify({
          type: "session.reset",
          requestId: command.requestId,
          payload: {
            sessionId: command.payload.sessionId,
            state
          }
        } satisfies ServerEvent)
      );
      return;
    }
    case "chat.stop": {
      sessions.getAbortController(command.payload.sessionId)?.abort();
      sessions.setStreaming(command.payload.sessionId, false);
      ws.send(
        JSON.stringify({
          type: "chat.error",
          requestId: command.requestId,
          payload: {
            sessionId: command.payload.sessionId,
            message: "Chat request stopped by user"
          }
        } satisfies ServerEvent)
      );
      return;
    }
    case "chat.send": {
      const startingSession = sessions.getOrCreate(command.payload.sessionId);
      sessions.setSelectedModel(command.payload.sessionId, command.payload.modelId);
      const withUserMessage = sessions.appendMessage(
        command.payload.sessionId,
        "user",
        command.payload.content
      );
      sessions.setStreaming(command.payload.sessionId, true);

      const abortController = new AbortController();
      sessions.setAbortController(command.payload.sessionId, abortController);

      try {
        const result = await runOpenAiCliConversation({
          modelId: command.payload.modelId,
          messages: [
            ...startingSession.messages,
            createChatMessage("user", command.payload.content)
          ],
          abortSignal: abortController.signal
        });

        const assistantMessage = createChatMessage("assistant", result.assistantText);
        const updatedSession = sessions.appendMessage(
          command.payload.sessionId,
          "assistant",
          assistantMessage.content
        );
        sessions.setStreaming(command.payload.sessionId, false);
        ws.send(
          JSON.stringify({
            type: "chat.complete",
            requestId: command.requestId,
            payload: {
              sessionId: command.payload.sessionId,
              assistantMessage,
              state: updatedSession
            }
          } satisfies ServerEvent)
        );
      } catch (error) {
        sessions.setStreaming(command.payload.sessionId, false);
        sessions.setError(
          command.payload.sessionId,
          error instanceof Error ? error.message : "Unknown OpenAI CLI error"
        );
        const fallbackMessage = createAssistantFallbackMessage(withUserMessage);
        const updatedSession = sessions.appendMessage(
          command.payload.sessionId,
          "assistant",
          fallbackMessage.content
        );

        ws.send(
          JSON.stringify({
            type: "chat.error",
            requestId: command.requestId,
            payload: {
              sessionId: command.payload.sessionId,
              message: "OpenAI CLI invocation failed",
              detail: error instanceof Error ? error.message : "Unknown OpenAI CLI error"
            }
          } satisfies ServerEvent)
        );
        ws.send(
          JSON.stringify({
            type: "chat.complete",
            requestId: command.requestId,
            payload: {
              sessionId: command.payload.sessionId,
              assistantMessage: fallbackMessage,
              state: updatedSession
            }
          } satisfies ServerEvent)
        );
      } finally {
        sessions.setAbortController(command.payload.sessionId, undefined);
      }
      return;
    }
  }
}
