import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  createReadOnlyTools,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type SessionStats,
  type AgentSessionEvent
} from "@mariozechner/pi-coding-agent";
import { debugLog } from "./logging";

export type PiAgentPromptKind = "planner" | "executor" | "subagent" | "aggregator" | "merge-resolver";

export type PiAgentPromptRequest = {
  kind: PiAgentPromptKind;
  cwd: string;
  modelId: string;
  prompt: string;
  abortSignal?: AbortSignal;
  readOnly?: boolean;
  onTextDelta?: (delta: string) => void;
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

export interface PiAgentAdapter {
  runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult>;
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
    const model = this.resolveOpenAiModel(request.modelId);
    const toolset = request.readOnly ? createReadOnlyTools(request.cwd) : createCodingTools(request.cwd);
    const { session } = await createAgentSession({
      cwd: request.cwd,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model,
      tools: toolset,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager: this.settingsManager
    });

    const unsubscribe = session.subscribe((event) => {
      this.handleEvent(event, request);
    });

    const abortHandler = async () => {
      debugLog("agent.abort", {
        kind: request.kind,
        modelId: request.modelId
      });
      await session.abort();
    };

    request.abortSignal?.addEventListener("abort", abortHandler, { once: true });

    try {
      await session.prompt(request.prompt);
      const text = session.getLastAssistantText()?.trim();

      if (!text) {
        throw new Error("Pi agent returned an empty response");
      }

      const sessionStats = session.getSessionStats();
      const tokens = sessionStats.contextUsage?.tokens ?? undefined;
      return {
        text,
        contextUsage: {
          tokens,
          contextWindow: model.contextWindow,
          usagePercent: tokens === undefined ? undefined : Math.min(100, (tokens / model.contextWindow) * 100),
          sessionStats
        }
      };
    } finally {
      request.abortSignal?.removeEventListener("abort", abortHandler);
      unsubscribe();
      session.dispose();
    }
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
      request.onTextDelta?.(event.assistantMessageEvent.delta);
      return;
    }

    if (event.type === "tool_execution_start") {
      debugLog("agent.tool.start", {
        kind: request.kind,
        modelId: request.modelId,
        tool: event.toolName
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      debugLog("agent.tool.end", {
        kind: request.kind,
        modelId: request.modelId,
        tool: event.toolName,
        isError: event.isError
      });
    }
  }

}
