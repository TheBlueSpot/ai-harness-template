import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { pruneBranchfsRoots } from "./branchfs-cleanup";
import { useGitProjectFixture } from "./test-support/git-project-fixture";

describe("branchfs cleanup", () => {
  const fixture = useGitProjectFixture({
    fixtureName: "branchfs-cleanup",
    packageName: "branchfs-cleanup-test",
    readmeTitle: "# BranchFS Cleanup Test\n"
  });

  test("deletes complete and partial roots without following passthrough junctions", async () => {
    const repoRoot = await fixture.createRepoClone("branchfs-cleanup-all");
    const hostModules = path.join(repoRoot, "node_modules");
    mkdirSync(hostModules, { recursive: true });
    writeFileSync(path.join(hostModules, "host.txt"), "host\n");
    const completeRoot = await createBranchfsRoot(repoRoot, "complete", true);
    const partialRoot = await createBranchfsRoot(repoRoot, "partial", false);
    await symlink(hostModules, path.join(completeRoot, "mount", "node_modules"), "junction");

    const summary = await pruneBranchfsRoots({ repoRoot, mode: "all" });

    expect(summary.rootsScanned).toBe(2);
    expect(summary.rootsDeleted).toBe(2);
    expect(existsSync(completeRoot)).toBe(false);
    expect(existsSync(partialRoot)).toBe(false);
    expect(await Bun.file(path.join(hostModules, "host.txt")).text()).toBe("host\n");
  });

  test("retention deletes partial roots and keeps only newest complete roots", async () => {
    const repoRoot = await fixture.createRepoClone("branchfs-cleanup-retention");
    await createBranchfsRoot(repoRoot, "complete-1", true);
    await Bun.sleep(5);
    await createBranchfsRoot(repoRoot, "complete-2", true);
    await Bun.sleep(5);
    await createBranchfsRoot(repoRoot, "complete-3", true);
    await Bun.sleep(5);
    await createBranchfsRoot(repoRoot, "complete-4", true);
    await createBranchfsRoot(repoRoot, "partial", false);
    await Bun.sleep(5);

    const summary = await pruneBranchfsRoots({
      repoRoot,
      mode: "retention",
      retention: { maxAgeMs: 24 * 60 * 60 * 1000, maxRoots: 3, maxBytes: 1024 * 1024 * 1024, partialGraceMs: 0 }
    });

    expect(summary.rootsScanned).toBe(5);
    expect(summary.rootsDeleted).toBe(2);
    expect(existsSync(path.join(repoRoot, ".local", "branchfs", "complete-1"))).toBe(false);
    expect(existsSync(path.join(repoRoot, ".local", "branchfs", "partial"))).toBe(false);
    expect(existsSync(path.join(repoRoot, ".local", "branchfs", "complete-4"))).toBe(true);
  });

  test("retention keeps fresh partial roots so concurrent leases can finish", async () => {
    const repoRoot = await fixture.createRepoClone("branchfs-cleanup-fresh-partial");
    await createBranchfsRoot(repoRoot, "complete", true);
    const partialRoot = await createBranchfsRoot(repoRoot, "partial", false);

    const summary = await pruneBranchfsRoots({
      repoRoot,
      mode: "retention",
      retention: { maxAgeMs: 24 * 60 * 60 * 1000, maxRoots: 3, maxBytes: 1024 * 1024 * 1024, partialGraceMs: 60_000 }
    });

    expect(summary.rootsScanned).toBe(2);
    expect(summary.rootsDeleted).toBe(0);
    expect(existsSync(partialRoot)).toBe(true);
  });
});

async function createBranchfsRoot(repoRoot: string, name: string, manifest: boolean) {
  const root = path.join(repoRoot, ".local", "branchfs", name);
  await mkdir(path.join(root, "mount"), { recursive: true });
  await mkdir(path.join(root, "base"), { recursive: true });
  await mkdir(path.join(root, "dirty-seed"), { recursive: true });
  await mkdir(path.join(root, "upper"), { recursive: true });
  if (manifest) {
    await mkdir(path.join(root, "meta"), { recursive: true });
    writeFileSync(path.join(root, "meta", "manifest.json"), "{}");
  }
  writeFileSync(path.join(root, "mount", "file.txt"), name);
  return root;
}
