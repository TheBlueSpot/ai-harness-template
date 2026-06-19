export type TerminalRendererBenchmarkResult = {
  renderer: "xterm" | "solid";
  p95Ms: number;
  lineCount: number;
  inputBursts: number;
};

export function summarizeRendererBenchmark(samples: number[], renderer: TerminalRendererBenchmarkResult["renderer"]) {
  const sorted = [...samples].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    renderer,
    p95Ms: sorted[p95Index] ?? 0,
    lineCount: 100_000,
    inputBursts: 300
  } satisfies TerminalRendererBenchmarkResult;
}

export function solidBeatsXtermByThreshold(xterm: TerminalRendererBenchmarkResult, solid: TerminalRendererBenchmarkResult) {
  return solid.p95Ms > 0 && solid.p95Ms <= xterm.p95Ms * 0.75;
}
