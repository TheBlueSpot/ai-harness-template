import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { inspectInlineBootScripts, inspectScriptSyntax, type BootIssueCode } from "./boot_sanity";
import {
  findCatalogFolders,
  isGameQueueSlug,
  resolveLocalPathRisk,
  type QueueRecord,
  type QueueState,
} from "./catalog_candidates";
import { buildReadmeGuidance, inspectReadmeHygiene, type ReadmeIssueCode } from "./readme_hygiene";
import { inspectSmokeArtifacts } from "./smoke_artifacts";

export type EntryIssueCode =
  | "missing-readme"
  | "missing-queue-record"
  | "duplicate-queue-record"
  | "mixed-queue-states"
  | ReadmeIssueCode
  | BootIssueCode
  | "missing-local-reference"
  | "missing-local-import"
  | "casing-drift"
  | "missing-smoke-proof"
  | "stale-smoke-proof";

export type EntryIssue = {
  code: EntryIssueCode;
  detail: string;
};

export type CatalogEntryReport = {
  slug: string;
  queueState: QueueState;
  queueRecords: number;
  hasReadme: boolean;
  readmeGuidance: string[];
  issues: EntryIssue[];
};

export type QueueOnlyIssueCode = "missing-entry-folder";

export type QueueOnlyIssue = {
  code: QueueOnlyIssueCode;
  detail: string;
};

export type QueueOnlyReport = {
  slug: string;
  queueState: QueueState;
  queueRecords: number;
  title: string;
  issues: QueueOnlyIssue[];
};

type HtmlScanResult = {
  localScriptPaths: string[];
  moduleEntrypoints: string[];
};

function isLocalReference(value: string): boolean {
  if (!value) {
    return false;
  }

  return !(
    value.startsWith("http://")
    || value.startsWith("https://")
    || value.startsWith("data:")
    || value.startsWith("mailto:")
    || value.startsWith("javascript:")
    || value.startsWith("#")
    || value.startsWith("/")
  );
}

function isRelativeImport(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

function readText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function relativeEntryPath(entryRoot: string, filePath: string): string {
  return filePath.slice(entryRoot.length + 1).replaceAll("\\", "/");
}

function scanHtmlReferences(entryRoot: string, htmlPath: string, issues: EntryIssue[]): HtmlScanResult {
  const html = readText(htmlPath);
  const htmlWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const moduleEntrypoints: string[] = [];
  const localScriptPaths: string[] = [];
  const attrPattern = /<(script|link|img|source|audio|video|a)\b[^>]*?\b(src|href)=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(htmlWithoutScripts)) !== null) {
    const tagName = match[1].toLowerCase();
    const reference = match[3].trim();
    if (!isLocalReference(reference)) {
      continue;
    }

    const risk = resolveLocalPathRisk(entryRoot, reference);
    if (risk.kind === "missing") {
      issues.push({
        code: "missing-local-reference",
        detail: `index.html references missing ${tagName} path ${reference}`,
      });
      continue;
    }

    if (risk.kind === "case-drift") {
      issues.push({
        code: "casing-drift",
        detail: `index.html references ${reference} but actual path casing is ${relativeEntryPath(entryRoot, risk.actualPath)}`,
      });
    }

    if (tagName === "script" && extname(risk.resolvedPath).toLowerCase() === ".js") {
      localScriptPaths.push(risk.resolvedPath);
      const scriptTag = match[0];
      if (/type=["']module["']/i.test(scriptTag)) {
        moduleEntrypoints.push(risk.resolvedPath);
      }
    }
  }

  const inlineModulePattern = /<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = inlineModulePattern.exec(html)) !== null) {
    const inlineSource = match[1];
    const importPattern = /\bimport\s+(?:[^"'`]+\s+from\s+)?["']([^"'`]+)["']/g;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importPattern.exec(inlineSource)) !== null) {
      const reference = importMatch[1].trim();
      if (!isRelativeImport(reference)) {
        continue;
      }
      const risk = resolveLocalPathRisk(dirname(htmlPath), reference);
      if (risk.kind === "missing") {
        issues.push({
          code: "missing-local-import",
          detail: `inline module import is missing ${reference}`,
        });
      } else {
        if (risk.kind === "case-drift") {
          issues.push({
            code: "casing-drift",
            detail: `inline module import ${reference} resolves to ${relativeEntryPath(entryRoot, risk.actualPath)}`,
          });
        }

        if (extname(risk.resolvedPath).toLowerCase() === ".js") {
          moduleEntrypoints.push(risk.resolvedPath);
        }
      }
    }
  }

  return { localScriptPaths, moduleEntrypoints };
}

function scanJsImports(
  entryRoot: string,
  entrypoints: string[],
  issues: EntryIssue[],
  syntaxChecked: Set<string>,
): void {
  const queue = [...new Set(entrypoints)];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath || seen.has(filePath) || !existsSync(filePath)) {
      continue;
    }
    seen.add(filePath);

    const source = readText(filePath);
    if (!syntaxChecked.has(filePath)) {
      syntaxChecked.add(filePath);
      issues.push(...inspectScriptSyntax(relativeEntryPath(entryRoot, filePath), source));
    }
    const importPattern = /\bimport\s+(?:[^"'`]+\s+from\s+)?["']([^"'`]+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = importPattern.exec(source)) !== null) {
      const reference = match[1].trim();
      if (!isRelativeImport(reference)) {
        continue;
      }

      const risk = resolveLocalPathRisk(dirname(filePath), reference);
      if (risk.kind === "missing") {
        issues.push({
          code: "missing-local-import",
          detail: `${relativeEntryPath(entryRoot, filePath)} imports missing ${reference}`,
        });
        continue;
      }

      if (risk.kind === "case-drift") {
        issues.push({
          code: "casing-drift",
          detail: `${relativeEntryPath(entryRoot, filePath)} imports ${reference} but actual path casing is ${relativeEntryPath(entryRoot, risk.actualPath)}`,
        });
      }

      if (extname(risk.resolvedPath).toLowerCase() === ".js") {
        queue.push(risk.resolvedPath);
      }
    }
  }
}

export function buildEntryReport(root: string, slug: string, todoRecords: Map<string, QueueRecord[]>): CatalogEntryReport {
  const entryRoot = resolve(root, slug);
  const htmlPath = resolve(entryRoot, "index.html");
  const hasReadme = existsSync(resolve(entryRoot, "README.md"));
  const queueRecords = todoRecords.get(slug) ?? [];
  const queueStates = new Set(queueRecords.map((record) => record.state));
  const queueState = queueStates.has("pending")
    ? "pending"
    : queueStates.has("completed")
      ? "completed"
      : "untracked";
  const issues: EntryIssue[] = [];
  const syntaxChecked = new Set<string>();

  if (!hasReadme) {
    issues.push({ code: "missing-readme", detail: "README.md is missing" });
  }
  const readmeIssues = hasReadme ? inspectReadmeHygiene(root, slug) : [];
  issues.push(...readmeIssues);
  if (queueRecords.length === 0) {
    issues.push({ code: "missing-queue-record", detail: "No todo.md record for this browser-playable folder" });
  }
  const pendingQueueRecords = queueRecords.filter((record) => record.state === "pending").length;
  if (pendingQueueRecords > 1) {
    issues.push({ code: "duplicate-queue-record", detail: `todo.md has ${queueRecords.length} records for this slug` });
  }
  if (queueStates.size > 1) {
    issues.push({
      code: "mixed-queue-states",
      detail: `todo.md mixes ${Array.from(queueStates).sort().join(" + ")} records for this slug`,
    });
  }

  issues.push(...inspectInlineBootScripts(htmlPath));
  const htmlScan = scanHtmlReferences(entryRoot, htmlPath, issues);
  for (const scriptPath of new Set(htmlScan.localScriptPaths)) {
    if (syntaxChecked.has(scriptPath)) {
      continue;
    }
    syntaxChecked.add(scriptPath);
    issues.push(...inspectScriptSyntax(relativeEntryPath(entryRoot, scriptPath), readText(scriptPath)));
  }
  scanJsImports(entryRoot, htmlScan.moduleEntrypoints, issues, syntaxChecked);

  const smokeStatus = inspectSmokeArtifacts(root, slug);
  if (smokeStatus.kind === "missing") {
    issues.push({
      code: "missing-smoke-proof",
      detail: "No local smoke artifact found under ./.local for this entry",
    });
  } else if (smokeStatus.stale) {
    issues.push({
      code: "stale-smoke-proof",
      detail: `${smokeStatus.latestSmokeName} predates ${smokeStatus.latestContentName}`,
    });
  }

  return {
    slug,
    queueState,
    queueRecords: queueRecords.length,
    hasReadme,
    readmeGuidance: buildReadmeGuidance(hasReadme, readmeIssues),
    issues,
  };
}

export function buildReports(
  root: string,
  todoRecords: Map<string, QueueRecord[]>,
  folder?: string,
): CatalogEntryReport[] {
  const folders = folder ? [folder] : findCatalogFolders(root);
  return folders
    .filter((slug) => existsSync(resolve(root, slug, "index.html")))
    .map((slug) => buildEntryReport(root, slug, todoRecords));
}

export function buildQueueOnlyReports(
  todoRecords: Map<string, QueueRecord[]>,
  folderSlugs: Set<string>,
  folder?: string,
): QueueOnlyReport[] {
  const queueOnly: QueueOnlyReport[] = [];

  for (const [slug, records] of todoRecords.entries()) {
    if (!isGameQueueSlug(slug)) {
      continue;
    }
    if (folder && slug !== folder) {
      continue;
    }
    if (folderSlugs.has(slug)) {
      continue;
    }

    queueOnly.push({
      slug,
      queueState: records[0]?.state ?? "untracked",
      queueRecords: records.length,
      title: records[0]?.title ?? slug,
      issues: [
        {
          code: "missing-entry-folder",
          detail: "todo.md record has no matching top-level folder with index.html",
        },
      ],
    });
  }

  return queueOnly.sort((left, right) => left.slug.localeCompare(right.slug));
}
