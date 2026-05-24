import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { createFatalStartupLogger } from "./fatal-startup-log";

describe("fatal startup logger", () => {
  test("portable launcher writes crash log and prints path", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "pi-harness-fatal-log-"));
    const stderrLines: string[] = [];
    const logger = createFatalStartupLogger({
      launchMode: "portable-launcher",
      execPath: path.join(tempRoot, "pi-harness.exe"),
      cwd: tempRoot,
      argv: ["--server-only"],
      now: () => Date.UTC(2026, 3, 22, 12, 34, 56),
      stderrWrite(line) {
        stderrLines.push(line);
      }
    });

    const record = logger(new ReferenceError("DOMMatrix is not defined"), "startup");

    expect(record.logPath).toBe(path.join(tempRoot, "logs", "startup-crash-2026-04-22T12-34-56.000Z.log"));
    expect(stderrLines[0]).toBe("Fatal startup error: DOMMatrix is not defined");
    expect(stderrLines[1]).toBe(`Crash log: ${record.logPath}`);

    const contents = readFileSync(record.logPath!, "utf8");
    expect(contents).toContain("Pi Harness fatal startup error");
    expect(contents).toContain("launchMode: portable-launcher");
    expect(contents).toContain("argv: --server-only");
    expect(contents).toContain("ReferenceError: DOMMatrix is not defined");
  });

  test("logger writes only one crash log per process", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "pi-harness-fatal-log-"));
    const stderrLines: string[] = [];
    const logger = createFatalStartupLogger({
      launchMode: "portable-launcher",
      execPath: path.join(tempRoot, "pi-harness.exe"),
      cwd: tempRoot,
      now: () => Date.UTC(2026, 3, 22, 12, 34, 56),
      stderrWrite(line) {
        stderrLines.push(line);
      }
    });

    const firstRecord = logger(new Error("first failure"), "startup");
    const secondRecord = logger(new Error("second failure"), "uncaughtException");

    expect(secondRecord).toBe(firstRecord);
    expect(stderrLines.filter((line) => line.startsWith("Fatal "))).toHaveLength(1);
  });

  test("adds cleanup guidance for out-of-space startup failures", () => {
    const stderrLines: string[] = [];
    const logger = createFatalStartupLogger({
      launchMode: "source",
      stderrWrite(line) {
        stderrLines.push(line);
      }
    });
    const error = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });

    const record = logger(error, "startup");

    expect(record.message).toContain("Disk appears full");
    expect(record.message).toContain(".local/branchfs");
    expect(stderrLines[0]).toContain("Disk appears full");
  });
});
