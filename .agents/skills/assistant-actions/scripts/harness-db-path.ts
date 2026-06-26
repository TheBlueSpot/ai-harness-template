import { homedir } from "node:os";
import path from "node:path";

const HARNESS_HOME_DIR_NAME = ".ai-harness-template";
const HARNESS_HOME_ENV = "AI_HARNESS_TEMPLATE_HOME";

export function resolveHarnessDbPath(env: Pick<NodeJS.ProcessEnv, string> = Bun.env) {
  const override = env.HARNESS_DB_PATH?.trim();
  return override ? resolvePathWithHome(override) : path.join(resolveHarnessHomeRoot(env), "harness.db");
}

function resolveHarnessHomeRoot(env: Pick<NodeJS.ProcessEnv, string>) {
  const override = env[HARNESS_HOME_ENV]?.trim();
  return override ? resolvePathWithHome(override) : path.join(homedir(), HARNESS_HOME_DIR_NAME);
}

function resolvePathWithHome(rawPath: string) {
  if (rawPath === "~") {
    return homedir();
  }
  if (rawPath.startsWith("~/") || rawPath.startsWith("~\\")) {
    return path.join(homedir(), rawPath.slice(2));
  }
  return path.resolve(rawPath);
}
