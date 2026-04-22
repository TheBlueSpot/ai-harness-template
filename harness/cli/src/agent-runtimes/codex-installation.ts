import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const CODEX_PACKAGE_NAME = "@openai/codex";
const CODEX_DOCS_URL = "https://developers.openai.com/codex";
const CODEX_INSTALL_COMMAND = "bun install";
const CODEX_AUTH_COMMAND = "bunx codex login";
const PLATFORM_PACKAGE_BY_TARGET: Record<string, string> = {
  "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
  "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
  "x86_64-apple-darwin": "@openai/codex-darwin-x64",
  "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
  "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
  "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64"
};

export type CodexInstallation = {
  installed: boolean;
  executablePath?: string;
  installCommand: string;
  authCommand: string;
  docsUrl: string;
  healthMessage: string;
};

type ResolvePackageJson = (specifier: string) => string;

export function resolveBundledCodexTargetTriple(platform: NodeJS.Platform = process.platform, arch: string = process.arch) {
  switch (platform) {
    case "linux":
    case "android":
      switch (arch) {
        case "x64":
          return "x86_64-unknown-linux-musl";
        case "arm64":
          return "aarch64-unknown-linux-musl";
        default:
          return undefined;
      }
    case "darwin":
      switch (arch) {
        case "x64":
          return "x86_64-apple-darwin";
        case "arm64":
          return "aarch64-apple-darwin";
        default:
          return undefined;
      }
    case "win32":
      switch (arch) {
        case "x64":
          return "x86_64-pc-windows-msvc";
        case "arm64":
          return "aarch64-pc-windows-msvc";
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

export function resolveBundledCodexExecutablePath(input: {
  platform?: NodeJS.Platform;
  arch?: string;
  resolvePackageJson?: ResolvePackageJson;
  pathExists?: (candidate: string) => boolean;
} = {}) {
  const targetTriple = resolveBundledCodexTargetTriple(input.platform, input.arch);
  if (!targetTriple) {
    throw new Error(`Unsupported Codex platform: ${input.platform ?? process.platform} (${input.arch ?? process.arch})`);
  }

  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) {
    throw new Error(`Unsupported Codex target triple: ${targetTriple}`);
  }

  const resolvePackageJson =
    input.resolvePackageJson ??
    (() => {
      const rootRequire = createRequire(import.meta.url);
      const codexPackageJsonPath = rootRequire.resolve(`${CODEX_PACKAGE_NAME}/package.json`);
      const codexRequire = createRequire(codexPackageJsonPath);
      return (specifier: string) => codexRequire.resolve(specifier);
    })();

  const platformPackageJsonPath = resolvePackageJson(`${platformPackage}/package.json`);
  const vendorRoot = path.join(path.dirname(platformPackageJsonPath), "vendor");
  const binaryName = (input.platform ?? process.platform) === "win32" ? "codex.exe" : "codex";
  const executablePath = path.join(vendorRoot, targetTriple, "codex", binaryName);
  const pathExists = input.pathExists ?? existsSync;
  if (!pathExists(executablePath)) {
    throw new Error(`Bundled Codex executable not found at ${executablePath}`);
  }

  return executablePath;
}

export function getBundledCodexInstallation(input: {
  platform?: NodeJS.Platform;
  arch?: string;
  resolvePackageJson?: ResolvePackageJson;
  pathExists?: (candidate: string) => boolean;
} = {}): CodexInstallation {
  try {
    return {
      installed: true,
      executablePath: resolveBundledCodexExecutablePath(input),
      installCommand: CODEX_INSTALL_COMMAND,
      authCommand: CODEX_AUTH_COMMAND,
      docsUrl: CODEX_DOCS_URL,
      healthMessage: ""
    };
  } catch {
    return {
      installed: false,
      installCommand: CODEX_INSTALL_COMMAND,
      authCommand: CODEX_AUTH_COMMAND,
      docsUrl: CODEX_DOCS_URL,
      healthMessage: "Run `bun install` to install bundled Codex runtime dependencies."
    };
  }
}

export const codexInstallationMetadata = {
  packageName: CODEX_PACKAGE_NAME,
  installCommand: CODEX_INSTALL_COMMAND,
  authCommand: CODEX_AUTH_COMMAND,
  docsUrl: CODEX_DOCS_URL
};
