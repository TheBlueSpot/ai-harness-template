import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { BranchfsManager } from "./branchfs-manager";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((targetPath) => rm(targetPath, { recursive: true, force: true })));
});

describe("branchfs manager", () => {
  test("inherits dirty tracked and untracked files into experiment mount", async () => {
    const rootPath = createTempDir("branchfs-dirty");
    seedGitRepo(rootPath);
    writeFileSync(path.join(rootPath, "tracked.txt"), "dirty tracked\n");
    writeFileSync(path.join(rootPath, "local-only.txt"), "local only\n");

    const manager = new BranchfsManager({ rootPath, runId: "run-dirty" });
    const lease = await manager.prepareExperimentLease();

    expect(await readText(path.join(lease.projectMountPath, "tracked.txt"))).toBe("dirty tracked\n");
    expect(await readText(path.join(lease.projectMountPath, "local-only.txt"))).toBe("local only\n");

    await manager.unmountExperiment(lease);
    expect(existsSync(lease.repoMountPath)).toBe(false);
  });

  test("reads diff and flushes experiment changes back to disk", async () => {
    const rootPath = createTempDir("branchfs-flush");
    seedGitRepo(rootPath);

    const manager = new BranchfsManager({ rootPath, runId: "run-flush" });
    const lease = await manager.prepareExperimentLease();

    writeFileSync(path.join(lease.projectMountPath, "tracked.txt"), "experiment update\n");
    writeFileSync(path.join(lease.projectMountPath, "new-file.txt"), "created\n");
    await rm(path.join(lease.projectMountPath, "nested", "keep.txt"), { force: true });

    const inspection = await manager.readInspection(lease);
    expect(inspection.changedPaths).toContain("tracked.txt");
    expect(inspection.changedPaths).toContain("new-file.txt");
    expect(inspection.changedPaths).toContain("nested/keep.txt");

    await manager.flushExperiment(lease);
    expect(await readText(path.join(rootPath, "tracked.txt"))).toBe("experiment update\n");
    expect(await readText(path.join(rootPath, "new-file.txt"))).toBe("created\n");
    expect(existsSync(path.join(rootPath, "nested", "keep.txt"))).toBe(false);

    await manager.discardExperiment(lease);
    expect(existsSync(path.dirname(lease.repoMountPath))).toBe(false);
  });
});

function createTempDir(prefix: string) {
  const targetPath = path.join(process.cwd(), ".tmp-test-data", `${prefix}-${crypto.randomUUID()}`);
  mkdirSync(targetPath, { recursive: true });
  tempPaths.push(targetPath);
  return targetPath;
}

function seedGitRepo(rootPath: string) {
  mkdirSync(path.join(rootPath, "nested"), { recursive: true });
  writeFileSync(path.join(rootPath, ".gitignore"), ".local\n");
  writeFileSync(path.join(rootPath, "tracked.txt"), "base tracked\n");
  writeFileSync(path.join(rootPath, "nested", "keep.txt"), "keep\n");
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

async function readText(targetPath: string) {
  return readFile(targetPath, "utf8");
}
