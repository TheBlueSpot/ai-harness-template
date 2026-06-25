import { For, Show } from "solid-js";
import { AlertTriangle } from "lucide-solid";
import type { ExecutionPlan } from "../../../shared/protocol";
import { harnessStore } from "../harness-store";
import type { ChatFileTarget } from "../lib/chat-file-links";
import { openIdeWindow } from "../lib/ide-window";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { MarkdownContent } from "./markdown-content";
import { Dialog } from "./primitives/dialog";

type ExecutionPlanDialogProps = {
  executionPlan?: ExecutionPlan;
};

export function ExecutionPlanDialog(props: ExecutionPlanDialogProps) {
  const state = harnessStore.state;
  const activeProject = () =>
    state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId) ?? state.workspace.projects[0];
  const fileLinks = (): FileLinkConfig | undefined => {
    const project = activeProject();
    return project
      ? {
          rootPath: project.rootPath,
          filePaths: project.filePaths ?? [],
          onOpenFile: handleOpenFile
        }
      : undefined;
  };
  const hasBranchfsSizeWarning = () =>
    state.workspace.projects
      .find((project) => project.id === state.workspace.activeProjectId)
      ?.traces.some((trace) => trace.stage === "branchfs-size-warning") ?? false;

  function handleOpenFile(target: ChatFileTarget) {
    const project = activeProject();
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  return (
    <Dialog
      open={state.executionPlanDialogOpen}
      onClose={() => harnessStore.closeExecutionPlanDialog()}
      title="Execution plan"
      eyebrow="Plan"
      description="Planner summary, prerequisites, contract buckets, verification scope, and correctness policy."
      class="max-w-4xl"
      contentClass="flex max-h-[80vh] flex-col gap-4 overflow-auto"
    >
      <Show when={props.executionPlan}>
        {(executionPlan) => (
          <div class="space-y-5 text-[0.75rem] leading-6 text-(--foreground)">
            <div class="grid gap-2 md:grid-cols-2">
              <div>Run: {executionPlan().runId}</div>
              <div>Iteration: {executionPlan().iteration}</div>
              <div>Route: {executionPlan().route}</div>
              <div>Difficulty: {executionPlan().difficultyScore}%</div>
              <div>Planner: {executionPlan().planningModelId}</div>
              <div>Executor: {executionPlan().executionModelId}</div>
              <div>Isolation: {executionPlan().subagentWorktreeStrategy}</div>
              <div>
                Buckets: {executionPlan().actualSubagentCount}/{executionPlan().targetSubagentCount}
              </div>
              <div>Gate: {executionPlan().gating.mode}</div>
              <div>Delay: {executionPlan().gating.delaySeconds}s</div>
              <div>Correctness: {executionPlan().correctnessPolicy}</div>
              <div>Origin: {executionPlan().origin}</div>
            </div>
            <Show when={hasBranchfsSizeWarning()}>
              <div class="inline-flex w-fit items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[0.625rem] font-medium text-amber-800">
                <AlertTriangle class="h-3 w-3" />
                BranchFS large
              </div>
            </Show>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                Summary
              </div>
              <MarkdownContent content={() => executionPlan().summary} class="mt-2" fileLinks={fileLinks()} />
            </section>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                Execution brief
              </div>
              <MarkdownContent content={() => executionPlan().finalExecutionBrief} class="mt-2" fileLinks={fileLinks()} />
            </section>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                Prerequisites
              </div>
              <Show
                when={executionPlan().prerequisites.length > 0}
                fallback={<div class="mt-2 text-(--muted)">No explicit prerequisites.</div>}
              >
                <div class="mt-2 space-y-2">
                  <For each={executionPlan().prerequisites}>
                    {(prerequisite) => (
                      <div class="rounded-2xl border border-(--border) bg-white/60 p-3">
                        <div class="font-semibold">{prerequisite.title}</div>
                        <MarkdownContent content={() => prerequisite.instruction} class="mt-1" tone="muted" size="compact" fileLinks={fileLinks()} />
                        <div class="mt-1 text-(--muted)">Reason:</div>
                        <MarkdownContent content={() => prerequisite.reason} tone="muted" size="compact" fileLinks={fileLinks()} />
                        <div class="mt-1 text-(--muted)">Owner: {prerequisite.owner}</div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                Contracts
              </div>
              <div class="mt-2 space-y-2">
                <For each={executionPlan().contracts}>
                  {(contract) => (
                    <div class="rounded-2xl border border-(--border) bg-white/60 p-3">
                      <div class="font-semibold">{contract.title}</div>
                      <MarkdownContent content={() => contract.instruction} class="mt-1" tone="muted" size="compact" fileLinks={fileLinks()} />
                      <div class="mt-1 text-(--muted)">
                        <FileLinkedText text={`Owned paths: ${contract.ownedPaths.join(", ")}`} fileLinks={fileLinks()} />
                      </div>
                      <div class="mt-1 text-(--muted)">
                        <FileLinkedText text={`Deliverables: ${contract.deliverables.join(", ")}`} fileLinks={fileLinks()} />
                      </div>
                      <div class="mt-1 text-(--muted)">
                        <FileLinkedText text={`Integrates with: ${contract.integrationPoints.join(", ") || "none"}`} fileLinks={fileLinks()} />
                      </div>
                      <div class="mt-1 text-(--muted)">
                        <FileLinkedText text={`Verify: ${contract.verificationCommands.join(" && ")}`} fileLinks={fileLinks()} />
                      </div>
                      <div class="mt-1 text-(--muted)">
                        <FileLinkedText text={`Merge notes: ${contract.mergeNotes}`} fileLinks={fileLinks()} />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </div>
        )}
      </Show>
    </Dialog>
  );
}

