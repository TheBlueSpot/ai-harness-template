import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import path from "node:path";
import { resolveHarnessDbPath } from "./dev-db-recovery";
import { launchHarnessServerWithRecovery } from "./launch-harness";
import { startHarnessServer } from "./server";
import type { StartupPhaseId, StartupTelemetrySink } from "./startup-telemetry";
import { WorkspaceRepository } from "./workspace-repository";

setDefaultTimeout(15000);

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

  test("uses fresh fallback db when purge leaves locked artifact behind", async () => {
    const warnings: string[] = [];
    const dbPath = path.join(process.cwd(), ".tmp-test-data", `locked-${crypto.randomUUID()}.sqlite`);
    let attemptCount = 0;
    const fallbackDbPath = dbPath.replace(".sqlite", ".recovered-test.sqlite");

    const server = await launchHarnessServerWithRecovery({
      port: 0,
      openBrowser: false,
      purgeDatabase: async () => ({
        backedUpArtifacts: [dbPath],
        backupPath: `${dbPath}.backup-test`,
        purgedArtifacts: [],
        blockedArtifacts: [dbPath],
        fallbackDbPath
      }),
      logger: {
        warn(message) {
          warnings.push(message);
        }
      },
      startServer: async ({ repository }) => {
        attemptCount += 1;
        if (attemptCount === 1) {
          const schemaError = new Error("SQLiteError: database disk image is malformed");
          throw schemaError;
        }

        const repoPath = repository?.getDatabasePath();
        expect(repoPath).toBe(fallbackDbPath);
        const nextServer = Bun.serve({
          port: 0,
          fetch() {
            return new Response("ok");
          }
        });
        servers.push(nextServer);
        return nextServer;
      }
    });

    servers.push(server);
    expect(attemptCount).toBe(2);
    expect(warnings.some((entry) => entry.includes("startup failed with recoverable workspace db error"))).toBe(true);
    expect(warnings.some((entry) => entry.includes("backing up and purging corrupted local workspace db"))).toBe(true);
    expect(warnings.some((entry) => entry.includes("backed up local workspace db artifacts"))).toBe(true);
    expect(warnings.some((entry) => entry.includes("fresh fallback db"))).toBe(true);
  });

  test("does not purge on generic sqlite constraint failures", async () => {
    let purgeCalled = false;

    await expect(
      launchHarnessServerWithRecovery({
        port: 0,
        openBrowser: false,
        purgeDatabase: async () => {
          purgeCalled = true;
          return {
            backedUpArtifacts: [],
            purgedArtifacts: [],
            blockedArtifacts: []
          };
        },
        startServer: async () => {
          throw new Error("SQLiteError: constraint failed");
        }
      })
    ).rejects.toThrow("SQLiteError: constraint failed");

    expect(purgeCalled).toBe(false);
  });

  test("port fallback emits retry telemetry and second attempt restarts from bootstrap", async () => {
    const telemetry = createFakeStartupTelemetry();
    const bootstrapAttempts: number[] = [];

    const server = await launchHarnessServerWithRecovery({
      port: 8787,
      serverOnly: true,
      allowPortFallback: true,
      startupTelemetry: telemetry,
      startServer: async ({ port, startupTelemetry }) => {
        startupTelemetry?.phaseStart("bootstrap", `boot on ${port}`);
        bootstrapAttempts.push(startupTelemetry?.getAttempt() ?? -1);
        if (bootstrapAttempts.length === 1) {
          const busyError = new Error("busy");
          Object.assign(busyError, { code: "EADDRINUSE" });
          throw busyError;
        }

        startupTelemetry?.phaseComplete("bootstrap done");
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

    servers.push(server);
    expect(bootstrapAttempts).toEqual([1, 2]);
    expect(
      telemetry.events.filter((event) => event.kind === "phase-start" && event.phaseId === "bootstrap").map((event) => event.attempt)
    ).toEqual([1, 2]);
    expect(telemetry.events.find((event) => event.kind === "retry")).toMatchObject({
      attempt: 1,
      details: {
        port: 8787,
        reason: "port-in-use"
      },
      message: "port 8787 in use, retrying on random open port"
    });
  });

  test("recoverable db retry emits telemetry with purge and fallback detail", async () => {
    const telemetry = createFakeStartupTelemetry();
    const dbPath = path.join(process.cwd(), ".tmp-test-data", `recovery-${crypto.randomUUID()}.sqlite`);
    const fallbackDbPath = dbPath.replace(".sqlite", ".fallback.sqlite");
    let attemptCount = 0;

    const server = await launchHarnessServerWithRecovery({
      port: 0,
      openBrowser: false,
      startupTelemetry: telemetry,
      purgeDatabase: async () => ({
        backedUpArtifacts: [dbPath],
        backupPath: `${dbPath}.backup-test`,
        purgedArtifacts: [dbPath],
        blockedArtifacts: [dbPath],
        fallbackDbPath
      }),
      startServer: async ({ repository, startupTelemetry }) => {
        startupTelemetry?.phaseStart("workspace", "load workspace");
        attemptCount += 1;
        if (attemptCount === 1) {
          throw new Error("SQLiteError: database disk image is malformed");
        }

        expect(repository?.getDatabasePath()).toBe(fallbackDbPath);
        startupTelemetry?.phaseComplete("workspace ready");
        const nextServer = Bun.serve({
          port: 0,
          fetch() {
            return new Response("ok");
          }
        });
        servers.push(nextServer);
        return nextServer;
      }
    });

    servers.push(server);
    expect(attemptCount).toBe(2);
    expect(telemetry.events.find((event) => event.kind === "retry")).toMatchObject({
      attempt: 1,
      details: {
        backupPath: `${dbPath}.backup-test`,
        dbPath: resolveHarnessDbPath(),
        fallbackDbPath,
        purgeAction: "purge-corrupted-workspace-db",
        reason: "recoverable-workspace-db"
      }
    });
  });

  test("terminal startup failure emits failed telemetry with last phase and log path", async () => {
    const telemetry = createFakeStartupTelemetry();

    await expect(
      launchHarnessServerWithRecovery({
        port: 0,
        serverOnly: true,
        startupTelemetry: telemetry,
        startServer: async ({ startupTelemetry }) => {
          startupTelemetry?.phaseStart("runtimes", "refresh runtimes");
          throw new Error("runtime discovery failed");
        }
      })
    ).rejects.toThrow("runtime discovery failed");

    expect(telemetry.events.find((event) => event.kind === "failed")).toMatchObject({
      attempt: 1,
      phaseId: "runtimes",
      details: {
        lastPhaseId: "runtimes",
        logPath: telemetry.logPath,
        reason: "terminal-error"
      }
    });
  });
});

type FakeStartupEvent = {
  attempt: number;
  kind: "session-start" | "phase-start" | "phase-pulse" | "phase-complete" | "retry" | "complete" | "failed";
  phaseId?: StartupPhaseId;
  message: string;
  details?: Record<string, unknown>;
};

function createFakeStartupTelemetry(): StartupTelemetrySink & { events: FakeStartupEvent[] } {
  const events: FakeStartupEvent[] = [];
  let attempt = 1;
  let currentPhaseId: StartupPhaseId | undefined;

  return {
    events,
    logPath: path.join(process.cwd(), ".tmp-test-data", `startup-${crypto.randomUUID()}.jsonl`),
    sessionStart(message = "session start", details) {
      events.push({ attempt, kind: "session-start", message, details });
    },
    pulse(message, details) {
      events.push({ attempt, kind: "phase-pulse", phaseId: currentPhaseId, message, details });
    },
    phaseStart(phaseId, message, details) {
      currentPhaseId = phaseId;
      events.push({ attempt, kind: "phase-start", phaseId, message, details });
    },
    phaseComplete(message, details) {
      events.push({ attempt, kind: "phase-complete", phaseId: currentPhaseId, message, details });
      currentPhaseId = undefined;
    },
    retry(message, details) {
      events.push({ attempt, kind: "retry", phaseId: currentPhaseId, message, details });
      currentPhaseId = undefined;
      attempt += 1;
    },
    complete(message, details) {
      events.push({ attempt, kind: "complete", phaseId: currentPhaseId, message, details });
      currentPhaseId = undefined;
    },
    failed(message, details) {
      events.push({
        attempt,
        kind: "failed",
        phaseId: currentPhaseId,
        message,
        details: {
          ...details,
          lastPhaseId: currentPhaseId,
          logPath: this.logPath
        }
      });
    },
    getAttempt() {
      return attempt;
    },
    getCurrentPhaseId() {
      return currentPhaseId;
    },
    dispose() {}
  };
}
