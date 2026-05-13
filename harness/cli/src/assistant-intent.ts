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
      kind: "none";
    };

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
