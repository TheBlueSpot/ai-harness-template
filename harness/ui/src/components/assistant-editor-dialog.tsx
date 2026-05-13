import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Bot, Brain, Cpu, Folder, FolderOpen, Gauge, Globe, Split } from "lucide-solid";
import { resolveModeCatalog } from "../../../shared/modes";
import {
  createAssistantAssetRefId,
  createAssistantId,
  createRequestId,
  type Assistant,
  type AssistantAssetRef,
  type ComposerReasoningStrength,
  type ProviderBrand
} from "../../../shared/protocol";
import {
  COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  type AssistantEditorDraft,
  harnessStore
} from "../harness-store";
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
  const [providerBrand, setProviderBrand] = createSignal<ProviderBrand>("gpt");
  const [modeId, setModeId] = createSignal("");
  const [executionModelId, setExecutionModelId] = createSignal("");
  const [reasoningStrength, setReasoningStrength] = createSignal<ComposerReasoningStrength>(DEFAULT_COMPOSER_REASONING_STRENGTH);
  const [fastMode, setFastMode] = createSignal(false);
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
  const providerOptions = () => [
    { value: "gpt", label: "GPT", description: "OpenAI-hosted model family.", icon: <Cpu class="h-3 w-3" /> },
    { value: "gemini", label: "Gemini", description: "Google-hosted model family.", icon: <Cpu class="h-3 w-3" /> },
    { value: "claude", label: "Claude", description: "Anthropic-hosted model family.", icon: <Cpu class="h-3 w-3" /> }
  ];
  const modeOptions = createMemo(() => [
    { value: "", label: "Default", description: "Use workspace or project default mode.", icon: <Split class="h-3 w-3" /> },
    ...availableModes().map((mode) => ({
      value: mode.id,
      label: mode.label,
      description: mode.description,
      icon: getModeDropdownIcon(mode.id)
    }))
  ]);
  const executionModelOptions = createMemo(() => {
    const options = getExecutionModelOptionsForAgent(state, agentId(), providerBrand());
    const currentModel = executionModelId().trim();
    const knownOptions = options.map((model) => ({
      value: model.modelId,
      label: model.label,
      description: model.modelId,
      icon: <Cpu class="h-3 w-3" />
    }));
    return [
      { value: "", label: "Default", description: "Use runtime default model.", icon: <Cpu class="h-3 w-3" /> },
      ...(currentModel && !knownOptions.some((option) => option.value === currentModel)
        ? [{ value: currentModel, label: currentModel, description: "Saved custom model.", icon: <Cpu class="h-3 w-3" /> }]
        : []),
      ...knownOptions
    ];
  });
  const composerControlState = createMemo(() =>
    getComposerControlState(state, agentId(), executionModelId().trim() || undefined)
  );
  const reasoningOptions = createMemo(() =>
    COMPOSER_REASONING_STRENGTHS.map((strength) => ({
      value: strength,
      label: formatReasoningOptionLabel(strength),
      description: getReasoningStrengthDescription(strength),
      disabled: !composerControlState().availableStrengths.includes(strength),
      icon: <Brain class="h-3 w-3" />
    }))
  );
  const fastModeOptions = createMemo(() => [
    { value: "false", label: "Off", description: "Use standard response path.", icon: <Gauge class="h-3 w-3" /> },
    {
      value: "true",
      label: "On",
      description: "Prefer lower-latency responses when supported.",
      disabled: !composerControlState().supportsFastMode,
      icon: <Gauge class="h-3 w-3" />
    }
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
    setProviderBrand(draft.providerBrand ?? state.providerBrand);
    setModeId(draft.modeId ?? "");
    setExecutionModelId(draft.executionModelId ?? "");
    setReasoningStrength(draft.reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH);
    setFastMode(Boolean(draft.fastMode));
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
      providerBrand: providerBrand(),
      modeId: modeId().trim() || undefined,
      executionModelId: executionModelId().trim() || undefined,
      reasoningStrength: reasoningStrength(),
      fastMode: fastMode(),
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
          <Button tooltip="Close assistant editor without saving" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button tooltip={activeDraft()?.source === "edit" ? "Save assistant changes" : "Create assistant"} onClick={handleSave}>{activeDraft()?.source === "edit" ? "Save assistant" : "Create assistant"}</Button>
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
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Provider</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant provider"
            icon={<Cpu class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={providerBrand()}
            options={providerOptions()}
            onChange={(value) => setProviderBrand(value as ProviderBrand)}
          />
        </label>

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
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant execution model"
            icon={<Cpu class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={executionModelId()}
            options={executionModelOptions()}
            onChange={setExecutionModelId}
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Effort</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant reasoning effort"
            icon={<Brain class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={reasoningStrength()}
            options={reasoningOptions()}
            onChange={(value) => setReasoningStrength(value as ComposerReasoningStrength)}
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Fast mode</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant fast mode"
            icon={<Gauge class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={fastMode() ? "true" : "false"}
            options={fastModeOptions()}
            onChange={(value) => setFastMode(value === "true")}
          />
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

function getReasoningStrengthDescription(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "low":
      return "Fastest pass with minimal internal deliberation.";
    case "medium":
      return "Balanced depth for routine implementation and review.";
    case "high":
      return "Default stronger reasoning for most coding work.";
    case "extra-high":
      return "Heaviest reasoning budget for hard debugging and planning.";
  }
}

function formatReasoningStrengthLabel(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "extra-high":
      return "Extra High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "high":
    default:
      return "High";
  }
}

function formatReasoningOptionLabel(strength: ComposerReasoningStrength) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === DEFAULT_COMPOSER_REASONING_STRENGTH ? `${label} (default)` : label;
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

