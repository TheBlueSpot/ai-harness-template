import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const LEARNINGS_HEADER = "# Durable Learnings";
export const DEFAULT_SKILL_LEARNING_PATH = resolve(__dirname, "..", "LEARNINGS.md");
export const KOJIMA_HEADER = "# Kojima Learnings";
export const DEFAULT_KOJIMA_LEARNING_PATH = resolve(process.cwd(), ".local", "kojima", "learnings.md");

type SaveLearningOptions = {
  learningLine: string;
  outputPath?: string;
  header?: string;
  mirrorToKojima?: boolean;
};

export function saveLearning({
  learningLine,
  outputPath = DEFAULT_SKILL_LEARNING_PATH,
  header = LEARNINGS_HEADER,
  mirrorToKojima = true,
}: SaveLearningOptions): void {
  writeLearning(outputPath, header, learningLine);

  if (mirrorToKojima && resolve(outputPath) !== DEFAULT_KOJIMA_LEARNING_PATH) {
    writeLearning(DEFAULT_KOJIMA_LEARNING_PATH, KOJIMA_HEADER, learningLine);
  }
}

function writeLearning(outputPath: string, header: string, learningLine: string): void {
  const existing = (() => {
    try {
      return readFileSync(outputPath, "utf8");
    } catch {
      return `${header}\n`;
    }
  })();

  const lines = existing.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const hasHeader = lines[0] === header;
  const bodyLines = hasHeader
    ? lines.slice(1).filter((line) => line.trim().length > 0)
    : lines.filter((line) => line.trim().length > 0);

  const normalizedLearning = normalizeLearning(learningLine);
  if (bodyLines.some((line) => normalizeLearning(line) === normalizedLearning)) {
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, [header, "", ...bodyLines, learningLine, ""].join("\n"), "utf8");
}

function normalizeLearning(line: string): string {
  return line
    .toLowerCase()
    .replace(/[`'*_.:,;!?()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
