import { describe, expect, test } from "bun:test";
import { parseServerEventFrame, type ServerEvent } from "../../shared/protocol";
import { createWebsocketEventBatcher } from "./websocket-event-batcher";
import type { GuardedWebSocket } from "./websocket-send-guard";

class FakeGuardedSocket implements GuardedWebSocket {
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  sendStatuses: Array<number | void>;
  sent: Array<string | Uint8Array> = [];

  constructor(sendStatuses: Array<number | void> = []) {
    this.sendStatuses = sendStatuses;
  }

  send(data: string | Uint8Array) {
    this.sent.push(data);
    return this.sendStatuses.shift() ?? 1;
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
  }
}

function assistantDelta(index: number): ServerEvent {
  return {
    type: "assistant.chat.delta",
    requestId: `req-${index}`,
    payload: {
      assistantId: "assistant-1",
      sessionId: "session-1",
      delta: `chunk-${index}`
    }
  };
}

describe("websocket event batcher", () => {
  test("sends queued control events as one typed batch frame", () => {
    const socket = new FakeGuardedSocket();
    const batcher = createWebsocketEventBatcher({ maxQueuedBytes: 1024 * 1024, flushDelayMs: 60_000 });

    expect(batcher.send(socket, assistantDelta(1))).toBe(true);
    expect(batcher.send(socket, assistantDelta(2))).toBe(true);
    expect(socket.sent).toHaveLength(0);

    expect(batcher.flush(socket)).toBe(true);
    expect(socket.sent).toHaveLength(1);

    const payload = socket.sent[0];
    if (typeof payload !== "string") {
      throw new Error("expected string websocket payload");
    }
    const events = parseServerEventFrame(JSON.parse(payload));
    expect(events.map((event) => event.type)).toEqual(["assistant.chat.delta", "assistant.chat.delta"]);
    expect(events.map((event) => (event.type === "assistant.chat.delta" ? event.payload.delta : ""))).toEqual([
      "chunk-1",
      "chunk-2"
    ]);
  });

  test("flushes queued events before immediate heartbeat responses", () => {
    const socket = new FakeGuardedSocket();
    const batcher = createWebsocketEventBatcher({ maxQueuedBytes: 1024 * 1024, flushDelayMs: 60_000 });

    batcher.send(socket, assistantDelta(1));
    batcher.send(socket, {
      type: "connection.pong",
      requestId: "req-pong",
      payload: {
        timestamp: 1
      }
    });

    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[0] as string).type).toBe("assistant.chat.delta");
    expect(JSON.parse(socket.sent[1] as string).type).toBe("connection.pong");
  });

  test("flushes when batch event limit is reached", () => {
    const socket = new FakeGuardedSocket();
    const batcher = createWebsocketEventBatcher({
      maxQueuedBytes: 1024 * 1024,
      maxBatchEvents: 2,
      flushDelayMs: 60_000
    });

    batcher.send(socket, assistantDelta(1));
    batcher.send(socket, assistantDelta(2));

    expect(socket.sent).toHaveLength(1);
    const events = parseServerEventFrame(JSON.parse(socket.sent[0] as string));
    expect(events).toHaveLength(2);
  });

  test("reuses guarded slow-client close behavior for batch frames", () => {
    const socket = new FakeGuardedSocket([-1]);
    const batcher = createWebsocketEventBatcher({
      maxQueuedBytes: 64,
      flushDelayMs: 60_000,
      slowCloseReason: "Control websocket client is too slow"
    });

    batcher.send(socket, assistantDelta(1));
    batcher.send(socket, assistantDelta(2));
    batcher.flush(socket);

    expect(socket.closeCalls).toEqual([{ code: 1011, reason: "Control websocket client is too slow" }]);
  });
});
