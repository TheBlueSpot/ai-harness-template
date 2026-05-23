import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

type PackOutput = Array<{ filename: string }>;

const rootDir = join(import.meta.dir, "..");
const supportedViteVersions = ["8.0.14"] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const packDir = mkdtempSync(join(tmpdir(), "catalog-engine-vite-pack-"));

try {
  const tarballOutput = await $`npm.cmd pack --json --pack-destination ${packDir}`.cwd(rootDir).text();
  const [tarball] = JSON.parse(tarballOutput) as PackOutput;
  assert(tarball?.filename, "npm pack did not produce an engine tarball");

  for (const viteVersion of supportedViteVersions) {
    const consumerDir = mkdtempSync(join(tmpdir(), `catalog-engine-vite-${viteVersion.replaceAll(".", "-")}-`));

    try {
      writeFileSync(
        join(consumerDir, "package.json"),
        JSON.stringify(
          {
            type: "module",
            scripts: {
              build: "vite build"
            },
            dependencies: {
              "@catalog/engine": join(packDir, tarball.filename)
            },
            devDependencies: {
              vite: viteVersion
            }
          },
          null,
          2
        )
      );
      writeFileSync(join(consumerDir, "index.html"), '<script type="module" src="/src/main.ts"></script>\n');
      writeFileSync(
        join(consumerDir, "vite.config.ts"),
        ["import { defineConfig } from 'vite';", "", "export default defineConfig({ build: { assetsInlineLimit: 0 } });", ""].join(
          "\n"
        )
      );
      mkdirSync(join(consumerDir, "src"));
      writeFileSync(
        join(consumerDir, "src", "main.ts"),
        [
          'import { createCollisionKernel } from "@catalog/engine";',
          'import collisionKernelWasmUrl from "@catalog/engine/wasm/collision-kernel.wasm?url";',
          "",
          "const wasmUrl: string = collisionKernelWasmUrl;",
          "void createCollisionKernel(wasmUrl).then((kernel) => {",
          "  document.body.dataset.backend = kernel.backend;",
          "  document.body.dataset.asset = wasmUrl;",
          "});",
          ""
        ].join("\n")
      );

      await $`bun.cmd install --no-progress`.cwd(consumerDir).quiet();
      await $`bun.cmd run build`.cwd(consumerDir).quiet();
      const emittedFiles = readdirSync(join(consumerDir, "dist", "assets"));

      assert(
        emittedFiles.some((file) => /^collision-kernel-[\w-]+\.wasm$/.test(file)),
        `Vite ${viteVersion} build did not emit the engine WASM asset as a rewritten URL`
      );
    } finally {
      rmSync(consumerDir, { force: true, recursive: true });
    }
  }
} finally {
  rmSync(packDir, { force: true, recursive: true });
}
