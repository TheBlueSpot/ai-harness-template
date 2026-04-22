import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8787";
const outDir = path.join(process.cwd(), ".local", "screenshots", `adhoc-${Date.now()}`);
await mkdir(outDir, { recursive: true });

console.log("[adhoc] launching chromium (headed-binary)...");
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--no-sandbox"]
});
console.log("[adhoc] launched");

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

const routes = ["/"];

const artifacts: Array<{ route: string; viewport: string; path: string }> = [];

try {
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    try {
      for (const route of routes) {
        const page = await ctx.newPage();
        try {
          const target = new URL(route, baseUrl).toString();
          console.log(`[adhoc] goto ${target} @ ${vp.name}`);
          await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(1200);
          const slug = route === "/" ? "home" : route.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
          const filePath = path.join(outDir, `${slug}-${vp.name}.png`);
          await page.screenshot({ path: filePath, fullPage: true });
          artifacts.push({ route, viewport: vp.name, path: filePath });
          console.log(`[adhoc] wrote ${filePath}`);
        } finally {
          await page.close();
        }
      }
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log("--- SCREENSHOT_RESULT_JSON ---");
console.log(JSON.stringify({ outDir, artifacts }, null, 2));
console.log("--- END ---");
