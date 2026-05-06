import {
  isDevelopmentRuntime,
  isRecoverableWorkspaceDatabaseError,
  purgeWorkspaceDatabase,
  resolveHarnessDbPath
} from "./dev-db-recovery";
import { startHarnessServer } from "./server";
import { type StartupTelemetrySink } from "./startup-telemetry";
import { WorkspaceRepository } from "./workspace-repository";

type StartHarnessServerOptions = Parameters<typeof startHarnessServer>[0];
type StartHarnessServerResult = Awaited<ReturnType<typeof startHarnessServer>>;
type StartHarnessServerFn<TServer> = (options: StartHarnessServerOptions) => Promise<TServer>;

type LaunchHarnessServerOptions<TServer> = StartHarnessServerOptions & {
  allowPortFallback?: boolean;
  logger?: Pick<typeof console, "warn">;
  startServer?: StartHarnessServerFn<TServer>;
  purgeDatabase?: typeof purgeWorkspaceDatabase;
  startupTelemetry?: StartupTelemetrySink;
};

export async function launchHarnessServerWithRecovery<TServer = StartHarnessServerResult>({
  allowPortFallback = false,
  logger = console,
  startServer,
  purgeDatabase = purgeWorkspaceDatabase,
  startupTelemetry,
  ...serverOptions
}: LaunchHarnessServerOptions<TServer>) {
  const runStart = (startServer ?? startHarnessServer) as StartHarnessServerFn<TServer>;
  let nextPort = serverOptions.port;
  let attemptedPortFallback = false;
  let attemptedDbRecovery = false;
  let repositoryOverride = serverOptions.repository;

  while (true) {
    try {
      startupTelemetry?.pulse(`starting startup attempt ${startupTelemetry.getAttempt()}`, {
        attempt: startupTelemetry.getAttempt(),
        port: nextPort
      });
      return await runStart({
        ...serverOptions,
        startupTelemetry,
        repository: repositoryOverride,
        port: nextPort
      });
    } catch (error) {
      if (!attemptedPortFallback && allowPortFallback && isPortInUseError(error)) {
        attemptedPortFallback = true;
        logger.warn(`[dev] port ${nextPort} in use, retrying on random open port`);
        startupTelemetry?.retry(`port ${nextPort} in use, retrying on random open port`, {
          port: nextPort,
          reason: "port-in-use"
        });
        nextPort = 0;
        continue;
      }

      if (
        !attemptedDbRecovery &&
        !serverOptions.serverOnly &&
        isDevelopmentRuntime() &&
        isRecoverableWorkspaceDatabaseError(error)
      ) {
        attemptedDbRecovery = true;
        const dbPath = resolveHarnessDbPath();
        logger.warn(`[dev-db-recovery] startup failed with recoverable workspace db error: ${describeLaunchError(error)}`);
        logger.warn(`[dev-db-recovery] backing up and purging corrupted local workspace db at ${dbPath}`);
        const purgeResult = await purgeDatabase(dbPath);
        if (purgeResult.backupPath) {
          logger.warn(`[dev-db-recovery] backed up local workspace db artifacts to ${purgeResult.backupPath}`);
        }
        if (purgeResult.fallbackDbPath) {
          logger.warn(
            `[dev-db-recovery] db remained locked; starting with fresh fallback db at ${purgeResult.fallbackDbPath}`
          );
          repositoryOverride = new WorkspaceRepository(purgeResult.fallbackDbPath, process.cwd());
        } else {
          repositoryOverride = new WorkspaceRepository(dbPath, process.cwd());
        }
        startupTelemetry?.retry("recoverable workspace db error, purging local db and retrying startup", {
          backupPath: purgeResult.backupPath,
          dbPath,
          fallbackDbPath: purgeResult.fallbackDbPath,
          purgeAction: "purge-corrupted-workspace-db",
          reason: "recoverable-workspace-db"
        });
        continue;
      }

      startupTelemetry?.failed(`Harness startup failed: ${describeLaunchError(error)}`, {
        reason: "terminal-error"
      });
      throw error;
    }
  }
}

function isPortInUseError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "EADDRINUSE"
  );
}

function describeLaunchError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
