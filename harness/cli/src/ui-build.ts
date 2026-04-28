import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SolidPlugin } from "@dschz/bun-plugin-solid";
import tailwindPlugin from "bun-plugin-tailwind";

const uiSourceDir = path.resolve(process.cwd(), "harness/ui");
const uiOutDir = path.resolve(process.cwd(), "dist/ui");
const uiEntryPoint = path.resolve(uiSourceDir, "src/main.tsx");
const contextSourceDir = path.resolve(process.cwd(), "context");

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
  timerApi?: TimerApi;
  buildUiBundle?: (options?: UiBuildOptions) => Promise<void>;
  watchSourceDir?: (
    sourceDir: string,
    listener: (changedPath?: string) => void
  ) => {
    close: () => void;
  };
};

export async function buildUiBundle({ minify = false }: UiBuildOptions = {}) {
  const start = performance.now();

  await rm(uiOutDir, { recursive: true, force: true });
  await mkdir(uiOutDir, { recursive: true });

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

  console.log(`Bundled page in ${Math.round(performance.now() - start)}ms: dist/ui/index.html`);
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
  const debounceMs = Math.max(0, options.debounceMs ?? 0);
  const timerApi = options.timerApi ?? {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  const buildUi = options.buildUiBundle ?? buildUiBundle;
  const watchSourceDir =
    options.watchSourceDir ??
    ((sourceDir: string, listener: (changedPath?: string) => void) =>
      watch(sourceDir, { recursive: true }, (_eventType, filename) => {
        listener(resolveWatchEventPath(sourceDir, filename));
      }));
  let buildInFlight: Promise<void> | undefined;
  let rebuildQueued = false;
  let watcher: FSWatcher | undefined;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (debounceMs === 0) {
      return scheduleBuild();
    }

    clearRebuildTimer();
    rebuildTimer = timerApi.setTimeout(() => {
      rebuildTimer = undefined;
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
      if (watcher) {
        return;
      }

      watcher = watchSourceDir(uiSourceDir, (changedPath) => {
        if (isContextWatchPath(changedPath)) {
          return;
        }

        void queueBuild();
      }) as FSWatcher;
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
      watcher?.close();
      watcher = undefined;
    }
  };
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

function isContextWatchPath(changedPath: string | undefined) {
  if (!changedPath) {
    return false;
  }

  const relativePath = path.relative(contextSourceDir, path.resolve(changedPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
