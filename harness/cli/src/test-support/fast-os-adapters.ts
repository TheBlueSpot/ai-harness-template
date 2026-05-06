import path from "node:path";
import type { ExperimentInspection, ExperimentRun, ProjectSearchResult } from "../../../shared/protocol";
import type { BranchfsExperimentLease } from "../branchfs-manager";
import type { HarnessBranchfsManager, HarnessServerOsAdapters } from "../server";

export function createFastHarnessServerOsAdapters(): HarnessServerOsAdapters {
  return {
    async searchProjectFolders({ query, workspaceProjectPaths = [], platform = process.platform }) {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return [];
      }

      return workspaceProjectPaths
        .filter((rootPath) => {
          const comparable = platform === "win32" ? rootPath.toLowerCase() : rootPath;
          return comparable.includes(platform === "win32" ? normalizedQuery.toLowerCase() : normalizedQuery);
        })
        .slice(0, 8)
        .map((rootPath) => ({
          id: rootPath,
          name: path.basename(rootPath) || rootPath,
          rootPath,
          repoKind: "git-repo",
          matchKind: path.basename(rootPath).toLowerCase().startsWith(normalizedQuery) ? "name-prefix" : "substring"
        })) satisfies ProjectSearchResult[];
    },
    async runGitPreflight() {
      return {
        status: "clean",
        changedFileCount: 0
      };
    },
    async runCorrectnessReview() {
      return {
        status: "pass",
        summary: "Correctness review passed. Fast test adapter skipped OS file scan.",
        gaps: []
      };
    },
    branchfsManagerFactory(context) {
      return new FastBranchfsManager(context.rootPath, context.runId);
    }
  };
}

class FastBranchfsManager implements HarnessBranchfsManager {
  constructor(
    private readonly rootPath: string,
    private readonly runId: string
  ) {}

  async prepareExperimentLease(): Promise<BranchfsExperimentLease> {
    const experiment = this.createExperiment("prepared");
    return {
      experiment,
      repoRoot: this.rootPath,
      projectRelativePath: "",
      repoMountPath: experiment.repoMountPath,
      projectMountPath: experiment.projectMountPath,
      baseProjectPath: this.rootPath,
      manifestPath: path.join(this.rootPath, ".local", "branchfs", this.runId, "meta", "manifest.json"),
      dirtySeedPath: path.join(this.rootPath, ".local", "branchfs", this.runId, "dirty-seed"),
      upperPath: path.join(this.rootPath, ".local", "branchfs", this.runId, "upper")
    };
  }

  async readInspection(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    return {
      experiment: lease.experiment,
      diffText: "",
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      changedPaths: []
    };
  }

  async flushExperiment(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    return this.readInspection(lease);
  }

  async discardExperiment() {}

  async unmountExperiment() {}

  private createExperiment(status: ExperimentRun["status"]): ExperimentRun {
    const now = new Date().toISOString();
    const mountPath = path.join(this.rootPath, ".local", "branchfs-fast", this.runId, "mount");
    return {
      id: `experiment-${this.runId}`,
      runId: this.runId,
      status,
      virtualBranchName: `fast-${this.runId}`,
      repoMountPath: mountPath,
      projectMountPath: mountPath,
      baseDirtyFingerprint: "fast-clean",
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      createdAt: now,
      updatedAt: now
    };
  }
}
