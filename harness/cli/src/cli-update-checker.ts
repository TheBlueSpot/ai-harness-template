import { $ } from "bun";
import type { AgentRuntimeCapability, CliUpdateTargetId } from "../../shared/protocol";

const PI_PACKAGE_NAME = "@mariozechner/pi-coding-agent";
const CODEX_PACKAGE_NAME = "@openai/codex";
const CODEX_SDK_PACKAGE_NAME = "@openai/codex-sdk";
const CLAUDE_CODE_PACKAGE_NAME = "@anthropic-ai/claude-code";

export type CliUpdate = {
  agentId: CliUpdateTargetId;
  label: string;
  currentVersion: string;
  latestVersion: string;
  updateCommand: string;
};

export async function checkCliUpdates(agentRuntimes: AgentRuntimeCapability[]): Promise<CliUpdate[]> {
  const installedCliRuntimes = agentRuntimes.filter((runtime) => runtime.runtimeKind === "cli" && runtime.installed);
  const piRuntime = agentRuntimes.find((runtime) => runtime.agentId === "pi" && runtime.installed);
  const updates = await Promise.all([
    ...installedCliRuntimes.map((runtime) => checkRuntimeUpdate(runtime)),
    piRuntime ? checkPiUpdate() : Promise.resolve(undefined),
    checkClaudeUpdate()
  ]);
  return updates.filter((update): update is CliUpdate => Boolean(update));
}

export async function installCliUpdate(agentId: CliUpdateTargetId) {
  switch (agentId) {
    case "pi": {
      assertInstalled(await readInstalledPackageVersion(PI_PACKAGE_NAME), "Pi");
      const result = await $`bun add ${PI_PACKAGE_NAME}@latest`.quiet();
      return formatShellOutput(result.stdout.toString(), result.stderr.toString());
    }
    case "codex-cli": {
      assertInstalled(await readInstalledPackageVersion(CODEX_PACKAGE_NAME), "Codex CLI");
      const result = await $`bun add ${CODEX_PACKAGE_NAME}@latest ${CODEX_SDK_PACKAGE_NAME}@latest`.quiet();
      return formatShellOutput(result.stdout.toString(), result.stderr.toString());
    }
    case "copilot-cli": {
      assertInstalled(parseVersion(await readCommandText(["copilot", "--version"])), "GitHub Copilot CLI");
      const result = await $`gh extension upgrade github/gh-copilot`.quiet();
      return formatShellOutput(result.stdout.toString(), result.stderr.toString());
    }
    case "claude-cli": {
      assertInstalled(parseVersion(await readCommandText(["claude", "--version"])), "Claude Code");
      const result = await $`claude update`.quiet();
      return formatShellOutput(result.stdout.toString(), result.stderr.toString());
    }
    default:
      throw new Error("This runtime is not a CLI runtime with managed updates.");
  }
}

function assertInstalled(version: string | undefined, label: string) {
  if (!version) {
    throw new Error(`${label} is not installed or is not available on PATH.`);
  }
}

async function checkRuntimeUpdate(runtime: AgentRuntimeCapability): Promise<CliUpdate | undefined> {
  switch (runtime.agentId) {
    case "codex-cli":
      return checkCodexUpdate(runtime);
    case "copilot-cli":
      return checkCopilotUpdate(runtime);
    default:
      return undefined;
  }
}

async function checkPiUpdate(): Promise<CliUpdate | undefined> {
  const currentVersion = await readInstalledPackageVersion(PI_PACKAGE_NAME);
  if (!currentVersion) {
    return undefined;
  }

  const latestVersion = await fetchNpmPackageVersion(PI_PACKAGE_NAME);
  if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) {
    return undefined;
  }

  return {
    agentId: "pi",
    label: "Pi",
    currentVersion,
    latestVersion,
    updateCommand: `bun add ${PI_PACKAGE_NAME}@latest`
  };
}

async function checkCodexUpdate(runtime: AgentRuntimeCapability): Promise<CliUpdate | undefined> {
  const currentVersion = parseVersion(runtime.version);
  if (!currentVersion) {
    return undefined;
  }

  const latestVersion = await fetchNpmPackageVersion(CODEX_PACKAGE_NAME);
  if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) {
    return undefined;
  }

  return {
    agentId: runtime.agentId,
    label: runtime.label,
    currentVersion,
    latestVersion,
    updateCommand: `bun add ${CODEX_PACKAGE_NAME}@latest ${CODEX_SDK_PACKAGE_NAME}@latest`
  };
}

async function checkCopilotUpdate(runtime: AgentRuntimeCapability): Promise<CliUpdate | undefined> {
  const currentVersion = parseVersion(runtime.version);
  if (!currentVersion) {
    return undefined;
  }

  const latestVersion = await fetchLatestGitHubReleaseVersion("github", "gh-copilot");
  if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) {
    return undefined;
  }

  return {
    agentId: runtime.agentId,
    label: runtime.label,
    currentVersion,
    latestVersion,
    updateCommand: "gh extension upgrade github/gh-copilot"
  };
}

async function checkClaudeUpdate(): Promise<CliUpdate | undefined> {
  const currentVersion = parseVersion(await readCommandText(["claude", "--version"]));
  if (!currentVersion) {
    return undefined;
  }

  const latestVersion = await fetchNpmPackageVersion(CLAUDE_CODE_PACKAGE_NAME);
  if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) {
    return undefined;
  }

  return {
    agentId: "claude-cli",
    label: "Claude Code",
    currentVersion,
    latestVersion,
    updateCommand: "claude update"
  };
}

async function fetchNpmPackageVersion(packageName: string) {
  try {
    return parseVersion((await $`bun pm view ${packageName} version`.text()).trim());
  } catch {
    return undefined;
  }
}

async function readInstalledPackageVersion(packageName: string) {
  try {
    const packageJsonPath = import.meta.resolve(`${packageName}/package.json`);
    const parsed = await Bun.file(new URL(packageJsonPath)).json();
    return isRecord(parsed) && typeof parsed.version === "string" ? parseVersion(parsed.version) : undefined;
  } catch {
    return undefined;
  }
}

async function readCommandText(cmd: string[]) {
  try {
    const process = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited
    ]);
    if (exitCode !== 0) {
      return undefined;
    }
    return `${stdout}\n${stderr}`.trim();
  } catch {
    return undefined;
  }
}

async function fetchLatestGitHubReleaseVersion(owner: string, repo: string) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ai-harness-template"
      }
    });
    if (!response.ok) {
      return undefined;
    }

    const parsed = (await response.json()) as { tag_name?: unknown };
    return typeof parsed.tag_name === "string" ? parseVersion(parsed.tag_name) : undefined;
  } catch {
    return undefined;
  }
}

function parseVersion(input: string | undefined) {
  return input?.match(/\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?/)?.[0];
}

function compareVersions(left: string, right: string) {
  const leftParts = splitVersion(left);
  const rightParts = splitVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function splitVersion(value: string) {
  return value.split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0) as [number, number, number];
}

function formatShellOutput(stdout: string, stderr: string) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(-4000);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

export const testExports = {
  parseVersion,
  compareVersions,
  splitVersion,
  readInstalledPackageVersion,
  assertInstalled
};
