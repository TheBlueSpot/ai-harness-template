import { describe, expect, test } from "bun:test";
import {
  buildPiAutoCompactionSettings,
  clampAutoCompactContextThresholdPercent,
  PiSdkAgentAdapter
} from "./pi-agent-adapter";

describe("pi sdk adapter", () => {
  test("rejects non-openai model ids before invoking pi", async () => {
    const adapter = new PiSdkAgentAdapter();

    await expect(
      adapter.runPrompt({
        kind: "planner",
        cwd: process.cwd(),
        modelId: "anthropic/claude-opus-4-5",
        prompt: "test"
      })
    ).rejects.toThrow("Unsupported provider");
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
});
