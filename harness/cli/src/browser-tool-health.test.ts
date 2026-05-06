import { expect, test } from "bun:test";
import {
  getBunExecutableName,
  probeBrowserToolHealth,
  resolvePlaywrightCacheRoot
} from "./browser-tool-health";

test("reports ready browser tools when playwright and chromium are available", async () => {
  const health = await probeBrowserToolHealth({
    moduleLoader: async () => ({ ok: true }),
    pathExists: () => true,
    readDir: async () => ["chromium-1200", "firefox-1500"],
    env: {},
    platform: "linux",
    homeDir: "/tmp/user"
  });

  expect(health.ready).toBe(true);
  expect(health.playwrightPackageInstalled).toBe(true);
  expect(health.chromiumInstalled).toBe(true);
  expect(health.cachePath).toBe("/tmp/user/.cache/ms-playwright");
  expect(health.installDependenciesCommand).toBe("bun install");
  expect(health.installChromiumCommand).toBe("bun x playwright install chromium");
});

test("reports missing playwright dependency before chromium", async () => {
  const health = await probeBrowserToolHealth({
    moduleLoader: async () => {
      throw new Error("module not found");
    },
    pathExists: () => false,
    env: {},
    platform: "win32"
  });

  expect(health.ready).toBe(false);
  expect(health.playwrightPackageInstalled).toBe(false);
  expect(health.chromiumInstalled).toBe(false);
  expect(health.installDependenciesCommand).toBe("bun.cmd install");
  expect(health.installChromiumCommand).toBe("bun.cmd x playwright install chromium");
});

test("prefers explicit playwright cache root when provided", () => {
  const cacheRoot = resolvePlaywrightCacheRoot({
    env: {
      PLAYWRIGHT_BROWSERS_PATH: "D:\\pw-cache"
    },
    platform: "win32"
  });

  expect(cacheRoot).toBe("D:\\pw-cache");
  expect(getBunExecutableName("win32")).toBe("bun.cmd");
});
