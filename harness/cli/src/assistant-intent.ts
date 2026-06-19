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
  const assistantActionsMatch = sourcePrompt.match(/^use\s+\/assistant-actions\s+to\s+create\s+(?<body>.+)$/i);
  if (assistantActionsMatch?.groups?.body) {
    return parseCreateBody(assistantActionsMatch.groups.body) ?? parseBareCreateName(assistantActionsMatch.groups.body);
  }

  const buildAssistantMatch = sourcePrompt.match(/^(?:please\s+)?build\s+(?<body>.+)$/i);
  if (buildAssistantMatch?.groups?.body) {
    return parseCreateBody(buildAssistantMatch.groups.body) ?? parseNameBeforeAssistant(buildAssistantMatch.groups.body);
  }

  const createMatch = sourcePrompt.match(/^(?:please\s+)?create\s+(?<body>.+)$/i);
  if (createMatch?.groups?.body) {
    return parseCreateBody(createMatch.groups.body) ?? parseBareCreateName(createMatch.groups.body);
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

  const afterPurpose = assistantMatch.groups.after.trim().match(/^(?:to|for|that|who|which)\s+(?<purpose>.+)$/i);
  if (afterPurpose?.groups?.purpose) {
    const name = normalizeAssistantName(stripScopeWords(assistantMatch.groups.before));
    if (name) {
      return {
        name,
        scope: inferAssistantScope(assistantMatch.groups.before),
        purpose: purpose ?? afterPurpose.groups.purpose.trim()
      };
    }
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

function parseBareCreateName(input: string) {
  const { head, purpose } = splitPurpose(stripArticle(input));
  const normalizedHead = head.replace(/\s+/g, " ").trim();
  if (/\b(folder|file|branch|component|page|route|table|database|migration|test|todo|issue|ticket)\b/i.test(normalizedHead)) {
    return undefined;
  }
  if (looksLikeFileTarget(normalizedHead)) {
    return undefined;
  }
  const name = normalizeAssistantName(normalizedHead.replace(/\b(?:assistant|agent)\b$/i, ""));
  if (!name) {
    return undefined;
  }
  return {
    name,
    scope: inferAssistantScope("project"),
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

function looksLikeFileTarget(input: string) {
  return /(?:^|\s)[\w.-]+\.[a-z0-9]{1,12}(?:\s|$)/i.test(input);
}

function stripScopeWords(input: string) {
  return input
    .trim()
    .replace(/\b(?:new|local|this\s+project|project-scoped|project|global|workspace)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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
