import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { useGitProjectFixture } from "./git-project-fixture";

describe("git project fixture", () => {
  const fixture = useGitProjectFixture({
    fixtureName: "git-project-fixture-test",
    packageName: "git-project-fixture-test",
    readmeTitle: "# Git Project Fixture Test\n",
    gitIgnore: ".local\nnode_modules\ndist\n",
    extraFiles: [
      {
        relativePath: path.join("nested", "keep.txt"),
        content: "keep\n"
      }
    ]
  });

  test("cloned repo preserves committed baseline and isolates per-test edits", async () => {
    const firstClone = await fixture.createRepoClone("first");
    const secondClone = await fixture.createRepoClone("second");

    expect(existsSync(path.join(firstClone, ".git"))).toBe(true);
    expect(existsSync(path.join(secondClone, ".git"))).toBe(true);

    writeFileSync(path.join(firstClone, "README.md"), "# Changed Clone\n");
    writeFileSync(path.join(firstClone, "local-only.txt"), "local\n");

    expect(normalizeNewlines(await readFile(path.join(secondClone, "README.md"), "utf8"))).toBe("# Git Project Fixture Test\n");
    expect(existsSync(path.join(secondClone, "local-only.txt"))).toBe(false);
    expect(normalizeNewlines(await readFile(path.join(secondClone, "nested", "keep.txt"), "utf8"))).toBe("keep\n");
    expect(normalizeNewlines(await readFile(path.join(fixture.getTemplateRoot(), "README.md"), "utf8"))).toBe(
      "# Git Project Fixture Test\n"
    );
    expect(existsSync(path.join(fixture.getTemplateRoot(), "local-only.txt"))).toBe(false);
  });
});

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n");
}
