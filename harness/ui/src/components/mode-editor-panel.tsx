import { For, createEffect, createSignal } from "solid-js";
import type { ModeDefinition } from "../../../shared/protocol";
import { ActionButton } from "./action-button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

type ModeEditorPanelProps = {
  title: string;
  scope: "workspace" | "project";
  modes: ModeDefinition[];
  onSave: (mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }) => void;
  onDelete: (modeId: string) => void;
};

type ModeDraft = Pick<
  ModeDefinition,
  | "id"
  | "label"
  | "description"
  | "plannerPrompt"
  | "executionPrompt"
  | "toolPolicy"
  | "planExecutionModeDefault"
  | "subagentWorktreeStrategyDefault"
  | "correctnessIterationModeDefault"
>;

const EMPTY_MODE_DRAFT: ModeDraft = {
  id: "",
  label: "",
  description: "",
  plannerPrompt: "",
  executionPrompt: "",
  toolPolicy: "full-access",
  planExecutionModeDefault: "countdown",
  subagentWorktreeStrategyDefault: "same-worktree",
  correctnessIterationModeDefault: "ask-before-iterate"
};

export function ModeEditorPanel(props: ModeEditorPanelProps) {
  const [selectedModeId, setSelectedModeId] = createSignal<string>();
  const [draft, setDraft] = createSignal<ModeDraft>(EMPTY_MODE_DRAFT);

  createEffect(() => {
    const modes = props.modes;
    const selected = modes.find((mode) => mode.id === selectedModeId()) ?? modes[0];
    if (!selected) {
      setDraft(EMPTY_MODE_DRAFT);
      setSelectedModeId(undefined);
      return;
    }

    setSelectedModeId(selected.id);
    setDraft({
      id: selected.id,
      label: selected.label,
      description: selected.description,
      plannerPrompt: selected.plannerPrompt,
      executionPrompt: selected.executionPrompt,
      toolPolicy: selected.toolPolicy,
      planExecutionModeDefault: selected.planExecutionModeDefault ?? "countdown",
      subagentWorktreeStrategyDefault: selected.subagentWorktreeStrategyDefault ?? "same-worktree",
      correctnessIterationModeDefault: selected.correctnessIterationModeDefault ?? "ask-before-iterate"
    });
  });

  const updateDraft = <K extends keyof ModeDraft>(key: K, value: ModeDraft[K]) => {
    setDraft({
      ...draft(),
      [key]: value
    });
  };

  const customModes = () => props.modes.filter((mode): mode is ModeDefinition & { scope: "workspace" | "project" } => mode.scope === props.scope);

  const handleNewMode = () => {
    const slugBase = props.scope === "workspace" ? "workspace-mode" : "project-mode";
    const nextId = `${slugBase}-${Date.now().toString(36)}`;
    setSelectedModeId(undefined);
    setDraft({
      ...EMPTY_MODE_DRAFT,
      id: nextId
    });
  };

  const handleSave = () => {
    const next = draft();
    if (!next.id.trim() || !next.label.trim() || !next.description.trim() || !next.plannerPrompt.trim() || !next.executionPrompt.trim()) {
      return;
    }

    props.onSave({
      ...next,
      id: next.id.trim(),
      label: next.label.trim(),
      description: next.description.trim(),
      plannerPrompt: next.plannerPrompt.trim(),
      executionPrompt: next.executionPrompt.trim(),
      scope: props.scope,
      updatedAt: new Date().toISOString()
    });
    setSelectedModeId(next.id.trim());
  };

  const handleDelete = () => {
    const modeId = selectedModeId() ?? draft().id.trim();
    if (!modeId) {
      return;
    }

    props.onDelete(modeId);
    setSelectedModeId(undefined);
    setDraft(EMPTY_MODE_DRAFT);
  };

  return (
    <section class="rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">{props.title}</div>
          <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">
            Custom modes override built-ins inside {props.scope} scope.
          </div>
        </div>
        <div class="flex gap-2">
          <ActionButton tooltip={`Create new ${props.scope} mode`} variant="secondary" size="sm" onClick={handleNewMode}>
            New mode
          </ActionButton>
          <ActionButton
            tooltip={`Delete selected ${props.scope} mode`}
            disabled={!selectedModeId()}
            disabledReason={`Select ${props.scope} mode first`}
            variant="secondary"
            size="sm"
            onClick={handleDelete}
          >
            Delete
          </ActionButton>
          <ActionButton tooltip={`Save ${props.scope} mode`} size="sm" onClick={handleSave}>
            Save mode
          </ActionButton>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <For each={customModes()}>
          {(mode) => (
            <button
              class={`rounded-full border px-3 py-1 text-[0.625rem] font-semibold transition ${
                selectedModeId() === mode.id
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                  : "border-[color:var(--border)] bg-white/70 text-[color:var(--foreground)]"
              }`}
              type="button"
              onClick={() => setSelectedModeId(mode.id)}
            >
              {mode.label}
            </button>
          )}
        </For>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Mode id</span>
          <Input value={draft().id} onInput={(event) => updateDraft("id", event.currentTarget.value)} />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Label</span>
          <Input value={draft().label} onInput={(event) => updateDraft("label", event.currentTarget.value)} />
        </label>
      </div>

      <label class="mt-3 block space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Description</span>
        <Input value={draft().description} onInput={(event) => updateDraft("description", event.currentTarget.value)} />
      </label>

      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Planner prompt</span>
          <Textarea rows="5" value={draft().plannerPrompt} onInput={(event) => updateDraft("plannerPrompt", event.currentTarget.value)} />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Execution prompt</span>
          <Textarea rows="5" value={draft().executionPrompt} onInput={(event) => updateDraft("executionPrompt", event.currentTarget.value)} />
        </label>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Tool policy</span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={draft().toolPolicy}
            onInput={(event) => updateDraft("toolPolicy", event.currentTarget.value as ModeDraft["toolPolicy"])}
          >
            <option value="full-access">Full access</option>
            <option value="read-heavy">Read heavy</option>
            <option value="review-only">Review only</option>
          </select>
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Plan gate</span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={draft().planExecutionModeDefault}
            onInput={(event) => updateDraft("planExecutionModeDefault", event.currentTarget.value as ModeDraft["planExecutionModeDefault"])}
          >
            <option value="countdown">Countdown</option>
            <option value="approve">Approve first</option>
            <option value="immediate">Immediate</option>
          </select>
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Correctness</span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={draft().correctnessIterationModeDefault}
            onInput={(event) =>
              updateDraft("correctnessIterationModeDefault", event.currentTarget.value as ModeDraft["correctnessIterationModeDefault"])
            }
          >
            <option value="ask-before-iterate">Ask before iterate</option>
            <option value="auto-once">Auto once</option>
            <option value="auto-until-clean">Auto until clean</option>
          </select>
        </label>
      </div>
    </section>
  );
}
