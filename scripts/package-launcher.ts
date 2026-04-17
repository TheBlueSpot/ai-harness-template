import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { buildUiBundle } from "../harness/cli/src/ui-build";

const ALL_LAUNCHER_TARGETS = [
  "bun-windows-x64",
  "bun-windows-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-linux-x64",
  "bun-linux-arm64"
] as const;

const repoRoot = path.resolve(import.meta.dir, "..");
const releaseRoot = path.join(repoRoot, "release");
const entrypoint = path.join(repoRoot, "harness/cli/src/index.ts");
const buildAll = process.argv.includes("--all");

process.chdir(repoRoot);

const targets: string[] = buildAll ? [...ALL_LAUNCHER_TARGETS] : [resolveCurrentCompileTarget()];

await buildUiBundle({ minify: true });

for (const target of targets) {
  await packageLauncherTarget(target);
}

async function packageLauncherTarget(target: string) {
  const targetDir = path.join(releaseRoot, target);
  const binaryName = target.includes("windows") ? "pi-harness.exe" : "pi-harness";
  const binaryPath = path.join(targetDir, binaryName);

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "bun",
    minify: true,
    sourcemap: "none",
    compile: {
      target: target as never,
      outfile: binaryPath
    }
  });

  if (!result.success) {
    throw new AggregateError(
      result.logs.map((log) => new Error(log.message)),
      `Launcher compile failed for ${target}`
    );
  }

  await cp(path.join(repoRoot, "dist/ui"), path.join(targetDir, "dist/ui"), { recursive: true });
  console.log(`[package:launcher] ${target} -> ${path.relative(repoRoot, binaryPath)}`);
}

function resolveCurrentCompileTarget() {
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "bun-windows-arm64" : "bun-windows-x64";
  }

  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64";
  }

  if (process.platform === "linux") {
    return process.arch === "arm64" ? "bun-linux-arm64" : "bun-linux-x64";
  }

  throw new Error(`Unsupported platform for launcher packaging: ${process.platform}/${process.arch}`);
}
