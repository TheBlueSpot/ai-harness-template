import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Bot, Folder, FolderOpen, Globe, Split } from "lucide-solid";
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
import { DropdownControl } from "./primitives/dropdown";
import { getAgentDropdownIcon, getModeDropdownIcon } from "./primitives/dropdown-option-icons";
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
  const agentOptions = createMemo(() =>
    state.availableAgents.map((agent) => ({
      value: agent.id,
      label: agent.label,
      description: agent.description,
      icon: getAgentDropdownIcon(agent.id)
    }))
  );
  const scopeOptions = () => [
    { value: "project", label: "Current project", description: "Assistant stays scoped to one project.", icon: <Folder class="h-3 w-3" /> },
    { value: "global", label: "Global", description: "Assistant stays available across workspace.", icon: <Globe class="h-3 w-3" /> }
  ];
  const projectOptions = createMemo(() =>
    state.workspace.projects.map((project) => ({
      value: project.id,
      label: project.name,
      description: project.rootPath,
      icon: <FolderOpen class="h-3 w-3" />
    }))
  );
  const modeOptions = createMemo(() => [
    { value: "", label: "Default", description: "Use workspace or project default mode.", icon: <Split class="h-3 w-3" /> },
    ...availableModes().map((mode) => ({
      value: mode.id,
      label: mode.label,
      description: mode.description,
      icon: getModeDropdownIcon(mode.id)
    }))
  ]);

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
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant runtime"
            icon={<Bot class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={agentId()}
            options={agentOptions()}
            onChange={(value) => setAgentId(value as Assistant["agentId"])}
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Scope</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant scope"
            icon={<Globe class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={scope()}
            options={scopeOptions()}
            onChange={(value) => setScope(value as Assistant["scope"])}
          />
        </label>

        <Show when={scope() === "project"}>
          <label class="space-y-2">
            <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Project</span>
            <DropdownControl
              kind="select"
              ariaLabel="Select project"
              icon={<FolderOpen class="h-3.5 w-3.5" />}
              size="md"
              class="w-full"
              value={projectId() ?? ""}
              options={projectOptions()}
              onChange={(value) => setProjectId(value || undefined)}
            />
          </label>
        </Show>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Mode</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant mode"
            icon={<Split class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={modeId()}
            options={modeOptions()}
            onChange={setModeId}
          />
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
      resolutionStatus: "resolved",
      createdAt: new Date().toISOString()
    });
  }

  return { value } as const;
}

