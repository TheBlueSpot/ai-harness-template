export type CacheableUserBlockKind = "workspace-memory" | "uploadthing-attachment" | "frozen-plan";

export type CacheableUserBlock = {
  kind: CacheableUserBlockKind;
  title: string;
  text: string;
};

export function stableCloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCloneJson(entry)) as T;
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort((left, right) => left.localeCompare(right))) {
      output[key] = stableCloneJson(input[key]);
    }
    return output as T;
  }

  return value;
}

export function stableStringifyJson(value: unknown) {
  return JSON.stringify(stableCloneJson(value));
}

export function formatCacheableUserBlocks(blocks: CacheableUserBlock[]) {
  return blocks
    .map((block) => [`## ${block.title}`, `Kind: ${block.kind}`, "", block.text.trim()].join("\n"))
    .join("\n\n");
}
