import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseServerEventFrame, type ServerEvent } from "../../../shared/protocol";
import { WorkspaceRepository } from "../workspace-repository";
import { useGitProjectFixture } from "./git-project-fixture";
import { executeReadyRunUntil, FakePiAgentAdapter, startServerForTest, stopServerForTest } from "./server-test-harness";

class FakeSocket extends EventTarget {
  sentPayloads: string[] = [];

  send(payload: string) {
    this.sentPayloads.push(payload);
  }

  emit(payload: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify(payload)
      })
    );
  }
}

describe("server test harness support", () => {
  const fixture = useGitProjectFixture({
    fixtureName: "server-test-harness-support",
    packageName: "server-test-harness-support",
    readmeTitle: "# Server Test Harness Support\n",
    gitIgnore: ".local\nnode_modules\ndist\n"
  });

  test("executeReadyRunUntil resolves on corrective ready before chat.complete", async () => {
    const socket = new FakeSocket();
    const correctiveReadyPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        socket.emit({
          type: "run.updated",
          payload: {
            run: {
              status: "ready",
              plan: {
                origin: "correctness-followup"
              }
            }
          }
        });
        resolve();
      }, 10);
    });

    setTimeout(() => {
      socket.emit({
        type: "chat.complete",
        payload: {
          projectId: "project-1",
          threadId: "thread-1"
        }
      });
    }, 50);

    const outcome = await executeReadyRunUntil(
      socket,
      {
        requestId: "req-corrective-race",
        projectId: "project-1",
        threadId: "thread-1",
        runId: "run-1"
      },
      [correctiveReadyPromise.then(() => ({ type: "synthetic-ready" }))],
      250
    );

    expect(JSON.parse(socket.sentPayloads[0] ?? "{}").type).toBe("run.execute");
    expect(outcome.type).toBe("synthetic-ready");
  });

  test("startServerForTest resolves the actual dynamic port", async () => {
    const projectRoot = await fixture.createRepoClone("dynamic-port-repo");
    const repository = new WorkspaceRepository(":memory:", projectRoot, { durability: "test-fast" });
    const adapter = new FakePiAgentAdapter();
    const { server, port } = await startServerForTest({
      port: 0,
      adapter,
      repository,
      pickFolder: async () => path.join(projectRoot, "unused"),
      serverOnly: true
    });

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    try {
      expect(server.port).toBeDefined();
      expect(port).toBe(server.port ?? -1);
      expect(port).toBeGreaterThan(0);

      const readyEvent = await new Promise<{ type: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for connection.ready")), 5000);
        socket.addEventListener("message", (event) => {
          if (typeof event.data !== "string") {
            return;
          }
          const payload = JSON.parse(event.data);
          if (payload.type === "connection.ready") {
            clearTimeout(timeout);
            resolve(payload);
          }
        });
        socket.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error("socket error"));
        }, { once: true });
      });

      expect(readyEvent.type).toBe("connection.ready");
    } finally {
      socket.close();
      await stopServerForTest(server);
    }
  }, 15000);

  test("control websocket batches burst responses into one frame", async () => {
    const projectRoot = await fixture.createRepoClone("batched-control-repo");
    const repository = new WorkspaceRepository(":memory:", projectRoot, { durability: "test-fast" });
    const adapter = new FakePiAgentAdapter();
    const { server, port } = await startServerForTest({
      port: 0,
      adapter,
      repository,
      pickFolder: async () => path.join(projectRoot, "unused"),
      serverOnly: true
    });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForRawServerEvent(socket, (events) => events.some((event) => event.type === "connection.ready"));
      const batchPromise = waitForRawBatchFrame(socket, "agent.list", 2);

      for (let index = 0; index < 5; index += 1) {
        socket.send(
          JSON.stringify({
            type: "agent.list",
            requestId: `req-agent-list-${index}`
          })
        );
      }

      const batchEvents = await batchPromise;
      expect(batchEvents.filter((event) => event.type === "agent.list").length).toBeGreaterThanOrEqual(2);
    } finally {
      socket.close();
      await stopServerForTest(server);
    }
  }, 15000);
});

function waitForRawBatchFrame(socket: WebSocket, eventType: ServerEvent["type"], minimumCount: number) {
  return waitForRawServerEvent(socket, (events, rawType) => {
    if (rawType !== "server.events-batch") {
      return false;
    }
    return events.filter((event) => event.type === eventType).length >= minimumCount;
  });
}

function waitForRawServerEvent(
  socket: WebSocket,
  predicate: (events: ServerEvent[], rawType: string | undefined) => boolean
) {
  return new Promise<ServerEvent[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for websocket event"));
    }, 3000);
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") {
        return;
      }
      const raw = JSON.parse(event.data);
      const rawType = typeof raw === "object" && raw !== null && "type" in raw && typeof raw.type === "string" ? raw.type : undefined;
      const events = parseServerEventFrame(raw);
      if (!predicate(events, rawType)) {
        return;
      }
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(events);
    };
    socket.addEventListener("message", onMessage);
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        reject(new Error("socket error"));
      },
      { once: true }
    );
  });
}
