import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

test("coverage matrix has one real row for each shipped user story", () => {
  const storyIds = readShippedStoryIds();
  const rows = readCoverageRows();

  expect(rows.map((row) => row.id).sort()).toEqual([...storyIds].sort());
});

test("coverage matrix references existing test files", () => {
  const missing = readReferencedTests().filter((testPath) => !existsSync(path.join(repoRoot, testPath)));

  expect(missing).toEqual([]);
});

function readShippedStoryIds() {
  const source = readRepoFile("docs/user-stories.md").split(/\r?\n/);
  const ids: string[] = [];
  for (const line of source) {
    if (line.startsWith("## Roadmap")) {
      break;
    }
    const match = line.match(/^(US-[A-Z]+-\d{3}):/);
    if (match) {
      ids.push(match[1]!);
    }
  }
  return ids;
}

function readCoverageRows() {
  return readRepoFile("docs/coverage-matrix.md")
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\| (US-[A-Z]+-\d{3}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/);
      return match
        ? [
            {
              id: match[1]!,
              coveredBy: match[2]!.trim(),
              depth: match[3]!.trim(),
              gap: match[4]!.trim()
            }
          ]
        : [];
    });
}

function readReferencedTests() {
  const matrix = readRepoFile("docs/coverage-matrix.md");
  const refs = new Set<string>();
  for (const match of matrix.matchAll(/(?:harness|scripts)\/[^,|` )]+?\.test\.(?:tsx|ts)/g)) {
    refs.add(match[0]!.replaceAll("/", path.sep));
  }
  return [...refs].sort();
}

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}
