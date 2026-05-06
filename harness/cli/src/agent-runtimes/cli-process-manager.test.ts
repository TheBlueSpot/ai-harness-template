import { describe, expect, test } from "bun:test";
import { CliProcessManager, CLI_PROCESS_OUTPUT_CAP_BYTES, testExports } from "./cli-process-manager";

describe("CliProcessManager", () => {
  test("caps noninteractive stdout and reports limit", async () => {
    const manager = new CliProcessManager();
    const result = await manager.runNonInteractive({
      cmd: [process.execPath, "-e", `process.stdout.write("x".repeat(${CLI_PROCESS_OUTPUT_CAP_BYTES + 1024}))`],
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      idleTimeoutMs: 0,
      totalTimeoutMs: 30_000
    });

    expect(result.outputLimitExceeded).toBe(true);
    expect(result.outputLimitMessage).toContain("stdout output exceeded cap");
    expect(new TextEncoder().encode(result.stdout).byteLength).toBeLessThanOrEqual(CLI_PROCESS_OUTPUT_CAP_BYTES);
  });

  test("builds Windows tree-kill command for orphan-prone shells", () => {
    expect(testExports.buildWindowsKillTreeCommand(1234)).toEqual(["taskkill", "/PID", "1234", "/T", "/F"]);
  });
});
