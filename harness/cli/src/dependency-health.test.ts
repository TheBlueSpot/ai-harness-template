import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { ensureDependencyHealth } from "./dependency-health";

describe("dependency health", () => {
  test("runs bun i when node_modules is missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-deps-"));
    const calls: string[][] = [];

    try {
      const result = await ensureDependencyHealth({
        cwd,
        runner: async (args) => {
          calls.push(args);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      });

      expect(result.status).toBe("repaired");
      expect(calls).toEqual([["i"]]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runs bun i when frozen lockfile check fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-deps-"));
    const calls: string[][] = [];

    try {
      await mkdir(path.join(cwd, "node_modules"));
      const result = await ensureDependencyHealth({
        cwd,
        runner: async (args) => {
          calls.push(args);
          return args.includes("--dry-run")
            ? { exitCode: 1, stdout: "", stderr: "lockfile had changes" }
            : { exitCode: 0, stdout: "", stderr: "" };
        }
      });

      expect(result.status).toBe("repaired");
      expect(calls).toEqual([
        ["install", "--frozen-lockfile", "--dry-run"],
        ["i"]
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("skips bun i when frozen lockfile check passes", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-deps-"));
    const calls: string[][] = [];

    try {
      await mkdir(path.join(cwd, "node_modules"));
      const result = await ensureDependencyHealth({
        cwd,
        runner: async (args) => {
          calls.push(args);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      });

      expect(result.status).toBe("current");
      expect(calls).toEqual([["install", "--frozen-lockfile", "--dry-run"]]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
