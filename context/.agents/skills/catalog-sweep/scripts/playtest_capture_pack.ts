import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import {
  buildQualityEntry,
  chooseDefaultQualityGroup,
  matchesQualityGroup,
  qualityGroupLabel,
  rankQualityPackEntry,
  type QualityPackEntry,
} from "./quality_scan_core";
import { buildReports } from "./sweep_core";

type GroupMode = "ready" | "refresh" | "boot" | "all";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false };

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

    const next = argv[index + 1];
    if ((arg === "--group" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (next !== "ready" && next !== "refresh" && next !== "boot" && next !== "all") {
        throw new Error(`Unsupported --group value: ${next}`);
      }
      options.group = next;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number.parseInt(next ?? "", 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`Invalid --limit value: ${next}`);
      }
      options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--slug") {
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function formatQueueState(queueState: QualityPackEntry["queueState"]): string {
  if (queueState === "completed") {
    return "completed";
  }
  if (queueState === "pending") {
    return "pending";
  }
  return "untracked";
}

export function buildOutputs(slug: string) {
  return {
    observations: `./.local/${slug}-playtest.json`,
    probeDeck: `./.local/${slug}-playtest-probes.md`,
    report: `./${slug}/playtest-evidence.md`,
    choiceReadbackReport: `./${slug}/choice-readback-audit.md`,
    settingsAndAssistsReport: `./${slug}/settings-and-assists-audit.md`,
    reminderReentryReport: `./${slug}/reminder-reentry-smoke.md`,
    busyFrameClutterReport: `./${slug}/busy-frame-clutter-smoke.md`,
    textMotionReport: `./${slug}/text-motion-smoke.md`,
    cueRedundancyReport: `./${slug}/cue-redundancy-smoke.md`,
    normalizedFindings: `./.local/playtest-starters/${slug}/observation-finding-normalizer.json`,
    starterDir: `./.local/playtest-starters/${slug}`,
  };
}

function initCommand(slug: string, outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/init_playtest_observation.ts --game ${slug} --out "${outputs.observations}" --probe-out "${outputs.probeDeck}"`;
}

function reportCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts --observations "${outputs.observations}" --out "${outputs.report}" --starter-dir "${outputs.starterDir}"`;
}

function reminderReentryCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/reminder_reentry_smoke.ts --observations "${outputs.observations}" --out "${outputs.reminderReentryReport}"`;
}

function busyFrameClutterCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/busy_frame_clutter_smoke.ts --observations "${outputs.observations}" --out "${outputs.busyFrameClutterReport}"`;
}

function textMotionCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/text_motion_smoke.ts --observations "${outputs.observations}" --out "${outputs.textMotionReport}"`;
}

function cueRedundancyCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/cue_redundancy_smoke.ts --observations "${outputs.observations}" --out "${outputs.cueRedundancyReport}"`;
}

export function choiceReadbackAuditCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts --observations "${outputs.starterDir}/choice-readback-audit.json" --out "${outputs.choiceReadbackReport}"`;
}

export function settingsAndAssistsAuditCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.ts --observations "${outputs.starterDir}/settings-and-assists-audit.json" --out "${outputs.settingsAndAssistsReport}"`;
}

function normalizeFindingsCommand(outputs: ReturnType<typeof buildOutputs>): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/observation_finding_normalizer.ts --observations "${outputs.observations}" --starter-dir "${outputs.starterDir}" --out "${outputs.normalizedFindings}"`;
}

function buildLearning(filteredCount: number, readyCount: number): string {
  if (filteredCount === 0) {
    return "- Catalog throughput improves when capture-pack prep can record a clean no-debt pass, because the next operator does not have to rerun quality triage just to confirm no playtest packet is needed.";
  }

  return `- Catalog throughput improves when capture-ready quality targets expand into exact observation, report, and starter paths, because ${readyCount} browser-safe slugs can move straight into reusable playtest capture without handwiring the same local file packet each run.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const reports = buildReports(ROOT, todoRecords, options.slug);
  const entries = reports
    .map((report) => buildQualityEntry(ROOT, report))
    .filter((entry): entry is QualityPackEntry => entry !== null)
    .sort((left, right) => {
      const rankDiff = rankQualityPackEntry(left) - rankQualityPackEntry(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (left.queueState !== right.queueState) {
        if (left.queueState === "pending") {
          return -1;
        }
        if (right.queueState === "pending") {
          return 1;
        }
      }
      return left.slug.localeCompare(right.slug);
    });

  const group = options.group ?? chooseDefaultQualityGroup(entries);
  const filtered = entries.filter((entry) => matchesQualityGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? 5);
  const readyCount = entries.filter((entry) => entry.lane === "capture-ready").length;
  const refreshCount = entries.filter((entry) => entry.lane === "refresh-browser-first").length;
  const bootCount = entries.filter((entry) => entry.lane === "boot-blocked").length;
  const durableLearning = buildLearning(filtered.length, readyCount);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            readyCount,
            refreshCount,
            bootCount,
            selectedGroup: group,
            selectedLabel: qualityGroupLabel(group),
            selectedCount: filtered.length,
          },
          durableLearning,
          entries: limited.map((entry) => ({
            ...entry,
            outputs: buildOutputs(entry.slug),
            commands:
              entry.lane === "capture-ready"
                ? {
                    initObservation: initCommand(entry.slug, buildOutputs(entry.slug)),
                    buildReport: reportCommand(buildOutputs(entry.slug)),
                    buildReminderReentrySmoke: reminderReentryCommand(buildOutputs(entry.slug)),
                    buildBusyFrameClutterSmoke: busyFrameClutterCommand(buildOutputs(entry.slug)),
                    buildTextMotionSmoke: textMotionCommand(buildOutputs(entry.slug)),
                    buildCueRedundancySmoke: cueRedundancyCommand(buildOutputs(entry.slug)),
                    buildChoiceReadbackAudit: choiceReadbackAuditCommand(buildOutputs(entry.slug)),
                    buildSettingsAndAssistsAudit: settingsAndAssistsAuditCommand(buildOutputs(entry.slug)),
                    buildNormalizedFindings: normalizeFindingsCommand(buildOutputs(entry.slug)),
                  }
                : undefined,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("# Playtest Capture Pack");
  console.log("");
  console.log(`quality prep: ready ${readyCount} | refresh ${refreshCount} | boot ${bootCount}`);
  console.log(`selected group: ${qualityGroupLabel(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 5}`);
  console.log("");
  console.log("## Capture next");
  console.log("");
  if (group === "ready") {
    console.log("- Use this when fresh smoke already exists and the only missing step is reusable playtest capture.");
  } else if (group === "refresh") {
    console.log("- These still need browser smoke first. Capture packet is shown only after proof is current.");
  } else if (group === "boot") {
    console.log("- These are still boot-blocked. Fix direct browser boot before initializing playtest evidence.");
  } else {
    console.log("- Work top to bottom. Capture-ready slugs stay ranked ahead of refresh and boot debt.");
  }

  for (const entry of limited) {
    const outputs = buildOutputs(entry.slug);
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${formatQueueState(entry.queueState)}`);
    console.log(`- lane: ${entry.lane}`);
    console.log("- files:");
    for (const file of entry.sourceFiles) {
      console.log(`  - ${file}`);
    }
    console.log("- evidence:");
    for (const item of entry.evidence) {
      console.log(`  - ${item}`);
    }
    console.log("- outputs:");
    console.log(`  - observations: ${outputs.observations}`);
    console.log(`  - probe deck: ${outputs.probeDeck}`);
    console.log(`  - report: ${outputs.report}`);
    console.log(`  - choice-readback audit: ${outputs.choiceReadbackReport}`);
    console.log(`  - settings-and-assists audit: ${outputs.settingsAndAssistsReport}`);
    console.log(`  - reminder-reentry smoke: ${outputs.reminderReentryReport}`);
    console.log(`  - busy-frame clutter smoke: ${outputs.busyFrameClutterReport}`);
    console.log(`  - text-motion smoke: ${outputs.textMotionReport}`);
    console.log(`  - cue-redundancy smoke: ${outputs.cueRedundancyReport}`);
    console.log(`  - normalized findings: ${outputs.normalizedFindings}`);
    console.log(`  - starter dir: ${outputs.starterDir}`);
    console.log("- next:");
    for (const step of entry.nextSteps) {
      console.log(`  - ${step}`);
    }
    if (entry.lane === "capture-ready") {
      console.log("- commands:");
      console.log(`  - ${initCommand(entry.slug, outputs)}`);
      console.log(`  - ${reportCommand(outputs)}`);
      console.log(`  - ${reminderReentryCommand(outputs)}`);
      console.log(`  - ${busyFrameClutterCommand(outputs)}`);
      console.log(`  - ${textMotionCommand(outputs)}`);
      console.log(`  - ${cueRedundancyCommand(outputs)}`);
      console.log(`  - ${choiceReadbackAuditCommand(outputs)}`);
      console.log(`  - ${settingsAndAssistsAuditCommand(outputs)}`);
      console.log(`  - ${normalizeFindingsCommand(outputs)}`);
    }
  }

  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

if (require.main === module) {
  main();
}
