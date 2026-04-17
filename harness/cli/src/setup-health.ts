import path from "node:path";
import type {
  AgentRuntimeCapability,
  PreferencesState,
  SetupAction,
  SetupCheck,
  SetupLaunchMode,
  SetupState,
  WorkspaceState
} from "../../shared/protocol";

type SetupHealthInput = {
  workspace: WorkspaceState;
  preferences: PreferencesState;
  launchMode?: SetupLaunchMode;
};

export async function buildSetupState(input: SetupHealthInput): Promise<SetupState> {
  const updatedAt = new Date().toISOString();
  const checks: SetupCheck[] = [];
  const activeProject = input.workspace.projects.find((project) => project.id === input.workspace.activeProjectId);
  const selectedAgentId = activeProject?.session.selectedAgentId ?? "pi";
  const selectedRuntime = input.preferences.agentRuntimes.find((runtime) => runtime.agentId === selectedAgentId);
  const hasGit = await probeGit();

  checks.push(
    activeProject
      ? {
          id: "project-selected",
          title: "Project selected",
          summary: `${activeProject.name} is ready for the next task.`,
          detail: activeProject.rootPath,
          status: "ready",
          requiredForFirstTask: true,
          updatedAt
        }
      : {
          id: "project-selected",
          title: "Open a project",
          summary: "Pick a workspace root before sending the first task.",
          detail: "Harness keeps history, threads, and execution context per project root.",
          status: "action-required",
          requiredForFirstTask: true,
          updatedAt,
          primaryAction: {
            kind: "open-project-switcher",
            label: "Open project"
          }
        }
  );

  checks.push(buildRuntimeCheck(selectedAgentId, selectedRuntime, updatedAt));

  if (selectedAgentId === "pi") {
    const needsProvider = activeProject
      ? !hasProviderForBrand(input.preferences, input.preferences.providerBrand)
      : !input.preferences.hasUsableApiKey;
    checks.push(
      needsProvider
        ? {
            id: "provider-auth",
            title: "Connect model provider",
            summary: `Add a ${input.preferences.providerBrand === "gemini" ? "Gemini" : "GPT"} API key for Pi.`,
            detail: "Pi uses the matching provider key from workspace preferences.",
            status: "action-required",
            requiredForFirstTask: true,
            updatedAt,
            primaryAction: {
              kind: "open-preferences",
              label: "Open preferences"
            },
            secondaryAction: {
              kind: "start-tutorial",
              label: "Show tutorial",
              value: "connect-provider-runtime"
            }
          }
        : {
            id: "provider-auth",
            title: "Model provider connected",
            summary: `Pi can use the current ${input.preferences.providerBrand === "gemini" ? "Gemini" : "GPT"} provider.`,
            status: "ready",
            requiredForFirstTask: true,
            updatedAt
          }
    );
  }

  checks.push(
    hasGit
      ? {
          id: "git-available",
          title: "Git available",
          summary: "Git is installed and available for worktree and preflight checks.",
          status: "ready",
          requiredForFirstTask: true,
          updatedAt
        }
      : {
          id: "git-available",
          title: "Install Git",
          summary: "Git is required before first execution.",
          detail: "Worktree safety, dirty checks, and repo-aware execution depend on a working Git install.",
          status: "action-required",
          requiredForFirstTask: true,
          updatedAt,
          primaryAction: {
            kind: "open-url",
            label: "Git downloads",
            value: "https://git-scm.com/downloads"
          }
        }
  );

  checks.push({
    id: "browser-tools",
    title: "Browser tools",
    summary: "Typed browser setup and repair flow is not shipped yet.",
    detail: "This slice shows browser capability honestly instead of pretending the tool is ready.",
    status: "unsupported",
    requiredForFirstTask: false,
    updatedAt
  });
  checks.push({
    id: "mcp-servers",
    title: "MCP servers",
    summary: "Typed MCP setup and repair flow is not shipped yet.",
    detail: "Connector health and install flows stay as a follow-up roadmap slice.",
    status: "unsupported",
    requiredForFirstTask: false,
    updatedAt
  });

  const requiredChecks = checks.filter((check) => check.requiredForFirstTask);
  return {
    launchMode: input.launchMode ?? detectSetupLaunchMode(),
    updatedAt,
    readyRequiredCount: requiredChecks.filter((check) => check.status === "ready").length,
    totalRequiredCount: requiredChecks.length,
    checks
  };
}

export function detectSetupLaunchMode(): SetupLaunchMode {
  const executableName = path.basename(process.execPath).toLowerCase();
  return executableName.startsWith("bun") ? "source" : "portable-launcher";
}

export function formatSetupDoctorReport(setup: SetupState) {
  const lines = [
    `Launch mode: ${setup.launchMode}`,
    `Required checks: ${setup.readyRequiredCount}/${setup.totalRequiredCount} ready`,
    ""
  ];

  for (const check of setup.checks) {
    const prefix =
      check.status === "ready"
        ? "[ok]"
        : check.status === "warning"
        ? "[warn]"
        : check.status === "unsupported"
        ? "[na]"
        : "[fix]";
    lines.push(`${prefix} ${check.title}: ${check.summary}`);
    if (check.detail) {
      lines.push(`    ${check.detail}`);
    }
    for (const action of [check.primaryAction, check.secondaryAction].filter(Boolean) as SetupAction[]) {
      lines.push(`    action: ${action.label}${action.value ? ` | ${action.value}` : ""}`);
    }
  }

  return lines.join("\n");
}

function buildRuntimeCheck(updatedAgentId: string, runtime: AgentRuntimeCapability | undefined, updatedAt: string): SetupCheck {
  if (!runtime) {
    return {
      id: "agent-runtime",
      title: "Runtime health unknown",
      summary: "Refresh runtime health before first execution.",
      status: "warning",
      requiredForFirstTask: true,
      updatedAt,
      primaryAction: {
        kind: "refresh-runtime-health",
        label: "Refresh runtime health"
      }
    };
  }

  if (updatedAgentId === "pi") {
    return {
      id: "agent-runtime",
      title: "Pi runtime ready",
      summary: "Pi runtime is built into the harness.",
      status: "ready",
      requiredForFirstTask: true,
      updatedAt
    };
  }

  if (!runtime.installed) {
    return {
      id: "agent-runtime",
      title: `${runtime.label} not installed`,
      summary: runtime.healthMessage ?? `Install ${runtime.label} before first execution.`,
      status: "action-required",
      requiredForFirstTask: true,
      updatedAt,
      primaryAction: runtime.installCommand
        ? {
            kind: "copy-command",
            label: "Copy install command",
            value: runtime.installCommand
          }
        : undefined,
      secondaryAction: runtime.docsUrl
        ? {
            kind: "open-url",
            label: "Open docs",
            value: runtime.docsUrl
          }
        : {
            kind: "refresh-runtime-health",
            label: "Refresh runtime health"
          }
    };
  }

  if (!runtime.authenticated) {
    return {
      id: "agent-runtime",
      title: `${runtime.label} needs authentication`,
      summary: runtime.healthMessage ?? `Authenticate ${runtime.label} before first execution.`,
      status: "action-required",
      requiredForFirstTask: true,
      updatedAt,
      primaryAction: runtime.authCommand
        ? {
            kind: "copy-command",
            label: "Copy login command",
            value: runtime.authCommand
          }
        : {
            kind: "refresh-runtime-health",
            label: "Refresh runtime health"
          },
      secondaryAction: runtime.docsUrl
        ? {
            kind: "open-url",
            label: "Open docs",
            value: runtime.docsUrl
          }
        : undefined
    };
  }

  return {
    id: "agent-runtime",
    title: `${runtime.label} ready`,
    summary: `${runtime.label} is installed and authenticated.`,
    detail: runtime.version ? `Version: ${runtime.version}` : undefined,
    status: "ready",
    requiredForFirstTask: true,
    updatedAt
  };
}

function hasProviderForBrand(preferences: PreferencesState, providerBrand: PreferencesState["providerBrand"]) {
  return providerBrand === "gemini" ? preferences.hasUsableGoogleApiKey : preferences.hasUsableOpenAiApiKey;
}

async function probeGit() {
  try {
    const process = Bun.spawn({
      cmd: ["git", "--version"],
      stdout: "ignore",
      stderr: "ignore"
    });
    return (await process.exited) === 0;
  } catch {
    return false;
  }
}
