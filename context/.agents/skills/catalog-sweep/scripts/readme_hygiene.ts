import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ReadmeIssueCode =
  | "missing-play-instructions"
  | "non-canonical-launch-line"
  | "implementation-heavy-readme"
  | "log-heavy-readme"
  | "link-style-drift";

export type ReadmeIssue = {
  code: ReadmeIssueCode;
  detail: string;
};

export type ReadmeGuidance = string[];

export type ReadmeEvidence = {
  launchLines: string[];
  implementationLines: string[];
  logLines: string[];
  linkDriftLines: string[];
  lineCount: number;
};

export type ReadmeInspection = {
  issues: ReadmeIssue[];
  evidence: ReadmeEvidence;
};

const PLAY_PATTERNS = [/open .*index\.html/i, /browser to play/i, /direct browser/i, /boots directly/i, /launches directly from .*index\.html/i];
const CANONICAL_LAUNCH_PATTERN = /open\s+\[(?:\.\/)?index\.html\]\(\.\/index\.html\)\s+(?:directly\s+)?in\s+(?:a\s+|the\s+)?(?:modern\s+desktop\s+|modern\s+)?browser\b/i;
const MARKDOWN_LINK_PATTERN = /(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g;
const CATALOG_DIR = "games";

const IMPLEMENTATION_PATTERNS = [
  /`(?:\.\/)?index\.html`/i,
  /`(?:\.\/)?src\//i,
  /`(?:\.\/)?js\//i,
  /`[^`]+\.(?:js|ts|css|html)`/i,
  /`Game(?:\.[A-Za-z0-9_]+)?`/i,
];

const LOG_PATTERNS = [
  /\bFixed:/i,
  /\bFollow-up\b/i,
  /\bpatrol\b/i,
  /\bsim pass\b/i,
  /\bmodule verification\b/i,
  /\bNext todo\b/i,
];

export function inspectReadmeHygiene(root: string, slug: string): ReadmeIssue[] {
  return inspectReadme(root, slug).issues;
}

export function inspectReadme(root: string, slug: string): ReadmeInspection {
  const readmePath = resolve(root, CATALOG_DIR, slug, "README.md");
  if (!existsSync(readmePath)) {
    return {
      issues: [],
      evidence: {
        launchLines: [],
        implementationLines: [],
        logLines: [],
        linkDriftLines: [],
        lineCount: 0,
      },
    };
  }

  const text = readFileSync(readmePath, "utf8");
  const lines = text.split(/\r?\n/);
  const issues: ReadmeIssue[] = [];
  const launchLines = lines.filter((line) => PLAY_PATTERNS.some((pattern) => pattern.test(line)));

  if (launchLines.length === 0) {
    issues.push({
      code: "missing-play-instructions",
      detail: "README.md does not clearly say how to launch the browser entry",
    });
  } else if (!launchLines.some((line) => CANONICAL_LAUNCH_PATTERN.test(line))) {
    issues.push({
      code: "non-canonical-launch-line",
      detail: "README.md launch note exists but does not use the canonical `Open [index.html](./index.html) in a browser to play.` style",
    });
  }

  const implementationLines = lines.filter((line) => IMPLEMENTATION_PATTERNS.some((pattern) => pattern.test(line)));
  if (implementationLines.length >= 3) {
    issues.push({
      code: "implementation-heavy-readme",
      detail: `README.md has ${implementationLines.length} implementation-oriented lines; keep folder docs high level`,
    });
  }

  const logLines = lines.filter((line) => LOG_PATTERNS.some((pattern) => pattern.test(line)));
  if (lines.length > 45 || logLines.length >= 4) {
    issues.push({
      code: "log-heavy-readme",
      detail: `README.md has ${lines.length} lines and ${logLines.length} patrol/fix log lines; move durable notes into concise high-level summary`,
    });
  }

  const linkDriftLines = lines.filter((line) => hasLinkStyleDrift(line));
  if (linkDriftLines.length > 0) {
    issues.push({
      code: "link-style-drift",
      detail: `README.md has ${linkDriftLines.length} local markdown link lines that drift from ./-relative plain-label style`,
    });
  }

  return {
    issues,
    evidence: {
      launchLines,
      implementationLines,
      logLines,
      linkDriftLines,
      lineCount: lines.length,
    },
  };
}

export function buildReadmeGuidance(hasReadme: boolean, issues: ReadmeIssue[]): ReadmeGuidance {
  if (!hasReadme) {
    return ["add a short README with premise, controls, browser launch note, and one loop summary"];
  }

  const guidance: string[] = [];

  if (issues.some((issue) => issue.code === "missing-play-instructions")) {
    guidance.push("add the canonical launch line `Open [index.html](./index.html) in a browser to play.`");
  }
  if (issues.some((issue) => issue.code === "non-canonical-launch-line")) {
    guidance.push("normalize the launch note to the canonical `Open [index.html](./index.html) in a browser to play.` form");
  }
  if (issues.some((issue) => issue.code === "implementation-heavy-readme")) {
    guidance.push("cut file inventories and keep docs at premise, controls, play path, and one concise note");
  }
  if (issues.some((issue) => issue.code === "log-heavy-readme")) {
    guidance.push("remove patrol or fix-log accumulation and keep only durable high-level notes");
  }
  if (issues.some((issue) => issue.code === "link-style-drift")) {
    guidance.push("normalize local markdown links to ./-relative targets with plain labels");
  }

  return guidance;
}

function hasLinkStyleDrift(line: string): boolean {
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_PATTERN.exec(line)) !== null) {
    const label = match[2];
    const target = match[3].trim();
    if (!isLocalMarkdownTarget(target)) {
      continue;
    }
    if (!target.startsWith("./") || label.includes("`")) {
      return true;
    }
  }

  return false;
}

function isLocalMarkdownTarget(target: string): boolean {
  if (!target || target.startsWith("#") || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:")) {
    return false;
  }

  return true;
}
