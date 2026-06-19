import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import path from "node:path";

export async function copyLauncherRuntimeAssets(repoRoot: string, targetDir: string) {
  await cp(path.join(repoRoot, "dist/ui"), path.join(targetDir, "dist/ui"), { recursive: true });
  await cp(path.join(repoRoot, "package.json"), path.join(targetDir, "package.json"));
  await cp(path.join(repoRoot, "agents.md"), path.join(targetDir, "agents.md"));
  const bundledSkillsPath = path.join(repoRoot, ".agents", "skills");
  if (existsSync(bundledSkillsPath)) {
    await cp(bundledSkillsPath, path.join(targetDir, ".agents", "skills"), { recursive: true });
  }
}
