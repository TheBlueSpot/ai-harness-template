import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, type QueueSnapshot } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
};

export type RecommendationKind =
  | "resolve-mixed-state"
  | "clear-duplicate-records"
  | "build-pending-folder"
  | "continue-pending-folder"
  | "reconcile-untracked-folder"
  | "clear-completed-drift"
  | "seed-next-pending";

export type Recommendation = {
  kind: RecommendationKind;
  slug?: string;
  summary: string;
  why: string;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function pickFirst(list: string[]): string | undefined {
  return [...list].sort((left, right) => left.localeCompare(right))[0];
}

export function buildRecommendation(snapshot: QueueSnapshot): Recommendation {
  const mixedSlug = pickFirst(snapshot.mixedStateSlugs);
  if (mixedSlug) {
    return {
      kind: "resolve-mixed-state",
      slug: mixedSlug,
      summary: `Resolve mixed queue state for ${mixedSlug}.`,
      why: "One slug is both pending and completed, so queue truth is ambiguous and later catalog closure decisions will drift.",
    };
  }

  const duplicateOnlySlug = [...snapshot.duplicateRecordSlugs]
    .sort((left, right) => left.localeCompare(right))
    .find((slug) => !snapshot.mixedStateSlugs.includes(slug));
  if (duplicateOnlySlug) {
    return {
      kind: "clear-duplicate-records",
      slug: duplicateOnlySlug,
      summary: `Collapse duplicate queue records for ${duplicateOnlySlug}.`,
      why: "Repeated records force the next operator to re-check queue history before doing useful catalog work.",
    };
  }

  const pendingWithoutFolder = pickFirst(snapshot.pendingWithoutFolder);
  if (pendingWithoutFolder) {
    return {
      kind: "build-pending-folder",
      slug: pendingWithoutFolder,
      summary: `Build the pending queue slug ${pendingWithoutFolder}.`,
      why: "Queue truth already says this entry is next, but no top-level browser-playable folder exists yet.",
    };
  }

  const pendingPlayable = pickFirst(snapshot.pendingPlayableFolders);
  if (pendingPlayable) {
    return {
      kind: "continue-pending-folder",
      slug: pendingPlayable,
      summary: `Continue the active pending playable folder ${pendingPlayable}.`,
      why: "There is already one pending slug with a live top-level browser entry, so throughput stays highest by closing that run before seeding or reconciling another slug.",
    };
  }

  const untrackedFolder = pickFirst(snapshot.untrackedFolders);
  if (untrackedFolder) {
    return {
      kind: "reconcile-untracked-folder",
      slug: untrackedFolder,
      summary: `Reconcile untracked playable folder ${untrackedFolder}.`,
      why: "A browser-playable top-level folder exists outside queue history, so future sweeps will keep rediscovering it until the queue is updated.",
    };
  }

  const completedWithoutFolder = pickFirst(snapshot.completedWithoutFolder);
  if (completedWithoutFolder) {
    return {
      kind: "clear-completed-drift",
      slug: completedWithoutFolder,
      summary: `Resolve completed-without-folder drift for ${completedWithoutFolder}.`,
      why: "Queue history claims this slug shipped, but the matching browser-playable folder is missing from repo state.",
    };
  }

  return {
    kind: "seed-next-pending",
    summary: "Seed exactly one new pending catalog item.",
    why: "Every current top-level browser-playable folder is already covered and no pending slug remains, so queue flow needs one fresh next item.",
  };
}

function buildTextOutput(snapshot: QueueSnapshot, recommendation: Recommendation): string {
  const lines = [
    "# Queue Reconcile",
    "",
    `playable folders: ${snapshot.playableFolders.length}`,
    `tracked playable folders: ${snapshot.trackedPlayableFolders.length}`,
    `pending playable folders: ${snapshot.pendingPlayableFolders.length}`,
    `pending without folder: ${snapshot.pendingWithoutFolder.length}`,
    `untracked playable folders: ${snapshot.untrackedFolders.length}`,
    `completed without folder: ${snapshot.completedWithoutFolder.length}`,
    `mixed state slugs: ${snapshot.mixedStateSlugs.length}`,
    `duplicate record slugs: ${snapshot.duplicateRecordSlugs.length}`,
    "",
    "## Next action",
    "",
    `- kind: ${recommendation.kind}`,
    `- summary: ${recommendation.summary}`,
    `- why: ${recommendation.why}`,
  ];

  if (recommendation.slug) {
    lines.push(`- slug: ${recommendation.slug}`);
  }

  return lines.join("\n");
}

function buildLearning(snapshot: QueueSnapshot, recommendation: Recommendation): string {
  const driftCount =
    snapshot.pendingWithoutFolder.length +
    snapshot.completedWithoutFolder.length +
    snapshot.untrackedFolders.length +
    snapshot.mixedStateSlugs.length +
    snapshot.duplicateRecordSlugs.length;

  if (!recommendation.slug) {
    return "- Catalog throughput improves when queue reconciliation saves the chosen next action as durable memory, because operators should not have to rediscover when repo state is clean enough to seed exactly one fresh pending slug.";
  }

  return `- Catalog throughput improves when queue reconciliation saves one explicit next action from repo facts; this pass chose ${recommendation.kind} for ${recommendation.slug} across ${driftCount} drift signals, so the next operator can continue queue closure without re-reading the whole sweep.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const todoRecords = parseTodoRecords(TODO_PATH);
  const snapshot = buildQueueSnapshot(ROOT, todoRecords);
  const recommendation = buildRecommendation(snapshot);
  const durableLearning = buildLearning(snapshot, recommendation);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  const output = options.json
    ? JSON.stringify({ snapshot, recommendation, durableLearning }, null, 2)
    : `${buildTextOutput(snapshot, recommendation)}\n\n## Durable learning\n\n${durableLearning}`;

  console.log(output);
}

if (import.meta.main) {
  main();
}
