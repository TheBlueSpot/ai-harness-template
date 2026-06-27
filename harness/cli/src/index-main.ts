import path from "node:path";
import { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { CopilotCliRuntime } from "./agent-runtimes/copilot-cli-runtime";
import { CodexCliRuntime } from "./agent-runtimes/codex-cli-runtime";
import { launchHarnessServerWithRecovery } from "./launch-harness";
import { PiSdkAgentAdapter } from "./pi-agent-adapter";
import { PiRuntime } from "./agent-runtimes/pi-runtime";
import { buildSetupState, detectSetupLaunchMode, formatSetupDoctorReport } from "./setup-health";
import { createStartupTelemetrySession } from "./startup-telemetry";
import { WorkspaceRepository } from "./workspace-repository";
import { CliUsageError, parseCliOptions } from "./cli-options";
import { ensureDependencyHealth } from "./dependency-health";
import { deleteDoctorDistFolder } from "./doctor-cleanup";
import { syncBundledSkillsToGlobalRoot } from "./global-skills";

const CLI_HELP = `Usage: pi-harness [--server-only] [--open|--no-open] [--doctor [--json]] [--help]

Options:
  --help         Print this help.
  --server-only Start websocket/backend server without opening browser.
  --open        Open browser after startup.
  --no-open     Do not open browser after startup.
  --doctor      Print setup health and exit.
  --json        With --doctor, print machine-readable setup health.`;

export async function main() {
  const options = parseCliOptions(process.argv.slice(2), {
    flags: ["--help", "--server-only", "--doctor", "--json", "--open", "--no-open"],
    conflicts: [["--open", "--no-open"]]
  });
  if (options.flags.has("--help")) {
    console.log(CLI_HELP);
    process.exit(0);
  }
  if (options.flags.has("--json") && !options.flags.has("--doctor")) {
    throw new CliUsageError("--json requires --doctor");
  }

  const rawPort = Bun.env.HARNESS_PORT?.trim();
  const configuredPort = rawPort ? Number(rawPort) : Number.NaN;
  const port = Number.isFinite(configuredPort) ? configuredPort : 8787;
  const serverOnly = options.flags.has("--server-only");
  const doctorOnly = options.flags.has("--doctor");
  const forceOpen = options.flags.has("--open");
  const disableOpen = options.flags.has("--no-open");
  const launchMode = detectSetupLaunchMode();
  const STARTUP_TELEMETRY_ENABLED = process.env.NODE_ENV !== "production";

  if (launchMode === "portable-launcher") {
    process.chdir(path.dirname(process.execPath));
  }
  syncBundledSkillsToGlobalRoot();

  if (doctorOnly) {
    const setup = await runDoctor({ json: options.flags.has("--json") });
    process.exit(setup.readyRequiredCount === setup.totalRequiredCount ? 0 : 1);
  }

  const startupTelemetry = STARTUP_TELEMETRY_ENABLED ? createStartupTelemetrySession({ serverOnly }) : undefined;
  startupTelemetry?.sessionStart("startup session created", {
    launchMode,
    port,
    serverOnly
  });

  try {
    await launchHarnessServerWithRecovery({
      port,
      serverOnly,
      openBrowser: forceOpen || (!serverOnly && !disableOpen),
      launchMode,
      allowPortFallback: !rawPort,
      startupTelemetry
    });
  } catch (error) {
    startupTelemetry?.failed(`Harness startup failed: ${describeError(error)}`, {
      launchMode,
      port,
      serverOnly
    });
    throw error;
  } finally {
    startupTelemetry?.dispose();
  }
}

async function runDoctor(options: { json?: boolean } = {}) {
  const cleanup = await deleteDoctorDistFolder();
  if (!cleanup.deleted) {
    const message = `Skipped doctor dist cleanup because ${cleanup.rootPath} does not look like the harness root.`;
    if (options.json) {
      console.error(message);
    } else {
      console.log(message);
    }
  }
  await ensureDependencyHealth({
    log: (message) => (options.json ? console.error(message) : console.log(message))
  });

  const launchMode = detectSetupLaunchMode();
  const repository = new WorkspaceRepository(Bun.env.HARNESS_DB_PATH);
  const adapter = new PiSdkAgentAdapter();
  const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
  const storedGoogleApiKey = repository.getStoredGoogleApiKey();
  const storedAnthropicApiKey = repository.getStoredAnthropicApiKey();

  if (storedOpenAiApiKey) {
    adapter.setApiKey("openai", storedOpenAiApiKey);
  }

  if (storedGoogleApiKey) {
    adapter.setApiKey("google", storedGoogleApiKey);
  }

  if (storedAnthropicApiKey) {
    adapter.setApiKey("anthropic", storedAnthropicApiKey);
  }

  const runtimeRegistry = new AgentRuntimeRegistry([
    new PiRuntime(adapter),
    new CopilotCliRuntime(),
    new CodexCliRuntime()
  ]);
  await runtimeRegistry.refreshAll();

  const setup = await buildSetupState({
    workspace: repository.loadWorkspace(),
    preferences: {
      hasUsableApiKey: adapter.hasApiKey("openai") || adapter.hasApiKey("google") || adapter.hasApiKey("anthropic"),
      hasStoredApiKey: Boolean(storedOpenAiApiKey || storedGoogleApiKey || storedAnthropicApiKey),
      hasUsableOpenAiApiKey: adapter.hasApiKey("openai"),
      hasStoredOpenAiApiKey: Boolean(storedOpenAiApiKey),
      hasUsableGoogleApiKey: adapter.hasApiKey("google"),
      hasStoredGoogleApiKey: Boolean(storedGoogleApiKey),
      hasUsableAnthropicApiKey: adapter.hasApiKey("anthropic"),
      hasStoredAnthropicApiKey: Boolean(storedAnthropicApiKey),
      providerBrand: repository.getProviderBrand(),
      debugEnabledDefault: repository.getDebugEnabledDefault(),
      tracePanelDefaultOpen: repository.getTracePanelDefaultOpen(),
      subagentWorktreeStrategyDefault: repository.getSubagentWorktreeStrategyDefault(),
      blockChatOnDirtyGitDefault: repository.getBlockChatOnDirtyGitDefault(),
      dirtyGitChangeLimitDefault: repository.getDirtyGitChangeLimitDefault(),
      autoCompactContextThresholdPercentDefault: repository.getAutoCompactContextThresholdPercentDefault(),
      planExecutionModeDefault: repository.getPlanExecutionModeDefault(),
      planExecutionDelaySecondsDefault: repository.getPlanExecutionDelaySecondsDefault(),
      singleAgentModelPreferenceDefault: repository.getSingleAgentModelPreferenceDefault(),
      subagentModelPreferenceDefault: repository.getSubagentModelPreferenceDefault(),
      correctnessIterationModeDefault: repository.getCorrectnessIterationModeDefault(),
      backgroundJobApprovalPolicyDefault: repository.getBackgroundJobApprovalPolicyDefault(),
      assistantAutoApproveNonBlockingQuestionsDefault: repository.getAssistantAutoApproveNonBlockingQuestionsDefault(),
      maxBackgroundJobsDefault: repository.getMaxBackgroundJobsDefault(),
      memoryBankEnabledDefault: repository.getMemoryBankEnabledDefault(),
      memoryBankRecordRunsDefault: repository.getMemoryBankRecordRunsDefault(),
      checkCliUpdatesDefault: repository.getCheckCliUpdatesDefault(),
      attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
      capabilities: [],
      agentRuntimes: runtimeRegistry.listCapabilities()
    },
    launchMode
  });

  if (options.json) {
    console.log(
      JSON.stringify({
        version: 1,
        launchMode,
        ready: setup.readyRequiredCount === setup.totalRequiredCount,
        readyRequiredCount: setup.readyRequiredCount,
        totalRequiredCount: setup.totalRequiredCount,
        checks: setup.checks
      })
    );
  } else {
    console.log(formatSetupDoctorReport(setup));
  }

  return setup;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
