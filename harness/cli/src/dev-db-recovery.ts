import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const PURGE_RETRY_ATTEMPTS = 8;
const PURGE_RETRY_DELAY_MS = 40;

type PurgeWorkspaceDatabaseResult = {
  backupPath?: string;
  backedUpArtifacts: string[];
  purgedArtifacts: string[];
  blockedArtifacts: string[];
  fallbackDbPath?: string;
};

type PurgeWorkspaceDatabaseOptions = {
  backupArtifact?: (sourcePath: string, backupPath: string) => void;
  createBackupPath?: (dbPath: string) => string;
  removeArtifact?: (artifactPath: string) => void;
  artifactExists?: (artifactPath: string) => boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
};

export function resolveHarnessDbPath() {
  return Bun.env.HARNESS_DB_PATH ?? path.join(process.cwd(), ".local", "harness.db");
}

export function resolveRecoveredHarnessDbPath(dbPath: string) {
  const parsed = path.parse(dbPath);
  return path.join(parsed.dir, `${parsed.name}.recovered-${crypto.randomUUID()}${parsed.ext}`);
}

export function resolveHarnessDbBackupPath(dbPath: string, now = new Date()) {
  return `${dbPath}.backup-${formatBackupTimestamp(now)}`;
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
    backedUpArtifacts: [],
    purgedArtifacts: [],
    blockedArtifacts: []
  };
  const artifactExists = options.artifactExists ?? existsSync;
  const backupArtifact = options.backupArtifact ?? copyFileSync;
  const removeArtifact = options.removeArtifact ?? ((artifactPath: string) => rmSync(artifactPath, { force: true }));

  const backupPath = backupWorkspaceDatabaseArtifacts(dbPath, {
    artifactExists,
    backupArtifact,
    createBackupPath: options.createBackupPath
  });
  purgeResult.backupPath = backupPath.backupPath;
  purgeResult.backedUpArtifacts = backupPath.backedUpArtifacts;

  for (const artifactPath of getWorkspaceDatabaseArtifacts(dbPath)) {
    if (!artifactExists(artifactPath)) {
      continue;
    }

    const removal = await removeArtifactWithRetry(artifactPath, removeArtifact, {
      retryAttempts: options.retryAttempts,
      retryDelayMs: options.retryDelayMs
    });
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

function backupWorkspaceDatabaseArtifacts(
  dbPath: string,
  options: Required<Pick<PurgeWorkspaceDatabaseOptions, "artifactExists" | "backupArtifact">> &
    Pick<PurgeWorkspaceDatabaseOptions, "createBackupPath">
) {
  const existingArtifacts = getWorkspaceDatabaseArtifacts(dbPath).filter((artifactPath) =>
    options.artifactExists(artifactPath)
  );
  if (existingArtifacts.length === 0) {
    return {
      backupPath: undefined,
      backedUpArtifacts: []
    };
  }

  const backupPath = options.createBackupPath?.(dbPath) ?? resolveAvailableHarnessDbBackupPath(dbPath, options.artifactExists);
  const backedUpArtifacts: string[] = [];
  for (const artifactPath of existingArtifacts) {
    const artifactBackupPath = resolveBackupArtifactPath(artifactPath, dbPath, backupPath);
    options.backupArtifact(artifactPath, artifactBackupPath);
    backedUpArtifacts.push(artifactBackupPath);
  }

  return {
    backupPath,
    backedUpArtifacts
  };
}

function getWorkspaceDatabaseArtifacts(dbPath: string) {
  return [dbPath, `${dbPath}-shm`, `${dbPath}-wal`];
}

function resolveBackupArtifactPath(artifactPath: string, dbPath: string, backupPath: string) {
  if (artifactPath === dbPath) {
    return backupPath;
  }

  return `${backupPath}${artifactPath.slice(dbPath.length)}`;
}

function resolveAvailableHarnessDbBackupPath(dbPath: string, artifactExists: (artifactPath: string) => boolean) {
  const backupPath = resolveHarnessDbBackupPath(dbPath);
  if (!workspaceDatabaseBackupExists(dbPath, backupPath, artifactExists)) {
    return backupPath;
  }

  return `${backupPath}-${crypto.randomUUID()}`;
}

function workspaceDatabaseBackupExists(
  dbPath: string,
  backupPath: string,
  artifactExists: (artifactPath: string) => boolean
) {
  return getWorkspaceDatabaseArtifacts(dbPath).some((artifactPath) =>
    artifactExists(resolveBackupArtifactPath(artifactPath, dbPath, backupPath))
  );
}

function formatBackupTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function removeArtifactWithRetry(
  artifactPath: string,
  removeArtifact: (artifactPath: string) => void,
  options: Pick<PurgeWorkspaceDatabaseOptions, "retryAttempts" | "retryDelayMs">
) {
  const retryAttempts = Math.max(1, Math.floor(options.retryAttempts ?? PURGE_RETRY_ATTEMPTS));
  const retryDelayMs = Math.max(0, Math.floor(options.retryDelayMs ?? PURGE_RETRY_DELAY_MS));
  for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
    try {
      removeArtifact(artifactPath);
      return "purged" as const;
    } catch (error) {
      if (!isRetryableDeleteError(error)) {
        throw error;
      }

      if (attempt === retryAttempts - 1) {
        return "blocked" as const;
      }

      if (retryDelayMs > 0) {
        await Bun.sleep(retryDelayMs * (attempt + 1));
      }
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
