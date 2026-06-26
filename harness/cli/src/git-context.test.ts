import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildGitRepositoryPromptContext, resolveGitRepositoryPromptContext } from "./git-context";

describe("git prompt context", () => {
  test("reports non-repository folders with git-safe guidance", () => {
    const root = path.join(tmpdir(), `git-context-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });

    try {
      const context = resolveGitRepositoryPromptContext(root);
      const prompt = buildGitRepositoryPromptContext(root);

      expect(context.isRepository).toBe(false);
      expect(context.repoRoot).toBe(root);
      expect(prompt).toContain("Current project is not inside a git worktree.");
      expect(prompt).toContain("Do not run git status, git diff, git ls-files");
      expect(prompt).toContain("filesystem reads");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports repository folders with git command availability", () => {
    const root = path.join(process.cwd(), ".tmp-test-data", `git-context-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    Bun.spawnSync({ cmd: ["git", "init"], cwd: root, stdout: "pipe", stderr: "pipe" });

    try {
      const context = resolveGitRepositoryPromptContext(root);
      const prompt = buildGitRepositoryPromptContext(root);

      expect(context.isRepository).toBe(true);
      expect(prompt).toContain("Current project is inside a git worktree.");
      expect(prompt).toContain("Git status/diff commands are available");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
