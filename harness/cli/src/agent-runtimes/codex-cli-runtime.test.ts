import { describe, expect, test } from "bun:test";
import { CliProcessManager, type CliProcessExecutionResult } from "./cli-process-manager";
import { CodexCliRuntime, testExports } from "./codex-cli-runtime";

class FakeCliProcessManager extends CliProcessManager {
  readonly calls: Array<string[]> = [];

  constructor(private readonly result: CliProcessExecutionResult | CliProcessExecutionResult[]) {
    super();
  }

  override async runNonInteractive(options: {
    cmd: string[];
    cwd: string;
    cols: number;
    rows: number;
    env?: Record<string, string | undefined>;
    idleTimeoutMs: number;
    totalTimeoutMs: number;
    abortSignal?: AbortSignal;
    onStdout?: (chunk: Uint8Array) => void;
    onStderr?: (chunk: Uint8Array) => void;
  }): Promise<CliProcessExecutionResult> {
    this.calls.push(options.cmd);
    return Array.isArray(this.result) ? (this.result.shift() ?? this.result[this.result.length - 1]!) : this.result;
  }
}

describe("codex cli runtime", () => {
  test("reports missing bundled install with bun install guidance", async () => {
    const runtime = new CodexCliRuntime({
      getInstallation: () => ({
        installed: false,
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: "Run `bun install` to install bundled Codex runtime dependencies."
      })
    });

    const capability = await runtime.refreshCapability();
    expect(capability.installed).toBe(false);
    expect(capability.installCommand).toBe("bun install");
    expect(capability.healthMessage).toContain("bun install");
  });

  test("probes bundled executable path instead of global codex", async () => {
    const processManager = new FakeCliProcessManager({
      stdout: "codex-cli 0.122.0\n",
      stderr: "",
      exitCode: 0,
      hangDetected: false,
      timedOut: false
    });
    const runtime = new CodexCliRuntime({
      processManager,
      getInstallation: () => ({
        installed: true,
        executablePath: "C:\\repo\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe",
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: ""
      })
    });

    const capability = await runtime.refreshCapability();
    expect(capability.installed).toBe(true);
    expect(processManager.calls[0]?.[0]).toContain("codex.exe");
    expect(processManager.calls[1]?.[0]).toContain("codex.exe");
    expect(capability.installCommand).toBe("bun install");
    expect(capability.authCommand).toBe("bunx codex login");
  });

  test("uses bundled executable path for interactive launch", () => {
    const runtime = new CodexCliRuntime({
      platform: "win32",
      getInstallation: () => ({
        installed: true,
        executablePath: "C:\\codex\\codex.exe",
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: ""
      })
    });

    const launch = runtime.buildInteractiveLaunch({
      cwd: "C:\\repo",
      cols: 120,
      rows: 40,
      prompt: "Inspect repo"
    });

    expect(launch.cmd.slice(0, 7)).toEqual([
      "C:\\codex\\codex.exe",
      "--no-alt-screen",
      "-C",
      "C:\\repo",
      "-s",
      "danger-full-access",
      "-a"
    ]);
    expect(launch.cmd).toContain("Inspect repo");
  });

  test("publishes codex-supported model list", () => {
    expect(testExports.getCodexSupportedModelIds()).toContain("openai/gpt-5.5");
    expect(testExports.isCodexSupportedModelId("openai/gpt-5.5")).toBe(true);
    expect(testExports.isCodexSupportedModelId("openai/gpt-5.4-nano")).toBe(false);
    expect(testExports.resolveCodexModelId("openai/gpt-5.4-nano")).toBe("openai/gpt-5.5");
  });

  test("discovers visible codex models from cli debug catalog", async () => {
    const processManager = new FakeCliProcessManager({
      stdout: JSON.stringify({
        models: [
          { slug: "gpt-5.3-codex", visibility: "list" },
          { slug: "gpt-5.1", visibility: "hide" },
          { slug: "gpt-5.4-mini", visibility: "list" },
          { slug: "gpt-5.4-mini", visibility: "list" }
        ]
      }),
      stderr: "",
      exitCode: 0,
      hangDetected: false,
      timedOut: false
    });

    await expect(testExports.discoverCodexModels(processManager, "codex")).resolves.toEqual({
      discoveredModels: ["openai/gpt-5.3-codex", "openai/gpt-5.4-mini"],
      modelDiscoveryConfidence: "exact"
    });
    expect(processManager.calls[0]).toEqual(["codex", "debug", "models"]);
  });

  test("falls back to baked codex models when debug catalog is unavailable", async () => {
    const processManager = new FakeCliProcessManager({
      stdout: "not json",
      stderr: "",
      exitCode: 0,
      hangDetected: false,
      timedOut: false
    });

    await expect(testExports.discoverCodexModels(processManager, "codex")).resolves.toEqual({
      discoveredModels: [
        "openai/gpt-5.5",
        "openai/gpt-5.4",
        "openai/gpt-5.4-mini",
        "openai/gpt-5.3-codex",
        "openai/gpt-5.3-codex-spark",
        "openai/gpt-5.2"
      ],
      modelDiscoveryConfidence: "partial"
    });
  });

  test("reports exact discovered codex models in runtime capability", async () => {
    const processManager = new FakeCliProcessManager([
      {
        stdout: "codex-cli 0.122.0\n",
        stderr: "",
        exitCode: 0,
        hangDetected: false,
        timedOut: false
      },
      {
        stdout: "Codex CLI help\n",
        stderr: "",
        exitCode: 0,
        hangDetected: false,
        timedOut: false
      },
      {
        stdout: JSON.stringify({
          models: [
            { slug: "gpt-5.4", visibility: "list" },
            { slug: "gpt-5.3-codex-spark", visibility: "list" }
          ]
        }),
        stderr: "",
        exitCode: 0,
        hangDetected: false,
        timedOut: false
      }
    ]);
    const runtime = new CodexCliRuntime({
      processManager,
      getInstallation: () => ({
        installed: true,
        executablePath: "C:\\codex\\codex.exe",
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: ""
      })
    });

    const capability = await runtime.refreshCapability();
    expect(capability.discoveredModels).toEqual(["openai/gpt-5.4", "openai/gpt-5.3-codex-spark"]);
    expect(capability.modelDiscoveryConfidence).toBe("exact");
  });

  test("defaults subagents to gpt mini for gpt-5.4 family", () => {
    const runtime = new CodexCliRuntime();
    expect(runtime.getDefaultSubagentModelId("gpt", "openai/gpt-5.4")).toBe("openai/gpt-5.4-mini");
  });
});
