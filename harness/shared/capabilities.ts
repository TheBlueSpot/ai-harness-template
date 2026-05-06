import type { ProviderCapability } from "./protocol";

export const defaultProviderCapabilities: ProviderCapability[] = [
  {
    providerBrand: "gpt",
    label: "GPT",
    defaultPlanningModelId: "openai/gpt-5.4",
    defaultExecutionModelId: "openai/gpt-5.4",
    defaultSubagentModelId: "openai/gpt-5.4-nano",
    models: [
      {
        modelId: "openai/gpt-5.4",
        providerBrand: "gpt",
        label: "GPT-5.4",
        tags: ["tools", "long-context", "expensive"],
        contextWindow: 200000,
        summary: "Best default for planning and implementation quality.",
        supportedReasoningStrengths: ["low", "medium", "high", "extra-high"],
        supportsFastMode: true
      },
      {
        modelId: "openai/gpt-5.4-mini",
        providerBrand: "gpt",
        label: "GPT-5.4 Mini",
        tags: ["tools", "fast"],
        contextWindow: 200000,
        summary: "Faster Codex-compatible GPT worker for bounded execution tasks.",
        supportedReasoningStrengths: ["low", "medium", "high", "extra-high"],
        supportsFastMode: true
      },
      {
        modelId: "openai/gpt-5.4-nano",
        providerBrand: "gpt",
        label: "GPT-5.4 Nano",
        tags: ["tools", "fast"],
        contextWindow: 200000,
        summary: "Cheap and fast worker model for focused subagent tasks.",
        supportedReasoningStrengths: ["low", "medium", "high", "extra-high"],
        supportsFastMode: true
      }
    ]
  },
  {
    providerBrand: "gemini",
    label: "Gemini",
    defaultPlanningModelId: "google/gemini-3-flash-preview",
    defaultExecutionModelId: "google/gemini-2.5-flash",
    defaultSubagentModelId: "google/gemini-2.5-flash-lite",
    models: [
      {
        modelId: "google/gemini-3-flash-preview",
        providerBrand: "gemini",
        label: "Gemini 3 Flash Preview",
        tags: ["tools", "vision", "long-context", "fast"],
        contextWindow: 1000000,
        summary: "Fast planner with large context and vision support.",
        supportedReasoningStrengths: ["low", "medium", "high"],
        supportsFastMode: false
      },
      {
        modelId: "google/gemini-2.5-flash",
        providerBrand: "gemini",
        label: "Gemini 2.5 Flash",
        tags: ["tools", "vision", "long-context", "fast"],
        contextWindow: 1000000,
        summary: "Balanced execution model with multimodal support.",
        supportedReasoningStrengths: ["low", "medium", "high"],
        supportsFastMode: false
      },
      {
        modelId: "google/gemini-2.5-flash-lite",
        providerBrand: "gemini",
        label: "Gemini 2.5 Flash Lite",
        tags: ["tools", "fast"],
        contextWindow: 1000000,
        summary: "Low-cost subagent model for parallel task fan-out.",
        supportedReasoningStrengths: ["low", "medium", "high"],
        supportsFastMode: false
      }
    ]
  },
  {
    providerBrand: "claude",
    label: "Claude",
    defaultPlanningModelId: "anthropic/claude-opus-4-6",
    defaultExecutionModelId: "anthropic/claude-sonnet-4-6",
    defaultSubagentModelId: "anthropic/claude-haiku-4-5",
    models: [
      {
        modelId: "anthropic/claude-opus-4-6",
        providerBrand: "claude",
        label: "Claude Opus 4.6",
        tags: ["tools", "vision", "long-context", "expensive"],
        contextWindow: 1000000,
        summary: "Strong Claude planner for difficult architecture and implementation work.",
        supportedReasoningStrengths: ["low", "medium", "high", "extra-high"],
        supportsFastMode: false
      },
      {
        modelId: "anthropic/claude-sonnet-4-6",
        providerBrand: "claude",
        label: "Claude Sonnet 4.6",
        tags: ["tools", "vision", "long-context"],
        contextWindow: 1000000,
        summary: "Balanced Claude execution model with large context and tool support.",
        supportedReasoningStrengths: ["low", "medium", "high"],
        supportsFastMode: false
      },
      {
        modelId: "anthropic/claude-haiku-4-5",
        providerBrand: "claude",
        label: "Claude Haiku 4.5",
        tags: ["tools", "vision", "fast"],
        contextWindow: 200000,
        summary: "Lower-cost Claude subagent model for focused parallel work.",
        supportedReasoningStrengths: ["low", "medium", "high"],
        supportsFastMode: false
      }
    ]
  }
];
