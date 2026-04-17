import type { AgentRuntimeCapability, ProviderBrand } from "../../../shared/protocol";
import { getDefaultExecutionModelId, getDefaultPlanningModelId, getDefaultSubagentModelId } from "../pi-planner";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { buildCliCapability } from "./cli-health";

export class PiRuntime implements AgentRuntime {
  readonly id = "pi" as const;
  readonly label = "Pi";

  private capability: AgentRuntimeCapability | undefined;

  constructor(private readonly adapter: PiAgentAdapter) {}

  getAdapter() {
    return this.adapter;
  }

  getCapability() {
    return this.capability;
  }

  async refreshCapability() {
    this.capability = buildCliCapability({
      agentId: "pi",
      label: this.label,
      installed: true,
      authenticated: this.adapter.hasApiKey("openai") || this.adapter.hasApiKey("google"),
      supportsInteractive: false,
      interactivePipeCompatible: false,
      supportsPlanning: true,
      supportsReview: true,
      healthMessage:
        this.adapter.hasApiKey("openai") || this.adapter.hasApiKey("google")
          ? undefined
          : "Add OpenAI or Google API key to use Pi runtime.",
      docsUrl: "https://platform.openai.com/docs"
    });
    return this.capability;
  }

  getDefaultPlanningModelId(providerBrand: ProviderBrand) {
    return getDefaultPlanningModelId(providerBrand);
  }

  getDefaultExecutionModelId(providerBrand: ProviderBrand) {
    return getDefaultExecutionModelId(providerBrand);
  }

  getDefaultSubagentModelId(providerBrand: ProviderBrand) {
    return getDefaultSubagentModelId(providerBrand);
  }
}
