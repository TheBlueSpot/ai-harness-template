import os from "node:os";

export const DEFAULT_TEST_WORKER_CAP = 12;
export const DEFAULT_TEST_PARALLEL_DELAY_MS = 0;

export type BunTestPlan = {
  bunArgs: string[];
  workerCount?: number;
  parallelDelayMs?: number;
};

export function normalizeForwardedArgs(args: string[]) {
  const normalizedArgs = [...args];
  if (normalizedArgs[0] === "--") {
    normalizedArgs.shift();
  }
  return normalizedArgs;
}

export function resolveDefaultWorkerCount(logicalCpuCount = detectLogicalCpuCount()) {
  const normalizedCpuCount = Number.isFinite(logicalCpuCount) ? Math.max(1, Math.floor(logicalCpuCount)) : 1;
  return Math.min(DEFAULT_TEST_WORKER_CAP, normalizedCpuCount);
}

export function buildBunTestPlan(
  forwardedArgs: string[],
  env: NodeJS.ProcessEnv,
  logicalCpuCount = detectLogicalCpuCount()
): BunTestPlan {
  const normalizedArgs = normalizeForwardedArgs(forwardedArgs);
  const explicitParallelArg = findFlagValue(normalizedArgs, "--parallel");
  const explicitDelayArg = findFlagValue(normalizedArgs, "--parallel-delay");
  const aliasWorkerArg = findFlagValue(normalizedArgs, "--workers");

  const bunArgs = ["test"];
  const workerCount =
    parsePositiveInteger(explicitParallelArg) ??
    parsePositiveInteger(aliasWorkerArg) ??
    parsePositiveInteger(env.HARNESS_TEST_WORKERS) ??
    resolveDefaultWorkerCount(logicalCpuCount);
  const parallelDelayMs = parseNonNegativeInteger(explicitDelayArg) ?? parseNonNegativeInteger(env.HARNESS_TEST_PARALLEL_DELAY) ?? DEFAULT_TEST_PARALLEL_DELAY_MS;

  if (!hasFlag(normalizedArgs, "--parallel")) {
    bunArgs.push(`--parallel=${workerCount}`);
  }

  if (!hasFlag(normalizedArgs, "--parallel-delay")) {
    bunArgs.push(`--parallel-delay=${parallelDelayMs}`);
  }

  bunArgs.push(...stripFlag(normalizedArgs, "--workers"));

  return {
    bunArgs,
    workerCount: parsePositiveInteger(explicitParallelArg) ?? workerCount,
    parallelDelayMs
  };
}

export function stripFlag(args: string[], flagName: string) {
  const strippedArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];
    if (currentArg === flagName) {
      index += 1;
      continue;
    }
    if (currentArg.startsWith(`${flagName}=`)) {
      continue;
    }
    strippedArgs.push(currentArg);
  }
  return strippedArgs;
}

function detectLogicalCpuCount() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }
  return os.cpus().length;
}

function hasFlag(args: string[], flagName: string) {
  return args.some((arg) => arg === flagName || arg.startsWith(`${flagName}=`));
}

function findFlagValue(args: string[], flagName: string) {
  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];
    if (currentArg === flagName) {
      return args[index + 1];
    }
    if (currentArg.startsWith(`${flagName}=`)) {
      return currentArg.slice(flagName.length + 1);
    }
  }
  return undefined;
}

function parsePositiveInteger(rawValue: string | undefined) {
  if (!rawValue) {
    return undefined;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return undefined;
  }
  return parsedValue;
}

function parseNonNegativeInteger(rawValue: string | undefined) {
  if (rawValue === undefined) {
    return undefined;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return undefined;
  }
  return parsedValue;
}
