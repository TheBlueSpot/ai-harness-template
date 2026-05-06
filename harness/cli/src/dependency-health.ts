import { stat } from "node:fs/promises";
import path from "node:path";

export type DependencyRepairStatus = "current" | "repaired";

type DependencyCommandRunner = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

type EnsureDependencyHealthOptions = {
  cwd?: string;
  runner?: DependencyCommandRunner;
  log?: (message: string) => void;
};

export async function ensureDependencyHealth(options: EnsureDependencyHealthOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? ((args) => runBun(args, cwd));
  const log = options.log ?? (() => undefined);
  const nodeModulesPresent = await pathExists(path.join(cwd, "node_modules"));
  const lockCheck = nodeModulesPresent ? await runner(["install", "--frozen-lockfile", "--dry-run"]) : undefined;

  if (nodeModulesPresent && lockCheck?.exitCode === 0) {
    return { status: "current" as DependencyRepairStatus, reason: "dependencies current" };
  }

  const reason = nodeModulesPresent ? describeInstallFailure(lockCheck) : "node_modules missing";
  log(`Dependencies ${reason}; running bun i.`);
  const install = await runner(["i"]);
  if (install.exitCode !== 0) {
    throw new Error(describeInstallFailure(install));
  }

  return { status: "repaired" as DependencyRepairStatus, reason };
}

async function pathExists(targetPath: string) {
  return Boolean(await stat(targetPath).catch(() => undefined));
}

async function runBun(args: string[], cwd: string) {
  const proc = Bun.spawn({
    cmd: ["bun", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  return { stdout, stderr, exitCode };
}

function describeInstallFailure(result: { stdout: string; stderr: string } | undefined) {
  return result?.stderr.trim() || result?.stdout.trim() || "dependency check failed";
}
