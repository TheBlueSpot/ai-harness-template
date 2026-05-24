import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SolidPlugin } from "@dschz/bun-plugin-solid";
import tailwindPlugin from "bun-plugin-tailwind";

const uiSourceDir = path.resolve(process.cwd(), "harness/ui");
const sharedSourceDir = path.resolve(process.cwd(), "harness/shared");
const uiOutDir = path.resolve(process.cwd(), "dist/ui");
const uiEntryPoint = path.resolve(uiSourceDir, "src/main.tsx");
const contextSourceDir = path.resolve(process.cwd(), "context");
const repoRoot = path.resolve(process.cwd());
const DEV_HMR_BACKOFF_MS = [1000, 1500, 2000, 2500, 5000, 10000, 15000] as const;

type UiBuildOptions = {
  minify?: boolean;
};

type TimerApi = {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

type LiveReloadState = {
  revision: number;
  building: boolean;
  pending: boolean;
};

type CreateUiAssetManagerOptions = {
  debounceMs?: number;
  debounceScheduleMs?: readonly number[];
  timerApi?: TimerApi;
  buildUiBundle?: (options?: UiBuildOptions) => Promise<void>;
  isTrackedFile?: (changedPath: string | undefined) => boolean;
  watchedSourceDirs?: readonly string[];
  watchSourceDir?: (
    sourceDir: string,
    listener: (changedPath?: string) => void
  ) => {
    close: () => void;
  };
};

export async function buildUiBundle({ minify = false }: UiBuildOptions = {}) {
  const start = performance.now();

  try {
    await prepareUiOutDir();

    const result = await Bun.build({
      entrypoints: [uiEntryPoint],
      outdir: uiOutDir,
      format: "iife",
      target: "browser",
      sourcemap: minify ? "none" : "external",
      minify,
      plugins: [
        SolidPlugin({
          generate: "dom",
          hydratable: false,
          sourceMaps: !minify,
          debug: !minify
        }),
        tailwindPlugin
      ]
    });

    if (!result.success) {
      throw new AggregateError(
        result.logs.map((log) => new Error(log.message)),
        "UI build failed"
      );
    }

    if (!minify) {
      await appendDevSourceMapReference();
    }

    await writeFile(
      path.join(uiOutDir, "index.html"),
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pi Harness</title>
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>
`
    );
  } catch (error) {
    throw enrichUiBuildFileSystemError(error);
  }

  console.log(`Bundled page in ${Math.round(performance.now() - start)}ms: dist/ui/index.html`);
}

export async function prepareUiOutDir() {
  await rm(uiOutDir, { recursive: true, force: true });
  try {
    await mkdir(uiOutDir, { recursive: true });
  } catch (error) {
    if (!isNodeErrorCode(error, "EEXIST")) {
      throw error;
    }
    await rm(uiOutDir, { recursive: true, force: true });
    await mkdir(uiOutDir, { recursive: true });
  }
}

export function enrichUiBuildFileSystemError(error: unknown) {
  if (!hasNodeErrorCode(error, "ENOSPC")) {
    return error;
  }
  const message =
    "UI build failed because the filesystem is out of space. Free disk space or clean temporary harness artifacts such as .local/branchfs, .tmp-test-data, and dist/ui, then restart the harness.";
  return new Error(message, { cause: error });
}

function isNodeErrorCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  if (isNodeErrorCode(error, code)) {
    return true;
  }
  if (error instanceof AggregateError) {
    return error.errors.some((entry) => hasNodeErrorCode(entry, code));
  }
  return error instanceof Error && error.cause !== undefined && hasNodeErrorCode(error.cause, code);
}

async function appendDevSourceMapReference() {
  const jsPath = path.join(uiOutDir, "main.js");
  const sourceMapReference = "//# sourceMappingURL=main.js.map";
  const contents = await readFile(jsPath, "utf8");

  if (contents.includes(sourceMapReference)) {
    return;
  }

  await writeFile(jsPath, `${contents.trimEnd()}\n${sourceMapReference}\n`);
}

export function createUiAssetManager(options: CreateUiAssetManagerOptions = {}) {
  const debounceScheduleMs = normalizeDebounceSchedule(options.debounceScheduleMs ?? [options.debounceMs ?? 0]);
  const timerApi = options.timerApi ?? {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  const buildUi = options.buildUiBundle ?? buildUiBundle;
  const isTrackedFile = options.isTrackedFile ?? createGitTrackedFilePredicate();
  const watchedSourceDirs = options.watchedSourceDirs ?? [uiSourceDir, sharedSourceDir];
  const watchSourceDir =
    options.watchSourceDir ??
    ((sourceDir: string, listener: (changedPath?: string) => void) =>
      watch(sourceDir, { recursive: true }, (_eventType, filename) => {
        listener(resolveWatchEventPath(sourceDir, filename));
      }));
  let buildInFlight: Promise<void> | undefined;
  let rebuildQueued = false;
  let watchers: FSWatcher[] = [];
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  let rebuildBackoffStep = 0;
  let revision = 0;

  const runBuild = async () => {
    try {
      await buildUi();
      revision += 1;
    } catch (error) {
      console.error(error);
    } finally {
      buildInFlight = undefined;
      if (rebuildQueued) {
        rebuildQueued = false;
        queueBuild();
      }
    }
  };

  const scheduleBuild = () => {
    if (buildInFlight) {
      rebuildQueued = true;
      return buildInFlight;
    }

    buildInFlight = runBuild();
    return buildInFlight;
  };

  const clearRebuildTimer = () => {
    if (!rebuildTimer) {
      return;
    }

    timerApi.clearTimeout(rebuildTimer);
    rebuildTimer = undefined;
  };

  const queueBuild = () => {
    const debounceMs = debounceScheduleMs[Math.min(rebuildBackoffStep, debounceScheduleMs.length - 1)] ?? 0;
    if (debounceMs === 0) {
      rebuildBackoffStep = 0;
      return scheduleBuild();
    }

    clearRebuildTimer();
    rebuildBackoffStep += 1;
    rebuildTimer = timerApi.setTimeout(() => {
      rebuildTimer = undefined;
      rebuildBackoffStep = 0;
      void scheduleBuild();
    }, debounceMs);
    return undefined;
  };

  return {
    async ensureBuilt() {
      if (!existsSync(path.join(uiOutDir, "index.html"))) {
        await scheduleBuild();
        return;
      }

      if (buildInFlight) {
        await buildInFlight;
      }
    },
    startWatching() {
      if (watchers.length > 0) {
        return;
      }

      watchers = watchedSourceDirs.map((sourceDir) => watchSourceDir(sourceDir, (changedPath) => {
        if (isIgnoredLiveReloadWatchPath(changedPath) || !isTrackedFile(changedPath)) {
          return;
        }

        void queueBuild();
      }) as FSWatcher);
    },
    resolveAsset(pathname: string) {
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const assetPath = path.resolve(uiOutDir, relativePath);

      if (!assetPath.startsWith(uiOutDir)) {
        return undefined;
      }

      if (!existsSync(assetPath)) {
        return undefined;
      }

      return assetPath;
    },
    getLiveReloadState(): LiveReloadState {
      return {
        revision,
        building: buildInFlight !== undefined,
        pending: rebuildTimer !== undefined || rebuildQueued
      };
    },
    dispose() {
      clearRebuildTimer();
      watchers.forEach((watcher) => watcher.close());
      watchers = [];
    }
  };
}

export function createDevHmrDebounceSchedule() {
  return DEV_HMR_BACKOFF_MS;
}

function normalizeDebounceSchedule(schedule: readonly number[]) {
  const normalized = schedule.map((delayMs) => Math.max(0, Math.round(delayMs))).filter((delayMs) => Number.isFinite(delayMs));
  return normalized.length > 0 ? normalized : [0];
}

function resolveWatchEventPath(sourceDir: string, filename: string | Buffer | null) {
  if (!filename) {
    return undefined;
  }

  const relativePath = typeof filename === "string" ? filename : filename.toString();
  if (!relativePath) {
    return undefined;
  }

  return path.resolve(sourceDir, relativePath);
}

function isIgnoredLiveReloadWatchPath(changedPath: string | undefined) {
  if (!changedPath) {
    return false;
  }

  const resolvedPath = path.resolve(changedPath);
  if (isHarnessTestSourcePath(resolvedPath)) {
    return true;
  }

  if (isPathWithin(contextSourceDir, resolvedPath)) {
    return true;
  }

  const repoRelativePath = path.relative(repoRoot, resolvedPath);
  if (repoRelativePath === "" || repoRelativePath.startsWith("..") || path.isAbsolute(repoRelativePath)) {
    return false;
  }

  const segments = repoRelativePath.split(path.sep);
  const firstSegment = segments[0]?.toLowerCase();
  return firstSegment === ".agent" || firstSegment === ".agents" || path.basename(resolvedPath).toLowerCase() === "agents.md";
}

function isHarnessTestSourcePath(resolvedPath: string) {
  const repoRelativePath = path.relative(repoRoot, resolvedPath);
  if (repoRelativePath === "" || repoRelativePath.startsWith("..") || path.isAbsolute(repoRelativePath)) {
    return false;
  }

  const normalizedPath = normalizeGitPath(repoRelativePath).toLowerCase();
  const basename = path.basename(normalizedPath);
  return (
    /\.(?:test|spec)\.[cm]?[tj]sx?$/.test(basename) ||
    /\.integration\.test\.[cm]?[tj]sx?$/.test(basename) ||
    normalizedPath.includes("/test-support/") ||
    normalizedPath.includes("/utils/tests/") ||
    normalizedPath.includes("/__tests__/")
  );
}

function createGitTrackedFilePredicate() {
  return (changedPath: string | undefined) => {
    if (!changedPath) {
      return false;
    }

    const relativePath = normalizeRepoRelativePath(path.resolve(changedPath));
    return relativePath !== undefined && isGitTrackedFile(relativePath);
  };
}

function isGitTrackedFile(relativePath: string) {
  const result = Bun.spawnSync({
    cmd: ["git", "ls-files", "--error-unmatch", "--", relativePath],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "ignore"
  });

  return result.exitCode === 0;
}

function normalizeRepoRelativePath(absolutePath: string) {
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return normalizeGitPath(relativePath);
}

function normalizeGitPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function isPathWithin(directory: string, candidatePath: string) {
  const relativePath = path.relative(directory, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
