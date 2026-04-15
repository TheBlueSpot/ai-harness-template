import { mkdir, readFile, rm, stat, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import type { AgentTrace, PlannerSubtask } from "../../shared/protocol";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import { provisionWorktree, cleanupWorktree, type WorktreeProvisionResult } from "./worktree-provisioner";

export type WorktreeExecutionContext = {
  rootPath: string;
  runId: string;
  debugEnabled: boolean;
  executionModelId: string;
};

export type DirtySnapshot = {
  trackedPatchPath: string | undefined;
  untrackedRelativePaths: string[];
};

export type SubagentWorktreeLease = {
  taskId: string;
  branchName: string;
  worktreePath: string;
  baseCommit: string;
};

export type SubagentCommitResult = {
  taskId: string;
  branchName: string;
  worktreePath: string;
  commitSha: string;
};

export type IntegrationMergeResult = {
  integrationWorktreePath: string;
  mergedCommitShas: string[];
  conflictResolved: boolean;
};

type WorktreeTrace = {
  stage: AgentTrace["stage"];
  message: string;
  detail?: string;
  subagentId?: string;
};

type ManagerCallbacks = {
  onTrace?: (trace: WorktreeTrace) => void;
};

type VerifiedScripts = {
  ranTypecheck: boolean;
  ranTest: boolean;
};

type ManagerState = {
  repoRoot: string;
  runRoot: string;
  snapshotDir: string;
  snapshotBranchName: string;
  snapshotCommit: string;
  baseCommit: string;
  snapshot: DirtySnapshot;
};

const COMMITTER_NAME = "Pi Harness";
const COMMITTER_EMAIL = "pi-harness@local";

export class GitWorktreeManager {
  private readonly context: WorktreeExecutionContext;
  private readonly callbacks: ManagerCallbacks;
  private initPromise: Promise<ManagerState> | undefined;

  constructor(context: WorktreeExecutionContext, callbacks: ManagerCallbacks = {}) {
    this.context = context;
    this.callbacks = callbacks;
  }

  async prepareSubagentLease(taskId: string): Promise<SubagentWorktreeLease> {
    const state = await this.ensureInitialized();
    const branchName = this.getSubagentBranchName(taskId);
    const worktreePath = path.join(state.runRoot, taskId);

    await this.removeWorktreeAndBranch(worktreePath, branchName);
    await this.runGit(["worktree", "add", "-b", branchName, worktreePath, state.snapshotCommit], state.repoRoot);
    const provision = await provisionWorktree(state.repoRoot, worktreePath);
    this.emitTrace({
      stage: "worktree-provision",
      message: `Provisioned worktree for ${taskId}`,
      detail: describeProvision(provision),
      subagentId: taskId
    });

    return {
      taskId,
      branchName,
      worktreePath,
      baseCommit: state.snapshotCommit
    };
  }

  async finalizeSubagentLease(lease: SubagentWorktreeLease): Promise<SubagentCommitResult> {
    await this.runGit(["add", "-A"], lease.worktreePath);
    const hasChanges = await this.hasStagedChanges(lease.worktreePath);
    const commitArgs = hasChanges
      ? ["-c", `user.name=${COMMITTER_NAME}`, "-c", `user.email=${COMMITTER_EMAIL}`, "commit", "-m", `chore: subagent ${lease.taskId}`]
      : [
          "-c",
          `user.name=${COMMITTER_NAME}`,
          "-c",
          `user.email=${COMMITTER_EMAIL}`,
          "commit",
          "--allow-empty",
          "-m",
          `chore: subagent ${lease.taskId}`
        ];
    await this.runGit(commitArgs, lease.worktreePath);
    const commitSha = await this.runGit(["rev-parse", "HEAD"], lease.worktreePath);
    return {
      taskId: lease.taskId,
      branchName: lease.branchName,
      worktreePath: lease.worktreePath,
      commitSha
    };
  }

  async cleanupSubagentLease(
    lease: Pick<SubagentWorktreeLease, "taskId" | "worktreePath">,
    options: {
      preserveWorktree?: boolean;
    } = {}
  ) {
    if (options.preserveWorktree) {
      return;
    }

    await cleanupWorktree(lease.worktreePath);
    this.emitTrace({
      stage: "worktree-cleanup",
      message: `Removed worktree for ${lease.taskId}`,
      subagentId: lease.taskId
    });
  }

  async mergeSubagentBranches(
    adapter: PiAgentAdapter,
    options: {
      tasks: PlannerSubtask[];
      subagentResults: Array<Pick<SubagentCommitResult, "taskId" | "commitSha">>;
      abortSignal?: AbortSignal;
    }
  ): Promise<IntegrationMergeResult | undefined> {
    const orderedResults = options.tasks
      .map((task) => options.subagentResults.find((result) => result.taskId === task.id))
      .filter((result): result is Pick<SubagentCommitResult, "taskId" | "commitSha"> => Boolean(result?.commitSha));

    if (orderedResults.length === 0) {
      return undefined;
    }

    const state = await this.ensureInitialized();
    const integrationBranchName = this.getIntegrationBranchName();
    const integrationWorktreePath = path.join(state.runRoot, "integration");

    await this.removeWorktreeAndBranch(integrationWorktreePath, integrationBranchName);
    await this.runGit(["worktree", "add", "-b", integrationBranchName, integrationWorktreePath, state.snapshotCommit], state.repoRoot);
    const provision = await provisionWorktree(state.repoRoot, integrationWorktreePath);
    this.emitTrace({
      stage: "worktree-provision",
      message: "Provisioned integration worktree",
      detail: describeProvision(provision)
    });

    this.emitTrace({
      stage: "merge-start",
      message: "Merging completed subagent branches",
      detail: orderedResults.map((result) => result.taskId).join(", ")
    });

    let conflictResolved = false;
    const mergedCommitShas: string[] = [];
    for (const result of orderedResults) {
      const mergeResult = await this.tryRunGit(
        ["merge", "--no-ff", "--no-edit", result.commitSha],
        integrationWorktreePath,
        options.abortSignal
      );

      if (mergeResult.exitCode === 0) {
        mergedCommitShas.push(result.commitSha);
        continue;
      }

      this.emitTrace({
        stage: "merge-conflict",
        message: `Merge conflict while integrating ${result.taskId}`,
        detail: mergeResult.detail
      });
      await this.resolveMergeConflict(adapter, integrationWorktreePath, options.tasks, result.taskId, options.abortSignal);
      conflictResolved = true;
      mergedCommitShas.push(result.commitSha);
    }

    this.emitTrace({
      stage: "merge-complete",
      message: "Merged subagent branches",
      detail: mergedCommitShas.join(", ")
    });

    return {
      integrationWorktreePath,
      mergedCommitShas,
      conflictResolved
    };
  }

  async verifyIntegrationWorktree(integrationWorktreePath: string): Promise<VerifiedScripts> {
    this.emitTrace({
      stage: "verification-start",
      message: "Running integration verification"
    });

    const packageJson = JSON.parse(await readFile(path.join(integrationWorktreePath, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    const ranTypecheck = Boolean(packageJson.scripts?.typecheck);
    const ranTest = Boolean(packageJson.scripts?.test);

    if (ranTypecheck) {
      await this.runCommand(["bun", "run", "typecheck"], integrationWorktreePath);
    }

    if (ranTest) {
      await this.runCommand(["bun", "run", "test"], integrationWorktreePath);
    }

    this.emitTrace({
      stage: "verification-complete",
      message: "Integration verification finished",
      detail: [
        ranTypecheck ? "typecheck" : "skip:typecheck",
        ranTest ? "test" : "skip:test"
      ].join(", ")
    });

    return {
      ranTypecheck,
      ranTest
    };
  }

  async syncIntegrationResultToRoot(integrationWorktreePath: string): Promise<void> {
    const state = await this.ensureInitialized();
    const changedFiles = await this.readNullSeparatedGitOutput(
      ["diff", "--name-only", "-z", `${state.snapshotCommit}`, "HEAD"],
      integrationWorktreePath
    );
    const deletedFiles = await this.readNullSeparatedGitOutput(
      ["diff", "--name-only", "--diff-filter=D", "-z", `${state.snapshotCommit}`, "HEAD"],
      integrationWorktreePath
    );

    for (const relativePath of changedFiles) {
      if (shouldSkipSync(relativePath)) {
        continue;
      }

      const sourcePath = path.join(integrationWorktreePath, relativePath);
      if (!(await pathExists(sourcePath))) {
        continue;
      }

      const destinationPath = path.join(state.repoRoot, relativePath);
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { force: true, recursive: true });
    }

    for (const relativePath of deletedFiles) {
      if (shouldSkipSync(relativePath) || isProtectedLockfile(relativePath)) {
        continue;
      }

      await rm(path.join(state.repoRoot, relativePath), { recursive: true, force: true });
    }

    this.emitTrace({
      stage: "sync-back",
      message: "Synced integration result back to project root",
      detail: `${changedFiles.length} changed, ${deletedFiles.length} deleted`
    });
  }

  async cleanupRunWorktrees(options: {
    taskIds: string[];
    preserveWorktreePaths?: string[];
    finalCleanup: boolean;
  }) {
    const state = await this.ensureInitialized();
    const preserved = new Set(options.preserveWorktreePaths ?? []);
    const worktreePaths = [
      state.snapshotDir,
      path.join(state.runRoot, "snapshot"),
      path.join(state.runRoot, "integration"),
      ...options.taskIds.map((taskId) => path.join(state.runRoot, taskId))
    ];

    for (const worktreePath of worktreePaths) {
      if (preserved.has(worktreePath)) {
        continue;
      }

      await cleanupWorktree(worktreePath);
    }

    if (options.finalCleanup) {
      const branchNames = [
        state.snapshotBranchName,
        this.getIntegrationBranchName(),
        ...options.taskIds.map((taskId) => this.getSubagentBranchName(taskId))
      ];

      for (const branchName of branchNames) {
        await this.tryRunGit(["branch", "-D", branchName], state.repoRoot);
      }

      await rm(state.runRoot, { recursive: true, force: true });
    }

    this.emitTrace({
      stage: "worktree-cleanup",
      message: options.finalCleanup ? "Removed run worktrees and branches" : "Removed disposable run worktrees"
    });
  }

  private async ensureInitialized() {
    this.initPromise ??= this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<ManagerState> {
    await this.ensureExecutable("git");
    await this.ensureExecutable("bun");

    const repoRoot = await this.runGit(["rev-parse", "--show-toplevel"], this.context.rootPath);
    const resolvedRepoRoot = path.resolve(repoRoot);
    const resolvedRootPath = path.resolve(this.context.rootPath);
    if (resolvedRepoRoot !== resolvedRootPath) {
      throw new Error(`Project root must match git repository root: ${resolvedRootPath}`);
    }

    await ensureFileExists(path.join(resolvedRepoRoot, "package.json"), "package.json");
    await ensureAnyFileExists(
      [path.join(resolvedRepoRoot, "bun.lock"), path.join(resolvedRepoRoot, "bun.lockb")],
      "bun lockfile"
    );

    const runRoot = path.join(resolvedRepoRoot, ".local", "worktrees", this.context.runId);
    const snapshotDir = path.join(runRoot, "snapshot-state");
    await mkdir(snapshotDir, { recursive: true });

    const baseCommit = await this.runGit(["rev-parse", "HEAD"], resolvedRepoRoot);
    const snapshotBranchName = this.getSnapshotBranchName();
    const existingSnapshotCommit = await this.resolveBranchCommit(snapshotBranchName, resolvedRepoRoot);
    if (existingSnapshotCommit) {
      return {
        repoRoot: resolvedRepoRoot,
        runRoot,
        snapshotDir,
        snapshotBranchName,
        snapshotCommit: existingSnapshotCommit,
        baseCommit,
        snapshot: await this.captureDirtySnapshot(snapshotDir, resolvedRepoRoot, baseCommit)
      };
    }

    const snapshot = await this.captureDirtySnapshot(snapshotDir, resolvedRepoRoot, baseCommit);
    if (!snapshot.trackedPatchPath && snapshot.untrackedRelativePaths.length === 0) {
      return {
        repoRoot: resolvedRepoRoot,
        runRoot,
        snapshotDir,
        snapshotBranchName,
        snapshotCommit: baseCommit,
        baseCommit,
        snapshot
      };
    }

    const snapshotWorktreePath = path.join(runRoot, "snapshot");
    await this.removeWorktreeAndBranch(snapshotWorktreePath, snapshotBranchName);
    await this.runGit(["worktree", "add", "-b", snapshotBranchName, snapshotWorktreePath, baseCommit], resolvedRepoRoot);
    await this.applyDirtySnapshot(snapshotWorktreePath, snapshot, snapshotDir);
    await this.runGit(["add", "-A"], snapshotWorktreePath);
    const hasSnapshotChanges = await this.hasStagedChanges(snapshotWorktreePath);
    let snapshotCommit = baseCommit;
    if (hasSnapshotChanges) {
      await this.runGit(
        [
          "-c",
          `user.name=${COMMITTER_NAME}`,
          "-c",
          `user.email=${COMMITTER_EMAIL}`,
          "commit",
          "-m",
          `chore: snapshot ${this.context.runId}`
        ],
        snapshotWorktreePath
      );
      snapshotCommit = await this.runGit(["rev-parse", "HEAD"], snapshotWorktreePath);
    }

    return {
      repoRoot: resolvedRepoRoot,
      runRoot,
      snapshotDir,
      snapshotBranchName,
      snapshotCommit,
      baseCommit,
      snapshot
    };
  }

  private async captureDirtySnapshot(snapshotDir: string, repoRoot: string, baseCommit: string): Promise<DirtySnapshot> {
    const trackedPatch = await this.runGit(["diff", "--binary", baseCommit, "--", "."], repoRoot);
    const trackedPatchPath = trackedPatch
      ? path.join(snapshotDir, "tracked.patch")
      : undefined;

    if (trackedPatchPath) {
      await mkdir(path.dirname(trackedPatchPath), { recursive: true });
      await writeFile(trackedPatchPath, trackedPatch, "utf8");
    }

    const untrackedRelativePaths = (await this.runGit(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot))
      .split("\0")
      .filter(Boolean)
      .sort();

    for (const relativePath of untrackedRelativePaths) {
      const sourcePath = path.join(repoRoot, relativePath);
      const destinationPath = path.join(snapshotDir, "untracked", relativePath);
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { force: true, recursive: true });
    }

    return {
      trackedPatchPath,
      untrackedRelativePaths
    };
  }

  private async applyDirtySnapshot(worktreePath: string, snapshot: DirtySnapshot, snapshotDir: string) {
    if (snapshot.trackedPatchPath) {
      await this.runGit(["apply", "--whitespace=nowarn", snapshot.trackedPatchPath], worktreePath);
    }

    const snapshotRoot = path.join(snapshotDir, "untracked");
    for (const relativePath of snapshot.untrackedRelativePaths) {
      const sourcePath = path.join(snapshotRoot, relativePath);
      const destinationPath = path.join(worktreePath, relativePath);
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { force: true, recursive: true });
    }
  }

  private async resolveMergeConflict(
    adapter: PiAgentAdapter,
    integrationWorktreePath: string,
    tasks: PlannerSubtask[],
    taskId: string,
    abortSignal?: AbortSignal
  ) {
    const unresolvedBefore = await this.readNullSeparatedGitOutput(
      ["diff", "--name-only", "--diff-filter=U", "-z"],
      integrationWorktreePath
    );
    const response = await adapter.runPrompt({
      kind: "merge-resolver",
      cwd: integrationWorktreePath,
      modelId: this.context.executionModelId,
      prompt: [
        "You are resolving git merge conflicts inside a Bun project worktree.",
        "Resolve only the current merge conflict state.",
        "Preserve both subtask intents when possible.",
        "Leave no unmerged files.",
        "",
        `Conflicting subtask: ${taskId}`,
        `Conflicting files: ${unresolvedBefore.join(", ") || "(unknown)"}`,
        "Planner subtasks:",
        tasks.map((task) => `${task.id}: ${task.title} :: ${task.instruction}`).join("\n")
      ].join("\n"),
      abortSignal
    });

    await this.runGit(["add", "-A"], integrationWorktreePath);
    const unresolvedAfter = await this.readNullSeparatedGitOutput(
      ["diff", "--name-only", "--diff-filter=U", "-z"],
      integrationWorktreePath
    );
    if (unresolvedAfter.length > 0) {
      throw new Error(`Merge resolver left unresolved files: ${unresolvedAfter.join(", ")}`);
    }

    await this.runGit(
      ["-c", `user.name=${COMMITTER_NAME}`, "-c", `user.email=${COMMITTER_EMAIL}`, "commit", "--no-edit"],
      integrationWorktreePath
    );

    this.emitTrace({
      stage: "merge-complete",
      message: `Resolved merge conflict for ${taskId}`,
      detail: response.text.slice(0, 240)
    });
  }

  private getSnapshotBranchName() {
    return `ai-snapshot/${this.context.runId}`;
  }

  private getSubagentBranchName(taskId: string) {
    return `ai-subagent/${this.context.runId}/${taskId}`;
  }

  private getIntegrationBranchName() {
    return `ai-integration/${this.context.runId}`;
  }

  private async removeWorktreeAndBranch(worktreePath: string, branchName: string) {
    await cleanupWorktree(worktreePath);
    const state = this.initPromise ? await this.initPromise.catch(() => undefined) : undefined;
    const repoRoot = state?.repoRoot ?? this.context.rootPath;
    await this.tryRunGit(["branch", "-D", branchName], repoRoot);
  }

  private async resolveBranchCommit(branchName: string, cwd: string) {
    const result = await this.tryRunGit(["rev-parse", "--verify", branchName], cwd);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  private async ensureExecutable(binary: string) {
    await this.runCommand([binary, "--version"], this.context.rootPath);
  }

  private async hasStagedChanges(cwd: string) {
    const result = await this.tryRunGit(["diff", "--cached", "--quiet"], cwd);
    return result.exitCode === 1;
  }

  private async readNullSeparatedGitOutput(args: string[], cwd: string) {
    const output = await this.runGit(args, cwd);
    return output.split("\0").filter(Boolean);
  }

  private emitTrace(trace: WorktreeTrace) {
    this.callbacks.onTrace?.(trace);
  }

  private async runGit(args: string[], cwd: string) {
    const result = await this.tryRunGit(args, cwd);
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.detail}`);
    }
    return result.stdout.trim();
  }

  private async tryRunGit(args: string[], cwd: string, abortSignal?: AbortSignal) {
    return this.tryRunCommand(["git", ...args], cwd, abortSignal);
  }

  private async runCommand(command: string[], cwd: string, abortSignal?: AbortSignal) {
    const result = await this.tryRunCommand(command, cwd, abortSignal);
    if (result.exitCode !== 0) {
      throw new Error(`${command.join(" ")} failed: ${result.detail}`);
    }
    return result.stdout.trim();
  }

  private async tryRunCommand(command: string[], cwd: string, abortSignal?: AbortSignal) {
    const proc = Bun.spawn({
      cmd: command,
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal: abortSignal
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

export async function ensureFileExists(filePath: string, label: string) {
  const fileStats = await stat(filePath).catch(() => undefined);
  if (!fileStats?.isFile()) {
    throw new Error(`Missing required ${label}: ${filePath}`);
  }
}

async function ensureAnyFileExists(filePaths: string[], label: string) {
  for (const filePath of filePaths) {
    const fileStats = await stat(filePath).catch(() => undefined);
    if (fileStats?.isFile()) {
      return;
    }
  }

  throw new Error(`Missing required ${label}: ${filePaths.join(" or ")}`);
}

async function pathExists(targetPath: string) {
  return (await stat(targetPath).catch(() => undefined)) !== undefined;
}

function shouldSkipSync(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  return (
    normalized === "tsconfig.tsbuildinfo" ||
    normalized === ".git" ||
    normalized.startsWith(".git/") ||
    normalized === "node_modules" ||
    normalized.startsWith("node_modules/") ||
    normalized === "dist" ||
    normalized.startsWith("dist/")
  );
}

function isProtectedLockfile(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized === "bun.lock" || normalized === "bun.lockb";
}

function describeProvision(provision: WorktreeProvisionResult) {
  return `${provision.installDurationMs}ms; copied ${provision.copiedArtifacts.join(", ") || "nothing"}`;
}
