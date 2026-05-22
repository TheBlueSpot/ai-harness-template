import { describe, expect, test } from "bun:test";
import { getBundledCodexInstallation, resolveBundledCodexExecutablePath, resolveBundledCodexTargetTriple } from "./codex-installation";

describe("codex installation", () => {
  test("resolves supported target triples", () => {
    expect(resolveBundledCodexTargetTriple("win32", "x64")).toBe("x86_64-pc-windows-msvc");
    expect(resolveBundledCodexTargetTriple("darwin", "arm64")).toBe("aarch64-apple-darwin");
    expect(resolveBundledCodexTargetTriple("linux", "arm64")).toBe("aarch64-unknown-linux-musl");
    expect(resolveBundledCodexTargetTriple("freebsd", "x64")).toBeUndefined();
  });

  test("resolves current bundled executable path from package metadata", () => {
    const executablePath = resolveBundledCodexExecutablePath({
      platform: "win32",
      arch: "x64",
      resolvePackageJson(specifier) {
        if (specifier !== "@openai/codex-win32-x64/package.json") {
          throw new Error(`unexpected package ${specifier}`);
        }

        return "C:\\repo\\node_modules\\@openai\\codex-win32-x64\\package.json";
      },
      pathExists() {
        return true;
      }
    });

    expect(executablePath).toBe(
      "C:\\repo\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe"
    );
  });

  test("falls back to legacy bundled executable path", () => {
    const executablePath = resolveBundledCodexExecutablePath({
      platform: "win32",
      arch: "x64",
      resolvePackageJson(specifier) {
        if (specifier !== "@openai/codex-win32-x64/package.json") {
          throw new Error(`unexpected package ${specifier}`);
        }

        return "C:\\repo\\node_modules\\@openai\\codex-win32-x64\\package.json";
      },
      pathExists(candidate) {
        return candidate.endsWith("\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe");
      }
    });

    expect(executablePath).toBe(
      "C:\\repo\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe"
    );
  });

  test("reports missing bundled install with bun install guidance", () => {
    const installation = getBundledCodexInstallation({
      resolvePackageJson() {
        throw new Error("missing");
      }
    });

    expect(installation.installed).toBe(false);
    expect(installation.installCommand).toBe("bun install");
    expect(installation.authCommand).toBe("bunx codex login");
    expect(installation.healthMessage).toContain("bun install");
  });
});
