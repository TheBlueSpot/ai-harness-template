import { readdirSync } from "node:fs";
import path from "node:path";

export type TestSegment = {
  name: string;
  targets: string[];
  env?: Record<string, string>;
};

const uiSensitiveCliTests = new Set([
  normalizePath("harness/cli/src/branchfs-subagent-integration.test.ts"),
  normalizePath("harness/cli/src/server.correctness.test.ts"),
  normalizePath("harness/cli/src/server.execution-main.test.ts"),
  normalizePath("harness/cli/src/server.execution-main-1.test.ts"),
  normalizePath("harness/cli/src/server.preferences-and-modes.test.ts"),
  normalizePath("harness/cli/src/server.preferences-and-modes-1.test.ts"),
  normalizePath("harness/cli/src/server.preferences-and-modes-2.test.ts"),
  normalizePath("harness/cli/src/server.preferences-and-modes-3.test.ts"),
  normalizePath("harness/cli/src/server.projects-and-history.test.ts"),
  normalizePath("harness/cli/src/server.projects-and-history-1.test.ts"),
  normalizePath("harness/cli/src/server.projects-and-history-2.test.ts"),
  normalizePath("harness/cli/src/server.projects-and-history-3.test.ts"),
  normalizePath("harness/cli/src/server.startup.test.ts"),
  normalizePath("harness/cli/src/server.startup-1.test.ts"),
  normalizePath("harness/cli/src/server.subagents.test.ts"),
  normalizePath("harness/cli/src/server.subagents-1.test.ts"),
  normalizePath("harness/cli/src/ui-build.test.ts")
]);

export function shouldUseDefaultTestSegments(forwardedArgs: string[]) {
  return forwardedArgs.length === 0;
}

export function buildDefaultTestSegments(repoRoot: string): TestSegment[] {
  const cliTests = listTestFiles(path.join(repoRoot, "harness", "cli", "src"))
    .map((filePath) => normalizePath(path.relative(repoRoot, filePath)))
    .sort();
  const coreCliTests = cliTests.filter((filePath) => !uiSensitiveCliTests.has(filePath));
  const uiCliTests = cliTests.filter((filePath) => uiSensitiveCliTests.has(filePath));

  return [
    {
      name: "core",
      targets: [
        normalizePath("scripts"),
        normalizePath("context"),
        normalizePath("harness/shared"),
        ...coreCliTests
      ],
      env: {
        HARNESS_TEST_SKIP_UI_PRELOAD: "1"
      }
    },
    {
      name: "ui",
      targets: [...uiCliTests, normalizePath("harness/ui/src")]
    }
  ];
}

function listTestFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTestFiles(entryPath));
      continue;
    }
    if (/\.test\.tsx?$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function normalizePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}
