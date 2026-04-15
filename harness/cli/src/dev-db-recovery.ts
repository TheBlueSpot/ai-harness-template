import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const PURGE_RETRY_ATTEMPTS = 8;
const PURGE_RETRY_DELAY_MS = 40;

export function resolveHarnessDbPath() {
  return Bun.env.HARNESS_DB_PATH ?? path.join(process.cwd(), ".local", "harness.db");
}

export function isDevelopmentRuntime() {
  return Bun.env.NODE_ENV !== "production";
}

export function isRecoverableWorkspaceDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const detail = error.message.toLowerCase();
  return (
    detail.includes("sqliteerror") ||
    detail.includes("no such column") ||
    detail.includes("no such table") ||
    detail.includes("database disk image is malformed") ||
    detail.includes("malformed") ||
    detail.includes("constraint failed")
  );
}

export async function purgeWorkspaceDatabase(dbPath: string) {
  for (const artifactPath of getWorkspaceDatabaseArtifacts(dbPath)) {
    if (!existsSync(artifactPath)) {
      continue;
    }

    await removeArtifactWithRetry(artifactPath);
  }
}

function getWorkspaceDatabaseArtifacts(dbPath: string) {
  return [dbPath, `${dbPath}-shm`, `${dbPath}-wal`];
}

async function removeArtifactWithRetry(artifactPath: string) {
  for (let attempt = 0; attempt < PURGE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      rmSync(artifactPath, { force: true });
      return;
    } catch (error) {
      if (!isRetryableDeleteError(error) || attempt === PURGE_RETRY_ATTEMPTS - 1) {
        throw error;
      }

      await Bun.sleep(PURGE_RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

function isRetryableDeleteError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "EBUSY" || error.code === "EPERM")
  );
}
