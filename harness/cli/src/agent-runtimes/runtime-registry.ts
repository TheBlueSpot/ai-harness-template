import type { AgentId, AgentRuntimeCapability } from "../../../shared/protocol";
import type { AgentRuntime } from "./agent-runtime";

export class AgentRuntimeRegistry {
  constructor(private readonly runtimes: AgentRuntime[]) {}

  get(agentId: AgentId) {
    const runtime = this.runtimes.find((entry) => entry.id === agentId);
    if (!runtime) {
      throw new Error(`Unknown agent runtime: ${agentId}`);
    }

    return runtime;
  }

  list() {
    return [...this.runtimes];
  }

  listCapabilities() {
    return this.runtimes.flatMap((runtime) => {
      const capability = runtime.getCapability();
      return capability ? [capability] : [];
    });
  }

  async refreshAll() {
    const capabilities = await Promise.all(this.runtimes.map((runtime) => runtime.refreshCapability()));
    return capabilities.sort((left, right) => left.label.localeCompare(right.label));
  }

  async refresh(agentId: AgentId) {
    return this.get(agentId).refreshCapability();
  }
}
