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

type CriticalElementObservation = {
  name?: string;
  location?: string;
  importance?: "critical" | "supporting" | "secondary";
  readsWithoutText?: boolean;
  contrastStable?: boolean;
  readableUnderMotion?: boolean;
  motionDistraction?: "none" | "low" | "medium" | "high";
  glanceCost?: string;
  notes?: string;
};

type CueObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  nearAction?: boolean;
  redundantSignal?: boolean;
  signalChannels?: ("visual" | "audio" | "haptic" | "text")[];
  reliesOnColorAlone?: boolean;
  reliesOnAudioAlone?: boolean;
  telegraphReadable?: boolean;
  requiredResponseObvious?: boolean;
  futurePathVisible?: boolean;
  contrastStable?: boolean;
  readableUnderMotion?: boolean;
  motionDistraction?: "none" | "low" | "medium" | "high";
  notes?: string;
};

type StressFrameObservation = {
  moment?: string;
  clutterSource?: string;
  movingBackground?: boolean;
  blinkingContent?: boolean;
  autoUpdatingContent?: boolean;
  cameraMotion?: boolean;
  criticalInfoLost?: boolean;
  cueMasked?: boolean;
  responseStillReadable?: boolean;
  criticalElementsReadableUnderMotion?: boolean;
  notes?: string;
};

type CompetitionMomentObservation = {
  moment?: string;
  signals?: string[];
  urgentSignalCount?: number;
  dominantReadClear?: boolean;
  responsePriorityClear?: boolean;
  nonCriticalUiCompeting?: boolean;
  notes?: string;
};

type EphemeralMomentObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  kind?: "tutorial" | "objective" | "notification" | "warning" | "status";
  appearsNearAction?: boolean;
  autoDismisses?: boolean;
  dismissSeconds?: number;
  playerControlledAdvance?: boolean;
  reviewableLater?: boolean;
  suppressibleWhenNonCritical?: boolean;
  obstructsCriticalRead?: boolean;
  notes?: string;
};

type ClutterObservation = {
  cornerDashboard?: boolean;
  overlapBlocksAction?: boolean;
  backgroundNoiseHurtsRead?: boolean;
  movingUiDistraction?: boolean;
  blinkingUiDistraction?: boolean;
  autoUpdatingUiDistraction?: boolean;
  backgroundMotionDistractsRead?: boolean;
  subtitleOrToastOverlap?: boolean;
  peripheralScanLoad?: string;
};

type EvidenceObservation = {
  mode?: "direct-play" | "captured-video" | "code-inference" | "mixed";
  sampledEncounters?: number;
  sampledBusyFrames?: number;
  notes?: string[];
};

type ConfounderObservation = {
  inputCertainty?: "stable" | "minor-slip" | "major-slip";
  responseLatency?: "stable" | "borderline" | "late";
  cameraSupportsAction?: boolean;
  viewObstructedAtDecision?: boolean;
  autoCameraInterference?: boolean;
  notes?: string;
};

type ProbeOutcomeObservation = {
  probe?: "first-contact" | "busy-frame" | "fail-retry" | "interruption-resume" | "contact-payoff";
  goal?: string;
  outcome?: "success" | "partial" | "failed";
  successRating?: number;
  confidence?: number;
  satisfaction?: number;
  frustration?: number;
  mentalDemand?: number;
  timePressure?: number;
  effort?: number;
  blockers?: string[];
  notes?: string;
};

type IncidentObservation = {
  incidentTag?: string;
  title?: string;
  lenses?: ("onboarding" | "hud" | "pacing" | "failure" | "impact")[];
  firstSeenAt?: string;
  repeatedCount?: number;
  impact?: "low" | "medium" | "high";
  persistence?: "one-off" | "repeatable" | "constant";
  playerCost?: ("confusion" | "damage" | "death" | "dead-time" | "lost-reward" | "attention-tax")[];
  nextCheck?: string;
  notes?: string;
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  criticalElements?: CriticalElementObservation[];
  cues?: CueObservation[];
  stressFrames?: StressFrameObservation[];
  competitionMoments?: CompetitionMomentObservation[];
  ephemeralMoments?: EphemeralMomentObservation[];
  clutter?: ClutterObservation;
  confounders?: ConfounderObservation;
  evidence?: EvidenceObservation;
  probeOutcomes?: ProbeOutcomeObservation[];
  incidents?: IncidentObservation[];
  evidenceSufficiency?: EvidenceSufficiency;
  claimGuardrail?: ClaimGuardrail;
  strengths?: string[];
  frictions?: string[];
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

type MatrixRow = {
  type: "hud" | "cue";
  name: string;
  importance: string;
  risk: Severity;
  failureModes: string[];
  action: string;
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

function readObservations(filePath: string): ObservationFile {
  const raw = readFileSync(resolve(filePath), "utf8");
  const parsed = JSON.parse(raw) as ObservationFile;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Observation file must contain a JSON object.");
  }
  return parsed;
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

function severityRank(severity: Severity): number {
  if (severity === "blocker") {
    return 0;
  }
  if (severity === "major") {
    return 1;
  }
  return 2;
}

function isHighGlanceCost(value: string | undefined): boolean {
  return typeof value === "string" && /high|slow|heavy/i.test(value);
}

function isMediumOrHigherScanLoad(value: string | undefined): boolean {
  return typeof value === "string" && /medium|high|heavy/i.test(value);
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function formatElementCount(count: number, total: number, label: string): string {
  if (total <= 0) {
    return `${count} ${label}`;
  }
  return `${count}/${total} ${label}`;
}

function formatRating(
  value: number | undefined,
  scale: number,
  highSuffix = "",
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }
  const suffix = highSuffix && value >= Math.max(scale - 1, 1) ? highSuffix : "";
  return `${value}/${scale}${suffix}`;
}

function isHighProbeLoad(probe: ProbeOutcomeObservation): boolean {
  return (
    (typeof probe.mentalDemand === "number" && probe.mentalDemand >= 6) ||
    (typeof probe.timePressure === "number" && probe.timePressure >= 6) ||
    (typeof probe.effort === "number" && probe.effort >= 6)
  );
}

function describeImportance(value: "critical" | "supporting" | "secondary" | undefined): string {
  return value ?? "unknown";
}

function glanceCostScore(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  if (/high|slow|heavy/i.test(value)) {
    return 2;
  }
  if (/medium/i.test(value)) {
    return 1;
  }
  return 0;
}

function scoreToSeverity(score: number): Severity {
  if (score >= 4) {
    return "blocker";
  }
  if (score >= 2) {
    return "major";
  }
  return "minor";
}

function buildTemplate(): string {
  return [
    "# HUD Readability Audit Template",
    "",
    "Use during active browser play, not only menus.",
    "",
    "## Core Checks",
    "",
    "- Critical state reads from shape, contrast, or motion before text.",
    "- Edge HUD stays sparse enough for quick glances.",
    "- Must-react cues live near action or get a redundant signal.",
    "- Must-react cues show the needed response early enough to preserve choice.",
    "- Dodge or avoid telegraphs expose the future collision path, not just generic danger.",
    "- Warnings survive particles, scenery, subtitles, and camera motion.",
    "- Overlapping urgent signals keep one dominant read so the player knows what matters first.",
    "- Moving, blinking, or auto-updating UI can be paused, hidden, or kept readable under motion.",
    "- Critical temporary prompts stay player-paced or reviewable later instead of disappearing on trust-me timing.",
    "- Non-critical temporary popups can be suppressed when they obstruct active play reads.",
    "- At least one busy frame is checked for cue masking during peak clutter.",
    "- Overlays and clutter do not hide threats, targets, or prompts.",
    "- Critical cues should log which channels carried the read and whether any meaning depended on color alone or audio alone.",
    "- If a shared playtest starter exists, preserve its claim guardrails, probe outcomes, incidents, and confounders instead of dropping them.",
    "- Critical signals get logged into a matrix so failures compare cleanly across games.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-04-29",
        criticalElements: [
          {
            name: "health bar",
            location: "top-left corner",
            importance: "critical",
            readsWithoutText: true,
            contrastStable: true,
            readableUnderMotion: true,
            motionDistraction: "low",
            glanceCost: "low",
            notes: "bar depletion is readable without number check",
          },
        ],
        cues: [
          {
            name: "incoming-hit arrow",
            importance: "critical",
            nearAction: true,
            redundantSignal: true,
            signalChannels: ["visual", "audio"],
            reliesOnColorAlone: false,
            reliesOnAudioAlone: false,
            telegraphReadable: true,
            requiredResponseObvious: true,
            futurePathVisible: true,
            contrastStable: true,
            readableUnderMotion: true,
            motionDistraction: "low",
            notes: "arrow survives smoke burst",
          },
        ],
        stressFrames: [
          {
            moment: "boss laser charge burst",
            clutterSource: "white flash plus particles plus combo text",
            movingBackground: true,
            blinkingContent: false,
            autoUpdatingContent: true,
            cameraMotion: false,
            criticalInfoLost: true,
            cueMasked: true,
            responseStillReadable: false,
            criticalElementsReadableUnderMotion: false,
            notes: "reward burst crosses dodge lane",
          },
        ],
        competitionMoments: [
          {
            moment: "boss adds plus low-health flash",
            signals: ["incoming-hit arrow", "health bar", "combo banner"],
            urgentSignalCount: 2,
            dominantReadClear: false,
            responsePriorityClear: false,
            nonCriticalUiCompeting: true,
            notes: "warning stack appears at once and priority order is muddy",
          },
        ],
        ephemeralMoments: [
          {
            name: "phase-start warning text",
            kind: "warning",
            importance: "critical",
            appearsNearAction: true,
            autoDismisses: true,
            dismissSeconds: 2,
            playerControlledAdvance: false,
            reviewableLater: false,
            suppressibleWhenNonCritical: true,
            obstructsCriticalRead: false,
            notes: "important warning disappears before player can recheck it",
          },
          {
            name: "combo banner",
            kind: "notification",
            importance: "secondary",
            appearsNearAction: true,
            autoDismisses: true,
            dismissSeconds: 2,
            playerControlledAdvance: false,
            reviewableLater: false,
            suppressibleWhenNonCritical: false,
            obstructsCriticalRead: true,
            notes: "reward popup crosses dodge lane during pressure",
          },
        ],
        clutter: {
          cornerDashboard: false,
          overlapBlocksAction: true,
          backgroundNoiseHurtsRead: true,
          movingUiDistraction: true,
          blinkingUiDistraction: false,
          autoUpdatingUiDistraction: true,
          backgroundMotionDistractsRead: true,
          subtitleOrToastOverlap: true,
          peripheralScanLoad: "medium",
        },
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "read failure came from overlap, not camera drift",
        },
        evidence: {
          mode: "direct-play",
          sampledEncounters: 3,
          sampledBusyFrames: 2,
          notes: [
            "captured one calm combat read and two peak-effect moments",
            "confirmed overlap issue on second miniboss transition",
          ],
        },
        probeOutcomes: [
          {
            probe: "busy-frame",
            outcome: "partial",
            successRating: 2,
            confidence: 3,
            satisfaction: 3,
            frustration: 5,
            mentalDemand: 6,
            timePressure: 6,
            effort: 5,
            blockers: ["reward popup crosses dodge lane"],
            notes: "read technically survives, but only under overload",
          },
        ],
        incidents: [
          {
            incidentTag: "combo-banner-hides-dodge",
            title: "combo banner hides dodge lane",
            lenses: ["hud", "failure"],
            repeatedCount: 2,
            impact: "high",
            persistence: "repeatable",
            playerCost: ["confusion", "damage"],
            nextCheck: "verify lane stays open after moving the banner",
          },
        ],
        strengths: ["core combat states stay legible during light particles"],
        frictions: ["combo banner crosses enemy lane during dodge-heavy moments"],
      },
      null,
      2,
    ),
    "```",
    "",
    "## Matrix Lens",
    "",
    "- Treat each critical HUD state and must-react cue as one signal row.",
    "- Log whether it reads without text, survives contrast shifts, stays near focal action, reveals the needed response, exposes future path when relevant, survives busy frames, and stays readable when other UI moves or auto-updates.",
    "- Log any moment where several urgent signals overlap. The check is not `did cues exist`, but `was one dominant read obvious`. Non-critical UI joining that pileup is its own failure mode.",
    "- Log temporary prompts separately when timing is the problem. A readable prompt that vanishes before the player can recheck it is still a HUD failure.",
    "- Use the generated matrix to spot repeat catalog failures faster than flat notes can.",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const elements = data.criticalElements ?? [];
  const cues = data.cues ?? [];
  const stressFrames = data.stressFrames ?? [];
  const competitionMoments = data.competitionMoments ?? [];
  const ephemeralMoments = data.ephemeralMoments ?? [];
  const clutter = data.clutter ?? {};
  const confounders = data.confounders ?? {};
  const probeOutcomes = data.probeOutcomes ?? [];
  const incidents = data.incidents ?? [];
  const sampledBusyFrames = data.evidence?.sampledBusyFrames ?? stressFrames.length;
  const starterCoverage = getStarterCoverageStatus(data);

  const criticalElements = elements.filter((element) => element.importance !== "secondary");
  const criticalCues = cues.filter((cue) => cue.importance !== "secondary");

  const textDependentElements = countWhere(
    criticalElements,
    (element) => element.readsWithoutText === false,
  );
  const unstableElementContrast = countWhere(
    criticalElements,
    (element) => element.contrastStable === false,
  );
  const highGlanceCostElements = countWhere(
    criticalElements,
    (element) => isHighGlanceCost(element.glanceCost),
  );
  const motionCompromisedElements = countWhere(
    criticalElements,
    (element) =>
      element.readableUnderMotion === false ||
      element.motionDistraction === "high" ||
      element.motionDistraction === "medium",
  );
  const distantUnbackedCues = countWhere(
    criticalCues,
    (cue) => cue.nearAction === false && cue.redundantSignal === false,
  );
  const unreadableTelegraphs = countWhere(
    criticalCues,
    (cue) => cue.telegraphReadable === false,
  );
  const responseObscureCues = countWhere(
    criticalCues,
    (cue) => cue.requiredResponseObvious === false,
  );
  const hiddenFuturePathCues = countWhere(
    criticalCues,
    (cue) => cue.futurePathVisible === false,
  );
  const unstableCueContrast = countWhere(
    criticalCues,
    (cue) => cue.contrastStable === false,
  );
  const motionCompromisedCues = countWhere(
    criticalCues,
    (cue) =>
      cue.readableUnderMotion === false ||
      cue.motionDistraction === "high" ||
      cue.motionDistraction === "medium",
  );
  const lostCriticalInfoFrames = countWhere(
    stressFrames,
    (frame) => frame.criticalInfoLost === true,
  );
  const maskedCueFrames = countWhere(
    stressFrames,
    (frame) => frame.cueMasked === true,
  );
  const unreadableResponseFrames = countWhere(
    stressFrames,
    (frame) => frame.responseStillReadable === false,
  );
  const motionCompromisedFrames = countWhere(
    stressFrames,
    (frame) =>
      frame.criticalElementsReadableUnderMotion === false ||
      frame.movingBackground === true ||
      frame.blinkingContent === true ||
      frame.autoUpdatingContent === true ||
      frame.cameraMotion === true,
  );
  const motionDistractionFlags = countWhere(
    [
      clutter.movingUiDistraction,
      clutter.blinkingUiDistraction,
      clutter.autoUpdatingUiDistraction,
      clutter.backgroundMotionDistractsRead,
    ],
    (value) => value === true,
  );
  const dominantReadFailures = countWhere(
    competitionMoments,
    (moment) => moment.dominantReadClear === false,
  );
  const responsePriorityFailures = countWhere(
    competitionMoments,
    (moment) => moment.responsePriorityClear === false,
  );
  const nonCriticalPileups = countWhere(
    competitionMoments,
    (moment) => moment.nonCriticalUiCompeting === true,
  );
  const unrecoverableCriticalEphemeral = countWhere(
    ephemeralMoments,
    (moment) =>
      moment.importance !== "secondary" &&
      moment.autoDismisses === true &&
      moment.playerControlledAdvance === false &&
      moment.reviewableLater === false,
  );
  const unsuppressibleBlockingNotifications = countWhere(
    ephemeralMoments,
    (moment) =>
      moment.kind === "notification" &&
      moment.obstructsCriticalRead === true &&
      moment.suppressibleWhenNonCritical === false,
  );
  const colorOnlyCues = countWhere(
    criticalCues,
    (cue) => cue.reliesOnColorAlone === true,
  );
  const audioOnlyCues = countWhere(
    criticalCues,
    (cue) => cue.reliesOnAudioAlone === true,
  );
  const singleChannelCriticalCues = countWhere(
    criticalCues,
    (cue) => (cue.signalChannels?.length ?? 0) === 1,
  );
  const highLoadBusyFrameProbes = countWhere(
    probeOutcomes,
    (probe) =>
      probe.probe === "busy-frame" &&
      (probe.outcome === "success" || probe.outcome === "partial") &&
      isHighProbeLoad(probe),
  );
  const repeatedHudIncidents = countWhere(
    incidents,
    (incident) => (incident.lenses ?? []).includes("hud") && (incident.repeatedCount ?? 1) > 1,
  );
  const viewOrResponseConfounders = countWhere(
    [
      confounders.responseLatency === "late" || confounders.responseLatency === "borderline",
      confounders.viewObstructedAtDecision === true,
      confounders.autoCameraInterference === true,
      confounders.cameraSupportsAction === false,
      confounders.inputCertainty === "major-slip" || confounders.inputCertainty === "minor-slip",
    ],
    (value) => value === true,
  );

  const findings: Finding[] = [];

  if (sampledBusyFrames <= 0) {
    findings.push({
      severity: "major",
      title: "busy-frame evidence is missing, so peak-clutter readability is still unverified",
      evidence: "No busy frames were logged, even though many HUD failures appear only during active FX spikes, popups, or overlay bursts.",
      nextStep: "Capture at least one peak-pressure busy frame before calling the HUD pass clean, then re-check whether cues, targets, and urgent state still read.",
    });
  }

  if (unrecoverableCriticalEphemeral > 0) {
    findings.push({
      severity: "blocker",
      title: "critical temporary prompts disappear before the player can recover them",
      evidence: `${formatElementCount(unrecoverableCriticalEphemeral, ephemeralMoments.length, "temporary moments")} auto-dismissed without player pacing and could not be reviewed later.`,
      nextStep: "Keep critical temporary information on player input, extend its dwell time, or add a cheap replay path before calling the read solved.",
    });
  }

  if (unsuppressibleBlockingNotifications > 0) {
    findings.push({
      severity: "major",
      title: "non-critical temporary popups obstruct urgent reads without a suppression path",
      evidence: `${formatElementCount(unsuppressibleBlockingNotifications, ephemeralMoments.length, "temporary moments")} blocked a critical read and could not be hidden or postponed when non-critical.`,
      nextStep: "Demote, relocate, delay, or allow suppression of non-critical popups during action-heavy windows.",
    });
  }

  if (motionCompromisedFrames > 0 && (motionCompromisedElements > 0 || motionCompromisedCues > 0)) {
    findings.push({
      severity: "blocker",
      title: "animated UI pressure makes urgent reads fail under motion",
      evidence: `${formatElementCount(motionCompromisedFrames, stressFrames.length, "busy frames")} included motion-heavy distraction and ${motionCompromisedElements + motionCompromisedCues} critical signals were not readable under motion.`,
      nextStep: "Pause, hide, or de-emphasize moving, blinking, and auto-updating UI near critical reads, then verify the same state stays legible during motion-heavy frames.",
    });
  } else if (motionCompromisedFrames > 0 || motionCompromisedElements > 0 || motionCompromisedCues > 0 || motionDistractionFlags > 0) {
    findings.push({
      severity: "major",
      title: "motion-heavy UI competes with fast reads",
      evidence: `${formatElementCount(motionCompromisedFrames, stressFrames.length, "busy frames")} had motion pressure; ${motionCompromisedElements} critical elements and ${motionCompromisedCues} critical cues did not stay motion-readable; motion distraction flags ${motionDistractionFlags}.`,
      nextStep: "Retest with animated backgrounds, flashing widgets, and auto-updating text visible to confirm the calm-screen read still holds under motion.",
    });
  }

  if (lostCriticalInfoFrames > 0 && unreadableResponseFrames > 0) {
    findings.push({
      severity: "blocker",
      title: "busy-frame clutter hides critical information at the exact response moment",
      evidence: `${formatElementCount(lostCriticalInfoFrames, stressFrames.length, "busy frames")} lost critical info and ${formatElementCount(unreadableResponseFrames, stressFrames.length, "busy frames")} made the response unreadable.`,
      nextStep: "Trim, fade, stagger, or relocate peak-effect overlays until the dodge lane, target, or state read survives the busiest frame.",
    });
  } else if (lostCriticalInfoFrames > 0 || maskedCueFrames > 0) {
    findings.push({
      severity: "major",
      title: "peak-effect clutter weakens HUD or cue readability",
      evidence: `${formatElementCount(lostCriticalInfoFrames, stressFrames.length, "busy frames")} lost critical info and ${formatElementCount(maskedCueFrames, stressFrames.length, "busy frames")} masked cues.`,
      nextStep: "Stress-test peak-effect frames and reduce or move the specific overlays that cross critical read zones.",
    });
  }

  if (dominantReadFailures > 0 && responsePriorityFailures > 0) {
    findings.push({
      severity: nonCriticalPileups > 0 ? "blocker" : "major",
      title: "overlapping urgent signals collapse into an unclear priority stack",
      evidence: `${formatElementCount(dominantReadFailures, competitionMoments.length, "competition moments")} lost a dominant read; ${formatElementCount(responsePriorityFailures, competitionMoments.length, "competition moments")} hid response priority; non-critical UI joined ${formatElementCount(nonCriticalPileups, competitionMoments.length, "competition moments")}.`,
      nextStep: "Separate alert hierarchy so one urgent signal wins first, demote non-critical UI during the same window, and retest the overlap moment under pressure.",
    });
  } else if (dominantReadFailures > 0 || responsePriorityFailures > 0 || nonCriticalPileups > 0) {
    findings.push({
      severity: "major",
      title: "multi-signal overlap adds avoidable decode cost",
      evidence: `${formatElementCount(dominantReadFailures, competitionMoments.length, "competition moments")} lacked a dominant read; ${formatElementCount(responsePriorityFailures, competitionMoments.length, "competition moments")} blurred response priority; non-critical UI joined ${formatElementCount(nonCriticalPileups, competitionMoments.length, "competition moments")}.`,
      nextStep: "Tune simultaneous warning moments so the player can rank urgency instantly instead of scanning several competing signals.",
    });
  }

  if (textDependentElements > 0 && highGlanceCostElements > 0) {
    findings.push({
      severity: "blocker",
      title: "critical HUD states demand text reading during action",
      evidence: `${formatElementCount(textDependentElements, criticalElements.length, "critical elements")} relied on text-first reading and ${formatElementCount(highGlanceCostElements, criticalElements.length, "critical elements")} carried high glance cost.`,
      nextStep: "Convert urgent states to bars, icons, outlines, or motion-led markers that read before number parsing.",
    });
  } else if (textDependentElements > 0 || highGlanceCostElements > 0) {
    findings.push({
      severity: "major",
      title: "some critical HUD states take too much scan time",
      evidence: `${formatElementCount(textDependentElements, criticalElements.length, "critical elements")} were text-dependent and ${formatElementCount(highGlanceCostElements, criticalElements.length, "critical elements")} carried high glance cost.`,
      nextStep: "Shorten scan cost by simplifying the visual encoding of urgent states and reducing dependence on small text.",
    });
  }

  if (unstableElementContrast > 0 && unstableCueContrast > 0) {
    findings.push({
      severity: "blocker",
      title: "both HUD states and must-react cues lose contrast against active backgrounds",
      evidence: `${formatElementCount(unstableElementContrast, criticalElements.length, "critical elements")} and ${formatElementCount(unstableCueContrast, criticalCues.length, "critical cues")} failed contrast stability.`,
      nextStep: "Add opaque backing, outline, stronger value separation, or alternate placement so critical reads survive changing scenery and particles.",
    });
  } else if (unstableElementContrast > 0 || unstableCueContrast > 0 || clutter.backgroundNoiseHurtsRead === true) {
    findings.push({
      severity: "major",
      title: "contrast breaks down against scenery, particles, or camera motion",
      evidence: `${formatElementCount(unstableElementContrast, criticalElements.length, "critical elements")} had unstable contrast; ${formatElementCount(unstableCueContrast, criticalCues.length, "critical cues")} had unstable contrast; background-noise read issue ${boolLabel(clutter.backgroundNoiseHurtsRead)}.`,
      nextStep: "Increase contrast stability where gameplay backgrounds are busiest instead of tuning only on calm screens.",
    });
  }

  if (
    distantUnbackedCues > 0 &&
    (unreadableTelegraphs > 0 || responseObscureCues > 0 || hiddenFuturePathCues > 0)
  ) {
    findings.push({
      severity: "blocker",
      title: "must-react cues sit away from action without an early readable backup",
      evidence: `${formatElementCount(distantUnbackedCues, criticalCues.length, "critical cues")} were far from focal action without redundancy; ${formatElementCount(unreadableTelegraphs, criticalCues.length, "critical cues")} had weak telegraphs; ${formatElementCount(responseObscureCues, criticalCues.length, "critical cues")} did not show the needed response; ${formatElementCount(hiddenFuturePathCues, criticalCues.length, "critical cues")} hid the future collision path.`,
      nextStep: "Duplicate edge-only warnings with earlier in-play telegraph or near-action marker that shows the required response and future path before the decision window closes.",
    });
  } else if (
    distantUnbackedCues > 0 ||
    unreadableTelegraphs > 0 ||
    responseObscureCues > 0 ||
    hiddenFuturePathCues > 0
  ) {
    findings.push({
      severity: "major",
      title: "some danger cues cost too much attention to decode in time",
      evidence: `${formatElementCount(distantUnbackedCues, criticalCues.length, "critical cues")} were far from action without redundancy; ${formatElementCount(unreadableTelegraphs, criticalCues.length, "critical cues")} were telegraph-weak; ${formatElementCount(responseObscureCues, criticalCues.length, "critical cues")} did not make the response obvious; ${formatElementCount(hiddenFuturePathCues, criticalCues.length, "critical cues")} hid the future path.`,
      nextStep: "Move must-react information nearer the focal action or add an earlier duplicate channel that shows both the response and likely path before contact.",
    });
  }

  if (
    clutter.overlapBlocksAction === true &&
    (clutter.subtitleOrToastOverlap === true || clutter.cornerDashboard === true)
  ) {
    findings.push({
      severity: "blocker",
      title: "overlay density blocks the playfield instead of supporting it",
      evidence: `Overlap blocking action ${boolLabel(clutter.overlapBlocksAction)}; subtitle or toast overlap ${boolLabel(clutter.subtitleOrToastOverlap)}; corner dashboard ${boolLabel(clutter.cornerDashboard)}.`,
      nextStep: "Move dense secondary UI into pause or reopenable overlays and keep persistent edge HUD limited to information needed mid-action.",
    });
  } else if (
    clutter.overlapBlocksAction === true ||
    clutter.cornerDashboard === true ||
    isMediumOrHigherScanLoad(clutter.peripheralScanLoad)
  ) {
    findings.push({
      severity: "major",
      title: "HUD density adds avoidable scan load during play",
      evidence: `Overlap blocking action ${boolLabel(clutter.overlapBlocksAction)}; corner dashboard ${boolLabel(clutter.cornerDashboard)}; peripheral scan load ${clutter.peripheralScanLoad ?? "unknown"}.`,
      nextStep: "Reduce persistent edge information until one quick glance restores the player state instead of forcing dashboard scanning.",
    });
  }

  if ((colorOnlyCues > 0 && audioOnlyCues > 0) || colorOnlyCues + audioOnlyCues >= 2) {
    findings.push({
      severity: "blocker",
      title: "critical cue meaning depends on one fragile sensory channel",
      evidence: `${formatElementCount(colorOnlyCues, criticalCues.length, "critical cues")} relied on color alone; ${formatElementCount(audioOnlyCues, criticalCues.length, "critical cues")} relied on audio alone; ${formatElementCount(singleChannelCriticalCues, criticalCues.length, "critical cues")} used only one logged channel.`,
      nextStep: "Add a second clear signifier for critical cue meaning so mute play, color ambiguity, or noisy scenes do not erase the read.",
    });
  } else if (colorOnlyCues > 0 || audioOnlyCues > 0 || singleChannelCriticalCues > 0) {
    findings.push({
      severity: "major",
      title: "some critical cues lack strong backup channels",
      evidence: `${formatElementCount(colorOnlyCues, criticalCues.length, "critical cues")} relied on color alone; ${formatElementCount(audioOnlyCues, criticalCues.length, "critical cues")} relied on audio alone; ${formatElementCount(singleChannelCriticalCues, criticalCues.length, "critical cues")} used only one logged channel.`,
      nextStep: "Confirm each must-react cue still reads if sound is muted, colors blur together, or one channel gets buried during action.",
    });
  }

  if (highLoadBusyFrameProbes > 0) {
    findings.push({
      severity: "major",
      title: "busy-frame success still carries overload cost",
      evidence: `${formatElementCount(highLoadBusyFrameProbes, probeOutcomes.length, "probe outcomes")} marked the busy frame as technically successful or partial while mental demand, time pressure, or effort still reached overload range.`,
      nextStep: "Treat overloaded busy-frame success as unresolved readability debt until the same moment reads without rush, tunnel vision, or excess effort.",
    });
  }

  if (starterCoverage === "partial" || starterCoverage === "missing") {
    findings.push({
      severity: starterCoverage === "missing" ? "major" : "minor",
      title: "shared starter evidence limits how broad this HUD claim can be",
      evidence: `Starter coverage gate is ${starterCoverage}; next evidence still needed: ${getStarterNextEvidence(data).join(", ")}.`,
      nextStep: "Keep the verdict scoped to the sampled moments and collect the listed next evidence before calling the full HUD pass clean or broken.",
    });
  }

  if (repeatedHudIncidents > 0 && findings.every((finding) => finding.severity !== "blocker")) {
    findings.push({
      severity: "major",
      title: "shared incident queue shows repeatable HUD breakage",
      evidence: `${formatElementCount(repeatedHudIncidents, incidents.length, "shared incidents")} repeated across probes or lenses instead of appearing as one isolated note.`,
      nextStep: "Prioritize the recurring HUD incident first and retest the same tagged moment after changes instead of diffusing effort across one-off notes.",
    });
  }

  if (viewOrResponseConfounders > 0) {
    findings.push({
      severity: "minor",
      title: "camera or response instability may be amplifying some HUD failures",
      evidence: `Confounder flags logged: input certainty ${confounders.inputCertainty ?? "unknown"}, response latency ${confounders.responseLatency ?? "unknown"}, view obstructed ${boolLabel(confounders.viewObstructedAtDecision)}, auto-camera interference ${boolLabel(confounders.autoCameraInterference)}.`,
      nextStep: "Keep the HUD finding, but re-check the same moment after camera or response stability is trustworthy so blame stays on the right system.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major HUD readability breakdown was logged in the supplied observations",
      evidence: "Critical states, cues, and busy-frame checks did not record a severe read failure.",
      nextStep: "Keep the current HUD shape and validate it against a longer or harder session before changing it.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildElementMatrixRow(
  element: CriticalElementObservation,
  clutter: ClutterObservation,
): MatrixRow {
  const failureModes: string[] = [];
  let score = 0;

  if (element.readsWithoutText === false) {
    failureModes.push("text-first state");
    score += 2;
  }

  if (element.contrastStable === false) {
    failureModes.push("contrast break");
    score += 2;
  }

  const glanceScore = glanceCostScore(element.glanceCost);
  if (glanceScore > 0) {
    failureModes.push(glanceScore >= 2 ? "high glance cost" : "medium glance cost");
    score += glanceScore;
  }

  if (clutter.backgroundNoiseHurtsRead === true && element.contrastStable !== true) {
    failureModes.push("background-sensitive");
    score += 1;
  }

  if (element.readableUnderMotion === false) {
    failureModes.push("motion distraction");
    score += 2;
  } else if (element.motionDistraction === "high") {
    failureModes.push("high motion distraction");
    score += 2;
  } else if (element.motionDistraction === "medium") {
    failureModes.push("motion distraction");
    score += 1;
  }

  const risk = scoreToSeverity(score);
  const action = risk === "blocker"
    ? "Convert urgent state to shape, bar, icon, or stronger backed contrast before relying on text."
    : risk === "major"
      ? "Reduce scan cost, stabilize contrast, or remove motion competition so the state reads on one quick glance."
      : "Keep current encoding and re-check during a harder, busier, or more animated session.";

  return {
    type: "hud",
    name: element.name ?? "unknown",
    importance: describeImportance(element.importance),
    risk,
    failureModes: failureModes.length > 0 ? failureModes : ["no logged read failure"],
    action,
  };
}

function buildCueMatrixRow(
  cue: CueObservation,
  clutter: ClutterObservation,
  stressFrames: StressFrameObservation[],
  competitionMoments: CompetitionMomentObservation[],
): MatrixRow {
  const failureModes: string[] = [];
  let score = 0;

  if (cue.nearAction === false) {
    failureModes.push("far from focal action");
    score += 1;
  }

  if (cue.redundantSignal === false) {
    failureModes.push("no backup channel");
    score += 1;
  }

  if (cue.reliesOnColorAlone === true) {
    failureModes.push("color-only meaning");
    score += 2;
  }

  if (cue.reliesOnAudioAlone === true) {
    failureModes.push("audio-only meaning");
    score += 2;
  }

  if ((cue.signalChannels?.length ?? 0) === 1) {
    failureModes.push("single logged channel");
    score += 1;
  }

  if (cue.telegraphReadable === false) {
    failureModes.push("weak telegraph");
    score += 2;
  }

  if (cue.requiredResponseObvious === false) {
    failureModes.push("response unclear");
    score += 2;
  }

  if (cue.futurePathVisible === false) {
    failureModes.push("future path hidden");
    score += 2;
  }

  if (cue.contrastStable === false) {
    failureModes.push("contrast break");
    score += 2;
  }

  if (cue.readableUnderMotion === false) {
    failureModes.push("motion distraction");
    score += 2;
  } else if (cue.motionDistraction === "high") {
    failureModes.push("high motion distraction");
    score += 2;
  } else if (cue.motionDistraction === "medium") {
    failureModes.push("motion distraction");
    score += 1;
  }

  if (clutter.subtitleOrToastOverlap === true) {
    failureModes.push("overlay competition");
    score += 1;
  }

  if (
    clutter.movingUiDistraction === true ||
    clutter.blinkingUiDistraction === true ||
    clutter.autoUpdatingUiDistraction === true ||
    clutter.backgroundMotionDistractsRead === true
  ) {
    failureModes.push("animated ui competition");
    score += 1;
  }

  if (stressFrames.some((frame) => frame.cueMasked === true || frame.responseStillReadable === false)) {
    failureModes.push("busy-frame risk");
    score += 1;
  }

  const relatedCompetition = competitionMoments.filter((moment) =>
    (moment.signals ?? []).some((signal) => signal === cue.name),
  );
  if (relatedCompetition.some((moment) => moment.dominantReadClear === false)) {
    failureModes.push("priority collapse");
    score += 2;
  }
  if (relatedCompetition.some((moment) => moment.responsePriorityClear === false)) {
    failureModes.push("response priority unclear");
    score += 2;
  }
  if (relatedCompetition.some((moment) => moment.nonCriticalUiCompeting === true)) {
    failureModes.push("non-critical overlap");
    score += 1;
  }

  const risk = scoreToSeverity(score);
  const action = risk === "blocker"
    ? "Move the cue nearer action or add an earlier duplicate channel that survives busy frames."
    : risk === "major"
      ? "Tighten cue placement, contrast, backup signaling, or motion tolerance before adding more effects."
      : "Keep the current cue shape and confirm it still reads during peak clutter and motion-heavy frames.";

  return {
    type: "cue",
    name: cue.name ?? "unknown",
    importance: describeImportance(cue.importance),
    risk,
    failureModes: failureModes.length > 0 ? failureModes : ["no logged read failure"],
    action,
  };
}

function buildCriticalReadMatrix(data: ObservationFile): MatrixRow[] {
  const clutter = data.clutter ?? {};
  const stressFrames = data.stressFrames ?? [];
  const competitionMoments = data.competitionMoments ?? [];
  const elements = (data.criticalElements ?? []).filter((element) => element.importance !== "secondary");
  const cues = (data.cues ?? []).filter((cue) => cue.importance !== "secondary");

  const rows = [
    ...elements.map((element) => buildElementMatrixRow(element, clutter)),
    ...cues.map((cue) => buildCueMatrixRow(cue, clutter, stressFrames, competitionMoments)),
  ];

  return rows.sort((left, right) => {
    const severityDiff = severityRank(left.risk) - severityRank(right.risk);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }
    return left.name.localeCompare(right.name);
  });
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  const lines = [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Encounters sampled: ${evidence.sampledEncounters ?? 0}.`,
    `- Busy frames sampled: ${evidence.sampledBusyFrames ?? (data.stressFrames ?? []).length}.`,
    `- Motion-heavy frames sampled: ${countWhere(data.stressFrames ?? [], (frame) => frame.movingBackground === true || frame.blinkingContent === true || frame.autoUpdatingContent === true || frame.cameraMotion === true)}.`,
    `- Cue competition moments sampled: ${(data.competitionMoments ?? []).length}.`,
    `- Temporary prompt moments sampled: ${(data.ephemeralMoments ?? []).length}.`,
    `- Probe outcomes sampled: ${(data.probeOutcomes ?? []).length}.`,
    `- Shared incident rows sampled: ${(data.incidents ?? []).length}.`,
  ];

  if (evidence.notes && evidence.notes.length > 0) {
    for (const note of evidence.notes) {
      lines.push(`- Evidence note: ${note}`);
    }
  }

  return lines;
}

function buildElementSection(elements: CriticalElementObservation[]): string[] {
  if (elements.length === 0) {
    return ["- No critical HUD element observations recorded yet."];
  }

  return elements.map((element) => {
    const parts = [
      `\`${element.name ?? "unknown"}\``,
      `location ${element.location ?? "unknown"}`,
      `importance ${element.importance ?? "unknown"}`,
      `reads without text ${boolLabel(element.readsWithoutText)}`,
      `contrast stable ${boolLabel(element.contrastStable)}`,
      `readable under motion ${boolLabel(element.readableUnderMotion)}`,
      `motion distraction ${element.motionDistraction ?? "unknown"}`,
      `glance cost ${element.glanceCost ?? "unknown"}`,
      `notes ${element.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildCueSection(cues: CueObservation[]): string[] {
  if (cues.length === 0) {
    return ["- No cue observations recorded yet."];
  }

  return cues.map((cue) => {
    const parts = [
      `\`${cue.name ?? "unknown"}\``,
      `importance ${cue.importance ?? "unknown"}`,
      `near action ${boolLabel(cue.nearAction)}`,
      `redundant signal ${boolLabel(cue.redundantSignal)}`,
      `channels ${cue.signalChannels?.join(", ") ?? "unknown"}`,
      `color-only ${boolLabel(cue.reliesOnColorAlone)}`,
      `audio-only ${boolLabel(cue.reliesOnAudioAlone)}`,
      `telegraph readable ${boolLabel(cue.telegraphReadable)}`,
      `required response obvious ${boolLabel(cue.requiredResponseObvious)}`,
      `future path visible ${boolLabel(cue.futurePathVisible)}`,
      `contrast stable ${boolLabel(cue.contrastStable)}`,
      `readable under motion ${boolLabel(cue.readableUnderMotion)}`,
      `motion distraction ${cue.motionDistraction ?? "unknown"}`,
      `notes ${cue.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildStressFrameSection(stressFrames: StressFrameObservation[]): string[] {
  if (stressFrames.length === 0) {
    return ["- No busy-frame observations recorded yet."];
  }

  return stressFrames.map((frame) => {
    const parts = [
      `moment ${frame.moment ?? "unknown"}`,
      `clutter source ${frame.clutterSource ?? "unknown"}`,
      `moving background ${boolLabel(frame.movingBackground)}`,
      `blinking content ${boolLabel(frame.blinkingContent)}`,
      `auto-updating content ${boolLabel(frame.autoUpdatingContent)}`,
      `camera motion ${boolLabel(frame.cameraMotion)}`,
      `critical info lost ${boolLabel(frame.criticalInfoLost)}`,
      `cue masked ${boolLabel(frame.cueMasked)}`,
      `response still readable ${boolLabel(frame.responseStillReadable)}`,
      `critical elements readable under motion ${boolLabel(frame.criticalElementsReadableUnderMotion)}`,
      `notes ${frame.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildCompetitionSection(competitionMoments: CompetitionMomentObservation[]): string[] {
  if (competitionMoments.length === 0) {
    return ["- No overlapping urgent-signal moments recorded yet."];
  }

  return competitionMoments.map((moment) => {
    const parts = [
      `moment ${moment.moment ?? "unknown"}`,
      `signals ${(moment.signals ?? []).length > 0 ? (moment.signals ?? []).join(", ") : "unknown"}`,
      `urgent signal count ${moment.urgentSignalCount ?? "unknown"}`,
      `dominant read clear ${boolLabel(moment.dominantReadClear)}`,
      `response priority clear ${boolLabel(moment.responsePriorityClear)}`,
      `non-critical ui competing ${boolLabel(moment.nonCriticalUiCompeting)}`,
      `notes ${moment.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildProbeOutcomeSection(probeOutcomes: ProbeOutcomeObservation[]): string[] {
  if (probeOutcomes.length === 0) {
    return ["- No probe outcomes recorded yet."];
  }

  return probeOutcomes.map((probe) =>
    `- ${probe.probe ?? "unknown-probe"}: outcome=${probe.outcome ?? "unknown"}; success rating=${formatRating(probe.successRating, 4)}; confidence=${formatRating(probe.confidence, 7)}; satisfaction=${formatRating(probe.satisfaction, 7)}; frustration=${formatRating(probe.frustration, 7, "-high")}; mental demand=${formatRating(probe.mentalDemand, 7, "-high")}; time pressure=${formatRating(probe.timePressure, 7, "-high")}; effort=${formatRating(probe.effort, 7, "-high")}; blockers=${probe.blockers?.join(", ") ?? "none"}; notes=${probe.notes ?? probe.goal ?? "none"}.`,
  );
}

function buildCrossLensIncidentSection(incidents: IncidentObservation[]): string[] {
  if (incidents.length === 0) {
    return ["- No shared incident queue rows recorded yet."];
  }

  return [...incidents]
    .sort((left, right) => (right.repeatedCount ?? 0) - (left.repeatedCount ?? 0))
    .map((incident) => {
      const parts = [
        `incident ${incident.incidentTag ?? incident.title ?? "untagged-incident"}`,
        `title ${incident.title ?? "none"}`,
        `lenses ${incident.lenses?.join(", ") ?? "none"}`,
        `repeats ${incident.repeatedCount ?? 1}`,
        `impact ${incident.impact ?? "unknown"}`,
        `persistence ${incident.persistence ?? "unknown"}`,
        `player cost ${incident.playerCost?.join(", ") ?? "none"}`,
        `next check ${incident.nextCheck ?? "none"}`,
        `notes ${incident.notes ?? "none"}`,
      ];
      return `- ${parts.join("; ")}.`;
    });
}

function buildConfounderSection(confounders: ConfounderObservation): string[] {
  return [
    `- Input certainty: ${confounders.inputCertainty ?? "unknown"}.`,
    `- Response latency: ${confounders.responseLatency ?? "unknown"}.`,
    `- Camera supports action: ${boolLabel(confounders.cameraSupportsAction)}.`,
    `- View obstructed at decision: ${boolLabel(confounders.viewObstructedAtDecision)}.`,
    `- Auto-camera interference: ${boolLabel(confounders.autoCameraInterference)}.`,
    `- Notes: ${confounders.notes ?? "none logged"}.`,
  ];
}

function buildEphemeralSection(ephemeralMoments: EphemeralMomentObservation[]): string[] {
  if (ephemeralMoments.length === 0) {
    return ["- No temporary prompt or popup moments recorded yet."];
  }

  return ephemeralMoments.map((moment) => {
    const parts = [
      `name ${moment.name ?? "unknown"}`,
      `kind ${moment.kind ?? "unknown"}`,
      `importance ${moment.importance ?? "unknown"}`,
      `near action ${boolLabel(moment.appearsNearAction)}`,
      `auto-dismisses ${boolLabel(moment.autoDismisses)}`,
      `dismiss seconds ${typeof moment.dismissSeconds === "number" ? moment.dismissSeconds : "unknown"}`,
      `player-paced ${boolLabel(moment.playerControlledAdvance)}`,
      `reviewable later ${boolLabel(moment.reviewableLater)}`,
      `suppressible when non-critical ${boolLabel(moment.suppressibleWhenNonCritical)}`,
      `obstructs critical read ${boolLabel(moment.obstructsCriticalRead)}`,
      `notes ${moment.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildMotionDistractionSection(stressFrames: StressFrameObservation[]): string[] {
  if (stressFrames.length === 0) {
    return ["- No motion-distraction observations recorded yet."];
  }

  return stressFrames.map((frame) => {
    const motionSources = [
      frame.movingBackground === true ? "moving background" : undefined,
      frame.blinkingContent === true ? "blinking content" : undefined,
      frame.autoUpdatingContent === true ? "auto-updating content" : undefined,
      frame.cameraMotion === true ? "camera motion" : undefined,
    ].filter((item): item is string => typeof item === "string");

    const parts = [
      `\`${frame.moment ?? "unknown"}\``,
      `motion sources ${motionSources.length > 0 ? motionSources.join(", ") : "none"}`,
      `critical elements readable under motion ${boolLabel(frame.criticalElementsReadableUnderMotion)}`,
      `notes ${frame.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildClutterSection(clutter: ClutterObservation): string[] {
  return [
    `- Corner HUD feels like dashboard: ${boolLabel(clutter.cornerDashboard)}.`,
    `- Overlays block action or threats: ${boolLabel(clutter.overlapBlocksAction)}.`,
    `- Background noise hurts cue reading: ${boolLabel(clutter.backgroundNoiseHurtsRead)}.`,
    `- Moving UI distracts urgent reads: ${boolLabel(clutter.movingUiDistraction)}.`,
    `- Blinking UI distracts urgent reads: ${boolLabel(clutter.blinkingUiDistraction)}.`,
    `- Auto-updating UI distracts urgent reads: ${boolLabel(clutter.autoUpdatingUiDistraction)}.`,
    `- Background motion distracts urgent reads: ${boolLabel(clutter.backgroundMotionDistractsRead)}.`,
    `- Subtitles or toasts overlap playfield reads: ${boolLabel(clutter.subtitleOrToastOverlap)}.`,
    `- Peripheral scan load: ${clutter.peripheralScanLoad ?? "unknown"}.`,
  ];
}

function buildMatrixSection(rows: MatrixRow[]): string[] {
  if (rows.length === 0) {
    return ["- No critical HUD or cue rows recorded yet. Add at least one state or cue observation before using the matrix."];
  }

  return rows.map((row) => {
    return `- \`${row.risk}\` [${row.type}] \`${row.name}\` | importance ${row.importance} | failure modes: ${row.failureModes.join(", ")} | next action: ${row.action}`;
  });
}

function buildListSection(items: string[] | undefined, fallback: string): string[] {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }
  return items.map((item) => `- ${item}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  const uniqueSteps = Array.from(new Set(findings.map((finding) => finding.nextStep)));
  return uniqueSteps.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const majorCount = findings.filter((finding) => finding.severity === "major").length;
  const competitionCount = countWhere(
    data.competitionMoments ?? [],
    (moment) => moment.dominantReadClear === false || moment.responsePriorityClear === false,
  );
  const channelFragilityCount = countWhere(
    data.cues ?? [],
    (cue) => cue.reliesOnColorAlone === true || cue.reliesOnAudioAlone === true,
  );

  if (findings.length === 1 && findings[0]?.severity === "minor") {
    return [
      `- ${game}: evidence-first HUD review still matters for this catalog because a clean busy-frame pass gives a reusable readability baseline before later content or FX regressions land.`,
    ];
  }

  return [
    `- ${game}: blocker-first HUD reporting matters for this catalog because sticky arcade games depend on fast peripheral reads under pressure; this run logged ${blockerCount} blocker(s), ${majorCount} major finding(s), ${competitionCount} cue-competition risk moment(s), and ${channelFragilityCount} channel-fragile cue(s), so overlapping warnings and one-channel reads get judged as gameplay clarity failures instead of screenshot-only taste notes.`,
  ];
}

function extractLearningLine(markdownLines: string[]): string | undefined {
  const learningLine = markdownLines.find((line) => line.startsWith("- "));
  return learningLine;
}

function updateLearningFile(learningLine: string): void {
  const header = "# Durable Learnings";
  const existing = (() => {
    try {
      return readFileSync(skillLearningPath, "utf8");
    } catch {
      return `${header}\n`;
    }
  })();

  const lines = existing.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const hasHeader = lines[0] === header;
  const bodyLines = hasHeader ? lines.slice(1).filter((line) => line.trim().length > 0) : lines.filter((line) => line.trim().length > 0);

  if (bodyLines.includes(learningLine)) {
    return;
  }

  const next = [
    header,
    "",
    ...bodyLines,
    learningLine,
    "",
  ].join("\n");

  writeFileSync(skillLearningPath, next, "utf8");
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const elements = data.criticalElements ?? [];
  const cues = data.cues ?? [];
  const stressFrames = data.stressFrames ?? [];
  const competitionMoments = data.competitionMoments ?? [];
  const ephemeralMoments = data.ephemeralMoments ?? [];
  const clutter = data.clutter ?? {};
  const confounders = data.confounders ?? {};
  const probeOutcomes = data.probeOutcomes ?? [];
  const incidents = data.incidents ?? [];
  const findings = buildFindings(data);
  const matrix = buildCriticalReadMatrix(data);

  return [
    `# ${game} HUD Readability Audit`,
    "",
    `Session: ${sessionDate}`,
    "",
    "## Findings",
    "",
    ...buildFindingsSection(findings),
    "",
    "## Evidence Snapshot",
    "",
    ...buildEvidenceSection(data),
    "",
    "## Evidence Scope Guardrail",
    "",
    ...buildStarterGuardrailSection(data),
    "",
    "## Critical HUD Elements",
    "",
    ...buildElementSection(elements),
    "",
    "## Must-React Cues",
    "",
    ...buildCueSection(cues),
    "",
    "## Critical Read Matrix",
    "",
    ...buildMatrixSection(matrix),
    "",
    "## Busy-Frame Stress Check",
    "",
    ...buildStressFrameSection(stressFrames),
    "",
    "## Cue Competition",
    "",
    ...buildCompetitionSection(competitionMoments),
    "",
    "## Probe Outcomes",
    "",
    ...buildProbeOutcomeSection(probeOutcomes),
    "",
    "## Shared Incident Queue",
    "",
    ...buildCrossLensIncidentSection(incidents),
    "",
    "## Control And View Confounders",
    "",
    ...buildConfounderSection(confounders),
    "",
    "## Temporary Prompt Recovery",
    "",
    ...buildEphemeralSection(ephemeralMoments),
    "",
    "## Motion Distraction",
    "",
    ...buildMotionDistractionSection(stressFrames),
    "",
    "## Clutter And Overlap",
    "",
    ...buildClutterSection(clutter),
    "",
    "## Strengths",
    "",
    ...buildListSection(data.strengths, "No strengths logged yet."),
    "",
    "## Frictions",
    "",
    ...buildListSection(data.frictions, "No frictions logged yet."),
    "",
    "## Evidence-Backed Next Steps",
    "",
    ...buildNextSteps(findings),
    "",
    "## Durable Learning",
    "",
    ...buildDurableLearning(data, findings),
    "",
  ].join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const data = options.observations ? readObservations(options.observations) : undefined;
  const output = options.template || !data
    ? buildTemplate()
    : buildMarkdown(data);

  if (data) {
    const learningLine = extractLearningLine(buildDurableLearning(data, buildFindings(data)));
    if (learningLine) {
      updateLearningFile(learningLine);
    }
  }

  if (options.out) {
    const outputPath = resolve(options.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output, "utf8");
    console.log(`Wrote ${outputPath}`);
    return;
  }

  console.log(output);
}

main();
