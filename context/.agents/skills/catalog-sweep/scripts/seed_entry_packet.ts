import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findCatalogFolders, probeSlugWorkspace } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type PendingSeedCandidate = {
  slug: string;
  title: string;
  note: string;
  queueLine: string;
};

type SeedPacket = {
  mode: "scaffold-pending-slug" | "no-pending-slug";
  why: string;
  slug?: string;
  title?: string;
  note?: string;
  queueLine?: string;
  sourceFiles: string[];
  starterPaths: string[];
  starterSteps: string[];
  followUpCommands: string[];
  workspaceProbe?: ReturnType<typeof probeSlugWorkspace>;
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
    if (arg === "--slug") {
      options.slug = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function findNextPendingWithoutPlayableFolder(
  todoPath: string,
  playableFolders: Set<string>,
  requestedSlug?: string,
): PendingSeedCandidate | undefined {
  const text = readFileSync(todoPath, "utf8");
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("PENDING | ")) {
      continue;
    }

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 4) {
      continue;
    }

    const slug = parts[1];
    if (requestedSlug && slug !== requestedSlug) {
      continue;
    }
    if (playableFolders.has(slug)) {
      continue;
    }

    return {
      slug,
      title: parts[2],
      note: parts.slice(3).join(" | "),
      queueLine: line,
    };
  }

  return undefined;
}

function buildSeedPacket(candidate: PendingSeedCandidate | undefined): SeedPacket {
  if (!candidate) {
    return {
      mode: "no-pending-slug",
      why: "todo.md has no pending slug that still lacks a top-level playable folder.",
      sourceFiles: ["./todo.md"],
      starterPaths: [],
      starterSteps: [
        "Run queue reconciliation before seeding anything else.",
        "If queue truth is still clean, add exactly one fresh pending slug in ./todo.md.",
      ],
      followUpCommands: [
        "bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts",
        "bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts",
      ],
    };
  }

  const workspaceProbe = probeSlugWorkspace(ROOT, candidate.slug);
  const starterPaths = [
    `./${candidate.slug}/`,
    `./${candidate.slug}/index.html`,
    `./${candidate.slug}/README.md`,
  ];
  const starterSteps = workspaceProbe.folderExists
    ? [
        `Keep work isolated inside ./${candidate.slug}/ and restore direct browser boot with ./index.html.`,
        "Write a concise README.md that stays high level and says how to launch the folder locally.",
        "Keep the first scaffold plain local HTML, CSS, and JS paths so direct file boot works before polish.",
      ]
    : [
        `Create the top-level folder ./${candidate.slug}/ for this one queued game.`,
        "Add index.html first so direct browser boot exists before deeper implementation.",
        "Add a concise README.md with premise, controls, and the local launch path only.",
      ];
  const followUpCommands = [
    `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts --slug ${candidate.slug}`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts --slug ${candidate.slug} --apply`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --slug ${candidate.slug}`,
    `bun.cmd .agents/skills/catalog-sweep/scripts/maintenance_packet.ts --slug ${candidate.slug}`,
  ];

  return {
    mode: "scaffold-pending-slug",
    why: "Queue truth already chose the next slug, and throughput is highest when that pending record expands straight into one isolated browser-playable starter packet.",
    slug: candidate.slug,
    title: candidate.title,
    note: candidate.note,
    queueLine: candidate.queueLine,
    sourceFiles: ["./todo.md"],
    starterPaths,
    starterSteps,
    followUpCommands,
    workspaceProbe,
  };
}

function buildLearning(packet: SeedPacket): string {
  if (packet.slug) {
    return `- Catalog throughput improves when one helper turns the next pending missing-folder slug into exact scaffold paths and follow-up commands for ${packet.slug}, because queue triage can hand off straight into isolated browser-playable entry setup without another rediscovery pass.`;
  }

  return "- Catalog throughput improves when the starter-packet helper can say queue truth has no pending missing-folder slug, because operators avoid seeding or scaffolding duplicate work when reconciliation should happen first.";
}

function buildTextOutput(packet: SeedPacket): string {
  const lines = [
    "# Seed Entry Packet",
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
    lines.push(`queue note: ${packet.note}`);
  }

  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  for (const sourceFile of packet.sourceFiles) {
    lines.push(`- ${sourceFile}`);
  }

  if (packet.queueLine) {
    lines.push("");
    lines.push("## Queue line");
    lines.push("");
    lines.push(`- ${packet.queueLine}`);
  }

  if (packet.workspaceProbe) {
    lines.push("");
    lines.push("## Workspace");
    lines.push("");
    lines.push(`- folder exists: ${packet.workspaceProbe.folderExists ? "yes" : "no"}`);
    lines.push(`- has index.html: ${packet.workspaceProbe.hasIndexHtml ? "yes" : "no"}`);
    lines.push(`- has README.md: ${packet.workspaceProbe.hasReadme ? "yes" : "no"}`);
    if (packet.workspaceProbe.topLevelEntries.length > 0) {
      lines.push(`- top-level entries: ${packet.workspaceProbe.topLevelEntries.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("## Starter paths");
  lines.push("");
  for (const starterPath of packet.starterPaths) {
    lines.push(`- ${starterPath}`);
  }

  lines.push("");
  lines.push("## Starter steps");
  lines.push("");
  for (const step of packet.starterSteps) {
    lines.push(`- ${step}`);
  }

  lines.push("");
  lines.push("## Follow-up commands");
  lines.push("");
  for (const command of packet.followUpCommands) {
    lines.push(`- \`${command}\``);
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const playableFolders = new Set(findCatalogFolders(ROOT));
  const candidate = findNextPendingWithoutPlayableFolder(TODO_PATH, playableFolders, options.slug);
  const packet = buildSeedPacket(candidate);
  const durableLearning = buildLearning(packet);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  const output = options.json
    ? JSON.stringify({ packet, durableLearning }, null, 2)
    : `${buildTextOutput(packet)}\n\n## Durable learning\n\n${durableLearning}`;

  console.log(output);
}

if (import.meta.main) {
  main();
}
