import {
  isDevelopmentRuntime,
  isRecoverableWorkspaceDatabaseError,
  purgeWorkspaceDatabase,
  resolveHarnessDbPath
} from "./dev-db-recovery";
import { startHarnessServer } from "./server";

type StartHarnessServerOptions = Parameters<typeof startHarnessServer>[0];
type StartHarnessServerResult = Awaited<ReturnType<typeof startHarnessServer>>;
type StartHarnessServerFn<TServer> = (options: StartHarnessServerOptions) => Promise<TServer>;

type LaunchHarnessServerOptions<TServer> = StartHarnessServerOptions & {
  allowPortFallback?: boolean;
  logger?: Pick<typeof console, "warn">;
  startServer?: StartHarnessServerFn<TServer>;
};

export async function launchHarnessServerWithRecovery<TServer = StartHarnessServerResult>({
  allowPortFallback = false,
  logger = console,
  startServer,
  ...serverOptions
}: LaunchHarnessServerOptions<TServer>) {
  const runStart = (startServer ?? startHarnessServer) as StartHarnessServerFn<TServer>;
  let nextPort = serverOptions.port;
  let attemptedPortFallback = false;
  let attemptedDbRecovery = false;

  while (true) {
    try {
      return await runStart({
        ...serverOptions,
        port: nextPort
      });
    } catch (error) {
      if (!attemptedPortFallback && allowPortFallback && isPortInUseError(error)) {
        attemptedPortFallback = true;
        logger.warn(`[dev] port ${nextPort} in use, retrying on random open port`);
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
        logger.warn(`[dev-db-recovery] purging corrupted local workspace db at ${dbPath}`);
        await purgeWorkspaceDatabase(dbPath);
        continue;
      }

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
