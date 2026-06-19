import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { resolveGlobalSkillsRoot } from "./harness-paths";

export function syncBundledSkillsToGlobalRoot(options: {
  sourceRoot?: string;
  globalSkillsRoot?: string;
  skillNames?: string[];
} = {}) {
  const sourceRoot = options.sourceRoot ?? process.cwd();
  const globalSkillsRoot = options.globalSkillsRoot ?? resolveGlobalSkillsRoot();
  const sourceSkillsRoot = path.join(sourceRoot, ".agents", "skills");
  if (!existsSync(sourceSkillsRoot)) {
    return [];
  }

  mkdirSync(globalSkillsRoot, { recursive: true });
  const synced: string[] = [];
  for (const skillName of options.skillNames ?? discoverBundledSkillNames(sourceSkillsRoot)) {
    const sourcePath = path.join(sourceSkillsRoot, skillName);
    const destinationPath = path.join(globalSkillsRoot, skillName);
    if (!existsSync(path.join(sourcePath, "SKILL.md"))) {
      continue;
    }
    if (isDestinationCurrent(sourcePath, destinationPath)) {
      continue;
    }

    cpSync(sourcePath, destinationPath, { recursive: true, force: true });
    synced.push(skillName);
  }

  return synced;
}

function discoverBundledSkillNames(sourceSkillsRoot: string) {
  return readdirSync(sourceSkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((skillName) => existsSync(path.join(sourceSkillsRoot, skillName, "SKILL.md")))
    .sort();
}

function isDestinationCurrent(sourcePath: string, destinationPath: string) {
  if (!existsSync(path.join(destinationPath, "SKILL.md"))) {
    return false;
  }

  return newestMtimeMs(destinationPath) >= newestMtimeMs(sourcePath);
}

function newestMtimeMs(rootPath: string): number {
  const stats = statSync(rootPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let newest = stats.mtimeMs;
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtimeMs(entryPath) : statSync(entryPath).mtimeMs);
  }
  return newest;
}
