import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { parseTodoRecords, resolveLocalPathRisk, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReviewFreshnessEntries } from "./review_freshness_core";
import { inspectSmokeArtifacts } from "./smoke_artifacts";
import { buildReports, type CatalogEntryReport } from "./sweep_core";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug: string;
};

type ReferenceStatus = "ok" | "missing" | "case-drift";

type LocalReference = {
  tag: string;
  reference: string;
  status: ReferenceStatus;
  resolvedPath?: string;
  actualPath?: string;
};

type ImportEdge = {
  reference: string;
  status: ReferenceStatus;
  resolvedPath?: string;
  actualPath?: string;
};

type ScriptNode = {
  path: string;
  mode: "classic" | "module";
  imports: ImportEdge[];
};

export type Packet = {
  slug: string;
  queueState: QueueState;
  reviewLane: string;
  reviewSummary: string;
  sourceFiles: string[];
  bootIssues: string[];
  smokeSummary: string;
  proofTargets: string[];
  localReferences: LocalReference[];
  scripts: ScriptNode[];
  nextSteps: string[];
  commands: string[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = { json: false, saveLearning: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }
    if (arg === "--slug") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing value for --slug");
      }
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.slug) {
    throw new Error("browser_playability_packet.ts requires --slug <slug>");
  }

  return {
    json: options.json ?? false,
    saveLearning: options.saveLearning ?? false,
    slug: options.slug,
  };
}

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

function toRepoPath(filePath: string): string {
  return `./${relative(ROOT, filePath).replaceAll("\\", "/")}`;
}

function toEntryPath(entryRoot: string, filePath: string): string {
  return `./${relative(entryRoot, filePath).replaceAll("\\", "/")}`;
}

function parseHtml(entryRoot: string, htmlPath: string): {
  references: LocalReference[];
  scripts: ScriptNode[];
  moduleEntrypoints: string[];
} {
  const html = readFileSync(htmlPath, "utf8");
  const references: LocalReference[] = [];
  const scripts: ScriptNode[] = [];
  const moduleEntrypoints: string[] = [];
  const attrPattern = /<(script|link|img|source|audio|video|a)\b[^>]*?\b(src|href)=["']([^"']+)["'][^>]*>/gi;
  const inlineModulePattern = /<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const reference = match[3].trim();
    if (!isLocalReference(reference)) {
      continue;
    }

    const risk = resolveLocalPathRisk(entryRoot, reference);
    const node: LocalReference = { tag, reference, status: risk.kind };
    if (risk.kind !== "missing") {
      node.resolvedPath = toEntryPath(entryRoot, risk.resolvedPath);
    }
    if (risk.kind === "case-drift") {
      node.actualPath = toEntryPath(entryRoot, risk.actualPath);
    }
    references.push(node);

    if (tag === "script" && risk.kind !== "missing" && extname(risk.resolvedPath).toLowerCase() === ".js") {
      const mode = /type=["']module["']/i.test(match[0]) ? "module" : "classic";
      const scriptPath = risk.kind === "case-drift" ? risk.actualPath : risk.resolvedPath;
      scripts.push({ path: toEntryPath(entryRoot, scriptPath), mode, imports: [] });
      if (mode === "module") {
        moduleEntrypoints.push(scriptPath);
      }
    }
  }

  let inlineIndex = 0;
  while ((match = inlineModulePattern.exec(html)) !== null) {
    inlineIndex += 1;
    const source = match[1] ?? "";
    const imports = parseImports(dirname(htmlPath), source, entryRoot);
    scripts.push({
      path: `inline-module-${inlineIndex}`,
      mode: "module",
      imports,
    });

    for (const edge of imports) {
      if (edge.status !== "missing" && edge.resolvedPath) {
        const resolved = resolve(dirname(htmlPath), edge.resolvedPath.replace(/^\.\//, ""));
        if (extname(resolved).toLowerCase() === ".js") {
          moduleEntrypoints.push(resolved);
        }
      }
    }
  }

  return { references, scripts, moduleEntrypoints };
}

function parseImports(baseDir: string, source: string, entryRoot: string): ImportEdge[] {
  const imports: ImportEdge[] = [];
  const importPattern = /\bimport\s+(?:[^"'`]+\s+from\s+)?["']([^"'`]+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source)) !== null) {
    const reference = match[1]?.trim() ?? "";
    if (!isRelativeImport(reference)) {
      continue;
    }

    const risk = resolveLocalPathRisk(baseDir, reference);
    const edge: ImportEdge = { reference, status: risk.kind };
    if (risk.kind !== "missing") {
      edge.resolvedPath = toEntryPath(entryRoot, risk.resolvedPath);
    }
    if (risk.kind === "case-drift") {
      edge.actualPath = toEntryPath(entryRoot, risk.actualPath);
    }
    imports.push(edge);
  }

  return imports;
}

function appendModuleGraph(entryRoot: string, moduleEntrypoints: string[], scripts: ScriptNode[]): void {
  const queue = [...new Set(moduleEntrypoints)];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath || seen.has(filePath) || !existsSync(filePath)) {
      continue;
    }
    seen.add(filePath);

    const relativePath = toEntryPath(entryRoot, filePath);
    const alreadyPresent = scripts.some((script) => script.path === relativePath);
    const source = readFileSync(filePath, "utf8");
    const imports = parseImports(dirname(filePath), source, entryRoot);

    if (!alreadyPresent) {
      scripts.push({ path: relativePath, mode: "module", imports });
    } else {
      const node = scripts.find((script) => script.path === relativePath);
      if (node) {
        node.imports = imports;
      }
    }

    for (const edge of imports) {
      if (edge.status !== "missing" && edge.resolvedPath) {
        const nextPath = resolve(entryRoot, edge.resolvedPath.replace(/^\.\//, ""));
        if (extname(nextPath).toLowerCase() === ".js") {
          queue.push(nextPath);
        }
      }
    }
  }
}

function buildSmokeSummary(slug: string): string {
  const status = inspectSmokeArtifacts(ROOT, slug);
  if (status.kind === "missing") {
    return "missing local smoke proof";
  }
  if (status.stale) {
    return `${status.latestSmokeName} is stale against ${status.latestContentName}`;
  }
  return `${status.latestSmokeName} is current against ${status.latestContentName}`;
}

function buildProofTargets(slug: string): string[] {
  return [
    `./.local/${slug}-smoke.json`,
    `./.local/${slug}-verify.png`,
    `./.local/<run>/${slug}-smoke.txt`,
  ];
}

export function buildPacket(slug: string): Packet {
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const report = buildReports(ROOT, todoRecords, slug)[0];
  if (!report) {
    throw new Error(`No browser-playable folder found for slug: ${slug}`);
  }

  const entryRoot = resolve(ROOT, slug);
  const htmlPath = resolve(entryRoot, "index.html");
  const parsed = parseHtml(entryRoot, htmlPath);
  appendModuleGraph(entryRoot, parsed.moduleEntrypoints, parsed.scripts);

  const review = buildReviewFreshnessEntries({ slug })[0];
  const bootIssues = report.issues
    .filter((issue) =>
      issue.code === "missing-boot-script"
      || issue.code === "inline-script-syntax"
      || issue.code === "script-syntax"
      || issue.code === "missing-local-reference"
      || issue.code === "missing-local-import"
      || issue.code === "casing-drift",
    )
    .map((issue) => `${issue.code}: ${issue.detail}`);

  const nextSteps = buildNextSteps(report, review?.lane ?? "none", slug, bootIssues.length > 0);
  const commands = buildCommands(slug, review?.lane ?? "none", bootIssues.length > 0);
  const sourceFiles = buildSourceFiles(htmlPath, parsed.scripts, review?.sourceFiles ?? []);

  return {
    slug,
    queueState: report.queueState,
    reviewLane: review?.lane ?? "none",
    reviewSummary: review?.reviewSummary ?? "no review state found",
    sourceFiles,
    bootIssues,
    smokeSummary: buildSmokeSummary(slug),
    proofTargets: buildProofTargets(slug),
    localReferences: parsed.references.sort((left, right) => left.reference.localeCompare(right.reference)),
    scripts: parsed.scripts.sort((left, right) => left.path.localeCompare(right.path)),
    nextSteps,
    commands,
  };
}

function buildSourceFiles(htmlPath: string, scripts: ScriptNode[], reviewSources: string[]): string[] {
  const fileSet = new Set<string>(["./todo.md", toRepoPath(htmlPath), "./.local/"]);
  const htmlDir = dirname(htmlPath);
  for (const script of scripts) {
    if (!script.path.startsWith("./")) {
      continue;
    }
    fileSet.add(toRepoPath(resolve(htmlDir, script.path.replace(/^\.\//, ""))));
  }
  for (const source of reviewSources) {
    fileSet.add(source);
  }
  return Array.from(fileSet).sort((left, right) => left.localeCompare(right));
}

function buildNextSteps(report: CatalogEntryReport, reviewLane: string, slug: string, hasBootDebt: boolean): string[] {
  const steps: string[] = [];
  if (hasBootDebt) {
    steps.push(`Repair the listed direct-boot blockers in ./${slug}/ before any browser rerun.`);
  } else {
    steps.push(`Boot surface is mapped. Run one direct browser smoke for ./${slug}/ and save proof under ./.local.`);
  }

  const smokeIssue = report.issues.find((issue) => issue.code === "missing-smoke-proof" || issue.code === "stale-smoke-proof");
  if (smokeIssue) {
    steps.push(`Refresh smoke proof after the boot check: ${smokeIssue.detail}.`);
  } else {
    steps.push("Local smoke proof already looks current; treat this packet as the quick boot map before deeper quality work.");
  }

  if (reviewLane === "flag-after-edit") {
    steps.push(`If you change existing files in ./${slug}/, reflag the review row to needsAdditionalFeedback true before closeout.`);
  } else if (reviewLane === "needs-feedback") {
    steps.push(`Do not use current review evidence for ./${slug}/ until fresh feedback clears needsAdditionalFeedback.`);
  } else if (reviewLane === "review-missing") {
    steps.push(`Do not use player feedback for ./${slug}/ until a review row exists.`);
  }

  steps.push("Use the script and reference lists to open only the real boot surfaces instead of re-spelunking the whole folder.");
  return steps;
}

function buildCommands(slug: string, reviewLane: string, hasBootDebt: boolean): string[] {
  const commands = [
    `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify --slug ${slug}`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --slug ${slug}`,
  ];

  if (hasBootDebt) {
    commands.unshift(`bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts --slug ${slug}`);
  }
  if (reviewLane === "flag-after-edit") {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug} --apply`);
  }

  return commands;
}

function buildLearning(): string {
  return "- Catalog throughput improves when one per-slug browser packet maps direct-boot references, module entry files, smoke targets, and review guard in one place, because browser verification no longer starts with manual index.html and import-chain spelunking.";
}

function renderReference(reference: LocalReference): string {
  if (reference.status === "missing") {
    return `- ${reference.tag}: ${reference.reference} [missing]`;
  }
  if (reference.status === "case-drift") {
    return `- ${reference.tag}: ${reference.reference} [case-drift -> ${reference.actualPath}]`;
  }
  return `- ${reference.tag}: ${reference.reference} [ok -> ${reference.resolvedPath}]`;
}

function renderImport(edge: ImportEdge): string {
  if (edge.status === "missing") {
    return `${edge.reference} [missing]`;
  }
  if (edge.status === "case-drift") {
    return `${edge.reference} [case-drift -> ${edge.actualPath}]`;
  }
  return `${edge.reference} [ok -> ${edge.resolvedPath}]`;
}

function renderText(packet: Packet, durableLearning: string): string {
  const lines = [
    "# Browser Playability Packet",
    "",
    `slug: ${packet.slug}`,
    `queue: ${packet.queueState}`,
    `review lane: ${packet.reviewLane}`,
    `smoke: ${packet.smokeSummary}`,
    "",
    "## Sources",
    "",
    ...packet.sourceFiles.map((source) => `- ${source}`),
    "",
    "## Boot issues",
    "",
    ...(packet.bootIssues.length > 0 ? packet.bootIssues.map((issue) => `- ${issue}`) : ["- no direct-boot blocker found by the local preflight"]),
    "",
    "## Local references",
    "",
    ...(packet.localReferences.length > 0 ? packet.localReferences.map(renderReference) : ["- no local references found in index.html"]),
    "",
    "## Scripts",
    "",
  ];

  if (packet.scripts.length === 0) {
    lines.push("- no local script surface found");
  } else {
    for (const script of packet.scripts) {
      lines.push(`- ${script.path} (${script.mode})`);
      if (script.imports.length === 0) {
        lines.push("  imports: none");
        continue;
      }
      lines.push(`  imports: ${script.imports.map(renderImport).join("; ")}`);
    }
  }

  lines.push("");
  lines.push("## Proof targets");
  lines.push("");
  lines.push(...packet.proofTargets.map((target) => `- ${target}`));
  lines.push("");
  lines.push("## Next");
  lines.push("");
  lines.push(...packet.nextSteps.map((step) => `- ${step}`));
  lines.push("");
  lines.push("## Commands");
  lines.push("");
  lines.push(...packet.commands.map((command) => `- ${command}`));
  lines.push("");
  lines.push("## Review");
  lines.push("");
  lines.push(`- ${packet.reviewSummary}`);
  lines.push("");
  lines.push("## Durable learning");
  lines.push("");
  lines.push(durableLearning);
  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const packet = buildPacket(options.slug);
  const durableLearning = buildLearning();

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(JSON.stringify({ packet, durableLearning }, null, 2));
    return;
  }

  console.log(renderText(packet, durableLearning));
}

if (import.meta.main) {
  main();
}
