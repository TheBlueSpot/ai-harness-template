import type { Subprocess } from "bun";
import { buildToolchainPath } from "./toolchain";

export type CliProcessEnvInput = {
  cols: number;
  rows: number;
  extraEnv?: Record<string, string | undefined>;
};

export type CliProcessExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  hangDetected: boolean;
  timedOut: boolean;
};

export type InteractiveCliProcess = {
  readonly proc: Subprocess<"pipe", "pipe", "pipe">;
  readonly stdoutText: () => string;
  readonly stderrText: () => string;
  readonly settled: Promise<{ exitCode: number }>;
  write(data: Uint8Array): Promise<void>;
  stop(): Promise<void>;
};

type NonInteractiveOptions = {
  cmd: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string | undefined>;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  abortSignal?: AbortSignal;
  onStdout?: (chunk: Uint8Array) => void;
  onStderr?: (chunk: Uint8Array) => void;
};

type InteractiveOptions = {
  cmd: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string | undefined>;
  onStdout?: (chunk: Uint8Array) => void;
  onStderr?: (chunk: Uint8Array) => void;
  onExit?: (exitCode: number) => void;
};

const WATCHDOG_POLL_MS = 250;
const FORCE_KILL_DELAY_MS = 3000;

export function buildCliProcessEnv(input: CliProcessEnvInput) {
  const pathValue = buildToolchainPath({ basePath: Bun.env.PATH }) ?? Bun.env.PATH ?? "";
  return {
    ...Bun.env,
    PATH: pathValue,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "1",
    LINES: String(input.rows),
    COLUMNS: String(input.cols),
    CI: "true",
    PYTHONUNBUFFERED: "1",
    EDITOR: "cat",
    PAGER: "cat",
    ...input.extraEnv
  } satisfies Record<string, string | undefined>;
}

export class CliProcessManager {
  async runNonInteractive(options: NonInteractiveOptions): Promise<CliProcessExecutionResult> {
    const proc = Bun.spawn({
      cmd: options.cmd,
      cwd: options.cwd,
      env: buildCliProcessEnv({
        cols: options.cols,
        rows: options.rows,
        extraEnv: options.env
      }),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    });

    let stdout = "";
    let stderr = "";
    const startedAt = Date.now();
    let lastOutputAt = Date.now();
    let hangDetected = false;
    let timedOut = false;
    let settled = false;

    const stdoutReader = consumeStream(proc.stdout, {
      onChunk: (chunk) => {
        stdout += decodeChunk(chunk);
        lastOutputAt = Date.now();
        options.onStdout?.(chunk);
      }
    });
    const stderrReader = consumeStream(proc.stderr, {
      onChunk: (chunk) => {
        stderr += decodeChunk(chunk);
        lastOutputAt = Date.now();
        options.onStderr?.(chunk);
      }
    });

    const watchdog = setInterval(async () => {
      if (settled) {
        return;
      }

      const now = Date.now();
      if (options.totalTimeoutMs > 0 && now - startedAt >= options.totalTimeoutMs) {
        timedOut = true;
        hangDetected = true;
        await terminateProcess(proc);
        return;
      }

      if (options.idleTimeoutMs > 0 && now - lastOutputAt >= options.idleTimeoutMs) {
        hangDetected = true;
        await terminateProcess(proc);
      }
    }, WATCHDOG_POLL_MS);

    const abortHandler = async () => {
      await terminateProcess(proc);
    };
    options.abortSignal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const exitCode = await proc.exited;
      await Promise.all([stdoutReader, stderrReader]);
      settled = true;
      clearInterval(watchdog);
      options.abortSignal?.removeEventListener("abort", abortHandler);
      return {
        stdout,
        stderr,
        exitCode,
        hangDetected,
        timedOut
      };
    } finally {
      settled = true;
      clearInterval(watchdog);
      options.abortSignal?.removeEventListener("abort", abortHandler);
    }
  }

  startInteractive(options: InteractiveOptions): InteractiveCliProcess {
    const proc = Bun.spawn({
      cmd: options.cmd,
      cwd: options.cwd,
      env: buildCliProcessEnv({
        cols: options.cols,
        rows: options.rows,
        extraEnv: options.env
      }),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    });

    let stdout = "";
    let stderr = "";

    const stdoutReader = consumeStream(proc.stdout, {
      onChunk: (chunk) => {
        stdout += decodeChunk(chunk);
        options.onStdout?.(chunk);
      }
    });
    const stderrReader = consumeStream(proc.stderr, {
      onChunk: (chunk) => {
        stderr += decodeChunk(chunk);
        options.onStderr?.(chunk);
      }
    });

    const settled = (async () => {
      const exitCode = await proc.exited;
      await Promise.all([stdoutReader, stderrReader]);
      options.onExit?.(exitCode);
      return { exitCode };
    })();

    return {
      proc,
      stdoutText: () => stdout,
      stderrText: () => stderr,
      settled,
      async write(data: Uint8Array) {
        await proc.stdin.write(data);
      },
      async stop() {
        await terminateProcess(proc);
      }
    };
  }
}

function decodeChunk(chunk: Uint8Array) {
  return new TextDecoder().decode(chunk);
}

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    onChunk: (chunk: Uint8Array) => void;
  }
) {
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        return;
      }

      options.onChunk(next.value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function terminateProcess(proc: Subprocess<"pipe", "pipe", "pipe">) {
  try {
    proc.kill();
  } catch {
    return;
  }

  await Promise.race([
    proc.exited,
    new Promise((resolve) => setTimeout(resolve, FORCE_KILL_DELAY_MS))
  ]);

  if (proc.exitCode === null) {
    try {
      proc.kill("SIGKILL");
    } catch {
      return;
    }
  }
}
