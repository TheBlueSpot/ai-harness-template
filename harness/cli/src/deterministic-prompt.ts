import { stableStringifyJson } from "./prompt-cache-assembly";

export type DeterministicPromptSectionKind =
  | "system"
  | "tools"
  | "workspace"
  | "attachments"
  | "frozen-plan"
  | "dynamic";

export type DeterministicPromptSection = {
  kind: DeterministicPromptSectionKind;
  title?: string;
  content?: string | Array<string | undefined | false | null>;
};

const SECTION_ORDER: Record<DeterministicPromptSectionKind, number> = {
  system: 1,
  tools: 2,
  workspace: 3,
  attachments: 4,
  "frozen-plan": 5,
  dynamic: 6
};

const SECTION_TITLES: Record<DeterministicPromptSectionKind, string> = {
  system: "System Persona And Operational Rules",
  tools: "Tool Definitions And Schemas",
  workspace: "Workspace Memory And Instructions",
  attachments: "UploadThing Attachments",
  "frozen-plan": "Frozen Plans And Contracts",
  dynamic: "Recent Thread And Active Query"
};

export function assembleDeterministicPrompt(sections: DeterministicPromptSection[]) {
  return sections
    .map(normalizeSection)
    .filter((section): section is { kind: DeterministicPromptSectionKind; title: string; content: string } => Boolean(section))
    .sort((left, right) => SECTION_ORDER[left.kind] - SECTION_ORDER[right.kind])
    .map((section) => [`# ${section.title}`, section.content].join("\n"))
    .join("\n\n");
}

export function formatDeterministicToolSchemas(tools: Array<{ name: string; schema: unknown }>) {
  return tools
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => `## ${tool.name}\n${stableStringifyJson(tool.schema)}`)
    .join("\n\n");
}

function normalizeSection(section: DeterministicPromptSection) {
  const content = Array.isArray(section.content) ? section.content.filter(Boolean).join("\n") : section.content;
  const normalized = content?.trim();
  if (!normalized) {
    return undefined;
  }

  return {
    kind: section.kind,
    title: section.title ?? SECTION_TITLES[section.kind],
    content: normalized
  };
}
