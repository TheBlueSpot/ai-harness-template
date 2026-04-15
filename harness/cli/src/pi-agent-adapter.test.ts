import { describe, expect, test } from "bun:test";
import { PiSdkAgentAdapter } from "./pi-agent-adapter";

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
});
