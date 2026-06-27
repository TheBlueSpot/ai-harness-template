import { describe, expect, test } from "bun:test";
import { resolveTerminalKeyboardAction } from "./terminal-keybindings";

describe("terminal keybindings", () => {
  test("maps primary terminal shortcuts on Windows", () => {
    expect(resolveTerminalKeyboardAction({ key: "c", metaKey: false, ctrlKey: true, shiftKey: false }, "Win32")).toBe("copy");
    expect(resolveTerminalKeyboardAction({ key: "a", metaKey: false, ctrlKey: true, shiftKey: false }, "Win32")).toBe("select-all");
    expect(resolveTerminalKeyboardAction({ key: "v", metaKey: false, ctrlKey: true, shiftKey: false }, "Win32")).toBe("paste");
    expect(resolveTerminalKeyboardAction({ key: "f", metaKey: false, ctrlKey: true, shiftKey: false }, "Win32")).toBe("toggle-search");
    expect(resolveTerminalKeyboardAction({ key: "c", metaKey: false, ctrlKey: true, shiftKey: true }, "Win32")).toBe("send-interrupt");
  });

  test("keeps macOS terminal shortcuts on command", () => {
    expect(resolveTerminalKeyboardAction({ key: "c", metaKey: true, ctrlKey: false, shiftKey: false }, "MacIntel")).toBe("copy");
    expect(resolveTerminalKeyboardAction({ key: "a", metaKey: true, ctrlKey: false, shiftKey: false }, "MacIntel")).toBe("select-all");
    expect(resolveTerminalKeyboardAction({ key: "v", metaKey: true, ctrlKey: false, shiftKey: false }, "MacIntel")).toBe("paste");
    expect(resolveTerminalKeyboardAction({ key: "f", metaKey: true, ctrlKey: false, shiftKey: false }, "MacIntel")).toBe("toggle-search");
    expect(resolveTerminalKeyboardAction({ key: "c", metaKey: true, ctrlKey: false, shiftKey: true }, "MacIntel")).toBe("send-interrupt");
    expect(resolveTerminalKeyboardAction({ key: "c", metaKey: false, ctrlKey: true, shiftKey: false }, "MacIntel")).toBe("browser-default");
  });
});
