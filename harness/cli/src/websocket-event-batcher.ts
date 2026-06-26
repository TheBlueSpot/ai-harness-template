import type { ServerEvent } from "../../shared/protocol";
import { guardedWebsocketSend, type GuardedWebSocket } from "./websocket-send-guard";

export const DEFAULT_CONTROL_EVENT_BATCH_FLUSH_MS = 1;
export const DEFAULT_CONTROL_EVENT_BATCH_MAX_EVENTS = 64;
export const DEFAULT_CONTROL_EVENT_BATCH_MAX_BYTES = 512 * 1024;

type BatchEntry = {
  event: ServerEvent;
  serialized: string;
  bytes: number;
};

type BatchState = {
  entries: BatchEntry[];
  bytes: number;
  timer?: ReturnType<typeof setTimeout>;
};

type WebsocketEventBatcherOptions = {
  maxQueuedBytes: number;
  slowCloseCode?: number;
  slowCloseReason?: string;
  flushDelayMs?: number;
  maxBatchEvents?: number;
  maxBatchBytes?: number;
};

const encoder = new TextEncoder();
const immediateControlEventTypes: ReadonlySet<ServerEvent["type"]> = new Set([
  "connection.ready",
  "connection.pong",
  "command.rejected",
  "cli-session.attach-ready",
  "terminal.session.attach-ready"
]);

export function createWebsocketEventBatcher(options: WebsocketEventBatcherOptions) {
  const states = new WeakMap<object, BatchState>();
  const flushDelayMs = options.flushDelayMs ?? DEFAULT_CONTROL_EVENT_BATCH_FLUSH_MS;
  const maxBatchEvents = options.maxBatchEvents ?? DEFAULT_CONTROL_EVENT_BATCH_MAX_EVENTS;
  const maxBatchBytes = options.maxBatchBytes ?? DEFAULT_CONTROL_EVENT_BATCH_MAX_BYTES;

  const sendSerialized = (ws: GuardedWebSocket, serialized: string) =>
    guardedWebsocketSend(ws, serialized, {
      maxQueuedBytes: options.maxQueuedBytes,
      slowCloseCode: options.slowCloseCode,
      slowCloseReason: options.slowCloseReason
    });

  const clearTimer = (state: BatchState) => {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
  };

  const flush = (ws: GuardedWebSocket) => {
    const key = ws as object;
    const state = states.get(key);
    if (!state || state.entries.length === 0) {
      return false;
    }

    clearTimer(state);
    const entries = state.entries.splice(0);
    state.bytes = 0;

    const serialized =
      entries.length === 1
        ? entries[0]!.serialized
        : `{"type":"server.events-batch","payload":{"events":[${entries.map((entry) => entry.serialized).join(",")}]}}`;
    return sendSerialized(ws, serialized);
  };

  const scheduleFlush = (ws: GuardedWebSocket, state: BatchState) => {
    if (state.timer) {
      return;
    }

    state.timer = setTimeout(() => {
      flush(ws);
    }, flushDelayMs);
    unrefTimer(state.timer);
  };

  return {
    send(ws: GuardedWebSocket, event: ServerEvent) {
      const serialized = JSON.stringify(event);
      if (!shouldBatchControlEvent(event)) {
        flush(ws);
        return sendSerialized(ws, serialized);
      }

      const bytes = encoder.encode(serialized).byteLength;
      if (bytes > maxBatchBytes) {
        flush(ws);
        return sendSerialized(ws, serialized);
      }

      const key = ws as object;
      const state = states.get(key) ?? { entries: [], bytes: 0 };
      if (state.entries.length > 0 && (state.entries.length >= maxBatchEvents || state.bytes + bytes > maxBatchBytes)) {
        flush(ws);
      }

      const nextState = states.get(key) ?? state;
      nextState.entries.push({ event, serialized, bytes });
      nextState.bytes += bytes;
      states.set(key, nextState);

      if (nextState.entries.length >= maxBatchEvents) {
        return flush(ws);
      }

      scheduleFlush(ws, nextState);
      return true;
    },
    flush,
    clear(ws: GuardedWebSocket) {
      const state = states.get(ws as object);
      if (state) {
        clearTimer(state);
      }
      states.delete(ws as object);
    }
  };
}

function shouldBatchControlEvent(event: ServerEvent) {
  return !immediateControlEventTypes.has(event.type);
}

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (typeof timer !== "object" || timer === null || !("unref" in timer)) {
    return;
  }

  const unref = timer.unref;
  if (typeof unref === "function") {
    unref.call(timer);
  }
}
