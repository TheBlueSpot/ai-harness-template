import { constants as fsConstants } from "node:fs";
import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";

export type WorktreeProvisionResult = {
  worktreePath: string;
  copiedArtifacts: string[];
  installDurationMs: number;
};

const ARTIFACT_PATHS = ["dist", "tsconfig.tsbuildinfo"] as const;
const REFLINK_ERROR_CODES = new Set(["ENOTSUP", "EINVAL", "EXDEV", "ENOSYS", "UNKNOWN"]);

export async function provisionWorktree(rootPath: string, worktreePath: string): Promise<WorktreeProvisionResult> {
  await ensureDirectoryExists(worktreePath);

  const startedAt = Date.now();
  await runCommand(["bun", "install"], worktreePath);

  const copiedArtifacts: string[] = [];
  for (const relativePath of ARTIFACT_PATHS) {
    const sourcePath = path.join(rootPath, relativePath);
    const targetPath = path.join(worktreePath, relativePath);
    if (!(await pathExists(sourcePath))) {
      continue;
    }

    await copyArtifact(sourcePath, targetPath);
    copiedArtifacts.push(relativePath);
  }

  return {
    worktreePath,
    copiedArtifacts,
    installDurationMs: Date.now() - startedAt
  };
}

export async function cleanupWorktree(worktreePath: string): Promise<void> {
  if (!(await pathExists(worktreePath))) {
    return;
  }

  let repoRoot: string | undefined;
  try {
    await runCommand(["git", "rev-parse", "--git-common-dir"], worktreePath);
    repoRoot = await runCommand(["git", "rev-parse", "--show-toplevel"], worktreePath);
  } catch {
    repoRoot = undefined;
  }

  if (repoRoot) {
    try {
      await runCommand(["git", "worktree", "remove", "--force", worktreePath], repoRoot);
    } catch {
      // Fall through to rm so teardown still succeeds if git metadata is stale.
    }

    try {
      await runCommand(["git", "worktree", "prune"], repoRoot);
    } catch {
      // Ignore prune failures during cleanup.
    }
  }

  await rm(worktreePath, { recursive: true, force: true });
}

async function copyArtifact(sourcePath: string, targetPath: string) {
  try {
    await cp(sourcePath, targetPath, {
      recursive: true,
      force: true,
      mode: fsConstants.COPYFILE_FICLONE
    });
  } catch (error) {
    if (!isReflinkFallbackError(error)) {
      throw error;
    }

    await cp(sourcePath, targetPath, {
      recursive: true,
      force: true
    });
  }
}

async function ensureDirectoryExists(directoryPath: string) {
  const stats = await stat(directoryPath).catch(() => undefined);
  if (!stats?.isDirectory()) {
    throw new Error(`Worktree path is not a directory: ${directoryPath}`);
  }
}

async function pathExists(targetPath: string) {
  return (await stat(targetPath).catch(() => undefined)) !== undefined;
}

function isReflinkFallbackError(error: unknown) {
  return error instanceof Error && "code" in error && REFLINK_ERROR_CODES.has(String(error.code));
}

async function runCommand(command: string[], cwd: string) {
  const proc = Bun.spawn({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || `exit ${exitCode}`;
    throw new Error(`${command.join(" ")} failed: ${detail}`);
  }

  return stdout.trim();
}
