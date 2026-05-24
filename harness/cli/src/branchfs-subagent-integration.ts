import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentTrace, ComposerReasoningStrength, PlannerSubtask } from "../../shared/protocol";
import { BranchfsManager, type BranchfsExperimentLease } from "./branchfs-manager";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import type { BranchfsSubagentSnapshot } from "./pi-subagents";

const BUN_EXECUTABLE = process.platform === "win32" ? "bun.cmd" : "bun";
const CONFLICT_MARKER_START = "<<<<<<< BRANCHFS CURRENT";
const CONFLICT_MARKER_SPLIT = "=======";
const CONFLICT_MARKER_END = ">>>>>>> BRANCHFS INCOMING";

type IntegrationTrace = {
  stage: AgentTrace["stage"];
  message: string;
  detail?: string;
  subagentId?: string;
};

export type BranchfsIntegrationContext = {
  rootPath: string;
  runId: string;
  executionModelId: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  onTrace?: (trace: IntegrationTrace) => void;
};

export type BranchfsIntegrationLease = {
  manager: BranchfsManager;
  lease: BranchfsExperimentLease;
  conflictResolved: boolean;
  appliedTaskIds: string[];
  onTrace?: (trace: IntegrationTrace) => void;
};

type PendingConflict = {
  relativePath: string;
  taskId: string;
  currentSidecarPath: string;
  incomingSidecarPath: string;
};

export async function prepareBranchfsIntegrationLease(
  adapter: PiAgentAdapter,
  context: BranchfsIntegrationContext,
  options: {
    tasks: PlannerSubtask[];
    snapshots: BranchfsSubagentSnapshot[];
    abortSignal?: AbortSignal;
  }
): Promise<BranchfsIntegrationLease | undefined> {
  const orderedSnapshots = options.tasks
    .map((task) => options.snapshots.find((snapshot) => snapshot.taskId === task.id))
    .filter((snapshot): snapshot is BranchfsSubagentSnapshot => Boolean(snapshot));

  if (orderedSnapshots.length === 0) {
    return undefined;
  }

  const manager = new BranchfsManager(
    {
      rootPath: context.rootPath,
      runId: `${context.runId}-integration`
    },
    {
      onTrace(trace) {
        context.onTrace?.(trace);
      }
    }
  );
  const lease = await manager.prepareExperimentLease();
  emitTrace(context, {
    stage: "merge-start",
    message: "Integrating isolated BranchFS subagent results",
    detail: orderedSnapshots.map((snapshot) => snapshot.taskId).join(", ")
  });

  let conflictResolved = false;
  const appliedTaskIds: string[] = [];

  for (const snapshot of orderedSnapshots) {
    const inspection = await snapshot.manager.readInspection(snapshot.lease);
    if (inspection.changedPaths.length === 0) {
      continue;
    }

    const conflicts = await applySnapshotToIntegrationLease(snapshot, lease, inspection.changedPaths);
    if (conflicts.length > 0) {
      emitTrace(context, {
        stage: "merge-conflict",
        message: `Conflict while integrating ${snapshot.taskId}`,
        detail: conflicts.map((conflict) => conflict.relativePath).join(", ")
      });
      await resolveBranchfsConflicts(adapter, context, lease, options.tasks, snapshot.taskId, conflicts, options.abortSignal);
      conflictResolved = true;
    }

    appliedTaskIds.push(snapshot.taskId);
  }

  emitTrace(context, {
    stage: "merge-complete",
    message: "Integrated isolated BranchFS subagent results",
    detail: appliedTaskIds.join(", ")
  });

  return {
    manager,
    lease,
    conflictResolved,
    appliedTaskIds,
    onTrace: context.onTrace
  };
}

export async function verifyBranchfsIntegrationLease(integration: BranchfsIntegrationLease) {
  emitTraceFromIntegration(integration, {
    stage: "verification-start",
    message: "Running integration verification"
  });

  const packageJson = JSON.parse(await readFile(path.join(integration.lease.repoMountPath, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  const ranTypecheck = Boolean(packageJson.scripts?.typecheck);
  const ranTest = Boolean(packageJson.scripts?.test);

  if (ranTypecheck) {
    await runCommand([BUN_EXECUTABLE, "run", "typecheck"], integration.lease.repoMountPath);
  }

  if (ranTest) {
    await runCommand([BUN_EXECUTABLE, "run", "test"], integration.lease.repoMountPath);
  }

  emitTraceFromIntegration(integration, {
    stage: "verification-complete",
    message: "Integration verification finished",
    detail: [
      ranTypecheck ? "typecheck" : "skip:typecheck",
      ranTest ? "test" : "skip:test"
    ].join(", ")
  });
}

export async function flushBranchfsIntegrationLease(integration: BranchfsIntegrationLease) {
  const inspection = await integration.manager.flushExperiment(integration.lease);
  emitTraceFromIntegration(integration, {
    stage: "sync-back",
    message: "Flushed integrated BranchFS result back to project root",
    detail: `${inspection.filesChanged} changed`
  });
}

export async function discardBranchfsIntegrationLease(integration: BranchfsIntegrationLease | undefined) {
  if (!integration) {
    return;
  }

  await integration.manager.discardExperiment(integration.lease);
}

export async function discardBranchfsSnapshots(snapshots: BranchfsSubagentSnapshot[]) {
  await Promise.all(
    snapshots.map((snapshot) => snapshot.manager.discardExperiment(snapshot.lease).catch(() => undefined))
  );
}

async function applySnapshotToIntegrationLease(
  snapshot: BranchfsSubagentSnapshot,
  integrationLease: BranchfsExperimentLease,
  changedPaths: string[]
) {
  const conflicts: PendingConflict[] = [];
  for (const relativePath of changedPaths) {
    const basePath = path.join(snapshot.lease.baseProjectPath, relativePath);
    const incomingPath = path.join(snapshot.lease.projectMountPath, relativePath);
    const integrationPath = path.join(integrationLease.projectMountPath, relativePath);

    const [baseHash, incomingHash, currentHash] = await Promise.all([
      hashPath(basePath),
      hashPath(incomingPath),
      hashPath(integrationPath)
    ]);

    if (incomingHash === currentHash || incomingHash === baseHash) {
      continue;
    }

    if (currentHash === baseHash) {
      await copyChangedPath(incomingPath, integrationPath);
      continue;
    }

    conflicts.push(await materializeConflict(snapshot.taskId, relativePath, integrationLease, integrationPath, incomingPath));
  }

  return conflicts;
}

async function materializeConflict(
  taskId: string,
  relativePath: string,
  integrationLease: BranchfsExperimentLease,
  integrationPath: string,
  incomingPath: string
): Promise<PendingConflict> {
  const conflictRoot = path.join(integrationLease.upperPath, "branchfs-conflicts", sanitizeTaskId(taskId));
  const safeName = `${createHash("sha1").update(relativePath).digest("hex")}-${path.basename(relativePath)}`;
  const currentSidecarPath = path.join(conflictRoot, `${safeName}.current`);
  const incomingSidecarPath = path.join(conflictRoot, `${safeName}.incoming`);
  await mkdir(path.dirname(currentSidecarPath), { recursive: true });

  const currentContent = await readPathText(integrationPath);
  const incomingContent = await readPathText(incomingPath);
  await writeFile(currentSidecarPath, currentContent, "utf8");
  await writeFile(incomingSidecarPath, incomingContent, "utf8");

  await mkdir(path.dirname(integrationPath), { recursive: true });
  await writeFile(
    integrationPath,
    [
      CONFLICT_MARKER_START,
      currentContent,
      CONFLICT_MARKER_SPLIT,
      incomingContent,
      CONFLICT_MARKER_END,
      "",
      `Conflict sidecars: ${currentSidecarPath.replace(/\\/g, "/")} | ${incomingSidecarPath.replace(/\\/g, "/")}`
    ].join("\n"),
    "utf8"
  );

  return {
    relativePath,
    taskId,
    currentSidecarPath,
    incomingSidecarPath
  };
}

async function resolveBranchfsConflicts(
  adapter: PiAgentAdapter,
  context: BranchfsIntegrationContext,
  integrationLease: BranchfsExperimentLease,
  tasks: PlannerSubtask[],
  taskId: string,
  conflicts: PendingConflict[],
  abortSignal?: AbortSignal
) {
  const response = await adapter.runPrompt({
    kind: "merge-resolver",
    cwd: integrationLease.projectMountPath,
    modelId: context.executionModelId,
    reasoningStrength: context.reasoningStrength,
    fastMode: context.fastMode,
    prompt: [
      "You are resolving BranchFS integration conflicts inside an isolated mount.",
      "Resolve only the current conflict state.",
      "Preserve both subtask intents when possible.",
      "Remove all BranchFS conflict markers before finishing.",
      "",
      `Conflicting subtask: ${taskId}`,
      `Conflicting files: ${conflicts.map((conflict) => conflict.relativePath).join(", ")}`,
      "Planner subtasks:",
      tasks.map((task) => `${task.id}: ${task.title} :: ${task.instruction}`).join("\n"),
      "",
      "Each conflicting file contains BranchFS markers.",
      "Sidecar files with current/incoming contents live under `.local/branchfs-conflicts/` inside this mount."
    ].join("\n"),
    abortSignal
  });

  const unresolved = [];
  for (const conflict of conflicts) {
    const targetPath = path.join(integrationLease.projectMountPath, conflict.relativePath);
    const targetContent = await readPathText(targetPath);
    if (targetContent.includes(CONFLICT_MARKER_START) || targetContent.includes(CONFLICT_MARKER_END)) {
      unresolved.push(conflict.relativePath);
    }
  }

  if (unresolved.length > 0) {
    throw new Error(`Merge resolver left unresolved files: ${unresolved.join(", ")}`);
  }

  emitTrace(context, {
    stage: "merge-complete",
    message: `Resolved BranchFS conflict for ${taskId}`,
    detail: response.text.slice(0, 240)
  });
}

function emitTrace(context: Pick<BranchfsIntegrationContext, "onTrace">, trace: IntegrationTrace) {
  context.onTrace?.(trace);
}

function emitTraceFromIntegration(integration: BranchfsIntegrationLease, trace: IntegrationTrace) {
  integration.onTrace?.(trace);
}

async function copyChangedPath(sourcePath: string, destinationPath: string) {
  if (!(await pathExists(sourcePath))) {
    await rm(destinationPath, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  await copyRecursiveRobust(sourcePath, destinationPath);
}

async function copyRecursiveRobust(sourcePath: string, destinationPath: string) {
  const sourceStats = await withFsRetry(() => lstat(sourcePath));
  const destinationStats = await lstat(destinationPath).catch(() => undefined);

  if (sourceStats.isDirectory()) {
    if (destinationStats && !destinationStats.isDirectory()) {
      await rm(destinationPath, { recursive: true, force: true });
    }
    await mkdir(destinationPath, { recursive: true });
    const entries = await withFsRetry(() => readdir(sourcePath, { withFileTypes: true }));
    for (const entry of entries) {
      await copyRecursiveRobust(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name));
    }
    return;
  }

  if (destinationStats && !destinationStats.isFile()) {
    await rm(destinationPath, { recursive: true, force: true });
  }
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await withFsRetry(async () => {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  });
}

async function hashPath(targetPath: string) {
  const entry = await stat(targetPath).catch(() => undefined);
  if (!entry) {
    return "missing";
  }

  if (entry.isDirectory()) {
    const hash = createHash("sha256");
    hash.update("directory");
    return hash.digest("hex");
  }

  const hash = createHash("sha256");
  hash.update(await readFile(targetPath));
  return hash.digest("hex");
}

async function pathExists(targetPath: string) {
  return (await stat(targetPath).catch(() => undefined)) !== undefined;
}

async function readPathText(targetPath: string) {
  const content = await readFile(targetPath, "utf8").catch(() => "");
  return content.replace(/\r\n/g, "\n");
}

function sanitizeTaskId(taskId: string) {
  return taskId.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function withFsRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || !["ENOENT", "EBUSY", "EPERM", "EACCES"].includes(String(error.code)) || attempt === 3) {
        throw error;
      }
      await Bun.sleep(25 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

async function runCommand(command: string[], cwd: string) {
  const proc = Bun.spawn({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${stderr.trim() || stdout.trim() || `exit ${exitCode}`}`);
  }
  return stdout.trim();
}
