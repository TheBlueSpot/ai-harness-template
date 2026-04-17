import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { launchHarnessServerWithRecovery } from "./launch-harness";
import { startHarnessServer } from "./server";
import { WorkspaceRepository } from "./workspace-repository";

describe("launch harness with recovery", () => {
  const servers: Array<Awaited<ReturnType<typeof startHarnessServer>> | Bun.Server<undefined>> = [];

  afterEach(() => {
    while (servers.length > 0) {
      servers.pop()?.stop(true);
    }
  });

  test("falls back to random open port when default port is busy", async () => {
    const warnings: string[] = [];
    const calls: number[] = [];

    const server = await launchHarnessServerWithRecovery({
      port: 8787,
      serverOnly: true,
      allowPortFallback: true,
      logger: {
        warn(message) {
          warnings.push(message);
        }
      },
      startServer: async ({ port }) => {
        calls.push(port);
        if (calls.length === 1) {
          const busyError = new Error("busy");
          Object.assign(busyError, { code: "EADDRINUSE" });
          throw busyError;
        }

        const nextServer = Bun.serve({
          port,
          fetch() {
            return new Response("ok");
          }
        });
        servers.push(nextServer);
        return nextServer;
      }
    });

    expect(calls).toEqual([8787, 0]);
    expect(warnings).toEqual(["[dev] port 8787 in use, retrying on random open port"]);
    expect(server.port).toBeGreaterThan(0);
    expect(server.port).not.toBe(8787);
  });

  test("keeps explicit ports strict even when port is busy", async () => {
    await expect(
      launchHarnessServerWithRecovery({
        port: 8787,
        serverOnly: true,
        allowPortFallback: false,
        startServer: async () => {
          const busyError = new Error("busy");
          Object.assign(busyError, { code: "EADDRINUSE" });
          throw busyError;
        }
      })
    ).rejects.toMatchObject({
      code: "EADDRINUSE"
    });
  });

  test("starts real server on random port when requested port is occupied", async () => {
    const busyServer = Bun.serve({
      port: 0,
      fetch() {
        return new Response("busy");
      }
    });
    servers.push(busyServer);
    const busyPort = busyServer.port;

    if (busyPort === undefined) {
      throw new Error("Expected Bun to assign a port for test server");
    }

    const dbPath = path.join(process.cwd(), ".tmp-test-data", `launch-harness-${crypto.randomUUID()}.sqlite`);
    const server = await launchHarnessServerWithRecovery({
      port: busyPort,
      serverOnly: true,
      repository: new WorkspaceRepository(dbPath, process.cwd()),
      allowPortFallback: true
    });
    servers.push(server);

    expect(server.port).toBeGreaterThan(0);
    expect(server.port).not.toBe(busyPort);
  });
});
