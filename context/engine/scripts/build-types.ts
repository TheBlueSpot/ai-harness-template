import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { $ } from "bun";

const distDir = join(import.meta.dir, "..", "dist");

rmSync(distDir, { force: true, recursive: true });
await $`bun x tsc -p ./tsconfig.types.json`;

function rewriteDeclarationImports(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      rewriteDeclarationImports(path);
      continue;
    }
    if (!path.endsWith(".d.ts")) continue;

    const source = readFileSync(path, "utf8");
    const rewritten = source.replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");
    if (rewritten !== source) {
      writeFileSync(path, rewritten);
    }
  }
}

function assertNoElidedAnyDeclarations(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      assertNoElidedAnyDeclarations(path);
      continue;
    }
    if (!path.endsWith(".d.ts")) continue;

    const source = readFileSync(path, "utf8");
    if (source.includes("/*elided*/ any")) {
      throw new Error(`declaration emit leaked elided any in ${path}`);
    }
  }
}

function assertCameraDeclarationsStayPublic(dir: string) {
  const cameraDeclarationPath = join(dir, "src", "canvas", "camera.d.ts");
  const source = readFileSync(cameraDeclarationPath, "utf8");

  if (source.includes("any")) {
    throw new Error(`${basename(cameraDeclarationPath)} must not expose any in the public camera surface`);
  }

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
    if (!source.includes(signature)) {
      throw new Error(`${basename(cameraDeclarationPath)} lost public camera signature: ${signature}`);
    }
  }
}

rewriteDeclarationImports(distDir);
assertNoElidedAnyDeclarations(distDir);
assertCameraDeclarationsStayPublic(distDir);
