import { expect, test } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { rightAlignedNumbersEnabled } from "./visual-flags";

function setUrlForTest(url: string) {
  (window as typeof window & { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

createUiTest("visual flags", () => {
  test("defaults right-aligned numbers on and lets the query flag override", () => {
    const originalUrl = window.location.href;
    try {
      setUrlForTest("http://localhost/");
      expect(rightAlignedNumbersEnabled()).toBe(true);

      window.history.pushState({}, "", "/?number=right");
      expect(rightAlignedNumbersEnabled()).toBe(true);

      window.history.pushState({}, "", "/?number=left");
      expect(rightAlignedNumbersEnabled()).toBe(false);

      window.history.pushState({}, "", "/?number=off");
      expect(rightAlignedNumbersEnabled()).toBe(false);
    } finally {
      setUrlForTest(originalUrl);
    }
  });
});
