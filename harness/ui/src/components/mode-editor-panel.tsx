import { For, createEffect, createSignal } from "solid-js";
import { ClipboardList, FolderOpen, Play, RefreshCcw } from "lucide-solid";
import type { ModeDefinition } from "../../../shared/protocol";
import { ActionButton } from "./action-button";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";

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
  | "executionAccess"
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
  executionAccess: "workspace-write",
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
      executionAccess: selected.executionAccess,
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
  const toolPolicyOptions = () => [
    { value: "full-access", label: "Full access", description: "Allow full implementation and broader tool use." },
    { value: "read-heavy", label: "Read heavy", description: "Bias toward reading, analysis, and lighter changes." },
    { value: "review-only", label: "Review only", description: "Focus on findings and review instead of edits." }
  ];
  const executionAccessOptions = () => [
    { value: "workspace-write", label: "Workspace write", description: "Mode may edit files in current workspace." },
    { value: "read-only", label: "Read only", description: "Mode may inspect but should avoid editing files." }
  ];
  const planGateOptions = () => [
    { value: "countdown", label: "Countdown", description: "Pause briefly before execution begins." },
    { value: "approve", label: "Approve first", description: "Require explicit approval before execution begins." },
    { value: "immediate", label: "Immediate", description: "Start execution immediately after planning." }
  ];
  const correctnessOptions = () => [
    { value: "ask-before-iterate", label: "Ask before iterate", description: "Pause before any automatic follow-up pass." },
    { value: "auto-once", label: "Auto once", description: "Run one automatic correctness follow-up pass." },
    { value: "auto-until-clean", label: "Auto until clean", description: "Keep iterating until correctness issues clear." }
  ];

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
    <section class="rounded-[1.25rem] border border-(--border) bg-white/55 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
          <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">
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
                  ? "border-(--accent) bg-(--accent) text-white"
                  : "border-(--border) bg-white/70 text-(--foreground)"
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
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Mode id</span>
          <Input value={draft().id} onInput={(event) => updateDraft("id", event.currentTarget.value)} />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Label</span>
          <Input value={draft().label} onInput={(event) => updateDraft("label", event.currentTarget.value)} />
        </label>
      </div>

      <label class="mt-3 block space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Description</span>
        <Input value={draft().description} onInput={(event) => updateDraft("description", event.currentTarget.value)} />
      </label>

      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Planner prompt</span>
          <Textarea rows="5" value={draft().plannerPrompt} onInput={(event) => updateDraft("plannerPrompt", event.currentTarget.value)} />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution prompt</span>
          <Textarea rows="5" value={draft().executionPrompt} onInput={(event) => updateDraft("executionPrompt", event.currentTarget.value)} />
        </label>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-4">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Tool policy</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select tool policy"
            icon={<ClipboardList class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={draft().toolPolicy}
            options={toolPolicyOptions()}
            onChange={(value) => updateDraft("toolPolicy", value as ModeDraft["toolPolicy"])}
          />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution access</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select execution access"
            icon={<FolderOpen class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={draft().executionAccess}
            options={executionAccessOptions()}
            onChange={(value) => updateDraft("executionAccess", value as ModeDraft["executionAccess"])}
          />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Plan gate</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select mode plan gate"
            icon={<Play class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={draft().planExecutionModeDefault ?? "countdown"}
            options={planGateOptions()}
            onChange={(value) => updateDraft("planExecutionModeDefault", value as ModeDraft["planExecutionModeDefault"])}
          />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Correctness</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select correctness iteration"
            icon={<RefreshCcw class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={draft().correctnessIterationModeDefault ?? "ask-before-iterate"}
            options={correctnessOptions()}
            onChange={(value) =>
              updateDraft("correctnessIterationModeDefault", value as ModeDraft["correctnessIterationModeDefault"])
            }
          />
        </label>
      </div>
    </section>
  );
}

