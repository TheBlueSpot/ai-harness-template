import { describe, expect, test } from "bun:test";
import {
  buildWorkspacePathGuidance,
  extractWorkspaceRelativePathHints,
  normalizeWorkspaceRelativePaths
} from "./workspace-path-intent";

describe("workspace path intent", () => {
  test("normalizes simple leading-slash workspace targets on Windows roots", () => {
    const content = "Put all files in new folder /breakout and create /breakout/index.html";
    expect(extractWorkspaceRelativePathHints(content, "C:\\repo\\context")).toEqual([
      {
        originalPath: "/breakout/index.html",
        normalizedPath: "breakout/index.html"
      },
      {
        originalPath: "/breakout",
        normalizedPath: "breakout"
      }
    ]);
    expect(normalizeWorkspaceRelativePaths(content, "C:\\repo\\context")).toBe(
      "Put all files in new folder breakout and create breakout/index.html"
    );
  });

  test("does not rewrite common POSIX root paths when cwd is POSIX-like", () => {
    const content = "Inspect file /usr/local/bin and compare against /etc/hosts";
    expect(extractWorkspaceRelativePathHints(content, "/repo")).toEqual([]);
    expect(normalizeWorkspaceRelativePaths(content, "/repo")).toBe(content);
  });

  test("formats workspace path guidance when a local leading-slash path is detected", () => {
    expect(buildWorkspacePathGuidance("Create /breakout/index.html", "C:\\repo\\context")).toContain(
      "`/breakout/index.html` -> `breakout/index.html`"
    );
  });
});
