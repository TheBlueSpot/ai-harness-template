import { terminalStore } from "./terminal-store";

const sockets = new Map<string, WebSocket>();
const TERMINAL_HEARTBEAT = 0x00;
const TERMINAL_DATA = 0x01;

export function openTerminalSocket(controlEndpoint: string, sessionId: string, clientId: string, token: string) {
  closeTerminalSocket(sessionId);
  const url = new URL(controlEndpoint);
  url.pathname = "/ws/terminal";
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("token", token);

  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => terminalStore.setConnected(sessionId, true));
  socket.addEventListener("message", (event) => {
    if (!(event.data instanceof ArrayBuffer)) {
      return;
    }
    const frame = new Uint8Array(event.data);
    if (frame[0] === TERMINAL_HEARTBEAT) {
      socket.send(new Uint8Array([TERMINAL_HEARTBEAT]));
      return;
    }
    if (frame[0] === TERMINAL_DATA) {
      terminalStore.appendOutput(sessionId, new TextDecoder().decode(frame.slice(1)));
    }
  });
  socket.addEventListener("close", () => {
    sockets.delete(sessionId);
    terminalStore.setConnected(sessionId, false);
  });
  sockets.set(sessionId, socket);
}

export function sendTerminalInput(sessionId: string, input: string | Uint8Array) {
  const socket = sockets.get(sessionId);
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

export function closeTerminalSocket(sessionId: string) {
  const socket = sockets.get(sessionId);
  if (!socket) {
    return;
  }
  socket.close();
  sockets.delete(sessionId);
  terminalStore.setConnected(sessionId, false);
}

export function closeAllTerminalSockets() {
  for (const sessionId of sockets.keys()) {
    closeTerminalSocket(sessionId);
  }
}
