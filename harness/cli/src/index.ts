import path from "node:path";
import { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { CopilotCliRuntime } from "./agent-runtimes/copilot-cli-runtime";
import { CodexCliRuntime } from "./agent-runtimes/codex-cli-runtime";
import { launchHarnessServerWithRecovery } from "./launch-harness";
import { PiSdkAgentAdapter } from "./pi-agent-adapter";
import { PiRuntime } from "./agent-runtimes/pi-runtime";
import { buildSetupState, detectSetupLaunchMode, formatSetupDoctorReport } from "./setup-health";
import { WorkspaceRepository } from "./workspace-repository";

const rawPort = Bun.env.HARNESS_PORT?.trim();
const configuredPort = rawPort ? Number(rawPort) : Number.NaN;
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;
const serverOnly = process.argv.includes("--server-only");
const doctorOnly = process.argv.includes("--doctor");
const forceOpen = process.argv.includes("--open");
const disableOpen = process.argv.includes("--no-open");
const launchMode = detectSetupLaunchMode();

if (launchMode === "portable-launcher") {
  process.chdir(path.dirname(process.execPath));
}

if (doctorOnly) {
  await runDoctor();
  process.exit(0);
}

await launchHarnessServerWithRecovery({
  port,
  serverOnly,
  openBrowser: forceOpen || (!serverOnly && !disableOpen),
  launchMode,
  allowPortFallback: !rawPort
});

async function runDoctor() {
  const repository = new WorkspaceRepository(Bun.env.HARNESS_DB_PATH);
  const adapter = new PiSdkAgentAdapter();
  const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
  const storedGoogleApiKey = repository.getStoredGoogleApiKey();

  if (storedOpenAiApiKey) {
    adapter.setApiKey("openai", storedOpenAiApiKey);
  }

  if (storedGoogleApiKey) {
    adapter.setApiKey("google", storedGoogleApiKey);
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
      hasUsableApiKey: adapter.hasApiKey("openai") || adapter.hasApiKey("google"),
      hasStoredApiKey: Boolean(storedOpenAiApiKey || storedGoogleApiKey),
      hasUsableOpenAiApiKey: adapter.hasApiKey("openai"),
      hasStoredOpenAiApiKey: Boolean(storedOpenAiApiKey),
      hasUsableGoogleApiKey: adapter.hasApiKey("google"),
      hasStoredGoogleApiKey: Boolean(storedGoogleApiKey),
      providerBrand: repository.getProviderBrand(),
      debugEnabledDefault: repository.getDebugEnabledDefault(),
      tracePanelDefaultOpen: repository.getTracePanelDefaultOpen(),
      subagentWorktreeStrategyDefault: repository.getSubagentWorktreeStrategyDefault(),
      blockChatOnDirtyGitDefault: repository.getBlockChatOnDirtyGitDefault(),
      dirtyGitChangeLimitDefault: repository.getDirtyGitChangeLimitDefault(),
      autoCompactContextThresholdPercentDefault: repository.getAutoCompactContextThresholdPercentDefault(),
      planExecutionModeDefault: repository.getPlanExecutionModeDefault(),
      planExecutionDelaySecondsDefault: repository.getPlanExecutionDelaySecondsDefault(),
      correctnessIterationModeDefault: repository.getCorrectnessIterationModeDefault(),
      backgroundJobApprovalPolicyDefault: repository.getBackgroundJobApprovalPolicyDefault(),
      memoryBankEnabledDefault: repository.getMemoryBankEnabledDefault(),
      attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
      capabilities: [],
      agentRuntimes: runtimeRegistry.listCapabilities()
    },
    launchMode
  });

  console.log(formatSetupDoctorReport(setup));
  if (setup.readyRequiredCount !== setup.totalRequiredCount) {
    process.exit(1);
  }
}
