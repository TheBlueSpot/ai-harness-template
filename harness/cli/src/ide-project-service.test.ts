import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { IdeProjectService, parseGitStatus, parseRipgrepJson, resolveProjectPath } from "./ide-project-service";

async function withTempProject(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-ide-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runGit(root: string, args: string[]) {
  const process = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
}

describe("IdeProjectService", () => {
  test("lists real project files and skips ignored heavy directories", async () => {
    await withTempProject(async (root) => {
      await mkdir(path.join(root, "src"), { recursive: true });
      await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
      await writeFile(path.join(root, "src", "app.ts"), "export const ok = true;\n");
      await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "ignored\n");

      const result = await new IdeProjectService().listFileTree({ projectRoot: root });

      expect(result.entries.map((entry) => entry.path)).toContain("src");
      expect(result.entries.find((entry) => entry.path === "src")?.hasChildren).toBe(true);
      expect(result.entries.some((entry) => entry.path.startsWith("node_modules"))).toBe(false);
      expect(result.truncated).toBe(false);

      const childResult = await new IdeProjectService().listFileTree({ projectRoot: root, rootPath: "src" });
      expect(childResult.entries.map((entry) => entry.path)).toContain("src/app.ts");
      expect(childResult.entries.find((entry) => entry.path === "src/app.ts")?.parentPath).toBe("src");
    });
  });

  test("rejects file paths outside the active project", async () => {
    await withTempProject(async (root) => {
      expect(() => resolveProjectPath(root, "../outside.txt")).toThrow("outside the active project");
    });
  });

  test("reads text files with metadata", async () => {
    await withTempProject(async (root) => {
      await writeFile(path.join(root, "readme.md"), "# Hello\nBody\n");

      const file = await new IdeProjectService().readFile({
        projectId: "project-1",
        projectRoot: root,
        filePath: "readme.md"
      });

      expect(file.path).toBe("readme.md");
      expect(file.language).toBe("Markdown");
      expect(file.content).toBe("# Hello\nBody\n");
      expect(file.isBinary).toBe(false);
      expect(file.tooLarge).toBe(false);
    });
  });

  test("writes text files inside the active project", async () => {
    await withTempProject(async (root) => {
      await writeFile(path.join(root, "readme.md"), "# Old\n");

      const file = await new IdeProjectService().writeFile({
        projectId: "project-1",
        projectRoot: root,
        filePath: "readme.md",
        content: "# New\n"
      });

      expect(file.content).toBe("# New\n");
      expect(file.language).toBe("Markdown");
    });
  });

  test("does not return binary or oversized file content", async () => {
    await withTempProject(async (root) => {
      await writeFile(path.join(root, "asset.bin"), Buffer.from([1, 2, 0, 4]));
      await writeFile(path.join(root, "large.txt"), "0123456789");
      const service = new IdeProjectService();

      const binary = await service.readFile({ projectId: "project-1", projectRoot: root, filePath: "asset.bin" });
      const large = await service.readFile({ projectId: "project-1", projectRoot: root, filePath: "large.txt", maxBytes: 4 });

      expect(binary.isBinary).toBe(true);
      expect(binary.content).toBeUndefined();
      expect(large.tooLarge).toBe(true);
      expect(large.content).toBeUndefined();
    });
  });

  test("parses ripgrep json into grouped file results", () => {
    const output = [
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "src/app.ts" },
          lines: { text: "const needle = true;\n" },
          line_number: 3,
          submatches: [{ start: 6 }]
        }
      })
    ].join("\n");

    expect(parseRipgrepJson(output, 200)).toEqual({
      truncated: false,
      results: [
        {
          path: "src/app.ts",
          name: "app.ts",
          matches: [{ line: 3, column: 7, preview: "const needle = true;" }]
        }
      ]
    });
  });

  test("parses git branch and porcelain status", () => {
    const status = parseGitStatus("## main...origin/main\0 M src/app.ts\0?? new.txt\0R  next.ts\0old.ts\0");

    expect(status.branch).toBe("main");
    expect(status.isRepository).toBe(true);
    expect(status.changes).toEqual([
      { path: "src/app.ts", status: "modified", shortStatus: "M" },
      { path: "new.txt", status: "untracked", shortStatus: "??" },
      { path: "next.ts", originalPath: "old.ts", status: "renamed", shortStatus: "R" }
    ]);
  });

  test("reports git changes relative to nested active project roots", async () => {
    await withTempProject(async (repoRoot) => {
      const projectRoot = path.join(repoRoot, "context");
      const skillPath = path.join(projectRoot, ".agents", "skills", "deep", "SKILL.md");
      await mkdir(path.dirname(skillPath), { recursive: true });
      await writeFile(skillPath, "old\n");
      await runGit(repoRoot, ["init"]);
      await runGit(repoRoot, ["config", "user.email", "test@example.com"]);
      await runGit(repoRoot, ["config", "user.name", "Harness Test"]);
      await runGit(repoRoot, ["add", "."]);
      await runGit(repoRoot, ["commit", "-m", "init"]);
      await writeFile(skillPath, "new\n");

      const status = await new IdeProjectService().gitStatus(projectRoot);

      expect(status.isRepository).toBe(true);
      expect(status.changes).toContainEqual({ path: ".agents/skills/deep/SKILL.md", status: "modified", shortStatus: "M" });
      expect(status.changes.some((change) => change.path.startsWith("context/"))).toBe(false);
    });
  });
});
