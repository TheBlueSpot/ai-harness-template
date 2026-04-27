import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CliAgentAdapter } from "./agent-runtimes/cli-agent-adapter";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("development telemetry", () => {
  test("CLI runtime does not post prompts or output to local telemetry endpoints", async () => {
    let fetchCallCount = 0;
    globalThis.fetch = (async () => {
      fetchCallCount += 1;
      throw new Error("unexpected telemetry fetch");
    }) as unknown as typeof fetch;

    const adapter = new CliAgentAdapter({
      label: "Test CLI",
      buildCommand() {
        return {
          cmd: [process.execPath, "-e", "console.log('secret-output-fragment')"],
          cwd: process.cwd()
        };
      }
    });

    const result = await adapter.runPrompt({
      kind: "executor",
      prompt: "secret-prompt-fragment",
      modelId: "openai/gpt-5.4",
      cwd: process.cwd(),
      readOnly: true
    });

    expect(result.text).toBe("secret-output-fragment");
    expect(fetchCallCount).toBe(0);
  });

  test("runtime instrumentation source contains no hardcoded telemetry fetches or stack persistence", () => {
    const root = process.cwd();
    const cliAdapter = readFileSync(path.join(root, "harness/cli/src/agent-runtimes/cli-agent-adapter.ts"), "utf8");
    const assistantManager = readFileSync(path.join(root, "harness/cli/src/assistant-manager.ts"), "utf8");

    expect(cliAdapter).not.toContain("127.0.0.1:7467");
    expect(cliAdapter).not.toContain("promptHead");
    expect(cliAdapter).not.toContain("stdoutTail");
    expect(cliAdapter).not.toContain("stderrTail");
    expect(assistantManager).not.toContain("127.0.0.1:7467");
    expect(assistantManager).not.toContain("stack: error.stack");
  });
});
