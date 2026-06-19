import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { lstat, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BranchfsManager, testExports } from "./branchfs-manager";
import { useGitProjectFixture } from "./test-support/git-project-fixture";

describe("branchfs manager", () => {
  const fixture = useGitProjectFixture({
    fixtureName: "branchfs-manager",
    packageName: "branchfs-manager-test",
    readmeTitle: "# BranchFS Test\n",
    gitIgnore: ".local\n.tmp-test-data\n",
    extraFiles: [
      {
        relativePath: "tracked.txt",
        content: "base tracked\n"
      },
      {
        relativePath: path.join("nested", "keep.txt"),
        content: "keep\n"
      }
    ]
  });

  test("inherits dirty tracked and untracked files into experiment mount", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-dirty");
    writeFileSync(path.join(rootPath, "tracked.txt"), "dirty tracked\n");
    writeFileSync(path.join(rootPath, "local-only.txt"), "local only\n");

    const manager = new BranchfsManager({ rootPath, runId: "run-dirty" });
    const lease = await manager.prepareExperimentLease();

    expect(await readText(path.join(lease.projectMountPath, "tracked.txt"))).toBe("dirty tracked\n");
    expect(await readText(path.join(lease.projectMountPath, "local-only.txt"))).toBe("local only\n");

    await manager.unmountExperiment(lease);
    expect(existsSync(lease.repoMountPath)).toBe(false);
  });

  test("mount is an isolated git repository for agent diff commands", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-git-mount");

    const manager = new BranchfsManager({ rootPath, runId: "run-git-mount" });
    const lease = await manager.prepareExperimentLease();

    const statusBefore = Bun.spawnSync({
      cmd: ["git", "status", "--short"],
      cwd: lease.projectMountPath,
      stdout: "pipe",
      stderr: "pipe"
    });
    expect(statusBefore.exitCode).toBe(0);
    expect(statusBefore.stdout.toString()).toBe("");

    writeFileSync(path.join(lease.projectMountPath, "tracked.txt"), "changed in mount\n");
    const diff = Bun.spawnSync({
      cmd: ["git", "diff", "--", "tracked.txt"],
      cwd: lease.projectMountPath,
      stdout: "pipe",
      stderr: "pipe"
    });
    expect(diff.exitCode).toBe(0);
    expect(diff.stdout.toString()).toContain("changed in mount");

    const inspection = await manager.readInspection(lease);
    expect(inspection.changedPaths).toEqual(["tracked.txt"]);

    await manager.unmountExperiment(lease);
  });

  test("does not copy ignored local data into experiment mount", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-ignored");
    await mkdir(path.join(rootPath, ".tmp-test-data"), { recursive: true });
    writeFileSync(path.join(rootPath, ".tmp-test-data", "cache.txt"), "ignored\n");

    const manager = new BranchfsManager({ rootPath, runId: "run-ignored" });
    const lease = await manager.prepareExperimentLease();

    expect(existsSync(path.join(lease.projectMountPath, ".tmp-test-data"))).toBe(false);

    await manager.unmountExperiment(lease);
  });

  test("keeps heavy passthrough directories as junctions instead of copied trees", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-passthrough");
    for (const name of ["node_modules", "dist", ".bun"]) {
      await mkdir(path.join(rootPath, name), { recursive: true });
      writeFileSync(path.join(rootPath, name, "host.txt"), "host\n");
    }

    const manager = new BranchfsManager({ rootPath, runId: "run-passthrough" });
    const lease = await manager.prepareExperimentLease();

    for (const name of ["node_modules", "dist", ".bun"]) {
      expect((await lstat(path.join(lease.repoMountPath, name))).isSymbolicLink()).toBe(true);
    }

    await manager.unmountExperiment(lease);
  });

  test("skips missing passthrough directories instead of creating broken junctions", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-missing-passthrough");
    for (const name of ["node_modules", "dist", ".bun"]) {
      await rm(path.join(rootPath, name), { recursive: true, force: true });
    }

    const manager = new BranchfsManager({ rootPath, runId: "run-missing-passthrough" });
    const lease = await manager.prepareExperimentLease();

    for (const name of ["node_modules", "dist", ".bun"]) {
      expect(await lstat(path.join(lease.repoMountPath, name)).catch(() => undefined)).toBeUndefined();
    }

    await manager.unmountExperiment(lease);
  });

  test("prepares concurrent leases without pruning in-flight partial roots", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-concurrent");
    const managers = [
      new BranchfsManager({ rootPath, runId: "run-concurrent-a" }),
      new BranchfsManager({ rootPath, runId: "run-concurrent-b" })
    ];

    const leases = await Promise.all(managers.map((manager) => manager.prepareExperimentLease()));

    expect(existsSync(leases[0].manifestPath)).toBe(true);
    expect(existsSync(leases[1].manifestPath)).toBe(true);

    await Promise.all(managers.map((manager, index) => manager.unmountExperiment(leases[index])));
  });

  test("handles dirty tracked files deleted before lease creation", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-deleted-dirty");
    await rm(path.join(rootPath, "tracked.txt"), { force: true });

    const manager = new BranchfsManager({ rootPath, runId: "run-deleted-dirty" });
    const lease = await manager.prepareExperimentLease();

    expect(existsSync(path.join(lease.projectMountPath, "tracked.txt"))).toBe(false);

    await manager.unmountExperiment(lease);
    expect(existsSync(lease.repoMountPath)).toBe(false);
  });

  test("skips source files that vanish during robust copy", async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "branchfs-vanished-copy-"));
    const sourcePath = path.join(tempRoot, "missing.svg");
    const targetPath = path.join(tempRoot, "target.svg");

    await testExports.copyRecursiveRobust(sourcePath, targetPath);

    expect(existsSync(targetPath)).toBe(false);
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("keeps copying siblings after a directory entry vanishes", async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "branchfs-vanished-entry-"));
    const sourceDirectory = path.join(tempRoot, "source");
    const targetDirectory = path.join(tempRoot, "target");
    const vanishedSourcePath = path.join(sourceDirectory, "gone.txt");
    const keptTargetPath = path.join(targetDirectory, "keep.txt");
    const vanishedTargetPath = path.join(targetDirectory, "gone.txt");

    await mkdir(sourceDirectory, { recursive: true });
    writeFileSync(vanishedSourcePath, "gone\n");
    writeFileSync(path.join(sourceDirectory, "keep.txt"), "keep\n");

    await testExports.copyRecursiveRobust(sourceDirectory, targetDirectory, {
      async onDirectoryEntry(sourcePath) {
        if (sourcePath === vanishedSourcePath) {
          await rm(vanishedSourcePath, { force: true });
        }
      }
    });

    expect(await readText(keptTargetPath)).toBe("keep\n");
    expect(existsSync(vanishedTargetPath)).toBe(false);
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("keeps copying when a target entry vanishes during robust copy", async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "branchfs-vanished-target-entry-"));
    const sourceDirectory = path.join(tempRoot, "source");
    const targetDirectory = path.join(tempRoot, "target");
    const replacedSourcePath = path.join(sourceDirectory, "replace.txt");
    const replacedTargetPath = path.join(targetDirectory, "replace.txt");

    await mkdir(sourceDirectory, { recursive: true });
    await mkdir(targetDirectory, { recursive: true });
    writeFileSync(replacedSourcePath, "fresh\n");
    writeFileSync(replacedTargetPath, "stale\n");

    await testExports.copyRecursiveRobust(sourceDirectory, targetDirectory, {
      async onDirectoryEntry(sourcePath) {
        if (sourcePath === replacedSourcePath) {
          await rm(replacedTargetPath, { force: true });
        }
      }
    });

    expect(await readText(replacedTargetPath)).toBe("fresh\n");
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("rejects unsafe run ids before touching branchfs roots", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-unsafe-run-id");
    const manager = new BranchfsManager({ rootPath, runId: "../outside" });

    await expect(manager.prepareExperimentLease()).rejects.toThrow("BranchFS runId must be a single safe path segment");
    expect(existsSync(path.join(rootPath, ".local", "outside"))).toBe(false);
  });

  test("reads diff and flushes experiment changes back to disk", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-flush");

    const manager = new BranchfsManager({ rootPath, runId: "run-flush" });
    const lease = await manager.prepareExperimentLease();

    writeFileSync(path.join(lease.projectMountPath, "tracked.txt"), "experiment update\n");
    writeFileSync(path.join(lease.projectMountPath, "new-file.txt"), "created\n");
    await rm(path.join(lease.projectMountPath, "nested", "keep.txt"), { force: true });

    const inspection = await manager.readInspection(lease);
    expect(inspection.changedPaths).toContain("tracked.txt");
    expect(inspection.changedPaths).toContain("new-file.txt");
    expect(inspection.changedPaths).toContain("nested/keep.txt");
    expect(inspection.files?.map((file) => file.path)).toContain("tracked.txt");
    expect(inspection.files?.find((file) => file.path === "tracked.txt")?.additions).toBeGreaterThan(0);
    expect(inspection.inspectedAt).toBeTruthy();

    await manager.flushExperiment(lease);
    expect(await readText(path.join(rootPath, "tracked.txt"))).toBe("experiment update\n");
    expect(await readText(path.join(rootPath, "new-file.txt"))).toBe("created\n");
    expect(existsSync(path.join(rootPath, "nested", "keep.txt"))).toBe(false);

    await manager.discardExperiment(lease);
    expect(existsSync(path.dirname(lease.repoMountPath))).toBe(false);
  });

  test("flushes file to directory replacements back to disk", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-file-to-dir");

    const manager = new BranchfsManager({ rootPath, runId: "run-file-to-dir" });
    const lease = await manager.prepareExperimentLease();

    await rm(path.join(lease.projectMountPath, "tracked.txt"), { force: true });
    await mkdir(path.join(lease.projectMountPath, "tracked.txt"), { recursive: true });
    writeFileSync(path.join(lease.projectMountPath, "tracked.txt", "child.txt"), "child\n");

    await manager.flushExperiment(lease);

    expect((await lstat(path.join(rootPath, "tracked.txt"))).isDirectory()).toBe(true);
    expect(await readText(path.join(rootPath, "tracked.txt", "child.txt"))).toBe("child\n");

    await manager.discardExperiment(lease);
  });

  test("flushes directory to file replacements back to disk", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-dir-to-file");

    const manager = new BranchfsManager({ rootPath, runId: "run-dir-to-file" });
    const lease = await manager.prepareExperimentLease();

    await rm(path.join(lease.projectMountPath, "nested"), { recursive: true, force: true });
    writeFileSync(path.join(lease.projectMountPath, "nested"), "replacement file\n");

    await manager.flushExperiment(lease);

    expect((await lstat(path.join(rootPath, "nested"))).isFile()).toBe(true);
    expect(await readText(path.join(rootPath, "nested"))).toBe("replacement file\n");

    await manager.discardExperiment(lease);
  });
});

async function readText(targetPath: string) {
  return readFile(targetPath, "utf8");
}
