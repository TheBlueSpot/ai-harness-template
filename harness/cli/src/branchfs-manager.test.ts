import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { BranchfsManager } from "./branchfs-manager";
import { useGitProjectFixture } from "./test-support/git-project-fixture";

describe("branchfs manager", () => {
  const fixture = useGitProjectFixture({
    fixtureName: "branchfs-manager",
    packageName: "branchfs-manager-test",
    readmeTitle: "# BranchFS Test\n",
    gitIgnore: ".local\n",
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
