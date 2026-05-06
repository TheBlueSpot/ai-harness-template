import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";
type ContactIntensity = "light" | "heavy" | "critical";
type LayerStrength = "none" | "weak" | "subtle" | "clear" | "heavy";

type ContactObservation = {
  event?: string;
  intensity?: ContactIntensity;
  hitReadable?: boolean;
  forceReadable?: boolean;
  scenePreserved?: boolean;
  audioCoherent?: boolean;
  hitStop?: LayerStrength;
  cameraSupport?: LayerStrength;
  notes?: string;
};

type ChannelSupportObservation = {
  criticalInfoMultiChannel?: boolean;
  hapticsUsed?: boolean;
  hapticsConfigurable?: boolean;
  hapticsCarryCriticalInfoAlone?: boolean;
};

type EvidenceObservation = {
  mode?: "direct-play" | "captured-video" | "code-inference" | "mixed";
  sampledEncounters?: number;
  sampledContacts?: number;
  sampledHeavyContacts?: number;
  notes?: string[];
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  contacts?: ContactObservation[];
  channelSupport?: ChannelSupportObservation;
  evidence?: EvidenceObservation;
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

const skillLearningPath = resolve(import.meta.dir, "..", "LEARNINGS.md");

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

function countWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function formatCount(count: number, total: number, label: string): string {
  if (total <= 0) {
    return `${count} ${label}`;
  }
  return `${count}/${total} ${label}`;
}

function isWeakLayer(value: LayerStrength | undefined): boolean {
  return value === "none" || value === "weak";
}

function isHeavyContact(contact: ContactObservation): boolean {
  return contact.intensity === "heavy" || contact.intensity === "critical";
}

function buildTemplate(): string {
  return [
    "# Impact Feel Audit Template",
    "",
    "Use during active browser play. Sample at least one light hit and one heavy or high-stakes hit.",
    "",
    "## Core Checks",
    "",
    "- Contact confirms fast enough that the player can tell whether a hit landed.",
    "- Stronger hits create stronger readable hierarchy instead of using the same maxed reaction every time.",
    "- Sound, hit stop, camera, and visuals reinforce the same event coherently.",
    "- Feedback preserves targets, lanes, and recovery timing after contact.",
    "- Haptics stay optional reinforcement instead of carrying critical information alone.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-04-29",
        contacts: [
          {
            event: "basic slash on grunt",
            intensity: "light",
            hitReadable: true,
            forceReadable: true,
            scenePreserved: true,
            audioCoherent: true,
            hitStop: "subtle",
            cameraSupport: "none",
            notes: "clean contact without hiding the follow-up target",
          },
          {
            event: "charged slam on elite",
            intensity: "heavy",
            hitReadable: true,
            forceReadable: false,
            scenePreserved: false,
            audioCoherent: true,
            hitStop: "weak",
            cameraSupport: "heavy",
            notes: "big shake sells force but hides recovery timing",
          },
        ],
        channelSupport: {
          criticalInfoMultiChannel: true,
          hapticsUsed: true,
          hapticsConfigurable: true,
          hapticsCarryCriticalInfoAlone: false,
        },
        evidence: {
          mode: "direct-play",
          sampledEncounters: 3,
          sampledContacts: 8,
          sampledHeavyContacts: 2,
          notes: [
            "compared jab, launcher, and charged slam",
            "rechecked the heavy hit during a busier wave",
          ],
        },
        strengths: ["light contact reads immediately without scene loss"],
        frictions: ["heavy contact hides follow-up lane with flash and shake"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const contacts = data.contacts ?? [];
  const channelSupport = data.channelSupport ?? {};
  const totalContacts = contacts.length;
  const heavyContacts = contacts.filter(isHeavyContact);
  const totalHeavyContacts = heavyContacts.length;

  const unreadableContacts = countWhere(contacts, (contact) => contact.hitReadable === false);
  const heavyFlatContacts = countWhere(heavyContacts, (contact) => contact.forceReadable === false);
  const obscuringContacts = countWhere(contacts, (contact) => contact.scenePreserved === false);
  const weakAudioContacts = countWhere(contacts, (contact) => contact.audioCoherent === false);
  const weakHitStopHeavy = countWhere(heavyContacts, (contact) => isWeakLayer(contact.hitStop));
  const weakCameraHeavy = countWhere(heavyContacts, (contact) => isWeakLayer(contact.cameraSupport));
  const findings: Finding[] = [];

  if (unreadableContacts > 0) {
    findings.push({
      severity: unreadableContacts >= Math.max(1, Math.ceil(totalContacts / 2)) ? "blocker" : "major",
      title: "some contact events do not read clearly enough to trust the core hit",
      evidence: `${formatCount(unreadableContacts, totalContacts, "contacts")} were logged with unclear or missing contact confirmation.`,
      nextStep: "Strengthen first-frame contact truth before adding more spectacle so the player can tell hit versus miss immediately.",
    });
  }

  if (heavyFlatContacts > 0 && (weakHitStopHeavy > 0 || weakCameraHeavy > 0)) {
    findings.push({
      severity: heavyFlatContacts >= Math.max(1, Math.ceil(totalHeavyContacts / 2)) ? "blocker" : "major",
      title: "heavy hits lack readable force hierarchy",
      evidence: `${formatCount(heavyFlatContacts, totalHeavyContacts, "heavy contacts")} did not feel meaningfully stronger and ${formatCount(weakHitStopHeavy, totalHeavyContacts, "heavy contacts")} had weak hit stop while ${formatCount(weakCameraHeavy, totalHeavyContacts, "heavy contacts")} had weak camera support.`,
      nextStep: "Reserve stronger temporal or camera emphasis for the hits that matter most so heavy contact outranks light contact without turning every tap into a full event.",
    });
  } else if (heavyFlatContacts > 0) {
    findings.push({
      severity: "major",
      title: "heavy hits do not separate cleanly from light hits",
      evidence: `${formatCount(heavyFlatContacts, totalHeavyContacts, "heavy contacts")} were logged with weak force hierarchy.`,
      nextStep: "Give the strongest hits a clearer magnitude layer so players can feel escalation without reading damage numbers.",
    });
  }

  if (obscuringContacts > 0) {
    findings.push({
      severity: obscuringContacts >= Math.max(1, Math.ceil(totalContacts / 2)) ? "blocker" : "major",
      title: "impact feedback obscures the next actionable scene state",
      evidence: `${formatCount(obscuringContacts, totalContacts, "contacts")} hid targets, lanes, or recovery timing after the hit.`,
      nextStep: "Trim or reposition the loudest layers so impact sells force without masking the next decision window.",
    });
  }

  if (weakAudioContacts > 0 && (weakHitStopHeavy > 0 || weakCameraHeavy > 0)) {
    findings.push({
      severity: "major",
      title: "impact channels are not reinforcing the same event coherently",
      evidence: `${formatCount(weakAudioContacts, totalContacts, "contacts")} had weak audio coherence while heavy-hit reinforcement also stayed weak.`,
      nextStep: "Align sound, temporal emphasis, and camera response around the same contact event instead of asking one noisy layer to carry the full payoff alone.",
    });
  } else if (weakAudioContacts > 0) {
    findings.push({
      severity: "major",
      title: "some impacts sound disconnected from what the player sees",
      evidence: `${formatCount(weakAudioContacts, totalContacts, "contacts")} were logged with weak audio coherence.`,
      nextStep: "Retune impact sound so material, force, and timing reinforce the contact the player actually saw.",
    });
  }

  if (channelSupport.hapticsCarryCriticalInfoAlone === true) {
    findings.push({
      severity: "blocker",
      title: "critical impact information depends on haptics alone",
      evidence: `Haptics carry critical info alone ${boolLabel(channelSupport.hapticsCarryCriticalInfoAlone)}; critical info multi-channel ${boolLabel(channelSupport.criticalInfoMultiChannel)}.`,
      nextStep: "Duplicate important impact meaning through visual or audio cues so disabled or unsupported haptics do not break combat readability.",
    });
  } else if (channelSupport.hapticsUsed === true && channelSupport.hapticsConfigurable === false) {
    findings.push({
      severity: "major",
      title: "haptic reinforcement exists without clear player control",
      evidence: `Haptics used ${boolLabel(channelSupport.hapticsUsed)}; haptics configurable ${boolLabel(channelSupport.hapticsConfigurable)}.`,
      nextStep: "Keep haptics as optional reinforcement with player control over intensity or off-state.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major impact-feel breakdown was logged in the supplied observations",
      evidence: "The sampled contacts preserved contact truth, force hierarchy, and post-hit readability well enough that no severe issue was recorded.",
      nextStep: "Keep the current impact stack and validate it on harder encounters before tuning for extra spectacle.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildContactSection(contacts: ContactObservation[]): string[] {
  if (contacts.length === 0) {
    return ["- No contact observations recorded yet."];
  }

  return contacts.map((contact, index) => {
    const parts = [
      `contact ${index + 1}`,
      `event ${contact.event ?? "unknown"}`,
      `intensity ${contact.intensity ?? "unknown"}`,
      `hit readable ${boolLabel(contact.hitReadable)}`,
      `force readable ${boolLabel(contact.forceReadable)}`,
      `scene preserved ${boolLabel(contact.scenePreserved)}`,
      `audio coherent ${boolLabel(contact.audioCoherent)}`,
      `hit stop ${contact.hitStop ?? "unknown"}`,
      `camera support ${contact.cameraSupport ?? "unknown"}`,
      `notes ${contact.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
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
    `- Contacts sampled: ${evidence.sampledContacts ?? 0}.`,
    `- Heavy contacts sampled: ${evidence.sampledHeavyContacts ?? 0}.`,
  ];

  if (evidence.notes && evidence.notes.length > 0) {
    for (const note of evidence.notes) {
      lines.push(`- Evidence note: ${note}`);
    }
  }

  return lines;
}

function buildChannelSection(channelSupport: ChannelSupportObservation): string[] {
  return [
    `- Critical impact info uses multiple channels: ${boolLabel(channelSupport.criticalInfoMultiChannel)}.`,
    `- Haptics used: ${boolLabel(channelSupport.hapticsUsed)}.`,
    `- Haptics configurable: ${boolLabel(channelSupport.hapticsConfigurable)}.`,
    `- Haptics carry critical info alone: ${boolLabel(channelSupport.hapticsCarryCriticalInfoAlone)}.`,
  ];
}

function buildListSection(items: string[] | undefined, fallback: string): string[] {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }
  return items.map((item) => `- ${item}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  const steps = Array.from(new Set(findings.map((finding) => finding.nextStep)));
  return steps.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const majorCount = findings.filter((finding) => finding.severity === "major").length;

  if (findings.length === 1 && findings[0]?.severity === "minor") {
    return [
      `- ${game}: evidence-first impact review still matters for this catalog because a clean contact baseline makes later feel regressions easier to catch than loose ` + "`juice feels off`" + ` notes.`,
    ];
  }

  return [
    `- ${game}: blocker-first impact reporting matters for this catalog because sticky arcade loops depend on trustworthy contact truth, readable force hierarchy, and post-hit scene clarity; this pass logged ${blockerCount} blocker(s) and ${majorCount} major finding(s) with explicit evidence scope instead of vibe-only combat notes.`,
  ];
}

function extractLearningLine(markdownLines: string[]): string | undefined {
  const durableLearningIndex = markdownLines.findIndex((line) => line.trim() === "## Durable Learning");
  if (durableLearningIndex === -1) {
    return undefined;
  }

  for (let index = durableLearningIndex + 1; index < markdownLines.length; index += 1) {
    const line = markdownLines[index]?.trim();
    if (line?.startsWith("- ")) {
      return line;
    }
  }

  return undefined;
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

  const normalized = existing.replace(/\r\n/g, "\n");
  const bodyLines = normalized
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (bodyLines.includes(learningLine)) {
    return;
  }

  const next = [
    header,
    "",
    learningLine,
    ...bodyLines,
    "",
  ].join("\n");

  writeFileSync(skillLearningPath, next, "utf8");
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const contacts = data.contacts ?? [];
  const channelSupport = data.channelSupport ?? {};
  const findings = buildFindings(data);

  return [
    `# ${game} Impact Feel Audit`,
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
    "## Impact Stack",
    "",
    ...buildContactSection(contacts),
    "",
    "## Channel Support",
    "",
    ...buildChannelSection(channelSupport),
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

  if (options.template) {
    process.stdout.write(buildTemplate());
    return;
  }

  if (!options.observations) {
    throw new Error("Pass --template or provide --observations <file>.");
  }

  const data = readObservations(options.observations);
  const markdown = buildMarkdown(data);
  const learningLine = extractLearningLine(markdown.split("\n"));

  if (learningLine) {
    updateLearningFile(learningLine);
  }

  if (options.out) {
    const outputPath = resolve(options.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, markdown, "utf8");
  }

  process.stdout.write(markdown);
}

main();
