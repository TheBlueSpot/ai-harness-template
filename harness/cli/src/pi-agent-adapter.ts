import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  createReadOnlyTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type SessionStats,
  type AgentSessionEvent
} from "@mariozechner/pi-coding-agent";
import { streamSimple, type ImageContent, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import type { ComposerReasoningStrength } from "../../shared/protocol";
import { isBrowserToolName } from "./browser-session-state";
import { debugLog } from "./logging";

export type PiAgentPromptKind = "planner" | "executor" | "subagent" | "aggregator" | "merge-resolver";

export type PiAgentPromptRequest = {
  kind: PiAgentPromptKind;
  cwd: string;
  modelId: string;
  prompt: string;
  images?: ImageContent[];
  abortSignal?: AbortSignal;
  readOnly?: boolean;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  onTextDelta?: (delta: string) => void;
  onExecutionEvent?: (event: PiAgentExecutionEvent) => void;
  requestBrowserApproval?: (input: { toolCallId: string; toolName: string; args: unknown }) => Promise<{ approved: boolean }>;
};

export type PiAgentPromptResult = {
  text: string;
  contextUsage?: {
    tokens?: number;
    contextWindow: number;
    usagePercent?: number;
    sessionStats: SessionStats;
  };
};

export type PiAgentExecutionEvent =
  | { type: "session-created" }
  | { type: "activity" }
  | { type: "tool-start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool-end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

export interface PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;
  continueWithPrompt(prompt?: string): Promise<PiAgentPromptResult>;
  abort(): Promise<void>;
  dispose(): void;
}

export interface PiAgentAdapter {
  runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult>;
  startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController>;
  setApiKey(provider: "openai" | "google", apiKey: string | undefined): void;
  hasApiKey(provider: "openai" | "google"): boolean;
}

const DEFAULT_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 40;
const MIN_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 10;
const MAX_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 95;
const MIN_AUTO_COMPACTION_RESERVE_TOKENS = 8192;
const MIN_AUTO_COMPACTION_KEEP_RECENT_TOKENS = 4000;
const DEFAULT_AUTO_COMPACTION_KEEP_RECENT_TOKENS = 20000;
const FAST_OPENAI_PROVIDER = "openai";
const FAST_OPENAI_SERVICE_TIER = "priority";

export function clampAutoCompactContextThresholdPercent(value: number) {
  return Math.max(
    MIN_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT,
    Math.min(MAX_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT, Math.round(value))
  );
}

export function buildPiAutoCompactionSettings(contextWindow: number, thresholdPercent: number) {
  const normalizedThresholdPercent = clampAutoCompactContextThresholdPercent(thresholdPercent);
  const reserveTokens = Math.max(
    MIN_AUTO_COMPACTION_RESERVE_TOKENS,
    Math.round(contextWindow * (1 - normalizedThresholdPercent / 100))
  );
  const keepRecentTokens = Math.max(
    MIN_AUTO_COMPACTION_KEEP_RECENT_TOKENS,
    Math.min(DEFAULT_AUTO_COMPACTION_KEEP_RECENT_TOKENS, Math.floor(contextWindow * 0.1))
  );

  return {
    enabled: true,
    reserveTokens,
    keepRecentTokens
  };
}

export function mapReasoningStrengthToThinkingLevel(reasoningStrength: ComposerReasoningStrength | undefined) {
  switch (reasoningStrength) {
    case "low":
      return "low" as const;
    case "medium":
      return "medium" as const;
    case "extra-high":
      return "xhigh" as const;
    case "high":
    default:
      return "high" as const;
  }
}

export class PiSdkAgentAdapter implements PiAgentAdapter {
  private readonly authStorage: AuthStorage;
  private readonly modelRegistry: ModelRegistry;
  private autoCompactContextThresholdPercent = DEFAULT_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT;

  constructor() {
    this.authStorage = AuthStorage.create();
    this.modelRegistry = ModelRegistry.create(this.authStorage);
  }

  setApiKey(provider: "openai" | "google", apiKey: string | undefined) {
    const normalizedKey = apiKey?.trim() || undefined;
    if (normalizedKey) {
      this.authStorage.setRuntimeApiKey(provider, normalizedKey);
      return;
    }

    this.authStorage.removeRuntimeApiKey(provider);
  }

  hasApiKey(provider: "openai" | "google") {
    return this.authStorage.hasAuth(provider);
  }

  setAutoCompactContextThresholdPercent(thresholdPercent: number) {
    this.autoCompactContextThresholdPercent = clampAutoCompactContextThresholdPercent(thresholdPercent);
  }

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    const controller = await this.startExecution(request);
    try {
      return await controller.result;
    } finally {
      controller.dispose();
    }
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const modelRegistry = this.createExecutionModelRegistry(request);
    const model = this.resolveModel(modelRegistry, request.modelId);
    const toolset = request.readOnly ? createReadOnlyTools(request.cwd) : createCodingTools(request.cwd);
    const settingsManager = SettingsManager.inMemory({
      compaction: buildPiAutoCompactionSettings(model.contextWindow, this.autoCompactContextThresholdPercent),
      retry: { enabled: true, maxRetries: 1 }
    });
    const resourceLoader = request.requestBrowserApproval
      ? await this.createResourceLoader(request, settingsManager)
      : undefined;
    const { session } = await createAgentSession({
      cwd: request.cwd,
      authStorage: this.authStorage,
      modelRegistry,
      model,
      thinkingLevel: mapReasoningStrengthToThinkingLevel(request.reasoningStrength),
      tools: toolset,
      resourceLoader,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager
    });

    return new PiSdkExecutionController(session, request, model.contextWindow, (event) => this.handleEvent(event, request));
  }

  private resolveModel(modelRegistry: ModelRegistry, modelId: string) {
    const [provider, providerModelId] = modelId.split("/", 2);

    if (provider !== "openai" && provider !== "google") {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const model = modelRegistry.find(provider, providerModelId);
    if (!model) {
      throw new Error(`Unknown provider model: ${modelId}`);
    }

    return model;
  }

  private createExecutionModelRegistry(request: PiAgentPromptRequest) {
    if (!request.fastMode || !request.modelId.startsWith(`${FAST_OPENAI_PROVIDER}/`)) {
      return this.modelRegistry;
    }

    const modelRegistry = ModelRegistry.inMemory(this.authStorage);
    const openAiModels = modelRegistry.getAll().filter((model) => model.provider === FAST_OPENAI_PROVIDER);
    const baseModel = openAiModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return modelRegistry;
    }

    modelRegistry.registerProvider(FAST_OPENAI_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "OPENAI_API_KEY",
      streamSimple(model, context, options) {
        return streamSimple(model, context, {
          ...options,
          serviceTier: FAST_OPENAI_SERVICE_TIER
        } as SimpleStreamOptions & { serviceTier: string });
      },
      models: openAiModels.map((model) => ({
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        input: [...model.input],
        cost: { ...model.cost },
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        headers: model.headers,
        compat: model.compat
      }))
    });

    return modelRegistry;
  }

  private handleEvent(event: AgentSessionEvent, request: PiAgentPromptRequest) {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onTextDelta?.(event.assistantMessageEvent.delta);
      return;
    }

    if (event.type === "tool_execution_start") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onExecutionEvent?.({
        type: "tool-start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args
      });
      debugLog("agent.tool.start", {
        kind: request.kind,
        modelId: request.modelId,
        tool: event.toolName
      });
      return;
    }

    if (event.type === "tool_execution_update") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onExecutionEvent?.({
        type: "tool-update",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        partialResult: event.partialResult
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onExecutionEvent?.({
        type: "tool-end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError
      });
      debugLog("agent.tool.end", {
        kind: request.kind,
        modelId: request.modelId,
        tool: event.toolName,
        isError: event.isError
      });
    }
  }

  private async createResourceLoader(request: PiAgentPromptRequest, settingsManager: SettingsManager) {
    const loader = new DefaultResourceLoader({
      cwd: request.cwd,
      settingsManager,
      extensionFactories: [
        (pi) => {
          pi.on("tool_call", async (event) => {
            if (!request.requestBrowserApproval || !isBrowserToolName(event.toolName)) {
              return;
            }

            const decision = await request.requestBrowserApproval({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.input
            });
            if (decision.approved) {
              return;
            }

            return {
              block: true,
              reason: "Browser action rejected in harness approval gate"
            };
          });
        }
      ]
    });
    await loader.reload();
    return loader;
  }

}

class PiSdkExecutionController implements PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;

  private readonly abortHandler: (() => Promise<void>) | undefined;
  private readonly unsubscribe: () => void;
  private currentResult: Promise<PiAgentPromptResult> | undefined;
  private disposed = false;
  private running = false;

  constructor(
    private readonly session: Awaited<ReturnType<typeof createAgentSession>>["session"],
    private readonly request: PiAgentPromptRequest,
    private readonly contextWindow: number,
    onSessionEvent: (event: AgentSessionEvent) => void
  ) {
    this.unsubscribe = this.session.subscribe((event) => onSessionEvent(event));
    this.request.onExecutionEvent?.({ type: "session-created" });

    this.abortHandler = this.request.abortSignal
      ? async () => {
          await this.abort();
        }
      : undefined;

    if (this.abortHandler) {
      this.request.abortSignal?.addEventListener("abort", this.abortHandler, { once: true });
    }
    this.result = this.run(this.request.prompt);
  }

  continueWithPrompt(prompt: string = "continue") {
    return this.run(prompt);
  }

  async abort() {
    debugLog("agent.abort", {
      kind: this.request.kind,
      modelId: this.request.modelId
    });
    await this.session.abort();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.abortHandler) {
      this.request.abortSignal?.removeEventListener("abort", this.abortHandler);
    }
    this.unsubscribe();
    this.session.dispose();
  }

  private run(prompt: string) {
    if (this.disposed) {
      return Promise.reject(new Error("Execution controller is disposed"));
    }

    if (this.running) {
      return Promise.reject(new Error("Execution already running"));
    }

    this.running = true;
    this.currentResult = (async () => {
      await this.session.prompt(prompt, { images: this.request.images });
      const text = this.session.getLastAssistantText()?.trim();

      if (!text) {
        throw new Error("Pi agent returned an empty response");
      }

      const sessionStats = this.session.getSessionStats();
      const tokens = sessionStats.contextUsage?.tokens ?? undefined;
      return {
        text,
        contextUsage: {
          tokens,
          contextWindow: this.contextWindow,
          usagePercent: tokens === undefined ? undefined : Math.min(100, (tokens / this.contextWindow) * 100),
          sessionStats
        }
      } satisfies PiAgentPromptResult;
    })().finally(() => {
      this.running = false;
    });

    return this.currentResult;
  }
}
