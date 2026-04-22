import type { AgentRuntimeCapability, ProviderBrand } from "../../../shared/protocol";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { buildCliCapability, probeCliVersion, probeCodexAuth, probeInteractivePipeCompatibility, shouldSkipExpensiveCliProbes } from "./cli-health";
import { CliProcessManager } from "./cli-process-manager";
import { getBundledCodexInstallation, type CodexInstallation } from "./codex-installation";
import { CodexSdkAdapter } from "./codex-sdk-adapter";

const DEFAULT_MODEL_ID = "openai/gpt-5.4";
const CODEX_SUPPORTED_MODEL_IDS = [DEFAULT_MODEL_ID, "openai/gpt-5.4-mini"] as const;

type CodexCliRuntimeOptions = {
  processManager?: CliProcessManager;
  getInstallation?: () => CodexInstallation;
  createAdapter?: (executablePath: string) => PiAgentAdapter;
};

export class CodexCliRuntime implements AgentRuntime {
  readonly id = "codex-cli" as const;
  readonly label = "Codex CLI";

  private readonly processManager: CliProcessManager;
  private readonly getInstallation: () => CodexInstallation;
  private readonly createAdapter: (executablePath: string) => PiAgentAdapter;
  private adapter: PiAgentAdapter | undefined;
  private capability: AgentRuntimeCapability | undefined;

  constructor(options: CodexCliRuntimeOptions = {}) {
    this.processManager = options.processManager ?? new CliProcessManager();
    this.getInstallation = options.getInstallation ?? getBundledCodexInstallation;
    this.createAdapter = options.createAdapter ?? ((executablePath) => new CodexSdkAdapter({ executablePath }));
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
      discoveredModels: getCodexSupportedModelIds(),
      activeModel: DEFAULT_MODEL_ID,
      modelDiscoveryConfidence: "partial",
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

  getDefaultSubagentModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
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
        "workspace-write",
        "-a",
        "on-request",
        ...(input.prompt ? [input.prompt] : [])
      ],
      env: {}
    };
  }
}

export function getCodexSupportedModelIds() {
  return [...CODEX_SUPPORTED_MODEL_IDS];
}

export function isCodexSupportedModelId(modelId: string | undefined) {
  return Boolean(modelId && CODEX_SUPPORTED_MODEL_IDS.includes(modelId as (typeof CODEX_SUPPORTED_MODEL_IDS)[number]));
}

export function resolveCodexModelId(modelId: string | undefined) {
  return isCodexSupportedModelId(modelId) ? modelId : DEFAULT_MODEL_ID;
}

export const testExports = {
  getCodexSupportedModelIds,
  isCodexSupportedModelId,
  resolveCodexModelId
};
