import { defaultProviderCapabilities } from "../../shared/capabilities";
import type { AgentId, ComposerReasoningStrength, ProviderBrand } from "../../shared/protocol";

type RankedModelFamily = {
  family: string;
  costRank: number;
};

type ParsedModelId = {
  providerPrefix?: string;
  bareModelId: string;
};

const GPT_COST_RANK: Record<string, number> = {
  base: 0,
  mini: 1,
  nano: 2
};

const CLAUDE_COST_RANK: Record<string, number> = {
  opus: 0,
  sonnet: 1,
  haiku: 2
};

const GEMINI_COST_RANK: Record<string, number> = {
  pro: 0,
  flash: 1,
  "flash-lite": 2
};

export function resolveSubagentModelId(input: {
  agentId?: AgentId;
  providerBrand: ProviderBrand;
  executionModelId?: string;
}) {
  const executionModelId = input.executionModelId?.trim();
  const availableModelIds = getAvailableModelIds(input.agentId, input.providerBrand);
  const matchedAvailableModelId =
    executionModelId && availableModelIds.length > 0
      ? pickLowestCostModelInFamily(executionModelId, availableModelIds)
      : undefined;
  if (matchedAvailableModelId) {
    return matchedAvailableModelId;
  }

  const heuristicModelId = executionModelId ? buildHeuristicLowestCostModelId(executionModelId, input.agentId) : undefined;
  if (heuristicModelId) {
    return heuristicModelId;
  }

  return executionModelId ?? getProviderDefaultSubagentModelId(input.providerBrand);
}

export function resolveSubagentReasoningStrength(reasoningStrength?: ComposerReasoningStrength): ComposerReasoningStrength {
  return reasoningStrength ?? "low";
}

function getAvailableModelIds(agentId: AgentId | undefined, providerBrand: ProviderBrand) {
  if (agentId === "codex-cli") {
    return ["openai/gpt-5.4", "openai/gpt-5.4-mini"];
  }

  if (agentId === "pi" || !agentId) {
    return (
      defaultProviderCapabilities.find((capability) => capability.providerBrand === providerBrand)?.models.map(
        (model) => model.modelId
      ) ?? []
    );
  }

  return [];
}

function getProviderDefaultSubagentModelId(providerBrand: ProviderBrand) {
  return (
    defaultProviderCapabilities.find((capability) => capability.providerBrand === providerBrand)?.defaultSubagentModelId ??
    "openai/gpt-5.4-nano"
  );
}

function pickLowestCostModelInFamily(executionModelId: string, availableModelIds: string[]) {
  const executionFamily = classifyModelFamily(splitModelId(executionModelId).bareModelId);
  if (!executionFamily) {
    return undefined;
  }

  let bestMatch: { modelId: string; costRank: number } | undefined;
  for (const modelId of availableModelIds) {
    const candidateFamily = classifyModelFamily(splitModelId(modelId).bareModelId);
    if (!candidateFamily || candidateFamily.family !== executionFamily.family) {
      continue;
    }

    if (!bestMatch || candidateFamily.costRank > bestMatch.costRank) {
      bestMatch = {
        modelId,
        costRank: candidateFamily.costRank
      };
    }
  }

  return bestMatch?.modelId;
}

function buildHeuristicLowestCostModelId(modelId: string, agentId: AgentId | undefined) {
  const parsed = splitModelId(modelId);
  const gptMatch = parsed.bareModelId.match(/^(gpt-[\d.]+)(?:-(mini|nano))?$/);
  if (gptMatch) {
    const cheapestVariant = agentId === "pi" ? "nano" : "mini";
    return joinModelId(parsed.providerPrefix, `${gptMatch[1]}-${cheapestVariant}`);
  }

  const claudeMatch = parsed.bareModelId.match(/^(claude-[\d.]+)-(opus|sonnet|haiku)$/);
  if (claudeMatch) {
    return joinModelId(parsed.providerPrefix, `${claudeMatch[1]}-haiku`);
  }

  const geminiMatch = parsed.bareModelId.match(/^(gemini-[\d.]+)-(pro|flash|flash-lite)(?:-preview)?$/);
  if (geminiMatch) {
    return joinModelId(parsed.providerPrefix, `${geminiMatch[1]}-flash-lite`);
  }

  return undefined;
}

function classifyModelFamily(bareModelId: string): RankedModelFamily | undefined {
  const gptMatch = bareModelId.match(/^(gpt-[\d.]+)(?:-(mini|nano))?$/);
  if (gptMatch) {
    return {
      family: `gpt:${gptMatch[1]}`,
      costRank: GPT_COST_RANK[gptMatch[2] ?? "base"] ?? 0
    };
  }

  const claudeMatch = bareModelId.match(/^(claude-[\d.]+)-(opus|sonnet|haiku)$/);
  if (claudeMatch) {
    return {
      family: `claude:${claudeMatch[1]}`,
      costRank: CLAUDE_COST_RANK[claudeMatch[2]] ?? 0
    };
  }

  const geminiMatch = bareModelId.match(/^(gemini-[\d.]+)-(pro|flash|flash-lite)(?:-preview)?$/);
  if (geminiMatch) {
    return {
      family: `gemini:${geminiMatch[1]}`,
      costRank: GEMINI_COST_RANK[geminiMatch[2]] ?? 0
    };
  }

  return undefined;
}

function splitModelId(modelId: string): ParsedModelId {
  if (!modelId.includes("/")) {
    return {
      bareModelId: modelId
    };
  }

  const [providerPrefix, bareModelId] = modelId.split("/", 2);
  return {
    providerPrefix,
    bareModelId
  };
}

function joinModelId(providerPrefix: string | undefined, bareModelId: string) {
  return providerPrefix ? `${providerPrefix}/${bareModelId}` : bareModelId;
}
