import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectSearchResult } from "../../shared/protocol";

const DIRECTORY_CACHE_TTL_MS = 30_000;
const MAX_RESULTS = 8;
const MAX_TRAVERSED_DIRECTORIES = 2_000;
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".cache",
  "coverage",
  "target",
  "Library",
  "AppData"
]);

type SearchProjectsOptions = {
  query: string;
  workspaceProjectPaths?: string[];
  cwd?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
  maxConcurrentReads?: number;
  fsAdapter?: ProjectSearchFsAdapter;
};

type ProjectSearchFsAdapter = {
  readdir: (rootPath: string, options: { withFileTypes: true }) => Promise<Array<{ name: string; isDirectory: () => boolean }>>;
  stat: (rootPath: string) => Promise<{ isDirectory: () => boolean }>;
};

type CachedDirectoryEntry = {
  name: string;
  fullPath: string;
  isDirectory: boolean;
};

type QueueEntry = {
  dir: string;
  depth: number;
  maxDepth: number;
};

const directoryCache = new Map<string, { expiresAt: number; entries: CachedDirectoryEntry[] }>();
const defaultFsAdapter: ProjectSearchFsAdapter = {
  readdir: (rootPath, options) => readdir(rootPath, options),
  stat: (rootPath) => stat(rootPath)
};

export async function searchProjectFolders({
  query,
  workspaceProjectPaths = [],
  cwd = process.cwd(),
  homeDir = os.homedir(),
  platform = process.platform,
  signal,
  fsAdapter = defaultFsAdapter
}: SearchProjectsOptions) {
  const trimmedQuery = normalizeWindowsEscapedPath(query.trim());
  if (!trimmedQuery) {
    return [];
  }

  throwIfAborted(signal);
  return isAbsolutePath(trimmedQuery, platform)
    ? searchAbsolutePath(trimmedQuery, platform, fsAdapter, signal)
    : searchSearchRoots(trimmedQuery, workspaceProjectPaths, cwd, homeDir, platform, fsAdapter, signal);
}

export function clearProjectSearchCacheForTests() {
  directoryCache.clear();
}

async function searchAbsolutePath(
  query: string,
  platform: NodeJS.Platform,
  fsAdapter: ProjectSearchFsAdapter,
  signal: AbortSignal | undefined
) {
  const results = new Map<string, RankedResult>();
  const resolvedQuery = path.resolve(query);
  const queryEndsWithSeparator = /[\\/]$/.test(query);
  const resolvedIsDirectory = await isExistingDirectory(resolvedQuery, fsAdapter, signal);
  const baseDir = queryEndsWithSeparator || resolvedIsDirectory ? resolvedQuery : path.dirname(resolvedQuery);
  const normalizedBaseDir = normalizeSearchPath(baseDir, platform);
  const normalizedQuery = normalizeSearchPath(resolvedQuery, platform);

  if (resolvedIsDirectory) {
    addRankedResult(
      results,
      {
        id: resolvedQuery,
        name: path.basename(resolvedQuery) || resolvedQuery,
        rootPath: resolvedQuery,
        repoKind: await detectRepoKind(resolvedQuery, fsAdapter, signal),
        matchKind: "exact"
      },
      platform
    );
  }

  if (!normalizedBaseDir || !(await isExistingDirectory(baseDir, fsAdapter, signal))) {
    return finalizeResults(results, platform);
  }

  for (const entry of await readDirectory(baseDir, fsAdapter, signal)) {
    throwIfAborted(signal);
    if (!entry.isDirectory) {
      continue;
    }

    const normalizedEntryPath = normalizeSearchPath(entry.fullPath, platform);
    if (!normalizedEntryPath.startsWith(normalizedQuery) || normalizedEntryPath === normalizedQuery) {
      continue;
    }

    addRankedResult(
      results,
      {
        id: entry.fullPath,
        name: entry.name,
        rootPath: entry.fullPath,
        repoKind: await detectRepoKind(entry.fullPath, fsAdapter, signal),
        matchKind: "path-prefix"
      },
      platform
    );
  }

  return finalizeResults(results, platform);
}

async function searchSearchRoots(
  query: string,
  workspaceProjectPaths: string[],
  cwd: string,
  homeDir: string,
  platform: NodeJS.Platform,
  fsAdapter: ProjectSearchFsAdapter,
  signal: AbortSignal | undefined
) {
  const normalizedQuery = normalizeSearchPath(query, platform);
  const existingCandidates: string[] = [];
  for (const entry of [
    ...workspaceProjectPaths.map((projectPath) => path.dirname(projectPath)),
    cwd,
    homeDir
  ]) {
    if (await isExistingDirectory(entry, fsAdapter, signal)) {
      existingCandidates.push(entry);
    }
  }
  const roots = dedupePaths(
    existingCandidates,
    platform
  );

  const queue: QueueEntry[] = [
    ...roots.map((root) => ({
      dir: root,
      depth: 0,
      maxDepth: normalizeSearchPath(root, platform) === normalizeSearchPath(homeDir, platform) ? 2 : 4
    }))
  ];
  const visited = new Set<string>();
  const results = new Map<string, RankedResult>();
  let traversedDirectoryCount = 0;

  while (queue.length > 0 && traversedDirectoryCount < MAX_TRAVERSED_DIRECTORIES) {
    throwIfAborted(signal);
    const current = queue.shift();
    if (!current) {
      break;
    }

    const currentKey = normalizeSearchPath(current.dir, platform);
    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);
    traversedDirectoryCount += 1;

    for (const entry of await readDirectory(current.dir, fsAdapter, signal)) {
      throwIfAborted(signal);
      if (!entry.isDirectory) {
        continue;
      }

      const matchKind = getMatchKind(entry.fullPath, entry.name, normalizedQuery, platform);
      if (matchKind) {
        addRankedResult(
          results,
          {
            id: entry.fullPath,
            name: entry.name,
            rootPath: entry.fullPath,
            repoKind: await detectRepoKind(entry.fullPath, fsAdapter, signal),
            matchKind
          },
          platform
        );
      }

      if (current.depth < current.maxDepth) {
        queue.push({
          dir: entry.fullPath,
          depth: current.depth + 1,
          maxDepth: current.maxDepth
        });
      }
    }
  }

  return finalizeResults(results, platform);
}

type RankedResult = ProjectSearchResult & {
  sortScore: number;
  depth: number;
};

function addRankedResult(results: Map<string, RankedResult>, result: ProjectSearchResult, platform: NodeJS.Platform) {
  const key = normalizeSearchPath(result.rootPath, platform);
  const ranked = {
    ...result,
    sortScore: getSortScore(result),
    depth: getPathDepth(result.rootPath)
  };
  const existing = results.get(key);
  if (!existing || compareRankedResults(ranked, existing) < 0) {
    results.set(key, ranked);
  }
}

function finalizeResults(results: Map<string, RankedResult>, platform: NodeJS.Platform) {
  return [...results.values()]
    .sort(compareRankedResults)
    .slice(0, MAX_RESULTS)
    .map(({ sortScore: _sortScore, depth: _depth, ...result }) => ({
      ...result,
      rootPath: normalizeResultPath(result.rootPath, platform)
    }));
}

function compareRankedResults(left: RankedResult, right: RankedResult) {
  if (left.sortScore !== right.sortScore) {
    return left.sortScore - right.sortScore;
  }

  if (left.depth !== right.depth) {
    return left.depth - right.depth;
  }

  return left.rootPath.localeCompare(right.rootPath, undefined, { sensitivity: "base" });
}

function getSortScore(result: ProjectSearchResult) {
  if (result.matchKind === "exact") {
    return 0;
  }

  if (result.repoKind === "git-repo" && (result.matchKind === "path-prefix" || result.matchKind === "name-prefix")) {
    return 1;
  }

  if (result.repoKind === "git-repo" && result.matchKind === "substring") {
    return 2;
  }

  if (result.repoKind === "folder" && (result.matchKind === "path-prefix" || result.matchKind === "name-prefix")) {
    return 3;
  }

  return 4;
}

function getMatchKind(fullPath: string, name: string, normalizedQuery: string, platform: NodeJS.Platform): ProjectSearchResult["matchKind"] | undefined {
  const normalizedName = normalizeSearchPath(name, platform);
  const normalizedFullPath = normalizeSearchPath(fullPath, platform);
  if (normalizedFullPath === normalizedQuery) {
    return "exact";
  }

  if (normalizedFullPath.startsWith(normalizedQuery)) {
    return "path-prefix";
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return "name-prefix";
  }

  if (normalizedName.includes(normalizedQuery) || normalizedFullPath.includes(normalizedQuery)) {
    return "substring";
  }

  return undefined;
}

async function detectRepoKind(
  rootPath: string,
  fsAdapter: ProjectSearchFsAdapter,
  signal: AbortSignal | undefined
): Promise<ProjectSearchResult["repoKind"]> {
  return (await isExistingDirectory(path.join(rootPath, ".git"), fsAdapter, signal)) ? "git-repo" : "folder";
}

async function readDirectory(
  rootPath: string,
  fsAdapter: ProjectSearchFsAdapter,
  signal: AbortSignal | undefined
) {
  throwIfAborted(signal);
  const now = Date.now();
  const cached = directoryCache.get(rootPath);
  if (cached && cached.expiresAt > now) {
    return cached.entries;
  }

  let entries: CachedDirectoryEntry[];
  try {
    entries = (await fsAdapter.readdir(rootPath, { withFileTypes: true }))
      .filter((entry) => !IGNORED_DIRECTORY_NAMES.has(entry.name))
      .map((entry) => ({
        name: entry.name,
        fullPath: path.join(rootPath, entry.name),
        isDirectory: entry.isDirectory()
      }));
  } catch {
    entries = [];
  }

  directoryCache.set(rootPath, {
    expiresAt: now + DIRECTORY_CACHE_TTL_MS,
    entries
  });
  return entries;
}

function isAbsolutePath(value: string, platform: NodeJS.Platform) {
  return platform === "win32" ? /^[a-zA-Z]:\\/.test(value) || value.startsWith("\\\\") : value.startsWith("/");
}

async function isExistingDirectory(
  rootPath: string,
  fsAdapter: ProjectSearchFsAdapter,
  signal: AbortSignal | undefined
) {
  throwIfAborted(signal);
  try {
    return (await fsAdapter.stat(rootPath)).isDirectory();
  } catch {
    return false;
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("Project search aborted", "AbortError");
  }
}

function normalizeSearchPath(value: string, platform: NodeJS.Platform) {
  const normalized = normalizeWindowsEscapedPath(value.trim()).replace(/[\\/]+$/, "");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizeResultPath(value: string, platform: NodeJS.Platform) {
  return platform === "win32" ? normalizeWindowsEscapedPath(value) : value;
}

function dedupePaths(values: string[], platform: NodeJS.Platform) {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const key = normalizeSearchPath(value, platform);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(value);
  }

  return results;
}

function getPathDepth(rootPath: string) {
  return rootPath.split(/[\\/]+/).filter(Boolean).length;
}

function normalizeWindowsEscapedPath(value: string) {
  if (/^[a-zA-Z]:\\\\/.test(value)) {
    return value.replace(/\\\\/g, "\\");
  }

  return value;
}
