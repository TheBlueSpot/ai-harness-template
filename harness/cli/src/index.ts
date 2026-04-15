import {
  isDevelopmentRuntime,
  isRecoverableWorkspaceDatabaseError,
  purgeWorkspaceDatabase,
  resolveHarnessDbPath
} from "./dev-db-recovery";
import { startHarnessServer } from "./server";

const port = Number(Bun.env.HARNESS_PORT ?? 8787);
const serverOnly = process.argv.includes("--server-only");
const dbPath = resolveHarnessDbPath();

try {
  await startHarnessServer({
    port: Number.isFinite(port) ? port : 8787,
    serverOnly
  });
} catch (error) {
  if (!serverOnly && isDevelopmentRuntime() && isRecoverableWorkspaceDatabaseError(error)) {
    console.warn(`[dev-db-recovery] purging corrupted local workspace db at ${dbPath}`);
    await purgeWorkspaceDatabase(dbPath);

    await startHarnessServer({
      port: Number.isFinite(port) ? port : 8787,
      serverOnly
    });
  } else {
    throw error;
  }
}
