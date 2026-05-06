import { describe, expect, test } from "bun:test";
import type { Model } from "@mariozechner/pi-ai";
import { ANTHROPIC_CACHEABLE_USER_BLOCK_MIN_CHARS, transformAnthropicCachePayload } from "./anthropic-cache-payload";

const anthropicModel: Model<"anthropic-messages"> = {
  id: "claude-sonnet-4-6",
  name: "Claude Sonnet 4.6",
  api: "anthropic-messages",
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  reasoning: true,
  input: ["text", "image"],
  cost: {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75
  },
  contextWindow: 1000000,
  maxTokens: 64000
};

const openAiModel: Model<"openai-responses"> = {
  ...anthropicModel,
  id: "gpt-5.4",
  name: "GPT-5.4",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1"
};

describe("transformAnthropicCachePayload", () => {
  test("marks final system block and final sorted tool", () => {
    const result = transformAnthropicCachePayload({
      model: anthropicModel,
      payload: {
        system: [
          { type: "text", text: "first", cache_control: { type: "ephemeral" } },
          { type: "text", text: "second" }
        ],
        tools: [
          { name: "zeta", input_schema: { type: "object", properties: { z: { type: "string" } } } },
          { name: "alpha", input_schema: { properties: { a: { type: "string" } }, type: "object" } }
        ],
        messages: [{ role: "user", content: "dynamic" }]
      }
    });

    expect(result?.system).toEqual([
      { type: "text", text: "first" },
      { type: "text", text: "second", cache_control: { type: "ephemeral" } }
    ]);
    expect(result?.tools).toMatchObject([
      { name: "alpha" },
      { name: "zeta", cache_control: { type: "ephemeral" } }
    ]);
  });

  test("groups large stable user blocks before dynamic messages", () => {
    const stableText = "x".repeat(ANTHROPIC_CACHEABLE_USER_BLOCK_MIN_CHARS);
    const result = transformAnthropicCachePayload({
      model: anthropicModel,
      payload: {
        system: "rules",
        messages: [{ role: "user", content: "latest dynamic question" }]
      },
      cacheableUserBlocks: [{ kind: "uploadthing-attachment", title: "Spec.pdf", text: stableText }]
    });
    const messages = result?.messages;

    if (!Array.isArray(messages)) {
      throw new Error("expected Anthropic messages array");
    }
    expect(messages[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", cache_control: { type: "ephemeral" } }]
    });
    expect(messages[1]).toEqual({ role: "user", content: "latest dynamic question" });
  });

  test("skips small stable user blocks", () => {
    const result = transformAnthropicCachePayload({
      model: anthropicModel,
      payload: {
        messages: [{ role: "user", content: "dynamic" }]
      },
      cacheableUserBlocks: [{ kind: "uploadthing-attachment", title: "Tiny", text: "small" }]
    });

    expect(result?.messages).toEqual([{ role: "user", content: "dynamic" }]);
  });

  test("does not transform non-Anthropic providers", () => {
    expect(
      transformAnthropicCachePayload({
        model: openAiModel,
        payload: { messages: [{ role: "user", content: "dynamic" }] }
      })
    ).toBeUndefined();
  });
});
