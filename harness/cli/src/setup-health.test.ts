import { expect, test } from "bun:test";
import { buildSetupState, formatSetupDoctorReport } from "./setup-health";
import type { PreferencesState, WorkspaceState } from "../../shared/protocol";

const baseWorkspace = {
  projects: [],
  activeProjectId: undefined
} as WorkspaceState;

const basePreferences: PreferencesState = {
  hasUsableApiKey: false,
  hasStoredApiKey: false,
  hasUsableOpenAiApiKey: false,
  hasStoredOpenAiApiKey: false,
  hasUsableGoogleApiKey: false,
  hasStoredGoogleApiKey: false,
  hasUsableAnthropicApiKey: false,
  hasStoredAnthropicApiKey: false,
  providerBrand: "gpt",
  debugEnabledDefault: false,
  tracePanelDefaultOpen: false,
  subagentWorktreeStrategyDefault: "same-worktree",
  blockChatOnDirtyGitDefault: false,
  dirtyGitChangeLimitDefault: 20,
  autoCompactContextThresholdPercentDefault: 80,
  planExecutionModeDefault: "countdown",
  planExecutionDelaySecondsDefault: 3,
  correctnessIterationModeDefault: "ask-before-iterate",
  backgroundJobApprovalPolicyDefault: "ask-risky",
  memoryBankEnabledDefault: true,
  memoryBankRecordRunsDefault: true,
  attachmentsEnabled: false,
  capabilities: [],
  agentRuntimes: []
};

test("buildSetupState surfaces Chromium install guidance instead of unsupported browser placeholder", async () => {
  const setup = await buildSetupState({
    workspace: baseWorkspace,
    preferences: basePreferences,
    probes: {
      hasGit: true,
      ripgrep: {
        ready: true,
        path: "C:\\rg\\rg.exe"
      },
      browserTools: {
        ready: false,
        playwrightPackageInstalled: true,
        chromiumInstalled: false,
        cachePath: "C:\\Users\\me\\AppData\\Local\\ms-playwright",
        installDependenciesCommand: "bun.cmd install",
        installChromiumCommand: "bun.cmd x playwright install chromium"
      }
    }
  });

  const browserCheck = setup.checks.find((check) => check.id === "browser-tools");
  expect(browserCheck).toBeDefined();
  expect(browserCheck?.status).toBe("warning");
  expect(browserCheck?.title).toBe("Install browser Chromium");
  expect(browserCheck?.primaryAction?.value).toBe("bun.cmd x playwright install chromium");
  expect(browserCheck?.secondaryAction?.kind).toBe("refresh-runtime-health");

  const report = formatSetupDoctorReport(setup);
  expect(report).toContain("[warn] Install browser Chromium");
  expect(report).toContain("action: Copy Chromium install | bun.cmd x playwright install chromium");
});
