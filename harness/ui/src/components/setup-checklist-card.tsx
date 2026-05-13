import { For, Show } from "solid-js";
import type { SetupAction, SetupCheck } from "../../../shared/protocol";
import { ActionButton } from "./action-button";

type SetupChecklistCardProps = {
  checks: SetupCheck[];
  readyRequiredCount: number;
  totalRequiredCount: number;
  onAction: (action: SetupAction) => void;
  onDismiss?: () => void;
  onOpenHelp?: () => void;
};

export function SetupChecklistCard(props: SetupChecklistCardProps) {
  const orderedChecks = () =>
    [...props.checks].sort((left, right) => {
      const leftPriority = getPriority(left);
      const rightPriority = getPriority(right);
      return leftPriority === rightPriority ? left.title.localeCompare(right.title) : leftPriority - rightPriority;
    });

  return (
    <section class="rounded-3xl border border-amber-300/80 bg-amber-50/90 p-4 text-(--foreground) shadow-sm">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div class="space-y-2">
          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-amber-900">Activation center</div>
          <div class="text-[0.875rem] font-semibold">
            Required checks ready: {props.readyRequiredCount}/{props.totalRequiredCount}
          </div>
          <p class="max-w-3xl text-[0.7rem] leading-6 text-amber-950/80">
            Fix the blocking items below, or run a guided walkthrough if you want a guided first pass.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Show when={props.onOpenHelp}>
            <ActionButton tooltip="Open guided help and tutorials" type="button" variant="secondary" onClick={props.onOpenHelp}>
              ? Help
            </ActionButton>
          </Show>
          <Show when={props.onDismiss}>
            <ActionButton tooltip="Hide setup checklist" type="button" variant="ghost" onClick={props.onDismiss}>
              Hide
            </ActionButton>
          </Show>
        </div>
      </div>

      <div class="mt-4 grid gap-3">
        <For each={orderedChecks()}>
          {(check) => (
            <article
              class="rounded-[1.2rem] border px-4 py-3"
              classList={{
                "border-emerald-200": check.status === "ready",
                "bg-white/75": check.status === "ready",
                "border-slate-200": check.status === "unsupported",
                "bg-slate-50/75": check.status === "unsupported",
                "border-sky-200": check.status === "warning",
                "bg-sky-50/80": check.status === "warning",
                "border-amber-300": check.status !== "ready" && check.status !== "unsupported" && check.status !== "warning",
                "bg-white/80": check.status !== "ready" && check.status !== "unsupported" && check.status !== "warning"
              }}
            >
              <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      {check.requiredForFirstTask ? "Required" : "Optional"}
                    </span>
                    <span class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      {check.status}
                    </span>
                  </div>
                  <div class="text-[0.85rem] font-semibold">{check.title}</div>
                  <div class="text-[0.7rem] leading-6 text-(--muted)">{check.summary}</div>
                  <Show when={check.detail}>
                    <div class="text-[0.68rem] leading-6 text-(--muted)">{check.detail}</div>
                  </Show>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Show when={check.primaryAction}>
                    {(action) => (
                      <ActionButton tooltip={action().label} type="button" onClick={() => props.onAction(action())}>
                        {action().label}
                      </ActionButton>
                    )}
                  </Show>
                  <Show when={check.secondaryAction}>
                    {(action) => (
                      <ActionButton tooltip={action().label} type="button" variant="secondary" onClick={() => props.onAction(action())}>
                        {action().label}
                      </ActionButton>
                    )}
                  </Show>
                </div>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

function getPriority(check: SetupCheck) {
  if (check.requiredForFirstTask && check.status === "action-required") {
    return 0;
  }

  if (check.requiredForFirstTask && check.status === "warning") {
    return 1;
  }

  if (check.requiredForFirstTask) {
    return 2;
  }

  if (check.status === "unsupported") {
    return 4;
  }

  return 3;
}
