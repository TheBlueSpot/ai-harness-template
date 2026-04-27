import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { clearProjectSearchCacheForTests, searchProjectFolders } from "./project-search-service";

describe("project search service", () => {
  afterEach(() => {
    clearProjectSearchCacheForTests();
  });

  test("returns absolute path completions for child directories", async () => {
    const root = createTempDir("absolute");
    mkdirSync(path.join(root, "repo-alpha"), { recursive: true });
    mkdirSync(path.join(root, "repo-beta"), { recursive: true });

    const results = await searchProjectFolders({
      query: path.join(root, "repo"),
      workspaceProjectPaths: [],
      cwd: root,
      homeDir: root
    });

    expect(results.map((result) => result.name)).toContain("repo-alpha");
    expect(results.map((result) => result.name)).toContain("repo-beta");
    expect(results.every((result) => result.matchKind === "path-prefix")).toBe(true);
  });

  test("ranks git repos above plain folders", async () => {
    const root = createTempDir("ranking");
    mkdirSync(path.join(root, "repo-git", ".git"), { recursive: true });
    mkdirSync(path.join(root, "repo-folder"), { recursive: true });

    const results = await searchProjectFolders({
      query: "repo",
      workspaceProjectPaths: [],
      cwd: root,
      homeDir: root
    });

    expect(results[0]?.rootPath).toBe(path.join(root, "repo-git"));
    expect(results[0]?.repoKind).toBe("git-repo");
  });

  test("skips ignored directories", async () => {
    const root = createTempDir("ignored");
    mkdirSync(path.join(root, "node_modules", "repo-hidden", ".git"), { recursive: true });
    mkdirSync(path.join(root, "repo-visible", ".git"), { recursive: true });

    const results = await searchProjectFolders({
      query: "repo",
      workspaceProjectPaths: [],
      cwd: root,
      homeDir: root
    });

    expect(results.some((result) => result.rootPath.includes("repo-hidden"))).toBe(false);
    expect(results.some((result) => result.rootPath.includes("repo-visible"))).toBe(true);
  });

  test("enforces result cap", async () => {
    const root = createTempDir("cap");
    for (let index = 0; index < 12; index += 1) {
      mkdirSync(path.join(root, `repo-${index}`, ".git"), { recursive: true });
    }

    const results = await searchProjectFolders({
      query: "repo",
      workspaceProjectPaths: [],
      cwd: root,
      homeDir: root
    });

    expect(results).toHaveLength(8);
  });

  test("stops traversal in noisy deep trees and still returns bounded matches", async () => {
    const root = createTempDir("traversal");
    let current = root;
    for (let index = 0; index < 10; index += 1) {
      current = path.join(current, `nest-${index}`);
      mkdirSync(current, { recursive: true });
      mkdirSync(path.join(current, `repo-${index}`, ".git"), { recursive: true });
    }

    const results = await searchProjectFolders({
      query: "repo",
      workspaceProjectPaths: [],
      cwd: root,
      homeDir: path.join(root, "home")
    });

    expect(results.length).toBeLessThanOrEqual(8);
    expect(results.every((result) => result.name.startsWith("repo-"))).toBe(true);
  });

  test("aborts traversal before reading queued directories", async () => {
    const root = createTempDir("abort");
    mkdirSync(path.join(root, "repo-visible"), { recursive: true });
    const controller = new AbortController();
    let readCount = 0;

    await expect(
      searchProjectFolders({
        query: "repo",
        workspaceProjectPaths: [],
        cwd: root,
        homeDir: root,
        signal: controller.signal,
        fsAdapter: {
          async readdir(rootPath, options) {
            readCount += 1;
            controller.abort();
            return readdir(rootPath, options);
          },
          async stat(rootPath) {
            return stat(rootPath);
          }
        }
      })
    ).rejects.toThrow("Project search aborted");
    expect(readCount).toBe(1);
  });
});

function createTempDir(label: string) {
  const root = path.join(process.cwd(), ".tmp-test-data", `project-search-${label}-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}
