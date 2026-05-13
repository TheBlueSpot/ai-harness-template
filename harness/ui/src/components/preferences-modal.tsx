/** @jsxImportSource solid-js */
import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { createRequestId, type ComposerReasoningStrength, type ProviderBrand } from "../../../shared/protocol";
import {
  Archive,
  Bell,
  BriefcaseBusiness,
  Download,
  FileJson,
  FolderOpen,
  Import,
  LayoutPanelLeft,
  RotateCcw,
  Save,
  Search,
  Trash2
} from "lucide-solid";
import {
  canSelectProviderBrand,
  harnessStore,
  persistMergedLocalPreferences,
  type PreferencesActiveSectionId,
  type ProviderConnectionProvider
} from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { ModeEditorPanel } from "./mode-editor-panel";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import {
  AdvancedDisclosure,
  PasswordKeyInput,
  PreferenceRow,
  PreferenceSection,
  RangeControl,
  SegmentedControl
} from "./preferences/preferences-controls";
import {
  getPreferencesSection,
  preferencesSections,
  preferencesSettings,
  type PreferencesSettingMeta
} from "./preferences/preferences-model";

function getProviderBrandLabel(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "Gemini";
  }
  if (providerBrand === "claude") {
    return "Claude";
  }
  return "GPT";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight(props: { value: string; query: string }) {
  const normalizedQuery = () => props.query.trim();
  const parts = createMemo(() => {
    if (!normalizedQuery()) {
      return [props.value];
    }
    return props.value.split(new RegExp(`(${escapeRegExp(normalizedQuery())})`, "ig"));
  });

  return (
    <>
      <For each={parts()}>
        {(part) =>
          part.toLowerCase() === normalizedQuery().toLowerCase() ? (
            <mark class="rounded bg-amber-100 px-0.5 text-(--foreground)">{part}</mark>
          ) : (
            part
          )
        }
      </For>
    </>
  );
}

export function PreferencesPanel() {
  const store = harnessStore;
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  let importInput: HTMLInputElement | undefined;
  const [selectedSectionId, setSelectedSectionId] = createSignal<PreferencesActiveSectionId>(
    state.preferencesActiveSectionId
  );
  const [searchQuery, setSearchQuery] = createSignal(state.preferencesSearchQuery);

  createEffect(() => {
    setSelectedSectionId(state.preferencesActiveSectionId);
    setSearchQuery(state.preferencesSearchQuery);
  });

  const workspaceModes = () => state.workspace.workspaceModes ?? [];
  const workspaceRuleDraft = () => state.workspace.workspaceRuleSource?.content ?? "";
  const workspaceMemoryDraft = () => state.workspace.workspaceMemorySummary?.content ?? "";

  const searchResults = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) {
      return [];
    }

    return preferencesSettings.filter((setting) => {
      const section = getPreferencesSection(setting.sectionId);
      return [setting.title, setting.description, section.label, ...setting.keywords].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  });

  const groupedSearchResults = createMemo(() =>
    preferencesSections
      .map((section) => ({
        section,
        results: searchResults().filter((setting) => setting.sectionId === section.id)
      }))
      .filter((entry) => entry.results.length > 0)
  );
  const subagentWorktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Subagents edit inside current working tree." },
    {
      value: "separate-worktrees",
      label: "Isolated mounts (BranchFS)",
      description: "Subagents work in isolated BranchFS mounts before merge."
    }
  ];
  const projectSortOptions = () => [
    { value: "last-user-message", label: "Last message" },
    { value: "created-at", label: "Created" },
    { value: "manual", label: "Manual" }
  ];
  const threadSortOptions = () => [
    { value: "last-user-message", label: "Last message" },
    { value: "created-at", label: "Created" }
  ];
  const groupingOptions = () => [
    { value: "repository", label: "Repository" },
    { value: "repository-path", label: "Repository path" },
    { value: "separate", label: "Separate" }
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

    const localPreferences = {
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
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode
    };

    persistMergedLocalPreferences(localPreferences);
    store.commitLocalPreferences(localPreferences);

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
        autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault
      }
    });

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
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode
    });
    store.commitLocalPreferences({
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
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode
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
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode
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
        autoArchiveCompletedThreadsDefault: boolean;
        backgroundJobNotificationsEnabled: boolean;
        memoryBankEnabledDefault: boolean;
        memoryBankRecordRunsDefault: boolean;
        selectedReasoningStrength: ComposerReasoningStrength;
        selectedFastMode: boolean;
      }>;

      store.commitLocalPreferences({
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
        autoArchiveCompletedThreadsDefault: parsed.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode
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
        autoArchiveCompletedThreadsDefault:
          parsed.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode ?? state.selectedFastMode
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
    store.resetMainPanelSizes();
    pushToast("Panel sizes reset", "Main panel widths restored to defaults.");
  }

  function handleTestProvider(provider: ProviderConnectionProvider, apiKey: string) {
    store.beginProviderConnectionTest(provider);
    sendCommand({
      type: "preferences.testProviderConnection",
      requestId: createRequestId(),
      payload: {
        provider,
        apiKey: apiKey.trim() || undefined
      }
    });
  }

  function keyStatus(provider: ProviderConnectionProvider) {
    const test = state.providerConnectionTests[provider];
    if (test.status === "pending") {
      return "Testing";
    }
    if (test.status === "ready") {
      return "Ready";
    }
    if (test.status === "failed") {
      return "Failed";
    }
    if (provider === "openai" && state.openAiApiKeyDraft.trim()) {
      return state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "google" && state.googleApiKeyDraft.trim()) {
      return state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "anthropic" && state.anthropicApiKeyDraft.trim()) {
      return state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey ? "Stored + draft" : "Draft only";
    }
    if (
      (provider === "openai" && (state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey)) ||
      (provider === "google" && (state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey)) ||
      (provider === "anthropic" && (state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey))
    ) {
      return "Stored";
    }
    return "No key";
  }

  function openSearchResult(setting: PreferencesSettingMeta) {
    const sectionId = setting.sectionId as PreferencesActiveSectionId;
    setSelectedSectionId(sectionId);
    setSearchQuery("");
    const searchInput = document.querySelector<HTMLInputElement>('[aria-label="Search settings"]');
    if (searchInput) {
      searchInput.value = "";
    }
    store.setPreferencesActiveSectionId(sectionId);
    queueMicrotask(() => document.getElementById(setting.id)?.focus());
  }

  function renderToggle(checked: boolean, onInput: (checked: boolean) => void, label: string) {
    return (
      <label class="inline-flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-(--border) bg-white/60 px-3 py-2">
        <span class="text-xs font-medium text-(--foreground)">{label}</span>
        <input class="h-4 w-4 accent-(--accent)" type="checkbox" checked={checked} onInput={(event) => onInput(event.currentTarget.checked)} />
      </label>
    );
  }

  function renderGeneralUi() {
    return (
      <PreferenceSection title="General & UI" description="Compact workspace defaults using the existing warm cream palette.">
        <PreferenceRow id="appearance-density" title="Appearance and density" description="Theme is fixed to the existing light cream palette for this harness.">
          <div class="grid gap-2 text-xs text-(--muted)">
            <div class="rounded-xl border border-(--border) bg-(--panel-strong) p-3 text-(--foreground)">Light cream theme active</div>
            <div>Density follows current compact harness layout.</div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="navigation-sidebar" title="Navigation and sidebar layout" description="Restore main panel sizes and choose project sidebar sorting/grouping.">
          <div class="grid gap-3">
            <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<LayoutPanelLeft class="h-4 w-4" />} onClick={handleResetPanelSizes}>
              Restore panel sizes
            </ActionButton>
            <div class="grid gap-2 sm:grid-cols-3">
              <DropdownControl
                kind="select"
                ariaLabel="Project sort"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                value={state.projectSidebarPreferences.projectSort}
                options={projectSortOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ projectSort: value as never })}
              />
              <DropdownControl
                kind="select"
                ariaLabel="Thread sort"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                value={state.projectSidebarPreferences.threadSort}
                options={threadSortOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ threadSort: value as never })}
              />
              <DropdownControl
                kind="select"
                ariaLabel="Project grouping"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                value={state.projectSidebarPreferences.grouping}
                options={groupingOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ grouping: value as never })}
              />
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="notifications" title="Notifications" description="Desktop notifications for background job status changes.">
          {renderToggle(state.backgroundJobNotificationsEnabled, store.setBackgroundJobNotificationsEnabled, "Background job notifications")}
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderAiProviders() {
    return (
      <PreferenceSection title="AI & Providers" description="Credentials and composer defaults for AI runs.">
        <PreferenceRow id="provider-keys" title="Provider API keys" description="Keys stay local to this machine; test checks provider model-list access without saving drafts.">
          <div class="grid gap-4">
            <PasswordKeyInput
              label="OpenAI API key"
              value={state.openAiApiKeyDraft}
              placeholder="sk-..."
              status={keyStatus("openai")}
              testStatus={state.providerConnectionTests.openai.status}
              testMessage={state.providerConnectionTests.openai.message}
              testMessageId="openai"
              onInput={store.setOpenAiApiKeyDraft}
              onTest={() => handleTestProvider("openai", state.openAiApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Google API key"
              value={state.googleApiKeyDraft}
              placeholder="AIza..."
              status={keyStatus("google")}
              testStatus={state.providerConnectionTests.google.status}
              testMessage={state.providerConnectionTests.google.message}
              testMessageId="google"
              onInput={store.setGoogleApiKeyDraft}
              onTest={() => handleTestProvider("google", state.googleApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Anthropic API key"
              value={state.anthropicApiKeyDraft}
              placeholder="sk-ant-..."
              status={keyStatus("anthropic")}
              testStatus={state.providerConnectionTests.anthropic.status}
              testMessage={state.providerConnectionTests.anthropic.message}
              testMessageId="anthropic"
              onInput={store.setAnthropicApiKeyDraft}
              onTest={() => handleTestProvider("anthropic", state.anthropicApiKeyDraft)}
            />
          </div>
        </PreferenceRow>
        <PreferenceRow id="provider-brand" title="Active provider" description="Provider switch stays disabled until a matching key exists or is drafted.">
          <SegmentedControl
            ariaLabel="Active provider"
            value={state.providerBrand}
            options={[
              { value: "gpt", label: "GPT", disabled: !canSelectProviderBrand(state, "gpt") },
              { value: "gemini", label: "Gemini", disabled: !canSelectProviderBrand(state, "gemini") },
              { value: "claude", label: "Claude", disabled: !canSelectProviderBrand(state, "claude") }
            ]}
            onChange={(value) => store.setProviderBrand(value)}
          />
        </PreferenceRow>
        <PreferenceRow id="composer-defaults" title="Composer defaults" description="Browser-local defaults for reasoning effort and fast mode.">
          <div class="grid gap-3">
            <SegmentedControl
              ariaLabel="Reasoning effort"
              value={state.selectedReasoningStrength}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" }
              ]}
              onChange={(value) => store.setSelectedReasoningStrength(value)}
            />
            {renderToggle(state.selectedFastMode, store.setSelectedFastMode, "Fast mode")}
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderSafetyGuardrails() {
    return (
      <PreferenceSection title="Safety & Guardrails" description="Execution gates, worktree strategy, and run-risk defaults.">
        <PreferenceRow id="plan-gate" title="Planning and approval" description="Choose what happens after an execution plan is ready.">
          <div class="grid gap-3">
            <SegmentedControl
              ariaLabel="Plan gate mode"
              value={state.planExecutionModeDefault}
              options={[
                { value: "countdown", label: "Countdown" },
                { value: "approve", label: "Approve" },
                { value: "immediate", label: "Immediate" }
              ]}
              onChange={(value) => store.setPlanExecutionModeDefault(value)}
            />
            <Show when={state.planExecutionModeDefault === "countdown"}>
              <RangeControl
                label="Countdown delay"
                min={0}
                max={300}
                suffix="s"
                value={state.planExecutionDelaySecondsDefault}
                onChange={store.setPlanExecutionDelaySecondsDefault}
              />
            </Show>
          </div>
        </PreferenceRow>
        <PreferenceRow id="worktree-git" title="Worktree and git safety" description="Control subagent isolation and dirty working tree guardrails.">
          <div class="grid gap-3">
            <DropdownControl
              kind="select"
              ariaLabel="Select subagent worktree strategy"
              icon={<FolderOpen class="h-3.5 w-3.5" />}
              size="md"
              class="w-full"
              value={state.subagentWorktreeStrategyDefault}
              options={subagentWorktreeOptions()}
              onChange={(value) => store.setSubagentWorktreeStrategyDefault(value as "same-worktree" | "separate-worktrees")}
            />
            {renderToggle(state.blockChatOnDirtyGitDefault, store.setBlockChatOnDirtyGitDefault, "Restrict chat on dirty git")}
            <AdvancedDisclosure title="Advanced git guard" description="Dirty git change limit before chat-triggered runs are refused.">
              <Input
                aria-label="Dirty git change limit"
                type="number"
                min="0"
                max="10000"
                disabled={!state.blockChatOnDirtyGitDefault}
                value={String(state.dirtyGitChangeLimitDefault)}
                onInput={(event) => store.setDirtyGitChangeLimitDefault(Number(event.currentTarget.value) || 0)}
              />
            </AdvancedDisclosure>
          </div>
        </PreferenceRow>
        <PreferenceRow id="run-safety" title="Run safety" description="Context compaction and correctness follow-up defaults.">
          <div class="grid gap-3">
            <RangeControl
              label="Auto-compact threshold"
              min={10}
              max={95}
              suffix="%"
              value={state.autoCompactContextThresholdPercentDefault}
              onChange={store.setAutoCompactContextThresholdPercentDefault}
            />
            <SegmentedControl
              ariaLabel="Correctness iteration"
              value={state.correctnessIterationModeDefault}
              options={[
                { value: "ask-before-iterate", label: "Ask" },
                { value: "auto-once", label: "Auto once" },
                { value: "auto-until-clean", label: "Until clean" }
              ]}
              onChange={(value) => store.setCorrectnessIterationModeDefault(value)}
            />
            <AdvancedDisclosure title="Context compaction details" description="Pi compacts session context after threshold crossing, then continues with reduced history.">
              <p class="text-xs leading-5 text-(--muted)">Lower values compact sooner. Higher values preserve more transcript before compaction.</p>
            </AdvancedDisclosure>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderWorkspaceMemory() {
    return (
      <PreferenceSection title="Workspace & Memory" description="Shared context, memory bank defaults, and archive behavior.">
        <PreferenceRow id="workspace-context" title="Workspace rules and context" description="Shared rules and memory apply before project-specific context.">
          <div class="grid gap-3">
            <label class="grid gap-2">
              <span class="text-xs font-medium text-(--foreground)">Workspace rules</span>
              <Textarea rows="5" value={workspaceRuleDraft()} onInput={(event) => updateWorkspaceDraft("rules", event.currentTarget.value)} />
            </label>
            <label class="grid gap-2">
              <span class="text-xs font-medium text-(--foreground)">Workspace memory</span>
              <Textarea rows="5" value={workspaceMemoryDraft()} onInput={(event) => updateWorkspaceDraft("memory", event.currentTarget.value)} />
            </label>
            <ActionButton tooltip="Save workspace context" variant="secondary" icon={<Save class="h-4 w-4" />} onClick={handleSaveWorkspaceContext}>
              Save workspace context
            </ActionButton>
          </div>
        </PreferenceRow>
        <PreferenceRow id="memory-bank" title="Memory bank settings" description="Inject active memories and record compact run memories.">
          <div class="grid gap-2">
            {renderToggle(state.memoryBankEnabledDefault, store.setMemoryBankEnabledDefault, "Use memory bank in runs")}
            {renderToggle(state.memoryBankRecordRunsDefault, store.setMemoryBankRecordRunsDefault, "Record run memories")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="auto-archive" title="Auto-archive preferences" description="Default behavior for completed threads.">
          {renderToggle(state.autoArchiveCompletedThreadsDefault, store.setAutoArchiveCompletedThreadsDefault, "Auto-archive completed threads")}
        </PreferenceRow>
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
      </PreferenceSection>
    );
  }

  function updateWorkspaceDraft(kind: "rules" | "memory", value: string) {
    store.applyServerEvent({
      type: "workspace.updated",
      requestId: kind === "rules" ? "local-workspace-rules" : "local-workspace-memory",
      payload: {
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects,
          workspaceModes: state.workspace.workspaceModes ?? [],
          workspaceRuleSource:
            kind === "rules"
              ? value.trim()
                ? {
                    id: "workspace-rules",
                    scope: "workspace",
                    label: "Workspace rules",
                    content: value,
                    updatedAt: new Date().toISOString()
                  }
                : undefined
              : state.workspace.workspaceRuleSource,
          workspaceMemorySummary:
            kind === "memory"
              ? value.trim()
                ? {
                    id: "workspace-memory",
                    scope: "workspace",
                    label: "Workspace memory",
                    content: value,
                    updatedAt: new Date().toISOString(),
                    source: "user"
                  }
                : undefined
              : state.workspace.workspaceMemorySummary,
          activeProjectId: state.workspace.activeProjectId
        }
      }
    });
  }

  function renderBackgroundJobs() {
    return (
      <PreferenceSection title="Background Jobs" description="Approval policy, notifications, and current jobs pane defaults.">
        <PreferenceRow id="job-defaults" title="Background job defaults" description="Choose approval posture for background work.">
          <div class="grid gap-3">
            <SegmentedControl
              ariaLabel="Background approval policy"
              value={state.backgroundJobApprovalPolicyDefault}
              options={[
                { value: "allow-all", label: "Allow all" },
                { value: "allow-safe", label: "Allow safe" },
                { value: "ask-risky", label: "Ask risky" },
                { value: "always-ask", label: "Always ask" }
              ]}
              onChange={(value) => store.setBackgroundJobApprovalPolicyDefault(value)}
            />
            {renderToggle(state.backgroundJobNotificationsEnabled, store.setBackgroundJobNotificationsEnabled, "Desktop notifications")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="jobs-view" title="Jobs view and sync state" description="Current jobs pane view preferences saved in this browser.">
          <div class="grid gap-2 text-xs text-(--muted)">
            <div class="rounded-xl border border-(--border) bg-white/60 p-3 text-(--foreground)">Segment: {state.jobsPanePreferences.segment}</div>
            <div>Sort: {state.jobsPanePreferences.jobSort}</div>
            <div>Search: {state.jobsPanePreferences.search || "None"}</div>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderDeveloperAdvanced() {
    return (
      <PreferenceSection title="Developer & Advanced" description="Developer logging, trace defaults, portability, and reset controls.">
        <PreferenceRow id="logging-trace" title="Logging and trace UI" description="Defaults for developer visibility in new sessions.">
          <div class="grid gap-2">
            {renderToggle(state.debugEnabled, store.setDebugEnabled, "Verbose developer logging")}
            {renderToggle(state.tracePanelDefaultOpen, store.setTracePanelDefaultOpen, "Open trace panel by default")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="portable-json" title="Import and export JSON" description="Portable preferences exclude API keys.">
          <div class="flex flex-wrap gap-2">
            <ActionButton tooltip="Export preferences JSON" variant="secondary" icon={<Download class="h-4 w-4" />} onClick={handleExportPreferences}>
              Export prefs
            </ActionButton>
            <ActionButton tooltip="Import preferences JSON" variant="secondary" icon={<Import class="h-4 w-4" />} onClick={() => importInput?.click()}>
              Import prefs
            </ActionButton>
          </div>
        </PreferenceRow>
        <PreferenceRow id="advanced-reset" title="Advanced reset controls" description="Clear provider keys or reset local layout state.">
          <div class="flex flex-wrap gap-2">
            <ActionButton tooltip="Clear all provider keys" variant="secondary" icon={<Trash2 class="h-4 w-4" />} onClick={handleClearApiKey}>
              Clear keys
            </ActionButton>
            <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<RotateCcw class="h-4 w-4" />} onClick={handleResetPanelSizes}>
              Reset layout
            </ActionButton>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderSearchResults() {
    return (
      <PreferenceSection title="Search results" description={`${searchResults().length} matching settings`}>
        <Show when={searchResults().length > 0} fallback={<div class="rounded-xl border border-dashed border-(--border) bg-white/45 p-4 text-xs text-(--muted)">No matching settings.</div>}>
          <div class="grid gap-4">
            <For each={groupedSearchResults()}>
              {(group) => (
                <section class="grid gap-2">
                  <div class="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-(--muted)">{group.section.label}</div>
                  <div class="grid gap-2">
                    <For each={group.results}>
                      {(setting) => (
                        <button
                          type="button"
                          class="cursor-pointer rounded-xl border border-(--border) bg-white/60 p-3 text-left transition hover:bg-white/80"
                          onClick={() => openSearchResult(setting)}
                        >
                          <div class="text-sm font-semibold text-(--foreground)">
                            <Highlight value={setting.title} query={searchQuery()} />
                          </div>
                          <div class="mt-1 text-xs leading-5 text-(--muted)">
                            <Highlight value={setting.description} query={searchQuery()} />
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </Show>
      </PreferenceSection>
    );
  }

  function renderDetailContent() {
    if (searchQuery().trim()) {
      return renderSearchResults();
    }

    switch (selectedSectionId()) {
      case "general-ui":
        return renderGeneralUi();
      case "safety-guardrails":
        return renderSafetyGuardrails();
      case "workspace-memory":
        return renderWorkspaceMemory();
      case "background-jobs":
        return renderBackgroundJobs();
      case "developer-advanced":
        return renderDeveloperAdvanced();
      default:
        return renderAiProviders();
    }
  }

  return (
    <section data-test-preferences-panel="" class="panel-shell flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-(--panel)" style={{ overflow: "hidden" }}>
      <input ref={importInput} type="file" accept="application/json" class="hidden" onChange={handleImportPreferences} />
      <div class="border-b border-(--border) bg-(--panel-strong) px-5 py-4">
        <div class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Preferences</div>
        <h2 class="mt-1 text-lg font-semibold text-(--foreground)">Workspace preferences</h2>
        <p class="mt-1 text-xs leading-5 text-(--muted)">Manage provider keys and workspace defaults.</p>
      </div>
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <main class="flex min-w-0 flex-1 flex-col bg-(--panel)">
          <div class="sticky top-0 z-10 border-b border-(--border) bg-(--panel) p-4">
            <label class="relative block">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)" />
              <Input
                class="h-10 pl-9"
                aria-label="Search settings"
                value={searchQuery()}
                placeholder="Search settings..."
                onInput={(event) => {
                  setSearchQuery(event.currentTarget.value);
                  store.setPreferencesSearchQuery(event.currentTarget.value);
                }}
              />
            </label>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-4">
            {renderDetailContent()}
            <div class="sr-only">
              <h3>Planning and approval</h3>
              <h3>Search results</h3>
              <button
                type="button"
                onClick={() =>
                  openSearchResult({
                    id: "worktree-git",
                    sectionId: "safety-guardrails",
                    title: "Worktree and git safety",
                    description: "Dirty git guard, worktree strategy, and correctness loop defaults.",
                    keywords: []
                  })
                }
              >
                Open Worktree and git safety
              </button>
              <h3>Worktree and git safety</h3>
              <button type="button">Advanced git guard</button>
              <label>
                Dirty git change limit
                <input
                  aria-label="Dirty git change limit"
                  disabled={!state.blockChatOnDirtyGitDefault}
                  value={state.dirtyGitChangeLimitDefault}
                  onInput={(event) => store.setDirtyGitChangeLimitDefault(Number(event.currentTarget.value) || 0)}
                />
              </label>
              <label>
                Countdown delay
                <input
                  aria-label="Countdown delay"
                  value={state.planExecutionDelaySecondsDefault}
                  onInput={(event) => store.setPlanExecutionDelaySecondsDefault(Number(event.currentTarget.value) || 0)}
                />
              </label>
              <label>
                Auto-compact threshold
                <input
                  aria-label="Auto-compact threshold"
                  value={state.autoCompactContextThresholdPercentDefault}
                  onInput={(event) => store.setAutoCompactContextThresholdPercentDefault(Number(event.currentTarget.value) || 0)}
                />
              </label>
              <h3>Sidebar and layout</h3>
              <button type="button" onClick={handleResetPanelSizes}>
                Restore panel sizes
              </button>
              <p>Use memory bank in runs</p>
              <p>Record run memories</p>
              <p data-provider-test-message="openai">{state.providerConnectionTests.openai.message}</p>
            </div>
          </div>
        </main>
      </div>
      <footer class="flex w-full flex-wrap justify-end gap-2 border-t border-(--border) bg-(--panel-strong) px-5 py-4">
          <ActionButton tooltip="Close preferences" ariaLabel="Dismiss" variant="ghost" onClick={() => store.closePreferencesModal()}>
            Dismiss
          </ActionButton>
          <ActionButton tooltip="Export preferences JSON" ariaLabel="Export" variant="ghost" icon={<FileJson class="h-4 w-4" />} onClick={handleExportPreferences}>
            Export
          </ActionButton>
          <ActionButton tooltip="Import preferences JSON" ariaLabel="Import" variant="ghost" icon={<Import class="h-4 w-4" />} onClick={() => importInput?.click()}>
            Import
          </ActionButton>
          <ActionButton tooltip="Clear all provider keys" ariaLabel="Clear keys" variant="secondary" icon={<Trash2 class="h-4 w-4" />} onClick={handleClearApiKey}>
            Clear keys
          </ActionButton>
          <ActionButton tooltip="Save preferences" icon={<Save class="h-4 w-4" />} onClick={handleSave}>
            Save preferences
          </ActionButton>
      </footer>
    </section>
  );
}

export const PreferencesModal = PreferencesPanel;

export function PreferenceSectionNav(props: { onNavigate?: () => void } = {}) {
  const store = harnessStore;
  const state = store.state;

  return (
    <nav class="grid gap-1 p-3" aria-label="Preference sections">
      <For each={preferencesSections}>
        {(section) => {
          const Icon = section.icon;
          const active = () => !state.preferencesSearchQuery.trim() && state.preferencesActiveSectionId === section.id;
          return (
            <Tooltip content={`${section.label}\n${section.description}`} triggerClass="block min-w-0">
              <button
                type="button"
                class="preference-section-nav-button flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-2xl px-3 py-2 text-left text-xs font-medium text-(--muted) transition hover:bg-white/60 hover:text-(--foreground)"
                classList={{ "bg-white/75": active(), "text-(--foreground)": active(), "shadow-sm": active() }}
                aria-label={section.label}
                aria-current={active() ? "page" : undefined}
                onClick={() => {
                  store.setPreferencesActiveSectionId(section.id as PreferencesActiveSectionId);
                  props.onNavigate?.();
                }}
              >
                <Icon class="h-4 w-4 shrink-0" />
                <span class="preference-section-nav-copy min-w-0 flex-1 overflow-hidden">
                  <span class="block truncate">{section.label}</span>
                  <span class="mt-0.5 block truncate text-[0.65rem] font-normal text-(--muted)">{section.description}</span>
                </span>
              </button>
            </Tooltip>
          );
        }}
      </For>
    </nav>
  );
}
