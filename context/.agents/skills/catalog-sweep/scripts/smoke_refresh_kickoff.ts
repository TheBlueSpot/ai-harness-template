import { saveLearning } from "./learning_capture";
import {
  buildSmokeRefreshEntries,
  chooseDefaultGroup,
  groupLabel,
  matchesGroup,
  type GroupMode,
} from "./smoke_refresh_pack";
import { buildPacket as buildBrowserPlayabilityPacket } from "./browser_playability_packet";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type KickoffPacket = {
  selectedGroup: GroupMode;
  selectedLabel: string;
  selectedCount: number;
  slug: string;
  queueState: string;
  smokeLane: "missing-proof" | "stale-proof";
  smokeIssues: string[];
  smokeEvidence: string[];
  smokeNextSteps: string[];
  smokeProofTargets: string[];
  reviewLane: string;
  reviewSummary: string;
  bootIssues: string[];
  sourceFiles: string[];
  commands: string[];
};

const ROOT = process.cwd();

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
    if ((arg === "--group" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (next !== "missing" && next !== "stale" && next !== "all") {
        throw new Error(`Unsupported --group value: ${next}`);
      }
      options.group = next;
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

function buildKickoffPacket(options: CliOptions): KickoffPacket | null {
  const entries = buildSmokeRefreshEntries(ROOT, options.slug);
  const group = options.group ?? chooseDefaultGroup(entries);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
  const selected = options.slug
    ? filtered.find((entry) => entry.slug === options.slug) ?? null
    : (filtered[0] ?? null);

  if (!selected) {
    return null;
  }

  const browserPacket = buildBrowserPlayabilityPacket(selected.slug);
  const commandSet = new Set<string>([
    `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_kickoff.ts --slug ${selected.slug}`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts --slug ${selected.slug}`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --slug ${selected.slug}`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify --slug ${selected.slug}`,
    ...browserPacket.commands,
  ]);

  return {
    selectedGroup: group,
    selectedLabel: groupLabel(group),
    selectedCount: filtered.length,
    slug: selected.slug,
    queueState: selected.queueState,
    smokeLane: selected.lane,
    smokeIssues: selected.issues,
    smokeEvidence: selected.evidence,
    smokeNextSteps: selected.nextSteps,
    smokeProofTargets: selected.proofTargets,
    reviewLane: browserPacket.reviewLane,
    reviewSummary: browserPacket.reviewSummary,
    bootIssues: browserPacket.bootIssues,
    sourceFiles: browserPacket.sourceFiles,
    commands: Array.from(commandSet),
  };
}

function buildLearning(packet: KickoffPacket | null): string {
  if (!packet) {
    return "- Catalog throughput improves when the smoke kickoff helper can confirm the selected smoke lane is empty, because operators can stop re-running browser-proof triage when current repo facts already show no target in that lane.";
  }

  return `- Catalog throughput improves when one verify-smoke helper picks the next proof target and carries its boot map, review guard, and proof paths for ${packet.slug} in the same packet, because browser refresh work stops bouncing between batch ranking and per-slug spelunking.`;
}

function renderText(packet: KickoffPacket | null, durableLearning: string): string {
  const lines = [
    "# Smoke Refresh Kickoff",
    "",
  ];

  if (!packet) {
    lines.push("mode: no-target");
    lines.push("why: No slug matched the selected smoke lane.");
    lines.push("");
    lines.push("## Commands");
    lines.push("");
    lines.push("- bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts");
    lines.push("- bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts");
    lines.push("");
    lines.push("## Durable learning");
    lines.push("");
    lines.push(durableLearning);
    return lines.join("\n");
  }

  lines.push(`group: ${packet.selectedLabel}`);
  lines.push(`count: ${packet.selectedCount}`);
  lines.push(`slug: ${packet.slug}`);
  lines.push(`queue: ${packet.queueState}`);
  lines.push(`smoke lane: ${packet.smokeLane}`);
  lines.push(`review lane: ${packet.reviewLane}`);
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push(...packet.sourceFiles.map((source) => `- ${source}`));
  lines.push("");
  lines.push("## Smoke");
  lines.push("");
  lines.push(`- issues: ${packet.smokeIssues.join(", ")}`);
  lines.push(...packet.smokeEvidence.map((item) => `- ${item}`));
  lines.push("");
  lines.push("## Boot");
  lines.push("");
  lines.push(
    ...(packet.bootIssues.length > 0
      ? packet.bootIssues.map((issue) => `- ${issue}`)
      : ["- no direct-boot blocker found by the local preflight"]),
  );
  lines.push("");
  lines.push("## Proof targets");
  lines.push("");
  lines.push(...packet.smokeProofTargets.map((target) => `- ${target}`));
  lines.push("");
  lines.push("## Next");
  lines.push("");
  lines.push(...packet.smokeNextSteps.map((step) => `- ${step}`));
  lines.push(`- ${packet.reviewSummary}`);
  lines.push("");
  lines.push("## Commands");
  lines.push("");
  lines.push(...packet.commands.map((command) => `- ${command}`));
  lines.push("");
  lines.push("## Durable learning");
  lines.push("");
  lines.push(durableLearning);
  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const packet = buildKickoffPacket(options);
  const durableLearning = buildLearning(packet);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(JSON.stringify({ packet, durableLearning }, null, 2));
    return;
  }

  console.log(renderText(packet, durableLearning));
}

main();
