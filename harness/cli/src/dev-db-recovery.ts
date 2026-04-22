import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const PURGE_RETRY_ATTEMPTS = 8;
const PURGE_RETRY_DELAY_MS = 40;

type PurgeWorkspaceDatabaseResult = {
  purgedArtifacts: string[];
  blockedArtifacts: string[];
  fallbackDbPath?: string;
};

type PurgeWorkspaceDatabaseOptions = {
  removeArtifact?: (artifactPath: string) => void;
  artifactExists?: (artifactPath: string) => boolean;
};

export function resolveHarnessDbPath() {
  return Bun.env.HARNESS_DB_PATH ?? path.join(process.cwd(), ".local", "harness.db");
}

export function resolveRecoveredHarnessDbPath(dbPath: string) {
  const parsed = path.parse(dbPath);
  return path.join(parsed.dir, `${parsed.name}.recovered-${crypto.randomUUID()}${parsed.ext}`);
}

export function isDevelopmentRuntime() {
  return Bun.env.NODE_ENV !== "production";
}

export function isRecoverableWorkspaceDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const detail = error.message.toLowerCase();
  // Match only concrete SQLite corruption/schema-drift signatures. A bare
  // "malformed" substring would also match unrelated error copy (e.g. a
  // validation message like "malformed request payload") and would otherwise
  // trigger a destructive purge on healthy databases.
  return (
    detail.includes("no such column") ||
    detail.includes("no such table") ||
    detail.includes("database disk image is malformed") ||
    detail.includes("file is not a database")
  );
}

export async function purgeWorkspaceDatabase(
  dbPath: string,
  options: PurgeWorkspaceDatabaseOptions = {}
): Promise<PurgeWorkspaceDatabaseResult> {
  const purgeResult: PurgeWorkspaceDatabaseResult = {
    purgedArtifacts: [],
    blockedArtifacts: []
  };
  const artifactExists = options.artifactExists ?? existsSync;
  const removeArtifact = options.removeArtifact ?? ((artifactPath: string) => rmSync(artifactPath, { force: true }));

  for (const artifactPath of getWorkspaceDatabaseArtifacts(dbPath)) {
    if (!artifactExists(artifactPath)) {
      continue;
    }

    const removal = await removeArtifactWithRetry(artifactPath, removeArtifact);
    if (removal === "purged") {
      purgeResult.purgedArtifacts.push(artifactPath);
      continue;
    }

    purgeResult.blockedArtifacts.push(artifactPath);
  }

  if (purgeResult.blockedArtifacts.length > 0) {
    purgeResult.fallbackDbPath = resolveRecoveredHarnessDbPath(dbPath);
  }

  return purgeResult;
}

function getWorkspaceDatabaseArtifacts(dbPath: string) {
  return [dbPath, `${dbPath}-shm`, `${dbPath}-wal`];
}

async function removeArtifactWithRetry(artifactPath: string, removeArtifact: (artifactPath: string) => void) {
  for (let attempt = 0; attempt < PURGE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      removeArtifact(artifactPath);
      return "purged" as const;
    } catch (error) {
      if (!isRetryableDeleteError(error)) {
        throw error;
      }

      if (attempt === PURGE_RETRY_ATTEMPTS - 1) {
        return "blocked" as const;
      }

      await Bun.sleep(PURGE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return "blocked" as const;
}

function isRetryableDeleteError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "EBUSY" || error.code === "EPERM")
  );
}
