import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IdeFileRead, IdeFileTreeEntry, IdeGitChange, IdeSearchResult } from "../../shared/protocol";
import { resolveBundledRipgrepPath } from "./agent-runtimes/toolchain";

const DEFAULT_TREE_ENTRY_LIMIT = 5_000;
const DEFAULT_FILE_READ_LIMIT = 1_000_000;
const DEFAULT_SEARCH_RESULT_LIMIT = 200;
const SEARCH_PREVIEW_LIMIT = 500;
const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", "build", ".cache", "coverage", "target"]);

type FileSystemAdapter = {
  readdir: typeof readdir;
  readFile: typeof readFile;
  stat: typeof stat;
  writeFile: typeof writeFile;
};

type ProcessAdapter = {
  spawn: typeof Bun.spawn;
};

const defaultFs: FileSystemAdapter = { readdir, readFile, stat, writeFile };
const defaultProcess: ProcessAdapter = { spawn: Bun.spawn };

export type IdeProjectServiceOptions = {
  fs?: Partial<FileSystemAdapter>;
  process?: Partial<ProcessAdapter>;
  ripgrepPath?: string;
};

export type ListFileTreeOptions = {
  projectRoot: string;
  rootPath?: string;
  maxEntries?: number;
  includeIgnored?: boolean;
};

export type ReadIdeFileOptions = {
  projectId: string;
  projectRoot: string;
  filePath: string;
  maxBytes?: number;
};

export type WriteIdeFileOptions = {
  projectId: string;
  projectRoot: string;
  filePath: string;
  content: string;
};

export type SearchIdeProjectOptions = {
  projectRoot: string;
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  wholeWord?: boolean;
  includeGlob?: string;
  excludeGlob?: string;
  maxResults?: number;
  signal?: AbortSignal;
};

export class IdeProjectService {
  private readonly fs: FileSystemAdapter;
  private readonly process: ProcessAdapter;
  private readonly ripgrepPath?: string;

  constructor(options: IdeProjectServiceOptions = {}) {
    this.fs = { ...defaultFs, ...options.fs };
    this.process = { ...defaultProcess, ...options.process };
    this.ripgrepPath = options.ripgrepPath;
  }

  async listFileTree(options: ListFileTreeOptions): Promise<{ rootPath: string; entries: IdeFileTreeEntry[]; truncated: boolean }> {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const startPath = resolveProjectPath(projectRoot, options.rootPath ?? ".");
    const maxEntries = options.maxEntries ?? DEFAULT_TREE_ENTRY_LIMIT;
    const entries: IdeFileTreeEntry[] = [];
    let truncated = false;

    let children: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      children = await this.fs.readdir(startPath, { withFileTypes: true });
    } catch {
      children = [];
    }

    const parentPath = options.rootPath && options.rootPath !== "." ? toProtocolPath(path.relative(projectRoot, startPath)) : undefined;
    const parentDepth = parentPath ? parentPath.split("/").filter(Boolean).length : 0;
    const sorted = children
      .filter((entry) => options.includeIgnored || !IGNORED_DIRECTORY_NAMES.has(entry.name))
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));

    for (const child of sorted) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      const absolutePath = path.join(startPath, child.name);
      const relativePath = toProtocolPath(path.relative(projectRoot, absolutePath));
      const isDirectory = child.isDirectory();
      const entry: IdeFileTreeEntry = {
        path: relativePath,
        name: child.name,
        kind: isDirectory ? "directory" : "file",
        depth: parentDepth,
        parentPath,
        hasChildren: isDirectory ? await hasVisibleChildren(this.fs, absolutePath, options.includeIgnored) : undefined
      };
      entries.push(entry);
    }

    return { rootPath: projectRoot, entries, truncated };
  }

  async readFile(options: ReadIdeFileOptions): Promise<IdeFileRead> {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const absolutePath = resolveProjectPath(projectRoot, options.filePath);
    const stats = await this.fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error("IDE file read target is not a file");
    }

    const maxBytes = options.maxBytes ?? DEFAULT_FILE_READ_LIMIT;
    const buffer = await this.fs.readFile(absolutePath);
    const isBinary = isLikelyBinary(buffer);
    const tooLarge = buffer.byteLength > maxBytes;
    const content = isBinary || tooLarge ? undefined : buffer.toString("utf8");
    const normalizedPath = toProtocolPath(path.relative(projectRoot, absolutePath));

    return {
      projectId: options.projectId,
      path: normalizedPath,
      name: path.basename(absolutePath),
      language: inferLanguage(absolutePath),
      encoding: "UTF-8",
      sizeBytes: buffer.byteLength,
      lineCount: content ? content.split(/\r\n|\r|\n/).length : 0,
      isBinary,
      tooLarge,
      content
    };
  }

  async writeFile(options: WriteIdeFileOptions): Promise<IdeFileRead> {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const absolutePath = resolveProjectPath(projectRoot, options.filePath);
    const stats = await this.fs.stat(absolutePath).catch(() => undefined);
    if (stats && !stats.isFile()) {
      throw new Error("IDE file write target is not a file");
    }
    await this.fs.writeFile(absolutePath, options.content, "utf8");
    return this.readFile({
      projectId: options.projectId,
      projectRoot,
      filePath: options.filePath
    });
  }

  async searchProject(options: SearchIdeProjectOptions): Promise<{ results: IdeSearchResult[]; truncated: boolean }> {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const rgPath = this.ripgrepPath ?? resolveBundledRipgrepPath();
    if (!rgPath) {
      throw new Error("Bundled ripgrep is unavailable");
    }

    const maxResults = options.maxResults ?? DEFAULT_SEARCH_RESULT_LIMIT;
    const args = [
      "--json",
      "--line-number",
      "--column",
      "--hidden",
      "--glob",
      "!{.git,node_modules,dist,build,.cache,coverage,target}/**"
    ];
    if (!options.regex) {
      args.push("-F");
    }
    if (!options.caseSensitive) {
      args.push("-i");
    }
    if (options.wholeWord) {
      args.push("-w");
    }
    if (options.includeGlob) {
      args.push("--glob", options.includeGlob);
    }
    if (options.excludeGlob) {
      args.push("--glob", `!${options.excludeGlob}`);
    }
    args.push(options.query, ".");

    const process = this.process.spawn([rgPath, ...args], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      signal: options.signal
    });
    const output = await new Response(process.stdout).text();
    await process.exited;
    return parseRipgrepJson(output, maxResults);
  }

  async gitStatus(projectRootInput: string): Promise<{ branch?: string; isRepository: boolean; changes: IdeGitChange[] }> {
    const projectRoot = await resolveRealProjectRoot(projectRootInput);
    const repoRoot = await this.resolveGitRepoRoot(projectRoot);
    if (!repoRoot) {
      return { isRepository: false, changes: [] };
    }
    const process = this.process.spawn(["git", "-C", projectRoot, "status", "--porcelain=v1", "--branch", "-z", "--", "."], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore"
    });
    const output = await new Response(process.stdout).text();
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      return { isRepository: false, changes: [] };
    }
    return normalizeGitStatusForProject(parseGitStatus(output), repoRoot, projectRoot);
  }

  private async resolveGitRepoRoot(projectRoot: string) {
    const process = this.process.spawn(["git", "-C", projectRoot, "rev-parse", "--show-toplevel"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore"
    });
    const output = await new Response(process.stdout).text();
    const exitCode = await process.exited;
    return exitCode === 0 ? path.resolve(output.trim()) : undefined;
  }
}

export function resolveProjectPath(projectRootInput: string, inputPath: string) {
  const projectRoot = resolveProjectRoot(projectRootInput);
  const normalizedInput = inputPath.replace(/\\/g, path.sep);
  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(projectRoot, normalizedInput);
  const relative = path.relative(projectRoot, absolutePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return absolutePath;
  }
  throw new Error("IDE path is outside the active project");
}

function resolveProjectRoot(projectRoot: string) {
  return path.resolve(projectRoot);
}

async function resolveRealProjectRoot(projectRoot: string) {
  const resolved = resolveProjectRoot(projectRoot);
  return realpath(resolved).catch(() => resolved);
}

function toProtocolPath(value: string) {
  return value.replace(/\\/g, "/");
}

function isLikelyBinary(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function inferLanguage(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension === "ts" || extension === "tsx") return "TypeScript";
  if (extension === "js" || extension === "jsx") return "JavaScript";
  if (extension === "md" || extension === "markdown") return "Markdown";
  if (extension === "json") return "JSON";
  if (extension === "css") return "CSS";
  if (extension === "html") return "HTML";
  if (extension === "rs") return "Rust";
  if (extension === "py") return "Python";
  return "Plain Text";
}

async function hasVisibleChildren(fs: FileSystemAdapter, absolutePath: string, includeIgnored?: boolean) {
  try {
    const children = await fs.readdir(absolutePath, { withFileTypes: true });
    return children.some((entry) => includeIgnored || !IGNORED_DIRECTORY_NAMES.has(entry.name));
  } catch {
    return false;
  }
}

export function parseRipgrepJson(output: string, maxResults: number) {
  const byPath = new Map<string, IdeSearchResult>();
  let count = 0;
  let truncated = false;

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "match") {
      continue;
    }
    if (count >= maxResults) {
      truncated = true;
      continue;
    }
    const filePath = toProtocolPath(event.data?.path?.text ?? "");
    const preview = String(event.data?.lines?.text ?? "").replace(/\r?\n$/, "").slice(0, SEARCH_PREVIEW_LIMIT);
    if (!filePath || !preview) {
      continue;
    }
    const result = byPath.get(filePath) ?? { path: filePath, name: path.basename(filePath), matches: [] };
    result.matches.push({
      line: Number(event.data?.line_number ?? 1),
      column: Number(event.data?.submatches?.[0]?.start ?? 0) + 1,
      preview
    });
    byPath.set(filePath, result);
    count += 1;
  }

  return { results: [...byPath.values()], truncated };
}

export function parseGitStatus(output: string) {
  const parts = output.split("\0").filter(Boolean);
  let branch: string | undefined;
  const changes: IdeGitChange[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index]!;
    if (entry.startsWith("## ")) {
      branch = entry.slice(3).split("...")[0]?.trim() || undefined;
      continue;
    }
    const shortStatus = entry.slice(0, 2);
    const filePath = toProtocolPath(entry.slice(3));
    const status = mapGitStatus(shortStatus);
    const change: IdeGitChange = { path: filePath, status, shortStatus: shortStatus.trim() || "?" };
    if (status === "renamed" || status === "copied") {
      const originalPath = parts[index + 1];
      if (originalPath) {
        change.originalPath = toProtocolPath(originalPath);
        index += 1;
      }
    }
    changes.push(change);
  }

  return { branch, isRepository: true, changes };
}

function normalizeGitStatusForProject(status: ReturnType<typeof parseGitStatus>, repoRoot: string, projectRoot: string) {
  const projectFromRepo = toProtocolPath(path.relative(repoRoot, projectRoot));
  const prefix = projectFromRepo ? `${projectFromRepo}/` : "";
  const changes = status.changes
    .map((change) => normalizeGitChangeForProject(change, prefix))
    .filter((change): change is IdeGitChange => Boolean(change));
  return { ...status, changes };
}

function normalizeGitChangeForProject(change: IdeGitChange, prefix: string): IdeGitChange | undefined {
  if (!prefix) {
    return change;
  }
  if (change.path.startsWith(prefix)) {
    return {
      ...change,
      path: change.path.slice(prefix.length),
      originalPath: change.originalPath?.startsWith(prefix) ? change.originalPath.slice(prefix.length) : change.originalPath
    };
  }
  return change;
}

function mapGitStatus(shortStatus: string): IdeGitChange["status"] {
  if (shortStatus === "??") return "untracked";
  if (shortStatus.includes("U")) return "conflicted";
  if (shortStatus.includes("R")) return "renamed";
  if (shortStatus.includes("C")) return "copied";
  if (shortStatus.includes("D")) return "deleted";
  if (shortStatus.includes("A")) return "added";
  return "modified";
}
