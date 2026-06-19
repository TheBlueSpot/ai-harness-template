import path from "node:path";
import { mkdir } from "node:fs/promises";
import { BoundedOutputBuffer } from "../harness/cli/src/bounded-output-buffer";
import { BranchfsManager, type BranchfsExperimentLease } from "../harness/cli/src/branchfs-manager";

export type Viewport = {
  name: string;
  width: number;
  height: number;
};

export type ScreenshotOptions = {
  routes: string[];
  viewports: Viewport[];
  runId: string;
  baseUrl: string;
  outDir: string;
  waitUntil: ScreenshotWaitUntil;
  startServer: boolean;
  useBranchfs: boolean;
};

export type ScreenshotArtifact = {
  route: string;
  viewport: string;
  width: number;
  height: number;
  path: string;
};

export type ScreenshotResult = {
  runId: string;
  screenshots: ScreenshotArtifact[];
};

// Narrow view of BranchfsManager so tests can stub without constructing a full lease.
export type BranchfsLike = {
  prepareExperimentLease: () => Promise<{ projectMountPath: string }>;
  discardExperiment: () => Promise<void>;
};

export type DevServerHandle = {
  baseUrl: string;
  stop: () => Promise<void>;
};

export type CaptureDeps = {
  createManager: (rootPath: string, runId: string) => BranchfsLike;
  startDevServer: (mountPath: string) => Promise<DevServerHandle>;
  capturePages: (baseUrl: string, opts: ScreenshotOptions) => Promise<ScreenshotArtifact[]>;
};

const VIEWPORT_PRESETS: Record<string, Viewport> = {
  desktop: { name: "desktop", width: 1440, height: 900 },
  mobile: { name: "mobile", width: 390, height: 844 },
  tablet: { name: "tablet", width: 834, height: 1194 }
};

const DEFAULT_BASE_URL = "http://localhost:8787";
const DEFAULT_VIEWPORT_NAMES = ["desktop", "mobile"];
const DEFAULT_WAIT_UNTIL: ScreenshotWaitUntil = "domcontentloaded";
const LISTENING_REGEX = /Harness server listening on (http:\/\/localhost:\d+)/;
const DEV_SERVER_READY_TIMEOUT_MS = 60_000;
export const SCREENSHOT_SERVER_OUTPUT_CAP_BYTES = 256 * 1024;
const PAGE_NAVIGATION_TIMEOUT_MS = 30_000;
const PAGE_SETTLE_DELAY_MS = 350;
export type ScreenshotWaitUntil = "domcontentloaded" | "load" | "networkidle";

export function resolveViewport(spec: string) {
  const preset = VIEWPORT_PRESETS[spec];
  if (preset) {
    return preset;
  }

  const match = /^(\d+)x(\d+)$/.exec(spec);
  if (!match) {
    const known = Object.keys(VIEWPORT_PRESETS).join(", ");
    throw new Error(`Unknown viewport "${spec}". Use one of [${known}] or WxH (e.g. 1280x720).`);
  }

  return { name: spec, width: Number(match[1]), height: Number(match[2]) };
}

export function slugifyRoute(route: string) {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return "home";
  }

  const slug = trimmed
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "home";
}

export function parseScreenshotArgs(argv: string[], nowFactory: () => number = Date.now) {
  const routes: string[] = [];
  const viewportNames: string[] = [];
  let baseUrl = DEFAULT_BASE_URL;
  let waitUntil = DEFAULT_WAIT_UNTIL;
  let startServer = false;
  let useBranchfs = false;

  for (let cursor = 0; cursor < argv.length; cursor += 1) {
    const token = argv[cursor];
    if (token === "--route") {
      const value = argv[++cursor];
      if (!value) {
        throw new Error("--route requires a value");
      }
      routes.push(value);
      continue;
    }

    if (token === "--viewport") {
      const value = argv[++cursor];
      if (!value) {
        throw new Error("--viewport requires a value");
      }
      viewportNames.push(value);
      continue;
    }

    if (token === "--base-url") {
      const value = argv[++cursor];
      if (!value) {
        throw new Error("--base-url requires a value");
      }
      baseUrl = value;
      continue;
    }

    if (token === "--start-server") {
      startServer = true;
      continue;
    }

    if (token === "--branchfs") {
      useBranchfs = true;
      continue;
    }

    if (token === "--wait") {
      const value = argv[++cursor];
      if (!value) {
        throw new Error("--wait requires a value");
      }
      if (!isScreenshotWaitUntil(value)) {
        throw new Error(`Unknown --wait value "${value}". Use domcontentloaded, load, or networkidle.`);
      }
      waitUntil = value;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  const effectiveRoutes = routes.length > 0 ? routes : ["/"];
  const effectiveViewportNames = viewportNames.length > 0 ? viewportNames : DEFAULT_VIEWPORT_NAMES;
  const effectiveViewports = effectiveViewportNames.map(resolveViewport);
  const runId = `screenshot-${nowFactory()}`;
  const outDir = path.join(process.cwd(), ".local", "screenshots", runId);

  if (useBranchfs && !startServer) {
    throw new Error("--branchfs requires --start-server");
  }

  const options: ScreenshotOptions = {
    routes: effectiveRoutes,
    viewports: effectiveViewports,
    runId,
    baseUrl,
    outDir,
    waitUntil,
    startServer,
    useBranchfs
  };
  return options;
}

function isScreenshotWaitUntil(value: string): value is ScreenshotWaitUntil {
  return value === "domcontentloaded" || value === "load" || value === "networkidle";
}

export async function runScreenshotCapture(opts: ScreenshotOptions, deps: CaptureDeps) {
  await mkdir(opts.outDir, { recursive: true });

  if (!opts.startServer) {
    const screenshots = await deps.capturePages(opts.baseUrl, opts);
    const result: ScreenshotResult = { runId: opts.runId, screenshots };
    return result;
  }

  if (!opts.useBranchfs) {
    let stop: (() => Promise<void>) | undefined;
    try {
      const server = await deps.startDevServer(process.cwd());
      stop = server.stop;
      const screenshots = await deps.capturePages(server.baseUrl, opts);
      const result: ScreenshotResult = { runId: opts.runId, screenshots };
      return result;
    } finally {
      if (stop) {
        await stop().catch(() => undefined);
      }
    }
  }

  const manager = deps.createManager(process.cwd(), opts.runId);
  const lease = await manager.prepareExperimentLease();
  let stop: (() => Promise<void>) | undefined;
  try {
    const server = await deps.startDevServer(lease.projectMountPath);
    stop = server.stop;
    const screenshots = await deps.capturePages(server.baseUrl, opts);
    const result: ScreenshotResult = { runId: opts.runId, screenshots };
    return result;
  } finally {
    if (stop) {
      await stop().catch(() => undefined);
    }
    await manager.discardExperiment().catch(() => undefined);
  }
}

async function startDevServerInMount(mountPath: string): Promise<DevServerHandle> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "harness/cli/src/index.ts", "--server-only", "--no-open"],
    cwd: mountPath,
    env: { ...process.env, HARNESS_PORT: "0" },
    stdout: "pipe",
    stderr: "pipe"
  });

  const decoder = new TextDecoder();
  const stdoutBuffer = new BoundedOutputBuffer(SCREENSHOT_SERVER_OUTPUT_CAP_BYTES);
  const stderrBuffer = new BoundedOutputBuffer(SCREENSHOT_SERVER_OUTPUT_CAP_BYTES);

  const drainStderr = async () => {
    if (!proc.stderr) {
      return;
    }
    const reader = proc.stderr.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        stderrBuffer.append(decoder.decode(value, { stream: true }));
      }
    } catch {
      // stream closed during shutdown; nothing to do.
    }
  };
  drainStderr();

  const baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`dev server did not report listening within ${DEV_SERVER_READY_TIMEOUT_MS}ms. stderr tail:\n${stderrBuffer.text().slice(-2000)}`));
    }, DEV_SERVER_READY_TIMEOUT_MS);

    const pump = async () => {
      const reader = proc.stdout.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            clearTimeout(timer);
            reject(new Error(`dev server exited before listening. stdout tail:\n${stdoutBuffer.text().slice(-2000)}\nstderr tail:\n${stderrBuffer.text().slice(-2000)}`));
            return;
          }
          stdoutBuffer.append(decoder.decode(value, { stream: true }));
          const match = LISTENING_REGEX.exec(stdoutBuffer.text());
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
            return;
          }
        }
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    };

    pump();
  });

  const stop = async () => {
    proc.kill();
    await proc.exited.catch(() => undefined);
  };

  return { baseUrl, stop };
}

async function capturePagesWithCdp(baseUrl: string, opts: ScreenshotOptions) {
  const runnerPath = path.join(import.meta.dir, "screenshot-cdp-runner.mjs");
  const proc = Bun.spawn({
    cmd: ["node", runnerPath],
    cwd: process.cwd(),
    env: {
      ...process.env,
      SCREENSHOT_PAYLOAD: JSON.stringify({
        baseUrl,
        opts: {
          ...opts,
          navigationTimeoutMs: PAGE_NAVIGATION_TIMEOUT_MS,
          settleDelayMs: PAGE_SETTLE_DELAY_MS,
          screenshotTimeoutMs: PAGE_NAVIGATION_TIMEOUT_MS
        }
      })
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(`cdp screenshot runner failed with exit ${exitCode}.\n${stderr || stdout}`);
  }
  try {
    const parsed = JSON.parse(stdout.trim()) as { artifacts: ScreenshotArtifact[] };
    return parsed.artifacts;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cdp screenshot runner returned invalid JSON: ${detail}\n${stdout}\n${stderr}`);
  }
}

function createRealManager(rootPath: string, runId: string): BranchfsLike {
  const manager = new BranchfsManager({ rootPath, runId });
  let currentLease: BranchfsExperimentLease | undefined;
  return {
    prepareExperimentLease: async () => {
      currentLease = await manager.prepareExperimentLease();
      return { projectMountPath: currentLease.projectMountPath };
    },
    discardExperiment: async () => {
      if (currentLease) {
        await manager.discardExperiment(currentLease);
      }
    }
  };
}

if (import.meta.main) {
  try {
    const opts = parseScreenshotArgs(process.argv.slice(2));
    const result = await runScreenshotCapture(opts, {
      createManager: createRealManager,
      startDevServer: startDevServerInMount,
      capturePages: capturePagesWithCdp
    });

    const payload = { runId: result.runId, screenshots: result.screenshots };
    console.log("--- SCREENSHOT_RESULT_JSON ---");
    console.log(JSON.stringify(payload, null, 2));
    console.log("--- END ---");
    console.log(`\nWrote ${result.screenshots.length} screenshot(s) to ${path.relative(process.cwd(), opts.outDir).replace(/\\/g, "/")}/`);
    process.exit(0);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[screenshot] ${detail}`);
    process.exit(1);
  }
}
