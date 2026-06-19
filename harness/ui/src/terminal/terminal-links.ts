export type TerminalLinkTarget =
  | { kind: "url"; href: string }
  | { kind: "file"; path: string; line?: number; column?: number };

const urlPattern = /https?:\/\/[^\s"'<>]+/;
const urlPatternGlobal = /https?:\/\/[^\s"'<>]+/g;
const filePattern = /((?:[A-Za-z]:\\|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[^\s"'<>:]+(?:\.[A-Za-z0-9]+)?)(?::(\d+))?(?::(\d+))?/;
const filePatternGlobal = /((?:[A-Za-z]:\\|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[^\s"'<>:]+(?:\.[A-Za-z0-9]+)?)(?::(\d+))?(?::(\d+))?/g;

export type TerminalDetectedLink = {
  index: number;
  length: number;
  target: TerminalLinkTarget;
};

export function detectTerminalLink(text: string): TerminalLinkTarget | undefined {
  const url = text.match(urlPattern)?.[0];
  if (url) {
    return { kind: "url", href: trimTrailingPunctuation(url) };
  }
  const file = text.match(filePattern);
  if (!file) {
    return undefined;
  }
  return {
    kind: "file",
    path: file[1],
    line: file[2] ? Number(file[2]) : undefined,
    column: file[3] ? Number(file[3]) : undefined
  };
}

export function openTerminalLink(target: TerminalLinkTarget, openFile: (path: string, line?: number, column?: number) => void) {
  if (target.kind === "url") {
    window.open(target.href, "_blank", "noopener,noreferrer");
    return;
  }
  openFile(target.path, target.line, target.column);
}

export function findTerminalLinks(text: string): TerminalDetectedLink[] {
  const links: TerminalDetectedLink[] = [];
  for (const match of text.matchAll(urlPatternGlobal)) {
    const raw = match[0];
    const href = trimTrailingPunctuation(raw);
    links.push({ index: match.index ?? 0, length: href.length, target: { kind: "url", href } });
  }
  for (const match of text.matchAll(filePatternGlobal)) {
    const path = match[1];
    if (!path) {
      continue;
    }
    const value = match[0];
    links.push({
      index: match.index ?? 0,
      length: value.length,
      target: {
        kind: "file",
        path,
        line: match[2] ? Number(match[2]) : undefined,
        column: match[3] ? Number(match[3]) : undefined
      }
    });
  }
  return links.sort((left, right) => left.index - right.index);
}

export function resolveTerminalFileTarget(
  target: Extract<TerminalLinkTarget, { kind: "file" }>,
  sessionCwd: string,
  projectRoot: string
): Extract<TerminalLinkTarget, { kind: "file" }> | undefined {
  const normalizedRoot = normalizePath(projectRoot);
  const normalizedCwd = normalizePath(sessionCwd || projectRoot);
  const normalizedPath = normalizePath(target.path);
  const absolute = isAbsolutePath(normalizedPath)
    ? normalizedPath
    : normalizePath(`${normalizedCwd.replace(/\/$/, "")}/${normalizedPath}`);
  if (!isInsidePath(absolute, normalizedRoot)) {
    return undefined;
  }
  return {
    ...target,
    path: absolute.slice(normalizedRoot.length).replace(/^\/+/, "") || target.path
  };
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[),.;]+$/, "");
}

function normalizePath(value: string) {
  const replaced = value.replace(/\\/g, "/");
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

function isInsidePath(path: string, root: string) {
  const normalizedPath = path.toLowerCase();
  const normalizedRoot = root.toLowerCase().replace(/\/$/, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}
