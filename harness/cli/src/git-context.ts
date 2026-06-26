export type GitRepositoryPromptContext = {
  isRepository: boolean;
  repoRoot: string;
};

export function resolveGitRepositoryPromptContext(cwd: string): GitRepositoryPromptContext {
  const result = tryRunGit(["rev-parse", "--show-toplevel"], cwd);
  if (!result || result.exitCode !== 0) {
    return {
      isRepository: false,
      repoRoot: cwd
    };
  }

  const repoRoot = new TextDecoder().decode(result.stdout).trim();
  return {
    isRepository: Boolean(repoRoot),
    repoRoot: repoRoot || cwd
  };
}

export function buildGitRepositoryPromptContext(cwd: string) {
  const context = resolveGitRepositoryPromptContext(cwd);
  if (context.isRepository) {
    return [
      "Git repository state:",
      "- Current project is inside a git worktree.",
      `- Git repository root: ${context.repoRoot}`,
      "- Git status/diff commands are available for change inspection when useful."
    ].join("\n");
  }

  return [
    "Git repository state:",
    "- Current project is not inside a git worktree.",
    "- Do not run git status, git diff, git ls-files, git checkout, git reset, git commit, or git worktree commands unless you first initialize or discover a repository.",
    "- Inspect and summarize local file changes with filesystem reads, directory listings, hashes, or direct file comparisons instead of git.",
    "- If a task needs version-control safety, explain that git history is unavailable and suggest initializing git or making a backup."
  ].join("\n");
}

function tryRunGit(args: string[], cwd: string) {
  try {
    return Bun.spawnSync({
      cmd: ["git", ...args],
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch {
    return undefined;
  }
}
