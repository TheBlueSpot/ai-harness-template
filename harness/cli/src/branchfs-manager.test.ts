import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { lstat, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { BranchfsManager } from "./branchfs-manager";
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

  test("handles dirty tracked files deleted before lease creation", async () => {
    const rootPath = await fixture.createRepoClone("branchfs-deleted-dirty");
    await rm(path.join(rootPath, "tracked.txt"), { force: true });

    const manager = new BranchfsManager({ rootPath, runId: "run-deleted-dirty" });
    const lease = await manager.prepareExperimentLease();

    expect(existsSync(path.join(lease.projectMountPath, "tracked.txt"))).toBe(false);

    await manager.unmountExperiment(lease);
    expect(existsSync(lease.repoMountPath)).toBe(false);
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
});

async function readText(targetPath: string) {
  return readFile(targetPath, "utf8");
}
