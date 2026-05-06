import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Codex, type CodexOptions } from "@openai/codex-sdk";
import { buildCliProcessEnv } from "./cli-process-manager";
import { resolveCodexSandboxMode } from "./codex-sandbox-policy";
import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentExecutionEvent,
  PiAgentPromptRequest,
  PiAgentPromptResult,
  PiApiKeyProvider
} from "../pi-agent-adapter";

const CODEX_TOOL_GUIDANCE = [
  "Use native Codex tools first for general work: shell and apply_patch for local repository changes, and live web search for external or current facts.",
  "Use repository skills when the user's task matches a listed skill; skill instructions override general tool preference for that workflow."
].join("\n");

type CodexSdkTextInput = {
  type: "text";
  text: string;
};

type CodexSdkImageInput = {
  type: "local_image";
  path: string;
};

type CodexSdkInput = string | Array<CodexSdkTextInput | CodexSdkImageInput>;

type CodexSdkRunStreamedResult = {
  events: AsyncGenerator<unknown>;
};

type CodexSdkTurnOptions = {
  signal?: AbortSignal;
};

type CodexSdkThreadOptions = {
  model?: string;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  approvalPolicy?: "never";
  modelReasoningEffort?: "low" | "medium" | "high" | "xhigh";
  networkAccessEnabled?: boolean;
  webSearchMode?: "disabled" | "cached" | "live";
};

type CodexSdkThreadLike = {
  runStreamed(input: CodexSdkInput, turnOptions?: CodexSdkTurnOptions): Promise<CodexSdkRunStreamedResult>;
};

type CodexSdkClientLike = {
  startThread(options?: CodexSdkThreadOptions): CodexSdkThreadLike;
};

type CodexSdkAdapterOptions = {
  executablePath: string;
  createClient?: (options: CodexOptions) => CodexSdkClientLike;
};

type CodexSdkCommandEvent = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: "in_progress" | "completed" | "failed";
};

type CodexSdkMcpEvent = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  result?: unknown;
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};

type CodexSdkWebSearchEvent = {
  id: string;
  type: "web_search";
  query: string;
};

type CodexSdkAgentMessageEvent = {
  id: string;
  type: "agent_message";
  text: string;
};

type CodexSdkUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

function createDefaultClient(options: CodexOptions) {
  return new Codex(options);
}

export class CodexSdkAdapter implements PiAgentAdapter {
  constructor(private readonly options: CodexSdkAdapterOptions) {}

  setApiKey(_provider: PiApiKeyProvider, _apiKey: string | undefined) {}

  hasApiKey(_provider: PiApiKeyProvider) {
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
    const client = (this.options.createClient ?? createDefaultClient)({
      codexPathOverride: this.options.executablePath,
      env: buildCliProcessEnv({
        cols: 120,
        rows: 40
      })
    });
    const thread = client.startThread(buildThreadOptions(request));
    return new CodexSdkExecutionController(thread, request);
  }
}

class CodexSdkExecutionController implements PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;

  private disposed = false;
  private currentAbortController: AbortController | undefined;
  private running = false;

  constructor(
    private readonly thread: CodexSdkThreadLike,
    private readonly request: PiAgentPromptRequest
  ) {
    this.result = this.execute(this.request);
  }

  continueWithPrompt(prompt: string = "continue") {
    return this.execute({
      ...this.request,
      prompt
    });
  }

  async abort() {
    this.currentAbortController?.abort();
  }

  dispose() {
    this.disposed = true;
    if (this.running) {
      this.currentAbortController?.abort();
    }
  }

  private async execute(request: PiAgentPromptRequest) {
    if (this.disposed) {
      throw new Error("Execution controller is disposed");
    }

    if (this.running) {
      throw new Error("Execution already running");
    }

    this.running = true;
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    request.onExecutionEvent?.({ type: "session-created" });
    const imageInput = await materializeSdkInput(request, {
      promptText: buildCodexPromptWithPrelude(request)
    });
    const messageState = new Map<string, string>();
    let finalText = "";
    const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

    try {
      const signal = mergeAbortSignals(request.abortSignal, abortController.signal);
      const streamed = await runThreadWithCodexControls(this.thread, request, imageInput.input, signal);
      for await (const rawEvent of streamed.events) {
        request.onExecutionEvent?.({ type: "activity" });
        accumulateCodexUsage(rawEvent, usage);
        finalText = handleCodexSdkEvent(rawEvent, request, messageState, finalText);
      }

      if (!finalText.trim()) {
        throw new Error("Codex CLI returned an empty response");
      }

      return {
        text: finalText.trim(),
        contextUsage: createCodexContextUsage(request.modelId, usage)
      };
    } finally {
      this.running = false;
      this.currentAbortController = undefined;
      await imageInput.cleanup();
    }
  }
}

function buildThreadOptions(
  request: PiAgentPromptRequest,
  options: {
    platform?: NodeJS.Platform;
  } = {}
): CodexSdkThreadOptions {
  return {
    model: toCliModelName(request.modelId),
    sandboxMode: resolveCodexSandboxMode({
      readOnly: request.readOnly,
      platform: options.platform
    }),
    workingDirectory: request.cwd,
    skipGitRepoCheck: true,
    approvalPolicy: "never",
    modelReasoningEffort: mapReasoningStrengthToCodexEffort(request.reasoningStrength),
    networkAccessEnabled: !request.readOnly,
    webSearchMode: "live"
  };
}

async function materializeSdkInput(
  request: PiAgentPromptRequest,
  inputOverrides: { promptText?: string } = {}
): Promise<{ input: CodexSdkInput; cleanup: () => Promise<void> }> {
  const promptText = inputOverrides.promptText ?? request.prompt;
  if (!request.images?.length) {
    return {
      input: promptText,
      cleanup: async () => {}
    };
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "harness-codex-images-"));
  const input: Array<CodexSdkTextInput | CodexSdkImageInput> = [{ type: "text", text: promptText }];
  for (const [index, image] of request.images.entries()) {
    const extension = getImageExtension(image.mimeType);
    const filePath = path.join(tempRoot, `image-${index + 1}${extension}`);
    await Bun.write(filePath, Buffer.from(image.data, "base64"));
    input.push({
      type: "local_image",
      path: filePath
    });
  }

  return {
    input,
    cleanup: async () => {
      await rm(tempRoot, {
        recursive: true,
        force: true
      });
    }
  };
}

function getImageExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

function handleCodexSdkEvent(
  rawEvent: unknown,
  request: PiAgentPromptRequest,
  messageState: Map<string, string>,
  priorFinalText: string
) {
  const event = rawEvent as {
    type?: string;
    item?: CodexSdkCommandEvent | CodexSdkMcpEvent | CodexSdkWebSearchEvent | CodexSdkAgentMessageEvent;
    error?: { message?: string };
    message?: string;
  };
  if (event.type === "turn.failed") {
    throw new Error(event.error?.message ?? "Codex turn failed");
  }

  if (event.type === "error") {
    throw new Error(event.message ?? "Codex stream failed");
  }

  if (event.item?.type === "agent_message") {
    const nextText = event.item.text ?? "";
    const previousText = messageState.get(event.item.id) ?? "";
    if (nextText.startsWith(previousText)) {
      const delta = nextText.slice(previousText.length);
      if (delta) {
        request.onTextDelta?.(delta);
      }
    }
    messageState.set(event.item.id, nextText);
    if (event.type === "item.completed") {
      return nextText || priorFinalText;
    }
    return priorFinalText;
  }

  if (event.item?.type === "command_execution") {
    emitCommandExecutionEvent(request, event.type, event.item);
    return priorFinalText;
  }

  if (event.item?.type === "mcp_tool_call") {
    emitMcpToolEvent(request, event.type, event.item);
    return priorFinalText;
  }

  if (event.item?.type === "web_search") {
    emitWebSearchEvent(request, event.type, event.item);
    return priorFinalText;
  }

  return priorFinalText;
}

function accumulateCodexUsage(rawEvent: unknown, usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) {
  const event = rawEvent as { type?: string; usage?: CodexSdkUsage };
  if (event.type !== "turn.completed" || !event.usage) {
    return;
  }

  usage.inputTokens += event.usage.input_tokens ?? 0;
  usage.cachedInputTokens += event.usage.cached_input_tokens ?? 0;
  usage.outputTokens += event.usage.output_tokens ?? 0;
}

function createCodexContextUsage(
  modelId: string,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }
): NonNullable<PiAgentPromptResult["contextUsage"]> | undefined {
  const totalProcessedTokens = usage.inputTokens + usage.outputTokens;
  if (totalProcessedTokens <= 0 && usage.cachedInputTokens <= 0) {
    return undefined;
  }

  const contextWindow = getCodexContextWindow(modelId);
  const sessionStats = {
    sessionFile: undefined,
    sessionId: "codex-sdk",
    userMessages: 1,
    assistantMessages: 1,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 2,
    contextUsage: {
      tokens: usage.inputTokens,
      contextWindow,
      percent: contextWindow > 0 ? Math.min(100, (usage.inputTokens / contextWindow) * 100) : 0
    },
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cachedInputTokens,
      cacheWrite: 0,
      total: totalProcessedTokens
    },
    cost: 0
  };

  return {
    tokens: usage.inputTokens,
    contextWindow,
    usagePercent: contextWindow > 0 ? Math.min(100, (usage.inputTokens / contextWindow) * 100) : undefined,
    sessionStats,
    cachedInputTokens: usage.cachedInputTokens
  };
}

async function runThreadWithCodexControls(
  thread: CodexSdkThreadLike,
  request: PiAgentPromptRequest,
  input: CodexSdkInput,
  signal: AbortSignal
) {
  const turnOptions = buildTurnOptions(request, signal);
  return thread.runStreamed(input, turnOptions);
}

function buildTurnOptions(_request: PiAgentPromptRequest, signal: AbortSignal): CodexSdkTurnOptions {
  return { signal };
}

function isCodexControlConfigurationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("unknown") ||
    message.includes("unexpected") ||
    message.includes("unsupported") ||
    message.includes("invalid") ||
    message.includes("service tier") ||
    message.includes("effort")
  );
}

function mapReasoningStrengthToCodexEffort(reasoningStrength: PiAgentPromptRequest["reasoningStrength"]) {
  switch (reasoningStrength) {
    case "low":
      return "low" as const;
    case "medium":
      return "medium" as const;
    case "extra-high":
      return "xhigh" as const;
    case "high":
      return "high" as const;
    default:
      return undefined;
  }
}

function buildCodexPromptWithPrelude(request: PiAgentPromptRequest) {
  const prelude = buildCodexCommandPrelude(request);
  return [CODEX_TOOL_GUIDANCE, prelude, request.prompt].filter(Boolean).join("\n\n");
}

function buildCodexCommandPrelude(request: PiAgentPromptRequest) {
  const commands: string[] = [];
  if (request.fastMode) {
    commands.push("/fast");
  }
  return commands.join("\n");
}

function emitCommandExecutionEvent(
  request: PiAgentPromptRequest,
  eventType: string | undefined,
  item: CodexSdkCommandEvent
) {
  if (eventType === "item.started") {
    request.onExecutionEvent?.({
      type: "tool-start",
      toolCallId: item.id,
      toolName: "shell",
      args: {
        command: item.command
      }
    });
    return;
  }

  if (eventType === "item.updated") {
    request.onExecutionEvent?.({
      type: "tool-update",
      toolCallId: item.id,
      toolName: "shell",
      args: {
        command: item.command
      },
      partialResult: {
        output: item.aggregated_output,
        exitCode: item.exit_code,
        status: item.status
      }
    });
    return;
  }

  if (eventType === "item.completed") {
    request.onExecutionEvent?.({
      type: "tool-end",
      toolCallId: item.id,
      toolName: "shell",
      result: {
        command: item.command,
        output: item.aggregated_output,
        exitCode: item.exit_code,
        status: item.status
      },
      isError: item.status === "failed" || (item.exit_code ?? 0) !== 0
    });
  }
}

function emitMcpToolEvent(
  request: PiAgentPromptRequest,
  eventType: string | undefined,
  item: CodexSdkMcpEvent
) {
  const toolName = `${item.server}.${item.tool}`;
  if (eventType === "item.started") {
    request.onExecutionEvent?.({
      type: "tool-start",
      toolCallId: item.id,
      toolName,
      args: item.arguments
    });
    return;
  }

  if (eventType === "item.updated") {
    request.onExecutionEvent?.({
      type: "tool-update",
      toolCallId: item.id,
      toolName,
      args: item.arguments,
      partialResult: item.result ?? item.error
    });
    return;
  }

  if (eventType === "item.completed") {
    request.onExecutionEvent?.({
      type: "tool-end",
      toolCallId: item.id,
      toolName,
      result: item.result ?? item.error ?? null,
      isError: item.status === "failed"
    });
  }
}

function emitWebSearchEvent(
  request: PiAgentPromptRequest,
  eventType: string | undefined,
  item: CodexSdkWebSearchEvent
) {
  if (eventType === "item.started") {
    request.onExecutionEvent?.({
      type: "tool-start",
      toolCallId: item.id,
      toolName: "web_search",
      args: {
        query: item.query
      }
    });
    return;
  }

  if (eventType === "item.completed") {
    request.onExecutionEvent?.({
      type: "tool-end",
      toolCallId: item.id,
      toolName: "web_search",
      result: {
        query: item.query
      },
      isError: false
    });
  }
}

function mergeAbortSignals(left: AbortSignal | undefined, right: AbortSignal) {
  if (!left) {
    return right;
  }

  const controller = new AbortController();
  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }

  const abort = () => controller.abort();
  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function toCliModelName(modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  return modelId.includes("/") ? modelId.split("/", 2)[1] : modelId;
}

function getCodexContextWindow(modelId: string) {
  const normalized = toCliModelName(modelId) ?? "";
  if (normalized.includes("mini")) {
    return 400000;
  }
  return 400000;
}

export const testExports = {
  buildThreadOptions,
  materializeSdkInput,
  getImageExtension,
  handleCodexSdkEvent,
  buildTurnOptions,
  buildCodexCommandPrelude,
  buildCodexPromptWithPrelude,
  isCodexControlConfigurationError,
  accumulateCodexUsage,
  createCodexContextUsage,
  CODEX_TOOL_GUIDANCE
};
