import { homedir } from "node:os";
import path from "node:path";

export const HARNESS_HOME_DIR_NAME = ".ai-harness-template";
export const HARNESS_HOME_ENV = "AI_HARNESS_TEMPLATE_HOME";

export function resolveHarnessHomeRoot(env: Pick<NodeJS.ProcessEnv, string> = Bun.env) {
  const override = env[HARNESS_HOME_ENV]?.trim();
  return override ? path.resolve(override) : path.join(homedir(), HARNESS_HOME_DIR_NAME);
}

export function resolveHarnessDbPath(env: Pick<NodeJS.ProcessEnv, string> = Bun.env) {
  return env.HARNESS_DB_PATH?.trim() || path.join(resolveHarnessHomeRoot(env), "harness.db");
}

export function resolveGlobalSkillsRoot(env: Pick<NodeJS.ProcessEnv, string> = Bun.env) {
  return path.join(resolveHarnessHomeRoot(env), "skills");
}
