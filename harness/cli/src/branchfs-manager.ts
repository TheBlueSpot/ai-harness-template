import { copyFile, lstat, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AgentTrace, ExperimentInspection, ExperimentRun } from "../../shared/protocol";

type BranchfsTrace = {
  stage: AgentTrace["stage"];
  message: string;
  detail?: string;
  subagentId?: string;
};

type ManagerCallbacks = {
  onTrace?: (trace: BranchfsTrace) => void;
};

type DirtyStatusEntry = {
  path: string;
  staged: string;
  unstaged: string;
};

type BranchfsManifest = {
  runId: string;
  repoRoot: string;
  projectRelativePath: string;
  baseCommitSha?: string;
  baseBranchName?: string;
  baseDirtyFingerprint: string;
  virtualBranchName: string;
  passthroughDirectories: string[];
  createdAt: string;
  baselineFiles: Record<string, string>;
  deletedRelativePaths: string[];
};

export type BranchfsExecutionContext = {
  rootPath: string;
  runId: string;
};

export type BranchfsExperimentLease = {
  experiment: ExperimentRun;
  repoRoot: string;
  projectRelativePath: string;
  repoMountPath: string;
  projectMountPath: string;
  baseProjectPath: string;
  manifestPath: string;
  dirtySeedPath: string;
  upperPath: string;
};

const BRANCHFS_DIRNAME = ".local/branchfs";
const PASSTHROUGH_DIRECTORIES = ["node_modules", "dist", ".bun"];
const GIT_EXECUTABLE = process.platform === "win32" ? "git.exe" : "git";

// Current BranchFS is a local materialized mount shim with isolated diff/flush semantics.
// It preserves the command surface for a future true CoW virtual filesystem.
export class BranchfsManager {
  private readonly context: BranchfsExecutionContext;
  private readonly callbacks: ManagerCallbacks;

  constructor(context: BranchfsExecutionContext, callbacks: ManagerCallbacks = {}) {
    this.context = context;
    this.callbacks = callbacks;
  }

  async prepareExperimentLease(): Promise<BranchfsExperimentLease> {
    await this.ensureExecutable(GIT_EXECUTABLE, "git");
    const repoRoot = await this.resolveRepoRoot(this.context.rootPath);
    const resolvedRootPath = path.resolve(this.context.rootPath);
    const projectRelativePath = path.relative(repoRoot, resolvedRootPath);
    const runRoot = path.join(repoRoot, BRANCHFS_DIRNAME, this.context.runId);
    const repoMountPath = path.join(runRoot, "mount");
    const projectMountPath = projectRelativePath ? path.join(repoMountPath, projectRelativePath) : repoMountPath;
    const baseProjectPath = path.join(runRoot, "base", projectRelativePath);
    const dirtySeedPath = path.join(runRoot, "dirty-seed");
    const upperPath = path.join(runRoot, "upper");
    const metaPath = path.join(runRoot, "meta");
    const manifestPath = path.join(metaPath, "manifest.json");

    await rm(runRoot, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(repoMountPath, { recursive: true });
    await mkdir(baseProjectPath, { recursive: true });
    await mkdir(dirtySeedPath, { recursive: true });
    await mkdir(upperPath, { recursive: true });
    await mkdir(metaPath, { recursive: true });

    const baseCommitSha = await this.resolveHeadCommit(repoRoot);
    const baseBranchName = await this.resolveBranchName(repoRoot);
    const dirtyEntries = await this.readDirtyStatus(repoRoot, projectRelativePath);
    const baseDirtyFingerprint = await this.computeDirtyFingerprint(repoRoot, dirtyEntries);

    await this.materializeMount(repoRoot, repoMountPath, runRoot);
    await this.captureDirtySeed(repoRoot, dirtySeedPath, dirtyEntries);
    this.emitTrace({
      stage: "branchfs-inherit-dirty",
      message: "Inherited base dirty state into BranchFS mount",
      detail: dirtyEntries.length > 0 ? dirtyEntries.map((entry) => entry.path).join(", ") : "clean"
    });

    await this.snapshotProjectBaseline(projectMountPath, baseProjectPath);
    const baselineFiles = await hashTree(baseProjectPath);
    const virtualBranchName = `ai-experiment/${this.context.runId}`;
    const createdAt = new Date().toISOString();
    const experiment: ExperimentRun = {
      id: this.context.runId,
      runId: this.context.runId,
      status: "prepared",
      virtualBranchName,
      repoMountPath,
      projectMountPath,
      baseCommitSha,
      baseBranchName,
      baseDirtyFingerprint,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      createdAt,
      updatedAt: createdAt
    };
    const manifest: BranchfsManifest = {
      runId: this.context.runId,
      repoRoot,
      projectRelativePath,
      baseCommitSha,
      baseBranchName,
      baseDirtyFingerprint,
      virtualBranchName,
      passthroughDirectories: PASSTHROUGH_DIRECTORIES.filter((entry) => pathExists(path.join(repoRoot, entry))),
      createdAt,
      baselineFiles,
      deletedRelativePaths: []
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    this.emitTrace({
      stage: "branchfs-mounted",
      message: "Mounted BranchFS experiment workspace",
      detail: projectMountPath
    });

    return {
      experiment,
      repoRoot,
      projectRelativePath,
      repoMountPath,
      projectMountPath,
      baseProjectPath,
      manifestPath,
      dirtySeedPath,
      upperPath
    };
  }

  async readInspection(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    const changedPaths = await collectChangedPaths(lease.baseProjectPath, lease.projectMountPath);
    const diffText = await this.diffDirectories(lease.baseProjectPath, lease.projectMountPath);
    const { insertions, deletions } = summarizeDiffText(diffText);
    this.emitTrace({
      stage: "branchfs-diff-read",
      message: "Read BranchFS diff layer",
      detail: `${changedPaths.length} changed`
    });
    return {
      experiment: {
        ...lease.experiment,
        filesChanged: changedPaths.length,
        insertions,
        deletions,
        updatedAt: new Date().toISOString()
      },
      diffText,
      filesChanged: changedPaths.length,
      insertions,
      deletions,
      changedPaths
    };
  }

  async flushExperiment(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    const inspection = await this.readInspection(lease);
    const relativeDeleted = await collectDeletedPaths(lease.baseProjectPath, lease.projectMountPath);
    for (const relativePath of relativeDeleted) {
      await rm(path.join(lease.repoRoot, lease.projectRelativePath, relativePath), { recursive: true, force: true }).catch(() => undefined);
    }

    for (const relativePath of inspection.changedPaths) {
      const sourcePath = path.join(lease.projectMountPath, relativePath);
      const destinationPath = path.join(lease.repoRoot, lease.projectRelativePath, relativePath);
      if (!(await pathExists(sourcePath))) {
        continue;
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyRecursiveRobust(sourcePath, destinationPath);
    }

    this.emitTrace({
      stage: "branchfs-flushed",
      message: "Flushed BranchFS mount back to physical disk",
      detail: `${inspection.filesChanged} changed`
    });
    return inspection;
  }

  async discardExperiment(lease: BranchfsExperimentLease) {
    await this.unmountExperiment(lease);
  }

  async unmountExperiment(lease: BranchfsExperimentLease) {
    const runRoot = path.dirname(lease.repoMountPath);
    await rm(runRoot, { recursive: true, force: true }).catch(() => undefined);
    this.emitTrace({
      stage: "branchfs-unmounted",
      message: "Unmounted BranchFS experiment workspace"
    });
  }

  private async materializeMount(repoRoot: string, repoMountPath: string, runRoot: string) {
    const excluded = new Set([".git", ".local"]);
    const entries = await readdir(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.has(entry.name)) {
        continue;
      }

      const sourcePath = path.join(repoRoot, entry.name);
      const targetPath = path.join(repoMountPath, entry.name);
      if (entry.isDirectory() && PASSTHROUGH_DIRECTORIES.includes(entry.name)) {
        await symlink(sourcePath, targetPath, "junction");
        continue;
      }

      await copyRecursiveRobust(sourcePath, targetPath);
    }

    await mkdir(path.join(runRoot, "upper"), { recursive: true });
  }

  private async snapshotProjectBaseline(projectMountPath: string, baseProjectPath: string) {
    await copyRecursiveRobust(projectMountPath, baseProjectPath);
  }

  private async captureDirtySeed(repoRoot: string, dirtySeedPath: string, entries: DirtyStatusEntry[]) {
    for (const entry of entries) {
      const sourcePath = path.join(repoRoot, entry.path);
      const destinationPath = path.join(dirtySeedPath, entry.path);
      if (!(await pathExists(sourcePath))) {
        continue;
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyRecursiveRobust(sourcePath, destinationPath);
    }
  }

  private async resolveRepoRoot(cwd: string) {
    const result = await this.runCommand([GIT_EXECUTABLE, "rev-parse", "--show-toplevel"], cwd);
    return result.stdout.trim();
  }

  private async resolveHeadCommit(cwd: string) {
    const result = await this.tryRunCommand([GIT_EXECUTABLE, "rev-parse", "--verify", "HEAD"], cwd);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  private async resolveBranchName(cwd: string) {
    const result = await this.tryRunCommand([GIT_EXECUTABLE, "branch", "--show-current"], cwd);
    return result.exitCode === 0 ? result.stdout.trim() || undefined : undefined;
  }

  private async readDirtyStatus(repoRoot: string, projectRelativePath: string) {
    const scope = projectRelativePath ? projectRelativePath.replace(/\\/g, "/") : ".";
    const result = await this.runCommand(
      [GIT_EXECUTABLE, "status", "--porcelain", "-z", "--untracked-files=all", "--", scope],
      repoRoot
    );
    const parts = result.stdout.split("\0").filter(Boolean);
    const entries: DirtyStatusEntry[] = [];
    for (const part of parts) {
      if (part.length < 4) {
        continue;
      }

      const staged = part.slice(0, 1);
      const unstaged = part.slice(1, 2);
      const relativePath = part.slice(3).trim();
      entries.push({
        path: relativePath,
        staged,
        unstaged
      });
    }
    return entries;
  }

  private async computeDirtyFingerprint(repoRoot: string, entries: DirtyStatusEntry[]) {
    const hash = createHash("sha256");
    for (const entry of entries.sort((left, right) => left.path.localeCompare(right.path))) {
      hash.update(entry.staged);
      hash.update(entry.unstaged);
      hash.update(entry.path);
      const targetPath = path.join(repoRoot, entry.path);
      if (await pathExists(targetPath)) {
        hash.update(await readFile(targetPath));
      } else {
        hash.update("<deleted>");
      }
    }
    return hash.digest("hex");
  }

  private async diffDirectories(baseDir: string, nextDir: string) {
    const result = await this.tryRunCommand(
      [GIT_EXECUTABLE, "diff", "--no-index", "--binary", "--", baseDir, nextDir],
      this.context.rootPath
    );
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(result.detail);
    }
    return result.stdout;
  }

  private emitTrace(trace: BranchfsTrace) {
    this.callbacks.onTrace?.(trace);
  }

  private async ensureExecutable(binary: string, label: string = binary) {
    const result = await this.tryRunCommand([binary, "--version"], this.context.rootPath);
    if (result.exitCode !== 0) {
      throw new Error(`${label} is required`);
    }
  }

  private async runCommand(command: string[], cwd: string) {
    const result = await this.tryRunCommand(command, cwd);
    if (result.exitCode !== 0) {
      throw new Error(result.detail);
    }
    return result;
  }

  private async tryRunCommand(command: string[], cwd: string) {
    const proc = Bun.spawn({
      cmd: command,
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      detail: stderr.trim() || stdout.trim() || `exit ${exitCode}`
    };
  }
}

async function collectChangedPaths(baseDir: string, nextDir: string) {
  const baseFiles = await hashTree(baseDir);
  const nextFiles = await hashTree(nextDir);
  const allPaths = new Set([...Object.keys(baseFiles), ...Object.keys(nextFiles)]);
  return [...allPaths].filter((relativePath) => baseFiles[relativePath] !== nextFiles[relativePath]).sort();
}

async function collectDeletedPaths(baseDir: string, nextDir: string) {
  const baseFiles = await hashTree(baseDir);
  const nextFiles = await hashTree(nextDir);
  return Object.keys(baseFiles)
    .filter((relativePath) => !(relativePath in nextFiles))
    .sort();
}

async function hashTree(rootPath: string, currentPath: string = rootPath, results: Record<string, string> = {}) {
  if (!(await pathExists(currentPath))) {
    return results;
  }

  const entryStats = await stat(currentPath);
  if (entryStats.isFile()) {
    const relativePath = path.relative(rootPath, currentPath).replace(/\\/g, "/");
    const hash = createHash("sha256");
    hash.update(await readFile(currentPath));
    results[relativePath] = hash.digest("hex");
    return results;
  }

  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    await hashTree(rootPath, path.join(currentPath, entry.name), results);
  }
  return results;
}

function summarizeDiffText(diffText: string) {
  let insertions = 0;
  let deletions = 0;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      insertions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }
  return { insertions, deletions };
}

async function pathExists(targetPath: string) {
  return (await stat(targetPath).catch(() => undefined)) !== undefined;
}

async function copyRecursiveRobust(sourcePath: string, targetPath: string) {
  const sourceStats = await withFsRetry(() => lstat(sourcePath));
  if (sourceStats.isSymbolicLink()) {
    const linkTarget = await withFsRetry(() => readlink(sourcePath));
    await mkdir(path.dirname(targetPath), { recursive: true });
    await withFsRetry(() => symlink(linkTarget, targetPath, "junction"));
    return;
  }

  if (sourceStats.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const entries = await withFsRetry(() => readdir(sourcePath, { withFileTypes: true }));
    for (const entry of entries) {
      await copyRecursiveRobust(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await withFsRetry(async () => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  });
}

async function withFsRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableFsError(error) || attempt === 3) {
        throw error;
      }
      await Bun.sleep(25 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

function isRetryableFsError(error: unknown) {
  return error instanceof Error && "code" in error && ["ENOENT", "EBUSY", "EPERM", "EACCES"].includes(String(error.code));
}
