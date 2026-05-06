import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export type QueueState = "pending" | "completed" | "untracked";

export type QueueRecord = {
  state: QueueState;
  slug: string;
  title: string;
  note: string;
};

export type QueueSnapshot = {
  playableFolders: string[];
  trackedPlayableFolders: string[];
  pendingPlayableFolders: string[];
  completedPlayableFolders: string[];
  untrackedFolders: string[];
  pendingWithoutFolder: string[];
  completedWithoutFolder: string[];
  mixedStateSlugs: string[];
  duplicateRecordSlugs: string[];
};

export type LocalPathRisk =
  | { kind: "ok"; resolvedPath: string }
  | { kind: "missing"; attemptedPath: string }
  | { kind: "case-drift"; resolvedPath: string; actualPath: string };

export type SlugWorkspaceProbe = {
  folderExists: boolean;
  hasIndexHtml: boolean;
  hasReadme: boolean;
  topLevelEntries: string[];
};

const NON_GAME_QUEUE_SLUGS = new Set(["context"]);

const IGNORE_DIRS = new Set([
  ".agents",
  ".git",
  ".local",
  "architecture",
  "assets",
  "command-protocol",
  "lib",
  "model-provider",
  "prompts",
  "src",
]);

export function parseTodoRecords(filePath: string): Map<string, QueueRecord[]> {
  const records = new Map<string, QueueRecord[]>();
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || (!trimmed.startsWith("PENDING | ") && !trimmed.startsWith("COMPLETED | "))) {
      continue;
    }

    const parts = trimmed.split("|").map((part) => part.trim());
    if (parts.length < 4) {
      continue;
    }

    const state = parts[0] === "PENDING" ? "pending" : "completed";
    const slug = parts[1];
    const title = parts[2];
    const note = parts.slice(3).join(" | ");
    const nextRecord: QueueRecord = { state, slug, title, note };
    const list = records.get(slug) ?? [];
    list.push(nextRecord);
    records.set(slug, list);
  }

  return records;
}

export function isGameQueueSlug(slug: string): boolean {
  return !NON_GAME_QUEUE_SLUGS.has(slug);
}

export function findCatalogFolders(root: string): string[] {
  return readdirSync(root)
    .filter((name) => {
      if (IGNORE_DIRS.has(name) || name.startsWith(".")) {
        return false;
      }

      const folderPath = resolve(root, name);
      if (!statSync(folderPath).isDirectory()) {
        return false;
      }

      return existsSync(resolve(folderPath, "index.html"));
    })
    .sort((left, right) => left.localeCompare(right));
}

export function buildQueueSnapshot(root: string, todoRecords: Map<string, QueueRecord[]>): QueueSnapshot {
  const playableFolders = findCatalogFolders(root);
  const folderSet = new Set(playableFolders);
  const trackedPlayableFolders: string[] = [];
  const pendingPlayableFolders: string[] = [];
  const completedPlayableFolders: string[] = [];
  const untrackedFolders = playableFolders.filter((slug) => (todoRecords.get(slug) ?? []).length === 0);
  const pendingWithoutFolder: string[] = [];
  const completedWithoutFolder: string[] = [];
  const mixedStateSlugs: string[] = [];
  const duplicateRecordSlugs: string[] = [];

  for (const slug of playableFolders) {
    const records = todoRecords.get(slug) ?? [];
    if (records.length === 0) {
      continue;
    }

    trackedPlayableFolders.push(slug);
    const states = new Set(records.map((record) => record.state));
    const pendingRecords = records.filter((record) => record.state === "pending").length;
    if (pendingRecords > 1) {
      duplicateRecordSlugs.push(slug);
    }
    if (states.size > 1) {
      mixedStateSlugs.push(slug);
    }
    if (states.has("pending")) {
      pendingPlayableFolders.push(slug);
    }
    if (states.has("completed")) {
      completedPlayableFolders.push(slug);
    }
  }

  for (const [slug, records] of todoRecords.entries()) {
    if (!isGameQueueSlug(slug)) {
      continue;
    }
    if (folderSet.has(slug)) {
      continue;
    }

    const state = records[0]?.state;
    if (state === "pending") {
      pendingWithoutFolder.push(slug);
      continue;
    }

    if (state === "completed") {
      completedWithoutFolder.push(slug);
    }
  }

  return {
    playableFolders,
    trackedPlayableFolders: trackedPlayableFolders.sort((left, right) => left.localeCompare(right)),
    pendingPlayableFolders: pendingPlayableFolders.sort((left, right) => left.localeCompare(right)),
    completedPlayableFolders: completedPlayableFolders.sort((left, right) => left.localeCompare(right)),
    untrackedFolders,
    pendingWithoutFolder: pendingWithoutFolder.sort((left, right) => left.localeCompare(right)),
    completedWithoutFolder: completedWithoutFolder.sort((left, right) => left.localeCompare(right)),
    mixedStateSlugs: mixedStateSlugs.sort((left, right) => left.localeCompare(right)),
    duplicateRecordSlugs: duplicateRecordSlugs.sort((left, right) => left.localeCompare(right)),
  };
}

export function probeSlugWorkspace(root: string, slug: string, limit = 6): SlugWorkspaceProbe {
  const folderPath = resolve(root, slug);
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    return {
      folderExists: false,
      hasIndexHtml: false,
      hasReadme: false,
      topLevelEntries: [],
    };
  }

  const topLevelEntries = readdirSync(folderPath)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit)
    .map((entry) => {
      const entryPath = resolve(folderPath, entry);
      return existsSync(entryPath) && statSync(entryPath).isDirectory() ? `${entry}/` : entry;
    });

  return {
    folderExists: true,
    hasIndexHtml: existsSync(resolve(folderPath, "index.html")),
    hasReadme: existsSync(resolve(folderPath, "README.md")),
    topLevelEntries,
  };
}

export function resolveLocalPathRisk(baseDir: string, reference: string): LocalPathRisk {
  const directPath = resolve(baseDir, reference);
  const candidates = [
    directPath,
    `${directPath}.js`,
    resolve(directPath, "index.js"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    const actualPath = resolveActualCase(candidate);
    if (!actualPath) {
      return { kind: "missing", attemptedPath: candidate };
    }

    if (normalizeForCompare(actualPath) !== normalizeForCompare(candidate)) {
      return {
        kind: "case-drift",
        resolvedPath: candidate,
        actualPath,
      };
    }

    return { kind: "ok", resolvedPath: candidate };
  }

  return { kind: "missing", attemptedPath: directPath };
}

function normalizeForCompare(filePath: string): string {
  return filePath.replaceAll("/", "\\");
}

function resolveActualCase(filePath: string): string | undefined {
  const normalized = resolve(filePath);
  const parent = dirname(normalized);

  if (parent === normalized) {
    return normalized;
  }

  if (!existsSync(parent)) {
    return undefined;
  }

  const actualParent = resolveActualCase(parent);
  if (!actualParent) {
    return undefined;
  }

  const targetName = basename(normalized);
  const match = readdirSync(actualParent).find((entry) => entry.toLowerCase() === targetName.toLowerCase());
  if (!match) {
    return undefined;
  }

  return resolve(actualParent, match);
}
