import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type AgiSnapshotSurface = "input" | "visual";

export type AgiSnapshotTag = {
  tag: string;
  surface: AgiSnapshotSurface;
  label: string;
  confidence: "low" | "medium" | "high";
  provenance: string[];
  claimNotes: string[];
  evidenceNotes: string[];
};

export type AgiSnapshotInput = {
  sourcePath?: string;
  game?: string;
  sessionDate?: string;
  firstContact?: {
    controlsReminderAvailable?: boolean;
    objectiveReminderAvailable?: boolean;
    blocksFirstMeaningfulInput?: boolean;
    currentGoalEasyToRestate?: boolean;
    nextStepPrescriptive?: boolean;
  };
  earlyLoop?: {
    firstMeaningfulInputAt?: string;
    firstRiskAt?: string;
    firstRewardAt?: string;
    firstRetryOpportunityAt?: string;
  };
  readableProgression?: {
    proximalGoalVisible?: boolean;
    prerequisiteProgressVisible?: boolean;
    evaluativeReadbackAvailable?: boolean;
    nonComparativeNextStepVisible?: boolean;
  };
  forgiveness?: {
    coyoteTimePresent?: boolean;
    inputBufferPresent?: boolean;
    cornerCorrectionPresent?: boolean;
    collisionLeniencyFair?: boolean;
    retryClarifiesMissedTiming?: boolean;
    failFeelsStolen?: boolean;
  };
  inputDemand?: {
    remapSafe?: boolean;
    rapidRepeatedInputPresent?: boolean;
    holdInputPresent?: boolean;
    simultaneousInputPresent?: boolean;
    rapidSequencePresent?: boolean;
    precisionTimingDemandPresent?: boolean;
    pathBasedOrAnalogDemandPresent?: boolean;
    progressionCriticalDemandPresent?: boolean;
    lowerDemandAlternativeAvailable?: boolean;
    difficultyOptionHelps?: boolean;
    demandReadableBeforeFailure?: boolean;
  };
  confounders?: {
    inputCertainty?: string;
    responseLatency?: string;
    cameraSupportsAction?: boolean;
    viewObstructedAtDecision?: boolean;
    autoCameraInterference?: boolean;
  };
  criticalElements?: {
    name?: string;
    location?: string;
    importance?: "critical" | "supporting" | "secondary";
    readsWithoutText?: boolean;
    readableUnderMotion?: boolean;
    contrastStable?: boolean;
  }[];
  cues?: {
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
    readableUnderMotion?: boolean;
  }[];
  stressFrames?: {
    moment?: string;
    clutterSource?: string;
    cueMasked?: boolean;
    criticalInfoLost?: boolean;
    responseStillReadable?: boolean;
    tags?: string[];
    framePath?: string;
  }[];
  competitionMoments?: {
    moment?: string;
    signals?: string[];
    dominantReadClear?: boolean;
    responsePriorityClear?: boolean;
    nonCriticalUiCompeting?: boolean;
  }[];
  ephemeralMoments?: {
    name?: string;
    kind?: string;
    autoDismisses?: boolean;
    reviewableLater?: boolean;
    suppressibleWhenNonCritical?: boolean;
    obstructsCriticalRead?: boolean;
  }[];
  beats?: {
    at?: string;
    label?: string;
    activeDemands?: number;
    newDemands?: number;
    stackReadable?: boolean;
  }[];
  probeOutcomes?: {
    probe?: string;
    outcome?: string;
    confidence?: number;
    satisfaction?: number;
    frustration?: number;
    blockers?: string[];
  }[];
  strengths?: string[];
  frictions?: string[];
};

export type AgiSnapshotReport = {
  game: string;
  sessionDate: string;
  sourcePath?: string;
  summary: {
    totalTags: number;
    inputTags: number;
    visualTags: number;
    confidenceCounts: {
      low: number;
      medium: number;
      high: number;
    };
  };
  provenance: string[];
  tags: AgiSnapshotTag[];
  notes: string[];
};

type CliOptions = {
  observations?: string;
  jsonOut?: string;
  textOut?: string;
  template: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { template: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--template") {
      options.template = true;
      continue;
    }

    const next = argv[index + 1];
    if ((arg === "--observations" || arg === "--json-out" || arg === "--text-out") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--observations") {
      options.observations = next;
      index += 1;
      continue;
    }

    if (arg === "--json-out") {
      options.jsonOut = next;
      index += 1;
      continue;
    }

    if (arg === "--text-out") {
      options.textOut = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readSource(filePath: string): string {
  return readFileSync(resolve(filePath), "utf8");
}

function parseMarkdownObservation(source: string): unknown | null {
  const match = source.match(/```json\s*([\s\S]*?)\s*```/m);
  if (!match) {
    return null;
  }
  return JSON.parse(match[1]);
}

function readInput(filePath: string): AgiSnapshotInput {
  const raw = readSource(filePath);
  const trimmed = raw.trimStart();
  const parsed = trimmed.startsWith("{") ? JSON.parse(raw) : parseMarkdownObservation(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Observation source must be JSON or markdown with a fenced JSON block.");
  }
  return parsed as AgiSnapshotInput;
}

function confidenceRank(value: AgiSnapshotTag["confidence"]): number {
  if (value === "high") {
    return 2;
  }
  if (value === "medium") {
    return 1;
  }
  return 0;
}

function makeTag(
  tag: string,
  surface: AgiSnapshotSurface,
  label: string,
  confidence: AgiSnapshotTag["confidence"],
  provenance: string[],
  claimNotes: string[],
  evidenceNotes: string[],
): AgiSnapshotTag {
  return { tag, surface, label, confidence, provenance, claimNotes, evidenceNotes };
}

function buildTags(input: AgiSnapshotInput): AgiSnapshotTag[] {
  const tags: AgiSnapshotTag[] = [];
  const provenance = [input.sourcePath ?? "source artifact", `${input.game ?? "unknown-game"} ${input.sessionDate ?? "unknown-date"}`];
  const firstContact = input.firstContact ?? {};
  const earlyLoop = input.earlyLoop ?? {};
  const progression = input.readableProgression ?? {};
  const forgiveness = input.forgiveness ?? {};
  const inputDemand = input.inputDemand ?? {};
  const confounders = input.confounders ?? {};
  const cues = input.cues ?? [];
  const stressFrames = input.stressFrames ?? [];
  const competitionMoments = input.competitionMoments ?? [];
  const ephemeralMoments = input.ephemeralMoments ?? [];
  const beats = input.beats ?? [];

  if (firstContact.blocksFirstMeaningfulInput === true) {
    tags.push(makeTag("input-blocking-first-contact", "input", "first contact blocks play", "high", provenance, ["Do not claim activation trust or clean onboarding."], ["First meaningful input was blocked."]));
  }

  if (firstContact.controlsReminderAvailable === false) {
    tags.push(makeTag("input-missing-controls-reminder", "input", "controls reminder missing", "medium", provenance, ["Do not claim controls are recoverable after interruption."], ["No in-run controls reminder was observed."]));
  }

  if (firstContact.objectiveReminderAvailable === true) {
    tags.push(makeTag("input-objective-reminder", "input", "objective reminder available", "medium", provenance, ["May claim objective recovery support.", "Do not claim full onboarding from this alone."], ["Objective reminder was visible."]));
  }

  if (earlyLoop.firstMeaningfulInputAt || earlyLoop.firstRiskAt || earlyLoop.firstRewardAt) {
    tags.push(makeTag("input-early-loop-cadence", "input", "early loop cadence is visible", "medium", provenance, ["May describe first-action timing.", "Do not claim strong pacing without stack evidence."], ["Opening loop has readable timing milestones."]));
  }

  if (inputDemand.precisionTimingDemandPresent || inputDemand.simultaneousInputPresent || inputDemand.rapidSequencePresent || inputDemand.pathBasedOrAnalogDemandPresent) {
    tags.push(makeTag("input-demand-burden", "input", "input burden exists", "medium", provenance, ["May describe motor tax and demand type.", "Do not claim demand is easy without lower-demand alternative evidence."], ["One or more explicit input-demand flags were set."]));
  }

  if (inputDemand.lowerDemandAlternativeAvailable === true || inputDemand.difficultyOptionHelps === true || inputDemand.remapSafe === true) {
    tags.push(makeTag("input-access-support", "input", "lower-demand support exists", "medium", provenance, ["May claim some input relief exists.", "Do not claim it covers every demand type."], ["One or more mitigation flags were present."]));
  }

  if (confounders.inputCertainty || confounders.responseLatency || confounders.viewObstructedAtDecision || confounders.autoCameraInterference) {
    tags.push(makeTag("input-confounder-trace", "input", "input or view confounder exists", "medium", provenance, ["May note that later claims need confounder caution."], ["Input certainty, latency, or view support was explicitly logged."]));
  }

  if (progression.proximalGoalVisible || progression.prerequisiteProgressVisible || progression.evaluativeReadbackAvailable || progression.nonComparativeNextStepVisible) {
    tags.push(makeTag("input-readable-progression", "input", "progression is legible", "high", provenance, ["May claim proximal goal and next-step readability.", "Do not claim complete campaign clarity from this alone."], ["Progression fields expose readable next-step structure."]));
  }

  if (forgiveness.coyoteTimePresent || forgiveness.inputBufferPresent || forgiveness.cornerCorrectionPresent || forgiveness.collisionLeniencyFair) {
    tags.push(makeTag("input-forgiveness-window", "input", "forgiveness windows exist", "high", provenance, ["May claim intent-preserving windows exist.", "Do not claim unfair failures are impossible."], ["Movement or action forgiveness was explicitly observed."]));
  }

  if (forgiveness.retryClarifiesMissedTiming === true) {
    tags.push(makeTag("input-retry-teaches", "input", "retry teaches missed timing", "medium", provenance, ["May claim retry helps explain timing.", "Do not claim every failure is readable."], ["Retry feedback supports correction."]));
  }

  if (cues.some((cue) => cue.telegraphReadable || cue.requiredResponseObvious || cue.futurePathVisible)) {
    tags.push(makeTag("visual-telegraph-path", "visual", "telegraph or future path is visible", "high", provenance, ["May claim a response path is readable.", "Do not claim all danger reads are clear."], ["At least one cue exposed response or future-path information."]));
  }

  if (cues.some((cue) => cue.reliesOnColorAlone || cue.reliesOnAudioAlone)) {
    tags.push(makeTag("visual-single-channel-risk", "visual", "single-channel cue risk exists", "medium", provenance, ["May note accessibility risk for color-alone or audio-alone meaning.", "Do not claim the cue is robust across mute or color-blind play."], ["A cue depends on one fragile channel."]));
  }

  if (cues.some((cue) => cue.redundantSignal || (cue.signalChannels?.length ?? 0) > 1)) {
    tags.push(makeTag("visual-redundant-cue", "visual", "cue redundancy exists", "medium", provenance, ["May claim backup channels exist.", "Do not claim every cue is redundant."], ["A cue used more than one signal channel or had explicit redundancy."]));
  }

  if (stressFrames.some((frame) => frame.cueMasked || frame.criticalInfoLost || frame.tags?.length)) {
    tags.push(makeTag("visual-clutter-risk", "visual", "busy frame risks masking reads", "high", provenance, ["May claim clutter can compete with critical reads.", "Do not claim HUD readability without direct coverage."], ["A stress frame logged masking, loss, or tagged clutter."]));
  }

  if (competitionMoments.some((moment) => moment.dominantReadClear === false || moment.responsePriorityClear === false || moment.nonCriticalUiCompeting)) {
    tags.push(makeTag("visual-urgent-read-conflict", "visual", "urgent reads compete", "high", provenance, ["May claim one dominant read is at risk.", "Do not claim action priority is always obvious."], ["Signal competition was explicitly observed."]));
  }

  if (ephemeralMoments.some((moment) => moment.autoDismisses || moment.reviewableLater || moment.suppressibleWhenNonCritical)) {
    tags.push(makeTag("visual-temporary-prompt-management", "visual", "temporary prompt management exists", "medium", provenance, ["May claim some short-lived UI is controllable or reviewable.", "Do not claim all prompts stay legible long enough."], ["Transient prompt handling was logged."]));
  }

  if (beats.some((beat) => typeof beat.activeDemands === "number" || typeof beat.newDemands === "number" || beat.stackReadable !== undefined)) {
    tags.push(makeTag("visual-stack-pressure", "visual", "pressure stack is measurable", "high", provenance, ["May claim pacing can be judged from beat stacking.", "Do not claim pressure quality from timing alone."], ["One or more beats recorded active-demand or stack readability data."]));
  }

  if (inputDemand.demandReadableBeforeFailure === true && stressFrames.some((frame) => frame.responseStillReadable !== false)) {
    tags.push(makeTag("visual-pressure-readable", "visual", "pressure stays readable before failure", "medium", provenance, ["May claim pressure remained readable in at least one sampled beat."], ["Demand was visible before failure in the sampled evidence."]));
  }

  return tags.sort((left, right) => {
    const confidenceDelta = confidenceRank(right.confidence) - confidenceRank(left.confidence);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    if (left.surface !== right.surface) {
      return left.surface.localeCompare(right.surface);
    }
    return left.tag.localeCompare(right.tag);
  });
}

export function buildAgiTagSnapshot(input: AgiSnapshotInput): AgiSnapshotReport {
  const tags = buildTags(input);
  const inputTags = tags.filter((tag) => tag.surface === "input").length;
  const visualTags = tags.filter((tag) => tag.surface === "visual").length;

  return {
    game: input.game ?? "unknown-game",
    sessionDate: input.sessionDate ?? "unknown-date",
    sourcePath: input.sourcePath,
    summary: {
      totalTags: tags.length,
      inputTags,
      visualTags,
      confidenceCounts: {
        low: tags.filter((tag) => tag.confidence === "low").length,
        medium: tags.filter((tag) => tag.confidence === "medium").length,
        high: tags.filter((tag) => tag.confidence === "high").length,
      },
    },
    provenance: [
      input.sourcePath ? `source: ${input.sourcePath}` : "source: inline observation",
      `game: ${input.game ?? "unknown-game"}`,
      `session: ${input.sessionDate ?? "unknown-date"}`,
    ],
    tags,
    notes: [
      "Tags are a translation aid, not a verdict.",
      "Preserve source evidence and confidence notes when reusing this snapshot.",
    ],
  };
}

function renderTemplate(): string {
  const exampleInput: AgiSnapshotInput = {
    sourcePath: ".local/playtest-session.json",
    game: "some-game",
    sessionDate: "2026-04-30",
    firstContact: {
      controlsReminderAvailable: false,
      objectiveReminderAvailable: true,
      blocksFirstMeaningfulInput: false,
      currentGoalEasyToRestate: true,
      nextStepPrescriptive: true,
    },
    earlyLoop: {
      firstMeaningfulInputAt: "00:04",
      firstRiskAt: "00:08",
      firstRewardAt: "00:12",
      firstRetryOpportunityAt: "00:35",
    },
    readableProgression: {
      proximalGoalVisible: true,
      prerequisiteProgressVisible: true,
      evaluativeReadbackAvailable: true,
      nonComparativeNextStepVisible: true,
    },
    forgiveness: {
      coyoteTimePresent: true,
      inputBufferPresent: true,
      cornerCorrectionPresent: false,
      collisionLeniencyFair: true,
      retryClarifiesMissedTiming: true,
      failFeelsStolen: false,
    },
    inputDemand: {
      remapSafe: false,
      rapidRepeatedInputPresent: false,
      holdInputPresent: false,
      simultaneousInputPresent: true,
      rapidSequencePresent: false,
      precisionTimingDemandPresent: true,
      pathBasedOrAnalogDemandPresent: false,
      progressionCriticalDemandPresent: true,
      lowerDemandAlternativeAvailable: false,
      difficultyOptionHelps: false,
      demandReadableBeforeFailure: true,
    },
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
        readableUnderMotion: true,
      },
    ],
    stressFrames: [
      {
        moment: "reward burst after wave clear",
        clutterSource: "particles plus score popup",
        cueMasked: false,
        criticalInfoLost: false,
        responseStillReadable: true,
        tags: ["contrast risk"],
        framePath: ".local/some-game-busy-frame.png",
      },
    ],
    competitionMoments: [
      {
        moment: "adds spawn during low-health flash",
        signals: ["incoming-hit arrow", "low-health state", "combo toast"],
        dominantReadClear: false,
        responsePriorityClear: false,
        nonCriticalUiCompeting: true,
      },
    ],
    ephemeralMoments: [
      {
        name: "combo toast",
        kind: "notification",
        autoDismisses: true,
        reviewableLater: false,
        suppressibleWhenNonCritical: false,
        obstructsCriticalRead: true,
      },
    ],
    beats: [
      {
        at: "00:26",
        label: "dodge plus fire return",
        activeDemands: 2,
        newDemands: 1,
        stackReadable: true,
      },
    ],
  };

  return [
    "# AGI Tag Snapshot Template",
    "",
    "Use one observation bundle as input and keep the source evidence untouched.",
    "",
    "## Input Shape",
    "",
    "```json",
    JSON.stringify(exampleInput, null, 2),
    "```",
    "",
    "## Output Shape",
    "",
    "```json",
    JSON.stringify(buildAgiTagSnapshot(exampleInput), null, 2),
    "```",
    "",
  ].join("\n");
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function renderSummary(report: AgiSnapshotReport): string {
  const lines = [
    "# AGI Tag Snapshot",
    "",
    `Game: ${report.game}`,
    `Date: ${report.sessionDate}`,
    `Source: ${report.sourcePath ?? "inline observation"}`,
    "",
    "## Summary",
    "",
    `- Total tags: ${report.summary.totalTags}`,
    `- Input tags: ${report.summary.inputTags}`,
    `- Visual tags: ${report.summary.visualTags}`,
    `- Confidence: low ${report.summary.confidenceCounts.low} | medium ${report.summary.confidenceCounts.medium} | high ${report.summary.confidenceCounts.high}`,
    "",
    "## Tags",
    "",
    ...report.tags.map(
      (tag) =>
        `- ${tag.surface}: ${tag.tag} (${tag.confidence}) - ${tag.label}; provenance=${tag.provenance.join(" | ")}; notes=${tag.evidenceNotes.join(" | ")}; claims=${tag.claimNotes.join(" | ")}`,
    ),
    "",
    "## Notes",
    "",
    ...report.notes.map((note) => `- ${note}`),
    "",
  ];

  return lines.join("\n");
}

export function main(argv: string[]): void {
  const options = parseArgs(argv);

  if (options.template) {
    console.log(renderTemplate());
    return;
  }

  if (!options.observations) {
    throw new Error("Pass --template or provide --observations <file>.");
  }

  const input = readInput(options.observations);
  const report = buildAgiTagSnapshot(input);
  const summary = renderSummary(report);

  if (options.jsonOut) {
    const outPath = resolve(options.jsonOut);
    ensureParentDirectory(outPath);
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.textOut) {
    const outPath = resolve(options.textOut);
    ensureParentDirectory(outPath);
    writeFileSync(outPath, summary, "utf8");
  }

  console.log(summary);
  console.log("");
  console.log("## JSON");
  console.log("");
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
