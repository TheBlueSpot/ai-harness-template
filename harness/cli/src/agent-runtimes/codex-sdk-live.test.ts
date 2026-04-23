import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { CodexCliRuntime } from "./codex-cli-runtime";

const runLive = Bun.env.HARNESS_RUN_CODEX_LIVE_TESTS === "1";
const liveTest = runLive ? test : test.skip;

describe("codex sdk live", () => {
  liveTest("returns text for a simple read-only run", async () => {
    const runtime = new CodexCliRuntime();
    const result = await runtime.getAdapter().runPrompt({
      kind: "executor",
      cwd: process.cwd(),
      modelId: "openai/gpt-5.4",
      prompt: "Reply with exact text OK and nothing else.",
      readOnly: true
    });

    expect(result.text.trim()).toBe("OK");
  }, 120000);

  liveTest("preserves context across continuation on one controller", async () => {
    const runtime = new CodexCliRuntime();
    const controller = await runtime.getAdapter().startExecution({
      kind: "executor",
      cwd: process.cwd(),
      modelId: "openai/gpt-5.4",
      prompt: "Remember token zebra-42 and reply with remembered.",
      readOnly: true
    });

    try {
      await controller.result;
      const followup = await controller.continueWithPrompt("What token did I ask you to remember?");
      expect(followup.text.toLowerCase()).toContain("zebra-42");
    } finally {
      controller.dispose();
    }
  }, 120000);

  liveTest("can create a static html file in a new directory for writable runs", async () => {
    await expect(runWritableHtmlSmoke(3)).resolves.toBeUndefined();
  }, 120000);

  liveTest("interactive launch uses bundled executable path", async () => {
    const runtime = new CodexCliRuntime();
    const launch = runtime.buildInteractiveLaunch({
      cwd: process.cwd(),
      cols: 120,
      rows: 40
    });

    expect(launch.cmd[0]).toContain("codex");
    expect(launch.cmd).toContain("--no-alt-screen");
  });
});

async function runWritableHtmlSmoke(maxAttempts: number) {
  const failures: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data", `codex-live-${crypto.randomUUID()}`);
    mkdirSync(tempRoot, { recursive: true });
    writeFileSync(path.join(tempRoot, "README.md"), "start\n");
    const init = Bun.spawn({
      cmd: ["git", "init"],
      cwd: tempRoot,
      stdout: "ignore",
      stderr: "ignore"
    });
    await init.exited;

    try {
      const runtime = new CodexCliRuntime();
      const result = await runtime.getAdapter().runPrompt({
        kind: "executor",
        cwd: tempRoot,
        modelId: "openai/gpt-5.4",
        prompt:
          "Create a new directory named site and add a static HTML file at site/index.html with a title Test Page and body text Hello. Then reply with only OK.",
        readOnly: false
      });
      const htmlPath = path.join(tempRoot, "site", "index.html");
      const html = await Bun.file(htmlPath).text();

      expect(result.text).toContain("OK");
      expect(html).toContain("Test Page");
      expect(html).toContain("Hello");
      return;
    } catch (error) {
      failures.push(`attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Writable Codex HTML smoke failed after ${maxAttempts} attempts: ${failures.join(" | ")}`);
}
