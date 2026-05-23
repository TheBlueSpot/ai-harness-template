import { access, readdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_LOCAL_MAX_BYTES = 1024 * 1024 * 1024;

export type DoctorCleanupResult =
  | {
      deleted: true;
      rootPath: string;
      distPath: string;
      localPath: string;
      localDeletedFiles: string[];
      localDeletedBytes: number;
      localBytesBefore: number;
      localBytesAfter: number;
    }
  | { deleted: false; rootPath: string; distPath: string; localPath: string; reason: "missing-sentinel" };

const HARNESS_SENTINELS = ["package.json", "harness/cli/src/index.ts", "harness/ui/index.html"];

export async function deleteDoctorDistFolder(
  rootPath = resolveHarnessRoot(),
  options: { localMaxBytes?: number } = {}
): Promise<DoctorCleanupResult> {
  const resolvedRoot = path.resolve(rootPath);
  const distPath = path.join(resolvedRoot, "dist");
  const localPath = path.join(resolvedRoot, ".local");
  const hasSentinels = await hasHarnessSentinels(resolvedRoot);
  if (!hasSentinels) {
    return { deleted: false, rootPath: resolvedRoot, distPath, localPath, reason: "missing-sentinel" };
  }

  await rm(distPath, { recursive: true, force: true });
  const localCleanup = await cleanupLocalFiles(localPath, options.localMaxBytes ?? DEFAULT_LOCAL_MAX_BYTES);
  return { deleted: true, rootPath: resolvedRoot, distPath, localPath, ...localCleanup };
}

export function resolveHarnessRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

async function hasHarnessSentinels(rootPath: string) {
  for (const sentinel of HARNESS_SENTINELS) {
    try {
      await access(path.join(rootPath, sentinel));
    } catch {
      return false;
    }
  }
  return true;
}

type LocalFile = {
  path: string;
  size: number;
  mtimeMs: number;
};

async function cleanupLocalFiles(localPath: string, maxBytes: number) {
  const files = await collectFiles(localPath);
  const localBytesBefore = files.reduce((total, file) => total + file.size, 0);
  let localBytesAfter = localBytesBefore;
  let localDeletedBytes = 0;
  const localDeletedFiles: string[] = [];

  if (localBytesBefore <= maxBytes) {
    return { localDeletedFiles, localDeletedBytes, localBytesBefore, localBytesAfter };
  }

  files.sort((left, right) => left.mtimeMs - right.mtimeMs || left.path.localeCompare(right.path));
  for (const file of files) {
    if (localBytesAfter <= maxBytes) {
      break;
    }

    await rm(file.path, { force: true });
    localBytesAfter -= file.size;
    localDeletedBytes += file.size;
    localDeletedFiles.push(file.path);
  }

  return { localDeletedFiles, localDeletedBytes, localBytesBefore, localBytesAfter };
}

async function collectFiles(rootPath: string): Promise<LocalFile[]> {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }

  const files: LocalFile[] = [];
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(entryPath);
    files.push({ path: entryPath, size: fileStat.size, mtimeMs: fileStat.mtimeMs });
  }

  return files;
}

function isMissingPathError(error: unknown) {
  return isNodeError(error) && error.code === "ENOENT";
}

function isNodeError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && "code" in error;
}
