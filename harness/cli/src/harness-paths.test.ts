import { describe, expect, test } from "bun:test";
import path from "node:path";
import { HARNESS_HOME_DIR_NAME, resolveGlobalSkillsRoot, resolveHarnessDbPath, resolveHarnessHomeRoot } from "./harness-paths";

describe("harness paths", () => {
  test("uses ~/.ai-harness-template as the default home root", () => {
    const homeRoot = resolveHarnessHomeRoot({});

    expect(path.basename(homeRoot)).toBe(HARNESS_HOME_DIR_NAME);
    expect(resolveHarnessDbPath({})).toBe(path.join(homeRoot, "harness.db"));
    expect(resolveGlobalSkillsRoot({})).toBe(path.join(homeRoot, "skills"));
  });

  test("honors explicit env overrides", () => {
    const homeRoot = path.join(process.cwd(), ".tmp-test-data", `home-${crypto.randomUUID()}`);
    const dbPath = path.join(process.cwd(), ".tmp-test-data", `db-${crypto.randomUUID()}.sqlite`);

    expect(resolveHarnessHomeRoot({ AI_HARNESS_TEMPLATE_HOME: homeRoot })).toBe(homeRoot);
    expect(resolveHarnessDbPath({ AI_HARNESS_TEMPLATE_HOME: homeRoot })).toBe(path.join(homeRoot, "harness.db"));
    expect(resolveHarnessDbPath({ AI_HARNESS_TEMPLATE_HOME: homeRoot, HARNESS_DB_PATH: dbPath })).toBe(dbPath);
  });
});
