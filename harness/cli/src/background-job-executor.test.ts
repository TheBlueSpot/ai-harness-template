import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SHELL_TIMEOUT_SECONDS,
  MAX_SHELL_TIMEOUT_SECONDS,
  MIN_SHELL_TIMEOUT_SECONDS,
  resolveShellTimeoutMs
} from "./background-job-executor";

describe("resolveShellTimeoutMs", () => {
  test("passes valid positive seconds through as milliseconds", () => {
    expect(resolveShellTimeoutMs(30)).toBe(30 * 1000);
    expect(resolveShellTimeoutMs(MAX_SHELL_TIMEOUT_SECONDS)).toBe(MAX_SHELL_TIMEOUT_SECONDS * 1000);
  });

  test("floors fractional seconds to whole seconds", () => {
    expect(resolveShellTimeoutMs(1.7)).toBe(MIN_SHELL_TIMEOUT_SECONDS * 1000);
    expect(resolveShellTimeoutMs(5.9)).toBe(5 * 1000);
  });

  test("clamps above-max values to the ceiling", () => {
    expect(resolveShellTimeoutMs(MAX_SHELL_TIMEOUT_SECONDS + 10)).toBe(MAX_SHELL_TIMEOUT_SECONDS * 1000);
  });

  test("falls back to default on zero, negative, or NaN input", () => {
    const fallback = DEFAULT_SHELL_TIMEOUT_SECONDS * 1000;
    expect(resolveShellTimeoutMs(0)).toBe(fallback);
    expect(resolveShellTimeoutMs(-1)).toBe(fallback);
    expect(resolveShellTimeoutMs(Number.NaN)).toBe(fallback);
    expect(resolveShellTimeoutMs(Number.POSITIVE_INFINITY)).toBe(fallback);
  });

  test("falls back to default on non-numeric input", () => {
    const fallback = DEFAULT_SHELL_TIMEOUT_SECONDS * 1000;
    expect(resolveShellTimeoutMs(undefined)).toBe(fallback);
    expect(resolveShellTimeoutMs(null)).toBe(fallback);
    expect(resolveShellTimeoutMs("not a number")).toBe(fallback);
  });

  test("accepts numeric strings as defense-in-depth against stale rows", () => {
    expect(resolveShellTimeoutMs("45")).toBe(45 * 1000);
  });
});
