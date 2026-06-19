import { describe, expect, test } from "bun:test";
import { detectTerminalLink } from "./terminal-links";

describe("terminal link detection", () => {
  test("detects urls and trims trailing punctuation", () => {
    expect(detectTerminalLink("open https://example.com/test,")).toEqual({
      kind: "url",
      href: "https://example.com/test"
    });
  });

  test("detects file paths with line and column", () => {
    expect(detectTerminalLink("at harness/ui/src/app.tsx:12:4")).toEqual({
      kind: "file",
      path: "harness/ui/src/app.tsx",
      line: 12,
      column: 4
    });
  });
});
