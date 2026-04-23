import { describe, expect, test } from "bun:test";
import { resolveCodexSandboxMode } from "./codex-sandbox-policy";

describe("codex sandbox policy", () => {
  test("uses danger-full-access for writable Windows runs", () => {
    expect(
      resolveCodexSandboxMode({
        platform: "win32",
        readOnly: false
      })
    ).toBe("danger-full-access");
  });

  test("keeps read-only runs read-only on Windows", () => {
    expect(
      resolveCodexSandboxMode({
        platform: "win32",
        readOnly: true
      })
    ).toBe("read-only");
  });

  test("keeps non-Windows writable runs on workspace-write", () => {
    expect(
      resolveCodexSandboxMode({
        platform: "linux",
        readOnly: false
      })
    ).toBe("workspace-write");
  });
});
