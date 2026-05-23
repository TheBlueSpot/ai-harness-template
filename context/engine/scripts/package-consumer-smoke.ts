import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { $ } from "bun";

type PackageJson = {
  name: string;
  version: string;
  private?: boolean;
  types?: string;
  files?: string[];
  exports?: Record<string, unknown>;
};

const rootDir = join(import.meta.dir, "..");
const packagePath = join(rootDir, "package.json");
const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
const runExternalConsumer = process.argv.includes("--external-consumer");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function packagePathExists(relativePath: string) {
  return existsSync(join(rootDir, relativePath));
}

assert(manifest.name === "@catalog/engine", "package name must stay stable for consumers");
assert(/^0\.1\.\d+$/.test(manifest.version), "package version must stay inside the documented 0.1.x contract");
assert(manifest.private === false, "package must be publishable");
assert(manifest.types === "./dist/src/index.d.ts", "top-level types must point at generated declarations");
assert(manifest.files?.includes("browser/"), "package files must include the browser build");
assert(manifest.files?.includes("dist/"), "package files must include generated declarations");
assert(manifest.files?.includes("wasm/"), "package files must include WASM assets");

const rootExport = manifest.exports?.["."] as { import?: string; types?: string } | undefined;
assert(rootExport?.import === "./browser/engine.js", "root import must resolve to the browser ESM build");
assert(rootExport?.types === "./dist/src/index.d.ts", "root export types must resolve to generated declarations");

const coreExport = manifest.exports?.["./core"] as { import?: string; types?: string } | undefined;
assert(coreExport?.import === "./dist/core.js", "core import must resolve to the DOM-free emitted module");
assert(coreExport?.types === "./dist/src/core.d.ts", "core export types must resolve to generated declarations");

const wasmExport = manifest.exports?.["./wasm/collision-kernel.wasm"] as { default?: string } | undefined;
assert(wasmExport?.default === "./wasm/collision-kernel.wasm", "WASM asset export must stay explicit");
assert(wasmExport?.types === "./wasm/collision-kernel.wasm.d.ts", "WASM asset export must expose an asset URL type");
const viteWasmUrlExport = manifest.exports?.["./wasm/collision-kernel.wasm?url"] as { default?: string } | undefined;
assert(viteWasmUrlExport?.default === "./wasm/collision-kernel.wasm", "Vite WASM URL export must point at the same asset");
assert(viteWasmUrlExport?.types === "./wasm/collision-kernel.wasm.d.ts", "Vite WASM URL export must expose an asset URL type");

assert(packagePathExists("browser/engine.js"), "browser runtime build is missing");
assert(packagePathExists("dist/src/index.d.ts"), "generated declaration entry is missing");
assert(packagePathExists("dist/core.js"), "generated DOM-free core module is missing");
assert(packagePathExists("dist/src/core.d.ts"), "generated DOM-free core declarations are missing");
assert(packagePathExists("wasm/collision-kernel.wasm"), "WASM asset is missing");
assert(packagePathExists("wasm/collision-kernel.wasm.d.ts"), "WASM asset type declaration is missing");

const declarationEntry = readFileSync(join(rootDir, "dist/src/index.d.ts"), "utf8");
assert(!declarationEntry.includes(".ts\"") && !declarationEntry.includes(".ts'"), "declarations must not expose .ts specifiers");
const cameraDeclarations = readFileSync(join(rootDir, "dist/src/canvas/camera.d.ts"), "utf8");
assert(!cameraDeclarations.includes("/*elided*/ any"), "camera declarations must preserve explicit fluent return types");

const browserBuild = await import(pathToFileURL(join(rootDir, "browser/engine.js")).href);
for (const exportName of ["createFixedStepLoop", "createCollisionKernel", "resolveCollisionKernelWasmUrl", "circleRectOverlap"]) {
  assert(typeof browserBuild[exportName] === "function", `browser build is missing ${exportName}`);
}

if (!runExternalConsumer) {
  process.exit(0);
}

const packDir = mkdtempSync(join(tmpdir(), "catalog-engine-pack-"));
try {
  const packOutput = await $`npm.cmd pack --dry-run --json --pack-destination ${packDir}`.cwd(rootDir).text();
  const [pack] = JSON.parse(packOutput) as Array<{ files: Array<{ path: string }> }>;
  const packedFiles = new Set(pack.files.map((file) => file.path));

  for (const path of [
    "package.json",
    "browser/engine.js",
    "dist/src/index.d.ts",
    "dist/core.js",
    "dist/src/core.d.ts",
    "wasm/collision-kernel.wasm",
    "wasm/collision-kernel.wasm.d.ts",
    "readme.md",
  ]) {
    assert(packedFiles.has(path), `package tarball would omit ${path}`);
  }

  const consumerDir = mkdtempSync(join(tmpdir(), "catalog-engine-consumer-"));
  try {
  const tarballOutput = await $`npm.cmd pack --json --pack-destination ${packDir}`.cwd(rootDir).text();
  const [tarball] = JSON.parse(tarballOutput) as Array<{ filename: string }>;
  const tarballPath = join(packDir, tarball.filename);

  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify({ type: "module", dependencies: { "@catalog/engine": tarballPath } }, null, 2),
  );
  writeFileSync(
    join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDir, "core-consumer.ts"),
    [
      'import { circleRectOverlap, createObjectPool, createStage, gridKey } from "@catalog/engine/core";',
      "",
      "const key: string = gridKey({ x: 2, y: 3 });",
      "const hit: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
      "const pool = createObjectPool({ create: () => ({ active: false }), reset: (item) => { item.active = false; } });",
      "const entity = pool.acquire();",
      "entity.active = true;",
      "const stage = createStage<typeof entity>();",
      "stage.spawn(entity);",
      "if (key !== '2,3' || hit !== true || stage.count() !== 1) throw new Error('unexpected core result');",
    ].join("\n"),
  );
  writeFileSync(
    join(consumerDir, "consumer.ts"),
    [
      'import { circleRectOverlap, createCamera, createCollisionKernel, createFixedStepLoop, resolveCollisionKernelWasmUrl, type Camera, type CollisionKernelOptions } from "@catalog/engine";',
      'import wasmPath from "@catalog/engine/wasm/collision-kernel.wasm";',
      'import viteWasmPath from "@catalog/engine/wasm/collision-kernel.wasm?url";',
      "",
      "const camera: Camera = createCamera({ viewportWidth: 320, viewportHeight: 180 });",
      "camera.pan(8, 4).zoomTo(2).setViewport(640, 360).clearFollow().update();",
      "const cameraX: number = camera.visibleRect().x;",
      "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
      "loop.stop();",
      "const overlaps: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
      "const defaultWasmUrl: string = resolveCollisionKernelWasmUrl();",
      "const kernelOptions: CollisionKernelOptions = { url: String(wasmPath), onFallback: (diagnostic) => { if (diagnostic.reason === 'fetch') console.info(diagnostic.url); } };",
      "const viteWasmUrl: string = String(viteWasmPath).replaceAll('\\\\', '/');",
      "if (!defaultWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected default wasm url');",
      "if (!viteWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected Vite wasm url');",
      "const kernel = await createCollisionKernel(kernelOptions);",
      "const maybeFastOverlap: boolean = kernel.circleRectOverlap({ x: 0, y: 0, r: 1 }, { x: 5, y: 5, w: 1, h: 1 });",
      "if (!Number.isFinite(cameraX) || overlaps !== true || maybeFastOverlap !== false) throw new Error('unexpected engine result');",
    ].join("\n"),
  );

  await $`bun.cmd install --no-progress`.cwd(consumerDir).quiet();
  await $`bun.cmd ./consumer.ts`.cwd(consumerDir).quiet();
  await $`bun.cmd ./core-consumer.ts`.cwd(consumerDir).quiet();
  await $`bun.cmd x tsc --noEmit`.cwd(consumerDir).quiet();
  } finally {
    rmSync(consumerDir, { force: true, recursive: true });
  }
} finally {
  rmSync(packDir, { force: true, recursive: true });
}
