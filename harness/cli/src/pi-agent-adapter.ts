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
import type { ImageContent } from "@mariozechner/pi-ai";
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

export class PiSdkAgentAdapter implements PiAgentAdapter {
  private readonly authStorage: AuthStorage;
  private readonly modelRegistry: ModelRegistry;
  private readonly settingsManager: SettingsManager;

  constructor() {
    this.authStorage = AuthStorage.create();

    this.modelRegistry = ModelRegistry.create(this.authStorage);
    this.settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1 }
    });
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

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    const controller = await this.startExecution(request);
    try {
      return await controller.result;
    } finally {
      controller.dispose();
    }
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const model = this.resolveOpenAiModel(request.modelId);
    const toolset = request.readOnly ? createReadOnlyTools(request.cwd) : createCodingTools(request.cwd);
    const resourceLoader = request.requestBrowserApproval
      ? await this.createResourceLoader(request)
      : undefined;
    const { session } = await createAgentSession({
      cwd: request.cwd,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model,
      tools: toolset,
      resourceLoader,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager: this.settingsManager
    });

    return new PiSdkExecutionController(session, request, model.contextWindow, (event) => this.handleEvent(event, request));
  }

  private resolveOpenAiModel(modelId: string) {
    const [provider, providerModelId] = modelId.split("/", 2);

    if (provider !== "openai" && provider !== "google") {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const model = this.modelRegistry.find(provider, providerModelId);
    if (!model) {
      throw new Error(`Unknown provider model: ${modelId}`);
    }

    return model;
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

  private async createResourceLoader(request: PiAgentPromptRequest) {
    const loader = new DefaultResourceLoader({
      cwd: request.cwd,
      settingsManager: this.settingsManager,
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
