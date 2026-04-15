import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { PiAgentAdapter, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import { GitWorktreeManager } from "./git-worktree-manager";

const tempPaths: string[] = [];

class MergeResolverAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];

  setApiKey() {}

  hasApiKey() {
    return false;
  }

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    if (request.kind === "merge-resolver") {
      await Bun.write(path.join(request.cwd, "shared.txt"), "resolved\n");
      return { text: "resolved conflict" };
    }

    return { text: "ok" };
  }
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((targetPath) => rm(targetPath, { recursive: true, force: true })));
});

describe("git worktree manager", () => {
  test("rejects non-git roots", async () => {
    const rootPath = createTempDir("manager-non-git");
    seedBunProject(rootPath);
    const manager = new GitWorktreeManager({
      rootPath,
      runId: "run-non-git",
      debugEnabled: false,
      executionModelId: "openai/gpt-5.4"
    });

    await expect(manager.prepareSubagentLease("task-1")).rejects.toThrow("Project root must match git repository root");
  });

  test("rejects bun-less repos", async () => {
    const rootPath = createTempDir("manager-non-bun");
    mkdirSync(rootPath, { recursive: true });
    writeFileSync(path.join(rootPath, "README.md"), "# Repo\n");
    runSync(["git", "init"], rootPath);
    runSync(["git", "config", "user.name", "Test User"], rootPath);
    runSync(["git", "config", "user.email", "test@example.com"], rootPath);
    runSync(["git", "add", "."], rootPath);
    runSync(["git", "commit", "-m", "init"], rootPath);

    const manager = new GitWorktreeManager({
      rootPath,
      runId: "run-non-bun",
      debugEnabled: false,
      executionModelId: "openai/gpt-5.4"
    });

    await expect(manager.prepareSubagentLease("task-1")).rejects.toThrow("Missing required package.json");
  });

  test("commits isolated subagent changes and syncs merged result back to root", async () => {
    const rootPath = createTempDir("manager-sync");
    seedBunGitProject(rootPath);
    const manager = new GitWorktreeManager({
      rootPath,
      runId: "run-sync",
      debugEnabled: false,
      executionModelId: "openai/gpt-5.4"
    });

    const leaseA = await manager.prepareSubagentLease("task-1");
    writeFileSync(path.join(leaseA.worktreePath, "task-1.txt"), "task-1\n");
    const commitA = await manager.finalizeSubagentLease(leaseA);
    await manager.cleanupSubagentLease(leaseA);

    const leaseB = await manager.prepareSubagentLease("task-2");
    writeFileSync(path.join(leaseB.worktreePath, "task-2.txt"), "task-2\n");
    const commitB = await manager.finalizeSubagentLease(leaseB);
    await manager.cleanupSubagentLease(leaseB);

    const adapter = new MergeResolverAdapter();
    const integration = await manager.mergeSubagentBranches(adapter, {
      tasks: [
        { id: "task-1", title: "Task 1", instruction: "Write task-1" },
        { id: "task-2", title: "Task 2", instruction: "Write task-2" }
      ],
      subagentResults: [
        { taskId: "task-1", commitSha: commitA.commitSha },
        { taskId: "task-2", commitSha: commitB.commitSha }
      ]
    });

    expect(integration).toBeDefined();
    await manager.verifyIntegrationWorktree(integration!.integrationWorktreePath);
    await manager.syncIntegrationResultToRoot(integration!.integrationWorktreePath);
    await manager.cleanupRunWorktrees({
      taskIds: ["task-1", "task-2"],
      finalCleanup: true
    });

    expect(normalizeNewlines(await readFile(path.join(rootPath, "task-1.txt"), "utf8"))).toBe("task-1\n");
    expect(normalizeNewlines(await readFile(path.join(rootPath, "task-2.txt"), "utf8"))).toBe("task-2\n");
  });

  test("uses merge resolver when subagent commits conflict", async () => {
    const rootPath = createTempDir("manager-conflict");
    seedBunGitProject(rootPath);
    writeFileSync(path.join(rootPath, "shared.txt"), "base\n");
    runSync(["git", "add", "shared.txt"], rootPath);
    runSync(["git", "commit", "-m", "shared"], rootPath);

    const manager = new GitWorktreeManager({
      rootPath,
      runId: "run-conflict",
      debugEnabled: true,
      executionModelId: "openai/gpt-5.4"
    });

    const leaseA = await manager.prepareSubagentLease("task-1");
    writeFileSync(path.join(leaseA.worktreePath, "shared.txt"), "left\n");
    const commitA = await manager.finalizeSubagentLease(leaseA);
    await manager.cleanupSubagentLease(leaseA);

    const leaseB = await manager.prepareSubagentLease("task-2");
    writeFileSync(path.join(leaseB.worktreePath, "shared.txt"), "right\n");
    const commitB = await manager.finalizeSubagentLease(leaseB);
    await manager.cleanupSubagentLease(leaseB);

    const adapter = new MergeResolverAdapter();
    const integration = await manager.mergeSubagentBranches(adapter, {
      tasks: [
        { id: "task-1", title: "Task 1", instruction: "Write left" },
        { id: "task-2", title: "Task 2", instruction: "Write right" }
      ],
      subagentResults: [
        { taskId: "task-1", commitSha: commitA.commitSha },
        { taskId: "task-2", commitSha: commitB.commitSha }
      ]
    });

    expect(integration?.conflictResolved).toBe(true);
    expect(adapter.calls.some((call) => call.kind === "merge-resolver")).toBe(true);
    await manager.syncIntegrationResultToRoot(integration!.integrationWorktreePath);
    await manager.cleanupRunWorktrees({
      taskIds: ["task-1", "task-2"],
      finalCleanup: true
    });

    expect(normalizeNewlines(await readFile(path.join(rootPath, "shared.txt"), "utf8"))).toBe("resolved\n");
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
    JSON.stringify(
      {
        name: "manager-test",
        private: true,
        type: "module",
        scripts: {
          typecheck: "bun --version",
          test: "bun --version"
        }
      },
      null,
      2
    )
  );
  runSync(["bun", "install"], rootPath);
  if (!existsSync(path.join(rootPath, "bun.lock")) && !existsSync(path.join(rootPath, "bun.lockb"))) {
    writeFileSync(path.join(rootPath, "bun.lock"), "");
  }
}

function seedBunGitProject(rootPath: string) {
  seedBunProject(rootPath);
  writeFileSync(path.join(rootPath, ".gitignore"), ".local\nnode_modules\ndist\n");
  writeFileSync(path.join(rootPath, "README.md"), "# Manager Test\n");
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

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n");
}
