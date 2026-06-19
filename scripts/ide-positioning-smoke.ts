import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SolidPlugin } from "@dschz/bun-plugin-solid";
import tailwindPlugin from "bun-plugin-tailwind";

const repoRoot = path.resolve(import.meta.dir, "..");
const smokeRoot = path.join(repoRoot, ".local", "ide-positioning-smoke");
const outDir = path.join(smokeRoot, "dist");
const fixtureEntry = path.join(smokeRoot, "main.tsx");
const progressPath = path.join(smokeRoot, "progress.log");

async function main() {
  await progress("building fixture");
  await buildFixture();
  await progress("serving fixture");
  const server = serveFixture();
  try {
    await runBrowserCheck(`http://localhost:${server.port}/`);
    await progress("passed");
    console.log("IDE positioning smoke passed: visual word end + s => words tail");
  } finally {
    server.stop(true);
  }
}

async function buildFixture() {
  await rm(smokeRoot, { recursive: true, force: true });
  await mkdir(smokeRoot, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await progress("writing fixture");
  await writeFile(fixtureEntry, fixtureSource());

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
      "IDE positioning smoke fixture build failed"
    );
  }
  await progress("fixture built");

  await writeFile(
    path.join(outDir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IDE Positioning Smoke</title>
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>
`
  );
}

function serveFixture() {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const assetName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const assetPath = path.resolve(outDir, assetName);
      if (!isPathWithin(outDir, assetPath)) {
        return new Response("Not found", { status: 404 });
      }

      const file = Bun.file(assetPath);
      return new Response(file);
    }
  });
}

function fixtureSource() {
  return `/** @jsxImportSource solid-js */
import { onMount } from "solid-js";
import { render } from "solid-js/web";
import "${toImportPath(path.join(repoRoot, "harness/ui/src/styles.css"))}";
import { createWorkspaceProjectState } from "${toImportPath(path.join(repoRoot, "harness/shared/protocol.ts"))}";
import { UiStateProviders } from "${toImportPath(path.join(repoRoot, "harness/ui/src/store-providers.tsx"))}";
import { harnessStore } from "${toImportPath(path.join(repoRoot, "harness/ui/src/harness-store.ts"))}";
import { IdeWorkbench } from "${toImportPath(path.join(repoRoot, "harness/ui/src/ide/ide-workbench.tsx"))}";
import { ideStore } from "${toImportPath(path.join(repoRoot, "harness/ui/src/ide/ide-store.ts"))}";

let seededProject;

function seedWorkspace() {
  if (seededProject) {
    return seededProject;
  }
  seededProject = createWorkspaceProjectState({
      id: "project-smoke",
      name: "Smoke",
      rootPath: "C:/repo"
  });
  harnessStore.actions.setCommandDispatcher(() => undefined);
  harnessStore.applyServerEvent({
    type: "workspace.updated",
    requestId: "req-workspace",
    payload: {
      workspace: {
        workspaceModes: [],
        projects: [seededProject],
        activeProjectId: seededProject.id
      }
    }
  });
  harnessStore.setActiveSurface("ide");
  applyIdeFixtureState(seededProject);
  return seededProject;
}

function applyIdeFixtureState(project) {
  ideStore.resetForTests({
    treeLoading: false,
    treeEntries: [{ path: "src/smoke.ts", name: "smoke.ts", kind: "file", depth: 0 }],
    openPaths: ["src/smoke.ts"],
    activePath: "src/smoke.ts",
    filesByPath: {
      "src/smoke.ts": {
        projectId: project.id,
        path: "src/smoke.ts",
        name: "smoke.ts",
        language: "Plain Text",
        encoding: "UTF-8",
        sizeBytes: 9,
        lineCount: 1,
        isBinary: false,
        tooLarge: false,
        content: "word tail",
        contentLines: ["word tail"]
      }
    }
  });
}

function Fixture() {
  const project = seedWorkspace();
  onMount(() => {
    window.setTimeout(() => {
      applyIdeFixtureState(project);
    }, 20);
  });

  return <div style={{ height: "520px", width: "900px" }}><IdeWorkbench /></div>;
}

render(() => (
  <UiStateProviders>
    <Fixture />
  </UiStateProviders>
), document.getElementById("root")!);
`;
}

function toImportPath(targetPath: string) {
  const relativePath = path.relative(smokeRoot, targetPath).replaceAll("\\", "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function isPathWithin(directory: string, candidatePath: string) {
  const relativePath = path.relative(directory, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function runBrowserCheck(baseUrl: string) {
  await progress("launching browser runner");
  const runnerPath = path.join(import.meta.dir, "ide-positioning-playwright-runner.mjs");
  const proc = Bun.spawn({
    cmd: ["node", runnerPath],
    cwd: repoRoot,
    env: { ...process.env, IDE_POSITIONING_URL: baseUrl },
    stdout: "pipe",
    stderr: "pipe"
  });

  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 30_000));
  const completed = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  const result = await Promise.race([completed, timeout]);
  if (result === "timeout") {
    proc.kill();
    await proc.exited.catch(() => undefined);
    throw new Error("IDE positioning browser runner timed out after 30000ms");
  }

  const [stdout, stderr, exitCode] = result;
  if (stdout.trim()) {
    console.log(stdout.trim());
  }
  if (exitCode !== 0) {
    throw new Error(`IDE positioning browser runner failed with exit ${exitCode}.\n${stderr || stdout}`);
  }
}

async function progress(message: string) {
  const line = `[ide-positioning] ${message}`;
  console.log(line);
  await mkdir(smokeRoot, { recursive: true });
  await appendFile(progressPath, `${new Date().toISOString()} ${line}\n`).catch(() => undefined);
}

await main();
