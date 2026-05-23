import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

rewriteDeclarationImports(distDir);
assertNoElidedAnyDeclarations(distDir);
