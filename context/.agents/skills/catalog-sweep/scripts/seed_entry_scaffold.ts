import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, probeSlugWorkspace, type QueueRecord } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";

type CliOptions = {
  apply: boolean;
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type SeedCandidate = {
  slug: string;
  title: string;
  note: string;
  queueLine: string;
};

type FilePlan = {
  path: string;
  exists: boolean;
  action: "create" | "skip";
};

type ScaffoldPacket = {
  mode: "scaffold-pending-slug" | "no-pending-slug";
  applyMode: "preview" | "apply";
  why: string;
  slug?: string;
  title?: string;
  note?: string;
  queueLine?: string;
  sourceFiles: string[];
  filePlans: FilePlan[];
  nextSteps: string[];
  followUpCommands: string[];
  workspaceProbe?: ReturnType<typeof probeSlugWorkspace>;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false, json: false, saveLearning: false };

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
    if (arg === "--slug") {
      options.slug = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function findPendingSeedCandidate(options: CliOptions): SeedCandidate | undefined {
  const todoRecords = parseTodoRecords(TODO_PATH);
  const snapshot = buildQueueSnapshot(ROOT, todoRecords);
  const queueSlug = options.slug ?? snapshot.pendingWithoutFolder[0];
  if (!queueSlug) {
    return undefined;
  }

  if (!snapshot.pendingWithoutFolder.includes(queueSlug)) {
    return undefined;
  }

  const record = (todoRecords.get(queueSlug) ?? []).find((entry) => entry.state === "pending");
  if (!record) {
    throw new Error(`Pending queue record not found for ${queueSlug}.`);
  }

  return {
    slug: record.slug,
    title: record.title,
    note: record.note,
    queueLine: `PENDING | ${record.slug} | ${record.title} | ${record.note}`,
  };
}

function buildScaffoldPacket(candidate: SeedCandidate | undefined, options: CliOptions): ScaffoldPacket {
  if (!candidate) {
    return {
      mode: "no-pending-slug",
      applyMode: options.apply ? "apply" : "preview",
      why: "todo.md has no pending slug that still lacks a top-level playable folder.",
      sourceFiles: ["./todo.md"],
      filePlans: [],
      nextSteps: [
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
  const folder = `./games/${candidate.slug}`;
  const filePlans = [
    buildFilePlan(candidate.slug, "index.html"),
    buildFilePlan(candidate.slug, "styles.css"),
    buildFilePlan(candidate.slug, "game.js"),
    buildFilePlan(candidate.slug, "README.md"),
  ];

  return {
    mode: "scaffold-pending-slug",
    applyMode: options.apply ? "apply" : "preview",
    why: "Queue truth already chose the next slug, and throughput is highest when that pending record can expand straight into missing starter files instead of a manual setup checklist.",
    slug: candidate.slug,
    title: candidate.title,
    note: candidate.note,
    queueLine: candidate.queueLine,
    sourceFiles: ["./todo.md"],
    filePlans,
    nextSteps: workspaceProbe.folderExists
      ? [
          `Keep work isolated inside ${folder}/ and leave unrelated top-level entries alone.`,
          "Create only the missing browser-entry starter files first; do not overwrite existing work.",
          "Use the starter shell to restore direct browser boot before deeper game implementation.",
        ]
      : [
          `Create ${folder}/ as the isolated top-level game folder.`,
          "Add the browser-entry starter files so direct local boot exists before deeper implementation.",
          "Keep the README concise and high level, with the launch line and premise only.",
        ],
    followUpCommands: [
      `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_packet.ts --slug ${candidate.slug}`,
      `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --slug ${candidate.slug}`,
      `bun.cmd .agents/skills/catalog-sweep/scripts/maintenance_packet.ts --slug ${candidate.slug}`,
    ],
    workspaceProbe,
  };
}

function buildFilePlan(slug: string, fileName: string): FilePlan {
  const relativePath = `./games/${slug}/${fileName}`;
  const exists = existsSync(resolve(ROOT, "games", slug, fileName));

  return {
    path: relativePath,
    exists,
    action: exists ? "skip" : "create",
  };
}

function renderIndexHtml(title: string, note: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="app">
      <section class="hero">
        <p class="eyebrow">Catalog starter</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="summary">${escapeHtml(note)}</p>
      </section>
      <section class="panel">
        <h2>Starter scaffold ready</h2>
        <p>Direct browser boot is in place. Replace this shell with the real game loop next.</p>
        <ul class="checklist">
          <li>Keep the game isolated in this top-level folder.</li>
          <li>Preserve direct local browser boot from <code>./index.html</code>.</li>
          <li>Keep the README high level while the game loop takes shape.</li>
        </ul>
      </section>
    </main>
    <script src="./game.js"></script>
  </body>
</html>
`;
}

function renderStylesCss(): string {
  return `:root {
  color-scheme: light;
  font-family: Georgia, "Times New Roman", serif;
  background: #f3ead7;
  color: #2e2418;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.7), transparent 45%),
    linear-gradient(180deg, #d9c29c 0%, #f3ead7 100%);
}

.app {
  width: min(900px, calc(100% - 32px));
  margin: 0 auto;
  padding: 48px 0 64px;
}

.hero,
.panel {
  border: 2px solid rgba(46, 36, 24, 0.2);
  border-radius: 24px;
  padding: 24px;
  background: rgba(255, 250, 240, 0.88);
  box-shadow: 0 20px 40px rgba(46, 36, 24, 0.08);
}

.panel {
  margin-top: 20px;
}

.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
}

h1,
h2 {
  margin: 0 0 12px;
}

.summary {
  margin: 0;
  max-width: 60ch;
  line-height: 1.5;
}

.checklist {
  margin: 16px 0 0;
  padding-left: 20px;
  line-height: 1.6;
}
`;
}

function renderGameJs(slug: string): string {
  return `const panel = document.querySelector(".panel");

if (panel) {
  const status = document.createElement("p");
  status.className = "summary";
  status.textContent = "Starter shell active for ${slug}. Build the first playable loop here.";
  panel.append(status);
}
`;
}

function renderReadme(slug: string, title: string, note: string): string {
  return `# ${title}

${note}

Open [index.html](./index.html) in a browser to play.

## Premise

- This folder is the isolated browser-playable entry for \`${slug}\`.
- The first pass should restore direct browser boot and establish the core game loop before polish.

## Controls

- Replace this placeholder section with the shipped controls once the loop exists.
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyScaffold(packet: ScaffoldPacket): void {
  if (!packet.slug || !packet.title || !packet.note) {
    return;
  }

  mkdirSync(resolve(ROOT, "games", packet.slug), { recursive: true });

  for (const plan of packet.filePlans) {
    if (plan.action === "skip") {
      continue;
    }

    const targetPath = resolve(ROOT, plan.path.slice(2));
    const content = targetPath.endsWith("index.html")
      ? renderIndexHtml(packet.title, packet.note)
      : targetPath.endsWith("styles.css")
        ? renderStylesCss()
        : targetPath.endsWith("game.js")
          ? renderGameJs(packet.slug)
          : renderReadme(packet.slug, packet.title, packet.note);
    writeFileSync(targetPath, content, "utf8");
  }
}

function buildLearning(packet: ScaffoldPacket): string {
  if (!packet.slug) {
    return "- Catalog throughput improves when the seed scaffold helper can refuse duplicate setup work, because queue truth should stay the gate before any new starter files appear.";
  }

  return `- Catalog throughput improves when one queue helper can create missing direct-boot starter files for ${packet.slug} without overwriting existing work, because pending-folder setup stops at a safe scaffold step instead of another manual checklist.`;
}

function buildTextOutput(packet: ScaffoldPacket): string {
  const lines = [
    "# Seed Entry Scaffold",
    "",
    `mode: ${packet.mode}`,
    `apply mode: ${packet.applyMode}`,
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
  lines.push("## File plan");
  lines.push("");
  for (const plan of packet.filePlans) {
    lines.push(`- ${plan.action}: ${plan.path}${plan.exists ? " (already exists)" : ""}`);
  }

  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  for (const step of packet.nextSteps) {
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
  const candidate = findPendingSeedCandidate(options);
  const packet = buildScaffoldPacket(candidate, options);
  const durableLearning = buildLearning(packet);

  if (options.apply) {
    applyScaffold(packet);
  }

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
