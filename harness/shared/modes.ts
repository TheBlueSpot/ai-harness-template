import type { ModeDefinition, ModeId } from "./protocol";

export const DEFAULT_MODE_ID: ModeId = "implement";

export const builtinModes: ModeDefinition[] = [
  {
    id: "ask",
    scope: "builtin",
    label: "Ask",
    description: "Bias toward explanation, analysis, and lightweight low-impact help.",
    plannerPrompt: "Prefer explanation, code reading, and minimal edits unless the user clearly asks for implementation.",
    executionPrompt: "Favor analysis, concise answers, and low-impact changes. Explain tradeoffs clearly.",
    toolPolicy: "read-heavy",
    executionAccess: "workspace-write",
    planExecutionModeDefault: "immediate",
    correctnessIterationModeDefault: "ask-before-iterate",
    updatedAt: "builtin"
  },
  {
    id: "plan",
    scope: "builtin",
    label: "Plan",
    description: "Bias toward stronger planning, scoping, and explicit execution gates.",
    plannerPrompt: "Spend more effort on scope, risks, contracts, and verification. Ask questions when uncertainty matters.",
    executionPrompt: "Keep execution tightly aligned to approved plan and call out assumptions before broad changes.",
    toolPolicy: "read-heavy",
    executionAccess: "workspace-write",
    planExecutionModeDefault: "approve",
    correctnessIterationModeDefault: "ask-before-iterate",
    updatedAt: "builtin"
  },
  {
    id: "implement",
    scope: "builtin",
    label: "Implement",
    description: "Default coding mode for making changes, verifying, and shipping work.",
    plannerPrompt: "Bias toward implementation, verification, and concrete contracts. Use subagents when path ownership is clean.",
    executionPrompt: "Implement requested changes efficiently, verify important behavior, and summarize real outcomes only.",
    toolPolicy: "full-access",
    executionAccess: "workspace-write",
    planExecutionModeDefault: "immediate",
    subagentWorktreeStrategyDefault: "same-worktree",
    correctnessIterationModeDefault: "ask-before-iterate",
    updatedAt: "builtin"
  },
  {
    id: "debug",
    scope: "builtin",
    label: "Debug",
    description: "Bias toward reproduction, root-cause isolation, and targeted fixes.",
    plannerPrompt: "Prioritize reproduction steps, root-cause hypotheses, and smallest safe fix first.",
    executionPrompt: "Prove or disprove root cause, then apply narrow fix and verify failing path explicitly.",
    toolPolicy: "full-access",
    executionAccess: "workspace-write",
    planExecutionModeDefault: "immediate",
    correctnessIterationModeDefault: "auto-once",
    updatedAt: "builtin"
  },
  {
    id: "review",
    scope: "builtin",
    label: "Review",
    description: "Bias toward findings-first review and risk analysis over broad code edits.",
    plannerPrompt: "Default to review mindset: identify bugs, regressions, missing tests, and weak assumptions before edits.",
    executionPrompt: "Return findings first, ordered by severity. Do not make broad edits unless the user explicitly asks.",
    toolPolicy: "review-only",
    executionAccess: "read-only",
    planExecutionModeDefault: "immediate",
    correctnessIterationModeDefault: "ask-before-iterate",
    updatedAt: "builtin"
  }
];

export function resolveModeExecutionAccess(
  mode: Pick<ModeDefinition, "toolPolicy"> & { executionAccess?: ModeDefinition["executionAccess"] } | undefined
) {
  if (!mode) {
    return "workspace-write" as const;
  }

  if (mode.executionAccess) {
    return mode.executionAccess;
  }

  return mode.toolPolicy === "read-heavy" || mode.toolPolicy === "review-only" ? "read-only" : "workspace-write";
}

export function modeUsesReadOnlyExecution(
  mode: Pick<ModeDefinition, "toolPolicy"> & { executionAccess?: ModeDefinition["executionAccess"] } | undefined
) {
  return resolveModeExecutionAccess(mode) === "read-only";
}

export function resolveModeCatalog(workspaceModes: ModeDefinition[] = [], projectModes: ModeDefinition[] = []) {
  const merged = new Map<ModeId, ModeDefinition>();
  for (const mode of builtinModes) {
    merged.set(mode.id, mode);
  }
  for (const mode of workspaceModes) {
    merged.set(mode.id, mode);
  }
  for (const mode of projectModes) {
    merged.set(mode.id, mode);
  }
  return [...merged.values()];
}

export function resolveModeById(modeId: string | undefined, workspaceModes: ModeDefinition[] = [], projectModes: ModeDefinition[] = []) {
  const catalog = resolveModeCatalog(workspaceModes, projectModes);
  return catalog.find((mode) => mode.id === modeId) ?? catalog.find((mode) => mode.id === DEFAULT_MODE_ID) ?? catalog[0];
}
