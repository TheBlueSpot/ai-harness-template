import { describe, expect, test } from "bun:test";
import {
  buildPiAutoCompactionSettings,
  clampAutoCompactContextThresholdPercent,
  mapReasoningStrengthToThinkingLevel,
  PiSdkAgentAdapter
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
});
