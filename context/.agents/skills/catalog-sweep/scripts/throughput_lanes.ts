export type FocusMode = "reconcile" | "docs" | "smoke" | "boot" | "verify" | "throughput";

type IssueLike = {
  code: string;
};

type ReportLike = {
  slug: string;
  issues: IssueLike[];
};

type QueueOnlyLike = {
  slug: string;
};

const RECONCILE_CODES = new Set(["missing-queue-record", "duplicate-queue-record", "mixed-queue-states"]);
const DOCS_CODES = new Set([
  "missing-readme",
  "missing-play-instructions",
  "implementation-heavy-readme",
  "log-heavy-readme",
]);
const BOOT_CODES = new Set([
  "missing-boot-script",
  "inline-script-syntax",
  "script-syntax",
  "missing-local-reference",
  "missing-local-import",
  "casing-drift",
]);
const SMOKE_CODES = new Set(["missing-smoke-proof", "stale-smoke-proof"]);

export type ThroughputSnapshot = {
  queueSlugs: string[];
  docsSlugs: string[];
  bootSlugs: string[];
};

export type ClosureSnapshot = {
  docsOnlySlugs: string[];
  smokeOnlySlugs: string[];
  queueOnlySlugs: string[];
  bootOnlySlugs: string[];
  multiFrontSlugs: string[];
};

export type VerifySnapshot = {
  bootSlugs: string[];
  smokeSlugs: string[];
};

export type DocsSnapshot = {
  missingLaunchSlugs: string[];
  implementationHeavySlugs: string[];
  logHeavySlugs: string[];
  mixedDocsSlugs: string[];
};

export function isReconcileIssueCode(code: string): boolean {
  return RECONCILE_CODES.has(code);
}

export function isDocsIssueCode(code: string): boolean {
  return DOCS_CODES.has(code);
}

export function isBootIssueCode(code: string): boolean {
  return BOOT_CODES.has(code);
}

export function isSmokeIssueCode(code: string): boolean {
  return SMOKE_CODES.has(code);
}

export function issueMatchesFocus(code: string, focus?: FocusMode): boolean {
  if (!focus) {
    return true;
  }

  if (focus === "reconcile") {
    return isReconcileIssueCode(code);
  }

  if (focus === "docs") {
    return isDocsIssueCode(code);
  }

  if (focus === "smoke") {
    return isSmokeIssueCode(code);
  }

  if (focus === "boot") {
    return isBootIssueCode(code);
  }

  if (focus === "verify") {
    return isBootIssueCode(code) || isSmokeIssueCode(code);
  }

  return isReconcileIssueCode(code) || isDocsIssueCode(code) || isBootIssueCode(code);
}

export function filterIssuesForFocus<T extends IssueLike>(issues: T[], focus?: FocusMode): T[] {
  if (!focus) {
    return issues;
  }

  return issues.filter((issue) => issueMatchesFocus(issue.code, focus));
}

export function buildThroughputSnapshot(
  reports: ReportLike[],
  queueOnlyReports: QueueOnlyLike[],
): ThroughputSnapshot {
  const queueSlugs = new Set(queueOnlyReports.map((report) => report.slug));
  const docsSlugs = new Set<string>();
  const bootSlugs = new Set<string>();

  for (const report of reports) {
    if (report.issues.some((issue) => isReconcileIssueCode(issue.code))) {
      queueSlugs.add(report.slug);
    }
    if (report.issues.some((issue) => isDocsIssueCode(issue.code))) {
      docsSlugs.add(report.slug);
    }
    if (report.issues.some((issue) => isBootIssueCode(issue.code))) {
      bootSlugs.add(report.slug);
    }
  }

  return {
    queueSlugs: Array.from(queueSlugs).sort((left, right) => left.localeCompare(right)),
    docsSlugs: Array.from(docsSlugs).sort((left, right) => left.localeCompare(right)),
    bootSlugs: Array.from(bootSlugs).sort((left, right) => left.localeCompare(right)),
  };
}

export function buildVerifySnapshot(reports: ReportLike[]): VerifySnapshot {
  const bootSlugs = new Set<string>();
  const smokeSlugs = new Set<string>();

  for (const report of reports) {
    if (report.issues.some((issue) => isBootIssueCode(issue.code))) {
      bootSlugs.add(report.slug);
    }
    if (report.issues.some((issue) => isSmokeIssueCode(issue.code))) {
      smokeSlugs.add(report.slug);
    }
  }

  return {
    bootSlugs: Array.from(bootSlugs).sort((left, right) => left.localeCompare(right)),
    smokeSlugs: Array.from(smokeSlugs).sort((left, right) => left.localeCompare(right)),
  };
}

export function buildDocsSnapshot(reports: ReportLike[]): DocsSnapshot {
  const missingLaunchSlugs = new Set<string>();
  const implementationHeavySlugs = new Set<string>();
  const logHeavySlugs = new Set<string>();
  const mixedDocsSlugs = new Set<string>();

  for (const report of reports) {
    const docCodes = new Set(report.issues.filter((issue) => isDocsIssueCode(issue.code)).map((issue) => issue.code));
    if (docCodes.size === 0) {
      continue;
    }

    if (docCodes.has("missing-play-instructions")) {
      missingLaunchSlugs.add(report.slug);
    }
    if (docCodes.has("implementation-heavy-readme")) {
      implementationHeavySlugs.add(report.slug);
    }
    if (docCodes.has("log-heavy-readme")) {
      logHeavySlugs.add(report.slug);
    }
    if (docCodes.size > 1) {
      mixedDocsSlugs.add(report.slug);
    }
  }

  return {
    missingLaunchSlugs: Array.from(missingLaunchSlugs).sort((left, right) => left.localeCompare(right)),
    implementationHeavySlugs: Array.from(implementationHeavySlugs).sort((left, right) => left.localeCompare(right)),
    logHeavySlugs: Array.from(logHeavySlugs).sort((left, right) => left.localeCompare(right)),
    mixedDocsSlugs: Array.from(mixedDocsSlugs).sort((left, right) => left.localeCompare(right)),
  };
}

function classifyIssueFamilies(report: ReportLike): Set<"queue" | "docs" | "boot" | "smoke"> {
  const families = new Set<"queue" | "docs" | "boot" | "smoke">();

  for (const issue of report.issues) {
    if (isReconcileIssueCode(issue.code)) {
      families.add("queue");
    }
    if (isDocsIssueCode(issue.code)) {
      families.add("docs");
    }
    if (isBootIssueCode(issue.code)) {
      families.add("boot");
    }
    if (isSmokeIssueCode(issue.code)) {
      families.add("smoke");
    }
  }

  return families;
}

export function buildClosureSnapshot(reports: ReportLike[]): ClosureSnapshot {
  const docsOnlySlugs = new Set<string>();
  const smokeOnlySlugs = new Set<string>();
  const queueOnlySlugs = new Set<string>();
  const bootOnlySlugs = new Set<string>();
  const multiFrontSlugs = new Set<string>();

  for (const report of reports) {
    const families = classifyIssueFamilies(report);
    if (families.size === 0) {
      continue;
    }

    if (families.size === 1) {
      const [family] = Array.from(families);
      if (family === "docs") {
        docsOnlySlugs.add(report.slug);
      } else if (family === "smoke") {
        smokeOnlySlugs.add(report.slug);
      } else if (family === "queue") {
        queueOnlySlugs.add(report.slug);
      } else if (family === "boot") {
        bootOnlySlugs.add(report.slug);
      }
      continue;
    }

    multiFrontSlugs.add(report.slug);
  }

  return {
    docsOnlySlugs: Array.from(docsOnlySlugs).sort((left, right) => left.localeCompare(right)),
    smokeOnlySlugs: Array.from(smokeOnlySlugs).sort((left, right) => left.localeCompare(right)),
    queueOnlySlugs: Array.from(queueOnlySlugs).sort((left, right) => left.localeCompare(right)),
    bootOnlySlugs: Array.from(bootOnlySlugs).sort((left, right) => left.localeCompare(right)),
    multiFrontSlugs: Array.from(multiFrontSlugs).sort((left, right) => left.localeCompare(right)),
  };
}
