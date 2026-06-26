import { describe, expect, test } from "bun:test";
import { SettingsManager } from "@mariozechner/pi-coding-agent";
import {
  buildPiAutoCompactionSettings,
  clampAutoCompactContextThresholdPercent,
  mapReasoningStrengthToThinkingLevel,
  PiSdkAgentAdapter,
  testExports,
  type PiSdkPromptWorkerRequest,
  type PiSdkPromptWorkerResponse
} from "./pi-agent-adapter";

describe("pi sdk adapter", () => {
  test("rejects unsupported provider model ids before invoking pi", async () => {
    const adapter = new PiSdkAgentAdapter();

    await expect(
      adapter.runPrompt({
        kind: "planner",
        cwd: process.cwd(),
        modelId: "mistral/codestral",
        prompt: "test"
      })
    ).rejects.toThrow("Unsupported provider");
  });

  test("stores Anthropic runtime API key", () => {
    const adapter = new PiSdkAgentAdapter();

    expect(adapter.hasApiKey("anthropic")).toBe(false);
    adapter.setApiKey("anthropic", " sk-ant-test ");
    expect(adapter.hasApiKey("anthropic")).toBe(true);
    adapter.setApiKey("anthropic", undefined);
    expect(adapter.hasApiKey("anthropic")).toBe(false);
  });

  test("offloads cloneable runPrompt requests to a worker", async () => {
    let posted: PiSdkPromptWorkerRequest | undefined;
    let terminated = false;
    const worker: {
      onmessage: ((event: MessageEvent<PiSdkPromptWorkerResponse>) => void) | null;
      onerror: null;
      onmessageerror: null;
      postMessage(payload: PiSdkPromptWorkerRequest): void;
      terminate(): void;
    } = {
      onmessage: null as ((event: MessageEvent<PiSdkPromptWorkerResponse>) => void) | null,
      onerror: null,
      onmessageerror: null,
      postMessage(payload: PiSdkPromptWorkerRequest) {
        posted = payload;
        queueMicrotask(() => {
          worker.onmessage?.({
            data: {
              id: payload.id,
              ok: true,
              result: {
                text: "worker result"
              }
            }
          } as MessageEvent<PiSdkPromptWorkerResponse>);
        });
      },
      terminate() {
        terminated = true;
      }
    };
    const adapter = new PiSdkAgentAdapter({ createPromptWorker: () => worker as unknown as Worker });
    adapter.setApiKey("openai", "sk-worker-test");

    const result = await adapter.runPrompt({
      kind: "planner",
      cwd: process.cwd(),
      modelId: "openai/gpt-5.5",
      prompt: "test"
    });

    expect(result.text).toBe("worker result");
    expect(posted?.apiKeys.openai).toBe("sk-worker-test");
    expect(posted?.request.prompt).toBe("test");
    expect(terminated).toBe(true);
  });

  test("keeps callback-based runPrompt requests in process", async () => {
    let workerCreated = false;
    const adapter = new PiSdkAgentAdapter({
      createPromptWorker: () => {
        workerCreated = true;
        throw new Error("worker should not start");
      }
    });

    await expect(
      adapter.runPrompt({
        kind: "planner",
        cwd: process.cwd(),
        modelId: "mistral/codestral",
        prompt: "test",
        onTextDelta() {}
      })
    ).rejects.toThrow("Unsupported provider");
    expect(workerCreated).toBe(false);
  });

  test("clamps threshold and derives compaction settings from context window", () => {
    expect(clampAutoCompactContextThresholdPercent(3)).toBe(10);
    expect(clampAutoCompactContextThresholdPercent(97)).toBe(95);
    expect(buildPiAutoCompactionSettings(200000, 40)).toEqual({
      enabled: true,
      reserveTokens: 120000,
      keepRecentTokens: 20000
    });
  });

  test("maps composer reasoning strengths to pi thinking levels", () => {
    expect(mapReasoningStrengthToThinkingLevel("low")).toBe("low");
    expect(mapReasoningStrengthToThinkingLevel("medium")).toBe("medium");
    expect(mapReasoningStrengthToThinkingLevel("high")).toBe("high");
    expect(mapReasoningStrengthToThinkingLevel("extra-high")).toBe("xhigh");
  });

  test("creates browser-gated resource loader with explicit agent dir", async () => {
    await expect(
      testExports.createPiResourceLoader(
        {
          kind: "executor",
          cwd: process.cwd(),
          modelId: "google/gemini-2.5-flash",
          prompt: "test",
          requestBrowserApproval: async () => ({ approved: true })
        },
        SettingsManager.inMemory()
      )
    ).resolves.toBeDefined();
  });
});
