import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SolidPlugin } from "@dschz/bun-plugin-solid";
import tailwindPlugin from "bun-plugin-tailwind";

const uiSourceDir = path.resolve(process.cwd(), "harness/ui");
const uiOutDir = path.resolve(process.cwd(), "dist/ui");
const uiEntryPoint = path.resolve(uiSourceDir, "src/main.tsx");

type UiBuildOptions = {
  minify?: boolean;
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
    sourcemap: minify ? "none" : "inline",
    minify,
    plugins: [
      SolidPlugin({
        generate: "dom",
        hydratable: false,
        sourceMaps: !minify ? "inline" : false,
        debug: Bun.env.HARNESS_UI_DEBUG === "1"
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

export function createUiAssetManager() {
  let buildInFlight: Promise<void> | undefined;
  let rebuildQueued = false;
  let watcher: FSWatcher | undefined;

  const runBuild = async () => {
    try {
      await buildUiBundle();
    } catch (error) {
      console.error(error);
    } finally {
      buildInFlight = undefined;
      if (rebuildQueued) {
        rebuildQueued = false;
        buildInFlight = runBuild();
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

      watcher = watch(uiSourceDir, { recursive: true }, () => {
        void scheduleBuild();
      });
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
    dispose() {
      watcher?.close();
      watcher = undefined;
    }
  };
}
