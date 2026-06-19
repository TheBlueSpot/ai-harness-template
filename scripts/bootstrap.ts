import { existsSync } from "node:fs";
import path from "node:path";
import { CliUsageError, parseCliOptions } from "../harness/cli/src/cli-options";

const HELP = `Usage: bun run bootstrap [--server-only] [--open|--no-open] [--skip-browser-check] [--help]`;

const repoRoot = path.resolve(import.meta.dir, "..");
process.chdir(repoRoot);

let parsedOptions: ReturnType<typeof parseCliOptions<"--server-only" | "--open" | "--no-open" | "--skip-browser-check" | "--skip-playwright" | "--help">>;
try {
  parsedOptions = parseCliOptions(process.argv.slice(2), {
    flags: ["--server-only", "--open", "--no-open", "--skip-browser-check", "--skip-playwright", "--help"],
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
const skipBrowserCheck = parsedOptions.flags.has("--skip-browser-check") || parsedOptions.flags.has("--skip-playwright");
const rawPort = Bun.env.HARNESS_PORT?.trim();
const configuredPort = rawPort ? Number(rawPort) : Number.NaN;
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;

await ensureDependenciesInstalled();
ensureCdpBrowserAvailable();

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

function ensureCdpBrowserAvailable() {
  if (skipBrowserCheck) {
    return;
  }

  if (findCdpBrowser()) {
    return;
  }

  console.warn("[bootstrap] Chrome or Edge was not detected; `bun run screenshot` needs a CDP-capable browser. Set CHROME_PATH if it is installed in a custom location.");
}

function findCdpBrowser() {
  const explicit = Bun.env.CHROME_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  if (process.platform === "win32") {
    return [
      path.join(Bun.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(Bun.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(Bun.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(Bun.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
      path.join(Bun.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")
    ].find((candidate) => candidate && existsSync(candidate));
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ].find((candidate) => existsSync(candidate));
  }

  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"].find((candidate) => {
    const probe = Bun.spawnSync({
      cmd: ["which", candidate],
      stdout: "ignore",
      stderr: "ignore"
    });
    return probe.exitCode === 0;
  });
}
