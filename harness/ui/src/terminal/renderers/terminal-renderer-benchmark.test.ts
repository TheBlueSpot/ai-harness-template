import { describe, expect, test } from "bun:test";
import { solidBeatsXtermByThreshold, summarizeRendererBenchmark } from "./terminal-renderer-benchmark";

describe("terminal renderer benchmark model", () => {
  test("uses p95 latency and requires a 25 percent Solid advantage", () => {
    const xterm = summarizeRendererBenchmark([10, 20, 30, 40, 100], "xterm");
    const solid = summarizeRendererBenchmark([10, 15, 20, 30, 70], "solid");

    expect(xterm.p95Ms).toBe(100);
    expect(solidBeatsXtermByThreshold(xterm, solid)).toBe(true);
    expect(solidBeatsXtermByThreshold(xterm, { ...solid, p95Ms: 76 })).toBe(false);
  });
});
