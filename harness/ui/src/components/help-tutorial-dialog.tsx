import { For } from "solid-js";
import type { SetupState } from "../../../shared/protocol";
import { tutorialDefinitions } from "./tutorial-definitions";
import { Dialog } from "./primitives/dialog";
import { ActionButton } from "./action-button";

type HelpTutorialDialogProps = {
  open: boolean;
  setup: SetupState;
  completedTutorialIds: string[];
  dismissedTutorialIds: string[];
  onClose: () => void;
  onStartTutorial: (tutorialId: string) => void;
};

export function HelpTutorialDialog(props: HelpTutorialDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      eyebrow="Guided help"
      title="Walkthroughs and setup"
      description="Run a targeted tutorial, then come back to the activation checklist when you need another repair step."
      class="max-w-4xl"
    >
      <section class="rounded-[1.35rem] border border-(--border) bg-white/70 p-4">
        <div class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Current setup</div>
        <div class="mt-2 text-[0.9rem] font-semibold text-(--foreground)">
          {props.setup.readyRequiredCount}/{props.setup.totalRequiredCount} required checks ready
        </div>
        <div class="mt-1 text-[0.7rem] leading-6 text-(--muted)">
          Launch mode: {props.setup.launchMode}. Guided help stays local to this browser profile.
        </div>
      </section>

      <div class="grid gap-3 md:grid-cols-2">
        <For each={tutorialDefinitions}>
          {(tutorial) => {
            const status = () =>
              props.completedTutorialIds.includes(tutorial.id)
                ? "Completed"
                : props.dismissedTutorialIds.includes(tutorial.id)
                ? "Dismissed"
                : "Ready";

            return (
              <article class="rounded-[1.35rem] border border-(--border) bg-white/72 p-4 shadow-sm">
                <div class="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{status()}</div>
                <h3 class="mt-2 text-[1rem] font-semibold tracking-[-0.04em] text-(--foreground)">
                  {tutorial.title}
                </h3>
                <p class="mt-2 text-[0.72rem] leading-6 text-(--muted)">{tutorial.summary}</p>
                <div class="mt-4 flex items-center justify-between gap-3">
                  <span class="text-[0.62rem] uppercase tracking-[0.16em] text-(--muted)">
                    {tutorial.steps.length} steps
                  </span>
                  <ActionButton tooltip={`Start ${tutorial.title}`} type="button" onClick={() => props.onStartTutorial(tutorial.id)}>
                    Start tutorial
                  </ActionButton>
                </div>
              </article>
            );
          }}
        </For>
      </div>
    </Dialog>
  );
}

