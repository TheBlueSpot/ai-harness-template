import { existsSync } from "node:fs";
import path from "node:path";

const RIPGREP_PACKAGE = "@vscode/ripgrep";

export function resolveBundledRipgrepPath(input: { rootPath?: string; platform?: NodeJS.Platform } = {}) {
  const rootPath = input.rootPath ?? process.cwd();
  const binaryName = input.platform === "win32" || (!input.platform && process.platform === "win32") ? "rg.exe" : "rg";
  const candidates = [
    path.join(rootPath, "node_modules", RIPGREP_PACKAGE, "bin", binaryName),
    path.join(rootPath, "node_modules", RIPGREP_PACKAGE, "rg.exe"),
    path.join(rootPath, "node_modules", RIPGREP_PACKAGE, "rg")
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

export function buildToolchainPath(input: { basePath?: string; rootPath?: string; platform?: NodeJS.Platform } = {}) {
  const rgPath = resolveBundledRipgrepPath(input);
  if (!rgPath) {
    return input.basePath;
  }

  return prependPath(path.dirname(rgPath), input.basePath ?? Bun.env.PATH ?? "", input.platform);
}

export function applyHarnessToolchainToProcessEnv(input: { rootPath?: string; platform?: NodeJS.Platform } = {}) {
  const nextPath = buildToolchainPath({
    basePath: Bun.env.PATH,
    rootPath: input.rootPath,
    platform: input.platform
  });
  if (nextPath) {
    Bun.env.PATH = nextPath;
    process.env.PATH = nextPath;
  }
}

function prependPath(entry: string, basePath: string, platform: NodeJS.Platform | undefined) {
  const delimiter = platform === "win32" || (!platform && process.platform === "win32") ? ";" : ":";
  const entries = basePath.split(delimiter).filter(Boolean);
  if (entries.some((value) => value.toLowerCase() === entry.toLowerCase())) {
    return basePath;
  }
  return [entry, ...entries].join(delimiter);
}
