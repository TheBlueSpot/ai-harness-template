import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { syncBundledSkillsToGlobalRoot } from "./global-skills";

describe("global skills", () => {
  test("copies bundled skills into the global skills root", () => {
    const root = path.join(process.cwd(), ".tmp-test-data", `global-skills-${crypto.randomUUID()}`);
    const sourceRoot = path.join(root, "source");
    const globalRoot = path.join(root, "home", "skills");
    const sourceSkill = path.join(sourceRoot, ".agents", "skills", "caveman");
    mkdirSync(sourceSkill, { recursive: true });
    writeFileSync(path.join(sourceSkill, "SKILL.md"), "# caveman\n");

    try {
      const synced = syncBundledSkillsToGlobalRoot({
        sourceRoot,
        globalSkillsRoot: globalRoot,
        skillNames: ["caveman"]
      });

      expect(synced).toEqual(["caveman"]);
      expect(existsSync(path.join(globalRoot, "caveman", "SKILL.md"))).toBe(true);
      expect(readFileSync(path.join(globalRoot, "caveman", "SKILL.md"), "utf8")).toBe("# caveman\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
