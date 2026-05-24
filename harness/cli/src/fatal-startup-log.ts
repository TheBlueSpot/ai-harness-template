import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { detectSetupLaunchMode } from "./setup-health";

export type FatalStartupOrigin = "startup" | "uncaughtException" | "unhandledRejection";

type FatalStartupLoggerOptions = {
  launchMode?: "source" | "portable-launcher";
  execPath?: string;
  cwd?: string;
  argv?: string[];
  now?: () => number;
  stderrWrite?: (line: string) => void;
  writeFile?: (filePath: string, contents: string) => void;
  mkdir?: (dirPath: string) => void;
};

type FatalStartupRecord = {
  origin: FatalStartupOrigin;
  message: string;
  stack?: string;
  logPath?: string;
};

const PORTABLE_CRASH_LOG_DIR = "logs";

export function createFatalStartupLogger(options: FatalStartupLoggerOptions = {}) {
  const launchMode = options.launchMode ?? detectSetupLaunchMode();
  const execPath = options.execPath ?? process.execPath;
  const cwd = options.cwd ?? process.cwd();
  const argv = options.argv ?? process.argv.slice(2);
  const stderrWrite = options.stderrWrite ?? ((line: string) => console.error(line));
  const writeFile = options.writeFile ?? ((filePath: string, contents: string) => writeFileSync(filePath, contents, "utf8"));
  const mkdir = options.mkdir ?? ((dirPath: string) => mkdirSync(dirPath, { recursive: true }));
  const now = options.now ?? Date.now;
  let capturedRecord: FatalStartupRecord | undefined;

  return (error: unknown, origin: FatalStartupOrigin) => {
    if (capturedRecord) {
      return capturedRecord;
    }

    const normalizedError = normalizeFatalStartupError(error);
    const record: FatalStartupRecord = {
      origin,
      message: normalizedError.message,
      stack: normalizedError.stack
    };

    stderrWrite(`Fatal ${origin} error: ${record.message}`);

    if (launchMode === "portable-launcher") {
      const logPath = resolvePortableCrashLogPath(execPath, now());
      const logDir = path.dirname(logPath);
      mkdir(logDir);
      writeFile(logPath, buildFatalStartupLog({ record, launchMode, execPath, cwd, argv }));
      record.logPath = logPath;
      stderrWrite(`Crash log: ${logPath}`);
    }

    if (record.stack) {
      stderrWrite(record.stack);
    }

    capturedRecord = record;
    return record;
  };
}

function resolvePortableCrashLogPath(execPath: string, timestampMs: number) {
  const executableDir = path.dirname(execPath);
  return path.join(executableDir, PORTABLE_CRASH_LOG_DIR, `startup-crash-${formatFileTimestamp(timestampMs)}.log`);
}

function buildFatalStartupLog(input: {
  record: FatalStartupRecord;
  launchMode: "source" | "portable-launcher";
  execPath: string;
  cwd: string;
  argv: string[];
}) {
  const lines = [
    "Pi Harness fatal startup error",
    `origin: ${input.record.origin}`,
    `launchMode: ${input.launchMode}`,
    `execPath: ${input.execPath}`,
    `cwd: ${input.cwd}`,
    `argv: ${input.argv.join(" ") || "(none)"}`,
    "",
    input.record.stack ?? input.record.message
  ];

  return `${lines.join("\n")}\n`;
}

function normalizeFatalStartupError(error: unknown) {
  if (error instanceof Error) {
    const message = hasNodeErrorCode(error, "ENOSPC")
      ? `${error.message}\nDisk appears full. Free space or clean harness temporary artifacts such as .local/branchfs, .tmp-test-data, and dist/ui, then restart.`
      : error.message;
    return {
      message,
      stack: error.stack
    };
  }

  return {
    message: String(error),
    stack: undefined
  };
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  if (error instanceof Error && "code" in error && error.code === code) {
    return true;
  }
  if (error instanceof AggregateError) {
    return error.errors.some((entry) => hasNodeErrorCode(entry, code));
  }
  return error instanceof Error && error.cause !== undefined && hasNodeErrorCode(error.cause, code);
}

function formatFileTimestamp(timestampMs: number) {
  return new Date(timestampMs).toISOString().replaceAll(":", "-");
}
