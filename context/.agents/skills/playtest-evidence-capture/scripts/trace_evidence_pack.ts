import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Locator, type Page } from "playwright";

type Target = {
  url: string;
  slug: string | null;
  resolvedFrom: "url" | "slug";
};

type ScreenshotArtifact = {
  id: string;
  kind: "title" | "post-input" | "post-restart" | "final";
  path: string;
  note: string;
};

type TraceEvidencePack = {
  schemaVersion: 1;
  captureKind: "trace-evidence-pack";
  target: Target & { directBrowserAssumption: true };
  trace: {
    path: string;
    screenshots: true;
    snapshots: true;
    filmstripAvailableInTraceViewer: true;
    viewerCommand: string;
  };
  screenshots: ScreenshotArtifact[];
  interactions: {
    attempted: string[];
    completed: string[];
    restartSelectorUsed: string | null;
    bounded: true;
  };
  metadata: {
    capturedAt: string;
    pageTitle: string;
    pageUrl: string;
    userAgent: string;
    notes: string[];
  };
};

type CliOptions = {
  url?: string;
  slug?: string;
  out?: string;
  trace?: string;
  screenshotsDir?: string;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  postActionWaitMs: number;
  viewportWidth: number;
  viewportHeight: number;
  restartSelectors: string[];
  dryRun?: boolean;
};

const TRACE_STOP_TIMEOUT_MS = 20_000;

async function withTimeout<T>(label: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function printHelpAndExit(): never {
  console.log([
    "trace_evidence_pack",
    "",
    "Usage:",
    "  bun.cmd .agents/skills/playtest-evidence-capture/scripts/trace_evidence_pack.ts --slug some-game --out .local/some-game-trace-evidence.json",
    "  bun.cmd .agents/skills/playtest-evidence-capture/scripts/trace_evidence_pack.ts --url http://localhost:3000 --trace .local/manual-trace.zip",
    "",
    "Options:",
    "  --url <url>                    Direct browser target URL.",
    "  --slug <slug>                  Resolve ./<slug>/index.html as the target.",
    "  --out <file>                   Write evidence-pack JSON.",
    "  --trace <file>                 Write Playwright trace zip.",
    "  --screenshots-dir <dir>        Write targeted screenshots into this directory.",
    "  --navigation-timeout-ms <ms>   Page navigation timeout.",
    "  --action-timeout-ms <ms>       Bounded interaction timeout.",
    "  --post-action-wait-ms <ms>     Settle wait before screenshots.",
    "  --viewport-width <px>          Browser viewport width.",
    "  --viewport-height <px>         Browser viewport height.",
    "  --restart-selector <css>       Extra restart/retry selector.",
    "  --dry-run                      Resolve output paths without launching a browser.",
  ].join("\n"));
  process.exit(0);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    navigationTimeoutMs: 15_000,
    actionTimeoutMs: 1_500,
    postActionWaitMs: 450,
    viewportWidth: 1280,
    viewportHeight: 720,
    restartSelectors: ["button:has-text('Restart')", "button:has-text('Retry')", "button:has-text('Play Again')"],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--help" || current === "-h") {
      printHelpAndExit();
    }

    if (
      [
        "--url",
        "--slug",
        "--out",
        "--trace",
        "--screenshots-dir",
        "--navigation-timeout-ms",
        "--action-timeout-ms",
        "--post-action-wait-ms",
        "--viewport-width",
        "--viewport-height",
        "--restart-selector",
      ].includes(current) &&
      !next
    ) {
      throw new Error(`Missing value for ${current}`);
    }

    if (current === "--url") {
      options.url = next;
      index += 1;
      continue;
    }
    if (current === "--slug") {
      options.slug = next;
      index += 1;
      continue;
    }
    if (current === "--out") {
      options.out = next;
      index += 1;
      continue;
    }
    if (current === "--trace") {
      options.trace = next;
      index += 1;
      continue;
    }
    if (current === "--screenshots-dir") {
      options.screenshotsDir = next;
      index += 1;
      continue;
    }
    if (current === "--navigation-timeout-ms") {
      options.navigationTimeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (current === "--action-timeout-ms") {
      options.actionTimeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (current === "--post-action-wait-ms") {
      options.postActionWaitMs = Number(next);
      index += 1;
      continue;
    }
    if (current === "--viewport-width") {
      options.viewportWidth = Number(next);
      index += 1;
      continue;
    }
    if (current === "--viewport-height") {
      options.viewportHeight = Number(next);
      index += 1;
      continue;
    }
    if (current === "--restart-selector") {
      options.restartSelectors = [...options.restartSelectors, next!];
      index += 1;
      continue;
    }
    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!options.url && !options.slug) {
    throw new Error("Pass --url <url> or --slug <slug>.");
  }

  return options;
}

function resolveTarget(options: CliOptions): Target {
  if (options.url) {
    return {
      url: options.url,
      slug: options.slug ?? null,
      resolvedFrom: "url",
    };
  }

  return {
    url: pathToFileURL(resolve(process.cwd(), options.slug ?? "", "index.html")).toString(),
    slug: options.slug ?? null,
    resolvedFrom: "slug",
  };
}

function buildDefaultTracePath(target: Target): string {
  return resolve(".local", `${target.slug ?? "manual-target"}-trace.zip`);
}

function buildDefaultOutPath(target: Target): string {
  return resolve(".local", `${target.slug ?? "manual-target"}-trace-evidence.json`);
}

function buildDefaultScreenshotsDir(target: Target): string {
  return resolve(".local", `${target.slug ?? "manual-target"}-trace-pack`);
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function findFirstVisible(page: Page, selectors: string[]): Promise<{ selector: string; locator: Locator } | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }
    if (await locator.isVisible().catch(() => false)) {
      return { selector, locator };
    }
  }
  return null;
}

async function takeScreenshot(
  page: Page,
  screenshotsDir: string,
  id: string,
  kind: ScreenshotArtifact["kind"],
  note: string,
): Promise<ScreenshotArtifact> {
  mkdirSync(screenshotsDir, { recursive: true });
  const path = resolve(screenshotsDir, `${id}.png`);
  await page.screenshot({ path, fullPage: false });
  return { id, kind, path, note };
}

async function runBoundedInteractions(
  page: Page,
  restartSelectors: string[],
  actionTimeoutMs: number,
): Promise<{ attempted: string[]; completed: string[]; restartSelectorUsed: string | null }> {
  const attempted: string[] = [];
  const completed: string[] = [];

  const tryStep = async (label: string, action: () => Promise<void>) => {
    attempted.push(label);
    try {
      await action();
      completed.push(label);
    } catch {
      // Keep the capture flowing even when an entry ignores one input.
    }
  };

  void actionTimeoutMs;
  await tryStep("body click", () => page.mouse.click(24, 24));
  await tryStep("space key", () => page.keyboard.press("Space"));
  await tryStep("enter key", () => page.keyboard.press("Enter"));

  const restartTarget = await findFirstVisible(page, restartSelectors);
  if (!restartTarget) {
    return { attempted, completed, restartSelectorUsed: null };
  }

  const restartLabel = `click ${restartTarget.selector}`;
  attempted.push(restartLabel);
  try {
    await restartTarget.locator.click({ timeout: actionTimeoutMs });
    completed.push(restartLabel);
    return { attempted, completed, restartSelectorUsed: restartTarget.selector };
  } catch {
    return { attempted, completed, restartSelectorUsed: null };
  }
}

async function buildArtifact(options: CliOptions): Promise<TraceEvidencePack> {
  const target = resolveTarget(options);
  const tracePath = resolve(options.trace ?? buildDefaultTracePath(target));
  const outPath = resolve(options.out ?? buildDefaultOutPath(target));
  const screenshotsDir = resolve(options.screenshotsDir ?? buildDefaultScreenshotsDir(target));

  if (options.dryRun) {
    return {
      schemaVersion: 1,
      captureKind: "trace-evidence-pack",
      target: { ...target, directBrowserAssumption: true },
      trace: {
        path: tracePath,
        screenshots: true,
        snapshots: true,
        filmstripAvailableInTraceViewer: true,
        viewerCommand: `bunx playwright show-trace "${tracePath}"`,
      },
      screenshots: [],
      interactions: {
        attempted: [],
        completed: [],
        restartSelectorUsed: null,
        bounded: true,
      },
      metadata: {
        capturedAt: new Date().toISOString(),
        pageTitle: "dry-run",
        pageUrl: target.url,
        userAgent: "dry-run",
        notes: [`json artifact path: ${outPath}`, `screenshots dir: ${screenshotsDir}`, "dry run requested"],
      },
    };
  }

  ensureParentDirectory(tracePath);
  ensureParentDirectory(outPath);
  mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: {
      width: options.viewportWidth,
      height: options.viewportHeight,
    },
  });
  const page = await context.newPage();

  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
    await withTimeout("page.goto", options.navigationTimeoutMs + 1_000, () =>
      page.goto(target.url, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs }),
    );

    const screenshots: ScreenshotArtifact[] = [];
    screenshots.push(
      await takeScreenshot(page, screenshotsDir, "title", "title", "Initial boot surface before bounded play inputs."),
    );

    const interactionSummary = await runBoundedInteractions(page, options.restartSelectors, options.actionTimeoutMs);
    await page.waitForTimeout(options.postActionWaitMs);
    screenshots.push(
      await takeScreenshot(
        page,
        screenshotsDir,
        "post-input",
        "post-input",
        "State after the first bounded click and keyboard inputs.",
      ),
    );

    if (interactionSummary.restartSelectorUsed) {
      await page.waitForTimeout(options.postActionWaitMs);
      screenshots.push(
        await takeScreenshot(
          page,
          screenshotsDir,
          "post-restart",
          "post-restart",
          `State after bounded restart interaction via ${interactionSummary.restartSelectorUsed}.`,
        ),
      );
    }

    await page.waitForTimeout(options.postActionWaitMs);
    screenshots.push(
      await takeScreenshot(page, screenshotsDir, "final", "final", "Final settled state at trace stop time."),
    );

    await withTimeout("context.tracing.stop", TRACE_STOP_TIMEOUT_MS, () => context.tracing.stop({ path: tracePath }));

    const pageTitle = await page.title();
    const pageUrl = page.url();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const notes = [
      `json artifact path: ${outPath}`,
      `screenshots dir: ${screenshotsDir}`,
      interactionSummary.restartSelectorUsed
        ? `restart surface observed via ${interactionSummary.restartSelectorUsed}`
        : "no restart surface observed during bounded inputs",
      "trace viewer filmstrip comes from the trace's screenshots capture",
    ];

    return {
      schemaVersion: 1,
      captureKind: "trace-evidence-pack",
      target: { ...target, directBrowserAssumption: true },
      trace: {
        path: tracePath,
        screenshots: true,
        snapshots: true,
        filmstripAvailableInTraceViewer: true,
        viewerCommand: `bunx playwright show-trace "${tracePath}"`,
      },
      screenshots,
      interactions: {
        attempted: interactionSummary.attempted,
        completed: interactionSummary.completed,
        restartSelectorUsed: interactionSummary.restartSelectorUsed,
        bounded: true,
      },
      metadata: {
        capturedAt: new Date().toISOString(),
        pageTitle,
        pageUrl,
        userAgent,
        notes,
      },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await buildArtifact(options);
  const outPath = resolve(options.out ?? buildDefaultOutPath(resolveTarget(options)));
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(`# Trace evidence pack`);
  console.log("");
  console.log(`- target: ${artifact.target.slug ?? artifact.target.url}`);
  console.log(`- json: ${outPath}`);
  console.log(`- trace: ${artifact.trace.path}`);
  console.log(`- screenshots: ${artifact.screenshots.length}`);
  console.log(`- restart selector: ${artifact.interactions.restartSelectorUsed ?? "none observed"}`);
  console.log(`- trace viewer: ${artifact.trace.viewerCommand}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
