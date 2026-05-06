import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isRecoverableWorkspaceDatabaseError, purgeWorkspaceDatabase, resolveHarnessDbBackupPath } from "./dev-db-recovery";

describe("dev db recovery", () => {
  test("detects recoverable sqlite schema errors", () => {
    expect(isRecoverableWorkspaceDatabaseError(new Error("SQLiteError: no such column: updated_at"))).toBe(true);
    expect(isRecoverableWorkspaceDatabaseError(new Error("database disk image is malformed"))).toBe(true);
    expect(isRecoverableWorkspaceDatabaseError(new Error("SQLiteError: constraint failed"))).toBe(false);
    expect(isRecoverableWorkspaceDatabaseError(new Error("SQLiteError: database is locked"))).toBe(false);
    expect(isRecoverableWorkspaceDatabaseError(new Error("SQLiteError: near \"select\": syntax error"))).toBe(false);
    expect(isRecoverableWorkspaceDatabaseError(new Error("totally different failure"))).toBe(false);
  });

  test("does not treat unrelated 'malformed' copy as a recoverable signature", () => {
    // Earlier versions also matched a bare `malformed` substring which fired on
    // unrelated validation or network errors and triggered destructive purges.
    expect(isRecoverableWorkspaceDatabaseError(new Error("malformed request payload"))).toBe(false);
    expect(isRecoverableWorkspaceDatabaseError(new Error("Malformed UTF-8 in response"))).toBe(false);
    expect(isRecoverableWorkspaceDatabaseError(new Error("zod: malformed input"))).toBe(false);
    // But the specific SQLite corruption signature must still purge.
    expect(
      isRecoverableWorkspaceDatabaseError(new Error("SQLiteError: database disk image is malformed"))
    ).toBe(true);
  });

  test("purges sqlite db artifacts", async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `purge-${crypto.randomUUID()}.sqlite`);

    for (const artifactPath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      writeFileSync(artifactPath, "x");
    }

    await purgeWorkspaceDatabase(dbPath);

    for (const artifactPath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      expect(existsSync(artifactPath)).toBe(false);
    }
  });

  test("backs up sqlite db artifacts before purging", async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `backup-${crypto.randomUUID()}.sqlite`);
    const backupPath = `${dbPath}.backup-test`;

    writeFileSync(dbPath, "main");
    writeFileSync(`${dbPath}-wal`, "wal");
    writeFileSync(`${dbPath}-shm`, "shm");

    const result = await purgeWorkspaceDatabase(dbPath, {
      createBackupPath: () => backupPath
    });

    expect(result.backupPath).toBe(backupPath);
    expect(result.backedUpArtifacts).toEqual([backupPath, `${backupPath}-shm`, `${backupPath}-wal`]);
    expect(readFileSync(backupPath, "utf8")).toBe("main");
    expect(readFileSync(`${backupPath}-wal`, "utf8")).toBe("wal");
    expect(readFileSync(`${backupPath}-shm`, "utf8")).toBe("shm");
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  test("does not purge when backup fails", async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `backup-fails-${crypto.randomUUID()}.sqlite`);
    writeFileSync(dbPath, "main");

    await expect(
      purgeWorkspaceDatabase(dbPath, {
        backupArtifact() {
          throw new Error("backup failed");
        }
      })
    ).rejects.toThrow("backup failed");

    expect(existsSync(dbPath)).toBe(true);
  });

  test("formats timestamped db backup paths", () => {
    const backupPath = resolveHarnessDbBackupPath(
      path.join("workspace", ".local", "harness.db"),
      new Date("2026-05-02T08:46:44.556Z")
    );

    expect(backupPath).toBe(path.join("workspace", ".local", "harness.db.backup-20260502T084644Z"));
  });

  test("adds a unique suffix when timestamped backup artifacts already exist", async () => {
    const dbPath = path.join("workspace", ".local", "harness.db");

    const result = await purgeWorkspaceDatabase(dbPath, {
      artifactExists: () => true,
      backupArtifact() {},
      removeArtifact() {},
      retryAttempts: 1,
      retryDelayMs: 0
    });

    expect(result.backupPath).toMatch(/harness\.db\.backup-\d{8}T\d{6}Z-[0-9a-f-]+$/);
  });

  test("returns fallback path when busy db cannot be purged yet", async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const dbPath = path.join(tempRoot, `busy-${crypto.randomUUID()}.sqlite`);
    const walPath = `${dbPath}-wal`;

    const existingArtifacts = new Set([dbPath, walPath]);
    const result = await purgeWorkspaceDatabase(dbPath, {
      artifactExists(artifactPath) {
        return existingArtifacts.has(artifactPath);
      },
      backupArtifact() {},
      createBackupPath: () => `${dbPath}.backup-test`,
      removeArtifact(artifactPath) {
        if (artifactPath === dbPath) {
          const busyError = new Error("busy");
          Object.assign(busyError, { code: "EBUSY" });
          throw busyError;
        }

        existingArtifacts.delete(artifactPath);
      },
      retryAttempts: 2,
      retryDelayMs: 0
    });

    expect(result.purgedArtifacts).toEqual([walPath]);
    expect(result.blockedArtifacts).toEqual([dbPath]);
    expect(result.fallbackDbPath).toContain(".recovered-");
    expect(result.fallbackDbPath).toEndWith(".sqlite");
  });
});
