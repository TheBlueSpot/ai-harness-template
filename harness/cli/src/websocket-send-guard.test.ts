import { describe, expect, test } from "bun:test";
import { guardedWebsocketSend, type GuardedWebSocket } from "./websocket-send-guard";

class FakeGuardedSocket implements GuardedWebSocket {
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  sendStatuses: Array<number | void>;
  sent: Array<string | Uint8Array> = [];

  constructor(sendStatuses: Array<number | void>) {
    this.sendStatuses = sendStatuses;
  }

  send(data: string | Uint8Array) {
    this.sent.push(data);
    return this.sendStatuses.shift();
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
  }
}

describe("guarded websocket send", () => {
  test("allows one large payload when Bun sends it immediately", () => {
    const socket = new FakeGuardedSocket([512]);

    expect(guardedWebsocketSend(socket, "x".repeat(512), { maxQueuedBytes: 256 })).toBe(true);
    expect(socket.sent).toHaveLength(1);
    expect(socket.closeCalls).toHaveLength(0);
  });

  test("closes only after backpressured bytes exceed the queue cap", () => {
    const socket = new FakeGuardedSocket([-1, -1]);

    expect(guardedWebsocketSend(socket, "x".repeat(128), { maxQueuedBytes: 256 })).toBe(false);
    expect(socket.closeCalls).toHaveLength(0);

    expect(
      guardedWebsocketSend(socket, "x".repeat(129), {
        maxQueuedBytes: 256,
        slowCloseReason: "Control websocket client is too slow"
      })
    ).toBe(false);
    expect(socket.closeCalls).toEqual([{ code: 1011, reason: "Control websocket client is too slow" }]);
  });
});
