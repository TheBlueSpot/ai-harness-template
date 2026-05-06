import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildStarterGuardrailSection,
  getStarterCoverageStatus,
  getStarterNextEvidence,
  type ClaimGuardrail,
  type EvidenceSufficiency,
} from "./starter_guardrails";

type Severity = "blocker" | "major" | "minor";

type TimedMetric = {
  label?: string;
  duration?: number | null;
  evidence?: "event-timing" | "raf-estimate" | "post-restart-probe" | "missing";
  sourceLabel?: string;
  semantics?: string;
  notes?: string[];
};

type EventTimingSample = {
  inputDelay?: number | null;
  handlerDuration?: number | null;
  presentationDelay?: number | null;
};

type EvidenceStatus = {
  label?: string;
  status?: "measured" | "estimated" | "unsupported" | "missing";
  source?: string | null;
  reusable?: boolean;
  reason?: string;
};

type SupportSurface = {
  supported?: boolean;
  observed?: boolean;
  state?: string;
  notes?: string[];
};

type LoafSample = {
  blockingDuration?: number | null;
  duration?: number | null;
  invokers?: string[];
};

type ResponsivenessAuditInput = {
  target?: {
    url?: string;
    slug?: string | null;
    resolvedFrom?: string;
  };
  support?: {
    eventTiming?: SupportSurface;
    longAnimationFrame?: SupportSurface;
    animationFrame?: SupportSurface;
  };
  evidenceStatus?: {
    firstInputToNextPaint?: EvidenceStatus;
    restartToNextPaint?: EvidenceStatus;
    restartToControlReady?: EvidenceStatus;
    blockedFrameAttribution?: EvidenceStatus;
  };
  invoker?: {
    attribution?: string;
    fallbackReasons?: string[];
  };
  firstInput?: {
    observed?: boolean;
    timing?: TimedMetric;
    trigger?: string | null;
    eventTimings?: EventTimingSample[];
    fallbackReasons?: string[];
  };
  restartReadiness?: {
    observed?: boolean;
    restartControl?: string | null;
    nextPaint?: TimedMetric;
    controlReady?: TimedMetric;
    controlMarkers?: string[];
    fallbackReasons?: string[];
  };
  loaf?: {
    observed?: boolean;
    supportState?: string;
    samples?: LoafSample[];
    blockingDurationMs?: number | null;
    fallbackReasons?: string[];
  };
  interactions?: {
    attempted?: string[];
    completed?: string[];
    bounded?: boolean;
  };
  metadata?: {
    capturedAt?: string;
    userAgent?: string;
    pageTitle?: string;
    pageUrl?: string;
    notes?: string[];
  };
  evidenceSufficiency?: EvidenceSufficiency;
  claimGuardrail?: ClaimGuardrail;
};

type CliOptions = {
  observations?: string;
  out?: string;
  template: boolean;
};

type Finding = {
  severity: Severity;
  title: string;
  evidence: string;
  nextStep: string;
};

const skillLearningPath = resolve(__dirname, "..", "LEARNINGS.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { template: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--template") {
      options.template = true;
      continue;
    }

    const next = argv[index + 1];
    if ((arg === "--observations" || arg === "--out") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--observations") {
      options.observations = next;
      index += 1;
      continue;
    }

    if (arg === "--out") {
      options.out = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readObservations(filePath: string): ResponsivenessAuditInput {
  const raw = readFileSync(resolve(filePath), "utf8");
  const parsed = JSON.parse(raw) as ResponsivenessAuditInput;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Observation file must contain a JSON object.");
  }
  return parsed;
}

function severityRank(severity: Severity): number {
  if (severity === "blocker") {
    return 0;
  }
  if (severity === "major") {
    return 1;
  }
  return 2;
}

function boolLabel(value: boolean | undefined): string {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "unknown";
}

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" ? `${value}ms` : "unknown";
}

function evidenceLabel(metric: TimedMetric | undefined): string {
  return metric?.sourceLabel ?? metric?.evidence ?? "unknown";
}

function statusLabel(status: EvidenceStatus | undefined): string {
  return status?.status ?? "unknown";
}

function maxNumber(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length > 0 ? Math.max(...present) : null;
}

function summarizeEventTiming(samples: EventTimingSample[] | undefined): string {
  if (!samples || samples.length === 0) {
    return "no event timing split captured";
  }

  const maxInputDelay = maxNumber(samples.map((sample) => sample.inputDelay));
  const maxHandler = maxNumber(samples.map((sample) => sample.handlerDuration));
  const maxPresentation = maxNumber(samples.map((sample) => sample.presentationDelay));
  return `max input delay=${formatMs(maxInputDelay)}, handler=${formatMs(maxHandler)}, presentation=${formatMs(maxPresentation)}`;
}

function buildFindings(data: ResponsivenessAuditInput): Finding[] {
  const findings: Finding[] = [];
  const firstStatus = data.evidenceStatus?.firstInputToNextPaint;
  const restartPaintStatus = data.evidenceStatus?.restartToNextPaint;
  const restartReadyStatus = data.evidenceStatus?.restartToControlReady;
  const blockedStatus = data.evidenceStatus?.blockedFrameAttribution;
  const firstDuration = data.firstInput?.timing?.duration ?? null;
  const restartPaintDuration = data.restartReadiness?.nextPaint?.duration ?? null;
  const restartReadyDuration = data.restartReadiness?.controlReady?.duration ?? null;
  const blockingDuration = data.loaf?.blockingDurationMs ?? null;
  const restartControl = data.restartReadiness?.restartControl ?? null;

  if (firstStatus?.status === "unsupported" || firstStatus?.status === "missing") {
    findings.push({
      severity: "major",
      title: "First-input trust stayed unproven",
      evidence: `${statusLabel(firstStatus)} first-input evidence; ${firstStatus?.reason ?? "no reason supplied"}`,
      nextStep: "Rerun the probe in a browser/context with stronger timing surfaces or inspect the entry interaction path before making a feel verdict.",
    });
  } else if (typeof firstDuration === "number" && firstDuration > 200) {
    findings.push({
      severity: "blocker",
      title: "First input answered too slowly for fast arcade trust",
      evidence: `${formatMs(firstDuration)} from ${evidenceLabel(data.firstInput?.timing)}; ${summarizeEventTiming(data.firstInput?.eventTimings)}`,
      nextStep: "Trim the first visible response path before retuning balance or adding more feedback layers.",
    });
  } else if (typeof firstDuration === "number" && firstDuration > 120) {
    findings.push({
      severity: "major",
      title: "First input response is borderline for pressure play",
      evidence: `${formatMs(firstDuration)} from ${evidenceLabel(data.firstInput?.timing)}; ${summarizeEventTiming(data.firstInput?.eventTimings)}`,
      nextStep: "Inspect whether the delay lives before the handler, inside the handler, or before paint, then retest after the first visible answer is cheaper.",
    });
  }

  if (restartControl && (restartReadyStatus?.status === "unsupported" || restartReadyStatus?.status === "missing")) {
    findings.push({
      severity: "major",
      title: "Restart control-ready evidence stayed unproven",
      evidence: `${statusLabel(restartReadyStatus)} restart-to-control-ready evidence after ${restartControl}; ${restartReadyStatus?.reason ?? "no reason supplied"}`,
      nextStep: "Verify that restart returns to a state where the next bounded input produces a paint, not just to a visually reset screen.",
    });
  } else if (typeof restartReadyDuration === "number" && restartReadyDuration > 400) {
    findings.push({
      severity: "blocker",
      title: "Restart takes too long to return control",
      evidence: `${formatMs(restartReadyDuration)} restart-to-control-ready from ${evidenceLabel(data.restartReadiness?.controlReady)}`,
      nextStep: "Shorten the post-restart path to the next actionable frame so failure stays inside the learning loop.",
    });
  } else if (typeof restartReadyDuration === "number" && restartReadyDuration > 250) {
    findings.push({
      severity: "major",
      title: "Restart recovery is visible but still slow for correction-heavy play",
      evidence: `${formatMs(restartReadyDuration)} restart-to-control-ready from ${evidenceLabel(data.restartReadiness?.controlReady)}`,
      nextStep: "Reduce non-essential restart animation, setup work, or ready delays before asking players to repeat precision inputs.",
    });
  }

  if (typeof restartPaintDuration === "number" && restartPaintDuration > 250) {
    findings.push({
      severity: "major",
      title: "Restart has a slow first visible answer",
      evidence: `${formatMs(restartPaintDuration)} restart-to-next-paint from ${evidenceLabel(data.restartReadiness?.nextPaint)}`,
      nextStep: "Make the restart response visible sooner even if deeper control-ready work still follows.",
    });
  } else if (restartPaintStatus?.status === "missing" && restartControl) {
    findings.push({
      severity: "minor",
      title: "Restart visible-answer timing is incomplete",
      evidence: `${statusLabel(restartPaintStatus)} restart-to-next-paint evidence after ${restartControl}; ${restartPaintStatus?.reason ?? "no reason supplied"}`,
      nextStep: "Keep restart timing claims narrow until the probe captures the first post-restart paint directly.",
    });
  }

  if (typeof blockingDuration === "number" && blockingDuration > 100) {
    findings.push({
      severity: "major",
      title: "Blocked frames likely contributed to felt lag",
      evidence: `${formatMs(blockingDuration)} total blocked-frame attribution; support=${data.loaf?.supportState ?? "unknown"}`,
      nextStep: "Inspect the heaviest frame or trace artifact to find which script or render phase kept input from reaching paint on time.",
    });
  } else if (blockedStatus?.status === "unsupported") {
    findings.push({
      severity: "minor",
      title: "Blocked-frame root cause stayed hidden",
      evidence: `${statusLabel(blockedStatus)} blocked-frame attribution; ${blockedStatus.reason ?? "no reason supplied"}`,
      nextStep: "Use trace capture or a browser with LoAF support when you need stronger root-cause evidence.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "No blocker-grade responsiveness fault was proven in this probe",
      evidence: `first input=${formatMs(firstDuration)} (${statusLabel(firstStatus)}), restart control-ready=${formatMs(restartReadyDuration)} (${statusLabel(restartReadyStatus)})`,
      nextStep: "Reuse this probe as a trust baseline and inspect other feel lanes only if gameplay still seems off.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildStrengths(data: ResponsivenessAuditInput): string[] {
  const strengths: string[] = [];
  const firstDuration = data.firstInput?.timing?.duration ?? null;
  const restartReadyDuration = data.restartReadiness?.controlReady?.duration ?? null;

  if (typeof firstDuration === "number" && firstDuration <= 100) {
    strengths.push(`first input answered in ${formatMs(firstDuration)}, which is a healthy trust baseline for the captured path`);
  }
  if (typeof restartReadyDuration === "number" && restartReadyDuration <= 200) {
    strengths.push(`restart returned to control-ready in ${formatMs(restartReadyDuration)}, keeping correction loops warm`);
  }
  if (data.loaf?.observed && typeof data.loaf.blockingDurationMs === "number" && data.loaf.blockingDurationMs <= 50) {
    strengths.push(`blocked-frame attribution stayed low at ${formatMs(data.loaf.blockingDurationMs)} during the bounded probe`);
  }
  return strengths;
}

function buildReport(data: ResponsivenessAuditInput): string {
  const findings = buildFindings(data);
  const strengths = buildStrengths(data);
  const coverage = getStarterCoverageStatus(data);
  const nextEvidence = getStarterNextEvidence(data);
  const guardrailSection = buildStarterGuardrailSection(data);
  const sampleCount = data.loaf?.samples?.length ?? 0;
  const firstStatus = data.evidenceStatus?.firstInputToNextPaint;
  const restartPaintStatus = data.evidenceStatus?.restartToNextPaint;
  const restartReadyStatus = data.evidenceStatus?.restartToControlReady;
  const blockedStatus = data.evidenceStatus?.blockedFrameAttribution;
  const targetLabel = data.target?.slug ?? data.metadata?.pageTitle ?? data.target?.url ?? "unknown-target";
  const guardrailLines = coverage
    ? [`- Starter coverage status: ${coverage}.`, `- Next evidence: ${nextEvidence.join(" | ")}.`]
    : guardrailSection;

  const notes = [
    ...(data.metadata?.notes ?? []).map((note) => `- ${note}`),
    ...(data.firstInput?.fallbackReasons ?? []).map((note) => `- first-input fallback: ${note}`),
    ...(data.restartReadiness?.fallbackReasons ?? []).map((note) => `- restart fallback: ${note}`),
    ...(data.loaf?.fallbackReasons ?? []).map((note) => `- blocked-frame fallback: ${note}`),
  ].slice(0, 12);

  const lines = [
    `# Responsiveness Trust Audit: ${targetLabel}`,
    "",
    "## Findings",
    ...findings.map(
      (finding, index) =>
        `${index + 1}. ${finding.severity.toUpperCase()} - ${finding.title}: ${finding.evidence} Fix next: ${finding.nextStep}`,
    ),
    "",
    "## Evidence Snapshot",
    `- Captured at: ${data.metadata?.capturedAt ?? "unknown"}.`,
    `- Target: ${data.target?.url ?? data.metadata?.pageUrl ?? "unknown"} (${data.target?.resolvedFrom ?? "unknown"}).`,
    `- First-input evidence: ${statusLabel(firstStatus)} via ${firstStatus?.source ?? "unknown"}; reusable=${boolLabel(firstStatus?.reusable)}.`,
    `- Restart next-paint evidence: ${statusLabel(restartPaintStatus)} via ${restartPaintStatus?.source ?? "unknown"}; reusable=${boolLabel(restartPaintStatus?.reusable)}.`,
    `- Restart control-ready evidence: ${statusLabel(restartReadyStatus)} via ${restartReadyStatus?.source ?? "unknown"}; reusable=${boolLabel(restartReadyStatus?.reusable)}.`,
    `- Blocked-frame attribution: ${statusLabel(blockedStatus)} via ${blockedStatus?.source ?? "unknown"}; LoAF samples=${sampleCount}.`,
    `- Browser support: event timing=${data.support?.eventTiming?.state ?? "unknown"}; LoAF=${data.support?.longAnimationFrame?.state ?? "unknown"}; rAF fallback=${data.support?.animationFrame?.state ?? "unknown"}.`,
    "",
    "## Timing Read",
    `- First input: ${formatMs(data.firstInput?.timing?.duration)} from ${evidenceLabel(data.firstInput?.timing)}; trigger=${data.firstInput?.trigger ?? "unknown"}; ${summarizeEventTiming(data.firstInput?.eventTimings)}.`,
    `- Restart next paint: ${formatMs(data.restartReadiness?.nextPaint?.duration)} from ${evidenceLabel(data.restartReadiness?.nextPaint)}; restart control=${data.restartReadiness?.restartControl ?? "none observed"}.`,
    `- Restart control ready: ${formatMs(data.restartReadiness?.controlReady?.duration)} from ${evidenceLabel(data.restartReadiness?.controlReady)}; markers=${data.restartReadiness?.controlMarkers?.join(", ") ?? "none"}.`,
    `- Blocked-frame total: ${formatMs(data.loaf?.blockingDurationMs)}; invoker attribution=${data.invoker?.attribution ?? "unknown"}.`,
    ...(strengths.length > 0 ? ["", "## Strengths", ...strengths.map((strength) => `- ${strength}.`)] : []),
    "",
    "## Guardrails",
    ...guardrailLines,
    "",
    "## Notes",
    ...(notes.length > 0 ? notes : ["- none"]),
    "",
  ];

  return lines.join("\n");
}

function buildTemplate(): string {
  return [
    "{",
    '  "sourceCommand": "bun.cmd .agents/skills/playtest-evidence-capture/scripts/browser_responsiveness_probe.ts --slug some-game --out .local/some-game-responsiveness.json",',
    '  "expectedInput": "raw JSON output from browser_responsiveness_probe.ts",',
    '  "keyFields": ["evidenceStatus.firstInputToNextPaint", "firstInput.eventTimings", "restartReadiness.controlReady", "loaf.blockingDurationMs"],',
    '  "note": "Feed the raw probe artifact to responsiveness_trust_audit.ts. Do not rewrite measured, estimated, unsupported, or missing states by hand."',
    "}",
    "",
  ].join("\n");
}

function appendLearningIfMissing(): void {
  const learning =
    "- Responsiveness trust review should separate missing probe evidence from proven sluggishness in this catalog, because unsupported timing surfaces cap confidence while slow measured answers point to real gameplay risk.";
  const existing = readFileSync(skillLearningPath, "utf8");
  if (existing.includes(learning)) {
    return;
  }
  writeFileSync(skillLearningPath, `${existing.trimEnd()}\n${learning}\n`, "utf8");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.template) {
    process.stdout.write(buildTemplate());
    return;
  }

  if (!options.observations) {
    throw new Error("Pass --observations <file> or use --template.");
  }

  const data = readObservations(options.observations);
  const report = buildReport(data);
  appendLearningIfMissing();

  if (options.out) {
    const outPath = resolve(options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, report, "utf8");
    process.stdout.write(`${outPath}\n`);
    return;
  }

  process.stdout.write(report);
}

main();
