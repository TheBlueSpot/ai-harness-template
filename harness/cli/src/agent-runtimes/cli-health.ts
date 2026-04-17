import { Buffer } from "node:buffer";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentId, AgentRuntimeCapability, ModelDiscoveryConfidence } from "../../../shared/protocol";
import { CliProcessManager } from "./cli-process-manager";

const HEALTH_TOTAL_TIMEOUT_MS = 10_000;
const HEALTH_IDLE_TIMEOUT_MS = 5_000;

type ProbeResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
};

export async function probeCliVersion(processManager: CliProcessManager, executable: string) {
  const result = await runProbe(processManager, {
    cmd: [executable, "--version"],
    cwd: process.cwd()
  });

  if (!result.ok) {
    return undefined;
  }

  const version = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/).find(Boolean);
  return version?.trim();
}

export async function probeInteractivePipeCompatibility(
  processManager: CliProcessManager,
  input: {
    executable: string;
    helpArgs: string[];
    cwd?: string;
  }
) {
  const result = await runProbe(processManager, {
    cmd: [input.executable, ...input.helpArgs],
    cwd: input.cwd ?? process.cwd()
  });

  if (!result.ok) {
    return false;
  }

  const stdout = result.stdout.trim();
  if (process.platform === "win32" && stdout.length === 0 && result.stderr.trim().length === 0) {
    return false;
  }

  return stdout.length > 0 || result.stderr.trim().length > 0;
}

export async function probeCopilotAuth(processManager: CliProcessManager) {
  const result = await runProbe(processManager, {
    cmd: ["copilot", "-p", "Reply with OK.", "-s", "--no-ask-user"],
    cwd: process.cwd()
  });

  if (result.ok && result.stdout.trim().length > 0) {
    return true;
  }

  return !containsAuthFailure(result.stdout, result.stderr);
}

export async function probeCodexAuth(processManager: CliProcessManager) {
  const result = await runProbe(processManager, {
    cmd: [
      "codex",
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      process.cwd(),
      "Reply with exact text OK and nothing else."
    ],
    cwd: process.cwd()
  });

  if (!result.ok) {
    return !containsAuthFailure(result.stdout, result.stderr);
  }

  return extractCodexFinalText(result.stdout).trim().length > 0;
}

export async function discoverCopilotModels(processManager: CliProcessManager) {
  const config = await readCopilotConfig();
  const helpResult = await runProbe(processManager, {
    cmd: ["copilot", "help"],
    cwd: process.cwd()
  });
  const helpModels = parseCopilotModelChoices(helpResult.stdout);

  let invalidProbeModels: string[] = [];
  if (helpModels.length === 0) {
    const invalidResult = await runProbe(processManager, {
      cmd: ["copilot", "--model", "discovery_probe", "-p", "Reply with OK.", "-s", "--no-ask-user"],
      cwd: process.cwd()
    });
    invalidProbeModels = parseCopilotModelChoices(`${invalidResult.stdout}\n${invalidResult.stderr}`);
  }

  const discoveredModels = uniqueStrings([...(helpModels ?? []), ...invalidProbeModels]);
  const activeModel = config.model;
  const modelDiscoveryConfidence: ModelDiscoveryConfidence =
    activeModel && discoveredModels.length > 0 ? "exact" : activeModel || discoveredModels.length > 0 ? "partial" : "unknown";

  return {
    activeModel,
    discoveredModels,
    modelDiscoveryConfidence,
    configFound: config.found
  };
}

export function buildCliCapability(input: {
  agentId: AgentId;
  label: string;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  healthMessage?: string;
  supportsInteractive: boolean;
  interactivePipeCompatible: boolean;
  supportsPlanning: boolean;
  supportsReview: boolean;
  discoveredModels?: string[];
  activeModel?: string;
  modelDiscoveryConfidence?: ModelDiscoveryConfidence;
  installCommand?: string;
  authCommand?: string;
  docsUrl?: string;
}): AgentRuntimeCapability {
  return {
    agentId: input.agentId,
    label: input.label,
    runtimeKind: input.agentId === "pi" ? "sdk" : "cli",
    installed: input.installed,
    authenticated: input.authenticated,
    interactivePipeCompatible: input.interactivePipeCompatible,
    supportsInteractive: input.supportsInteractive,
    supportsProgrammatic: true,
    supportsPlanning: input.supportsPlanning,
    supportsReview: input.supportsReview,
    version: input.version,
    healthMessage: input.healthMessage,
    installCommand: input.installCommand,
    authCommand: input.authCommand,
    docsUrl: input.docsUrl,
    discoveredModels: input.discoveredModels ?? [],
    activeModel: input.activeModel,
    modelDiscoveryConfidence: input.modelDiscoveryConfidence ?? "unknown"
  };
}

export function extractCodexFinalText(stdout: string) {
  const messages: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as { type?: string; item?: { type?: string; text?: string } };
      if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item.text) {
        messages.push(parsed.item.text);
      }
    } catch {
      continue;
    }
  }

  return messages.join("\n\n").trim();
}

export function parseCopilotModelChoices(input: string) {
  const match = input.match(/--model[^\n]*?(?:choices|Possible values?)[:\s]+([^\n]+)/i);
  if (!match?.[1]) {
    return [];
  }

  return uniqueStrings(
    match[1]
      .split(/[,|]/)
      .map((value) => value.replace(/[`"'()[\]]/g, "").trim())
      .filter(Boolean)
  );
}

function containsAuthFailure(stdout: string, stderr: string) {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return ["login", "authenticate", "not logged", "not signed in", "auth", "token"].some((token) =>
    combined.includes(token)
  );
}

async function runProbe(
  processManager: CliProcessManager,
  input: {
    cmd: string[];
    cwd: string;
  }
): Promise<ProbeResult> {
  try {
    const result = await processManager.runNonInteractive({
      cmd: input.cmd,
      cwd: input.cwd,
      cols: 120,
      rows: 40,
      idleTimeoutMs: HEALTH_IDLE_TIMEOUT_MS,
      totalTimeoutMs: HEALTH_TOTAL_TIMEOUT_MS
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      ok: !result.hangDetected && !result.timedOut && result.exitCode === 0
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      stdout: "",
      stderr: detail,
      exitCode: -1,
      ok: false
    };
  }
}

async function readCopilotConfig() {
  const configRoots = uniqueStrings([
    Bun.env.COPILOT_HOME ? path.join(Bun.env.COPILOT_HOME, ".copilot") : undefined,
    Bun.env.COPILOT_HOME,
    path.join(homedir(), ".copilot")
  ]);

  const filenames = ["config.json", "config.yml", "config.yaml"];
  for (const root of configRoots) {
    for (const filename of filenames) {
      const filePath = path.join(root, filename);
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        continue;
      }

      const text = await file.text();
      const parsed = parseCopilotConfig(text, filename);
      if (parsed.model) {
        return {
          found: true,
          model: parsed.model
        };
      }
    }
  }

  return {
    found: false,
    model: undefined
  };
}

function parseCopilotConfig(text: string, filename: string) {
  try {
    const model = filename.endsWith(".json")
      ? (() => {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          return typeof parsed.model === "string" ? parsed.model : undefined;
        })()
      : (text.match(/^\s*model\s*:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() ?? undefined);
    return { model };
  } catch {
    return { model: undefined };
  }
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

export function createSecureToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
}

export function shouldSkipExpensiveCliProbes() {
  return Bun.env.NODE_ENV === "test";
}
