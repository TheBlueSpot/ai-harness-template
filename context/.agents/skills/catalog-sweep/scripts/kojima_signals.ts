import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = process.cwd();
const DEFAULT_KOJIMA_PATHS = [
  resolve(ROOT, "local", "kojima", "learnings.md"),
  resolve(ROOT, ".agents", "assistants", "kojima-learnings.md"),
];
const DEFAULT_SECTION_LIMIT = 6;
const DEFAULT_SIGNAL_LIMIT = 4;

export type KojimaSignalSnapshot = {
  sourcePath: string;
  scannedSectionTitles: string[];
  signalLines: string[];
};

type LearningsSection = {
  title: string;
  bullets: string[];
};

function normalizeSignal(line: string): string {
  return line
    .toLowerCase()
    .replace(/[`'*_.:,;!?()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLearningsSections(markdown: string): LearningsSection[] {
  const sections: LearningsSection[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let current: LearningsSection | null = null;
  let inDurableLearnings = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current && current.bullets.length > 0) {
        sections.push(current);
      }
      current = { title: line.slice(3).trim(), bullets: [] };
      inDurableLearnings = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.trim() === "Durable learnings:") {
      inDurableLearnings = true;
      continue;
    }

    if (!inDurableLearnings) {
      continue;
    }

    if (line.startsWith("## ") || /^[A-Z][A-Za-z -]+:$/.test(line.trim())) {
      inDurableLearnings = false;
      continue;
    }

    const match = line.match(/^\*\s+(.*\S)\s*$/);
    if (match) {
      current.bullets.push(match[1].trim());
    }
  }

  if (current && current.bullets.length > 0) {
    sections.push(current);
  }

  if (sections.length > 0) {
    return sections;
  }

  const flatBullets = lines
    .map((line) => line.match(/^[-*]\s+(.*\S)\s*$/)?.[1].trim())
    .filter((line): line is string => Boolean(line));

  if (flatBullets.length === 0) {
    return sections;
  }

  return [{ title: "Recent durable learnings", bullets: flatBullets }];
}

export function buildKojimaSignals(
  sourcePath?: string,
  sectionLimit = DEFAULT_SECTION_LIMIT,
  signalLimit = DEFAULT_SIGNAL_LIMIT,
): KojimaSignalSnapshot {
  const candidatePaths = sourcePath ? [sourcePath] : DEFAULT_KOJIMA_PATHS;

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    const markdown = readFileSync(candidatePath, "utf8");
    const recentSections = parseLearningsSections(markdown).slice(0, sectionLimit);
    const seen = new Set<string>();
    const signalLines: string[] = [];

    for (const section of recentSections) {
      for (const bullet of section.bullets) {
        const normalized = normalizeSignal(bullet);
        if (seen.has(normalized)) {
          continue;
        }

        seen.add(normalized);
        signalLines.push(bullet);

        if (signalLines.length >= signalLimit) {
          return {
            sourcePath: toRepoRelative(candidatePath),
            scannedSectionTitles: recentSections.map((sectionEntry) => sectionEntry.title),
            signalLines,
          };
        }
      }
    }

    if (recentSections.length > 0) {
      return {
        sourcePath: toRepoRelative(candidatePath),
        scannedSectionTitles: recentSections.map((section) => section.title),
        signalLines,
      };
    }
  }

  return {
    sourcePath: toRepoRelative(candidatePaths[0] ?? DEFAULT_KOJIMA_PATHS[0]),
    scannedSectionTitles: [],
    signalLines: [],
  };
}

function toRepoRelative(path: string): string {
  const relativePath = relative(ROOT, path).replaceAll("\\", "/");
  return relativePath.length > 0 ? `./${relativePath}` : ".";
}
