import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult
} from "../pi-agent-adapter";
import { debugLog } from "../logging";
import { CliProcessManager } from "./cli-process-manager";

export type CliCommandFactoryInput = {
  request: PiAgentPromptRequest;
  prompt: string;
};

export type CliCommandFactoryResult = {
  cmd: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  parser?: {
    onStdoutChunk?: (chunkText: string, emitDelta: (delta: string) => void) => void;
    getText: (stdout: string, stderr: string) => string;
  };
};

type CliAgentAdapterOptions = {
  label: string;
  buildCommand: (input: CliCommandFactoryInput) => CliCommandFactoryResult;
};

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 15 * 60_000;

export class CliAgentAdapter implements PiAgentAdapter {
  private readonly processManager = new CliProcessManager();

  constructor(private readonly options: CliAgentAdapterOptions) {}

  setApiKey(_provider: "openai" | "google", _apiKey: string | undefined) {}

  hasApiKey(_provider: "openai" | "google") {
    return false;
  }

  async runPrompt(request: PiAgentPromptRequest) {
    const controller = await this.startExecution(request);
    try {
      return await controller.result;
    } finally {
      controller.dispose();
    }
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    return new CliExecutionController(this.processManager, this.options, request);
  }
}

class CliExecutionController implements PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;

  private readonly abortController = new AbortController();
  private currentExecutionAbortController = this.abortController;
  private disposed = false;

  constructor(
    private readonly processManager: CliProcessManager,
    private readonly options: CliAgentAdapterOptions,
    private readonly request: PiAgentPromptRequest
  ) {
    this.result = this.execute(this.request.prompt);
  }

  continueWithPrompt(prompt: string = "continue") {
    return this.execute(prompt);
  }

  async abort() {
    this.currentExecutionAbortController.abort();
  }

  dispose() {
    this.disposed = true;
    this.abortController.abort();
  }

  private async execute(prompt: string) {
    if (this.disposed) {
      throw new Error("Execution controller is disposed");
    }

    const executionAbortController = new AbortController();
    this.currentExecutionAbortController = executionAbortController;
    this.request.onExecutionEvent?.({ type: "session-created" });

    const command = this.options.buildCommand({
      request: this.request,
      prompt
    });
    debugLog("cli.exec.start", {
      label: this.options.label,
      kind: this.request.kind
    });

    let sawOutput = false;
    let result;
    try {
      result = await this.processManager.runNonInteractive({
        cmd: command.cmd,
        cwd: command.cwd,
        env: command.env,
        cols: 120,
        rows: 40,
        idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
        totalTimeoutMs: DEFAULT_TOTAL_TIMEOUT_MS,
        abortSignal: mergeAbortSignals(this.request.abortSignal, executionAbortController.signal),
        onStdout: (chunk) => {
          sawOutput = true;
          this.request.onExecutionEvent?.({ type: "activity" });
          command.parser?.onStdoutChunk?.(decodeChunk(chunk), (delta) => this.request.onTextDelta?.(delta));
        },
        onStderr: () => {
          sawOutput = true;
          this.request.onExecutionEvent?.({ type: "activity" });
        }
      });
    } catch (error) {
      debugLog("cli.exec.error", {
        label: this.options.label,
        kind: this.request.kind
      });
      throw error;
    }

    if (result.hangDetected || result.timedOut) {
      throw new Error("Hanging/Interactive Prompt Detected");
    }

    const text = command.parser?.getText(result.stdout, result.stderr) ?? result.stdout.trim();
    debugLog("cli.exec.done", {
      label: this.options.label,
      kind: this.request.kind,
      exitCode: result.exitCode,
      hangDetected: result.hangDetected,
      timedOut: result.timedOut
    });
    if (result.exitCode !== 0) {
      throw new Error(text || result.stderr.trim() || `${this.options.label} exited with code ${result.exitCode}`);
    }

    if (!text.trim() && !sawOutput) {
      throw new Error(`${this.options.label} returned an empty response`);
    }

    return {
      text: text.trim()
    };
  }
}

function mergeAbortSignals(left: AbortSignal | undefined, right: AbortSignal) {
  if (!left) {
    return right;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function decodeChunk(chunk: Uint8Array) {
  return new TextDecoder().decode(chunk);
}
