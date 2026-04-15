import type { AgentOption } from "./protocol";

export const defaultAgentCatalog: readonly AgentOption[] = [
  {
    id: "pi",
    label: "Pi",
    description: "OpenAI-backed coding agent with planner-driven subagent routing"
  }
] as const;
