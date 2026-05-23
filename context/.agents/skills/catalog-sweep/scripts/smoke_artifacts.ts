import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const LOCAL_DIR = ".local";
const CATALOG_DIR = "games";
const IGNORE_CONTENT_EXTENSIONS = new Set([".md"]);
const EVIDENCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".json", ".txt"]);
const EVIDENCE_NAME_TOKENS = ["autoplay", "patrol", "play", "smoke", "screenshot", "verify"];

export type SmokeStatus =
  | { kind: "missing" }
  | {
      kind: "present";
      artifacts: string[];
      latestSmokeAt: number;
      latestSmokeName: string;
      latestContentAt: number;
      latestContentName: string;
      stale: boolean;
    };

export function inspectSmokeArtifacts(root: string, slug: string): SmokeStatus {
  const localRoot = resolve(root, LOCAL_DIR);
  const entryRoot = resolve(root, CATALOG_DIR, slug);
  const latestContent = findLatestContentTimestamp(entryRoot);

  if (!existsSync(localRoot) || !latestContent) {
    return { kind: "missing" };
  }

  const artifacts = findSmokeArtifacts(localRoot, slug);

  if (artifacts.length === 0) {
    return { kind: "missing" };
  }

  const latestSmoke = artifacts
    .map((relativePath) => {
      const filePath = resolve(localRoot, relativePath);
      return { name: relativePath, updatedAt: statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];

  return {
    kind: "present",
    artifacts,
    latestSmokeAt: latestSmoke.updatedAt,
    latestSmokeName: latestSmoke.name,
    latestContentAt: latestContent.updatedAt,
    latestContentName: latestContent.relativePath,
    stale: latestSmoke.updatedAt < latestContent.updatedAt,
  };
}

function hasSmokePrefix(fileName: string, slug: string): boolean {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
  if (!EVIDENCE_EXTENSIONS.has(extension) || !fileName.startsWith(`${slug}-`)) {
    return false;
  }

  const normalized = fileName.toLowerCase();
  return EVIDENCE_NAME_TOKENS.some((token) => normalized.includes(token));
}

function findSmokeArtifacts(localRoot: string, slug: string): string[] {
  const artifacts: string[] = [];

  for (const entry of readdirSync(localRoot, { withFileTypes: true })) {
    if (entry.isFile() && hasSmokePrefix(entry.name, slug)) {
      artifacts.push(entry.name);
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const childRoot = resolve(localRoot, entry.name);
    for (const child of readdirSync(childRoot, { withFileTypes: true })) {
      if (!child.isFile() || !hasSmokePrefix(child.name, slug)) {
        continue;
      }

      artifacts.push(`${entry.name}/${child.name}`);
    }
  }

  return artifacts.sort((left, right) => left.localeCompare(right));
}

function findLatestContentTimestamp(entryRoot: string):
  | {
      relativePath: string;
      updatedAt: number;
    }
  | undefined {
  const queue = [entryRoot];
  let latest:
    | {
        relativePath: string;
        updatedAt: number;
      }
    | undefined;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !existsSync(current)) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      const extension = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".")) : "";
      if (IGNORE_CONTENT_EXTENSIONS.has(extension.toLowerCase())) {
        continue;
      }

      const updatedAt = statSync(fullPath).mtimeMs;
      const relativePath = fullPath.slice(entryRoot.length + 1).replaceAll("\\", "/");
      if (!latest || updatedAt > latest.updatedAt) {
        latest = { relativePath, updatedAt };
      }
    }
  }

  return latest;
}
