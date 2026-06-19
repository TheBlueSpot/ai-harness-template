import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { resolveGlobalSkillsRoot } from "./harness-paths";

export type SubagentEnvironmentBriefInput = {
  projectRoot: string;
  repoRoot: string;
  relativeProjectRoot?: string;
  availableSkillPaths?: string[];
  toolCapabilities?: string[];
};

export const SUBAGENT_MILESTONE_INSTRUCTION =
  "Emit standalone `MILESTONE: <brief update>` lines only for stable meaning: concrete findings, decisions, implementation progress, blockers, retries, completion, or handoff. Do not include tool names, shell commands, raw paths, or generic checking/inspecting chatter unless it reports a concrete result.";

export function resolveRepoRoot(projectRoot: string) {
  const result = tryResolveGitRepoRoot(projectRoot);
  if (!result) {
    return projectRoot;
  }

  if (result.exitCode !== 0) {
    return projectRoot;
  }

  const root = new TextDecoder().decode(result.stdout).trim();
  return root || projectRoot;
}

function tryResolveGitRepoRoot(projectRoot: string) {
  try {
    return Bun.spawnSync({
      cmd: ["git", "rev-parse", "--show-toplevel"],
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch {
    return undefined;
  }
}

export function discoverRepoSkillPaths(repoRoot: string) {
  return [...discoverGlobalSkillPaths(), ...discoverProjectSkillPaths(repoRoot)].sort();
}

export function discoverProjectSkillPaths(repoRoot: string) {
  const skillsRoot = path.join(repoRoot, ".agents", "skills");
  if (!existsSync(skillsRoot)) {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
    .filter((skillPath) => existsSync(skillPath))
    .map((skillPath) => toRepoRelativePath(repoRoot, skillPath))
    .sort();
}

export function discoverGlobalSkillPaths(skillsRoot: string = resolveGlobalSkillsRoot()) {
  if (!existsSync(skillsRoot)) {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
    .filter((skillPath) => existsSync(skillPath))
    .map((skillPath) => normalizeRelativePath(skillPath))
    .sort();
}

export function buildSubagentEnvironmentBrief(input: SubagentEnvironmentBriefInput) {
  const relativeProjectRoot = (input.relativeProjectRoot ?? getRelativeProjectRoot(input.repoRoot, input.projectRoot)) || ".";
  const skillLines = input.availableSkillPaths?.length
    ? input.availableSkillPaths.map((skillPath) => `- ${skillPath}`)
    : ["- none discovered"];
  const capabilityLines = input.toolCapabilities?.length
    ? ["Tool capabilities:", ...input.toolCapabilities.map((capability) => `- ${capability}`)]
    : [];

  return [
    "Subagent environment:",
    `- Execution cwd: ${input.projectRoot}`,
    `- Repository root: ${input.repoRoot}`,
    `- Project path relative to repository root: ${relativeProjectRoot}`,
    "- This project may be nested inside the repo.",
    "- Repo-level files such as AGENTS.md and .agents live at repo root.",
    "- Do not invent skill paths.",
    "- Project skills live under .agents/skills/<name>/SKILL.md when present.",
    `- Global skills live under ${normalizeRelativePath(resolveGlobalSkillsRoot())}/<name>/SKILL.md when present.`,
    "Available skill files:",
    ...skillLines,
    ...buildAgentInstructionHints(input.repoRoot),
    "Windows-safe search recipes:",
    "- Test-Path .\\tower-hologram",
    "- Get-ChildItem -Force",
    "- rg -n \"loadAssets|ASSET_MANIFEST|tower-hologram|asset\" . --glob '!**/node_modules/**'",
    "- rg --files . | rg \"\\.(png|wav|mp3|ogg)$\"",
    "Search rules:",
    "- Check Test-Path before searching a named folder.",
    "- If a target is missing in the execution cwd, search the repository root intentionally.",
    "- Avoid nested quote patterns like \\\"'$\\\" and -g '\"!.",
    "Asset policy:",
    "- .wav, .mp3, .ogg, images, and SVG can be used directly in HTML5.",
    "- Do not run ffmpeg -version unless the task explicitly asks for conversion or generation.",
    "- If conversion is required and ffmpeg is missing, report the blocker and use existing browser-native assets when possible.",
    ...capabilityLines
  ].join("\n");
}

function buildAgentInstructionHints(repoRoot: string) {
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    return [];
  }

  const content = readFileSync(agentsPath, "utf8");
  if (!/\/caveman\s+ultra/i.test(content)) {
    return [];
  }

  return ["Communication style: terse /caveman ultra. Keep progress and final summaries compact."];
}

function toRepoRelativePath(repoRoot: string, value: string) {
  return normalizeRelativePath(path.relative(repoRoot, value));
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/");
}

function getRelativeProjectRoot(repoRoot: string, projectRoot: string) {
  const canonicalRepoRoot = canonicalPath(repoRoot);
  const canonicalProjectRoot = canonicalPath(projectRoot);
  if (normalizeRelativePath(canonicalRepoRoot).toLowerCase() === normalizeRelativePath(canonicalProjectRoot).toLowerCase()) {
    return ".";
  }
  return normalizeRelativePath(path.relative(canonicalRepoRoot, canonicalProjectRoot));
}

function canonicalPath(value: string) {
  try {
    return realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}
