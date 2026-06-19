import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { copyLauncherRuntimeAssets } from "./launcher-assets";

describe("launcher assets", () => {
  test("copies bundled skills into portable release directory", async () => {
    const root = path.join(process.cwd(), ".tmp-test-data", `launcher-assets-${crypto.randomUUID()}`);
    const repoRoot = path.join(root, "repo");
    const targetDir = path.join(root, "release");
    mkdirSync(path.join(repoRoot, "dist", "ui"), { recursive: true });
    mkdirSync(path.join(repoRoot, ".agents", "skills", "assistant-actions"), { recursive: true });
    mkdirSync(path.join(repoRoot, ".agents", "skills", "grill-me"), { recursive: true });
    writeFileSync(path.join(repoRoot, "dist", "ui", "index.html"), "<!doctype html>\n");
    writeFileSync(path.join(repoRoot, "package.json"), "{}\n");
    writeFileSync(path.join(repoRoot, "agents.md"), "# Agents\n");
    writeFileSync(path.join(repoRoot, ".agents", "skills", "assistant-actions", "SKILL.md"), "# assistant-actions\n");
    writeFileSync(path.join(repoRoot, ".agents", "skills", "grill-me", "SKILL.md"), "# grill-me\n");

    try {
      await copyLauncherRuntimeAssets(repoRoot, targetDir);

      expect(existsSync(path.join(targetDir, ".agents", "skills", "assistant-actions", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(targetDir, ".agents", "skills", "grill-me", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
