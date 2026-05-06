import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";

export type SupportDoc = {
  file: string;
  title: string;
  linkedFromReadme: boolean;
  summary: string;
};

export function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

export function formatQueueState(state: QueueState): string {
  if (state === "completed") {
    return "completed";
  }
  if (state === "pending") {
    return "pending";
  }
  return "untracked";
}

export function readQueueState(root: string, slug: string): QueueState {
  const todoPath = resolve(root, "todo.md");
  if (!existsSync(todoPath)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(todoPath);
  const records = todoRecords.get(slug) ?? [];
  if (records.some((record) => record.state === "pending")) {
    return "pending";
  }
  if (records.some((record) => record.state === "completed")) {
    return "completed";
  }
  return "untracked";
}

export function collectSupportDocs(root: string, slug: string, readmeText: string | null): SupportDoc[] {
  const folder = resolve(root, slug);
  if (!existsSync(folder)) {
    return [];
  }

  return walkMarkdownFiles(folder)
    .filter((file) => file.toLowerCase() !== "readme.md")
    .sort((left, right) => left.localeCompare(right))
    .map((file) => {
      const text = readFileSync(resolve(folder, file), "utf8");
      const linkedFromReadme = readmeText
        ? new RegExp(`\\]\\((?:\\./)?${escapeForRegex(file).replace(/\\\//g, "[\\\\/]")}\\)`, "i").test(readmeText)
        : false;

      return {
        file,
        title: extractTitle(text, file),
        linkedFromReadme,
        summary: extractSummary(text, file),
      };
    });
}

export function buildRelatedDocsBlock(docs: SupportDoc[]): string | null {
  if (docs.length === 0) {
    return null;
  }

  return [
    "## Related Docs",
    "",
    ...docs.map((doc) => `- [${doc.title}](./${doc.file}): ${doc.summary}`),
  ].join("\n");
}

function walkMarkdownFiles(root: string, currentRelative = "", depth = 2): string[] {
  if (depth < 0) {
    return [];
  }

  const current = currentRelative.length > 0 ? resolve(root, currentRelative) : root;
  const output: string[] = [];

  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const nextRelative = currentRelative.length > 0 ? `${currentRelative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      output.push(...walkMarkdownFiles(root, nextRelative, depth - 1));
      continue;
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      output.push(nextRelative.replace(/\\/g, "/"));
    }
  }

  return output;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(markdownText: string, file: string): string {
  const headingMatch = markdownText.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return normalizeLine(headingMatch[1]);
  }

  const fallback = file.replace(/\.md$/i, "").split("/").pop() ?? file;
  return prettifySlug(fallback);
}

function extractSummary(markdownText: string, file: string): string {
  const lower = file.toLowerCase();
  if (lower.includes("playtest")) {
    return "Direct-play evidence and downstream audit inputs.";
  }
  if (lower.includes("asset") || lower.includes("attribution")) {
    return "Asset provenance and supporting art notes.";
  }
  if (lower.includes("overview")) {
    return "Supporting overview notes for this entry.";
  }
  if (lower.includes("docs/")) {
    return "Supporting design or implementation notes for this entry.";
  }

  const lines = markdownText.replace(/\r\n/g, "\n").split("\n");
  const paragraph: string[] = [];
  let sawHeading = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!sawHeading && /^#\s+/.test(line)) {
      sawHeading = true;
      continue;
    }
    if (line.length === 0) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (/^#/.test(line)) {
      continue;
    }
    paragraph.push(line);
  }

  if (paragraph.length > 0) {
    return normalizeLine(paragraph.join(" "));
  }

  return "Supporting markdown detail for this entry.";
}
