import type { AgentRuntimeCapability, ProviderBrand } from "../../../shared/protocol";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { buildCliCapability, probeCliVersion, probeCodexAuth, probeInteractivePipeCompatibility, shouldSkipExpensiveCliProbes } from "./cli-health";
import { CliProcessManager } from "./cli-process-manager";
import { getBundledCodexInstallation, type CodexInstallation } from "./codex-installation";
import { resolveCodexSandboxMode } from "./codex-sandbox-policy";
import { CodexSdkAdapter } from "./codex-sdk-adapter";
import { resolveSubagentModelId } from "../subagent-defaults";

const DEFAULT_MODEL_ID = "openai/gpt-5.5";
const FALLBACK_CODEX_SUPPORTED_MODEL_IDS = [
  DEFAULT_MODEL_ID,
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.3-codex-spark",
  "openai/gpt-5.2"
] as const;
const MODEL_DISCOVERY_TOTAL_TIMEOUT_MS = 10_000;
const MODEL_DISCOVERY_IDLE_TIMEOUT_MS = 5_000;

type CodexCliRuntimeOptions = {
  processManager?: CliProcessManager;
  getInstallation?: () => CodexInstallation;
  createAdapter?: (executablePath: string) => PiAgentAdapter;
  platform?: NodeJS.Platform;
};

export class CodexCliRuntime implements AgentRuntime {
  readonly id = "codex-cli" as const;
  readonly label = "Codex CLI";

  private readonly processManager: CliProcessManager;
  private readonly getInstallation: () => CodexInstallation;
  private readonly createAdapter: (executablePath: string) => PiAgentAdapter;
  private readonly platform: NodeJS.Platform;
  private adapter: PiAgentAdapter | undefined;
  private capability: AgentRuntimeCapability | undefined;

  constructor(options: CodexCliRuntimeOptions = {}) {
    this.processManager = options.processManager ?? new CliProcessManager();
    this.getInstallation = options.getInstallation ?? getBundledCodexInstallation;
    this.createAdapter = options.createAdapter ?? ((executablePath) => new CodexSdkAdapter({ executablePath }));
    this.platform = options.platform ?? process.platform;
  }

  getAdapter() {
    if (!this.adapter) {
      const installation = this.getInstallation();
      if (!installation.installed || !installation.executablePath) {
        throw new Error(installation.healthMessage);
      }
      this.adapter = this.createAdapter(installation.executablePath);
    }

    return this.adapter;
  }

  getCapability() {
    return this.capability;
  }

  async refreshCapability() {
    const installation = this.getInstallation();
    if (!installation.installed || !installation.executablePath) {
      this.capability = buildCliCapability({
        agentId: this.id,
        label: this.label,
        installed: false,
        authenticated: false,
        supportsInteractive: false,
        interactivePipeCompatible: false,
        supportsPlanning: true,
        supportsReview: true,
        supportsReasoningStrengthControl: true,
        supportsFastModeControl: true,
        healthMessage: installation.healthMessage,
        installCommand: installation.installCommand,
        authCommand: installation.authCommand,
        docsUrl: installation.docsUrl
      });
      return this.capability;
    }

    const version = await probeCliVersion(this.processManager, installation.executablePath);
    if (!version) {
      this.capability = buildCliCapability({
        agentId: this.id,
        label: this.label,
        installed: false,
        authenticated: false,
        supportsInteractive: false,
        interactivePipeCompatible: false,
        supportsPlanning: true,
        supportsReview: true,
        supportsReasoningStrengthControl: true,
        supportsFastModeControl: true,
        healthMessage: installation.healthMessage,
        installCommand: installation.installCommand,
        authCommand: installation.authCommand,
        docsUrl: installation.docsUrl
      });
      return this.capability;
    }

    const skipExpensiveProbes = shouldSkipExpensiveCliProbes();
    const [authenticated, interactivePipeCompatible] = await Promise.all([
      skipExpensiveProbes ? Promise.resolve(true) : probeCodexAuth(this.processManager, installation.executablePath),
      probeInteractivePipeCompatibility(this.processManager, {
        executable: installation.executablePath,
        helpArgs: ["--help"]
      })
    ]);
    const modelDiscovery = await discoverCodexModels(this.processManager, installation.executablePath);

    this.capability = buildCliCapability({
      agentId: this.id,
      label: this.label,
      installed: true,
      authenticated,
      version,
      supportsInteractive: interactivePipeCompatible,
      interactivePipeCompatible,
      supportsPlanning: true,
      supportsReview: true,
      supportsReasoningStrengthControl: true,
      supportsFastModeControl: true,
      discoveredModels: modelDiscovery.discoveredModels,
      activeModel: DEFAULT_MODEL_ID,
      modelDiscoveryConfidence: modelDiscovery.modelDiscoveryConfidence,
      healthMessage: authenticated ? undefined : "Run `bunx codex login` before using this runtime.",
      installCommand: installation.installCommand,
      authCommand: installation.authCommand,
      docsUrl: installation.docsUrl
    });

    return this.capability;
  }

  getDefaultPlanningModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  getDefaultExecutionModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  getDefaultSubagentModelId(providerBrand: ProviderBrand, executionModelId?: string) {
    return resolveSubagentModelId({
      agentId: this.id,
      providerBrand,
      executionModelId
    });
  }

  buildInteractiveLaunch(input: { cwd: string; cols: number; rows: number; prompt?: string }) {
    const installation = this.getInstallation();
    if (!installation.installed || !installation.executablePath) {
      throw new Error(installation.healthMessage);
    }

    return {
      cmd: [
        installation.executablePath,
        "--no-alt-screen",
        "-C",
        input.cwd,
        "-s",
        resolveCodexSandboxMode({
          platform: this.platform
        }),
        "-a",
        "on-request",
        ...(input.prompt ? [input.prompt] : [])
      ],
      env: {}
    };
  }
}

export function getCodexSupportedModelIds() {
  return [...FALLBACK_CODEX_SUPPORTED_MODEL_IDS];
}

export function isCodexSupportedModelId(modelId: string | undefined) {
  return Boolean(modelId && FALLBACK_CODEX_SUPPORTED_MODEL_IDS.includes(modelId as (typeof FALLBACK_CODEX_SUPPORTED_MODEL_IDS)[number]));
}

export function resolveCodexModelId(modelId: string | undefined) {
  return isCodexSupportedModelId(modelId) ? modelId : DEFAULT_MODEL_ID;
}

async function discoverCodexModels(processManager: CliProcessManager, executablePath: string) {
  try {
    const result = await processManager.runNonInteractive({
      cmd: [executablePath, "debug", "models"],
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      idleTimeoutMs: MODEL_DISCOVERY_IDLE_TIMEOUT_MS,
      totalTimeoutMs: MODEL_DISCOVERY_TOTAL_TIMEOUT_MS
    });

    if (result.hangDetected || result.timedOut || result.exitCode !== 0) {
      return {
        discoveredModels: getCodexSupportedModelIds(),
        modelDiscoveryConfidence: "partial" as const
      };
    }

    const discoveredModels = parseCodexModelCatalog(result.stdout);
    if (discoveredModels.length === 0) {
      return {
        discoveredModels: getCodexSupportedModelIds(),
        modelDiscoveryConfidence: "partial" as const
      };
    }

    return {
      discoveredModels,
      modelDiscoveryConfidence: "exact" as const
    };
  } catch {
    return {
      discoveredModels: getCodexSupportedModelIds(),
      modelDiscoveryConfidence: "partial" as const
    };
  }
}

function parseCodexModelCatalog(input: string) {
  try {
    const parsed = JSON.parse(input) as { models?: Array<{ slug?: unknown; visibility?: unknown }> };
    const slugs =
      parsed.models
        ?.filter((model) => model.visibility === "list")
        .map((model) => (typeof model.slug === "string" ? model.slug.trim() : ""))
        .filter(Boolean) ?? [];
    return [...new Set(slugs.map((slug) => (slug.includes("/") ? slug : `openai/${slug}`)))];
  } catch {
    return [];
  }
}

export const testExports = {
  getCodexSupportedModelIds,
  isCodexSupportedModelId,
  resolveCodexModelId,
  discoverCodexModels,
  parseCodexModelCatalog
};
