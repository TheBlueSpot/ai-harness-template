import { describe, expect, test } from "bun:test";
import { resolveSubagentModelId, resolveSubagentReasoningStrength } from "./subagent-defaults";

describe("subagent defaults", () => {
  test("keeps pi subagents on cheapest gpt sibling in same family", () => {
    expect(
      resolveSubagentModelId({
        agentId: "pi",
        providerBrand: "gpt",
        executionModelId: "openai/gpt-5.4"
      })
    ).toBe("openai/gpt-5.4-nano");
  });

  test("keeps codex subagents on codex-compatible gpt sibling in same family", () => {
    expect(
      resolveSubagentModelId({
        agentId: "codex-cli",
        providerBrand: "gemini",
        executionModelId: "openai/gpt-5.4"
      })
    ).toBe("openai/gpt-5.4-mini");
  });

  test("uses visible codex mini worker for gpt-5.5 execution", () => {
    expect(
      resolveSubagentModelId({
        agentId: "codex-cli",
        providerBrand: "gpt",
        executionModelId: "openai/gpt-5.5"
      })
    ).toBe("openai/gpt-5.4-mini");
  });

  test("maps claude families to haiku for cli runtimes", () => {
    expect(
      resolveSubagentModelId({
        agentId: "copilot-cli",
        providerBrand: "gpt",
        executionModelId: "claude-3.7-opus"
      })
    ).toBe("claude-3.7-haiku");
  });

  test("maps gemini families to lite sibling for cli runtimes", () => {
    expect(
      resolveSubagentModelId({
        agentId: "copilot-cli",
        providerBrand: "gemini",
        executionModelId: "gemini-2.5-pro"
      })
    ).toBe("gemini-2.5-flash-lite");
  });

  test("inherits requested reasoning for spawned subagents", () => {
    expect(resolveSubagentReasoningStrength()).toBe("low");
    expect(resolveSubagentReasoningStrength("extra-high")).toBe("extra-high");
  });
});
