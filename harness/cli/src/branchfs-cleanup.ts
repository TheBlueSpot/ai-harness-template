import { lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { BranchfsCleanupSummary } from "../../shared/protocol";

const BRANCHFS_DIRNAME = ".local/branchfs";
const BRANCHFS_DELETING_DIRNAME = ".local/branchfs-deleting";

export const DEFAULT_BRANCHFS_RETENTION = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxRoots: 3,
  maxBytes: 20 * 1024 * 1024 * 1024,
  partialGraceMs: 10 * 60 * 1000
};

type PruneInput = {
  repoRoot: string;
  mode: "all" | "retention";
  retention?: {
    maxAgeMs: number;
    maxRoots: number;
    maxBytes: number;
    partialGraceMs?: number;
  };
};

type RootCandidate = {
  path: string;
  name: string;
  createdMs: number;
  bytes: number;
  partial: boolean;
};

export async function pruneBranchfsRoots(input: PruneInput): Promise<BranchfsCleanupSummary> {
  const branchfsRoot = path.join(input.repoRoot, BRANCHFS_DIRNAME);
  await mkdir(branchfsRoot, { recursive: true });
  const entries = await readdir(branchfsRoot, { withFileTypes: true }).catch(() => []);
  const roots: RootCandidate[] = [];
  const warnings: string[] = [];
  const shouldMeasureRoots = input.mode === "retention";
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const rootPath = path.join(branchfsRoot, entry.name);
    const rootStats = await lstat(rootPath).catch(() => undefined);
    if (!rootStats) {
      continue;
    }
    const bytes = shouldMeasureRoots
      ? await measureNoFollow(rootPath).catch((error: unknown) => {
          warnings.push(`Failed to measure ${entry.name}: ${formatError(error)}`);
          return 0;
        })
      : 0;
    roots.push({
      path: rootPath,
      name: entry.name,
      createdMs: rootStats.birthtimeMs || rootStats.ctimeMs || rootStats.mtimeMs,
      bytes,
      partial: !(await pathExists(path.join(rootPath, "meta", "manifest.json")))
    });
  }

  const deleteNames = new Set<string>();
  if (input.mode === "all") {
    roots.forEach((root) => deleteNames.add(root.name));
  } else {
    const retention = input.retention ?? DEFAULT_BRANCHFS_RETENTION;
    const now = Date.now();
    const partialGraceMs = retention.partialGraceMs ?? DEFAULT_BRANCHFS_RETENTION.partialGraceMs;
    for (const root of roots) {
      if ((root.partial && now - root.createdMs > partialGraceMs) || now - root.createdMs > retention.maxAgeMs) {
        deleteNames.add(root.name);
      }
    }

    const newestFirst = roots
      .filter((root) => !deleteNames.has(root.name))
      .sort((left, right) => right.createdMs - left.createdMs);
    newestFirst.slice(retention.maxRoots).forEach((root) => deleteNames.add(root.name));

    let retainedBytes = 0;
    for (const root of newestFirst) {
      if (deleteNames.has(root.name)) {
        continue;
      }
      if (retainedBytes + root.bytes > retention.maxBytes) {
        deleteNames.add(root.name);
        continue;
      }
      retainedBytes += root.bytes;
    }
  }

  let bytesDeleted = 0;
  let rootsDeleted = 0;
  for (const root of roots) {
    if (!deleteNames.has(root.name)) {
      continue;
    }
    try {
      if (input.mode === "all") {
        await quarantineBranchfsRoot(input.repoRoot, root.path, root.name);
      } else {
        await removeBranchfsRoot(root.path);
      }
      rootsDeleted += 1;
      bytesDeleted += root.bytes;
    } catch (error) {
      warnings.push(`Failed to delete ${root.name}: ${formatError(error)}`);
    }
  }

  await mkdir(branchfsRoot, { recursive: true });
  return {
    rootsScanned: roots.length,
    rootsDeleted,
    rootsRetained: roots.length - rootsDeleted,
    bytesDeleted,
    warnings
  };
}

async function quarantineBranchfsRoot(repoRoot: string, rootPath: string, rootName: string) {
  await unlinkKnownPassthroughs(rootPath);
  const deletingRoot = path.join(repoRoot, BRANCHFS_DELETING_DIRNAME);
  await mkdir(deletingRoot, { recursive: true });
  const targetPath = path.join(deletingRoot, `${Date.now()}-${process.pid}-${rootName}`);
  await rename(rootPath, targetPath);
  startDetachedRemove(targetPath);
}

async function removeBranchfsRoot(rootPath: string) {
  await unlinkKnownPassthroughs(rootPath);
  await rm(rootPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

async function unlinkKnownPassthroughs(rootPath: string) {
  for (const passthrough of ["node_modules", "dist", ".bun"]) {
    const target = path.join(rootPath, "mount", passthrough);
    const targetStats = await lstat(target).catch(() => undefined);
    if (targetStats) {
      await rm(target, { force: true, recursive: false }).catch(() => undefined);
    }
  }
}

async function measureNoFollow(rootPath: string): Promise<number> {
  const entryStats = await lstat(rootPath).catch(() => undefined);
  if (!entryStats || entryStats.isSymbolicLink()) {
    return 0;
  }
  if (entryStats.isFile()) {
    return entryStats.size;
  }
  if (!entryStats.isDirectory()) {
    return 0;
  }
  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    total += await measureNoFollow(path.join(rootPath, entry.name));
  }
  return total;
}

async function pathExists(targetPath: string) {
  return (await stat(targetPath).catch(() => undefined)) !== undefined;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function startDetachedRemove(targetPath: string) {
  const command =
    process.platform === "win32"
      ? [
          "powershell.exe",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          [
            "param($targetPath)",
            "$empty = Join-Path ([IO.Path]::GetTempPath()) ('branchfs-empty-' + [guid]::NewGuid().ToString('N'))",
            "New-Item -ItemType Directory -Path $empty -Force | Out-Null",
            "robocopy $empty $targetPath /MIR /XJ /R:0 /W:0 /NFL /NDL /NJH /NJS /NP | Out-Null",
            "Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue",
            "Remove-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue"
          ].join("; "),
          targetPath
        ]
      : ["rm", "-rf", "--", targetPath];
  Bun.spawn({
    cmd: command,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore"
  });
}
