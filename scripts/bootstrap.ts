import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CliUsageError, parseCliOptions } from "../harness/cli/src/cli-options";

const HELP = `Usage: bun run bootstrap [--server-only] [--open|--no-open] [--skip-playwright] [--help]`;

const repoRoot = path.resolve(import.meta.dir, "..");
process.chdir(repoRoot);

let parsedOptions: ReturnType<typeof parseCliOptions<"--server-only" | "--open" | "--no-open" | "--skip-playwright" | "--help">>;
try {
  parsedOptions = parseCliOptions(process.argv.slice(2), {
    flags: ["--server-only", "--open", "--no-open", "--skip-playwright", "--help"],
    conflicts: [["--open", "--no-open"]]
  });
} catch (error) {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  throw error;
}
if (parsedOptions.flags.has("--help")) {
  console.log(HELP);
  process.exit(0);
}

const serverOnly = parsedOptions.flags.has("--server-only");
const forceOpen = parsedOptions.flags.has("--open");
const disableOpen = parsedOptions.flags.has("--no-open");
const skipPlaywright = parsedOptions.flags.has("--skip-playwright");
const rawPort = Bun.env.HARNESS_PORT?.trim();
const configuredPort = rawPort ? Number(rawPort) : Number.NaN;
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;

await ensureDependenciesInstalled();
await ensurePlaywrightChromium();

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

async function ensurePlaywrightChromium() {
  if (skipPlaywright) {
    return;
  }

  if (await hasChromiumInstalled()) {
    return;
  }

  console.log("[bootstrap] installing playwright chromium (one-time)");
  const installProcess = Bun.spawn({
    cmd: [process.execPath, "x", "playwright", "install", "chromium"],
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit"
  });
  const exitCode = await installProcess.exited;
  if (exitCode !== 0) {
    console.warn(`[bootstrap] playwright chromium install exited ${exitCode}; \`bun run screenshot\` will fail until resolved`);
  }
}

async function hasChromiumInstalled() {
  const cacheRoot = resolvePlaywrightCacheRoot();
  if (!cacheRoot || !existsSync(cacheRoot)) {
    return false;
  }

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(cacheRoot);
    return entries.some((entry) => entry.startsWith("chromium"));
  } catch {
    return false;
  }
}

function resolvePlaywrightCacheRoot() {
  const explicit = Bun.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (explicit && explicit !== "0") {
    return explicit;
  }

  if (process.platform === "win32") {
    const localAppData = Bun.env.LOCALAPPDATA?.trim();
    if (!localAppData) {
      return undefined;
    }
    return path.join(localAppData, "ms-playwright");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  }

  return path.join(os.homedir(), ".cache", "ms-playwright");
}
