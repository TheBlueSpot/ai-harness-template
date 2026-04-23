export type WorkspaceRelativePathHint = {
  originalPath: string;
  normalizedPath: string;
};

const leadingSlashPathPattern = /(^|[\s("'`])(?<path>\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?)(?=$|[\s)"'`,.:;!?])/g;
const workspacePathCuePattern =
  /\b(?:file|files|folder|folders|dir|directory|path|paths|repo|project|workspace|cwd|create|make|put|place|save|write|add|build|generate|inside|under|into)\b/i;
const explicitAbsoluteCuePattern =
  /\b(?:absolute path|filesystem root|root directory|system path|os root|from root|from the root|at the root)\b/i;
const commonPosixRootSegments = new Set([
  "bin",
  "boot",
  "dev",
  "etc",
  "home",
  "lib",
  "lib64",
  "mnt",
  "opt",
  "proc",
  "root",
  "run",
  "sbin",
  "srv",
  "sys",
  "tmp",
  "usr",
  "var"
]);

export function extractWorkspaceRelativePathHints(content: string, cwd: string) {
  if (explicitAbsoluteCuePattern.test(content)) {
    return [] as WorkspaceRelativePathHint[];
  }

  const hints = new Map<string, WorkspaceRelativePathHint>();
  const windowsWorkspaceRoot = /^[A-Za-z]:[\\/]/.test(cwd);

  for (const match of content.matchAll(leadingSlashPathPattern)) {
    const originalPath = match.groups?.path;
    if (!originalPath) {
      continue;
    }

    const matchStart = (match.index ?? 0) + match[1].length;
    const matchEnd = matchStart + originalPath.length;
    const contextStart = Math.max(0, matchStart - 60);
    const contextEnd = Math.min(content.length, matchEnd + 60);
    const context = content.slice(contextStart, contextEnd);
    const firstSegment = originalPath.slice(1).split("/", 1)[0]?.toLowerCase() ?? "";

    if (!workspacePathCuePattern.test(context)) {
      continue;
    }

    if (!windowsWorkspaceRoot && commonPosixRootSegments.has(firstSegment)) {
      continue;
    }

    hints.set(originalPath, {
      originalPath,
      normalizedPath: originalPath.slice(1)
    });
  }

  return [...hints.values()].sort((left, right) => right.originalPath.length - left.originalPath.length);
}

export function normalizeWorkspaceRelativePaths(content: string, cwd: string) {
  return extractWorkspaceRelativePathHints(content, cwd).reduce(
    (normalized, hint) => normalized.split(hint.originalPath).join(hint.normalizedPath),
    content
  );
}

export function buildWorkspacePathGuidance(content: string, cwd: string) {
  const hints = extractWorkspaceRelativePathHints(content, cwd);
  if (hints.length === 0) {
    return undefined;
  }

  return [
    "Workspace path guidance:",
    `- Project root: ${cwd}`,
    "- Treat these leading-slash task paths as workspace-relative, not filesystem-root paths:",
    ...hints.map((hint) => `- \`${hint.originalPath}\` -> \`${hint.normalizedPath}\``)
  ].join("\n");
}
