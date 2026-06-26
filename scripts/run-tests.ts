import path from "node:path";
import { buildBunTestPlan, stripFlag } from "./test-runner";
import { buildDefaultTestSegments, shouldUseDefaultTestSegments, type TestSegment } from "./test-segments";

const repoRoot = path.resolve(import.meta.dir, "..");
const forwardedArgs = process.argv.slice(2);
const plan = buildBunTestPlan(forwardedArgs, process.env);

let exitCode = 0;

if (shouldUseDefaultTestSegments(forwardedArgs)) {
  const segmentResults = await Promise.all(buildDefaultTestSegments(repoRoot).map(async (segment) => {
    console.log(`[test] ${segment.name}`);
    const segmentStart = performance.now();
    const testProcess = Bun.spawn({
      cmd: [process.execPath, ...buildSegmentBunArgs(plan.bunArgs, segment), ...segment.targets],
      cwd: repoRoot,
      env: { ...process.env, ...segment.env },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    });
    const segmentExitCode = await testProcess.exited;
    console.log(`[test] ${segment.name} completed in ${Math.round(performance.now() - segmentStart)}ms`);
    return segmentExitCode;
  }));
  exitCode = segmentResults.find((segmentExitCode) => segmentExitCode !== 0) ?? 0;
} else {
  const testProcess = Bun.spawn({
    cmd: [process.execPath, ...plan.bunArgs],
    cwd: repoRoot,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });
  exitCode = await testProcess.exited;
}

process.exit(exitCode);

function buildSegmentBunArgs(bunArgs: string[], segment: TestSegment) {
  if (!segment.serial) {
    return bunArgs;
  }
  return stripFlag(stripFlag(bunArgs, "--parallel"), "--parallel-delay");
}
