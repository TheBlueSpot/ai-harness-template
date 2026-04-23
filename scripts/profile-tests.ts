import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildBunTestPlan, stripFlag } from "./test-runner";

const repoRoot = path.resolve(import.meta.dir, "..");
const profileDir = path.join(repoRoot, ".local", "profiles", "tests");

process.chdir(repoRoot);
mkdirSync(profileDir, { recursive: true });

const forwardedArgs = process.argv.slice(2);
const plan = buildBunTestPlan(forwardedArgs, process.env);
const profiledArgs = stripFlag(stripFlag(stripFlag(plan.bunArgs.slice(1), "--reporter"), "--reporter-outfile"), "--dots");

const profileBasename = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const junitXmlPath = path.join(profileDir, `${profileBasename}.xml`);
const outputJsonPath = path.join(profileDir, `${profileBasename}.json`);
const outputMarkdownPath = path.join(profileDir, `${profileBasename}.md`);

console.log(`[test:profile] writing profiles to ${path.relative(repoRoot, profileDir)}`);

const profiledTestProcess = Bun.spawn({
  cmd: [
    process.execPath,
    "test",
    ...profiledArgs,
    "--reporter=junit",
    `--reporter-outfile=${path.relative(repoRoot, junitXmlPath).replaceAll("\\", "/")}`
  ],
  cwd: repoRoot,
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});

const exitCode = await profiledTestProcess.exited;

if (existsSync(junitXmlPath)) {
  const report = {
    ...parseJUnitReport(readFileSync(junitXmlPath, "utf8")),
    workerCount: plan.workerCount,
    parallelDelayMs: plan.parallelDelayMs
  } satisfies ParsedReport;
  writeFileSync(
    outputJsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        junitXmlPath: path.relative(repoRoot, junitXmlPath).replaceAll("\\", "/"),
        workerCount: report.workerCount,
        parallelDelayMs: report.parallelDelayMs,
        tests: report.tests,
        files: report.files
      },
      null,
      2
    )
  );
  writeFileSync(outputMarkdownPath, buildMarkdownSummary(report));
  printSummary(report);
}

if (existsSync(junitXmlPath) || existsSync(outputJsonPath) || existsSync(outputMarkdownPath)) {
  console.log(`[test:profile] junit: ${path.relative(repoRoot, junitXmlPath)}`);
  console.log(`[test:profile] report: ${path.relative(repoRoot, outputJsonPath)}`);
  console.log(`[test:profile] summary: ${path.relative(repoRoot, outputMarkdownPath)}`);
}
process.exit(exitCode);

type TestProfileRecord = {
  name: string;
  file: string;
  line?: number;
  durationMs: number;
  assertions: number;
  status: "pass" | "fail";
};

type FileProfileRecord = {
  file: string;
  durationMs: number;
  tests: number;
  failures: number;
  assertions: number;
};

type ParsedReport = {
  workerCount?: number;
  parallelDelayMs?: number;
  tests: TestProfileRecord[];
  files: FileProfileRecord[];
};

function parseJUnitReport(xmlText: string): ParsedReport {
  const tests = Array.from(xmlText.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g), ([, attributesText, bodyText]) => {
    const attributes = parseXmlAttributes(attributesText);
    const body = bodyText ?? "";
    return {
      name: decodeXml(attributes.name ?? "<unnamed test>"),
      file: normalizeFilePath(decodeXml(attributes.file ?? "<unknown>")),
      line: toOptionalNumber(attributes.line),
      durationMs: roundDuration(Number(attributes.time ?? "0") * 1000),
      assertions: Number(attributes.assertions ?? "0"),
      status: body.includes("<failure") ? "fail" : "pass"
    } satisfies TestProfileRecord;
  }).sort((left, right) => right.durationMs - left.durationMs);

  const fileStats = new Map<string, FileProfileRecord>();
  for (const test of tests) {
    const existing = fileStats.get(test.file) ?? {
      file: test.file,
      durationMs: 0,
      tests: 0,
      failures: 0,
      assertions: 0
    };
    existing.durationMs += test.durationMs;
    existing.tests += 1;
    existing.failures += test.status === "fail" ? 1 : 0;
    existing.assertions += test.assertions;
    fileStats.set(test.file, existing);
  }

  const files = Array.from(fileStats.values())
    .map((record) => ({ ...record, durationMs: roundDuration(record.durationMs) }))
    .sort((left, right) => right.durationMs - left.durationMs);

  return { tests, files };
}

function parseXmlAttributes(attributesText: string) {
  return Object.fromEntries(
    Array.from(attributesText.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g), ([, key, value]) => [key, value])
  );
}

function buildMarkdownSummary(report: ParsedReport) {
  const lines = [
    "# Test Profile",
    "",
    `Parallel workers: ${report.workerCount ?? "unknown"}`,
    `Parallel delay: ${report.parallelDelayMs ?? "unknown"}ms`,
    "",
    "## Slowest Tests",
    ...report.tests.slice(0, 20).map((record, index) => `${index + 1}. ${record.durationMs}ms ${record.file}:${record.line ?? "?"} :: ${record.name} [${record.status}]`),
    "",
    "## Slowest Files",
    ...report.files.slice(0, 20).map((record, index) => `${index + 1}. ${record.durationMs}ms ${record.file} (${record.tests} tests, ${record.failures} failures)`)
  ];
  return `${lines.join("\n")}\n`;
}

function printSummary(report: ParsedReport) {
  console.log("[test:profile] slowest tests");
  for (const record of report.tests.slice(0, 10)) {
    console.log(`[test:profile] ${record.durationMs}ms ${record.file}:${record.line ?? "?"} :: ${record.name} [${record.status}]`);
  }
}

function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function normalizeFilePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

function roundDuration(durationMs: number) {
  return Number(durationMs.toFixed(2));
}

function toOptionalNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
