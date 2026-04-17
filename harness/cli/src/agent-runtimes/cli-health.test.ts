import { describe, expect, test } from "bun:test";
import { createSecureToken, extractCodexFinalText, parseCopilotModelChoices } from "./cli-health";

describe("cli health helpers", () => {
  test("extracts codex final assistant message from jsonl", () => {
    const stdout = [
      '{"type":"thread.started","thread_id":"1"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"OK"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
    ].join("\n");

    expect(extractCodexFinalText(stdout)).toBe("OK");
  });

  test("parses copilot model choices from help text", () => {
    const help = "--model <MODEL>  Model to use. choices: gpt-5, claude-3.7-sonnet, gemini-2.5-pro";
    expect(parseCopilotModelChoices(help)).toEqual(["gpt-5", "claude-3.7-sonnet", "gemini-2.5-pro"]);
  });

  test("creates base64url secure attach token", () => {
    const token = createSecureToken();
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
