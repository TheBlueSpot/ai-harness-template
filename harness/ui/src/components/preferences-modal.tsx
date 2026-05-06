import { createRequestId, type ProviderBrand } from "../../../shared/protocol";
import { ClipboardList, FolderOpen, Orbit, Play, RefreshCcw } from "lucide-solid";
import { canSelectProviderBrand, harnessStore, persistMergedLocalPreferences } from "../harness-store";
import { pushToast } from "../toast-store";
import { ModeEditorPanel } from "./mode-editor-panel";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";

function getProviderBrandLabel(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "Gemini";
  }
  if (providerBrand === "claude") {
    return "Claude";
  }
  return "GPT";
}

export function PreferencesModal() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  let importInput: HTMLInputElement | undefined;

  const workspaceModes = () => state.workspace.workspaceModes ?? [];
  const workspaceRuleDraft = () => state.workspace.workspaceRuleSource?.content ?? "";
  const workspaceMemoryDraft = () => state.workspace.workspaceMemorySummary?.content ?? "";
  const activeBrandOptions = () => [
    { value: "gpt", label: "GPT", description: "Use OpenAI-hosted model family.", disabled: !canSelectProviderBrand(state, "gpt") },
    { value: "gemini", label: "Gemini", description: "Use Google-hosted model family.", disabled: !canSelectProviderBrand(state, "gemini") },
    { value: "claude", label: "Claude", description: "Use Anthropic-hosted model family.", disabled: !canSelectProviderBrand(state, "claude") }
  ];
  const subagentWorktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Subagents edit inside current working tree." },
    {
      value: "separate-worktrees",
      label: "Isolated mounts (BranchFS)",
      description: "Subagents work in isolated BranchFS mounts before merge."
    }
  ];
  const planExecutionModeOptions = () => [
    { value: "countdown", label: "Countdown", description: "Pause briefly before execution starts." },
    { value: "approve", label: "Approve first", description: "Require explicit approval before execution starts." },
    { value: "immediate", label: "Immediate", description: "Start execution as soon as plan is ready." }
  ];
  const correctnessIterationOptions = () => [
    { value: "ask-before-iterate", label: "Ask before iterate", description: "Pause before any correctness follow-up pass." },
    { value: "auto-once", label: "Auto once", description: "Run one automatic correctness follow-up pass." },
    { value: "auto-until-clean", label: "Auto until clean", description: "Keep iterating until no correctness gaps remain." }
  ];
  const backgroundApprovalOptions = () => [
    { value: "allow-all", label: "Allow all", description: "Background jobs can run without approval." },
    { value: "allow-safe", label: "Allow safe", description: "Safe jobs auto-run; risky jobs wait for approval." },
    { value: "ask-risky", label: "Ask risky", description: "Ask before risky actions while allowing low-risk ones." },
    { value: "always-ask", label: "Always ask", description: "Every background job waits for explicit approval." }
  ];

  function handleSave() {
    const openAiApiKey = state.openAiApiKeyDraft.trim() || undefined;
    const googleApiKey = state.googleApiKeyDraft.trim() || undefined;
    const anthropicApiKey = state.anthropicApiKeyDraft.trim() || undefined;

    if (!openAiApiKey && !googleApiKey && !anthropicApiKey && !state.hasUsableApiKey && !state.hasStoredApiKey) {
      pushToast("API key required", "Enter provider key before sending chat.", "error");
      return;
    }

    if (!canSelectProviderBrand(state, state.providerBrand)) {
      pushToast("Provider key required", `Saved ${getProviderBrandLabel(state.providerBrand)} key required.`, "error");
      return;
    }

    persistMergedLocalPreferences({
      openAiApiKey,
      googleApiKey,
      anthropicApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled
    });
    harnessStore.commitLocalPreferences({
      openAiApiKey,
      googleApiKey,
      anthropicApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled
    });

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey,
        googleApiKey,
        anthropicApiKey,
        providerBrand: state.providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault
      }
    });

    harnessStore.closePreferencesModal();
  }

  function handleClearApiKey() {
    persistMergedLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled
    });
    harnessStore.commitLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled
    });

    sendCommand({
      type: "preferences.clearApiKey",
      requestId: createRequestId()
    });
  }

  function handleExportPreferences() {
    const payload = {
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pi-harness-preferences.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportPreferences(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<{
        providerBrand: ProviderBrand;
        debugEnabled: boolean;
        tracePanelDefaultOpen: boolean;
        subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
        blockChatOnDirtyGitDefault: boolean;
        dirtyGitChangeLimitDefault: number;
        autoCompactContextThresholdPercentDefault: number;
        planExecutionModeDefault: "countdown" | "approve" | "immediate";
        planExecutionDelaySecondsDefault: number;
        correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
        backgroundJobApprovalPolicyDefault: "allow-all" | "allow-safe" | "ask-risky" | "always-ask";
        memoryBankEnabledDefault: boolean;
      }>;

      harnessStore.commitLocalPreferences({
        providerBrand: parsed.providerBrand,
        debugEnabled: parsed.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: parsed.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: parsed.backgroundJobApprovalPolicyDefault,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault
      });
      persistMergedLocalPreferences({
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
        providerBrand: parsed.providerBrand ?? state.providerBrand,
        debugEnabled: parsed.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          parsed.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          parsed.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault
      });
      pushToast("Preferences imported", "Local defaults updated. Save to sync machine-level defaults.");
    } catch (error) {
      pushToast("Import failed", error instanceof Error ? error.message : "Invalid JSON file.", "error");
    } finally {
      input.value = "";
    }
  }

  function handleSaveWorkspaceContext() {
    sendCommand({
      type: "workspace.context.save",
      requestId: createRequestId(),
      payload: {
        rulesContent: workspaceRuleDraft() || undefined,
        memorySummaryContent: workspaceMemoryDraft() || undefined
      }
    });
    pushToast("Workspace context saved", "Rules and workspace memory updated.");
  }

  function handleResetPanelSizes() {
    harnessStore.resetMainPanelSizes();
    pushToast("Panel sizes reset", "Main panel widths restored to defaults.");
  }

  return (
    <Dialog
      open={state.preferencesModalOpen}
      onClose={() => harnessStore.closePreferencesModal()}
      title="Workspace preferences"
      eyebrow="Preferences"
      description="Manage local GPT, Gemini, and Claude keys plus default workspace preferences."
      footer={
        <>
          <Button variant="ghost" onClick={() => harnessStore.closePreferencesModal()}>
            Dismiss
          </Button>
          <Button variant="ghost" onClick={handleExportPreferences}>
            Export prefs
          </Button>
          <Button variant="ghost" onClick={() => importInput?.click()}>
            Import prefs
          </Button>
          <Button variant="secondary" onClick={handleClearApiKey}>
            Clear keys
          </Button>
          <Button onClick={handleSave}>Save preferences</Button>
        </>
      }
    >
      <input ref={importInput} type="file" accept="application/json" class="hidden" onChange={handleImportPreferences} />
      <div class="grid gap-3">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Active brand
          </span>
          <DropdownControl
            kind="select"
            ariaLabel="Select active brand"
            icon={<Orbit class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={state.providerBrand}
            options={activeBrandOptions()}
            onChange={(value) => harnessStore.setProviderBrand(value as ProviderBrand)}
          />
          <p class="text-[0.675rem] leading-5 text-(--muted)">Brand switch stays disabled until matching key exists or you type one here.</p>
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            OpenAI API key
          </span>
          <Input
            type="password"
            value={state.openAiApiKeyDraft}
            placeholder="sk-..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setOpenAiApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Google API key
          </span>
          <Input
            type="password"
            value={state.googleApiKeyDraft}
            placeholder="AIza..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setGoogleApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Anthropic API key
          </span>
          <Input
            type="password"
            value={state.anthropicApiKeyDraft}
            placeholder="sk-ant-..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setAnthropicApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <p class="text-[0.675rem] leading-5 text-(--muted)">
          Keys stored in browser storage and local workspace storage on this machine.
        </p>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex items-start gap-3 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.debugEnabled}
            onInput={(event) => harnessStore.setDebugEnabled(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-(--foreground)">Verbose developer logging</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">Default on for new runs in this browser.</div>
          </div>
        </label>

        <label class="flex items-start gap-3 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.tracePanelDefaultOpen}
            onInput={(event) => harnessStore.setTracePanelDefaultOpen(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-(--foreground)">Open trace panel by default</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">Controls initial layout after refresh.</div>
          </div>
        </label>
      </div>

      <section class="flex items-center justify-between gap-3 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
        <div>
          <div class="text-[0.675rem] font-semibold text-(--foreground)">Panel layout</div>
          <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">Restore the Projects, chat, and trace panel widths.</div>
        </div>
        <Button variant="secondary" onClick={handleResetPanelSizes}>
          Restore panel sizes
        </Button>
      </section>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Subagent worktree
          </span>
          <DropdownControl
            kind="select"
            ariaLabel="Select subagent worktree strategy"
            icon={<FolderOpen class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={state.subagentWorktreeStrategyDefault}
            options={subagentWorktreeOptions()}
            onChange={(value) => harnessStore.setSubagentWorktreeStrategyDefault(value as "same-worktree" | "separate-worktrees")}
          />
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Plan gate mode
          </span>
          <DropdownControl
            kind="select"
            ariaLabel="Select plan gate mode"
            icon={<Play class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={state.planExecutionModeDefault}
            options={planExecutionModeOptions()}
            onChange={(value) => harnessStore.setPlanExecutionModeDefault(value as "countdown" | "approve" | "immediate")}
          />
        </label>

        <label class="flex items-start gap-3 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.blockChatOnDirtyGitDefault}
            onInput={(event) => harnessStore.setBlockChatOnDirtyGitDefault(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-(--foreground)">Restrict chat on dirty git</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">
              Warn on dirty repos and block chat-triggered runs above the configured tracked plus untracked change limit.
            </div>
          </div>
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Dirty git change limit
          </span>
          <Input
            type="number"
            min="0"
            max="10000"
            disabled={!state.blockChatOnDirtyGitDefault}
            value={String(state.dirtyGitChangeLimitDefault)}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setDirtyGitChangeLimitDefault(Math.max(0, Math.min(10000, Number(event.currentTarget.value) || 0)))
            }
          />
          <p class="text-[0.675rem] leading-5 text-(--muted)">
            Counts tracked and untracked git status entries before chat-triggered runs are refused.
          </p>
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Auto-compact at
          </span>
          <Input
            type="number"
            min="10"
            max="95"
            value={String(state.autoCompactContextThresholdPercentDefault)}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setAutoCompactContextThresholdPercentDefault(
                Math.max(10, Math.min(95, Number(event.currentTarget.value) || 10))
              )
            }
          />
          <p class="text-[0.675rem] leading-5 text-(--muted)">
            Pi compacts session context once usage crosses this percent, then continues with reduced history.
          </p>
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Countdown seconds
          </span>
          <Input
            type="number"
            min="0"
            max="300"
            value={String(state.planExecutionDelaySecondsDefault)}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setPlanExecutionDelaySecondsDefault(Math.max(0, Math.min(300, Number(event.currentTarget.value) || 0)))
            }
          />
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Correctness iteration
          </span>
          <DropdownControl
            kind="select"
            ariaLabel="Select correctness iteration"
            icon={<RefreshCcw class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={state.correctnessIterationModeDefault}
            options={correctnessIterationOptions()}
            onChange={(value) =>
              harnessStore.setCorrectnessIterationModeDefault(
                value as "ask-before-iterate" | "auto-once" | "auto-until-clean"
              )
            }
          />
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Background approvals
          </span>
          <DropdownControl
            kind="select"
            ariaLabel="Select background approval policy"
            icon={<ClipboardList class="h-3.5 w-3.5" />}
            size="md"
            class="w-full"
            value={state.backgroundJobApprovalPolicyDefault}
            options={backgroundApprovalOptions()}
            onChange={(value) =>
              harnessStore.setBackgroundJobApprovalPolicyDefault(
                value as "allow-all" | "allow-safe" | "ask-risky" | "always-ask"
              )
            }
          />
        </label>
      </div>

      <section class="grid gap-3 rounded-[1.25rem] border border-(--border) bg-white/55 px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Workspace context</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-(--muted)">
              Shared rules and memory apply before project-specific context.
            </div>
          </div>
          <Button variant="secondary" onClick={handleSaveWorkspaceContext}>
            Save workspace context
          </Button>
        </div>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Workspace rules</span>
          <Textarea
            rows="5"
            value={workspaceRuleDraft()}
            onInput={(event) =>
              harnessStore.applyServerEvent({
                type: "workspace.updated",
                requestId: "local-workspace-rules",
                payload: {
                  workspace: {
                    ...state.workspace,
                    projects: state.workspace.projects,
                    workspaceModes: state.workspace.workspaceModes ?? [],
                    workspaceRuleSource: event.currentTarget.value.trim()
                      ? {
                          id: "workspace-rules",
                          scope: "workspace",
                          label: "Workspace rules",
                          content: event.currentTarget.value,
                          updatedAt: new Date().toISOString()
                        }
                      : undefined,
                    workspaceMemorySummary: state.workspace.workspaceMemorySummary,
                    activeProjectId: state.workspace.activeProjectId
                  }
                }
              })
            }
          />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Workspace memory</span>
          <Textarea
            rows="5"
            value={workspaceMemoryDraft()}
            onInput={(event) =>
              harnessStore.applyServerEvent({
                type: "workspace.updated",
                requestId: "local-workspace-memory",
                payload: {
                  workspace: {
                    ...state.workspace,
                    projects: state.workspace.projects,
                    workspaceModes: state.workspace.workspaceModes ?? [],
                    workspaceRuleSource: state.workspace.workspaceRuleSource,
                    workspaceMemorySummary: event.currentTarget.value.trim()
                      ? {
                          id: "workspace-memory",
                          scope: "workspace",
                          label: "Workspace memory",
                          content: event.currentTarget.value,
                          updatedAt: new Date().toISOString(),
                          source: "user"
                        }
                      : undefined,
                    activeProjectId: state.workspace.activeProjectId
                  }
                }
              })
            }
          />
        </label>
      </section>

      <ModeEditorPanel
        title="Workspace custom modes"
        scope="workspace"
        modes={workspaceModes()}
        onSave={(mode) =>
          sendCommand({
            type: "mode.save",
            requestId: createRequestId(),
            payload: {
              scope: "workspace",
              mode
            }
          })
        }
        onDelete={(modeId) =>
          sendCommand({
            type: "mode.delete",
            requestId: createRequestId(),
            payload: {
              scope: "workspace",
              modeId
            }
          })
        }
      />
    </Dialog>
  );
}

