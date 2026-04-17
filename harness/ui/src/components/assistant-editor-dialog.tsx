import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { resolveModeCatalog } from "../../../shared/modes";
import {
  createAssistantAssetRefId,
  createAssistantId,
  createRequestId,
  type Assistant,
  type AssistantAssetRef,
} from "../../../shared/protocol";
import { type AssistantEditorDraft, harnessStore } from "../harness-store";
import { pushToast } from "../toast-store";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";

const assistantAssetKinds = ["skill", "script", "mode", "background-template"] as const;

export function AssistantEditorDialog() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [name, setName] = createSignal("");
  const [scope, setScope] = createSignal<Assistant["scope"]>("project");
  const [projectId, setProjectId] = createSignal<string>();
  const [description, setDescription] = createSignal("");
  const [personalityPrompt, setPersonalityPrompt] = createSignal("");
  const [jobPrompt, setJobPrompt] = createSignal("");
  const [agentId, setAgentId] = createSignal<Assistant["agentId"]>("pi");
  const [modeId, setModeId] = createSignal("");
  const [executionModelId, setExecutionModelId] = createSignal("");
  const [assetRefsText, setAssetRefsText] = createSignal("");

  const activeDraft = () => state.assistantEditorDraft;
  const availableModes = createMemo(() =>
    resolveModeCatalog(
      state.workspace.workspaceModes,
      state.workspace.projects.find((project) => project.id === projectId())?.projectModes ?? []
    )
  );

  createEffect(() => {
    const draft = activeDraft();
    if (!state.assistantEditorOpen || !draft) {
      return;
    }

    seedFromDraft(draft);
  });

  function seedFromDraft(draft: AssistantEditorDraft) {
    setName(draft.name);
    setScope(draft.scope);
    setProjectId(draft.projectId ?? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id);
    setDescription(draft.description);
    setPersonalityPrompt(draft.personalityPrompt);
    setJobPrompt(draft.jobPrompt);
    setAgentId(draft.agentId);
    setModeId(draft.modeId ?? "");
    setExecutionModelId(draft.executionModelId ?? "");
    setAssetRefsText(draft.assetRefsText);
  }

  function handleClose() {
    harnessStore.closeAssistantEditor();
  }

  function handleSave() {
    const draft = activeDraft();
    if (!draft) {
      return;
    }

    const trimmedName = name().trim();
    if (!trimmedName) {
      pushToast("Assistant name required", "Give assistant short visible name.", "error");
      return;
    }

    if (!personalityPrompt().trim() || !jobPrompt().trim()) {
      pushToast("Assistant prompts required", "Fill personality and job prompts before saving.", "error");
      return;
    }

    if (scope() === "project" && !projectId()) {
      pushToast("Project required", "Project-scoped assistant needs target project.", "error");
      return;
    }

    const assistantId = draft.assistantId ?? createAssistantId();
    const now = new Date().toISOString();
    const parsedAssetRefs = parseAssetRefs(assetRefsText(), assistantId);
    if ("error" in parsedAssetRefs) {
      pushToast("Asset refs invalid", parsedAssetRefs.error, "error");
      return;
    }

    const existingAssistant = state.assistants.assistants.find((entry) => entry.id === assistantId);
    const assistant: Assistant = {
      id: assistantId,
      name: trimmedName,
      scope: scope(),
      projectId: scope() === "project" ? projectId() : undefined,
      description: description().trim() || undefined,
      personalityPrompt: personalityPrompt().trim(),
      jobPrompt: jobPrompt().trim(),
      agentId: agentId(),
      modeId: modeId().trim() || undefined,
      executionModelId: executionModelId().trim() || undefined,
      runState: existingAssistant?.runState ?? draft.runState,
      bootstrapState: existingAssistant?.bootstrapState ?? draft.bootstrapState,
      clonedFromAssistantId: existingAssistant?.clonedFromAssistantId,
      failureStreakCount: existingAssistant?.failureStreakCount ?? 0,
      circuitBreakerState: existingAssistant?.circuitBreakerState ?? "closed",
      circuitBreakerReason: existingAssistant?.circuitBreakerReason,
      deletedAt: undefined,
      latestActivityAt: existingAssistant?.latestActivityAt ?? now,
      unreadQuestionCount: existingAssistant?.unreadQuestionCount ?? 0,
      createdAt: existingAssistant?.createdAt ?? now,
      updatedAt: now
    };

    sendCommand({
      type: draft.source === "edit" ? "assistant.update" : "assistant.create",
      requestId: createRequestId(),
      payload: {
        assistant,
        assetRefs: parsedAssetRefs.value
      }
    });
    handleClose();
  }

  return (
    <Dialog
      open={state.assistantEditorOpen}
      onClose={handleClose}
      title={activeDraft()?.source === "edit" ? "Edit assistant" : "Create assistant"}
      eyebrow="Assistants"
      description="Define role, prompts, scope, and linked skills/scripts."
      class="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{activeDraft()?.source === "edit" ? "Save assistant" : "Create assistant"}</Button>
        </>
      }
    >
      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Name</span>
          <Input value={name()} onInput={(event) => setName(event.currentTarget.value)} placeholder="Mr Miyagi" />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Agent runtime</span>
          <select
            class="flex h-9 w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-[0.675rem] text-(--foreground) shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
            value={agentId()}
            onInput={(event) => setAgentId(event.currentTarget.value as Assistant["agentId"])}
          >
            <For each={state.availableAgents}>{(agent) => <option value={agent.id}>{agent.label}</option>}</For>
          </select>
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Scope</span>
          <select
            class="flex h-9 w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-[0.675rem] text-(--foreground) shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
            value={scope()}
            onInput={(event) => setScope(event.currentTarget.value as Assistant["scope"])}
          >
            <option value="project">Current project</option>
            <option value="global">Global</option>
          </select>
        </label>

        <Show when={scope() === "project"}>
          <label class="space-y-2">
            <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Project</span>
            <select
              class="flex h-9 w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-[0.675rem] text-(--foreground) shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
              value={projectId() ?? ""}
              onInput={(event) => setProjectId(event.currentTarget.value || undefined)}
            >
              <For each={state.workspace.projects}>{(project) => <option value={project.id}>{project.name}</option>}</For>
            </select>
          </label>
        </Show>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Mode</span>
          <select
            class="flex h-9 w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-[0.675rem] text-(--foreground) shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring)"
            value={modeId()}
            onInput={(event) => setModeId(event.currentTarget.value)}
          >
            <option value="">Default</option>
            <For each={availableModes()}>{(mode) => <option value={mode.id}>{mode.label}</option>}</For>
          </select>
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution model</span>
          <Input value={executionModelId()} onInput={(event) => setExecutionModelId(event.currentTarget.value)} placeholder="openai/gpt-5.4" />
        </label>
      </div>

      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Description</span>
        <Textarea rows="2" value={description()} onInput={(event) => setDescription(event.currentTarget.value)} placeholder="Short purpose summary." />
      </label>

      <div class="grid gap-3 lg:grid-cols-2">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Personality prompt</span>
          <Textarea
            rows="10"
            value={personalityPrompt()}
            onInput={(event) => setPersonalityPrompt(event.currentTarget.value)}
            placeholder="Voice, temperament, communication style."
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Job prompt</span>
          <Textarea
            rows="10"
            value={jobPrompt()}
            onInput={(event) => setJobPrompt(event.currentTarget.value)}
            placeholder="Role, success criteria, research mandate, proactive work rules."
          />
        </label>
      </div>

      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Asset refs</span>
        <Textarea
          rows="5"
          value={assetRefsText()}
          onInput={(event) => setAssetRefsText(event.currentTarget.value)}
          placeholder={"skill | grill-me | .agents/skills/grill-me/SKILL.md\nscript | bootstrap | scripts/bootstrap.ts"}
        />
      </label>
      <div class="rounded-2xl border border-(--border) bg-white/55 p-3 text-[0.675rem] leading-5 text-(--muted)">
        One ref per line. Format: <code>kind | label | value</code>. Kinds: {assistantAssetKinds.join(", ")}.
      </div>
    </Dialog>
  );
}

function parseAssetRefs(input: string, assistantId: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const value: AssistantAssetRef[] = [];
  for (const [index, line] of lines.entries()) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3) {
      return { error: `Line ${index + 1} must use: kind | label | value` } as const;
    }

    const [kind, label, refValue] = parts;
    if (!assistantAssetKinds.includes(kind as (typeof assistantAssetKinds)[number])) {
      return { error: `Line ${index + 1} has invalid kind: ${kind}` } as const;
    }
    if (!label || !refValue) {
      return { error: `Line ${index + 1} must include non-empty label and value` } as const;
    }

    value.push({
      id: createAssistantAssetRefId(),
      assistantId,
      kind: kind as (typeof assistantAssetKinds)[number],
      label,
      value: refValue,
      createdAt: new Date().toISOString()
    });
  }

  return { value } as const;
}

