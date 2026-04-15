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
        summary: "Best default for planning and implementation quality."
      },
      {
        modelId: "openai/gpt-5.4-nano",
        providerBrand: "gpt",
        label: "GPT-5.4 Nano",
        tags: ["tools", "fast"],
        contextWindow: 200000,
        summary: "Cheap and fast worker model for focused subagent tasks."
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
        summary: "Fast planner with large context and vision support."
      },
      {
        modelId: "google/gemini-2.5-flash",
        providerBrand: "gemini",
        label: "Gemini 2.5 Flash",
        tags: ["tools", "vision", "long-context", "fast"],
        contextWindow: 1000000,
        summary: "Balanced execution model with multimodal support."
      },
      {
        modelId: "google/gemini-2.5-flash-lite",
        providerBrand: "gemini",
        label: "Gemini 2.5 Flash Lite",
        tags: ["tools", "fast"],
        contextWindow: 1000000,
        summary: "Low-cost subagent model for parallel task fan-out."
      }
    ]
  }
];
