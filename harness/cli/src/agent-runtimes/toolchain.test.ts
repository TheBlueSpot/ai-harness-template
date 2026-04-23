import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildToolchainPath, resolveBundledRipgrepPath } from "./toolchain";

describe("agent runtime toolchain", () => {
  test("resolves bundled ripgrep when dependency is installed", () => {
    const rgPath = resolveBundledRipgrepPath();
    expect(rgPath?.endsWith(path.join("node_modules", "@vscode", "ripgrep", "bin", "rg.exe")) || rgPath?.endsWith(path.join("node_modules", "@vscode", "ripgrep", "bin", "rg"))).toBe(true);
  });

  test("prepends bundled tool directory once", () => {
    const rgPath = resolveBundledRipgrepPath();
    if (!rgPath) {
      throw new Error("Expected bundled rg");
    }

    const toolDir = path.dirname(rgPath);
    const once = buildToolchainPath({ basePath: "C:\\Windows", platform: "win32" });
    const twice = buildToolchainPath({ basePath: once, platform: "win32" });

    expect(once?.startsWith(`${toolDir};`)).toBe(true);
    expect(twice).toBe(once);
  });
});
