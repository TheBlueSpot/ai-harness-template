import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
process.chdir(repoRoot);

const serverOnly = process.argv.includes("--server-only");
const forceOpen = process.argv.includes("--open");
const disableOpen = process.argv.includes("--no-open");
const rawPort = Bun.env.HARNESS_PORT?.trim();
const configuredPort = rawPort ? Number(rawPort) : Number.NaN;
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;

await ensureDependenciesInstalled();

const [{ buildUiBundle }, { launchHarnessServerWithRecovery }] = await Promise.all([
  import("../harness/cli/src/ui-build"),
  import("../harness/cli/src/launch-harness")
]);

await buildUiBundle();

await launchHarnessServerWithRecovery({
  port,
  serverOnly,
  openBrowser: forceOpen || (!serverOnly && !disableOpen),
  launchMode: "source",
  allowPortFallback: !rawPort
});

async function ensureDependenciesInstalled() {
  if (existsSync(path.join(repoRoot, "node_modules"))) {
    return;
  }

  console.log("[bootstrap] node_modules missing, running bun install");
  const installProcess = Bun.spawn({
    cmd: [process.execPath, "install"],
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit"
  });
  const exitCode = await installProcess.exited;
  if (exitCode !== 0) {
    throw new Error(`bun install failed with exit code ${exitCode}`);
  }
}
