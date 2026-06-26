import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type SessionStats,
  type AgentSessionEvent
} from "@mariozechner/pi-coding-agent";
import { streamSimple, type ImageContent, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import type { ComposerReasoningStrength } from "../../shared/protocol";
import { transformAnthropicCachePayload } from "./anthropic-cache-payload";
import { isBrowserToolName } from "./browser-session-state";
import { debugLog } from "./logging";
import type { CacheableUserBlock } from "./prompt-cache-assembly";
import { buildPromptCacheKey, extractCachedInputTokens, type PromptCacheIdentity } from "./prompt-cache";
import { supportsGeminiExplicitCaching } from "./gemini-cached-contents";

export type PiAgentPromptKind = "planner" | "executor" | "subagent" | "aggregator" | "merge-resolver";

export type PiAgentPromptRequest = {
  kind: PiAgentPromptKind;
  cwd: string;
  modelId: string;
  prompt: string;
  images?: ImageContent[];
  cacheableUserBlocks?: CacheableUserBlock[];
  promptCacheIdentity?: PromptCacheIdentity;
  geminiCachedContentName?: string;
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
    cachedInputTokens?: number;
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
  setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined): void;
  hasApiKey(provider: PiApiKeyProvider): boolean;
}

export type SerializablePiAgentPromptRequest = Omit<
  PiAgentPromptRequest,
  "abortSignal" | "onTextDelta" | "onExecutionEvent" | "requestBrowserApproval"
>;

export type PiSdkPromptWorkerRequest = {
  id: string;
  request: SerializablePiAgentPromptRequest;
  apiKeys: Partial<Record<PiApiKeyProvider, string>>;
  autoCompactContextThresholdPercent: number;
};

export type PiSdkPromptWorkerResponse =
  | { id: string; ok: true; result: PiAgentPromptResult }
  | { id: string; ok: false; error: { message: string; stack?: string } };

export function toSerializablePromptRequest(request: PiAgentPromptRequest): SerializablePiAgentPromptRequest {
  const {
    abortSignal: _abortSignal,
    onTextDelta: _onTextDelta,
    onExecutionEvent: _onExecutionEvent,
    requestBrowserApproval: _requestBrowserApproval,
    ...serializable
  } = request;
  return serializable;
}

function createAbortError() {
  const error = new Error("Execution aborted");
  error.name = "AbortError";
  return error;
}

const DEFAULT_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 40;
const MIN_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 10;
const MAX_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 95;
const MIN_AUTO_COMPACTION_RESERVE_TOKENS = 8192;
const MIN_AUTO_COMPACTION_KEEP_RECENT_TOKENS = 4000;
const DEFAULT_AUTO_COMPACTION_KEEP_RECENT_TOKENS = 20000;
const FAST_OPENAI_PROVIDER = "openai";
const FAST_OPENAI_SERVICE_TIER = "priority";
const ANTHROPIC_PROVIDER = "anthropic";
const GOOGLE_PROVIDER = "google";

export type PiApiKeyProvider = "openai" | "google" | "anthropic";

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
  private readonly runtimeApiKeys: Partial<Record<PiApiKeyProvider, string>> = {};
  private autoCompactContextThresholdPercent = DEFAULT_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT;

  constructor(
    private readonly options: {
      offloadRunPrompt?: boolean;
      createPromptWorker?: () => Worker;
    } = {}
  ) {
    this.authStorage = AuthStorage.create();
    this.modelRegistry = ModelRegistry.create(this.authStorage);
  }

  setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined) {
    const normalizedKey = apiKey?.trim() || undefined;
    if (normalizedKey) {
      this.runtimeApiKeys[provider] = normalizedKey;
      this.authStorage.setRuntimeApiKey(provider, normalizedKey);
      return;
    }

    delete this.runtimeApiKeys[provider];
    this.authStorage.removeRuntimeApiKey(provider);
  }

  hasApiKey(provider: PiApiKeyProvider) {
    return this.authStorage.hasAuth(provider);
  }

  setAutoCompactContextThresholdPercent(thresholdPercent: number) {
    this.autoCompactContextThresholdPercent = clampAutoCompactContextThresholdPercent(thresholdPercent);
  }

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    if (this.shouldOffloadRunPrompt(request)) {
      return this.runPromptInWorker(request);
    }

    const controller = await this.startExecution(request);
    try {
      return await controller.result;
    } finally {
      controller.dispose();
    }
  }

  private shouldOffloadRunPrompt(request: PiAgentPromptRequest) {
    return Boolean(
      this.options.offloadRunPrompt !== false &&
        !request.onTextDelta &&
        !request.onExecutionEvent &&
        !request.requestBrowserApproval
    );
  }

  private runPromptInWorker(request: PiAgentPromptRequest) {
    const worker = this.createPromptWorker();
    const id = crypto.randomUUID();
    const payload: PiSdkPromptWorkerRequest = {
      id,
      request: toSerializablePromptRequest(request),
      apiKeys: { ...this.runtimeApiKeys },
      autoCompactContextThresholdPercent: this.autoCompactContextThresholdPercent
    };

    debugLog("agent.prompt.worker.start", {
      id,
      kind: request.kind,
      modelId: request.modelId
    });

    return new Promise<PiAgentPromptResult>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        request.abortSignal?.removeEventListener("abort", abortHandler);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
      };
      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        worker.terminate();
        callback();
      };
      const abortHandler = () => {
        debugLog("agent.prompt.worker.abort", {
          id,
          kind: request.kind,
          modelId: request.modelId
        });
        settle(() => reject(createAbortError()));
      };

      worker.onmessage = (event: MessageEvent<PiSdkPromptWorkerResponse>) => {
        const response = event.data;
        if (!response || response.id !== id) {
          return;
        }

        if (response.ok) {
          debugLog("agent.prompt.worker.complete", {
            id,
            kind: request.kind,
            modelId: request.modelId
          });
          settle(() => resolve(response.result));
          return;
        }

        debugLog("agent.prompt.worker.failed", {
          id,
          kind: request.kind,
          modelId: request.modelId,
          error: response.error.message
        });
        settle(() => reject(Object.assign(new Error(response.error.message), { stack: response.error.stack })));
      };
      worker.onerror = (event) => {
        const message = event.message || "Pi prompt worker failed";
        debugLog("agent.prompt.worker.error", {
          id,
          kind: request.kind,
          modelId: request.modelId,
          error: message
        });
        settle(() => reject(new Error(message)));
      };
      worker.onmessageerror = () => {
        debugLog("agent.prompt.worker.message-error", {
          id,
          kind: request.kind,
          modelId: request.modelId
        });
        settle(() => reject(new Error("Pi prompt worker message failed")));
      };

      request.abortSignal?.addEventListener("abort", abortHandler, { once: true });
      if (request.abortSignal?.aborted) {
        abortHandler();
        return;
      }

      worker.postMessage(payload);
    });
  }

  private createPromptWorker() {
    return (
      this.options.createPromptWorker?.() ??
      new Worker(new URL("./pi-sdk-prompt-worker.ts", import.meta.url), {
        type: "module"
      })
    );
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const modelRegistry = this.createExecutionModelRegistry(request);
    const model = this.resolveModel(modelRegistry, request.modelId);
    const toolNames = request.readOnly ? ["read", "grep", "find", "ls"] : ["read", "bash", "edit", "write"];
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
      tools: toolNames,
      resourceLoader,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager
    });

    return new PiSdkExecutionController(session, request, model.contextWindow, (event) => this.handleEvent(event, request));
  }

  private resolveModel(modelRegistry: ModelRegistry, modelId: string) {
    const [provider, providerModelId] = modelId.split("/", 2);

    if (provider !== "openai" && provider !== "google" && provider !== "anthropic") {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const model = modelRegistry.find(provider, providerModelId);
    if (!model) {
      throw new Error(`Unknown provider model: ${modelId}`);
    }

    return model;
  }

  private createExecutionModelRegistry(request: PiAgentPromptRequest) {
    const shouldWrapOpenAi = Boolean(
      request.modelId.startsWith(`${FAST_OPENAI_PROVIDER}/`) && (request.fastMode || request.promptCacheIdentity)
    );
    const shouldWrapAnthropic = request.modelId.startsWith(`${ANTHROPIC_PROVIDER}/`);
    const shouldWrapGoogle = Boolean(
      request.geminiCachedContentName &&
        request.modelId.startsWith(`${GOOGLE_PROVIDER}/`) &&
        supportsGeminiExplicitCaching(request.modelId)
    );
    if (!shouldWrapOpenAi && !shouldWrapAnthropic && !shouldWrapGoogle) {
      return this.modelRegistry;
    }

    const modelRegistry = ModelRegistry.inMemory(this.authStorage);
    if (shouldWrapOpenAi) {
      this.registerOpenAiProvider(modelRegistry, request);
    }
    if (shouldWrapAnthropic) {
      this.registerAnthropicCacheProvider(modelRegistry, request);
    }
    if (shouldWrapGoogle) {
      this.registerGoogleCachedContentProvider(modelRegistry, request);
    }

    return modelRegistry;
  }

  private registerOpenAiProvider(modelRegistry: ModelRegistry, request: PiAgentPromptRequest) {
    const openAiModels = modelRegistry.getAll().filter((model) => model.provider === FAST_OPENAI_PROVIDER);
    const baseModel = openAiModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return;
    }
    modelRegistry.registerProvider(FAST_OPENAI_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "OPENAI_API_KEY",
      streamSimple(model, context, options) {
        const cacheOptions = request.promptCacheIdentity
          ? {
              sessionId: buildPromptCacheKey(request.promptCacheIdentity),
              cacheRetention: "long" as const
            }
          : {};
        return streamSimple(model, context, {
          ...options,
          ...cacheOptions,
          ...(request.fastMode ? { serviceTier: FAST_OPENAI_SERVICE_TIER } : {})
        } as SimpleStreamOptions & { serviceTier?: string });
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
  }

  private registerGoogleCachedContentProvider(modelRegistry: ModelRegistry, request: PiAgentPromptRequest) {
    const googleModels = modelRegistry.getAll().filter((model) => model.provider === GOOGLE_PROVIDER);
    const baseModel = googleModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return;
    }

    modelRegistry.registerProvider(GOOGLE_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "GEMINI_API_KEY",
      streamSimple(model, context, options) {
        return streamSimple(model, context, {
          ...options,
          async onPayload(payload, payloadModel) {
            const nextPayload = injectGeminiCachedContent(payload, payloadModel, request.geminiCachedContentName);
            return (await options?.onPayload?.(nextPayload, payloadModel)) ?? nextPayload;
          }
        } satisfies SimpleStreamOptions);
      },
      models: googleModels.map((model) => ({
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
  }

  private registerAnthropicCacheProvider(modelRegistry: ModelRegistry, request: PiAgentPromptRequest) {
    const anthropicModels = modelRegistry.getAll().filter((model) => model.provider === ANTHROPIC_PROVIDER);
    const baseModel = anthropicModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return;
    }

    modelRegistry.registerProvider(ANTHROPIC_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "ANTHROPIC_API_KEY",
      streamSimple(model, context, options) {
        return streamSimple(model, context, {
          ...options,
          cacheRetention: "long",
          async onPayload(payload, payloadModel) {
            const transformed = transformAnthropicCachePayload({
              payload,
              model: payloadModel,
              cacheableUserBlocks: request.cacheableUserBlocks
            });
            const nextPayload = transformed ?? payload;
            return (await options?.onPayload?.(nextPayload, payloadModel)) ?? nextPayload;
          }
        } satisfies SimpleStreamOptions);
      },
      models: anthropicModels.map((model) => ({
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
    return createPiResourceLoader(request, settingsManager);
  }

}

async function createPiResourceLoader(request: PiAgentPromptRequest, settingsManager: SettingsManager) {
  const loader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir: getAgentDir(),
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

class PiSdkExecutionController implements PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;

  private readonly abortHandler: (() => Promise<void>) | undefined;
  private readonly unsubscribe: () => void;
  private currentResult: Promise<PiAgentPromptResult> | undefined;
  private disposed = false;
  private lastSessionEventSummary = "session-created";
  private running = false;

  constructor(
    private readonly session: Awaited<ReturnType<typeof createAgentSession>>["session"],
    private readonly request: PiAgentPromptRequest,
    private readonly contextWindow: number,
    onSessionEvent: (event: AgentSessionEvent) => void
  ) {
    this.unsubscribe = this.session.subscribe((event) => {
      this.lastSessionEventSummary = summarizeSessionEvent(event);
      onSessionEvent(event);
    });
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
      await promptSession(this.session, prompt, this.request.images, this.request.abortSignal, this.lastSessionEventSummary);
      let text = this.session.getLastAssistantText()?.trim();

      if (!text && prompt.trim().toLowerCase() !== "continue") {
        await promptSession(this.session, "continue", this.request.images, this.request.abortSignal, this.lastSessionEventSummary);
        text = this.session.getLastAssistantText()?.trim();
      }

      if (!text) {
        const sessionStats = this.session.getSessionStats();
        throw createPiExecutionError(
          "empty-response",
          "Pi agent returned an empty response",
          this.lastSessionEventSummary,
          sessionStats
        );
      }

      const sessionStats = this.session.getSessionStats();
      if (this.request.modelId.startsWith("anthropic/") && sessionStats.tokens.cacheWrite > 0) {
        debugLog("agent.cache.creation", {
          providerBrand: "claude",
          modelId: this.request.modelId,
          cacheCreationInputTokens: sessionStats.tokens.cacheWrite
        });
      }
      const tokens = sessionStats.contextUsage?.tokens ?? undefined;
      const cachedInputTokens = extractCachedInputTokens(sessionStats);
      return {
        text,
        contextUsage: {
          tokens,
          contextWindow: this.contextWindow,
          usagePercent: tokens === undefined ? undefined : Math.min(100, (tokens / this.contextWindow) * 100),
          sessionStats,
          cachedInputTokens
        }
      } satisfies PiAgentPromptResult;
    })().finally(() => {
      this.running = false;
    });

    return this.currentResult;
  }
}

function summarizeSessionEvent(event: AgentSessionEvent) {
  switch (event.type) {
    case "message_update":
      return `message_update:${event.assistantMessageEvent.type}`;
    case "tool_execution_start":
      return `tool_execution_start:${event.toolName}`;
    case "tool_execution_update":
      return `tool_execution_update:${event.toolName}`;
    case "tool_execution_end":
      return `tool_execution_end:${event.toolName}:${event.isError ? "error" : "ok"}`;
    default:
      return event.type;
  }
}

function createPiExecutionError(
  category: "empty-response" | "stream-disconnect" | "invalid-json" | "unknown",
  message: string,
  lastEvent: string,
  sessionStats: SessionStats
) {
  const stats = sessionStats.contextUsage?.tokens;
  return new Error(
    `${message} [category=${category}] [last-event=${lastEvent}]${stats === undefined ? "" : ` [tokens=${stats}]`}`
  );
}

async function promptSession(
  session: Awaited<ReturnType<typeof createAgentSession>>["session"],
  prompt: string,
  images: PiAgentPromptRequest["images"],
  abortSignal: AbortSignal | undefined,
  lastEvent: string
) {
  try {
    await session.prompt(prompt, { images });
  } catch (error) {
    if (abortSignal?.aborted || isAbortLikeError(error)) {
      throw error;
    }
    throw createPiExecutionError("stream-disconnect", "Pi agent stream transport failed", lastEvent, session.getSessionStats());
  }
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalized = error.message.toLowerCase();
  return error.name === "AbortError" || normalized.includes("abort") || normalized.includes("cancel");
}

function injectGeminiCachedContent(payload: unknown, model: { provider: string; api: string }, cachedContentName: string | undefined) {
  if (
    !cachedContentName ||
    model.provider !== GOOGLE_PROVIDER ||
    model.api !== "google-generative-ai" ||
    !isRecord(payload)
  ) {
    return payload;
  }

  return {
    ...payload,
    config: {
      ...(isRecord(payload.config) ? payload.config : {}),
      cachedContent: cachedContentName
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const testExports = {
  createPiResourceLoader
};
