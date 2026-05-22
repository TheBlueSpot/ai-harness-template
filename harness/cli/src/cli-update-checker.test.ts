import { describe, expect, test } from "bun:test";
import { testExports } from "./cli-update-checker";

describe("cli update checker helpers", () => {
  test("parses semver from runtime version output", () => {
    expect(testExports.parseVersion("codex-cli 0.132.0")).toBe("0.132.0");
    expect(testExports.parseVersion("gh copilot version v1.2.3")).toBe("1.2.3");
    expect(testExports.parseVersion(undefined)).toBeUndefined();
  });

  test("compares installed and latest versions", () => {
    expect(testExports.compareVersions("0.132.0", "0.133.0")).toBeLessThan(0);
    expect(testExports.compareVersions("1.4.0", "1.3.9")).toBeGreaterThan(0);
    expect(testExports.compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  test("reads installed Pi package version", async () => {
    expect(await testExports.readInstalledPackageVersion("@mariozechner/pi-coding-agent")).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("rejects install for missing tools", () => {
    expect(() => testExports.assertInstalled(undefined, "Claude Code")).toThrow("Claude Code is not installed");
  });
});
