import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isRecoverableWorkspaceDatabaseError, purgeWorkspaceDatabase } from "./dev-db-recovery";

describe("dev db recovery", () => {
  test("detects recoverable sqlite schema errors", () => {
    expect(isRecoverableWorkspaceDatabaseError(new Error("SQLiteError: no such column: updated_at"))).toBe(true);
    expect(isRecoverableWorkspaceDatabaseError(new Error("database disk image is malformed"))).toBe(true);
    expect(isRecoverableWorkspaceDatabaseError(new Error("totally different failure"))).toBe(false);
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
});
