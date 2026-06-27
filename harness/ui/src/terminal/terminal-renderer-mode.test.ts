import { expect, test } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { shouldUseSolidTerminalRenderer } from "./terminal-renderer-mode";

function setUrlForTest(url: string) {
  (window as typeof window & { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

createUiTest("terminal renderer mode", () => {
  test("forces solid renderer from terminal query param", () => {
    const originalUrl = window.location.href;
    try {
      setUrlForTest("http://localhost/");
      expect(shouldUseSolidTerminalRenderer("xterm-webgl")).toBe(false);

      window.history.pushState({}, "", "/?terminal=solid");
      expect(shouldUseSolidTerminalRenderer("xterm-webgl")).toBe(true);
      expect(shouldUseSolidTerminalRenderer("solid-prototype")).toBe(true);
    } finally {
      setUrlForTest(originalUrl);
    }
  });
});
