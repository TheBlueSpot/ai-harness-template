import type { AgentOption } from "./protocol";

export const defaultAgentCatalog: readonly AgentOption[] = [
  {
    id: "pi",
    label: "Pi",
    description: "OpenAI-backed coding agent with planner-driven subagent routing"
  },
  {
    id: "copilot-cli",
    label: "GitHub Copilot CLI",
    description: "CLI-backed coding runtime for GitHub Copilot planning, execution, and review"
  },
  {
    id: "codex-cli",
    label: "Codex CLI",
    description: "CLI-backed coding runtime for OpenAI Codex planning, execution, review, and live sessions"
  }
] as const;
