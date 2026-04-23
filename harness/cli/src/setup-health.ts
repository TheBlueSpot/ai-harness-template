import path from "node:path";
import type {
  AgentId,
  AgentRuntimeCapability,
  PreferencesState,
  SetupAction,
  SetupCheck,
  SetupLaunchMode,
  SetupState,
  WorkspaceState
} from "../../shared/protocol";
import { buildToolchainPath, resolveBundledRipgrepPath } from "./agent-runtimes/toolchain";
import { probeGitAvailable, probeInsideWorktree } from "./git-project";

type SetupHealthInput = {
  workspace: WorkspaceState;
  preferences: PreferencesState;
  launchMode?: SetupLaunchMode;
};

export async function buildSetupState(input: SetupHealthInput): Promise<SetupState> {
  const updatedAt = new Date().toISOString();
  const checks: SetupCheck[] = [];
  const activeProject = input.workspace.projects.find((project) => project.id === input.workspace.activeProjectId);
  const hasGit = await probeGitAvailable();
  const ripgrep = await probeRipgrep();
  const piHasProvider = hasAnyPiProvider(input.preferences);
  const usableCliRuntimes = input.preferences.agentRuntimes.filter(isUsableCliRuntime);
  const hasUsableAgent = piHasProvider || usableCliRuntimes.length > 0;

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

  checks.push(
    hasUsableAgent
      ? {
          id: "agent-available",
          title: "Agent available",
          summary: piHasProvider
            ? "Pi can run with a saved provider key."
            : `${usableCliRuntimes[0]?.label ?? "CLI runtime"} can run without a Pi provider key.`,
          status: "ready",
          requiredForFirstTask: true,
          updatedAt
        }
      : {
          id: "agent-available",
          title: "Connect one agent",
          summary: "Add one Pi provider key or install and authenticate Codex CLI or Copilot CLI.",
          status: "action-required",
          requiredForFirstTask: true,
          updatedAt,
          primaryAction: {
            kind: "open-preferences",
            label: "Open preferences"
          },
          secondaryAction: {
            kind: "refresh-runtime-health",
            label: "Refresh runtimes"
          }
        }
  );

  checks.push(buildPiProviderCheck(piHasProvider, updatedAt));
  checks.push(buildRuntimeCheck("codex-cli", input.preferences.agentRuntimes.find((runtime) => runtime.agentId === "codex-cli"), updatedAt));
  checks.push(buildRuntimeCheck("copilot-cli", input.preferences.agentRuntimes.find((runtime) => runtime.agentId === "copilot-cli"), updatedAt));

  if (activeProject && input.preferences.blockChatOnDirtyGitDefault && hasGit && !(await probeInsideWorktree(activeProject.rootPath))) {
    checks.push({
      id: "project-git-status",
      title: "Project is not a git repo",
      summary: "Dirty-git protection needs a git repository before first execution.",
      detail: "Initialize git with a baseline commit, or disable dirty-git protection and continue without that safety check.",
      status: "action-required",
      requiredForFirstTask: true,
      updatedAt,
      primaryAction: {
        kind: "init-git-baseline",
        label: "Init Git"
      },
      secondaryAction: {
        kind: "disable-dirty-git-check",
        label: "Disable check"
      }
    });
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

  checks.push(
    ripgrep.ready
      ? {
          id: "bundled-ripgrep",
          title: "Bundled ripgrep ready",
          summary: "Subagent shell search can use bundled rg.",
          detail: ripgrep.path,
          status: "ready",
          requiredForFirstTask: false,
          updatedAt
        }
      : {
          id: "bundled-ripgrep",
          title: "Bundled ripgrep missing",
          summary: "Install dependencies so subagents can use rg without relying on user PATH.",
          detail: ripgrep.path ?? "Run bun install.",
          status: "warning",
          requiredForFirstTask: false,
          updatedAt,
          primaryAction: {
            kind: "copy-command",
            label: "Copy install command",
            value: "bun install"
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

function buildPiProviderCheck(hasProvider: boolean, updatedAt: string): SetupCheck {
  return hasProvider
    ? {
        id: "provider-auth",
        title: "Pi provider connected",
        summary: "Pi can use at least one saved provider key.",
        status: "ready",
        requiredForFirstTask: false,
        updatedAt
      }
    : {
        id: "provider-auth",
        title: "Pi provider missing",
        summary: "Add an OpenAI or Google API key to enable Pi.",
        detail: "Codex CLI or Copilot CLI can still be enough for first-run readiness.",
        status: "action-required",
        requiredForFirstTask: false,
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
      };
}

function buildRuntimeCheck(agentId: AgentId, runtime: AgentRuntimeCapability | undefined, updatedAt: string): SetupCheck {
  const fallbackLabel = agentId === "codex-cli" ? "Codex CLI" : agentId === "copilot-cli" ? "GitHub Copilot CLI" : "Pi";
  if (!runtime) {
    return {
      id: `agent-runtime-${agentId}`,
      title: `${fallbackLabel} health unknown`,
      summary: "Refresh runtime health before using this runtime.",
      status: "warning",
      requiredForFirstTask: false,
      updatedAt,
      primaryAction: {
        kind: "refresh-runtime-health",
        label: "Refresh runtime health"
      }
    };
  }

  if (agentId === "pi") {
    return {
      id: `agent-runtime-${agentId}`,
      title: "Pi runtime ready",
      summary: "Pi runtime is built into the harness.",
      status: "ready",
      requiredForFirstTask: false,
      updatedAt
    };
  }

  if (!runtime.installed) {
    return {
      id: `agent-runtime-${agentId}`,
      title: `${runtime.label} not installed`,
      summary: runtime.healthMessage ?? `Install ${runtime.label} before first execution.`,
      status: "action-required",
      requiredForFirstTask: false,
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
      id: `agent-runtime-${agentId}`,
      title: `${runtime.label} needs authentication`,
      summary: runtime.healthMessage ?? `Authenticate ${runtime.label} before first execution.`,
      status: "action-required",
      requiredForFirstTask: false,
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
    id: `agent-runtime-${agentId}`,
    title: `${runtime.label} ready`,
    summary: `${runtime.label} is installed and authenticated.`,
    detail: runtime.version ? `Version: ${runtime.version}` : undefined,
    status: "ready",
    requiredForFirstTask: false,
    updatedAt
  };
}

function hasAnyPiProvider(preferences: PreferencesState) {
  return Boolean(
    preferences.hasUsableApiKey ||
      preferences.hasStoredApiKey ||
      preferences.hasUsableOpenAiApiKey ||
      preferences.hasStoredOpenAiApiKey ||
      preferences.hasUsableGoogleApiKey ||
      preferences.hasStoredGoogleApiKey
  );
}

function isUsableCliRuntime(runtime: AgentRuntimeCapability) {
  return runtime.runtimeKind === "cli" && runtime.installed && runtime.authenticated && runtime.supportsProgrammatic;
}

async function probeRipgrep() {
  const bundledPath = resolveBundledRipgrepPath();
  if (!bundledPath) {
    return { ready: false, path: undefined };
  }

  try {
    const process = Bun.spawn({
      cmd: ["rg", "--version"],
      env: {
        ...Bun.env,
        PATH: buildToolchainPath({ basePath: Bun.env.PATH })
      },
      stdout: "ignore",
      stderr: "ignore"
    });
    return { ready: (await process.exited) === 0, path: bundledPath };
  } catch {
    return { ready: false, path: bundledPath };
  }
}
