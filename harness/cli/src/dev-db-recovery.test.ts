import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isRecoverableWorkspaceDatabaseError, purgeWorkspaceDatabase } from "./dev-db-recovery";

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
      removeArtifact(artifactPath) {
        if (artifactPath === dbPath) {
          const busyError = new Error("busy");
          Object.assign(busyError, { code: "EBUSY" });
          throw busyError;
        }

        existingArtifacts.delete(artifactPath);
      }
    });

    expect(result.purgedArtifacts).toEqual([walPath]);
    expect(result.blockedArtifacts).toEqual([dbPath]);
    expect(result.fallbackDbPath).toContain(".recovered-");
    expect(result.fallbackDbPath).toEndWith(".sqlite");
  });
});
