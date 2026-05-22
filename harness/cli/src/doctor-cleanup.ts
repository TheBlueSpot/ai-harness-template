import { access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type DoctorCleanupResult =
  | { deleted: true; rootPath: string; distPath: string }
  | { deleted: false; rootPath: string; distPath: string; reason: "missing-sentinel" };

const HARNESS_SENTINELS = ["package.json", "harness/cli/src/index.ts", "harness/ui/index.html"];

export async function deleteDoctorDistFolder(rootPath = resolveHarnessRoot()): Promise<DoctorCleanupResult> {
  const resolvedRoot = path.resolve(rootPath);
  const distPath = path.join(resolvedRoot, "dist");
  const hasSentinels = await hasHarnessSentinels(resolvedRoot);
  if (!hasSentinels) {
    return { deleted: false, rootPath: resolvedRoot, distPath, reason: "missing-sentinel" };
  }

  await rm(distPath, { recursive: true, force: true });
  return { deleted: true, rootPath: resolvedRoot, distPath };
}

export function resolveHarnessRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

async function hasHarnessSentinels(rootPath: string) {
  for (const sentinel of HARNESS_SENTINELS) {
    try {
      await access(path.join(rootPath, sentinel));
    } catch {
      return false;
    }
  }
  return true;
}
