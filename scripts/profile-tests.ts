import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildBunTestPlan, stripFlag } from "./test-runner";
import { buildDefaultTestSegments, shouldUseDefaultTestSegments, type TestSegment } from "./test-segments";

const repoRoot = path.resolve(import.meta.dir, "..");
const profileDir = path.join(repoRoot, ".local", "profiles", "tests");

process.chdir(repoRoot);
mkdirSync(profileDir, { recursive: true });

const forwardedArgs = process.argv.slice(2);
const plan = buildBunTestPlan(forwardedArgs, process.env);
const profiledArgs = stripFlag(stripFlag(stripFlag(plan.bunArgs.slice(1), "--reporter"), "--reporter-outfile"), "--dots");

const profileBasename = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const defaultSegments = shouldUseDefaultTestSegments(forwardedArgs)
  ? buildDefaultTestSegments(repoRoot)
  : [{ name: "all", targets: [], env: {} }] satisfies TestSegment[];
const junitXmlPaths = defaultSegments.map((segment) => path.join(profileDir, `${profileBasename}.${segment.name}.xml`));
const junitXmlPath = junitXmlPaths[0] ?? path.join(profileDir, `${profileBasename}.xml`);
const outputJsonPath = path.join(profileDir, `${profileBasename}.json`);
const outputMarkdownPath = path.join(profileDir, `${profileBasename}.md`);
const maxTestDurationMs = parseOptionalPositiveInteger(process.env.HARNESS_TEST_PROFILE_MAX_TEST_MS) ?? 5000;
let profileExceededThreshold = false;

console.log(`[test:profile] writing profiles to ${path.relative(repoRoot, profileDir)}`);

const segmentExitCodes = await Promise.all(defaultSegments.map(async (segment, index) => {
  const segmentJunitXmlPath = junitXmlPaths[index]!;
  if (defaultSegments.length > 1) {
    console.log(`[test:profile] ${segment.name}`);
  }
  const segmentStart = performance.now();
  const profiledTestProcess = Bun.spawn({
    cmd: [
      process.execPath,
      "test",
      ...buildSegmentProfiledArgs(profiledArgs, segment),
      ...segment.targets,
      "--reporter=junit",
      `--reporter-outfile=${path.relative(repoRoot, segmentJunitXmlPath).replaceAll("\\", "/")}`
    ],
    cwd: repoRoot,
    env: { ...process.env, ...segment.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });

  const segmentExitCode = await profiledTestProcess.exited;
  console.log(`[test:profile] ${segment.name} completed in ${Math.round(performance.now() - segmentStart)}ms`);
  return segmentExitCode;
}));
const exitCode = segmentExitCodes.find((segmentExitCode) => segmentExitCode !== 0) ?? 0;

const existingJunitXmlPaths = junitXmlPaths.filter((currentPath) => existsSync(currentPath));
if (existingJunitXmlPaths.length > 0) {
  const report = {
    ...mergeParsedReports(existingJunitXmlPaths.map((currentPath) => parseJUnitReport(readFileSync(currentPath, "utf8")))),
    workerCount: plan.workerCount,
    parallelDelayMs: plan.parallelDelayMs
  } satisfies ParsedReport;
  writeFileSync(
    outputJsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        junitXmlPath: path.relative(repoRoot, junitXmlPath).replaceAll("\\", "/"),
        junitXmlPaths: existingJunitXmlPaths.map((currentPath) => path.relative(repoRoot, currentPath).replaceAll("\\", "/")),
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
  const slowThresholdFailures = report.tests.filter((record) => record.status === "pass" && record.durationMs > maxTestDurationMs);
  profileExceededThreshold = slowThresholdFailures.length > 0;
  if (slowThresholdFailures.length > 0) {
    console.error(`[test:profile] ${slowThresholdFailures.length} passing test(s) exceeded ${maxTestDurationMs}ms. Set HARNESS_TEST_PROFILE_MAX_TEST_MS to opt into a different threshold.`);
    for (const record of slowThresholdFailures.slice(0, 10)) {
      console.error(`[test:profile] slow ${record.durationMs}ms ${record.file}:${record.line ?? "?"} :: ${record.name}`);
    }
  }
}

if (existingJunitXmlPaths.length > 0 || existsSync(outputJsonPath) || existsSync(outputMarkdownPath)) {
  for (const existingJunitXmlPath of existingJunitXmlPaths) {
    console.log(`[test:profile] junit: ${path.relative(repoRoot, existingJunitXmlPath)}`);
  }
  console.log(`[test:profile] report: ${path.relative(repoRoot, outputJsonPath)}`);
  console.log(`[test:profile] summary: ${path.relative(repoRoot, outputMarkdownPath)}`);
}
process.exit(exitCode || (profileExceededThreshold ? 1 : 0));

function buildSegmentProfiledArgs(args: string[], segment: TestSegment) {
  if (!segment.serial) {
    return args;
  }
  return stripFlag(stripFlag(args, "--parallel"), "--parallel-delay");
}

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

function mergeParsedReports(reports: ParsedReport[]): ParsedReport {
  const tests = reports.flatMap((report) => report.tests).sort((left, right) => right.durationMs - left.durationMs);
  const fileStats = new Map<string, FileProfileRecord>();
  for (const report of reports) {
    for (const file of report.files) {
      const existing = fileStats.get(file.file) ?? {
        file: file.file,
        durationMs: 0,
        tests: 0,
        failures: 0,
        assertions: 0
      };
      existing.durationMs += file.durationMs;
      existing.tests += file.tests;
      existing.failures += file.failures;
      existing.assertions += file.assertions;
      fileStats.set(file.file, existing);
    }
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

function parseOptionalPositiveInteger(rawValue: string | undefined) {
  if (!rawValue) {
    return undefined;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}
