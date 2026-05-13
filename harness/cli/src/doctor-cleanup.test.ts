import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { deleteDoctorDistFolder } from "./doctor-cleanup";

describe("doctor cleanup", () => {
  test("deletes dist folder before doctor health checks", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-doctor-"));

    try {
      await mkdir(path.join(cwd, "dist", "ui"), { recursive: true });
      await writeFile(path.join(cwd, "dist", "ui", "index.html"), "");

      await deleteDoctorDistFolder(cwd);

      expect(existsSync(path.join(cwd, "dist"))).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("does not fail when dist folder is missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-doctor-"));

    try {
      await deleteDoctorDistFolder(cwd);

      expect(existsSync(path.join(cwd, "dist"))).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
