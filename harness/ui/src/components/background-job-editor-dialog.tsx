import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Bot, ClipboardList, FolderOpen, Play, Split } from "lucide-solid";
import { resolveModeCatalog } from "../../../shared/modes";
import {
  createBackgroundJobId,
  createRequestId,
  createThreadId,
  type BackgroundJob,
  type BackgroundJobSchedule
} from "../../../shared/protocol";
import { type BackgroundJobEditorDraft, harnessStore } from "../harness-store";
import { pushToast } from "../toast-store";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { DropdownControl } from "./primitives/dropdown";
import { getModeDropdownIcon } from "./primitives/dropdown-option-icons";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";

export function BackgroundJobEditorDialog() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [projectId, setProjectId] = createSignal<string>();
  const [templateId, setTemplateId] = createSignal("");
  const [kind, setKind] = createSignal<BackgroundJob["kind"]>("ai-routine");
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [scheduleInput, setScheduleInput] = createSignal("");
  const [timezone, setTimezone] = createSignal(resolveBrowserTimezone());
  const [aiPrompt, setAiPrompt] = createSignal("");
  const [aiModeId, setAiModeId] = createSignal("");
  const [aiExecutionModelId, setAiExecutionModelId] = createSignal("");
  const [aiPlanExecutionMode, setAiPlanExecutionMode] = createSignal<"countdown" | "approve" | "immediate">("countdown");
  const [aiSubagentWorktreeStrategy, setAiSubagentWorktreeStrategy] = createSignal<"same-worktree" | "separate-worktrees">(
    "same-worktree"
  );
  const [shellExecutable, setShellExecutable] = createSignal("");
  const [shellArgsText, setShellArgsText] = createSignal("");
  const [shellCwd, setShellCwd] = createSignal("");
  const [shellEnvRefsText, setShellEnvRefsText] = createSignal("");
  const [shellTimeoutSeconds, setShellTimeoutSeconds] = createSignal(600);
  const [shellNetworkAccess, setShellNetworkAccess] = createSignal(false);
  const [previewRequestId, setPreviewRequestId] = createSignal<string>();

  const activeDraft = () => state.backgroundJobEditorDraft;
  const selectedTemplate = () => state.backgroundJobs.templates.find((template) => template.id === templateId());
  const schedulePreview = () => {
    const previewState = state.backgroundJobSchedulePreview;
    return previewState && previewState.requestId === previewRequestId() ? previewState.preview : undefined;
  };
  const availableModes = createMemo(() =>
    resolveModeCatalog(
      state.workspace.workspaceModes,
      state.workspace.projects.find((project) => project.id === projectId())?.projectModes ?? []
    )
  );
  const projectOptions = createMemo(() =>
    state.workspace.projects.map((project) => ({
      value: project.id,
      label: project.name,
      description: project.rootPath,
      icon: <FolderOpen class="h-3 w-3" />
    }))
  );
  const templateOptions = createMemo(() => [
    { value: "", label: "Custom", description: "Start from blank scheduled task definition.", icon: <ClipboardList class="h-3 w-3" /> },
    ...state.backgroundJobs.templates.map((template) => ({
      value: template.id,
      label: template.label,
      description: template.description,
      icon: <ClipboardList class="h-3 w-3" />
    }))
  ]);
  const kindOptions = () => [
    { value: "ai-routine", label: "AI routine", description: "Prompt-driven autonomous background task.", icon: <Bot class="h-3 w-3" /> },
    { value: "shell", label: "Shell", description: "Typed executable plus args/env background task.", icon: <ClipboardList class="h-3 w-3" /> }
  ];
  const modeOptions = createMemo(() => [
    { value: "", label: "Project default", description: "Use project-selected mode when job runs.", icon: <Split class="h-3 w-3" /> },
    ...availableModes().map((mode) => ({
      value: mode.id,
      label: mode.label,
      description: mode.description,
      icon: getModeDropdownIcon(mode.id)
    }))
  ]);
  const planGateOptions = () => [
    { value: "countdown", label: "Countdown", description: "Pause briefly before execution starts." },
    { value: "approve", label: "Approve", description: "Require explicit approval before execution starts." },
    { value: "immediate", label: "Immediate", description: "Start execution immediately after planning." }
  ];
  const worktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Run subagents in current working tree." },
    {
      value: "separate-worktrees",
      label: "Isolated mounts (BranchFS)",
      description: "Run subagents inside isolated BranchFS mounts."
    }
  ];

  createEffect(() => {
    const draft = activeDraft();
    if (!state.backgroundJobEditorOpen || !draft) {
      return;
    }

    seedFromDraft(draft);
    harnessStore.clearBackgroundJobSchedulePreview();
  });

  createEffect(() => {
    if (!state.backgroundJobEditorOpen) {
      return;
    }

    const input = scheduleInput().trim();
    if (!input) {
      harnessStore.clearBackgroundJobSchedulePreview();
      return;
    }

    const requestId = createRequestId();
    setPreviewRequestId(requestId);
    const timeoutId = window.setTimeout(() => {
      sendCommand({
        type: "background-job.schedule.preview",
        requestId,
        payload: {
          input,
          timezone: timezone().trim() || undefined
        }
      });
    }, 250);

    onCleanup(() => window.clearTimeout(timeoutId));
  });

  function seedFromDraft(draft: BackgroundJobEditorDraft) {
    setProjectId(draft.projectId ?? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id);
    setTemplateId(draft.templateId ?? (draft.source === "create" && draft.kind === "ai-routine" ? "scheduled-task" : ""));
    setKind(draft.kind);
    setName(draft.name);
    setDescription(draft.description);
    setScheduleInput(draft.scheduleInput);
    setTimezone(draft.timezone || resolveBrowserTimezone());
    setAiPrompt(draft.aiPrompt);
    setAiModeId(draft.aiModeId ?? "");
    setAiExecutionModelId(draft.aiExecutionModelId ?? "");
    setAiPlanExecutionMode(draft.aiPlanExecutionMode ?? state.planExecutionModeDefault);
    setAiSubagentWorktreeStrategy(draft.aiSubagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault);
    setShellExecutable(draft.shellExecutable);
    setShellArgsText(draft.shellArgsText);
    setShellCwd(draft.shellCwd);
    setShellEnvRefsText(draft.shellEnvRefsText);
    setShellTimeoutSeconds(draft.shellTimeoutSeconds);
    setShellNetworkAccess(draft.shellNetworkAccess);
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const template = state.backgroundJobs.templates.find((entry) => entry.id === nextTemplateId);
    if (!template) {
      return;
    }

    setKind(template.kind);
    if (template.definition.kind === "ai-routine") {
      setAiPrompt(template.definition.prompt);
      setAiModeId(template.definition.modeId ?? "");
      setAiExecutionModelId(template.definition.executionModelId ?? "");
      setAiPlanExecutionMode(template.definition.planExecutionMode ?? state.planExecutionModeDefault);
      setAiSubagentWorktreeStrategy(template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault);
      return;
    }

    setShellExecutable(template.definition.executable);
    setShellArgsText(template.definition.args.join("\n"));
    setShellCwd(template.definition.cwd ?? "");
    setShellEnvRefsText((template.definition.envRefs ?? []).join("\n"));
    setShellTimeoutSeconds(template.definition.timeoutSeconds);
    setShellNetworkAccess(Boolean(template.definition.networkAccess));
  }

  function handleClose() {
    harnessStore.closeBackgroundJobEditor();
  }

  function handleSave() {
    const draft = activeDraft();
    const resolvedProjectId = projectId();
    const preview = schedulePreview();
    if (!draft || !resolvedProjectId) {
      pushToast("Project required", "Select target project before saving.", "error");
      return;
    }

    if (!preview?.schedule || preview.error) {
      pushToast("Schedule invalid", preview?.error ?? "Enter valid schedule before saving.", "error");
      return;
    }

    const trimmedName = name().trim();
    if (!trimmedName) {
      pushToast("Name required", "Background job needs short name.", "error");
      return;
    }

    const definition =
      kind() === "ai-routine"
        ? {
            kind: "ai-routine" as const,
            prompt: aiPrompt().trim(),
            modeId: aiModeId().trim() || undefined,
            executionModelId: aiExecutionModelId().trim() || undefined,
            planExecutionMode: aiPlanExecutionMode(),
            subagentWorktreeStrategy: aiSubagentWorktreeStrategy()
          }
        : {
            kind: "shell" as const,
            executable: shellExecutable().trim(),
            args: splitMultilineInput(shellArgsText()) ?? [],
            cwd: shellCwd().trim() || undefined,
            envRefs: splitMultilineInput(shellEnvRefsText()),
            timeoutSeconds: Math.max(1, Math.min(24 * 60 * 60, Math.round(shellTimeoutSeconds()))),
            networkAccess: shellNetworkAccess()
          };

    if (definition.kind === "ai-routine" && !definition.prompt) {
      pushToast("Prompt required", "AI routine needs self-contained prompt.", "error");
      return;
    }

    if (definition.kind === "shell" && !definition.executable) {
      pushToast("Executable required", "Shell job needs executable.", "error");
      return;
    }

    const now = new Date().toISOString();
    sendCommand({
      type: "background-job.save",
      requestId: createRequestId(),
      payload: {
        job: {
          id: draft.jobId ?? createBackgroundJobId(),
          projectId: resolvedProjectId,
          assistantId: draft.assistantId,
          automationThreadId: draft.automationThreadId ?? createThreadId(),
          templateId: selectedTemplate()?.id ?? draft.templateId ?? undefined,
          createdFromRunId: draft.createdFromRunId,
          kind: definition.kind,
          name: trimmedName,
          description: description().trim() || undefined,
          status: draft.status ?? "enabled",
          riskLevel: "unsafe",
          definition,
          schedule: preview.schedule,
          scheduleInput: scheduleInput().trim(),
          timezone: timezone().trim() || undefined,
          nextRunAt: preview.schedule.type === "one-off" ? preview.schedule.runAt : preview.schedule.nextRunAt,
          lastRunAt: draft.lastRunAt,
          lastEnqueuedAt: draft.lastEnqueuedAt,
          createdAt: draft.createdAt ?? now,
          updatedAt: now
        }
      }
    });
    handleClose();
  }

  return (
    <Dialog
      open={state.backgroundJobEditorOpen}
      onClose={handleClose}
      title={activeDraft()?.source === "edit" ? "Edit scheduled task" : "Scheduled task"}
      eyebrow="Background jobs"
      description="Save self-contained AI routines or typed shell jobs."
      class="max-w-3xl"
      contentClass="max-h-[80vh] overflow-auto"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save task</Button>
        </>
      }
    >
      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Project</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select background job project"
            icon={<FolderOpen class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={projectId() ?? ""}
            options={projectOptions()}
            onChange={(value) => setProjectId(value || undefined)}
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Template</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select background job template"
            icon={<ClipboardList class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={templateId()}
            options={templateOptions()}
            onChange={applyTemplate}
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Kind</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select background job kind"
            icon={<Bot class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={kind()}
            options={kindOptions()}
            onChange={(value) => setKind(value as BackgroundJob["kind"])}
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Name</span>
          <Input value={name()} onInput={(event) => setName(event.currentTarget.value)} placeholder="Nightly repo review" />
        </label>
      </div>

      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Description</span>
        <Textarea rows="2" value={description()} onInput={(event) => setDescription(event.currentTarget.value)} placeholder="Optional inbox summary." />
      </label>

      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Schedule</span>
          <Input value={scheduleInput()} onInput={(event) => setScheduleInput(event.currentTarget.value)} placeholder="week | 3h | 2026-04-17 09:00 | */15 * * * *" />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Timezone</span>
          <Input value={timezone()} onInput={(event) => setTimezone(event.currentTarget.value)} placeholder="America/New_York" />
        </label>
      </div>

      <div class={`rounded-2xl border p-3 text-[0.675rem] leading-5 ${schedulePreview()?.error ? "border-rose-300 bg-rose-50/80 text-rose-900" : "border-(--border) bg-white/55 text-(--muted)"}`}>
        <Show when={schedulePreview()} fallback={<span>Schedule preview waits for valid input.</span>}>
          {(preview) => (
            <Show when={!preview().error} fallback={<span>{preview().error}</span>}>
              <span>{describeSchedulePreview(preview().schedule)}</span>
            </Show>
          )}
        </Show>
      </div>

      <Show when={kind() === "ai-routine"} fallback={<ShellJobFields
        executable={shellExecutable()}
        argsText={shellArgsText()}
        cwd={shellCwd()}
        envRefsText={shellEnvRefsText()}
        timeoutSeconds={shellTimeoutSeconds()}
        networkAccess={shellNetworkAccess()}
        onExecutableInput={setShellExecutable}
        onArgsInput={setShellArgsText}
        onCwdInput={setShellCwd}
        onEnvRefsInput={setShellEnvRefsText}
        onTimeoutInput={(value) => setShellTimeoutSeconds(Math.max(1, Number(value) || 1))}
        onNetworkAccessInput={setShellNetworkAccess}
      />}>
        <div class="grid gap-3">
          <label class="space-y-2">
            <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Prompt</span>
            <Textarea rows="8" value={aiPrompt()} onInput={(event) => setAiPrompt(event.currentTarget.value)} placeholder="Inspect repo, propose fix, implement, verify, summarize." />
          </label>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="space-y-2">
              <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Mode</span>
              <DropdownControl
                kind="select"
                ariaLabel="Select background job mode"
                icon={<Split class="h-3.5 w-3.5" />}
                size="md"
                class="w-full"
                value={aiModeId()}
                options={modeOptions()}
                onChange={setAiModeId}
              />
            </label>

            <label class="space-y-2">
              <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Execution model</span>
              <Input value={aiExecutionModelId()} onInput={(event) => setAiExecutionModelId(event.currentTarget.value)} placeholder="openai/gpt-5.4" />
            </label>

            <label class="space-y-2">
              <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Plan gate</span>
              <DropdownControl
                kind="select"
                ariaLabel="Select background job plan gate"
                icon={<Play class="h-3.5 w-3.5" />}
                size="md"
                class="w-full"
                value={aiPlanExecutionMode()}
                options={planGateOptions()}
                onChange={(value) => setAiPlanExecutionMode(value as "countdown" | "approve" | "immediate")}
              />
            </label>

            <label class="space-y-2">
              <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Worktree</span>
              <DropdownControl
                kind="select"
                ariaLabel="Select background job worktree strategy"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                class="w-full"
                value={aiSubagentWorktreeStrategy()}
                options={worktreeOptions()}
                onChange={(value) => setAiSubagentWorktreeStrategy(value as "same-worktree" | "separate-worktrees")}
              />
            </label>
          </div>
        </div>
      </Show>
    </Dialog>
  );
}

function ShellJobFields(props: {
  executable: string;
  argsText: string;
  cwd: string;
  envRefsText: string;
  timeoutSeconds: number;
  networkAccess: boolean;
  onExecutableInput: (value: string) => void;
  onArgsInput: (value: string) => void;
  onCwdInput: (value: string) => void;
  onEnvRefsInput: (value: string) => void;
  onTimeoutInput: (value: string) => void;
  onNetworkAccessInput: (value: boolean) => void;
}) {
  return (
    <div class="grid gap-3 md:grid-cols-2">
      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Executable</span>
        <Input value={props.executable} onInput={(event) => props.onExecutableInput(event.currentTarget.value)} placeholder="bun" />
      </label>
      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Working directory</span>
        <Input value={props.cwd} onInput={(event) => props.onCwdInput(event.currentTarget.value)} placeholder="Project root when empty" />
      </label>
      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Args, one per line</span>
        <Textarea rows="6" value={props.argsText} onInput={(event) => props.onArgsInput(event.currentTarget.value)} placeholder="run&#10;test" />
      </label>
      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Env refs, one per line</span>
        <Textarea rows="6" value={props.envRefsText} onInput={(event) => props.onEnvRefsInput(event.currentTarget.value)} placeholder="OPENAI_API_KEY" />
      </label>
      <label class="space-y-2">
        <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Timeout seconds</span>
        <Input type="number" min="1" max={String(24 * 60 * 60)} value={String(props.timeoutSeconds)} onInput={(event) => props.onTimeoutInput(event.currentTarget.value)} />
      </label>
      <label class="flex items-start gap-3 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
        <input class="mt-1" type="checkbox" checked={props.networkAccess} onInput={(event) => props.onNetworkAccessInput(event.currentTarget.checked)} />
        <div>
          <div class="text-[0.675rem] font-semibold text-(--foreground)">Allow network access</div>
          <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">Marks task unsafe. Leave off for repo-local commands.</div>
        </div>
      </label>
    </div>
  );
}

function splitMultilineInput(value: string) {
  const entries = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

function resolveBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function describeSchedulePreview(schedule: BackgroundJobSchedule | undefined) {
  if (!schedule) {
    return "Schedule preview waits for valid input.";
  }

  switch (schedule.type) {
    case "one-off":
      return `One-off run at ${schedule.runAt}`;
    case "interval":
      return `Every ${schedule.intervalSeconds}s. Next run ${schedule.nextRunAt}`;
    case "cron":
      return `Cron ${schedule.expression} in ${schedule.timezone}. Next run ${schedule.nextRunAt}`;
  }
}

