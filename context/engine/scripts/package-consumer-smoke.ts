import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
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

function packagePathMatchesExactCasing(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  let currentDir = rootDir;

  for (const part of parts) {
    const entries = new Set(readdirSync(currentDir));
    if (!entries.has(part)) return false;
    currentDir = join(currentDir, part);
  }

  return true;
}

const requiredPackageArtifacts: Array<{ label: string; relativePath: string }> = [
  { label: "browser runtime build", relativePath: "browser/engine.js" },
  { label: "generated declaration entry", relativePath: "dist/src/index.d.ts" },
  { label: "generated DOM-free core module", relativePath: "dist/core.js" },
  { label: "generated DOM-free core declarations", relativePath: "dist/src/core.d.ts" },
  { label: "WASM asset", relativePath: "wasm/collision-kernel.wasm" },
  { label: "WASM asset type declaration", relativePath: "wasm/collision-kernel.wasm.d.ts" },
];

function assertPackageArtifacts() {
  const missingArtifacts = requiredPackageArtifacts.filter((artifact) => !packagePathExists(artifact.relativePath));

  assert(
    missingArtifacts.length === 0,
    [
      "package smoke cannot run from a partial engine artifact state.",
      "Missing artifacts:",
      ...missingArtifacts.map((artifact) => `- ${artifact.label}: ${artifact.relativePath}`),
      'Run "bun.cmd run build" from ./engine before smoke:package.',
    ].join("\n"),
  );
}

function assertCameraDeclarationsStayPublic(source: string) {
  for (const signature of [
    "pan(dx: number, dy: number): Camera;",
    "centerOn(point: Point, amount?: number): Camera;",
    "follow(target: CameraTarget | null, followOptions?: FollowOptions): Camera;",
    "clearFollow(): Camera;",
    "zoomTo(value: number, anchor?: Point): Camera;",
    "zoomBy(factor: number, anchor?: Point): Camera;",
    "setViewport(width: number, height: number): Camera;",
    "setBounds(nextBounds: CameraBounds | null): Camera;",
    "export declare function createCamera(options: CameraOptions): Camera;",
  ]) {
    assert(source.includes(signature), `camera declarations lost public fluent signature: ${signature}`);
  }
}

function findAncestorTool(startDir: string, relativeToolPath: string) {
  let current = startDir;
  const { root } = parse(startDir);
  while (true) {
    const candidate = join(current, relativeToolPath);
    if (existsSync(candidate)) return candidate;
    if (current === root) return undefined;
    current = dirname(current);
  }
}

assert(manifest.name === "@catalog/engine", "package name must stay stable for consumers");
assert(/^0\.1\.\d+$/.test(manifest.version), "package version must stay inside the documented 0.1.x contract");
assert(manifest.private === false, "package must be publishable");
assert(manifest.types === "./dist/src/index.d.ts", "top-level types must point at generated declarations");
assert(manifest.files?.includes("browser/"), "package files must include the browser build");
assert(manifest.files?.includes("dist/"), "package files must include generated declarations");
assert(manifest.files?.includes("wasm/"), "package files must include WASM assets");
assert(manifest.files?.includes("readme.md"), "package files must include the documented README path");
for (const packageFile of manifest.files ?? []) {
  assert(packagePathMatchesExactCasing(packageFile), `package files entry must match on-disk casing exactly: ${packageFile}`);
}

const rootExport = manifest.exports?.["."] as { import?: string; types?: string } | undefined;
assert(rootExport?.import === "./browser/engine.js", "root import must resolve to the browser ESM build");
assert(rootExport?.types === "./dist/src/index.d.ts", "root export types must resolve to generated declarations");

const coreExport = manifest.exports?.["./core"] as { import?: string; types?: string } | undefined;
assert(coreExport?.import === "./dist/core.js", "core import must resolve to the DOM-free emitted module");
assert(coreExport?.types === "./dist/src/core.d.ts", "core export types must resolve to generated declarations");

const browserExport = manifest.exports?.["./browser"] as { import?: string; types?: string } | undefined;
assert(browserExport?.import === "./browser/engine.js", "browser subpath import must resolve to the browser ESM build");
assert(browserExport?.types === "./dist/src/index.d.ts", "browser subpath types must resolve to generated root declarations");

const wasmExport = manifest.exports?.["./wasm/collision-kernel.wasm"] as { default?: string } | undefined;
assert(wasmExport?.default === "./wasm/collision-kernel.wasm", "WASM asset export must stay explicit");
assert(wasmExport?.types === "./wasm/collision-kernel.wasm.d.ts", "WASM asset export must expose an asset URL type");
const viteWasmUrlExport = manifest.exports?.["./wasm/collision-kernel.wasm?url"] as { default?: string } | undefined;
assert(viteWasmUrlExport?.default === "./wasm/collision-kernel.wasm", "Vite WASM URL export must point at the same asset");
assert(viteWasmUrlExport?.types === "./wasm/collision-kernel.wasm.d.ts", "Vite WASM URL export must expose an asset URL type");

assertPackageArtifacts();

const declarationEntry = readFileSync(join(rootDir, "dist/src/index.d.ts"), "utf8");
assert(!declarationEntry.includes(".ts\"") && !declarationEntry.includes(".ts'"), "declarations must not expose .ts specifiers");
const cameraDeclarations = readFileSync(join(rootDir, "dist/src/canvas/camera.d.ts"), "utf8");
assert(!cameraDeclarations.includes("/*elided*/ any"), "camera declarations must preserve explicit fluent return types");
assert(!cameraDeclarations.includes("any"), "camera declarations must not expose any in the public camera surface");
assertCameraDeclarationsStayPublic(cameraDeclarations);

const browserBuild = await import(pathToFileURL(join(rootDir, "browser/engine.js")).href);
const coreBuild = await import(pathToFileURL(join(rootDir, "dist/core.js")).href);

function getDeclarationValueExports(source: string) {
  const declarationValueExports = new Set<string>();
  for (const [, clause] of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*["'][^"']+["'];/g)) {
    for (const rawExport of clause.split(",")) {
      const trimmedExport = rawExport.trim();
      if (!trimmedExport || trimmedExport.startsWith("type ")) continue;

      const exportedName = trimmedExport.split(/\s+as\s+/).at(-1)?.trim();
      assert(exportedName, `could not parse declaration export: ${trimmedExport}`);
      declarationValueExports.add(exportedName);
    }
  }
  return declarationValueExports;
}

function assertRuntimeMatchesDeclarations(label: string, runtimeExports: Record<string, unknown>, declarationSource: string) {
  const declarationValueExports = getDeclarationValueExports(declarationSource);
  const runtimeValueExports = new Set(Object.keys(runtimeExports));
  const missingRuntimeExports = [...declarationValueExports].filter((exportName) => !runtimeValueExports.has(exportName));
  const extraRuntimeExports = [...runtimeValueExports].filter((exportName) => !declarationValueExports.has(exportName));
  assert(
    missingRuntimeExports.length === 0 && extraRuntimeExports.length === 0,
    [
      `${label} runtime exports must match generated declaration value exports.`,
      `Missing from ${label} runtime:`,
      ...(missingRuntimeExports.length ? missingRuntimeExports.map((exportName) => `- ${exportName}`) : ["- none"]),
      `Extra in ${label} runtime:`,
      ...(extraRuntimeExports.length ? extraRuntimeExports.map((exportName) => `- ${exportName}`) : ["- none"]),
      'Run "bun.cmd run build" from ./engine before smoke:package.',
    ].join("\n"),
  );
}

assertRuntimeMatchesDeclarations("browser", browserBuild, declarationEntry);
assertRuntimeMatchesDeclarations("core", coreBuild, readFileSync(join(rootDir, "dist/src/core.d.ts"), "utf8"));

for (const exportName of [
  "createFixedStepLoop",
  "createCollisionBroadphase",
  "createCollisionKernel",
  "resolveCollisionKernelWasmUrl",
  "circleRectOverlap",
]) {
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
    const tscPath = findAncestorTool(rootDir, join("node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc"));

    assert(tscPath, "local TypeScript install is required for offline consumer typecheck");

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
          include: ["consumer.ts", "core-consumer.ts", "browser-consumer.ts"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "tsconfig.nodenext.json"),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ["ES2022", "DOM"],
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
            target: "ES2022",
          },
          include: ["consumer.ts", "core-consumer.ts", "browser-consumer.ts"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "core-consumer.ts"),
      [
        'import { circleRectOverlap, createAabb, createCollisionBroadphase, createObjectPool, createStage, gridKey } from "@catalog/engine/core";',
        "",
        "const key: string = gridKey({ x: 2, y: 3 });",
        "const hit: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
        "const broadphase = createCollisionBroadphase<string>();",
        "broadphase.upsert('player', createAabb(0, 0, 10, 10));",
        "broadphase.upsert('coin', createAabb(8, 8, 2, 2));",
        "const pool = createObjectPool({ create: () => ({ active: false }), reset: (item) => { item.active = false; } });",
        "const entity = pool.acquire();",
        "entity.active = true;",
        "const stage = createStage<typeof entity>();",
        "stage.spawn(entity);",
        "if (key !== '2,3' || hit !== true || broadphase.pairs().length !== 1 || stage.count() !== 1) throw new Error('unexpected core result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "consumer.ts"),
      [
        'import { circleRectOverlap, createAabb, createCamera, createCollisionBroadphase, createCollisionKernel, createFixedStepLoop, createTileset, extractCollisionRects, generateTileMap, getTileAt, resolveCollisionKernelWasmUrl, seededRandom, type Camera, type CollisionKernelOptions, type TileMap } from "@catalog/engine";',
        'import wasmPath from "@catalog/engine/wasm/collision-kernel.wasm";',
        'import viteWasmPath from "@catalog/engine/wasm/collision-kernel.wasm?url";',
        "",
        "const camera: Camera = createCamera({ viewportWidth: 320, viewportHeight: 180 });",
        "camera.pan(8, 4).zoomTo(2).setViewport(640, 360).clearFollow().update();",
        "const cameraX: number = camera.visibleRect().x;",
        "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
        "loop.stop();",
        "const broadphase = createCollisionBroadphase<number>();",
        "broadphase.upsert(1, createAabb(0, 0, 10, 10));",
        "broadphase.upsert(2, createAabb(20, 20, 5, 5));",
        "const tileset = createTileset({ tileSize: 8, columns: 2, tileCount: 2, tiles: { 1: { tags: ['solid'], solid: true } } });",
        "const map: TileMap = generateTileMap({ tileset, width: 4, height: 4, baseTile: 0, seed: 'consumer-map', rules: [{ type: 'border', tile: 1 }] });",
        "const collisionRects = extractCollisionRects(map);",
        "const seeded = seededRandom('consumer-map')();",
        "const overlaps: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
        "const defaultWasmUrl: string = resolveCollisionKernelWasmUrl();",
        "const kernelOptions: CollisionKernelOptions = { url: String(wasmPath), onFallback: (diagnostic) => { if (diagnostic.reason === 'fetch') console.info(diagnostic.url); } };",
        "const viteWasmUrl: string = String(viteWasmPath).replaceAll('\\\\', '/');",
        "if (!defaultWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected default wasm url');",
        "if (!viteWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected Vite wasm url');",
        "const kernel = await createCollisionKernel(kernelOptions);",
        "const maybeFastOverlap: boolean = kernel.circleRectOverlap({ x: 0, y: 0, r: 1 }, { x: 5, y: 5, w: 1, h: 1 });",
        "if (!Number.isFinite(cameraX) || broadphase.query(createAabb(1, 1, 1, 1))[0] !== 1 || getTileAt(map, 0, 0)?.tileId !== 1 || collisionRects.length === 0 || !Number.isFinite(seeded) || overlaps !== true || maybeFastOverlap !== false) throw new Error('unexpected engine result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "browser-consumer.ts"),
      [
        'import { createFixedStepLoop, init } from "@catalog/engine/browser";',
        "",
        "const options: Parameters<typeof init>[0] = { width: 320, height: 180 };",
        "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
        "loop.stop();",
        "if (typeof init !== 'function' || options.width !== 320) throw new Error('unexpected browser subpath result');",
      ].join("\n"),
    );

    await $`npm.cmd install --offline --ignore-scripts --no-audit --no-fund --package-lock=false`.cwd(consumerDir).quiet();
    await $`bun.cmd ./consumer.ts`.cwd(consumerDir).quiet();
    await $`bun.cmd ./core-consumer.ts`.cwd(consumerDir).quiet();
    await $`bun.cmd ./browser-consumer.ts`.cwd(consumerDir).quiet();
    await $`${tscPath} --noEmit`.cwd(consumerDir).quiet();
    await $`${tscPath} --noEmit -p ./tsconfig.nodenext.json`.cwd(consumerDir).quiet();
  } finally {
    rmSync(consumerDir, { force: true, recursive: true });
  }
} finally {
  rmSync(packDir, { force: true, recursive: true });
}
