import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";
import { SolidPlugin } from "@dschz/bun-plugin-solid";
import tailwindPlugin from "bun-plugin-tailwind";

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const defaultSmokeRoot = path.join(repoRoot, ".local", "project-chat-first-paint");
const defaultFixtureSourcePath = path.join(repoRoot, "harness", "ui", "src", "components", "chat-panel.browser-fixture.tsx");
const noResizeObserverSmokeRoot = path.join(repoRoot, ".local", "project-chat-first-paint-no-resize-observer");
const noResizeObserverFixtureSourcePath = path.join(
  repoRoot,
  "harness",
  "ui",
  "src",
  "components",
  "chat-panel.no-resize-observer.browser-fixture.tsx"
);
const runnerPath = path.join(import.meta.dir, "chat-panel.browser-runner.mjs");

test("ChatPanel renders project chat virtual transcript on first browser load", async () => {
  const fixtureUrl = await buildFixture(defaultSmokeRoot, defaultFixtureSourcePath);
  const result = await runBrowserCheck(fixtureUrl);
  expect(result).toContain("browser project chat first-load check passed");
}, 60_000);

test("ChatPanel recovers first project chat paint without ResizeObserver callbacks", async () => {
  const fixtureUrl = await buildFixture(noResizeObserverSmokeRoot, noResizeObserverFixtureSourcePath);
  const result = await runBrowserCheck(fixtureUrl);
  expect(result).toContain("browser project chat first-load check passed");
}, 60_000);

async function buildFixture(smokeRoot: string, fixtureSourcePath: string) {
  const outDir = path.join(smokeRoot, "dist");
  const fixtureEntry = path.join(smokeRoot, "main.tsx");
  await rm(smokeRoot, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(fixtureEntry, `import "${toImportPath(smokeRoot, fixtureSourcePath)}";\n`);

  const result = await Bun.build({
    entrypoints: [fixtureEntry],
    outdir: outDir,
    format: "iife",
    target: "browser",
    sourcemap: "none",
    plugins: [
      SolidPlugin({
        generate: "dom",
        hydratable: false,
        sourceMaps: false,
        debug: false
      }),
      tailwindPlugin
    ]
  });

  if (!result.success) {
    throw new AggregateError(
      result.logs.map((log) => new Error(log.message)),
      "ChatPanel browser fixture build failed"
    );
  }

  await writeFile(
    path.join(outDir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Chat First Paint</title>
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>
`
  );
  return pathToFileURL(path.join(outDir, "index.html")).href;
}

async function runBrowserCheck(baseUrl: string) {
  const proc = Bun.spawn({
    cmd: ["node", runnerPath],
    cwd: repoRoot,
    env: { ...process.env, CHAT_PANEL_BROWSER_URL: baseUrl },
    stdout: "pipe",
    stderr: "pipe"
  });
  const completed = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 45_000));
  const result = await Promise.race([completed, timeout]);
  if (result === "timeout") {
    proc.kill();
    await proc.exited.catch(() => undefined);
    throw new Error("ChatPanel browser runner timed out after 45000ms");
  }
  const [stdout, stderr, exitCode] = result;
  if (exitCode !== 0) {
    throw new Error(`ChatPanel browser runner failed with exit ${exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  return stdout.trim();
}

function toImportPath(smokeRoot: string, targetPath: string) {
  const relativePath = path.relative(smokeRoot, targetPath).replaceAll("\\", "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}
