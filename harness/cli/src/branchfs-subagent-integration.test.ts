import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  discardBranchfsIntegrationLease,
  discardBranchfsSnapshots,
  flushBranchfsIntegrationLease,
  prepareBranchfsIntegrationLease,
  verifyBranchfsIntegrationLease
} from "./branchfs-subagent-integration";
import { BranchfsManager } from "./branchfs-manager";
import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult
} from "./pi-agent-adapter";
import type { BranchfsSubagentSnapshot } from "./pi-subagents";

const tempPaths: string[] = [];

setDefaultTimeout(15000);

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

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const adapter = this;
    let currentResult = adapter.runPrompt(request);
    return {
      get result() {
        return currentResult;
      },
      continueWithPrompt(prompt: string = "continue") {
        currentResult = adapter.runPrompt({ ...request, prompt });
        return currentResult;
      },
      async abort() {},
      dispose() {}
    };
  }
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((targetPath) => rm(targetPath, { recursive: true, force: true })));
});

describe("branchfs subagent integration", () => {
  test("flushes merged isolated subagent changes back to root", async () => {
    const rootPath = createTempDir("branchfs-subagent-merge");
    seedBunGitProject(rootPath);

    const snapshots = await Promise.all([
      createSnapshot(rootPath, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "task-1.txt"), "task-1\n");
      }),
      createSnapshot(rootPath, "task-2", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "task-2.txt"), "task-2\n");
      })
    ]);

    const integration = await prepareBranchfsIntegrationLease(
      new MergeResolverAdapter(),
      {
        rootPath,
        runId: "run-merge",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [
          { id: "task-1", title: "Task 1", instruction: "Write task-1" },
          { id: "task-2", title: "Task 2", instruction: "Write task-2" }
        ],
        snapshots
      }
    );

    expect(integration).toBeDefined();
    await verifyBranchfsIntegrationLease(integration!);
    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(rootPath, "task-1.txt"), "utf8"))).toBe("task-1\n");
    expect(normalizeNewlines(await readFile(path.join(rootPath, "task-2.txt"), "utf8"))).toBe("task-2\n");
  });

  test("uses merge resolver when isolated subagent snapshots conflict", async () => {
    const rootPath = createTempDir("branchfs-subagent-conflict");
    seedBunGitProject(rootPath);
    writeFileSync(path.join(rootPath, "shared.txt"), "base\n");
    runSync(["git", "add", "shared.txt"], rootPath);
    runSync(["git", "commit", "-m", "shared"], rootPath);

    const snapshots = await Promise.all([
      createSnapshot(rootPath, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "shared.txt"), "left\n");
      }),
      createSnapshot(rootPath, "task-2", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "shared.txt"), "right\n");
      })
    ]);

    const adapter = new MergeResolverAdapter();
    const integration = await prepareBranchfsIntegrationLease(
      adapter,
      {
        rootPath,
        runId: "run-conflict",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [
          { id: "task-1", title: "Task 1", instruction: "Write left" },
          { id: "task-2", title: "Task 2", instruction: "Write right" }
        ],
        snapshots
      }
    );

    expect(integration?.conflictResolved).toBe(true);
    expect(adapter.calls.some((call) => call.kind === "merge-resolver")).toBe(true);
    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(rootPath, "shared.txt"), "utf8"))).toBe("resolved\n");
  });

  test("scopes integration flush to the selected nested project path", async () => {
    const repoRoot = createTempDir("branchfs-subagent-slice");
    seedBunGitProject(repoRoot);
    const projectRoot = path.join(repoRoot, "context");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(path.join(projectRoot, "guide.md"), "base guide\n");
    writeFileSync(path.join(repoRoot, "outside.txt"), "base outside\n");
    runSync(["git", "add", "."], repoRoot);
    runSync(["git", "commit", "-m", "slice base"], repoRoot);

    writeFileSync(path.join(repoRoot, "outside.txt"), "dirty outside\n");

    const snapshots = [
      await createSnapshot(projectRoot, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "guide.md"), "slice update\n");
      })
    ];

    const integration = await prepareBranchfsIntegrationLease(
      new MergeResolverAdapter(),
      {
        rootPath: projectRoot,
        runId: "run-slice",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [{ id: "task-1", title: "Task 1", instruction: "Update guide" }],
        snapshots
      }
    );

    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(projectRoot, "guide.md"), "utf8"))).toBe("slice update\n");
    expect(normalizeNewlines(await readFile(path.join(repoRoot, "outside.txt"), "utf8"))).toBe("dirty outside\n");
  });

  test("supports isolated subagent integration on unborn git history", async () => {
    const repoRoot = createTempDir("branchfs-subagent-unborn");
    seedBunProject(repoRoot);
    const projectRoot = path.join(repoRoot, "context");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(path.join(projectRoot, "note.md"), "initial\n");
    runSync(["git", "init"], repoRoot);
    runSync(["git", "config", "user.name", "Test User"], repoRoot);
    runSync(["git", "config", "user.email", "test@example.com"], repoRoot);

    const snapshots = [
      await createSnapshot(projectRoot, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "note.md"), "updated\n");
      })
    ];

    const integration = await prepareBranchfsIntegrationLease(
      new MergeResolverAdapter(),
      {
        rootPath: projectRoot,
        runId: "run-unborn",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [{ id: "task-1", title: "Task 1", instruction: "Update note" }],
        snapshots
      }
    );

    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(projectRoot, "note.md"), "utf8"))).toBe("updated\n");
  });
});

async function createSnapshot(rootPath: string, taskId: string, edit: (lease: BranchfsSubagentSnapshot["lease"]) => void) {
  const manager = new BranchfsManager({ rootPath, runId: `${taskId}-${crypto.randomUUID()}` });
  const lease = await manager.prepareExperimentLease();
  edit(lease);
  return {
    taskId,
    manager,
    lease
  } satisfies BranchfsSubagentSnapshot;
}

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
        name: "branchfs-subagent-test",
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
  writeFileSync(path.join(rootPath, "bun.lock"), "");
}

function seedBunGitProject(rootPath: string) {
  seedBunProject(rootPath);
  writeFileSync(path.join(rootPath, ".gitignore"), ".local\n");
  writeFileSync(path.join(rootPath, "README.md"), "# BranchFS Test\n");
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
