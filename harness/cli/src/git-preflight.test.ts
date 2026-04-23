import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGitPreflight } from "./git-preflight";

describe("git preflight", () => {
  test("allows non-git folders when dirty-git restriction is disabled", async () => {
    const rootPath = createTempDir();

    await expect(runGitPreflight(rootPath, { enabled: false })).resolves.toEqual({
      status: "clean",
      changedFileCount: 0
    });
  });

  test("blocks non-git folders when dirty-git restriction is enabled", async () => {
    const rootPath = createTempDir();

    const result = await runGitPreflight(rootPath, { enabled: true });

    expect(result.status).toBe("blocked");
    expect(result.changedFileCount).toBe(0);
    expect(result.status === "blocked" ? result.preflight.kind : undefined).toBe("git-not-repo");
  });

  test("keeps dirty warning and blocking behavior for git repos", async () => {
    const rootPath = createTempDir();
    await runGit(["init"], rootPath);
    await runGit(["config", "user.name", "Test User"], rootPath);
    await runGit(["config", "user.email", "test@example.com"], rootPath);
    writeFileSync(path.join(rootPath, "readme.md"), "hello\n");
    await runGit(["add", "."], rootPath);
    await runGit(["commit", "-m", "init"], rootPath);

    writeFileSync(path.join(rootPath, "dirty-one.txt"), "one\n");
    expect((await runGitPreflight(rootPath, { maxDirtyFileCount: 1 })).status).toBe("warning");

    writeFileSync(path.join(rootPath, "dirty-two.txt"), "two\n");
    expect((await runGitPreflight(rootPath, { maxDirtyFileCount: 1 })).status).toBe("blocked");
  });
});

function createTempDir() {
  const rootPath = path.join(os.tmpdir(), `harness-git-preflight-${crypto.randomUUID()}`);
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

async function runGit(args: string[], cwd: string) {
  const process = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "ignore",
    stderr: "pipe"
  });
  const [stderr, exitCode] = await Promise.all([new Response(process.stderr).text(), process.exited]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args[0] ?? ""} failed`);
  }
}
