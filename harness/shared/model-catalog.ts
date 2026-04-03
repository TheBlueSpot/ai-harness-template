import type { ModelOption } from "./protocol";

export const defaultModelCatalog: readonly ModelOption[] = [
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "General-purpose OpenAI model for the harness MVP"
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    description: "Lower-latency OpenAI model for lightweight tasks"
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    description: "Smallest OpenAI model option in the starter catalog"
  }
] as const;

