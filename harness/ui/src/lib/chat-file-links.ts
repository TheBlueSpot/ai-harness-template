export type ChatFileTarget = {
  path: string;
  line?: number;
  column?: number;
};

export type ChatFileLinkContext = {
  rootPath?: string;
  filePaths?: readonly string[];
};

export type ChatFileReference = {
  index: number;
  length: number;
  text: string;
  target: ChatFileTarget;
};

const pathReferencePattern = /@?(?:(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|\/|[A-Za-z0-9_.-]+[\\/])(?:[^\s"'<>`|{}[\]:]+[\\/]?)+)(?::\d+(?::\d+)?)?/g;

export function resolveChatFileTarget(reference: string | undefined, context: ChatFileLinkContext = {}): ChatFileTarget | undefined {
  const parsed = parseChatFileReference(reference);
  if (!parsed) {
    return undefined;
  }

  const rootPath = context.rootPath ? normalizePath(context.rootPath) : undefined;
  const knownFiles = buildKnownFileMap(context.filePaths);
  let normalizedPath = normalizePath(parsed.path);

  if (/^\/[A-Za-z]:\//.test(normalizedPath)) {
    normalizedPath = normalizedPath.slice(1);
  }

  if (isAbsolutePath(normalizedPath)) {
    if (!rootPath || !isInsidePath(normalizedPath, rootPath)) {
      return undefined;
    }
    normalizedPath = normalizedPath.slice(rootPath.length).replace(/^\/+/, "");
  }

  normalizedPath = normalizedPath.replace(/^\.\//, "");
  const knownPath = knownFiles.get(normalizedPath.toLowerCase());
  if (!knownPath && !looksLikeOpenablePath(normalizedPath)) {
    return undefined;
  }

  return {
    path: knownPath ?? normalizedPath,
    line: parsed.line,
    column: parsed.column
  };
}

export function findChatFileReferences(text: string, context: ChatFileLinkContext = {}): ChatFileReference[] {
  const references: ChatFileReference[] = [];
  for (const match of text.matchAll(pathReferencePattern)) {
    const raw = match[0];
    const trimmed = trimTrailingReferencePunctuation(raw);
    const target = resolveChatFileTarget(trimmed, context);
    if (!target) {
      continue;
    }
    references.push({
      index: match.index ?? 0,
      length: trimmed.length,
      text: trimmed,
      target
    });
  }
  return references;
}

export function findChatFileReferenceAtPosition(text: string, position: number, context: ChatFileLinkContext = {}) {
  return findChatFileReferences(text, context).find(
    (reference) => position >= reference.index && position <= reference.index + reference.length
  );
}

function parseChatFileReference(reference: string | undefined) {
  let value = cleanupChatFileReference(reference);
  if (!value || value.startsWith("#")) {
    return undefined;
  }

  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(new URL(value).pathname).replace(/^\/([A-Za-z]:\/)/, "$1");
    } catch {
      return undefined;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) {
    return undefined;
  }

  const locationMatch = value.match(/:(\d+)(?::(\d+))?$/);
  const line = locationMatch ? Number(locationMatch[1]) : undefined;
  const column = locationMatch?.[2] ? Number(locationMatch[2]) : undefined;
  const path = locationMatch ? value.slice(0, locationMatch.index) : value;
  if (!path.trim()) {
    return undefined;
  }

  return {
    path,
    line: line && line > 0 ? line : undefined,
    column: column && column > 0 ? column : undefined
  };
}

function cleanupChatFileReference(reference: string | undefined) {
  if (!reference) {
    return "";
  }
  let value = reference.trim();
  if (value.startsWith("@")) {
    value = value.slice(1);
  }
  value = value.replace(/^<(.+)>$/, "$1");
  return trimTrailingReferencePunctuation(value);
}

function trimTrailingReferencePunctuation(value: string) {
  return value.replace(/[),.;\]]+$/g, "");
}

function normalizePath(value: string) {
  const replaced = value.trim().replace(/\\/g, "/");
  const prefix = replaced.match(/^[A-Za-z]:\//)?.[0] ?? (replaced.startsWith("/") ? "/" : "");
  const rest = prefix ? replaced.slice(prefix.length) : replaced;
  const parts: string[] = [];
  for (const part of rest.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${prefix}${parts.join("/")}`.replace(/\/$/, "");
}

function isAbsolutePath(value: string) {
  return /^[A-Za-z]:\//.test(value) || value.startsWith("/");
}

function isInsidePath(path: string, rootPath: string) {
  const normalizedPath = path.toLowerCase();
  const normalizedRoot = rootPath.toLowerCase().replace(/\/$/, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function buildKnownFileMap(filePaths: readonly string[] | undefined) {
  const knownFiles = new Map<string, string>();
  for (const filePath of filePaths ?? []) {
    const normalizedPath = normalizePath(filePath).replace(/^\.\//, "");
    knownFiles.set(normalizedPath.toLowerCase(), normalizedPath);
  }
  return knownFiles;
}

function looksLikeOpenablePath(path: string) {
  return /[\\/]/.test(path) && /(?:^|\/)[^/]+\.[A-Za-z0-9]{1,16}$/.test(path);
}
