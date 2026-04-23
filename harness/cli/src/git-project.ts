import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

export async function ensureProjectDirectory(rootPath: string) {
  const normalizedPath = rootPath.trim();
  if (!normalizedPath) {
    throw new Error("Project path is required");
  }

  if (!path.isAbsolute(normalizedPath)) {
    throw new Error("Project path must be absolute");
  }

  const existing = await stat(normalizedPath).catch(() => undefined);
  if (existing && !existing.isDirectory()) {
    throw new Error(`Project path is not a directory: ${normalizedPath}`);
  }

  await mkdir(normalizedPath, { recursive: true });
  return normalizedPath;
}

export async function probeGitAvailable() {
  try {
    return (await runGit(["--version"], process.cwd(), false)).exitCode === 0;
  } catch {
    return false;
  }
}

export async function probeInsideWorktree(rootPath: string) {
  const result = await runGit(["rev-parse", "--is-inside-work-tree"], rootPath, false).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
    detail: "git probe failed"
  }));
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export async function initializeGitBaseline(rootPath: string) {
  await runGit(["init"], rootPath);
  await runGit(["add", "-A"], rootPath);

  const diffResult = await runGit(["diff", "--cached", "--quiet"], rootPath, false);
  if (diffResult.exitCode === 0) {
    return {
      initialized: true as const,
      baselineCommitCreated: false
    };
  }

  await runGit(
    [
      "-c",
      "user.name=Pi Harness",
      "-c",
      "user.email=pi-harness@local",
      "commit",
      "-m",
      "chore: initial harness baseline"
    ],
    rootPath
  );

  return {
    initialized: true as const,
    baselineCommitCreated: true
  };
}

async function runGit(args: string[], cwd: string, throwOnFailure = true) {
  const process = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ]);
  const detail = stderr.trim() || stdout.trim() || `git ${args[0] ?? ""} failed with exit ${exitCode}`;
  if (throwOnFailure && exitCode !== 0) {
    throw new Error(detail);
  }
  return { stdout, stderr, exitCode, detail };
}
