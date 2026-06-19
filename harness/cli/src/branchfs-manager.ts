import { copyFile, lstat, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AgentTrace, ExperimentInspection, ExperimentRun } from "../../shared/protocol";
import { DEFAULT_BRANCHFS_RETENTION, pruneBranchfsRoots } from "./branchfs-cleanup";

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

type BranchfsWarning = {
  kind: "large-materialization";
  message: string;
  estimatedBytes: number;
};

type BranchfsMaterializationPlan = {
  repoRoot: string;
  projectRelativePath: string;
  includedPaths: string[];
  passthroughDirectories: string[];
  estimatedBytes: number;
  estimatedFiles: number;
  warnings: BranchfsWarning[];
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
const LARGE_MATERIALIZATION_BYTES = 2 * 1024 * 1024 * 1024;
const LARGE_MATERIALIZATION_FILES = 50000;

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
    assertSafeRunId(this.context.runId);
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

    await pruneBranchfsRoots({ repoRoot, mode: "retention", retention: DEFAULT_BRANCHFS_RETENTION }).catch((error: unknown) => {
      this.emitTrace({
        stage: "branchfs-cleanup-warning",
        message: "BranchFS retention cleanup failed",
        detail: formatError(error)
      });
    });

    try {
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
      const materializationPlan = await this.createMaterializationPlan(repoRoot, projectRelativePath);
      for (const warning of materializationPlan.warnings) {
        this.emitTrace({
          stage: "branchfs-size-warning",
          message: warning.message,
          detail: `${formatBytes(warning.estimatedBytes)} across ${materializationPlan.estimatedFiles} files`
        });
      }

      await this.materializeMount(materializationPlan, repoMountPath, runRoot);
      await this.captureDirtySeed(repoRoot, dirtySeedPath, dirtyEntries);
      this.emitTrace({
        stage: "branchfs-inherit-dirty",
        message: "Inherited base dirty state into BranchFS mount",
        detail: dirtyEntries.length > 0 ? dirtyEntries.map((entry) => entry.path).join(", ") : "clean"
      });

      await this.snapshotProjectBaseline(projectMountPath, baseProjectPath);
      const baselineFiles = await hashTree(baseProjectPath);
      await this.seedIsolatedGitRepository(repoMountPath, materializationPlan.passthroughDirectories);
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
        passthroughDirectories: materializationPlan.passthroughDirectories,
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
    } catch (error) {
      await rm(runRoot, { recursive: true, force: true })
        .then(() => {
          this.emitTrace({
            stage: "branchfs-unmounted",
            message: "Unmounted failed BranchFS experiment workspace"
          });
        })
        .catch((cleanupError: unknown) => {
          this.emitTrace({
            stage: "branchfs-cleanup-warning",
            message: "Failed to clean up partial BranchFS workspace",
            detail: formatError(cleanupError)
          });
        });
      throw error;
    }
  }

  async readInspection(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    const changedPaths = await collectChangedPaths(lease.baseProjectPath, lease.projectMountPath);
    const diffText = await this.diffDirectories(lease.baseProjectPath, lease.projectMountPath, changedPaths);
    const { insertions, deletions } = summarizeDiffText(diffText);
    const inspectedAt = new Date().toISOString();
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
        updatedAt: inspectedAt
      },
      diffText,
      files: summarizeDiffFiles(diffText, changedPaths),
      inspectedAt,
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
      await copyBranchfsPathRobust(sourcePath, destinationPath);
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

  private async createMaterializationPlan(repoRoot: string, projectRelativePath: string): Promise<BranchfsMaterializationPlan> {
    const result = await this.runCommand(
      [GIT_EXECUTABLE, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      repoRoot
    );
    const includedPaths = result.stdout
      .split("\0")
      .filter(Boolean)
      .map((entry) => entry.replace(/\\/g, "/"))
      .filter((entry) => !isExcludedMaterializationPath(entry))
      .sort();
    const passthroughDirectories: string[] = [];
    for (const entry of PASSTHROUGH_DIRECTORIES) {
      const entryStats = await statIfPresent(path.join(repoRoot, entry));
      if (entryStats?.isDirectory()) {
        passthroughDirectories.push(entry);
      }
    }
    let estimatedBytes = 0;
    let estimatedFiles = 0;
    for (const relativePath of includedPaths) {
      const entryStats = await lstat(path.join(repoRoot, relativePath)).catch(() => undefined);
      if (!entryStats || entryStats.isSymbolicLink() || !entryStats.isFile()) {
        continue;
      }
      estimatedBytes += entryStats.size;
      estimatedFiles += 1;
    }
    const warnings: BranchfsWarning[] = [];
    if (estimatedBytes > LARGE_MATERIALIZATION_BYTES || estimatedFiles > LARGE_MATERIALIZATION_FILES) {
      warnings.push({
        kind: "large-materialization",
        message: "BranchFS materialization is large; continuing automatically",
        estimatedBytes
      });
    }
    return {
      repoRoot,
      projectRelativePath,
      includedPaths,
      passthroughDirectories,
      estimatedBytes,
      estimatedFiles,
      warnings
    };
  }

  private async materializeMount(plan: BranchfsMaterializationPlan, repoMountPath: string, runRoot: string) {
    for (const directory of plan.passthroughDirectories) {
      const sourcePath = path.join(plan.repoRoot, directory);
      const sourceStats = await statIfPresent(sourcePath);
      if (!sourceStats?.isDirectory()) {
        continue;
      }
      const targetPath = path.join(repoMountPath, directory);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
      await withFsRetry(() => symlink(sourcePath, targetPath, "junction")).catch((error: unknown) => {
        if (isMissingPathError(error) || isFileExistsError(error)) {
          return;
        }
        throw error;
      });
    }

    for (const relativePath of plan.includedPaths) {
      if (isWithinPassthrough(relativePath)) {
        continue;
      }
      const sourceStats = await lstatIfPresent(path.join(plan.repoRoot, relativePath));
      if (!sourceStats) {
        continue;
      }
      await copyBranchfsPathRobust(path.join(plan.repoRoot, relativePath), path.join(repoMountPath, relativePath));
    }

    await mkdir(path.join(runRoot, "upper"), { recursive: true });
  }

  private async snapshotProjectBaseline(projectMountPath: string, baseProjectPath: string) {
    await copyBranchfsPathRobust(projectMountPath, baseProjectPath);
  }

  private async seedIsolatedGitRepository(repoMountPath: string, passthroughDirectories: string[]) {
    await this.runCommand([GIT_EXECUTABLE, "init"], repoMountPath);
    await this.runCommand([GIT_EXECUTABLE, "config", "core.longpaths", "true"], repoMountPath);
    await this.runCommand([GIT_EXECUTABLE, "config", "user.email", "branchfs@local.invalid"], repoMountPath);
    await this.runCommand([GIT_EXECUTABLE, "config", "user.name", "BranchFS"], repoMountPath);
    const excludePath = path.join(repoMountPath, ".git", "info", "exclude");
    const excludeLines = [
      ".local/",
      ...passthroughDirectories.map((directory) => `${directory.replace(/\\/g, "/")}/`)
    ];
    await writeFile(excludePath, `${excludeLines.join("\n")}\n`, "utf8");
    await this.runCommand([GIT_EXECUTABLE, "add", "-A"], repoMountPath);
    await this.runCommand([GIT_EXECUTABLE, "commit", "--allow-empty", "-m", "branchfs baseline"], repoMountPath);
    this.emitTrace({
      stage: "branchfs-mounted",
      message: "Initialized isolated git baseline for BranchFS mount",
      detail: repoMountPath
    });
  }

  private async captureDirtySeed(repoRoot: string, dirtySeedPath: string, entries: DirtyStatusEntry[]) {
    for (const entry of entries) {
      const sourcePath = path.join(repoRoot, entry.path);
      const destinationPath = path.join(dirtySeedPath, entry.path);
      if (!(await pathExists(sourcePath))) {
        continue;
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyBranchfsPathRobust(sourcePath, destinationPath);
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
        const content = await readFileIfPresent(targetPath);
        hash.update(content ?? "<deleted>");
      } else {
        hash.update("<deleted>");
      }
    }
    return hash.digest("hex");
  }

  private async diffDirectories(baseDir: string, nextDir: string, changedPaths: string[] = []) {
    const result = await this.tryRunCommand(
      [GIT_EXECUTABLE, "diff", "--no-index", "--binary", "--", baseDir, nextDir],
      this.context.rootPath
    );
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(result.detail);
    }
    if (result.stdout.trim().length > 0 || changedPaths.length === 0) {
      return result.stdout;
    }
    return createSimpleDiffText(baseDir, nextDir, changedPaths);
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

async function createSimpleDiffText(baseDir: string, nextDir: string, changedPaths: string[]) {
  const diffs: string[] = [];
  for (const relativePath of changedPaths) {
    const basePath = path.join(baseDir, relativePath);
    const nextPath = path.join(nextDir, relativePath);
    const [baseStats, nextStats] = await Promise.all([lstatIfPresent(basePath), lstatIfPresent(nextPath)]);
    if (baseStats?.isSymbolicLink() || nextStats?.isSymbolicLink() || baseStats?.isDirectory() || nextStats?.isDirectory()) {
      continue;
    }
    const [baseContent, nextContent] = await Promise.all([
      baseStats?.isFile() ? readFileIfPresent(basePath) : undefined,
      nextStats?.isFile() ? readFileIfPresent(nextPath) : undefined
    ]);
    const lines = [
      `diff --git a/${relativePath} b/${relativePath}`,
      baseContent ? `--- a/${relativePath}` : "--- /dev/null",
      nextContent ? `+++ b/${relativePath}` : "+++ /dev/null",
      "@@"
    ];
    for (const line of splitDiffLines(baseContent)) {
      lines.push(`-${line}`);
    }
    for (const line of splitDiffLines(nextContent)) {
      lines.push(`+${line}`);
    }
    diffs.push(lines.join("\n"));
  }
  return diffs.join("\n");
}

function splitDiffLines(content: Buffer | undefined) {
  if (!content) {
    return [];
  }
  const lines = content.toString("utf8").split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

async function hashTree(rootPath: string, currentPath: string = rootPath, results: Record<string, string> = {}) {
  if (!(await pathExists(currentPath))) {
    return results;
  }

  const entryStats = await lstatIfPresent(currentPath);
  if (!entryStats) {
    return results;
  }
  if (entryStats.isSymbolicLink()) {
    return results;
  }
  if (entryStats.isFile()) {
    const relativePath = path.relative(rootPath, currentPath).replace(/\\/g, "/");
    const content = await readFileIfPresent(currentPath);
    if (!content) {
      return results;
    }
    const hash = createHash("sha256");
    hash.update(content);
    results[relativePath] = hash.digest("hex");
    return results;
  }

  const entries = await readdir(currentPath, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  });
  for (const entry of entries) {
    const relativePath = path.relative(rootPath, path.join(currentPath, entry.name)).replace(/\\/g, "/");
    if (isExcludedMaterializationPath(relativePath)) {
      continue;
    }
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

function summarizeDiffFiles(diffText: string, changedPaths: string[] = []) {
  const summaries: NonNullable<ExperimentInspection["files"]> = [];
  let current: NonNullable<ExperimentInspection["files"]>[number] | undefined;
  let currentHunks: string[] = [];

  const flush = () => {
    if (!current) {
      return;
    }
    current.hunksPreview = currentHunks.slice(0, 8).join("\n");
    summaries.push(current);
    current = undefined;
    currentHunks = [];
  };

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = { path: extractDiffPath(line) ?? "unknown", additions: 0, deletions: 0, hunksPreview: "" };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("+++ b/")) {
      current.path = line.slice("+++ b/".length) || current.path;
      continue;
    }
    if (line.startsWith("@@")) {
      currentHunks.push(line);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      current.additions += 1;
    } else if (line.startsWith("-")) {
      current.deletions += 1;
    }
  }
  flush();

  if (summaries.length > 0) {
    return summaries.map((summary, index) => ({
      ...summary,
      path: summary.path === "unknown" ? changedPaths[index] ?? summary.path : summary.path
    }));
  }

  return changedPaths.map((changedPath) => ({
    path: changedPath,
    additions: 0,
    deletions: 0,
    hunksPreview: ""
  }));
}

function extractDiffPath(line: string) {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
  return match?.[2] ?? match?.[1];
}

async function pathExists(targetPath: string) {
  return (await stat(targetPath).catch(() => undefined)) !== undefined;
}

async function statIfPresent(targetPath: string) {
  return stat(targetPath).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
}

async function lstatIfPresent(targetPath: string) {
  return withFsRetry(() => lstat(targetPath)).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
}

async function readFileIfPresent(targetPath: string) {
  return readFile(targetPath).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
}

function fsErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

function isMissingPathError(error: unknown) {
  const code = fsErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

type CopyRecursiveRobustOptions = {
  onDirectoryEntry?: (sourcePath: string, targetPath: string) => void | Promise<void>;
};

export async function copyBranchfsPathRobust(sourcePath: string, targetPath: string, options: CopyRecursiveRobustOptions = {}) {
  const sourceStats = await withFsRetry(() => lstat(sourcePath)).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
  if (!sourceStats) {
    return;
  }
  const targetStats = await lstatIfPresent(targetPath);
  if (sourceStats.isSymbolicLink()) {
    if (targetStats) {
      await rm(targetPath, { recursive: true, force: true });
    }
    const linkTarget = await withFsRetry(() => readlink(sourcePath)).catch((error: unknown) => {
      if (isMissingPathError(error)) {
        return undefined;
      }
      throw error;
    });
    if (!linkTarget) {
      return;
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    await withFsRetry(() => symlink(linkTarget, targetPath, "junction"));
    return;
  }

  if (sourceStats.isDirectory()) {
    if (targetStats && !targetStats.isDirectory()) {
      await rm(targetPath, { recursive: true, force: true });
    }
    await mkdir(targetPath, { recursive: true });
    const entries = await withFsRetry(() => readdir(sourcePath, { withFileTypes: true })).catch((error: unknown) => {
      if (isMissingPathError(error)) {
        return [];
      }
      throw error;
    });
    for (const entry of entries) {
      const childSourcePath = path.join(sourcePath, entry.name);
      const childTargetPath = path.join(targetPath, entry.name);
      await options.onDirectoryEntry?.(childSourcePath, childTargetPath);
      await copyBranchfsPathRobust(childSourcePath, childTargetPath, options);
    }
    return;
  }

  if (targetStats && !targetStats.isFile()) {
    await rm(targetPath, { recursive: true, force: true });
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await withFsRetry(async () => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  });
}

function isExcludedMaterializationPath(relativePath: string) {
  return (
    relativePath === ".git" ||
    relativePath.startsWith(".git/") ||
    relativePath === ".local" ||
    relativePath.startsWith(".local/") ||
    isWithinPassthrough(relativePath)
  );
}

function isWithinPassthrough(relativePath: string) {
  return PASSTHROUGH_DIRECTORIES.some((directory) => relativePath === directory || relativePath.startsWith(`${directory}/`));
}

function assertSafeRunId(runId: string) {
  if (
    !runId.trim() ||
    runId === "." ||
    runId === ".." ||
    path.isAbsolute(runId) ||
    runId.includes("/") ||
    runId.includes("\\") ||
    !/^[A-Za-z0-9._-]+$/.test(runId)
  ) {
    throw new Error("BranchFS runId must be a single safe path segment");
  }
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${bytes} bytes`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  const code = fsErrorCode(error);
  return code !== undefined && ["ENOENT", "ENOTDIR", "EBUSY", "EPERM", "EACCES"].includes(code);
}

function isFileExistsError(error: unknown) {
  return fsErrorCode(error) === "EEXIST";
}

export const testExports = {
  copyRecursiveRobust: copyBranchfsPathRobust
};
