import { describe, expect, test } from "bun:test";
import { formatShortTimestamp, resolveBrowserTimezone } from "./time-format";

describe("time formatting", () => {
  test("formats short local timestamp stamps", () => {
    expect(formatShortTimestamp(new Date(2026, 3, 28, 10, 4))).toBe("April 28 '26 - 10:04 AM");
  });

  test("handles empty or invalid timestamps", () => {
    expect(formatShortTimestamp(undefined)).toBe("n/a");
    expect(formatShortTimestamp("not a date")).toBe("n/a");
  });

  test("resolves browser timezone", () => {
    expect(resolveBrowserTimezone()).toBeTruthy();
  });
});
