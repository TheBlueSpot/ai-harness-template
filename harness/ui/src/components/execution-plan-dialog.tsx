import { For, Show } from "solid-js";
import type { ExecutionPlan } from "../../../shared/protocol";
import { harnessStore } from "../harness-store";
import { MarkdownContent } from "./markdown-content";
import { Dialog } from "./ui/dialog";

type ExecutionPlanDialogProps = {
  executionPlan?: ExecutionPlan;
};

export function ExecutionPlanDialog(props: ExecutionPlanDialogProps) {
  const state = harnessStore.state;

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
          <div class="space-y-5 text-[0.75rem] leading-6 text-[color:var(--foreground)]">
            <div class="grid gap-2 md:grid-cols-2">
              <div>Run: {executionPlan().runId}</div>
              <div>Iteration: {executionPlan().iteration}</div>
              <div>Route: {executionPlan().route}</div>
              <div>Difficulty: {executionPlan().difficultyScore}%</div>
              <div>Planner: {executionPlan().planningModelId}</div>
              <div>Executor: {executionPlan().executionModelId}</div>
              <div>Worktree: {executionPlan().subagentWorktreeStrategy}</div>
              <div>
                Buckets: {executionPlan().actualSubagentCount}/{executionPlan().targetSubagentCount}
              </div>
              <div>Gate: {executionPlan().gating.mode}</div>
              <div>Delay: {executionPlan().gating.delaySeconds}s</div>
              <div>Correctness: {executionPlan().correctnessPolicy}</div>
              <div>Origin: {executionPlan().origin}</div>
            </div>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Summary
              </div>
              <MarkdownContent content={() => executionPlan().summary} class="mt-2" />
            </section>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Execution brief
              </div>
              <MarkdownContent content={() => executionPlan().finalExecutionBrief} class="mt-2" />
            </section>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Prerequisites
              </div>
              <Show
                when={executionPlan().prerequisites.length > 0}
                fallback={<div class="mt-2 text-[color:var(--muted)]">No explicit prerequisites.</div>}
              >
                <div class="mt-2 space-y-2">
                  <For each={executionPlan().prerequisites}>
                    {(prerequisite) => (
                      <div class="rounded-2xl border border-[color:var(--border)] bg-white/60 p-3">
                        <div class="font-semibold">{prerequisite.title}</div>
                        <MarkdownContent content={() => prerequisite.instruction} class="mt-1" tone="muted" size="compact" />
                        <div class="mt-1 text-[color:var(--muted)]">Reason:</div>
                        <MarkdownContent content={() => prerequisite.reason} tone="muted" size="compact" />
                        <div class="mt-1 text-[color:var(--muted)]">Owner: {prerequisite.owner}</div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section>
              <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Contracts
              </div>
              <div class="mt-2 space-y-2">
                <For each={executionPlan().contracts}>
                  {(contract) => (
                    <div class="rounded-2xl border border-[color:var(--border)] bg-white/60 p-3">
                      <div class="font-semibold">{contract.title}</div>
                      <MarkdownContent content={() => contract.instruction} class="mt-1" tone="muted" size="compact" />
                      <div class="mt-1 text-[color:var(--muted)]">Owned paths: {contract.ownedPaths.join(", ")}</div>
                      <div class="mt-1 text-[color:var(--muted)]">Deliverables: {contract.deliverables.join(", ")}</div>
                      <div class="mt-1 text-[color:var(--muted)]">Integrates with: {contract.integrationPoints.join(", ") || "none"}</div>
                      <div class="mt-1 text-[color:var(--muted)]">Verify: {contract.verificationCommands.join(" && ")}</div>
                      <div class="mt-1 text-[color:var(--muted)]">Merge notes: {contract.mergeNotes}</div>
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
