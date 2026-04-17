import type { AgentId, AgentRuntimeCapability, ProviderBrand } from "../../../shared/protocol";
import type { PiAgentAdapter } from "../pi-agent-adapter";

export type InteractiveCliLaunch = {
  cmd: string[];
  env?: Record<string, string | undefined>;
};

export interface AgentRuntime {
  readonly id: AgentId;
  readonly label: string;
  getAdapter(): PiAgentAdapter;
  getCapability(): AgentRuntimeCapability | undefined;
  refreshCapability(): Promise<AgentRuntimeCapability>;
  getDefaultPlanningModelId(providerBrand: ProviderBrand): string;
  getDefaultExecutionModelId(providerBrand: ProviderBrand): string;
  getDefaultSubagentModelId(providerBrand: ProviderBrand): string;
  buildInteractiveLaunch?(input: {
    cwd: string;
    cols: number;
    rows: number;
    prompt?: string;
  }): InteractiveCliLaunch;
}
