import path from "node:path";
import { buildBunTestPlan } from "./test-runner";

const repoRoot = path.resolve(import.meta.dir, "..");
const plan = buildBunTestPlan(process.argv.slice(2), process.env);

const testProcess = Bun.spawn({
  cmd: [process.execPath, ...plan.bunArgs],
  cwd: repoRoot,
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});

process.exit(await testProcess.exited);
