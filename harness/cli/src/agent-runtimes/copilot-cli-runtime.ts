import type { AgentRuntimeCapability, ProviderBrand } from "../../../shared/protocol";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { CliAgentAdapter } from "./cli-agent-adapter";
import {
  buildCliCapability,
  discoverCopilotModels,
  probeCliVersion,
  probeCopilotAuth,
  probeInteractivePipeCompatibility,
  shouldSkipExpensiveCliProbes
} from "./cli-health";
import { CliProcessManager } from "./cli-process-manager";

const DEFAULT_MODEL_ID = "openai/gpt-5.4";

export class CopilotCliRuntime implements AgentRuntime {
  readonly id = "copilot-cli" as const;
  readonly label = "GitHub Copilot CLI";

  private readonly processManager = new CliProcessManager();
  private readonly adapter = new CliAgentAdapter({
    label: this.label,
    buildCommand: ({ request, prompt }) => buildCopilotProgrammaticCommand(request, prompt)
  });
  private capability: AgentRuntimeCapability | undefined;

  getAdapter() {
    return this.adapter;
  }

  getCapability() {
    return this.capability;
  }

  async refreshCapability() {
    const version = await probeCliVersion(this.processManager, "copilot");
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
        healthMessage: "Install standalone `copilot` CLI to enable this runtime.",
        installCommand: "winget install GitHub.cli && gh extension install github/gh-copilot",
        docsUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli"
      });
      return this.capability;
    }

    const skipExpensiveProbes = shouldSkipExpensiveCliProbes();
    const [authenticated, interactivePipeCompatible, discovery] = await Promise.all([
      skipExpensiveProbes ? Promise.resolve(false) : probeCopilotAuth(this.processManager),
      probeInteractivePipeCompatibility(this.processManager, {
        executable: "copilot",
        helpArgs: ["help"]
      }),
      discoverCopilotModels(this.processManager)
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
      healthMessage: authenticated ? undefined : "Authenticate Copilot CLI before using this runtime.",
      installCommand: "winget install GitHub.cli && gh extension install github/gh-copilot",
      authCommand: "gh auth login",
      docsUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli",
      discoveredModels: discovery.discoveredModels,
      activeModel: discovery.activeModel,
      modelDiscoveryConfidence: discovery.modelDiscoveryConfidence
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
    return {
      cmd: ["copilot", ...(input.prompt ? ["-i", input.prompt] : [])],
      env: {}
    };
  }
}

function buildCopilotProgrammaticCommand(request: PiAgentPromptRequest, prompt: string) {
  const cmd = ["copilot", "-p", prompt, "-s", "--no-ask-user"];
  const modelName = toCliModelName(request.modelId);
  if (modelName) {
    cmd.push("--model", modelName);
  }
  if (request.kind === "planner") {
    cmd.push("--plan");
  }

  return {
    cmd,
    cwd: request.cwd,
    parser: {
      onStdoutChunk(chunkText: string, emitDelta: (delta: string) => void) {
        emitDelta(chunkText);
      },
      getText(stdout: string) {
        return stdout.trim();
      }
    }
  };
}

function toCliModelName(modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  return modelId.includes("/") ? modelId.split("/", 2)[1] : modelId;
}
