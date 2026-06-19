import CDP from "chrome-remote-interface";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

const payload = JSON.parse(process.env.SCREENSHOT_PAYLOAD ?? "{}");
const { baseUrl, opts } = payload;

if (!baseUrl || !opts) {
  throw new Error("SCREENSHOT_PAYLOAD must include baseUrl and opts");
}

function slugifyRoute(route) {
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

async function findOpenPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("could not allocate CDP port"));
        }
      });
    });
  });
}

function chromeCandidates() {
  if (process.env.CHROME_PATH) {
    return [process.env.CHROME_PATH];
  }
  if (process.platform === "win32") {
    return [
      path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ];
  }
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
}

async function launchChrome(port, userDataDir) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];

  const errors = [];
  for (const executable of chromeCandidates()) {
    if (!executable) {
      continue;
    }
    if (path.isAbsolute(executable) && !existsSync(executable)) {
      continue;
    }
    try {
      const proc = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
      await Promise.race([
        waitForCdp(port, 10_000),
        new Promise((_, reject) => {
          proc.once("error", reject);
          proc.once("exit", (code) => reject(new Error(`Chrome exited early with code ${code}`)));
        })
      ]);
      return proc;
    } catch (error) {
      errors.push(`${executable}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`could not launch Chrome for CDP. Set CHROME_PATH. Tried:\n${errors.join("\n")}`);
}

async function waitForCdp(port, timeoutMs) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      await CDP.Version({ port });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError ?? new Error("CDP endpoint did not become ready");
}

async function waitForPageEvent(Page, eventName, timeoutMs) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`page ${eventName} timed out after ${timeoutMs}ms`)), timeoutMs);
    Page[eventName](() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function captureOne(port, target, viewport, url, filePath) {
  const client = await CDP({ port, target });
  try {
    const { Emulation, Page } = client;
    await Page.enable();
    await Emulation.setDeviceMetricsOverride({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 600
    });
    const lifecycleEvent = opts.waitUntil === "domcontentloaded" ? "domContentEventFired" : "loadEventFired";
    const loadPromise = waitForPageEvent(Page, lifecycleEvent, opts.navigationTimeoutMs);
    await Page.navigate({ url });
    await loadPromise;
    await new Promise((resolve) => setTimeout(resolve, opts.settleDelayMs));
    const metrics = await Page.getLayoutMetrics();
    const contentSize = metrics.cssContentSize ?? metrics.contentSize;
    const { data } = await Page.captureScreenshot({
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.max(viewport.width, Math.ceil(contentSize.width)),
        height: Math.max(viewport.height, Math.ceil(contentSize.height)),
        scale: 1
      }
    });
    await writeFile(filePath, Buffer.from(data, "base64"));
  } finally {
    await client.close().catch(() => undefined);
  }
}

const port = await findOpenPort();
const userDataDir = await mkdtemp(path.join(tmpdir(), "harness-screenshot-cdp-"));
let chrome;

try {
  chrome = await launchChrome(port, userDataDir);
  const artifacts = [];
  for (const viewport of opts.viewports) {
    for (const route of opts.routes) {
      const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
      const targetUrl = new URL(normalizedRoute, baseUrl).toString();
      const target = await CDP.New({ port });
      try {
        const slug = slugifyRoute(route);
        const filePath = path.join(opts.outDir, `${slug}-${viewport.name}.png`);
        await captureOne(port, target, viewport, targetUrl, filePath);
        artifacts.push({
          route,
          viewport: viewport.name,
          width: viewport.width,
          height: viewport.height,
          path: path.relative(process.cwd(), filePath).replace(/\\/g, "/")
        });
      } finally {
        await CDP.Close({ port, id: target.id }).catch(() => undefined);
      }
    }
  }
  console.log(JSON.stringify({ artifacts }));
} finally {
  if (chrome) {
    chrome.kill();
  }
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}
