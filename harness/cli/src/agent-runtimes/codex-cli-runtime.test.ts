import { describe, expect, test } from "bun:test";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import { testExports } from "./codex-cli-runtime";

function createRequest(overrides: Partial<PiAgentPromptRequest> = {}): PiAgentPromptRequest {
  return {
    kind: "executor",
    prompt: "Inspect repo",
    cwd: "C:\\repo",
    modelId: "openai/gpt-5.4",
    readOnly: false,
    ...overrides
  };
}

describe("codex cli runtime", () => {
  test("uses codex exec syntax without deprecated approval flag", () => {
    const command = testExports.buildCodexProgrammaticCommand(createRequest(), "Inspect repo");

    expect(command.cmd).toEqual([
      "codex",
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      "C:\\repo",
      "-s",
      "workspace-write",
      "--model",
      "gpt-5.4",
      "Inspect repo"
    ]);
    expect(command.cmd).not.toContain("-a");
    expect(command.cmd).not.toContain("--ask-for-approval");
  });

  test("uses read-only sandbox for read-only prompts", () => {
    const command = testExports.buildCodexProgrammaticCommand(
      createRequest({
        kind: "planner",
        readOnly: true,
        modelId: "openai/gpt-5.4-mini"
      }),
      "Plan fix"
    );

    expect(command.cmd).toContain("read-only");
    expect(command.cmd).toContain("gpt-5.4-mini");
  });
});
