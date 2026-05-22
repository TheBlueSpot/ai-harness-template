import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { WorkspaceRuleSource } from "../../shared/protocol";

export function loadAgentsMdRuleSource(templateRoot: string = process.cwd()): WorkspaceRuleSource | undefined {
  const agentsPath = path.join(templateRoot, "agents.md");
  if (!existsSync(agentsPath)) {
    return undefined;
  }

  const stats = statSync(agentsPath);
  if (!stats.isFile()) {
    return undefined;
  }

  const content = readFileSync(agentsPath, "utf8").trim();
  if (!content) {
    return undefined;
  }

  return {
    id: "workspace-agents-md",
    scope: "workspace",
    label: "agents.md",
    content: content.slice(0, 32000),
    updatedAt: stats.mtime.toISOString()
  };
}

export function withAgentsMdRuleSource(ruleSources: WorkspaceRuleSource[], templateRoot?: string) {
  const agentsRule = loadAgentsMdRuleSource(templateRoot);
  return agentsRule ? [agentsRule, ...ruleSources] : ruleSources;
}
