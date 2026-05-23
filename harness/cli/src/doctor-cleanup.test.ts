import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
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

  test("deletes oldest .local files until size is under limit", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-doctor-"));

    try {
      await writeHarnessSentinels(cwd);
      const localPath = path.join(cwd, ".local");
      const oldFile = path.join(localPath, "old.log");
      const middleFile = path.join(localPath, "nested", "middle.log");
      const newFile = path.join(localPath, "new.log");
      await mkdir(path.dirname(middleFile), { recursive: true });
      await writeFile(oldFile, "1".repeat(40));
      await writeFile(middleFile, "2".repeat(40));
      await writeFile(newFile, "3".repeat(40));
      await setModifiedTime(oldFile, 1);
      await setModifiedTime(middleFile, 2);
      await setModifiedTime(newFile, 3);

      const result = await deleteDoctorDistFolder(cwd, { localMaxBytes: 50 });

      expect(result.deleted).toBe(true);
      if (!result.deleted) {
        throw new Error("expected cleanup to run");
      }
      expect(result.localBytesBefore).toBe(120);
      expect(result.localBytesAfter).toBe(40);
      expect(result.localDeletedBytes).toBe(80);
      expect(result.localDeletedFiles).toEqual([oldFile, middleFile]);
      expect(existsSync(oldFile)).toBe(false);
      expect(existsSync(middleFile)).toBe(false);
      expect(existsSync(newFile)).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("keeps .local files when size is under limit", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "harness-doctor-"));

    try {
      await writeHarnessSentinels(cwd);
      const localFile = path.join(cwd, ".local", "keep.log");
      await mkdir(path.dirname(localFile), { recursive: true });
      await writeFile(localFile, "small");

      const result = await deleteDoctorDistFolder(cwd, { localMaxBytes: 50 });

      expect(result.deleted).toBe(true);
      if (!result.deleted) {
        throw new Error("expected cleanup to run");
      }
      expect(result.localDeletedFiles).toEqual([]);
      expect(result.localDeletedBytes).toBe(0);
      expect(existsSync(localFile)).toBe(true);
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

async function setModifiedTime(filePath: string, seconds: number) {
  const date = new Date(seconds * 1000);
  await utimes(filePath, date, date);
}
