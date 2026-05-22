import path from "node:path";

const payload = JSON.parse(process.env.SCREENSHOT_PAYLOAD ?? "{}");
const { baseUrl, opts } = payload;

if (!baseUrl || !opts) {
  throw new Error("SCREENSHOT_PAYLOAD must include baseUrl and opts");
}

const playwright = await import("playwright");
const browser = await playwright.chromium.launch();

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

try {
  const artifacts = [];
  for (const viewport of opts.viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height }
    });
    try {
      for (const route of opts.routes) {
        const page = await context.newPage();
        try {
          const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
          const target = new URL(normalizedRoute, baseUrl).toString();
          await page.goto(target, { waitUntil: opts.waitUntil, timeout: opts.navigationTimeoutMs });
          await page.waitForTimeout(opts.settleDelayMs);
          const slug = slugifyRoute(route);
          const filePath = path.join(opts.outDir, `${slug}-${viewport.name}.png`);
          await page.screenshot({ path: filePath, fullPage: true, timeout: opts.screenshotTimeoutMs });
          artifacts.push({
            route,
            viewport: viewport.name,
            width: viewport.width,
            height: viewport.height,
            path: path.relative(process.cwd(), filePath).replace(/\\/g, "/")
          });
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    } finally {
      await context.close().catch(() => undefined);
    }
  }
  console.log(JSON.stringify({ artifacts }));
} finally {
  await browser.close().catch(() => undefined);
}
