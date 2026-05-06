import { describe, expect, test } from "bun:test";
import path from "node:path";
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

    expect(server.port).toBeDefined();
    expect(port).toBe(server.port ?? -1);
    expect(port).toBeGreaterThan(0);

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const readyEvent = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for connection.ready")), 2000);
      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data as string);
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
    socket.close();
    await stopServerForTest(server);
  });
});
