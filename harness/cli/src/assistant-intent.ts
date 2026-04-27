export type AssistantChatIntent =
  | {
      kind: "create";
      name: string;
      scope: "project" | "global";
      sourcePrompt: string;
    }
  | {
      kind: "ambiguous";
      suggestedName: string;
      sourcePrompt: string;
    }
  | {
      kind: "none";
    };

const assistantWorkVerbs = [
  "start",
  "begin",
  "continue",
  "keep",
  "maintain",
  "maintaining",
  "build",
  "building",
  "run",
  "running",
  "execute",
  "executing",
  "process",
  "processing",
  "work",
  "working"
];

const commonCommandStarts = new Set([
  "add",
  "build",
  "change",
  "create",
  "delete",
  "fix",
  "implement",
  "make",
  "refactor",
  "remove",
  "rename",
  "start",
  "update"
]);

export function detectAssistantChatIntent(input: string): AssistantChatIntent {
  const sourcePrompt = input.trim();
  if (!sourcePrompt || sourcePrompt.includes("```")) {
    return { kind: "none" };
  }

  const createIntent = detectCreateIntent(sourcePrompt);
  if (createIntent) {
    return {
      kind: "create",
      name: createIntent.name,
      scope: createIntent.scope,
      sourcePrompt
    };
  }

  const suggestedName = detectAmbiguousAssistantName(sourcePrompt);
  if (suggestedName) {
    return {
      kind: "ambiguous",
      suggestedName,
      sourcePrompt
    };
  }

  return { kind: "none" };
}

function detectCreateIntent(sourcePrompt: string) {
  const createPatterns = [
    /^(?:please\s+)?create\s+(?:a\s+|an\s+)?(?<scope>project|global)?\s*assistant\s+(?:named|called)\s+(?<name>.+?)(?:\s+(?:to|that|who|which|for)\s+.+)?$/i,
    /^(?:please\s+)?make\s+(?<name>.+?)\s+(?:a\s+|an\s+)?(?<scope>project|global)?\s*assistant(?:\s+.+)?$/i,
    /^(?:please\s+)?turn\s+(?<name>.+?)\s+into\s+(?:a\s+|an\s+)?(?<scope>project|global)?\s*assistant(?:\s+.+)?$/i,
    /^(?:please\s+)?set\s+up\s+(?<name>.+?)\s+as\s+(?:a\s+|an\s+)?(?<scope>project|global)?\s*assistant(?:\s+.+)?$/i
  ];

  for (const pattern of createPatterns) {
    const match = sourcePrompt.match(pattern);
    const rawName = match?.groups?.name;
    const name = rawName ? normalizeAssistantName(rawName) : undefined;
    if (!name) {
      continue;
    }

    const scope: "project" | "global" = match?.groups?.scope?.toLowerCase() === "global" ? "global" : "project";
    return {
      name,
      scope
    };
  }

  return undefined;
}

function detectAmbiguousAssistantName(sourcePrompt: string) {
  const words = sourcePrompt.split(/\s+/);
  if (words.length < 4) {
    return undefined;
  }

  const verbIndex = words.findIndex((word, index) => index > 0 && assistantWorkVerbs.includes(cleanWord(word).toLowerCase()));
  if (verbIndex < 1 || verbIndex > 4) {
    return undefined;
  }

  const firstWord = cleanWord(words[0]).toLowerCase();
  if (commonCommandStarts.has(firstWord)) {
    return undefined;
  }

  const candidate = normalizeAssistantName(words.slice(0, verbIndex).join(" "));
  if (!candidate) {
    return undefined;
  }

  return candidate;
}

function normalizeAssistantName(input: string) {
  const trimmed = input
    .trim()
    .replace(/^["'`]+|["'`.,:;!?]+$/g, "")
    .replace(/\s+/g, " ");

  if (
    !trimmed ||
    trimmed.length > 80 ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.split(/\s+/).length > 5
  ) {
    return undefined;
  }

  return trimmed;
}

function cleanWord(input: string) {
  return input.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
