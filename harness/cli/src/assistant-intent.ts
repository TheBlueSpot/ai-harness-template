export type AssistantChatIntent =
  | {
      kind: "create-ready";
      name: string;
      scope: "project" | "global";
      purpose: string;
      sourcePrompt: string;
    }
  | {
      kind: "create-needs-purpose";
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

const nonNameLeadWords = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "i",
  "i'm",
  "im",
  "i've",
  "ive",
  "me",
  "my",
  "mine",
  "we",
  "we're",
  "were",
  "our",
  "ours",
  "us",
  "you",
  "you're",
  "your",
  "yours",
  "he",
  "she",
  "it",
  "its",
  "they",
  "their",
  "them",
  "there",
  "here",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "can",
  "could",
  "would",
  "should",
  "will",
  "won't",
  "wont",
  "do",
  "does",
  "did",
  "is",
  "are",
  "am",
  "was",
  "have",
  "has",
  "had",
  "please"
]);

export function detectAssistantChatIntent(input: string): AssistantChatIntent {
  const sourcePrompt = input.trim();
  if (!sourcePrompt || sourcePrompt.includes("```")) {
    return { kind: "none" };
  }

  const createIntent = detectCreateIntent(sourcePrompt);
  if (createIntent) {
    return {
      kind: createIntent.purpose ? "create-ready" : "create-needs-purpose",
      name: createIntent.name,
      scope: createIntent.scope,
      ...(createIntent.purpose ? { purpose: createIntent.purpose } : {}),
      sourcePrompt
    } as AssistantChatIntent;
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
  const createMatch = sourcePrompt.match(/^(?:please\s+)?create\s+(?<body>.+)$/i);
  if (createMatch?.groups?.body) {
    return parseCreateBody(createMatch.groups.body);
  }

  const makeMatch = sourcePrompt.match(/^(?:please\s+)?make\s+(?<body>.+)$/i);
  if (makeMatch?.groups?.body) {
    return parseNameBeforeAssistant(makeMatch.groups.body);
  }

  const turnMatch = sourcePrompt.match(/^(?:please\s+)?turn\s+(?<body>.+?)\s+into\s+(?:a\s+|an\s+)?(?<tail>.+)$/i);
  if (turnMatch?.groups?.body && turnMatch.groups.tail) {
    return parseNameBeforeAssistant(`${turnMatch.groups.body} ${turnMatch.groups.tail}`);
  }

  const setupMatch = sourcePrompt.match(/^(?:please\s+)?set\s+up\s+(?<body>.+?)\s+as\s+(?:a\s+|an\s+)?(?<tail>.+)$/i);
  if (setupMatch?.groups?.body && setupMatch.groups.tail) {
    return parseNameBeforeAssistant(`${setupMatch.groups.body} ${setupMatch.groups.tail}`);
  }

  return undefined;
}

function parseCreateBody(input: string) {
  const body = stripArticle(input);
  const { head, purpose } = splitPurpose(body);
  const assistantMatch = head.match(/^(?<before>.*?)\bassistant\b(?<after>.*)$/i);
  if (!assistantMatch?.groups) {
    return undefined;
  }

  const name = normalizeAssistantName(stripNamePrefix(assistantMatch.groups.after));
  if (!name) {
    return undefined;
  }

  return {
    name,
    scope: inferAssistantScope(assistantMatch.groups.before),
    purpose
  };
}

function parseNameBeforeAssistant(input: string) {
  const { head, purpose } = splitPurpose(input);
  const assistantMatch = head.match(/^(?<name>.+?)\s+(?:a\s+|an\s+)?(?<before>(?:(?:new|local|this\s+project|project-scoped|project|global|workspace)\s+)*)assistant\b.*$/i);
  if (!assistantMatch?.groups) {
    return undefined;
  }

  const name = normalizeAssistantName(assistantMatch.groups.name);
  if (!name) {
    return undefined;
  }

  return {
    name,
    scope: inferAssistantScope(assistantMatch.groups.before),
    purpose
  };
}

function splitPurpose(input: string) {
  const match = input.match(/^(?<head>.+?)\s+(?:to|for|that|who|which)\s+(?<purpose>.+)$/i);
  return {
    head: (match?.groups?.head ?? input).trim(),
    purpose: match?.groups?.purpose?.trim()
  };
}

function stripArticle(input: string) {
  return input.trim().replace(/^(?:a|an)\s+/i, "");
}

function stripNamePrefix(input: string) {
  return input.trim().replace(/^(?:named|called)\s+/i, "");
}

function inferAssistantScope(input: string): "project" | "global" {
  const normalized = input.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(global|workspace)\b/.test(normalized)) {
    return "global";
  }
  return "project";
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
  if (!candidate || !isPlausibleAssistantSelector(candidate)) {
    return undefined;
  }

  return candidate;
}

export function isPlausibleAssistantSelector(input: string) {
  const words = input
    .split(/\s+/)
    .map((word) => cleanWord(word).toLowerCase())
    .filter(Boolean);
  return words.length > 0 && !nonNameLeadWords.has(words[0]!);
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
