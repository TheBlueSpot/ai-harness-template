import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverRepoSkillPaths } from "./subagent-environment";

describe("subagent environment skill discovery", () => {
  test("includes global skills for projects without repo-local skills", () => {
    const root = path.join(process.cwd(), ".tmp-test-data", `subagent-skills-${crypto.randomUUID()}`);
    const projectRoot = path.join(root, "project");
    const globalSkillsRoot = path.join(root, "home", "skills");
    const previousHome = Bun.env.AI_HARNESS_TEMPLATE_HOME;
    mkdirSync(projectRoot, { recursive: true });
    for (const skillName of ["assistant-actions", "grill-me"]) {
      const skillRoot = path.join(globalSkillsRoot, skillName);
      mkdirSync(skillRoot, { recursive: true });
      writeFileSync(path.join(skillRoot, "SKILL.md"), `# ${skillName}\n`);
    }

    try {
      Bun.env.AI_HARNESS_TEMPLATE_HOME = path.join(root, "home");
      expect(discoverRepoSkillPaths(projectRoot)).toEqual([
        path.join(globalSkillsRoot, "assistant-actions", "SKILL.md").replace(/\\/g, "/"),
        path.join(globalSkillsRoot, "grill-me", "SKILL.md").replace(/\\/g, "/")
      ]);
    } finally {
      if (previousHome === undefined) {
        delete Bun.env.AI_HARNESS_TEMPLATE_HOME;
      } else {
        Bun.env.AI_HARNESS_TEMPLATE_HOME = previousHome;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
