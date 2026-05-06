import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, probeSlugWorkspace } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildRecommendation } from "./queue_reconcile";

type CliOptions = {
  apply: boolean;
  json: boolean;
  note?: string;
  saveLearning: boolean;
  slug?: string;
  title?: string;
};

type PacketMode = "seed-next-pending" | "blocked" | "missing-input";

type SeedPacket = {
  mode: PacketMode;
  why: string;
  queueLine?: string;
  slug?: string;
  title?: string;
  note?: string;
  missingFields: string[];
  inputStatus: string[];
  followUpCommands: string[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    json: false,
    saveLearning: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }
    if (arg === "--slug" || arg === "--title" || arg === "--note") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`Missing value for ${arg}`);
      }
      if (arg === "--slug") {
        options.slug = next.trim();
      } else if (arg === "--title") {
        options.title = next.trim();
      } else {
        options.note = next.trim();
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildPacket(options: CliOptions): SeedPacket {
  const todoRecords = parseTodoRecords(TODO_PATH);
  const snapshot = buildQueueSnapshot(ROOT, todoRecords);
  const recommendation = buildRecommendation(snapshot);
  const missingFields: string[] = [];
  const inputStatus: string[] = [];

  if (recommendation.kind !== "seed-next-pending") {
    return {
      mode: "blocked",
      why: `Queue truth is not ready for a fresh seed. Current next action is ${recommendation.kind}.`,
      missingFields,
      inputStatus: [recommendation.summary, recommendation.why],
      followUpCommands: [
        "bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts",
        "bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts",
      ],
    };
  }

  const slug = options.slug?.trim();
  const title = options.title?.trim();
  const note = options.note?.trim();

  if (!slug) {
    missingFields.push("--slug");
  } else if (!SLUG_PATTERN.test(slug)) {
    inputStatus.push(`slug invalid: ${slug} (use kebab-case)`);
  } else {
    if (todoRecords.has(slug)) {
      inputStatus.push(`slug already tracked in ./todo.md: ${slug}`);
    }
    const probe = probeSlugWorkspace(ROOT, slug);
    if (probe.folderExists) {
      inputStatus.push(`slug folder already exists: ./${slug}/`);
    }
  }

  if (!title) {
    missingFields.push("--title");
  }
  if (!note) {
    missingFields.push("--note");
  }

  if (missingFields.length > 0 || inputStatus.length > 0) {
    return {
      mode: "missing-input",
      why: "Queue truth is ready for one fresh pending item, but the seed still needs safe metadata or a conflict-free slug.",
      slug,
      title,
      note,
      missingFields,
      inputStatus,
      followUpCommands: [
        "bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts",
        "bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts",
        "bun.cmd .agents/skills/catalog-sweep/scripts/seed_next_pending.ts --slug <slug> --title \"<title>\" --note \"<one-line note>\"",
      ],
    };
  }

  return {
    mode: "seed-next-pending",
    why: "Queue truth is clean enough to add exactly one fresh pending browser-playable item.",
    slug,
    title,
    note,
    queueLine: `PENDING | ${slug} | ${title} | ${note}`,
    missingFields,
    inputStatus,
    followUpCommands: [
      `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_packet.ts --slug ${slug}`,
      `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts --slug ${slug}`,
      `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts --slug ${slug} --apply`,
      `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --slug ${slug}`,
    ],
  };
}

function applyQueueLine(queueLine: string): void {
  const original = readFileSync(TODO_PATH, "utf8");
  const normalized = original.replace(/\r\n/g, "\n");
  const pendingHeader = "## Pending";
  const completedHeader = "## Completed";
  const pendingIndex = normalized.indexOf(pendingHeader);
  if (pendingIndex === -1) {
    throw new Error("todo.md is missing the ## Pending section.");
  }

  const completedIndex = normalized.indexOf(completedHeader);
  if (completedIndex === -1 || completedIndex < pendingIndex) {
    throw new Error("todo.md is missing the ## Completed section.");
  }

  const beforeCompleted = normalized.slice(0, completedIndex);
  if (beforeCompleted.includes(queueLine)) {
    return;
  }

  const sectionBody = normalized.slice(pendingIndex + pendingHeader.length, completedIndex);
  const trimmedBody = sectionBody.replace(/\s+$/u, "");
  const insertion =
    trimmedBody.trim().length === 0
      ? `\n${queueLine}\n\n`
      : `${trimmedBody}\n${queueLine}\n\n`;
  const next =
    normalized.slice(0, pendingIndex + pendingHeader.length) +
    insertion +
    normalized.slice(completedIndex);
  writeFileSync(TODO_PATH, next.replace(/\n/g, "\r\n"), "utf8");
}

function buildLearning(packet: SeedPacket): string {
  if (packet.mode === "seed-next-pending" && packet.slug) {
    return `- Catalog throughput improves when one helper can preview or append the next pending queue line for ${packet.slug}, because zero-pending queue recovery stops at one safe seed step instead of an unstructured todo edit.`;
  }

  return "- Catalog throughput improves when the fresh-seed helper refuses to append unless queue truth is clean and the new slug metadata is conflict-free, because one extra pending line is cheaper than queue drift cleanup later.";
}

function buildTextOutput(packet: SeedPacket, durableLearning: string): string {
  const lines = [
    "# Seed Next Pending",
    "",
    `mode: ${packet.mode}`,
    `why: ${packet.why}`,
  ];

  if (packet.slug) {
    lines.push(`slug: ${packet.slug}`);
  }
  if (packet.title) {
    lines.push(`title: ${packet.title}`);
  }
  if (packet.note) {
    lines.push(`note: ${packet.note}`);
  }
  if (packet.queueLine) {
    lines.push(`queue line: ${packet.queueLine}`);
  }

  lines.push("");
  lines.push("## Input status");
  lines.push("");
  if (packet.missingFields.length === 0 && packet.inputStatus.length === 0) {
    lines.push("- metadata complete");
  } else {
    for (const field of packet.missingFields) {
      lines.push(`- missing ${field}`);
    }
    for (const status of packet.inputStatus) {
      lines.push(`- ${status}`);
    }
  }

  lines.push("");
  lines.push("## Follow-up commands");
  lines.push("");
  for (const command of packet.followUpCommands) {
    lines.push(`- ${command}`);
  }

  lines.push("");
  lines.push("## Durable learning");
  lines.push("");
  lines.push(durableLearning);

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const packet = buildPacket(options);
  const durableLearning = buildLearning(packet);

  if (options.apply) {
    if (packet.mode !== "seed-next-pending" || !packet.queueLine) {
      throw new Error("Cannot apply. Queue is not ready or required seed metadata is missing.");
    }
    applyQueueLine(packet.queueLine);
  }

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(JSON.stringify({ packet, durableLearning, applied: options.apply && packet.mode === "seed-next-pending" }, null, 2));
    return;
  }

  console.log(buildTextOutput(packet, durableLearning));
}

if (import.meta.main) {
  main();
}
