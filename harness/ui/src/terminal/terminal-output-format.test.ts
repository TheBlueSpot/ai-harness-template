import { expect, test } from "bun:test";
import { normalizeTerminalGlyphSpacing } from "./terminal-output-format";

test("collapses null-padded Windows pipe glyph spacing", () => {
  expect(normalizeTerminalGlyphSpacing("W i n d o w s   P o w e r S h e l l")).toBe("Windows PowerShell");
  expect(normalizeTerminalGlyphSpacing("P S   C : \\ U s e r s \\ r e p o >")).toBe("PS C:\\Users\\repo>");
});

test("preserves normal terminal output spacing", () => {
  expect(normalizeTerminalGlyphSpacing("git status\nnothing to commit, working tree clean")).toBe("git status\nnothing to commit, working tree clean");
  expect(normalizeTerminalGlyphSpacing("NAME      STATUS\napi       running")).toBe("NAME      STATUS\napi       running");
});
