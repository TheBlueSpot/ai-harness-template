import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type BrowserToolHealth = {
  ready: boolean;
  playwrightPackageInstalled: boolean;
  chromiumInstalled: boolean;
  cachePath: string | undefined;
  installDependenciesCommand: string;
  installChromiumCommand: string;
};

type BrowserToolHealthProbeOptions = {
  moduleLoader?: (specifier: string) => Promise<unknown>;
  pathExists?: (targetPath: string) => boolean;
  readDir?: (targetPath: string) => Promise<string[]>;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
};

type PlaywrightCacheRootOptions = Pick<BrowserToolHealthProbeOptions, "env" | "platform" | "homeDir">;

export async function probeBrowserToolHealth(options: BrowserToolHealthProbeOptions = {}): Promise<BrowserToolHealth> {
  const platform = options.platform ?? process.platform;
  const playwrightPackageInstalled = await hasPlaywrightPackageInstalled(options.moduleLoader);
  const cachePath = resolvePlaywrightCacheRoot(options);
  const chromiumInstalled = await hasChromiumInstalled(cachePath, options.pathExists, options.readDir);

  return {
    ready: playwrightPackageInstalled && chromiumInstalled,
    playwrightPackageInstalled,
    chromiumInstalled,
    cachePath,
    installDependenciesCommand: `${getBunExecutableName(platform)} install`,
    installChromiumCommand: `${getBunExecutableName(platform)} x playwright install chromium`
  };
}

export function resolvePlaywrightCacheRoot(options: PlaywrightCacheRootOptions = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const explicit = env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (explicit && explicit !== "0") {
    return explicit;
  }

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim();
    if (!localAppData) {
      return undefined;
    }
    return pathModule.join(localAppData, "ms-playwright");
  }

  if (platform === "darwin") {
    return pathModule.join(homeDir, "Library", "Caches", "ms-playwright");
  }

  return pathModule.join(homeDir, ".cache", "ms-playwright");
}

export function getBunExecutableName(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? "bun.cmd" : "bun";
}

async function hasPlaywrightPackageInstalled(moduleLoader: BrowserToolHealthProbeOptions["moduleLoader"]) {
  const load = moduleLoader ?? ((specifier: string) => import(specifier));
  try {
    await load("playwright");
    return true;
  } catch {
    return false;
  }
}

async function hasChromiumInstalled(
  cachePath: string | undefined,
  pathExists: BrowserToolHealthProbeOptions["pathExists"],
  readDir: BrowserToolHealthProbeOptions["readDir"]
) {
  if (!cachePath) {
    return false;
  }

  const exists = pathExists ?? existsSync;
  if (!exists(cachePath)) {
    return false;
  }

  try {
    const entries = await (readDir ?? readdir)(cachePath);
    return entries.some((entry) => entry.startsWith("chromium"));
  } catch {
    return false;
  }
}
