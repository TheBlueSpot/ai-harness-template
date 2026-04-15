import type { RunPreflight } from "../../shared/protocol";

const MAX_DIRTY_FILE_COUNT = 20;

export type GitPreflightResult =
  | { status: "not-git" | "clean"; changedFileCount: 0 }
  | { status: "warning" | "blocked"; changedFileCount: number; preflight: RunPreflight };

type GitPreflightOptions = {
  enabled?: boolean;
  maxDirtyFileCount?: number;
};

export async function runGitPreflight(
  rootPath: string,
  { enabled = true, maxDirtyFileCount = MAX_DIRTY_FILE_COUNT }: GitPreflightOptions = {}
): Promise<GitPreflightResult> {
  if (!enabled) {
    return {
      status: "clean",
      changedFileCount: 0
    };
  }

  const insideWorktree = await runGit(["rev-parse", "--is-inside-work-tree"], rootPath);
  if (insideWorktree.exitCode !== 0 || insideWorktree.stdout.trim() !== "true") {
    return {
      status: "not-git",
      changedFileCount: 0
    };
  }

  const statusResult = await runGit(["status", "--porcelain=v1", "--untracked-files=all"], rootPath);
  if (statusResult.exitCode !== 0) {
    return {
      status: "clean",
      changedFileCount: 0
    };
  }

  const changedFileCount = statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean).length;

  if (changedFileCount === 0) {
    return {
      status: "clean",
      changedFileCount: 0
    };
  }

  const preflight: RunPreflight = {
    severity: "warning",
    kind: "git-dirty",
    message:
      changedFileCount > maxDirtyFileCount
        ? `Git dirty. ${changedFileCount} files changed. Refuse run.`
        : `Git dirty. ${changedFileCount} files changed. Run anyway.`,
    changedFileCount
  };

  return {
    status: changedFileCount > maxDirtyFileCount ? "blocked" : "warning",
    changedFileCount,
    preflight
  };
}

async function runGit(args: string[], cwd: string) {
  const command = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited
  ]);

  return {
    stdout,
    stderr,
    exitCode
  };
}
