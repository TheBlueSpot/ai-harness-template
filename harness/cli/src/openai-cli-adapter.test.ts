import { describe, expect, test } from "bun:test";
import { buildOpenAiCliInvocation } from "./openai-cli-adapter";
import { createChatMessage } from "../../shared/protocol";

describe("OpenAI CLI adapter", () => {
  test("uses a sanitized template-driven invocation", () => {
    const invocation = buildOpenAiCliInvocation({
      modelId: "gpt-4.1-mini",
      messages: [createChatMessage("user", "Summarize this project scaffold.")]
    });

    expect(invocation.command.slice(0, 3)).toEqual(["openai", "responses", "create"]);
    expect(invocation.command).toContain("--model");
    expect(invocation.input).toContain('"role":"user"');
  });
});

