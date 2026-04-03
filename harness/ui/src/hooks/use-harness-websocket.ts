import { useEffect, useMemo, useRef } from "react";
import {
  createRequestId,
  parseServerEvent,
  type ClientCommand
} from "../../../shared/protocol";
import { useHarnessStore } from "../store/use-harness-store";

type UseHarnessWebSocketOptions = {
  endpoint?: string;
};

export function useHarnessWebSocket(options: UseHarnessWebSocketOptions = {}) {
  const endpoint =
    options.endpoint ?? import.meta.env.VITE_HARNESS_WS_URL ?? "ws://localhost:8787";
  const socketRef = useRef<WebSocket | null>(null);
  const setConnectionState = useHarnessStore((state) => state.setConnectionState);
  const setCommandError = useHarnessStore((state) => state.setCommandError);
  const setAvailableModels = useHarnessStore((state) => state.setAvailableModels);
  const updateSession = useHarnessStore((state) => state.updateSession);
  const resetSession = useHarnessStore((state) => state.resetSession);

  useEffect(() => {
    setConnectionState("connecting");
    setCommandError(undefined);

    const socket = new WebSocket(endpoint);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionState("connected");
      socket.send(
        JSON.stringify({
          type: "model.list",
          requestId: createRequestId()
        } satisfies ClientCommand)
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsed = parseServerEvent(JSON.parse(event.data));

        switch (parsed.type) {
          case "connection.ready":
            setAvailableModels(parsed.payload.models);
            updateSession(parsed.payload.state);
            break;
          case "model.list":
            setAvailableModels(parsed.payload.models);
            break;
          case "chat.complete":
            updateSession(parsed.payload.state);
            setCommandError(undefined);
            break;
          case "session.reset":
            resetSession(parsed.payload.sessionId);
            updateSession(parsed.payload.state);
            setCommandError(undefined);
            break;
          case "chat.error":
            setCommandError(parsed.payload.detail ?? parsed.payload.message);
            break;
          case "command.rejected":
            setCommandError(parsed.payload.message);
            break;
          case "connection.pong":
          case "chat.delta":
            break;
        }
      } catch (error) {
        setConnectionState("error", error instanceof Error ? error.message : "Invalid server event");
      }
    });

    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
    });

    socket.addEventListener("error", () => {
      setConnectionState("error", "Websocket connection failed");
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [endpoint, resetSession, setAvailableModels, setCommandError, setConnectionState, updateSession]);

  const sendCommand = useMemo(() => {
    return (command: ClientCommand) => {
      const socket = socketRef.current;

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error("Websocket is not connected");
      }

      socket.send(JSON.stringify(command));
    };
  }, []);

  return {
    sendCommand
  };
}
