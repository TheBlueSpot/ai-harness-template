import { createHash } from "node:crypto";
import type { MemorySummary, ModeDefinition, ProjectId, ProviderBrand, WorkspaceRuleSource } from "../../shared/protocol";
import type { SessionStats } from "@mariozechner/pi-coding-agent";
import { stableStringifyJson } from "./prompt-cache-assembly";

export type PromptCacheIdentity = {
  projectId: ProjectId;
  workspaceConfigHash: string;
};

export function buildPromptCacheKey(input: PromptCacheIdentity) {
  const digest = createHash("sha256").update(stableStringifyJson(input)).digest("hex");
  return `harness:v1:${digest}`;
}

export function extractCachedInputTokens(sessionStats: SessionStats | undefined) {
  return sessionStats?.tokens.cacheRead ?? 0;
}

export function buildWorkspaceConfigHash(input: {
  projectId: ProjectId;
  projectRootPath: string;
  providerBrand: ProviderBrand;
  selectedModeId?: string;
  mode?: ModeDefinition;
  ruleSources?: WorkspaceRuleSource[];
  memorySummaries?: MemorySummary[];
  memoryBankEnabledDefault: boolean;
}) {
  const stableInput = {
    projectId: input.projectId,
    projectRootPath: input.projectRootPath,
    providerBrand: input.providerBrand,
    selectedModeId: input.selectedModeId ?? input.mode?.id,
    mode: input.mode
      ? {
          id: input.mode.id,
          label: input.mode.label,
          plannerPrompt: input.mode.plannerPrompt,
          executionPrompt: input.mode.executionPrompt,
          toolPolicy: input.mode.toolPolicy
        }
      : undefined,
    ruleSources: (input.ruleSources ?? []).map((source) => ({
      scope: source.scope,
      label: source.label,
      contentHash: hashText(source.content)
    })),
    memorySummaries: (input.memorySummaries ?? []).map((summary) => ({
      scope: summary.scope,
      label: summary.label,
      contentHash: hashText(summary.content)
    })),
    memoryBankEnabledDefault: input.memoryBankEnabledDefault
  };
  return hashText(stableStringifyJson(stableInput));
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
