import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { cleanupWorktree, provisionWorktree } from "./worktree-provisioner";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((targetPath) => rm(targetPath, { recursive: true, force: true })));
});

describe("worktree provisioner", () => {
  test("runs bun install and copies dist plus tsbuildinfo when present", async () => {
    const rootPath = createTempDir("provision-root");
    const worktreePath = createTempDir("provision-worktree");

    seedBunProject(rootPath);
    seedBunProject(worktreePath);
    mkdirSync(path.join(rootPath, "dist"), { recursive: true });
    writeFileSync(path.join(rootPath, "dist", "bundle.js"), "console.log('bundle');\n");
    writeFileSync(path.join(rootPath, "tsconfig.tsbuildinfo"), "build-info");

    const result = await provisionWorktree(rootPath, worktreePath);

    expect(result.copiedArtifacts.sort()).toEqual(["dist", "tsconfig.tsbuildinfo"]);
    expect(await readFile(path.join(worktreePath, "dist", "bundle.js"), "utf8")).toContain("bundle");
    expect(await readFile(path.join(worktreePath, "tsconfig.tsbuildinfo"), "utf8")).toBe("build-info");
  });

  test("ignores missing artifacts", async () => {
    const rootPath = createTempDir("provision-root-empty");
    const worktreePath = createTempDir("provision-worktree-empty");

    seedBunProject(rootPath);
    seedBunProject(worktreePath);

    const result = await provisionWorktree(rootPath, worktreePath);

    expect(result.copiedArtifacts).toEqual([]);
  });

  test("removes a git worktree safely more than once", async () => {
    const repoRoot = createTempDir("cleanup-root");
    seedBunGitProject(repoRoot);
    const worktreePath = path.join(repoRoot, ".local", "worktrees", "cleanup-case");

    runSync(["git", "worktree", "add", "-b", "cleanup-case", worktreePath, "HEAD"], repoRoot);

    await cleanupWorktree(worktreePath);
    await cleanupWorktree(worktreePath);

    expect(existsSync(worktreePath)).toBe(false);
  });
});

function createTempDir(prefix: string) {
  const targetPath = path.join(process.cwd(), ".tmp-test-data", `${prefix}-${crypto.randomUUID()}`);
  mkdirSync(targetPath, { recursive: true });
  tempPaths.push(targetPath);
  return targetPath;
}

function seedBunProject(rootPath: string) {
  writeFileSync(
    path.join(rootPath, "package.json"),
    JSON.stringify({
      name: "provision-test",
      private: true,
      type: "module"
    })
  );
  writeFileSync(path.join(rootPath, "bun.lock"), "");
}

function seedBunGitProject(rootPath: string) {
  seedBunProject(rootPath);
  writeFileSync(path.join(rootPath, ".gitignore"), ".local\nnode_modules\ndist\n");
  writeFileSync(path.join(rootPath, "README.md"), "# Provision Test\n");
  runSync(["git", "init"], rootPath);
  runSync(["git", "config", "user.name", "Test User"], rootPath);
  runSync(["git", "config", "user.email", "test@example.com"], rootPath);
  runSync(["git", "add", "."], rootPath);
  runSync(["git", "commit", "-m", "init"], rootPath);
}

function runSync(command: string[], cwd: string) {
  const proc = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.exitCode !== 0) {
    const stdout = new TextDecoder().decode(proc.stdout);
    const stderr = new TextDecoder().decode(proc.stderr);
    throw new Error(`${command.join(" ")} failed: ${(stderr || stdout).trim()}`);
  }
}
