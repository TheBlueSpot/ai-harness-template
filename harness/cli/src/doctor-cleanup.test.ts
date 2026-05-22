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
      await writeHarnessSentinels(cwd);
      await mkdir(path.join(cwd, "dist", "ui"), { recursive: true });
      await writeFile(path.join(cwd, "dist", "ui", "index.html"), "");

      const result = await deleteDoctorDistFolder(cwd);

      expect(result.deleted).toBe(true);
      expect(existsSync(path.join(cwd, "dist"))).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("does not fail when dist folder is missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-doctor-"));

    try {
      await writeHarnessSentinels(cwd);
      const result = await deleteDoctorDistFolder(cwd);

      expect(result.deleted).toBe(true);
      expect(existsSync(path.join(cwd, "dist"))).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("does not delete caller dist when sentinels are missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "app-doctor-"));

    try {
      await mkdir(path.join(cwd, "dist"), { recursive: true });
      await writeFile(path.join(cwd, "dist", "index.html"), "app build");

      const result = await deleteDoctorDistFolder(cwd);

      expect(result.deleted).toBe(false);
      expect(existsSync(path.join(cwd, "dist", "index.html"))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

async function writeHarnessSentinels(rootPath: string) {
  await writeFile(path.join(rootPath, "package.json"), "{}");
  await mkdir(path.join(rootPath, "harness", "cli", "src"), { recursive: true });
  await mkdir(path.join(rootPath, "harness", "ui"), { recursive: true });
  await writeFile(path.join(rootPath, "harness", "cli", "src", "index.ts"), "");
  await writeFile(path.join(rootPath, "harness", "ui", "index.html"), "");
}
